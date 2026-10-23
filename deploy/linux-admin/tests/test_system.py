"""Host metrics use kernel counters, with honest unavailable states."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from collections import namedtuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admin_system as host


class SystemTests(unittest.TestCase):
    def test_cpu_does_not_double_count_guest_time(self):
        with patch.object(host, "read", return_value="cpu 100 20 30 400 10 5 5 30 60 10\n"):
            self.assertEqual(host.cpu_counters(), (600, 410))
        for content in ("", "cpu broken", "intr 1 2 3 4 5"):
            with patch.object(host, "read", return_value=content):
                self.assertIsNone(host.cpu_counters())

    def test_metrics_use_available_memory_and_default_route_not_docker(self):
        def command(*args):
            if args[:2] == ("lscpu", "-J"):
                return json.dumps({"lscpu": [{"field": key + ":", "data": value} for key, value in {
                    "CPU(s)": "4", "Core(s) per socket": "2", "Socket(s)": "1", "Thread(s) per core": "2",
                    "Model name": "Test processor", "CPU max MHz": "2000"}.items()]})
            if args[0] == "systemd-detect-virt": return "microsoft"
            if args[0] == "lsblk": return f"{50 * 1024**3} disk\n{1024**3} loop\n{30 * 1024**3} part"
            if args[2] == "route": return '[{"dev":"eth0"}]'
            return '[{"addr_info":[{"family":"inet","local":"192.0.2.68"}]}]'
        files = {"/etc/os-release": 'PRETTY_NAME="Ubuntu test"',
                 "/proc/meminfo": "MemTotal: 16777216 kB\nMemAvailable: 12582912 kB\nMemFree: 1 kB\nSwapTotal: 4194304 kB\nSwapFree: 3145728 kB\n"}
        disk = namedtuple("usage", "total used free")(48 * 1024**3, 15 * 1024**3, 32 * 1024**3)
        with patch.object(host, "command", side_effect=command), patch.object(host, "read", side_effect=lambda path: files.get(path, "")), \
             patch.object(host, "cpu_counters", side_effect=[(100, 50), (200, 130)]), \
             patch.object(host.shutil, "disk_usage", return_value=disk):
            values = dict(host.HostStats().snapshot()[0])
        self.assertIn("2 cores x 2 threads", values["CPU"])
        self.assertIn("20.0% used", values["CPU"])
        self.assertIn("4.0 GiB used | 12.0 GiB available", values["RAM"])
        self.assertEqual(values["Swap"], "4.0 GiB total | 1.0 GiB used")
        self.assertEqual(values["Storage"], "50.0 GiB total (1 disk)")
        self.assertIn("32.0 GiB available", values["Root /"])
        self.assertEqual(values["Host type"], "Microsoft Hyper-V")
        self.assertEqual(values["IP address"], "192.0.2.68")

    def test_missing_metrics_do_not_prevent_opening_the_menu(self):
        with patch.object(host, "command", return_value=""), patch.object(host, "read", return_value=""), \
             patch.object(host.shutil, "disk_usage", side_effect=OSError):
            values = dict(host.HostStats().snapshot()[0])
        for name in ("RAM", "Swap", "Storage", "Root /", "IP address"):
            self.assertEqual(values[name], "Unavailable")
        self.assertIn("unavailable", values["CPU"])

    def test_reset_or_unchanged_cpu_counter_is_not_a_fake_zero(self):
        with patch.object(host.HostStats, "hardware", return_value=("4 vCPUs", "CPU", "OS", "VM", "50 GiB")), \
             patch.object(host, "command", return_value=""), patch.object(host, "read", return_value=""), \
             patch.object(host, "cpu_counters", side_effect=[(100, 50), (100, 50), (90, 40)]):
            stats = host.HostStats()
            self.assertIn("sampling", dict(stats.snapshot()[0])["CPU"])
            self.assertIn("sampling", dict(stats.snapshot()[0])["CPU"])


if __name__ == "__main__": unittest.main()
