# GCC Timesheet Linux Admin: complete script reference

Generated from the shipped files by `python3 deploy/linux-admin/build_release.py`. Do not edit this reference manually.

See [the setup and operations guide](README.md) for installation, menus and troubleshooting.

## VERSION

```text
1.4.1
```

## install.sh

```bash
#!/usr/bin/env bash
# Downloadable bootstrap; verifies a tagged release checksum before installation.
set -Eeuo pipefail
if [[ $EUID != 0 ]]; then exec sudo bash "$0" "$@"; fi
umask 077
mkdir -p /var/log/gcc-timesheet-admin
chmod 700 /var/log/gcc-timesheet-admin
log=/var/log/gcc-timesheet-admin/install.log
if [[ -f "$log" ]] && [[ $(stat -c %s "$log") -gt 5242880 ]]; then
  for i in 4 3 2 1; do
    [[ ! -f "$log.$i" ]] || mv "$log.$i" "$log.$((i+1))"
  done
  mv "$log" "$log.1"
fi
exec > >(tee -a "$log") 2>&1
trap 'code=$?; printf "[%s] ERROR installer line %s exit %s\n" "$(date -Is)" "$LINENO" "$code"; exit "$code"' ERR
printf '[%s] Starting GCC Timesheet Linux Admin installer\n' "$(date -Is)"
. /etc/os-release
[[ "$ID" == ubuntu && ( "$VERSION_ID" == 24.04 || "$VERSION_ID" == 26.04 ) ]] || {
  echo 'Ubuntu 24.04 or 26.04 LTS required.'; exit 1;
}
apt-get update
apt-get install -y python3 ca-certificates curl
python3 - "${1:-}" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys, tarfile, tempfile, urllib.request
repo = 'naveenbarrywehmiller/gcc_ts'
prefix = r'(?:gcc-timesheet-linux-admin-v|timesheet-admin-v)'
asset = 'gcc-timesheet-linux-admin.tar.gz'
def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'gcc-timesheet-bootstrap'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024: raise ValueError('Download too large')
    return data
tag = sys.argv[1]
if not tag:
    releases = []
    for page in range(1, 11):
        rows = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases?per_page=100&page={page}'))
        releases.extend(r for r in rows if not r['draft'] and not r['prerelease'] and re.fullmatch(prefix + r'\d+\.\d+\.\d+', r['tag_name']))
        if len(rows) < 100: break
    if not releases: raise RuntimeError('No stable administrator release published')
    tag = max(releases, key=lambda r: tuple(map(int, r['tag_name'].rsplit('-v', 1)[1].split('.'))))['tag_name']
if not re.fullmatch(prefix + r'\d+\.\d+\.\d+', tag): raise ValueError('Invalid administrator tag')
with tempfile.TemporaryDirectory(prefix='timesheet-install-') as temp:
    directory = pathlib.Path(temp)
    url = f'https://github.com/{repo}/releases/download/{tag}/{asset}'
    data = fetch(url)
    checksum = fetch(url + '.sha256').decode().split()[0]
    if hashlib.sha256(data).hexdigest() != checksum: raise ValueError('Release checksum mismatch')
    path = directory / asset
    path.write_bytes(data)
    with tarfile.open(path) as archive:
        total = 0
        for item in archive.getmembers():
            parts = pathlib.PurePosixPath(item.name)
            if parts.is_absolute() or '..' in parts.parts or not parts.parts or parts.parts[0] != 'timesheet-admin' or not (item.isfile() or item.isdir()):
                raise ValueError('Invalid release archive')
            total += item.size
            if total > 50 * 1024**2: raise ValueError('Release archive too large')
        archive.extractall(directory, filter='data')
    subprocess.run([sys.executable, str(directory / 'timesheet-admin/manager.py'), 'install-bundle', tag], check=True)
PY
printf '[%s] Complete. Type timesheet to open the menu.\n' "$(date -Is)"
```

## timesheet

```bash
#!/usr/bin/env bash
# Stable launcher; versioned code lives behind the atomic current symlink.
set -euo pipefail
if [[ ${1:-} == --version ]]; then
  cat /usr/local/lib/gcc-timesheet-admin/current/VERSION
  exit 0
fi
if [[ $EUID != 0 ]]; then
  exec sudo --preserve-env=NO_COLOR,TIMESHEET_NO_EMOJI -- /usr/local/bin/timesheet "$@"
fi
exec python3 /usr/local/lib/gcc-timesheet-admin/current/manager.py "$@"
```

## manager.py

```python
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
```

## admin_ui.py

