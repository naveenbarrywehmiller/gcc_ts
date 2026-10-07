const commonGuides = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/',
    description: 'See your current week, recent activity, and work that needs attention.',
    steps: [
      'Open Dashboard to see the current week and your recent entries.',
      'Use Open Timesheet to go directly to the current week.',
      'If a timesheet was recalled, open it from the notice and review the feedback before submitting it again.',
    ],
  },
  {
    id: 'timesheet',
    title: 'Timesheet',
    path: '/timesheet',
    description: 'Record hours and send a completed week for review.',
    steps: [
      'Choose a week with the arrows or calendar, then select Add Project to enter project or task details.',
      'Enter hours on the appropriate days and select Save to keep work in progress.',
      'When the week is ready, select Submit Week. If a Recall action is available, use it to correct a submitted week.',
      'If an approved week needs a change and you cannot recall it, contact your administrator.',
    ],
  },
  {
    id: 'vacation',
    title: 'Planned Vacation',
    path: '/planned-vacation',
    description: 'Mark the dates you expect to be away.',
    steps: [
      'Switch between the week and month views, or use Go to date to find a period.',
      'Select individual dates or enter a From and To range, then select Select range.',
      'Review the pending date changes and select Save vacation before leaving the page.',
      'To remove a planned day, select it again and save the change.',
    ],
  },
];

const managerGuides = [
  {
    id: 'team-approvals',
    title: 'Team Approvals',
    path: '/manager/approvals',
    description: 'Review submitted timesheets for your team.',
    steps: [
      'Open Team Approvals and search for a team member if needed.',
      'Expand a submitted timesheet to check its entries before taking action.',
      'Approve a complete timesheet, or reject it with a reason so the employee can correct it.',
    ],
  },
];

const adminGuides = [
  {
    id: 'admin-approvals',
    title: 'Approvals',
    path: '/admin/approvals',
    description: 'Review and act on timesheets in your administration scope.',
    steps: [
      'Select a week and use the division or assigned-user filters to find submissions.',
      'Expand a person to inspect their entries and history.',
      'Approve, reject, or recall a timesheet when the action is available. Add a clear comment when requesting a correction.',
    ],
  },
  {
    id: 'users',
    title: 'Users',
    path: '/admin/users',
    description: 'Find people and maintain user records within your assigned scope.',
    steps: [
      'Search or filter by division, department, supporting category, role, or status.',
      'Open a user to review or edit their details. Use Create User when your permissions allow it.',
      'Use the assignment and history controls to manage or inspect users assigned to you.',
    ],
  },
  {
    id: 'projects-and-lists',
    title: 'Projects and reference lists',
    path: '/admin/projects',
    description: 'Keep the options used by timesheets up to date.',
    steps: [
      'Use Projects to search, filter, add, or edit projects. The page also offers an Excel template, import, and export.',
      'Use the Management links for tasks, divisions, locations, departments, work types, and other reference lists.',
      'Check the record and your scope before changing or deactivating an item.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports and audit',
    path: '/reports',
    description: 'Review recorded work and administrative activity.',
    steps: [
      'Open Reports, choose a date range, and apply the available filters.',
      'Use the Excel or PDF export buttons when you need a copy of the current report.',
      'Use Audit Log to review recorded administrative changes.',
    ],
  },
  {
    id: 'holidays',
    title: 'Holidays',
    path: '/admin/holidays',
    description: 'Maintain the calendar used when reviewing working days.',
    steps: [
      'Select the year to review its holidays.',
      'Add a holiday individually, or use Import .ics to bring in a calendar file.',
      'Use Export .ics when you need a copy of the holiday calendar.',
    ],
  },
  {
    id: 'division-updates',
    title: 'Division updates',
    path: '/admin/travel',
    description: 'Keep travel and staffing updates current.',
    steps: [
      'Open Travel & VISA or Open Position / New Joiners from Management.',
      'Review the information for your division and select Save after editing.',
    ],
  },
];

const systemAdminGuides = [
  {
    id: 'system-maintenance',
    title: 'System Maintenance',
    path: '/admin/system',
    description: 'Manage maintenance mode, database backups, and system connections.',
    steps: [
      'Open Maintenance to check or change maintenance mode.',
      'Use the backup and download controls to retain a database copy.',
      'Before restoring a database, review the selected file and the confirmation carefully: a restore replaces live data.',
    ],
  },
  {
    id: 'error-logs',
    title: 'Error Logs',
    path: '/admin/error-logs',
    description: 'Inspect application errors when investigating an issue.',
    steps: [
      'Open Error Logs to review recent errors.',
      'Select Refresh to load the latest entries after reproducing an issue.',
    ],
  },
  {
    id: 'api-tokens',
    title: 'API tokens',
    path: '/admin/system',
    description: 'Generate a token for approved system integrations.',
    steps: [
      'In System Maintenance, choose a token expiry and select Generate Token.',
      'Copy the generated token immediately; it will not be shown again.',
      'Keep tokens in an approved secure location and use the shortest practical expiry.',
    ],
  },
];


module.exports = { commonGuides, managerGuides, adminGuides, systemAdminGuides };
