"""Reporting control boundaries: hidden keys, explicit changes, safe rollback and URLs."""
from contextlib import nullcontext
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_powerbi as powerbi
import admin_ui as ui
import manager

KEY = "test-reporting-secret-" + "a" * 44


class PowerBiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for name, value in (("ROOT", self.root), ("CONFIG", self.root / "admin.json")):
            patcher = patch.object(c, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        c.save_config({"hostname": "10.4.2.68", "https": False, "web_port": 8080, "app_port": 3001,
                       "funnel": {"enabled": True, "hostname": "gccchn-apps01.tail1329d8.ts.net", "proxy_port": 8081}})
        (self.root / ".env").write_text("PRIVATE=value\nPOWERBI_API_ENABLED=false\nPOWERBI_API_KEY=" + KEY + "\n")
        self.value = {"enabled": True, "keyConfigured": True, "key": KEY, "basePath": "/custom-reporting",
                      "maxRecords": 50000, "cacheTtl": 60}

    def capture(self, action):
        output = io.StringIO()
        with patch("sys.stdout", output): action()
        self.assertNotIn(KEY, output.getvalue())
        return output.getvalue()

    def test_status_and_guide_show_lan_public_origins_and_correct_parameters_without_keys(self):
        with patch.object(powerbi, "settings", return_value=self.value):
            text = self.capture(powerbi.status) + self.capture(powerbi.guide)
        for expected in ("http://10.4.2.68:8080/api/powerbi", "https://gccchn-apps01.tail1329d8.ts.net/api/powerbi",
                         "ApiBaseUrl = https://gccchn-apps01.tail1329d8.ts.net  ", "ApiPath = api/powerbi",
                         "Configured (hidden)", "Basic"):
            self.assertIn(expected, text)
        self.assertNotIn("ApiBaseUrl = https://gccchn-apps01.tail1329d8.ts.net/api", text)
        (self.root / "funnel.block").touch()
        self.assertIn("Public access is paused", self.capture(powerbi.addresses))

    def test_runtime_settings_never_log_docker_output(self):
        with patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.value), "")) as run:
            self.assertEqual(powerbi.settings(True)["key"], KEY)
        self.assertTrue(run.call_args.kwargs["sensitive"])
        self.assertFalse(run.call_args.kwargs["display"])
        self.assertNotIn(KEY, str(run.call_args.args))

    def test_build_versions_work_when_reporting_is_disabled_and_hide_credentials(self):
        expected = {"appVersion": "1.35.0", "apiVersion": "2.0.0", "dashboardVersion": "2.2.2", "reportingEnabled": False}
        with patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(expected), "")) as run:
            self.assertEqual(powerbi.versions(), expected)
        self.assertTrue(run.call_args.kwargs["sensitive"])
        self.assertLessEqual(run.call_args.kwargs["timeout"], 2)
        script = run.call_args.args[0][-1]
        self.assertNotIn("powerBiApiKey", script)
        self.assertNotIn("require('./src/services/powerBiService')", script)
        self.assertIn("readFileSync", script)

    def test_missing_or_failed_version_reads_never_invent_versions(self):
        for value in ({"appVersion": "unknown", "apiVersion": "2.0.0\u001b[31m", "reportingEnabled": "true"}, []):
            with patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(value), "")):
                result = powerbi.versions()
                self.assertFalse(result.get("appVersion"))
                self.assertFalse(result.get("apiVersion"))
                self.assertIsNone(result.get("reportingEnabled"))
        for error in (RuntimeError("container stopped"), subprocess.TimeoutExpired("docker", 2), ValueError("invalid JSON")):
            with patch.object(c, "run", side_effect=error):
                self.assertEqual(powerbi.versions(), {})

    def test_home_reports_running_and_selected_versions_separately_and_manual_refresh_reloads(self):
        cfg = c.config()
        cfg["image_target"] = c.IMAGE + ":1.35.0"
        c.save_config(cfg)
        values = {"appVersion": "1.34.0", "apiVersion": "2.0.0", "dashboardVersion": "2.2.2", "reportingEnabled": False}
        with patch.object(powerbi, "versions", return_value=values) as versions, patch("sys.stdout", io.StringIO()) as output, \
             patch.object(manager.host, "HostStats") as stats, patch.object(c, "timezone", return_value="UTC"), \
             patch.object(manager.ops, "schedules", return_value=manager.ops.default_schedules()), \
             patch.object(manager, "prompt", side_effect=["r", "0"]), \
             patch.object(ui.shutil, "get_terminal_size", return_value=os.terminal_size((80, 40))):
            stats.return_value.snapshot.return_value = ([], "12:34:56 UTC")
            manager.menu(True)
        self.assertEqual(versions.call_count, 2)
        self.assertIn("Timesheet app: 1.34.0 | Image: 1.35.0 (pinned)", output.getvalue())
        self.assertIn("Power BI: API 2.0.0 (OFF) | Dashboard supported: 2.2.2", output.getvalue())

    def test_repeated_home_frames_use_cached_metadata(self):
        with patch.object(powerbi, "versions", return_value={}) as versions, patch("sys.stdout", io.StringIO()), \
             patch.object(manager.host, "HostStats") as stats, patch.object(c, "timezone", return_value="UTC"), \
             patch.object(manager.ops, "schedules", return_value=manager.ops.default_schedules()), \
             patch.object(ui.Terminal, "home_choice") as choose:
            stats.return_value.snapshot.return_value = ([], "12:34:56 UTC")
            def frames(render, fallback):
                render(True)
                render(True)
                return "0"
            choose.side_effect = frames
            manager.menu(True)
        versions.assert_called_once()

    def test_authenticated_test_uses_headers_and_only_prints_version(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b'{"apiVersion":"2.0.0"}'
        with patch.object(powerbi, "settings", return_value=self.value), \
             patch.object(powerbi.urllib.request, "build_opener") as build:
            build.return_value.open.return_value = response
            text = self.capture(powerbi.check_connection)
        self.assertEqual(build.return_value.open.call_count, 2)
        for call in build.return_value.open.call_args_list:
            request = call.args[0]
            self.assertEqual(request.get_header("X-api-key"), KEY)
            self.assertNotIn(KEY, request.full_url)
        self.assertIn("Local authenticated API: PASS", text)
        self.assertIn("Public authenticated API: PASS", text)
        self.assertIsNone(powerbi.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid"))

    def test_disabled_reporting_performs_no_authenticated_requests(self):
        with patch.object(powerbi, "settings", return_value={**self.value, "enabled": False}), \
             patch.object(powerbi.urllib.request, "build_opener") as build:
            self.assertIn("DISABLED", self.capture(powerbi.check_connection))
            build.assert_not_called()

    def test_http_failure_never_displays_response_body_or_key(self):
        with patch.object(powerbi, "settings", return_value=self.value), \
             patch.object(powerbi.urllib.request, "build_opener") as build:
            build.return_value.open.side_effect = urllib.error.HTTPError("https://example.invalid", 401, KEY, {}, None)
            self.assertIn("HTTP 401", self.capture(powerbi.check_connection))

    def test_failed_change_restores_only_environment_and_preserves_business_data(self):
        original = (self.root / ".env").read_text()
        business = self.root / "business.data"
        business.write_text("latest employee work")
        with patch.object(powerbi.ops, "running", return_value=True), patch.object(powerbi.ops, "health"), \
             patch.object(powerbi.ops, "stop"), patch.object(powerbi.ops, "snapshot"), \
             patch.object(powerbi.ops, "start", side_effect=[RuntimeError("startup failed"), None]) as start, \
             patch.object(powerbi.ops, "restore_snapshot") as restore:
            with self.assertRaisesRegex(RuntimeError, "startup failed"):
                powerbi.apply({"POWERBI_API_KEY": "replacement"})
        self.assertEqual((self.root / ".env").read_text(), original)
        self.assertEqual(business.read_text(), "latest employee work")
        self.assertEqual(start.call_count, 2)
        restore.assert_not_called()

    def test_enable_generates_missing_key_but_rejects_short_existing_key(self):
        with patch.object(powerbi, "settings", return_value={**self.value, "key": ""}), \
             patch.object(powerbi, "apply") as apply, patch("sys.stdout", io.StringIO()):
            powerbi.set_enabled(True)
            self.assertEqual(apply.call_args.args[0]["POWERBI_API_ENABLED"], "true")
            self.assertEqual(len(apply.call_args.args[0]["POWERBI_API_KEY"]), 64)
        with patch.object(powerbi, "settings", return_value={**self.value, "key": "short"}), patch.object(powerbi, "apply") as apply:
            with self.assertRaisesRegex(RuntimeError, "Rotate"): powerbi.set_enabled(True)
            apply.assert_not_called()

    def test_unapplied_setting_is_rejected_and_previous_environment_restored(self):
        original = (self.root / ".env").read_text()
        with patch.object(powerbi.ops, "running", return_value=True), patch.object(powerbi.ops, "health"), \
             patch.object(powerbi.ops, "stop"), patch.object(powerbi.ops, "snapshot"), \
             patch.object(powerbi.ops, "start"), patch.object(powerbi, "settings", return_value=self.value):
            with self.assertRaisesRegex(RuntimeError, "not applied"):
                powerbi.apply({"POWERBI_API_ENABLED": "false"})
        self.assertEqual((self.root / ".env").read_text(), original)

    def test_rotation_preserves_enabled_state_and_hides_replacement(self):
        with patch.object(powerbi, "apply") as apply:
            self.capture(powerbi.rotate_key)
            self.assertEqual(list(apply.call_args.args[0]), ["POWERBI_API_KEY"])
            self.assertEqual(len(apply.call_args.args[0]["POWERBI_API_KEY"]), 64)
        with patch.object(powerbi, "settings", return_value=self.value), patch.object(powerbi, "apply") as apply:
            self.capture(lambda: powerbi.set_enabled(False))
            apply.assert_called_once_with({"POWERBI_API_ENABLED": "false"})

    def test_key_reveal_refuses_redirected_output(self):
        with patch("sys.stdin.isatty", return_value=True), patch("sys.stdout", io.StringIO()), \
             patch.object(powerbi, "settings") as settings:
            with self.assertRaisesRegex(RuntimeError, "interactive terminal"): powerbi.show_key()
            settings.assert_not_called()

    def test_sensitive_cli_actions_require_confirmation(self):
        for action in ("key", "enable", "disable", "rotate-key"):
            with self.subTest(action=action), patch.object(sys, "argv", ["timesheet", "powerbi", action]), \
                 patch.object(manager.os, "geteuid", return_value=0, create=True), patch.object(c, "init_log"), \
                 patch.object(c, "lock", return_value=nullcontext()), patch.object(powerbi, "settings") as settings, \
                 patch("sys.stderr", io.StringIO()):
                with self.assertRaises(SystemExit): manager.main()
                settings.assert_not_called()

    def test_menu_requires_confirmation_and_routes_read_only_status(self):
        with patch.object(manager, "prompt", return_value="5"), patch.object(manager, "confirm", return_value=False), \
             patch.object(manager, "execute") as execute, patch("sys.stdout", io.StringIO()):
            manager.powerbi_menu()
            execute.assert_not_called()
        with patch.object(manager, "prompt", return_value="1"), patch.object(manager, "execute") as execute, \
             patch("sys.stdout", io.StringIO()):
            manager.powerbi_menu()
            execute.assert_called_once_with("powerbi-1", powerbi.status)

    def test_home_shows_all_addresses_and_wraps_at_narrow_widths(self):
        for width in (20, 32, 40, 60, 80, 120, 160):
            with self.subTest(width=width), patch("sys.stdout", io.StringIO()) as output, \
                 patch.object(manager.host, "HostStats") as stats, patch.object(c, "timezone", return_value="Asia/Kolkata"), \
                 patch.object(manager.ops, "schedules", return_value=manager.ops.default_schedules()), \
                 patch.object(manager, "prompt", return_value="0"), \
                 patch.object(powerbi, "versions", return_value={"appVersion": "1.35.0", "apiVersion": "2.0.0", "dashboardVersion": "2.2.2", "reportingEnabled": False}), \
                 patch.object(ui.shutil, "get_terminal_size", return_value=os.terminal_size((width, 40))):
                stats.return_value.snapshot.return_value = ([], "12:34:56 IST")
                manager.menu(True)
                text = output.getvalue()
                self.assertTrue(all(len(line) < max(21, width) for line in text.splitlines()))
                compact = "".join(text.split())
                self.assertIn("LAN:http://10.4.2.68:8080", compact)
                self.assertIn("Public:https://gccchn-apps01.tail1329d8.ts.net", compact)
                self.assertIn("PowerBIAPI:https://gccchn-apps01.tail1329d8.ts.net/api/powerbi", compact)


if __name__ == "__main__": unittest.main()
