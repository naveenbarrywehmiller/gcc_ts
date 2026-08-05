import { useState, useEffect, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { LoadingSkeleton } from '../components/ui/Skeleton';
import {
  BarChart3, Download, ChevronDown, ChevronRight, Users, FolderKanban,
  Calendar, Search, Filter, FileText, Clock
} from 'lucide-react';

// ── Date helpers ────────────────────────────────────────────────────────────

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(d) {
  const day = d.getDay() || 7; // Sunday = 7
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  return monday;
}

function getPresetDates(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start, end;

  switch (preset) {
    case 'this-week': {
      const mon = getMonday(today);
      start = mon;
      end = new Date(mon);
      end.setDate(mon.getDate() + 6);
      break;
    }
    case 'this-month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'last-month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-3-months':
      start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    default:
      return null;
  }
  return { startDate: toISO(start), endDate: toISO(end) };
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const s = new Date(startDate);
  const e = new Date(endDate);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} — ${e.toLocaleDateString('en-US', opts)}`;
}

function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

// ── Main Reports component ──────────────────────────────────────────────────

export default function Reports() {
  const toast = useToast();
  const [tab, setTab] = useState('weekly');
  const [preset, setPreset] = useState('this-month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  // Initialize dates from preset
  useEffect(() => {
    if (preset === 'custom') return;
    const dates = getPresetDates(preset);
    if (dates) {
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  }, [preset]);

  const { data: filterData } = useQuery({
    queryKey: ['report-filters'],
    queryFn: async () => {
      const [dRes, uRes] = await Promise.all([
        api.get('/divisions'),
        api.get('/users'),
      ]);
      return { divisions: dRes.data.divisions, users: uRes.data.users };
    },
    staleTime: Infinity,
  });

  const divisions = filterData?.divisions || [];
  const users = filterData?.users || [];

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ['report', tab, startDate, endDate, divisionFilter, userFilter, statusFilter],
    queryFn: async () => {
      if (tab === 'projects') {
        let params = `start_date=${startDate}&end_date=${endDate}`;
        if (divisionFilter) params += `&division=${divisionFilter}`;
        if (userFilter) params += `&user_id=${userFilter}`;
        if (statusFilter) params += `&status=${statusFilter}`;
        const res = await api.get(`/reports/project-hours-detail?${params}`);
        return res.data;
      }

      const year = new Date(startDate).getFullYear();
      const month = new Date(startDate).getMonth() + 1;
      let endpoint, params;

      if (tab === 'weekly') {
        endpoint = '/reports/weekly-summary';
        params = `month=${month}&year=${year}`;
        if (divisionFilter) params += `&division=${divisionFilter}`;
        if (userFilter) params += `&user_id=${userFilter}`;
        if (statusFilter) params += `&status=${statusFilter}`;
      } else {
        endpoint = '/reports/utilization';
        params = `month=${month}&year=${year}`;
        if (divisionFilter) params += `&division=${divisionFilter}`;
      }

      const res = await api.get(`${endpoint}?${params}`);
      return res.data;
    },
    enabled: !!startDate && !!endDate,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load report');
  }, [isError, toast]);

  // ── Export ────────────────────────────────────────────────────────────────

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
  };

  const handleExport = async (format) => {
    try {
      let endpoint = '';
      let params = '';
      let filename = `report_${startDate}_to_${endDate}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      
      if (tab === 'projects') {
        endpoint = '/reports/project-hours-detail';
        params = `start_date=${startDate}&end_date=${endDate}`;
        if (divisionFilter) params += `&division=${divisionFilter}`;
        if (userFilter) params += `&user_id=${userFilter}`;
        if (statusFilter) params += `&status=${statusFilter}`;
        filename = `project_hours_${startDate}_to_${endDate}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      } else {
        endpoint = '/reports/export';
        const year = new Date(startDate).getFullYear();
        const month = new Date(startDate).getMonth() + 1;
        params = `month=${month}&year=${year}`;
        if (divisionFilter) params += `&division=${divisionFilter}`;
        if (userFilter) params += `&user_id=${userFilter}`;
        if (statusFilter) params += `&status=${statusFilter}`;
        filename = `timesheet_report_${year}_${month}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      }

      const res = await api.get(`${endpoint}?${params}&format=${format}`, { responseType: 'blob' });
      triggerDownload(res.data, filename);
      toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} exported`);
    } catch {
      toast.error(`Failed to export ${format === 'excel' ? 'Excel' : 'PDF'}`);
    }
  };

  const exportToExcel = () => handleExport('excel');
  const exportToPDF = () => handleExport('pdf');

  // ── Presets ───────────────────────────────────────────────────────────────

  const presets = [
    { id: 'this-week', label: 'This Week' },
    { id: 'this-month', label: 'This Month' },
    { id: 'last-month', label: 'Last Month' },
    { id: 'last-3-months', label: 'Last 3 Months' },
    { id: 'custom', label: 'Custom' },
  ];

  const tabs = [
    { id: 'weekly', label: 'Weekly Summary', icon: Calendar },
    { id: 'utilization', label: 'Utilization', icon: Users },
    { id: 'projects', label: 'Project Hours', icon: FolderKanban },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-500" />
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} className="btn-secondary btn-sm">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportToPDF} className="btn-secondary btn-sm">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Date presets + custom range */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                preset === p.id
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-sm w-36"
            />
            <span className="text-surface-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-sm w-36"
            />
          </div>
        )}
        <span className="text-xs text-surface-400">
          <Clock className="w-3 h-3 inline mr-1" />
          {formatDateRange(startDate, endDate)}
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-surface-400" />
        <select className="input-sm w-36" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
          <option value="">All Divisions</option>
          {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        {(tab === 'weekly' || tab === 'projects') && (
          <>
            <select className="input-sm w-36" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="">All Users</option>
              {users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {tab !== 'projects' && (
              <select className="input-sm w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="recalled">Recalled</option>
              </select>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : tab === 'weekly' ? (
        <WeeklySummaryReport data={data} />
      ) : tab === 'utilization' ? (
        <UtilizationReport data={data} />
      ) : (
        <ProjectHoursReport data={data} startDate={startDate} endDate={endDate} />
      )}
    </div>
  );
}

// ── Weekly Summary (unchanged) ──────────────────────────────────────────────

function WeeklySummaryReport({ data }) {
  if (!data?.summary?.length) {
    return <div className="card p-8 text-center text-sm text-surface-400">No weekly summary data available</div>;
  }
  const userMap = {};
  data.summary.forEach(s => {
    if (!userMap[s.user_id]) userMap[s.user_id] = { name: s.user_name, email: s.email, division: s.division, weeks: {} };
    const key = `W${s.week_number}`;
    if (!userMap[s.user_id].weeks[key]) userMap[s.user_id].weeks[key] = { hours: 0, status: s.status, days: 0 };
    userMap[s.user_id].weeks[key].hours += s.total_hours;
    userMap[s.user_id].weeks[key].days += s.days_worked;
    userMap[s.user_id].weeks[key].status = s.status;
  });
  const weekSet = new Set();
  data.summary.forEach(s => weekSet.add(`W${s.week_number}`));
  const weeks = [...weekSet].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const users = Object.values(userMap);

  return (
    <div className="table-container">
      <table className="w-full">
        <thead>
          <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
            <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase sticky left-0 bg-surface-50 dark:bg-surface-800/50">Employee</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Division</th>
            {weeks.map(w => <th key={w} className="text-center px-3 py-3 text-xs font-semibold text-surface-500 uppercase">{w}</th>)}
            <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
          {users.map((u, i) => {
            const total = weeks.reduce((sum, w) => sum + (u.weeks[w]?.hours || 0), 0);
            return (
              <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-surface-900">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-surface-400">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-sm text-surface-500">{u.division || '—'}</td>
                {weeks.map(w => {
                  const wd = u.weeks[w];
                  return <td key={w} className="px-3 py-3 text-center">{wd ? <div><span className="text-sm font-semibold">{wd.hours.toFixed(1)}</span><div className="mt-0.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full badge-${wd.status}`}>{wd.status}</span></div></div> : <span className="text-xs text-surface-300">—</span>}</td>;
                })}
                <td className="px-4 py-3 text-right"><span className="text-sm font-bold text-brand-600 dark:text-brand-400">{total.toFixed(1)}h</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Utilization (unchanged) ─────────────────────────────────────────────────

