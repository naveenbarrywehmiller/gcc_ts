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
