const express = require('express');
const { authenticate } = require('../middleware/auth');
const { permit } = require('../middleware/permissions');
const reporting = require('../services/reporting');
const reportExport = require('../services/reportExport');
const router = express.Router();

router.use(authenticate, permit('reports'), (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
const route = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res))
    .catch((error) => {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      next(error);
    });
async function download(req, res, spec, report) {
  const format = req.query.format;
  if (!format) return false;
  if (!['excel', 'pdf'].includes(format)) {
    const error = new Error('Choose Excel or PDF.');
    error.status = 400;
    throw error;
  }
  const entries = reporting.getEntries(req.user, spec).data;
  const bytes = await reportExport[format](report, entries, req.user, spec);
  const extension = format === 'excel' ? 'xlsx' : 'pdf';
  res.type(
    format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'
  );
  res.attachment(`${spec.view}_${spec.start}_to_${spec.end}.${extension}`).send(Buffer.from(bytes));
  return true;
}

router.get(
  '/options',
  route((req, res) => res.json(reporting.options(req.user)))
);
router.get(
  '/analysis',
  route((req, res) => res.json(reporting.analysis(req.user, reporting.parseReportQuery(req.query))))
);
router.get(
  '/entries',
  route((req, res) => {
    const spec = reporting.parseReportQuery(req.query);
    const page = req.query.page ? reporting.positiveInt(req.query.page, 'page', 1000000) : 1;
    const pageSize = req.query.page_size
      ? reporting.positiveInt(req.query.page_size, 'page size', 100)
      : 50;
    res.json({
      ...reporting.getEntries(req.user, spec, { page, pageSize }),
      period: { start_date: spec.start, end_date: spec.end },
    });
  })
);
router.get(
  '/export',
  route(async (req, res) => {
    const spec = reporting.parseReportQuery(req.query);
    const report = reporting.analysis(req.user, spec);
    if (await download(req, res, spec, report)) return;
    res.json({
      ...reporting.getEntries(req.user, spec),
      period: report.period,
      filters: spec.filters,
    });
  })
);
router.get(
  '/weekly-summary',
  route(async (req, res) => {
    const spec = reporting.parseReportQuery({ ...req.query, view: 'weekly' });
    const report = reporting.analysis(req.user, spec);
    if (await download(req, res, spec, report)) return;
    const summary = report.weekly.rows.flatMap((u) =>
      Object.entries(u.weeks).flatMap(([key, week]) =>
        Object.entries(week.status_hours)
          .filter(([, hours]) => hours > 0)
          .map(([status, hours]) => ({
            user_id: u.user_id,
            user_name: u.name,
            email: u.email,
            division: u.division,
            week_number: Number(key.slice(6)),
            week_year: Number(key.slice(0, 4)),
            status,
            total_hours: hours,
          }))
      )
    );
    res.json({ ...report, metrics: report.summary, summary });
  })
);
router.get(
  '/utilization',
  route(async (req, res) => {
    const spec = reporting.parseReportQuery({ ...req.query, view: 'utilization' });
    const report = reporting.analysis(req.user, spec);
    if (await download(req, res, spec, report)) return;
    res.json({
      ...report,
      workingDays: report.capacity.working_days,
      expectedHours: report.capacity.expected_hours_per_person,
    });
  })
);
for (const path of ['/project-hours', '/project-hours-detail'])
  router.get(
    path,
    route(async (req, res) => {
      const spec = reporting.parseReportQuery({ ...req.query, view: 'projects' });
      const report = reporting.analysis(req.user, spec);
      if (await download(req, res, spec, report)) return;
      res.json(report);
    })
  );

module.exports = router;
