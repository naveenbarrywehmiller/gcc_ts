"""Public ingress fails closed, preserves LAN access and never rolls back business data."""
from contextlib import nullcontext
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_funnel as funnel
import admin_ops as ops
import admin_release as release
import manager

NAME = "timesheet.example.ts.net"
TARGET = "http://127.0.0.1:8081"


def route(proxy=TARGET, public=True):
    return {"TCP": {"443": {"HTTPS": True}},
            "Web": {NAME + ":443": {"Handlers": {"/": {"Proxy": proxy}}}},
            "AllowFunnel": {NAME + ":443": public}}


class FunnelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = {"hostname": "server.local", "web_port": 8080, "app_port": 3001,
                    "https": False, "image_target": c.IMAGE + ":1.34.0"}
        for name, value in (("ROOT", self.root), ("CONFIG", self.root / "admin.json")):
            patcher = patch.object(c, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        c.save_config(self.cfg)
        (self.root / ".env").write_text("PRIVATE=value\nCOOKIE_SECURE=false\n")

    def enabled(self):
        return {**self.cfg, "funnel": {"enabled": True, "hostname": NAME, "proxy_port": 8081}}

    def test_connect_preserves_existing_ssh_setting(self):
        for enabled in (False, True):
            with self.subTest(ssh=enabled), patch.object(funnel, "install"), \
                 patch.object(c, "run", side_effect=[subprocess.CompletedProcess([], 0, "", ""),
                     subprocess.CompletedProcess([], 0, json.dumps({"RunSSH": enabled}), ""),
                     subprocess.CompletedProcess([], 0, "Connected", "")]) as run, \
                 patch("sys.stdout", io.StringIO()):
                funnel.connect()
                self.assertIn("--ssh=" + str(enabled).lower(), run.call_args.args[0])
                self.assertTrue(run.call_args.kwargs["sensitive"])
                self.assertTrue(run.call_args_list[1].kwargs["sensitive"])

    def test_https_proxy_preserves_lan_http_and_secure_public_cookies(self):
        cfg = self.enabled()
        text = ops.nginx_text(cfg)
        self.assertIn("listen 8080;", text)
        self.assertIn("listen 127.0.0.1:8081;", text)
        self.assertNotIn("listen 8081;", text)
        self.assertIn("real_ip_header X-Forwarded-For", text)
        self.assertIn("proxy_set_header X-Forwarded-Proto https;", text)
        self.assertIn("proxy_cookie_flags token secure httponly samesite=lax", text)
        self.assertIn("proxy_cookie_flags refreshToken secure httponly samesite=lax", text)
        self.assertIn("funnel.block", text)
        self.assertEqual(c.origin(cfg), "http://server.local:8080")
        self.assertEqual(c.public_origin(cfg), "https://" + NAME)
        self.assertEqual(ops.network_environment(cfg), {"COOKIE_SECURE": "false", "APP_BASE_URL": "https://" + NAME,
                         "CORS_ORIGIN": "http://server.local:8080,https://" + NAME})

    def test_invalid_public_hostname_and_colliding_ports_are_rejected(self):
        for name in (None, "elsewhere.example", "foo.ts.net", "timesheet.example.ts.net;bad", NAME + "\n"):
            cfg = self.enabled()
            cfg["funnel"]["hostname"] = name
            with self.subTest(name=name), self.assertRaises(ValueError): ops.validate_config(cfg)
        for port in (8080, 3001, 0, 65536):
            cfg = self.enabled()
            cfg["funnel"]["proxy_port"] = port
            with self.subTest(port=port), self.assertRaises(ValueError): ops.validate_config(cfg)

    def test_default_password_never_publishes_and_pauses_existing_public_access(self):
        c.save_config(self.enabled())
        with patch.object(ops, "running", return_value=True), patch.object(ops, "health"), \
             patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0, '{"unsafe":true}', "")) as run, \
             patch.object(funnel, "apply_settings") as apply:
            with self.assertRaisesRegex(RuntimeError, "default password"): funnel.enable()
        apply.assert_not_called()
        self.assertEqual(run.call_args.args[0][:2], ["docker", "exec"])
        self.assertTrue((self.root / "funnel.block").exists())

    def test_publish_requires_expected_proxy_and_actual_funnel_permission(self):
        for public in (True, False):
            with self.subTest(public=public), patch.object(ops, "running", return_value=True), \
                 patch.object(ops, "health"), patch.object(funnel, "check_factory_password"), \
                 patch.object(funnel, "state", side_effect=[(NAME, {}), (NAME, route(public=public))]), \
                 patch.object(c, "available", return_value=True), patch.object(funnel, "apply_settings") as apply, \
                 patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0, "Ready", "")), \
                 patch("sys.stdout", io.StringIO()):
                if public: funnel.enable()
                else:
                    with self.assertRaisesRegex(RuntimeError, "expected Timesheet proxy"): funnel.enable()
                apply.assert_called_once_with(self.enabled())
                self.assertEqual((self.root / "funnel.block").exists(), not public)

    def test_other_websites_and_mounts_are_never_overwritten(self):
        mounted = route()
        mounted["Web"][NAME + ":443"]["Handlers"]["/other"] = {"Text": "other app"}
        for existing in (route("http://127.0.0.1:9999"), mounted):
            with patch.object(ops, "running", return_value=True), patch.object(ops, "health"), \
                 patch.object(funnel, "check_factory_password"), patch.object(funnel, "state", return_value=(NAME, existing)), \
                 patch.object(funnel, "apply_settings") as apply, patch.object(c, "run") as run:
                with self.assertRaisesRegex(RuntimeError, "another target"): funnel.enable()
                apply.assert_not_called()
                run.assert_not_called()

    def test_failed_settings_change_restores_settings_without_restoring_data(self):
        business = self.root / "business.data"
        business.write_text("newer business data")
        original = (self.root / ".env").read_text()
        with patch.object(ops, "stop"), patch.object(ops, "snapshot"), \
             patch.object(ops, "write_nginx", side_effect=[RuntimeError("nginx failed"), None]), \
             patch.object(ops, "start") as start, patch.object(ops, "restore_snapshot") as restore:
            with self.assertRaisesRegex(RuntimeError, "nginx failed"): funnel.apply_settings(self.enabled())
        self.assertEqual(c.config(), self.cfg)
        self.assertEqual((self.root / ".env").read_text(), original)
        self.assertEqual(business.read_text(), "newer business data")
        restore.assert_not_called()
        start.assert_called_once()

    def test_disable_preserves_other_routes_and_closes_own_ingress(self):
        c.save_config(self.enabled())
        with patch.object(funnel, "state", return_value=(NAME, route("http://127.0.0.1:9999"))), \
             patch.object(funnel, "apply_settings") as apply, patch.object(c, "run") as run, \
             patch("sys.stdout", io.StringIO()):
            funnel.disable()
        run.assert_not_called()
        self.assertFalse(apply.call_args.args[0]["funnel"]["enabled"])
        self.assertTrue((self.root / "funnel.block").exists())

    def test_reset_blocks_public_ingress_before_resetting_data(self):
        c.save_config(self.enabled())
        with patch.object(ops, "pause", side_effect=RuntimeError("stop test before data mutation")):
            with self.assertRaises(RuntimeError): ops.factory_reset()
        self.assertTrue((self.root / "funnel.block").exists())

    def test_restore_blocks_public_ingress_even_when_snapshot_is_from_http_only_setup(self):
        c.save_config(self.enabled())
        def archive(path, stage):
            (stage / "admin.json").write_text(json.dumps(self.cfg))
            return {"image_id": "sha256:" + "a" * 64}
        with patch.object(ops, "validate_archive", side_effect=archive), \
             patch.object(ops, "inspect", return_value="present"), patch.object(ops, "stop", side_effect=RuntimeError("stop test")):
            with self.assertRaises(RuntimeError): ops.restore_snapshot(self.root / "test.tgz")
        self.assertTrue((self.root / "funnel.block").exists())

    def test_cli_public_changes_require_confirm(self):
        with patch.object(sys, "argv", ["timesheet", "funnel", "enable"]), patch.object(manager.os, "geteuid", return_value=0, create=True), \
             patch.object(c, "init_log"), patch.object(c, "lock", return_value=nullcontext()), patch.object(funnel, "enable") as enable, \
             patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit): manager.main()
            enable.assert_not_called()

    def test_old_administrator_rollback_requires_disabling_public_ingress(self):
        c.save_config(self.enabled())
        (self.root / "previous-version").write_text("1.2.1\n")
        with patch.object(c, "LIB", self.root), patch.object(c, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Disable Funnel before rolling back"): release.rollback()
            run.assert_not_called()

    def test_browser_approval_timeout_leaves_public_ingress_blocked(self):
        error = subprocess.TimeoutExpired("tailscale", 45, output=b"Approve at https://login.tailscale.com/f/funnel?node=example")
        with patch.object(ops, "running", return_value=True), patch.object(ops, "health"), \
             patch.object(funnel, "check_factory_password"), patch.object(funnel, "state", return_value=(NAME, {})), \
             patch.object(c, "available", return_value=True), patch.object(funnel, "apply_settings"), \
             patch.object(c, "run", side_effect=error), patch("sys.stdout", io.StringIO()) as output:
            with self.assertRaisesRegex(RuntimeError, "browser approval"): funnel.enable()
            self.assertIn("https://login.tailscale.com/", output.getvalue())
        self.assertTrue((self.root / "funnel.block").exists())


if __name__ == "__main__": unittest.main()
