# Project reorganization validation

Validation date: October 20, 2026. See [the repository map](REPOSITORY_STRUCTURE.md) for naming, move, cleanup, and compatibility decisions.

## Change and preservation checks

- Mapped 629 original tracked files; moved 310 files into the renamed product folders and documentation hierarchy. Removed only two PID files and two unused React/Vite logo assets.
- Verified every original file remains at its mapped location except those four confirmed obsolete files. Historical plans, legacy models, configurations, source, the database backup, and Git history are retained.
- All **139 pre-existing modified Power BI files** retain their exact original working-tree SHA-256 hashes at the new locations. They are excluded from the reorganization commit and remain available as unstaged edits.
- All dependency resolutions in all three lockfiles are unchanged. Package names and descriptions were updated consistently.
- PBIP → Report → SemanticModel references resolve. Platform logical IDs and model lineage identifiers are preserved.
- The source candidate was exported from the Git index and tested separately from the pre-existing edits.

## Local validation

| Check | Result |
| --- | --- |
| Candidate repository mapping | **Passed**: 56 owned Markdown files, 519 extracted links, 602 relative JavaScript imports; no missing local targets/anchors/imports |
| Mapping validator self-checks | **Passed**: valid links, duplicate-heading anchor, fenced examples, missing path/anchor detection, module resolution |
| Application regression tests | **155 passed**, zero failed, in both the working tree and isolated source candidate |
| Reporting API tests | **55 passed**, zero failed, in both candidates |
| Frontend lint / production build | **Passed** |
| Linux-admin unit tests | **24 passed**, including old/new tag parsing and rejection of other products |
| Bash syntax | **Passed** for installer, launcher, Docker entrypoint, database manager, and macOS launcher |
| Python compilation | **Passed** for administrator and repository scripts |
| Generated administrator reference | **Passed** after regeneration |
| Admin tar/ZIP/checksum | **Passed**: both archives contain the same 11 files; tar SHA-256 matches its sidecar |
| Workflow syntax | **All four workflows passed Actionlint**; shellcheck/pyflakes integration disabled because those optional tools were unavailable |
| YAML parsing | **Passed** for four workflows and both Compose configurations |
| Release Please configuration | **Passed** against the upstream configuration JSON schema |
| Native Power BI model read | **Passed**: 17 tables, 70 measures; all 121 visuals resolve field bindings |
| Candidate Power BI schema validation | **254 Microsoft schema documents passed**, zero errors |
| Responsive Chromium | **707 checks passed**, 28 viewports, five roles, both themes; no browser exceptions or server failures |
| Screenshot review | Login and application shell inspected at 375×667, 768×1024, 1366×768, 1920×1080, and 3440×1440; 33 additional screenshot-run checks passed |
| Graphify | Rebuilt: 1,555 nodes / 3,499 edges / 88 communities |
| Reorganization diff whitespace check | **Passed**; the preserved, unrelated local edits retain three pre-existing end-of-file blank-line warnings |

Link checks validate local files and Markdown anchors. Additionally, all 31 non-GitHub reference URLs passed HTTP/redirect checks (including the Microsoft Store app link); six upstream GitHub references and eight repository/release/package views returned HTTP 200. All 62 changelog commit links resolve to existing commit objects, and both endpoints of all 62 comparison links exist among the preserved published tags. Release downloads were checked independently below. Authentication portals were checked for reachability, without signing in. The source-only candidate excludes ignored local review reports and caches.

## GitHub Actions validation

The implementation commit `66d281725d647ab37b2cdd893444897e791df86c` passed all applicable pull-request jobs:

- [Repository validation](https://github.com/naveenbarrywehmiller/gcc_ts/actions/runs/39423233303): mapping checks, tests, lint, and frontend build.
- [Docker builds](https://github.com/naveenbarrywehmiller/gcc_ts/actions/runs/39423233164): actual Linux AMD64 and ARM64 images built successfully.
- [GCC Timesheet Linux Admin](https://github.com/naveenbarrywehmiller/gcc_ts/actions/runs/39423233234): syntax/unit/reference checks, image build, and actual disposable Ubuntu/Docker/Nginx installation, backup, restore, reset, ports, timers, and launcher smoke tests passed. Release assets were built successfully.

Publishing and manifest-push jobs were correctly skipped for the pull request. No production deployment was performed.

## GitHub release verification

Updated **71 release titles**, created **71 canonical product tag aliases**, and uploaded **18 canonical archive/checksum files**. Downloaded all 18 new files again and verified their SHA-256 hashes against the prepared local copies.

Verified that every original tag object, release tag/target, draft/prerelease setting, and original asset ID/size remains unchanged. Existing assets were not replaced. The latest release remains `v1.31.5`. Canonical historical archives preserve the original payload bytes and internal paths; legacy download URLs/checksums remain valid.

New application releases use `gcc-timesheet-app-vX.Y.Z` through Release Please. Docker accepts new and legacy application tags. Linux-admin discovery accepts new and legacy administrator tags. Historical tags remain release-bound; the new aliases point to identical source objects.

## Dependency audit findings

No dependency versions were changed in this structural task. `npm audit --omit=dev --json` reported existing findings:

| Package set | Moderate | High | Critical |
| --- | --- | --- | --- |
| Server production dependencies | 5 | 9 | 0 |
| Client production dependencies | 0 | 1 | 0 |

The direct high-severity packages are server `pm2` and client `axios`; the remaining server high findings are transitive. Dependency remediation requires a separate compatibility-tested update. These findings are not caused by renamed manifests or moved paths.

## Coverage limits

- The pre-existing Desktop edits use Microsoft's `visualContainer/2.14.0` schema URL, which returned HTTP 404. The working-tree schema run therefore stops at that unavailable schema. Those edits were preserved rather than downgraded. The isolated reorganization candidate retains the existing supported schema declarations and passes all 254 checks.
- Docker is not installed locally. Actual container and Ubuntu deployment checks passed in the GitHub workflows above on disposable runners. They do not certify a specific production host's DNS, credentials, storage, or network settings. No production deployment or database was modified.
- Native Power BI canvas rendering, refresh against production data, Power BI Service publication, and Microsoft sign-in were not exercised. Native model reading is not a full Desktop UI certification.
- Browser validation used the production frontend with the actual local API and an isolated in-memory SQLite database containing synthetic users. Firefox, Safari, physical devices, and assistive technology were not tested. Routes and permissions were not changed; existing regression tests cover access behavior.
- Destructive or external operational commands were not executed against real systems. Factory reset/restore were exercised only with isolated test data and disposable CI runners. SharePoint provisioning/export against live systems was not run. Historical plans and example tenant/host URLs are reference material, not deployment targets.
- Raw logs, release snapshots, original edit backups, screenshots, and machine-readable check results are stored locally under `%TEMP%/gcc-reorganization/`; generated runtime artifacts are not added to the repository.
