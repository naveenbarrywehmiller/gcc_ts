# GCC Timesheet App

Employee time tracking, team approvals, administration, and reporting in one application. Built with React and Express, backed by SQLite, with optional Microsoft 365 integrations and a companion Power BI project.

[Documentation](docs/README.md) · [Repository map](docs/REPOSITORY_STRUCTURE.md) · [Getting started](#getting-started) · [Features](#features) · [Configuration](#configuration) · [Docker](#docker-deployment) · [Help](.github/HELP.md) · [API](docs/API_REFERENCE.md) · [Changelog](CHANGELOG.md)

**Releases:** [GCC Timesheet App v1.31.7](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-timesheet-app-v1.31.7) · [GCC Dashboard Power BI v2.2.2](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-dashboard-powerbi-v2.2.2) ([Power BI project and tools ZIP](https://github.com/naveenbarrywehmiller/gcc_ts/releases/download/gcc-dashboard-powerbi-v2.2.2/gcc-dashboard-powerbi-v2.2.2.zip)) · [GCC Timesheet Linux Admin v1.1.1](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-timesheet-linux-admin-v1.1.1)

**Current source versions:** GCC Timesheet App v1.31.7 · GCC Dashboard Power BI v2.2.2 · reporting API v2.0.0. Upgrade the application and PBIP together before refreshing data.

**GCC Timesheet Linux Admin:** [Interactive installer and maintenance guide](deploy/linux-admin/README.md) — run `timesheet` for Docker setup, Avahi, ports, backups, scheduled updates, pause/resume controls and diagnostics. New administrator releases use `gcc-timesheet-linux-admin-v*` tags; historical tags remain compatible.

**Frontend development:** All UI changes must follow the permanent [Responsive Web Design Rules](RESPONSIVE_WEB_DESIGN_RULES.md). The [responsive audit](docs/RESPONSIVE_AUDIT.md) records the current implementation and validation baseline.

## Features

| Area | Available capabilities |
| --- | --- |
| Timesheets | Weekly grid with ISO week numbers; project/task entries; non-project activities; bulk save; submit, approve, reject, and recall; administrator posting |
| Planned vacation | Month calendar, individual dates and date ranges, save/remove/discard controls, and administrator team view; stored separately from timesheet hours |
| Dashboard | Personal hours, weekly progress, status summaries, recent activity, and shortcuts |
| Approvals | Manager review and administrator approval screens, comments, and division-scoped administration |
| Organization | Divisions, subdivisions, departments, department ownerships, supporting categories, and activities |
| Master data | Users, projects, customers/project metadata, tasks, Productive/Non-Productive classification, and activation/deactivation |
| Reporting | Utilization, project hours and detail, weekly summaries, filtering, Excel/PDF exports |
| Reporting inputs | Division travel and staffing updates for reporting |
| Holidays | Holiday calendar administration and calendar integration; see implementation and tests in the repository |
| Power BI | Read-only reporting API, dedicated API-key authentication, filtering/pagination, and a requirements-based report/model project |
| Microsoft 365 | Optional Entra ID SSO, SharePoint synchronization, and Power Automate approvals |
| Operations | System-admin maintenance, online database download, database upload/restore, token generation, and error-log viewing |
| Help | Role-specific guides and Management → Matrix help for Managers, Admins, System Admins and Viewers |
| Interface | Dark mode, responsive screens, notifications, and server date/time display in IST with a 12-hour clock |

### Roles and access

There are **five roles**: `employee`, `manager`, `admin`, `system admin`, and `viewer`.

| Role | Typical access |
| --- | --- |
| Employee | Own dashboard, timesheets, and planned vacation |
| Manager | Personal features, approvals, shared settings edits, division monthly updates, companywide user/project/task reads and reports, and scoped team vacation reads |
| Admin | Users/projects/tasks administration, scoped reports and audit, and read-only shared settings/monthly updates |
| System admin | Full role access, system maintenance, database operations, and error logs |
| Viewer | Read all business pages across all divisions, use filters and download reports; no timesheet entry or business edits |

The backend checks permissions independently of the UI. Matrix help is hidden and blocked for Employees. See [the detailed permissions matrix](docs/PERMISSIONS_MATRIX.md) for function-level access, assigned division scope and audit migration behavior.

Only a System Admin can assign the Viewer role, because it grants companywide visibility. The Users page shows total registered accounts and counts for every role, including active and inactive accounts and excluding anonymized deleted accounts. Counts stay companywide when the directory is filtered; selecting a role count filters the list. Startup migrations preserve existing user IDs and linked records while adding Viewer to the database role constraint.

Job Title is a separate shared list under Users in the sidebar. Managers and System Admins maintain titles; authorized user administrators select a required title when creating or saving a profile. Titles can be changed after a promotion and appear on the user's dashboard. Existing accounts keep their current access and show `Not assigned` until a title is selected. See [the Job Title API contract](docs/JOB_TITLES.md).

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
BOOTSTRAP_ADMIN_EMAIL=systemadmin@barry-wehmiller.com
BOOTSTRAP_ADMIN_PASSWORD=systemadmin
```

A fresh database contains only **systemadmin@barry-wehmiller.com / systemadmin**, with the System Admin role. Every business directory starts empty. You may override both bootstrap values before first setup; custom passwords require 12+ characters. Existing accounts/passwords are never overwritten by startup. Remove bootstrap values after provisioning.

### 3. Initialize and run

```sh
npm run setup
```

This runs migrations without adding sample users, platforms, divisions, projects, tasks, departments, job titles, supporting categories, activities or holidays. The former demo-seed flag no longer inserts test data. Migrations also run automatically on server startup.

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

1. Create or review divisions, departments, job titles, supporting categories, and activities.
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
| `SEED_DEMO_DATA` | ignored | Setup never creates demo records |
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

Enable `ENABLE_SHAREPOINT_SYNC` or `ENABLE_POWER_AUTOMATE` only after configuring the corresponding credentials, site/flow URL, and callback secret. See [SharePoint setup](docs/integrations/SHAREPOINT_SETUP.md) and [Power Automate setup](docs/integrations/POWER_AUTOMATE_SETUP.md). Review older examples against the current environment table and implemented routes.

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

GHCR images support `linux/amd64` and `linux/arm64`. For controlled upgrades, replace `latest` with an available version tag or a verified digest. Registry authentication is required if the package is private; see [GitHub help](.github/HELP.md#container-registry-configuration).

### Health and HTTPS

Open `http://localhost:3001` (or the configured host port) and check `/api/health`. A normal response contains `status`, `timestamp`, and the version derived from root `package.json`. Maintenance mode intentionally returns 503 for health requests.

Use a trusted reverse proxy or your established HTTPS tunnel for external access. Set `COOKIE_SECURE=true`, `APP_BASE_URL=https://your-host`, and `CORS_ORIGIN=https://your-host` for that deployment. The server trusts one proxy hop; restrict direct access to the upstream port when relying on forwarded headers.

## Operations and recovery

- **Online backup:** sign in as system admin, open `/admin/system`, and download the database. The download endpoint uses SQLite's native online backup API.
- **Restore:** use the system-admin database upload workflow, after saving a backup and reviewing the file. Restore replaces application data and should be coordinated with users.
- **CLI backup:** `npm --prefix server run backup` writes to `server/backup`. Uses SQLite's native backup API with unique timestamped filenames; maintenance is entered automatically and remains enabled.
- **CLI restore:** stop the server, then run `npm --prefix server run restore -- /absolute/path/to/backup.db --confirm` and restart. The script validates the selected database, requires an active System Admin, saves a safety backup before replacement, migrates the restored database and keeps maintenance enabled.
- **Maintenance:** use the system-admin screen. Local maintenance uses `server/.maintenance`; Docker uses the persisted `/app/server/data/.maintenance` marker. Backup/restore/reset enter maintenance automatically and retain it after completion or restart. Only System Admin web login or the System Admin web maintenance control releases it. Release is blocked while an operation is running. `/api/health/live` remains available for deployment health checks; employee APIs return 503.
- **Diagnostics:** review `/admin/error-logs`, application logs, and `/api/health`. Keep backups outside the host as part of your operational process; a persistent volume alone is not an off-host backup.

## Commands and validation

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run setup` | Database migrations; only the initial System Admin is provisioned |
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

Paths after the first entry in a row share that row's prefix. See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for expanded examples; route handlers in `server/src/routes/` are authoritative where older examples differ.

## GitHub builds and releases

The Docker workflow builds both supported architectures on pull requests without publishing. Pushes to `main`, `gcc-timesheet-app-v*` and legacy `v*` tag pushes, and manual dispatch publish GHCR images. Optional Docker Hub publishing copies the completed multi-platform image by digest, without rebuilding.

Release Please manages release pull requests, version updates, tags, and changelog entries. Its default `GITHUB_TOKEN` cannot be assumed to trigger Docker builds from the tag it creates. See the [GitHub help guide](.github/HELP.md) for repository permissions, registry secrets, tag behavior, release recovery, and troubleshooting.

The repository validation workflow runs mapping checks, application tests, frontend lint and the production build. Configure its required-check policy in GitHub branch protection if enforced merge gates are needed.

## Project map and documentation

```text
client/                 React pages, components, contexts, API/MSAL services
server/src/routes/      Express endpoints
server/src/config/      Environment, SQLite, migrations, seed, backup/restore
server/src/middleware/  Authentication, permissions, maintenance, errors
scripts/                Regression tests and Power BI generation/validation
powerbi/GCC_Dashboard/  GCC Dashboard Power BI report and semantic model
deploy/linux-admin/     GCC Timesheet Linux Admin source and tests
docs/                   Reference, integrations, archive, and validation guides
.github/workflows/      Validation, Docker, Release Please, and Linux admin
```

| Guide | Use it for |
| --- | --- |
| [GitHub help](.github/HELP.md) | Actions, releases, registries, support, and troubleshooting |
| [API reference](docs/API_REFERENCE.md) | Endpoint usage and examples |
| [Architecture](docs/ARCHITECTURE.md) | Application structure and design |
| [Deployment notes](docs/DEPLOYMENT_NOTES.md) | Infrastructure history and deployment fixes |
| [Migration guide](docs/archive/M365_MIGRATION.md) | Migration guidance |
| [Power BI API integration](docs/POWERBI.md) | Read-only feed configuration |
| [Power BI project guide](powerbi/documentation/POWERBI.md) | Requirements, model, queries, and report setup |
| [Power BI project README](powerbi/GCC_Dashboard/README.md) | Opening and configuring the report project |
| [Power BI validation](powerbi/validation/README.md) | Model validation prerequisites and evidence |
| [Changelog](CHANGELOG.md) | Release history |

## Technology and security

React 19, Vite 8, React Router 7, TanStack Query 5, Tailwind CSS 3/custom CSS, and MSAL power the client. Express 4, `better-sqlite3` 13, bcryptjs, JWT, Helmet, ExcelJS, and PDFKit power the server. Dependency manifests and lockfiles contain exact declared/resolved versions.

Browser authentication uses HttpOnly cookies; API clients may use bearer tokens. Passwords are hashed, backend routes enforce roles/scope, and API requests are rate limited. Helmet is enabled, with its Content Security Policy explicitly disabled in the current server. Configure exact CORS origins and HTTPS cookies for production; these are deployment settings, not automatically guaranteed by using Docker.

## Usage

Internal use only. This repository does not provide an open-source license grant.

### Clean setup and factory reset

Fresh installations ship no business/test records. Existing deployments are preserved during upgrades; clearing an existing installation is an explicit factory reset. In the Ubuntu administrator, menu **33** warns before resetting and requires `FACTORY RESET`. It creates a full safety snapshot, clears application data/uploads/logs, recreates only the factory System Admin, pauses automatic jobs and leaves web maintenance enabled. Menu **32** controls automatic startup after OS reboot (enabled by default). See [the Linux operations guide](deploy/linux-admin/README.md).

For an offline local database reset, stop all server workers first, then run `npm --prefix server run factory-reset -- --confirm`. A timestamped safety database is required and saved to `server/backup` before replacement. This local command resets the database; the Linux menu additionally resets uploaded files and application logs. The factory account uses an ID above all previous users so old sessions cannot become the new administrator. Sign in through the maintenance page to reopen access.

Task classifications are **Productive** and **Non-Productive** in forms, project task lists, dashboards, filters, reports, Excel/PDF exports, Help and local Power BI measure labels. Startup migrates legacy classifications without changing record IDs or assignments. Existing integration keys such as `billing_type`, `billable_task_ids`, `non_billable_task_ids`, `billable_hours`, SQLite `billable`, Power BI `isBillable` and the SharePoint `Billable` field remain stable for existing integrations; their values now reflect Productive/Non-Productive tasks.
