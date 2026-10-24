"""Terminal presentation and help text; operations stay in manager/admin_ops."""
from __future__ import annotations
import os
from contextlib import contextmanager, redirect_stdout
import io
import re
import select
import shutil
import sys
import textwrap
import time
import unicodedata

# Entries retain the existing operation IDs, independent of submenu numbering.
# title, operation, description, example, warning (if any)
GROUPS = (
    ("App control", "🚀", "Status, start, restart and reboot startup", (
        ("Status and website", "2", "Show container health, versions, website and timer states.", "timesheet status", ""),
        ("Start / apply saved settings", "3", "Start the app and apply saved environment changes.", "timesheet start", ""),
        ("Restart application", "5", "Stop and start the app, then wait for healthy startup.", "timesheet restart", "Brief downtime"),
        ("Stop application", "4", "Take the website offline until you start it again.", "timesheet stop", "Downtime"),
        ("Startup after reboot", "32", "Choose whether the app starts automatically after an OS reboot.", "timesheet autostart enable", ""),
    )),
    ("Backups and database", "💾", "Create, check, restore and manage snapshots", (
        ("Create a backup", "13", "Save a full snapshot; System Admin login reopens employee access.", "timesheet backup", "Brief downtime; web login required"),
        ("List saved backups", "14", "Show snapshot paths, sizes and database backup locations.", "timesheet backups", ""),
        ("Check database integrity", "16", "Check SQLite for corruption without changing business data.", "timesheet check-db", ""),
        ("Restore a snapshot", "15", "Choose a backup to replace current app data and settings.", "timesheet restore /var/backups/gcc-timesheet/timesheet-FILENAME.tgz --confirm", "Replaces data; confirmation required"),
        ("Retention and off-VM copies", "20", "Set how long backups are kept and an optional SSH copy destination.", "Example: 30 days; backupuser@backup.company.example:/srv/backups/gcc-timesheet/", ""),
        ("Review expired backups", "21", "Preview old snapshots before confirming deletion; keep the newest three.", "timesheet prune  (preview only)", "Deletion requires confirmation"),
    )),
    ("Application and tool updates", "📦", "Update the app or this administrator", (
        ("Update application", "6", "Pull the selected image; back up and roll back if startup fails.", "timesheet update", "Brief downtime if the image changes"),
        ("Choose application version", "8", "Pin an image tag or digest; run Update application to deploy it.", "Example image tag: 1.34.0; latest follows main-branch builds.", ""),
        ("Retry a failed app image", "7", "Retry a blocked image only after fixing its previous failure.", "timesheet update --retry", "Brief downtime if the image changes"),
        ("Check administrator release", "25", "Compare this tool with the latest stable administrator on GitHub.", "timesheet check-self-update", ""),
        ("Update administrator", "26", "Verify and install new tool scripts, then reload this menu.", "timesheet self-update", "Confirmation required"),
        ("Roll back administrator", "27", "Select the previous tool version; application data stays in place.", "timesheet self-rollback", "Confirmation required"),
    )),
    ("Automatic jobs", "⏰", "Schedules for backup, app and tool updates", (
        ("Configure schedules", "17", "Set local-time schedules and enable each automatic job independently.", "Example: *-*-* 02:00:00 = every day at 02:00 in the server timezone.", "Backup/app jobs can interrupt employee access"),
        ("Pause jobs", "18", "Pause one job or all jobs; a running operation finishes normally.", "timesheet pause backup", ""),
        ("Resume jobs", "19", "Enable one job or all jobs using their saved schedules.", "timesheet resume backup", ""),
    )),
    ("Setup and configuration", "🧰", "Install, website address and private settings", (
        ("Install / resume setup", "1", "Install on a new VM, or resume an interrupted setup safely.", "timesheet setup", "Installs system packages on a new VM"),
        ("Website address, ports and HTTPS", "9", "Change the browser address or ports; optionally supply an HTTPS certificate.", "Example: server IP, website port 8080, internal port 3001; HTTPS is optional.", "Backup and brief downtime"),
        ("Repair dependencies", "10", "Install or repair Docker, Nginx and required Ubuntu packages.", "timesheet dependencies", "Changes system packages"),
        ("Remove bootstrap credentials", "28", "Remove one-time credentials from the environment after a successful login.", "timesheet remove-bootstrap", "Keeps the created account; confirm login first"),
        ("Edit private environment", "29", "Open the protected settings file; apply saved changes with Start.", "Example: edit .env, save and exit, then App control > Start / apply saved settings.", "Advanced; never paste secrets into logs"),
        ("Tailscale Funnel (public HTTPS)", "funnel", "Connect a Tailscale account, check, enable or disable a public HTTPS link.", "timesheet funnel status", "Public internet access; uses normal Timesheet login"),
        ("Power BI reporting management", "powerbi", "Show API addresses, setup help, test access, manage reporting and its private key.", "timesheet powerbi status", "Key holders can read reporting data; changes require confirmation"),
    )),
    ("Logs and diagnostics", "🔎", "Investigate errors, disk, ports and services", (
        ("Application logs", "22", "Read the latest 200 lines from the timesheet container.", "timesheet logs", ""),
        ("Administrator logs", "23", "Read recent tool operations and error details from the private log.", "Log file: /var/log/gcc-timesheet-admin/admin.log", ""),
        ("Server diagnostics", "24", "Inspect disk space, listening ports, Docker and supporting services.", "timesheet diagnostics", ""),
    )),
    ("Advanced maintenance", "🚧", "System upgrades and destructive recovery", (
        ("Ubuntu / Docker package upgrades", "30", "Pause jobs, back up and upgrade OS packages; jobs stay paused.", "timesheet os-maintenance", "Downtime; an OS reboot may be needed"),
        ("Factory reset all application data", "33", "Take a safety backup, then remove business data and recreate the factory admin.", "timesheet factory-reset --confirm", "DELETES ALL APP DATA; type FACTORY RESET"),
    )),
    ("Help and display", "📖", "Guide, examples and terminal appearance", (
        ("Read the installed guide", "31", "Open the full local guide; press q to leave the reader.", "Guide: /usr/local/lib/gcc-timesheet-admin/current/README.md", ""),
        ("Check colors and emoji", "display", "Preview the palette and icons, plus plain-text alternatives.", "timesheet --plain  (no ANSI colors or emoji)", ""),
    )),
)