```python
"""Terminal presentation and help text; operations stay in manager/admin_ops."""
from __future__ import annotations
import os
from contextlib import contextmanager, redirect_stdout
import io
import re
import select
import shutil
import sys
import textwrap
import time
import unicodedata

# Entries retain the existing operation IDs, independent of submenu numbering.
# title, operation, description, example, warning (if any)
GROUPS = (
    ("App control", "🚀", "Status, start, restart and reboot startup", (
        ("Status and website", "2", "Show container health, versions, website and timer states.", "timesheet status", ""),
        ("Start / apply saved settings", "3", "Start the app and apply saved environment changes.", "timesheet start", ""),
        ("Restart application", "5", "Stop and start the app, then wait for healthy startup.", "timesheet restart", "Brief downtime"),
        ("Stop application", "4", "Take the website offline until you start it again.", "timesheet stop", "Downtime"),
        ("Startup after reboot", "32", "Choose whether the app starts automatically after an OS reboot.", "timesheet autostart enable", ""),
    )),
    ("Backups and database", "💾", "Create, check, restore and manage snapshots", (
        ("Create a backup", "13", "Save a full snapshot; System Admin login reopens employee access.", "timesheet backup", "Brief downtime; web login required"),
        ("List saved backups", "14", "Show snapshot paths, sizes and database backup locations.", "timesheet backups", ""),
        ("Check database integrity", "16", "Check SQLite for corruption without changing business data.", "timesheet check-db", ""),
        ("Restore a snapshot", "15", "Choose a backup to replace current app data and settings.", "timesheet restore /var/backups/gcc-timesheet/timesheet-FILENAME.tgz --confirm", "Replaces data; confirmation required"),
        ("Retention and off-VM copies", "20", "Set how long backups are kept and an optional SSH copy destination.", "Example: 30 days; backupuser@backup.company.example:/srv/backups/gcc-timesheet/", ""),
        ("Review expired backups", "21", "Preview old snapshots before confirming deletion; keep the newest three.", "timesheet prune  (preview only)", "Deletion requires confirmation"),
    )),
    ("Application and tool updates", "📦", "Update the app or this administrator", (
        ("Update application", "6", "Pull the selected image; back up and roll back if startup fails.", "timesheet update", "Brief downtime if the image changes"),
        ("Choose application version", "8", "Pin an image tag or digest; run Update application to deploy it.", "Example image tag: 1.34.0; latest follows main-branch builds.", ""),
        ("Retry a failed app image", "7", "Retry a blocked image only after fixing its previous failure.", "timesheet update --retry", "Brief downtime if the image changes"),
        ("Check administrator release", "25", "Compare this tool with the latest stable administrator on GitHub.", "timesheet check-self-update", ""),
        ("Update administrator", "26", "Verify and install new tool scripts, then reload this menu.", "timesheet self-update", "Confirmation required"),
        ("Roll back administrator", "27", "Select the previous tool version; application data stays in place.", "timesheet self-rollback", "Confirmation required"),
    )),
    ("Automatic jobs", "⏰", "Schedules for backup, app and tool updates", (
        ("Configure schedules", "17", "Set local-time schedules and enable each automatic job independently.", "Example: *-*-* 02:00:00 = every day at 02:00 in the server timezone.", "Backup/app jobs can interrupt employee access"),
        ("Pause jobs", "18", "Pause one job or all jobs; a running operation finishes normally.", "timesheet pause backup", ""),
        ("Resume jobs", "19", "Enable one job or all jobs using their saved schedules.", "timesheet resume backup", ""),
    )),
    ("Setup and configuration", "🧰", "Install, website address and private settings", (
        ("Install / resume setup", "1", "Install on a new VM, or resume an interrupted setup safely.", "timesheet setup", "Installs system packages on a new VM"),
        ("Website address, ports and HTTPS", "9", "Change the browser address or ports; optionally supply an HTTPS certificate.", "Example: server IP, website port 8080, internal port 3001; HTTPS is optional.", "Backup and brief downtime"),
        ("Repair dependencies", "10", "Install or repair Docker, Nginx and required Ubuntu packages.", "timesheet dependencies", "Changes system packages"),
        ("Remove bootstrap credentials", "28", "Remove one-time credentials from the environment after a successful login.", "timesheet remove-bootstrap", "Keeps the created account; confirm login first"),
        ("Edit private environment", "29", "Open the protected settings file; apply saved changes with Start.", "Example: edit .env, save and exit, then App control > Start / apply saved settings.", "Advanced; never paste secrets into logs"),
        ("Tailscale Funnel (public HTTPS)", "funnel", "Connect a Tailscale account, check, enable or disable a public HTTPS link.", "timesheet funnel status", "Public internet access; uses normal Timesheet login"),
        ("Power BI reporting management", "powerbi", "Show API addresses, setup help, test access, manage reporting and its private key.", "timesheet powerbi status", "Key holders can read reporting data; changes require confirmation"),
    )),
    ("Logs and diagnostics", "🔎", "Investigate errors, disk, ports and services", (
        ("Application logs", "22", "Read the latest 200 lines from the timesheet container.", "timesheet logs", ""),
        ("Administrator logs", "23", "Read recent tool operations and error details from the private log.", "Log file: /var/log/gcc-timesheet-admin/admin.log", ""),
        ("Server diagnostics", "24", "Inspect disk space, listening ports, Docker and supporting services.", "timesheet diagnostics", ""),
    )),
    ("Advanced maintenance", "🚧", "System upgrades and destructive recovery", (
        ("Ubuntu / Docker package upgrades", "30", "Pause jobs, back up and upgrade OS packages; jobs stay paused.", "timesheet os-maintenance", "Downtime; an OS reboot may be needed"),
        ("Factory reset all application data", "33", "Take a safety backup, then remove business data and recreate the factory admin.", "timesheet factory-reset --confirm", "DELETES ALL APP DATA; type FACTORY RESET"),
    )),
    ("Help and display", "📖", "Guide, examples and terminal appearance", (
        ("Read the installed guide", "31", "Open the full local guide; press q to leave the reader.", "Guide: /usr/local/lib/gcc-timesheet-admin/current/README.md", ""),
        ("Check colors and emoji", "display", "Preview the palette and icons, plus plain-text alternatives.", "timesheet --plain  (no ANSI colors or emoji)", ""),
    )),
)


class Terminal:
    COLORS = {"title": "1;96", "accent": "96", "good": "92", "warning": "93", "error": "91", "muted": "37"}

    def __init__(self, plain=False):
        interactive = sys.stdout.isatty() and os.environ.get("TERM") != "dumb"
        self.output = sys.stdout
        self.screen = interactive and not plain
        self.color = interactive and not plain and "NO_COLOR" not in os.environ
        try:
            "📦".encode(sys.stdout.encoding or "ascii")
            unicode_ok = True
        except UnicodeEncodeError:
            unicode_ok = False
        self.emoji = interactive and unicode_ok and not plain and "TIMESHEET_NO_EMOJI" not in os.environ

    @property
    def width(self):
        return max(20, min(96, shutil.get_terminal_size((80, 24)).columns - 1))

    def style(self, text, tone):
        return f"\033[{self.COLORS[tone]}m{text}\033[0m" if self.color else text

    def line(self, text="", tone="muted", indent=""):
        text = clean(text)
        available = self.width - len(indent)
        width = max(1, available)
        # Emoji occupy two terminal cells even though Python counts one character.
        while True:
            lines = textwrap.wrap(str(text), width, break_on_hyphens=False) or [""]
            if width == 1 or all(sum(0 if unicodedata.combining(char) else
                                    2 if unicodedata.east_asian_width(char) in "WF" else 1
                                    for char in line) <= available for line in lines):
                break
            width -= 1
        for line in lines:
            print(self.style(indent + line, tone), file=self.output)

    def heading(self, title, icon=""):
        print(file=self.output)
        self.line((icon + "  " if self.emoji and icon else "") + title, "title")
        self.line("-" * (self.width - 2), "accent")

    def entry(self, key, title, description, icon="", details=True):
        self.line(f"[{key}] " + (icon + "  " if self.emoji and icon else "") + title, "accent", "  ")
        if details:
            self.line(description, indent="      ")

    def clear(self):
        if self.screen:
            self.output.write("\033[2J\033[H")
            self.output.flush()

    def section(self, title):
        self.line()
        self.line(title, "title")
        self.line("-" * (self.width - 2), "accent")

    def field(self, label, value, tone="muted"):
        self.line(f"{label}: {value}", tone, "  ")

    @contextmanager
    def action_output(self):
        stream = ActionOutput(self)
        with redirect_stdout(stream):
            try:
                yield
            finally:
                stream.flush()

    def home_choice(self, render, fallback, interval=5):
        """Refresh only the home screen, preserving input and terminal settings."""
        live = self.screen and sys.stdin.isatty() and os.name == "posix"
        if not live:
            render(False)
            return fallback()
        import termios
        import tty
        fd = sys.stdin.fileno()
        saved = termios.tcgetattr(fd)
        answer = ""
        escaping = False
        try:
            tty.setcbreak(fd)
            while True:
                # Buffer a frame first. Small windows use a scrollable snapshot.
                frame = io.StringIO()
                original = self.output
                try:
                    self.output = frame
                    render(True)
                finally:
                    self.output = original
                fits = len(frame.getvalue().splitlines()) + 1 <= shutil.get_terminal_size((80, 24)).lines
                if not fits:
                    frame = io.StringIO()
                    try:
                        self.output = frame
                        render(False)
                    finally:
                        self.output = original
                self.clear()
                self.output.write(frame.getvalue())
                self.output.write(self.style("Choose [0]: " + answer, "accent"))
                self.output.flush()
                deadline = time.monotonic() + interval
                while True:
                    ready, _, _ = select.select([fd], [], [], max(0, deadline - time.monotonic()) if fits else None)
                    if not ready:
                        break
                    char = os.read(fd, 1)
                    if not char or char == b"\x04":
                        raise EOFError
                    if char == b"\x03":
                        raise KeyboardInterrupt
                    if char == b"\x1b":
                        escaping = True
                        continue
                    if escaping:
                        if char.isalpha() or char == b"~":
                            escaping = False
                        continue
                    if char in (b"\r", b"\n"):
                        self.output.write("\n")
                        return answer.strip() or "0"
                    if char in (b"\x7f", b"\x08"):
                        answer = answer[:-1]
                    elif char == b"\x15":
                        answer = ""
                    elif char.isalnum() and len(answer) < 8:
                        answer += char.decode("ascii")
                    self.output.write("\r\033[2K" + self.style("Choose [0]: " + answer, "accent"))
                    self.output.flush()
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, saved)


    def action_help(self, entry):
        title, _, description, example, warning = entry
        self.heading(title)
        self.line(description)
        self.line(example, "accent")
        if warning:
            self.line("CAUTION: " + warning, "warning")

    def display_check(self):
        self.heading("Terminal display check", "🎨")
        for tone, text in (("title", "Headings"), ("accent", "Choices and examples"), ("good", "SUCCESS"),
                           ("warning", "CAUTION / downtime"), ("error", "ERROR")):
            self.line(text, tone)
        self.line("Icons: " + ("🚀  💾  📦  ⏰  🧰  🔎  🚧  📖" if self.emoji else "text labels (emoji disabled)"))
        self.line("Color: " + ("enabled" if self.color else "disabled"))
        self.line("Use timesheet --plain for ASCII text. NO_COLOR=1 disables colors; TIMESHEET_NO_EMOJI=1 disables icons.")
        self.line("Labels and CAUTION messages remain readable without color or icons.")


def clean(text):
    # Command output and log text must not control the terminal or its clipboard.
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", str(text))
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    return "".join(char for char in text if char.isprintable() or char == "\t").expandtabs(4)


class ActionOutput:
    """Wrap operation output as it arrives; input/editor processes stay interactive."""
    def __init__(self, terminal):
        self.terminal = terminal
        self.buffer = ""

    def __getattr__(self, name):
        return getattr(self.terminal.output, name)

    def write(self, text):
        self.buffer += text
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            if line.startswith("$ "):
                # Full commands remain in the administrator log.
                words = line[2:].split()
                label = " ".join(words[:2])
                self.terminal.section("Working: " + label)
            else:
                tone = "warning" if re.search(r"\b(warning|caution|cancelled|paused)\b", line, re.I) else "muted"
                self.terminal.line(line, tone)
        return len(text)

    def flush(self):
        if self.buffer:
            self.terminal.output.write(self.terminal.style(clean(self.buffer), "accent"))
            self.buffer = ""
        self.terminal.output.flush()
```

## admin_system.py

```python
"""Read-only Linux host measurements for the administrator home screen."""
from __future__ import annotations
from datetime import datetime
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess


def read(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def command(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=2,
                                env={**os.environ, "LC_ALL": "C"})
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def gib(size):
    return f"{size / 1024**3:.1f} GiB"


def cpu_counters():
    try:
        fields = read("/proc/stat").splitlines()[0].split()
        if fields[0] != "cpu" or len(fields) < 5:
            return None
        # Guest time is already included in user/nice; do not count it twice.
        values = list(map(int, fields[1:9]))
        return sum(values), values[3] + (values[4] if len(values) > 4 else 0)
    except (ValueError, IndexError):
        return None


class HostStats:
    def __init__(self):
        self.previous_cpu = cpu_counters()
        self.static = self.hardware()

    def hardware(self):
        try:
            cpu = {item["field"].rstrip(":"): item["data"]
                   for item in json.loads(command("lscpu", "-J") or "{}").get("lscpu", [])}
        except (ValueError, TypeError, KeyError):
            cpu = {}
        count = cpu.get("CPU(s)", str(os.cpu_count() or "unknown"))
        topology = f"{count} vCPUs"
        try:
            cores = int(cpu["Core(s) per socket"]) * int(cpu["Socket(s)"])
            topology += f" ({cores} cores x {cpu['Thread(s) per core']} threads)"
        except (KeyError, ValueError, TypeError):
            pass
        processor = cpu.get("Model name", platform.machine() or "Unavailable")
        try:
            processor += f" | max {float(cpu['CPU max MHz']) / 1000:.2f} GHz"
        except (KeyError, ValueError, TypeError):
            pass
        release = dict(line.split("=", 1) for line in read("/etc/os-release").splitlines() if "=" in line)
        system = release.get("PRETTY_NAME", platform.system()).strip('"')
        system += " | " + (platform.machine() or "unknown architecture")
        virtual = command("systemd-detect-virt") or "Not detected"
        virtual = {"microsoft": "Microsoft Hyper-V", "kvm": "KVM", "vmware": "VMware",
                   "none": "Physical machine"}.get(virtual, virtual)
        disks = []
        for line in command("lsblk", "-bdn", "-o", "SIZE,TYPE").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1] == "disk":
                try:
                    disks.append(int(parts[0]))
                except ValueError:
                    pass
        storage = f"{gib(sum(disks))} total ({len(disks)} disk{'s' if len(disks) != 1 else ''})" if disks else "Unavailable"
        return topology, processor, system, virtual, storage

    def snapshot(self):
        current = cpu_counters()
        usage = "sampling..."
        if current is None:
            usage = "unavailable"
        elif self.previous_cpu:
            total = current[0] - self.previous_cpu[0]
            idle = current[1] - self.previous_cpu[1]
            if total > 0 and idle >= 0:
                usage = f"{max(0, min(100, 100 * (total - idle) / total)):.1f}% used"
        self.previous_cpu = current
        memory = {}
        for line in read("/proc/meminfo").splitlines():
            key, _, value = line.partition(":")
            try:
                memory[key] = int(value.split()[0]) * 1024
            except (ValueError, IndexError):
                pass
        ram = swap = "Unavailable"
        if memory.get("MemTotal") and "MemAvailable" in memory:
            total, available = memory["MemTotal"], memory["MemAvailable"]
            ram = f"{gib(total)} total | {gib(max(0, total - available))} used | {gib(available)} available"
        if "SwapTotal" in memory and "SwapFree" in memory:
            swap = f"{gib(memory['SwapTotal'])} total | {gib(max(0, memory['SwapTotal'] - memory['SwapFree']))} used"
        try:
            disk = shutil.disk_usage("/")
            root = f"{gib(disk.total)} total | {gib(disk.used)} used | {gib(disk.free)} available"
        except OSError:
            root = "Unavailable"
        address = "Unavailable"
        try:
            routes = json.loads(command("ip", "-j", "route", "show", "default") or "[]")
            device = next(route["dev"] for route in routes if "dev" in route)
            interfaces = json.loads(command("ip", "-j", "addr", "show", "dev", device, "scope", "global") or "[]")
            addresses = [item["local"] for interface in interfaces for item in interface.get("addr_info", [])
                         if item.get("family") in ("inet", "inet6") and item.get("local")]
            address = ", ".join(addresses) or "Unavailable"
        except (ValueError, KeyError, TypeError, StopIteration):
            pass
        topology, processor, system, virtual, storage = self.static
        return [("CPU", f"{topology} | {usage}"), ("Processor", processor), ("RAM", ram),
                ("Swap", swap), ("Storage", storage), ("Root /", root), ("OS", system),
                ("Host type", virtual), ("IP address", address)], datetime.now().astimezone().strftime("%H:%M:%S %Z")
```

