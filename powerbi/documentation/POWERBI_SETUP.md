# Power BI Setup Guide — GCC Timesheet

> **Dashboard Version:** 1.0.0  
> **API Version:** v1.x  
> **Last Updated:** 2026-09-25

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Server Configuration](#2-server-configuration)
3. [Generate API Key](#3-generate-api-key)
4. [Verify API Connection](#4-verify-api-connection)
5. [Connect Power BI Desktop](#5-connect-power-bi-desktop)
6. [Load Dimension Tables](#6-load-dimension-tables)
7. [Configure Data Model](#7-configure-data-model)
8. [Create Date Dimension](#8-create-date-dimension)
9. [Add DAX Measures](#9-add-dax-measures)
10. [Build Dashboard Pages](#10-build-dashboard-pages)
11. [Apply Custom Theme](#11-apply-custom-theme)
12. [Publish to Power BI Service](#12-publish-to-power-bi-service)
13. [Multi-User Setup](#13-multi-user-setup)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Requirement | Details |
|------------|---------|
| **Power BI Desktop** | Latest version (free download from Microsoft) |
| **GCC Timesheet Server** | v1.3.0+ running and accessible |
| **Network Access** | Power BI PC must reach the GCC Timesheet server (HTTP/HTTPS) |
| **API Key** | Generated and configured on the server |

### Optional (for sharing & scheduled refresh)

| Requirement | Details |
|------------|---------|
| **Power BI Pro/Premium** | Required for publishing and sharing |
| **On-Premises Data Gateway** | Required if server is on private network |

---

## 2. Server Configuration

Ensure these environment variables are set in the server's `.env` file:

```ini
# Enable Power BI read-only API (default: true)
POWERBI_API_ENABLED=true

# Base path for API endpoints (default: /api/powerbi)
POWERBI_API_BASE_PATH=/api/powerbi

# Dedicated read-only API key (REQUIRED - generate a strong key)
POWERBI_API_KEY=<your-secure-api-key>

# Maximum records per unpaginated query (default: 50000)
POWERBI_MAX_RECORDS=50000

# Server-side cache TTL in seconds (default: 60, 0 to disable)
POWERBI_CACHE_TTL=60
```

> ⚠️ **NEVER** commit the actual API key to source control. Use environment variables only.

---

## 3. Generate API Key

Run this command to generate a secure random API key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2
```

Copy this value into `POWERBI_API_KEY` in your server `.env` file and restart the server.

---

## 4. Verify API Connection

Test the connection using curl, Postman, or a browser:

```bash
# Using curl with X-API-Key header
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3001/api/powerbi/version

# Using query parameter
curl "http://localhost:3001/api/powerbi/version?apiKey=YOUR_API_KEY"
```

Expected response:
```json
{
  "apiVersion": "1.0.0",
  "dashboardVersion": "1.0.0",
  "endpoints": ["timesheets", "users", "divisions", "departments", "projects", "holidays", "tasks", "assignments", "status-summary", "export"]
}
```

---

## 5. Connect Power BI Desktop

### Step 1: Open Power BI Desktop
Launch Power BI Desktop. On the **Home** ribbon, click **Get Data** → **Web**.

### Step 2: Select Advanced Mode
In the Web dialog, select **Advanced**.

### Step 3: Configure the Timesheets Endpoint

| Field | Value |
|-------|-------|
| **URL parts** | `http://<SERVER>:<PORT>/api/powerbi/timesheets` |
| **HTTP request header** (name) | `X-API-Key` |
| **HTTP request header** (value) | `<YOUR_POWERBI_API_KEY>` |

**Example URLs:**
- Development: `http://localhost:3001/api/powerbi/timesheets`
- Internal server: `http://192.168.1.100:3001/api/powerbi/timesheets`
- Production: `https://gcc-timesheet.company.com/api/powerbi/timesheets`

> 💡 **Tip:** Add date filters to limit data volume:
> `http://localhost:3001/api/powerbi/timesheets?from=2026-01-01&to=2026-12-31`

### Step 4: Transform Data in Power Query Editor

1. Click **OK** to connect.
2. In Power Query Editor, you'll see the JSON response.
3. Click the **List** link next to `"data"`.
4. On the Transform ribbon, click **To Table** → OK.
5. Click the **expand icon** (↔) in the column header.
6. Select all columns and **uncheck** "Use original column name as prefix".
7. Set appropriate data types:
   - `hours` → Decimal Number
   - `date` → Date
   - `id` → Whole Number
   - `isBillable` → True/False
8. Click **Close & Apply**.

### Alternative: Use Pre-built Power Query M Scripts

Copy the Power Query M scripts from `powerbi/queries/` into the Advanced Editor:
1. In Power Query, click **New Source** → **Blank Query**
2. Click **Advanced Editor** on the Home ribbon
3. Paste the contents of the `.pq` file
4. Update the `ApiBaseUrl` and `ApiKey` parameters

---

## 6. Load Dimension Tables

Repeat the connection process for each dimension endpoint:

| Query Name | Endpoint | Purpose |
|-----------|----------|---------|
| `DimEmployee` | `/api/powerbi/users` | Employee dimension |
| `DimProject` | `/api/powerbi/projects` | Project dimension |
| `DimDivision` | `/api/powerbi/divisions` | Division dimension |
| `DimDepartment` | `/api/powerbi/departments` | Department dimension |
| `DimHoliday` | `/api/powerbi/holidays` | Holiday dimension |
| `DimTask` | `/api/powerbi/tasks` | Task category dimension |
| `AdminAssignments` | `/api/powerbi/assignments` | Admin-employee mapping |

---

## 7. Configure Data Model

In **Model View**, create these relationships:

| From (Many) | To (One) | On Column |
|------------|----------|-----------|
| `FactTimesheet[employeeId]` | `DimEmployee[employeeId]` | Many-to-One |
| `FactTimesheet[projectCode]` | `DimProject[projectCode]` | Many-to-One |
| `FactTimesheet[division]` | `DimDivision[divisionName]` | Many-to-One |
| `FactTimesheet[department]` | `DimDepartment[departmentName]` | Many-to-One |
| `FactTimesheet[date]` | `DimDate[Date]` | Many-to-One |

### Relationship settings:
- **Cross filter direction:** Single (for all)
- **Cardinality:** Many to one
- **Make this relationship active:** Yes

---

## 8. Create Date Dimension

Go to **Home** → **New Table** and paste the DAX from `powerbi/queries/DimDate.dax`.

This creates a comprehensive date table with Year, Quarter, Month, Week, Day, Is Weekend, and Is Holiday columns.

---

## 9. Add DAX Measures

Create a measures table: **Home** → **Enter Data** → name it `_Measures` → **Load**.

Add all measures from `powerbi/queries/Measures.dax`. Key measures include:

- Total Hours, Average Hours, Employee Count
- Submitted/Approved/Pending/Rejected Hours
- Weekend Hours, Holiday Hours
- Submission Rate, Approval Rate
- YTD Hours, Current Month/Week Hours
- Variance calculations

---

## 10. Build Dashboard Pages

See `powerbi/assets/dashboard_preview.md` for detailed page layouts.

| Page | Content |
|------|---------|
| 1. Executive Overview | KPI cards, trends, division comparison |
| 2. Timesheet Analytics | Daily/weekly/monthly analysis |
| 3. Employee Analytics | Individual drill-through |
| 4. Division Analytics | Division metrics |
| 5. Department Analytics | Department metrics |
| 6. Project Analytics | Project hours & contributors |
| 7. Admin Analytics | Admin workload |
| 8. Timesheet Status | Status trends |
| 9. Weekend & Holiday | Non-standard hours |
| 10. Detailed Timesheets | Searchable table |

---

## 11. Apply Custom Theme

1. Go to **View** → **Themes** → **Browse for themes**
2. Select `powerbi/theme/gcc_timesheet_theme.json`
3. The theme applies corporate colors and typography

---

## 12. Publish to Power BI Service

1. Click **Home** → **Publish**
2. Select your Power BI workspace
3. In Power BI Service, configure dataset settings:
   - **Data source credentials:** Basic Auth (User: `powerbi`, Password: `<API_KEY>`)
   - **Scheduled refresh:** Set desired frequency (minimum: 30 minutes in Pro)

---

## 13. Multi-User Setup

All Power BI client PCs connect to the same central REST API:

```
Power BI PC 1 ──┐
Power BI PC 2 ──┼──→ GCC Timesheet REST API ──→ Database
Power BI PC 3 ──┘
```

### Setup for additional users:
1. Share the PBIT template file (credentials not embedded)
2. Each user enters the server URL and API key on first open
3. All users share the same read-only API key
4. Server-side caching reduces load from concurrent users

---

## 14. Troubleshooting

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `401 Unauthorized` | Missing or invalid API key | Verify `X-API-Key` matches `POWERBI_API_KEY` in server `.env` |
| `403 Forbidden` | Non-admin JWT used | Use the dedicated API key, not employee credentials |
| `405 Method Not Allowed` | POST/PUT/DELETE attempted | Power BI API is strictly read-only — use GET only |
| `503 Service Unavailable` | API disabled or key not configured | Set `POWERBI_API_ENABLED=true` and `POWERBI_API_KEY` in `.env` |
| `400 Bad Request` | Invalid date or status filter | Use `YYYY-MM-DD` dates; status must be: draft, submitted, approved, rejected, recalled |
| `429 Too Many Requests` | Rate limit exceeded | Wait and retry; limit is 1000 requests per 15 minutes |
| Empty data in visuals | No data for selected filters | Check date range and filter selections |
| SSL/HTTPS error | Self-signed certificate | Install the CA root cert on the Power BI machine |
| Timeout on large datasets | Too much data requested | Use `from`/`to` date filters and pagination |
| Power Query "Access Denied" | Credentials not configured | In Power Query, go to Data Source Settings → Edit Permissions |

---

*GCC Timesheet Power BI Setup Guide v1.0.0*
