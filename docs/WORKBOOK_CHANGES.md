# Changes Needed workbook implementation

Source: `Changes Needed.xlsx`, sheets `Timesheet Web Input` and `Timesheet Web Tooltip`.

## Behavior and defaults

- Menus: Location, Task Name/Number, Dedicated/Flex, Work Type. Existing IDs and route paths stay compatible.
- Projects: all 14 requested fields, with Project Code and Project Name required. Priority remains free text because no choices were supplied. New and migrated projects start as Inprogress. Hold and Completed are informational and do not block hours.
- Regular admins manage projects only in `admin_divisions`. System Admin can manage all divisions and unassigned projects. Existing unassigned projects remain available to System Admin for assignment. Manager behavior is retained.
- Projects use server pagination (25 per page), search, division, location, lifecycle status, and active/inactive filters. Template/export use matching headers. Export includes all filtered authorized rows, not just the current page.
- Project import accepts XLSX/CSV, creates new records only, and commits the whole file or nothing. Codes are trimmed and compared without case sensitivity, including inactive existing projects and repeats inside the file. Error messages include spreadsheet row numbers. Downloaded existing codes are not an update-import mechanism.
- Division can come from the file, page selection, or a regular admin's single assigned division. An admin with multiple divisions must supply/select one. System Admin may create unassigned projects with only Code and Name.
- Location must belong to the project's division. Budget hours cannot be negative; dates must be real YYYY-MM-DD dates (native Excel dates are also accepted on import).
- Timesheet normal inputs: Fundamental Error count, Review by (text), Review date. The other 22 fields are inside Additional Details and remain optional. Count fields are nonnegative integers; query status is free text because choices were not supplied.
- Details belong to a weekly project/task row in the UI and are saved on each of its populated daily entries. One improvement/query record per row. Details follow the existing timesheet edit/approval rules and persist with hours. A row with no hours is not stored, matching the existing timesheet model.
- Travel & VISA and staffing are separate screens backed by one record per division/month. Saving one screen preserves the other's fields. Earlier months remain selectable. Staffing distinguishes blank from zero.
- The standalone Import menu is removed. Users, Task Name/Number, and Division have Import Excel links to retain existing non-project imports.
- New fields use the supplied help text, accessible by hover or keyboard focus. Tooltip-only modules (Platform, Deliverables, M1/M2/M3 categories, Training database, Executive/Dedicated/Flex summaries, Miscellaneous) are not new features in this change.

## Reporting and integrations

- Excel timesheet export adds a Weekly Details sheet, grouped by employee, week, project/task and row dimensions so daily copies are not added together. Existing hours reports and PDF layout are retained.
- Power BI projects expose the new fields alongside existing names. `projectStatus` is separate from the old active/inactive `status`. Timesheet API adds `weeklyDetails` and `projectStatus`. Consumers must deduplicate weekly details by the weekly row before aggregating counts.
- Admin JWT project/timesheet/legacy Power BI reads are division scoped. The dedicated reporting key and System Admin retain global reporting access.
- Existing SharePoint columns remain compatible. To sync optional timesheet details, first create a multiline text column in the timesheet list, then set `SHAREPOINT_TIMESHEET_DETAILS_FIELD` to its internal name. Until configured, new details remain in SQLite and the reporting APIs; they are not sent to SharePoint. No remote schema changes are made automatically.
- Power Automate callback continues to use its existing callback-secret authentication.

## Error logs

System Admin can read structural diagnostics in Error Logs. Expected validation failures and business audit events are excluded. Raw error messages and request data are not retained. Logs include timestamps, source, error type/code, and stack locations.

Default: `server/logs/system-errors.jsonl`; override with `SYSTEM_ERROR_LOG_PATH`. This is separate from the main database. Retained file content is capped at **100,000 bytes total**; oldest complete records rotate out. A filesystem lock coordinates PM2 workers. Docker Compose persists the separate logs directory. Runtime fatal errors retain normal process termination behavior.

## Migration and release

The normal startup migration adds nullable project fields, default Inprogress, optional details storage and the division/month table. It does not delete or rewrite historical timesheets or rename database entities. Duplicate-code triggers protect new writes without deleting pre-existing case variants.

Before release, back up the production database and deploy the tested application and migration together. Review unassigned projects as System Admin. Production deployment and remote SharePoint/Power BI dataset changes are separate operations.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. The workbook regression suite covers repeatable migration, scoped project reads/writes/export, whole-file import rejection, Excel date round-trip, pagination, optional detail preservation, locked timesheets, monthly record isolation and log retention/access.

Browser verification uses an isolated in-memory database to exercise project creation, monthly updates, optional timesheet details, save/reload, and the log viewer without changing application records.

Final verification: 20 Node tests and 55 Power BI checks passed; lint and production build passed. Browser save/reload and keyboard help checks passed. The migration was also applied twice to a temporary copy of the existing backup; all pre-existing project/user/timesheet values and database integrity were preserved. The build retains a bundle-size warning.
