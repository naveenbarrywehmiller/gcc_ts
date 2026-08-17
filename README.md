# ⏰ TimeSheet — Employee Time Tracking System

A lightweight, modern internal employee timesheet web application built for organizations that need a simple, self-hosted time tracking solution without cloud dependency.

## ✨ Features

### Employee
- 📅 Monthly calendar/grid timesheet view
- ⏱️ Daily hour entry with auto-totals
- 📋 Project & task selection with searchable dropdowns
- 💾 Auto-save drafts (every 30 seconds)
- 📨 Submit for approval workflow
- ⚠️ Validation: max 24h/day, 8h warning, weekend highlighting

### Admin
- 👥 User management (CRUD)
- 📁 Project, task, division, activity management
- ✅ Timesheet approval/rejection workflow
- 📊 Utilization & project hours reports
- 📥 Excel import (projects, users, tasks, divisions)
- 📤 Excel export for reports
- 🗓️ Holiday calendar management
- 📈 Dashboard analytics

### General
- 🌗 Dark / Light mode
- 📱 Mobile responsive
- 🔐 JWT authentication with bcrypt password hashing
- 🏠 LAN accessible — no cloud required
- 🐳 Docker deployment support
- ⚡ Fast SQLite database

### Microsoft 365 Integration (Optional)
- 🔑 **Azure AD / Entra ID:** Single Sign-On (SSO) using `@azure/msal-react`.
- 🗄️ **SharePoint Online:** Dual-write syncing for timesheet records.
- ⚙️ **Power Automate:** Manager approval webhooks and workflow orchestration.
- 📊 **Power BI:** Flat CSV endpoint for direct dashboard import.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ 
- **npm** v9+

### 1. Clone & Install

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies  
cd ../client
npm install
```

### 2. One-Click Launcher (Recommended)

**macOS** — Double-click `start.command` in Finder. First time only, make it executable:

```bash
chmod +x start.command
```

**Windows** — Double-click `start.bat`.

This automates: dependency install, database setup, and starting both servers.

### 3. Manual Setup (Alternative)

#### Setup Database

```bash
cd server
npm run setup   # Runs migrations + seeds sample data
```

This creates the SQLite database and seeds it with:
- **Admin account**: `admin@company.com` / `admin123`
- **Employee accounts**: `john.smith@company.com` / `password123` (and 3 more)
- Sample projects, tasks, divisions, activities, and holidays

### 4. Start Development Servers

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```
Server runs on `http://localhost:3001`

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```
Frontend runs on `http://localhost:5173`

### 5. Open Browser
Navigate to `http://localhost:5173` and login with `admin@company.com` / `admin123`

---

## 🐳 Docker Deployment

### Prebuilt Image (GitHub Container Registry)

```bash
docker pull ghcr.io/naveen-ramalingam/general-gcctimesheet:main
docker run -d -p 3001:3001 \
  -e JWT_SECRET=your-secure-random-string \
  -v timesheet-data:/app/server/data \
  ghcr.io/naveen-ramalingam/general-gcctimesheet:main
```

Access at `http://localhost:3001`

### Build Locally (docker-compose)

```bash
docker-compose up -d --build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | (set in .env) | JWT signing secret — **change in production!** |
| `JWT_EXPIRES_IN` | `7d` | Token expiration |
| `DB_PATH` | `./data/timesheet.db` | SQLite database path |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

### Production Build (without Docker)

```bash
# Build frontend
cd client
npm run build

# Start server (serves frontend from client/dist)
cd ../server
NODE_ENV=production node src/index.js
```

---

## 📁 Project Structure

```
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── layout/      # Sidebar, Header, Layout
│   │   │   └── ui/          # Modal, SearchableSelect, Skeleton
│   │   ├── contexts/        # Auth, Theme, Toast contexts
│   │   ├── pages/           # Route pages
│   │   │   └── admin/       # Admin-only pages
│   │   ├── services/        # API client (axios)
│   │   ├── App.jsx          # Routes & providers
│   │   └── index.css        # Tailwind + custom styles
│   ├── tailwind.config.js
│   └── vite.config.js
├── server/                  # Node.js + Express backend
│   ├── src/
│   │   ├── config/          # DB, env, migrations, seeds
│   │   ├── middleware/      # Auth, error handling
│   │   └── routes/          # API route handlers
│   ├── data/                # SQLite database (auto-created)
│   └── uploads/             # Excel import temp files
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Current user
- `POST /api/auth/change-password` — Change password

### Users (Admin)
- `GET /api/users` — List users
- `POST /api/users` — Create user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Soft-delete

### Projects
- `GET /api/projects` — List (with search)
- `POST /api/projects` — Create
- `PUT /api/projects/:id` — Update
- `DELETE /api/projects/:id` — Soft-delete

### Tasks / Divisions / Activities / Holidays
- Standard CRUD on `/api/tasks`, `/api/divisions`, `/api/activities`, `/api/holidays`

### Timesheets
- `GET /api/timesheets?month=&year=` — Monthly entries
- `POST /api/timesheets` — Create/update entry
- `POST /api/timesheets/batch` — Batch save (auto-save)
- `POST /api/timesheets/submit` — Submit for approval
- `POST /api/timesheets/approve` — Admin approve
- `POST /api/timesheets/reject` — Admin reject
- `GET /api/timesheets/summary` — Monthly summary (admin)

### Reports
- `GET /api/reports/dashboard` — Dashboard data
- `GET /api/reports/utilization` — Utilization report
- `GET /api/reports/project-hours` — Project hours
- `GET /api/reports/export` — Export data

### Import (Admin)
- `POST /api/import/projects` — Import from Excel
- `POST /api/import/users` — Import from Excel
- `POST /api/import/tasks` — Import from Excel
- `POST /api/import/divisions` — Import from Excel

---

## 🔒 Security

- Passwords hashed with **bcrypt** (12 rounds)
- **JWT** authentication with configurable expiry
- Role-based authorization middleware
- Parameterized SQL queries (SQL injection protection)
- Rate limiting on API routes
- Helmet security headers
- Input validation on all endpoints
- CORS configuration

---

## 🌐 LAN Access

To make accessible on your local network:

1. Find your machine's LAN IP: `ipconfig` (Windows) or `ifconfig` (Linux)
2. Update `CORS_ORIGIN` in `.env` to include the LAN IP
3. Access from any device on the network: `http://<LAN-IP>:3001`

---

## 💾 Database Backup & Restore

### Interactive Manager (recommended)

```bash
chmod +x db-manager.sh
./db-manager.sh
```

Menu-driven tool for backup, restore, listing backups, and cron scheduling.

### Manual Backup (safe while running)

```bash
cd server
npm run backup
```

Creates `server/backup/timesheet-YYYY-MM-DD.db` — a consistent SQLite snapshot.

### Manual Restore

```bash
# 1. Stop the server first
# 2. Replace the database:
cd server
npm run restore -- ./backup/timesheet-2026-08-01.db
# 3. Restart the server
```

### Automated daily backup (cron)

```bash
0 2 * * * cd /path/to/server && npm run backup >> /var/log/timesheet-backup.log 2>&1
```

---

## 📝 License

Internal use only. © 2026
