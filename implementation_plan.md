# GCC Timesheet → Microsoft 365 Migration Plan

## Phase 1 — Discovery: Existing Application Analysis

This document covers the complete analysis of the existing application and the phased migration plan to Microsoft 365 (SharePoint + Entra ID + Power Automate + Power BI).

---

## A. Existing Application Analysis

### Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19 + Vite 8 + Tailwind CSS 3 | ESM modules, `@tanstack/react-query` v5 |
| **Backend** | Node.js + Express 4 | CommonJS, PM2 for production |
| **Database** | SQLite via `better-sqlite3` | File-based at `server/src/data/timesheet.db`, WAL mode |
| **Authentication** | JWT + bcrypt | HttpOnly cookies (15-min access + 30-day refresh), auto-refresh interceptor |
| **HTTP Client** | Axios | Token auto-refresh via response interceptor |
| **Server Export** | `exceljs` + `pdfkit-table` | Server-side generation |
| **Security** | `helmet`, `express-rate-limit`, CORS | Rate limited per token |
| **Containerization** | Docker + docker-compose | GitHub Container Registry |

---

### Database Schema (Current SQLite)

```
users              — id, name, email, password_hash, role(admin|employee),
                     division(text), core, team_type, active,
                     division_id(FK), department_id(FK), supporting_category_id(FK),
                     last_seen_at, created_at, updated_at

divisions          — id, name, active
subdivisions       — id, name, division_id(FK), active
departments        — id, name, active
supporting_categories — id, name, active
activities         — id, name, active
admin_divisions    — id, user_id(FK), division_id(FK)

projects           — id, project_code, project_name, customer_name, activity,
                     division(text), team_type, division_id(FK), subdivision_id(FK), active

tasks              — id, classification(Billable|Non-Billable), task_category,
                     task_description, requires_project(0|1), active

timesheets         — id, user_id(FK), project_id(FK nullable), task_id(FK),
                     work_date, hours(0-24), description,
                     week_number, week_year, admin_comment,
                     status(draft|submitted|approved|rejected|recalled),
                     division_id(FK), subdivision_id(FK),
                     project_description, ownership_id(FK),
                     created_at, updated_at

holidays           — id, date(UNIQUE), name
audit_logs         — id, user_id, action, details, entity_type, entity_id,
                     old_value, new_value, ip_address, created_at
department_ownerships — id, department_id(FK), label, active
```

---

### API Endpoints (15 route groups — 40+ endpoints)

| Group | Access | Description |
|---|---|---|
| `/api/auth` | Public/Cookie | Login, refresh, logout, /me, change-password |
| `/api/users` | Admin | CRUD, soft/hard delete, password reset, division assignment |
| `/api/projects` | Auth/Admin | Project CRUD with division/subdivision FKs |
| `/api/tasks` | Auth/Admin | Task CRUD (Billable/Non-Billable classification) |
| `/api/divisions` | Auth/Admin | Division CRUD |
| `/api/subdivisions` | Auth/Admin | Subdivision CRUD |
| `/api/departments` | Auth/Admin | Department CRUD |
| `/api/department-ownerships` | Auth/Admin | Ownership label CRUD |
| `/api/supporting-categories` | Auth/Admin | Team type categories |
| `/api/activities` | Auth/Admin | Activity types |
| `/api/holidays` | Auth/Admin | Holiday calendar |
| `/api/timesheets` | Auth/Admin | Full workflow: upsert, batch, submit, approve, reject, recall |
| `/api/reports` | Auth/Admin | Dashboard, utilization, project-hours, export (Excel/PDF/JSON) |
| `/api/import` | Admin | Excel bulk import for projects/users/tasks/divisions |
| `/api/audit` | Admin | Audit log retrieval |

---

### Key Business Logic

