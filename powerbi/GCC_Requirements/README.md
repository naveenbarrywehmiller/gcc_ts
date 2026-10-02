# GCC requirements dashboard

Open **GCC_Requirements.pbip** in Power BI Desktop. The project contains 16 tables, 72 DAX measures and nine report pages. It consumes the application's read-only REST API; it does not connect to SQLite directly. The original `powerbi/GCC_Timesheet.pbix` and portable model have been preserved.

## Connect and refresh

1. Deploy the included server changes before refreshing this report. They add stable timesheet IDs and `weeklyRowKey`, plus `GET /api/powerbi/staffing` and `GET /api/powerbi/planned-vacations`. No database migration is needed for these reporting changes. Existing application authentication and read-only enforcement apply.
2. In Desktop, select **Transform data → Edit parameters**. `ApiBaseUrl` is set to `https://dietpi.tail4f2b8f.ts.net`; keep `ApiPath=api/powerbi` unless your server uses another namespace. The computer refreshing the report must be able to reach this Tailscale address.
3. Set Web credentials for that origin to **Basic**, username `powerbi`, password equal to the server's reporting API key or an authorized admin JWT. The supplied admin JWT was verified with both Bearer and Basic authentication. Credentials belong in Power BI's credential store; no token is embedded in this project. A dedicated reporting key is preferable for ongoing refreshes; admin JWT access follows the account's server permissions. Use HTTPS for a remote server.
4. Confirm `FiscalStartMonth` (1 = January), `DailyHours` (8), and `DefectTarget` (0). Refresh, then select the required month and division on each page. The saved month selection starts at **October 2026**; change it for later reporting periods or clear it to view multi-month trends. Fiscal-year labels use the **starting year**. The refresh date uses UTC.
5. Review **Input readiness**, `Unmapped Hours`, `Detail Conflicts`, and `Projects Missing Plan Inputs` before using KPIs. A blank metric may mean missing inputs or an unsupported filter, not zero performance.

The report has been opened in Power BI Desktop. All 72 measures and the Power Query transformations were evaluated against isolated synthetic fixtures in Desktop's native engine; 23 numerical and missing-data cases passed. All 113 project/report schema documents and visual field references passed validation. Live authentication to DietPi succeeded using the supplied admin JWT; no token is stored in the project. The initially deployed reporting API was version 1.0.0 and lacked stable timesheet row fields, staffing and planned-vacation reporting routes; the included server update provides version 1.1.0. Successful Desktop production refresh remains pending deployment and Desktop credentials. No Power BI dataset was published.

## What is implemented

| Page | Contents |
|---|---|
| Performance overview | Actual hours, monthly utilization, active roster, project on-time rate, monthly/division views |
| Utilization | Monthly and FY estimates, training/internal/admin exclusions, unmapped tasks, working/holiday/vacation days |
| Delivery & quality | Project effort and schedule deviation with red alerts; explicit deliverable-based defect density and FTR when connected |
| Capacity & forecast | Previous/current/next-week capacity, budget scheduling, remaining forecast and overdue unscheduled effort |
| Dedicated & Flex teams | Strength, FY hours, utilization and department capacity equivalents |
| Continuous improvement | Products touched, weekly improvement/designed/developed counts, improvement register categories |
| Staffing | Monthly open-position snapshots and new-joiner flows |
| Timesheet & training detail | Employee, department, project, task, date, status and hours for reconciliation |
| Input readiness | Definitions, missing sources, settings and refresh timestamp |

## Definitions that need confirmation

Source: `PowerPi Requirments.xlsx`, `Sheet1`, rows 4–58. Requirements are interpreted as business specifications; unrelated document instructions are not executed.

