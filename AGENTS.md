# Repository Guidelines

## Frontend and UI changes

Before changing any frontend page, component, layout, or CSS, read and follow [RESPONSIVE_WEB_DESIGN_RULES.md](RESPONSIVE_WEB_DESIGN_RULES.md). Its responsive standards are permanent project requirements. Inspect the current component and its breakpoints, then check the affected UI at mobile, tablet, laptop, desktop, and ultrawide sizes before declaring the change complete. Fix responsive regressions introduced by the change.

The existing responsive implementation and validation baseline are documented in [docs/RESPONSIVE_AUDIT.md](docs/RESPONSIVE_AUDIT.md).

For layout testing, follow [docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md](docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md), which contains the reusable 28-viewport list, responsive and loading-state checks, route/permission checks, and evidence requirements.
