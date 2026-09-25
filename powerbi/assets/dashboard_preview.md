# GCC Timesheet Power BI Dashboard — Page Layouts

> **Version:** 1.0.0

---

## Page 1 — Executive Overview

### KPI Cards (Top Row)
| Total Employees | Active Employees | Total Hours | Average Hours | Submission Rate | Approval Rate |

### Visuals
- **Monthly Trend** — Line chart: Total hours by month (last 12 months)
- **Division Comparison** — Horizontal bar chart: Hours by division (sorted desc)
- **Department Summary** — Stacked bar: Hours by department with status breakdown
- **Status Distribution** — Donut chart: Draft / Submitted / Approved / Rejected / Recalled

### KPI Cards (Bottom Row)
| Submitted Hours | Approved Hours | Pending Hours | Rejected Hours |

### Global Filters
- Year (slicer)
- Quarter (slicer)
- Month (slicer)
- Division (dropdown)

---

## Page 2 — Timesheet Analytics

### KPI Cards
| Daily Average | Weekly Average | Monthly Total | Weekend Hours | Holiday Hours |

### Visuals
- **Daily Hours** — Column chart: Hours by day of week (Mon–Sun)
- **Weekly Hours** — Line chart: Total hours by week number
- **Monthly Hours** — Area chart: Hours by month with YoY comparison
- **Status Breakdown** — 100% stacked bar: Status distribution by month
- **Billable vs Non-Billable** — Donut chart

### Filters
- Date range (date slicer)
- Employee (dropdown)
- Division (dropdown)
- Status (multi-select)

---

## Page 3 — Employee Analytics

### KPI Cards
| Employee Count | Active Count | Avg Hours/Employee | Top Performer |

### Visuals
- **Hours by Employee** — Horizontal bar chart: Top 20 employees by total hours
- **Employee Matrix** — Matrix: Employee × Month → Hours (conditional formatting)
- **Employee Detail** — Table: Employee, ID, Admin, Division, Dept, Total Hours, Avg Hours, Status

### Drill-Through
Click any employee to drill-through to their detailed timesheet entries.

### Filters
- Employee (searchable dropdown)
- Division (dropdown)
- Department (dropdown)
- Admin (dropdown)
- Status (multi-select)

---

## Page 4 — Division Analytics

### KPI Cards
| Total Divisions | Total Hours | Employee Count | Avg Hours/Division |

### Visuals
- **Hours by Division** — Bar chart: Total hours by division
- **Employee Count by Division** — Bar chart: Headcount per division
- **Submission Rate** — Gauge: Submission rate by selected division
- **Approval Rate** — Gauge: Approval rate by selected division
- **Division Detail** — Table: Division, Employees, Total Hours, Avg Hours, Submitted, Approved, Pending, Rejected

### Drill-Through
Division → Department → Employee → Timesheet

### Filters
- Division (slicer)
- Year/Month (slicer)

---

## Page 5 — Department Analytics

### KPI Cards
| Total Departments | Total Hours | Employee Count | Submission Rate |

### Visuals
- **Hours by Department** — Horizontal bar chart
- **Employee Distribution** — Donut: Employees by department
- **Status Distribution** — Stacked bar: Status by department
- **Department Detail** — Table: Department, Employees, Total Hours, Avg Hours, Submission Rate, Approval Rate

### Filters
- Department (slicer)
- Division (dropdown)
- Year/Month (slicer)

---

## Page 6 — Project Analytics

### KPI Cards
| Active Projects | Total Project Hours | Contributors | Billable % |

### Visuals
- **Hours by Project** — Treemap: Project hours with size encoding
- **Monthly Project Hours** — Line chart: Hours trend by top 5 projects
- **Project Contributors** — Stacked bar: Hours by employee per project
- **% of Total Hours** — Donut chart: Top projects as % of total
- **Project Detail** — Table: Project Code, Name, Customer, Division, Hours, Contributors

### Drill-Through
Project → Employee → Timesheet

### Filters
- Project (searchable dropdown)
- Division (dropdown)
- Customer (dropdown)
- Date range

