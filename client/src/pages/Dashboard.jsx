import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { CardSkeleton } from '../components/ui/Skeleton';
import {
  Clock, Users, FolderKanban, ClipboardCheck, TrendingUp,
  BarChart3, AlertTriangle, RotateCcw, Calendar, Wifi
} from 'lucide-react';

function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  
  const { data, isLoading: loading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/reports/dashboard');
      return res.data;
    }
  });

  if (loading) return <CardSkeleton count={4} />;

  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const { week: currentWeek } = getISOWeekInfo(now);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Week {data?.stats?.currentWeek || currentWeek} • {monthName}
        </p>
      </div>

      {/* Recalled timesheets alert for employees */}
      {!isAdmin && data?.recalledWeeks?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Recalled Timesheets</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                The following timesheets have been recalled and need your attention:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {data.recalledWeeks.map((rw, i) => (
                  <Link
                    key={i}
                    to="/timesheet"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    <Calendar className="w-3 h-3" />
                    Week {rw.week_number}, {rw.week_year}
                    {rw.admin_comment && (
                      <span className="text-amber-500 ml-1">— {rw.admin_comment}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {isAdmin ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={FolderKanban} label="Projects" value={data?.stats?.totalProjects || 0}
            color="violet" desc="Active projects"
          />
          <StatCard
            icon={ClipboardCheck} label="Pending Approvals" value={data?.stats?.pendingApprovals || 0}
            color="amber" desc="Awaiting your review"
          />
          <StatCard
            icon={Clock} label="Week Hours" value={`${(data?.stats?.weeklyHours || 0).toFixed(1)}h`}
            color="emerald" desc={`Week ${data?.stats?.currentWeek || currentWeek}`}
          />
          <StatCard
            icon={BarChart3} label="Month Hours" value={`${(data?.stats?.monthlyHours || 0).toFixed(1)}h`}
            color="blue" desc={monthName}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Clock} label="This Week" value={`${(data?.stats?.weeklyHours || 0).toFixed(1)}h`}
            color="brand" desc={`Week ${data?.stats?.currentWeek || currentWeek}`}
          />
          <StatCard
            icon={BarChart3} label="This Month" value={`${(data?.stats?.monthlyHours || 0).toFixed(1)}h`}
            color="violet" desc={monthName}
          />
          <StatCard
            icon={TrendingUp} label="Entries" value={data?.stats?.totalEntries || 0}
            color="emerald" desc="Total this month"
          />
          <StatCard
            icon={ClipboardCheck} label="Week Status" value={getStatusSummary(data?.stats?.statusBreakdown)}
            color="amber" desc="Current week"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-4">
            {isAdmin ? 'Recent Submissions' : 'Recent Entries'}
          </h3>
          <div className="space-y-2">
            {isAdmin ? (
              data?.recentSubmissions?.length > 0 ? (
                data.recentSubmissions.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-semibold">
                        {item.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{item.name}</p>
                        <p className="text-xs text-surface-400">
                          {item.division} • Week {item.week_number}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-surface-900 dark:text-white">{item.total_hours?.toFixed(1)}h</p>
                      <span className={`badge-${item.status}`}>{item.status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-surface-400 py-4 text-center">No recent submissions</p>
              )
            ) : (
              data?.recentEntries?.length > 0 ? (
                data.recentEntries.slice(0, 8).map((entry, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                        {entry.project_code} — {entry.project_name}
                      </p>
                      <p className="text-xs text-surface-400">
                        {new Date(entry.work_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {entry.task_category && ` • ${entry.task_category}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-900 dark:text-white">{entry.hours}h</span>
                      <span className={`badge-${entry.status}`}>{entry.status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-surface-400 py-4 text-center">No entries yet this month</p>
              )
            )}
          </div>
        </div>

        {/* Hours breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-4">
            {isAdmin ? 'Hours by Division' : 'Hours by Project'}
          </h3>
          <div className="space-y-3">
            {isAdmin ? (
              data?.hoursByDivision?.length > 0 ? (
                data.hoursByDivision.map((item, i) => (
                  <HoursBar key={i} label={item.division || 'Unassigned'} hours={item.total_hours} maxHours={data.hoursByDivision[0]?.total_hours || 1} />
                ))
              ) : (
                <p className="text-sm text-surface-400 py-4 text-center">No data available</p>
              )
            ) : (
              data?.hoursByProject?.length > 0 ? (
                data.hoursByProject.map((item, i) => (
                  <HoursBar key={i} label={`${item.project_code}`} sublabel={item.project_name} hours={item.total_hours} maxHours={data.hoursByProject[0]?.total_hours || 1} />
                ))
              ) : (
                <p className="text-sm text-surface-400 py-4 text-center">No data available</p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, desc, live }) {
  const iconBg = {
    brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <div className="card p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {live && value > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-surface-900 dark:text-white">{value}</p>
      <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mt-0.5">{label}</p>
      <p className="text-[10px] text-surface-400 dark:text-surface-600 mt-1">{desc}</p>
    </div>
  );
}

function HoursBar({ label, sublabel, hours, maxHours }) {
  const pct = Math.round((hours / maxHours) * 100);
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>
          {sublabel && <span className="text-xs text-surface-400 ml-2">{sublabel}</span>}
        </div>
        <span className="text-sm font-semibold text-surface-900 dark:text-white">{hours.toFixed(1)}h</span>
      </div>
      <div className="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function getStatusSummary(breakdown) {
  if (!breakdown || breakdown.length === 0) return 'No entries';
  const map = {};
  breakdown.forEach(s => { map[s.status] = s.count; });
  if (map.recalled) return `${map.recalled} recalled`;
  if (map.approved) return `${map.approved} approved`;
  if (map.submitted) return `${map.submitted} submitted`;
  if (map.rejected) return `${map.rejected} rejected`;
  if (map.draft) return `${map.draft} drafts`;
  return 'No entries';
}
