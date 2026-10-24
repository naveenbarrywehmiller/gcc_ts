#!/usr/bin/env python3
"""Interactive menu and scriptable CLI for GCC Timesheet App on Ubuntu."""
from __future__ import annotations
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import admin_common as c
import admin_ops as ops
import admin_release as release
import admin_ui as ui
import admin_system as host
import admin_funnel as funnel
import admin_powerbi as powerbi

def prompt(label, default=None):
    answer = input(f"{label}" + (f" [{default}]" if default is not None else "") + ": ").strip()
    return answer if answer else default

def confirm(message):
    return input(message + " Type YES to continue: ").strip() == "YES"

def choose_port(label, default, current=None, address="0.0.0.0"):
    while True:
        try:
            port = c.port_number(prompt(label, default))
            if port != current and not c.available(port, address):
                print(f"Port {port} is occupied. Choose another; Diagnostics lists listeners.")
                continue
            return port
        except ValueError as error:
            print(error)

def execute(label, action):
    with c.lock():
        c.LOG.info("BEGIN %s", label)
        result = action()
        c.LOG.info("SUCCESS %s", label)
        return result

def setup_menu():
    if (c.ROOT / ".setup-pending").exists():
        execute("resume-setup", ops.resume_setup)
        return
    print(f"System hostname: {socket.gethostname()}\nSystem timezone: {c.timezone()}")
    name = c.hostname(prompt("Browser hostname", socket.gethostname().split('.')[0] + ".local"))
    web = choose_port("Website port", 8080)
    internal = choose_port("Internal loopback app port", 3001, address="127.0.0.1")
    email = prompt("Initial system administrator email", "systemadmin@barry-wehmiller.com")
    if not email or not re.fullmatch(r"[^\s@'\"$]+@[^\s@'\"$]+\.[^\s@'\"$]+", email):
        raise ValueError("Enter a valid administrator email.")
    password = getpass.getpass("Initial password (blank uses systemadmin; custom: 12+ characters; hidden): ")
    factory = not password and email == "systemadmin@barry-wehmiller.com"
    if factory: password = "systemadmin"
    if (not factory and len(password) < 12) or any(char in password for char in "'\n\r\\"):
        raise ValueError("Use 12+ characters without single quotes, backslashes or line breaks.")
    if not factory and password != getpass.getpass("Confirm password: "):
        raise ValueError("Passwords do not match.")
    cfg = {"hostname": name, "web_port": web, "app_port": internal, "https": False,
           "image_target": c.IMAGE + ":latest", "autostart": True}
    print(f"Install Docker/Nginx/Avahi and deploy {cfg['image_target']} at {c.origin(cfg)}.")
    if confirm("Proceed with installation?"):
        execute("setup", lambda: ops.setup(cfg, email, password))

def network_menu():
    cfg = c.config()
    old = dict(cfg)
    cfg["hostname"] = c.hostname(prompt("Browser hostname", cfg["hostname"]))
    cfg["web_port"] = choose_port("Website port", cfg["web_port"], old["web_port"])
    cfg["app_port"] = choose_port("Internal app port", cfg["app_port"], old["app_port"], "127.0.0.1")
    cfg["https"] = prompt("Use HTTPS? y/n", "y" if cfg["https"] else "n").lower() == "y"
    cert = key = None
    if cfg["https"]:
        print("Use a certificate trusted by clients and covering the browser hostname.")
        cert = prompt("PEM certificate chain path (blank keeps existing)", "")
        if cert: key = prompt("Unencrypted PEM private key path")
    if confirm(f"Back up and apply network settings: {c.origin(cfg)}?"):
        execute("configure-network", lambda: ops.configure_network(cfg, cert, key))


