# GCC Timesheet Power BI Integration Guide

This guide explains how authorized users can connect Microsoft Power BI Desktop and Power BI Service to the **GCC Timesheet Read-Only REST API** for corporate reporting, business intelligence, and timesheet analytics.

---

## 1. Overview & Purpose

The GCC Timesheet application provides a dedicated, read-only REST API namespace (`/api/powerbi/*`) designed specifically for Power BI reporting.

### Core Architecture

```
┌───────────────────────────────────────┐
│           Microsoft Power BI          │
│   (Desktop / Service Scheduled Cloud) │
└──────────────────┬────────────────────┘
                   │
                   │ HTTPS (or HTTP in local dev)
                   ▼
┌───────────────────────────────────────┐
│     GCC Timesheet Backend REST API    │
│    (/api/powerbi/* Read-Only Engine)  │
└──────────────────┬────────────────────┘
                   │
                   │ Parameterized SQL queries
                   ▼
┌───────────────────────────────────────┐
│        Internal Database Store        │
│       (SQLite Application Data)       │
└───────────────────────────────────────┘
```

> **IMPORTANT ARCHITECTURAL RULE:**
> Power BI connects exclusively via the REST API over HTTP/HTTPS.
> Power BI **NEVER** connects directly to the SQLite database file, database server, or database container port.
> The database files and ports remain internal and unexposed.

---

## 2. Security & Read-Only Guarantee

1. **Strictly Read-Only:** All write operations (`POST`, `PUT`, `PATCH`, `DELETE`) directed to `/api/powerbi/*` are immediately rejected with `405 Method Not Allowed`.
2. **Credential Scoping:** Dedicated Power BI reporting credentials only grant read access to `/api/powerbi/*`. They cannot modify records, approve timesheets, manage users, or access administrative mutation endpoints.
3. **No Credential Exposure:** Database paths, database credentials, passwords, password hashes, and user session cookies are **never** returned in reporting payloads.
4. **Parameterized Queries:** All server-side filtering uses strict parameter validation and parameterized SQL bindings to eliminate SQL injection risks.
5. **No Frontend UI Exposure:** Power BI endpoints and reporting API keys are never displayed in the React frontend or Admin UI.

---

## 3. Available Endpoints