1. **Dedicated vs Flex Team**: `supporting_category` controls division access. "Dedicated Team" can only log against assigned division; "Flex Team" can log against any.
2. **Weekly Timesheet Grid**: Per-day per-project/task entries; ISO 8601 week numbers (Outlook-compatible).
3. **Auto-save**: Batch endpoint called every 30 seconds.
4. **Soft deletes**: All reference data uses `active=0` flags.
5. **Duplicate prevention**: Unique indexes on `(user_id, project_id, work_date)`.
6. **24-hour daily cap**: Enforced server-side.
7. **Status machine**: `draft → submitted → approved/rejected → recalled → submitted`
8. **Audit logging**: All key actions logged with entity tracking and IP.

---

### Existing Authentication Flow

```
Browser → POST /api/auth/login (email + password)
       ← HttpOnly cookies: token (15-min) + refreshToken (30-day)

Request → Cookie sent automatically
       ← 401 → auto-refresh interceptor → retry

localStorage: non-sensitive profile only (name, email, role)
```

---

## B. Feature Inventory

### KEEP (unchanged)

| Feature | Reason |
|---|---|
| Weekly timesheet grid UI | Best-in-class UX |
| Auto-save every 30 seconds | Excellent UX |
| Dark/Light mode | User preference |
| Excel/PDF server-side export | Working correctly |
| Excel bulk import | Working admin tool |
| Holiday calendar | Business requirement |
| Audit logging | Compliance essential |
| Soft-delete pattern | Data integrity |
| ISO 8601 week numbering | Outlook-compatible |
| Toast notification system | Good UX |
| Skeleton loaders | Good UX |
| SearchableSelect component | Good UX |
| Dedicated/Flex team logic | Core business rule |
| Per-token rate limiting | Security |
| HttpOnly cookies | Security |
| JWT refresh token pattern | Security |
| Daily 24h cap validation | Business rule |
| Recall workflow | Business requirement |
| Admin division assignments | Business requirement |

### MODIFY (for M365 compatibility)

| Feature | Current | New |
|---|---|---|
| **Authentication** | Email+password JWT | Add MSAL Entra ID as primary; preserve local as fallback |
| **Role system** | `admin` \| `employee` | Add `manager` role |
| **Approval workflow** | Admin-only in UI | Add Power Automate webhook trigger on submit |
| **ENV config** | 5 variables | Expand with M365 variables |
| **Reports API** | SQLite only | Add Power BI export endpoint |

### REMOVE

Nothing. Everything preserved.

### ADD (new M365 functionality)

| Feature | Description |
|---|---|
| Microsoft Entra ID / MSAL auth | OAuth2 PKCE flow |
| SharePoint sync layer | Optional bridge to write to SP lists |
| Power Automate webhook endpoint | PA calls back on approval/rejection |
| Manager role | Team-level approvals |
| Power BI export endpoint | Flat JSON for PBI dataset refresh |
| `billable` column on timesheets | Denormalized for PBI performance |
| ARCHITECTURE.md | Architecture diagram + decisions |
| SHAREPOINT_SETUP.md | Admin guide for SP list creation |
| POWER_AUTOMATE_SETUP.md | PA flow setup guide |
| POWER_BI_SETUP.md | PBI connection + data model |
| MIGRATION.md | Data migration guide |
| Data export script | SQLite → SharePoint CSV generator |

---

## C. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| SQLite WAL has 3MB uncommitted data | Medium | Checkpoint WAL before migration |
| Only 2 roles (admin/employee) | High | Add manager role in Phase 5 |
| No email notifications | Medium | Power Automate fills this gap |
| SharePoint 5,000-item threshold | High | Index all lookup columns from day one |
| Single-origin CORS | Low | Update for M365 auth redirect URIs |

---

## D. New Architecture Overview

