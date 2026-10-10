const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const detailFields = require('../config/timesheetFields.json');
const { options } = require('./reporting');

const titles = {
  weekly: 'Weekly Summary',
  utilization: 'Utilization',
  projects: 'Project Hours',
  missing: 'Missing Hours',
  trends: 'Trends',
  details: 'Timesheet Details',
};
const round = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : (n ?? ''));
const percentText = (value) => (value === null || value === undefined ? 'N/A' : `${value}%`);
const statuses = (total) =>
  Object.entries(total.status_hours)
    .filter(([, hours]) => hours > 0)
    .map(([status, hours]) => `${status}: ${round(hours)}h`)
    .join(', ');

function filterLabels(actor, filters) {
  const available = options(actor);
  const result = [];
  const lookup = (list, id, field = 'name') =>
    list.find((item) => item.id === id)?.[field] || 'Unavailable selection';
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    const labels = {
      user_id: ['Employee', () => lookup(available.users, value)],
      division_id: ['Division', () => lookup(available.divisions, value)],
      project_id: ['Project', () => lookup(available.projects, value, 'project_code')],
      task_id: ['Task', () => lookup(available.tasks, value, 'task_category')],
      location_id: ['Location', () => lookup(available.locations, value)],
      division: [
        'Division',
        () => (available.divisions.some((d) => d.name === value) ? value : 'Unavailable selection'),
      ],
      customer: [
        'Customer',
        () => (available.customers.includes(value) ? value : 'Unavailable selection'),
      ],
      subdivision: [
        'Location',
        () => (available.locations.some((s) => s.name === value) ? value : 'Unavailable selection'),
      ],
      status: ['Status', () => value],
      billing_type: ['Billing', () => value],
      projectless: ['Project', () => 'No project'],
    };
    if (labels[key]) result.push(`${labels[key][0]}: ${labels[key][1]()}`);
  }
  return result.length ? result.join(' · ') : 'All accessible records';
}
function reportRows(report, view, entries) {
  if (view === 'weekly')
    return {
      headers: ['Employee', 'Division', 'Week', 'Hours', 'Approved', 'Pending', 'Statuses'],
      widths: [120, 85, 70, 55, 55, 55, 340],
      rows: report.weekly.rows.flatMap((u) =>
        Object.entries(u.weeks).map(([week, w]) => [
          u.name,
          u.division || '',
          week,
          round(w.total_hours),
          round(w.approved_hours),
          round(w.pending_hours),
          statuses(w),
        ])
      ),
      total: [
        'Grand Total',
        '',
        '',
        round(report.summary.total_hours),
        round(report.summary.approved_hours),
        round(report.summary.pending_hours),
        '',
      ],
    };
  if (view === 'utilization')
    return {
      headers: ['Employee', 'Division', 'Days', 'Hours*', 'Expected*', 'Coverage %', 'Billable %'],
      widths: [190, 155, 65, 80, 80, 105, 105],
      rows: report.utilization.map((u) => [
        u.name,
        u.division || '',
        u.days_logged,
        round(u.total_hours),
        round(u.expected_hours),
        round(u.utilization_pct),
        round(u.billable_utilization_pct),
      ]),
      total: [
        'Active users total',
        '',
        '',
        round(report.utilization.reduce((s, u) => s + u.total_hours, 0)),
        round(report.summary.expected_hours),
        round(report.summary.coverage_pct),
        round(report.summary.billable_utilization_pct),
      ],
    };
  if (view === 'projects')
    return {
      headers: ['Project', 'Name', 'Customer', 'Division', 'Contributors', 'Hours'],
      widths: [95, 245, 140, 110, 85, 105],
      rows: report.projects.map((p) => [
        p.project_code,
        p.project_name,
        p.customer_name || '',
        p.division || '',
        p.contributors.length,
        round(p.total_hours),
      ]),
      total: ['Grand Total', '', '', '', '', round(report.summary.total_hours)],
    };
  if (view === 'missing')
    return {
      headers: [
        'Employee',
        'Division',
        'Expected',
        'Logged',
        'Missing',
        'Days without hours',
        'Unsubmitted',
        'Weeks awaiting',
      ],
      widths: [130, 90, 65, 65, 65, 75, 80, 210],
      rows: report.missing.map((u) => [
        u.name,
        u.division || '',
        round(u.expected_hours),
        round(u.logged_hours),
        round(u.missing_hours),
        u.missing_dates.length,
        round(u.unsubmitted_hours),
        u.awaiting_submission_weeks.join(', '),
      ]),
      total: [
        'Flagged users total',
        '',
        '',
        '',
        round(report.missing.reduce((s, u) => s + u.missing_hours, 0)),
        '',
        round(report.missing.reduce((s, u) => s + u.unsubmitted_hours, 0)),
        '',
      ],
    };
  if (view === 'trends')
    return {
      headers: [
        'Period',
        'Hours',
        'Billable',
        'Non-billable',
        'Unclassified',
        'Approved',
        'Coverage %',
        'Billable utilization %',
      ],
      widths: [150, 85, 85, 95, 95, 85, 95, 95],
      rows: report.trends.map((t) => [
        t.key,
        round(t.total_hours),
        round(t.billable_hours),
        round(t.non_billable_hours),
        round(t.unclassified_hours),
        round(t.approved_hours),
        round(t.coverage_pct),
        round(t.billable_utilization_pct),
      ]),
      total: [
        'Grand Total',
        round(report.summary.total_hours),
        round(report.summary.billable_hours),
        round(report.summary.non_billable_hours),
        round(report.summary.unclassified_hours),
        round(report.summary.approved_hours),
        round(report.summary.coverage_pct),
        round(report.summary.billable_utilization_pct),
      ],
    };
  return {
    headers: ['Employee', 'Date', 'Project', 'Task', 'Hours', 'Status', 'Description'],
    widths: [120, 70, 90, 95, 50, 65, 290],
    rows: entries.map((r) => [
      r.employee_name,
      r.work_date,
      r.project_code || 'No project',
      r.task_category || '',
      round(r.hours),
      r.status,
      r.project_description || r.description || '',
    ]),
    total: ['Grand Total', '', '', '', round(report.summary.total_hours), '', ''],
  };
}
function infoRows(report, actor, spec, generated) {
  return [
    ['Report', titles[spec.view]],
    ['Period', `${spec.start} to ${spec.end}`],
    ['Filters', filterLabels(actor, spec.filters)],
    ['Generated (UTC)', generated],
    [
      'Expected hours through',
      report.period.expected_through || 'No elapsed days in the selected range',
    ],
    ['Total hours', round(report.summary.total_hours)],
    ['Approved hours', round(report.summary.approved_hours)],
    ['Pending approval hours', round(report.summary.pending_hours)],
    ['Billable hours', round(report.summary.billable_hours)],
    ['Non-billable hours', round(report.summary.non_billable_hours)],
    ['Unclassified hours', round(report.summary.unclassified_hours)],
    ['Active users', report.summary.employees],
    ['Active users with no matching elapsed entries', report.summary.no_entries],
    ['Capacity', report.capacity.note],
    ['Capacity availability', report.capacity.available ? 'Available' : report.capacity.reason],
    [
      'Previous period',
      `${report.comparison.period.start_date} to ${report.comparison.period.end_date}`,
    ],
    ['Previous total hours', round(report.comparison.summary.total_hours)],
    ['Previous billable hours', round(report.comparison.summary.billable_hours)],
    ['Previous coverage %', round(report.comparison.summary.coverage_pct)],
    ['Previous billable utilization %', round(report.comparison.summary.billable_utilization_pct)],
    ['Hours change %', round(report.comparison.hours_change_pct)],
    ['Comparison', report.comparison.note],
    [
      'Billing',
      'Task classification, then project billing type; missing classifications remain Unclassified.',
    ],
    [
      'Utilization',
      '*Logged and expected hours use active users and elapsed dates only. Coverage is all logged time / expected; billable utilization is billable time / expected.',
    ],
  ];
}
function sheet(workbook, name, headers, rows) {
  const ws = workbook.addWorksheet(name);
  ws.columns = headers.map((header, i) => ({
    header,
    key: String(i),
    width: /Description|Statuses|Weeks|Value/.test(header)
      ? 45
      : /Employee|Name|Division|Customer|Task|Location/.test(header)
        ? 25
        : 18,
  }));
  rows.forEach((row) => ws.addRow(row.map(round)));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: headers.length },
  };
  ws.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (index > 1)
      row.eachCell((cell) => {
        if (typeof cell.value === 'number') cell.numFmt = '0.0#';
      });
  });
  return ws;
}
async function excel(report, entries, actor, spec) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GCC Timesheet';
  workbook.created = new Date();
  const info = infoRows(report, actor, spec, workbook.created.toISOString());
  const table = reportRows(report, spec.view, entries);
  const main = sheet(
    workbook,
    spec.view === 'details' ? 'Timesheet Report' : titles[spec.view],
    table.headers,
    spec.view === 'details' ? table.rows : [...table.rows, table.total]
  );
  if (spec.view !== 'details') main.getRow(main.rowCount).font = { bold: true };
  sheet(workbook, 'Report Info', ['Setting', 'Value'], info);
  if (spec.view === 'projects')
    sheet(
      workbook,
      'Contributors',
      ['Project', 'Employee', 'Email', 'Hours'],
      report.projects.flatMap((p) =>
        p.contributors.map((c) => [p.project_code, c.name, c.email, c.hours])
      )
    );
  if (spec.view === 'missing')
    sheet(
      workbook,
      'Missing Dates',
      ['Employee', 'Date', 'Issue'],
      report.missing.flatMap((u) => [
        ...u.missing_dates.map((d) => [u.name, d, 'No logged hours']),
        ...u.short_dates.map((d) => [u.name, d, 'Below 8 hours']),
      ])
    );
  sheet(
    workbook,
    'Timesheet Entries',
    [
      'Employee',
      'Division',
      'Date',
      'ISO Year',
      'Week',
      'Project',
      'Project Name',
      'Customer',
      'Task',
      'Location',
      'Billing',
      'Ownership',
      'Hours',
      'Status',
      'Description',
      'Daily Note',
    ],
    entries.map((r) => [
      r.employee_name,
      r.employee_division,
      r.work_date,
      r.week_year,
      r.week_number,
      r.project_code || 'No project',
      r.project_name,
      r.customer_name,
      r.task_category,
      r.subdivision_name,
      r.classification,
      r.ownership_label,
      r.hours,
      r.status,
      r.project_description || '',
      r.description || '',
    ])
  );
  const seen = new Set(),
    detailRows = [];
  for (const row of entries) {
    const key = JSON.stringify([
      row.user_id,
      row.week_year,
      row.week_number,
      row.project_id,
      row.task_id,
      row.division_id,
      row.subdivision_id,
      row.project_description,
      row.ownership_id,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    let details = {};
    try {
      details = JSON.parse(row.details_json || '{}');
    } catch {
      /* Preserve export for older invalid optional JSON. */
    }
    detailRows.push([
      row.employee_name,
      row.week_year,
      row.week_number,
      row.project_code || 'No project',
      row.task_category,
      ...detailFields.map((f) => details?.[f.key] ?? ''),
    ]);
  }
  sheet(
    workbook,
    'Weekly Details',
    [
      'Employee',
      'Year',
      'Week',
      'Project Code',
      'Task Name/Number',
      ...detailFields.map((f) => f.label),
    ],
    detailRows
  );
  return workbook.xlsx.writeBuffer();
}
async function pdf(report, entries, actor, spec) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  // Attach a rejection handler before table rendering to avoid an unhandled stream rejection.
  completed.catch(() => {});
  try {
    const generated = new Date().toISOString();
    doc.info.Title = `${titles[spec.view]} - ${spec.start} to ${spec.end}`;
    doc.font('Helvetica-Bold').fontSize(16).text(titles[spec.view]);
    doc.font('Helvetica').fontSize(9).text(`Period: ${spec.start} to ${spec.end}`);
    doc.text(`Filters: ${filterLabels(actor, spec.filters).replaceAll(' · ', '; ')}`);
    doc.text(`Generated (UTC): ${generated}`);
    doc.text(
      `Total: ${round(report.summary.total_hours)}h | Approved: ${round(report.summary.approved_hours)}h | Pending approval: ${round(report.summary.pending_hours)}h`
    );
    doc.text(
      `Billable: ${round(report.summary.billable_hours)}h | Non-billable: ${round(report.summary.non_billable_hours)}h | Unclassified: ${round(report.summary.unclassified_hours)}h`
    );
    doc.text(
      `Capacity through: ${report.period.expected_through || 'No elapsed days'} | Coverage: ${percentText(report.summary.coverage_pct)} | Billable utilization: ${percentText(report.summary.billable_utilization_pct)}`
    );
    if (!report.capacity.available) doc.text(report.capacity.reason);
    doc.moveDown();
    const table = reportRows(report, spec.view, entries);
    const width = doc.page.width - 60;
    const renderTable = async (headers, rows, widths) => {
      const scale = width / widths.reduce((s, w) => s + w, 0);
      await doc.table(
        { headers, rows: rows.map((r) => r.map((v) => String(v ?? ''))) },
        {
          width,
          columnsSize: widths.map((w) => w * scale),
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
          prepareRow: () => doc.font('Helvetica').fontSize(8),
          padding: 4,
        }
      );
    };
    await renderTable(table.headers, [...table.rows, table.total], table.widths);
    if (spec.view === 'trends') {
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(11).text('Previous period comparison');
      doc.moveDown();
      const previous = report.comparison.summary;
      await renderTable(
        ['Metric', 'Selected period', 'Previous period'],
        [
          ['Total hours', round(report.summary.total_hours), round(previous.total_hours)],
          ['Billable hours', round(report.summary.billable_hours), round(previous.billable_hours)],
          ['Coverage %', round(report.summary.coverage_pct), round(previous.coverage_pct)],
          [
            'Billable utilization %',
            round(report.summary.billable_utilization_pct),
            round(previous.billable_utilization_pct),
          ],
        ],
        [400, 190, 190]
      );
    }
    if (spec.view === 'projects' && report.projects.some((p) => p.contributors.length)) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text('Project contributors');
      doc.moveDown();
      await renderTable(
        ['Project', 'Employee', 'Hours'],
        report.projects.flatMap((p) =>
          p.contributors.map((c) => [p.project_code, c.name, round(c.hours)])
        ),
        [160, 500, 120]
      );
    }
    if (spec.view === 'missing' && report.missing.length) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text('Missing and short days');
      doc.moveDown();
      await renderTable(
        ['Employee', 'Date', 'Issue'],
        report.missing.flatMap((u) => [
          ...u.missing_dates.map((d) => [u.name, d, 'No logged hours']),
          ...u.short_dates.map((d) => [u.name, d, 'Below 8 hours']),
        ]),
        [340, 140, 300]
      );
    }
    doc.moveDown();
    doc.font('Helvetica').fontSize(8).text(report.capacity.note);
    doc.text(
      'Coverage = all logged hours / expected. Billable utilization = billable hours / expected. Utilization rows include active users and elapsed dates only.'
    );
    doc.text(
      `Previous period: ${report.comparison.period.start_date} to ${report.comparison.period.end_date} | Hours: ${round(report.comparison.summary.total_hours)} | Change: ${percentText(report.comparison.hours_change_pct)}`
    );
    doc.text(report.comparison.note);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(7)
        .text(
          `GCC Timesheet - ${titles[spec.view]} - Page ${i + 1} of ${range.count}`,
          30,
          doc.page.height - 22,
          { width, align: 'right', lineBreak: false }
        );
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
    return await completed;
  } catch (error) {
    doc.destroy(error);
    await completed.catch(() => {});
    throw error;
  }
}

module.exports = { excel, pdf, reportRows, titles };
