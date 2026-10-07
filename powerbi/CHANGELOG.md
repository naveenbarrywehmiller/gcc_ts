# GCC Timesheet Power BI Changelog

All notable changes to the Power BI Dashboard are documented in this file.
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.2] — 2026-10-06

### Changed
- Reused scalar calculations with named variables in Available Hours, Under Utilized %, Effort Deviation %, and the three alert-color measures, retaining KPI semantics and thresholds.
- Added repeatable baseline/candidate comparison tests and an isolated cold/warm-cache benchmark. Two fixtures and 52 boundary comparisons passed; the applied model passed 72 measure evaluations and 36 regression cases.
- Recorded the external Microsoft report-schema 2.13.0 HTTP 404 limitation separately from successful native model validation.

## [1.1.1] — 2026-10-06

### Changed
- Redesigned the GCC Requirements overview for managers with compact filters, larger KPI values, taller charts, clearer input guidance and a compact refresh footer.
- Corrected chart titles to match their measures; ranked division hours in a horizontal bar chart and added on-time delivery to the division table.
- Made Management overview the opening page, added descriptive alt text and logical keyboard order, and updated the overview phone layout and its generator.
- Preserved KPI calculations, source connections, reporting-month selection and all eight supporting pages.

## [1.1.0] — 2026-09-27

### Added
- Enterprise-grade Power Query pattern with secure config handling, response validation, and API error messaging
- Robust pagination design for the timesheet fact table using the API page/limit contract
- Updated date dimension logic with Monday-first business week semantics and holiday flags
- Expanded documentation for deployment, troubleshooting, development, and release workflow

### Changed
- Standardized the validation pattern across main Power BI query scripts
- Updated Power BI version metadata to reflect the dashboard implementation workstream

### Security
- Kept the reporting architecture read-only and credential-based, with placeholders instead of live secrets

---

## [1.0.0] — 2026-09-25

### Added

- **REST API Endpoints**
  - `GET /api/powerbi/timesheets` — Fact table with server-side filtering & pagination
  - `GET /api/powerbi/users` — Employee/admin dimension (passwords excluded)
  - `GET /api/powerbi/divisions` — Division dimension
  - `GET /api/powerbi/departments` — Department dimension
  - `GET /api/powerbi/projects` — Project dimension
  - `GET /api/powerbi/holidays` — Holiday dimension
  - `GET /api/powerbi/tasks` — Task category dimension
  - `GET /api/powerbi/assignments` — Admin-employee assignment mapping
  - `GET /api/powerbi/status-summary` — Aggregated timesheet status overview
  - `GET /api/powerbi/version` — API version and compatibility info
  - `GET /api/powerbi/export` — Legacy flat export

- **Security**
  - Read-only enforcement (HTTP 405 for POST/PUT/PATCH/DELETE)
  - Dedicated API key authentication (`X-API-Key`, Bearer, Basic Auth, query parameter)
  - Admin JWT fallback authentication
  - Rate limiting (1000 req/15 min per client)
  - Request logging with token sanitization
  - Server-side response caching (configurable TTL)

- **Power BI Data Model**
  - Star schema design: FactTimesheet → DimDate, DimEmployee, DimProject, DimDivision, DimDepartment, DimHoliday
  - Date dimension DAX table (2020–2030)
  - 25+ reusable DAX measures

- **Dashboard Pages** (10 pages)
  - Executive Overview
  - Timesheet Analytics
  - Employee Analytics
  - Division Analytics
  - Department Analytics
  - Project Analytics
  - Admin Analytics
  - Timesheet Status
  - Weekend & Holiday Analysis
  - Detailed Timesheets

- **Power Query M Scripts** — Pre-built connection templates for all endpoints
- **Custom Theme** — `gcc_timesheet_theme.json` with corporate branding
- **Comprehensive Documentation**
  - Setup guide (`POWERBI_SETUP.md`)
  - Data model reference (`DATA_MODEL.md`)
  - Refresh architecture (`REFRESH.md`)
  - Deployment guide (`DEPLOYMENT.md`)
  - API compatibility matrix (`API_COMPATIBILITY.md`)

### API Compatibility

- **Power BI API Version:** v1.x
- **GCC Timesheet Application:** v1.3.0+

### Known Limitations

- Power BI Desktop does not support automatic sub-minute refresh for REST API (Import mode)
- Power BI Service scheduled refresh requires On-Premises Data Gateway for private networks
- PBIX/PBIT files must be distributed via GitHub Releases or shared drives (not stored in Git)

---

*Maintained by GCC Engineering — Barry Wehmiller*
