"""Navigation and terminal behavior without performing server operations."""
import io
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import unicodedata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_common as c
import admin_ui as ui
import manager


class TtyOutput(io.StringIO):
    @property
    def encoding(self): return "utf-8"

    def isatty(self): return True


class MenuTests(unittest.TestCase):
    def session(self, choices, action_error=None, columns=80, plain=True):
        output = TtyOutput()
        with tempfile.TemporaryDirectory() as temp, patch.object(c, "CONFIG", Path(temp) / "absent.json"), \
             patch.object(c, "timezone", return_value="Asia/Kolkata"), \
             patch.object(manager.host, "HostStats") as stats, \
             patch("sys.stdin.isatty", return_value=False), \
             patch.object(manager, "prompt", side_effect=choices), patch("builtins.input", return_value=""), \
             patch.object(manager, "run_menu_action", side_effect=action_error) as action, \
             patch.object(ui.shutil, "get_terminal_size", return_value=os.terminal_size((columns, 24))), \
             patch("sys.stdout", output), patch.dict(os.environ, {"TERM": "xterm-256color"}, clear=True):
            stats.return_value.snapshot.return_value = ([("CPU", "4 vCPUs | 2.1% used"),
                ("RAM", "15.6 GiB total | 3.5 GiB used | 12.1 GiB available")], "12:34:56 IST")
            manager.menu(plain)
        return output.getvalue(), action

    def test_home_is_short_and_removed_actions_cannot_run(self):
        text, action = self.session(["11", "12", "0"])
        action.assert_not_called()
        self.assertIn("[7] Advanced maintenance", text)
        self.assertIn("[H] Help and display", text)
        self.assertNotIn("Avahi", text)
        self.assertNotIn("UFW", text)
        self.assertNotIn("\033", text)
        self.assertTrue(text.isascii())

    def test_submenu_numbers_route_to_the_original_operations(self):
        for category, number, expected in (("1", "2", "3"), ("2", "3", "16"), ("3", "2", "8"),
                                            ("4", "2", "18"), ("5", "1", "1"), ("6", "3", "24"), ("7", "2", "33")):
            with self.subTest(category=category):
                _, action = self.session([category, number, "0", "0"])
                action.assert_called_once_with(expected)

    def test_help_for_restore_does_not_execute_it_and_home_returns(self):
        text, action = self.session(["2", "?4", "m", "0"])
        action.assert_not_called()
        self.assertIn("timesheet restore", text)
        self.assertIn("CAUTION: Replaces data", text)
        self.assertGreaterEqual(text.count("GCC Timesheet Linux Admin"), 2)

    def test_operation_failure_keeps_the_current_submenu(self):
        text, action = self.session(["1", "1", "0", "0"], RuntimeError("Docker unavailable"))
        action.assert_called_once_with("2")
        self.assertIn("ERROR: Docker unavailable", text)
        self.assertGreaterEqual(text.count("App control"), 2)
        self.assertIn("The menu is still available", text)
        self.assertNotIn("Action finished", text)

    def test_invalid_action_and_help_input_never_executes(self):
        _, action = self.session(["2", "?", "?99", "0x1", "¹", "q"])
        action.assert_not_called()

    def test_quit_and_eof_are_safe_inside_a_category(self):
        for choices in (["7", "q"], ["7", EOFError()]):
            _, action = self.session(choices)
            action.assert_not_called()

    def test_display_check_does_not_dispatch_an_operation(self):
        text, action = self.session(["h", "2", "q"])
        action.assert_not_called()
        self.assertIn("Terminal display check", text)
        self.assertIn("timesheet --plain", text)

    def test_terminal_modes_respect_plain_no_color_and_emoji_settings(self):
        for plain, environment, color, emoji in (
            (False, {"TERM": "xterm-256color"}, True, True),
            (True, {"TERM": "xterm-256color"}, False, False),
            (False, {"TERM": "dumb"}, False, False),
            (False, {"TERM": "xterm", "NO_COLOR": "1"}, False, True),
            (False, {"TERM": "xterm", "TIMESHEET_NO_EMOJI": "1"}, True, False),
        ):
            with self.subTest(environment=environment), patch("sys.stdout", TtyOutput()), \
                 patch.dict(os.environ, environment, clear=True):
                terminal = ui.Terminal(plain)
                self.assertEqual(terminal.color, color)
                self.assertEqual(terminal.emoji, emoji)
        with patch("sys.stdout", io.StringIO()), patch.dict(os.environ, {"TERM": "xterm"}, clear=True):
            terminal = ui.Terminal()
            self.assertFalse(terminal.color)
            self.assertFalse(terminal.emoji)

    def test_rendered_menu_and_long_examples_fit_terminal_width(self):
        choices = ["2", "?4", "m", "3", "m", "5", "m", "7", "m", "h", "2", "q"]
        for columns in (20, 32, 40, 60, 80, 120, 160):
            for plain in (False, True):
                with self.subTest(columns=columns, plain=plain):
                    text, _ = self.session(choices, columns=columns, plain=plain)
                    for line in re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text).splitlines():
                        width = sum(2 if unicodedata.east_asian_width(char) in "WF" else 1 for char in line)
                        # input()'s prompt is captured separately by the mock.
                        self.assertLessEqual(width, columns, repr(line))

    def test_stop_requires_confirmation(self):
        with patch.object(manager, "confirm", return_value=False), patch.object(manager, "execute") as execute:
            manager.run_menu_action("4")
            execute.assert_not_called()
        with patch.object(manager, "confirm", return_value=True), patch.object(manager, "execute") as execute:
            manager.run_menu_action("4")
            execute.assert_called_once_with("stop", manager.ops.stop)

    def test_factory_reset_retains_its_exact_confirmation(self):
        with patch("builtins.input", return_value="YES"), patch.object(manager, "execute") as execute, \
             patch("sys.stdout", io.StringIO()):
            manager.run_menu_action("33")
            execute.assert_not_called()

    def test_all_existing_operations_except_removed_choices_are_reachable_once(self):
        entries = [entry for group in ui.GROUPS for entry in group[3]]
        actions = [entry[1] for entry in entries]
        self.assertCountEqual(actions, [str(n) for n in range(1, 34) if n not in (11, 12)] + ["display", "funnel", "powerbi"])
        for title, _, description, example, _ in entries:
            self.assertTrue(title and description and example)

    def test_home_refresh_is_read_only(self):
        text, action = self.session(["r", "r", "0"])
        action.assert_not_called()
        self.assertEqual(text.count("4 vCPUs"), 3)
        self.assertIn("12.1 GiB available", text)

    def test_every_submenu_action_has_readable_output(self):
        def result(_):
            print("$ docker compose --project-directory /private/path ps")
            print("Result: " + "very-long-output/" * 20)
            print("WARNING: Example caution")
        for group_index, group in enumerate(ui.GROUPS):
            for entry_index, entry in enumerate(group[3], 1):
                if entry[1] == "display": continue
                category = "h" if group_index == 7 else str(group_index + 1)
                with self.subTest(action=entry[0]):
                    text, action = self.session([category, str(entry_index), "q"], action_error=result, columns=60)
                    action.assert_called_once_with(entry[1])
                    self.assertIn("Result / progress", text)
                    self.assertIn("Return to " + group[0], text)
                    self.assertNotIn("$ docker", text)
                    self.assertNotIn("Action finished", text)
                    self.assertTrue(all(len(line) <= 60 for line in text.splitlines()))

    def test_action_output_keeps_prompts_and_removes_terminal_escape_injection(self):
        output = TtyOutput()
        with patch("sys.stdout", output):
            terminal = ui.Terminal(True)
            with terminal.action_output():
                print("\x1b]52;c;badclipboard\x07Value: \x1b[31mhello\x1b[0m")
                print("Snapshot number: ", end="", flush=True)
        self.assertIn("Value: hello", output.getvalue())
        self.assertTrue(output.getvalue().endswith("Snapshot number: "))
        self.assertNotIn("\x1b", output.getvalue())
        self.assertNotIn("badclipboard", output.getvalue())

    def test_status_has_labeled_health_and_timers_without_docker_table(self):
        for state in ({"Status": "running", "Running": True, "Health": {"Status": "healthy"}}, {}):
            output = TtyOutput()
            with tempfile.TemporaryDirectory() as temp, patch.object(c, "CONFIG", Path(temp) / "admin.json"), \
                 patch.object(c, "ROOT", Path(temp)), patch.object(c, "timezone", return_value="UTC"), \
                 patch.object(manager.ops, "schedules", return_value=manager.ops.default_schedules()), \
                 patch.object(manager.ops, "inspect", side_effect=[json.dumps(state), "always"]), \
                 patch.object(manager.ops, "compose") as compose, \
                 patch.object(c, "run", return_value=subprocess.CompletedProcess([], 0,
                     "LoadState=loaded\nActiveState=inactive\nUnitFileState=disabled\nNextElapseUSecRealtime=\n", "")), \
                 patch("sys.stdout", output):
                c.CONFIG.write_text(json.dumps({"hostname": "example.test", "https": False, "web_port": 8080,
                                               "app_port": 3001, "image_target": "app:1.34.0"}))
                terminal = ui.Terminal(True)
                with terminal.action_output():
                    manager.status()
                compose.assert_not_called()
            text = output.getvalue()
            self.assertIn("Application", text)
            self.assertIn("saved: paused | timer: inactive", text)
            self.assertIn("Next run: Not scheduled", text)
            self.assertIn("health: healthy" if state else "unavailable (check Docker", text)
            self.assertNotIn("COMMAND", text)


if __name__ == "__main__": unittest.main()
