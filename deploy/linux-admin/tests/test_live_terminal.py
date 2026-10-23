"""Exercise timed input and terminal restoration using a real Linux PTY."""
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import unittest


@unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux PTY")
class LiveTerminalTests(unittest.TestCase):
    def exercise(self, keys, rows=30):
        import pty
        import termios
        master, slave = pty.openpty()
        termios.tcsetwinsize(slave, (rows, 80))
        saved = termios.tcgetattr(slave)
        source = """
import sys
from admin_ui import Terminal
t = Terminal()
counter = 0
def render(live):
    global counter
    counter += 1
    t.line(f'FRAME {counter} live={live}')
try:
    answer = t.home_choice(render, lambda: input('Fallback: '), interval=.12)
    print('ANSWER=' + answer)
except (EOFError, KeyboardInterrupt):
    print('CANCELLED')
"""
        child = subprocess.Popen([sys.executable, "-c", source], stdin=slave, stdout=slave, stderr=slave,
                                 cwd=Path(__file__).resolve().parents[1], env={**os.environ, "TERM": "xterm"})
        chunks = []
        def read_for(seconds):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                if select.select([master], [], [], min(.05, max(0, until - time.monotonic())))[0]:
                    chunks.append(os.read(master, 65536))
        try:
            read_for(.35)
            os.write(master, b"h")
            read_for(.3)
            os.write(master, keys)
            child.wait(timeout=3)
            read_for(.1)
            self.assertEqual(child.returncode, 0)
            self.assertEqual(termios.tcgetattr(slave), saved)
            return b"".join(chunks).decode("utf-8", errors="replace")
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)

    def test_timed_refresh_keeps_partial_input_and_backspace(self):
        output = self.exercise(b"\x7f1\r")
        self.assertIn("FRAME 2 live=True", output)
        self.assertGreaterEqual(output.count("Choose [0]: h"), 2)
        self.assertIn("ANSWER=1", output)

    def test_eof_restores_terminal(self):
        self.assertIn("CANCELLED", self.exercise(b"\x04"))

    def test_small_window_uses_snapshot_without_repeated_scroll(self):
        output = self.exercise(b"\r", rows=1)
        self.assertIn("live=False", output)
        self.assertEqual(output.count("FRAME"), 1)
        self.assertIn("ANSWER=h", output)


if __name__ == "__main__": unittest.main()
