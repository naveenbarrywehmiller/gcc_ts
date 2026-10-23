# Linux Admin v1.2.1 panel validation

Validated October 23, 2026 on the company Ubuntu 26.04.1 LTS VM, Python 3.14.4. This change affects the SSH terminal administrator; no application frontend, CSS, API, database or container image was changed.

## Automated checks

- All **47 unit tests passed**: 24 existing operation/failure tests, 16 panel tests, four host-metric tests and three Linux pseudo-terminal tests. Destructive operations in these tests use temporary data and mocks.
- Navigation checks cover all seven categories, Help, Back/Home/Exit, invalid input, removed choices 11/12, action-to-operation routing and examples that never execute the operation.
- Failure checks confirm that an ordinary operation error leaves the current category available. Stop requires confirmation, and factory reset retains its exact `FACTORY RESET` requirement.
- Rendering checks cover **20, 32, 40, 60, 80, 120 and 160 columns**, in color/emoji and plain modes. ANSI-stripped display-cell measurements include wide emoji and long examples. An initial emoji-row overflow was fixed before installation.
- Plain output, redirected output, `TERM=dumb`, `NO_COLOR` and `TIMESHEET_NO_EMOJI` behavior passed.
- Host tests check CPU counter deltas without double-counting guest time, available/reclaimable memory, swap, separate disk/filesystem capacities, default-interface IP selection and missing/reset measurements.
- Real Linux pseudo-terminals verify timed refresh while preserving a partly typed choice, backspace, EOF, terminal-mode restoration and small-window snapshot behavior. Every submenu action is checked through the shared result formatter with representative long output and warnings; commands are summarized, prompts remain usable and embedded terminal controls are removed.
- Structured status tests verify actual health and inactive timer states without a wide Docker table. Unknown health is displayed as unavailable, not healthy.
- Bash syntax, Python compilation, generated script-reference consistency, repository link/import/path validation and changed-file whitespace checks passed. The local code map was rebuilt.

## Installed-tool verification

- Built and installed a local v1.2.1 bundle with the versioned installer; the prior v1.2.0 tool is retained for administrator rollback.
- Exercised the candidate panel over SSH: live CPU/RAM/storage/OS/IP measurements, five-second updates with a pending typed selection, colored categories and the formatted App control > Status and website result. Earlier v1.2.0 verification also covered Help > color/emoji check, Back/Home navigation and restore explanation via `?4`.
- After installation, captured **22 read-only panel sessions**: the home screen, all eight categories, every action's help, actual status, backup listing, SQLite integrity, diagnostics and display check. No errors were reported. Destructive actions were explained, not executed; the operation tests use temporary data and mocks.
- Verified `timesheet --plain` and both display environment variables through the normal sudo launcher. These settings affect terminal presentation only.
- Application settings, environment, pinned image, Compose configuration and schedules matched their pre-install SHA-256 checksums. Container ID and start timestamp were unchanged, and live health remained HTTP 200 with app v1.34.0.
- HTTP remains configured. No certificate, hostname, DNS, firewall or timer settings were changed by this update.

## Coverage limits

The company-server checks used a local build before GitHub publication. The tagged release workflow separately runs the disposable Ubuntu deployment/restore/reset smoke test before publishing assets. That destructive smoke test was not run on the company VM, and destructive actions were not executed there. Physical terminal fonts, every SSH client and assistive technologies were not tested. The 28 Chromium viewport checklist does not apply to this terminal-only change; existing web-layout evidence remains separate.