function UtilizationReport({ data }) {
  if (!data?.utilization?.length) return <div className="card p-8 text-center text-sm text-surface-400">No utilization data available</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center"><p className="text-2xl font-bold">{data.utilization.length}</p><p className="text-xs text-surface-400">Employees</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold">{data.workingDays}</p><p className="text-xs text-surface-400">Working Days</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold">{data.expectedHours}h</p><p className="text-xs text-surface-400">Expected Hours</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-brand-600">{data.utilization.length > 0 ? Math.round(data.utilization.reduce((s, u) => s + u.utilization_pct, 0) / data.utilization.length) : 0}%</p><p className="text-xs text-surface-400">Avg Utilization</p></div>
      </div>
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase sticky left-0 bg-surface-50 dark:bg-surface-800/50">Employee</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Division</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Days</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Hours</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Expected</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase w-48">Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {data.utilization.map(u => (
              <tr key={u.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30">
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-surface-900"><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-surface-400">{u.email}</p></td>
                <td className="px-4 py-3 text-sm text-surface-500">{u.division || '—'}</td>
                <td className="px-4 py-3 text-sm text-right">{u.days_logged}</td>
                <td className="px-4 py-3 text-sm font-semibold text-right">{u.total_hours.toFixed(1)}</td>
                <td className="px-4 py-3 text-sm text-right text-surface-400">{u.expected_hours}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex-1 h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${u.utilization_pct >= 90 ? 'bg-emerald-500' : u.utilization_pct >= 70 ? 'bg-amber-500' : u.utilization_pct > 0 ? 'bg-red-500' : 'bg-surface-300'}`} style={{ width: `${Math.min(u.utilization_pct, 100)}%` }} /></div><span className="text-xs font-semibold w-10 text-right">{u.utilization_pct}%</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Project Hours Report (NEW — expandable per-user breakdown) ───────────────

function ProjectHoursReport({ data, startDate, endDate }) {
  const [expanded, setExpanded] = useState({});

  if (!data?.projects?.length) {
    return <div className="card p-8 text-center text-sm text-surface-400">No project data for {formatDateRange(startDate, endDate)}</div>;
  }

  const toggleExpand = (code) => {
    setExpanded(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const expandAll = () => {
    const all = {};
    data.projects.forEach(p => { all[p.project_code] = true; });
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  const anyExpanded = Object.values(expanded).some(Boolean);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-surface-900 dark:text-white">{data.projects.length}</p>
          <p className="text-xs text-surface-400">Projects</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-surface-900 dark:text-white">
            {new Set(data.projects.flatMap(p => p.contributors.map(c => c.user_id))).size}
          </p>
          <p className="text-xs text-surface-400">Contributors</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{data.grand_total_hours.toFixed(1)}</p>
          <p className="text-xs text-surface-400">Total Hours</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-surface-900 dark:text-white">{formatDateRange(startDate, endDate)}</p>
          <p className="text-xs text-surface-400">Period</p>
        </div>
      </div>

      {/* Expand / collapse all */}
      <div className="flex items-center gap-2">
        <button onClick={expandAll} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Expand All</button>
        <span className="text-surface-300">|</span>
        <button onClick={collapseAll} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Collapse All</button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
              <th className="w-8 px-2 py-3" />
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Project</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase hidden sm:table-cell">Division</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Contributors</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Hours</th>
              <th className="px-4 py-3 text-xs font-semibold text-surface-500 uppercase w-40 hidden sm:table-cell">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {data.projects.map(p => {
              const pct = data.grand_total_hours > 0 ? Math.round((p.total_hours / data.grand_total_hours) * 100) : 0;
              const isOpen = expanded[p.project_code];
              return (
                <Fragment key={p.project_code}>
                  {/* Project row */}
                  <tr
                    onClick={() => toggleExpand(p.project_code)}
                    className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-2 py-3 text-surface-400">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono font-semibold text-brand-600 dark:text-brand-400">{p.project_code}</p>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{p.project_name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">{p.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-surface-500 hidden sm:table-cell">{p.division || '—'}</td>
                    <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400 text-right">{p.contributors.length}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-surface-900 dark:text-white text-right">{p.total_hours.toFixed(1)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-brand-500 to-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-surface-500 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded contributor rows */}
                  {isOpen && p.contributors.map(c => (
                    <tr key={c.user_id} className="bg-surface-50/50 dark:bg-surface-800/20">
                      <td />
                      <td colSpan={2} className="px-4 py-2">
                        <div className="flex items-center gap-2 ml-6">
                          <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-800 flex items-center justify-center text-[10px] font-bold text-brand-600 dark:text-brand-300">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-surface-700 dark:text-surface-300">{c.name}</p>
                            <p className="text-[10px] text-surface-400">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 hidden sm:table-cell" />
                      <td className="px-4 py-2 text-xs text-surface-400 text-right">
                        {p.total_hours > 0 ? Math.round((c.hours / p.total_hours) * 100) : 0}% of project
                      </td>
                      <td className="px-4 py-2 text-xs font-semibold text-brand-600 dark:text-brand-400 text-right">{c.hours.toFixed(1)}h</td>
                      <td className="px-4 py-2 hidden sm:table-cell" />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surface-50 dark:bg-surface-800/30 border-t-2 border-surface-200 dark:border-surface-700">
              <td className="px-2 py-3" />
              <td colSpan={4} className="px-4 py-3 text-sm font-bold text-surface-700 dark:text-surface-300">Grand Total</td>
              <td className="px-4 py-3 text-sm font-bold text-brand-600 dark:text-brand-400 text-right">{data.grand_total_hours.toFixed(1)}h</td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