## admin_funnel.py

```python
"""Optional public HTTPS through Tailscale; never publish an unverified backend."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import shutil
import subprocess
import admin_common as c
import admin_ops as ops


def install():
    if shutil.which("tailscale"):
        print("Tailscale is already installed.")
        return
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    version = release.get("VERSION_ID", "").strip('"')
    codename = {"24.04": "noble", "26.04": "resolute"}.get(version)
    if release.get("ID", "").strip('"') != "ubuntu" or not codename:
        raise ValueError("Tailscale installation supports Ubuntu 24.04 and 26.04 LTS.")
    key = c.fetch(f"https://pkgs.tailscale.com/stable/ubuntu/{codename}.noarmor.gpg")
    keyring = Path("/usr/share/keyrings/tailscale-archive-keyring.gpg")
    keyring.parent.mkdir(parents=True, exist_ok=True)
    keyring.write_bytes(key)
    keyring.chmod(0o644)
    c.atomic(Path("/etc/apt/sources.list.d/gcc-timesheet-tailscale.list"),
             f"deb [signed-by={keyring}] https://pkgs.tailscale.com/stable/ubuntu {codename} main\n", 0o644)
    c.run(["apt-get", "update"])
    c.run(["apt-get", "install", "-y", "tailscale"])
    c.run(["systemctl", "enable", "--now", "tailscaled"])


def connect():
    install()
    c.run(["systemctl", "enable", "--now", "tailscaled"])
    prefs = json.loads(c.run(["tailscale", "debug", "prefs"], display=False, sensitive=True, timeout=10).stdout)
    ssh = "--ssh=" + str(bool(prefs.get("RunSSH", False))).lower()
    # Login URLs contain a device token: display them, but never log them.
    result = c.run(["tailscale", "up", "--accept-dns=false", "--accept-routes=false", ssh, "--timeout=30s"],
                   check=False, display=False, sensitive=True, timeout=40)
    print((result.stdout + result.stderr).strip())
    print("Complete the browser approval, then run timesheet funnel status.")


def state():
    if not shutil.which("tailscale"):
        raise RuntimeError("Tailscale is not installed. Choose Install / connect Tailscale first.")
    result = c.run(["tailscale", "status", "--json"], display=False, sensitive=True, timeout=10)
    data = json.loads(result.stdout)
    if data.get("BackendState") != "Running":
        raise RuntimeError("Tailscale needs login or is offline. Run timesheet funnel connect.")
    if data.get("Self", {}).get("Online") is False:
        raise RuntimeError("Tailscale is offline. Check server connectivity before publishing.")
    name = data.get("Self", {}).get("DNSName", "").rstrip(".")
    if not name or c.hostname(name) != name or not name.endswith(".ts.net") or len(name.split(".")) < 4:
        raise ValueError("Tailscale has no valid device DNS name; check MagicDNS in your tailnet.")
    routes = json.loads(c.run(["tailscale", "funnel", "status", "--json"], display=False, sensitive=True, timeout=10).stdout or "{}")
    return name, routes


def handler(routes, name):
    return routes.get("Web", {}).get(name + ":443", {}).get("Handlers", {}).get("/")


def target(port):
    return f"http://127.0.0.1:{c.port_number(port)}"


def owns_route(routes, name, port):
    handlers = routes.get("Web", {}).get(name + ":443", {}).get("Handlers", {})
    return handlers == {"/": {"Proxy": target(port)}}


def status():
    try:
        name, routes = state()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Tailscale: {error}")
        return
    cfg = c.config() if c.CONFIG.exists() else {}
    settings = cfg.get("funnel", {})
    owned = settings.get("enabled") and name == settings.get("hostname") and owns_route(routes, name, settings.get("proxy_port", 8081))
    public = routes.get("AllowFunnel", {}).get(name + ":443") is True
    blocked = (c.ROOT / "funnel.block").exists()
    print(f"Tailscale: connected\nDevice: {name}\nPublic URL: https://{name}")
    print("Timesheet Funnel: " + ("ENABLED" if owned and public and not blocked else "OFF / pending verification"))
    if blocked:
        print("Public access is paused. Verify administrator credentials, then enable Funnel again.")
    if owned:
        print(f"Local proxy: 127.0.0.1:{settings['proxy_port']}\nStartup: persistent through tailscaled")
    print("Funnel is public internet access. Timesheet still requires its normal login.")


def check_factory_password():
    script = '''const D=require("better-sqlite3");
const d=new D("/app/server/data/timesheet.db",{readonly:true,fileMustExist:true});
const rows=d.prepare("SELECT password_hash FROM users WHERE lower(email)=? AND active=1").all("systemadmin@barry-wehmiller.com");
const unsafe=rows.some(r=>require("bcryptjs").compareSync("systemadmin",r.password_hash));
d.close(); console.log(JSON.stringify({unsafe}));'''
    result = c.run(["docker", "exec", "-w", "/app/server", "timesheet-app", "node", "-e", script],
                   display=False, sensitive=True, timeout=15)
    if json.loads(result.stdout).get("unsafe") is not False:
        raise RuntimeError("The factory administrator still uses its default password. Change it in Timesheet before enabling public access.")


def apply_settings(cfg):
    """Back up before restarting; rollback settings only, never newer business data."""
    previous = c.config()
    environment = (c.ROOT / ".env").read_text()
    try:
        ops.stop()
        ops.snapshot()
        c.save_config(cfg)
        c.env_update(ops.network_environment(cfg))
        ops.write_nginx(cfg)
        ops.start()
    except BaseException:
        c.atomic(c.ROOT / ".env", environment)
        c.save_config(previous)
        ops.write_nginx(previous)
        ops.start()
        raise


def enable(port=8081):
    cfg = c.config()
    if cfg.get("funnel", {}).get("enabled"):
        ops.block_funnel("Public access is being verified.")
    if not ops.running():
        raise RuntimeError("Start the Timesheet application before enabling Funnel.")
    ops.health(15)
    check_factory_password()
    name, routes = state()
    port = c.port_number(port)
    configured = copy.deepcopy(cfg)
    configured["funnel"] = {"enabled": True, "hostname": name, "proxy_port": port}
    ops.validate_config(configured)
    current = cfg.get("funnel", {})
    already_configured = current == configured["funnel"]
    # Never replace a different Serve/Funnel website or any mounted subpaths.
    if any(config.get("TCP", {}).get("443") or handler(config, name)
           for config in routes.get("Foreground", {}).values()):
        raise RuntimeError("Tailscale port 443 already serves another target in a foreground session.")
    if routes.get("TCP", {}).get("443") or handler(routes, name):
        if not owns_route(routes, name, port):
            raise RuntimeError("Tailscale port 443 already serves another target. Preserve it or remove it manually before enabling Timesheet Funnel.")
    if not already_configured and not c.available(port, "127.0.0.1"):
        raise RuntimeError(f"Funnel loopback port {port} is occupied. Choose another --proxy-port.")
    ops.block_funnel("Funnel setup is in progress.")
    try:
        if not already_configured:
            apply_settings(configured)
        else:
            ops.write_nginx(configured)
        # If tailnet approval is needed, its link is displayed but not logged.
        try:
            result = c.run(["tailscale", "funnel", "--bg", "--https=443", "--yes", target(port)],
                           display=False, sensitive=True, timeout=45)
        except subprocess.TimeoutExpired as error:
            for value in (error.stdout, error.stderr):
                if value:
                    print(value.decode(errors="replace") if isinstance(value, bytes) else value)
            raise RuntimeError("Complete Tailscale's browser approval, then enable Funnel again.") from None
        print((result.stdout + result.stderr).strip())
        actual_name, actual = state()
        if actual_name != name or not owns_route(actual, name, port) or actual.get("AllowFunnel", {}).get(name + ":443") is not True:
            raise RuntimeError("Funnel was not enabled for the expected Timesheet proxy.")
        (c.ROOT / "funnel.block").unlink(missing_ok=True)
    except BaseException:
        ops.block_funnel("Funnel setup did not complete. Correct the error and enable again.")
        raise
    print(f"Public Timesheet: https://{name}\nLAN website: {c.origin(cfg)}")
    print("HTTPS certificates and reboot startup are managed by Tailscale. Normal Timesheet login is required.")


def disable():
    cfg = c.config()
    settings = cfg.get("funnel", {})
    if not settings.get("enabled"):
        print("Timesheet Funnel is already disabled.")
        return
    ops.block_funnel("Public access disabled by administrator.")
    try:
        name, routes = state()
        if name == settings.get("hostname") and owns_route(routes, name, settings["proxy_port"]):
            c.run(["tailscale", "funnel", "--https=443", "off"], timeout=15)
        else:
            print("Preserved other Tailscale routes. Timesheet's local public proxy is blocked.")
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Tailscale cleanup unavailable: {error}. Removing the local public proxy instead.")
    cfg["funnel"] = {**settings, "enabled": False}
    apply_settings(cfg)
    print(f"Public Timesheet disabled. LAN website: {c.origin(cfg)}")
```

