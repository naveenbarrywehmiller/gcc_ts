#!/usr/bin/env python3
"""Interactive menu and scriptable CLI for GCC Timesheet App on Ubuntu."""
from __future__ import annotations
import argparse
import getpass
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import admin_common as c
import admin_ops as ops
import admin_release as release

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
        print(f"{index:3}  {path}  {path.stat().st_size / 1024**2:.1f} MiB")
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

def status():
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

def menu():
    while True:
        print(f"\nGCC Timesheet Linux Admin v{c.VERSION} | {socket.gethostname()} | {c.timezone()}")
        if c.CONFIG.exists(): print(c.origin(c.config()))
        print("""
  1  Setup new VM / install application
  2  Status, versions and schedules
  3  Start / apply environment changes
  4  Stop (maintenance page)
  5  Restart application
  6  Pull and update app now (backup + rollback)
  7  Retry a previously failed app image
  8  Choose app image tag / update channel
  9  Host address, website port, internal port, HTTPS
 10  Install/repair dependencies
 11  Enable/repair Avahi using system hostname
 12  Add UFW rules for selected web port and Avahi
 13  Back up now
 14  List backups
 15  Restore selected backup
 16  Verify SQLite database
 17  Configure automatic backup/app/tool update schedules
 18  Pause automatic jobs (one or all)
 19  Resume automatic jobs (one or all)
 20  Backup retention and off-VM copy settings
 21  Preview/delete expired local backups
 22  Application logs (last 200 lines)
 23  Administrator error/operation logs
 24  Diagnostics (ports, disk, services, Docker, Avahi)
 25  Check latest administrator release on GitHub
 26  Update administrator from GitHub
 27  Roll back administrator version
 28  Remove bootstrap credentials after first login
 29  Edit application environment (private editor)
 30  Ubuntu/Docker package maintenance
 31  Open installed guide
 32  Configure app automatic startup after OS reboot (default enabled)
 33  Factory reset ALL application data (warning + automatic backup)
  0  Exit
""")
        try:
            choice = prompt("Choose", "0")
            simple = {"2": ("status", status), "3": ("start", ops.start), "4": ("stop", ops.stop),
                      "5": ("restart", ops.restart), "6": ("update", ops.app_update),
                      "7": ("retry-update", lambda: ops.app_update(True)),
                      "10": ("dependencies", ops.install_dependencies), "11": ("avahi", ops.avahi),
                      "12": ("firewall", ops.firewall), "13": ("backup", ops.backup),
                      "14": ("backups", list_backups), "16": ("check-db", ops.check_db),
                      "22": ("app-logs", lambda: c.run(["docker", "logs", "--tail", "200", "timesheet-app"])),
                      "24": ("diagnostics", ops.diagnostics), "25": ("check-self-update", release.check)}
            if choice == "0": return
            if choice in simple:
                label, action = simple[choice]
                execute(label, action)
            elif choice == "1": setup_menu()
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
                if confirm("Have you successfully signed in with the bootstrap account?"): execute("remove-bootstrap", remove_bootstrap)
            elif choice == "29":
                with c.lock():
                    subprocess.run([os.environ.get("EDITOR", "nano"), str(c.ROOT / ".env")], check=True)
                print("Apply saved environment changes with Start / apply environment changes.")
            elif choice == "30":
                print("This upgrades Ubuntu packages, including Docker; a restart may be required.")
                if confirm("Pause jobs, back up and run package upgrades?"): execute("os-maintenance", os_maintenance)
            elif choice == "31": subprocess.run(["less", str(c.SOURCE / "README.md")], check=True)
            elif choice == "32": autostart_menu()
            elif choice == "33": factory_reset_menu()
            else: print("Choose one of the listed numbers.")
        except (Exception, KeyboardInterrupt) as error:
            c.LOG.exception("MENU operation failed")
            print(f"\nOperation failed/cancelled: {error}\nLog: {c.LOGDIR}/admin.log")
        try: input("\nPress Enter to return to the menu...")
        except (EOFError, KeyboardInterrupt): return

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="menu")
    parser.add_argument("value", nargs="?")
    parser.add_argument("--version", action="version", version=c.VERSION)
    parser.add_argument("--scheduled", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--retry", action="store_true")
    args = parser.parse_args()
    if os.geteuid() != 0: raise SystemExit("Run installed timesheet (it requests sudo), or use sudo python3 manager.py.")
    os.umask(0o077)
    c.init_log()
    try:
        if args.command == "menu":
            if not sys.stdin.isatty(): raise ValueError("Menu needs a terminal; use CLI subcommands in automation.")
            menu()
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
