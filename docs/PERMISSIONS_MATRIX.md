# Permissions matrix

Updated October 12, 2026. The application shows this matrix at **Management → Matrix help** for Managers, Admins, System Admins and Viewers. Employees cannot see its navigation link, Help guide, page or API. The matrix still includes Employee permissions so management can compare all five roles.

## Enforcement and scopes

- Shared role permissions live in `shared/accessPolicy.json`. Backend `permit()` guards, frontend navigation/page guards and matrix cells use this policy. Ownership, division and timesheet status checks still apply after a role passes the guard.
- Managers add and edit shared reference settings companywide. Admins read these management pages and select existing reference values when managing accounts or projects. Only System Admins delete/deactivate shared settings or change their activation status, including through PUT requests. Holidays have Manager/System Admin import and edit controls; Admin export remains available.
- Managers maintain Travel & Visa and Open Position / New Joiners only in their assigned division. Admins read monthly records in assigned divisions; System Admins maintain all divisions. A Manager's legacy division name is resolved when its numeric reference is missing.
- Managers can view users, project details and shared tasks across all divisions. Read permissions are separate from account, project and task management permissions. Managers cannot create, edit, deactivate, delete or import these records.
- Report views, options, entry details and downloads are companywide for Managers, System Admins and Viewers, including Managers without a profile division. Admin reports and project exports retain assigned-division scope; unassigned Admins receive no report data. For scoped Admin reports, project reports restrict both projects and contributors, including projectless historical entries.
- Manager and Admin dashboard team summaries, approval queues, team vacation reads and monthly division records retain assigned-division scope. Viewers read those business pages across all divisions. Team vacation is read-only; saving always applies to the authenticated user's personal plan.
- Existing approval assignment and timesheet status rules remain in place. Managers cannot review themselves. Existing Admin/System Admin direct posting remains available only when no reviewer is assigned.
- Only System Admins assign or change privileged roles and administrator division access. Admins may retain their existing grants during profile edits, but cannot promote themselves or expand their access.

## Audit migration and historical records

Startup migration adds an indexed `audit_logs.division_id` snapshot and an insert trigger for new events. Monthly records, timesheet reviews/recalls and destructive user/project operations supply their scope explicitly. Catalog changes record before/after values. Admin audit lists, action/user filters and pagination totals use the saved event scope; moving a user later does not move their older events.

Historical events without a reliable saved division remain available to System Admins and Viewers. Global catalog and system events are also visible to System Admins and Viewers. Historical timesheets and linked reference records are retained. No existing production data was used for implementation validation.

## Viewer and registration counts

Viewer is a companywide business read role. Viewers can search and filter Users, Projects, Tasks, settings, vacation, monthly records, approval details and audit logs. All report views, options, underlying entries and Excel/PDF downloads use the same selected filters across divisions. Viewers cannot enter timesheets, change vacation, approve/reject/recall time, manage accounts or change business data. System maintenance, database operations, tokens, error logs and integration credentials remain restricted. Viewers may authenticate, refresh/logout and change their own password.

Only a System Admin may create, assign or manage Viewer accounts. Startup migration adds the role constraint while retaining all user columns, IDs, foreign-key links, indexes, triggers and the autoincrement sequence. Viewers are excluded from capacity targets, utilization roster and missing-hours checks because they cannot enter time; historical time remains readable when an existing account becomes a Viewer.

Users displays total registered accounts plus System Admin, Manager, Admin, Employee and Viewer counts. These totals include active and inactive registrations, exclude anonymized deleted accounts and remain companywide while the list is filtered. Selecting a count filters the role without clearing the other filters.

## Functions