## admin_powerbi.py

```python
"""Manage the existing read-only reporting API without exposing its credentials."""
import json
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
import admin_common as c
import admin_ops as ops

API_PATH = "/api/powerbi"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def versions():
    # Read build metadata only: importing the reporting service would open SQLite.
    script = r'''const fs=require('fs');
const cfg=require('./src/config/env');
let app=null, source='';
try { app=require('./src/config/version').version; } catch {}
try { source=fs.readFileSync('./src/services/powerBiService.js','utf8'); } catch {}
// shortcut: these build fields are string literals; use a metadata endpoint if they become computed.
const field=name=>(source.match(new RegExp(String.raw`\b${name}\s*:\s*['"]([^'"]+)['"]`))||[])[1]||null;
console.log(JSON.stringify({appVersion:app,apiVersion:field('apiVersion'),
dashboardVersion:field('dashboardVersion'),reportingEnabled:cfg.powerBiApiEnabled}));'''
    try:
        result = c.run(["docker", "exec", "-w", "/app/server", "timesheet-app", "node", "-e", script],
                       display=False, sensitive=True, timeout=2)
        data = json.loads(result.stdout)
        values = {name: value if isinstance(value := data.get(name), str) and
                  re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", value) else None
                  for name in ("appVersion", "apiVersion", "dashboardVersion")}
        values["reportingEnabled"] = data.get("reportingEnabled") if isinstance(data.get("reportingEnabled"), bool) else None
        return values
    except (OSError, RuntimeError, ValueError, AttributeError, subprocess.TimeoutExpired):
        return {}


def addresses():
    cfg = c.config()
    result = [("LAN website", c.origin(cfg))]
    if cfg.get("funnel", {}).get("enabled"):
        result.append(("Public website", c.public_origin(cfg)))
    for label, origin in result:
        print(f"{label}: {origin}")
        print(f"{label.replace('website', 'Power BI API')}: {origin}{API_PATH}")
    if (c.ROOT / "funnel.block").exists() and cfg.get("funnel", {}).get("enabled"):
        print("Public access is paused; the displayed public address is saved configuration.")
    print("Example endpoint: " + c.public_origin(cfg) + API_PATH + "/version")


def settings(private=False):
    script = '''const c=require('./src/config/env');
const value={enabled:c.powerBiApiEnabled,keyConfigured:!!c.powerBiApiKey,
basePath:c.powerBiApiBasePath,maxRecords:c.powerBiMaxRecords,cacheTtl:c.powerBiCacheTtl};'''
    if private:
        script += "value.key=c.powerBiApiKey;"
    script += "console.log(JSON.stringify(value));"
    result = c.run(["docker", "exec", "-w", "/app/server", "timesheet-app", "node", "-e", script],
                   display=False, sensitive=True, timeout=15)
    return json.loads(result.stdout)


def status():
    addresses()
    value = settings()
    print("Reporting API: " + ("ENABLED" if value["enabled"] else "DISABLED"))
    print("Reporting key: " + ("Configured (hidden)" if value["keyConfigured"] else "Not configured"))
    print(f"Configured API path: {value['basePath']} | canonical path: {API_PATH}")
    print(f"Maximum records: {value['maxRecords']} | cache: {value['cacheTtl']} seconds")
    print("Read-only reporting; a dedicated key can read reporting data across the organization.")


def guide():
    addresses()
    origin = c.public_origin(c.config())
    print("GCC_Dashboard: Transform data > Edit parameters")
    print(f"  ApiBaseUrl = {origin}  (website origin, without /api/powerbi)")
    print("  ApiPath = api/powerbi")
    print("Data source settings > Edit permissions > Basic: username powerbi; password = reporting API key.")
    print("Apply credentials to the same website origin, then refresh the report.")
    print("For a simple Web query, use the full /api/powerbi/version URL to check compatibility.")
    print("Use HTTPS when sending credentials. Keep keys in Power BI's credential dialog, outside query text and URLs.")
    print("A refresh using the private LAN address needs a gateway with network access to that server.")
    print("For Power BI Service, configure its source credentials and verify refresh before scheduling it.")
    print("Report/workspace publication and refresh schedules are managed in Power BI, separately from this server menu.")
    print("Guide: https://github.com/" + c.REPO + "/blob/main/powerbi/documentation/POWERBI.md")


def check_connection():
    value = settings(True)
    cfg = c.config()
    urls = [("Local authenticated API", f"http://127.0.0.1:{cfg['app_port']}{API_PATH}/version")]
    if cfg.get("funnel", {}).get("enabled") and not (c.ROOT / "funnel.block").exists():
        urls.append(("Public authenticated API", c.public_origin(cfg) + API_PATH + "/version"))
    if not value["enabled"]:
        print("Reporting API is DISABLED. Enable it explicitly before testing authenticated refresh.")
        return
    if not value.get("key"):
        raise RuntimeError("No reporting key is configured. Enable reporting or rotate its key first.")
    for label, url in urls:
        request = urllib.request.Request(url, headers={"X-API-Key": value["key"]})
        # Never forward reporting credentials to a redirect target.
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=15) as response:
                body = response.read(65537)
                if len(body) > 65536:
                    raise ValueError("Version response is too large")
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ValueError("Unexpected version response")
                if response.status != 200 or not re.fullmatch(r"\d+\.\d+\.\d+", str(data.get("apiVersion", ""))):
                    raise ValueError("Unexpected version response")
                print(f"{label}: PASS | API version {data['apiVersion']}")
        except urllib.error.HTTPError as error:
            print(f"{label}: FAIL | HTTP {error.code}; no response body or key displayed")
            error.close()
        except (OSError, ValueError):
            print(f"{label}: FAIL | Connection, certificate or version-response check failed")


def apply(updates):
    if not ops.running():
        raise RuntimeError("Start the application before changing reporting settings.")
    ops.health(15)
    original = (c.ROOT / ".env").read_text()
    try:
        ops.stop()
        ops.snapshot()
        c.env_update(updates)
        ops.start()
        current = settings(True)
        if "POWERBI_API_ENABLED" in updates and current["enabled"] != (updates["POWERBI_API_ENABLED"] == "true"):
            raise RuntimeError("Reporting enabled/disabled setting was not applied.")
        if "POWERBI_API_KEY" in updates and current.get("key") != updates["POWERBI_API_KEY"]:
            raise RuntimeError("Reporting key change was not applied.")
    except BaseException:
        c.atomic(c.ROOT / ".env", original)
        ops.start()
        raise


def set_enabled(enabled):
    value = settings(True)
    updates = {"POWERBI_API_ENABLED": str(enabled).lower()}
    if enabled and not value.get("key"):
        updates["POWERBI_API_KEY"] = secrets.token_hex(32)
    elif enabled and len(value["key"]) < 32:
        raise RuntimeError("Rotate the short reporting key before enabling the API (minimum 32 characters).")
    apply(updates)
    print("Reporting API " + ("enabled. Use View reporting key for Power BI credentials." if enabled else "disabled."))


def rotate_key():
    apply({"POWERBI_API_KEY": secrets.token_hex(32)})
    print("Reporting key rotated. Update every Power BI data-source credential before its next refresh.")
    print("Reporting enabled/disabled state is preserved. Use View reporting key to retrieve the replacement privately.")


def show_key():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RuntimeError("Key display requires an interactive terminal; redirected output is refused.")
    value = settings(True)
    if not value.get("key"):
        raise RuntimeError("No reporting key is configured. Rotate the key to create one.")
    print("PRIVATE reporting API key (keep it out of screenshots and logs):")
    print(value["key"])
```

## admin_common.py

