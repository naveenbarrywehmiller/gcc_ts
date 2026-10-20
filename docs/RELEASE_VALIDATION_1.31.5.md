# Application v1.31.5 validation

Validated October 20, 2026. This patch fixes Maintenance token copying and adds Power BI connection addresses and setup hints. Dependency manifests and resolutions are unchanged apart from the root application version.

## Checks

- `npm test`: 153 Node tests and all 55 reporting API checks passed.
- `npm run lint`, `npm run build`, and `git diff --check`: passed.
- Production-build Chromium checks: 112 combinations of 28 viewports, two token states, and light/dark themes passed. Native copying, clipboard fallback/failure handling, keyboard operation, and generated-token Basic authentication passed. See [responsive evidence](RESPONSIVE_AUDIT.md#maintenance-token-copying-and-power-bi-connection-hints-october-20-2026).
- Live Power BI Desktop/Service refresh, other browser engines, physical devices and screen readers were not tested.

## Existing dependency advisories

`npm audit --package-lock-only --json` reported zero findings at the root, 15 in the server lockfile (10 high, five moderate), and 11 in the client lockfile (nine high, two moderate). These are package-level counts, including affected parent packages, rather than independent exploit counts. No critical finding was reported. Audits are not clean; this release does not remediate these existing dependencies.

The focused exposure review used `npm explain`, the Dockerfile, PM2 configuration, Axios usage, and installed ExcelJS/PM2 source. It did not establish an externally reachable high-severity exploit in the changed Maintenance flow. This is a scoped assessment, not a full security audit.

| Affected dependencies | Exposure and deferral reason | Follow-up |
| --- | --- | --- |
| Server `basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `ip-address`, affected parent `pm2` | PM2's proxy stack; the application does not accept FTP or PAC URLs from HTTP requests. Exploitation of these paths depends on proxy/network configuration outside this UI fix. | Review operator-controlled proxy settings and compatible PM2/transitive updates. |
| Server `js-yaml` through PM2 | The shipped process configuration is trusted `ecosystem.config.js`; web input is not passed to PM2 YAML parsing. | Update PM2 when its pinned YAML dependency is patched. |
| Server `braces`, `chokidar`, affected `nodemon`/`pm2` | File-watcher pattern processing; nodemon is omitted from the production image and production PM2 configuration does not enable watch. | Review compatible watcher updates; audit proposes a major nodemon downgrade, which was not applied. |
| Server `brace-expansion` through ExcelJS/archive utilities and nodemon | Application Excel operations use in-memory workbook load/write; the inspected writer uses archive entry names rather than attacker-supplied filesystem glob patterns. | Patch compatible transitive versions and retest Excel import/export. |
| Client `axios` | Application usage is browser HTTP to relative `/api` URLs. Node HTTP/HTTP2/proxy-adapter findings do not apply to that adapter; browser prototype gadgets require a separate prototype-pollution condition not established by this focused review. | Evaluate the compatible 1.20+ fixes and rerun authentication/upload/download browser checks. |
| Client `brace-expansion`, `braces`, `chokidar`, `fast-glob`, `micromatch`, `tailwindcss` | Build/lint tools process repository-controlled source paths, not HTTP request patterns. Client build dependencies are absent from the production runtime image. | Evaluate compatible fixes separately; do not force the proposed Tailwind 4 migration into this patch. |
| Client `nanoid`, `source-map-js`, `postcss-selector-parser`, `postcss-nested` | CSS/source-map build tooling; source files and selectors are repository-controlled. | Apply compatible patches and repeat build/layout checks. |
| Server `qs`, `body-parser`, `uuid`, affected `exceljs` | Remaining moderate findings include request parsing and an optional UUID buffer overload. Request parsing remains subject to the existing body limit and rate limiter; it is not claimed unaffected. | Review parser patches and UUID usage separately; do not apply the proposed ExcelJS major downgrade automatically. |

Deferred dependency remediation review date: **October 27, 2026**. Review earlier if deployments add untrusted proxy/PAC, YAML, glob, stylesheet or source-map inputs. Compatible fixes are available for several findings, but broad lockfile updates and major migrations require separate regression coverage; no `npm audit fix --force` was run.
