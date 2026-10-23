"""Read-only Linux host measurements for the administrator home screen."""
from __future__ import annotations
from datetime import datetime
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess


def read(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def command(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=2,
                                env={**os.environ, "LC_ALL": "C"})
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def gib(size):
    return f"{size / 1024**3:.1f} GiB"


def cpu_counters():
    try:
        fields = read("/proc/stat").splitlines()[0].split()
        if fields[0] != "cpu" or len(fields) < 5:
            return None
        # Guest time is already included in user/nice; do not count it twice.
        values = list(map(int, fields[1:9]))
        return sum(values), values[3] + (values[4] if len(values) > 4 else 0)
    except (ValueError, IndexError):
        return None


class HostStats:
    def __init__(self):
        self.previous_cpu = cpu_counters()
        self.static = self.hardware()

    def hardware(self):
        try:
            cpu = {item["field"].rstrip(":"): item["data"]
                   for item in json.loads(command("lscpu", "-J") or "{}").get("lscpu", [])}
        except (ValueError, TypeError, KeyError):
            cpu = {}
        count = cpu.get("CPU(s)", str(os.cpu_count() or "unknown"))
        topology = f"{count} vCPUs"
        try:
            cores = int(cpu["Core(s) per socket"]) * int(cpu["Socket(s)"])
            topology += f" ({cores} cores x {cpu['Thread(s) per core']} threads)"
        except (KeyError, ValueError, TypeError):
            pass
        processor = cpu.get("Model name", platform.machine() or "Unavailable")
        try:
            processor += f" | max {float(cpu['CPU max MHz']) / 1000:.2f} GHz"
        except (KeyError, ValueError, TypeError):
            pass
        release = dict(line.split("=", 1) for line in read("/etc/os-release").splitlines() if "=" in line)
        system = release.get("PRETTY_NAME", platform.system()).strip('"')
        system += " | " + (platform.machine() or "unknown architecture")
        virtual = command("systemd-detect-virt") or "Not detected"
        virtual = {"microsoft": "Microsoft Hyper-V", "kvm": "KVM", "vmware": "VMware",
                   "none": "Physical machine"}.get(virtual, virtual)
        disks = []
        for line in command("lsblk", "-bdn", "-o", "SIZE,TYPE").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1] == "disk":
                try:
                    disks.append(int(parts[0]))
                except ValueError:
                    pass
        storage = f"{gib(sum(disks))} total ({len(disks)} disk{'s' if len(disks) != 1 else ''})" if disks else "Unavailable"
        return topology, processor, system, virtual, storage

    def snapshot(self):
        current = cpu_counters()
        usage = "sampling..."
        if current is None:
            usage = "unavailable"
        elif self.previous_cpu:
            total = current[0] - self.previous_cpu[0]
            idle = current[1] - self.previous_cpu[1]
            if total > 0 and idle >= 0:
                usage = f"{max(0, min(100, 100 * (total - idle) / total)):.1f}% used"
        self.previous_cpu = current
        memory = {}
        for line in read("/proc/meminfo").splitlines():
            key, _, value = line.partition(":")
            try:
                memory[key] = int(value.split()[0]) * 1024
            except (ValueError, IndexError):
                pass
        ram = swap = "Unavailable"
        if memory.get("MemTotal") and "MemAvailable" in memory:
            total, available = memory["MemTotal"], memory["MemAvailable"]
            ram = f"{gib(total)} total | {gib(max(0, total - available))} used | {gib(available)} available"
        if "SwapTotal" in memory and "SwapFree" in memory:
            swap = f"{gib(memory['SwapTotal'])} total | {gib(max(0, memory['SwapTotal'] - memory['SwapFree']))} used"
        try:
            disk = shutil.disk_usage("/")
            root = f"{gib(disk.total)} total | {gib(disk.used)} used | {gib(disk.free)} available"
        except OSError:
            root = "Unavailable"
        address = "Unavailable"
        try:
            routes = json.loads(command("ip", "-j", "route", "show", "default") or "[]")
            device = next(route["dev"] for route in routes if "dev" in route)
            interfaces = json.loads(command("ip", "-j", "addr", "show", "dev", device, "scope", "global") or "[]")
            addresses = [item["local"] for interface in interfaces for item in interface.get("addr_info", [])
                         if item.get("family") in ("inet", "inet6") and item.get("local")]
            address = ", ".join(addresses) or "Unavailable"
        except (ValueError, KeyError, TypeError, StopIteration):
            pass
        topology, processor, system, virtual, storage = self.static
        return [("CPU", f"{topology} | {usage}"), ("Processor", processor), ("RAM", ram),
                ("Swap", swap), ("Storage", storage), ("Root /", root), ("OS", system),
                ("Host type", virtual), ("IP address", address)], datetime.now().astimezone().strftime("%H:%M:%S %Z")
