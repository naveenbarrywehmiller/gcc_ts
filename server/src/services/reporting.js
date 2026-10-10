const db = require('../config/db');
const { reportingScope, reportingDivisionIds } = require('../utils/divisionScope');
const { getISOWeekNumber, getWeekDateRange } = require('../utils/dateUtils');

const DAY = 86400000;
const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'recalled'];
const VIEWS = ['weekly', 'utilization', 'projects', 'missing', 'trends', 'details'];
const employeeDivision = "COALESCE(d.name, NULLIF(TRIM(u.division), ''))";
const billing =
  "CASE WHEN tk.classification IN ('Billable','Non-Billable') THEN tk.classification WHEN p.billing_type IN ('Billable','Non-Billable') THEN p.billing_type ELSE 'Unclassified' END";

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
function validDate(value) {
  if (
    typeof value !== 'string' ||
    !/^(19|[2-9]\d)\d{2}-\d{2}-\d{2}$/.test(value) ||
    value.slice(0, 4) > '9998'
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function addDays(value, days) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function positiveInt(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > max
  )
    invalid(`Invalid ${label}.`);
  return Number(value);
}
function textFilter(value, label) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 1000) invalid(`Invalid ${label}.`);
  return value;
}
function parseReportQuery(query) {
  let start = query.start_date,
    end = query.end_date;
  if (start !== undefined || end !== undefined) {
    if (!validDate(start) || !validDate(end)) invalid('Choose valid start and end dates.');
  } else {
    const year = positiveInt(query.year, 'year', 9998);
    if (year < 1900) invalid('Choose a year from 1900 to 9998.');
    if (query.week) {
      const week = positiveInt(query.week, 'week', 53);
      const range = getWeekDateRange(week, year);
      if (
        getISOWeekNumber(range.startDate).year !== year ||
        getISOWeekNumber(range.startDate).week !== week
      )
        invalid('Invalid ISO week.');
      start = range.startDate;
      end = range.endDate;
    } else {
      const month = positiveInt(query.month, 'month', 12);
      start = `${year}-${String(month).padStart(2, '0')}-01`;
      end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    }
  }
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY + 1;
  if (days < 1 || days > 366) invalid('Choose a date range of 1–366 days.');
  if (!validDate(addDays(start, -days))) invalid('The comparison period must be in 1900 or later.');
  const filters = {};
  for (const key of ['user_id', 'project_id', 'task_id', 'location_id', 'division_id']) {
    filters[key] =
      query[key] === undefined || query[key] === ''
        ? null
        : positiveInt(query[key], key.replace('_id', ''));
  }
  for (const key of ['division', 'customer', 'subdivision', 'status', 'billing_type'])
    filters[key] = textFilter(query[key], key);
  if (query.projectless !== undefined && query.projectless !== '' && query.projectless !== '1')
    invalid('Invalid project filter.');
  filters.projectless = query.projectless === '1' ? '1' : '';
  if (filters.status && !STATUSES.includes(filters.status)) invalid('Invalid status.');
  if (
    filters.billing_type &&
    !['Billable', 'Non-Billable', 'Unclassified'].includes(filters.billing_type)
  )
    invalid('Invalid billing type.');
  const grain = query.grain || 'week';
  if (!['week', 'month'].includes(grain)) invalid('Choose weekly or monthly trends.');
  const view = query.view || 'details';
  if (!VIEWS.includes(view)) invalid('Invalid report view.');
  return { start, end, days, filters, grain, view };
}

function employeeWhere(actor, filters) {
  const scope = reportingScope(actor, 'u');
  const conditions = ["u.name != '[Deleted User]'", scope.sql];
  const params = [...scope.params];
  if (filters.user_id) {
    conditions.push('u.id = ?');
    params.push(filters.user_id);
  }
  if (filters.division_id) {
    conditions.push(
      'COALESCE(u.division_id, (SELECT id FROM divisions WHERE LOWER(TRIM(name)) = LOWER(TRIM(u.division)) AND active = 1)) = ?'
    );
    params.push(filters.division_id);
  }
  if (filters.division) {
    conditions.push(`${employeeDivision} = ?`);
    params.push(filters.division);
  }
  return { sql: conditions.join(' AND '), params };
}
function entryWhere(actor, filters, start, end) {
  const employee = employeeWhere(actor, filters);
  const project = reportingScope(actor, 'p');
  const conditions = [
    't.work_date BETWEEN ? AND ?',
    employee.sql,
    `(p.id IS NULL OR ${project.sql})`,
  ];
  const params = [start, end, ...employee.params, ...project.params];
  if (filters.projectless) conditions.push('t.project_id IS NULL');
  for (const [key, expression] of [
    ['project_id', 't.project_id'],
    ['task_id', 't.task_id'],
    ['location_id', 't.subdivision_id'],
    ['customer', 'p.customer_name'],
    ['subdivision', 's.name'],
    ['status', 't.status'],
    ['billing_type', billing],
  ]) {
    if (filters[key]) {
      conditions.push(`${expression} = ?`);
      params.push(filters[key]);
    }
  }
  return { sql: conditions.join(' AND '), params };
}
const joins = `FROM timesheets t JOIN users u ON u.id = t.user_id
  LEFT JOIN divisions d ON d.id = u.division_id LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN tasks tk ON tk.id = t.task_id LEFT JOIN subdivisions s ON s.id = t.subdivision_id
  LEFT JOIN divisions pd ON pd.id = p.division_id LEFT JOIN department_ownerships ow ON ow.id = t.ownership_id`;
