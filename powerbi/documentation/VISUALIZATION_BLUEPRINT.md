# GCC Timesheet Power BI Visualization Blueprint

Version: 1.1.0

This document is the build specification for the saved model `GCC_Timesheet.pbix`.
All visuals should use the `_Measures` table for numeric KPIs and use `DimDate`, `DimEmployee`, `DimProject`, `DimDivision`, `DimDepartment`, and `FactTimesheet` for category fields.

## Recommended Report Pages

### 1. Executive Overview

Purpose: give leadership a fast view of workload, compliance, and trends.

| Visual | Type | Fields / Measures |
|---|---|---|
| Total hours | Card | `[Total Hours]` |
| Active employees | Card | `[Active Employee Count]` |
| Active projects | Card | `[Active Project Count]` |
| Submission rate | Card | `[Submission Rate]` |
| Approval rate | Card | `[Approval Rate]` |
| Monthly hours trend | Line chart | Axis: `DimDate[MonthYearLabel]`; Values: `[Total Hours]` |
| Hours by division | Clustered bar chart | Y-axis: `DimDivision[divisionName]`; X-axis: `[Total Hours]` |
| Hours by department and status | Stacked column chart | Axis: `DimDepartment[departmentName]`; Legend: `FactTimesheet[status]`; Values: `[Total Hours]` |
| Status distribution | Donut chart | Legend: `FactTimesheet[status]`; Values: `[Total Entries]` |

Slicers: `DimDate[Year]`, `DimDate[YearMonth]`, `DimDivision[divisionName]`, and `FactTimesheet[status]`.

### 2. Timesheet Analytics

Purpose: understand when work is recorded and how it is classified.

| Visual | Type | Fields / Measures |
|---|---|---|
| Daily average | Card | `[Average Daily Hours]` |
| Weekly average | Card | `[Average Weekly Hours]` |
| Billable percentage | Card | `[Billable Percentage]` |
| Daily hours | Clustered column chart | Axis: `DimDate[DayName]`; Values: `[Total Hours]` |
| Weekly hours | Line chart | Axis: `DimDate[WeekStart]`; Values: `[Total Hours]` |
| Billable split | Donut chart | Legend: `FactTimesheet[isBillable]`; Values: `[Total Hours]` |
| Weekend and holiday hours | Clustered column chart | Values: `[Weekend Hours]`, `[Holiday Hours]` |
| Status by month | 100% stacked column chart | Axis: `DimDate[MonthYearLabel]`; Legend: `FactTimesheet[status]`; Values: `[Total Hours]` |

Slicers: date range, employee, division, department, status, and billable flag.

### 3. Employee Analytics

Purpose: compare workload and identify employee-level outliers.

| Visual | Type | Fields / Measures |
|---|---|---|
| Employee count | Card | `[Employee Count]` or `[Active Employee Count]` |
| Average hours per employee | Card | `[Average Hours per Employee]` |
| Top employees | Bar chart | Y-axis: `DimEmployee[employeeName]`; X-axis: `[Total Hours]`; visual filter: Top 20 |
| Employee by month | Matrix | Rows: `DimEmployee[employeeName]`; Columns: `DimDate[MonthYearLabel]`; Values: `[Total Hours]` |
| Employee detail | Table | Employee name, employee ID, division, department, `[Total Hours]`, `[Average Daily Hours]`, status |

Enable drill-through using `DimEmployee[employeeId]`. Add a drill-through detail page containing the detailed timesheet table.

### 4. Division and Department Analytics

Purpose: compare organizational units and their approval performance.

| Visual | Type | Fields / Measures |
|---|---|---|
| Hours by division | Clustered bar chart | Category: `DimDivision[divisionName]`; Values: `[Total Hours]` |
| Hours by department | Clustered bar chart | Category: `DimDepartment[departmentName]`; Values: `[Total Hours]` |
| Employees by division | Bar chart | Category: `DimDivision[divisionName]`; Values: `[Active Employee Count]` |
| Submission rate | Gauge | Value: `[Submission Rate]`; target: 100% |
| Approval rate | Gauge | Value: `[Approval Rate]`; target: 100% |
| Status by department | Stacked bar chart | Category: `DimDepartment[departmentName]`; Legend: `FactTimesheet[status]`; Values: `[Total Hours]` |
| Organizational detail | Matrix | Rows: division, department; Values: `[Total Hours]`, `[Active Employee Count]`, `[Submission Rate]`, `[Approval Rate]` |

Use synchronized division and department slicers. Keep cross-filtering one-directional from dimensions to the fact table.

### 5. Project Analytics

Purpose: identify project concentration, contributors, and billable mix.