```
┌─────────────────────────────────────────────────┐
│            GCC Timesheet Web App                │
│    (React 19 + Vite, existing UI preserved)     │
└────────────────────┬────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
┌──────────┐  ┌────────────┐  ┌──────────────┐
│ Local    │  │ MSAL/Entra │  │ Express API  │
│ Auth     │  │ ID         │  │ (SQLite)     │
│(fallback)│  │ (primary)  │  │              │
└──────────┘  └─────┬──────┘  └──────┬───────┘
                    │                │
                    ▼                ▼
            ┌──────────────┐  ┌─────────────────┐
            │ Microsoft    │  │ SharePoint Sync  │
            │ Graph API    │  │ (optional)       │
            └──────┬───────┘  └────────┬─────────┘
                   │                   │
                   └─────────┬─────────┘
                             ▼
                   ┌─────────────────────┐
                   │   SharePoint Lists  │
                   │ (Common Data Layer) │
                   └──────────┬──────────┘
                              │
              ┌───────────────┴────────────────┐
              ▼                               ▼
    ┌──────────────────┐            ┌──────────────────┐
    │  Power Automate  │            │    Power BI      │
    │  Approval Flows  │            │   Dashboards     │
    └──────────────────┘            └──────────────────┘
```

---

## E. SharePoint List Schema (9 Lists)

### TS_Divisions
| Column | Type |
|---|---|
| Title | Single line text (required) |
| Description | Multiple lines |
| IsActive | Yes/No (default: Yes) |

### TS_Subdivisions
| Column | Type |
|---|---|
| Title | Single line text (required) |
| DivisionLookup | Lookup → TS_Divisions |
| Description | Multiple lines |
| IsActive | Yes/No |

### TS_Departments
| Column | Type |
|---|---|
| Title | Single line text (required) |
| IsActive | Yes/No |

### TS_DepartmentOwnerships
| Column | Type |
|---|---|
| Title | Single line text — ownership label |
| DepartmentLookup | Lookup → TS_Departments |
| IsActive | Yes/No |

### TS_Employees
| Column | Type | Notes |
|---|---|---|
| Title | Single line text | Full name |
| Email | Single line text | **Indexed** |
| Department | Single line text | From Entra ID |
| DivisionLookup | Lookup → TS_Divisions | |
| SubdivisionLookup | Lookup → TS_Subdivisions | |
| Manager | Person | M365 people picker |
| Role | Choice | Employee \| Manager \| Admin |
| SupportingCategory | Choice | Dedicated Team \| Flex Team |
| IsActive | Yes/No | |

### TS_Projects
| Column | Type | Notes |
|---|---|---|
| Title | Single line text | Project name |
| ProjectCode | Single line text | **Indexed**, unique |
| CustomerName | Single line text | |
| DivisionLookup | Lookup → TS_Divisions | |
| SubdivisionLookup | Lookup → TS_Subdivisions | |
| Activity | Single line text | |
| TeamType | Choice | Dedicated \| Flex |
| IsActive | Yes/No | |

### TS_Tasks
| Column | Type | Notes |
|---|---|---|
| Title | Single line text | Task category name |
| Classification | Choice | Billable \| Non-Billable |
| TaskDescription | Multiple lines | |
| RequiresProject | Yes/No | |
| IsActive | Yes/No | |

### TS_Holidays
| Column | Type | Notes |
|---|---|---|
| Title | Single line text | Holiday name |
| HolidayDate | Date only | **Indexed** |

### TS_TimesheetEntries (Core fact list)

| Column | Type | Notes |
|---|---|---|
| Title | Single line text | Auto: `{Email}_{Date}_{Code}` |
| EmployeeLookup | Lookup → TS_Employees | **Indexed** |
| EmployeeEmail | Single line text | **Indexed** (redundant, for PA/PBI) |
| WorkDate | Date only | **Indexed** |
| WeekNumber | Number | ISO 8601 |
| WeekYear | Number | |
| WeekStart | Date only | |
| WeekEnd | Date only | |
| ProjectLookup | Lookup → TS_Projects | Nullable |
| TaskLookup | Lookup → TS_Tasks | Nullable |
| DivisionLookup | Lookup → TS_Divisions | **Indexed** |
| SubdivisionLookup | Lookup → TS_Subdivisions | |
| OwnershipLookup | Lookup → TS_DepartmentOwnerships | |
| Hours | Number | 0–24 |
| Description | Multiple lines | |
| Billable | Yes/No | Derived from task classification |
| Status | Choice | Draft \| Submitted \| Approved \| Rejected \| Recalled |
| SubmittedDate | Date and Time | |
| ApprovedDate | Date and Time | |
| RejectedDate | Date and Time | |
| ApproverEmail | Single line text | |
| ApproverComments | Multiple lines | |
| ProjectDescription | Multiple lines | |

