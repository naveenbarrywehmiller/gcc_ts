"""Failure-focused tests, runnable with Python's standard unittest runner."""
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
from contextlib import closing
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_ops as ops
import admin_release as release

OLD = "sha256:" + "a" * 64
NEW = "sha256:" + "b" * 64

class AdminTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / "app"
        self.root.mkdir()
        self.backups = self.base / "backups"
        self.backups.mkdir()
        self.patches = [patch.object(c, "ROOT", self.root), patch.object(c, "CONFIG", self.root / "admin.json"),
                        patch.object(c, "BACKUPS", self.backups), patch.object(c, "run"),
                        patch.object(ops, "SCHEDULES", self.base / "schedules.json"),
                        patch.object(ops, "write_nginx"), patch.object(ops, "copy_offsite")]
        for item in self.patches: item.start()
        for name in ops.DATA_DIRS: (self.root / name).mkdir()
        self.cfg = {"hostname": "server.local", "web_port": 8080, "app_port": 3001,
                    "https": False, "image_target": c.IMAGE + ":latest"}
        c.save_config(self.cfg)
        for name, value in [(".env", "SECRET=private\n"), (".image", OLD), ("compose.yaml", "services: {}")]:
            (self.root / name).write_text(value)
        (self.root / "uploads/test.txt").write_text("before")
        with closing(sqlite3.connect(self.root / "data/timesheet.db")) as db, db:
            db.execute("CREATE TABLE sample (value TEXT)")
            db.execute("INSERT INTO sample VALUES ('before')")

    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        self.temp.cleanup()

    def make_backup(self):
        with patch.object(ops, "inspect", side_effect=[OLD, c.IMAGE + "@" + OLD]):
            return ops.snapshot()

    def test_snapshot_contains_config_database_uploads_and_hash(self):
        path = self.make_backup()
        with tempfile.TemporaryDirectory(dir=self.root) as stage:
            metadata = ops.validate_archive(path, Path(stage))
            self.assertEqual(metadata["image_id"], OLD)
            self.assertEqual((Path(stage) / "uploads/test.txt").read_text(), "before")

    def test_corrupt_archive_rejected_before_stop(self):
        path = self.make_backup()
        path.write_bytes(path.read_bytes() + b"corrupt")
        with patch.object(ops, "stop") as stop:
            with self.assertRaises(ValueError): ops.restore(path)
            stop.assert_not_called()

    def test_archive_traversal_and_symlink_rejected(self):
        for name, link in [("../escaped", False), ("data/link", True)]:
            path = self.backups / "bad.tgz"
            with tarfile.open(path, "w:gz") as archive:
                entry = tarfile.TarInfo(name)
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = "/etc/passwd"
                archive.addfile(entry)
            Path(str(path) + ".sha256").write_text(c.sha256(path))
            with tempfile.TemporaryDirectory(dir=self.root) as stage:
                with self.assertRaises(ValueError): ops.validate_archive(path, Path(stage))
        self.assertFalse((self.base / "escaped").exists())

    def test_restore_replaces_database_and_uploads(self):
        path = self.make_backup()
        (self.root / "uploads/test.txt").write_text("after")
        (self.root / "uploads/new.txt").write_text("remove me")
        with closing(sqlite3.connect(self.root / "data/timesheet.db")) as db, db:
            db.execute("UPDATE sample SET value='after'")
        with patch.object(ops, "inspect", return_value=OLD), patch.object(ops, "stop"), patch.object(ops, "start"):
            ops.restore_snapshot(path)
        self.assertEqual((self.root / "uploads/test.txt").read_text(), "before")
        self.assertFalse((self.root / "uploads/new.txt").exists())
        with closing(sqlite3.connect(self.root / "data/timesheet.db")) as db, db:
            self.assertEqual(db.execute("SELECT value FROM sample").fetchone()[0], "before")

    def test_restore_failed_start_reinstates_displaced_files_and_keeps_gate(self):
        path = self.make_backup()
        (self.root / "uploads/test.txt").write_text("current")
        with patch.object(ops, "inspect", return_value=OLD), patch.object(ops, "stop"), patch.object(ops, "compose"), \
             patch.object(ops, "start", side_effect=RuntimeError("bad start")):
            with self.assertRaises(RuntimeError): ops.restore_snapshot(path)
        self.assertEqual((self.root / "uploads/test.txt").read_text(), "current")
        self.assertTrue((self.root / "maintenance.flag").exists())

    def test_failed_update_rolls_back_and_blocks_digest(self):
        snapshot = self.backups / "before.tgz"
        with patch.object(ops, "health"), patch.object(ops, "inspect", side_effect=[OLD, NEW, c.IMAGE + "@" + NEW]), \
             patch.object(ops, "stop"), patch.object(ops, "snapshot", return_value=snapshot), \
             patch.object(ops, "start", side_effect=RuntimeError("unhealthy")), patch.object(ops, "restore_snapshot") as restore:
            with self.assertRaises(RuntimeError): ops.app_update()
            restore.assert_called_once_with(snapshot)
        self.assertEqual((self.root / ".failed-image").read_text().strip(), NEW)
        with patch.object(ops, "health"), patch.object(ops, "inspect", side_effect=[OLD, NEW]), patch.object(ops, "stop") as stop:
            with self.assertRaises(RuntimeError): ops.app_update()
            stop.assert_not_called()

    def test_snapshot_failure_restarts_original_app(self):
        with patch.object(ops, "health"), patch.object(ops, "inspect", side_effect=[OLD, NEW]), \
             patch.object(ops, "stop"), patch.object(ops, "snapshot", side_effect=OSError("disk full")), \
             patch.object(ops, "start") as start, patch.object(ops, "restore_snapshot") as restore:
            with self.assertRaises(OSError): ops.app_update()
            start.assert_called_once()
            restore.assert_not_called()
        self.assertEqual((self.root / ".image").read_text(), OLD)

    def test_unchanged_image_does_not_stop(self):
        with patch.object(ops, "health"), patch.object(ops, "inspect", return_value=OLD), patch.object(ops, "stop") as stop:
            ops.app_update()
            stop.assert_not_called()

    def test_backup_preserves_stopped_state(self):
        with patch.object(ops, "running", return_value=False), patch.object(ops, "compose") as compose, \
             patch.object(ops, "snapshot", return_value=self.backups / "file.tgz"), patch.object(ops, "health") as health:
            ops.backup()
            compose.assert_called_once_with("stop", "timesheet")
            health.assert_not_called()
        self.assertTrue((self.root / "maintenance.flag").exists())

    def test_backup_failure_recovers_running_app(self):
        with patch.object(ops, "running", return_value=True), patch.object(ops, "compose") as compose, \
             patch.object(ops, "snapshot", side_effect=OSError("disk full")), patch.object(ops, "health"):
            with self.assertRaises(OSError): ops.backup()
            self.assertIn(unittest.mock.call("up", "-d", "--pull", "never", "timesheet"), compose.call_args_list)
        self.assertFalse((self.root / "maintenance.flag").exists())
        self.assertTrue((self.root / "data/.maintenance").exists())
        self.assertFalse((self.root / "data/.maintenance-operation").exists())

    def test_running_backup_keeps_web_maintenance_after_health(self):
        def health():
            self.assertTrue((self.root / "data/.maintenance-operation").exists())
            self.assertTrue((self.root / "data/.maintenance").exists())
            return {"version": "test"}
        with patch.object(ops, "running", return_value=True), patch.object(ops, "compose"), \
             patch.object(ops, "snapshot", return_value=self.backups / "file.tgz"), patch.object(ops, "health", side_effect=health):
            ops.backup()
        self.assertTrue((self.root / "data/.maintenance").exists())
        self.assertFalse((self.root / "data/.maintenance-operation").exists())
        self.assertFalse((self.root / "maintenance.flag").exists(), "browser must reach the System Admin login")

    def test_restore_old_snapshot_enforces_current_web_maintenance(self):
        path = self.make_backup()  # Old snapshot has no web maintenance marker.
        def start():
            self.assertTrue((self.root / "data/.maintenance").exists())
            self.assertTrue((self.root / "data/.maintenance-operation").exists())
        with patch.object(ops, "inspect", return_value=OLD), patch.object(ops, "stop"), \
             patch.object(ops, "start", side_effect=start):
            with ops.database_operation():
                ops.restore_snapshot(path)
        self.assertTrue((self.root / "data/.maintenance").exists())
        self.assertFalse((self.root / "data/.maintenance-operation").exists())

    def test_autostart_defaults_enabled_and_can_be_disabled_without_start(self):
        ops.write_compose(self.cfg)
        self.assertIn("restart: always", (self.root / "compose.yaml").read_text())
        with patch.object(ops, "start") as start:
            ops.configure_autostart(False)
            start.assert_not_called()
        self.assertFalse(c.config()["autostart"])
        self.assertIn('restart: "no"', (self.root / "compose.yaml").read_text())
        c.run.assert_any_call(["docker", "update", "--restart=no", "timesheet-app"])
        ops.configure_autostart(True)
        self.assertTrue(c.config()["autostart"])
        self.assertIn("restart: always", (self.root / "compose.yaml").read_text())

    def test_factory_reset_does_not_delete_when_safety_backup_fails(self):
        with patch.object(ops, "pause"), patch.object(ops, "stop"), patch.object(ops, "start"), \
             patch.object(ops, "snapshot", side_effect=OSError("disk full")), patch.object(ops, "compose") as compose:
            with self.assertRaises(OSError): ops.factory_reset()
            compose.assert_not_called()
        self.assertEqual((self.root / "uploads/test.txt").read_text(), "before")
        self.assertTrue((self.root / "data/.maintenance").exists())

    def test_database_operation_refuses_to_overlap_web_operation(self):
        marker = self.root / "data/.maintenance-operation"
        marker.write_text("web backup")
        with self.assertRaises(RuntimeError):
            with ops.database_operation():
                self.fail("must not enter")
        self.assertEqual(marker.read_text(), "web backup")
        self.assertFalse((self.root / "maintenance.flag").exists())

    def test_factory_reset_copies_backup_before_reset_and_preserves_archives(self):
        path = self.make_backup()
        events = []
        def copy(saved):
            self.assertEqual(saved, path)
            events.append("copied")
        def compose(*args):
            self.assertEqual(events, ["copied"])
            self.assertEqual(args[-2:], ("src/config/factoryReset.js", "--confirm"))
            self.assertTrue((self.root / "data/.maintenance-operation").exists())
            events.append("reset")
        with patch.object(ops, "pause"), patch.object(ops, "stop"), patch.object(ops, "start"), \
             patch.object(ops, "snapshot", return_value=path), patch.object(ops, "copy_offsite", side_effect=copy), \
             patch.object(ops, "compose", side_effect=compose):
            ops.factory_reset()
        self.assertEqual(events, ["copied", "reset"])
        self.assertFalse((self.root / "uploads/test.txt").exists())
        self.assertTrue(path.exists())
        self.assertTrue((self.root / "data/.maintenance").exists())

    def test_failed_factory_reset_restores_safety_snapshot(self):
        path = self.make_backup()
        with patch.object(ops, "pause"), patch.object(ops, "stop"), patch.object(ops, "snapshot", return_value=path), \
             patch.object(ops, "compose", side_effect=RuntimeError("reset failed")), patch.object(ops, "restore_snapshot") as restore:
            with self.assertRaises(RuntimeError): ops.factory_reset()
            restore.assert_called_once_with(path)
        self.assertEqual((self.root / "uploads/test.txt").read_text(), "before")

    def test_port_conflict_and_config_injection(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.assertFalse(c.available(listener.getsockname()[1], "127.0.0.1"))
        for value in ("bad;host", "host\nlisten 22", "host/path", "a..b"):
            with self.assertRaises(ValueError): c.hostname(value)
        self.cfg["app_port"] = self.cfg["web_port"]
        with self.assertRaises(ValueError): ops.validate_config(self.cfg)

    def test_nginx_proxy_port_https_and_forwarded_ip(self):
        self.cfg.update(web_port=8443, app_port=3101, https=True)
        text = ops.nginx_text(self.cfg)
        self.assertIn("listen 8443 ssl;", text)
        self.assertIn("proxy_pass http://127.0.0.1:3101;", text)
        self.assertIn("X-Forwarded-For $remote_addr", text)
        self.assertEqual(c.origin(self.cfg), "https://server.local:8443")

    def test_retention_keeps_newest_three(self):
        settings = ops.default_schedules()
        settings["retention_days"] = 7
        ops.SCHEDULES.write_text(json.dumps(settings))
        for index in range(5):
            path = self.backups / f"timesheet-{index}.tgz"
            path.touch()
            timestamp = time.time() - (30 + index) * 86400
            os.utime(path, (timestamp, timestamp))
        ops.prune(True)
        self.assertEqual(len(list(self.backups.glob("*.tgz"))), 3)

    def test_latest_tool_release_ignores_app_powerbi_prereleases(self):
        def row(tag, prerelease=False):
            return {"tag_name": tag, "draft": False, "prerelease": prerelease}
        rows = [row("v99.0.0"), row("powerbi-v99.0.0"), row("timesheet-admin-v1.9.0"),
                row("timesheet-admin-v1.10.0"), row("timesheet-admin-v2.0.0", True)]
        with patch.object(c, "fetch", return_value=json.dumps(rows).encode()):
            self.assertEqual(c.latest_release()["tag_name"], "timesheet-admin-v1.10.0")

    def test_release_names_accept_both_prefixes_and_reject_other_products(self):
        for prefix in (c.TAG_PREFIX, c.LEGACY_TAG_PREFIX):
            self.assertEqual(release.validate_tag(prefix + "1.10.0"), "1.10.0")
        for tag in ("v1.10.0", "gcc-timesheet-app-v1.10.0", "gcc-dashboard-powerbi-v1.10.0",
                    c.TAG_PREFIX + "../1.0.0", c.TAG_PREFIX + "1.0.0-rc1"):
            with self.assertRaises(ValueError): release.validate_tag(tag)
        rows = [{"tag_name": tag, "draft": False, "prerelease": False} for tag in
                (c.LEGACY_TAG_PREFIX + "1.9.0", c.TAG_PREFIX + "1.10.0", "gcc-timesheet-app-v99.0.0")]
        with patch.object(c, "fetch", return_value=json.dumps(rows).encode()):
            self.assertEqual(c.latest_release()["tag_name"], c.TAG_PREFIX + "1.10.0")

    def test_offsite_destination_rejects_shell_fragments(self):
        ops.validate_offsite("backup@host.example:/srv/backups/timesheet/")
        for value in ("user@host:/tmp/;id", "-bad", "user@host:relative/", "user@host:/with space/"):
            with self.assertRaises(ValueError): ops.validate_offsite(value)

    def test_pause_one_job_preserves_other_schedules(self):
        settings = ops.default_schedules()
        for name in ops.JOBS: settings[name]["enabled"] = True
        ops.SCHEDULES.write_text(json.dumps(settings))
        with patch.object(ops, "save_schedules") as save:
            ops.pause("backup")
        updated = save.call_args.args[0]
        self.assertFalse(updated["backup"]["enabled"])
        self.assertTrue(updated["update"]["enabled"])
        self.assertTrue(updated["self-update"]["enabled"])

if __name__ == "__main__": unittest.main()
