# GCC TimeSheet

Employee time tracking, team approvals, administration, and reporting in one application. Built with React and Express, backed by SQLite, with optional Microsoft 365 integrations and a companion Power BI project.

[Getting started](#getting-started) · [Features](#features) · [Configuration](#configuration) · [Docker](#docker-deployment) · [Help](.github/HELP.md) · [API](API_REFERENCE.md) · [Changelog](CHANGELOG.md)

**Releases:** [Application v1.19.0](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/v1.19.0) · [Power BI v1.1.3](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/powerbi-v1.1.3) ([Power BI project and tools ZIP](https://github.com/naveenbarrywehmiller/gcc_ts/releases/download/powerbi-v1.1.3/gcc-requirements-powerbi-v1.1.3.zip))

**Frontend development:** All UI changes must follow the permanent [Responsive Web Design Rules](RESPONSIVE_WEB_DESIGN_RULES.md). The [responsive audit](docs/RESPONSIVE_AUDIT.md) records the current implementation and validation baseline.

## Features

| Area | Available capabilities |
| --- | --- |
| Timesheets | Weekly grid with ISO week numbers; project/task entries; non-project activities; bulk save; submit, approve, reject, and recall; administrator posting |
| Planned vacation | Month calendar, individual dates and date ranges, save/remove/discard controls, and administrator team view; stored separately from timesheet hours |
| Dashboard | Personal hours, weekly progress, status summaries, recent activity, and shortcuts |
| Approvals | Manager review and administrator approval screens, comments, and division-scoped administration |
| Organization | Divisions, subdivisions, departments, department ownerships, supporting categories, and activities |
| Master data | Users, projects, customers/project metadata, tasks, billable classification, and activation/deactivation |
| Reporting | Utilization, project hours and detail, weekly summaries, filtering, Excel/PDF exports |
| Reporting inputs | Division travel and staffing updates for reporting |
| Holidays | Holiday calendar administration and calendar integration; see implementation and tests in the repository |
| Power BI | Read-only reporting API, dedicated API-key authentication, filtering/pagination, and a requirements-based report/model project |
| Microsoft 365 | Optional Entra ID SSO, SharePoint synchronization, and Power Automate approvals |
| Operations | System-admin maintenance, online database download, database upload/restore, token generation, and error-log viewing |
| Help | In-app guides for employee, manager, admin, and system admin roles, filtered by the signed-in user's permissions |
| Interface | Dark mode, responsive screens, notifications, and server date/time display in IST with a 12-hour clock |

### Roles and access

There are **four roles**: `employee`, `manager`, `admin`, and `system admin`.

| Role | Typical access |
| --- | --- |
| Employee | Own dashboard, timesheets, and planned vacation |
| Manager | Employee features plus manager approvals, subject to backend scope checks |
| Admin | Administration and reports, scoped to assigned divisions where applicable |
| System admin | Full role access, system maintenance, database operations, and error logs |

The backend checks permissions independently of the UI. Administrative reports are not available to every authenticated employee.

### Timesheet workflow

Save hours as drafts, submit the week for review, then approve or reject it through the applicable approval screen. Recall moves eligible entries back to an editable state; the server enforces ownership, division scope, and eligible status. Planned vacation does not create timesheet hours or submit an approval request.

## Getting started

### Requirements

- **Node.js 22.12 or later**; the Dockerfile uses Node 22. The installed `better-sqlite3` 13 package requires Node 22+, and [Vite requires 22.12+ on Node 22](https://vite.dev/guide/).
- npm supplied with your Node installation.
- Git. Docker with the Compose plugin is optional.
- If SQLite's native dependency must compile locally, install the compiler/Python toolchain appropriate for your operating system.

### 1. Clone and install

```sh
git clone https://github.com/naveenbarrywehmiller/gcc_ts.git
cd gcc_ts
npm install
```

The root `postinstall` installs dependencies in both `server/` and `client/`. To install strictly from the committed lockfiles, run `npm ci --prefix server` and `npm ci --prefix client` instead.

### 2. Configure the backend

On Windows PowerShell:

```powershell
Copy-Item .env.example server/.env
```

On Linux/macOS:

```sh
cp .env.example server/.env
```

Edit `server/.env`. Generate **two independent secrets**, running this command twice:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set `JWT_SECRET` and `JWT_REFRESH_SECRET` to the generated values. For first-time provisioning, also set:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-unique-password-at-least-12-characters
```

There is **no default production login**. Migrations create a system admin only when these values are supplied and no system admin already exists. Remove the bootstrap values after successful provisioning; they do not reset an existing user's password.

### 3. Initialize and run

```sh
npm run setup
```

This runs migrations and catalog seeding. `SEED_DEMO_DATA=false` is the default; demo-user creation is prohibited in production. Migrations also run automatically on server startup.

Open two terminals at the repository root:

```sh
# Terminal 1
npm run dev:server
```

```sh
# Terminal 2
npm run dev:client
```

Visit **http://localhost:5173** and sign in with the bootstrap credentials. The API runs on **http://localhost:3001**; Vite proxies `/api` requests there. Use separate terminals on Windows: the root `npm run dev` command uses POSIX shell background-job syntax.

### 4. First administrator setup

1. Create or review divisions, departments, supporting categories, and activities.
2. Configure projects, tasks, and holiday dates.
3. Create employees and managers; assign roles and organization membership.
4. Assign division ownership for administrators as appropriate.
5. Save a sample timesheet, submit it, and verify the approval/reporting flow.
6. Configure optional integrations only when their credentials and permissions are ready.

## Configuration

The backend explicitly loads **`server/.env`**. Docker Compose reads **root `.env`** and passes it into the container. Frontend `VITE_*` settings belong in **`client/.env`**. These files serve different purposes.

| Setting | Default / behavior | Guidance |
| --- | --- | --- |
| `NODE_ENV` | `development` | Use `production` to serve `client/dist` through Express |
| `PORT` | `3001` | Vite's API proxy targets 3001; update `client/vite.config.js` if changing local API port |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Development fallbacks | Supply independent random values; production requires at least 32 characters each |
| `JWT_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh-token lifetime |
| `COOKIE_SECURE` | `false` | Set `true` for browser access through HTTPS; local HTTP requires `false` |
| `DB_PATH` | `./data/timesheet.db` | Relative paths resolve from `server/`; persist this location in deployments |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated exact browser origins; use your real application origin in production |
| `APP_BASE_URL` | Empty in code; localhost in example | Set to the externally accessible URL for integrations |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | `900000`, `2000` | API request window and maximum count |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Empty | One-time system-admin provisioning |
| `SEED_DEMO_DATA` | `false` | Development-only demo users |
| `POWERBI_API_ENABLED` | `true` | Set `false` to disable the reporting API |
| `POWERBI_API_KEY` | Empty | Generate a dedicated random key before enabling external reporting clients |
| `POWERBI_API_BASE_PATH` | `/api/powerbi` | Custom mount supported; the standard path remains an alias |
| `POWERBI_MAX_RECORDS` | `50000` | Reporting query safety cap |
| `POWERBI_CACHE_TTL` | `60` seconds | Use a positive integer; currently `0` falls back to 60 rather than disabling caching |

See [.env.example](.env.example) for integration credentials and feature flags. Never commit environment files or expose credentials through screenshots, issue reports, or frontend variables.

### Microsoft SSO

Configure `ENABLE_MSAL_AUTH=true`, `ENTRA_CLIENT_ID`, and `ENTRA_TENANT_ID` in `server/.env`. Copy [client/.env.example](client/.env.example) to `client/.env` and set matching `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID` values. Register the browser application's redirect URL in Entra ID: the client uses its current origin plus `/auth/callback` (for example, `http://localhost:5173/auth/callback`).

The server exposes `/api/auth/ms-config` and validates identity tokens through `/api/auth/ms-callback`. The browser also needs its Vite settings to instantiate MSAL. Restart the frontend dev server or rebuild after changing them: [Vite environment values are embedded at build time](https://vite.dev/guide/env-and-mode). Never put a client secret in `VITE_*` values.

The supplied Dockerfile does not forward SSO build arguments. Adding `VITE_*` values only to Compose runtime environment will not enable MSAL in an already-built image. Build a frontend with the intended public settings for an SSO deployment.

### SharePoint and Power Automate

Enable `ENABLE_SHAREPOINT_SYNC` or `ENABLE_POWER_AUTOMATE` only after configuring the corresponding credentials, site/flow URL, and callback secret. See [SharePoint setup](SHAREPOINT_SETUP.md) and [Power Automate setup](POWER_AUTOMATE_SETUP.md). Review older examples against the current environment table and implemented routes.

## Docker deployment

### Build from this checkout

Copy `.env.example` to **root `.env`**. Configure independent JWT secrets and initial bootstrap credentials. Set the actual `APP_BASE_URL`, `CORS_ORIGIN`, and HTTPS cookie policy.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 timesheet
```

The supplied Compose file publishes host port `${PORT:-3001}` to container port 3001, loads root `.env`, and keeps the database, uploads, logs, and restore safety backups in named volumes. The server runs in production regardless of the development value in the example file.

Do not use `docker compose down -v` for routine updates: it removes named volumes and their data. Download an online database backup before upgrading or restoring.

### Use the GitHub container image

Save this as `compose.registry.yml` beside the supplied Compose file:

```yaml
services:
  timesheet:
    image: ghcr.io/naveenbarrywehmiller/gcc_ts:latest
```

```sh
docker compose -f docker-compose.yml -f compose.registry.yml pull
docker compose -f docker-compose.yml -f compose.registry.yml up -d --no-build
```

GHCR images support `linux/amd64` and `linux/arm64`. For controlled upgrades, replace `latest` with an available version tag or a verified digest. Registry authentication is required if the package is private; see [GitHub help](.github/HELP.md#container-registries).

### Health and HTTPS

Open `http://localhost:3001` (or the configured host port) and check `/api/health`. A normal response contains `status`, `timestamp`, and the version derived from root `package.json`. Maintenance mode intentionally returns 503 for health requests.

Use a trusted reverse proxy or your established HTTPS tunnel for external access. Set `COOKIE_SECURE=true`, `APP_BASE_URL=https://your-host`, and `CORS_ORIGIN=https://your-host` for that deployment. The server trusts one proxy hop; restrict direct access to the upstream port when relying on forwarded headers.

## Operations and recovery

- **Online backup:** sign in as system admin, open `/admin/system`, and download the database. The download endpoint uses SQLite's native online backup API.
- **Restore:** use the system-admin database upload workflow, after saving a backup and reviewing the file. Restore replaces application data and should be coordinated with users.
- **CLI backup:** `npm --prefix server run backup` writes to `server/backup`. Install `sqlite3` for an online CLI snapshot. If unavailable, the script copies database/WAL files; stop the server first to keep that fallback consistent.
- **CLI restore:** stop the server, then run `npm --prefix server run restore -- /absolute/path/to/backup.db` and restart. The script replaces the database and clears existing WAL/SHM files; use a self-contained verified backup.
- **Maintenance:** use the system-admin screen. File-based maintenance uses `server/.maintenance`; API requests generally return 503 while enabled. Container recreation removes that non-mounted marker, so check maintenance state after recreation.
- **Diagnostics:** review `/admin/error-logs`, application logs, and `/api/health`. Keep backups outside the host as part of your operational process; a persistent volume alone is not an off-host backup.

## Commands and validation

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run setup` | Database migrations and seeding |
| `npm run dev:server` | Backend development server |
| `npm run dev:client` | Frontend development server |
| `npm run build` | Production frontend build |
| `npm run start` | Start backend; set production mode to serve built frontend |
| `npm run lint` | Frontend ESLint checks |
| `npm test` | Backend regression tests and Power BI API tests |
| `npm --prefix server run test:powerbi` | Power BI API test suite |
| `node scripts/validate-powerbi.js` | Power BI project validation |

For a local production run, build first and set `NODE_ENV=production` in `server/.env`. The database tests configure an in-memory database; Power BI Desktop engine checks have separate prerequisites described in [validation documentation](powerbi/validation/README.md).

## API overview

| Category | Implemented route examples |
| --- | --- |
| Health | `GET /api/health` |
| Local authentication | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Microsoft authentication | `GET /api/auth/ms-config`, `POST /api/auth/ms-callback` |
| Timesheets | `/api/timesheets`, `/batch`, `/submit`, `/recall`, `/approve`, `/reject`, `/post` |
| Manager | `/api/manager/pending-approvals`, `/api/manager/week-details/:userId/:year/:week` |
| Reports | `/api/reports/dashboard`, `/utilization`, `/project-hours`, `/project-hours-detail`, `/weekly-summary`, `/export` |
| Vacation | `/api/planned-vacations` |
| Reporting feeds | `/api/powerbi/*` |
| Master data | `/api/users`, `/api/projects`, `/api/tasks`, and organization catalogs |
| Administration | `/api/audit`, `/api/import`, `/api/admin-ownership`, `/api/division-updates`, `/api/error-logs` |
| System | `/api/system/maintenance`, `/database/download`, `/database/restore-upload`, `/tokens` |

Paths after the first entry in a row share that row's prefix. See [API_REFERENCE.md](API_REFERENCE.md) for expanded examples; route handlers in `server/src/routes/` are authoritative where older examples differ.

## GitHub builds and releases

The Docker workflow builds both supported architectures on pull requests without publishing. Pushes to `main`, `v*` tag pushes, and manual dispatch publish GHCR images. Optional Docker Hub publishing copies the completed multi-platform image by digest, without rebuilding.

Release Please manages release pull requests, version updates, tags, and changelog entries. Its default `GITHUB_TOKEN` cannot be assumed to trigger Docker builds from the tag it creates. See the [GitHub help guide](.github/HELP.md) for repository permissions, registry secrets, tag behavior, release recovery, and troubleshooting.

The current workflows build images but do not run `npm test` or frontend lint as an automatic merge gate. Run the validation commands above before merging; configure required checks/branch protection in repository settings if your team requires enforced gates.

## Project map and documentation

```text
client/                 React pages, components, contexts, API/MSAL services
server/src/routes/      Express endpoints
server/src/config/      Environment, SQLite, migrations, seed, backup/restore
server/src/middleware/  Authentication, permissions, maintenance, errors
scripts/                Regression tests and Power BI generation/validation
powerbi/                Power BI report, semantic model, and documentation
.github/workflows/      Docker publishing and Release Please
```

| Guide | Use it for |
| --- | --- |
| [GitHub help](.github/HELP.md) | Actions, releases, registries, support, and troubleshooting |
| [API reference](API_REFERENCE.md) | Endpoint usage and examples |
| [Architecture](ARCHITECTURE.md) | Application structure and design |
| [Deployment notes](DEPLOYMENT_NOTES.md) | Infrastructure history and deployment fixes |
| [Migration guide](MIGRATION.md) | Migration guidance |
| [Power BI API integration](docs/POWERBI.md) | Read-only feed configuration |
| [Power BI project guide](powerbi/POWERBI.md) | Requirements, model, queries, and report setup |
| [Power BI project README](powerbi/GCC_Requirements/README.md) | Opening and configuring the report project |
| [Power BI validation](powerbi/validation/README.md) | Model validation prerequisites and evidence |
| [Changelog](CHANGELOG.md) | Release history |

## Technology and security

React 19, Vite 8, React Router 7, TanStack Query 5, Tailwind CSS 3/custom CSS, and MSAL power the client. Express 4, `better-sqlite3` 13, bcryptjs, JWT, Helmet, ExcelJS, and PDFKit power the server. Dependency manifests and lockfiles contain exact declared/resolved versions.

Browser authentication uses HttpOnly cookies; API clients may use bearer tokens. Passwords are hashed, backend routes enforce roles/scope, and API requests are rate limited. Helmet is enabled, with its Content Security Policy explicitly disabled in the current server. Configure exact CORS origins and HTTPS cookies for production; these are deployment settings, not automatically guaranteed by using Docker.

## Usage

Internal use only. This repository does not provide an open-source license grant.
