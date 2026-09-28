# ⏰ GCC TimeSheet

> **Internal Employee Time Tracking System** — A full-stack web application for logging, submitting, approving, and reporting on employee timesheets, with optional Microsoft 365 / Entra ID SSO integration.

---

## 🧱 Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19 | UI framework |
| **Vite** | 8 | Build tool & dev server |
| **React Router v7** | 7 | Client-side routing |
| **TanStack Query** | v5 | Server-state management & caching |
| **@azure/msal-react** | — | Microsoft SSO (optional) |
| **Lucide React** | — | Icon library |
| **Vanilla CSS** | — | Custom design system with dark mode |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | ≥18 | Runtime |
| **Express** | 4 | REST API framework |
| **better-sqlite3** | 11 | SQLite ORM (synchronous, fast) |
| **jsonwebtoken** | 9 | JWT auth (HttpOnly cookie) |
| **jwks-rsa** | 4 | Microsoft Entra ID token validation |
| **bcryptjs** | 2 | Password hashing |
| **helmet** | 8 | HTTP security headers |
| **express-rate-limit** | 7 | API rate limiting |
| **multer** | 1 | File uploads (CSV import) |
| **ExcelJS** | 4 | Excel report generation |
| **PDFKit** | 0.19 | PDF report generation |
| **nodemon** | 3 | Dev auto-restart |
| **PM2** | 7 | Production process manager |

### Database
| Technology | Details |
|---|---|
| **SQLite** (via `better-sqlite3`) | File-based, zero-config, embedded |
| **Location** | `server/data/timesheet.db` |
| **Migrations** | Auto-run on startup via `src/config/migrate.js` |
| **Seeding** | Initial data via `src/config/seed.js` |

### DevOps & Infrastructure
| Technology | Purpose |
|---|---|
| **Docker** | Multi-architecture containerisation (`linux/amd64` + `linux/arm64`) |
| **GitHub Actions** | CI/CD — automated multi-arch build & push to GHCR |
| **GHCR** (GitHub Container Registry) | Docker image hosting |
| **Tailscale Funnel** | Secure public HTTPS tunneling |
| **Watchtower** | Automated container auto-refresh on new releases |
| **Deployment Log** | See [DEPLOYMENT_NOTES.md](./DEPLOYMENT_NOTES.md) for full infrastructure & fix notes |

---

## 🗂️ Project Structure

```
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # Route-level pages
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Timesheet.jsx
│       │   ├── Reports.jsx
│       │   ├── admin/       # Admin-only pages
│       │   └── manager/     # Manager-only pages
│       ├── components/      # Reusable UI components
│       ├── contexts/        # React contexts (Auth, Theme, Toast)
│       └── services/        # API client & MSAL config
│
├── server/                  # Express backend
│   └── src/
│       ├── routes/          # API route handlers (19 route files)
│       ├── config/          # DB, migrations, seed, backup
│       └── utils/           # Shared utilities
│
├── .github/workflows/       # GitHub Actions CI/CD
├── docker-compose.yml       # Docker Compose config
└── Dockerfile               # Multi-stage Docker build
```

---

## ✨ Features

### 👤 Authentication & Roles
- **JWT authentication** stored in secure HttpOnly cookies
- **Three roles**: `admin`, `manager`, `employee`
- **Optional Microsoft SSO** via Azure Entra ID (MSAL) — disabled automatically if `VITE_ENTRA_CLIENT_ID` is not set
- Route-level protection (Admin/Manager guards)

### 🕐 Timesheet Management
- Log hours per day against **Project + Task** combinations
- Support for **non-project tasks** (Leave, Meeting, Training, Admin) that don't require a project
- Weekly view with ISO week number tracking
- Timesheet **status workflow**: `draft → submitted → approved / rejected → recalled`
- **Admin comments** on approval/rejection
- Cumulative project hours tracking

### 📊 Dashboard
- Personal hours summary
- Weekly/monthly breakdowns
- Recent activity overview

### 📁 Organisational Hierarchy
| Entity | Description |
|---|---|
| **Divisions** | Top-level business units |
| **Subdivisions** | Sub-units under divisions |
| **Departments** | Cross-cutting departments |
| **Department Ownerships** | Ownership labels within departments |
| **Supporting Categories** | Team type classification (e.g. Dedicated Team, Flex Team) |
| **Activities** | Project activity types |

