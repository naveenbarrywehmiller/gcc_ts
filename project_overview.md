# ⏰ 9000 Timesheet — Project Overview

## Summary

A **self-hosted internal employee timesheet web application** built for organizations that need time tracking without cloud dependency. The system supports a full approval workflow (draft → submitted → approved/rejected → recalled) and ships with reporting, Excel import/export, audit logging, and Docker support.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite 8 + Tailwind CSS 3 |
| **Backend** | Node.js + Express 4 |
| **Database** | SQLite via `better-sqlite3` (synchronous, file-based) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt password hashing |
| **UI Icons** | `lucide-react` |
| **HTTP Client** | Axios |
| **PDF/Excel Export** | `jspdf`, `jspdf-autotable`, `xlsx`, `file-saver` |
| **Security** | `helmet`, `express-rate-limit`, CORS config |
| **Containerization** | Docker + `docker-compose` |
| **Dev tooling** | Nodemon, ESLint |

---

## Project Structure

```
9000 Timesheet/
├── client/                        # React + Vite frontend
│   └── src/
│       ├── App.jsx                # Router + context providers
│       ├── index.css              # Tailwind + custom CSS
│       ├── components/
│       │   ├── layout/            # Sidebar, Header, Footer, Layout
│       │   └── ui/                # Modal, SearchableSelect, Skeleton
│       ├── contexts/
│       │   ├── AuthContext.jsx    # JWT auth state + login/logout
│       │   ├── ThemeContext.jsx   # Dark/light mode
│       │   └── ToastContext.jsx   # Toast notification system
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Timesheet.jsx      # Main employee timesheet grid (largest: 36KB)
│       │   ├── Reports.jsx        # Admin analytics + export (21KB)
│       │   └── admin/
│       │       ├── Users.jsx      # User CRUD + division assignment (22KB)
│       │       ├── Approvals.jsx  # Weekly approval workflow (22KB)
│       │       ├── Projects.jsx
│       │       ├── Tasks.jsx
│       │       ├── Holidays.jsx
│       │       ├── Import.jsx     # Excel bulk import
│       │       ├── AuditLog.jsx
│       │       └── SimpleListManager.jsx  # Divisions + Activities
│       └── services/
│           └── api.js             # Axios instance with JWT interceptors
│
└── server/                        # Node.js + Express backend
    └── src/
        ├── index.js               # App entry: middleware, routes, static serving
        ├── config/
        │   ├── env.js             # Environment config with defaults
        │   ├── db.js              # better-sqlite3 connection
        │   ├── migrate.js         # Schema creation + incremental migrations
        │   └── seed.js            # Sample data seeder
        ├── middleware/
        │   ├── auth.js            # JWT authenticate + role authorize
        │   └── errorHandler.js    # 404 + global error handler
        └── routes/
            ├── auth.js            # Login, /me, change-password
            ├── users.js           # Full user CRUD, soft/hard delete, divisions
            ├── projects.js        # Project CRUD
            ├── tasks.js           # Task CRUD
            ├── divisions.js       # Division CRUD
            ├── activities.js      # Activity CRUD
            ├── holidays.js        # Holiday management
            ├── timesheets.js      # Core timesheet logic + approval workflow
            ├── reports.js         # Dashboard, utilization, project hours, export
            ├── import.js          # Excel bulk import (projects, users, tasks, divisions)
            └── audit.js           # Audit log retrieval
```

---

## Database Schema

```
users           — id, name, email, password_hash, role, division, core, team_type, active
divisions       — id, name, active
activities      — id, name, active
projects        — id, project_code, project_name, customer_name, activity, division, team_type, active
tasks           — id, classification, task_category, task_description, active
timesheets      — id, user_id, project_id, task_id, work_date, hours, description,
                  week_number, week_year, admin_comment, status
holidays        — id, date, name
audit_logs      — id, user_id, action, details, entity_type, entity_id, old_value,
                  new_value, ip_address
admin_divisions — id, user_id, division_id  (admin→division assignment)
```

**Timesheet Status Flow:**
```
draft → submitted → approved
                  → rejected → (re-edit) → submitted
approved / submitted → recalled → (re-edit) → submitted
```

