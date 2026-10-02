"""Generate the complete Power BI reference from the saved model and PBIR visuals.

Read-only against the project. Requires Windows Power BI Desktop's TOM library.
Only powerbi/POWERBI.md is written. Credentials and imported records are not read.
"""
import collections
import datetime
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'powerbi/GCC_Requirements'
MODEL = PROJECT / 'GCC_Requirements.SemanticModel'
REPORT = PROJECT / 'GCC_Requirements.Report/definition'
result = subprocess.run(
    ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
     str(ROOT / 'scripts/read-powerbi-model.ps1'), '-ModelPath', str(MODEL)],
    check=True, capture_output=True,
)
database = json.loads(result.stdout.decode('utf-8-sig'))
model = database['model']
tables = model['tables']
measures = [(t, m) for t in tables for m in t.get('measures', [])]
expressions = model.get('expressions', [])
page_order = json.loads((REPORT / 'pages/pages.json').read_text())['pageOrder']
pages = []
for name in page_order:
    folder = REPORT / 'pages' / name
    page = json.loads((folder / 'page.json').read_text(encoding='utf-8'))
    visuals = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((folder / 'visuals').glob('*/visual.json'))]
    pages.append((page, visuals))
total_visuals = sum(len(v) for _, v in pages)
version = json.loads((ROOT / 'package.json').read_text())['version']
date = datetime.datetime.now(datetime.timezone.utc).date().isoformat()

def body(value):
    return '\n'.join(value) if isinstance(value, list) else str(value)

def cell(value):
    return str(value).replace('|', '\\|').replace('\r', '').replace('\n', '<br>')