| Visual | Type | Fields / Measures |
|---|---|---|
| Project hours | Treemap | Group: `DimProject[projectName]`; Values: `[Total Hours]` |
| Top project trend | Line chart | Axis: `DimDate[MonthYearLabel]`; Legend: `DimProject[projectName]`; Values: `[Total Hours]`; filter: Top 5 |
| Project contributors | Stacked bar chart | Category: `DimProject[projectName]`; Legend: `DimEmployee[employeeName]`; Values: `[Total Hours]` |
| Billable mix | Donut chart | Legend: `FactTimesheet[isBillable]`; Values: `[Total Hours]` |
| Project detail | Table | Project code, project name, customer, division, `[Total Hours]`, `[Active Employee Count]`, `[Billable Percentage]` |

Enable drill-through using `DimProject[projectCode]`.

### 6. Compliance and Approvals

Purpose: focus on workflow status and outstanding work.

| Visual | Type | Fields / Measures |
|---|---|---|
| Pending hours | Card | `[Pending Hours]` |
| Submitted hours | Card | `[Submitted Hours]` |
| Approved hours | Card | `[Approved Hours]` |
| Rejected hours | Card | `[Rejected Hours]` |
| Submission rate | Gauge | `[Submission Rate]` |
| Approval rate | Gauge | `[Approval Rate]` |
| Status trend | Line chart | Axis: `DimDate[MonthYearLabel]`; Legend: `FactTimesheet[status]`; Values: `[Total Entries]` |
| Status by division | Stacked column chart | Axis: `DimDivision[divisionName]`; Legend: `FactTimesheet[status]`; Values: `[Total Entries]` |
| Pending detail | Table | Employee, date, project, hours, status, division, department |

Use conditional formatting: approved green, submitted amber, draft gray, rejected red, and recalled orange.

### 7. Weekend and Holiday Analysis

Purpose: identify exceptional working patterns.

| Visual | Type | Fields / Measures |
|---|---|---|
| Weekend hours | Card | `[Weekend Hours]` |
| Holiday hours | Card | `[Holiday Hours]` |
| Weekend by employee | Bar chart | Category: `DimEmployee[employeeName]`; Values: `[Weekend Hours]`; filter: Top 20 |
| Holiday by employee | Bar chart | Category: `DimEmployee[employeeName]`; Values: `[Holiday Hours]`; filter: Top 20 |
| Weekend by division | Bar chart | Category: `DimDivision[divisionName]`; Values: `[Weekend Hours]` |
| Exception calendar | Matrix | Rows: `DimDate[Date]`; Columns: `DimEmployee[employeeName]`; Values: `[Total Hours]`; filter: weekend or holiday |
| Exception detail | Table | Date, day name, employee, division, department, hours, status |

### 8. Detailed Timesheets

Use a table visual for exportable detail.

Columns:

- `FactTimesheet[date]`
- `FactTimesheet[employeeName]`
- `FactTimesheet[employeeId]`
- `FactTimesheet[admin]`
- `FactTimesheet[division]`
- `FactTimesheet[department]`
- `FactTimesheet[project]`
- `FactTimesheet[projectCode]`
- `FactTimesheet[projectCategory]`
- `FactTimesheet[taskClassification]`
- `FactTimesheet[hours]`
- `FactTimesheet[status]`
- `FactTimesheet[isBillable]`

Add conditional formatting to `status` and `hours`. Enable export only for authorized report consumers.

## Slicer Configuration

Synchronize these slicers across the report using **View > Sync slicers**:

| Slicer | Field | Recommended control |
|---|---|---|
| Reporting year | `DimDate[Year]` | Dropdown |
| Reporting month | `DimDate[YearMonth]` | Dropdown |
| Date range | `DimDate[Date]` | Between |
| Division | `DimDivision[divisionName]` | Dropdown with search |
| Department | `DimDepartment[departmentName]` | Dropdown with search |
| Employee | `DimEmployee[employeeName]` | Dropdown with search |
| Status | `FactTimesheet[status]` | Multi-select dropdown |
| Billable | `FactTimesheet[isBillable]` | Dropdown |

## Tooltip Pages

Create report-page tooltips for:

- **Employee tooltip:** employee name, division, department, total hours, billable percentage, approval rate.
- **Project tooltip:** project name, customer, total hours, contributors, billable percentage.
- **Division tooltip:** employee count, total hours, submission rate, approval rate.

## Formatting Recommendations

- Use the existing GCC theme in `powerbi/theme/gcc_timesheet_theme.json`.
- Use cards only for headline KPIs; use charts for comparisons and trends.
- Sort all categorical bar charts by their primary measure descending.
- Use consistent number formats: hours with one decimal, counts with no decimals, and rates as percentages.
- Keep slicers in a consistent top or left rail position across pages.
- Add descriptive visual titles that state the metric and time context.
- Add alt text to every chart and table for accessibility.
- Avoid pie or donut charts when there are more than five categories.

## Build Order

1. Open `GCC_Timesheet.pbix`.
2. Confirm the model refresh succeeds.
3. Apply the GCC theme.
4. Create the Executive Overview page.
5. Create Timesheet, Employee, Organization, Project, and Compliance pages.
6. Add synchronized slicers.
7. Add drill-through pages and tooltip pages.
8. Apply conditional formatting and accessibility text.
9. Save the PBIX and export the final TMDL model after structural changes.