---

## API Endpoints

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/login` | Login, returns JWT |
| GET | `/me` | Current user info |
| POST | `/change-password` | Change own password |

### Users (`/api/users`) — Admin only
| Method | Path | Description |
|---|---|---|
| GET | `/` | List users (search, filter) |
| POST | `/` | Create user |
| GET | `/:id` | Get user |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Soft delete (deactivate) |
| DELETE | `/:id/permanent` | Anonymize/hard-delete user |
| POST | `/:id/toggle-active` | Toggle active status |
| POST | `/:id/reset-password` | Admin reset password |
| GET | `/:id/divisions` | Get admin's assigned divisions |
| PUT | `/:id/divisions` | Assign divisions to admin |
| GET | `/generate-password` | Generate a random secure password |
| GET | `/active-count` | Total active users |

### Timesheets (`/api/timesheets`)
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | Employee/Admin | Weekly entries (`?week=&year=`) |
| GET | `/all` | Admin | All entries with filters |
| GET | `/summary` | Admin | Weekly summary for approval |
| POST | `/` | Employee | Upsert single entry |
| POST | `/batch` | Employee | Batch save (auto-save) |
| DELETE | `/:id` | Employee/Admin | Delete a draft entry |
| POST | `/submit` | Employee | Submit week for approval |
| POST | `/approve` | Admin | Approve a user's week |
| POST | `/reject` | Admin | Reject with comment |
| POST | `/recall` | Admin/Employee | Recall approved/submitted week |

### Reports (`/api/reports`) — Admin only
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Stats, recent submissions, hours breakdown |
| GET | `/utilization` | Per-user utilization % (week or month) |
| GET | `/project-hours` | Hours per project |
| GET | `/weekly-summary` | Per-user, per-week summary for a month |
| GET | `/export` | Raw JSON data (client converts to Excel/PDF) |

### Other
- `GET/POST/PUT/DELETE /api/projects`
- `GET/POST/PUT/DELETE /api/tasks`
- `GET/POST/PUT/DELETE /api/divisions`
- `GET/POST/PUT/DELETE /api/activities`
- `GET/POST/PUT/DELETE /api/holidays`
- `POST /api/import/{projects,users,tasks,divisions}` — Excel import
- `GET /api/audit` — Audit log retrieval
- `GET /api/health` — Health check

---

## Key Features

### Employee Experience
- Weekly grid timesheet view with project/task dropdowns (searchable)
- Auto-save drafts every 30 seconds via batch endpoint
- ISO 8601 week numbering (compatible with Microsoft Outlook)
- Submit/recall workflow
- Dashboard shows personal stats, recalled timesheet alerts, recent entries

### Admin Experience
- Approval dashboard with per-user weekly summaries
- Bulk approve/reject with optional comment
- Admin recall of any submitted/approved timesheet
- User CRUD with secure random password generation, division assignment
- Excel import for projects, users, tasks, divisions
- Excel/PDF export from Reports page
- Holiday management
- Full audit log (all key actions tracked with IP + before/after values)

### Security
- bcrypt (12 rounds) password hashing
- JWT auth with 7-day expiry (configurable)
- Role-based middleware (`authenticate` + `authorize`)
- Parameterized SQL queries (no injection risk)
- Per-token rate limiting (2000 req/15 min)
- Helmet security headers
- CORS restricted to configured origin
- Soft/anonymized deletes preserve historical integrity

---

## Observations & Potential Improvements

> [!NOTE]
> The following are observations based on a full code review. These are not bugs but areas worth considering.

| Area | Observation |
|---|---|
| **No email notifications** | Approval/rejection only shows in UI. No email alerts when a timesheet is approved/rejected. |
| **SQLite in Docker** | The DB file is inside the container (`./data/`). While a volume is used, migrating to a robust DB like PostgreSQL could be better for scale. |

---

## How to Run

```bash
# Backend (port 3001)
cd server && npm run dev

# Frontend (port 5173)
cd client && npm run dev
```

Default login: `admin@company.com` / `admin123`
