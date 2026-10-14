# TimeSheet Admin: complete script reference

Generated from the shipped files by `python3 deploy/ubuntu/build_release.py`. Do not edit this reference manually.

See [the setup and operations guide](README.md) for installation, menus and troubleshooting.

## VERSION

```text
1.0.0
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
printf '[%s] Starting TimeSheet Admin installer\n' "$(date -Is)"
. /etc/os-release
[[ "$ID" == ubuntu && ( "$VERSION_ID" == 24.04 || "$VERSION_ID" == 26.04 ) ]] || {
  echo 'Ubuntu 24.04 or 26.04 LTS required.'; exit 1;
}
apt-get update
apt-get install -y python3 ca-certificates curl
python3 - "${1:-}" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys, tarfile, tempfile, urllib.request
repo = 'naveenbarrywehmiller/gcc_ts'
prefix = 'timesheet-admin-v'
asset = 'gcc-timesheet-admin.tar.gz'
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
    tag = max(releases, key=lambda r: tuple(map(int, r['tag_name'][len(prefix):].split('.'))))['tag_name']
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
  exec sudo -- /usr/local/bin/timesheet "$@"
fi
exec python3 /usr/local/lib/gcc-timesheet-admin/current/manager.py "$@"
```

## manager.py

```python
#!/usr/bin/env python3
"""Interactive menu and scriptable CLI for GCC TimeSheet on Ubuntu."""
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
    email = prompt("Initial system administrator email")
    if not email or not re.fullmatch(r"[^\s@'\"$]+@[^\s@'\"$]+\.[^\s@'\"$]+", email):
        raise ValueError("Enter a valid administrator email.")
    password = getpass.getpass("Initial password (12+ characters; hidden): ")
    if len(password) < 12 or any(char in password for char in "'\n\r\\"):
        raise ValueError("Use 12+ characters without single quotes, backslashes or line breaks.")
    if password != getpass.getpass("Confirm password: "):
        raise ValueError("Passwords do not match.")
    cfg = {"hostname": name, "web_port": web, "app_port": internal, "https": False,
           "image_target": c.IMAGE + ":latest"}
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
    paths = sorted(c.BACKUPS.glob("timesheet-*.tgz"), reverse=True)
    for index, path in enumerate(paths, 1):
        print(f"{index:3}  {path.name}  {path.stat().st_size / 1024**2:.1f} MiB")
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
    print(f"TimeSheet Admin {c.VERSION} | host {socket.gethostname()} | timezone {c.timezone()}")
    if c.CONFIG.exists():
        cfg = c.config()
        print(f"Website: {c.origin(cfg)}\nUpdate channel: {cfg['image_target']}")
        ops.compose("ps", check=False)
        print(f"Maintenance gate: {(c.ROOT / 'maintenance.flag').exists()}")
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

def menu():
    while True:
        print(f"\nGCC TimeSheet Administrator v{c.VERSION} | {socket.gethostname()} | {c.timezone()}")
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
TAG_PREFIX = "timesheet-admin-v"
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


def latest_release():
    # App and Power BI releases coexist: never use /releases/latest here.
    found = []
    for page in range(1, 11):
        releases = json.loads(fetch(f"https://api.github.com/repos/{REPO}/releases?per_page=100&page={page}"))
        for release in releases:
            match = re.fullmatch(re.escape(TAG_PREFIX) + r"(\d+)\.(\d+)\.(\d+)", release["tag_name"])
            if match and not release["draft"] and not release["prerelease"]:
                found.append((tuple(map(int, match.groups())), release))
        if len(releases) < 100:
            break
    if not found:
        raise RuntimeError("No published stable TimeSheet Admin release found.")
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
from contextlib import closing
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


def health(timeout=180):
    port = c.config()["app_port"]
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            if inspect("{{.State.Health.Status}}", check=False) == "healthy":
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=5) as response:
                    result = json.load(response)
                if result.get("status") == "ok":
                    return result
        except (OSError, ValueError):
            pass
        time.sleep(3)
    raise RuntimeError("Startup health check failed. Inspect app logs and diagnostics.")


def start():
    gate()
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
    if not re.fullmatch(re.escape(c.IMAGE) + r"(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})", cfg["image_target"]):
        raise ValueError("Image must belong to this project's GHCR repository.")


def write_compose(cfg):
    template = (c.SOURCE / "compose.yaml").read_text()
    c.atomic(c.ROOT / "compose.yaml", template.replace("127.0.0.1:3001:3001",
                                                     f'127.0.0.1:{cfg["app_port"]}:3001'), 0o644)


def nginx_text(cfg):
    validate_config(cfg)
    tls = ""
    if cfg["https"]:
        tls = f"""    ssl_certificate {c.ROOT}/tls/server.crt;
    ssl_certificate_key {c.ROOT}/tls/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
"""
    return f"""# Managed by timesheet v{c.VERSION}; configure through the menu.
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
        c.env_update({"COOKIE_SECURE": str(cfg["https"]).lower(), "APP_BASE_URL": c.origin(cfg), "CORS_ORIGIN": c.origin(cfg)})
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
<service-group><name replace-wildcards="yes">GCC TimeSheet on %h</name>
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
    was_gated = (c.ROOT / "maintenance.flag").exists()
    gate()
    try:
        compose("stop", "timesheet")
        path = snapshot()
    finally:
        if active:
            compose("up", "-d", "--pull", "never", "timesheet")
            health()
            if not was_gated:
                gate(False)
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
Description=GCC TimeSheet {job}
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/timesheet {job} --scheduled
TimeoutStartSec=infinity
UMask=0077
"""
        timer = f"""[Unit]
Description=GCC TimeSheet {job} schedule

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
import re
import shutil
import sys
import tarfile
import tempfile
import admin_common as c

ASSET = "gcc-timesheet-admin.tar.gz"

def validate_tag(tag):
    if not re.fullmatch(re.escape(c.TAG_PREFIX) + r"\d+\.\d+\.\d+", tag):
        raise ValueError("Invalid administrator release tag.")
    return tag[len(c.TAG_PREFIX):]

def install(source, version):
    if (source / "VERSION").read_text().strip() != version:
        raise ValueError("Bundle version does not match selected release.")
    for name in ("manager.py", "admin_common.py", "admin_ops.py", "admin_release.py", "timesheet", "compose.yaml"):
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
    print(f"Installed TimeSheet Admin {version}. Run: timesheet")

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
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: "3001"
      DB_PATH: /app/server/data/timesheet.db
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
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
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
SCRIPTS = ["VERSION", "install.sh", "timesheet", "manager.py", "admin_common.py",
           "admin_ops.py", "admin_release.py", "compose.yaml", "build_release.py"]

def source_reference():
    text = "# TimeSheet Admin: complete script reference\n\n"
    text += "Generated from the shipped files by `python3 deploy/ubuntu/build_release.py`. Do not edit this reference manually.\n\n"
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
    archive = dist / "gcc-timesheet-admin.tar.gz"
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
    with zipfile.ZipFile(dist / "gcc-timesheet-admin.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in files:
            bundle.write(ROOT / name, "timesheet-admin/" + name)
    for name in ("README.md", "SCRIPTS.md", "install.sh"):
        (dist / name).write_bytes((ROOT / name).read_bytes())
    print(f"Built TimeSheet Admin {(ROOT / 'VERSION').read_text().strip()} in {dist}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    build(parser.parse_args().check)
```