All endpoints are hosted under `/api/powerbi` (or the configured `POWERBI_API_BASE_PATH`).

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/powerbi/timesheets` | `GET` | Main fact reporting endpoint: timesheet entries with employee, project, hours, and status. |
| `/api/powerbi/users` | `GET` | Read-only dimension table of employees and system users (passwords excluded). |
| `/api/powerbi/divisions` | `GET` | Read-only dimension table of organizational divisions. |
| `/api/powerbi/departments` | `GET` | Read-only dimension table of corporate departments. |
| `/api/powerbi/projects` | `GET` | Read-only dimension table of projects and customer engagements. |
| `/api/powerbi/holidays` | `GET` | Read-only dimension table of company holidays. |
| `/api/powerbi/export` | `GET` | Legacy flat star-schema export for existing Power BI dataset models. |

---

## 4. Authentication Methods

Power BI requests must be authenticated using the server's configured `POWERBI_API_KEY`.
The API supports four flexible authentication mechanisms:

### Option A: HTTP Header `X-API-Key` (Recommended for Power BI Desktop Web queries)
```http
GET /api/powerbi/timesheets HTTP/1.1
Host: gcc-timesheet.company.com
X-API-Key: <YOUR_POWERBI_API_KEY>
```

### Option B: HTTP Header `Authorization: Bearer <token>`
```http
GET /api/powerbi/timesheets HTTP/1.1
Host: gcc-timesheet.company.com
Authorization: Bearer <YOUR_POWERBI_API_KEY>
```

### Option C: Basic Authentication (Native Power BI Web Connector Dialog)
When Power BI prompts for Basic authentication credentials:
- **Username:** `powerbi` (or leave blank)
- **Password:** `<YOUR_POWERBI_API_KEY>`

### Option D: Query Parameter `?apiKey=`
```http
GET /api/powerbi/timesheets?apiKey=<YOUR_POWERBI_API_KEY>
```

*(Note: In production environments, HTTPS should always be used to protect the API key in transit).*

---

## 5. Timesheet Endpoint (`GET /api/powerbi/timesheets`)

### Supported Query Filters

| Parameter | Type | Format | Example | Description |
| :--- | :--- | :--- | :--- | :--- |
| `from` | string | `YYYY-MM-DD` | `2026-01-01` | Filter timesheets on or after this date. |
| `to` | string | `YYYY-MM-DD` | `2026-09-25` | Filter timesheets on or before this date. |
| `employeeId` | string | text / number | `1004` | Filter by specific employee ID or user ID. |
| `division` | string | text | `Engineering` | Filter by division name. |
| `department` | string | text | `Automation` | Filter by department name. |
| `project` | string | text | `PRJ-101` | Filter by project code or project name. |
| `status` | string | enum | `approved` | Allowed: `draft`, `submitted`, `approved`, `rejected`, `recalled`. |
| `page` | integer | integer >= 1 | `1` | Page number for pagination. |
| `limit` | integer | integer (1-50000) | `1000` | Records per page (default: all up to 50,000). |

### Example Request

```http
GET /api/powerbi/timesheets?from=2026-01-01&to=2026-09-25&status=approved HTTP/1.1
Host: gcc-timesheet.company.com
X-API-Key: YOUR_API_KEY_HERE
```

### Response Format

```json
{
  "data": [
    {
      "id": 105,
      "employeeId": "123456",
      "employeeName": "John Smith",
      "email": "john.smith@company.com",
      "division": "Engineering",
      "department": "Automation",
      "admin": "Jane Smith",
      "date": "2026-09-25",
      "week": 39,
      "weekYear": 2026,
      "project": "SCADA Modernization",
      "projectCode": "PRJ-204",
      "projectCategory": "Development",
      "taskClassification": "Billable",
      "hours": 8.0,
      "status": "approved",
      "isBillable": true,
      "submissionDate": "2026-09-25 17:00:00",
      "approvalDate": "2026-09-26 09:30:00",
      "createdDate": "2026-09-25 08:30:00",
      "updatedDate": "2026-09-26 09:30:00"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 50000,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

---

## 6. Reference Data Endpoints

### 6.1 Users API (`GET /api/powerbi/users`)
Returns employees and system users with organizational assignments and active status.
- Excludes: passwords, hashes, session secrets.
- Response format:
```json
{
  "data": [
    {
      "id": 2,
      "employeeId": "1002",
      "employeeName": "John Smith",
      "email": "john.smith@company.com",
      "role": "employee",
      "division": "Engineering",
      "department": "Mechanical",
      "supportingCategory": "Dedicated Team",
      "admin": "System Admin",
      "status": "Active",
      "isActive": true,
      "createdDate": "2026-01-01 00:00:00",
      "updatedDate": "2026-09-25 10:00:00"
    }
  ]
}
```

### 6.2 Divisions API (`GET /api/powerbi/divisions`)
```json
{
  "data": [
    {
      "id": 1,
      "divisionName": "Engineering",
      "status": "Active",
      "isActive": true,
      "createdDate": "2026-01-01 00:00:00"
    }
  ]
}
```

### 6.3 Departments API (`GET /api/powerbi/departments`)
```json
{
  "data": [
    {
      "id": 1,
      "departmentName": "Mechanical",
      "status": "Active",
      "isActive": true,
      "createdDate": "2026-01-01 00:00:00"
    }
  ]
}
```

### 6.4 Projects API (`GET /api/powerbi/projects`)
```json
{
  "data": [
    {
      "id": 4,
      "projectCode": "PRJ-004",
      "projectName": "UX Audit",
      "customerName": "Acme Corp",
      "activity": "Design",
      "division": "Design",
      "subdivision": "Frontend",
      "teamType": "Dedicated",
      "status": "Active",
      "isActive": true,
      "createdDate": "2026-01-01 00:00:00",
      "updatedDate": "2026-01-01 00:00:00"
    }
  ]
}
```

### 6.5 Holidays API (`GET /api/powerbi/holidays`)
```json
{
  "data": [
    {
      "id": 1,
      "date": "2026-01-01",
      "holidayName": "New Year's Day",
      "createdDate": "2026-01-01 00:00:00"
    }
  ]
}
```

---

## 7. Step-by-Step Power BI Desktop Connection

Follow these steps to connect Power BI Desktop to the GCC Timesheet REST API:

### Step 1: Open Power BI Desktop
1. Launch **Power BI Desktop**.
2. On the **Home** ribbon, click **Get Data** → **Web**.

### Step 2: Configure Endpoint URL
Select **Advanced** in the Web request dialog:
- **URL parts:**
  - Base URL: `https://gcc-timesheet.company.com/api/powerbi/timesheets`
  *(For local development: `http://localhost:3001/api/powerbi/timesheets`)*
- **HTTP request header parameters:**
  - Header name: `X-API-Key`
  - Header value: `[Enter your reporting API key]`

*(Alternatively, use Basic Auth if prompted by Power BI: User: `powerbi`, Password: `[Your API Key]`)*

### Step 3: Transform Data in Power Query
1. Click **OK**. Power BI connects to the API and displays the JSON record.
2. In Power Query Editor:
   - Click the **List** link corresponding to the `"data"` column.
   - On the Transform ribbon, click **To Table**.
   - Click the **Expand** icon (two opposing arrows) in the column header.
   - Select all columns and uncheck *"Use original column name as prefix"*.
3. Click **Close & Apply** to load the dataset.

### Step 4: Add Dimension Tables (Star Schema)
Repeat the steps above for:
- `/api/powerbi/users`
- `/api/powerbi/projects`
- `/api/powerbi/divisions`
- `/api/powerbi/departments`
- `/api/powerbi/holidays`

In Power BI **Model View**, establish relationships:
- `Timesheets[email]` → `Users[email]` (Many-to-One)
- `Timesheets[projectCode]` → `Projects[projectCode]` (Many-to-One)
- `Timesheets[date]` → `DimDate[Date]` (Many-to-One)

---

## 8. Automated Refresh & Power BI Service Considerations

### Power BI Refresh Compatibility
The Power BI API is designed for automated refreshes in Power BI Desktop and Power BI Service (Cloud):
1. **Endpoint Stability:** Endpoints like `/api/powerbi/timesheets` remain permanent and stable across refreshes.
2. **Scheduled Refresh:** When published to Power BI Service:
   - Set Authentication method to **Anonymous** (if using headers/keys configured in Power Query) or **Basic** (User: `powerbi`, Password: `<API_KEY>`).
   - If hosting on a private corporate network, configure an **On-Premises Data Gateway** or cloud reverse proxy.
3. **Incremental Refresh / Date Window:** For high-volume enterprise timesheet history, use the `from` and `to` query parameters to fetch rolling date windows:
   ```
   https://gcc-timesheet.company.com/api/powerbi/timesheets?from=2026-01-01&to=2026-12-31
   ```

---

## 9. Environment Configuration & Docker

The REST API supports all deployment modes (local dev, internal company server, reverse proxy, production Docker container).

### Environment Variables (`.env`)

```ini
# Application base URL (used for reverse proxies and external references)
APP_BASE_URL=https://gcc-timesheet.company.com

# Enable or disable Power BI read-only endpoints (default: true)
POWERBI_API_ENABLED=true

# Custom base path if needed (default: /api/powerbi)
POWERBI_API_BASE_PATH=/api/powerbi

# Strong random secret API key for Power BI reporting
# Generate via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
POWERBI_API_KEY=your-secure-random-api-key-here

# Maximum records returned in a single unpaginated reporting query
POWERBI_MAX_RECORDS=50000
```

### Docker Deployment
The existing Docker configuration exposes only the application web/API port (default `3001`).
- The internal SQLite database file is stored securely inside the container volume (`/app/server/data`).
- No database ports or files are exposed to Power BI or the external network.

---

## 10. Troubleshooting

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| `401 Unauthorized` | Missing or invalid API key | Verify `X-API-Key` header or `apiKey` query parameter matches `POWERBI_API_KEY` in `.env`. |
| `403 Forbidden` | Authenticated with non-admin employee credentials | Power BI requires the dedicated reporting API key or an Administrator account. |
| `405 Method Not Allowed` | Non-GET method attempted (POST, PUT, DELETE) | Power BI API is strictly read-only. Use `GET` only. |
| `503 Service Unavailable` | `POWERBI_API_ENABLED=false` or `POWERBI_API_KEY` is empty | Check `.env` and ensure `POWERBI_API_KEY` is populated. |
| `400 Bad Request` | Invalid date format or status | Ensure date filters use `YYYY-MM-DD` and `from <= to`. Ensure status is one of: `draft`, `submitted`, `approved`, `rejected`, `recalled`. |
| SSL / HTTPS Error in Power BI | Self-signed certificate on internal server | Ensure the internal CA root certificate is installed on the machine running Power BI Desktop. |

---

*Documentation version: 1.0 — GCC Timesheet Management System*
