# Project and task workbook editing

Projects uses Export Projects for both existing records and a new-record workbook; the separate Download Template action and template export branch are removed. Task Name/Number offers Export Tasks and Import Excel. Empty results have only headers in the main data sheet, with no example or blank data rows. Exports honor current filters without pagination.

Downloads include the export date and time to the second: `projects_YYYY-MM-DD_HH-mm-ss.xlsx` and `tasks_YYYY-MM-DD_HH-mm-ss.xlsx`. The web uses the browser's local time zone. Direct API exports accept an IANA `time_zone` parameter and default to UTC when omitted.

## Permissions

Admin project exports and imports follow assigned Divisions and their parent Platforms. A requested out-of-scope filter returns a header-only export. Imports check the current and destination Division, including omitted exported projects. Scope is checked again on upload, so an old workbook cannot retain revoked access. System Admins manage all projects; Managers and Viewers retain companywide read/export access. Tasks remain the existing shared companywide catalog, editable/importable by Admins and System Admins, with read/export access for Managers and Viewers. Employees cannot export/import either catalog.

## Editing

- Keep Project ID or Task ID to update an existing record, including renaming a project code or task. Leave the ID blank for a new row.
- Project exports include Active, user assignment mode and semicolon-separated User IDs, as well as task IDs and a scoped User Reference sheet. Task Reference remains informational and project import never edits the task catalog.
- Excel list validation covers Platform, Division, Location, Status, Work Type, Dedicated/Flex, Active and User Assignment. Task exports validate Classification and Active. Lists use named ranges on a hidden sheet, support commas and long lists, and cover the first 10,000 data rows (or all existing rows plus 1,000, whichever is larger).
- Native Excel validation permits one choice per cell. Multiple task/user selections use semicolon-separated IDs and their reference sheets. Server validation checks all IDs and dependencies, including Division/Platform/Location consistency.
- Blank optional exported fields clear those values. Missing optional columns in older files preserve existing values. Blank Active on an existing record is an error; new rows default to active. Yes/No, Active/Inactive and 1/0 values are accepted.
- Existing inactive task assignments can remain. Classification cannot change on an assigned or logged task. Project IDs, task IDs, timesheet history and user assignments are preserved on update.

## Removed rows and validation

Removing a data row from a newly exported `.xlsx` deactivates that exported record on import. Removing all data rows deactivates the exported active records. This never permanently deletes a project or task. Project permanent deletion remains available only through the existing web action and cannot remove projects with timesheet entries.

A signed, very-hidden `_Import Manifest` records the IDs and original names/codes included in that export. Keep the workbook's hidden sheets. Only IDs in that snapshot are considered for omission: records excluded by filters, records outside the Admin's scope and records created after export are unaffected. Metadata edits and changed identity headers fail validation. If an exported code/name changed in the system, export a fresh workbook before applying edits. Records already permanently deleted in the web are never recreated from their old IDs.

CSV and older `.xlsx` files without export metadata create/update supplied rows without deactivating omitted records. Without IDs, projects match case-insensitive codes and tasks match names plus classification. Ambiguous task matches require an exported Task ID. Legacy Billable Task IDs and Non-Billable Task IDs headers remain supported. The upload accepts `.xlsx` and `.csv`; legacy binary `.xls` is unsupported.

All rows and omissions are validated before writes inside a database transaction. Any bad row rejects inserts, updates, assignment changes and deactivations together; the UI lists worksheet row numbers and reasons. Unexpected write failures roll the transaction back. Successful imports report created, updated and deactivated counts and record audit events.

## Validation

`scripts/catalog-transfer.test.js` covers empty exports, Excel rules and ranges, assignment scope, stable-ID updates, history/assignment retention, filtered and fully removed rows, records added after export, invalid rows, duplicate/unknown IDs, manifest/header tampering, legacy files, classification locks, reactivation and role permissions. Existing import tests cover native Excel dates and legacy task-ID headings.
