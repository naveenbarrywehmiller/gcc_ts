# POWER_BI_SETUP.md — Power BI Dashboard Setup

## Overview

Power BI connects to SharePoint Online lists to provide rich analytics and reporting. The timesheet data stored in SharePoint lists serves as the data source for all Power BI dashboards.

---

## Prerequisites

- Power BI Desktop (free download from Microsoft)
- Power BI Pro or Premium Per User license (for publishing and sharing)
- SharePoint Online site configured per SHAREPOINT_SETUP.md with data loaded
- Read access to the SharePoint site

---

## Step 1: Connect Power BI to SharePoint

### Option A: SharePoint Online List connector (recommended)

1. Open Power BI Desktop
2. Click **Home** → **Get Data** → **SharePoint Online List**
3. Enter your SharePoint site URL: `https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet`
4. Select **Microsoft Account** and sign in with your M365 account
5. Select all 9 lists:
   - TS_Employees
   - TS_Divisions
   - TS_Subdivisions
   - TS_Departments
   - TS_DepartmentOwnerships
   - TS_Projects
   - TS_Tasks
   - TS_Holidays
   - TS_TimesheetEntries
6. Click **Load** (or **Transform Data** to apply filters first)

### Option B: REST API endpoint (for programmatic refresh)

The application exposes a flat export endpoint for Power BI:
```
GET /api/powerbi/export?apiKey=YOUR_POWERBI_API_KEY
```

This returns a flat JSON optimized for Power BI with no nested lookups.

---

## Step 2: Star Schema — Data Model

In Power BI Desktop, go to **Model View** and create these relationships:

```
FactTimesheet (TS_TimesheetEntries)
      |
      ├── EmployeeLookup.Id → TS_Employees.Id            (Many-to-One)
      ├── ProjectLookup.Id  → TS_Projects.Id             (Many-to-One)
      ├── TaskLookup.Id     → TS_Tasks.Id                (Many-to-One)
      ├── DivisionLookup.Id → TS_Divisions.Id            (Many-to-One)
      ├── SubdivisionLookup.Id → TS_Subdivisions.Id      (Many-to-One)
      ├── OwnershipLookup.Id → TS_DepartmentOwnerships.Id (Many-to-One)
      └── WorkDate (Date)   → DimDate[Date]              (Many-to-One)
```

**DimDate** is a generated date table (see DAX below).

### Relationship settings:
- Cross filter direction: **Single** for all relationships
- Cardinality: **Many to one** for FactTimesheet → all dimensions

---

## Step 3: Create Date Dimension Table

In Power BI Desktop → **Home** → **New Table**, paste:

```dax
DimDate =
VAR StartDate = DATE(2020, 1, 1)
VAR EndDate = DATE(2030, 12, 31)
VAR DateTable =
    ADDCOLUMNS(
        CALENDAR(StartDate, EndDate),
        "Year", YEAR([Date]),
        "Quarter", "Q" & FORMAT(CEILING(MONTH([Date]) / 3, 1), "0"),
        "Month", MONTH([Date]),
        "MonthName", FORMAT([Date], "MMMM"),
        "MonthShort", FORMAT([Date], "MMM"),
        "Week", WEEKNUM([Date], 2),
        "WeekStart", [Date] - WEEKDAY([Date], 2) + 1,
        "DayOfWeek", WEEKDAY([Date], 2),
        "DayName", FORMAT([Date], "dddd"),
        "IsWeekend", IF(WEEKDAY([Date], 2) >= 6, TRUE, FALSE),
        "YearMonth", FORMAT([Date], "YYYY-MM"),
        "YearQuarter", FORMAT([Date], "YYYY") & " Q" & FORMAT(CEILING(MONTH([Date]) / 3, 1), "0")
    )
RETURN DateTable
```

---

## Step 4: Core DAX Measures

Create a dedicated measures table: **Home** → **Enter Data** → name it `_Measures`, load it.

Paste each measure:

```dax
Total Hours =
SUM(TS_TimesheetEntries[Hours])

Billable Hours =
CALCULATE(
    SUM(TS_TimesheetEntries[Hours]),
    TS_TimesheetEntries[Billable] = TRUE
)

Non-Billable Hours =
CALCULATE(
    SUM(TS_TimesheetEntries[Hours]),
    TS_TimesheetEntries[Billable] = FALSE
)

Billable % =
DIVIDE([Billable Hours], [Total Hours], 0)

Active Employees =
DISTINCTCOUNT(TS_TimesheetEntries[EmployeeEmail])

Active Projects =
CALCULATE(
    DISTINCTCOUNT(TS_TimesheetEntries[ProjectLookup.Title]),
    NOT ISBLANK(TS_TimesheetEntries[ProjectLookup.Title])
)

Avg Hours Per Employee =
DIVIDE([Total Hours], [Active Employees], 0)

Pending Approvals =
CALCULATE(
    DISTINCTCOUNT(TS_TimesheetEntries[EmployeeEmail]),
    TS_TimesheetEntries[Status] = "Submitted"
)

Approved Hours =
CALCULATE(
    SUM(TS_TimesheetEntries[Hours]),
    TS_TimesheetEntries[Status] = "Approved"
)

Expected Hours Per Employee =
-- Based on 8h/day x 5 days/week, adjusted for the selected period
VAR WorkingDays = 
    CALCULATE(
        COUNTROWS(DimDate),
        DimDate[IsWeekend] = FALSE
    )
RETURN WorkingDays * 8

Utilization % =
DIVIDE([Total Hours], [Expected Hours Per Employee], 0)
```

---

## Step 5: Dashboard Pages

### Page 1 — Executive Overview

**KPI Cards:**
- Total Hours
- Billable Hours / Billable %
- Active Employees
- Active Projects
- Pending Approvals

**Visuals:**
- Line chart: Weekly total hours trend (last 12 weeks)
- Bar chart: Hours by Division
- Donut chart: Billable vs Non-Billable split
- Table: Top 5 projects by hours this month

**Filters panel:**
- Date range (or Year/Month slicer)
- Status (Approved only vs All)
- Division

---

### Page 2 — Employee Analysis

**Visuals:**
- Matrix: Employee × Week → Hours (conditional formatting: green >40h, red <32h)
- Bar chart: Hours by employee (sorted descending)
- Stacked bar: Hours by project per employee
- Table: Employee detail with columns: Name, Division, Total Hours, Billable Hours, Billable %, Submissions

**Filters panel:**
- Employee (multi-select)
- Division
- Period (Week/Month/Quarter/Year)

---

### Page 3 — Project Analysis

**Visuals:**
- Bar chart: Total hours by project
- Line chart: Monthly project hours trend
- Stacked bar: Hours by employee per project
- Donut: Billable vs Non-Billable per project
- Table: Project detail with Total Hours, Contributors, Billable %

**Filters panel:**
- Project (multi-select)
- Division
- Customer
- Date range

---

### Page 4 — Department / Division Analysis

**Visuals:**
- Matrix: Division × Month → Hours
- Bar chart: Hours by Division
- Bar chart: Hours by Subdivision
- Heatmap: Employee utilization by division
- Table: Division summary with Employees, Total Hours, Avg Hours/Employee

**Filters panel:**
- Division
- Subdivision
- Period

---

### Page 5 — Timesheet Compliance

**Visuals:**
- Table: Missing timesheets (employees with no entries for selected week)
- Bar chart: Submission status count by employee (Draft / Submitted / Approved / Rejected)
- Line chart: Weekly submission rate trend
- KPI cards: % On-time submissions, % Approved, % Pending

**Filters panel:**
- Week
- Division
- Status

---

## Step 6: Publish to Power BI Service

1. Click **Home** → **Publish**
2. Select your Power BI workspace
3. Open the published dataset in Power BI Service
4. Configure **Scheduled Refresh**:
   - Credentials: Connect to SharePoint with your M365 account
   - Refresh frequency: Daily (or every 4 hours during business hours)

---

## Step 7: Share and Configure Row-Level Security (Optional)

### Row-Level Security (RLS) — Manager sees only their team

In Power BI Desktop → **Modeling** → **Manage Roles**

Create role `Manager`:
```dax
[ManagerEmail] = USERPRINCIPALNAME()
```

Where `ManagerEmail` is a column in TS_Employees that stores the manager's email.

Publish and assign users to roles in Power BI Service → Dataset → Security.

---

## Embedding Power BI in the Web App (Optional)

The application includes a placeholder for Power BI embed reports.

1. In Power BI Service, get the **Report Embed URL**
2. Configure embed token via Azure AD app (use the same Entra ID app registration)
3. Add the embed URL to your .env:
```bash
POWERBI_EMBED_URL=https://app.powerbi.com/reportEmbed?reportId=...
POWERBI_WORKSPACE_ID=your-workspace-id
POWERBI_REPORT_ID=your-report-id
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| SharePoint connection fails | Sign in with M365 account in Get Data |
| Data not refreshing | Check scheduled refresh credentials in PBI Service |
| Blank visuals | Verify relationships are correctly set in Model View |
| RLS not filtering | Check that the role condition uses `USERPRINCIPALNAME()` |
| Too slow on large datasets | Apply date filters in Power Query; avoid loading all historical data |
| Lookup columns showing IDs | Expand the lookup column in Power Query to get the `.Value` field |
