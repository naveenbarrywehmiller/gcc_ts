# GCC Timesheet — Power BI Dashboard

> **Version:** 1.0.0  
> **API Compatibility:** Power BI API v1.x  
> **Application Compatibility:** GCC Timesheet v1.3.0+

---

## Overview

The **GCC Timesheet Power BI Dashboard** is an independently versioned analytics product that securely consumes the GCC Timesheet application through a dedicated, read-only REST API.

Power BI connects **exclusively** via the REST API — never directly to the database.

```
┌───────────────────────────────────────────────────────┐
│                 GCC TIMESHEET SERVER                  │
│                                                       │
│   ┌─────────────────┐   ┌──────────────────────────┐  │
│   │ GCC Timesheet   │   │  Power BI REST API       │  │
│   │ Application     │   │  /api/powerbi/*          │  │
│   │ (React + API)   │   │  (Read-Only)             │  │
│   └────────┬────────┘   └────────────┬─────────────┘  │
│            │                         │                 │
│            └──────────┬──────────────┘                 │
│                       │                                │
│              ┌────────▼────────┐                       │
│              │   SQLite DB     │                       │
│              │   (Internal)    │                       │
│              └─────────────────┘                       │
└───────────────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │  PC 1     │ │  PC 2     │ │  PC 3     │
    │  Power BI │ │  Power BI │ │  Power BI │
    │  Desktop  │ │  Desktop  │ │  Desktop  │
    └───────────┘ └───────────┘ └───────────┘
```

## Quick Start

1. **Generate API Key** on the server:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Set** `POWERBI_API_KEY` in the server `.env` file.
3. **Open Power BI Desktop** → Get Data → Web (Advanced).
4. **Enter endpoint URL** and add `X-API-Key` header.
5. **Load dimension tables** and build relationships.

📖 Full setup instructions: [documentation/POWERBI_SETUP.md](documentation/POWERBI_SETUP.md)

## Project Structure

```
powerbi/
├── README.md                    # This file
├── CHANGELOG.md                 # Version history
├── documentation/
│   ├── POWERBI_SETUP.md         # Installation & connection guide
│   ├── DATA_MODEL.md            # Star schema & relationships
│   ├── REFRESH.md               # Refresh architecture & limitations
│   ├── DEPLOYMENT.md            # Deployment & multi-user guide
│   └── API_COMPATIBILITY.md     # API version compatibility matrix
├── theme/
│   └── gcc_timesheet_theme.json # Custom Power BI theme
├── queries/
│   ├── DimDate.dax              # Date dimension DAX
│   ├── Measures.dax             # All DAX measures
│   ├── Timesheets.pq            # Power Query M for timesheets
│   ├── Users.pq                 # Power Query M for users
│   ├── Divisions.pq             # Power Query M for divisions
│   ├── Departments.pq           # Power Query M for departments
│   ├── Projects.pq              # Power Query M for projects
│   └── Holidays.pq              # Power Query M for holidays
└── assets/
    └── dashboard_preview.md     # Dashboard page descriptions
```

## Versioning

Power BI uses **independent Semantic Versioning**, separate from the GCC Timesheet application:

| Component | Version |
|-----------|---------|
| GCC Timesheet Application | v1.3.0 |
| Power BI Dashboard | v1.0.0 |
| Power BI REST API | v1.x |

### Version Rules

| Change Type | Version Bump | Examples |
|------------|-------------|---------|
| **MAJOR** | `v2.0.0` | Breaking data model changes, API contract breaks |
| **MINOR** | `v1.1.0` | New pages, KPIs, drill-throughs, filters |
| **PATCH** | `v1.0.1` | DAX fixes, formatting, documentation |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/powerbi/timesheets` | Fact table: timesheet entries |
| `GET /api/powerbi/users` | Dimension: employees & admins |
| `GET /api/powerbi/divisions` | Dimension: organizational divisions |
| `GET /api/powerbi/departments` | Dimension: departments |
| `GET /api/powerbi/projects` | Dimension: projects |
| `GET /api/powerbi/holidays` | Dimension: company holidays |
| `GET /api/powerbi/tasks` | Dimension: task categories |
| `GET /api/powerbi/assignments` | Admin-employee assignments |
| `GET /api/powerbi/status-summary` | Aggregated status summary |
| `GET /api/powerbi/version` | API version information |
| `GET /api/powerbi/export` | Legacy flat export |

## Dashboard Pages

1. **Executive Overview** — KPIs, trends, division comparison
2. **Timesheet Analytics** — Daily/weekly/monthly hours analysis
3. **Employee Analytics** — Individual employee drill-through
4. **Division Analytics** — Division-level metrics
5. **Department Analytics** — Department-level metrics
6. **Project Analytics** — Project hours & contributors
7. **Admin Analytics** — Admin workload & assignments
8. **Timesheet Status** — Status trends & distribution
9. **Weekend & Holiday Analysis** — Non-standard hours tracking
10. **Detailed Timesheets** — Searchable/filterable data table

## Security

- **Read-only**: All write operations rejected with `405 Method Not Allowed`
- **API key authentication**: Dedicated reporting credential
- **No secrets exposed**: Passwords, hashes, and tokens never returned
- **Parameterized queries**: SQL injection prevention
- **Rate limited**: 1000 requests per 15-minute window

## Docker Independence

Power BI is **NOT** included in the application Docker runtime:
- ❌ No Power BI Desktop in Docker
- ❌ No PBIX files in production image
- ❌ No Power BI Docker service
- ✅ Application runs independently
- ✅ Power BI runs on client machines

## License

Internal — Barry Wehmiller / GCC

---

*GCC Timesheet Power BI Dashboard v1.0.0 — 2026-09-25*