```python
"""Small, standard-library helpers shared by the Ubuntu administrator tool."""
from __future__ import annotations

import contextlib
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import urllib.request

REPO = "naveenbarrywehmiller/gcc_ts"
IMAGE = f"ghcr.io/{REPO}"
TAG_PREFIX = "gcc-timesheet-linux-admin-v"
LEGACY_TAG_PREFIX = "timesheet-admin-v"
SOURCE = Path(__file__).resolve().parent
VERSION = (SOURCE / "VERSION").read_text().strip()
ROOT = Path("/opt/gcc-timesheet")
BACKUPS = Path("/var/backups/gcc-timesheet")
LIB = Path("/usr/local/lib/gcc-timesheet-admin")
LOGDIR = Path("/var/log/gcc-timesheet-admin")
CONFIG = ROOT / "admin.json"
LOG = logging.getLogger("timesheet")


class LockedRotatingHandler(RotatingFileHandler):
    """Menu and timer processes may coexist; serialize rotation across them."""
    def emit(self, record):
        import fcntl
        with open(str(self.baseFilename) + ".lock", "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            if self.stream:
                self.stream.close()
                self.stream = None
            super().emit(record)


def init_log():
    LOGDIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(LOGDIR, 0o700)
    LOG.setLevel(logging.INFO)
    handler = LockedRotatingHandler(LOGDIR / "admin.log", maxBytes=5 * 1024 * 1024,
                                  backupCount=10, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(handler)


def run(args, *, check=True, display=True, sensitive=False, timeout=1800, env=None):
    """No shell interpolation. Secrets are never logged or put in argument arrays."""
    label = str(args[0]) if sensitive else " ".join(map(str, args))
    LOG.info("RUN %s", label)
    if display and not sensitive:
        print(f"$ {label}", flush=True)
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True,
                            timeout=timeout, env=env)
    output = (result.stdout + result.stderr).strip()
    if output and not sensitive:
        LOG.info("OUTPUT %s", output[-30000:])
        if display:
            print(output)
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {label}. See {LOGDIR}/admin.log")
    return result


def atomic(path: Path, text: str, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".timesheet-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            output.write(text)
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def config():
    if not CONFIG.exists():
        raise RuntimeError("Run Setup first (timesheet setup).")
    return json.loads(CONFIG.read_text())


def save_config(value):
    atomic(CONFIG, json.dumps(value, indent=2) + "\n")


def port_number(value):
    number = int(value)
    if not 1 <= number <= 65535:
        raise ValueError("Port must be 1–65535.")
    return number


def available(port, address="0.0.0.0"):
    # Dual-stack wildcard listeners can occupy the IPv4 socket too.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((address, port_number(port)))
        return True
    except OSError:
        return False


def hostname(value):
    value = value.strip().lower()
    if len(value) > 253 or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", value):
        raise ValueError("Enter a hostname or IPv4 address, without scheme or port.")
    if any(not part or len(part) > 63 or part.startswith("-") or part.endswith("-") for part in value.split(".")):
        raise ValueError("Invalid hostname label.")
    return value


def timezone():
    result = run(["timedatectl", "show", "-p", "Timezone", "--value"], check=False, display=False)
    return result.stdout.strip() or "system local time"


def origin(cfg):
    default = 443 if cfg["https"] else 80
    suffix = "" if cfg["web_port"] == default else f':{cfg["web_port"]}'
    return f'{"https" if cfg["https"] else "http"}://{cfg["hostname"]}{suffix}'


def public_origin(cfg):
    funnel = cfg.get("funnel", {})
    return "https://" + funnel["hostname"] if funnel.get("enabled") else origin(cfg)


def env_update(updates):
    path = ROOT / ".env"
    lines = path.read_text().splitlines() if path.exists() else []
    kept = [line for line in lines if line.split("=", 1)[0] not in updates]
    kept.extend(f"{key}={value}" for key, value in updates.items() if value is not None)
    atomic(path, "\n".join(kept) + "\n")


@contextlib.contextmanager
def lock():
    import fcntl
    with open("/run/lock/gcc-timesheet-admin.lock", "w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another TimeSheet operation is running. Try again when it finishes.") from error
        yield


def fetch(url, limit=20 * 1024 * 1024):
    request = urllib.request.Request(url, headers={"User-Agent": f"gcc-timesheet-admin/{VERSION}",
                                                   "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Download exceeds expected size.")
    return data


def tag_version(tag):
    for prefix in (TAG_PREFIX, LEGACY_TAG_PREFIX):
        if re.fullmatch(re.escape(prefix) + r"\d+\.\d+\.\d+", tag):
            return tag[len(prefix):]
    raise ValueError("Invalid administrator release tag.")


def latest_release():
    # App and Power BI releases coexist: never use /releases/latest here.
    found = []
    for page in range(1, 11):
        releases = json.loads(fetch(f"https://api.github.com/repos/{REPO}/releases?per_page=100&page={page}"))
        for release in releases:
            try:
                version = tag_version(release["tag_name"])
            except ValueError:
                continue
            if not release["draft"] and not release["prerelease"]:
                found.append((tuple(map(int, version.split('.'))), release))
        if len(releases) < 100:
            break
    if not found:
        raise RuntimeError("No published stable GCC Timesheet Linux Admin release found.")
    return max(found, key=lambda row: row[0])[1]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_disk(path, minimum):
    import shutil
    if shutil.disk_usage(path).free < minimum:
        raise RuntimeError(f"Not enough free space at {path}; need at least {minimum // 1024**2} MiB.")
```

## admin_ops.py