### 🗂️ Project & Task Management
- **Projects**: code, name, customer, activity, division, subdivision
- **Tasks**: classification (Billable / Non-Billable), category, description, `requires_project` flag
- Soft-delete (deactivate) for both

### 👔 Manager Features
- **Manager Approvals** page — review and act on team submissions
- Filtered views by division ownership

### 🛡️ Admin Features
| Feature | Route |
|---|---|
| User Management | `/admin/users` |
| Project Management | `/admin/projects` |
| Task Management | `/admin/tasks` |
| Division Management | `/admin/divisions` |
| Subdivision Management | `/admin/subdivisions` |
| Department Management | `/admin/departments` |
| Supporting Categories | `/admin/supporting-categories` |
| Activities | `/admin/activities` |
| Holiday Calendar | `/admin/holidays` |
| Approvals (all users) | `/admin/approvals` |
| CSV/Excel Import | `/admin/import` |
| Audit Log | `/admin/audit` |

### 📈 Reports & Exports
- Filterable reports by user, project, date range, division
- Export to **Excel (.xlsx)** and **PDF**
- Power BI Read-Only REST API endpoints (`/api/powerbi/*` — see [docs/POWERBI.md](docs/POWERBI.md))
- SharePoint sync (`/api/sharepoint-sync`)

### 🔍 Audit Log
- Every create/update/delete action is logged
- Captures: user, action, entity type & ID, old value, new value, IP address

### 🌗 UI/UX
- **Dark mode** support (system preference + manual toggle)
- Toast notifications
- Loading skeletons
- Responsive layout
- Glassmorphism design with animated gradient backgrounds

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9

### 1. Clone & Install

```bash
git clone https://github.com/naveenbarrywehmiller/gcc_ts.git
cd gcc_ts
npm install          # installs both server and client dependencies
```

### 2. Configure Environment

```bash
cp .env.example server/.env
# Edit server/.env with your settings
```

Key variables in `server/.env`:

```env
PORT=3001
JWT_SECRET=your-secret-key
DB_PATH=./data/timesheet.db
CORS_ORIGIN=http://localhost:5173

# Optional: Microsoft SSO
VITE_ENTRA_CLIENT_ID=
VITE_ENTRA_TENANT_ID=
```

### 3. Run Database Migrations & Seed

```bash
npm run setup        # runs migrate + seed
```

### 4. Start Development Servers