def funnel_menu():
    terminal = getattr(sys.stdout, "terminal", None) or ui.Terminal()
    terminal.section("Tailscale Funnel - public HTTPS")
    terminal.line("Funnel publishes a public internet URL. Timesheet login is still required.")
    for key, title, description in (
        ("1", "Status and public URL", "Check Tailscale connection and actual Timesheet sharing state."),
        ("2", "Install / connect Tailscale", "Install from the signed stable repository, then approve your account in a browser."),
        ("3", "Enable public HTTPS", "Back up settings, prepare a private loopback proxy and publish this app."),
        ("4", "Disable public HTTPS", "Remove this app's public proxy and keep the LAN website available."),
    ):
        terminal.entry(key, title, description)
    terminal.line("[0] Back | Example: timesheet funnel status")
    choice = prompt("Choose", "0")
    if choice == "1": execute("funnel-status", funnel.status)
    elif choice == "2": execute("funnel-connect", funnel.connect)
    elif choice == "3":
        terminal.line("CAUTION: Public internet access; factory passwords are rejected. A brief restart and safety backup are required.", "warning")
        cfg = c.config()
        current = cfg.get("funnel", {})
        port = choose_port("Local loopback proxy port", current.get("proxy_port", 8081),
                           current.get("proxy_port") if current.get("enabled") else None, "127.0.0.1")
        if confirm("Enable public Timesheet access using Tailscale Funnel?"):
            execute("funnel-enable", lambda: funnel.enable(port))
    elif choice == "4":
        if confirm("Disable public Timesheet access? LAN access will remain available."):
            execute("funnel-disable", funnel.disable)
    elif choice != "0": raise ValueError("Choose one of the displayed Funnel actions.")

def powerbi_menu():
    terminal = getattr(sys.stdout, "terminal", None) or ui.Terminal()
    terminal.section("Power BI reporting management")
    entries = (
        ("Status and API addresses", "Check actual running settings; the API key stays hidden.", powerbi.status),
        ("Connection and setup guide", "Read URLs, dashboard parameters and Basic credential examples.", powerbi.guide),
        ("Test reporting connection", "Check the version endpoint using the configured key without displaying it.", powerbi.check_connection),
        ("View reporting key privately", "Reveal the key in this terminal after confirmation; protect screenshots.", powerbi.show_key),
        ("Enable reporting API", "Allow authenticated read-only reporting; safety backup and brief restart.", lambda: powerbi.set_enabled(True)),
        ("Disable reporting API", "Stop reporting refresh access; safety backup and brief restart.", lambda: powerbi.set_enabled(False)),
        ("Rotate reporting key", "Replace the key; all Power BI clients must update their credentials.", powerbi.rotate_key),
    )
    for index, (title, description, _) in enumerate(entries, 1):
        terminal.entry(str(index), title, description)
    terminal.line("[0] Back | Example: timesheet powerbi status")
    choice = prompt("Choose", "0")
    if choice == "0": return
    if not choice.isascii() or not choice.isdigit() or not 1 <= int(choice) <= len(entries):
        raise ValueError("Choose one of the displayed Power BI actions.")
    title, _, action = entries[int(choice) - 1]
    if int(choice) >= 4:
        terminal.line("CAUTION: " + ("The key grants access to organization-wide reporting data." if choice == "4" else
                      "Brief app restart. Enabling grants reporting access to key holders; rotation breaks existing refresh credentials."), "warning")
        if not confirm(title + "?"): return
    execute("powerbi-" + choice, action)


def schedule_menu():
    settings = ops.schedules()
    print(f"Schedules use system timezone: {c.timezone()}")
    print("Examples: *-*-* 02:00:00 (daily), Sun *-*-* 04:00:00 (weekly), *-*-* *:00:00 (hourly)")
    for job in ops.JOBS:
        settings[job]["calendar"] = prompt(f"{job} schedule", settings[job]["calendar"])
        settings[job]["enabled"] = prompt(f"Enable automatic {job}? y/n", "y" if settings[job]["enabled"] else "n").lower() == "y"
    if confirm("Save schedules?"):
        execute("configure-schedules", lambda: ops.save_schedules(settings))

def backup_settings_menu():
    settings = ops.schedules()
    days = int(prompt("Local retention days (7–3650)", settings["retention_days"]))
    if not 7 <= days <= 3650: raise ValueError("Retention must be 7–3650 days.")
    settings["retention_days"] = days
    settings["auto_prune"] = prompt("Prune expired backups after successful scheduled backups? y/n", "y" if settings["auto_prune"] else "n").lower() == "y"
    print("Off-VM copy needs root SSH key access and verified known_hosts. Empty disables it.")
    target = prompt("Destination user@host:/absolute/path/ (enter - to disable)", settings["offsite"])
    settings["offsite"] = "" if target == "-" else target
    if settings["offsite"]: ops.validate_offsite(settings["offsite"])
    execute("backup-settings", lambda: ops.save_schedules(settings))