def literal(value):
    if isinstance(value, dict):
        if 'Literal' in value:
            return str(value['Literal'].get('Value', '')).strip("'")
        for child in value.values():
            found = literal(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = literal(child)
            if found:
                return found
    return ''

def title(visual):
    v = visual.get('visual', {})
    props = v.get('visualContainerObjects', {}).get('title', [])
    if props:
        text = literal(props[0].get('properties', {}).get('text', {}))
        if text:
            return text
    text_runs = v.get('objects', {}).get('general', [])
    if text_runs:
        paragraphs = text_runs[0].get('properties', {}).get('paragraphs', [])
        text = ' '.join(run.get('value', '') for paragraph in paragraphs for run in paragraph.get('textRuns', []))
        if text:
            return text
    return visual['name']

def fields(value):
    output = []
    if isinstance(value, dict):
        for kind in ('Column', 'Measure'):
            field = value.get(kind, {})
            entity = field.get('Expression', {}).get('SourceRef', {}).get('Entity')
            if entity:
                output.append(entity + '[' + field['Property'] + ']')
        for child in value.values():
            output.extend(fields(child))
    elif isinstance(value, list):
        for child in value:
            output.extend(fields(child))
    return list(dict.fromkeys(output))

PURPOSE = {
    'Raw Hours': 'Sum of recorded hours across all statuses, subject to the current work-division filter.',
    'Actual Hours': 'Submitted and approved hours; drafts, rejected and recalled entries do not count.',
    'Approved Hours': 'Approved hours only, for comparison with submitted plus approved actuals.',
    'Contributing Employees': 'Distinct employees with submitted or approved entries in the selected work scope.',
    'Training Hours': 'Actual hours explicitly mapped to Training.',
    'Internal Hours': 'Actual hours explicitly mapped to Internal, including the provisional meeting mapping.',
    'Admin Hours': 'Actual hours explicitly mapped to Admin.',
    'Vacation Hours': 'Recorded actual hours mapped to Vacation; distinct from planned vacation capacity.',
    'Holiday Hours': 'Recorded actual hours mapped to Holiday; distinct from calendar holiday days.',
    'Productive Hours': 'Actual hours explicitly mapped to Productive; not inferred from Billable.',
    'Unmapped Hours': 'Actual hours with no approved mapping; a positive result blocks utilization.',
    'Effective Hours': 'Actuals minus training, internal, admin, vacation and holiday hours; blank when unmapped hours exist.',
    'Working Days': 'Selected Monday–Friday dates excluding company holidays.',
    'Holiday Days': 'Company holidays that fall on a selected weekday.',
    'Vacation Days': 'Capacity vacation hours divided by the standard daily hours.',
    'Available Hours': 'Current active-roster capacity less capacity vacation hours, bounded at zero.',
    'Under Utilized %': 'One minus monthly/selected-period utilization; retains blank when utilization is unknown.',
    'As Of Date': 'UTC calendar date captured by the refresh settings, not a changing clock between visuals.',
    'Last Completed Friday': 'Friday strictly before the refresh date, including a seven-day lookback when refreshed on Friday.',
    'Available Hours Last Week': 'Estimated available roster capacity for the previous Monday–Sunday week.',
    'Available Hours Current Week': 'Estimated available roster capacity for the week containing the refresh date.',
    'Available Hours Next Week': 'Estimated available roster capacity for the following week.',
    'Available Hours FY': 'Estimated available hours from the selected/current fiscal-year start through the strictly previous Friday.',
    'Dedicated Hours': 'Actual hours for employees whose supportingCategory is Dedicated Team.',
    'Dedicated Strength': 'Current active-roster strength for Dedicated Team employees.',
    'Dedicated Utilization %': 'Monthly/selected-period utilization filtered to Dedicated Team employees.',
    'Dedicated FY Hours': 'Dedicated Team actual hours during the fiscal-year window through the previous Friday.',
    'Flex Hours': 'Actual hours for employees whose supportingCategory is Flex Team.',
    'Flex Strength': 'Current active-roster strength for Flex Team employees.',
    'Flex Utilization %': 'Monthly/selected-period utilization filtered to Flex Team employees.',
    'Flex FY Hours': 'Flex Team actual hours during the fiscal-year window through the previous Friday.',
    'Projects Delivered': 'Distinct projects with a delivered date in the selected dates.',
    'Projects On Time': 'Selected delivered projects with delivered date on or before target date.',
    'Project On Time %': 'On-time projects divided by delivered projects; project grain, not deliverable grain.',
    'Delivered Project Budget Hours': 'Complete known budgets for the selected delivered-project cohort; blank on incomplete coverage.',
    'Effort Deviation %': 'Lifetime actual minus lifetime budget, divided by lifetime budget for the same delivered cohort; blank at employee/task grain.',
    'Effort Alert Color': 'Red beyond absolute 5% effort deviation, green within tolerance, gray when unknown.',
    'Schedule Alert Color': 'Red beyond absolute 3% provisional normalized schedule deviation, green within tolerance, gray when unknown.',
    'Detail Conflicts': 'Number of weekly row identities with contradictory daily metadata copies.',
    'Weekly Fundamental Errors': 'Sum of deduplicated weekly fundamental error counts; blank on conflicting copies.',
    'Improvement Log Count': 'Sum of deduplicated weekly improvement_count; separate from initiative IDs.',
    'Designed': 'Sum of deduplicated weekly designed counts; blank on conflicting copies.',
    'Developed': 'Sum of deduplicated weekly developed counts; blank on conflicting copies.',
    'Fundamental Errors': 'Explicit deliverable fundamental errors; blank if any selected deliverable count is unknown.',
    'Information Errors': 'Explicit deliverable information errors; blank on incomplete selected counts.',
    'Readable Errors': 'Explicit deliverable readable errors; blank on incomplete selected counts.',
    'Deliverables': 'Distinct explicit deliverable IDs; projects and weekly rows are not substitute deliverables.',
    'Defect Density %': 'Explicit fundamental errors divided by explicit deliverables. The ratio can exceed 100% when multiple errors occur per deliverable.',
    'First Time Right %': 'Explicit deliverables with hadRework=false divided by deliverables; unknown flags keep the result blank.',
    'On Time Deliverables': 'Explicit deliverables delivered on or before their planned date; blank on missing selected dates.',
    'Defect Alert Color': 'Red beyond 0.05 absolute ratio points from DefectTarget, green within tolerance, gray when unknown.',
    'Products Touched': 'Distinct nonblank project products associated with submitted/approved work in the selected dates.',
    'Additive Manufacturing': 'Distinct improvement initiative IDs whose explicit additive-manufacturing flag is true.',
    'Improvement Initiatives': 'Distinct initiative IDs from the optional improvement register, including category-filtered counts.',
    'New Joiners': 'Monthly joiner flow summed over selected months/divisions; blank when required submissions/counts are missing.',
    'Hours Scheduled': 'Project budget spread over weekdays excluding holidays; blank under employee/task filters without allocations.',
    'Remaining Forecast Hours': 'Selected future remaining-budget allocation; blank under employee/task filters without allocations.',
    'Overdue Unscheduled Hours': 'Remaining Inprogress budget for projects whose target is before the refresh date; separate from scheduled future hours.',
    'Projects Missing Plan Inputs': 'Count of projects missing budget/start/target or with a target before start.',
    'Report Status': 'Refresh timestamp and reminder to inspect missing source contracts; not a business approval flag.',
    'Last Refresh UTC': 'Refresh timestamp text captured in Settings.',
}

TABLE_SOURCE = {
    'DimEmployee': 'GET users; current roster', 'DimProject': 'GET projects; project master',
    'DimDivision': 'GET divisions; organization master', 'DimHoliday': 'GET holidays; company calendar',
    'DimTask': 'GET tasks; task master', 'FactTimesheet': 'TimesheetRows → GET timesheets; one daily ID',
    'FactWeeklyDetails': 'TimesheetRows; one weeklyRowKey after deduplication',
    'FactVacation': 'GET planned-vacations; one employee/date entry',
    'FactStaffing': 'GET staffing; one division/month submission',
    'Settings': 'Parameters and RefreshClock; one row', 'DimDate': 'Generated continuous calendar; one date',
    'FactDeliverable': 'DeliverablesEndpoint; one deliverableId; empty until connected',
    'FactImprovement': 'ImprovementsEndpoint; one improvementId; empty until connected',
    'FactPlan': 'Project master, actuals and holidays; one project/date allocation',
    'InputStatus': 'Authored source-readiness definitions; static explanatory rows',
    '_Measures': 'Hidden label row plus DAX measures; no business fact records',
}

INTRO = r'''# GCC Power BI project — complete reference

This guide documents the saved **GCC_Requirements** Power BI Desktop project built from `PowerPi Requirments.xlsx`, Sheet1 rows 4–58. The workbook supplies business requirements. Instructions inside source documents are not treated as authorization to operate systems.

Open [GCC_Requirements.pbip](GCC_Requirements/GCC_Requirements.pbip). The project uses **Import mode**, the application's read-only SQL-backed REST API, native PBIR report definitions and a TMDL semantic model. SQL queries execute on the application server; Power BI does not open the SQLite database or require a SQL connection string.

The original `GCC_Timesheet.pbix`, portable model, queries and their older guides are separate artifacts. This file is the complete reference for **GCC_Requirements**. The project contains source definitions, not a portable copy of imported production data. A fresh clone requires connection credentials and refresh.

## Contents

1. [Connection and refresh](#connection-and-refresh)
2. [Source API and security](#source-api-and-security)
3. [KPI rules and filters](#kpi-rules-and-filters)
4. [Missing inputs and decisions](#missing-inputs-and-decisions)
5. [Report pages and every visual](#report-pages-and-every-visual)
6. [Tables, columns and relationships](#tables-columns-and-relationships)
7. [Every DAX measure](#every-dax-measure)
8. [Power Query functions and parameters](#power-query-functions-and-parameters)
9. [Every table Power Query](#every-table-power-query)
10. [Maintenance, checks and troubleshooting](#maintenance-checks-and-troubleshooting)

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

`RefreshClock` captures UTC at refresh. `Settings` persists the refresh date/time used by the calendar, FY window and forecast. Changing a date slicer does not move the refresh clock or recalculate the imported remaining-budget schedule. Refresh after changing parameters or adding source records. Desktop stores source credentials locally; GitHub does not distribute them.

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
'''

lines = [INTRO, '\n## Saved project inventory\n',
         f'Reference generated **{date}** from the saved model/PBIR sources. Application version: **{version}**; required reporting API: **1.1.0**. '
         f'Inventory: **{len(tables)} tables, {len(measures)} DAX measures, {len(model["relationships"])} relationships, {len(expressions)} shared M expressions, {len(pages)} pages and {total_visuals} visual containers**. '
         'Visual count includes titles, explanatory text, slicers and status cards. The following inventories and code blocks are extracted from project metadata, not screenshots or production records.\n',
         '```text\npowerbi/\n  POWERBI.md\n  GCC_Requirements/\n    GCC_Requirements.pbip\n    .gitignore                       # excludes local .pbi cache/settings\n    GCC_Requirements.Report/\n      definition.pbir               # local semantic-model reference\n      definition/\n        report.json, version.json\n        pages/<page>/page.json\n        pages/<page>/visuals/<id>/visual.json\n    GCC_Requirements.SemanticModel/\n      definition.pbism\n      definition/\n        database.tmdl, model.tmdl\n        expressions.tmdl, relationships.tmdl\n        tables/*.tmdl\n      diagramLayout.json, .platform\n  validation/                       # schema/native-fixture evidence\n```\n',
         'The saved canonical semantic model is **definition/*.tmdl**. Desktop converted the original BIM scaffold on save; `model.bim` is intentionally absent. Preserve the PBIP, report folder and semantic-model folder together. Local `.pbi` cache and credentials are excluded from Git.\n',
         '\n## Report pages and every visual\n',
         'All pages are **1440 × 900**, FitToPage, with Segoe UI text, pale-gray canvas, white visual backgrounds and dark headings. Native visuals used are textboxes, legacy cards, slicers, clustered column charts, line charts and tables. No external/custom visual package is required. Red (`#DC2626`) means a defined alert exceeded; green (`#0F766E`) means within tolerance; gray (`#64748B`) means unknown. Alert-color measures bind through native conditional formatting on the relevant cards.\n',
         'The inventory below lists every visual ID, type, title and bound query role. `Values` is the legacy-card/table role, `Category` is the category axis/slicer role and `Y` is a chart value role. Textboxes have no model fields. Any additional model-bound conditional formatting is listed with the visual. IDs match the PBIR paths for maintenance.\n']
friendly_types = {'textbox':'Text', 'card':'Card', 'slicer':'Slicer', 'clusteredColumnChart':'Clustered column chart', 'lineChart':'Line chart', 'tableEx':'Table'}
for page, visuals in pages:
    lines.extend([f'\n### {page["displayName"]}\n',
                  f'Page ID: `{page["name"]}`. Visuals: **{len(visuals)}**. Source: [page.json](GCC_Requirements/GCC_Requirements.Report/definition/pages/{page["name"]}/page.json).\n',
                  '| Visual ID | Type | Title / text | Query bindings and formatting |\n|---|---|---|---|'])
    for visual in visuals:
        v = visual.get('visual', {})
        bindings = []
        query = v.get('query', {}).get('queryState', {})
        query_fields = []
        for role, specification in query.items():
            bound = fields(specification)
            query_fields.extend(bound)
            if bound:
                bindings.append(role + ': ' + ', '.join('`' + f + '`' for f in bound))
        extra = [f for f in fields(v) if f not in query_fields]
        if extra:
            bindings.append('Formatting/other: ' + ', '.join('`' + f + '`' for f in extra))
        kind = v.get('visualType', '')
        lines.append('| ' + cell(visual['name']) + ' | ' + friendly_types.get(kind, kind) + ' | ' + cell(title(visual)) + ' | ' + cell('; '.join(bindings) or 'Static text') + ' |')
    lines.append('')

lines.extend(['\n## Tables, columns and relationships\n',
              'All table partitions use Power Query **Import**. TOM `dateTime` columns with date formatting originate from M `type date`; IDs/counts use 64-bit integers, hours/ratios use double, flags use boolean and labels use string. Date/month ordering and summary behavior are recorded below.\n',
              '| Table | Source and grain | Columns |\n|---|---|---|'])
for table in tables:
    lines.append(f'| {table["name"]} | {TABLE_SOURCE[table["name"]]} | {len(table.get("columns", []))} |')
for table in tables:
    lines.append(f'\n### {table["name"]} columns\n')
    if table.get('description'):
        lines.append(table['description'] + '\n')
    lines.append('| Column | TOM type | Format / behavior |\n|---|---|---|')
    for col in table.get('columns', []):
        details = []
        if col.get('formatString'):
            details.append('Format: ' + col['formatString'])
        if col.get('sortByColumn'):
            details.append('Sort by: ' + col['sortByColumn'])
        if col.get('summarizeBy'):
            details.append('Summary: ' + col['summarizeBy'])
        if col.get('isHidden'):
            details.append('Hidden')
        if col.get('isKey'):
            details.append('Key')
        lines.append(f'| {cell(col["name"])} | {col["dataType"]} | {cell("; ".join(details)) or "—"} |')
    lines.append('')
lines.extend(['\n### Relationships\n',
              'All 18 are active, many-to-one with a single filter direction from the dimension (one) to the fact (many); omitted TOM properties use these defaults. No automatic date hierarchy tables or bidirectional bridges are used. DimDate is the central date table. Project delivered-date cohort logic is explicit in DAX rather than an additional relationship to DimProject.\n',
              '| Dimension (one) | Fact (many) | Active | Filter direction |\n|---|---|---|---|'])
for rel in model['relationships']:
    lines.append(f'| {rel["toTable"]}[{rel["toColumn"]}] | {rel["fromTable"]}[{rel["fromColumn"]}] | {rel.get("isActive", True)} | {rel.get("crossFilteringBehavior", "oneDirection")} |')
lines.append('\nSettings, InputStatus and _Measures are disconnected. DimHoliday marks dates in DimDate during refresh. DimDivision directly filters FactStaffing; other relevant division filters are applied in measures. FactDeliverable relates on deliveredDate; plannedDate is retained for on-time comparison. No employment/allocation relationship is fabricated.\n')

lines.extend(['\n## Every DAX measure\n',
              'These are the **complete saved formulas**, in the model\'s display-folder order. All measures live in `_Measures`. `DIVIDE` without an alternate result returns blank for a zero/blank denominator; this preserves unknown rates. Percent format displays a ratio ×100; hours display numeric totals. `COALESCE` is used only where the formula explicitly treats a missing component as zero. Every numeric/string calculation is shown below so filter behavior can be inspected.\n'])
folder = None
for table, measure in measures:
    current = measure.get('displayFolder', 'Other')
    if current != folder:
        folder = current
        lines.append(f'\n### {folder}\n')
    description = measure.get('description') or PURPOSE.get(measure['name'], 'See the complete formula for filter context and missing-input handling.')
    lines.extend([f'\n#### {measure["name"]}\n', description + '\n',
                  f'Format: `{measure.get("formatString", "General")}`. Source: [TMDL measure table](GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/{table["name"]}.tmdl).\n',
                  '```dax\n' + measure['name'] + ' =\n' + body(measure['expression']).strip() + '\n```\n'])

lines.extend(['\n## Power Query functions and parameters\n',
              'All **11 shared M expressions** are reproduced exactly below. Parameters carry `IsParameterQuery` metadata so they appear in Desktop Edit parameters. `fnApi` is the reusable HTTP/JSON/pagination function; `TimesheetRows` is the typed/validated daily staging query; `HourCategoryMap` is the explicit editable classification table. Staging queries and parameters are not separate loaded business tables.\n',
              'Common M operations: `Web.Contents` downloads an authenticated Web resource using stored credentials; `Json.Document` parses JSON; `Table.FromRecords` selects a fixed contract; `Table.TransformColumnTypes` enforces types; `Table.NestedJoin`/`ExpandTableColumn` join mapping/master data; `Table.Group` deduplicates/counts weekly identities; `List.Dates` builds daily calendars/schedules; `Record.SelectFields(..., MissingField.UseNull)` preserves unknown fields; `error` stops a refresh on an explicit contract failure. The `??` operator provides a null fallback at the exact locations shown. These functions are transformations, not additional DAX measures.\n'])
for expression in expressions:
    lines.append(f'\n### {expression["name"]}\n')
    if expression.get('description'):
        lines.append(expression['description'] + '\n')
    lines.append('```powerquery\n' + body(expression['expression']).strip() + '\n```\n')

lines.extend(['\n## Every table Power Query\n',
              'These are all **16 complete partition queries** from the saved model. Shared expressions above are referenced by name. Each query loads the exact column contract listed in the data dictionary; missing optional values stay null. The query for _Measures only creates its hidden label row. The DAX measures are defined separately.\n'])
for table in tables:
    for partition in table.get('partitions', []):
        lines.extend([f'\n### {table["name"]} query\n', TABLE_SOURCE[table['name']] + '.\n',
                      '```powerquery\n' + body(partition['source']['expression']).strip() + '\n```\n'])

OUTRO = r'''
## Maintenance, checks and troubleshooting

### GitHub and model maintenance

Maintain the canonical `.pbip`, native report JSON and **TMDL definition folder** through Desktop or carefully reviewed text changes. Close/reload the report when applying external source changes; Desktop's imported cache can retain an older model until you accept/reopen and refresh. Git stores definitions and reproducible checks, not credentials or cache. PBIX/PBIT binaries are excluded by repository policy. If you need a PBIX distribution, save/export it separately after a successful refresh and use an approved artifact channel; do not claim the Git clone contains cached production data.

`scripts/build-powerbi.py` is the **original BIM scaffold**. It now refuses to overwrite a project with a TMDL definition folder. It is not the source of truth after Desktop edits. Rebuilding would reset layouts, settings and parameters, so an intentional regeneration should use a separate output folder and be compared with the saved canonical project.

`scripts/document-powerbi.py` reads the actual model through Desktop's TOM serializer and reads every PBIR visual. It updates this guide's complete inventories/formulas. Run it after changing measures, M queries or layouts. Review the authored explanation/parameter table too: generating reference code does not approve changed business assumptions or automatically change prose. `scripts/read-powerbi-model.ps1` deserializes TMDL or a legacy BIM model read-only; it rejects simultaneous formats and can export a metadata JSON file for diagnostics. It does not connect to or refresh the report database.

```powershell
# From the repository root, after installing the application's dependencies:
python scripts/document-powerbi.py
node scripts/validate-powerbi.js
node --test scripts/powerbi-requirements.test.js

# Native synthetic scenarios need a running Desktop local engine:
pwsh -File scripts/test-powerbi-model.ps1 -Port <DesktopEnginePort>

# Optional isolated Desktop preview, with conspicuous synthetic-data titles:
python scripts/preview-powerbi-fixture.py
```

The schema validator requires Windows Power BI Desktop's TOM library at `C:/Program Files/Microsoft Power BI Desktop/bin`, Node, and the application's `client/node_modules` AJV dependency. It fetches/caches Microsoft schemas and resolves each visual field against the actual model. The native test needs PowerShell 7 (`pwsh`, because its fixture scenario uses `ConvertFrom-Json -AsHashtable`), Desktop's TOM/ADOMD libraries and a local Desktop engine port. It creates a uniquely named isolated synthetic database and drops only that database in `finally`; it never refreshes or edits the user's report model. The preview script copies the project to a unique TEMP directory, replaces only the test copy's API/clock expressions and labels it **QA • SYNTHETIC DATA**. The production project remains connected to the real API.

### Evidence and limits

| Check | Evidence | Scope |
|---|---|---|
| Current saved TMDL | Deserialized through installed Desktop TOM | Metadata syntax and saved format; no claim of successful production Desktop refresh |
| Current report schema/fields | `validation/schema-validation.json`: 110 schema documents, zero errors | Current Desktop-normalized PBIR and model field references |
| Native calculation fixtures | `validation/engine-validation.json`: 72 measures evaluated, 23 cases passed | Isolated synthetic Power Query processing and DAX in Desktop's native engine |
| Calculation continuity after Desktop save | Numerical DAX and M unchanged from tested scaffold; Report Status text separator normalized | Supports applying prior calculation evidence to this saved model; not a fresh production reconciliation |
| Application regression | 52 tests passed; existing reporting API suite 55 checks passed | Previous implementation verification; in-memory test databases |
| Added reporting inputs | Two stable-row-key/access/null/zero tests passed | Read-only reporting scope, stable daily/weekly identities, staffing/vacation inputs |
| Live API on 2026-10-02 | API v1.1.0; all nine queried diagnostic/model endpoints returned HTTP 200 | Authorized read-only production GETs, not Power BI Service refresh |
| Live counts on 2026-10-02 | 5 users, 7 projects, 9 divisions, 5 holidays, 2 tasks, 4 daily timesheets, 0 staffing submissions, 1 planned-vacation row | Aggregate source counts only; roster includes system-admin accounts, which capacity excludes |
| Isolated live snapshot native processing | 16 tables, 72 measures evaluated, 4 daily entries/32 approved hours; October utilization blank | Authorized API response snapshot processed in an isolated native test model; not the cached canonical Desktop model |
| Service deployment | No Power BI Service publication/gateway/schedule completed | GitHub application deployment is separate |

The reporting endpoints are live in application v1.15.0. Production credential entry/refresh in the canonical Desktop report and final business reconciliation remain user-side checks. Missing task mapping, staffing/register records, fiscal assumptions, allocation history and platform/cohort definitions remain substantive input gaps. Local ignored live-snapshot evidence is not shipped with raw employee records. See [validation evidence](validation/README.md).

### Troubleshooting

| Symptom | Cause/check | Action |
|---|---|---|
| Cannot resolve/reach DietPi | Refresh machine lacks tailnet access or HTTPS reachability | Connect Tailscale and test the exact origin; for Service, test from the gateway environment |
| HTTP 503 reporting not configured | Reporting disabled, or no configured dedicated key and no valid admin JWT fallback | Confirm server reporting settings; use valid Basic credentials or configure the private dedicated key |
| HTTP 401 / 403 | Invalid/expired credentials or insufficient admin/division permission | Re-enter permitted credentials in Desktop/gateway; verify active account and server scope |
| Old localhost source or stale imported values | Cached credentials/model or unapplied external edits | Verify ApiBaseUrl, review unsaved edits, reopen/apply external changes and refresh |
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
'''
lines.append(OUTRO)
output = ROOT / 'powerbi/POWERBI.md'
output.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
print(json.dumps({'file': str(output), 'tables': len(tables), 'measures': len(measures),
                  'sharedMExpressions': len(expressions), 'tableQueries': sum(len(t.get('partitions', [])) for t in tables),
                  'pages': len(pages), 'visuals': total_visuals, 'lines': len(output.read_text(encoding='utf-8').splitlines())}))
