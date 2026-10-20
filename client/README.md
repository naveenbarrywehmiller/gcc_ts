# GCC Timesheet App — frontend

React pages, shared components, authentication contexts, and API clients for GCC Timesheet App. Run commands from the repository root:

```sh
npm --prefix client ci
npm run dev:client
npm run lint
npm run build
```

Vite serves development traffic on port 5173 and proxies API requests to port 3001. Start the API separately with `npm run dev:server`. Copy [the client environment example](.env.example) to `client/.env` for optional public Microsoft sign-in settings; keep server secrets in `server/.env`.

The production build writes `client/dist/`, served by Express or copied into the application image. Imports also use the repository's [shared policies](../shared/).

Follow the [responsive rules](../RESPONSIVE_WEB_DESIGN_RULES.md) and [28-viewport checklist](../docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md) for interface changes. See [the main README](../README.md) for setup and [GitHub Help](../.github/HELP.md) for builds and releases.