def list_backups():
    print(f"Backup location: {c.BACKUPS}\nDatabase safety backups: {c.ROOT}/app-backup\nApplication database: {c.ROOT}/data/timesheet.db")
    paths = sorted(c.BACKUPS.glob("timesheet-*.tgz"), reverse=True)
    for index, path in enumerate(paths, 1):
        print(f"[{index}] {path.name}\n    Size: {path.stat().st_size / 1024**2:.1f} MiB")
    if not paths: print("No snapshots yet.")
    return paths

def restore_menu():
    paths = list_backups()
    if not paths: return
    number = int(prompt("Snapshot number"))
    if not 1 <= number <= len(paths): raise ValueError("Choose a listed number.")
    path = paths[number - 1]
    if confirm(f"Restore {path.name}? Data saved after this snapshot will be replaced."):
        execute("restore", lambda: ops.restore(path))

def channel_menu():
    cfg = c.config()
    print("latest follows main-branch builds. A fixed tag/digest stays selected until changed.")
    default = cfg["image_target"][len(c.IMAGE) + 1:]
    value = prompt("Image tag (latest / 1.28.0) or sha256:digest", default)
    cfg["image_target"] = c.IMAGE + ("@" if value.startswith("sha256:") else ":") + value
    ops.validate_config(cfg)
    execute("image-channel", lambda: c.save_config(cfg))
    print("Channel saved. Choose Update app to deploy it.")

def panel_status(terminal):
    terminal.section("Application")
    if c.CONFIG.exists():
        cfg = c.config()
        terminal.field("Website", c.origin(cfg), "good")
        if cfg.get("funnel", {}).get("enabled"):
            terminal.field("Funnel URL", c.public_origin(cfg), "good")
            terminal.field("Public gate", "PAUSED - enable Funnel again after checking credentials" if (c.ROOT / "funnel.block").exists() else "Open (normal login required)")
        try:
            state = json.loads(ops.inspect("{{json .State}}", check=False) or "{}")
        except ValueError:
            state = {}
        health = state.get("Health", {}).get("Status", "not reported")
        running = state.get("Status", "unavailable (check Docker / installation)")
        terminal.field("Container", f"{running} | health: {health}", "good" if health == "healthy" else "warning")
        if state.get("Running"):
            terminal.field("Started (UTC)", state.get("StartedAt", "unavailable"))
        terminal.field("Update channel", cfg["image_target"])
        terminal.field("Internal port", f"127.0.0.1:{cfg['app_port']} (Nginx connects here)")
        gate = (c.ROOT / "maintenance.flag").exists()
        web = (c.ROOT / "data/.maintenance").exists()
        terminal.field("Maintenance", "ON - website gated" if gate else "OFF", "warning" if gate else "muted")
        terminal.field("Employee access", "System Admin sign-in required" if web else "No web maintenance flag",
                       "warning" if web else "muted")
        terminal.section("Startup and saved data")
        terminal.field("Start after reboot", "Enabled" if cfg.get("autostart", True) else "Disabled")
        terminal.field("Docker restart policy", ops.inspect("{{.HostConfig.RestartPolicy.Name}}", check=False) or "Unavailable")
        terminal.field("Backups", c.BACKUPS)
        terminal.field("Database", c.ROOT / "data/timesheet.db")
    else:
        terminal.line("Application not configured. Choose Setup and configuration > Install / resume setup.", "warning")
    terminal.section("Automatic jobs (" + c.timezone() + ")")
    settings = ops.schedules()
    for job in ops.JOBS:
        result = c.run(["systemctl", "show", f"timesheet-{job}.timer", "--no-pager",
                        "--property=LoadState,ActiveState,UnitFileState,NextElapseUSecRealtime"],
                       check=False, display=False, timeout=5)
        properties = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
        actual = properties.get("ActiveState", "unavailable")
        installed = properties.get("LoadState") == "loaded"
        label = job.replace("self-update", "Tool update").replace("backup", "Backup").replace("update", "Update")
        preference = "enabled" if settings[job]["enabled"] else "paused"
        terminal.field(label, f"saved: {preference} | timer: {actual if installed else 'not installed / unavailable'}")
        terminal.field("Schedule", settings[job]["calendar"])
        next_run = properties.get("NextElapseUSecRealtime", "")
        terminal.field("Next run", next_run if actual == "active" and next_run and next_run != "n/a" else "Not scheduled")


