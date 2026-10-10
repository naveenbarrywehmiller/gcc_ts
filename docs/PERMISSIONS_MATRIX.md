# Permissions matrix

Updated October 10, 2026. The application shows this matrix at **Management → Matrix help** for Managers, Admins and System Admins. Employees cannot see its navigation link, Help guide, page or API. The matrix still includes Employee permissions so management can compare all four roles.

## Enforcement and scopes

- Shared role permissions live in `shared/accessPolicy.json`. Backend `permit()` guards, frontend navigation/page guards and matrix cells use this policy. Ownership, division and timesheet status checks still apply after a role passes the guard.
- Managers add and edit shared reference settings companywide. Admins read these management pages and select existing reference values when managing accounts or projects. Only System Admins delete/deactivate shared settings or change their activation status, including through PUT requests. Holidays have Manager/System Admin import and edit controls; Admin export remains available.
- Managers maintain Travel & Visa and Open Position / New Joiners only in their assigned division. Admins read monthly records in assigned divisions; System Admins maintain all divisions. A Manager's legacy division name is resolved when its numeric reference is missing.
- Reports, report options, downloads, dashboard totals and team vacation reads use assigned division scope. Managers without a division and Admins without assigned/profile divisions receive no team data. Project reports restrict both the project and its contributors. Projectless historical entries cannot bypass employee scope. Team vacation is read-only; saving always applies to the authenticated user's personal plan.
- Existing approval assignment and timesheet status rules remain in place. Managers cannot review themselves. Existing Admin/System Admin direct posting remains available only when no reviewer is assigned.
- Only System Admins assign or change privileged roles and administrator division access. Admins may retain their existing grants during profile edits, but cannot promote themselves or expand their access.

## Audit migration and historical records

Startup migration adds an indexed `audit_logs.division_id` snapshot and an insert trigger for new events. Monthly records, timesheet reviews/recalls and destructive user/project operations supply their scope explicitly. Catalog changes record before/after values. Admin audit lists, action/user filters and pagination totals use the saved event scope; moving a user later does not move their older events.

Historical events without a reliable saved division remain System Admin only. Global catalog and system events are also System Admin only. Historical timesheets and linked reference records are retained. No existing production data was used for implementation validation.

## Functions

“Assigned division” means the Manager's own division. “Assigned divisions” means the Admin's managed grants, with the existing profile-division fallback. “No access” applies to that function, and does not prevent using permitted choices in personal forms. Conditional rules in the last column must also be satisfied.