const entryColumns = `t.id, t.user_id, t.project_id, t.task_id, t.division_id, t.subdivision_id, t.ownership_id,
  t.work_date, t.hours, t.description, t.project_description, t.details_json, t.status, t.week_number, t.week_year,
  u.name AS employee_name, u.email AS employee_email, ${employeeDivision} AS employee_division,
  p.project_code, p.project_name, p.customer_name, COALESCE(pd.name, p.division) AS project_division,
  tk.task_category, tk.task_description, ${billing} AS classification, s.name AS subdivision_name, ow.label AS ownership_label`;
const analysisColumns = `t.user_id, t.project_id, t.work_date, t.hours, t.status,
  u.name AS employee_name, u.email AS employee_email, ${employeeDivision} AS employee_division,
  p.project_code, p.project_name, p.customer_name, COALESCE(pd.name, p.division) AS project_division, ${billing} AS classification`;

function options(actor) {
  const scope = reportingScope(actor, 'u'),
    projectScope = reportingScope(actor, 'p');
  const ids = reportingDivisionIds(actor);
  const divisions = db
    .prepare('SELECT id, name, active FROM divisions ORDER BY name')
    .all()
    .filter((d) => actor.role === 'system admin' || ids.includes(d.id));
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.active, ${employeeDivision} AS division,
    COALESCE(u.division_id, (SELECT id FROM divisions WHERE LOWER(TRIM(name)) = LOWER(TRIM(u.division)) AND active = 1)) AS division_id
    FROM users u LEFT JOIN divisions d ON d.id = u.division_id WHERE u.name != '[Deleted User]' AND ${scope.sql} ORDER BY u.name`
    )
    .all(...scope.params);
  const projects = db
    .prepare(
      `SELECT p.id, p.project_code, p.project_name, p.customer_name, p.active FROM projects p WHERE ${projectScope.sql} ORDER BY p.project_code`
    )
    .all(...projectScope.params);
  const locations = db
    .prepare('SELECT id, name, division_id, active FROM subdivisions ORDER BY name')
    .all()
    .filter((s) => actor.role === 'system admin' || ids.includes(s.division_id));
  // Tasks are a shared catalog, but an actor with no reporting divisions receives no options.
  const tasks =
    actor.role === 'system admin' || ids.length
      ? db
          .prepare(
            'SELECT id, task_category, classification, active FROM tasks ORDER BY task_category'
          )
          .all()
      : [];
  const customers = [...new Set(projects.map((p) => p.customer_name).filter(Boolean))].sort();
  return { divisions, users, projects, locations, tasks, customers };
}
function getEntries(actor, spec, { page, pageSize = 50 } = {}) {
  const where = entryWhere(actor, spec.filters, spec.start, spec.end);
  const total = db
    .prepare(`SELECT COUNT(*) AS count ${joins} WHERE ${where.sql}`)
    .get(...where.params).count;
  const limit = page ? ' LIMIT ? OFFSET ?' : '';
  const data = db
    .prepare(
      `SELECT ${entryColumns} ${joins} WHERE ${where.sql} ORDER BY t.work_date DESC, u.name, t.id${limit}`
    )
    .all(...where.params, ...(page ? [pageSize, (page - 1) * pageSize] : []));
  return { data, total, page: page || 1, page_size: pageSize };
}
function emptyTotals() {
  return {
    total_hours: 0,
    billable_hours: 0,
    non_billable_hours: 0,
    unclassified_hours: 0,
    approved_hours: 0,
    pending_hours: 0,
    status_hours: Object.fromEntries(STATUSES.map((s) => [s, 0])),
  };
}
function accumulate(total, entry) {
  total.total_hours += entry.hours;
  total[
    entry.classification === 'Billable'
      ? 'billable_hours'
      : entry.classification === 'Non-Billable'
        ? 'non_billable_hours'
        : 'unclassified_hours'
  ] += entry.hours;
  total.status_hours[entry.status] += entry.hours;
  if (entry.status === 'approved') total.approved_hours += entry.hours;
  if (entry.status === 'submitted') total.pending_hours += entry.hours;
}
function workingDates(start, end, holidays) {
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(date)) dates.push(date);
  }
  return dates;
}
function weekKey(date) {
  const { year, week } = getISOWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
function buckets(start, end, grain) {
  const result = new Map();
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const key = grain === 'month' ? date.slice(0, 7) : weekKey(date);
    if (!result.has(key))
      result.set(key, { key, start_date: date, end_date: date, ...emptyTotals() });
    result.get(key).end_date = date;
  }
  return result;
}
function percent(hours, expected) {
  return expected > 0 ? Math.round((hours / expected) * 1000) / 10 : null;
}
function capacityAllowed(filters) {
  return ![
    'project_id',
    'projectless',
    'task_id',
    'location_id',
    'customer',
    'subdivision',
    'status',
    'billing_type',
  ].some((key) => filters[key]);
}

function analysis(actor, spec, today = todayDate()) {
  const [startYear, startMonth, startDay] = spec.start.split('-').map(Number);
  const [endYear, endMonth] = spec.end.split('-').map(Number);
  const fullMonths =
    startDay === 1 &&
    spec.end === new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const monthCount = (endYear - startYear) * 12 + endMonth - startMonth + 1;
  const previousStart = fullMonths
    ? new Date(Date.UTC(startYear, startMonth - 1 - monthCount, 1)).toISOString().slice(0, 10)
    : addDays(spec.start, -spec.days);
  const previousEnd = addDays(spec.start, -1);
  const where = entryWhere(actor, spec.filters, previousStart, spec.end);
  const all = db
    .prepare(
      `SELECT ${analysisColumns} ${joins} WHERE ${where.sql} ORDER BY t.work_date, u.name, t.id`
    )
    .all(...where.params);
  const current = all.filter((row) => row.work_date >= spec.start);
  const previous = all.filter((row) => row.work_date <= previousEnd);
  const employee = employeeWhere(actor, spec.filters);
  const people = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.active, ${employeeDivision} AS division
    FROM users u LEFT JOIN divisions d ON d.id = u.division_id WHERE ${employee.sql} ORDER BY u.name`
    )
    .all(...employee.params);
  const activePeople = people.filter((u) => u.active);
  const holidaySet = new Set(
    db
      .prepare('SELECT date FROM holidays WHERE date BETWEEN ? AND ?')
      .all(previousStart, spec.end)
      .map((h) => h.date)
  );
  const through = spec.end < today ? spec.end : today;
  const dates = workingDates(spec.start, through, holidaySet);
  const fullSelection = capacityAllowed(spec.filters);
  const projectAccess = reportingScope(actor, 'p');
  // An employee may book to another division. Do not call that invisible time a missing submission.
  const outsideScopeQuery = fullSelection
    ? db.prepare(
        `SELECT 1 FROM timesheets t JOIN users u ON u.id = t.user_id
    LEFT JOIN divisions d ON d.id = u.division_id JOIN projects p ON p.id = t.project_id
    WHERE t.work_date BETWEEN ? AND ? AND u.active = 1 AND ${employee.sql}
    AND NOT COALESCE((${projectAccess.sql}), 0) LIMIT 1`
      )
    : null;
  const outsideScope = outsideScopeQuery?.get(
    spec.start,
    through,
    ...employee.params,
    ...projectAccess.params
  );
  const previousOutsideScope = outsideScopeQuery?.get(
    previousStart,
    previousEnd < today ? previousEnd : today,
    ...employee.params,
    ...projectAccess.params
  );
  const capacityAvailable = fullSelection && !outsideScope;
  const capacityReason = outsideScope
    ? 'Some employee time is outside your report scope. Capacity and missing hours require a complete employee time record.'
    : 'Clear project, customer, task, location, billing and status filters to calculate employee capacity and missing hours.';
  const period = {
    start_date: spec.start,
    end_date: spec.end,
    expected_through: through < spec.start ? null : through,
    today,
  };
  const totals = emptyTotals(),
    previousTotals = emptyTotals();
  current.forEach((row) => accumulate(totals, row));
  previous.forEach((row) => accumulate(previousTotals, row));
  const activeIds = new Set(activePeople.map((u) => u.id));
  const activeThroughEntries = current.filter(
    (r) => activeIds.has(r.user_id) && r.work_date <= through
  );
  const loggedToDate = activeThroughEntries.reduce((sum, r) => sum + r.hours, 0);
  const billableToDate = activeThroughEntries
    .filter((r) => r.classification === 'Billable')
    .reduce((sum, r) => sum + r.hours, 0);
  const expectedTotal = dates.length * 8 * activePeople.length;
  const noEntries =
    through < spec.start
      ? 0
      : activePeople.filter((u) => !activeThroughEntries.some((r) => r.user_id === u.id)).length;
  const summary = {
    ...totals,
    employees: activePeople.length,
    no_entries: noEntries,
    logged_through_today: loggedToDate,
    expected_hours: capacityAvailable ? expectedTotal : null,
    coverage_pct: capacityAvailable ? percent(loggedToDate, expectedTotal) : null,
    billable_utilization_pct: capacityAvailable ? percent(billableToDate, expectedTotal) : null,
  };

  const weeks = buckets(spec.start, spec.end, 'week');
  const weeklyPeople = new Map();
  const projects = new Map();
  for (const row of current) {
    const key = weekKey(row.work_date);
    if (!weeklyPeople.has(row.user_id))
      weeklyPeople.set(row.user_id, {
        user_id: row.user_id,
        name: row.employee_name,
        email: row.employee_email,
        division: row.employee_division,
        weeks: {},
        ...emptyTotals(),
      });
    const person = weeklyPeople.get(row.user_id);
    if (!person.weeks[key]) person.weeks[key] = emptyTotals();
    accumulate(person.weeks[key], row);
    accumulate(person, row);
    accumulate(weeks.get(key), row);
    // Include historical projectless entries so project totals reconcile with the summary.
    const projectKey = row.project_id || 'no-project';
    if (!projects.has(projectKey))
      projects.set(projectKey, {
        project_id: row.project_id,
        project_code: row.project_code || 'No project',
        project_name: row.project_name || 'Historical entries without a project',
        customer_name: row.customer_name,
        division: row.project_division,
        contributors: new Map(),
        ...emptyTotals(),
      });
    const project = projects.get(projectKey);
    accumulate(project, row);
    if (!project.contributors.has(row.user_id))
      project.contributors.set(row.user_id, {
        user_id: row.user_id,
        name: row.employee_name,
        email: row.employee_email,
        hours: 0,
      });
    project.contributors.get(row.user_id).hours += row.hours;
  }
  const utilization = activePeople.map((u) => {
    const rows = activeThroughEntries.filter((r) => r.user_id === u.id),
      total = emptyTotals();
    rows.forEach((r) => accumulate(total, r));
    return {
      ...u,
      ...total,
      days_logged: new Set(rows.map((r) => r.work_date)).size,
      expected_hours: capacityAvailable ? dates.length * 8 : null,
      utilization_pct: capacityAvailable ? percent(total.total_hours, dates.length * 8) : null,
      billable_utilization_pct: capacityAvailable
        ? percent(total.billable_hours, dates.length * 8)
        : null,
    };
  });
  const missing = capacityAvailable
    ? activePeople
        .map((u) => {
          const rows = activeThroughEntries.filter((r) => r.user_id === u.id);
          const daily = new Map();
          rows.forEach((r) => daily.set(r.work_date, (daily.get(r.work_date) || 0) + r.hours));
          const missingDates = dates.filter((d) => !daily.get(d));
          const shortDates = dates.filter((d) => daily.get(d) > 0 && daily.get(d) < 8 - 1e-8);
          const unsubmittedHours = rows
            .filter((r) => ['draft', 'rejected', 'recalled'].includes(r.status))
            .reduce((sum, r) => sum + r.hours, 0);
          const awaiting = [...weeks.values()]
            .filter((w) => {
              const range = getWeekDateRange(
                getISOWeekNumber(w.start_date).week,
                getISOWeekNumber(w.start_date).year
              );
              const working = workingDates(
                w.start_date,
                w.end_date < through ? w.end_date : through,
                holidaySet
              );
              if (
                range.startDate < spec.start ||
                range.endDate > spec.end ||
                range.endDate >= today ||
                !working.length
              )
                return false;
              const entries = rows.filter(
                (r) => r.work_date >= w.start_date && r.work_date <= w.end_date
              );
              return (
                !entries.length ||
                entries.some((r) => ['draft', 'rejected', 'recalled'].includes(r.status))
              );
            })
            .map((w) => w.key);
          return {
            user_id: u.id,
            name: u.name,
            email: u.email,
            division: u.division,
            expected_hours: dates.length * 8,
            logged_hours: rows.reduce((sum, r) => sum + r.hours, 0),
            missing_hours: dates.reduce((sum, d) => {
              const gap = Math.max(0, 8 - (daily.get(d) || 0));
              return sum + (gap < 1e-8 ? 0 : gap);
            }, 0),
            missing_dates: missingDates,
            short_dates: shortDates,
            unsubmitted_hours: unsubmittedHours,
            awaiting_submission_weeks: awaiting,
          };
        })
        .filter(
          (u) =>
            u.missing_hours > 0 || u.unsubmitted_hours > 0 || u.awaiting_submission_weeks.length
        )
        .sort((a, b) => b.missing_hours - a.missing_hours || a.name.localeCompare(b.name))
    : [];

  const trends = buckets(spec.start, spec.end, spec.grain);
  current.forEach((r) =>
    accumulate(
      trends.get(spec.grain === 'month' ? r.work_date.slice(0, 7) : weekKey(r.work_date)),
      r
    )
  );
  for (const bucket of trends.values()) {
    const working = workingDates(
      bucket.start_date,
      bucket.end_date < through ? bucket.end_date : through,
      holidaySet
    );
    const rows = activeThroughEntries.filter(
      (r) => r.work_date >= bucket.start_date && r.work_date <= bucket.end_date
    );
    const expected = working.length * 8 * activePeople.length;
    bucket.expected_hours = capacityAvailable ? expected : null;
    bucket.coverage_pct = capacityAvailable
      ? percent(
          rows.reduce((sum, r) => sum + r.hours, 0),
          expected
        )
      : null;
    bucket.billable_utilization_pct = capacityAvailable
      ? percent(
          rows.filter((r) => r.classification === 'Billable').reduce((sum, r) => sum + r.hours, 0),
          expected
        )
      : null;
  }
  const previousExpected =
    workingDates(previousStart, previousEnd < today ? previousEnd : today, holidaySet).length *
    8 *
    activePeople.length;
  const previousActive = previous.filter((r) => activeIds.has(r.user_id) && r.work_date <= today);
  const previousCapacityAvailable = fullSelection && !previousOutsideScope;
  previousTotals.coverage_pct = previousCapacityAvailable
    ? percent(
        previousActive.reduce((sum, r) => sum + r.hours, 0),
        previousExpected
      )
    : null;
  previousTotals.billable_utilization_pct = previousCapacityAvailable
    ? percent(
        previousActive
          .filter((r) => r.classification === 'Billable')
          .reduce((sum, r) => sum + r.hours, 0),
        previousExpected
      )
    : null;
  return {
    period,
    filters: spec.filters,
    grain: spec.grain,
    summary,
    capacity: {
      available: capacityAvailable,
      reason: capacityAvailable ? null : capacityReason,
      working_days: dates.length,
      expected_hours_per_person: dates.length * 8,
      note: 'Capacity uses current active users, 8-hour weekdays and company holidays through today. Planned vacation is not recorded leave. Missing hours are daily shortfalls; extra hours on another day do not cancel them.',
    },
    weekly: {
      weeks: [...weeks.values()],
      rows: [...weeklyPeople.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
    utilization,
    projects: [...projects.values()]
      .map((p) => ({
        ...p,
        contributors: [...p.contributors.values()].sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.total_hours - a.total_hours),
    grand_total_hours: totals.total_hours,
    missing,
    trends: [...trends.values()],
    comparison: {
      period: { start_date: previousStart, end_date: previousEnd },
      summary: previousTotals,
      hours_change_pct: previousTotals.total_hours
        ? Math.round(
            ((totals.total_hours - previousTotals.total_hours) / previousTotals.total_hours) * 1000
          ) / 10
        : null,
      note: `${fullMonths ? `Previous period covers the preceding ${monthCount} calendar month${monthCount === 1 ? '' : 's'}.` : 'Previous period has the same number of calendar days.'} Current periods may be incomplete; capacity uses the current active-user roster in both periods.${previousOutsideScope ? ' Previous capacity is unavailable because some employee time is outside your report scope.' : ''}`,
    },
  };
}

module.exports = {
  parseReportQuery,
  options,
  getEntries,
  analysis,
  positiveInt,
  todayDate,
  addDays,
  STATUSES,
  VIEWS,
};
