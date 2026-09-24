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
| **Docker** | Containerisation |
| **GitHub Actions** | CI/CD — auto build & push to GHCR |
| **GHCR** (GitHub Container Registry) | Docker image hosting |
| **PM2** | Production process manager |

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
- Power BI integration endpoint (`/api/powerbi`)
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

### Default Admin Credentials
> Set in `server/src/config/seed.js` — change immediately after first login.

---

## 🐳 Docker

### Build & Run with Docker Compose

```bash
docker compose up --build
```

### Pull from GitHub Container Registry

```bash
docker pull ghcr.io/naveenbarrywehmiller/gcc_ts:latest
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
