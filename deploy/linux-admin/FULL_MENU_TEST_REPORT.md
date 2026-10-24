# Linux Admin v1.4.0 full menu test report

Test date: October 23, 2026 (America/Los_Angeles). Source is on `codex/linux-admin-full-menu-tests`; v1.4.0 is not a published release. Live company-server checks used Ubuntu 26.04.1 and the installed v1.4.0 tool with application v1.34.0. Destructive integration tests ran on disposable GitHub-hosted Ubuntu 24.04 runners, with synthetic users/data and an application image built from the tested source.

## Evidence

- [Core menu integration run](https://github.com/naveenbarrywehmiller/gcc_ts/actions/runs/40065352307): passed all 73 unit tests and the full original deployment smoke test, then actual installed-menu backup, restore, reset, deletion, service, timer and reporting checks.
- [Expanded system integration run](https://github.com/naveenbarrywehmiller/gcc_ts/actions/runs/40066024572): **passed**, testing commit `25ace1b`. Includes all core menu checks plus actual dependency repair, HTTP/HTTPS configuration, offsite SSH/rsync copying, signed Tailscale installation/pending login and OS package maintenance. The release-publication job was intentionally skipped because this is a test branch.
- Every one of the **34 category actions** was opened through its `?number` help in the installed Ubuntu terminal menu. Unit tests also check dispatch, examples, ordinary failure recovery, confirmations and narrow-terminal presentation.
- The existing application regression command also passed locally: **168 tests, zero failures/skips**, plus **55 reporting API checks, zero failures**. These include isolated database backup/restore/factory-reset tests, authenticated Basic/header access, read-only enforcement, filter validation and credential/data sanitization. No live company database was used by those tests.
- Private key display was exercised only inside a disposable pseudo-terminal. Its output stayed in memory; it was not saved to artifacts or printed to CI logs. Company credentials were used only for authorized SSH/browser login and were not written into test source.

## Per-action coverage

`CI real` means the operation used real Docker, Nginx, SQLite, systemd or the installed terminal menu on the disposable runner. Failure simulations use temporary files/mocks and are reported separately.

| Menu | Action | Evidence |
|---|---|---|
| 1 > 1 | Status and website | Live status/health; CI real menu |
| 1 > 2 | Start / apply settings | CI real menu start and health |
| 1 > 3 | Restart | CI real menu restart and health |
| 1 > 4 | Stop | CI real menu confirmation and stopped-container assertion |
| 1 > 5 | Startup after reboot | CI real menu toggles Docker restart policy `no` / `always`; no full OS reboot |
| 2 > 1 | Create backup | Live backup verified; CI real menu backup and maintenance login |
| 2 > 2 | List backups | Live listing; CI real menu |
| 2 > 3 | Database integrity | Live and CI integrity checks |
| 2 > 4 | Restore selected snapshot | CI real menu replaces changed fixture files/data; maintenance login verified |
| 2 > 5 | Retention / off-VM copies | Passed CI settings menu and real pinned-host-key SSH/rsync receiver with matching archive/checksum |
| 2 > 6 | Expired backup deletion | CI preview preserves files; confirmed deletion removes six expired archives/checksums and keeps newest three |
| 3 > 1 | Update application | CI unchanged-image operation; unit tests cover failed-update rollback and blocked digest |
| 3 > 2 | Choose image version | Passed installed-menu selection; validation tests reject invalid repositories/tags |
| 3 > 3 | Retry failed image | CI retry flag on unchanged image; failure/digest/recovery paths use unit simulations |
| 3 > 4 | Check tool release | CI real GitHub release lookup |
| 3 > 5 | Update tool | Passed installed-menu no-newer-release check/reload; no v1.4.0 release exists to download |
| 3 > 6 | Roll back tool | Passed versioned install and actual rollback menu/reload; application container unchanged |
| 4 > 1 | Configure schedules | Passed actual configuration prompts, timer creation and calendar validation |
| 4 > 2 | Pause jobs | CI real pause and saved preference assertion |
| 4 > 3 | Resume jobs | CI real resume and saved preference assertion |
| 5 > 1 | Install / resume setup | Original CI smoke executes real fresh installation and pending-setup completion |
| 5 > 2 | Website / ports / HTTPS | Passed HTTP port changes and real TLS with an explicitly trusted test certificate |
| 5 > 3 | Repair dependencies | Passed installation and actual repair menu action |
| 5 > 4 | Remove bootstrap credentials | CI real menu; private environment checked for removal |
| 5 > 5 | Edit private environment | Installed menu launches/exits its editor using `EDITOR=true`; no production secret editing |
| 5 > 6 | Tailscale Funnel | Nested checks below |
| 5 > 7 | Power BI management | All seven nested actions passed on real disposable deployment |
| 6 > 1 | App logs | CI installed menu retrieves Docker logs |
| 6 > 2 | Tool logs | CI installed menu retrieves operation logs |
| 6 > 3 | Diagnostics | Live diagnostics; CI installed menu |
| 7 > 1 | OS / Docker upgrades | Passed actual package maintenance, backup, paused timers and maintenance login; never executed on company server |
| 7 > 2 | Factory reset all data | CI real menu deletes a synthetic employee/upload, retains only factory System Admin and preserves backup archives; original smoke checks business tables empty |
| H > 1 | Installed guide | CI opens the real pager and exits with q |
| H > 2 | Colors / emoji | CI installed display check plus color/plain/emoji/width and Linux pseudo-terminal tests |

## Nested integrations

| Submenu | Action | Evidence |
|---|---|---|
| Power BI > 1 | Status / addresses | Live and CI; actual running settings, key hidden |
| Power BI > 2 | Setup guide | Live CLI and CI menu; base origin/API path distinguished |
| Power BI > 3 | Connection test | Live disabled-state response; CI authenticated `/version` passes after enable |
| Power BI > 4 | Private key display | CI interactive terminal and confirmation; output never logged; redirect refusal unit test |
| Power BI > 5 | Enable | CI real restart and authenticated reporting |
| Power BI > 6 | Disable | CI real restart and disabled state |
| Power BI > 7 | Rotate key | CI new key works, old key returns 401, enabled state preserved |
| Funnel > 1 | Status | Live connected/public mapping; CI offline/pending-login state |
| Funnel > 2 | Install / connect | Passed real signed-package installation and pending browser login; existing company account remains connected |
| Funnel > 3 | Enable public HTTPS | Existing live route, HTTPS login and session refresh verified; unit tests cover successful route verification, conflicts, timeout and failure gates; CI rejects factory-password publishing |
| Funnel > 4 | Disable public HTTPS | Passed installed-menu disabled no-op; unit tests verify owned-route removal, preserving other routes and closing public ingress |

## Company-server backup and browser checks

- Created `/var/backups/gcc-timesheet/timesheet-20261024T051348-7dbf64.tgz` (13,668 bytes). Its SHA-256, archive manifest/file hashes and extracted SQLite `PRAGMA integrity_check` all passed. Verification extracted into a private temporary directory and did not restore production data.
- Observed the real maintenance page in the user's Chrome after backup. System Admin browser login cleared maintenance and returned to the administration page. The maintenance flag was absent afterward.
- Verified normal administrator login through LAN HTTP and public HTTPS, and public login remained valid after a page refresh. Declined Chrome's password-saving prompt.
- The private environment, image reference, administrator configuration, Compose configuration and schedules matched their before-backup SHA-256 checksums. Tailscale SSH remained enabled, Funnel remained active, reporting remained disabled and LAN/public health returned HTTP 200 with v1.34.0.
- No company data was deleted, restored or reset. Production reporting credentials were not revealed or rotated, and no production OS package upgrade was performed.

## Limits

An initial offsite receiver fixture rejected key authentication. Its test-only key-directory and PAM configuration were corrected; the final real SSH/rsync check passed. No production application code change was needed to resolve that fixture failure.

An unapproved CI device was not enrolled into the company's tailnet. A new-account Funnel approval and a production public-disable/re-enable cycle were not performed; related route/failure behavior has unit simulations plus the real existing public website/login checks. The offsite receiver is a disposable loopback SSH server, not a company backup host. Failed image deployment is simulated, while real deployment/restarts and unchanged-image update paths run in CI. A full OS reboot, future-version GitHub download, external editor typing, Power BI Desktop/Service refresh, gateway and report publication are outside this run. These limits are not counted as real end-to-end successes.
