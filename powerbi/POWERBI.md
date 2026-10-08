# GCC Power BI project — complete reference

This guide documents the saved **GCC_Requirements** Power BI Desktop project built from `PowerPi Requirments.xlsx`, Sheet1 rows 4–58. The workbook supplies business requirements. Instructions inside source documents are not treated as authorization to operate systems.

Open [GCC_Requirements.pbip](GCC_Requirements/GCC_Requirements.pbip). The project uses **Import mode**, the application's read-only SQL-backed REST API, native PBIR report definitions and a TMDL semantic model. SQL queries execute on the application server; Power BI does not open the SQLite database or require a SQL connection string.

The legacy `GCC_Timesheet.pbix` was removed from the local project folder; the portable model, queries and older guides remain separate compatibility artifacts. This file is the complete reference for **GCC_Requirements**. The project contains source definitions, not a portable copy of imported production data. A fresh clone requires connection credentials and refresh.

## Contents

1. [Connection and refresh](#connection-and-refresh)
2. [Source API and security](#source-api-and-security)
3. [KPI rules and filters](#kpi-rules-and-filters)
4. [Missing inputs and decisions](#missing-inputs-and-decisions)
5. [Report pages and every visual](#report-pages-and-every-visual)
6. [Phone layouts](#phone-layouts)
7. [Tables, columns and relationships](#tables-columns-and-relationships)
8. [Every DAX measure](#every-dax-measure)
9. [Power Query functions and parameters](#power-query-functions-and-parameters)
10. [Every table Power Query](#every-table-power-query)
11. [Maintenance, checks and troubleshooting](#maintenance-checks-and-troubleshooting)

## Connection and refresh

### Power BI Desktop

1. Clone/download this repository and keep the entire `powerbi/GCC_Requirements` directory together. Open `GCC_Requirements.pbip` in a Desktop build supporting PBIP, PBIR and TMDL. The saved model uses compatibility level **1606**. An old build that cannot open the project should be upgraded; do not downgrade the model to bypass an error. See [Microsoft's semantic-model project formats](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset).
2. Ensure the refreshing Windows computer is connected to the appropriate Tailscale network and can reach `https://dietpi.tail4f2b8f.ts.net/`. A browser view of the application home page proves network reachability, not reporting authentication.
3. In **Transform data → Edit parameters**, check the parameters below. Set the server origin without an endpoint suffix. `ApiPath` supplies the reporting namespace. Confirm fiscal and capacity assumptions before using KPIs.
4. In **File → Options and settings → Data source settings**, select the Web source at the DietPi origin and choose **Edit permissions**. If an old localhost/Anonymous credential is cached, clear that source's permissions and reconnect. Choose **Basic**, username **powerbi**, and use the reporting API key or an authorized administrator JWT as the password. Apply credentials to the origin used by `ApiBaseUrl`. Enter the secret in the credential dialog yourself; it is not a project parameter.
5. Use **Organizational** privacy for this internal data source unless your organization's policy requires another level. Apply changes and **Refresh**. M uses `Web.Contents` with `RelativePath`, `Query`, a JSON Accept header and a five-minute request timeout; it does not include a secret or Authorization header in its source. See [Microsoft Web.Contents reference](https://learn.microsoft.com/en-us/powerquery-m/web-contents).
6. Review **Input readiness**, the refresh timestamp, unmapped hours, weekly detail conflicts and projects missing plan inputs. Reconcile **Raw Hours**, **Actual Hours** and **Approved Hours** against the application for the same dates and division. Select the reporting month on each page; the saved selection is **2026-10**, not a moving “current month.” A single selected month narrows trend charts to that month; clear the month slicer to inspect a longer trend.
7. Save the PBIP after your intended Desktop edits. If Desktop displays **Apply external changes**, save/review unsaved edits before accepting replacement of the open report. Reopen from the canonical PBIP if necessary. Do not run the legacy BIM generator against the saved TMDL project.

| Parameter | Saved value | Meaning |
|---|---|---|
| ApiBaseUrl | `https://dietpi.tail4f2b8f.ts.net` | HTTPS server origin reachable from the refreshing machine |
| ApiPath | `api/powerbi` | Read-only reporting namespace |
| FiscalStartMonth | `1` | January; valid business setting 1–12; FY labels use the starting year |
| DailyHours | `8` | Standard employee hours per Monday–Friday workday |
| DefectTarget | `0` | Provisional target ratio; 0.02 would mean 2% |
| DeliverablesEndpoint | empty string | Optional endpoint name under ApiPath; leaves typed empty FactDeliverable until supplied |
| ImprovementsEndpoint | empty string | Optional endpoint name under ApiPath; leaves typed empty FactImprovement until supplied |

`RefreshClock` captures a fixed UTC instant and converts it to **Indian Standard Time (IST, UTC+05:30)** with `DateTimeZone.SwitchZone(DateTimeZone.FixedUtcNow(), 5, 30)`. Every viewer sees the same IST value, regardless of location or device timezone. `Settings.RefreshIST` stores it as `yyyy-MM-dd HH:mm:ss IST` text. See Microsoft's [FixedUtcNow](https://learn.microsoft.com/en-us/powerquery-m/datetimezone-fixedutcnow) and [SwitchZone](https://learn.microsoft.com/en-us/powerquery-m/datetimezone-switchzone) references.

`Settings.AsOfDate`, `DimDate` calendar bounds and `FactPlan` forecast boundaries all use `Date.From(DateTimeZone.RemoveZone(RefreshClock))`. Removing the zone preserves the IST wall-clock value before extracting its date, avoiding an implicit conversion to the refreshing computer's timezone. FY windows and the strictly previous completed Friday therefore follow the IST reporting date. Source work dates, project dates and holidays are date-only business fields and retain their original dates. See Microsoft's [RemoveZone reference](https://learn.microsoft.com/en-us/powerquery-m/datetimezone-removezone). Changing a date slicer does not move the refresh clock or recalculate the imported remaining-budget schedule. **Reopen the canonical project and use Home → Refresh → Data after applying this timezone update**; the previous imported cache uses UTC and is not proof of an IST refresh. Desktop stores source credentials locally; GitHub does not distribute them.

### Current Desktop refresh controls

Automatic refresh is **off** for this local Import-mode project, as selected by the user. To fetch the latest data for all tables, use **Home → Refresh → Data**. **Schema and data** also refreshes data and rechecks source structure. The built-in ribbon command is the working Refresh All control; a normal canvas button cannot execute this Desktop import. Every page shows these instructions and a separate **Last refreshed (IST)** visual in `yyyy-MM-dd HH:mm:ss IST` format, using small muted text with a transparent background. The timestamp comes from imported Settings, captured when the refresh starts and retained with that imported snapshot; it is not the current computer clock or the source's latest timesheet modification date. Before the first import it shows **Not refreshed yet**.

No automatic-refresh checkbox or interval dropdown is added because those controls cannot schedule this Desktop Import model. A slicer would only filter values. If automation is needed later, configure Power BI Service semantic-model scheduled refresh and its gateway connection; automatic page refresh does not refresh imported REST data. See [Microsoft's Import-mode refresh limitations](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-automatic-page-refresh).

### Power BI Service and scheduled refresh

This repository push deploys application code through the repository's Docker workflow. **It does not publish the Power BI report or schedule semantic-model refresh.** The artifact is a nine-page report; a Power BI Service dashboard with pinned tiles has not been created.

If sharing through Power BI Service is required, publish the report from Desktop to an approved workspace, configure the semantic model's connection/credentials and run an on-demand refresh before scheduling. The DietPi hostname is private to the tailnet. The practical design is an on-premises data gateway on an always-on Windows machine that can resolve and reach that origin through Tailscale; verify this from the gateway's execution environment. This gateway requirement is an inference from the private source topology, not evidence of a deployed gateway. Configure a Web connection with the same source origin and Basic credentials, then bind the semantic model to it. Confirm workspace viewer access and privacy rules before sharing.

Choose a refresh schedule matching the timesheet approval process. Check refresh history, gateway availability and credential rotation whenever a refresh fails. Microsoft documents the [gateway, credentials and scheduled-refresh settings](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-scheduled-refresh). No Power BI Service publication, gateway installation, RLS configuration or schedule is claimed as completed here.

## Source API and security

The requirements project needs **reporting API v1.1.0**, included in application **v1.15.0**. `GET /api/powerbi/version` is the compatibility check. API and application versions are separate version numbers.

| Endpoint under `/api/powerbi/` | Used by | Response/grain |
|---|---|---|
| version | Connection/compatibility diagnostics | Version metadata, not a model table |
| users | DimEmployee | `{ "data": [...] }`, current roster IDs, organizational/team/role/active fields |
| projects | DimProject | Project IDs, budget, dates, status, division and product fields |
| divisions | DimDivision | Division ID/name master |
| holidays | DimHoliday and DimDate | Company holiday IDs/dates |
| tasks | DimTask | Task category and Billable/Nonbillable classification |
| timesheets | TimesheetRows, FactTimesheet, FactWeeklyDetails | Paginated daily entries with stable IDs and copied weekly metadata |
| planned-vacations | FactVacation | Planned full-day employee/date absence |
| staffing | FactStaffing | Division/month, open-position snapshot and new-joiner flow |
| configured optional deliverable endpoint | FactDeliverable | Complete list, one unique deliverable ID |
| configured optional improvement endpoint | FactImprovement | Complete list, one unique improvement ID |

The server also exposes other reporting routes, including departments, assignments and status-summary. They are not consumed by this model. Their existence does not imply a validated historical resource-allocation source.

`fnApi` requests timesheets in pages of 1,000, fetches the first page once, uses `pagination.totalPages` and verifies that the combined row count equals `pagination.total`. It fails on invalid/missing pagination metadata, malformed envelopes or a changed total during refresh. Other endpoints, including optional sources, must return a complete `data` list in one response. Pagination count checks do not provide database snapshot isolation; a same-count edit between requests can still occur. For a period-end reconciliation, refresh after submissions/approvals are stable. The model imports all returned history; incremental refresh and server-side date partitioning are not implemented.

Daily input requires `id`, `userId`, `projectId`, `taskId`, `date`, `hours`, `status`, `weeklyRowKey` and `weeklyDetails`. It checks unique daily IDs, converts types and classifies the API's **projectCategory** value through `HourCategoryMap`. The map's key column is named taskCategory; its actual join input is the timesheet projectCategory label. `DimTask[classification]` is a separate business field and does not drive productive hours.

The server derives `weeklyRowKey` from user, week year/week, project, task, division, subdivision, project description and ownership identity. One weekly count copied onto five daily entries is counted once. The latest `updatedDate`, then largest daily `id`, selects the retained metadata copy. Inconsistent copies set `detailConflict=true` and block affected weekly totals. Weekly counts are attributed to **Monday**; daily hours retain each work date. Weeks crossing a month boundary therefore need different monthly reconciliation rules for counts and hours.

### Authentication and access

The reporting routes enforce read-only GET/HEAD/OPTIONS behavior; POST/PUT/PATCH/DELETE receive 405. Supported server authentication includes a dedicated `POWERBI_API_KEY`, Basic-password credentials, Bearer credentials, and active administrator JWT fallback. The supplied administrator JWT was verified via both Bearer and Basic. No token is stored in the project, formulas, guide, fixtures or Git history created for this report. A dedicated reporting key is preferable for ongoing refresh because it only authenticates the reporting namespace. Store it in the server's private environment and Power BI credential stores. Do not put secrets in M, query-string URLs, Markdown or Git.

Regular administrator access scopes project/timesheet facts and the staffing/vacation routes using server division permissions; a system administrator or dedicated reporting key can access the broader reporting scope. Organization and roster dimensions can still be global. **API scoping is not Power BI row-level security.** This model has no RLS roles. Anyone granted access to the imported semantic model may see its imported authorized scope unless separate workspace permissions/RLS are configured. Choose the credential scope and report audience together.

Server references: [routes](../server/src/routes/powerbi.js), [reporting queries](../server/src/services/powerBiService.js), [authentication middleware](../server/src/middleware/powerBiAuth.js). No schema migration was required for the added stable row fields, staffing and vacation reporting routes.

## KPI rules and filters

| Area | Implemented rule | Interpretation/limitation |
|---|---|---|
| Actuals | Submitted + approved; Approved Hours is approved only; Raw Hours retains all statuses | A blank sum is not automatically confirmed zero |
| Monthly utilization | Effective Hours / Available Hours | Training, internal, admin, vacation and holiday excluded from effective numerator; any unmapped actual hours keep utilization blank |
| Current capacity | Active roster excluding system-admin accounts × weekdays excluding holidays × DailyHours, less capped vacation | Current-roster estimate for past/future dates; no historical employment contracts |
| Vacation capacity | Per employee/date, capped at DailyHours; future planned vacation supersedes recorded leave | Weekends/holidays excluded; recorded and planned absence cannot be deducted twice; planned leave is not approved leave |
| FY utilization | Fiscal start through Friday strictly before refresh; actuals excluding training, vacation and holiday | Internal/admin remain in the annual numerator, following the workbook's different annual rule; exact utilization from project start is pending allocation history |
| Dedicated/Flex | Exact employee supportingCategory values `Dedicated Team` and `Flex Team` | Hours follow employees' work; capacity follows home division; cross-division allocation is unavailable |
| Employee equivalents | Unused available hours / standard selected-period employee capacity | Capacity equivalent, not a named cohort, assignment, vacancy or count of idle people |
| Project delivery | Selected delivered-date project cohort; on time if delivered ≤ target | Project grain; does not claim projects are deliverables |
| Effort deviation | (Lifetime actual − lifetime budget) / lifetime budget for selected delivered cohort | Complete known budgets required; date filter removed for lifetime actuals; employee/task-filtered effort blank; absolute >5% alert |
| Schedule deviation | Mean delivered − target in calendar days; provisional normalized mean of deviation / planned elapsed duration | Positive means late; absolute normalized >3% alert; days/percent ambiguity needs confirmation |
| Quality | Explicit fundamental errors / explicit deliverables; FTR is explicit hadRework=false / deliverables | Unknown error counts/rework flags remain blank; no substitute denominator; defect ratio may exceed 100% |
| Defect alert | Absolute difference from DefectTarget >0.05 | Five percentage points, provisionally; not a 5% relative change |
| Weekly activity | Latest unique weekly row counts; Monday attribution | Contradictory copies block totals; null counts are not manufactured zeros |
| Products | Distinct nonblank products on projects with actual work | Separate from product-module, platform or cohort |
| Improvement categories | Distinct initiative IDs from approved register | Empty until connected; weekly improvement log counts are separately available |
| Staffing | Open positions = last selected month snapshot; joiners = flow across selected months | Blank if any required division/month submission or count is missing; explicit zero remains zero |
| Budget schedule | Even spread over project weekdays excluding holidays | Project demand estimate, not employee/task commitment |
| Future forecast | Inprogress remaining budget after pre-refresh actuals, spread across remaining planned workdays | Hold/Completed get no future remaining forecast; no allocation history; overdue remaining effort shown separately |
| Team forecast | Actuals before refresh + remaining schedule from refresh onward | Does not double count the same past/future dates; refresh needed to move the boundary |

`DimDate` is continuous and covers source bounds plus at least the previous/next year around refresh, rounded to calendar-year bounds. Fiscal-year labels identify the **start year**. Monday is week start; holidays are company-wide. Optional deliverable/improvement dates are not calendar-bound inputs: when adding those sources, ensure their dates fall inside DimDate or extend the calendar query.

Division filtering uses different real grains: work hours follow `FactTimesheet[division]`, roster capacity follows employee home division, and project measures follow project division. DimDivision is deliberately disconnected from employee/project facts; the relevant DAX measures apply the selected division explicitly. FactStaffing has a direct division relationship. Do not add ambiguous bidirectional relationships to make every table appear connected. Exact supported-division Flex utilization requires allocation history.

Capacity, effort and project forecast return blank under unsupported employee/project/task filters as specified in their formulas. Roster strength is independent of date/project because it is the current active roster. Report slicers use normal page context; do not assume that selecting a month/division on one page has synchronized every other page. Weekly measures filter through Monday dates; staffing records use month-start dates while staffing card measures explicitly evaluate selected months.

## Missing inputs and decisions

These gaps are represented as blanks/readiness information, not invented business records. The user explicitly chose **keep utilization blank until task mapping is confirmed**. The live labels `SOP 1234` and `vgnn` are Billable but stay **Unmapped**. Confirm their approved hour categories before adding entries to HourCategoryMap; do not map all Billable work to Productive automatically.

| Priority | Input/decision | Needed for | What to provide/change |
|---|---|---|---|
| 1 | Approved task/category mapping | Monthly, Dedicated/Flex and FY utilization | Map normalized timesheet projectCategory labels to Productive/Training/Internal/Admin/Vacation/Holiday; confirm current two labels |
| 1 | Fiscal calendar and standard hours | Capacity and FY metrics | Confirm start month, 8-hour day, weekdays, local business-day cut-off and holiday calendar |
| 1 | Monthly staffing submissions | Open Positions/New Joiners | One entry per active division/month, explicitly distinguishing zero from unknown; live staffing list is currently empty |
| 1 | Project budget/start/target/delivery inputs | Effort, schedule, delivery, forecast | Populate real master fields; confirm status semantics and the ±3% normalization |
| 2 | Deliverable register | Defect Density, Fundamental/Information/Readable Errors, FTR and deliverable on-time | Unique IDs, dates, error counts and explicit hadRework flags; confirm FTR rule and defect target/tolerance |
| 2 | Improvement register | VAVE/Automation/COE/cost/additive counts | Unique initiative IDs, project/date/category/product and explicit additive flag; agree category names |
| 2 | Employment/allocation history | Exact historical/project-start capacity and Flex supported-division utilization | Employee/project IDs, effective dates, allocation fraction/hours, employment start/end and division transfers |
| 3 | Platform/cohort definitions | Workbook platform/cohort views | Define separate business entities and mapping keys; division is not silently renamed platform |
| 3 | Publication and operations decisions | Shared Power BI Service report | Workspace/audience, credential scope, gateway owner, refresh cadence, RLS/access plan and report owner |

### Optional REST contracts

Set each endpoint parameter to its path **within ApiPath**. For example, `DeliverablesEndpoint="deliverables"` means `/api/powerbi/deliverables`; do not enter a full URL. These are extension contracts; the application does not currently implement these two register routes. They must use the same approved authentication and return a complete `{ "data": [...] }` envelope.

| Deliverable field | Type/requirement |
|---|---|
| deliverableId | Unique nonempty text; required; checked by M |
| projectId | Integer referencing DimProject.id |
| plannedDate, deliveredDate | ISO `YYYY-MM-DD` dates; needed for on-time/completion filtering |
| fundamentalErrors, informationErrors, readableErrors | Nonnegative integer counts or null for unknown; validate nonnegative counts upstream |
| hadRework | Boolean true/false or null for unknown; missing is not false |

| Improvement field | Type/requirement |
|---|---|
| improvementId | Unique nonempty text; required; checked by M |
| projectId | Integer referencing DimProject.id |
| date | ISO date within the report calendar |
| category | Approved category label, e.g. VAVE, Automation, COE or Cost optimization |
| product | Approved product label or null |
| isAdditiveManufacturing | Explicit boolean or null; missing is not false |

M checks unique/nonempty register IDs and converts types. Full validation of foreign keys, nonnegative business counts, allowed categories and reasonable dates is still an upstream responsibility. No optional source is filled with samples. Weekly error/improvement totals do not silently populate the deliverable/initiative registers. The workbook labels FTR “To be decided”; the explicit formula is available once inputs and the business rule are approved.


## Saved project inventory

Reference generated **2026-10-07** from the saved model/PBIR sources. Application version: **1.18.1**; required reporting API: **1.1.0**. Inventory: **16 tables, 72 DAX measures, 18 relationships, 11 shared M expressions, 9 pages and 116 visual containers**. Visual count includes titles, explanatory text, slicers and status cards. The following inventories and code blocks are extracted from project metadata, not screenshots or production records.

```text
powerbi/
  POWERBI.md
  GCC_Requirements/
    GCC_Requirements.pbip
    .gitignore                       # excludes local .pbi cache/settings
    GCC_Requirements.Report/
      definition.pbir               # local semantic-model reference
      definition/
        report.json, version.json
        pages/<page>/page.json
        pages/<page>/visuals/<id>/visual.json
    GCC_Requirements.SemanticModel/
      definition.pbism
      definition/
        database.tmdl, model.tmdl
        expressions.tmdl, relationships.tmdl
        tables/*.tmdl
      diagramLayout.json, .platform
  validation/                       # schema/native-fixture evidence
```

The saved canonical semantic model is **definition/*.tmdl**. Desktop converted the original BIM scaffold on save; `model.bim` is intentionally absent. Preserve the PBIP, report folder and semantic-model folder together. Local `.pbi` cache and credentials are excluded from Git. Every visual folder also contains `mobile.json` with independent native phone geometry/formatting.


## Report pages and every visual

All pages are **1440 × 1040**, FitToPage, with Segoe UI text, pale-gray canvas, white visual backgrounds and dark headings. Heading boxes are 76 units tall at 24 pt; explanatory boxes are 66 units tall to fit wrapped text. Each page has a compact 52-unit refresh-time visual with a 9 pt label and 10 pt timestamp, transparent background, no border or shadow, plus a 50-unit manual-refresh instruction strip. Native visuals used are textboxes, legacy cards, slicers, clustered column charts, line charts and tables. No external/custom visual package is required. Red (`#DC2626`) means a defined alert exceeded; green (`#0F766E`) means within tolerance; gray (`#64748B`) means unknown. Alert-color measures bind through native conditional formatting on the relevant cards.

The inventory below lists every visual ID, type, title and bound query role. `Values` is the legacy-card/table role, `Category` is the category axis/slicer role and `Y` is a chart value role. Textboxes have no model fields. Any additional model-bound conditional formatting is listed with the visual. IDs match the PBIR paths for maintenance.


### GCC | Management overview

Page ID: `01_overview`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/01_overview/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 01_overview_01 | Text | GCC \| Management overview | Static text | 8, 8 / 308 × 72 |
| 01_overview_02 | Text | Blank KPI? Check Input readiness. Utilization needs mapped hours; on-time delivery needs target dates.<br>Actual hours include submitted and approved entries. Team size and capacity use the current roster. | Static text | 8, 652 / 308 × 136 |
| 01_overview_03 | Slicer | Reporting month | Values: `DimDate[YearMonth]` | 8, 148 / 308 × 80 |
| 01_overview_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 236 / 308 × 80 |
| 01_overview_05 | Slicer | Fiscal year (start year) | Values: `DimDate[FiscalYear]` | 8, 324 / 308 × 80 |
| 01_overview_06 | Card | Actual hours | Values: `_Measures[Actual Hours]` | 8, 412 / 150 × 112 |
| 01_overview_07 | Card | Monthly utilization | Values: `_Measures[Monthly Utilization %]` | 166, 412 / 150 × 112 |
| 01_overview_08 | Card | Active team members | Values: `_Measures[Active Team Strength]` | 8, 532 / 150 × 112 |
| 01_overview_09 | Card | Projects delivered on time | Values: `_Measures[Project On Time %]` | 166, 532 / 150 × 112 |
| 01_overview_10 | Clustered column chart | Actual and training hours by month | Category: `DimDate[YearMonth]`; Y: `_Measures[Actual Hours]`, `_Measures[Training Hours]` | 8, 796 / 308 × 288 |
| 01_overview_11 | clusteredBarChart | Actual hours by division | Category: `DimDivision[divisionName]`; Y: `_Measures[Actual Hours]` | 8, 1092 / 308 × 288 |
| 01_overview_12 | Table | Division performance \| compare workload, utilization and delivery | Values: `DimDivision[divisionName]`, `_Measures[Actual Hours]`, `_Measures[Monthly Utilization %]`, `_Measures[Under Utilized %]`, `_Measures[Projects Delivered]`, `_Measures[Project On Time %]`, `_Measures[Products Touched]` | 8, 1388 / 308 × 400 |
| 01_overview_refresh_help | Text | Saved snapshot · Auto-refresh off · Desktop refresh: Home > Refresh > Data | Static text | 8, 1796 / 308 × 88 |
| 01_overview_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 88 / 308 × 52 |


### GCC | Utilization

Page ID: `02_utilization`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/02_utilization/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 02_utilization_01 | Text | GCC \| Utilization | Static text | 8, 8 / 308 × 64 |
| 02_utilization_02 | Text | Monthly: effective work / available hours. Annual: work less training and leave through last completed Friday. Both use current-roster estimates. | Static text | 8, 716 / 308 × 104 |
| 02_utilization_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 02_utilization_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 02_utilization_05 | Slicer | Dedicated / Flex | Values: `DimEmployee[supportingCategory]` | 8, 364 / 308 × 104 |
| 02_utilization_06 | Card | Monthly Utilization % | Values: `_Measures[Monthly Utilization %]` | 8, 476 / 150 × 112 |
| 02_utilization_07 | Card | FY Utilization Through Friday % | Values: `_Measures[FY Utilization Through Friday %]` | 166, 476 / 150 × 112 |
| 02_utilization_08 | Card | Under Utilized % | Values: `_Measures[Under Utilized %]` | 8, 596 / 150 × 112 |
| 02_utilization_09 | Card | Unmapped Hours | Values: `_Measures[Unmapped Hours]` | 166, 596 / 150 × 112 |
| 02_utilization_10 | Line chart | Monthly utilization | Category: `DimDate[YearMonth]`; Y: `_Measures[Monthly Utilization %]`, `_Measures[Under Utilized %]` | 8, 828 / 308 × 288 |
| 02_utilization_11 | Clustered column chart | Hours by task category | Category: `DimTask[taskCategory]`; Y: `_Measures[Actual Hours]` | 8, 1124 / 308 × 288 |
| 02_utilization_12 | Table | Capacity and exclusions | Values: `DimEmployee[department]`, `_Measures[Active Team Strength]`, `_Measures[Working Days]`, `_Measures[Holiday Days]`, `_Measures[Vacation Days]`, `_Measures[Available Hours]`, `_Measures[Training Hours]`, `_Measures[Internal Hours]`, `_Measures[Admin Hours]` | 8, 1532 / 308 × 400 |
| 02_utilization_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1420 / 308 × 104 |
| 02_utilization_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Delivery & quality

Page ID: `03_delivery`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/03_delivery/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 03_delivery_01 | Text | GCC \| Delivery & quality | Static text | 8, 8 / 308 × 64 |
| 03_delivery_02 | Text | Effort compares lifetime work with lifetime budget for projects delivered in the selected period. Gray quality cards mean the deliverable source is missing. | Static text | 8, 716 / 308 × 104 |
| 03_delivery_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 03_delivery_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 03_delivery_05 | Slicer | Fiscal year • start-year label | Values: `DimDate[FiscalYear]` | 8, 364 / 308 × 104 |
| 03_delivery_06 | Card | Effort deviation | Values: `_Measures[Effort Deviation %]`; Formatting/other: `_Measures[Effort Alert Color]` | 8, 476 / 150 × 112 |
| 03_delivery_07 | Card | Schedule deviation | Values: `_Measures[Schedule Deviation %]`; Formatting/other: `_Measures[Schedule Alert Color]` | 166, 476 / 150 × 112 |
| 03_delivery_08 | Card | Defect density | Values: `_Measures[Defect Density %]`; Formatting/other: `_Measures[Defect Alert Color]` | 8, 596 / 150 × 112 |
| 03_delivery_09 | Card | First time right | Values: `_Measures[First Time Right %]` | 166, 596 / 150 × 112 |
| 03_delivery_10 | Clustered column chart | Project deliveries by month | Category: `DimDate[YearMonth]`; Y: `_Measures[Projects Delivered]`, `_Measures[Projects On Time]` | 8, 828 / 308 × 288 |
| 03_delivery_11 | Clustered column chart | Weekly quality and improvements | Category: `DimDate[WeekStart]`; Y: `_Measures[Weekly Fundamental Errors]`, `_Measures[Improvement Log Count]` | 8, 1124 / 308 × 288 |
| 03_delivery_12 | Table | Project delivery detail | Values: `DimProject[projectCode]`, `DimProject[projectName]`, `DimProject[targetDate]`, `DimProject[deliveredDate]`, `_Measures[Delivered Project Budget Hours]`, `_Measures[Delivered Project Actual Hours]`, `_Measures[Schedule Deviation Days]` | 8, 1532 / 308 × 400 |
| 03_delivery_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1420 / 308 × 104 |
| 03_delivery_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Capacity & forecast

Page ID: `04_capacity`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/04_capacity/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 04_capacity_01 | Text | GCC \| Capacity & forecast | Static text | 8, 8 / 308 × 64 |
| 04_capacity_02 | Text | Forecast is an estimate from remaining project budgets spread over future working dates. Department/team demand needs resource allocations; clear the team filter. | Static text | 8, 836 / 308 × 104 |
| 04_capacity_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 04_capacity_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 04_capacity_05 | Slicer | Fiscal year • start-year label | Values: `DimDate[FiscalYear]` | 8, 364 / 308 × 104 |
| 04_capacity_06 | Card | Available Hours Last Week | Values: `_Measures[Available Hours Last Week]` | 8, 476 / 150 × 112 |
| 04_capacity_07 | Card | Available Hours Current Week | Values: `_Measures[Available Hours Current Week]` | 166, 476 / 150 × 112 |
| 04_capacity_08 | Card | Available Hours Next Week | Values: `_Measures[Available Hours Next Week]` | 8, 596 / 150 × 112 |
| 04_capacity_09 | Card | Overdue Unscheduled Hours | Values: `_Measures[Overdue Unscheduled Hours]` | 166, 596 / 150 × 112 |
| 04_capacity_10 | Line chart | Actuals plus future demand | Category: `DimDate[WeekStart]`; Y: `_Measures[Team Forecast Hours]`, `_Measures[Hours Scheduled]`, `_Measures[Available Hours]` | 8, 948 / 308 × 288 |
| 04_capacity_11 | Card | Projects missing planning inputs | Values: `_Measures[Projects Missing Plan Inputs]` | 8, 716 / 308 × 112 |
| 04_capacity_12 | Table | Project planning inputs | Values: `DimProject[projectCode]`, `DimProject[projectStatus]`, `DimProject[startDate]`, `DimProject[targetDate]`, `DimProject[budgetHours]`, `_Measures[Hours Scheduled]`, `_Measures[Remaining Forecast Hours]` | 8, 1356 / 308 × 400 |
| 04_capacity_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1244 / 308 × 104 |
| 04_capacity_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Dedicated & Flex teams

Page ID: `05_teams`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/05_teams/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 05_teams_01 | Text | GCC \| Dedicated & Flex teams | Static text | 8, 8 / 308 × 64 |
| 05_teams_02 | Text | Team type comes from each employee’s supporting category. Strength is the current roster; contributing employees have submitted or approved work in the selected period. | Static text | 8, 716 / 308 × 104 |
| 05_teams_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 05_teams_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 05_teams_05 | Slicer | Dedicated / Flex | Values: `DimEmployee[supportingCategory]` | 8, 364 / 308 × 104 |
| 05_teams_06 | Card | Dedicated Strength | Values: `_Measures[Dedicated Strength]` | 8, 476 / 150 × 112 |
| 05_teams_07 | Card | Flex Strength | Values: `_Measures[Flex Strength]` | 166, 476 / 150 × 112 |
| 05_teams_08 | Card | Dedicated FY Hours | Values: `_Measures[Dedicated FY Hours]` | 8, 596 / 150 × 112 |
| 05_teams_09 | Card | Flex FY Hours | Values: `_Measures[Flex FY Hours]` | 166, 596 / 150 × 112 |
| 05_teams_10 | Clustered column chart | Dedicated / Flex hours | Category: `DimDate[YearMonth]`; Y: `_Measures[Dedicated Hours]`, `_Measures[Flex Hours]` | 8, 828 / 308 × 288 |
| 05_teams_11 | Line chart | Flex utilization through the year | Category: `DimDate[YearMonth]`; Y: `_Measures[Flex Utilization %]` | 8, 1124 / 308 × 288 |
| 05_teams_12 | Table | Department capacity | Values: `DimEmployee[department]`, `_Measures[Flex Strength]`, `_Measures[Contributing Employees]`, `_Measures[Actual Hours]`, `_Measures[Monthly Utilization %]`, `_Measures[Available Employee Equivalents]` | 8, 1532 / 308 × 400 |
| 05_teams_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1420 / 308 × 104 |
| 05_teams_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Continuous improvement

Page ID: `06_improvement`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/06_improvement/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 06_improvement_01 | Text | GCC \| Continuous improvement | Static text | 8, 8 / 308 × 64 |
| 06_improvement_02 | Text | Weekly counts are deduplicated and attributed to Monday. VAVE / Automation / COE / cost optimization and additive manufacturing need the improvement register. | Static text | 8, 716 / 308 × 104 |
| 06_improvement_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 06_improvement_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 06_improvement_05 | Slicer | Fiscal year • start-year label | Values: `DimDate[FiscalYear]` | 8, 364 / 308 × 104 |
| 06_improvement_06 | Card | Products Touched | Values: `_Measures[Products Touched]` | 8, 476 / 150 × 112 |
| 06_improvement_07 | Card | Improvement Log Count | Values: `_Measures[Improvement Log Count]` | 166, 476 / 150 × 112 |
| 06_improvement_08 | Card | Designed | Values: `_Measures[Designed]` | 8, 596 / 150 × 112 |
| 06_improvement_09 | Card | Developed | Values: `_Measures[Developed]` | 166, 596 / 150 × 112 |
| 06_improvement_10 | Clustered column chart | Improvement activity by week | Category: `DimDate[WeekStart]`; Y: `_Measures[Improvement Log Count]`, `_Measures[Designed]`, `_Measures[Developed]` | 8, 828 / 308 × 288 |
| 06_improvement_11 | Clustered column chart | Initiatives by category • source pending | Category: `FactImprovement[category]`; Y: `_Measures[Improvement Initiatives]` | 8, 1124 / 308 × 288 |
| 06_improvement_12 | Table | Weekly improvement details | Values: `FactWeeklyDetails[date]`, `DimProject[projectCode]`, `FactWeeklyDetails[item_number]`, `FactWeeklyDetails[improvement_location]`, `_Measures[Improvement Log Count]`, `_Measures[Weekly Fundamental Errors]`, `_Measures[Detail Conflicts]` | 8, 1532 / 308 × 400 |
| 06_improvement_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1420 / 308 × 104 |
| 06_improvement_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Staffing

Page ID: `07_staffing`. Visuals: **14**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/07_staffing/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 07_staffing_01 | Text | GCC \| Staffing | Static text | 8, 8 / 308 × 64 |
| 07_staffing_02 | Text | Open positions are the last selected month’s snapshot. New joiners are summed across selected months. Missing division/month submissions remain blank. | Static text | 8, 716 / 308 × 104 |
| 07_staffing_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 07_staffing_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 07_staffing_05 | Slicer | Fiscal year • start-year label | Values: `DimDate[FiscalYear]` | 8, 364 / 308 × 104 |
| 07_staffing_06 | Card | Open Positions | Values: `_Measures[Open Positions]` | 8, 476 / 150 × 112 |
| 07_staffing_07 | Card | New Joiners | Values: `_Measures[New Joiners]` | 166, 476 / 150 × 112 |
| 07_staffing_08 | Card | Active Team Strength | Values: `_Measures[Active Team Strength]` | 8, 596 / 150 × 112 |
| 07_staffing_09 | Card | Contributing Employees | Values: `_Measures[Contributing Employees]` | 166, 596 / 150 × 112 |
| 07_staffing_10 | Clustered column chart | Monthly open positions | Category: `DimDate[YearMonth]`; Y: `_Measures[Open Positions]` | 8, 828 / 308 × 288 |
| 07_staffing_11 | Clustered column chart | Monthly new joiners | Category: `DimDate[YearMonth]`; Y: `_Measures[New Joiners]` | 8, 1124 / 308 × 288 |
| 07_staffing_12 | Table | Staffing submissions | Values: `FactStaffing[date]`, `FactStaffing[division]`, `FactStaffing[openPositions]`, `FactStaffing[newJoiners]` | 8, 1532 / 308 × 400 |
| 07_staffing_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 1420 / 308 × 104 |
| 07_staffing_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Timesheet & training detail

Page ID: `08_detail`. Visuals: **12**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/08_detail/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 08_detail_01 | Text | GCC \| Timesheet & training detail | Static text | 8, 8 / 308 × 64 |
| 08_detail_02 | Text | Actual measures use submitted and approved records. This detailed table also exposes draft/rejected rows for reconciliation; filter status as needed. | Static text | 8, 716 / 308 × 104 |
| 08_detail_03 | Slicer | Period • select a month | Values: `DimDate[YearMonth]` | 8, 140 / 308 × 104 |
| 08_detail_04 | Slicer | Division | Values: `DimDivision[divisionName]` | 8, 252 / 308 × 104 |
| 08_detail_05 | Slicer | Dedicated / Flex | Values: `DimEmployee[supportingCategory]` | 8, 364 / 308 × 104 |
| 08_detail_06 | Card | Actual Hours | Values: `_Measures[Actual Hours]` | 8, 476 / 150 × 112 |
| 08_detail_07 | Card | Approved Hours | Values: `_Measures[Approved Hours]` | 166, 476 / 150 × 112 |
| 08_detail_08 | Card | Training Hours | Values: `_Measures[Training Hours]` | 8, 596 / 150 × 112 |
| 08_detail_09 | Card | Detail Conflicts | Values: `_Measures[Detail Conflicts]` | 166, 596 / 150 × 112 |
| 08_detail_10 | Table | Timesheet detail | Values: `FactTimesheet[id]`, `FactTimesheet[date]`, `DimEmployee[employeeName]`, `DimEmployee[department]`, `DimProject[projectCode]`, `DimTask[taskCategory]`, `FactTimesheet[status]`, `_Measures[Raw Hours]` | 8, 940 / 308 × 400 |
| 08_detail_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 828 / 308 × 104 |
| 08_detail_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


### GCC | Input readiness

Page ID: `09_inputs`. Visuals: **6**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/09_inputs/page.json).

| Visual ID | Type | Title / text | Query bindings and formatting | Phone x, y / width × height |
|---|---|---|---|---|
| 09_inputs_01 | Text | GCC \| Input readiness | Static text | 8, 8 / 308 × 64 |
| 09_inputs_02 | Text | Definitions needing confirmation and missing source contracts are visible here. No production records or credentials are included in the saved project. | Static text | 8, 140 / 308 × 104 |
| 09_inputs_03 | Table | Requirements coverage | Values: `InputStatus[Requirement]`, `InputStatus[Status]`, `InputStatus[Definition]` | 8, 364 / 308 × 640 |
| 09_inputs_04 | Table | Refresh settings | Values: `Settings[FiscalStartMonth]`, `Settings[DailyHours]`, `Settings[DefectTarget]`, `Settings[AsOfDate]`, `Settings[RefreshIST]` | 8, 1012 / 308 × 180 |
| 09_inputs_refresh_help | Text | Refresh all API data: Home > Refresh > Data.   Auto-refresh: Off (Desktop). | Static text | 8, 252 / 308 × 104 |
| 09_inputs_refresh_time | Card | Last refreshed (IST) | Values: `_Measures[Report Status]` | 8, 80 / 308 × 52 |


## Phone layouts

All **9 pages** have native portrait phone layouts; **116 existing visuals** are placed. The canvas is 324 units wide, with 8-unit side margins and gaps. Pages scroll vertically. The desktop report and the phone view share the same model, queries, filters and conditional alert colors. Phone formatting overrides do not change desktop typography or geometry.

Open **View → Mobile layout** in Desktop, then choose a page tab to inspect/edit its phone view. The bottom phone icon also switches views. The last-refresh visual spans the phone width in a compact 52-unit area, with a 9 pt label, 10 pt IST timestamp and muted gray text. Its background is transparent, with no border or shadow, matching the desktop styling. Headings use 17 pt in a 64-unit box; filters are full-width 104-unit dropdowns; KPI cards use two columns, wrapped 10 pt titles and 22 pt values. A remaining odd KPI occupies the full width. Explanatory text uses 10.5 pt in a 104-unit box. Charts span the width with 10 pt axis/legend labels.

Tables retain every query column at 10 pt with wrapped headers/values and narrower fixed column widths. Wide detail tables scroll horizontally inside the visual; swipe sideways for remaining columns. Input-readiness columns use 62/50/150 units so their long definitions wrap on the phone. Tables also scroll vertically through their rows. The phone instruction strip describes snapshot freshness and table gestures; the Desktop owner still imports new data using Home → Refresh → Data. Phone layout does not enable automatic refresh.

For access on an actual phone, publish the report to an approved Power BI workspace and share it with the appropriate team members. **Power BI iOS/Android apps show this layout in portrait**; landscape and ordinary web-browser viewing use the standard report layout. No Service publication or phone-device test is claimed by this update. See [Microsoft mobile layout overview](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-create-mobile-optimized-report-about) and [mobile visual formatting](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-create-mobile-optimized-report-format-visuals).

| Phone page | Native visuals | Width | Scroll content height |
|---|---|---|---|
| GCC \| Management overview | 14 | 324 | 1892 |
| GCC \| Utilization | 14 | 324 | 1940 |
| GCC \| Delivery & quality | 14 | 324 | 1940 |
| GCC \| Capacity & forecast | 14 | 324 | 1764 |
| GCC \| Dedicated & Flex teams | 14 | 324 | 1940 |
| GCC \| Continuous improvement | 14 | 324 | 1940 |
| GCC \| Staffing | 14 | 324 | 1940 |
| GCC \| Timesheet & training detail | 12 | 324 | 1348 |
| GCC \| Input readiness | 6 | 324 | 1200 |

These are native PBIR `visuals/<id>/mobile.json` files using the documented [public report-project structure](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report). The per-visual geometry above is extracted from the saved files. `scripts/build-powerbi-mobile.py` authors the layout; close Desktop before regenerating it, because generation replaces custom phone formatting. `--check` only checks saved geometry and writes aggregate layout evidence.


## Tables, columns and relationships

All table partitions use Power Query **Import**. TOM `dateTime` columns with date formatting originate from M `type date`; IDs/counts use 64-bit integers, hours/ratios use double, flags use boolean and labels use string. Date/month ordering and summary behavior are recorded below.

| Table | Source and grain | Columns |
|---|---|---|
| DimEmployee | GET users; current roster | 8 |
| DimProject | GET projects; project master | 15 |
| DimDivision | GET divisions; organization master | 2 |
| DimHoliday | GET holidays; company calendar | 3 |
| DimTask | GET tasks; task master | 3 |
| FactTimesheet | TimesheetRows → GET timesheets; one daily ID | 10 |
| FactWeeklyDetails | TimesheetRows; one weeklyRowKey after deduplication | 31 |
| FactVacation | GET planned-vacations; one employee/date entry | 3 |
| FactStaffing | GET staffing; one division/month submission | 6 |
| Settings | Parameters and RefreshClock; one row | 5 |
| DimDate | Generated continuous calendar; one date | 9 |
| FactDeliverable | DeliverablesEndpoint; one deliverableId; empty until connected | 8 |
| FactImprovement | ImprovementsEndpoint; one improvementId; empty until connected | 6 |
| FactPlan | Project master, actuals and holidays; one project/date allocation | 4 |
| InputStatus | Authored source-readiness definitions; static explanatory rows | 3 |
| _Measures | Hidden label row plus DAX measures; no business fact records | 1 |

### DimEmployee columns

Current employee roster. No employment start/end history is available; capacity is an estimate using the current active roster.

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| employeeId | string | Summary: none |
| employeeName | string | Summary: none |
| division | string | Summary: none |
| department | string | Summary: none |
| supportingCategory | string | Summary: none |
| role | string | Summary: none |
| isActive | boolean | Summary: none |


### DimProject columns

One project/task master record. A project is not assumed to equal a deliverable.

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| projectCode | string | Summary: none |
| projectName | string | Summary: none |
| division | string | Summary: none |
| subdivision | string | Summary: none |
| teamType | string | Summary: none |
| product | string | Summary: none |
| productModule | string | Summary: none |
| activity | string | Summary: none |
| startDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| targetDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| deliveredDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| budgetHours | double | Summary: none |
| projectStatus | string | Summary: none |
| isActive | boolean | Summary: none |


### DimDivision columns

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| divisionName | string | Summary: none |


### DimHoliday columns

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| holidayName | string | Summary: none |


### DimTask columns

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| taskCategory | string | Summary: none |
| classification | string | Summary: none |


### FactTimesheet columns

One daily entry. Actual hours include submitted and approved entries only; raw hours retain all statuses.

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| userId | int64 | Summary: none |
| projectId | int64 | Summary: none |
| taskId | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| hours | double | Summary: none |
| status | string | Summary: none |
| division | string | Summary: none |
| department | string | Summary: none |
| hourCategory | string | Summary: none |


### FactWeeklyDetails columns

One employee/week/project/task/row-dimension record, using the latest daily copy. Counts attributed to Monday. Conflicting copies block quality totals.

| Column | TOM type | Format / behavior |
|---|---|---|
| weeklyRowKey | string | Summary: none |
| userId | int64 | Summary: none |
| projectId | int64 | Summary: none |
| taskId | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| detailConflict | boolean | Summary: none |
| fundamental_error_count | int64 | Summary: none |
| review_by | string | Summary: none |
| review_date | dateTime | Format: yyyy-mm-dd; Summary: none |
| improvement_count | int64 | Summary: none |
| designed | int64 | Summary: none |
| developed | int64 | Summary: none |
| item_number | string | Summary: none |
| item_description | string | Summary: none |
| rd_temp | string | Summary: none |
| next_assembly | string | Summary: none |
| reference_number | string | Summary: none |
| slide_number | string | Summary: none |
| milestone | string | Summary: none |
| improvement_location | string | Summary: none |
| error_type | string | Summary: none |
| query_from | string | Summary: none |
| query_description | string | Summary: none |
| query_to | string | Summary: none |
| query_date | dateTime | Format: yyyy-mm-dd; Summary: none |
| comments | string | Summary: none |
| feedback_date | dateTime | Format: yyyy-mm-dd; Summary: none |
| action_by | string | Summary: none |
| action_date | dateTime | Format: yyyy-mm-dd; Summary: none |
| query_status | string | Summary: none |
| remarks | string | Summary: none |


### FactVacation columns

Planned full-day absence, not approved or actual leave.

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| userId | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |


### FactStaffing columns

One division/month. Open positions are a snapshot, new joiners a monthly flow. Blank differs from zero.

| Column | TOM type | Format / behavior |
|---|---|---|
| id | int64 | Summary: none |
| divisionId | int64 | Summary: none |
| division | string | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| openPositions | int64 | Summary: none |
| newJoiners | int64 | Summary: none |


### Settings columns

| Column | TOM type | Format / behavior |
|---|---|---|
| FiscalStartMonth | int64 | Summary: none |
| DailyHours | double | Summary: none |
| DefectTarget | double | Summary: none |
| AsOfDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| RefreshIST | string | Summary: none |


### DimDate columns

FiscalYear is labeled by its start year. Continuous dates covering source data and the next year.

| Column | TOM type | Format / behavior |
|---|---|---|
| Date | dateTime | Format: yyyy-mm-dd; Summary: none; Key |
| Year | int64 | Summary: none |
| Month | string | Sort by: MonthNumber; Summary: none |
| MonthNumber | int64 | Summary: none |
| YearMonth | string | Summary: none |
| WeekStart | dateTime | Format: yyyy-mm-dd; Summary: none |
| FiscalYear | string | Summary: none |
| IsWeekday | boolean | Summary: none |
| IsHoliday | boolean | Summary: none |


### FactDeliverable columns

Awaiting a deliverable register. One unique deliverable ID; null means unknown, zero means confirmed none. Replace this typed empty query with the approved REST source.

| Column | TOM type | Format / behavior |
|---|---|---|
| deliverableId | string | Summary: none |
| projectId | int64 | Summary: none |
| plannedDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| deliveredDate | dateTime | Format: yyyy-mm-dd; Summary: none |
| fundamentalErrors | int64 | Summary: none |
| informationErrors | int64 | Summary: none |
| readableErrors | int64 | Summary: none |
| hadRework | boolean | Summary: none |


### FactImprovement columns

Awaiting a unique improvement register for VAVE, Automation, COE, Cost optimization and additive manufacturing. Weekly improvement counts remain separately available.

| Column | TOM type | Format / behavior |
|---|---|---|
| improvementId | string | Summary: none |
| projectId | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| category | string | Summary: none |
| product | string | Summary: none |
| isAdditiveManufacturing | boolean | Summary: none |


### FactPlan columns

Planning estimate: budget spread evenly over project weekdays excluding holidays. Remaining Inprogress budget spread from refresh date through target; Hold and Completed receive no future forecast. Past-due remaining effort is surfaced separately.

| Column | TOM type | Format / behavior |
|---|---|---|
| projectId | int64 | Summary: none |
| date | dateTime | Format: yyyy-mm-dd; Summary: none |
| scheduledHours | double | Summary: none |
| remainingForecastHours | double | Summary: none |


### InputStatus columns

| Column | TOM type | Format / behavior |
|---|---|---|
| Requirement | string | Summary: none |
| Status | string | Summary: none |
| Definition | string | Summary: none |


### _Measures columns

| Column | TOM type | Format / behavior |
|---|---|---|
| Label | string | Summary: none; Hidden |


### Relationships

All 18 are active, many-to-one with a single filter direction from the dimension (one) to the fact (many); omitted TOM properties use these defaults. No automatic date hierarchy tables or bidirectional bridges are used. DimDate is the central date table. Project delivered-date cohort logic is explicit in DAX rather than an additional relationship to DimProject.

| Dimension (one) | Fact (many) | Active | Filter direction |
|---|---|---|---|
| DimEmployee[id] | FactTimesheet[userId] | True | oneDirection |
| DimProject[id] | FactTimesheet[projectId] | True | oneDirection |
| DimTask[id] | FactTimesheet[taskId] | True | oneDirection |
| DimDate[Date] | FactTimesheet[date] | True | oneDirection |
| DimEmployee[id] | FactWeeklyDetails[userId] | True | oneDirection |
| DimProject[id] | FactWeeklyDetails[projectId] | True | oneDirection |
| DimTask[id] | FactWeeklyDetails[taskId] | True | oneDirection |
| DimDate[Date] | FactWeeklyDetails[date] | True | oneDirection |
| DimEmployee[id] | FactVacation[userId] | True | oneDirection |
| DimDate[Date] | FactVacation[date] | True | oneDirection |
| DimDivision[id] | FactStaffing[divisionId] | True | oneDirection |
| DimDate[Date] | FactStaffing[date] | True | oneDirection |
| DimProject[id] | FactDeliverable[projectId] | True | oneDirection |
| DimDate[Date] | FactDeliverable[deliveredDate] | True | oneDirection |
| DimProject[id] | FactImprovement[projectId] | True | oneDirection |
| DimDate[Date] | FactImprovement[date] | True | oneDirection |
| DimProject[id] | FactPlan[projectId] | True | oneDirection |
| DimDate[Date] | FactPlan[date] | True | oneDirection |

Settings, InputStatus and _Measures are disconnected. DimHoliday marks dates in DimDate during refresh. DimDivision directly filters FactStaffing; other relevant division filters are applied in measures. FactDeliverable relates on deliveredDate; plannedDate is retained for on-time comparison. No employment/allocation relationship is fabricated.


## Every DAX measure

These are the **complete saved formulas**, in the model's display-folder order. All measures live in `_Measures`. `DIVIDE` without an alternate result returns blank for a zero/blank denominator; this preserves unknown rates. Percent format displays a ratio ×100; hours display numeric totals. `COALESCE` is used only where the formula explicitly treats a missing component as zero. Every numeric/string calculation is shown below so filter behavior can be inspected.


### 01 Overview


#### Raw Hours

All statuses including drafts/rejected. Use Actual Hours for reported work.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Raw Hours =
CALCULATE(SUM(FactTimesheet[hours]), KEEPFILTERS(FILTER(ALL(FactTimesheet[division]),NOT ISCROSSFILTERED(DimDivision) || FactTimesheet[division] IN VALUES(DimDivision[divisionName]))))
```


#### Actual Hours

Submitted and approved hours; drafts, rejected and recalled entries do not count.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Actual Hours =
CALCULATE([Raw Hours], KEEPFILTERS(FactTimesheet[status] IN {"submitted", "approved"}))
```


#### Approved Hours

Approved hours only, for comparison with submitted plus approved actuals.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Approved Hours =
CALCULATE([Raw Hours], KEEPFILTERS(FactTimesheet[status] = "approved"))
```


#### Contributing Employees

Distinct employees with submitted or approved entries in the selected work scope.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Contributing Employees =
CALCULATE(DISTINCTCOUNT(FactTimesheet[userId]), KEEPFILTERS(FactTimesheet[status] IN {"submitted","approved"}),KEEPFILTERS(FILTER(ALL(FactTimesheet[division]),NOT ISCROSSFILTERED(DimDivision) || FactTimesheet[division] IN VALUES(DimDivision[divisionName]))))
```


#### Active Team Strength

Current roster; does not change with date or project selection.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Active Team Strength =
CALCULATE(COUNTROWS(DimEmployee), KEEPFILTERS(DimEmployee[isActive] = TRUE()), KEEPFILTERS(DimEmployee[role] <> "system admin"), KEEPFILTERS(FILTER(ALL(DimEmployee[division]),NOT ISCROSSFILTERED(DimDivision) || DimEmployee[division] IN VALUES(DimDivision[divisionName]))))
```


### 02 Utilization


#### Training Hours

Actual hours explicitly mapped to Training.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Training Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Training"))
```


#### Internal Hours

Actual hours explicitly mapped to Internal, including the provisional meeting mapping.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Internal Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Internal"))
```


#### Admin Hours

Actual hours explicitly mapped to Admin.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Admin Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Admin"))
```


#### Vacation Hours

Recorded actual hours mapped to Vacation; distinct from planned vacation capacity.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Vacation Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Vacation"))
```


#### Holiday Hours

Recorded actual hours mapped to Holiday; distinct from calendar holiday days.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Holiday Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Holiday"))
```


#### Productive Hours

Actual hours explicitly mapped to Productive; not inferred from Billable.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Productive Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Productive"))
```


#### Unmapped Hours

Actual hours with no approved mapping; a positive result blocks utilization.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Unmapped Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="Unmapped"))
```


#### Effective Hours

Actuals minus training, internal, admin, vacation and holiday hours; blank when unmapped hours exist.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Effective Hours =
IF(COALESCE([Unmapped Hours],0)=0,[Actual Hours]-COALESCE([Training Hours],0)-COALESCE([Internal Hours],0)-COALESCE([Admin Hours],0)-COALESCE([Vacation Hours],0)-COALESCE([Holiday Hours],0))
```


#### Working Days

Selected Monday–Friday dates excluding company holidays.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Working Days =
COALESCE(CALCULATE(COUNTROWS(DimDate),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=FALSE())),0)
```


#### Holiday Days

Company holidays that fall on a selected weekday.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Holiday Days =
CALCULATE(COUNTROWS(DimDate),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=TRUE()))
```


#### Roster Capacity Hours

Current roster estimate. Blank at project/task grain because allocations are unavailable.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Roster Capacity Hours =
IF(NOT ISCROSSFILTERED(DimProject) && NOT ISCROSSFILTERED(DimTask), [Working Days]*SELECTEDVALUE(Settings[DailyHours],8)*[Active Team Strength])
```


#### Capacity Vacation Hours

Per employee/day capped at daily hours. Future plans supersede recorded leave, preventing double subtraction. Only weekdays excluding holidays.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Capacity Vacation Hours =
VAR H=SELECTEDVALUE(Settings[DailyHours],8)
VAR A=MAX(Settings[AsOfDate])
VAR People=CALCULATETABLE(VALUES(DimEmployee[id]),KEEPFILTERS(DimEmployee[isActive]=TRUE()),KEEPFILTERS(DimEmployee[role]<>"system admin"),KEEPFILTERS(FILTER(ALL(DimEmployee[division]),NOT ISCROSSFILTERED(DimDivision) || DimEmployee[division] IN VALUES(DimDivision[divisionName]))))
VAR Days=CALCULATETABLE(VALUES(DimDate[Date]),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=FALSE()))
RETURN IF(NOT ISCROSSFILTERED(DimProject) && NOT ISCROSSFILTERED(DimTask),SUMX(CROSSJOIN(People,Days),
VAR D=DimDate[Date]
VAR Recorded=CALCULATE(SUM(FactTimesheet[hours]),FactTimesheet[hourCategory]="Vacation",FactTimesheet[status] IN {"submitted","approved"})
VAR Planned=CALCULATE(COUNTROWS(FactVacation))
RETURN MIN(H,IF(D>=A && Planned>0,H,COALESCE(Recorded,0)))))
```


#### Vacation Days

Capacity vacation hours divided by the standard daily hours.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Vacation Days =
DIVIDE([Capacity Vacation Hours],SELECTEDVALUE(Settings[DailyHours],8))
```


#### Available Hours

Current active-roster capacity less capacity vacation hours, bounded at zero.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Hours =
VAR RosterCapacity = [Roster Capacity Hours]
RETURN
    IF (
        NOT ISBLANK ( RosterCapacity ),
        MAX ( 0, RosterCapacity - COALESCE ( [Capacity Vacation Hours], 0 ) )
    )
```


#### Monthly Utilization %

Selected-period utilization using current roster estimate; monthly when grouped/filtered by YearMonth.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Monthly Utilization % =
DIVIDE([Effective Hours],[Available Hours])
```


#### Under Utilized %

One minus monthly/selected-period utilization; retains blank when utilization is unknown.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Under Utilized % =
VAR Utilization = [Monthly Utilization %]
RETURN IF ( NOT ISBLANK ( Utilization ), 1 - Utilization )
```


### 09 Metadata


#### As Of Date

IST calendar date captured from the shared refresh clock after removing its zone without converting to the refreshing machine's local time.

Format: `yyyy-mm-dd`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
As Of Date =
MAX(Settings[AsOfDate])
```


#### Last Completed Friday

Friday strictly before the refresh date, including a seven-day lookback when refreshed on Friday.

Format: `yyyy-mm-dd`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Last Completed Friday =
[As Of Date]-MOD(WEEKDAY([As Of Date],2)-5+6,7)-1
```


### 02 Utilization


#### FY Utilization Through Friday %

Workbook annual numerator excludes training but retains internal/admin. Current-roster FY estimate; exact project-start denominator needs allocation history.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
FY Utilization Through Friday % =
VAR E=[Last Completed Friday]
VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1)
VAR S=DATE(YEAR(E)-IF(MONTH(E)<FM,1,0),FM,1)
RETURN CALCULATE(IF(COALESCE([Unmapped Hours],0)=0,DIVIDE([Actual Hours]-COALESCE([Training Hours],0)-COALESCE([Vacation Hours],0)-COALESCE([Holiday Hours],0),[Available Hours])),REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,E))
```


### 03 Capacity


#### Available Hours Last Week

Estimated available roster capacity for the previous Monday–Sunday week.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Hours Last Week =
VAR S=[As Of Date]-WEEKDAY([As Of Date],2)+1+(-7) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,S+6))
```


#### Available Hours Current Week

Estimated available roster capacity for the week containing the refresh date.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Hours Current Week =
VAR S=[As Of Date]-WEEKDAY([As Of Date],2)+1+(0) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,S+6))
```


#### Available Hours Next Week

Estimated available roster capacity for the following week.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Hours Next Week =
VAR S=[As Of Date]-WEEKDAY([As Of Date],2)+1+(7) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,S+6))
```


#### Available Hours FY

Estimated available hours from the selected/current fiscal-year start through the strictly previous Friday.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Hours FY =
VAR A=[As Of Date] VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1) VAR S=DATE(YEAR(A)-IF(MONTH(A)<FM,1,0),FM,1) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,EDATE(S,12)-1))
```


### 04 Teams


#### Dedicated Hours

Actual hours for employees whose supportingCategory is Dedicated Team.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Dedicated Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Dedicated"))))
```


#### Dedicated Strength

Current active-roster strength for Dedicated Team employees.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Dedicated Strength =
CALCULATE([Active Team Strength],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Dedicated"))))
```


#### Dedicated Utilization %

Monthly/selected-period utilization filtered to Dedicated Team employees.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Dedicated Utilization % =
CALCULATE([Monthly Utilization %],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Dedicated"))))
```


#### Dedicated FY Hours

Dedicated Team actual hours during the fiscal-year window through the previous Friday.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Dedicated FY Hours =
VAR E=[Last Completed Friday] VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1) VAR S=DATE(YEAR(E)-IF(MONTH(E)<FM,1,0),FM,1) RETURN CALCULATE([Dedicated Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,E))
```


#### Flex Hours

Actual hours for employees whose supportingCategory is Flex Team.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Flex Hours =
CALCULATE([Actual Hours],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Flex"))))
```


#### Flex Strength

Current active-roster strength for Flex Team employees.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Flex Strength =
CALCULATE([Active Team Strength],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Flex"))))
```


#### Flex Utilization %

Monthly/selected-period utilization filtered to Flex Team employees.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Flex Utilization % =
CALCULATE([Monthly Utilization %],KEEPFILTERS(FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"Flex"))))
```


#### Flex FY Hours

Flex Team actual hours during the fiscal-year window through the previous Friday.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Flex FY Hours =
VAR E=[Last Completed Friday] VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1) VAR S=DATE(YEAR(E)-IF(MONTH(E)<FM,1,0),FM,1) RETURN CALCULATE([Flex Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,E))
```


#### Available Employee Equivalents

Unused hours converted to full-period employee equivalents; not a named cohort or staff assignment.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Available Employee Equivalents =
IF(NOT ISBLANK([Monthly Utilization %]),DIVIDE(MAX(0,[Available Hours]-[Effective Hours]),SELECTEDVALUE(Settings[DailyHours],8)*[Working Days]))
```


### 05 Delivery


#### Projects Delivered

Distinct projects with a delivered date in the selected dates.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Projects Delivered =
CALCULATE(COUNTROWS(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date]))),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Projects On Time

Selected delivered projects with delivered date on or before target date.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Projects On Time =
CALCULATE(COUNTROWS(FILTER(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),NOT ISBLANK(DimProject[targetDate]) && DimProject[deliveredDate]<=DimProject[targetDate])),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Project On Time %

On-time projects divided by delivered projects; project grain, not deliverable grain.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Project On Time % =
VAR Known=CALCULATE(COUNTROWS(FILTER(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),NOT ISBLANK(DimProject[targetDate]))),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))) RETURN IF(Known=[Projects Delivered],DIVIDE([Projects On Time],Known))
```


#### Delivered Project Budget Hours

Complete known budgets for the selected delivered-project cohort; blank on incomplete coverage.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Delivered Project Budget Hours =
VAR P=CALCULATETABLE(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))) RETURN IF(COUNTROWS(P)>0 && COUNTROWS(FILTER(P,ISBLANK(DimProject[budgetHours])))=0,SUMX(P,DimProject[budgetHours]))
```


#### Delivered Project Actual Hours

Lifetime actual hours for the same delivered-project cohort as the budget, preventing partial-period vs lifetime-budget comparisons.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Delivered Project Actual Hours =
VAR P=CALCULATETABLE(SELECTCOLUMNS(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),"ID",DimProject[id]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))) RETURN CALCULATE([Actual Hours],REMOVEFILTERS(DimDate),KEEPFILTERS(TREATAS(P,DimProject[id])))
```


#### Effort Deviation %

Lifetime actual minus lifetime budget, divided by lifetime budget for the same delivered cohort; blank at employee/task grain.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Effort Deviation % =
VAR BudgetHours = [Delivered Project Budget Hours]
RETURN
    IF (
        NOT ISBLANK ( BudgetHours )
            && NOT ISCROSSFILTERED ( DimEmployee )
            && NOT ISCROSSFILTERED ( DimTask ),
        DIVIDE ( [Delivered Project Actual Hours] - BudgetHours, BudgetHours )
    )
```


#### Schedule Deviation Days

Mean delivered minus planned target date in calendar days. Positive is late.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Schedule Deviation Days =
CALCULATE(AVERAGEX(FILTER(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),NOT ISBLANK(DimProject[targetDate])),DATEDIFF(DimProject[targetDate],DimProject[deliveredDate],DAY)),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Schedule Deviation %

Provisional normalized schedule deviation: days late/early divided by planned elapsed duration.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Schedule Deviation % =
CALCULATE(AVERAGEX(FILTER(FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date])),NOT ISBLANK(DimProject[startDate]) && DimProject[targetDate]>DimProject[startDate]),DIVIDE(DATEDIFF(DimProject[targetDate],DimProject[deliveredDate],DAY),DATEDIFF(DimProject[startDate],DimProject[targetDate],DAY))),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Effort Alert Color

Red beyond absolute 5% effort deviation, green within tolerance, gray when unknown.

Format: `General`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Effort Alert Color =
VAR Deviation = [Effort Deviation %]
RETURN
    IF ( ISBLANK ( Deviation ), "#64748B",
        IF ( ABS ( Deviation ) > 0.05, "#DC2626", "#0F766E" ) )
```


#### Schedule Alert Color

Red beyond absolute 3% provisional normalized schedule deviation, green within tolerance, gray when unknown.

Format: `General`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Schedule Alert Color =
VAR Deviation = [Schedule Deviation %]
RETURN
    IF ( ISBLANK ( Deviation ), "#64748B",
        IF ( ABS ( Deviation ) > 0.03, "#DC2626", "#0F766E" ) )
```


### 08 Quality


#### Detail Conflicts

Number of weekly row identities with contradictory daily metadata copies.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Detail Conflicts =
CALCULATE(COUNTROWS(FactWeeklyDetails),FactWeeklyDetails[detailConflict]=TRUE(),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Weekly Fundamental Errors

Sum of deduplicated weekly fundamental error counts; blank on conflicting copies.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Weekly Fundamental Errors =
IF(COALESCE([Detail Conflicts],0)=0,CALCULATE(SUM(FactWeeklyDetails[fundamental_error_count]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Improvement Log Count

Sum of deduplicated weekly improvement_count; separate from initiative IDs.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Improvement Log Count =
IF(COALESCE([Detail Conflicts],0)=0,CALCULATE(SUM(FactWeeklyDetails[improvement_count]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Designed

Sum of deduplicated weekly designed counts; blank on conflicting copies.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Designed =
IF(COALESCE([Detail Conflicts],0)=0,CALCULATE(SUM(FactWeeklyDetails[designed]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Developed

Sum of deduplicated weekly developed counts; blank on conflicting copies.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Developed =
IF(COALESCE([Detail Conflicts],0)=0,CALCULATE(SUM(FactWeeklyDetails[developed]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Fundamental Errors

Explicit deliverable fundamental errors; blank if any selected deliverable count is unknown.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Fundamental Errors =
VAR T=CALCULATETABLE(FactDeliverable,KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))),KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[fundamentalErrors])))=0,SUMX(T,FactDeliverable[fundamentalErrors]))
```


#### Information Errors

Explicit deliverable information errors; blank on incomplete selected counts.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Information Errors =
VAR T=CALCULATETABLE(FactDeliverable,KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))),KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[informationErrors])))=0,SUMX(T,FactDeliverable[informationErrors]))
```


#### Readable Errors

Explicit deliverable readable errors; blank on incomplete selected counts.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Readable Errors =
VAR T=CALCULATETABLE(FactDeliverable,KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))),KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[readableErrors])))=0,SUMX(T,FactDeliverable[readableErrors]))
```


#### Deliverables

Distinct explicit deliverable IDs; projects and weekly rows are not substitute deliverables.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Deliverables =
CALCULATE(DISTINCTCOUNT(FactDeliverable[deliverableId]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))),KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK()))
```


#### Defect Density %

Explicit fundamental errors divided by explicit deliverables. The ratio can exceed 100% when multiple errors occur per deliverable.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Defect Density % =
DIVIDE([Fundamental Errors],[Deliverables])
```


#### First Time Right %

Explicit deliverables with hadRework=false divided by deliverables; unknown flags keep the result blank.

Format: `0.0%`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
First Time Right % =
VAR T=CALCULATETABLE(FactDeliverable,KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))),KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[hadRework])))=0,DIVIDE(COUNTROWS(FILTER(T,FactDeliverable[hadRework]=FALSE())),COUNTROWS(T)))
```


#### On Time Deliverables

Explicit deliverables delivered on or before their planned date; blank on missing selected dates.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
On Time Deliverables =
CALCULATE(COUNTROWS(FILTER(FactDeliverable,NOT ISBLANK(FactDeliverable[deliveredDate]) && NOT ISBLANK(FactDeliverable[plannedDate]) && FactDeliverable[deliveredDate]<=FactDeliverable[plannedDate])),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Defect Alert Color

Red beyond 0.05 absolute ratio points from DefectTarget, green within tolerance, gray when unknown.

Format: `General`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Defect Alert Color =
VAR Density = [Defect Density %]
RETURN
    IF ( ISBLANK ( Density ), "#64748B",
        IF ( ABS ( Density - SELECTEDVALUE ( Settings[DefectTarget], 0 ) ) > 0.05,
            "#DC2626", "#0F766E" ) )
```


### 06 Improvement


#### Products Touched

Distinct nonblank project products associated with submitted/approved work in the selected dates.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Products Touched =
VAR IDs=CALCULATETABLE(VALUES(FactTimesheet[projectId]),FactTimesheet[status] IN {"submitted","approved"},KEEPFILTERS(FILTER(ALL(FactTimesheet[division]),NOT ISCROSSFILTERED(DimDivision) || FactTimesheet[division] IN VALUES(DimDivision[divisionName])))) RETURN CALCULATE(DISTINCTCOUNT(DimProject[product]),KEEPFILTERS(TREATAS(IDs,DimProject[id])),DimProject[product]<>BLANK())
```


#### Additive Manufacturing

Distinct improvement initiative IDs whose explicit additive-manufacturing flag is true.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Additive Manufacturing =
CALCULATE(DISTINCTCOUNT(FactImprovement[improvementId]),FactImprovement[isAdditiveManufacturing]=TRUE(),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Improvement Initiatives

Distinct initiative IDs from the optional improvement register, including category-filtered counts.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Improvement Initiatives =
CALCULATE(DISTINCTCOUNT(FactImprovement[improvementId]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


### 07 Staffing


#### Open Positions

Snapshot for last selected month. Blank if any selected division has no entry.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Open Positions =
VAR E=MAX(DimDate[Date]) VAR S=DATE(YEAR(E),MONTH(E),1) VAR T=CALCULATETABLE(FactStaffing,REMOVEFILTERS(DimDate),DimDate[Date]=S) RETURN IF(COUNTROWS(T)=COUNTROWS(VALUES(DimDivision[id])) && COUNTROWS(FILTER(T,ISBLANK(FactStaffing[openPositions])))=0,SUMX(T,FactStaffing[openPositions]))
```


#### New Joiners

Monthly joiner flow summed over selected months/divisions; blank when required submissions/counts are missing.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
New Joiners =
VAR Months=SELECTCOLUMNS(SUMMARIZE(DimDate,DimDate[YearMonth]),"MonthStart",CALCULATE(DATE(YEAR(MIN(DimDate[Date])),MONTH(MIN(DimDate[Date])),1))) VAR T=CALCULATETABLE(FactStaffing,REMOVEFILTERS(DimDate),TREATAS(Months,DimDate[Date])) RETURN IF(COUNTROWS(T)=COUNTROWS(Months)*COUNTROWS(VALUES(DimDivision[id])) && COUNTROWS(FILTER(T,ISBLANK(FactStaffing[newJoiners])))=0,SUMX(T,FactStaffing[newJoiners]))
```


### 03 Capacity


#### Hours Scheduled

Project budget spread over weekdays excluding holidays; blank under employee/task filters without allocations.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Hours Scheduled =
IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE(SUM(FactPlan[scheduledHours]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Remaining Forecast Hours

Selected future remaining-budget allocation; blank under employee/task filters without allocations.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Remaining Forecast Hours =
IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE(SUM(FactPlan[remainingForecastHours]),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))))
```


#### Team Forecast Hours

Past actuals plus future remaining budget. Past and future do not overlap.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Team Forecast Hours =
VAR A=[As Of Date] RETURN IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE([Actual Hours],KEEPFILTERS(DimDate[Date]<A))+[Remaining Forecast Hours])
```


#### Overdue Unscheduled Hours

Remaining Inprogress budget for projects whose target is before the refresh date; separate from scheduled future hours.

Format: `#,##0.0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Overdue Unscheduled Hours =
VAR A=[As Of Date] RETURN CALCULATE(SUMX(FILTER(DimProject,DimProject[projectStatus]="Inprogress" && NOT ISBLANK(DimProject[targetDate]) && DimProject[targetDate]<A && NOT ISBLANK(DimProject[budgetHours])),MAX(0,DimProject[budgetHours]-CALCULATE([Actual Hours],REMOVEFILTERS(DimDate)))),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


#### Projects Missing Plan Inputs

Count of projects missing budget/start/target or with a target before start.

Format: `#,##0`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Projects Missing Plan Inputs =
CALCULATE(COUNTROWS(FILTER(DimProject,DimProject[projectStatus]="Inprogress" && (ISBLANK(DimProject[startDate]) || ISBLANK(DimProject[targetDate]) || ISBLANK(DimProject[budgetHours]) || DimProject[targetDate]<DimProject[startDate]))),KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName]))))
```


### 09 Metadata


#### Report Status

Successful import timestamp for the page header. Never use NOW(), which changes without fetching data.

Format: `General`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Report Status =
COALESCE([Last Refresh IST], "Not refreshed yet")
```


#### Last Refresh IST

Refresh timestamp text captured in Settings in Indian Standard Time (UTC+05:30), including seconds.

Format: `General`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl).

```dax
Last Refresh IST =
SELECTEDVALUE(Settings[RefreshIST])
```


## Power Query functions and parameters

All **11 shared M expressions** are reproduced exactly below. Parameters carry `IsParameterQuery` metadata so they appear in Desktop Edit parameters. `fnApi` is the reusable HTTP/JSON/pagination function; `TimesheetRows` is the typed/validated daily staging query; `HourCategoryMap` is the explicit editable classification table. Staging queries and parameters are not separate loaded business tables.

Common M operations: `Web.Contents` downloads an authenticated Web resource using stored credentials; `Json.Document` parses JSON; `Table.FromRecords` selects a fixed contract; `Table.TransformColumnTypes` enforces types; `Table.NestedJoin`/`ExpandTableColumn` join mapping/master data; `Table.Group` deduplicates/counts weekly identities; `List.Dates` builds daily calendars/schedules; `Record.SelectFields(..., MissingField.UseNull)` preserves unknown fields; `error` stops a refresh on an explicit contract failure. The `??` operator provides a null fallback at the exact locations shown. These functions are transformations, not additional DAX measures.


### ApiBaseUrl

Server origin. Store the reporting API key in Web Basic credentials: username powerbi, password reporting key.

```powerquery
"https://dietpi.tail4f2b8f.ts.net" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]
```


### ApiPath

REST reporting namespace, without leading or trailing slash.

```powerquery
"api/powerbi" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]
```


### FiscalStartMonth

Provisional: January. Set 1–12 before refresh.

```powerquery
1 meta [IsParameterQuery=true, Type="Number", IsParameterQueryRequired=true]
```


### DailyHours

Standard Monday–Friday hours per employee. Provisional 8.

```powerquery
8 meta [IsParameterQuery=true, Type="Number", IsParameterQueryRequired=true]
```


### DefectTarget

Provisional target ratio; confirm with KPI owner. Red beyond target ± 0.05.

```powerquery
0 meta [IsParameterQuery=true, Type="Number", IsParameterQueryRequired=true]
```


### RefreshClock

One refresh-time IST clock (UTC+05:30); dates and freshness use the same instant for every viewer.

```powerquery
DateTimeZone.SwitchZone(DateTimeZone.FixedUtcNow(), 5, 30)
```


### fnApi

```powerquery
(endpoint as text) as list =>
let
    Fetch = (page as number) as record =>
        let
            Payload = Json.Document(Web.Contents(ApiBaseUrl, [
                RelativePath = Text.Trim(ApiPath, "/") & "/" & endpoint,
                Query = if endpoint = "timesheets" then [page=Text.From(page), limit="1000"] else [],
                Headers = [Accept="application/json"], Timeout=#duration(0,0,5,0)])),
            Checked = if Value.Is(Payload, type record) and Record.HasFields(Payload, "data")
                and Value.Is(Payload[data], type list) then Payload
                else error "The reporting API must return a record containing a data list."
        in Checked,
    First = Fetch(1),
    Pages = if endpoint = "timesheets" then
        (if Record.HasFields(First, "pagination") and Record.HasFields(First[pagination], "totalPages")
            then Number.From(First[pagination][totalPages]) else error "Missing timesheet pagination metadata.") else 1,
    ValidPages = if Pages >= 1 and Number.RoundDown(Pages) = Pages then Pages else error "Invalid page count.",
    Rows = List.Combine({First[data]} & (if ValidPages > 1 then List.Transform({2..ValidPages}, each Fetch(_)[data]) else {})),
    CheckedCount = if endpoint = "timesheets" and List.Count(Rows) <> First[pagination][total]
        then error "Timesheet total changed during pagination. Retry refresh." else Rows
in CheckedCount
```


### HourCategoryMap

Explicit editable classification. Unmapped categories block utilization so they cannot silently inflate it.

```powerquery
#table(type table [taskCategory=text, hourCategory=text], {
    {"development","Productive"}, {"bug fix","Productive"}, {"code review","Productive"},
    {"testing","Productive"}, {"design","Productive"}, {"documentation","Productive"},
    {"training","Training"}, {"trainings/webinars","Training"},
    {"meeting","Internal"}, {"admin","Admin"},
    {"leave","Vacation"}, {"vacation","Vacation"}, {"holiday","Holiday"}
})
```


### TimesheetRows

```powerquery
let
    Rows=fnApi("timesheets"),
    Required={"id","userId","projectId","taskId","date","hours","status","weeklyRowKey","weeklyDetails"},
    Checked=if List.AllTrue(List.Transform(Rows, each Record.HasFields(_, Required))) then Rows
        else error "Deploy the requirements API update: stable IDs and weeklyRowKey are required.",
    T=Table.FromRecords(Checked, {"id","userId","projectId","taskId","date","hours","status","division","department","projectCategory","weeklyRowKey","weeklyDetails","updatedDate"}, MissingField.UseNull),
    Typed=Table.TransformColumnTypes(T, {{"id",Int64.Type},{"userId",Int64.Type},{"projectId",Int64.Type},{"taskId",Int64.Type},{"date",type date},{"hours",type number},{"status",type text},{"division",type text},{"department",type text},{"projectCategory",type text},{"weeklyRowKey",type text},{"updatedDate",type datetime}}),
    Unique=if Table.RowCount(Typed)=List.Count(List.Distinct(Typed[id])) then Typed else error "Duplicate timesheet IDs.",
    CategoryKey=Table.AddColumn(Unique,"categoryKey",each Text.Lower(Text.Trim([projectCategory] ?? "")),type text),
    Joined=Table.NestedJoin(CategoryKey,{"categoryKey"},HourCategoryMap,{"taskCategory"},"Map",JoinKind.LeftOuter),
    Expanded=Table.ExpandTableColumn(Joined,"Map",{"hourCategory"}),
    Categorized=Table.ReplaceValue(Expanded,null,"Unmapped",Replacer.ReplaceValue,{"hourCategory"})
in Categorized
```


### DeliverablesEndpoint

Optional endpoint name within ApiPath, returning one unique deliverable record per ID. Empty until an approved source exists.

```powerquery
"" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]
```


### ImprovementsEndpoint

Optional endpoint name within ApiPath, returning one unique improvement record per ID. Empty until an approved source exists.

```powerquery
"" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]
```


## Every table Power Query

These are all **16 complete partition queries** from the saved model. Shared expressions above are referenced by name. Each query loads the exact column contract listed in the data dictionary; missing optional values stay null. The query for _Measures only creates its hidden label row. The DAX measures are defined separately.


### DimEmployee query

GET users; current roster.

```powerquery
let
    Rows = fnApi("users"),
    Raw = Table.FromRecords(Rows, {"id", "employeeId", "employeeName", "division", "department", "supportingCategory", "role", "isActive"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"employeeId", type text}, {"employeeName", type text}, {"division", type text}, {"department", type text}, {"supportingCategory", type text}, {"role", type text}, {"isActive", type logical}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing DimEmployee key." else Typed
in Checked
```


### DimProject query

GET projects; project master.

```powerquery
let
    Rows = fnApi("projects"),
    Raw = Table.FromRecords(Rows, {"id", "projectCode", "projectName", "division", "subdivision", "teamType", "product", "productModule", "activity", "startDate", "targetDate", "deliveredDate", "budgetHours", "projectStatus", "isActive"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"projectCode", type text}, {"projectName", type text}, {"division", type text}, {"subdivision", type text}, {"teamType", type text}, {"product", type text}, {"productModule", type text}, {"activity", type text}, {"startDate", type date}, {"targetDate", type date}, {"deliveredDate", type date}, {"budgetHours", type number}, {"projectStatus", type text}, {"isActive", type logical}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing DimProject key." else Typed
in Checked
```


### DimDivision query

GET divisions; organization master.

```powerquery
let
    Rows = fnApi("divisions"),
    Raw = Table.FromRecords(Rows, {"id", "divisionName"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"divisionName", type text}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing DimDivision key." else Typed
in Checked
```


### DimHoliday query

GET holidays; company calendar.

```powerquery
let
    Rows = fnApi("holidays"),
    Raw = Table.FromRecords(Rows, {"id", "date", "holidayName"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"date", type date}, {"holidayName", type text}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing DimHoliday key." else Typed
in Checked
```


### DimTask query

GET tasks; task master.

```powerquery
let
    Rows = fnApi("tasks"),
    Raw = Table.FromRecords(Rows, {"id", "taskCategory", "classification"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"taskCategory", type text}, {"classification", type text}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing DimTask key." else Typed
in Checked
```


### FactTimesheet query

TimesheetRows → GET timesheets; one daily ID.

```powerquery
Table.SelectColumns(TimesheetRows,{"id","userId","projectId","taskId","date","hours","status","division","department","hourCategory"})
```


### FactWeeklyDetails query

TimesheetRows; one weeklyRowKey after deduplication.

```powerquery
let
    Eligible=Table.SelectRows(TimesheetRows, each List.Contains({"submitted","approved"},[status])),
    Grouped=Table.Group(Eligible,{"weeklyRowKey"},{
        {"Latest",each Table.First(Table.Sort(_,{{"updatedDate",Order.Descending},{"id",Order.Descending}})),type record},
        {"detailConflict",each List.Count(List.Distinct(List.Transform([weeklyDetails], each Text.FromBinary(Json.FromValue(_)))))>1,type logical}
    }),
    Expanded=Table.ExpandRecordColumn(Grouped,"Latest",{"userId","projectId","taskId","date","weeklyDetails"}),
    WeekStart=Table.TransformColumns(Expanded,{{"date",each Date.StartOfWeek(_,Day.Monday),type date}}),
    Details=Table.TransformColumns(WeekStart,{{"weeklyDetails", each Record.SelectFields(_, {"fundamental_error_count","review_by","review_date","improvement_count","designed","developed","item_number","item_description","rd_temp","next_assembly","reference_number","slide_number","milestone","improvement_location","error_type","query_from","query_description","query_to","query_date","comments","feedback_date","action_by","action_date","query_status","remarks"}, MissingField.UseNull),type record}}),
    Flattened=Table.ExpandRecordColumn(Details,"weeklyDetails",{"fundamental_error_count","review_by","review_date","improvement_count","designed","developed","item_number","item_description","rd_temp","next_assembly","reference_number","slide_number","milestone","improvement_location","error_type","query_from","query_description","query_to","query_date","comments","feedback_date","action_by","action_date","query_status","remarks"}),
    Typed=Table.TransformColumnTypes(Flattened,{{"weeklyRowKey",type text},{"userId",Int64.Type},{"projectId",Int64.Type},{"taskId",Int64.Type},{"date",type date},{"detailConflict",type logical},{"fundamental_error_count",Int64.Type},{"review_by",type text},{"review_date",type date},{"improvement_count",Int64.Type},{"designed",Int64.Type},{"developed",Int64.Type},{"item_number",type text},{"item_description",type text},{"rd_temp",type text},{"next_assembly",type text},{"reference_number",type text},{"slide_number",type text},{"milestone",type text},{"improvement_location",type text},{"error_type",type text},{"query_from",type text},{"query_description",type text},{"query_to",type text},{"query_date",type date},{"comments",type text},{"feedback_date",type date},{"action_by",type text},{"action_date",type date},{"query_status",type text},{"remarks",type text}},"en-US")
in Typed
```


### FactVacation query

GET planned-vacations; one employee/date entry.

```powerquery
let
    Rows = fnApi("planned-vacations"),
    Raw = Table.FromRecords(Rows, {"id", "userId", "date"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"userId", Int64.Type}, {"date", type date}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing FactVacation key." else Typed
in Checked
```


### FactStaffing query

GET staffing; one division/month submission.

```powerquery
let
    Rows = fnApi("staffing"),
    Raw = Table.FromRecords(Rows, {"id", "divisionId", "division", "date", "openPositions", "newJoiners"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Raw, {{"id", Int64.Type}, {"divisionId", Int64.Type}, {"division", type text}, {"date", type date}, {"openPositions", Int64.Type}, {"newJoiners", Int64.Type}}, "en-US"),
    Checked = if List.Count(List.Distinct(Typed[id])) <> Table.RowCount(Typed) or List.Contains(Typed[id], null) then error "Duplicate or missing FactStaffing key." else Typed
in Checked
```


### Settings query

Parameters and RefreshClock; one row.

```powerquery
let
    Valid=if FiscalStartMonth<1 or FiscalStartMonth>12 or Number.RoundDown(FiscalStartMonth)<>FiscalStartMonth or DailyHours<=0 or DailyHours>24 then error "Invalid capacity settings." else true
in if Valid then #table(type table [FiscalStartMonth=Int64.Type,DailyHours=number,DefectTarget=number,AsOfDate=date,RefreshIST=text],
    {{FiscalStartMonth,DailyHours,DefectTarget,Date.From(DateTimeZone.RemoveZone(RefreshClock)),DateTimeZone.ToText(RefreshClock,"yyyy-MM-dd HH:mm:ss 'IST'")}}) else error "Invalid settings"
```


### DimDate query

Generated continuous calendar; one date.

```powerquery
let
    Today=Date.From(DateTimeZone.RemoveZone(RefreshClock)),
    Dates=List.RemoveNulls(List.Combine({FactTimesheet[date],DimProject[startDate],DimProject[targetDate],DimProject[deliveredDate],FactStaffing[date],FactVacation[date],{Date.AddYears(Today,-1),Date.AddYears(Today,1)}})),
    Start=Date.StartOfYear(List.Min(Dates)), End=Date.EndOfYear(List.Max(Dates)),
    Source=Table.FromList(List.Dates(Start,Duration.Days(End-Start)+1,#duration(1,0,0,0)),Splitter.SplitByNothing(),{"Date"}),
    Typed=Table.TransformColumnTypes(Source,{{"Date",type date}}),
    Y=Table.AddColumn(Typed,"Year",each Date.Year([Date]),Int64.Type),
    M=Table.AddColumn(Y,"Month",each Date.ToText([Date],"MMM","en-US"),type text),
    MN=Table.AddColumn(M,"MonthNumber",each Date.Month([Date]),Int64.Type),
    YM=Table.AddColumn(MN,"YearMonth",each Date.ToText([Date],"yyyy-MM"),type text),
    W=Table.AddColumn(YM,"WeekStart",each Date.StartOfWeek([Date],Day.Monday),type date),
    FY=Table.AddColumn(W,"FiscalYear",each "FY " & Text.From(Date.Year(Date.AddMonths([Date],1-FiscalStartMonth))),type text),
    WD=Table.AddColumn(FY,"IsWeekday",each Date.DayOfWeek([Date],Day.Monday)<5,type logical),
    H=Table.AddColumn(WD,"IsHoliday",each List.Contains(DimHoliday[date],[Date]),type logical)
in H
```


### FactDeliverable query

DeliverablesEndpoint; one deliverableId; empty until connected.

```powerquery
let
    Raw=if Text.Trim(DeliverablesEndpoint)="" then #table(type table [deliverableId=text,projectId=Int64.Type,plannedDate=date,deliveredDate=date,fundamentalErrors=Int64.Type,informationErrors=Int64.Type,readableErrors=Int64.Type,hadRework=logical], {}) else Table.FromRecords(fnApi(DeliverablesEndpoint),{"deliverableId","projectId","plannedDate","deliveredDate","fundamentalErrors","informationErrors","readableErrors","hadRework"},MissingField.UseNull),
    Typed=Table.TransformColumnTypes(Raw,{{"deliverableId",type text},{"projectId",Int64.Type},{"plannedDate",type date},{"deliveredDate",type date},{"fundamentalErrors",Int64.Type},{"informationErrors",Int64.Type},{"readableErrors",Int64.Type},{"hadRework",type logical}}),
    Checked=if List.Contains(Typed[deliverableId],null) or List.Contains(Typed[deliverableId],"") or List.Count(List.Distinct(Typed[deliverableId]))<>Table.RowCount(Typed)
        then error "Missing or duplicate deliverableId." else Typed
in Checked
```


### FactImprovement query

ImprovementsEndpoint; one improvementId; empty until connected.

```powerquery
let
    Raw=if Text.Trim(ImprovementsEndpoint)="" then #table(type table [improvementId=text,projectId=Int64.Type,date=date,category=text,product=text,isAdditiveManufacturing=logical], {}) else Table.FromRecords(fnApi(ImprovementsEndpoint),{"improvementId","projectId","date","category","product","isAdditiveManufacturing"},MissingField.UseNull),
    Typed=Table.TransformColumnTypes(Raw,{{"improvementId",type text},{"projectId",Int64.Type},{"date",type date},{"category",type text},{"product",type text},{"isAdditiveManufacturing",type logical}}),
    Checked=if List.Contains(Typed[improvementId],null) or List.Contains(Typed[improvementId],"") or List.Count(List.Distinct(Typed[improvementId]))<>Table.RowCount(Typed)
        then error "Missing or duplicate improvementId." else Typed
in Checked
```


### FactPlan query

Project master, actuals and holidays; one project/date allocation.

```powerquery
let
    Today=Date.From(DateTimeZone.RemoveZone(RefreshClock)),
    Actuals=Table.Group(Table.SelectRows(FactTimesheet,each List.Contains({"approved","submitted"},[status]) and [date]<Today),{"projectId"},{{"Actual",each List.Sum([hours]),type number}}),
    Joined=Table.NestedJoin(DimProject,{"id"},Actuals,{"projectId"},"Actuals",JoinKind.LeftOuter),
    Expanded=Table.ExpandTableColumn(Joined,"Actuals",{"Actual"}),
    Valid=Table.SelectRows(Expanded,each [startDate]<>null and [targetDate]<>null and [targetDate]>=[startDate] and [budgetHours]<>null),
    Daily=Table.AddColumn(Valid,"Days",each let
        P=_, Days=List.Select(List.Dates(P[startDate],Duration.Days(P[targetDate]-P[startDate])+1,#duration(1,0,0,0)),each Date.DayOfWeek(_,Day.Monday)<5 and not List.Contains(DimHoliday[date],_)),
        Future=List.Select(Days,each _>=Today),
        Remaining=if P[projectStatus]="Inprogress" then List.Max({0,P[budgetHours]-(P[Actual] ?? 0)}) else 0
        in List.Transform(Days,each [projectId=P[id],date=_,scheduledHours=P[budgetHours]/List.Count(Days),
            remainingForecastHours=if _>=Today and List.Count(Future)>0 then Remaining/List.Count(Future) else 0])),
    Records=List.Combine(Daily[Days]),
    T=Table.FromRecords(Records,{"projectId","date","scheduledHours","remainingForecastHours"},MissingField.UseNull),
    Typed=Table.TransformColumnTypes(T,{{"projectId",Int64.Type},{"date",type date},{"scheduledHours",type number},{"remainingForecastHours",type number}})
in Typed
```


### InputStatus query

Authored source-readiness definitions; static explanatory rows.

```powerquery
#table(type table [Requirement=text,Status=text,Definition=text], {{"Monthly utilization","Available with assumptions","Submitted + approved work; training/internal/admin/leave/holiday excluded. Current active roster capacity, Mon–Fri. Unmapped task categories block result."},{"Yearly utilization from project start","Needs allocation history","Roster FY utilization is provided separately. Exact project-start utilization needs employee project allocations and employment start/end dates."},{"Defect density / FTR / F I R","Needs deliverable register","FactDeliverable requires unique IDs, delivered dates, error counts and rework flags. Weekly error counts are available separately."},{"Effort / schedule / on-time","Available at project grain","Budget vs project lifetime actuals for projects delivered in selected dates. Project delivery is not treated as a deliverable count."},{"Team strength / dedicated / flex","Available","Current active roster and distinct contributing employees are separate. Employee supportingCategory defines Dedicated/Flex."},{"Vacation / holidays / capacity","Available with assumptions","Historical recorded leave; future planned vacation. Capacity is a current-roster estimate, not historical contracted capacity."},{"Training / internal / admin hours","Available","Explicit HourCategoryMap. Edit mappings to match production task categories; do not infer from billable flag."},{"Forecast / scheduled hours","Available as estimate","Budget spread evenly across working dates. No resource assignment exists; department-specific demand is blank."},{"Products touched","Available","Distinct project products with submitted/approved work in selected dates; blank products excluded."},{"Improvement / designed / developed","Available at weekly grain","Deduplicated weekly row details, attributed to Monday. Conflicting copies block counts."},{"VAVE / Automation / COE / cost / additive","Needs improvement register","FactImprovement is an empty typed source contract; no fabricated classification or counts."},{"Open positions / new joiners","Available","Read-only staffing endpoint. Open positions at last selected month, joiners summed over selected months. Null stays unknown."},{"Schedule alert ±3%","Provisional definition","Schedule days divided by planned project duration. Workbook mixes days and percent; definition needs owner confirmation."},{"Defect alert ±5%","Provisional target","DefectTarget defaults to 0; red at >5 percentage points away. Confirm target and whether tolerance means relative percent."},{"Platform / cohorts","Needs business mapping","Division is available; no separate platform master or cohort definition exists. Do not silently rename division as platform."}})
```


### _Measures query

Hidden label row plus DAX measures; no business fact records.

```powerquery
#table(type table [Label=text],{{"GCC requirements"}})
```


## Maintenance, checks and troubleshooting

### GitHub and model maintenance

Maintain the canonical `.pbip`, native report JSON and **TMDL definition folder** through Desktop or carefully reviewed text changes. Close/reload the report when applying external source changes; Desktop's imported cache can retain an older model until you accept/reopen and refresh. Git stores definitions and reproducible checks, not credentials or cache. PBIX/PBIT binaries are excluded by repository policy. If you need a PBIX distribution, save/export it separately after a successful refresh and use an approved artifact channel; do not claim the Git clone contains cached production data.

`scripts/build-powerbi.py` is the **original BIM scaffold**. It now refuses to overwrite a project with a TMDL definition folder. It is not the source of truth after Desktop edits. Rebuilding would reset layouts, settings and parameters, so an intentional regeneration should use a separate output folder and be compared with the saved canonical project.

`scripts/document-powerbi.py` reads the actual model through Desktop's TOM serializer and reads every PBIR visual. It updates this guide's complete inventories/formulas. Run it after changing measures, M queries or layouts. Review the authored explanation/parameter table too: generating reference code does not approve changed business assumptions or automatically change prose. `scripts/read-powerbi-model.ps1` deserializes TMDL or a legacy BIM model read-only; it rejects simultaneous formats and can export a metadata JSON file for diagnostics. It does not connect to or refresh the report database.

```powershell
# From the repository root, after installing the application's dependencies:
python scripts/document-powerbi.py
node scripts/validate-powerbi.js
python scripts/build-powerbi-mobile.py --check
node --test scripts/powerbi-requirements.test.js

# Native synthetic scenarios need a running Desktop local engine:
powershell.exe -NoProfile -File scripts/test-powerbi-model.ps1 -Port <DesktopEnginePort>

# Optional isolated Desktop preview, with conspicuous synthetic-data titles:
python scripts/preview-powerbi-fixture.py
```

The schema validator requires Windows Power BI Desktop's TOM library, Node, and the application's `client/node_modules` AJV dependency. `scripts/powerbi-runtime.ps1` detects a running Desktop instance, the standard MSI install or the Microsoft Store package. Use Windows PowerShell (`powershell.exe`) for Desktop's .NET Framework TOM/ADOMD libraries; the native test no longer requires PowerShell 7. The validator fetches/caches Microsoft schemas and resolves each visual field against the actual model. Visual JSON editor schema links use the published compatible 2.12.0 schema because the Store build's emitted 2.13.0 schema URL was unavailable during verification; visual content and native formatting are retained. Phone files use the compatible published visualContainerMobileState 2.7.0 schema; Desktop emitted 2.8.0, whose public schema URL returned HTTP 404. Both compatible formats passed Microsoft schema validation and opened in native Desktop. The native test needs a local Desktop engine port, creates a uniquely named isolated synthetic database and drops only that database in `finally`; it never refreshes or edits the user's report model. The preview script copies the project to a unique TEMP directory, replaces only the test copy's API/clock expressions and labels it **QA • SYNTHETIC DATA**. The production project remains connected to the real API.

### Evidence and limits

| Check | Evidence | Scope |
|---|---|---|
| Current saved TMDL | Deserialized through installed Desktop TOM | Metadata syntax and saved format; no claim of successful production Desktop refresh |
| Current report schema/fields | `validation/schema-validation.json`: 244 schema documents, zero errors | PBIR definitions including 116 native phone visual files and model field references |
| Phone layout geometry | `validation/mobile-layout-validation.json`: 9 pages, 116 phone visuals, no overlaps or width violations | Prior native preview inspected overview, utilization and delivery, plus initial input-readiness rendering. Remaining native checks are pending; the user stopped Desktop automation with Escape. Actual phone app requires publication |
| Native calculation fixtures | `validation/engine-validation.json`: 72 measures evaluated, 36 cases passed | Isolated synthetic Power Query processing and DAX, including UTC-to-IST conversion, midnight/year rollover, IST calendar/forecast boundaries and the previous Friday |
| Layout/refresh update | Compact transparent timestamp text on all 9 desktop/phone pages, 116 visual containers, no overlapping/out-of-bounds visuals | Desktop compact styling rendered on Staffing before the IST edit; final IST native preview/production refresh is pending. Manual Desktop refresh selected |
| Canonical Desktop refresh on 2026-10-05 local date | Ribbon Data refresh completed; UTC header `2026-10-06 06:25:03 UTC`; 10 daily rows, 72 raw hours, 32 actual/approved hours | Read-only aggregate query and native overview/input-readiness inspection; wrapped descriptions and Unicode symbols verified; project saved |
| Application regression | 52 tests passed; existing reporting API suite 55 checks passed | Previous implementation verification; in-memory test databases |
| Added reporting inputs | Two stable-row-key/access/null/zero tests passed | Read-only reporting scope, stable daily/weekly identities, staffing/vacation inputs |
| Live API on 2026-10-02 | API v1.1.0; all nine queried diagnostic/model endpoints returned HTTP 200 | Authorized read-only production GETs, not Power BI Service refresh |
| Live counts on 2026-10-02 | 5 users, 7 projects, 9 divisions, 5 holidays, 2 tasks, 4 daily timesheets, 0 staffing submissions, 1 planned-vacation row | Aggregate source counts only; roster includes system-admin accounts, which capacity excludes |
| Isolated live snapshot native processing | 16 tables, 72 measures evaluated, 4 daily entries/32 approved hours; October utilization blank | Authorized API response snapshot processed in an isolated native test model; not the cached canonical Desktop model |
| Service deployment | No Power BI Service publication/gateway/schedule completed | GitHub application deployment is separate |

The reporting endpoints are live in application v1.15.0. The canonical Desktop report was previously refreshed and saved using existing local credentials; its historical UTC header and aggregate results are recorded in `validation/desktop-refresh-validation.json`. The user confirmed IST for the report on 2026-10-06; this update is validated locally, and a new canonical IST import/native preview is pending. A fresh clone still needs its own credentials and refresh. Final business reconciliation, task mapping, staffing/register records, fiscal assumptions, allocation history and platform/cohort definitions remain substantive input gaps. Raw employee records and local imported cache are not shipped. See [validation evidence](validation/README.md).

### Troubleshooting

| Symptom | Cause/check | Action |
|---|---|---|
| Cannot resolve/reach DietPi | Refresh machine lacks tailnet access or HTTPS reachability | Connect Tailscale and test the exact origin; for Service, test from the gateway environment |
| HTTP 503 reporting not configured | Reporting disabled, or no configured dedicated key and no valid admin JWT fallback | Confirm server reporting settings; use valid Basic credentials or configure the private dedicated key |
| HTTP 401 / 403 | Invalid/expired credentials or insufficient admin/division permission | Re-enter permitted credentials in Desktop/gateway; verify active account and server scope |
| Old localhost source or stale imported values | Cached credentials/model or unapplied external edits | Verify ApiBaseUrl, review unsaved edits, reopen/apply external changes and refresh |
| PackageSession / Pipe is broken | Desktop's current session failed while applying external changes | Preserve the saved source; open the canonical PBIP in a fresh Desktop window and use Home → Refresh → Data. This recovered the verified refresh without changing credentials |
| Missing stable IDs/weeklyRowKey | Old reporting API | Verify `/api/powerbi/version` is 1.1.0 and update the application before refresh |
| Pagination total changed | Source changed between pages | Retry after source is stable; do not accept a partial import |
| Duplicate daily/deliverable/improvement ID | Broken source grain | Correct the source identity; keep contract checks enabled |
| Utilization is blank | Unmapped actual hours, unavailable capacity or unsupported allocation filter | Inspect Unmapped Hours and mapping, roster/calendar/vacation; clear unsupported project/task context or provide allocations |
| FY number differs from monthly | Different workbook numerator and FY-through-Friday window | Reconcile period and exclusions before comparing; exact project-start rate is not available |
| Quality/FTR/categories blank | Optional registers empty or selected required fields unknown | Supply approved explicit register records; do not infer zero or rework=false |
| Open Positions/New Joiners blank | Missing selected division/month staffing submission or null count | Enter real staffing submissions, including explicit zero when confirmed |
| Weekly counts differ from daily monthly hours | Counts deduplicated and attributed to Monday | Reconcile weeklyRowKey and Monday month; inspect Detail Conflicts |
| Forecast incomplete or no future demand | Missing budget/date, Hold/Completed status, exhausted budget or overdue target | Inspect Projects Missing Plan Inputs and Overdue Unscheduled Hours; correct source master fields |
| Empty single-month trend | Saved October 2026 selection or no records in selected scope | Choose intended reporting month, clear filters for trends and confirm refresh timestamp |
| TMDL/BIM collision | Two competing semantic definitions | Retain the canonical saved TMDL folder; do not rerun legacy BIM generation into it |
| Reserved table/compatibility error | Old copied model or incompatible Desktop/cache | Use `_Measures`, level 1606 and the current saved PBIP; reopen in a compatible Desktop build |

Before accepting the report as a production KPI pack, confirm task mapping and fiscal rules, complete needed source records, reconcile a closed reporting period, review access scope, verify Desktop/Service refresh and name an ongoing report/data owner. These are concrete completion criteria for the remaining inputs, not evidence that they have already been supplied.