def panel_diagnostics(terminal):
    terminal.section("Server resources")
    stats = host.HostStats()
    for label, value in stats.snapshot()[0]:
        terminal.field(label, value)
    commands = (
        ("Services: Docker / Nginx / Avahi", ["systemctl", "show", "docker", "nginx", "avahi-daemon", "--no-pager", "--property=Id,ActiveState,SubState"]),
        ("Docker version", ["docker", "version", "--format", "Client: {{.Client.Version}}\nServer: {{if .Server}}{{.Server.Version}}{{else}}unavailable{{end}}"]),
        ("Compose version", ["docker", "compose", "version", "--short"]),
        ("Containers", ["docker", "ps", "-a", "--format", "Name: {{.Names}}\nState: {{.Status}}\nPorts: {{.Ports}}\n"]),
        ("Listening TCP ports", ["ss", "-lnt", "--no-header"]),
        ("Nginx configuration", ["nginx", "-t"]),
        ("Failed system services", ["systemctl", "--failed", "--no-pager", "--no-legend"]),
    )
    for title, args in commands:
        terminal.section(title)
        try:
            result = c.run(args, check=False, display=False, timeout=10)
            output = (result.stdout + result.stderr).strip()
            for line in output.splitlines():
                terminal.line(line, "muted" if result.returncode == 0 else "warning", "  ")
            if not output:
                terminal.line("None reported." if result.returncode == 0 else "Check failed; see administrator log.",
                              "muted" if result.returncode == 0 else "warning", "  ")
        except (OSError, subprocess.TimeoutExpired) as error:
            terminal.line(f"Unavailable: {error}", "warning")
    terminal.field("Detailed diagnostics", "timesheet diagnostics")
    terminal.field("Administrator log", c.LOGDIR / "admin.log")


def status():
    terminal = getattr(sys.stdout, "terminal", None)
    if terminal is not None:
        return panel_status(terminal)
    print(f"GCC Timesheet Linux Admin {c.VERSION} | host {socket.gethostname()} | timezone {c.timezone()}")
    if c.CONFIG.exists():
        cfg = c.config()
        print(f"Website: {c.origin(cfg)}\nUpdate channel: {cfg['image_target']}")
        ops.compose("ps", check=False)
        print(f"Maintenance gate: {(c.ROOT / 'maintenance.flag').exists()}")
        print(f"Web maintenance (System Admin releases): {(c.ROOT / 'data/.maintenance').exists()}")
        print(f"Automatic startup after reboot: {'enabled' if cfg.get('autostart', True) else 'disabled'}")
        print(f"Actual container restart policy: {ops.inspect('{{.HostConfig.RestartPolicy.Name}}', check=False)}")
        print(f"Backup location: {c.BACKUPS}\nDatabase: {c.ROOT}/data/timesheet.db")
    else: print("Application not configured. Choose Setup.")
    for job in ops.JOBS:
        setting = ops.schedules()[job]
        actual = c.run(["systemctl", "is-enabled", f"timesheet-{job}.timer"], check=False, display=False).stdout.strip()
        print(f"Auto {job}: {actual or 'not installed'} | {setting['calendar']}")
    c.run(["systemctl", "list-timers", "--all", "timesheet-*", "--no-pager"], check=False)

def remove_bootstrap():
    c.env_update({"BOOTSTRAP_ADMIN_EMAIL": None, "BOOTSTRAP_ADMIN_PASSWORD": None})
    ops.start()

def os_maintenance():
    ops.pause("all")
    ops.backup()
    c.run(["apt-get", "update"])
    c.run(["apt-get", "upgrade", "-y"])
    print("Reboot required." if Path("/var/run/reboot-required").exists() else "No reboot requested by packages.")
    print("Jobs remain paused. Check app health and resume when ready.")


def autostart_menu():
    enabled = c.config().get("autostart", True)
    value = prompt("Start app automatically after OS reboot? y/n", "y" if enabled else "n").lower()
    if value not in ("y", "n"): raise ValueError("Enter y or n.")
    execute("autostart", lambda: ops.configure_autostart(value == "y"))