| Page / area | Function | System Admin | Manager | Admin | Employee | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Open dashboard and view summary | All divisions | Own records and assigned division | Assigned divisions | Own records | Managers and employees see personal hours. Admin and System Admin dashboards show the division summary. |
| Dashboard | View division summary and approval counts | All divisions | Assigned division | Assigned divisions | No access | — |
| Timesheet | View, create, edit and save personal entries | Own records | Own records | Own records | Own records | Submitted and approved entries are locked. Choose an allowed project and its billing-compatible task; description is required. |
| Timesheet | Delete editable personal entries | Own records | Own records | Own records | Own records | Draft, rejected and recalled entries only. |
| Timesheet | Submit a week for approval | Own records | Own records | Own records | Own records | Requires an active assigned reviewer. Employees also need an active Admin or System Admin assignment to use the application. |
| Timesheet | Recall own week | Own records | Own records | Own records | Own records | The existing recall workflow returns the week for editing. |
| Timesheet | Post own week directly | Own records | No access | Own records | No access | Only when no reviewer is assigned; the existing Admin/System Admin exception is retained. |
| Approvals | View pending weeks and entry details; approve or reject | All divisions | Assigned division | Assigned divisions | No access | Managers cannot review themselves. An active reviewer assignment is required; eligible reviewers in the division may review. |
| Approvals | Recall another person’s week | All divisions | No access | Assigned divisions | No access | — |
| Approvals | Delete another person’s editable entries | All divisions | No access | Assigned divisions | No access | Submitted and approved entries cannot be deleted. |
| Planned Vacation | View, add, remove and save personal dates | Own records | Own records | Own records | Own records | Vacation plans are separate from timesheets. |
| Planned Vacation | View team calendar and employee filters | All divisions | Assigned division | Assigned divisions | No access | Read-only: you cannot edit another person’s vacation. |
| Help | Read instructions for available pages | Role-relevant guides | Role-relevant guides | Role-relevant guides | Role-relevant guides | — |
| Matrix help | Read and search the complete permission matrix | All roles and functions | All roles and functions | All roles and functions | No access | Available to Managers, Admins and System Admins. This matrix describes permissions; it does not grant access to restricted pages. |
| Users | View the user directory and search/filter/sort | Directory | No access | Directory | No access | Existing directory visibility is retained; account changes and history remain scoped. |
| Users | Create employee accounts; edit profiles and category assignments | All records | No access | Assigned divisions; non-admin accounts | No access | Selecting Division, Department or Dedicated/Flex on an account uses existing choices; it does not change the shared reference lists. |
| Users | Reset passwords; activate/deactivate accounts | All records | No access | Assigned divisions; non-admin accounts | No access | You cannot deactivate yourself or a System Admin. Other Admin accounts require a System Admin. |
| Users | Deactivate or permanently anonymize accounts | All records | No access | Assigned divisions; non-admin accounts | No access | Linked records are retained; System Admin accounts are protected. |
| Users | Assign or change Manager, Admin and System Admin roles | All accounts | No access | No access | No access | Admins cannot change their own role or promote another account. |
| Users | Change administrator division access | All administrator accounts | No access | No access | No access | Admins cannot expand their own access. |
| Users | Assign employee booking divisions | All records | No access | Assigned divisions; non-admin accounts | No access | Admins may grant divisions they manage and retain existing employee grants. Primary division must be selected. |
| Users | Assign/release employee ownership; view timesheet history | All divisions | No access | Assigned divisions | No access | Existing ownership rules and active account checks apply. |
| Projects | View available projects and select them in a timesheet | Available project choices | Available project choices | Available project choices | Available project choices | Employee booking divisions and Dedicated/Flex rules are enforced when saving time. |
| Projects | Create, edit, classify and deactivate projects | All divisions | No access | Assigned divisions | No access | Both the current and destination division must be manageable. Reference values are selected from existing lists. |
| Projects | Import a project workbook | All divisions | No access | Assigned divisions | No access | Import is validated before any records are saved. |
| Projects | Export project data or download an import template | All divisions | No access | Assigned divisions | No access | — |
| Projects | Permanently delete an unused project | All divisions | No access | Assigned divisions | No access | Projects with timesheet entries must be deactivated instead. |
| Task Name/Number | Use existing tasks in a timesheet | Available task choices | Available task choices | Available task choices | Available task choices | — |
| Task Name/Number | Create, edit and deactivate shared tasks | Companywide | No access | Companywide | No access | Task management remains with Admins and System Admins. |
| Divisions | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Divisions | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Divisions | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Locations | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Locations | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Locations | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Departments | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Departments | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Departments | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Department Ownership | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Department Ownership | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Department Ownership | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Dedicated/Flex | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Dedicated/Flex | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Dedicated/Flex | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Work Type | View and search reference settings | Companywide | Companywide | Companywide | No access | Employees can use relevant choices through their existing forms. |
| Work Type | Add and edit reference settings | Companywide | Companywide | No access | No access | Manager changes affect all divisions. |
| Work Type | Delete/deactivate or change activation status | Companywide | No access | No access | No access | Existing historical records are retained for deactivated choices. |
| Travel & Visa | View monthly division records | All divisions | Assigned division | Assigned divisions | No access | — |
| Travel & Visa | Create and edit current or earlier monthly records | All divisions | Assigned division | No access | No access | Admins have read-only access. Records are saved per division and month. |
| Open Position / New Joiners | View monthly division records | All divisions | Assigned division | Assigned divisions | No access | — |
| Open Position / New Joiners | Create and edit current or earlier monthly records | All divisions | Assigned division | No access | No access | Admins have read-only access. Records are saved per division and month. |
| Holidays | View and export the selected calendar year | Companywide | Companywide | Companywide | No access | — |
| Holidays | Add, edit and import holidays | Companywide | Companywide | No access | No access | All-day calendar import keeps existing dates and skips timed/cancelled events. Changes affect working-hour targets. |
| Holidays | Delete holidays | Companywide | No access | No access | No access | — |
| Reports | View weekly, utilization and project-hour reports | All divisions | Assigned division | Assigned divisions | No access | Filters cannot expand your access. Project reports also restrict project divisions. |
| Reports | Export reports to Excel or PDF | All divisions | Assigned division | Assigned divisions | No access | Downloads use the same access limits as on-screen reports. |
| Audit Log | View, search and filter activity history | All divisions | No access | Assigned divisions | No access | Division visibility uses the scope saved at the event. Global and older events without a reliable scope are visible only to System Admins. Logs cannot be edited or deleted here. |
| Maintenance | Enable/disable maintenance | Whole system | No access | No access | No access | — |
| Maintenance | Download, back up and restore the database | Whole system | No access | No access | No access | Restoring replaces the active database. |
| Maintenance | Generate API tokens | Whole system | No access | No access | No access | — |
| Error Logs | View and refresh system errors | Whole system | No access | No access | No access | Read-only. |
| Account | View assigned administrator and change own password | Own records | Own records | Own records | Own records | — |
| Integrations | View SharePoint sync status; sync a week or all data | Companywide integration | No access | Companywide integration | No access | Requires the integration to be configured. Existing integration permissions are retained. |
| Integrations | Read Power BI reporting API | All divisions | No access | Assigned divisions | No access | A configured reporting API key is a separate integration credential. |

## Validation

`npm test` passes 83 Node tests and 55 Power BI API checks. The new permission tests cover role guards, activation bypasses, manager monthly scope, report JSON/Excel filtering, projectless and foreign-contributor leaks, team vacation ownership, dashboard scope, immutable audit visibility and administrator privilege escalation. `npm run lint` and `npm run build` pass; Vite retains the existing JavaScript chunk warning. Responsive browser coverage is recorded in [RESPONSIVE_AUDIT.md](RESPONSIVE_AUDIT.md).
