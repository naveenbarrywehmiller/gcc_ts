"""Remaining system/integration actions on the disposable CI host only."""
import io
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.request
from contextlib import redirect_stdout

import admin_common as c
import admin_ops as ops
import admin_funnel as funnel


def offsite_copy(saved):
    """Use a pinned host key and disposable loopback SSH receiver, never a company host."""
    if not shutil.which("sshd"):
        c.run(["apt-get", "install", "-y", "openssh-server"])
    with tempfile.TemporaryDirectory(prefix="gcc-offsite-ci-") as temporary:
        root = Path(temporary)
        for name in ("identity", "host"):
            c.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", root / name], display=False)
        (root / "copy").mkdir()
        Path("/run/sshd").mkdir(exist_ok=True)
        c.atomic(root / "sshd.conf", f"Port 12222\nListenAddress 127.0.0.1\nHostKey {root}/host\n"
                 f"PidFile {root}/sshd.pid\nAuthorizedKeysFile {root}/identity.pub\n"
                 "PermitRootLogin prohibit-password\nPasswordAuthentication no\nUsePAM no\n")
        c.atomic(root / "known_hosts", "[127.0.0.1]:12222 " + (root / "host.pub").read_text())
        ssh_config = Path("/root/.ssh/config")
        original = ssh_config.read_text() if ssh_config.exists() else None
        c.atomic(ssh_config, f"Host gcc-menu-backup\n HostName 127.0.0.1\n Port 12222\n"
                 f" IdentityFile {root}/identity\n UserKnownHostsFile {root}/known_hosts\n IdentitiesOnly yes\n\n" + (original or ""))
        daemon = subprocess.Popen([shutil.which("sshd"), "-D", "-e", "-f", str(root / "sshd.conf")],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        settings = ops.schedules()
        previous = settings["offsite"]
        try:
            for _ in range(50):
                try:
                    with socket.create_connection(("127.0.0.1", 12222), .1): break
                except OSError:
                    if daemon.poll() is not None: raise AssertionError("Disposable SSH receiver failed")
                    time.sleep(.1)
            settings["offsite"] = f"root@gcc-menu-backup:{root}/copy/"
            ops.save_schedules(settings)
            ops.copy_offsite(saved)
            assert c.sha256(root / "copy" / saved.name) == c.sha256(saved)
            assert (root / "copy" / (saved.name + ".sha256")).read_bytes() == Path(str(saved) + ".sha256").read_bytes()
        finally:
            settings["offsite"] = previous
            ops.save_schedules(settings)
            daemon.terminate()
            daemon.wait(timeout=10)
            if original is None: ssh_config.unlink()
            else: c.atomic(ssh_config, original)
    print("PASS real offsite rsync/SSH copy with pinned host key and matching archive/checksum")


def run(action, maintenance_login, saved):
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.geteuid() != 0:
        raise RuntimeError("System smoke tests require the disposable root GitHub runner.")
    action("4", 1, [("backup schedule", "*-*-* 23:55:00"), ("Enable automatic backup?", "n"),
                     ("update schedule", "*-*-* 23:56:00"), ("Enable automatic update?", "n"),
                     ("self-update schedule", "Sun *-*-* 23:57:00"), ("Enable automatic self-update?", "n"),
                     ("Type YES to continue:", "YES")])
    action("2", 5, [("Local retention days", "7"), ("Prune expired backups", "n"), ("Destination user@host", "-")])
    assert ops.schedules()["retention_days"] == 7
    assert not ops.schedules()["offsite"]
    print("PASS actual configure-schedules and retention/offsite-settings menu actions")
    action("5", 3, timeout=300)
    print("PASS actual dependency repair on Ubuntu with existing Docker preserved")
    with tempfile.TemporaryDirectory(prefix="gcc-tls-ci-") as temporary:
        cert, key = Path(temporary) / "cert.pem", Path(temporary) / "key.pem"
        c.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
               "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
               "-keyout", key, "-out", cert], display=False, sensitive=True)
        original = c.config()
        ops.configure_network({**original, "https": True, "web_port": 18443}, cert, key)
        with urllib.request.urlopen("https://localhost:18443/api/health/live", context=ssl.create_default_context(cafile=str(cert))) as response:
            assert response.status == 200
        ops.configure_network(original)
    print("PASS real HTTP/HTTPS configuration and certificate validation using an explicitly trusted test certificate")
    offsite_copy(saved)
    funnel.install()
    with redirect_stdout(io.StringIO()):
        funnel.connect()  # Needs browser login; its one-time URL must not enter CI logs.
        funnel.status()
        funnel.disable()
    try:
        funnel.state()
        raise AssertionError("Unapproved CI device must not join the company tailnet")
    except RuntimeError as error:
        assert "login" in str(error) or "offline" in str(error)
    try:
        funnel.enable()
        raise AssertionError("Factory password must not enable public sharing")
    except RuntimeError as error:
        assert "default password" in str(error)
    print("PASS real signed Tailscale install/connect pending browser approval, status, disabled no-op and unsafe-enable rejection")
    os.environ["DEBIAN_FRONTEND"] = "noninteractive"
    os.environ["NEEDRESTART_MODE"] = "a"
    action("7", 1, [("Type YES to continue:", "YES")], timeout=900)
    maintenance_login("systemadmin@barry-wehmiller.com", "systemadmin")
    assert all(not ops.schedules()[job]["enabled"] for job in ops.JOBS)
    ops.health()
    print("PASS actual OS/Docker package-maintenance menu action, safety backup, paused timers and administrator reopening")