def factory_reset_menu():
    print("WARNING: Factory reset permanently removes ALL users, platforms, divisions, projects, tasks, timesheets, holidays, assignments, uploads and application logs.")
    print(f"A complete safety snapshot is required before deletion: {c.BACKUPS}")
    print("Only systemadmin@barry-wehmiller.com / systemadmin will remain. Automatic jobs will be paused.")
    print("Server hostname, ports, HTTPS, secrets, backup archives and reboot startup settings are preserved.")
    print("Web maintenance stays enabled until System Admin signs in in the browser.")
    if input("Type FACTORY RESET to confirm: ").strip() == "FACTORY RESET":
        execute("factory-reset", ops.factory_reset)
    else:
        print("Factory reset cancelled.")

def run_menu_action(choice):
    simple = {"2": ("status", status), "3": ("start", ops.start),
              "5": ("restart", ops.restart), "6": ("update", ops.app_update),
              "7": ("retry-update", lambda: ops.app_update(True)),
              "10": ("dependencies", ops.install_dependencies), "13": ("backup", ops.backup),
              "14": ("backups", list_backups), "16": ("check-db", ops.check_db),
              "22": ("app-logs", lambda: c.run(["docker", "logs", "--tail", "200", "timesheet-app"])),
              "24": ("diagnostics", lambda: panel_diagnostics(sys.stdout.terminal)
                     if isinstance(sys.stdout, ui.ActionOutput) else ops.diagnostics()),
              "25": ("check-self-update", release.check)}
    if choice in simple:
        label, action = simple[choice]
        execute(label, action)
    elif choice == "1": setup_menu()
    elif choice == "funnel": funnel_menu()
    elif choice == "powerbi": powerbi_menu()
    elif choice == "4":
        if confirm("Stop the application? Employees cannot use it until it is started again."):
            execute("stop", ops.stop)
    elif choice == "8": channel_menu()
    elif choice == "9": network_menu()
    elif choice == "15": restore_menu()
    elif choice == "17": schedule_menu()
    elif choice in ("18", "19"):
        job = prompt("Job: backup / update / self-update / all", "all")
        execute("schedule-pause-resume", lambda: ops.pause(job, choice == "19"))
    elif choice == "20": backup_settings_menu()
    elif choice == "21":
        execute("prune-preview", ops.prune)
        if confirm("Delete the listed expired snapshots?"): execute("prune", lambda: ops.prune(True))
    elif choice == "23": print((c.LOGDIR / "admin.log").read_text()[-30000:])
    elif choice in ("26", "27"):
        if confirm("Update administrator?" if choice == "26" else "Roll back administrator code?"):
            execute("self-update" if choice == "26" else "self-rollback", release.update if choice == "26" else release.rollback)
            os.execv("/usr/local/bin/timesheet", ["timesheet"])
    elif choice == "28":
        if confirm("Have you successfully signed in with the bootstrap account?"):
            execute("remove-bootstrap", remove_bootstrap)
    elif choice == "29":
        with c.lock():
            subprocess.run([os.environ.get("EDITOR", "nano"), str(c.ROOT / ".env")], check=True)
        print("Apply saved environment changes with App control > Start / apply saved settings.")
    elif choice == "30":
        print("This upgrades Ubuntu packages, including Docker; a restart may be required.")
        if confirm("Pause jobs, back up and run package upgrades?"): execute("os-maintenance", os_maintenance)
    elif choice == "31": subprocess.run(["less", str(c.SOURCE / "README.md")], check=True)
    elif choice == "32": autostart_menu()
    elif choice == "33": factory_reset_menu()
    else: raise ValueError("Unknown menu action.")