```python
"""Deployment operations; no interactive prompts here, so the same code serves timers."""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import socket
import sqlite3
from contextlib import closing, contextmanager
import tarfile
import tempfile
import time
import urllib.request

import admin_common as c

NGINX = Path("/etc/nginx/sites-available/gcc-timesheet")
SCHEDULES = Path("/etc/gcc-timesheet-admin/schedules.json")
JOBS = ("backup", "update", "self-update")
DATA_DIRS = ("data", "uploads", "logs", "app-backup", "tls")
SNAPSHOT_FILES = (".env", ".image", "admin.json", "compose.yaml")


def compose(*args, check=True):
    image = (c.ROOT / ".image").read_text().strip()
    env = os.environ.copy()
    env["TIMESHEET_IMAGE"] = image
    return c.run(["docker", "compose", "--project-directory", c.ROOT,
                  "-f", c.ROOT / "compose.yaml", *args], env=env, check=check)


def inspect(expression, target="timesheet-app", check=True):
    result = c.run(["docker", "inspect", "--format", expression, target], check=check, display=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def running():
    return inspect("{{.State.Running}}", check=False) == "true"


def gate(enabled=True):
    if enabled:
        c.atomic(c.ROOT / "maintenance.flag", "Maintenance in progress\n", 0o644)
    else:
        (c.ROOT / "maintenance.flag").unlink(missing_ok=True)


def web_maintenance():
    c.atomic(c.ROOT / "data/.maintenance", "Maintenance: release by System Admin web login only.\n", 0o644)


@contextmanager
def database_operation():
    marker = c.ROOT / "data/.maintenance-operation"
    # Share an exclusive marker with web database operations. Never overwrite a
    # live operation (including one started through the browser).
    marker.parent.mkdir(parents=True, exist_ok=True)
    try:
        with marker.open("x") as handle:
            handle.write("Database operation in progress\n")
        marker.chmod(0o644)
    except FileExistsError:
        raise RuntimeError(f"A database operation is in progress: {marker}. See the guide for interrupted-operation recovery.")
    try:
        gate()
        web_maintenance()
        yield
    finally:
        web_maintenance()
        marker.unlink(missing_ok=True)
        print(f"Web maintenance remains enabled: {c.origin(c.config())}. System Admin must sign in to release it.")


def health(timeout=180):
    port = c.config()["app_port"]
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            if inspect("{{.State.Health.Status}}", check=False) == "healthy":
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health/live", timeout=5) as response:
                    result = json.load(response)
                if result.get("status") == "ok":
                    return result
        except (OSError, ValueError):
            pass
        time.sleep(3)
    raise RuntimeError("Startup health check failed. Inspect app logs and diagnostics.")


def start():
    gate()
    write_compose(c.config())
    compose("up", "-d", "--pull", "never", "timesheet")
    result = health()
    gate(False)
    print(f"Ready: {c.origin(c.config())}  {result.get('version', '')}")


def stop():
    gate()
    compose("stop", "timesheet")


def restart():
    stop()
    start()


def validate_config(cfg):
    c.hostname(cfg["hostname"])
    c.port_number(cfg["web_port"])
    c.port_number(cfg["app_port"])
    if cfg["web_port"] == cfg["app_port"]:
        raise ValueError("Website and internal app ports must differ.")
    if not isinstance(cfg["https"], bool):
        raise ValueError("Invalid HTTPS setting.")
    if not isinstance(cfg.get("autostart", True), bool):
        raise ValueError("Invalid automatic startup setting.")
    if not re.fullmatch(re.escape(c.IMAGE) + r"(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})", cfg["image_target"]):
        raise ValueError("Image must belong to this project's GHCR repository.")
    funnel = cfg.get("funnel", {})
    if not isinstance(funnel, dict) or not isinstance(funnel.get("enabled", False), bool):
        raise ValueError("Invalid Funnel settings.")
    if funnel.get("enabled"):
        if not isinstance(funnel.get("hostname"), str):
            raise ValueError("Invalid Funnel hostname.")
        name = c.hostname(funnel.get("hostname", ""))
        if name != funnel["hostname"] or not name.endswith(".ts.net") or len(name.split(".")) < 4:
            raise ValueError("Funnel requires this device's Tailscale DNS name.")
        port = c.port_number(funnel.get("proxy_port", 8081))
        if port in (cfg["web_port"], cfg["app_port"]):
            raise ValueError("Funnel's loopback proxy needs a separate port.")


def network_environment(cfg):
    origins = list(dict.fromkeys((c.origin(cfg), c.public_origin(cfg))))
    return {"COOKIE_SECURE": str(cfg["https"]).lower(), "APP_BASE_URL": c.public_origin(cfg),
            "CORS_ORIGIN": ",".join(origins)}


def block_funnel(reason):
    # Outside the snapshot contents: restoring data must never reopen this gate.
    c.atomic(c.ROOT / "funnel.block", reason + "\n", 0o644)


def write_compose(cfg):
    template = (c.SOURCE / "compose.yaml").read_text()
    template = template.replace("restart: always", 'restart: always' if cfg.get("autostart", True) else 'restart: "no"')
    c.atomic(c.ROOT / "compose.yaml", template.replace("127.0.0.1:3001:3001",
                                                     f'127.0.0.1:{cfg["app_port"]}:3001'), 0o644)


def configure_autostart(enabled):
    if not isinstance(enabled, bool):
        raise ValueError("Automatic startup must be enabled or disabled.")
    cfg = c.config()
    # Apply to the existing container without starting an intentionally stopped app.
    c.run(["docker", "update", "--restart=" + ("always" if enabled else "no"), "timesheet-app"])
    cfg["autostart"] = enabled
    c.save_config(cfg)
    write_compose(cfg)
    if enabled:
        c.run(["systemctl", "enable", "docker", "nginx", "avahi-daemon"])
    print("App startup after OS reboot: " + ("enabled" if enabled else "disabled"))


def nginx_text(cfg):
    validate_config(cfg)
    tls = ""
    if cfg["https"]:
        tls = f"""    ssl_certificate {c.ROOT}/tls/server.crt;
    ssl_certificate_key {c.ROOT}/tls/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
"""
    text = f"""# Managed by timesheet v{c.VERSION}; configure through the menu.
server {{
    listen {cfg['web_port']}{' ssl' if cfg['https'] else ''};
    listen [::]:{cfg['web_port']}{' ssl' if cfg['https'] else ''};
    server_name {cfg['hostname']};
{tls}    client_max_body_size 100m;
    location / {{
        if (-f {c.ROOT}/maintenance.flag) {{ return 503; }}
        proxy_pass http://127.0.0.1:{cfg['app_port']};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }}
}}
"""
    funnel = cfg.get("funnel", {})
    if funnel.get("enabled"):
        text += f"""
# Tailscale terminates public HTTPS; only its local proxy can reach this listener.
server {{
    listen 127.0.0.1:{funnel['proxy_port']};
    server_name {funnel['hostname']};
    client_max_body_size 100m;
    set_real_ip_from 127.0.0.1;
    real_ip_header X-Forwarded-For;
    location / {{
        if (-f {c.ROOT}/funnel.block) {{ return 503; }}
        if (-f {c.ROOT}/maintenance.flag) {{ return 503; }}
        proxy_pass http://127.0.0.1:{cfg['app_port']};
        proxy_http_version 1.1;
        proxy_set_header Host {funnel['hostname']};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cookie_flags token secure httponly samesite=lax;
        proxy_cookie_flags refreshToken secure httponly samesite=lax;
        proxy_read_timeout 120s;
    }}
}}
"""
    return text


def write_nginx(cfg):
    old = NGINX.read_text() if NGINX.exists() else None
    link = Path("/etc/nginx/sites-enabled/gcc-timesheet")
    old_link = link.is_symlink()
    c.atomic(NGINX, nginx_text(cfg), 0o644)
    if not link.exists():
        link.symlink_to(NGINX)
    try:
        c.run(["nginx", "-t"])
        c.run(["systemctl", "enable", "--now", "nginx"])
        c.run(["systemctl", "reload", "nginx"])
    except Exception:
        if old is None:
            NGINX.unlink(missing_ok=True)
        else:
            c.atomic(NGINX, old, 0o644)
        if not old_link:
            link.unlink(missing_ok=True)
        raise


def install_dependencies():
    os_release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    if os_release.get("ID", "").strip('"') != "ubuntu":
        raise RuntimeError("This installer supports Ubuntu Server.")
    if os_release.get("VERSION_ID", "").strip('"') not in ("24.04", "26.04"):
        raise RuntimeError("Use Ubuntu 24.04 or 26.04 LTS (Python 3.12+).")
    c.run(["apt-get", "update"])
    c.run(["apt-get", "install", "-y", "ca-certificates", "curl", "openssl", "python3",
           "nginx", "avahi-daemon", "avahi-utils", "libnss-mdns", "ufw", "rsync", "nano", "less"])
    # Preserve a working Docker installation managed by IT.
    import shutil as sh
    if not sh.which("docker"):
        conflicts = c.run(["dpkg-query", "-W", "-f=${db:Status-Abbrev} ${binary:Package}\n",
                           "docker.io", "docker-compose", "podman-docker", "containerd", "runc"],
                          check=False, display=False)
        if any(line.startswith("ii ") for line in conflicts.stdout.splitlines()):
            raise RuntimeError("Conflicting Docker packages detected. Ask IT to reconcile them before installing Docker CE.")
        codename = os_release.get("UBUNTU_CODENAME", os_release.get("VERSION_CODENAME", "")).strip('"')
        if not re.fullmatch(r"[a-z]+", codename):
            raise ValueError("Invalid Ubuntu codename.")
        architecture = c.run(["dpkg", "--print-architecture"], display=False).stdout.strip()
        key = c.fetch("https://download.docker.com/linux/ubuntu/gpg").decode()
        c.atomic(Path("/etc/apt/keyrings/docker.asc"), key, 0o644)
        c.atomic(Path("/etc/apt/sources.list.d/docker.sources"),
                 f"Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: {codename}\nComponents: stable\nArchitectures: {architecture}\nSigned-By: /etc/apt/keyrings/docker.asc\n", 0o644)
        c.run(["apt-get", "update"])
        c.run(["apt-get", "install", "-y", "docker-ce", "docker-ce-cli", "containerd.io",
               "docker-buildx-plugin", "docker-compose-plugin"])
    c.run(["docker", "compose", "version"])
    c.run(["systemctl", "enable", "--now", "docker"])


def setup(cfg, email, password):
    validate_config(cfg)
    if c.CONFIG.exists():
        raise RuntimeError("Already configured. Use Network settings or Repair dependencies.")
    if (c.ROOT / ".env").exists() or (c.ROOT / "data/timesheet.db").exists():
        raise RuntimeError("Existing deployment found. Back it up and migrate it explicitly; setup will not overwrite it.")
    for port, address in [(cfg["web_port"], "0.0.0.0"), (cfg["app_port"], "127.0.0.1")]:
        if not c.available(port, address):
            raise RuntimeError(f"Port {port} is in use. Choose another port.")
    install_dependencies()
    c.ROOT.mkdir(parents=True, exist_ok=True)
    c.ROOT.chmod(0o755)
    for directory in DATA_DIRS:
        (c.ROOT / directory).mkdir(mode=0o700, exist_ok=True)
    c.BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    c.BACKUPS.chmod(0o700)
    c.save_config(cfg)
    c.env_update({"NODE_ENV": "production", "PORT": "3001", "DB_PATH": "/app/server/data/timesheet.db",
                  "JWT_SECRET": secrets.token_hex(64), "JWT_REFRESH_SECRET": secrets.token_hex(64),
                  "COOKIE_SECURE": str(cfg["https"]).lower(), "APP_BASE_URL": c.origin(cfg),
                  "CORS_ORIGIN": c.origin(cfg), "BOOTSTRAP_ADMIN_EMAIL": email,
                  "BOOTSTRAP_ADMIN_PASSWORD": "'" + password + "'", "SEED_DEMO_DATA": "false",
                  "POWERBI_API_ENABLED": "false", "POWERBI_API_KEY": secrets.token_hex(32),
                  "ENABLE_MSAL_AUTH": "false", "ENABLE_SHAREPOINT_SYNC": "false", "ENABLE_POWER_AUTOMATE": "false"})
    write_compose(cfg)
    gate()
    c.atomic(c.ROOT / ".setup-pending", "Run resume-setup after correcting any error.\n")
    resume_setup()
    print("Save your bootstrap credentials in the company vault. Remove them from the menu after your first login.")


def resume_setup():
    if not (c.ROOT / ".setup-pending").exists():
        raise RuntimeError("No interrupted setup is pending.")
    cfg = c.config()
    c.run(["docker", "pull", cfg["image_target"]])
    digest = inspect("{{index .RepoDigests 0}}", cfg["image_target"])
    c.atomic(c.ROOT / ".image", digest + "\n")
    write_nginx(cfg)
    avahi()
    start()
    save_schedules(schedules())
    (c.ROOT / ".setup-pending").unlink()


def configure_network(cfg, cert=None, key=None):
    validate_config(cfg)
    old = c.config()
    for name, address in (("web_port", "0.0.0.0"), ("app_port", "127.0.0.1")):
        if cfg[name] != old[name] and not c.available(cfg[name], address):
            raise RuntimeError(f"Port {cfg[name]} is already in use.")
    stop()
    saved = None
    try:
        saved = snapshot()
        if cfg["https"]:
            if cert and key:
                result = c.run(["openssl", "x509", "-in", cert, "-noout", "-checkhost", cfg["hostname"]])
                if "does NOT match" in result.stdout:
                    raise ValueError("Certificate does not cover the chosen hostname.")
                cert_public = c.run(["openssl", "x509", "-in", cert, "-pubkey", "-noout"], display=False).stdout
                key_public = c.run(["openssl", "pkey", "-in", key, "-pubout"], display=False, sensitive=True).stdout
                if cert_public.strip() != key_public.strip():
                    raise ValueError("Certificate and private key do not match.")
                c.atomic(c.ROOT / "tls/server.crt", Path(cert).read_text(), 0o644)
                c.atomic(c.ROOT / "tls/server.key", Path(key).read_text())
            if not (c.ROOT / "tls/server.key").exists():
                raise ValueError("Supply a PEM certificate and unencrypted private key for HTTPS.")
            result = c.run(["openssl", "x509", "-in", c.ROOT / "tls/server.crt",
                            "-noout", "-checkhost", cfg["hostname"]])
            if "does NOT match" in result.stdout:
                raise ValueError("Existing certificate does not cover the chosen hostname.")
            c.run(["openssl", "x509", "-in", c.ROOT / "tls/server.crt", "-noout", "-checkend", "0"])
        c.save_config(cfg)
        write_compose(cfg)
        c.env_update(network_environment(cfg))
        write_nginx(cfg)
        avahi()
        start()
    except BaseException:
        c.LOG.exception("Network change failed; restoring previous configuration and data")
        if saved:
            restore_snapshot(saved)
        else:
            start()
        raise


def avahi():
    cfg = c.config()
    text = f'''<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group><name replace-wildcards="yes">GCC Timesheet App on %h</name>
<service><type>_{'https' if cfg['https'] else 'http'}._tcp</type><port>{cfg['web_port']}</port>
<txt-record>path=/</txt-record></service></service-group>
'''
    c.atomic(Path("/etc/avahi/services/timesheet.service"), text, 0o644)
    c.run(["systemctl", "enable", "--now", "avahi-daemon"])
    c.run(["systemctl", "restart", "avahi-daemon"])
    print(f"Avahi uses system hostname: {socket.gethostname()}.local. Custom DNS names require IT DNS records.")


def firewall():
    # Preserve IT's current firewall/SSH policy. Never enable/reset UFW here.
    cfg = c.config()
    c.run(["ufw", "allow", f'{cfg["web_port"]}/tcp'])
    c.run(["ufw", "allow", "proto", "udp", "to", "224.0.0.251", "port", "5353"])
    c.run(["ufw", "allow", "proto", "udp", "to", "ff02::fb", "port", "5353"])
    c.run(["ufw", "status", "verbose"])
    print("Rules added. UFW activation and corporate network firewalls remain under IT control.")


def snapshot():
    """Caller must stop the container first. All mutable data is captured together."""
    c.BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    total = sum(p.stat().st_size for directory in DATA_DIRS for p in (c.ROOT / directory).rglob("*") if p.is_file())
    c.require_disk(c.BACKUPS, total + 128 * 1024**2)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + secrets.token_hex(3)
    image_id = inspect("{{.Image}}")
    reference = inspect("{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}", image_id)
    c.run(["docker", "tag", image_id, f"gcc-timesheet-recovery:{stamp}"])
    metadata = {"format": 1, "image_id": image_id, "image_ref": reference,
                "created_utc": stamp, "admin_version": c.VERSION}
    c.atomic(c.ROOT / "snapshot.json", json.dumps(metadata))
    path = c.BACKUPS / f"timesheet-{stamp}.tgz"
    partial = path.with_suffix(".partial")
    try:
        with tarfile.open(partial, "w:gz") as archive:
            for name in (*DATA_DIRS, *SNAPSHOT_FILES, "snapshot.json"):
                archive.add(c.ROOT / name, arcname=name)
        partial.replace(path)
        c.atomic(Path(str(path) + ".sha256"), c.sha256(path) + "\n")
    finally:
        partial.unlink(missing_ok=True)
    c.LOG.info("BACKUP %s", path)
    print(f"Backup: {path}")
    return path


def backup():
    active = running()
    with database_operation():
        try:
            compose("stop", "timesheet")
            path = snapshot()
        finally:
            if active:
                start()
    copy_offsite(path)
    return path


def validate_archive(path, stage):
    path = Path(path).resolve(strict=True)
    expected = Path(str(path) + ".sha256").read_text().split()[0]
    if c.sha256(path) != expected:
        raise ValueError("Backup checksum failed; data has not been replaced.")
    allowed = set(DATA_DIRS + SNAPSHOT_FILES + ("snapshot.json",))
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        names = set()
        total = 0
        for item in members:
            parts = PurePosixPath(item.name)
            if parts.is_absolute() or ".." in parts.parts or not parts.parts or parts.parts[0] not in allowed:
                raise ValueError("Invalid backup path.")
            if not (item.isfile() or item.isdir()) or item.name in names:
                raise ValueError("Backup contains links, special files or duplicate entries.")
            names.add(item.name)
            total += item.size
        c.require_disk(stage, total + 128 * 1024**2)
        archive.extractall(stage, filter="data")
    for name in (*DATA_DIRS, *SNAPSHOT_FILES, "snapshot.json"):
        if not (stage / name).exists():
            raise ValueError(f"Incomplete snapshot: missing {name}")
    cfg = json.loads((stage / "admin.json").read_text())
    validate_config(cfg)
    database = stage / "data/timesheet.db"
    if not database.is_file():
        raise ValueError("Backup has no database.")
    with closing(sqlite3.connect(str(database))) as db, db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed.")
    metadata = json.loads((stage / "snapshot.json").read_text())
    if metadata.get("format") != 1 or not re.fullmatch(r"sha256:[0-9a-f]{64}", metadata["image_id"]):
        raise ValueError("Unsupported backup metadata.")
    return metadata


def restore_snapshot(path):
    # Complete extraction, database verification and image availability checks
    # before replacing anything. Same-filesystem renames avoid copy failures.
    operation_active = (c.ROOT / "data/.maintenance-operation").exists()
    maintenance_active = (c.ROOT / "data/.maintenance").exists()
    with tempfile.TemporaryDirectory(prefix=".restore-", dir=c.ROOT) as temporary:
        stage = Path(temporary)
        metadata = validate_archive(path, stage)
        image_id = metadata["image_id"]
        if not inspect("{{.Id}}", image_id, check=False):
            reference = metadata["image_ref"]
            if not re.fullmatch(re.escape(c.IMAGE) + r"@sha256:[0-9a-f]{64}", reference):
                raise ValueError("Snapshot has no recoverable registry digest. Load the saved image first.")
            c.run(["docker", "pull", reference])
            if inspect("{{.Id}}", reference) != image_id:
                raise ValueError("Restored image does not match snapshot architecture/image ID.")
        if c.config().get("funnel", {}).get("enabled") or json.loads((stage / "admin.json").read_text()).get("funnel", {}).get("enabled"):
            block_funnel("Public access paused after restore. Check credentials and run timesheet funnel enable --confirm.")
        stop()
        displaced = stage / "displaced"
        displaced.mkdir()
        moved = []
        try:
            for name in (*DATA_DIRS, *SNAPSHOT_FILES):
                destination = c.ROOT / name
                if destination.exists():
                    destination.rename(displaced / name)
                moved.append(name)
                (stage / name).rename(destination)
            c.atomic(c.ROOT / ".image", image_id + "\n")
            # Snapshot data can predate maintenance or include a stale operation
            # marker. The current operation decides whether release is locked.
            marker = c.ROOT / "data/.maintenance-operation"
            if operation_active:
                c.atomic(marker, "Database operation in progress\n", 0o644)
            else:
                marker.unlink(missing_ok=True)
            if maintenance_active:
                web_maintenance()
            write_nginx(c.config())
            start()
        except BaseException:
            # Preserve failed data for investigation; the safety snapshot also
            # remains on disk. Never leave a partial file replacement unnoticed.
            compose("stop", "timesheet", check=False)
            for name in reversed(moved):
                destination = c.ROOT / name
                if destination.exists():
                    destination.rename(stage / ("failed-" + name))
                if (displaced / name).exists():
                    (displaced / name).rename(destination)
            write_nginx(c.config())
            gate()
            raise


def restore(path):
    # Validate before creating an outage or pausing updates.
    with tempfile.TemporaryDirectory(prefix=".verify-", dir=c.ROOT) as temporary:
        validate_archive(path, Path(temporary))
    pause("update")
    with database_operation():
        stop()
        safety = None
        try:
            safety = snapshot()
            restore_snapshot(path)
        except BaseException:
            c.LOG.exception("Restore failed; recovering safety snapshot %s", safety)
            if safety:
                restore_snapshot(safety)
            else:
                start()
            raise
    print("Restore complete. Automatic app updates remain paused.")


def factory_reset():
    if c.config().get("funnel", {}).get("enabled"):
        block_funnel("Public access paused for factory reset. Change the factory password before enabling Funnel again.")
    pause("all")
    with database_operation():
        stop()
        safety = None
        try:
            safety = snapshot()
            # Require the complete off-VM copy too, if configured, before deleting.
            copy_offsite(safety)
            compose("run", "--rm", "--no-deps", "--entrypoint", "node", "timesheet",
                    "src/config/factoryReset.js", "--confirm")
            # Database reset is atomic. Delete uploaded/test files and old app logs
            # only after it succeeds; retain both full and database safety backups.
            for name in ("uploads", "logs"):
                target = (c.ROOT / name).resolve()
                if target.parent != c.ROOT.resolve():
                    raise RuntimeError("Invalid reset directory")
                shutil.rmtree(target)
                target.mkdir(mode=0o700)
            c.env_update({"BOOTSTRAP_ADMIN_EMAIL": None, "BOOTSTRAP_ADMIN_PASSWORD": None, "SEED_DEMO_DATA": "false",
                          "ENABLE_MSAL_AUTH": "false", "ENABLE_SHAREPOINT_SYNC": "false",
                          "ENABLE_POWER_AUTOMATE": "false", "POWERBI_API_ENABLED": "false"})
            start()
        except BaseException:
            c.LOG.exception("Factory reset failed; recovering safety snapshot %s", safety)
            if safety:
                restore_snapshot(safety)
            else:
                start()
            raise
    print(f"Factory reset complete. Safety snapshot: {safety}")
    print("Only systemadmin@barry-wehmiller.com remains; password: systemadmin. Automatic jobs remain paused.")


def app_update(retry=False):
    cfg = c.config()
    health(15)
    old = inspect("{{.Image}}")
    c.run(["docker", "pull", cfg["image_target"]])
    new = inspect("{{.Id}}", cfg["image_target"])
    if new == old:
        print("Application already current.")
        return
    failed = c.ROOT / ".failed-image"
    if failed.exists() and failed.read_text().strip() == new and not retry:
        raise RuntimeError("This image failed previously. Use Retry failed update after fixing the cause.")
    saved = None
    stop()
    try:
        saved = snapshot()
        digest = inspect("{{index .RepoDigests 0}}", cfg["image_target"])
        c.atomic(c.ROOT / ".image", digest + "\n")
        start()
    except BaseException:
        c.atomic(failed, new + "\n")
        c.LOG.exception("Update failed; rolling back image and data")
        if saved:
            restore_snapshot(saved)
        else:
            start()  # Snapshot failure occurs before changing the selected image.
        raise
    failed.unlink(missing_ok=True)
    copy_offsite(saved)
    print("Application updated. Startup health checks passed.")


def default_schedules():
    return {"backup": {"calendar": "*-*-* 02:00:00", "enabled": False},
            "update": {"calendar": "*-*-* 03:00:00", "enabled": False},
            "self-update": {"calendar": "Sun *-*-* 04:00:00", "enabled": False},
            "retention_days": 30, "auto_prune": False, "offsite": ""}


def schedules():
    return json.loads(SCHEDULES.read_text()) if SCHEDULES.exists() else default_schedules()


def save_schedules(settings):
    for job in JOBS:
        expression = settings[job]["calendar"]
        if "\n" in expression or "\r" in expression:
            raise ValueError("Schedule must be one line.")
        c.run(["systemd-analyze", "calendar", expression], display=False)
    for job in JOBS:
        service = f"""[Unit]
Description=GCC Timesheet App {job}
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/timesheet {job} --scheduled
TimeoutStartSec=infinity
UMask=0077
"""
        timer = f"""[Unit]
Description=GCC Timesheet App {job} schedule

[Timer]
OnCalendar={settings[job]['calendar']}
Persistent=false
Unit=timesheet-{job}.service

[Install]
WantedBy=timers.target
"""
        c.atomic(Path(f"/etc/systemd/system/timesheet-{job}.service"), service, 0o644)
        c.atomic(Path(f"/etc/systemd/system/timesheet-{job}.timer"), timer, 0o644)
    c.atomic(SCHEDULES, json.dumps(settings, indent=2) + "\n")
    c.run(["systemctl", "daemon-reload"])
    for job in JOBS:
        action = "enable" if settings[job]["enabled"] else "disable"
        c.run(["systemctl", action, "--now", f"timesheet-{job}.timer"])
        if settings[job]["enabled"]:
            c.run(["systemctl", "restart", f"timesheet-{job}.timer"])


def pause(job, resume=False):
    settings = schedules()
    for name in JOBS if job == "all" else (job,):
        if name not in JOBS:
            raise ValueError("Unknown scheduled job.")
        settings[name]["enabled"] = resume
    save_schedules(settings)
    print("Schedules resumed." if resume else "Schedules paused. A running operation is allowed to finish.")


def copy_offsite(path):
    target = schedules().get("offsite", "")
    if not target:
        return
    validate_offsite(target)
    c.run(["rsync", "-a", "-e", "ssh -oBatchMode=yes -oStrictHostKeyChecking=yes", "--",
           path, str(path) + ".sha256", target])


def validate_offsite(value):
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+:/[a-zA-Z0-9_./-]+/", value):
        raise ValueError("Use user@backup-host:/absolute/directory/ without spaces or shell characters.")


def prune(execute=False):
    settings = schedules()
    days = int(settings["retention_days"])
    if not 7 <= days <= 3650:
        raise ValueError("Retention must be 7–3650 days.")
    paths = sorted(c.BACKUPS.glob("timesheet-*.tgz"), key=lambda p: p.stat().st_mtime, reverse=True)
    expired = [p for p in paths[3:] if p.stat().st_mtime < time.time() - days * 86400]
    for path in expired:
        print(path)
        if execute:
            path.unlink()
            Path(str(path) + ".sha256").unlink(missing_ok=True)
            c.LOG.info("PRUNED %s", path)
    print(f"{'Removed' if execute else 'Would remove'} {len(expired)} backups; newest three always retained.")


def diagnostics():
    for command in (["hostnamectl"], ["timedatectl"], ["df", "-h"], ["free", "-h"],
                    ["ss", "-lntup"], ["docker", "version"], ["docker", "compose", "version"],
                    ["docker", "ps", "-a"], ["docker", "system", "df"], ["nginx", "-t"],
                    ["systemctl", "--failed", "--no-pager"], ["systemctl", "list-timers", "--all", "timesheet-*", "--no-pager"],
                    ["systemctl", "status", "avahi-daemon", "--no-pager"]):
        try:
            c.run(command, check=False)
        except FileNotFoundError:
            print(f"Not installed: {command[0]}")
    if c.CONFIG.exists():
        print(f"Website: {c.origin(c.config())}")
        print(f"Maintenance gate: {(c.ROOT / 'maintenance.flag').exists()}")
    print(f"Admin logs: {c.LOGDIR}/admin.log (5 MiB x 11 files maximum)")


def check_db():
    uri = (c.ROOT / "data/timesheet.db").as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db, db:
        result = db.execute("PRAGMA integrity_check").fetchall()
    if result != [("ok",)]:
        raise RuntimeError(f"Database integrity check failed: {result}")
    print("SQLite integrity: ok")
```

