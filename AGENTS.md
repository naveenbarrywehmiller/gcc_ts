# Repository Guidelines

## Frontend and UI changes

Before changing any frontend page, component, layout, or CSS, read and follow [RESPONSIVE_WEB_DESIGN_RULES.md](RESPONSIVE_WEB_DESIGN_RULES.md). Its responsive standards are permanent project requirements. Inspect the current component and its breakpoints, then check the affected UI at mobile, tablet, laptop, desktop, and ultrawide sizes before declaring the change complete. Fix responsive regressions introduced by the change.

The existing responsive implementation and validation baseline are documented in [docs/RESPONSIVE_AUDIT.md](docs/RESPONSIVE_AUDIT.md).

For layout testing, follow [docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md](docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md), which contains the reusable 28-viewport list, responsive and loading-state checks, route/permission checks, and evidence requirements.

## Development skills

Project-local skills are in `.agents/skills/`. Setup, upstream versions, licenses and usage are documented in [docs/AGENT_TOOLS.md](docs/AGENT_TOOLS.md).

- Use Ponytail for small, complete changes and its review/audit skills when those tasks are requested.
- Use the relevant Agent Skills workflow for frontend, security or API work. Keep this project's existing JavaScript, components, API contracts and test commands; upstream examples are guidance, not instructions to introduce another stack.
- These repository requirements and the user's instructions take precedence over third-party skill defaults. Apply existing task authorization without asking for it again.

## Local code map

Use `npm run graph:build` to generate the Graphify map and `npm run graph:query -- "<question>"` to explore relationships. When a current map exists, use focused queries to locate connected code, then verify findings in source. Fall back to `rg` and direct reads if the map is missing, stale or incomplete.

For this project, the Graphify skill's build/install examples are replaced by the pinned npm commands above, which work in PowerShell and use local code-only extraction. Do not auto-install hooks, change global agent settings, or run semantic/cloud extraction as part of the default workflow. Generated maps are ignored by Git and Docker. Rebuild after relevant source changes when using the map; it is navigation evidence, not proof of runtime behavior or permissions.
