# Linux Admin v1.3.0 Funnel validation

Validated October 23, 2026 (America/Los_Angeles) on the company Ubuntu 26.04.1 LTS VM, Python 3.14.4 and Tailscale 1.104.2, using the v1.3.0 source before publication. The installed application remains v1.34.0; no application frontend, API source or container image was changed.

## Automated checks

- All **60 unit tests passed** on Ubuntu, including 13 new Funnel tests and the 47 existing operation, panel, system-metric and Linux terminal tests. The reconnect test checks both enabled and disabled SSH preferences.
- Funnel tests cover loopback binding, HTTPS cookie flags, LAN/public origins, hostname/port validation, factory-password rejection, exact route ownership, conflicting websites/mounts, rollback without restoring business data, preserving other routes on disable, restore/reset public-access blocks, confirmation requirements, older-tool rollback protection and browser-approval timeout handling.
- Bash syntax, Python compilation, generated script-reference consistency, repository validation and focused whitespace checks passed. The local code map was rebuilt after the source changes.

## Installed-server checks

- Installed the local v1.3.0 bundle, retaining v1.2.1 for rollback. Took a safety snapshot before applying public application settings. The app briefly restarted to apply the new base URL and CORS origins.
- Confirmed the known factory administrator password no longer matches using a read-only password-hash comparison. The replacement password was not requested or recorded.
- The dedicated Nginx listener binds to loopback port 8081 and proxies to the existing loopback app port 3001. The LAN HTTP listener remains on port 8080.
- Verified both public authentication cookies carry Secure, HttpOnly and SameSite=Lax flags. LAN HTTP retains its existing cookie behavior.
- Verified the exact public CORS origin is accepted, an untrusted origin has no access-control allowance, and a forged forwarded client IP does not replace the actual client IP in Nginx logs.
- Restarted the Tailscale service and confirmed its background Funnel mapping resumed after startup. Application startup and Tailscale service startup are enabled.
- Public DNS initially had no address despite successful HTTPS relay tests. The record later appeared; no account-policy edit was performed by this workflow. After clearing the Windows failed-lookup cache, the ordinary public hostname worked without a DNS override.
- Final checks at **2026-10-24 04:34 UTC** used the normal public hostname and normal certificate verification: login page HTTP 200, live health HTTP 200 with app v1.34.0, and anonymous protected endpoint HTTP 401. LAN live health also returned HTTP 200.

## Coverage limits

The user's private replacement password was not used, so an authenticated public login/save/approval session was not performed. No full OS reboot or destructive restore/reset was run on the company server; restore/reset safeguards were tested with temporary data and mocks. Tagged-release publication separately requires the GitHub workflow's full Ubuntu deployment smoke test. The existing [panel validation](PANEL_VALIDATION.md) records the separate v1.2.1 presentation checks.