## admin_release.py

```python
"""Versioned administrator installs; app data and schedules are preserved."""
from __future__ import annotations
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile
import tempfile
import admin_common as c

ASSET = "gcc-timesheet-linux-admin.tar.gz"

def validate_tag(tag):
    return c.tag_version(tag)

def install(source, version):
    if (source / "VERSION").read_text().strip() != version:
        raise ValueError("Bundle version does not match selected release.")
    for name in ("manager.py", "admin_ui.py", "admin_system.py", "admin_funnel.py", "admin_powerbi.py", "admin_common.py", "admin_ops.py", "admin_release.py", "timesheet", "compose.yaml"):
        if not (source / name).is_file() or (source / name).is_symlink():
            raise ValueError(f"Incomplete bundle: {name}")
    c.run([sys.executable, "-m", "py_compile", *map(str, source.glob("*.py"))], display=False)
    c.run(["bash", "-n", source / "timesheet"], display=False)
    c.run([sys.executable, source / "manager.py", "--version"], display=False)
    releases = c.LIB / "releases"
    releases.mkdir(parents=True, exist_ok=True, mode=0o755)
    c.LIB.chmod(0o755)
    releases.chmod(0o755)
    destination = releases / version
    if destination.exists():
        raise RuntimeError(f"Version {version} is already installed. Use manager rollback to select it.")
    stage = Path(tempfile.mkdtemp(prefix=".install-", dir=releases))
    try:
        shutil.copytree(source, stage, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "tests"))
        stage.chmod(0o755)
        for path in stage.rglob("*"):
            path.chmod(0o755 if path.is_dir() or path.name in ("timesheet", "install.sh") else 0o644)
        stage.rename(destination)
    finally:
        if stage.exists(): shutil.rmtree(stage)
    current = c.LIB / "current"
    if current.is_symlink():
        c.atomic(c.LIB / "previous-version", current.resolve().name + "\n", 0o644)
    link = c.LIB / ".next"
    link.unlink(missing_ok=True)
    link.symlink_to(destination)
    os.replace(link, current)
    launcher = Path("/usr/local/bin/timesheet")
    c.atomic(launcher, (source / "timesheet").read_text(), 0o755)
    old = Path("/usr/local/sbin/timesheet")
    if old.exists() and not old.is_symlink():
        old.replace(old.with_name("timesheet.legacy"))
    old.unlink(missing_ok=True)
    old.symlink_to(launcher)
    c.LOG.info("Installed administrator %s", version)
    print(f"Installed GCC Timesheet Linux Admin {version}. Run: timesheet")

def check():
    release = c.latest_release()
    version = validate_tag(release["tag_name"])
    print(f"Installed administrator: {c.VERSION}\nLatest administrator: {version}\n{release['html_url']}")
    return release

def update():
    release = check()
    version = validate_tag(release["tag_name"])
    if tuple(map(int, version.split("."))) <= tuple(map(int, c.VERSION.split("."))):
        print("Administrator is already current.")
        return False
    base = f"https://github.com/{c.REPO}/releases/download/{release['tag_name']}"
    with tempfile.TemporaryDirectory(prefix="timesheet-admin-update-") as temporary:
        directory = Path(temporary)
        archive = directory / ASSET
        archive.write_bytes(c.fetch(f"{base}/{ASSET}"))
        checksum = c.fetch(f"{base}/{ASSET}.sha256").decode().split()[0]
        if c.sha256(archive) != checksum:
            raise ValueError("Administrator download checksum failed.")
        with tarfile.open(archive, "r:gz") as bundle:
            total = 0
            for item in bundle.getmembers():
                parts = PurePosixPath(item.name)
                if parts.is_absolute() or ".." in parts.parts or not parts.parts or parts.parts[0] != "timesheet-admin":
                    raise ValueError("Invalid release bundle path.")
                if not (item.isfile() or item.isdir()):
                    raise ValueError("Release bundle contains links or special files.")
                total += item.size
                if total > 50 * 1024**2: raise ValueError("Release bundle is too large.")
            bundle.extractall(directory, filter="data")
        install(directory / "timesheet-admin", version)
    return True

def rollback():
    version = (c.LIB / "previous-version").read_text().strip()
    validate_tag(c.TAG_PREFIX + version)
    if tuple(map(int, version.split("."))) < (1, 3, 0) and c.CONFIG.exists() and c.config().get("funnel", {}).get("enabled"):
        raise RuntimeError("Disable Funnel before rolling back to an older tool: timesheet funnel disable --confirm")
    target = c.LIB / "releases" / version
    if not (target / "manager.py").is_file():
        raise ValueError("Previous administrator installation is missing.")
    c.run([sys.executable, target / "manager.py", "--version"])
    old = (c.LIB / "current").resolve().name
    link = c.LIB / ".next"
    link.unlink(missing_ok=True)
    link.symlink_to(target)
    os.replace(link, c.LIB / "current")
    c.atomic(c.LIB / "previous-version", old + "\n", 0o644)
    c.atomic(Path("/usr/local/bin/timesheet"), (target / "timesheet").read_text(), 0o755)
    print(f"Administrator rolled back to {version}; app data unchanged.")
```

