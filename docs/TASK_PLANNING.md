# Task planning and project assignments

Implemented October 13, 2026. This supersedes the single project Billing Type rule.

## Task master

Task Name/Number now has optional Estimated hours, Input Received Date, Start Date, Target Date and Delivered Date. Blank values persist as null; zero estimated hours is valid. Estimates must be finite and nonnegative, and dates must be valid ISO calendar dates. Omitted fields remain unchanged when editing through the API; null or an empty string clears a field.

Dates and estimates belong to the shared task. Editing them affects every project that uses that task. Existing project dates and Budget Hours remain independent. Classification must be Billable or Non-Billable; assigned or previously logged tasks cannot be reclassified because that would change billing history. Create another task when a different classification is needed.

## Assignments and time entry

Project forms replace Billing Type with two searchable checkbox lists. Search matches task name/number, ID and description. Selections persist across searches; Select filtered, Clear filtered and Show selected only help with large lists. A project must have at least one task across either category; both categories are allowed.

The `project_tasks` relation has a unique `(project_id, task_id)` key. Category comes from the task master. Create, edit and import validate IDs, active status and category before committing. New assignments require active tasks; existing inactive assignments can remain visible for history. Removing or deactivating an assignment does not rewrite time records. New time and submission require an active project and an active assigned task. Pending editable rows may need a replacement task after removal/deactivation.

Admin and System Admin permissions, including Admin division restrictions, apply to assignments. Manager and Viewer project details stay read-only, including assignment checkboxes. They can search the displayed choices.

## Totals and reports

- **Logged hours:** sum time entries once. Assignment joins never multiply actual hours.
- **Billable / non-billable hours:** use each logged task's classification. Historical entries without a classified task retain the previous project billing fallback; otherwise they remain Unclassified.
- **Project task estimate:** sum non-null task estimates once per project/task assignment. Return null when no assignment has an estimate. The estimated count and total assignment count show whether the plan is partial.
- **Dashboard planning total:** sum assigned task estimates across active projects in the user's project scope. A shared task assigned to two projects contributes one estimate to each project. Retained inactive tasks remain part of the assigned plan.
- **Capacity, utilization and missing-hours formulas:** continue to use actual time and working-day capacity. Estimates do not replace capacity, project budgets or actual hours.

Project Hours shows the current full-task estimate alongside period-filtered actual hours. Planning is a current snapshot of all assignments for the included projects, independent of the report date range and task/billing filters. Task tables and the timesheet task selector show the optional metadata. Excel reports include a separate Task Planning sheet; Project Hours PDF includes a planning section.

Project Excel templates/exports replace Billing Type with Billable Task IDs and Non-Billable Task IDs. Use semicolon-separated IDs; the Task Reference sheet lists IDs, categories and planning fields. Missing/invalid assignments reject the entire import. Task Reference is informational; importing projects does not edit task master data.

Power BI task/project API payloads, reusable Power Query files, and the GCC Requirements model dimensions expose the new planning fields. Preserve one row per task/project in dimensions. Existing actual-hours measures keep their original grain; assignment ID lists must not be expanded into fact rows. No live Power BI content was published or refreshed.

## Migration and deployment

The normal startup migration adds nullable task planning columns and creates the relation once, in a transaction. Existing projects inherit the active tasks their old billing type allowed, plus historical project/task pairs. This preserves existing choices and history. Later migration runs never re-add assignments an administrator removed. Existing timesheets, project dates, budgets and legacy billing values are unchanged. Projects with no eligible assignment require administrator configuration before new time can be entered.

Deploy server and client together. Older clients/import files that send only Billing Type cannot create projects under the new assignment requirement. Normal database backup/restore includes the relation. Development demo seeding creates explicit assignments; validation uses isolated databases and does not modify production data.

## Validation

118 Node tests and 55 Power BI API checks pass, including optional-field validation/clearing, required assignments, mixed billing, atomic rejection, role permissions, historical preservation, one-time migration, dashboard/report reconciliation, and Excel import/export. Lint and the production build pass; Vite retains its existing large-chunk warning.

Browser coverage and PDF visual checks are recorded in [RESPONSIVE_AUDIT.md](RESPONSIVE_AUDIT.md). Power BI Desktop runtime validation could not run because Windows denied access to the installed Microsoft Store Tabular library. Model changes are source-only; live model refresh, other browser engines and physical devices remain unverified.
