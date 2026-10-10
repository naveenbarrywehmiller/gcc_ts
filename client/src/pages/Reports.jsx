import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  FileText,
  Calendar,
  Users,
  FolderKanban,
  AlertCircle,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../contexts/auth';
import { useToast } from '../contexts/toast';
import api from '../services/api';
import Modal from '../components/ui/Modal';
import { LoadingSkeleton } from '../components/ui/Skeleton';
import {
  presetDates,
  rangeError,
  displayDate,
  displayRange,
  reportParams,
} from '../utils/reportDates';
import detailFields from '../../../server/src/config/timesheetFields.json';

const tabs = [
  { id: 'weekly', label: 'Weekly Summary', icon: Calendar },
  { id: 'utilization', label: 'Utilization', icon: Users },
  { id: 'projects', label: 'Project Hours', icon: FolderKanban },
  { id: 'missing', label: 'Missing Hours', icon: AlertCircle },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];
const presets = [
  ['this-week', 'This Week'],
  ['this-month', 'This Month'],
  ['last-month', 'Last Month'],
  ['last-3-months', 'Last 3 Months'],
  ['custom', 'Custom'],
];
const emptyFilters = {
  division_id: '',
  user_id: '',
  project_id: '',
  customer: '',
  task_id: '',
  location_id: '',
  status: '',
  billing_type: '',
};
const hours = (value) => `${Number(value || 0).toFixed(1)}h`;
const pct = (value) => (value === null || value === undefined ? '—' : `${value}%`);
const th =
  'px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase whitespace-nowrap';
const td = 'px-4 py-3 text-sm align-top';
const linkStyle =
  'min-h-[44px] inline-flex items-center text-left text-brand-600 dark:text-brand-400 font-medium hover:underline';