class Terminal:
    COLORS = {"title": "1;96", "accent": "96", "good": "92", "warning": "93", "error": "91", "muted": "37"}

    def __init__(self, plain=False):
        interactive = sys.stdout.isatty() and os.environ.get("TERM") != "dumb"
        self.output = sys.stdout
        self.screen = interactive and not plain
        self.color = interactive and not plain and "NO_COLOR" not in os.environ
        try:
            "📦".encode(sys.stdout.encoding or "ascii")
            unicode_ok = True
        except UnicodeEncodeError:
            unicode_ok = False
        self.emoji = interactive and unicode_ok and not plain and "TIMESHEET_NO_EMOJI" not in os.environ

    @property
    def width(self):
        return max(20, min(96, shutil.get_terminal_size((80, 24)).columns - 1))

    def style(self, text, tone):
        return f"\033[{self.COLORS[tone]}m{text}\033[0m" if self.color else text

    def line(self, text="", tone="muted", indent=""):
        text = clean(text)
        available = self.width - len(indent)
        width = max(1, available)
        # Emoji occupy two terminal cells even though Python counts one character.
        while True:
            lines = textwrap.wrap(str(text), width, break_on_hyphens=False) or [""]
            if width == 1 or all(sum(0 if unicodedata.combining(char) else
                                    2 if unicodedata.east_asian_width(char) in "WF" else 1
                                    for char in line) <= available for line in lines):
                break
            width -= 1
        for line in lines:
            print(self.style(indent + line, tone), file=self.output)

    def heading(self, title, icon=""):
        print(file=self.output)
        self.line((icon + "  " if self.emoji and icon else "") + title, "title")
        self.line("-" * (self.width - 2), "accent")

    def entry(self, key, title, description, icon="", details=True):
        self.line(f"[{key}] " + (icon + "  " if self.emoji and icon else "") + title, "accent", "  ")
        if details:
            self.line(description, indent="      ")

    def clear(self):
        if self.screen:
            self.output.write("\033[2J\033[H")
            self.output.flush()

    def section(self, title):
        self.line()
        self.line(title, "title")
        self.line("-" * (self.width - 2), "accent")

    def field(self, label, value, tone="muted"):
        self.line(f"{label}: {value}", tone, "  ")

    @contextmanager
    def action_output(self):
        stream = ActionOutput(self)
        with redirect_stdout(stream):
            try:
                yield
            finally:
                stream.flush()

    def home_choice(self, render, fallback, interval=5):
        """Refresh only the home screen, preserving input and terminal settings."""
        live = self.screen and sys.stdin.isatty() and os.name == "posix"
        if not live:
            render(False)
            return fallback()
        import termios
        import tty
        fd = sys.stdin.fileno()
        saved = termios.tcgetattr(fd)
        answer = ""
        escaping = False
        try:
            tty.setcbreak(fd)
            while True:
                # Buffer a frame first. Small windows use a scrollable snapshot.
                frame = io.StringIO()
                original = self.output
                try:
                    self.output = frame
                    render(True)
                finally:
                    self.output = original
                fits = len(frame.getvalue().splitlines()) + 1 <= shutil.get_terminal_size((80, 24)).lines
                if not fits:
                    frame = io.StringIO()
                    try:
                        self.output = frame
                        render(False)
                    finally:
                        self.output = original
                self.clear()
                self.output.write(frame.getvalue())
                self.output.write(self.style("Choose [0]: " + answer, "accent"))
                self.output.flush()
                deadline = time.monotonic() + interval
                while True:
                    ready, _, _ = select.select([fd], [], [], max(0, deadline - time.monotonic()) if fits else None)
                    if not ready:
                        break
                    char = os.read(fd, 1)
                    if not char or char == b"\x04":
                        raise EOFError
                    if char == b"\x03":
                        raise KeyboardInterrupt
                    if char == b"\x1b":
                        escaping = True
                        continue
                    if escaping:
                        if char.isalpha() or char == b"~":
                            escaping = False
                        continue
                    if char in (b"\r", b"\n"):
                        self.output.write("\n")
                        return answer.strip() or "0"
                    if char in (b"\x7f", b"\x08"):
                        answer = answer[:-1]
                    elif char == b"\x15":
                        answer = ""
                    elif char.isalnum() and len(answer) < 8:
                        answer += char.decode("ascii")
                    self.output.write("\r\033[2K" + self.style("Choose [0]: " + answer, "accent"))
                    self.output.flush()
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, saved)


    def action_help(self, entry):
        title, _, description, example, warning = entry
        self.heading(title)
        self.line(description)
        self.line(example, "accent")
        if warning:
            self.line("CAUTION: " + warning, "warning")

    def display_check(self):
        self.heading("Terminal display check", "🎨")
        for tone, text in (("title", "Headings"), ("accent", "Choices and examples"), ("good", "SUCCESS"),
                           ("warning", "CAUTION / downtime"), ("error", "ERROR")):
            self.line(text, tone)
        self.line("Icons: " + ("🚀  💾  📦  ⏰  🧰  🔎  🚧  📖" if self.emoji else "text labels (emoji disabled)"))
        self.line("Color: " + ("enabled" if self.color else "disabled"))
        self.line("Use timesheet --plain for ASCII text. NO_COLOR=1 disables colors; TIMESHEET_NO_EMOJI=1 disables icons.")
        self.line("Labels and CAUTION messages remain readable without color or icons.")


def clean(text):
    # Command output and log text must not control the terminal or its clipboard.
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", str(text))
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    return "".join(char for char in text if char.isprintable() or char == "\t").expandtabs(4)


class ActionOutput:
    """Wrap operation output as it arrives; input/editor processes stay interactive."""
    def __init__(self, terminal):
        self.terminal = terminal
        self.buffer = ""

    def __getattr__(self, name):
        return getattr(self.terminal.output, name)

    def write(self, text):
        self.buffer += text
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            if line.startswith("$ "):
                # Full commands remain in the administrator log.
                words = line[2:].split()
                label = " ".join(words[:2])
                self.terminal.section("Working: " + label)
            else:
                tone = "warning" if re.search(r"\b(warning|caution|cancelled|paused)\b", line, re.I) else "muted"
                self.terminal.line(line, tone)
        return len(text)

    def flush(self):
        if self.buffer:
            self.terminal.output.write(self.terminal.style(clean(self.buffer), "accent"))
            self.buffer = ""
        self.terminal.output.flush()