> [!WARNING]
> SharePoint has a **5,000-item list view threshold**. With 50 employees × 5 days × 52 weeks = ~13,000 entries/year, indexing on `EmployeeEmail`, `WorkDate`, `DivisionLookup`, and `Status` is **mandatory from day one**.

---

## F. Authentication Design

### Primary: Microsoft Entra ID (MSAL)

**OAuth2 Authorization Code + PKCE flow (browser)**

```
Browser → MSAL SDK → Microsoft login page
       ← ID token + Access token

Browser → POST /api/auth/ms-callback { msalToken }
Server  → Validate with MS public keys
        → Extract email, name, department from claims
        → Find/create user in SQLite
        → Issue HttpOnly session cookie (same mechanism as local auth)
       ← User profile
```

**Required Entra ID App Registration:**
```
Type:     Single Page Application (SPA)
Redirect: https://your-domain/auth/callback
          http://localhost:5173/auth/callback (dev)
Scopes:   User.Read, User.ReadBasic.All, offline_access
Optional: Sites.ReadWrite.All (for SharePoint sync)
```

### Fallback: Existing Local Auth
`POST /api/auth/login` preserved unchanged for local dev, service accounts, and emergency access.

---

## G. Power Automate Approval Workflow

### On Submit Trigger

When employee submits, app POSTs to PA HTTP trigger:
```json
{
  "employeeEmail": "john@company.com",
  "employeeName": "John Smith",
  "weekNumber": 33,
  "weekYear": 2026,
  "weekStart": "2026-08-10",
  "weekEnd": "2026-08-16",
  "totalHours": 40,
  "timesheetUrl": "https://app.company.com/timesheet",
  "callbackUrl": "https://api.company.com/api/timesheets/pa-callback",
  "callbackSecret": "..."
}
```

### Flow Steps
```
1. HTTP Trigger (receive submission)
2. Get Manager via Graph API: GET /users/{email}/manager
3. Send Teams/Outlook Approval card to manager
4. Wait up to 7 days
5a. Approved → PATCH /pa-callback {status:'approved', approver, comments}
              → Email confirmation to employee
5b. Rejected  → PATCH /pa-callback {status:'rejected', approver, comments}
              → Email with comments to employee
5c. Timeout   → Escalate to admin (configurable)
```

### New Backend Endpoint
`PATCH /api/timesheets/pa-callback` — validates shared secret header, updates status in SQLite (and optionally SharePoint).

---

## H. Power BI Data Model

### Star Schema

```
FactTimesheet
  ├── DimEmployee   (EmployeeLookup)
  ├── DimDate       (generated date dimension)
  ├── DimProject    (ProjectLookup)
  ├── DimDivision   (DivisionLookup)
  ├── DimSubdivision(SubdivisionLookup)
  ├── DimTask       (TaskLookup — Classification, RequiresProject)
  └── DimDepartment (DepartmentLookup)
```

### Key DAX Measures
```dax
Total Hours = SUM(FactTimesheet[Hours])
Billable Hours = CALCULATE([Total Hours], FactTimesheet[Billable] = TRUE)
Billable % = DIVIDE([Billable Hours], [Total Hours], 0)
Avg Hours/Employee = DIVIDE([Total Hours], DISTINCTCOUNT(FactTimesheet[EmployeeEmail]))
Pending Approvals = CALCULATE(
    DISTINCTCOUNT(FactTimesheet[EmployeeEmail]),
    FactTimesheet[Status] = "Submitted"
)
```

