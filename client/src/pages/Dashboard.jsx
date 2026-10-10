import { useAuth } from '../contexts/auth';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { CardSkeleton } from '../components/ui/Skeleton';
import { weekLink } from '../utils/weekLink';
import {
  Clock, FolderKanban, ClipboardCheck, TrendingUp, ArrowRight,
  BarChart3, RotateCcw, Calendar, UserCheck, Hash, AlertCircle,
} from 'lucide-react';

const statusOrder = ['rejected', 'recalled', 'draft', 'submitted', 'approved'];
const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function Dashboard() {
  const { user, isAdmin, isManager } = useAuth();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: async () => (await api.get('/reports/dashboard')).data,
  });
  const { data: adminData, isPending: adminPending, isError: adminError } = useQuery({
    queryKey: ['my-admin'],
    queryFn: async () => (await api.get('/admin-ownership/my-admin')).data,
  });

  if (isPending) return <CardSkeleton count={4} />;
  if (isError) return (
    <div className="card p-6" role="alert">
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="w-5 h-5" />
        <h1 className="text-lg font-semibold">Unable to load dashboard</h1>
      </div>
      <p className="text-sm text-surface-600 dark:text-surface-300 mt-2">Your hours and approvals couldn’t be loaded. Please try again.</p>
      <button className="btn-primary mt-4" onClick={() => refetch()} disabled={isFetching}>
        <RotateCcw className="w-4 h-4" /> {isFetching ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );

  const stats = data.stats;
  const monthName = new Date(`${data.period.month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDescription = `Week ${stats.currentWeek} · ${formatDate(data.period.weekStartDate)}–${formatDate(data.period.weekEndDate)}`;
  const timesheetUrl = weekLink('/timesheet', stats.currentWeek, stats.currentWeekYear);
  const oldest = data.recentSubmissions?.[0];
  const approvalUrl = isAdmin
    ? weekLink('/admin/approvals', oldest?.week_number ?? stats.currentWeek, oldest?.week_year ?? stats.currentWeekYear)
    : '/manager/approvals';
  const weeklyHours = stats.weeklyHours ?? 0;
  const expectedHours = stats.expectedWeeklyHours ?? 0;
  const completion = expectedHours > 0 ? Math.round(weeklyHours / expectedHours * 100) : null;
  const breakdown = isAdmin ? data.hoursByDivision : data.hoursByProject;
  const scopeLabel = user.role === 'system admin' ? 'All divisions' : 'Assigned divisions';
  const maxHours = Math.max(1, ...(breakdown ?? []).map(item => item.total_hours));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-white break-words">Welcome back, {user?.name} 👋</h1>
          <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">{weekDescription} · {stats.currentWeekYear}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-surface-500 dark:text-surface-400">
            {user?.employee_id && <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />Employee ID: {user.employee_id}</span>}
            <span className="inline-flex items-center gap-1"><UserCheck className="w-3 h-3" />Admin: {adminPending ? 'Loading…' : adminError ? 'Unavailable' : adminData?.admin?.name ?? 'Not assigned'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={timesheetUrl} className={isAdmin || isManager ? 'btn-secondary' : 'btn-primary'}><Clock className="w-4 h-4" />Open Timesheet</Link>
          {(isAdmin || isManager) && <Link to={approvalUrl} className="btn-primary"><ClipboardCheck className="w-4 h-4" />Review Approvals</Link>}
        </div>
      </div>

      {!isAdmin && data.recalledWeeks?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Recalled timesheets need your attention</h2>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Open a week to review the feedback and update your entries.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {data.recalledWeeks.map((rw, i) => (
                  <Link key={`${rw.week_year}-${rw.week_number}-${i}`} to={weekLink('/timesheet', rw.week_number, rw.week_year)}
                    className="inline-flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 break-words">
                    <Calendar className="w-4 h-4 shrink-0" />Week {rw.week_number}, {rw.week_year}
                    {rw.admin_comment && <span className="font-normal">— {rw.admin_comment}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isManager && (
        <Link to="/manager/approvals" className="card p-5 flex flex-wrap items-center justify-between gap-3 hover:shadow-md transition-shadow">
          <div>
            <h2 className="font-semibold text-surface-900 dark:text-white">Team approvals</h2>
            <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">{data.teamPendingApprovals} pending timesheets · All weeks in your review scope</p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">Review team <ArrowRight className="w-4 h-4" /></span>
        </Link>
      )}

      {isManager && data.teamSummary && <section className="card p-4 sm:p-5">
        <h2 className="font-semibold">Assigned division summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 text-sm">
          <p><span className="block text-surface-500">Active people</span><strong>{data.teamSummary.totalRegistered}</strong></p>
          <p><span className="block text-surface-500">Team week hours</span><strong>{data.teamSummary.weeklyHours.toFixed(1)}h</strong></p>
          <p><span className="block text-surface-500">Team month hours</span><strong>{data.teamSummary.monthlyHours.toFixed(1)}h</strong></p>
        </div>
      </section>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isAdmin ? <>
          <StatCard icon={FolderKanban} label="Active projects" value={stats.totalProjects} color="violet" desc={scopeLabel} to="/admin/projects" />
          <StatCard icon={ClipboardCheck} label="Pending approvals" value={stats.pendingApprovals} color="amber" desc="Timesheets you can review · All weeks" to={approvalUrl} />
          <StatCard icon={Clock} label="Week hours" value={`${weeklyHours.toFixed(1)}h`} color="emerald" desc={`${scopeLabel} · Week ${stats.currentWeek}`} />
          <StatCard icon={BarChart3} label="Month hours" value={`${stats.monthlyHours.toFixed(1)}h`} color="blue" desc={`${scopeLabel} · ${monthName}`} />
        </> : <>
          <StatCard icon={Clock} label="This week" value={`${weeklyHours.toFixed(1)}h`} color="brand" desc={`Week ${stats.currentWeek}`} to={timesheetUrl} />
          <StatCard icon={BarChart3} label="This month" value={`${stats.monthlyHours.toFixed(1)}h`} color="violet" desc={monthName} />
          <StatCard icon={TrendingUp} label="Weekly completion" value={completion === null ? 'No target' : `${completion}%`} color="emerald"
            desc={expectedHours > 0 ? `${weeklyHours.toFixed(1)} of ${expectedHours}h · 8h weekdays, excluding holidays` : 'No working days this week'} to={timesheetUrl}>
            {completion !== null && <div role="progressbar" aria-label="Weekly completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, completion)} aria-valuetext={`${weeklyHours.toFixed(1)} of ${expectedHours} hours`} className="h-2 bg-surface-100 dark:bg-surface-800 rounded-full mt-3 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, completion)}%` }} /></div>}
          </StatCard>
          <StatCard icon={ClipboardCheck} label="Week status" color="amber" desc="Entry counts · Current week" to={timesheetUrl}>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {stats.statusBreakdown?.length ? [...stats.statusBreakdown].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)).map(item => (
                <span key={item.status} className={`badge-${item.status}`}>{item.count} {item.status}</span>
              )) : <span className="text-sm text-surface-500 dark:text-surface-400">No entries yet</span>}
            </div>
          </StatCard>
        </>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-surface-900 dark:text-white">{isAdmin ? 'Pending timesheets' : 'Recent entries'}</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{isAdmin ? 'Oldest weeks first · Up to 10 in your review scope' : 'Your latest entries across all weeks'}</p>
            </div>
            <Link to={isAdmin ? approvalUrl : timesheetUrl} className="text-sm font-medium text-brand-700 dark:text-brand-300">{isAdmin ? 'Review approvals' : 'Open timesheet'} →</Link>
          </div>
          <div className="space-y-2">
            {isAdmin ? (
              data.recentSubmissions?.length > 0 ? data.recentSubmissions.map(item => (
                <Link key={`${item.user_id}-${item.week_year}-${item.week_number}`} to={weekLink('/admin/approvals', item.week_number, item.week_year)}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 break-words">{item.name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{item.division || 'Unassigned'} · Week {item.week_number}, {item.week_year}</p>
                  </div>
                  <span className="flex items-center gap-2 shrink-0 text-sm font-semibold text-surface-900 dark:text-white">{item.total_hours.toFixed(1)}h <ArrowRight className="w-4 h-4 text-surface-500" /></span>
                </Link>
              )) : <p className="text-sm text-surface-500 dark:text-surface-400 py-6 text-center">You’re all caught up. No timesheets awaiting your review.</p>
            ) : (
              data.recentEntries?.length > 0 ? data.recentEntries.slice(0, 8).map(entry => (
                <Link key={entry.id} to={weekLink('/timesheet', entry.week_number, entry.week_year)}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 break-words">{entry.project_code ? `${entry.project_code} — ${entry.project_name}` : entry.task_category || 'Non-project task'}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{formatDate(entry.work_date)}{entry.task_category && entry.project_code ? ` · ${entry.task_category}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-surface-900 dark:text-white">{entry.hours}h</span><span className={`badge-${entry.status}`}>{entry.status}</span></div>
                </Link>
              )) : <div className="text-sm text-surface-500 dark:text-surface-400 py-6 text-center"><p>No entries yet.</p><Link to={timesheetUrl} className="inline-block mt-2 text-brand-700 dark:text-brand-300 font-medium">Add your first entry →</Link></div>
            )}
          </div>
        </section>

        <section className="card p-5 min-w-0">
          <h2 className="text-sm font-semibold text-surface-900 dark:text-white">{isAdmin ? 'Hours by division' : 'Hours by project'}</h2>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 mb-4">This month · {monthName}{isAdmin ? ` · ${scopeLabel}` : ' · Includes non-project time'}</p>
          <div className="space-y-4">
            {breakdown?.length > 0 ? breakdown.map((item, i) => (
              <HoursBar key={i} label={isAdmin ? item.division || 'Unassigned' : item.project_code} sublabel={isAdmin ? null : item.project_name} hours={item.total_hours} maxHours={maxHours} />
            )) : <p className="text-sm text-surface-500 dark:text-surface-400 py-6 text-center">No hours recorded this month.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, desc, to, children }) {
  const iconBg = {
    brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };
  const content = <>
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg[color]}`}><Icon className="w-5 h-5" /></div>
      {to && <ArrowRight className="w-4 h-4 text-surface-400" />}
    </div>
    {value !== undefined && <p className="text-2xl font-bold text-surface-900 dark:text-white">{value}</p>}
    <h2 className="text-sm font-medium text-surface-700 dark:text-surface-200 mt-1">{label}</h2>
    <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{desc}</p>
    {children}
  </>;
  return to ? <Link to={to} className="card p-5 hover:shadow-md transition-shadow duration-200">{content}</Link> : <div className="card p-5">{content}</div>;
}

function HoursBar({ label, sublabel, hours, maxHours }) {
  const pct = Math.min(100, Math.max(0, Math.round(hours / maxHours * 100)));
  return <div>
    <div className="flex items-start justify-between gap-3 mb-1.5">
      <div className="min-w-0 break-words"><span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>{sublabel && <p className="text-xs text-surface-500 dark:text-surface-400">{sublabel}</p>}</div>
      <span className="text-sm font-semibold text-surface-900 dark:text-white shrink-0">{hours.toFixed(1)}h</span>
    </div>
    <div className="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden" aria-hidden="true"><div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full" style={{ width: `${pct}%` }} /></div>
  </div>;
}
