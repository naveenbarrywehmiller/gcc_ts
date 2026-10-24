# GCC Timesheet Linux Admin v1.4.1

- Add the running Timesheet build, selected Docker tag/digest, Power BI API build and reporting state, and supported dashboard version to Home. The installed Linux Admin version remains in the heading.
- Read deployed metadata without opening SQLite or enabling reporting. Show Unavailable when the app is stopped or metadata cannot be read; do not substitute the selected tag for the running version.
- Cache version metadata for 30 seconds, with immediate refresh on R and after a menu action. Preserve five-second resource updates, narrow-terminal wrapping and plain/color modes.

Install using the [v1.4.1 installer and downloads](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-timesheet-linux-admin-v1.4.1). Existing installations can use **Application and tool updates > Update administrator** or `timesheet self-update`. Installing this administrator preserves the current application image, data and reporting state.

Validation: all 77 unit tests passed on Ubuntu 26.04.1 LTS. The installed color/emoji home screen and R refresh displayed the real app/API/supported-dashboard versions; the app build matched live health. Configuration hashes, container ID/start time/image and the existing reporting state were unchanged. See the [version display validation](https://github.com/naveenbarrywehmiller/gcc_ts/blob/gcc-timesheet-linux-admin-v1.4.1/deploy/linux-admin/VERSION_DISPLAY_VALIDATION.md) for evidence and display limits. The tagged-release workflow runs the full disposable-Ubuntu menu/deployment smoke test before publishing assets.

## Previous release: v1.4.0

- Show separate LAN website/port, public Funnel website and full Power BI API address on the live home screen.
- Add Power BI management under Setup and configuration: actual running status, LAN/public API addresses, dashboard connection instructions, authenticated connection checks, private key display, enable/disable and API-key rotation.
- Keep credentials out of status, connection-test output, command arguments and administrator logs. Require confirmation for private key display or changes; refuse redirected key display and credential-bearing redirects.
- Back up before reporting changes, restart briefly, verify applied settings and restore only the previous environment on failure. Key rotation preserves reporting's enabled/disabled state.
- Preserve the seven-category home screen, existing Tailscale SSH preference, Funnel configuration, application image and data. Reporting is not automatically enabled by installation.

Install using the [v1.4.0 installer and downloads](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-timesheet-linux-admin-v1.4.0). Existing installations can use **Application and tool updates > Update administrator** or `timesheet self-update`. Installing this administrator preserves the current application image, data and reporting state.

Validation: all 73 administrator tests passed, with real disposable-Ubuntu integration checks for every category's help, installed service controls, reporting enable/disable/key rotation, backup/selected restore/factory reset, expired archive deletion, timers, tool rollback, HTTP/HTTPS, dependency repair, pinned-key SSH copying and OS package maintenance. Application regression checks also passed: 168 tests plus 55 reporting API checks. The company server's real backup was verified and maintenance released through Chrome System Admin login; LAN and public HTTPS login/health passed. Production reporting stayed disabled, its key was not revealed or rotated, and production data was not restored or deleted. See the [full menu test report](https://github.com/naveenbarrywehmiller/gcc_ts/blob/gcc-timesheet-linux-admin-v1.4.0/deploy/linux-admin/FULL_MENU_TEST_REPORT.md) for per-action evidence and remaining external-account/reboot limits.

## Previous release: v1.3.0

- Add optional Tailscale Funnel controls under Setup and configuration, plus `timesheet funnel status|install|connect|enable|disable`.
- Connect a new tailnet using browser approval without logging device login tokens. Install Tailscale from its signed stable Ubuntu repository only when absent.
- Preserve the existing Tailscale SSH setting when reconnecting through the menu; SSH remains a separate server setting.
- Provide public HTTPS through a dedicated Nginx loopback proxy with Secure authentication cookies, trusted client IPs and exact LAN/public CORS origins. Keep the LAN HTTP website available.
- Back up before applying app settings, reject the known factory password and conflicting Tailscale routes, and leave ingress blocked when setup or cleanup fails.
- Pause public ingress after backup restore or factory reset; require rechecking credentials and enabling Funnel again. Require disabling Funnel before administrator rollback to a version without these protections.

Existing panel features from v1.2.1 are retained below.

- Add a read-only live home dashboard for CPU, RAM, swap, disks, filesystem usage, OS, virtualization and IP addresses. Refresh every five seconds on suitable terminals; preserve typed selections and support manual refresh in small/plain terminals.
- Give submenu results fresh screens, wrapped output, readable status/timer sections, clearer backup listings and organized diagnostics. Keep command details in the log and destructive confirmations in place.
- Replace the 33-option home menu with seven focused categories plus Help, using submenu-local numbering, Back/Home/Exit navigation and a compact saved-settings summary.
- Add color, optional emoji, descriptions and examples for every action. `?number` explains an action without running it; Help includes a display check. `timesheet --plain`, `NO_COLOR` and `TIMESHEET_NO_EMOJI` support simpler terminals.
- Remove Avahi repair and UFW-rule actions from the interactive panel. Existing CLI commands and setup behavior remain compatible.
- Keep operation locking, safety backups and destructive confirmations; add confirmation before stopping the app. Return to the current category after an action, cancellation or ordinary error.
- Wrap terminal content and long examples for narrow SSH windows. Add the presentation module to installation validation, release bundles and the generated source reference.

Build this source with `python3 deploy/linux-admin/build_release.py`, extract its bundle and run `sudo python3 manager.py install-bundle gcc-timesheet-linux-admin-v1.3.0`. App data, container image, website settings, schedules and backups are preserved by an administrator-only installation. Enabling/disabling Funnel separately applies the public network settings with a safety snapshot and brief app restart.

Validation: all 60 unit tests passed on Ubuntu 26.04.1 LTS, including the 13 new Funnel tests and the existing Linux terminal refresh/input checks. Installed-server checks verified the public URL with normal DNS and certificate verification, public/LAN health, unauthenticated access rejection, Secure public authentication cookies, exact CORS origins, trusted client IPs and persistent mapping after a Tailscale service restart. See [Funnel validation](https://github.com/naveenbarrywehmiller/gcc_ts/blob/gcc-timesheet-linux-admin-v1.3.0/deploy/linux-admin/FUNNEL_VALIDATION.md) for evidence and limits. The v1.2.1 baseline also includes 22 read-only installed-panel sessions covering every category and action's help.

The existing release workflow continues to run syntax/unit/reference checks and the disposable Ubuntu deployment smoke test before publishing tagged releases.
