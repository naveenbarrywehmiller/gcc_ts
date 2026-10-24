"""Manage the existing read-only reporting API without exposing its credentials."""
import json
import re
import secrets
import sys
import urllib.error
import urllib.request
import admin_common as c
import admin_ops as ops

API_PATH = "/api/powerbi"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def addresses():
    cfg = c.config()
    result = [("LAN website", c.origin(cfg))]
    if cfg.get("funnel", {}).get("enabled"):
        result.append(("Public website", c.public_origin(cfg)))
    for label, origin in result:
        print(f"{label}: {origin}")
        print(f"{label.replace('website', 'Power BI API')}: {origin}{API_PATH}")
    if (c.ROOT / "funnel.block").exists() and cfg.get("funnel", {}).get("enabled"):
        print("Public access is paused; the displayed public address is saved configuration.")
    print("Example endpoint: " + c.public_origin(cfg) + API_PATH + "/version")


def settings(private=False):
    script = '''const c=require('./src/config/env');
const value={enabled:c.powerBiApiEnabled,keyConfigured:!!c.powerBiApiKey,
basePath:c.powerBiApiBasePath,maxRecords:c.powerBiMaxRecords,cacheTtl:c.powerBiCacheTtl};'''
    if private:
        script += "value.key=c.powerBiApiKey;"
    script += "console.log(JSON.stringify(value));"
    result = c.run(["docker", "exec", "-w", "/app/server", "timesheet-app", "node", "-e", script],
                   display=False, sensitive=True, timeout=15)
    return json.loads(result.stdout)


def status():
    addresses()
    value = settings()
    print("Reporting API: " + ("ENABLED" if value["enabled"] else "DISABLED"))
    print("Reporting key: " + ("Configured (hidden)" if value["keyConfigured"] else "Not configured"))
    print(f"Configured API path: {value['basePath']} | canonical path: {API_PATH}")
    print(f"Maximum records: {value['maxRecords']} | cache: {value['cacheTtl']} seconds")
    print("Read-only reporting; a dedicated key can read reporting data across the organization.")


def guide():
    addresses()
    origin = c.public_origin(c.config())
    print("GCC_Dashboard: Transform data > Edit parameters")
    print(f"  ApiBaseUrl = {origin}  (website origin, without /api/powerbi)")
    print("  ApiPath = api/powerbi")
    print("Data source settings > Edit permissions > Basic: username powerbi; password = reporting API key.")
    print("Apply credentials to the same website origin, then refresh the report.")
    print("For a simple Web query, use the full /api/powerbi/version URL to check compatibility.")
    print("Use HTTPS when sending credentials. Keep keys in Power BI's credential dialog, outside query text and URLs.")
    print("A refresh using the private LAN address needs a gateway with network access to that server.")
    print("For Power BI Service, configure its source credentials and verify refresh before scheduling it.")
    print("Report/workspace publication and refresh schedules are managed in Power BI, separately from this server menu.")
    print("Guide: https://github.com/" + c.REPO + "/blob/main/powerbi/documentation/POWERBI.md")


def check_connection():
    value = settings(True)
    cfg = c.config()
    urls = [("Local authenticated API", f"http://127.0.0.1:{cfg['app_port']}{API_PATH}/version")]
    if cfg.get("funnel", {}).get("enabled") and not (c.ROOT / "funnel.block").exists():
        urls.append(("Public authenticated API", c.public_origin(cfg) + API_PATH + "/version"))
    if not value["enabled"]:
        print("Reporting API is DISABLED. Enable it explicitly before testing authenticated refresh.")
        return
    if not value.get("key"):
        raise RuntimeError("No reporting key is configured. Enable reporting or rotate its key first.")
    for label, url in urls:
        request = urllib.request.Request(url, headers={"X-API-Key": value["key"]})
        # Never forward reporting credentials to a redirect target.
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=15) as response:
                body = response.read(65537)
                if len(body) > 65536:
                    raise ValueError("Version response is too large")
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ValueError("Unexpected version response")
                if response.status != 200 or not re.fullmatch(r"\d+\.\d+\.\d+", str(data.get("apiVersion", ""))):
                    raise ValueError("Unexpected version response")
                print(f"{label}: PASS | API version {data['apiVersion']}")
        except urllib.error.HTTPError as error:
            print(f"{label}: FAIL | HTTP {error.code}; no response body or key displayed")
            error.close()
        except (OSError, ValueError):
            print(f"{label}: FAIL | Connection, certificate or version-response check failed")


def apply(updates):
    if not ops.running():
        raise RuntimeError("Start the application before changing reporting settings.")
    ops.health(15)
    original = (c.ROOT / ".env").read_text()
    try:
        ops.stop()
        ops.snapshot()
        c.env_update(updates)
        ops.start()
        current = settings(True)
        if "POWERBI_API_ENABLED" in updates and current["enabled"] != (updates["POWERBI_API_ENABLED"] == "true"):
            raise RuntimeError("Reporting enabled/disabled setting was not applied.")
        if "POWERBI_API_KEY" in updates and current.get("key") != updates["POWERBI_API_KEY"]:
            raise RuntimeError("Reporting key change was not applied.")
    except BaseException:
        c.atomic(c.ROOT / ".env", original)
        ops.start()
        raise


def set_enabled(enabled):
    value = settings(True)
    updates = {"POWERBI_API_ENABLED": str(enabled).lower()}
    if enabled and not value.get("key"):
        updates["POWERBI_API_KEY"] = secrets.token_hex(32)
    elif enabled and len(value["key"]) < 32:
        raise RuntimeError("Rotate the short reporting key before enabling the API (minimum 32 characters).")
    apply(updates)
    print("Reporting API " + ("enabled. Use View reporting key for Power BI credentials." if enabled else "disabled."))


def rotate_key():
    apply({"POWERBI_API_KEY": secrets.token_hex(32)})
    print("Reporting key rotated. Update every Power BI data-source credential before its next refresh.")
    print("Reporting enabled/disabled state is preserved. Use View reporting key to retrieve the replacement privately.")


def show_key():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RuntimeError("Key display requires an interactive terminal; redirected output is refused.")
    value = settings(True)
    if not value.get("key"):
        raise RuntimeError("No reporting key is configured. Rotate the key to create one.")
    print("PRIVATE reporting API key (keep it out of screenshots and logs):")
    print(value["key"])
