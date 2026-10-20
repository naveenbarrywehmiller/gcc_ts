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