function ErrorState({ message, retry }) {
  return (
    <div className="card p-5 space-y-3" role="alert">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {retry && (
        <button className="btn-secondary btn-sm" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}
function Empty({ children = 'No records match these filters.' }) {
  return (
    <div className="card p-6 text-center text-sm text-surface-500 dark:text-surface-400">
      {children}
    </div>
  );
}
function ReportTable({ headers, children, label }) {
  return (
    <div className="table-container" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full bg-white dark:bg-surface-900">
        <thead>
          <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
            {headers.map((h, i) => (
              <th scope="col" className={th} key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 dark:divide-surface-800">{children}</tbody>
      </table>
    </div>
  );
}
function Metric({ label, value, children, onClick }) {
  const content = (
    <>
      <p className="text-xs font-medium text-surface-500 dark:text-surface-400">{label}</p>
      <p className="mt-2 text-2xl font-bold break-words text-surface-900 dark:text-white">
        {value}
      </p>
      {children && (
        <div className="mt-2 text-xs text-surface-500 dark:text-surface-400">{children}</div>
      )}
    </>
  );
  return onClick ? (
    <button className="card p-4 text-left hover:border-brand-400" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="card p-4">{content}</div>
  );
}
function Statuses({ values }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(values)
        .filter(([, h]) => h > 0)
        .map(([status, h]) => (
          <span className={`badge-${status}`} key={status}>
            {status} {hours(h)}
          </span>
        ))}
    </div>
  );
}
function Rate({ value, coverage = false }) {
  if (value === null || value === undefined) return <span>—</span>;
  const color = coverage
    ? value >= 90
      ? 'bg-emerald-500'
      : value >= 70
        ? 'bg-amber-500'
        : 'bg-red-500'
    : 'bg-brand-600';
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div
        className="flex-1 h-2 rounded bg-surface-100 dark:bg-surface-800 overflow-hidden"
        aria-hidden="true"
      >
        <div className={`h-full rounded ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold whitespace-nowrap">{pct(value)}</span>
    </div>
  );
}
function Billing({ summary }) {
  const items = [
    ['Billable', summary.billable_hours, 'bg-brand-600'],
    ['Non-billable', summary.non_billable_hours, 'bg-violet-500'],
    ['Unclassified', summary.unclassified_hours, 'bg-surface-400'],
  ];
  return (
    <section className="card p-4 space-y-4" aria-label="Billing breakdown">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map(([label, value, color]) => (
          <div className="flex items-center gap-2 min-w-0" key={label}>
            <span className={`w-3 h-3 rounded shrink-0 ${color}`} aria-hidden="true" />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
              <p className="text-lg font-semibold">
                {hours(value)}{' '}
                <span className="text-xs font-normal text-surface-500 dark:text-surface-400">
                  ({summary.total_hours ? Math.round((value / summary.total_hours) * 100) : 0}%)
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex h-3 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden"
        aria-hidden="true"
      >
        {items.map(([label, value, color]) => (
          <div
            key={label}
            className={color}
            style={{ width: `${summary.total_hours ? (value / summary.total_hours) * 100 : 0}%` }}
          />
        ))}
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400">
        Billing uses task classification, then project billing type. Historical hours without a
        classification stay Unclassified.
      </p>
    </section>
  );
}
function FilterSelect({ label, value, onChange, children }) {
  const plural =
    label === 'Employee'
      ? 'employees'
      : label === 'Billing'
        ? 'billing types'
        : label === 'Status'
          ? 'statuses'
          : `${label.toLowerCase()}s`;
  return (
    <label className="block min-w-0">
      <span className="block text-xs text-surface-500 dark:text-surface-400 mb-1">{label}</span>
      <select
        className="input-sm w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        <option value="">All {plural}</option>
        {children}
      </select>
    </label>
  );
}

export default function Reports() {
  const { user } = useAuth(),
    toast = useToast();
  const [tab, setTab] = useState('weekly'),
    [preset, setPreset] = useState('this-month');
  const [dates, setDates] = useState(() => presetDates('this-month'));
  const [filters, setFilters] = useState(emptyFilters),
    [grain, setGrain] = useState('week');
  const [exporting, setExporting] = useState(''),
    [drill, setDrill] = useState(null),
    [moreFilters, setMoreFilters] = useState(false);
  const invalidRange = rangeError(dates.start_date, dates.end_date);
  const params = reportParams({ ...dates, ...filters, grain });
  const options = useQuery({
    queryKey: ['report-options', user.id, user.role],
    queryFn: async ({ signal }) => (await api.get('/reports/options', { signal })).data,
    staleTime: 60000,
  });
  const report = useQuery({
    queryKey: ['report-analysis', user.id, user.role, params],
    queryFn: async ({ signal }) => (await api.get('/reports/analysis', { params, signal })).data,
    enabled: !invalidRange,
  });
  const data = report.data;
  const changeFilter = (key, value) =>
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'division_id' ? { user_id: '', location_id: '' } : {}),
    }));
  const openEntries = (title, extra = {}) =>
    setDrill({ title, params: reportParams({ ...params, ...extra }) });
  const selectPreset = (value) => {
    setPreset(value);
    if (value !== 'custom') setDates(presetDates(value));
  };
  const download = async (format, extra = {}, view = tab) => {
    setExporting(format);
    try {
      const res = await api.get('/reports/export', {
        params: { ...params, ...extra, view, format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${view}_${extra.start_date || dates.start_date}_to_${extra.end_date || dates.end_date}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} exported`);
    } catch {
      toast.error(`Failed to export ${format === 'excel' ? 'Excel' : 'PDF'}`);
    } finally {
      setExporting('');
    }
  };
  const available = options.data || {};
  const matchingUsers = (available.users || []).filter(
    (u) => !filters.division_id || String(u.division_id) === filters.division_id
  );
  const matchingLocations = (available.locations || []).filter(
    (s) => !filters.division_id || String(s.division_id) === filters.division_id
  );
  const advancedCount = ['customer', 'task_id', 'location_id', 'billing_type'].filter(
    (key) => filters[key]
  ).length;
  return (
    <div className="space-y-5 animate-fade-in min-w-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="w-5 h-5 text-brand-500" />
            Reports
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Team time, billing, capacity and submission gaps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary btn-sm"
            disabled={!!invalidRange || !data || report.isFetching || !!exporting}
            onClick={() => download('excel')}
          >
            <Download className="w-4 h-4" />
            {exporting === 'excel' ? 'Exporting…' : 'Excel'}
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={!!invalidRange || !data || report.isFetching || !!exporting}
            onClick={() => download('pdf')}
          >
            <FileText className="w-4 h-4" />
            {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>
      <section className="card p-4 space-y-4" aria-label="Report dates and filters">
        <div className="flex flex-wrap gap-1">
          {presets.map(([id, label]) => (
            <button
              className={`btn btn-sm ${preset === id ? 'bg-brand-600 text-white' : 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300'}`}
              aria-pressed={preset === id}
              key={id}
              onClick={() => selectPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 max-w-xl gap-3">
            <label className="text-xs text-surface-500 dark:text-surface-400">
              Start date
              <input
                type="date"
                className="input mt-1"
                aria-label="Report start date"
                min="1900-01-01"
                max="9998-12-31"
                value={dates.start_date}
                onChange={(e) =>
                  setDates((previous) => ({ ...previous, start_date: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-surface-500 dark:text-surface-400">
              End date
              <input
                type="date"
                className="input mt-1"
                aria-label="Report end date"
                min="1900-01-01"
                max="9998-12-31"
                value={dates.end_date}
                onChange={(e) =>
                  setDates((previous) => ({ ...previous, end_date: e.target.value }))
                }
              />
            </label>
          </div>
        )}
        <p className="text-sm text-surface-600 dark:text-surface-300" aria-live="polite">
          {invalidRange || displayRange(dates.start_date, dates.end_date)}
        </p>
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <span className="flex gap-2 items-center text-xs font-semibold text-surface-500 dark:text-surface-400">
            <Filter className="w-4 h-4" />
            Filters
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setFilters(emptyFilters)}>
            <RotateCcw className="w-3 h-3" />
            Reset filters
          </button>
        </div>
        {options.isPending && (
          <p className="text-xs text-surface-500 dark:text-surface-400" role="status">
            Loading filters…
          </p>
        )}
        {options.isError ? (
          <ErrorState message="Could not load report filters." retry={options.refetch} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <FilterSelect
                label="Division"
                value={filters.division_id}
                onChange={(v) => changeFilter('division_id', v)}
              >
                {(available.divisions || []).map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                    {!d.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Employee"
                value={filters.user_id}
                onChange={(v) => changeFilter('user_id', v)}
              >
                {matchingUsers.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                    {!u.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Project"
                value={filters.project_id}
                onChange={(v) => changeFilter('project_id', v)}
              >
                {(available.projects || []).map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.project_code} — {p.project_name}
                    {!p.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(v) => changeFilter('status', v)}
              >
                {['draft', 'submitted', 'approved', 'rejected', 'recalled'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </FilterSelect>
            </div>
            <button
              className="btn-ghost btn-sm"
              aria-label="More report filters"
              aria-expanded={moreFilters}
              aria-controls="advanced-report-filters"
              onClick={() => setMoreFilters((value) => !value)}
            >
              {moreFilters ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              More filters{advancedCount > 0 ? ` (${advancedCount} active)` : ''}
            </button>
            {moreFilters && (
              <div
                id="advanced-report-filters"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                <FilterSelect
                  label="Customer"
                  value={filters.customer}
                  onChange={(v) => changeFilter('customer', v)}
                >
                  {(available.customers || []).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label="Task"
                  value={filters.task_id}
                  onChange={(v) => changeFilter('task_id', v)}
                >
                  {(available.tasks || []).map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.task_category}
                      {!t.active ? ' (inactive)' : ''}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label="Location"
                  value={filters.location_id}
                  onChange={(v) => changeFilter('location_id', v)}
                >
                  {matchingLocations.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                      {!s.active ? ' (inactive)' : ''}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label="Billing"
                  value={filters.billing_type}
                  onChange={(v) => changeFilter('billing_type', v)}
                >
                  {['Billable', 'Non-Billable', 'Unclassified'].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </FilterSelect>
              </div>
            )}
          </>
        )}
      </section>
      <div
        className="flex flex-wrap gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-800"
        aria-label="Report views"
      >
        {tabs.map((t) => (
          <button
            className={`btn btn-sm ${tab === t.id ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-white' : 'text-surface-600 dark:text-surface-300'}`}
            aria-pressed={tab === t.id}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>
      {invalidRange ? (
        <ErrorState message={invalidRange} />
      ) : report.isError ? (
        <ErrorState
          message={report.error?.response?.data?.error || 'Failed to load report.'}
          retry={report.refetch}
        />
      ) : report.isLoading ? (
        <LoadingSkeleton />
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Metric
                label="Total hours"
                value={hours(data.summary.total_hours)}
                onClick={() => openEntries('All matching entries')}
              >
                {data.summary.employees} active users in the employee selection
              </Metric>
              <Metric
                label="Approved hours"
                value={hours(data.summary.approved_hours)}
                onClick={
                  data.summary.approved_hours > 0
                    ? () => openEntries('Approved entries', { status: 'approved' })
                    : undefined
                }
              >
                Approved time in the selected range
              </Metric>
              <Metric
                label="Pending approval"
                value={hours(data.summary.pending_hours)}
                onClick={
                  data.summary.pending_hours > 0
                    ? () => openEntries('Submitted entries', { status: 'submitted' })
                    : undefined
                }
              >
                Submitted time awaiting approval
              </Metric>
              <Metric
                label={
                  data.capacity.available
                    ? 'No entries through today'
                    : 'No matching entries through today'
                }
                value={data.summary.no_entries}
                onClick={() => setTab('missing')}
              >
                Active users ·{' '}
                {data.period.expected_through
                  ? `through ${displayDate(data.period.expected_through)}`
                  : 'selected range has not started'}
              </Metric>
            </div>
            <Billing summary={data.summary} />
            {tab === 'weekly' && <WeeklyReport data={data.weekly} openEntries={openEntries} />}
            {tab === 'utilization' && <UtilizationReport data={data} openEntries={openEntries} />}
            {tab === 'projects' && (
              <ProjectReport key={JSON.stringify(params)} data={data} openEntries={openEntries} />
            )}
            {tab === 'missing' && <MissingReport data={data} openEntries={openEntries} />}
            {tab === 'trends' && (
              <TrendsReport
                data={data}
                grain={grain}
                setGrain={setGrain}
                openEntries={openEntries}
              />
            )}
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Downloads contain the selected report view, its totals and filters. Excel also
              includes underlying entries and weekly details.
            </p>
          </>
        )
      )}
      <EntryDetails
        drill={drill}
        close={() => setDrill(null)}
        user={user}
        exportEntries={(format) => download(format, drill.params, 'details')}
        exporting={exporting}
      />
    </div>
  );
}

function WeeklyReport({ data, openEntries }) {
  if (!data.rows.length) return <Empty />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-surface-500 dark:text-surface-400">
        Weeks use ISO year and week number. Select hours to see entries; each status is shown
        separately.
      </p>
      <ReportTable
        label="Weekly hours"
        headers={['Employee', 'Division', ...data.weeks.map((w) => w.key), 'Total']}
      >
        {data.rows.map((u) => (
          <tr key={u.user_id}>
            <td className={`${td} min-w-[170px]`}>
              <button
                className={linkStyle}
                onClick={() => openEntries(`${u.name} — entries`, { user_id: u.user_id })}
              >
                {u.name}
              </button>
              <p className="text-xs text-surface-500 dark:text-surface-400 break-all">{u.email}</p>
            </td>
            <td className={td}>{u.division || '—'}</td>
            {data.weeks.map((w) => (
              <td key={w.key} className={`${td} min-w-[150px]`}>
                {u.weeks[w.key] ? (
                  <>
                    <button
                      className={linkStyle}
                      onClick={() =>
                        openEntries(`${u.name} — ${w.key}`, {
                          user_id: u.user_id,
                          start_date: w.start_date,
                          end_date: w.end_date,
                        })
                      }
                    >
                      {hours(u.weeks[w.key].total_hours)}
                    </button>
                    <Statuses values={u.weeks[w.key].status_hours} />
                  </>
                ) : (
                  '—'
                )}
              </td>
            ))}
            <td className={`${td} font-semibold whitespace-nowrap`}>{hours(u.total_hours)}</td>
          </tr>
        ))}
        <tr className="font-semibold bg-surface-50 dark:bg-surface-800/50">
          <td className={td}>Grand Total</td>
          <td />
          {data.weeks.map((w) => (
            <td className={td} key={w.key}>
              {hours(w.total_hours)}
            </td>
          ))}
          <td className={td}>{hours(data.rows.reduce((s, u) => s + u.total_hours, 0))}</td>
        </tr>
      </ReportTable>
    </div>
  );
}
function CapacityNote({ data }) {
  return (
    <div className="card p-4 text-sm space-y-2">
      <p>
        {data.capacity.available
          ? `Targets cover ${data.capacity.working_days} working days through ${data.period.expected_through ? displayDate(data.period.expected_through) : 'the start of this range'}.`
          : data.capacity.reason}
      </p>
      <p className="text-xs text-surface-500 dark:text-surface-400">{data.capacity.note}</p>
    </div>
  );
}
function UtilizationReport({ data, openEntries }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric
          label="Expected per active user"
          value={data.capacity.available ? hours(data.capacity.expected_hours_per_person) : '—'}
        />
        <Metric label="Logged-hours coverage" value={pct(data.summary.coverage_pct)}>
          All logged time ÷ expected hours
        </Metric>
        <Metric label="Billable utilization" value={pct(data.summary.billable_utilization_pct)}>
          Billable time ÷ expected hours
        </Metric>
      </div>
      <CapacityNote data={data} />
      {!data.utilization.length ? (
        <Empty>
          No active users in this employee selection. Historical entries remain available in Weekly
          Summary and Project Hours.
        </Empty>
      ) : (
        <ReportTable
          label="Employee utilization"
          headers={[
            'Employee',
            'Division',
            'Days logged',
            'Logged hours',
            'Expected hours',
            'Coverage',
            'Billable utilization',
          ]}
        >
          {data.utilization.map((u) => (
            <tr key={u.id}>
              <td className={`${td} min-w-[170px]`}>
                <button
                  className={linkStyle}
                  disabled={!data.period.expected_through}
                  onClick={() =>
                    openEntries(`${u.name} — elapsed entries`, {
                      user_id: u.id,
                      end_date: data.period.expected_through || data.period.start_date,
                    })
                  }
                >
                  {u.name}
                </button>
                <p className="text-xs text-surface-500 dark:text-surface-400">{u.email}</p>
              </td>
              <td className={td}>{u.division || '—'}</td>
              <td className={td}>{u.days_logged}</td>
              <td className={`${td} whitespace-nowrap`}>{hours(u.total_hours)}</td>
              <td className={td}>{u.expected_hours === null ? '—' : hours(u.expected_hours)}</td>
              <td className={td}>
                <Rate value={u.utilization_pct} coverage />
              </td>
              <td className={td}>
                <Rate value={u.billable_utilization_pct} />
              </td>
            </tr>
          ))}
        </ReportTable>
      )}
    </div>
  );
}
function ProjectReport({ data, openEntries }) {
  const [expanded, setExpanded] = useState({});
  const keyOf = (p) => p.project_id || 'no-project';
  const projectFilter = (p) => (p.project_id ? { project_id: p.project_id } : { projectless: '1' });
  if (!data.projects.length) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {data.projects.length} projects ·{' '}
          {new Set(data.projects.flatMap((p) => p.contributors.map((c) => c.user_id))).size}{' '}
          contributors
        </p>
        <div className="flex gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              setExpanded(Object.fromEntries(data.projects.map((p) => [keyOf(p), true])))
            }
          >
            Expand all
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setExpanded({})}>
            Collapse all
          </button>
        </div>
      </div>
      <ReportTable
        label="Project hours and contributors"
        headers={['Project', 'Customer', 'Division', 'Contributors', 'Hours', 'Share', 'Entries']}
      >
        {data.projects.map((p) => (
          <Fragment key={keyOf(p)}>
            <tr>
              <td className={`${td} min-w-[220px]`}>
                <button
                  className={`${linkStyle} gap-2`}
                  aria-expanded={!!expanded[keyOf(p)]}
                  aria-label={`Contributors for ${p.project_code}`}
                  onClick={() =>
                    setExpanded((previous) => ({ ...previous, [keyOf(p)]: !previous[keyOf(p)] }))
                  }
                >
                  {expanded[keyOf(p)] ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  {p.project_code}
                </button>
                <p className="text-xs text-surface-500 dark:text-surface-400">{p.project_name}</p>
              </td>
              <td className={td}>{p.customer_name || '—'}</td>
              <td className={td}>{p.division || '—'}</td>
              <td className={td}>{p.contributors.length}</td>
              <td className={`${td} font-semibold whitespace-nowrap`}>{hours(p.total_hours)}</td>
              <td className={td}>
                {data.summary.total_hours
                  ? Math.round((p.total_hours / data.summary.total_hours) * 100)
                  : 0}
                %
              </td>
              <td className={td}>
                <button
                  className={linkStyle}
                  aria-label={`View entries for ${p.project_code}`}
                  onClick={() => openEntries(`${p.project_code} — entries`, projectFilter(p))}
                >
                  View entries
                </button>
              </td>
            </tr>
            {expanded[keyOf(p)] &&
              p.contributors.map((c) => (
                <tr className="bg-surface-50 dark:bg-surface-800/40" key={c.user_id}>
                  <td colSpan={4} className={`${td} pl-8`}>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{c.email}</p>
                  </td>
                  <td className={td}>{hours(c.hours)}</td>
                  <td className={td}>
                    {p.total_hours ? Math.round((c.hours / p.total_hours) * 100) : 0}% of project
                  </td>
                  <td className={td}>
                    <button
                      className={linkStyle}
                      aria-label={`View ${c.name} entries for ${p.project_code}`}
                      onClick={() =>
                        openEntries(`${c.name} — ${p.project_code}`, {
                          ...projectFilter(p),
                          user_id: c.user_id,
                        })
                      }
                    >
                      View entries
                    </button>
                  </td>
                </tr>
              ))}
          </Fragment>
        ))}
        <tr className="font-semibold bg-surface-50 dark:bg-surface-800/50">
          <td colSpan={4} className={td}>
            Grand Total
          </td>
          <td className={td}>{hours(data.summary.total_hours)}</td>
          <td colSpan={2} />
        </tr>
      </ReportTable>
    </div>
  );
}
function MissingReport({ data, openEntries }) {
  return (
    <div className="space-y-4">
      <CapacityNote data={data} />
      {!data.capacity.available ? (
        <Empty>{data.capacity.reason}</Empty>
      ) : !data.missing.length ? (
        <Empty>No missing hours or unsubmitted time through the selected elapsed date.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="Users needing attention" value={data.missing.length} />
            <Metric
              label="Daily hours shortfall"
              value={hours(data.missing.reduce((s, u) => s + u.missing_hours, 0))}
            />
            <Metric
              label="Unsubmitted hours"
              value={hours(data.missing.reduce((s, u) => s + u.unsubmitted_hours, 0))}
            >
              Draft, rejected and recalled time
            </Metric>
          </div>
          <ReportTable
            label="Missing hours and submissions"
            headers={[
              'Employee',
              'Expected',
              'Logged',
              'Missing hours',
              'Unsubmitted',
              'Submission gaps',
              'Dates',
            ]}
          >
            {data.missing.map((u) => (
              <tr key={u.user_id}>
                <td className={`${td} min-w-[170px]`}>
                  <button
                    className={linkStyle}
                    onClick={() => openEntries(`${u.name} — entries`, { user_id: u.user_id })}
                  >
                    {u.name}
                  </button>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    {u.division || '—'}
                  </p>
                </td>
                <td className={`${td} whitespace-nowrap`}>{hours(u.expected_hours)}</td>
                <td className={`${td} whitespace-nowrap`}>{hours(u.logged_hours)}</td>
                <td
                  className={`${td} font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap`}
                >
                  {hours(u.missing_hours)}
                </td>
                <td className={`${td} whitespace-nowrap`}>{hours(u.unsubmitted_hours)}</td>
                <td className={`${td} min-w-[150px]`}>
                  {u.awaiting_submission_weeks.join(', ') || '—'}
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    Completed weeks only
                  </p>
                </td>
                <td className={`${td} min-w-[200px]`}>
                  <details>
                    <summary className="cursor-pointer min-h-[44px] flex items-center text-brand-600 dark:text-brand-400">
                      {u.missing_dates.length} missing · {u.short_dates.length} short days
                    </summary>
                    <ul className="text-xs space-y-1 mt-2">
                      {u.missing_dates.map((d) => (
                        <li key={d}>{displayDate(d)} — no hours</li>
                      ))}
                      {u.short_dates.map((d) => (
                        <li key={d}>{displayDate(d)} — below 8h</li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </ReportTable>
        </>
      )}
    </div>
  );
}
function TrendsReport({ data, grain, setGrain, openEntries }) {
  const previous = data.comparison.summary;
  const max = Math.max(1, ...data.trends.map((t) => t.total_hours));
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Compared with the previous period</h2>
        <p className="text-xs text-surface-500 dark:text-surface-400">
          {displayRange(data.comparison.period.start_date, data.comparison.period.end_date)} ·{' '}
          {data.comparison.note}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            ['Total hours', hours(data.summary.total_hours), hours(previous.total_hours)],
            ['Billable hours', hours(data.summary.billable_hours), hours(previous.billable_hours)],
            ['Coverage', pct(data.summary.coverage_pct), pct(previous.coverage_pct)],
            [
              'Billable utilization',
              pct(data.summary.billable_utilization_pct),
              pct(previous.billable_utilization_pct),
            ],
          ].map(([label, current, old]) => (
            <div key={label}>
              <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
              <p className="text-xl font-bold mt-1">{current}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Previous: {old}</p>
            </div>
          ))}
        </div>
        <p className="text-sm">
          Hours change:{' '}
          {data.comparison.hours_change_pct === null
            ? 'No previous hours to compare'
            : `${data.comparison.hours_change_pct > 0 ? '+' : ''}${data.comparison.hours_change_pct}%`}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Hours over time</h2>
        <label className="flex flex-wrap items-center gap-2 text-xs">
          Group by
          <select
            aria-label="Trend grouping"
            className="input-sm w-auto"
            value={grain}
            onChange={(e) => setGrain(e.target.value)}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>
      <div className="card p-4 space-y-3" aria-label="Hours trend chart">
        {data.trends.map((t) => (
          <div
            className="grid grid-cols-1 sm:grid-cols-[100px_1fr_80px] gap-1 sm:gap-3 items-center"
            key={t.key}
          >
            <button
              className={`${linkStyle} text-xs`}
              onClick={() =>
                openEntries(`${t.key} — entries`, {
                  start_date: t.start_date,
                  end_date: t.end_date,
                })
              }
            >
              {t.key}
            </button>
            <div
              className="h-5 rounded bg-surface-100 dark:bg-surface-800 overflow-hidden"
              aria-hidden="true"
            >
              <div
                className="h-full bg-brand-600 rounded"
                style={{ width: `${(t.total_hours / max) * 100}%` }}
              />
            </div>
            <span className="text-xs sm:text-right">{hours(t.total_hours)}</span>
          </div>
        ))}
      </div>
      <ReportTable
        label="Trend totals"
        headers={[
          'Period',
          'Hours',
          'Billable',
          'Non-billable',
          'Unclassified',
          'Approved',
          'Coverage',
          'Billable utilization',
        ]}
      >
        {data.trends.map((t) => (
          <tr key={t.key}>
            <td className={`${td} whitespace-nowrap`}>
              <button
                className={linkStyle}
                onClick={() =>
                  openEntries(`${t.key} — entries`, {
                    start_date: t.start_date,
                    end_date: t.end_date,
                  })
                }
              >
                {t.key}
              </button>
            </td>
            <td className={td}>{hours(t.total_hours)}</td>
            <td className={td}>{hours(t.billable_hours)}</td>
            <td className={td}>{hours(t.non_billable_hours)}</td>
            <td className={td}>{hours(t.unclassified_hours)}</td>
            <td className={td}>{hours(t.approved_hours)}</td>
            <td className={td}>{pct(t.coverage_pct)}</td>
            <td className={td}>{pct(t.billable_utilization_pct)}</td>
          </tr>
        ))}
      </ReportTable>
      <CapacityNote data={data} />
    </div>
  );
}

function EntryDetails({ drill, close, user, exportEntries, exporting }) {
  return (
    <Modal
      isOpen={!!drill}
      onClose={close}
      title={drill?.title || 'Report entries'}
      size="full"
      footer={
        <>
          <button
            className="btn-secondary btn-sm"
            disabled={!drill || !!exporting}
            onClick={() => exportEntries('excel')}
          >
            Export entries to Excel
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={!drill || !!exporting}
            onClick={() => exportEntries('pdf')}
          >
            Export entries to PDF
          </button>
          <button className="btn-secondary btn-sm" onClick={close}>
            Close
          </button>
        </>
      }
    >
      {drill && <EntryPage key={JSON.stringify(drill.params)} drill={drill} user={user} />}
    </Modal>
  );
}
function EntryPage({ drill, user }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['report-entries', user.id, user.role, drill.params, page],
    queryFn: async ({ signal }) =>
      (await api.get('/reports/entries', { params: { ...drill.params, page }, signal })).data,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-500 dark:text-surface-400">
        {displayRange(drill.params.start_date, drill.params.end_date)}
      </p>
      {query.isLoading ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message="Could not load entries." retry={query.refetch} />
      ) : (
        <>
          <p className="text-sm">{query.data.total} matching entries</p>
          {!query.data.data.length ? (
            <Empty>No entries in this selection.</Empty>
          ) : (
            <div className="space-y-3">
              {query.data.data.map((r) => (
                <article className="card p-4 space-y-3" key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{r.employee_name}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {displayDate(r.work_date)} · {r.week_year}-W
                        {String(r.week_number).padStart(2, '0')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-bold">{hours(r.hours)}</span>
                      <span className={`badge-${r.status}`}>{r.status}</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    {[
                      [
                        'Project',
                        `${r.project_code || 'No project'}${r.project_name ? ` — ${r.project_name}` : ''}`,
                      ],
                      ['Task', r.task_category],
                      ['Customer', r.customer_name],
                      ['Employee division', r.employee_division],
                      ['Location', r.subdivision_name],
                      ['Billing', r.classification],
                    ].map(([label, value]) => (
                      <div className="min-w-0" key={label}>
                        <dt className="text-surface-500 dark:text-surface-400">{label}</dt>
                        <dd className="mt-1 break-words">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                  {r.project_description && (
                    <div>
                      <p className="text-xs text-surface-500 dark:text-surface-400">Description</p>
                      <p className="text-sm whitespace-pre-wrap break-words mt-1">
                        {r.project_description}
                      </p>
                    </div>
                  )}
                  {r.description && (
                    <div>
                      <p className="text-xs text-surface-500 dark:text-surface-400">Daily note</p>
                      <p className="text-sm whitespace-pre-wrap break-words mt-1">
                        {r.description}
                      </p>
                    </div>
                  )}
                  <WeeklyDetails json={r.details_json} />
                </article>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-surface-500 dark:text-surface-400">
              Page {page} of {Math.max(1, Math.ceil(query.data.total / query.data.page_size))}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-secondary btn-sm"
                disabled={page * query.data.page_size >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function WeeklyDetails({ json }) {
  let details;
  try {
    details = JSON.parse(json || '{}');
  } catch {
    return null;
  }
  const fields = detailFields.filter(
    (f) => details?.[f.key] !== null && details?.[f.key] !== undefined && details?.[f.key] !== ''
  );
  if (!fields.length) return null;
  return (
    <details>
      <summary className="text-xs cursor-pointer min-h-[44px] flex items-center text-brand-600 dark:text-brand-400">
        Weekly details
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-2">
        {fields.map((f) => (
          <div className="min-w-0" key={f.key}>
            <dt className="text-surface-500 dark:text-surface-400">{f.label}</dt>
            <dd className="mt-1 break-words">{String(details[f.key])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
