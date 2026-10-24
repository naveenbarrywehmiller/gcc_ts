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
    for name in ("manager.py", "admin_ui.py", "admin_system.py", "admin_funnel.py", "admin_common.py", "admin_ops.py", "admin_release.py", "timesheet", "compose.yaml"):
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
