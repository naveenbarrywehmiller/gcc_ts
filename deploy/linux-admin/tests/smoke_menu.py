"""Additional real menu checks; called only by the disposable Ubuntu CI smoke test."""
import io
import json
import os
from pathlib import Path
import pty
import select
import shutil
import sqlite3
import subprocess
import termios
import time
import urllib.error
import urllib.request
from contextlib import closing, redirect_stdout

import admin_common as c
import admin_ops as ops
import admin_powerbi as powerbi
import admin_release as release
import admin_ui as ui
import manager


def panel(steps, expected="", timeout=180):
    """Capture in memory only: private key display is tested without saving its output."""
    master, slave = pty.openpty()
    termios.tcsetwinsize(slave, (45, 100))
    child = subprocess.Popen(["/usr/local/bin/timesheet", "--plain"], stdin=slave, stdout=slave, stderr=slave,
                             env={**os.environ, "TERM": "xterm", "EDITOR": "/usr/bin/true", "LESS": "-X"})
    output, cursor, deadline = b"", 0, time.monotonic() + timeout
    def read_until(needle):
        nonlocal output, cursor
        wanted = needle.encode()
        while wanted not in output[cursor:]:
            if time.monotonic() > deadline or child.poll() is not None:
                raise AssertionError("Menu did not reach expected prompt: " + needle)
            if select.select([master], [], [], .1)[0]:
                try: output += os.read(master, 65536)
                except OSError: raise AssertionError("Menu closed before expected prompt: " + needle) from None
        cursor = output.index(wanted, cursor) + len(wanted)
    try:
        for prompt, answer in steps:
            read_until(prompt)
            os.write(master, (answer + "\n").encode())
        if expected: read_until(expected)
        child.wait(timeout=max(1, deadline - time.monotonic()))
        assert child.returncode == 0, "Menu exited with an error"
        assert b"ERROR:" not in output, "Menu reported an operation error (private output suppressed)"
    finally:
        if child.poll() is None: child.kill(); child.wait()
        os.close(master)
        os.close(slave)


def action(category, item, prompts=()):
    panel([("Choose [0]:", category), ("Choose [0]:", str(item)), *prompts,
           ("Press Enter to return to this category...", ""), ("Choose [0]:", "q")])


