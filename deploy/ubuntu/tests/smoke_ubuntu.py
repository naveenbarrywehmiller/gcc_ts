"""Real Ubuntu/Docker integration check. Run ONLY on a disposable CI runner."""
import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
import sys
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_ops as ops
import admin_release as release

if os.environ.get("GITHUB_ACTIONS") != "true" or os.geteuid() != 0:
    raise SystemExit("This destructive integration test only runs as root in GitHub Actions.")
c.init_log()
cfg = {"hostname": "localhost", "web_port": 18080, "app_port": 13001,
       "https": False, "image_target": c.IMAGE + ":latest"}
ops.setup(cfg, "smoke@example.invalid", "CI-only-test-password-1234")
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    db.execute("CREATE TABLE admin_smoke_test (value TEXT)")
    db.execute("INSERT INTO admin_smoke_test VALUES ('before')")
(c.ROOT / "uploads/smoke.txt").write_text("before")
saved = ops.backup()
with closing(sqlite3.connect(c.ROOT / "data/timesheet.db")) as db, db:
    db.execute("UPDATE admin_smoke_test SET value='after'")
(c.ROOT / "uploads/smoke.txt").write_text("after")
ops.restore(saved)
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
release.install(c.SOURCE, c.VERSION)
c.run(["/usr/local/bin/timesheet", "--version"])
c.run(["/usr/local/bin/timesheet", "status"])
print("PASS: real Ubuntu setup, Nginx, Docker health, backup/restore, port reconfiguration, timer pause and command installation")