def menu(plain=False):
    terminal = ui.Terminal(plain)
    group = None
    zone = c.timezone()
    stats = host.HostStats()
    builds = {"values": {}, "expires": 0}

    def home(live):
        terminal.line(f"GCC Timesheet Linux Admin v{c.VERSION} | {socket.gethostname()}", "title")
        try:
            if c.CONFIG.exists():
                cfg = c.config()
                public_paused = cfg.get("funnel", {}).get("enabled") and (c.ROOT / "funnel.block").exists()
                terminal.line(f"LAN: {c.origin(cfg)} | {zone}", "good")
                if cfg.get("funnel", {}).get("enabled"):
                    terminal.line("Public: " + c.public_origin(cfg) + (" [PAUSED]" if public_paused else ""),
                                  "warning" if public_paused else "good")
                terminal.line("Power BI API: " + c.public_origin(cfg) + powerbi.API_PATH, "accent")
                if time.monotonic() >= builds["expires"]:
                    builds["values"] = powerbi.versions()
                    builds["expires"] = time.monotonic() + 30
                values = builds["values"]
                image = cfg.get("image_target", "").removeprefix(c.IMAGE)
                if image.startswith("@sha256:"):
                    image = image[1:20] + "... (pinned)"
                elif image.startswith(":"):
                    image = image[1:] + (" (main builds)" if image == ":latest" else " (pinned)")
                else:
                    image = "Unavailable"
                terminal.line(f"Timesheet app: {values.get('appVersion') or 'Unavailable'} | Image: {image}", "accent")
                reporting = {True: "ON", False: "OFF"}.get(values.get("reportingEnabled"), "Unavailable")
                terminal.line(f"Power BI: API {values.get('apiVersion') or 'Unavailable'} ({reporting}) | "
                              f"Dashboard supported: {values.get('dashboardVersion') or 'Unavailable'}", "accent")
                active_jobs = sum(bool(ops.schedules()[job]["enabled"]) for job in ops.JOBS)
                maintenance = (c.ROOT / "maintenance.flag").exists() or (c.ROOT / "data/.maintenance").exists()
                terminal.line(f"Saved: startup {'ON' if cfg.get('autostart', True) else 'OFF'} | "
                              f"jobs {active_jobs}/3 | maintenance {'ON' if maintenance else 'OFF'}")
            else:
                terminal.line("New VM? Choose 5 > 1 to install or resume setup.", "warning")
        except (OSError, ValueError, KeyError) as error:
            terminal.line(f"Cannot read saved settings: {error}", "warning")
        rows, updated = stats.snapshot()
        for label, value in rows:
            terminal.field(label, value)
        terminal.line()
        for index, (title, icon, _, _) in enumerate(ui.GROUPS, 1):
            terminal.entry("H" if index == len(ui.GROUPS) else str(index), title, "", icon, details=False)
        terminal.line(f"Updated {updated} | " + ("LIVE: every 5s" if live else "Snapshot: R refresh"), "accent")
        terminal.line("[R] Refresh | [0] Exit | Number + Enter to open a category")

    while True:
        try:
            if group is None:
                choice = terminal.home_choice(home, lambda: prompt("Choose", "0")).lower()
            else:
                terminal.clear()
                title, icon, description, entries = ui.GROUPS[group]
                terminal.heading(title, icon)
                terminal.line(description)
                if group == 6:
                    terminal.line("CAUTION: These actions can interrupt service or delete application data.", "warning")
                for index, entry in enumerate(entries, 1):
                    terminal.entry(str(index), entry[0], entry[2])
                terminal.line("[0] Back | [M] Home | [Q] Exit | ?number: description and example")
                choice = prompt("Choose", "0").lower()
            if choice == "q" or (choice == "0" and group is None): return
            if choice in ("0", "m"):
                group = None
                continue
            if group is None:
                if choice == "r":
                    builds["expires"] = 0
                    continue
                elif choice == "h": group = len(ui.GROUPS) - 1
                elif choice.isascii() and choice.isdigit() and 1 <= int(choice) < len(ui.GROUPS): group = int(choice) - 1
                else: terminal.line("Choose a displayed category, H for help, or 0 to exit.", "warning")
                continue
            explain = choice.startswith("?")
            number = choice[1:] if explain else choice
            entries = ui.GROUPS[group][3]
            if not number.isascii() or not number.isdigit() or not 1 <= int(number) <= len(entries):
                terminal.line("Choose a displayed action, or use ?1 to read its example.", "warning")
                continue
            entry = entries[int(number) - 1]
            terminal.clear()
            terminal.action_help(entry)
            if not explain:
                builds["expires"] = 0
                if entry[1] == "display": terminal.display_check()
                else:
                    terminal.section("Result / progress")
                    with terminal.action_output():
                        run_menu_action(entry[1])
                terminal.section("Return to " + ui.GROUPS[group][0])
                terminal.line("Review the result above, then press Enter to go back.")
        except EOFError:
            return
        except KeyboardInterrupt:
            terminal.line("Cancelled. Review any running operation before trying again.", "warning")
        except Exception as error:
            c.LOG.exception("MENU operation failed")
            terminal.line(f"ERROR: {error}", "error")
            terminal.line(f"Log: {c.LOGDIR}/admin.log. The menu is still available.")
        try: input("\nPress Enter to return to this category...")
        except (EOFError, KeyboardInterrupt): return


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="menu")
    parser.add_argument("value", nargs="?")
    parser.add_argument("--version", action="version", version=c.VERSION)
    parser.add_argument("--plain", action="store_true", help="ASCII menu without ANSI colors or emoji")
    parser.add_argument("--scheduled", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--proxy-port", type=int, default=8081, help="Funnel's local-only proxy port (default 8081)")
    args = parser.parse_args()
    if os.geteuid() != 0: raise SystemExit("Run installed timesheet (it requests sudo), or use sudo python3 manager.py.")
    os.umask(0o077)
    c.init_log()
    try:
        if args.command == "menu":
            if not sys.stdin.isatty(): raise ValueError("Menu needs a terminal; use CLI subcommands in automation.")
            menu(args.plain)
            return
        if args.command == "setup":
            setup_menu()
            return
        def action():
            if args.scheduled and (args.command not in ops.JOBS or not ops.schedules()[args.command]["enabled"]):
                print("Scheduled job is paused; skipping.")
                return
            commands = {"status": status, "start": ops.start, "stop": ops.stop, "restart": ops.restart,
                        "backup": ops.backup, "update": lambda: ops.app_update(args.retry),
                        "backups": list_backups, "check-db": ops.check_db, "diagnostics": ops.diagnostics,
                        "check-self-update": release.check, "self-update": release.update,
                        "self-rollback": release.rollback, "avahi": ops.avahi, "firewall": ops.firewall,
                        "dependencies": ops.install_dependencies, "resume-setup": ops.resume_setup,
                        "remove-bootstrap": remove_bootstrap,
                        "os-maintenance": os_maintenance,
                        "logs": lambda: c.run(["docker", "logs", "--tail", "200", "timesheet-app"])}
            if args.command in commands:
                commands[args.command]()
                if args.command == "backup" and args.scheduled and ops.schedules()["auto_prune"]: ops.prune(True)
            elif args.command == "funnel":
                actions = {"status": funnel.status, "install": funnel.install, "connect": funnel.connect,
                           "enable": lambda: funnel.enable(args.proxy_port), "disable": funnel.disable}
                if args.value not in actions:
                    raise ValueError("Use timesheet funnel status|install|connect|enable|disable")
                if args.value in ("enable", "disable") and not args.confirm:
                    raise ValueError("Public access changes require --confirm. Example: timesheet funnel enable --confirm")
                actions[args.value]()
            elif args.command == "powerbi":
                actions = {"status": powerbi.status, "guide": powerbi.guide, "test": powerbi.check_connection,
                           "key": powerbi.show_key, "enable": lambda: powerbi.set_enabled(True),
                           "disable": lambda: powerbi.set_enabled(False), "rotate-key": powerbi.rotate_key}
                if args.value not in actions:
                    raise ValueError("Use timesheet powerbi status|guide|test|key|enable|disable|rotate-key")
                if args.value in ("key", "enable", "disable", "rotate-key") and not args.confirm:
                    raise ValueError("Key display and reporting changes require --confirm.")
                actions[args.value]()
            elif args.command == "restore":
                if not args.confirm or not args.value: raise ValueError("Use timesheet restore /absolute/backup.tgz --confirm")
                ops.restore(Path(args.value))
            elif args.command == "factory-reset":
                if not args.confirm:
                    raise ValueError(f"WARNING: Deletes ALL application data; only the factory System Admin remains. Automatic backup: {c.BACKUPS}. Use timesheet factory-reset --confirm")
                ops.factory_reset()
            elif args.command == "autostart":
                if args.value not in ("enable", "disable"):
                    raise ValueError("Use timesheet autostart enable|disable")
                ops.configure_autostart(args.value == "enable")
            elif args.command in ("pause", "resume"): ops.pause(args.value or "all", args.command == "resume")
            elif args.command == "prune": ops.prune(args.confirm)
            elif args.command == "install-bundle": release.install(c.SOURCE, release.validate_tag(args.value or ""))
            else: raise ValueError("Unknown command. Run timesheet for the menu or consult the guide.")
        execute(args.command, action)
    except (Exception, KeyboardInterrupt) as error:
        c.LOG.exception("FAILED %s", args.command)
        print(f"Error: {error}\nLog: {c.LOGDIR}/admin.log", file=sys.stderr)
        raise SystemExit(1)

if __name__ == "__main__": main()
