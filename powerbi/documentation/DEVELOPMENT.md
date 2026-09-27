# Power BI Development Guide — GCC Timesheet

> Dashboard Version: 1.1.0
> API Compatibility: v1.x
> Last Updated: 2026-09-27

---

## Purpose

This guide explains how another engineer can maintain and extend the GCC Timesheet Power BI dashboard without breaking the reporting API contract or the application runtime.

The design is intentionally conservative:
- Power BI remains an external client
- Data is loaded through the read-only REST API at `/api/powerbi/*`
- The application database remains private to the server
- Any change to the Power BI model must still match the API payloads returned by the server

---

## Repository Layout

```text
powerbi/
├── README.md
├── CHANGELOG.md
├── documentation/
│   ├── API_COMPATIBILITY.md
│   ├── DATA_MODEL.md
│   ├── DEPLOYMENT.md
│   ├── DEVELOPMENT.md
│   ├── POWERBI_SETUP.md
│   ├── REFRESH.md
│   └── TROUBLESHOOTING.md
├── queries/
│   ├── Assignments.pq
│   ├── Departments.pq
│   ├── DimDate.dax
│   ├── Divisions.pq
│   ├── Holidays.pq
│   ├── Measures.dax
│   ├── Projects.pq
│   ├── StatusSummary.pq
│   ├── Tasks.pq
│   ├── Timesheets.pq
│   ├── Users.pq
│   └── ...
├── theme/
│   └── gcc_timesheet_theme.json
├── assets/
│   └── dashboard_preview.md
└── pbix/
    # optional/generated report artifacts only when needed
```

---

## Source of Truth

When a field is unclear, the source of truth is the actual server implementation:
- [server/src/routes/powerbi.js](../server/src/routes/powerbi.js)
- [server/src/services/powerBiService.js](../server/src/services/powerBiService.js)

Do not invent new endpoint fields in the Power BI layer. If a required field is missing, confirm the server contract first.

---

## Working Pattern

### 1. Update the API contract if needed
If a new reporting field is required, add it in the server service and keep it backward compatible.

### 2. Update the Power Query scripts
Update the relevant `.pq` file to reflect the field names and types returned by the API.

### 3. Validate the semantic model
Confirm the table names, relationships, and sorting in Power BI Desktop.

### 4. Add or update DAX measures
Keep measures in a dedicated table such as `_Measures` and avoid scattering logic across fact tables.

### 5. Refresh and verify totals
Cross-check totals against the API payload or known sample records.

---

## Recommended Workflow

1. Open Power BI Desktop.
2. Load the API endpoints using the secure connection pattern.
3. Rename tables to the canonical model names:
   - FactTimesheet
   - DimDate
   - DimEmployee
   - DimProject
   - DimDivision
   - DimDepartment
   - DimHoliday
4. Create the date table using the DAX script in `DimDate.dax`.
5. Set `DimDate[Date]` as the official date table.
6. Create the `_Measures` table and add the measure library.
7. Publish or share only after validation.

---

## Versioning Rules

Use semantic versioning for the dashboard independent of the application version.

- MAJOR: breaking data model or API compatibility changes
- MINOR: feature/page/measure additions
- PATCH: fixes, formatting, documentation updates

Whenever a change is made:
- update the dashboard version in the relevant docs
- update [powerbi/CHANGELOG.md](../CHANGELOG.md)
- ensure compatibility notes remain current

---

## Quality Gates

Before any release, validate:
- API auth still works with a key in environment variables
- query response model matches the expected `data` array shape
- pagination still works for large datasets
- DAX totals reconcile to the raw API data
- no secrets are committed to the repo
- date and holiday logic match business assumptions

---

## Manual Desktop Tasks

Some steps cannot be fully automated from this repo alone:
- Build the actual report pages in Power BI Desktop
- Set visual-level interactions, slicers, and bookmarks
- Publish to Power BI Service
- Configure scheduled refresh, credentials, and gateways

These are documented as required manual steps in the final implementation report.

---

## Security Notes

- Never store the real API key in repository files
- Use environment variables or secure Power BI parameters
- Do not include credentials in `.pq`, `.dax`, or documentation files
- Use placeholders such as `POWERBI_API_BASE_URL` and `POWERBI_API_KEY`

---

## Troubleshooting Reference

For detailed operational issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