---

## Page 7 — Admin Analytics

### KPI Cards
| Total Admins | Assigned Employees | Total Hours Managed | Pending Approvals |

### Visuals
- **Assigned Employees per Admin** — Horizontal bar chart
- **Hours by Admin** — Bar chart: Total hours under each admin's employees
- **Submission Status by Admin** — Stacked bar: Status breakdown by admin
- **Admin Detail** — Table: Admin, Division, Assigned Employees, Total Hours, Submitted, Pending, Approved

### Drill-Through
Admin → Employee → Timesheet

### Filters
- Admin (dropdown)
- Division (dropdown)
- Status (multi-select)

---

## Page 8 — Timesheet Status

### KPI Cards
| Draft | Submitted | Approved | Rejected | Recalled |

### Visuals
- **Status Trend** — Line chart: Status counts over time (monthly)
- **Status Distribution** — Donut chart: Current status breakdown
- **Status by Division** — Stacked bar: Status distribution per division
- **Status by Employee** — Matrix: Employee × Status → Count (conditional)
- **Missing Timesheets** — Table: Employees with no entries for selected period

### Filters
- Status (multi-select slicer)
- Date range (date slicer)
- Division (dropdown)
- Department (dropdown)

---

## Page 9 — Weekend & Holiday Analysis

### KPI Cards
| Weekend Hours | Holiday Hours | Weekend Employees | Holiday Employees |

### Visuals
- **Weekend Hours by Employee** — Bar chart: Top employees with weekend entries
- **Holiday Hours by Employee** — Bar chart: Top employees with holiday entries
- **Weekend Hours by Division** — Horizontal bar chart
- **Weekend/Holiday Calendar** — Matrix: Date × Employee → Hours
- **Detail Table** — Table: Date, Day, Employee, Division, Department, Hours, Type (Weekend/Holiday)

### Filters
- Date range (date slicer)
- Employee (dropdown)
- Division (dropdown)
- Weekend/Holiday toggle

---

## Page 10 — Detailed Timesheets

### Full Detail Table
| Date | Employee | Employee ID | Admin | Division | Department | Project | Project Code | Category | Hours | Status | Billable |

### Features
- Searchable (use Power BI's built-in search)
- Sortable by any column
- Filterable via all global slicers
- Exportable to CSV/Excel from Power BI
- Conditional formatting on status column

### Filters (Full Set)
- Date range
- Year / Quarter / Month / Week
- Employee (searchable)
- Employee ID
- Admin
- Division
- Department
- Project
- Status
- Billable (Yes/No)

---

## Global Slicers (Synchronized Across Pages)

The following slicers should be synchronized across all dashboard pages using Power BI's **Sync Slicers** feature:

| Slicer | Type | Synced Pages |
|--------|------|-------------|
| Year | Dropdown | All |
| Quarter | Buttons | All |
| Month | Dropdown | All |
| Division | Dropdown | All |
| Department | Dropdown | All |
| Status | Multi-select | All |

To configure: **View** → **Sync Slicers** → check the pages for each slicer.

---

## Tooltip Pages

### Employee Tooltip
Hover over any employee name to see:
- Employee Name & ID
- Admin
- Division / Department
- Total Hours
- Current Status

### Project Tooltip
Hover over any project to see:
- Project Code & Name
- Total Hours
- Active Employees
- Monthly Trend (sparkline)

### Division Tooltip
Hover over any division to see:
- Employee Count
- Total Hours
- Submission Rate
- Approval Rate

---

## Drill-Through Paths

```
Division → Department → Employee → Timesheet Detail
Project → Employee → Timesheet Detail
Admin → Employee → Timesheet Detail
Status → Employee → Timesheet Detail
```

Configure drill-through by adding the target field to the **Drill-through** section of the destination page's Filters pane.

---

## No-Data Handling

When filters return no records, configure each visual to show:
> "No data available for the selected filters."

In Power BI: Select visual → Format → **No data message** → Enter text.

---

*GCC Timesheet Power BI Dashboard Pages v1.0.0*