### Dashboard Pages
1. **Executive Overview** — KPI tiles: Total Hours, Billable %, Employees, Projects, Pending Approvals
2. **Employee Analysis** — Weekly/monthly hours per employee, project allocation
3. **Project Analysis** — Hours by project trend, billable/non-billable split
4. **Department Analysis** — Division/subdivision utilization heatmap
5. **Timesheet Compliance** — Submission status by week, missing/late detection

---

## User Review Required

> [!IMPORTANT]
> **Before execution begins, please confirm the following 7 decisions:**
>
> 1. **Entra ID credentials** — Do you have tenant ID + client ID available, or should all M365 config use placeholder variables?
> 2. **SharePoint Site** — Does a SharePoint site already exist, or should setup docs create a new one?
> 3. **Manager Role** — Add a `manager` role for team-level approvals, or keep all approvals admin-only?
> 4. **Auth Strategy** — MSAL as primary with local as dev fallback, or both equally available?
> 5. **Power Automate** — Actually trigger PA webhook on submit, or only document the design?
> 6. **SharePoint Sync** — Dual-write (SQLite + SharePoint simultaneously), or periodic export only?
> 7. **Execution Scope** — Which phases should be implemented NOW?

---

## Open Questions

> [!IMPORTANT]
> **Q1**: Should "Sign in with Microsoft" replace or sit alongside the existing email/password form?
>
> **Q2**: Should the Dedicated/Flex Team business logic be replicated in SharePoint list validation rules?
>
> **Q3**: The `activities`, `departments`, `supporting_categories`, and `department_ownerships` tables don't map directly to the M365 model. Preserve as-is or restructure?
>
> **Q4**: Should the Manager role be auto-assigned from Entra ID directory (user's actual manager) or manually assigned in the admin panel?
>
> **Q5**: Should the plan include a script to export existing SQLite data to SharePoint-compatible CSV files?

---

## Proposed Changes — Phased

### Phase 2 — Documentation & Schema Design (No code risk)

#### [NEW] ARCHITECTURE.md
Full architecture diagram + decision log.

#### [NEW] SHAREPOINT_SETUP.md
Step-by-step SharePoint admin guide:
- Site creation
- All 9 lists with column types
- Index creation
- Permission levels
- PnP PowerShell automation script

#### [NEW] POWER_AUTOMATE_SETUP.md
- HTTP trigger config
- Approval action setup
- Teams/email templates
- Callback endpoint config

#### [NEW] POWER_BI_SETUP.md
- SharePoint Online data source connection
- Star schema relationship setup
- DAX measure library
- Dashboard layout specs

#### [MODIFY] .env.example
Add all M365 configuration placeholders.

---

### Phase 3 — Data Layer (SharePoint Integration)

#### [NEW] server/src/services/sharepoint.js
SP REST API / Microsoft Graph client:
- Token acquisition (client credentials flow — server-side only)
- CRUD for each SP list
- Retry + exponential backoff
- 429 throttle handling

#### [NEW] server/src/repositories/TimesheetRepository.js
Repository abstraction pattern:
```javascript
// Allows switching/dual-writing without changing route logic
class TimesheetRepository {
  constructor(mode) {} // 'sqlite' | 'sharepoint' | 'dual'
  async getWeekEntries(userId, week, year) {}
  async upsertEntry(entry) {}
  async submitWeek(userId, week, year) {}
  async approveWeek(userId, week, year, comment) {}
}
```

#### [NEW] server/src/routes/sharepoint-sync.js
Admin-only endpoint to trigger bulk SQLite → SharePoint sync.

---

### Phase 4 — Authentication (MSAL)

#### [MODIFY] client/src/pages/Login.jsx
Add "Sign in with Microsoft" button (feature-flagged).

#### [NEW] client/src/services/msal.js
MSAL.js configuration + token acquisition helpers.

#### [MODIFY] client/src/contexts/AuthContext.jsx
Handle both local JWT and MSAL identity paths.

#### [NEW] server/src/routes/auth-ms.js
`POST /api/auth/ms-callback` — validate MSAL ID token, upsert local user, issue HttpOnly session cookie.

#### [MODIFY] server/src/config/env.js
Add `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENABLE_MSAL_AUTH`.

---

### Phase 5 — Manager Role + Power Automate

#### [MODIFY] server/src/config/migrate.js
Add `manager` to role constraint.

#### [NEW] server/src/routes/manager.js
- `GET /api/manager/team` — team timesheets
- `POST /api/manager/approve` — approve team member
- `POST /api/manager/reject` — reject team member

#### [MODIFY] server/src/routes/timesheets.js
- `POST /submit` → optionally POST to `POWER_AUTOMATE_WEBHOOK_URL`
- `PATCH /pa-callback` → receive PA approval/rejection, validate secret, update status

#### [MODIFY] client/src/App.jsx
Add `ManagerRoute` guard + manager pages.

---

### Phase 6 — Power BI Fields

#### [MODIFY] server/src/config/migrate.js
Add `billable INTEGER` column to timesheets (derived from task classification).

#### [MODIFY] server/src/routes/timesheets.js
Auto-populate `billable` on insert/update.

#### [NEW] server/src/routes/powerbi.js
`GET /api/powerbi/export?apiKey=...` — optimized flat JSON for PBI dataset refresh.

---

### Phase 7 — Data Migration

#### [NEW] scripts/export-to-sharepoint-csv.js
Reads SQLite, generates SP-import-compatible CSVs:
- `employees.csv`, `projects.csv`, `tasks.csv`
- `divisions.csv`, `subdivisions.csv`
- `timesheets.csv` (main fact export)

#### [NEW] MIGRATION.md
1. Pre-migration checklist
2. WAL checkpoint (`PRAGMA wal_checkpoint(FULL)`)
3. Record count validation
4. Data export
5. SharePoint import process
6. Validation queries
7. Cutover plan

---

### Phase 8 — Documentation Finalization

#### [MODIFY] README.md
Full setup: local dev + M365 + Docker + SharePoint.

---

## Environment Variables (Final)

```bash
# ── Existing (unchanged) ──
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=30d
DB_PATH=./data/timesheet.db
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=2000

# ── Microsoft Entra ID (leave blank for local-only) ──
ENTRA_TENANT_ID=your-tenant-id
ENTRA_CLIENT_ID=your-client-id
ENTRA_CLIENT_SECRET=your-client-secret

# ── SharePoint (leave blank to use SQLite only) ──
SHAREPOINT_SITE_URL=https://yourtenant.sharepoint.com/sites/TimeSheet
SHAREPOINT_CLIENT_ID=your-sp-app-client-id
SHAREPOINT_CLIENT_SECRET=your-sp-app-client-secret

# ── Power Automate (leave blank to disable) ──
POWER_AUTOMATE_WEBHOOK_URL=https://prod-xx.logic.azure.com/workflows/.../triggers/...
POWER_AUTOMATE_CALLBACK_SECRET=your-callback-secret

# ── Power BI (leave blank to disable) ──
POWERBI_API_KEY=your-pbi-api-key

# ── Feature Flags ──
ENABLE_MSAL_AUTH=false
ENABLE_SHAREPOINT_SYNC=false
ENABLE_POWER_AUTOMATE=false
```

---

## Summary Assessment

The existing application is **production-quality** with:
- Correct security patterns (HttpOnly cookies, bcrypt, parameterized SQL)
- Good data integrity (soft deletes, audit logs, FK constraints, WAL mode)
- Excellent UX (auto-save, weekly grid, searchable dropdowns, dark mode)
- Proper ISO 8601 week handling (Outlook-compatible)
- Server-side Excel + PDF export
- Docker support

**Migration strategy is strictly additive — nothing is destroyed or removed.** All Microsoft 365 integration is added via feature flags so the app continues to work without any M365 configuration during development and testing.

**Recommended immediate first steps:**
1. Answer the 7 decisions above
2. Approve this phased plan
3. Begin Phase 2 (documentation only — zero code risk)
4. Then Phase 4 (MSAL auth) as the first actual code change