```bash
# Terminal 1 — Backend (port 3001)
cd server && npm run dev

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

Open **http://localhost:5173**

### First System Admin

Before the first `npm run setup` or server startup, set `BOOTSTRAP_ADMIN_EMAIL`
and `BOOTSTRAP_ADMIN_PASSWORD` in `server/.env`. Use a unique password of at least
12 characters. For Docker, supply these variables through the container environment.
Startup provisions this account only when no system admin exists; there are no
default login credentials. Remove the bootstrap variables after provisioning.

Existing accounts and passwords are preserved. If an older installation still
uses the former default system-admin password, change it before exposing the app.
Renaming an existing system admin does not create another account on restart.

`npm run setup` seeds reference data. Demo users require `SEED_DEMO_DATA=true`
and are refused in production.

### Local Checks

Run `npm run lint`, `npm run build`, and `npm test` from the repository root.
Tests use isolated in-memory databases and explicit test users; they do not use
or alter the configured application database. The regression suite covers role
assignment, approval scope, rate limits, daily totals, bootstrap provisioning,
SharePoint status dispatch, and client save behavior.

---

## 💾 Database Management

The application includes built-in scripts to safely backup and restore your SQLite database. These commands should be run from within the `server` directory.

### 🚧 Maintenance Mode (Zero-Restart)
To prevent users from modifying data while you take a backup or restore, you can instantly put the app in maintenance mode without stopping PM2:
```bash
cd server
touch .maintenance   # Enables maintenance mode instantly
```
*When finished, simply run `rm .maintenance` to restore normal access.*

### Taking a Backup
While in maintenance mode, safely backup the database (handles WAL mode correctly):
```bash
cd server
npm run backup
```
The backup will be saved to `server/backup/timesheet-YYYY-MM-DD.db`.

### Restoring a Backup
Before restoring, put the app in maintenance mode. Then run:
```bash
cd server
npm run restore -- ./backup/timesheet-YYYY-MM-DD.db
```
*(Replace `timesheet-YYYY-MM-DD.db` with the actual name of your backup file).*

**Important:** After restoring a database, you must restart the server process (e.g., `pm2 restart timesheet-server`) to apply the new database before removing the `.maintenance` file.

---

## 📡 REST API Reference

The backend provides a comprehensive JSON REST API. All endpoints are prefixed with `/api`.

👉 **For the complete documentation with request/response schemas and examples, see [`API_REFERENCE.md`](./API_REFERENCE.md).**

### Quick Endpoints Overview

| Category | Endpoint | Methods | Description |
|---|---|---|---|
| **System** | `/api/health` | `GET` | Service status, timestamp & release version |
| **Auth** | `/api/auth/login` | `POST` | Local user login (sets HttpOnly cookie) |
| | `/api/auth/logout` | `POST` | Clear session cookies |
| | `/api/auth/me` | `GET` | Current user profile & permissions |
| | `/api/auth/ms/login` | `POST` | Microsoft 365 Entra ID SSO |
| **Timesheets** | `/api/timesheets` | `GET`, `POST` | Log and retrieve weekly time entries |
| | `/api/timesheets/batch` | `POST` | Bulk save weekly grid |
| | `/api/timesheets/submit` | `POST` | Submit week for manager approval |
| | `/api/timesheets/recall` | `POST` | Recall submitted timesheet back to draft |
| | `/api/timesheets/approve` | `POST` | Manager/Admin timesheet approval |
| | `/api/timesheets/reject` | `POST` | Manager/Admin timesheet rejection |
| **Manager** | `/api/manager/pending-approvals` | `GET` | Team pending review list |
| | `/api/manager/week-details/:userId/:year/:week` | `GET` | Detailed employee week breakdown |
| **Reports** | `/api/reports/dashboard` | `GET` | Dashboard KPI metrics |
| | `/api/reports/utilization` | `GET` | Employee utilization rates |
| | `/api/reports/project-hours` | `GET` | Project hour aggregations |
| | `/api/reports/export` | `GET` | Export timesheet records to Excel or PDF |
| **Power BI** | `/api/powerbi/*` | `GET` | Secure read-only feeds for Power BI reporting |
| **Master Data** | `/api/users`, `/api/projects`, `/api/tasks`, ... | CRUD | Entity catalogs and management |
| **Admin** | `/api/audit`, `/api/import`, `/api/sharepoint-sync/*` | `GET`, `POST` | Audit logs, CSV import, sync |

---

## 🐳 Docker Deployment Guide (GitHub Container Registry)

Follow these step-by-step instructions to deploy the GCC Timesheet application on any Linux server, Raspberry Pi, Mac, or VM using the pre-built multi-architecture Docker image from GitHub Container Registry (`ghcr.io`).

Both **`linux/arm64`** (Raspberry Pi 3/4/5, Apple Silicon) and **`linux/amd64`** (Intel/AMD x86_64) are supported natively.

---

### Step 1: Install Docker & Docker Compose

Ensure Docker and the Docker Compose plugin are installed on your target machine:

```bash
# Ubuntu / Debian / DietPi / Raspberry Pi OS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Verify installation:
```bash
docker --version
docker compose version
```

---

### Step 2: Create the Project Directory and Storage

Create a dedicated directory on your server (e.g., `/opt/gcc_ts` or `~/gcc_ts`) and set up persistent storage folders for SQLite data, file uploads, and backups:

```bash
# Create directory
sudo mkdir -p /opt/gcc_ts/data /opt/gcc_ts/uploads /opt/gcc_ts/backup
cd /opt/gcc_ts
```

> **Important:** Persistent volume mounts ensure your timesheet database, users, and audit logs are preserved across container updates and restarts.

---

### Step 3: Create `docker-compose.yml`

In `/opt/gcc_ts`, create a `docker-compose.yml` file:

```bash
nano /opt/gcc_ts/docker-compose.yml
```

Paste the following production configuration:

```yaml
services:
  gcc-ts:
    image: ghcr.io/naveenbarrywehmiller/gcc_ts:latest
    container_name: gcc_ts
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=production
      - DB_PATH=./data/timesheet.db
      - CORS_ORIGIN=*
      - JWT_SECRET=replace_with_a_secure_random_key_64_characters
      - JWT_REFRESH_SECRET=replace_with_another_secure_random_key_64_characters
      - BOOTSTRAP_ADMIN_EMAIL=admin@example.com
      - BOOTSTRAP_ADMIN_PASSWORD=replace_with_a_unique_password_12_chars_or_longer
    volumes:
      - /opt/gcc_ts/data:/app/server/data
      - /opt/gcc_ts/uploads:/app/server/uploads
      - /opt/gcc_ts/backup:/app/server/backup
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300 --cleanup --label-enable
```

#### What this configuration does:
* **`image: ghcr.io/naveenbarrywehmiller/gcc_ts:latest`**: Pulls the multi-arch native image directly from GitHub Container Registry.
* **Persistent Volumes**: Maps `/opt/gcc_ts/data` on host ➔ `/app/server/data` in container.
* **`watchtower`**: Automatically checks GHCR every 5 minutes (`--interval 300`), pulls any new GitHub release, and recreates the `gcc_ts` container with zero manual intervention.

---

### Step 4: Pull the Image & Start Containers

Pull the latest multi-architecture image and launch in detached mode:

```bash
cd /opt/gcc_ts
docker compose pull
docker compose up -d
```

---

### Step 5: Verify the Deployment

1. **Check container status:**
   ```bash
   docker compose ps
   ```
   Both `gcc_ts` and `watchtower` should be listed with `Up` status.

2. **Check container logs:**
   ```bash
   docker logs -f gcc_ts
   ```
   You should see:
   ```text
   ✅ Database migrations complete.
   ╔═══════════════════════════════════════════════════╗
   ║         ⏰ Timesheet Server Running               ║
   ║   Local:   http://localhost:3001                  ║
   ║   Network: http://0.0.0.0:3001                    ║
   ║   Mode:    production                             ║
   ╚═══════════════════════════════════════════════════╝
   ```

3. **Check the health & version endpoint:**
   ```bash
   curl -s http://localhost:3001/api/health
   ```
   Expected response:
   ```json
   {"status":"ok","timestamp":"...","version":"v1.7.1"}
   ```

4. **Access in browser:**
   Open `http://<your-server-ip>:3001` in your browser. The login screen should display the active release version tag in the footer.

---

### Step 6: Public HTTPS Access with Tailscale Funnel (Optional)

If your machine runs Tailscale and you want public HTTPS access without opening firewall ports:

```bash
# Enable Tailscale Funnel on port 443 -> local port 3001 in background
tailscale funnel --https=443 --bg 3001
```

Check the funnel status:
```bash
tailscale funnel status
```

Your app is now accessible securely at `https://<your-tailscale-node>.ts.net`!

---

### Step 7: Updates and Maintenance

* **Automatic Updates**: Watchtower checks GHCR every 5 minutes. Whenever a new release is merged to `main`, the container updates automatically.
* **Manual Immediate Update**:
  ```bash
  cd /opt/gcc_ts && docker compose pull && docker compose up -d
  ```
* **Database Backup**:
  The SQLite database is stored on the host at `/opt/gcc_ts/data/timesheet.db`. To take an instant snapshot:
  ```bash
  sqlite3 /opt/gcc_ts/data/timesheet.db ".backup /opt/gcc_ts/backup/backup_$(date +%Y%m%d_%H%M%S).db"
  ```

---

## ⚙️ CI/CD

GitHub Actions workflow (`.github/workflows/docker-build.yml`) automatically:
1. Builds the Docker image on every push to `main`
2. Publishes to GHCR with tags:
   - `latest` — always points to the newest `main` build
   - `main` — branch name tag
   - `<sha>` — commit SHA tag
   - `v*.*` — semantic version tags (on git tags)

---

## 🔒 Security

- Passwords hashed with **bcryptjs**
- JWT stored in **HttpOnly cookies** (not localStorage)
- **Helmet.js** security headers on all responses
- **Rate limiting** on all API routes (configurable via env)
- Input validation on all API endpoints
- Role-based route guards on both frontend and backend

---

## 📝 License

Internal use only. © GCC TimeSheet Team.