def run(maintenance_login):
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.geteuid() != 0:
        raise RuntimeError("Real menu smoke tests require the disposable root GitHub runner.")
    for index, group in enumerate(ui.GROUPS):
        category = "h" if index == len(ui.GROUPS) - 1 else str(index + 1)
        for number, entry in enumerate(group[3], 1):
            action(category, "?" + str(number))
            print("PASS installed menu help: " + entry[0])
    for category, item in (("1", 1), ("2", 2), ("2", 3), ("3", 4), ("6", 1), ("6", 2), ("6", 3), ("h", 2)):
        action(category, item)
    action("h", 1, [("# GCC Timesheet Linux Admin", "q")])
    action("5", 5)  # The private editor is opened/exited via EDITOR=true; no secrets are printed.
    action("5", 4, [("Type YES to continue:", "YES")])
    assert "BOOTSTRAP_ADMIN_PASSWORD=" not in (c.ROOT / ".env").read_text()
    print("PASS actual status, backups, integrity, logs, diagnostics, guide, display, editor handoff and bootstrap removal")

    action("1", 4, [("Type YES to continue:", "YES")])
    assert not ops.running()
    action("1", 2)
    action("1", 3)
    action("1", 5, [("Start app automatically after OS reboot?", "n")])
    assert ops.inspect("{{.HostConfig.RestartPolicy.Name}}") == "no"
    action("1", 5, [("Start app automatically after OS reboot?", "y")])
    assert ops.inspect("{{.HostConfig.RestartPolicy.Name}}") == "always"
    print("PASS actual stop, start, restart and startup toggles through the installed menu")

    def reporting(option, confirmation=False):
        prompts = [("Choose [0]:", str(option))]
        if confirmation: prompts.append(("Type YES to continue:", "YES"))
        action("5", 7, prompts)
    for choice in (1, 2, 3): reporting(choice)
    reporting(5, True)
    first = powerbi.settings(True)["key"]
    reporting(3)
    reporting(4, True)
    reporting(7, True)
    second = powerbi.settings(True)["key"]
    assert first != second
    assert powerbi.settings()["enabled"] is True
    url = f"http://127.0.0.1:{c.config()['app_port']}/api/powerbi/version"
    try:
        urllib.request.urlopen(urllib.request.Request(url, headers={"X-API-Key": first}))
        raise AssertionError("Rotated key still authenticates")
    except urllib.error.HTTPError as error:
        assert error.code == 401
        error.close()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"X-API-Key": second})) as response:
        assert json.load(response)["apiVersion"] == "2.0.0"
    reporting(6, True)
    assert powerbi.settings()["enabled"] is False
    reporting(3)
    print("PASS all seven Power BI menu actions, authenticated API, key rotation/revocation and disable")

    with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
        db.execute("INSERT INTO users(name,email,role,password_hash) SELECT 'Disposable menu test','delete-me@example.invalid','employee',password_hash FROM users LIMIT 1")
    marker = c.ROOT / "uploads/menu-smoke.txt"
    marker.write_text("saved by menu backup")
    previous = set(c.BACKUPS.glob("timesheet-*.tgz"))
    action("2", 1)
    saved = (set(c.BACKUPS.glob("timesheet-*.tgz")) - previous).pop()
    maintenance_login("systemadmin@barry-wehmiller.com", "systemadmin")
    marker.write_text("newer data to replace in isolated restore")
    number = sorted(c.BACKUPS.glob("timesheet-*.tgz"), reverse=True).index(saved) + 1
    action("2", 4, [("Snapshot number:", str(number)), ("Type YES to continue:", "YES")])
    assert marker.read_text() == "saved by menu backup"
    maintenance_login("systemadmin@barry-wehmiller.com", "systemadmin")
    action("7", 2, [("Type FACTORY RESET to confirm:", "FACTORY RESET")])
    assert not marker.exists()
    assert saved.exists()
    with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db:
        assert db.execute("SELECT email FROM users").fetchall() == [("systemadmin@barry-wehmiller.com",)]
    maintenance_login("systemadmin@barry-wehmiller.com", "systemadmin")
    print("PASS actual menu backup, selected restore and factory-reset deletion; safety archives retained")

    expired = []
    for index in range(6):
        path = c.BACKUPS / f"timesheet-2000010{index + 1}T000000-menu.tgz"
        shutil.copy2(saved, path)
        shutil.copy2(str(saved) + ".sha256", str(path) + ".sha256")
        old = time.time() - 90 * 86400
        os.utime(path, (old, old))
        expired.append(path)
    with redirect_stdout(io.StringIO()): ops.prune()
    assert all(path.exists() for path in expired)
    action("2", 6, [("Type YES to continue:", "YES")])
    assert all(not path.exists() and not Path(str(path) + ".sha256").exists() for path in expired)
    assert len(list(c.BACKUPS.glob("timesheet-*.tgz"))) >= 3
    print("PASS retention preview, confirmed archive/checksum deletion and newest-three protection")

    settings = ops.schedules()
    settings["backup"]["enabled"] = True
    settings["backup"]["calendar"] = "*-*-* 23:59:00"
    ops.save_schedules(settings)
    action("4", 2, [("Job: backup / update / self-update / all", "backup")])
    assert ops.schedules()["backup"]["enabled"] is False
    action("4", 3, [("Job: backup / update / self-update / all", "backup")])
    assert ops.schedules()["backup"]["enabled"] is True
    ops.pause("all")
    print("PASS real schedule/timer enable, pause and resume")

    image_before = ops.inspect("{{.Id}}")
    with __import__('tempfile').TemporaryDirectory() as temporary:
        source = Path(temporary) / "tool"
        shutil.copytree(c.SOURCE, source, ignore=shutil.ignore_patterns("__pycache__"))
        (source / "VERSION").write_text("1.3.99\n")
        release.install(source, "1.3.99")
        release.rollback()
    assert (c.LIB / "current").resolve().name == c.VERSION
    assert ops.inspect("{{.Id}}") == image_before
    assert release.update() is False  # Published release is older than this local 1.4.0 candidate.
    print("PASS versioned tool install, rollback and latest-release no-op without changing application data")
