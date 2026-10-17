# Reports

Updated October 12, 2026.

## Views and filters

Reports provides Weekly Summary, Utilization, Project Hours, Missing Hours and Trends. All views and downloads use the selected inclusive start/end dates. Presets support this week, last week, this month, last month and the last three complete months; custom ranges support up to 366 days. Last Week selects the previous Monday–Sunday, immediately before the current week. Dates are handled as calendar dates rather than parsing UTC midnight into a local month.

Division, Employee, Project and Status are the primary filters. More filters exposes Customer, Task, Location and Classification. The button shows how many advanced filters remain active when collapsed. Reset filters clears both groups. Filters apply to every view, comparisons, entry details and downloads.

The employee division comes from the primary division ID, with the existing legacy-name fallback. Historical entries for inactive employees and projects remain available. Options include their inactive state. Deleted-user sentinel records are excluded. Productive, Non-Productive and Unclassified hours are distinct; task classification takes precedence over the project's legacy project classification, and missing metadata is not guessed from the legacy default `billable` flag.

## Summaries and drilldowns

All views show total, approved and pending approval hours, plus active users without matching entries through today. Pending means Submitted; Draft, Rejected and Recalled are shown separately in weekly status badges and Missing Hours.

Weekly Summary distinguishes ISO week years and preserves every status in a mixed-status week. Project Hours includes inactive projects and historical projectless entries so its totals reconcile with the summary. Projects expand to show contributors. Hours, employee names, project View entries buttons and trend periods open a paginated entry dialog. It displays dates, hours, status, project, task, customer, division, location, classification, descriptions, daily notes and optional weekly details. The dialog can export its complete filtered selection, including entries beyond the current page.

## Capacity and missing hours

Capacity follows the existing eight-hour weekday convention and excludes company holidays on weekdays. Weekend holidays do not subtract another working day. Targets and utilization numerators stop at the earlier of today and the selected end date. Future ranges have no elapsed target and show an unavailable percentage rather than zero-percent performance.

Capacity uses the current active-user roster eligible to enter time, including management accounts, rather than inferring employment dates from account creation. Viewers are excluded from expected hours, utilization and missing-hours checks because they cannot enter time. Inactive users and accounts changed to Viewer remain in historical activity totals but are excluded from capacity. Different employment schedules and recorded leave deductions are not modeled. Planned Vacation is a plan and does not count as recorded leave or automatically reduce a target.

Logged-hours coverage is all elapsed logged time divided by expected hours. Productive utilization uses productive elapsed time divided by the same target. Summary activity totals can include inactive users and future dated entries, while utilization rows explicitly use active users and elapsed dates only.

Full employee capacity cannot be attributed to a project, customer, task, location, classification or status subset. With these filters, activity reports work normally, while capacity and missing-hours checks show an explanation. Capacity is also unavailable when an active employee has time outside the actor's project-report scope. The selected and previous periods are checked independently, so incomplete previous records do not suppress complete current capacity. Invisible time must not produce a false shortfall.

Missing Hours shows daily shortfalls, days with no hours, days below eight hours, and Draft/Rejected/Recalled hours. Overtime on one day does not cancel another day's shortfall. Submission-gap weeks must be completed ISO weeks wholly inside the selected range. Partially selected boundary weeks still contribute daily shortfalls but are not labeled missing submissions. This is a report, not a reminder or an automatic approval action.

## Comparisons and trends

Full calendar-month ranges compare with the preceding same number of calendar months. Other ranges compare with the immediately preceding equal number of calendar days. Weekly and monthly trend buckets include zero-activity periods. Totals, productive hours, coverage and productive utilization are compared, with the exact previous dates shown. A current period may be incomplete; the current active-user roster is used for both capacity calculations.

## Downloads

Excel and PDF download the selected view and preserve its period, filters, totals, classification breakdown and generation time. Utilization downloads contain utilization rows rather than the raw timesheet report. Project exports include contributor details, Missing Hours includes missing/short dates, and Trends includes previous-period comparisons.

Excel includes Report Info, Timesheet Entries and deduplicated Weekly Details sheets. Project and Missing Hours downloads add their specific detail sheets. The legacy raw Excel download retains the Timesheet Report worksheet name. PDFs use landscape tables with repeated table headers and page numbers. Invalid ranges or formats fail before a successful download is reported. Download object URLs are released after use.

## API and access

- `GET /api/reports/options`: scoped filter catalogs including inactive historical records.
- `GET /api/reports/analysis`: shared summaries, all five report aggregates and comparison metadata.
- `GET /api/reports/entries`: scoped entry detail pages; default 50 rows, maximum 100.
- `GET /api/reports/export`: `view=weekly|utilization|projects|missing|trends|details` and `format=excel|pdf`. Without a format, returns raw JSON entries.
- Existing `weekly-summary`, `utilization`, `project-hours` and `project-hours-detail` routes accept the shared range/filter contract and retain legacy month/year or ISO week/year date inputs.

Every report view, filter-options, entry-detail and export endpoint requires Reports permission. Managers, System Admins and Viewers can report companywide, including Managers and Viewers without a profile division. Viewers can use all selection filters and download every report view to Excel or PDF. Admins remain limited to their assigned divisions; both employee and project scope limit their entries, aggregates, drilldowns and exports. Admins without a reporting division receive empty data. Reports use private, no-store responses. Manager dashboard team summaries, approval queues, team vacation and monthly division records retain assigned-division scope.

## Validation

Run `npm test`, `npm run lint` and `npm run build`. Reporting regression tests use an isolated in-memory database and cover inclusive ranges, ISO years, mixed statuses, historical metadata, classification reconciliation, holiday-aware capacity, future periods, daily gaps, submission weeks, partial scopes, comparisons, input validation, access limits, pagination and view-specific exports. Browser and PDF validation results are recorded in [RESPONSIVE_AUDIT.md](RESPONSIVE_AUDIT.md).