| Page / Function | System Admin | Manager | Admin | Employee | Viewer | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard — Open dashboard and view summary | All divisions | Own records and assigned division | Assigned divisions | Own records | All divisions | Managers and employees see personal hours. Admin, System Admin and Viewer dashboards show the division summary. |
| Dashboard — View division summary and approval counts | All divisions | Assigned division | Assigned divisions | No access | All divisions | — |
| Timesheet — View, create, edit and save personal entries | Own records | Own records | Own records | Own records | No access | Viewer accounts read timesheet records through Reports and Approvals. Submitted and approved entries are locked. Choose an allowed project and its billing-compatible task; description is required. |
| Timesheet — Delete editable personal entries | Own records | Own records | Own records | Own records | No access | Draft, rejected and recalled entries only. |
| Timesheet — Submit a week for approval | Own records | Own records | Own records | Own records | No access | Requires an active assigned reviewer. Employees also need an active Admin or System Admin assignment to use the application. |
| Timesheet — Recall own week | Own records | Own records | Own records | Own records | No access | The existing recall workflow returns the week for editing. |
| Timesheet — Post own week directly | Own records | No access | Own records | No access | No access | Only when no reviewer is assigned; the existing Admin/System Admin exception is retained. |
| Approvals — View pending weeks and entry details | All divisions | Assigned division | Assigned divisions | No access | All divisions | Viewer accounts can read all submitted weeks. Other roles follow reviewer assignment and division scope. |
| Approvals — Approve or reject pending weeks | All divisions | Assigned division | Assigned divisions | No access | No access | Managers cannot review themselves. An active reviewer assignment is required; eligible reviewers in the division may review. |
| Approvals — Recall another person’s week | All divisions | No access | Assigned divisions | No access | No access | — |
| Approvals — Delete another person’s editable entries | All divisions | No access | Assigned divisions | No access | No access | Submitted and approved entries cannot be deleted. |
| Planned Vacation — View, add, remove and save personal dates | Own records | Own records | Own records | Own records | No access | Vacation plans are separate from timesheets. Viewers read saved plans through the team calendar. |
| Planned Vacation — View team calendar and employee filters | All divisions | Assigned division | Assigned divisions | No access | All divisions | Read-only: you cannot edit another person’s vacation. |
| Help — Read instructions for available pages | Role-relevant guides | Role-relevant guides | Role-relevant guides | Role-relevant guides | Role-relevant guides | — |
| Matrix help — Read and search the complete permission matrix | All roles and functions | All roles and functions | All roles and functions | No access | All roles and functions | Available to Managers, Admins, System Admins and Viewers. This matrix describes permissions; it does not grant access to restricted pages. |
| Users — View the user directory, registration counts by role and total; search/filter/sort | All divisions | All divisions | All divisions | No access | All divisions | Counts include active and inactive registered accounts and exclude anonymized deleted accounts. Managers and Viewers have read-only directory and profile access; account changes and history retain their existing scope. |
| Users — Create employee accounts; edit profiles and category assignments | All records | No access | Assigned divisions; non-admin accounts | No access | No access | Selecting Division, Department or Dedicated/Flex on an account uses existing choices; it does not change the shared reference lists. |
| Users — Reset passwords; activate/deactivate accounts | All records | No access | Assigned divisions; non-admin accounts | No access | No access | You cannot deactivate yourself or a System Admin. Other Admin accounts require a System Admin. |
| Users — Deactivate or permanently anonymize accounts | All records | No access | Assigned divisions; non-admin accounts | No access | No access | Linked records are retained; System Admin accounts are protected. |
| Users — Assign or change Manager, Admin, System Admin and Viewer roles | All accounts | No access | No access | No access | No access | Admins cannot change their own role or promote another account. Viewer access is companywide and requires a System Admin. |
| Users — Change administrator division access | All administrator accounts | No access | No access | No access | No access | Admins cannot expand their own access. |
| Users — Assign employee booking divisions | All records | No access | Assigned divisions; non-admin accounts | No access | No access | Admins may grant divisions they manage and retain existing employee grants. Primary division must be selected. |
| Users — Assign/release employee ownership; view timesheet history | All divisions | No access | Assigned divisions | No access | No access | Existing ownership rules and active account checks apply. |
| Projects — View available projects and select them in a timesheet | Available project choices | Available project choices | Available project choices | Available project choices | No access | Employee booking divisions and Dedicated/Flex rules are enforced when saving time. |
| Projects — View the project directory and details; search and filter | All divisions | All divisions | All divisions | No access | All divisions | Managers and Viewers have read-only access. |
| Projects — Create, edit, classify and deactivate projects | All divisions | No access | Assigned divisions | No access | No access | Both the current and destination division must be manageable. Reference values are selected from existing lists. |
| Projects — Import a project workbook | All divisions | No access | Assigned divisions | No access | No access | Import is validated before any records are saved. |
| Projects — Export project data or download an import template | All divisions | All divisions | Assigned divisions | No access | All divisions | — |
| Projects — Permanently delete an unused project | All divisions | No access | Assigned divisions | No access | No access | Projects with timesheet entries must be deactivated instead. |
| Task Name/Number — Use existing tasks in a timesheet | Available task choices | Available task choices | Available task choices | Available task choices | No access | — |
| Task Name/Number — View and search the shared task directory | Companywide | Companywide | Companywide | No access | Companywide | Includes active and inactive tasks. Managers and Viewers have read-only access. |
| Task Name/Number — Create, edit and deactivate shared tasks | Companywide | No access | Companywide | No access | No access | Task management remains with Admins and System Admins. |
| Divisions — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Divisions — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Divisions — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Locations — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Locations — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Locations — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Departments — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Departments — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Departments — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Department Ownership — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Department Ownership — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Department Ownership — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Dedicated/Flex — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Dedicated/Flex — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Dedicated/Flex — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Work Type — View and search reference settings | Companywide | Companywide | Companywide | No access | Companywide | Employees can use relevant choices through their existing forms. |
| Work Type — Add and edit reference settings | Companywide | Companywide | No access | No access | No access | Manager changes affect all divisions. |
| Work Type — Delete/deactivate or change activation status | Companywide | No access | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Travel & Visa — View monthly division records | All divisions | Assigned division | Assigned divisions | No access | All divisions | — |
| Travel & Visa — Create and edit current or earlier monthly records | All divisions | Assigned division | No access | No access | No access | Admins have read-only access. Records are saved per division and month. |
| Open Position / New Joiners — View monthly division records | All divisions | Assigned division | Assigned divisions | No access | All divisions | — |
| Open Position / New Joiners — Create and edit current or earlier monthly records | All divisions | Assigned division | No access | No access | No access | Admins have read-only access. Records are saved per division and month. |
| Holidays — View and export the selected calendar year | Companywide | Companywide | Companywide | No access | Companywide | — |
| Holidays — Add, edit and import holidays | Companywide | Companywide | No access | No access | No access | All-day calendar import keeps existing dates and skips timed/cancelled events. Changes affect working-hour targets. |
| Holidays — Delete holidays | Companywide | No access | No access | No access | No access | — |
| Reports — View weekly, utilization, project-hour, missing-hours and trend reports with entry details | All divisions | All divisions | Assigned divisions | No access | All divisions | Managers, System Admins and Viewers read all divisions; Admins remain limited to assigned divisions. Capacity requires complete employee time. |
| Reports — Export reports to Excel or PDF | All divisions | All divisions | Assigned divisions | No access | All divisions | Downloads use the same access limits as on-screen reports. |
| Audit Log — View, search and filter activity history | All divisions | No access | Assigned divisions | No access | All divisions | Division visibility uses the scope saved at the event. System Admins and Viewers can read global and older events without a reliable scope. Logs cannot be edited or deleted here. |
| Maintenance — Enable/disable maintenance | Whole system | No access | No access | No access | No access | — |
| Maintenance — Download, back up and restore the database | Whole system | No access | No access | No access | No access | Restoring replaces the active database. |
| Maintenance — Generate API tokens | Whole system | No access | No access | No access | No access | — |
| Error Logs — View and refresh system errors | Whole system | No access | No access | No access | No access | Read-only. |
| Account — View assigned administrator and change own password | Own records | Own records | Own records | Own records | Own account | — |
| Integrations — View SharePoint sync status; sync a week or all data | Companywide integration | No access | Companywide integration | No access | No access | Requires the integration to be configured. Existing integration permissions are retained. |
| Integrations — Read Power BI reporting API | All divisions | No access | Assigned divisions | No access | No access | A configured reporting API key is a separate integration credential. |
