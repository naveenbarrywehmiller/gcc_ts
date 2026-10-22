# GCC Timesheet App v1.33.0 validation

The Job Title feature is prepared for the next minor application release after v1.32.1. Power BI and Linux-admin versions are independent and are not changed by this release.

## Verification

- `npm test`: 162 Node regression tests and 55 reporting API checks passed.
- `npm run lint` and `npm run build`: passed.
- `npm run check:repository`: passed with no errors.
- Chromium: 887 checks passed with isolated in-memory databases; see [the responsive validation record](RESPONSIVE_AUDIT.md#job-titles-and-sidebar-order-october-22-2026).
- Startup migration retains user IDs, access grants and existing data. Existing positions remain unassigned until selected; subsequent profile saves require a title.
- The additional upstream v1.32.1 changes contain release metadata only, with no application behavior changes from the tested v1.32.0 base.

## Dependency audit, October 22, 2026

`npm audit --omit=dev --json` reports 15 existing server findings (10 high, five moderate) and two existing client findings (both high). This feature changes no dependency manifests or lockfile resolutions.

The server's high findings follow PM2's proxy/PAC/FTP, process-watch/glob and YAML configuration dependencies (`basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `follow-redirects`, `brace-expansion`, `braces`, `chokidar`, `js-yaml`, and the aggregate `pm2` finding). The added routes use parameterized SQLite queries and do not load proxy configurations, FTP responses, YAML documents or glob patterns from HTTP input. These findings require a separate PM2 dependency/configuration review, particularly where optional remote monitoring or proxy support is enabled.

The client findings cover Axios and its Node redirect dependency. The application runs Axios in the browser with a fixed same-origin API base; Node proxy/HTTP2 and redirect code is outside that runtime. Browser prototype-pollution gadgets require an additional pollution source; none was introduced in the Job Title paths. This is a reachability assessment, not a claim that all deployed configurations are free of vulnerabilities.

Moderate server findings concern existing Express/body-parser/qs request parsing, ExcelJS and uuid. Request parsing remains a live application boundary; this release does not expand its configuration. Native audit offers compatible updates for several dependency chains and a major ExcelJS downgrade for others. Remediation is deferred to a focused dependency change with regression validation rather than an automatic forced update. Reassess by **October 29, 2026**. Raw audit reports are retained in the local temporary `gcc-job-title-validation` evidence directory.

Live production deployment, external integrations, Microsoft identity-provider sign-in, other browser engines, physical devices and assistive technology were not exercised.