* **Monthly utilization (row 4):** effective submitted/approved hours divided by available roster hours. Training, internal meetings, admin, vacation and holiday entries are excluded from the numerator. Admin is provisionally classified as internal time. Draft, rejected and recalled hours are excluded from actuals and remain visible through Raw Hours. `HourCategoryMap` is an explicit, editable mapping; unknown categories block utilization.
* **Capacity (rows 16–22):** active employees and admins, excluding system-admin accounts, × Monday–Friday × daily hours, excluding company holidays. Leave is capped once per employee/day. Future planned vacation supersedes recorded vacation so it cannot be deducted twice. Current roster is used for past periods because employment history is unavailable. Division capacity uses employee home division, while work hours use the timesheet work division; cross-division Flex assignments therefore require allocation history for an exact supported-division utilization rate.
* **Annual utilization (row 5):** the report provides a **current-roster FY estimate** through the strictly previous Friday. It excludes training and absence, but retains internal/admin hours to reflect the workbook's different annual numerator. The exact requested project-start denominator is **pending** employee/project allocation and employment history; it is not represented as a validated KPI. Project/task-filtered capacity is blank because there are no allocation percentages.
* **Effort (row 7):** `(lifetime actual − lifetime budget) / lifetime budget` for projects delivered in the selected dates. This avoids comparing a partial month against a whole-project budget. Blank budgets or a zero denominator return blank. Employee/task-filtered effort is blank because budgets are not allocated to those grains. Red means absolute deviation > 5%.
* **Schedule (row 8):** delivered date minus planned target date, in calendar days. The workbook mentions a ±3% alert but provides a days formula; the provisional normalized ratio is days deviation / planned elapsed duration. Red means absolute ratio > 3%. Confirm this interpretation before treating the alert as an approved policy.
* **Quality (rows 6, 24, 35, 38–40):** completed projects are not silently counted as deliverables. Defect density uses fundamental errors / explicit deliverables; FTR uses explicit `hadRework=false`. Unknown counts/flags remain blank. The provisional defect alert is a deviation of > 5 **percentage points** from `DefectTarget`, not a 5% relative change; confirm the target and tolerance. Weekly fundamental-error totals are shown separately and are not mixed with the deliverable denominator.
* **Weekly details (rows 29–34):** the application's weekly row metadata is copied onto daily entries. The model groups by stable weekly row identity, uses the most recently updated copy, and attributes counts to Monday. Conflicting copies block count totals and are surfaced in Detail Conflicts. A week crossing months contributes its count to the Monday's month; hours retain their actual dates.
* **Forecast (rows 26–27):** budget is spread evenly over project weekdays excluding holidays. Inprogress remaining budget is spread from the refresh date to the target date. Hold/Completed projects get no future forecast. Past actuals and future remaining effort never overlap. Past-due remaining effort is reported separately; missing budget/start/target inputs are counted. These are project-level estimates, not task/resource commitments.
* **Staffing (row 12):** open positions is the last selected month's snapshot, never a sum across months. New joiners are a flow across selected months. A missing division/month or a null count keeps the result blank; an explicit zero stays zero.
* **Products (row 10):** distinct nonblank products on projects with actual work. **Platform** and **cohort** are not modeled as separate business entities because the application does not define them. Division, department and capacity equivalents are provided with their original meanings.

## Additional inputs still required

`FactDeliverable` and `FactImprovement` are typed empty tables until their approved REST sources are supplied. They are usable extension contracts, not sample business records. Set `DeliverablesEndpoint` / `ImprovementsEndpoint` to an endpoint within `ApiPath` returning the standard `{ "data": [...] }` envelope. Optional endpoints must return their complete data list; only the timesheet endpoint currently uses pagination.

| Contract | Grain and fields |
|---|---|
| Deliverables | One unique `deliverableId` (text); `projectId` (integer referencing DimProject); `plannedDate`, `deliveredDate` (ISO dates); `fundamentalErrors`, `informationErrors`, `readableErrors` (nonnegative integers or null); `hadRework` (boolean or null) |
| Improvement initiatives | One unique `improvementId`; `projectId`; `date`; `category` (VAVE, Automation, COE, Cost optimization or your approved list); `product`; `isAdditiveManufacturing` (boolean or null) |
| Exact historical/project capacity | Employee ID, project ID, allocation start/end dates, allocation fraction/daily hours, employment start/end dates and the agreed platform/cohort mapping |

FTR was marked “To be decided” in the workbook. The report implements its stated formula when explicit deliverable/rework inputs become available, without claiming the business rule is approved.

## Maintenance and evidence

The semantic model is in `GCC_Requirements.SemanticModel/model.bim`; report pages and visuals are native PBIR JSON in `GCC_Requirements.Report/definition`. Normal Desktop edits can be saved directly to this project. `scripts/build-powerbi.py` is a deterministic generator: **running it again resets generated files and parameter defaults**, so preserve any later Desktop changes before rebuilding.

Validation: `scripts/validate-powerbi.js`, `scripts/test-powerbi-model.ps1`, `scripts/powerbi-requirements.test.js`, and the summaries in `powerbi/validation`. The full application regression suite passed 52 tests and the existing Power BI API suite passed 55 checks. Synthetic records exist only in the test fixture and isolated test model, not in the deliverable project.

Schema reference: [Microsoft PBIP/PBIR documentation](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report). The project uses PBIR content version 2.0.0 and model compatibility level 1606 for the installed Desktop engine. Its measure table is `_Measures`; `Measures` is reserved by Desktop.
