"""Real Ubuntu/Docker integration check. Run ONLY on a disposable CI runner."""
import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
import sys
import urllib.request
import urllib.error
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_ops as ops
import admin_release as release

if os.environ.get("GITHUB_ACTIONS") != "true" or os.geteuid() != 0:
    raise SystemExit("This destructive integration test only runs as root in GitHub Actions.")
c.init_log()
# CI builds this tag from the checked-out source, so new deployment features
# never accidentally test against yesterday's published application image.
local_image = c.IMAGE + ":admin-ci"
real_run, real_inspect = c.run, ops.inspect
def local_run(args, **kwargs):
    if list(args) == ["docker", "pull", local_image]:
        return subprocess.CompletedProcess(args, 0, "Using CI source image\n", "")
    return real_run(args, **kwargs)
def local_inspect(expression, target="timesheet-app", check=True):
    if expression == "{{index .RepoDigests 0}}" and target == local_image:
        expression = "{{.Id}}"  # Locally built image has no registry digest.
    return real_inspect(expression, target, check)
c.run, ops.inspect = local_run, local_inspect
cfg = {"hostname": "localhost", "web_port": 18080, "app_port": 13001,
       "https": False, "image_target": local_image}
ops.setup(cfg, "smoke@example.invalid", "CI-only-test-password-1234")
assert ops.inspect("{{.HostConfig.RestartPolicy.Name}}") == "always"
ops.configure_autostart(False)
assert ops.inspect("{{.HostConfig.RestartPolicy.Name}}") == "no"
ops.configure_autostart(True)

def maintenance_login(email="smoke@example.invalid", password="CI-only-test-password-1234"):
    url = c.origin(c.config())
    try:
        urllib.request.urlopen(url + "/api/health")
        raise AssertionError("Employee API must be gated")
    except urllib.error.HTTPError as error:
        assert error.code == 503
    request = urllib.request.Request(url + "/api/auth/maintenance-login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        assert json.load(response)["user"]["role"] == "system admin"
    assert not (c.ROOT / "data/.maintenance").exists()
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    db.execute("CREATE TABLE admin_smoke_test (value TEXT)")
    db.execute("INSERT INTO admin_smoke_test VALUES ('before')")
(c.ROOT / "uploads/smoke.txt").write_text("before")
saved = ops.backup()
assert (c.ROOT / "data/.maintenance").exists()
maintenance_login()
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    db.execute("UPDATE admin_smoke_test SET value='after'")
(c.ROOT / "uploads/smoke.txt").write_text("after")
ops.restore(saved)
assert (c.ROOT / "data/.maintenance").exists()
maintenance_login()
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    assert db.execute("SELECT value FROM admin_smoke_test").fetchone()[0] == "before"
assert (c.ROOT / "uploads/smoke.txt").read_text() == "before"
cfg.update(web_port=18081, app_port=13002)
ops.configure_network(cfg)
with urllib.request.urlopen("http://localhost:18081/api/health") as response:
    assert json.load(response)["status"] == "ok"
ops.app_update()  # Unchanged image must be a no-op.
ops.check_db()
settings = ops.schedules()
settings["backup"]["enabled"] = True
ops.save_schedules(settings)
assert c.run(["systemctl", "is-enabled", "timesheet-backup.timer"], display=False).stdout.strip() == "enabled"
ops.pause("all")
ops.factory_reset()
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    assert db.execute("SELECT email,role FROM users").fetchall() == [("systemadmin@barry-wehmiller.com", "system admin")]
    for table in ("platforms", "divisions", "projects", "tasks", "timesheets", "holidays", "departments", "supporting_categories"):
        assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
assert not (c.ROOT / "uploads/smoke.txt").exists()
maintenance_login("systemadmin@barry-wehmiller.com", "systemadmin")
release.install(c.SOURCE, c.VERSION)
c.run(["/usr/local/bin/timesheet", "--version"])
c.run(["/usr/local/bin/timesheet", "status"])
print("PASS: real Ubuntu setup, reboot policy, Nginx, Docker health, backup/restore, web maintenance release, factory reset, port reconfiguration, timer pause and command installation")