## compose.yaml

```yaml
name: gcc-timesheet
services:
  timesheet:
    image: ${TIMESHEET_IMAGE:-ghcr.io/naveenbarrywehmiller/gcc_ts:latest}
    container_name: timesheet-app
    restart: always
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: "3001"
      DB_PATH: /app/server/data/timesheet.db
      MAINTENANCE_FILE: /app/server/data/.maintenance
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - ./data:/app/server/data
      - ./uploads:/app/server/uploads
      - ./logs:/app/server/logs
      - ./app-backup:/app/server/backup
    stop_grace_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/api/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      start_period: 30s
      retries: 5
```

## build_release.py

```python
"""Generate the full source reference and versioned distribution assets."""
from pathlib import Path
import argparse
import hashlib
import io
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent
SCRIPTS = ["VERSION", "install.sh", "timesheet", "manager.py", "admin_ui.py", "admin_system.py", "admin_funnel.py", "admin_powerbi.py", "admin_common.py",
           "admin_ops.py", "admin_release.py", "compose.yaml", "build_release.py"]

def source_reference():
    text = "# GCC Timesheet Linux Admin: complete script reference\n\n"
    text += "Generated from the shipped files by `python3 deploy/linux-admin/build_release.py`. Do not edit this reference manually.\n\n"
    text += "See [the setup and operations guide](README.md) for installation, menus and troubleshooting.\n\n"
    for name in SCRIPTS:
        language = "python" if name.endswith(".py") else "yaml" if name.endswith(".yaml") else "bash" if name in ("install.sh", "timesheet") else "text"
        text += f"## {name}\n\n```{language}\n{(ROOT / name).read_text(encoding='utf-8').rstrip()}\n```\n\n"
    return text.rstrip() + "\n"

def build(check=False):
    reference = source_reference()
    path = ROOT / "SCRIPTS.md"
    if check:
        assert path.read_text(encoding="utf-8") == reference, "Regenerate SCRIPTS.md with build_release.py"
        return
    path.write_text(reference, encoding="utf-8", newline="\n")
    dist = ROOT.parent / "dist"
    dist.mkdir(exist_ok=True)
    files = SCRIPTS + ["README.md", "SCRIPTS.md"]
    archive = dist / "gcc-timesheet-linux-admin.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for name in files:
            data = (ROOT / name).read_bytes()
            info = tarfile.TarInfo("timesheet-admin/" + name)
            info.size = len(data)
            info.mode = 0o755 if name in ("install.sh", "timesheet") else 0o644
            info.mtime = 0
            bundle.addfile(info, io.BytesIO(data))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / (archive.name + ".sha256")).write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    with zipfile.ZipFile(dist / "gcc-timesheet-linux-admin.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in files:
            bundle.write(ROOT / name, "timesheet-admin/" + name)
    for name in ("README.md", "SCRIPTS.md", "install.sh"):
        (dist / name).write_bytes((ROOT / name).read_bytes())
    print(f"Built GCC Timesheet Linux Admin {(ROOT / 'VERSION').read_text().strip()} in {dist}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    build(parser.parse_args().check)
```
