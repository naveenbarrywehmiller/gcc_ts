const policy = require('../../../shared/accessPolicy.json');

const own = { 'system admin': 'Own records', manager: 'Own records', admin: 'Own records', employee: 'Own records', viewer: 'Own account' };
const divisions = { 'system admin': 'All divisions', manager: 'Assigned division', admin: 'Assigned divisions', viewer: 'All divisions' };
const reportDivisions = { ...divisions, manager: 'All divisions' };
const management = { 'system admin': 'All records', admin: 'Assigned divisions; non-admin accounts' };
const rows = [];
function add(area, action, permission, scope, note = '') {
  rows.push({ area, action, permission, note, access: Object.fromEntries(policy.roles.map(role => [role, {
    allowed: policy.permissions[permission].includes(role),
    scope: policy.permissions[permission].includes(role) ? (typeof scope === 'string' ? scope : scope[role]) : 'No access',
  }])) });
}

add('Dashboard', 'Open dashboard and view summary', 'signedIn', { ...own, 'system admin': 'All divisions', manager: 'Own records and assigned division', admin: 'Assigned divisions', viewer: 'All divisions' }, 'Managers and employees see personal hours. Admin, System Admin and Viewer dashboards show the division summary.');
add('Dashboard', 'View division summary and approval counts', 'reports', divisions);
add('Timesheet', 'View, create, edit and save personal entries', 'timesheetEntry', own, 'Viewer accounts read timesheet records through Reports and Approvals. Submitted and approved entries are locked. Choose an allowed project and an active task assigned to it; description is required.');
add('Timesheet', 'Delete editable personal entries', 'timesheetEntry', own, 'Draft, rejected and recalled entries only.');
add('Timesheet', 'Submit a week for approval', 'timesheetEntry', own, 'Requires an active assigned reviewer. Employees also need an active Admin or System Admin assignment to use the application.');
add('Timesheet', 'Recall own week', 'timesheetEntry', own, 'The existing recall workflow returns the week for editing.');
add('Timesheet', 'Post own week directly', 'selfPost', own, 'Only when no reviewer is assigned; the existing Admin/System Admin exception is retained.');
add('Approvals', 'View pending weeks and entry details', 'approvalsView', divisions, 'Viewer accounts can read all submitted weeks. Other roles follow reviewer assignment and division scope.');
add('Approvals', 'Approve or reject pending weeks', 'approvals', divisions, 'Managers cannot review themselves. An active reviewer assignment is required; eligible reviewers in the division may review.');
add('Approvals', 'Recall another person’s week', 'recallOthers', divisions);
add('Approvals', 'Delete another person’s editable entries', 'deleteOthersDrafts', divisions, 'Submitted and approved entries cannot be deleted.');
add('Planned Vacation', 'View, add, remove and save personal dates', 'vacationEdit', own, 'Vacation plans are separate from timesheets. Viewers read saved plans through the team calendar.');
add('Planned Vacation', 'View team calendar and employee filters', 'teamVacation', divisions, 'Read-only: you cannot edit another person’s vacation.');
add('Help', 'Read instructions for available pages', 'signedIn', 'Role-relevant guides');
add('Matrix help', 'Read and search the complete permission matrix', 'matrixView', 'All roles and functions', 'Available to Managers, Admins, System Admins and Viewers. This matrix describes permissions; it does not grant access to restricted pages.');
add('Users', 'View the user directory, registration counts by role and total; search/filter/sort', 'usersView', 'All divisions', 'Counts include active and inactive registered accounts and exclude anonymized deleted accounts. Managers and Viewers have read-only directory and profile access; account changes and history retain their existing scope.');
add('Users', 'Create employee accounts; edit profiles and category assignments', 'users', management, 'Selecting Division, Department or Dedicated/Flex on an account uses existing choices; it does not change the shared reference lists.');
add('Users', 'Reset passwords; activate/deactivate accounts', 'users', management, 'You cannot deactivate yourself or a System Admin. Other Admin accounts require a System Admin.');
add('Users', 'Deactivate or permanently anonymize accounts', 'users', management, 'Linked records are retained; System Admin accounts are protected.');
add('Users', 'Assign or change Manager, Admin, System Admin and Viewer roles', 'accessGrants', 'All accounts', 'Admins cannot change their own role or promote another account. Viewer access is companywide and requires a System Admin.');
add('Users', 'Change administrator division access', 'accessGrants', 'All administrator accounts', 'Admins cannot expand their own access.');
add('Users', 'Assign employee booking divisions', 'users', management, 'Admins may grant divisions they manage and retain existing employee grants. Primary division must be selected.');
add('Users', 'Assign/release employee ownership; view timesheet history', 'users', divisions, 'Existing ownership rules and active account checks apply.');
add('Projects', 'View available projects and select them in a timesheet', 'timesheetEntry', 'Available project choices', 'Employee booking divisions and Dedicated/Flex rules are enforced when saving time.');
add('Projects', 'View the project directory and details; search and filter', 'projectsView', 'All divisions', 'Managers and Viewers have read-only access.');
add('Projects', 'Create, edit, classify and deactivate projects', 'projects', divisions, 'Both the current and destination division must be manageable. Reference values are selected from existing lists.');
add('Projects', 'Import a project workbook', 'projects', divisions, 'Creates or updates by stable ID. Removed export rows deactivate only those exported projects. Any invalid row rejects all changes; both current and destination divisions are checked.');
add('Projects', 'Export project data for editing or new rows', 'projectsView', reportDivisions, 'Current filters apply. Empty results export headers. Admin exports include only assigned Platforms and Divisions.');
add('Projects', 'Permanently delete an unused project', 'projects', divisions, 'Projects with timesheet entries must be deactivated instead.');
add('Task Name/Number', 'Use existing tasks in a timesheet', 'timesheetEntry', 'Available task choices');
add('Task Name/Number', 'View and search the shared task directory', 'tasksView', 'Companywide', 'Includes active and inactive tasks. Managers and Viewers have read-only access.');
add('Task Name/Number', 'Create, edit and deactivate shared tasks', 'tasks', 'Companywide', 'Task management remains with Admins and System Admins.');
add('Task Name/Number', 'Export tasks for editing or new rows', 'tasksView', 'Companywide', 'Current filters apply. Empty results export headers; Excel includes Classification and Active dropdowns.');
add('Task Name/Number', 'Import task changes and deactivate removed export rows', 'tasks', 'Companywide', 'Any invalid row rejects all changes. Task IDs preserve existing links and assigned/logged classification history.');
for (const area of ['Divisions', 'Locations', 'Departments', 'Department Ownership', 'Dedicated/Flex', 'Work Type']) {
  add(area, 'View and search reference settings', 'catalogView', 'Companywide', 'Employees can use relevant choices through their existing forms.');
  add(area, 'Add and edit reference settings', 'catalogEdit', 'Companywide', 'Manager changes affect all divisions.');
  add(area, 'Delete/deactivate or change activation status', 'catalogDelete', 'Companywide', 'Existing historical records are retained for deactivated choices.');
}
for (const area of ['Travel & Visa', 'Open Position / New Joiners']) {
  add(area, 'View monthly division records', 'divisionUpdateView', divisions);
  add(area, 'Create and edit current or earlier monthly records', 'divisionUpdateEdit', divisions, 'Admins have read-only access. Records are saved per division and month.');
}
add('Holidays', 'View and export the selected calendar year', 'catalogView', 'Companywide');
add('Holidays', 'Add, edit and import holidays', 'catalogEdit', 'Companywide', 'All-day calendar import keeps existing dates and skips timed/cancelled events. Changes affect working-hour targets.');
add('Holidays', 'Delete holidays', 'catalogDelete', 'Companywide');
add('Reports', 'View weekly, utilization, project-hour, missing-hours and trend reports with entry details', 'reports', reportDivisions, 'Managers, System Admins and Viewers read all divisions; Admins remain limited to assigned divisions. Capacity requires complete employee time.');
add('Reports', 'Export reports to Excel or PDF', 'reports', reportDivisions, 'Downloads use the same access limits as on-screen reports.');
add('Audit Log', 'View, search and filter activity history', 'audit', divisions, 'Division visibility uses the scope saved at the event. System Admins and Viewers can read global and older events without a reliable scope. Logs cannot be edited or deleted here.');
add('Maintenance', 'Enable/disable maintenance', 'system', 'Whole system');
add('Maintenance', 'Download, back up and restore the database', 'system', 'Whole system', 'Restoring replaces the active database.');
add('Maintenance', 'Generate API tokens', 'system', 'Whole system');
add('Error Logs', 'View and refresh system errors', 'system', 'Whole system', 'Read-only.');
add('Account', 'View assigned administrator and change own password', 'signedIn', own);
add('Integrations', 'View SharePoint sync status; sync a week or all data', 'sharepoint', 'Companywide integration', 'Requires the integration to be configured. Existing integration permissions are retained.');
add('Integrations', 'Read Power BI reporting API', 'powerbi', divisions, 'A configured reporting API key is a separate integration credential.');

module.exports = { roles: policy.roles, rows };
