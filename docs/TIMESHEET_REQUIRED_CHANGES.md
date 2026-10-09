# Timesheet validation and division attribution

Implemented October 9, 2026.

## Data inspection and migration

The configured local database is `server/data/timesheet.db`. Read-only inspection before implementation found **0 projects and 0 timesheet entries**. There were no local rows violating the new mandatory rules, orphaned entries, or local contributors to the reported Unassigned category. Production data was not available; production record IDs cannot be established from this checkout.

Run `node scripts/audit-timesheet-integrity.js 2026-10` against the configured database for a read-only report. It does not start the application or run migrations. The output includes entry IDs, user IDs, dates, hours, stored employee/entry divisions, linked division activity, effective attribution and reasons, plus existing rows with missing required fields. Keep the output private as operational data.

The only new database column is nullable `projects.billing_type`, restricted to Billable or Non-Billable when set. As requested, migration does **not** infer or populate historical project classifications. An administrator must select Billing Type in Projects before saving or submitting time for an unclassified project. Project creation and imports require Billing Type; exports/templates include that column. Historical timesheets are not backfilled, removed, or rewritten by this change. The migration is repeatable and tested against legacy rows.

`tasks.requires_project` remains as a compatibility column for existing databases and integrations, but is no longer configurable or consulted for time-entry decisions. Task API compatibility output and Power BI's existing `requiresProject` field report true. New and edited tasks retain true. Historical task rows do not need bulk updates.

## Submission and approval

`user_admin_assignments` is the existing explicit relationship. `timesheetAssignment.js` joins it to an active reviewer with an Admin, Manager, or System Admin role and excludes self-assignment. There is no fallback reviewer. The repository checks the relationship inside the submission transaction, before status changes or SharePoint synchronization; the API also checks before sending Power Automate notifications. Notifications contain the explicit reviewer ID/email, and SharePoint submissions carry that reviewer's email.

Removing an employee's valid assignment suppresses their pending approval queue entries and blocks approval/rejection, including Power Automate callbacks. Bulk SharePoint entry sync and direct submitted-status sync also recheck the assignment before contacting SharePoint and when preparing the write. Historical reporting remains available under existing permissions. Callback payloads must identify the current assigned reviewer in `approverEmail`; the callback secret alone cannot route approval to someone else. Live external Power Automate/SharePoint flows were not available for testing and must consume these recipient fields.

The existing login rule is unchanged: employees require an active **Admin or System Admin** assignment. This repository did not allow a Manager-only employee assignment to log in before this change. The submission repository recognizes explicit Manager assignments, tested independently of login. Existing division review permissions and admin self-post behavior otherwise remain in place; self-post is not routing to another person.

## Entry validation and UI

Single-entry, batch, self-post, repository writes, and submission validate a real active project, nonblank Description (up to 500 characters), and an active task matching the project's Billing Type. Submission and self-post also validate existing draft/recalled/rejected rows so old incomplete records cannot bypass the requirements. Historical approved records remain readable. Correct incomplete drafts with Edit Row before resubmission.

Batch zero-hour requests retain their existing deletion meaning; they cannot save an invalid row. Changing a saved row's project/task sends deletion of the previous key and replacement entries in one transaction so a failed replacement preserves saved hours.

Add Project Row displays Project Code, Task Name/Number, then required Description. Project changes refresh task choices and clear incompatible selections. Existing project division/access filtering, project location inheritance, hours limits and optional weekly details are retained. Requires Project and optional Description labels are removed, including the Help instructions.

Divisions uses the existing search input style and filters the loaded list by name or numeric ID, case-insensitively. The schema has no separate division-code field; codes contained in names are searchable. This endpoint/list is unpaginated, so the filter covers the whole loaded list. Clearing the input restores it and unmatched searches show an empty state.

## Why Hours by Division showed Unassigned

The data flow is `timesheets.user_id → users.id → users.division_id → divisions.id → GET /api/reports/dashboard → Dashboard.jsx`.

Previously, the dashboard query grouped only by **`users.division`**, an old nullable text field. `Dashboard.jsx` displays the literal **Unassigned** when that returned value is empty. Consequently an employee with a valid `division_id` but a blank legacy text field was incorrectly classified; stale text also retained an old name after a division rename.

The query now joins the primary employee division and groups by `COALESCE(divisions.name, NULLIF(TRIM(users.division), ''))`. It retains legacy text when a primary relationship is absent, preserving older valid attribution. It does not use the project's division or the entry's project-derived division as an employee division. It does not join the multiple-division grant table, which could duplicate hours. A primary division identifies the employee's reporting division; additional grants control where they may book time.

Inactive division records retain their names in historical reporting because the join does not filter `active`. Missing users and the deleted-user sentinel remain excluded consistently with the dashboard totals. An employee/user lacking both a linked primary division and a legacy division name legitimately remains **Unassigned** under the existing nullable user schema. The audit report also distinguishes broken references. No hours or labels are hidden to make totals appear assigned.

Regression tests cover blank and stale legacy text, linked inactive divisions, legacy-only division names, genuine unassigned users, and reconciliation of the division totals with monthly hours. No individual production contributor can be asserted until the audit is run on that database.

## Validation

- 73 Node tests and 55 existing Power BI API regression checks passed; dedicated tests cover all three reviewer roles, missing/inactive/invalid/self assignments, notification recipients, callback review identity, bulk SharePoint replay, mandatory fields across write paths, atomic rejection, legacy submissions, migration preservation, project billing configuration, and division attribution.
- Frontend lint and production build. The existing JavaScript bundle-size warning remains.
- Chromium against the actual local API with an isolated in-memory database: required row fields, Billable/Non-Billable tasks, task clearing, unclassified project messaging, save/reload, employee submission, divisions search/clear/no-results, and removal of task configuration controls.
- 112 layout checks: Timesheet row dialog, Divisions with expanded Locations, Task dialog, and Project dialog at all 21 required sizes plus seven portrait/landscape counterparts (28 sizes). No document overflow, dialog overflow, out-of-bounds dialogs, or page errors. Representative screenshots were inspected.
- No production writes or deployments; live external integrations, other browser engines, physical devices and screen-reader software were not exercised.
