const matrixGuide = { id: 'matrix-help', title: 'Matrix help', path: '/admin/matrix-help',
    description: 'Understand permissions for every role and function.', steps: [
      'Open Matrix help under Management to compare all four roles.',
      'Search for a function, filter by area, or select Show functions available to me.',
      'Read each scope and rule before using a management action.',
    ] };

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
      'Select a Project Code for every row. Its division and location are set by an administrator in Projects and filled in automatically. Ask your administrator if a project is missing.',
      'Enter a required Description of your work, up to 500 characters. The live counter shows how much you have entered, and reviewers can read the description in expanded timesheet details.',
      'Select Task Name/Number after the project. Tasks follow its Billable or Non-Billable Billing Type. Ask an administrator to classify the project if needed.',
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
  matrixGuide,
  { id: 'manager-settings', title: 'Shared settings and monthly records', path: '/admin/divisions',
    description: 'Maintain reference lists and division updates.', steps: [
      'Use Management to add or edit Divisions, Locations, Departments, ownerships, Dedicated/Flex, Work Type and Holidays. Shared changes apply companywide.',
      'Only a System Admin can delete or deactivate shared settings.',
      'Use Travel & VISA and Open Position / New Joiners to maintain monthly records in your assigned division.',
    ] },
  { id: 'manager-reports', title: 'Team vacation and reports', path: '/reports',
    description: 'Review your division’s plans and recorded work.', steps: [
      'Use Team view in Planned Vacation to read saved plans in your assigned division. Edit your own dates in My view.',
      'Open Reports to choose a date range and review Weekly Summary, Utilization, Project Hours, Missing Hours or Trends within your assigned division.',
      'Use More filters for customer, task, location and billing. Select hours or View entries to inspect the underlying records.',
      'Capacity uses active users, eight-hour weekdays and company holidays through today. Planned vacation is not recorded leave. Clear activity filters for missing-hours checks.',
      'Excel and PDF download the selected report view with its filters and totals.',
    ] },
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
  matrixGuide,
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
    description: 'Find people and maintain roles, team categories, and division access within your assigned scope.',
    steps: [
      'Search or filter by division, department, supporting category, role, or status.',
      'Open a user to edit their details, or select Create User when your permissions allow it. Role and Dedicated/Flex are separate fields.',
      'For an admin or employee, check every division they need and mark one checked division as Primary. Admin assignments control management access; employee assignments control which divisions appear when booking project time. The same checkboxes apply to Dedicated and Flex users.',
      'Edit a user later to change their checked divisions, primary division, role, or Dedicated/Flex category. Only a System Admin can change privileged roles or administrator division access. Admins cannot expand their own access.',
      'Use the assignment and history controls to manage or inspect users assigned to you. Employees must be assigned to an active admin before they can sign in or enter time.',
    ],
  },
  {
    id: 'projects-and-lists',
    title: 'Projects and reference lists',
    path: '/admin/projects',
    description: 'Keep the options used by timesheets up to date.',
    steps: [
      'Use Projects to search, filter, add, or edit projects. The page also offers an Excel template, import, and export.',
      'Set the division and location in each project. Managers and System Admins maintain locations in Division; Admins can view the existing locations.',
      'Admins maintain Task Name/Number. Divisions, Departments, Dedicated/Flex and Work Type are read-only for Admins; Managers and System Admins maintain these lists.',
      'Check the record and your scope before changing or deactivating an item.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports and audit',
    path: '/reports',
    description: 'Review recorded work and administrative activity.',
    steps: [
      'Open Reports and choose a date range of up to 366 days. Weekly Summary, Utilization, Project Hours, Missing Hours and Trends use the same dates and filters.',
      'Use More filters for customer, task, location and billing. Select hours or View entries to inspect daily records, descriptions and weekly details.',
      'Coverage includes all logged hours; billable utilization includes billable hours only. Targets use active users, eight-hour weekdays and company holidays through today.',
      'Missing Hours flags daily shortfalls and unsubmitted completed weeks. Planned vacation is not recorded leave. Full employee records are required for capacity checks.',
      'Excel or PDF downloads the selected report view with its filters and totals. Excel also includes underlying entries and deduplicated weekly details.',
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
      'Managers and System Admins can add or edit holidays and import .ics files. Admins can view and export the calendar.',
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
      'Choose a division and month. Managers and System Admins can edit; Admins have read-only access.',
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
