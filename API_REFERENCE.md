# 📡 GCC TimeSheet — REST API Reference

Complete documentation for the GCC TimeSheet backend REST API.

---

## 🌐 Base URLs

| Environment | Base URL |
|---|---|
| **Local Raspberry Pi** | `http://192.168.0.50:3001` |
| **Tailscale Funnel (Public HTTPS)** | `https://dietpi.tail4f2b8f.ts.net` |
| **Local Development** | `http://localhost:3001` |

---

## 🔐 Authentication

The API uses **JWT tokens** stored in `HttpOnly` secure cookies (`token` and `refreshToken`), or passed via the `Authorization: Bearer <token>` header.

### Roles & Access Levels
* **Public**: Accessible without login.
* **User**: Any authenticated employee.
* **Manager**: Managers can review and approve team timesheets.
* **Admin**: Full administrative permissions.

---

## 📑 Endpoints by Category

### 1. System & Health

#### Check Service Health & Version
```http
GET /api/health
```
* **Auth**: None (Public)
* **Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2026-09-27T10:28:26.818Z",
  "version": "v1.7.2"
}
```

---

### 2. Authentication

#### Email & Password Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```
* **Response (200 OK)**: Sets `token` cookie and returns user object:
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

#### Logout
```http
POST /api/auth/logout
```
* **Response (200 OK)**: Clears authentication cookies.

#### Refresh Access Token
```http
POST /api/auth/refresh
```

#### Get Current User Profile
```http
GET /api/auth/me
```
* **Auth**: User

#### Microsoft 365 / Entra ID SSO
```http
POST /api/auth/ms/login
Content-Type: application/json

{
  "idToken": "eyJhbGciOi..."
}
```

---

### 3. Timesheet Management

#### Get Current User Timesheets
```http
GET /api/timesheets?year=2026&week=39
```
* **Auth**: User
* **Query Parameters**:
  * `year` (optional): Filter by year (e.g. `2026`)
  * `week` (optional): Filter by ISO week number (e.g. `39`)

#### Save Single Time Entry
```http
POST /api/timesheets
Content-Type: application/json

{
  "project_id": 10,
  "task_id": 25,
  "date": "2026-09-28",
  "hours": 8,
  "description": "Implemented database migration"
}
```

#### Batch Save Timesheets (Weekly Grid)
```http
POST /api/timesheets/batch
Content-Type: application/json

{
  "year": 2026,
  "week_number": 39,
  "entries": [
    {
      "project_id": 10,
      "task_id": 25,
      "date": "2026-09-28",
      "hours": 8,
      "description": "Backend API"
    }
  ]
}
```

#### Delete a Time Entry
```http
DELETE /api/timesheets/:id
```

#### Submit Timesheet for Approval
```http
POST /api/timesheets/submit
Content-Type: application/json

{
  "year": 2026,
  "week_number": 39
}
```

#### Recall Submitted Timesheet
```http
POST /api/timesheets/recall
Content-Type: application/json

{
  "year": 2026,
  "week_number": 39
}
```

#### Approve Timesheet
```http
POST /api/timesheets/approve
Content-Type: application/json

{
  "user_id": 5,
  "year": 2026,
  "week_number": 39
}
```
* **Auth**: Manager or Admin

#### Reject Timesheet
```http
POST /api/timesheets/reject
Content-Type: application/json

{
  "user_id": 5,
  "year": 2026,
  "week_number": 39,
  "reason": "Missing description on Wednesday"
}
```

#### Post / Finalize Timesheet
```http
POST /api/timesheets/post
Content-Type: application/json

{
  "user_id": 5,
  "year": 2026,
  "week_number": 39
}
```
* **Auth**: Admin

---

### 4. Manager Endpoints

#### List Pending Approvals
```http
GET /api/manager/pending-approvals
```
* **Auth**: Manager or Admin
* **Description**: Returns all timesheets awaiting approval for the manager's assigned team.

#### View Detailed Employee Week
```http
GET /api/manager/week-details/:userId/:year/:week
```
* **Auth**: Manager or Admin

---

### 5. Reports & Analytics

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/reports/dashboard` | Summary statistics for user dashboard | User |
| `GET` | `/api/reports/utilization` | Utilization % per user over date range | Admin |
| `GET` | `/api/reports/project-hours` | Total hours aggregated by project | Admin |
| `GET` | `/api/reports/project-hours-detail` | Detailed audit records per project | Admin |
| `GET` | `/api/reports/weekly-summary` | Company-wide weekly hours summary | Admin |
| `GET` | `/api/reports/export?format=xlsx` | Export timesheets to Excel (`.xlsx`) or PDF | Admin |

---

### 6. Power BI Integration (Read-Only)

All Power BI endpoints require the API Key specified via `X-API-Key` header or `?api_key=` query parameter.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/powerbi/version` | Connector version & schema info |
| `GET` | `/api/powerbi/timesheets` | Flat table of timesheet entries |
| `GET` | `/api/powerbi/users` | User directory table |
| `GET` | `/api/powerbi/projects` | Master project catalog |
| `GET` | `/api/powerbi/tasks` | Task breakdown table |
| `GET` | `/api/powerbi/divisions` | Corporate divisions |
| `GET` | `/api/powerbi/departments` | Departments table |
| `GET` | `/api/powerbi/holidays` | Company holidays schedule |
| `GET` | `/api/powerbi/assignments` | User-project assignments |
| `GET` | `/api/powerbi/status-summary` | Aggregated submission statuses |
| `GET` | `/api/powerbi/export` | Complete schema bundle dump |

---

### 7. Master Data CRUD

Standard REST patterns (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`):

| Entity | Base Path | Key Fields |
|---|---|---|
| **Users** | `/api/users` | `name`, `email`, `role`, `division_id`, `department_id` |
| **Active Users Count** | `/api/users/active-count` | Returns `{ online: N, total: M }` |
| **Projects** | `/api/projects` | `name`, `code`, `status`, `division_id` |
| **Tasks** | `/api/tasks` | `name`, `project_id`, `billable` |
| **Divisions** | `/api/divisions` | `name`, `code` |
| **Subdivisions** | `/api/subdivisions` | `name`, `division_id` |
| **Departments** | `/api/departments` | `name`, `division_id` |
| **Supporting Categories** | `/api/supporting-categories` | `name` (Flex Team / Dedicated Team) |
| **Activities** | `/api/activities` | `name`, `category` |
| **Holidays** | `/api/holidays` | `name`, `date` |

---

### 8. System Administration

#### View Audit Trail
```http
GET /api/audit?page=1&limit=50
```
* **Auth**: Admin

#### Import Master Data (CSV)
```http
POST /api/import
Content-Type: multipart/form-data
```
* **Auth**: Admin

#### SharePoint Sync
* `GET /api/sharepoint-sync/status` — Get sync state
* `POST /api/sharepoint-sync/week` — Trigger sync for a specific week
* `POST /api/sharepoint-sync/full` — Trigger full historical sync
