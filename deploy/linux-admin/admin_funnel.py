"""Optional public HTTPS through Tailscale; never publish an unverified backend."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import shutil
import subprocess
import admin_common as c
import admin_ops as ops


def install():
    if shutil.which("tailscale"):
        print("Tailscale is already installed.")
        return
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    version = release.get("VERSION_ID", "").strip('"')
    codename = {"24.04": "noble", "26.04": "resolute"}.get(version)
    if release.get("ID", "").strip('"') != "ubuntu" or not codename:
        raise ValueError("Tailscale installation supports Ubuntu 24.04 and 26.04 LTS.")
    key = c.fetch(f"https://pkgs.tailscale.com/stable/ubuntu/{codename}.noarmor.gpg")
    keyring = Path("/usr/share/keyrings/tailscale-archive-keyring.gpg")
    keyring.parent.mkdir(parents=True, exist_ok=True)
    keyring.write_bytes(key)
    keyring.chmod(0o644)
    c.atomic(Path("/etc/apt/sources.list.d/gcc-timesheet-tailscale.list"),
             f"deb [signed-by={keyring}] https://pkgs.tailscale.com/stable/ubuntu {codename} main\n", 0o644)
    c.run(["apt-get", "update"])
    c.run(["apt-get", "install", "-y", "tailscale"])
    c.run(["systemctl", "enable", "--now", "tailscaled"])


def connect():
    install()
    c.run(["systemctl", "enable", "--now", "tailscaled"])
    prefs = json.loads(c.run(["tailscale", "debug", "prefs"], display=False, sensitive=True, timeout=10).stdout)
    ssh = "--ssh=" + str(bool(prefs.get("RunSSH", False))).lower()
    # Login URLs contain a device token: display them, but never log them.
    result = c.run(["tailscale", "up", "--accept-dns=false", "--accept-routes=false", ssh, "--timeout=30s"],
                   check=False, display=False, sensitive=True, timeout=40)
    print((result.stdout + result.stderr).strip())
    print("Complete the browser approval, then run timesheet funnel status.")


def state():
    if not shutil.which("tailscale"):
        raise RuntimeError("Tailscale is not installed. Choose Install / connect Tailscale first.")
    result = c.run(["tailscale", "status", "--json"], display=False, sensitive=True, timeout=10)
    data = json.loads(result.stdout)
    if data.get("BackendState") != "Running":
        raise RuntimeError("Tailscale needs login or is offline. Run timesheet funnel connect.")
    if data.get("Self", {}).get("Online") is False:
        raise RuntimeError("Tailscale is offline. Check server connectivity before publishing.")
    name = data.get("Self", {}).get("DNSName", "").rstrip(".")
    if not name or c.hostname(name) != name or not name.endswith(".ts.net") or len(name.split(".")) < 4:
        raise ValueError("Tailscale has no valid device DNS name; check MagicDNS in your tailnet.")
    routes = json.loads(c.run(["tailscale", "funnel", "status", "--json"], display=False, sensitive=True, timeout=10).stdout or "{}")
    return name, routes


def handler(routes, name):
    return routes.get("Web", {}).get(name + ":443", {}).get("Handlers", {}).get("/")


def target(port):
    return f"http://127.0.0.1:{c.port_number(port)}"


def owns_route(routes, name, port):
    handlers = routes.get("Web", {}).get(name + ":443", {}).get("Handlers", {})
    return handlers == {"/": {"Proxy": target(port)}}


def status():
    try:
        name, routes = state()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Tailscale: {error}")
        return
    cfg = c.config() if c.CONFIG.exists() else {}
    settings = cfg.get("funnel", {})
    owned = settings.get("enabled") and name == settings.get("hostname") and owns_route(routes, name, settings.get("proxy_port", 8081))
    public = routes.get("AllowFunnel", {}).get(name + ":443") is True
    blocked = (c.ROOT / "funnel.block").exists()
    print(f"Tailscale: connected\nDevice: {name}\nPublic URL: https://{name}")
    print("Timesheet Funnel: " + ("ENABLED" if owned and public and not blocked else "OFF / pending verification"))
    if blocked:
        print("Public access is paused. Verify administrator credentials, then enable Funnel again.")
    if owned:
        print(f"Local proxy: 127.0.0.1:{settings['proxy_port']}\nStartup: persistent through tailscaled")
    print("Funnel is public internet access. Timesheet still requires its normal login.")


def check_factory_password():
    script = '''const D=require("better-sqlite3");
const d=new D("/app/server/data/timesheet.db",{readonly:true,fileMustExist:true});
const rows=d.prepare("SELECT password_hash FROM users WHERE lower(email)=? AND active=1").all("systemadmin@barry-wehmiller.com");
const unsafe=rows.some(r=>require("bcryptjs").compareSync("systemadmin",r.password_hash));
d.close(); console.log(JSON.stringify({unsafe}));'''
    result = c.run(["docker", "exec", "-w", "/app/server", "timesheet-app", "node", "-e", script],
                   display=False, sensitive=True, timeout=15)
    if json.loads(result.stdout).get("unsafe") is not False:
        raise RuntimeError("The factory administrator still uses its default password. Change it in Timesheet before enabling public access.")


def apply_settings(cfg):
    """Back up before restarting; rollback settings only, never newer business data."""
    previous = c.config()
    environment = (c.ROOT / ".env").read_text()
    try:
        ops.stop()
        ops.snapshot()
        c.save_config(cfg)
        c.env_update(ops.network_environment(cfg))
        ops.write_nginx(cfg)
        ops.start()
    except BaseException:
        c.atomic(c.ROOT / ".env", environment)
        c.save_config(previous)
        ops.write_nginx(previous)
        ops.start()
        raise


def enable(port=8081):
    cfg = c.config()
    if cfg.get("funnel", {}).get("enabled"):
        ops.block_funnel("Public access is being verified.")
    if not ops.running():
        raise RuntimeError("Start the Timesheet application before enabling Funnel.")
    ops.health(15)
    check_factory_password()
    name, routes = state()
    port = c.port_number(port)
    configured = copy.deepcopy(cfg)
    configured["funnel"] = {"enabled": True, "hostname": name, "proxy_port": port}
    ops.validate_config(configured)
    current = cfg.get("funnel", {})
    already_configured = current == configured["funnel"]
    # Never replace a different Serve/Funnel website or any mounted subpaths.
    if any(config.get("TCP", {}).get("443") or handler(config, name)
           for config in routes.get("Foreground", {}).values()):
        raise RuntimeError("Tailscale port 443 already serves another target in a foreground session.")
    if routes.get("TCP", {}).get("443") or handler(routes, name):
        if not owns_route(routes, name, port):
            raise RuntimeError("Tailscale port 443 already serves another target. Preserve it or remove it manually before enabling Timesheet Funnel.")
    if not already_configured and not c.available(port, "127.0.0.1"):
        raise RuntimeError(f"Funnel loopback port {port} is occupied. Choose another --proxy-port.")
    ops.block_funnel("Funnel setup is in progress.")
    try:
        if not already_configured:
            apply_settings(configured)
        else:
            ops.write_nginx(configured)
        # If tailnet approval is needed, its link is displayed but not logged.
        try:
            result = c.run(["tailscale", "funnel", "--bg", "--https=443", "--yes", target(port)],
                           display=False, sensitive=True, timeout=45)
        except subprocess.TimeoutExpired as error:
            for value in (error.stdout, error.stderr):
                if value:
                    print(value.decode(errors="replace") if isinstance(value, bytes) else value)
            raise RuntimeError("Complete Tailscale's browser approval, then enable Funnel again.") from None
        print((result.stdout + result.stderr).strip())
        actual_name, actual = state()
        if actual_name != name or not owns_route(actual, name, port) or actual.get("AllowFunnel", {}).get(name + ":443") is not True:
            raise RuntimeError("Funnel was not enabled for the expected Timesheet proxy.")
        (c.ROOT / "funnel.block").unlink(missing_ok=True)
    except BaseException:
        ops.block_funnel("Funnel setup did not complete. Correct the error and enable again.")
        raise
    print(f"Public Timesheet: https://{name}\nLAN website: {c.origin(cfg)}")
    print("HTTPS certificates and reboot startup are managed by Tailscale. Normal Timesheet login is required.")


def disable():
    cfg = c.config()
    settings = cfg.get("funnel", {})
    if not settings.get("enabled"):
        print("Timesheet Funnel is already disabled.")
        return
    ops.block_funnel("Public access disabled by administrator.")
    try:
        name, routes = state()
        if name == settings.get("hostname") and owns_route(routes, name, settings["proxy_port"]):
            c.run(["tailscale", "funnel", "--https=443", "off"], timeout=15)
        else:
            print("Preserved other Tailscale routes. Timesheet's local public proxy is blocked.")
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Tailscale cleanup unavailable: {error}. Removing the local public proxy instead.")
    cfg["funnel"] = {**settings, "enabled": False}
    apply_settings(cfg)
    print(f"Public Timesheet disabled. LAN website: {c.origin(cfg)}")
