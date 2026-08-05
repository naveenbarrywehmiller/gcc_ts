import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import {
  Shield, Search, Filter, ChevronLeft, ChevronRight, Clock,
  User, FileText, Calendar, RefreshCw
} from 'lucide-react';

const ACTION_COLORS = {
  LOGIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SUBMIT_TIMESHEET: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  APPROVE_TIMESHEET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECT_TIMESHEET: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ADMIN_RECALL_TIMESHEET: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  EMPLOYEE_RECALL_TIMESHEET: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CREATE_USER: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  UPDATE_USER: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  DELETE_USER: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  RESET_PASSWORD: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  PASSWORD_CHANGE: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  ASSIGN_DIVISIONS: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

const ACTION_ICONS = {
  LOGIN: User,
  SUBMIT_TIMESHEET: FileText,
  APPROVE_TIMESHEET: FileText,
  REJECT_TIMESHEET: FileText,
  ADMIN_RECALL_TIMESHEET: RefreshCw,
  EMPLOYEE_RECALL_TIMESHEET: RefreshCw,
  CREATE_USER: User,
  UPDATE_USER: User,
  DELETE_USER: User,
  RESET_PASSWORD: Shield,
  PASSWORD_CHANGE: Shield,
  ASSIGN_DIVISIONS: Shield,
};

export default function AuditLog() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0, limit: 30 });
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/audit/actions'),
      api.get('/users'),
    ]).then(([aRes, uRes]) => {
      setActions(aRes.data.actions);
      setUsers(uRes.data.users);
    }).catch(() => {});
  }, []);

  const loadLogs = (page = 1) => {
    setLoading(true);
    let params = `page=${page}&limit=${pagination.limit}`;
    if (actionFilter) params += `&action=${actionFilter}`;
    if (userFilter) params += `&user_id=${userFilter}`;
    if (searchQuery) params += `&search=${encodeURIComponent(searchQuery)}`;
    if (fromDate) params += `&from_date=${fromDate}`;
    if (toDate) params += `&to_date=${toDate}`;

    api.get(`/audit?${params}`)
      .then(res => {
        setLogs(res.data.logs);
        setPagination(res.data.pagination);
      })
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLogs(1); }, [actionFilter, userFilter, fromDate, toDate]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadLogs(1);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatAction = (action) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-brand-500" />
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">Audit Log</h1>
        <span className="text-xs text-surface-400 ml-2">
          {pagination.total} total entries
        </span>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search details, names..."
                className="input pl-9 text-sm"
                id="audit-search"
              />
            </div>
          </form>

          {/* Action filter */}
          <div className="w-44">
            <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Action</label>
            <select className="input text-sm" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{formatAction(a)}</option>)}
            </select>
          </div>

          {/* User filter */}
          <div className="w-40">
            <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">User</label>
            <select className="input text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="w-36">
            <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">From</label>
            <input type="date" className="input text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="w-36">
            <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">To</label>
            <input type="date" className="input text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          {/* Clear */}
          <button
            onClick={() => { setActionFilter(''); setUserFilter(''); setSearchQuery(''); setFromDate(''); setToDate(''); }}
            className="btn-ghost btn-sm text-xs"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Logs table */}
      {loading ? (
        <LoadingSkeleton rows={10} cols={5} />
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400">No audit logs found</p>
          <p className="text-xs text-surface-400 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const IconComponent = ACTION_ICONS[log.action] || Shield;
            const colorClass = ACTION_COLORS[log.action] || 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400';

            return (
              <div key={log.id} className="card px-4 py-3 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                    <IconComponent className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
                            {formatAction(log.action)}
                          </span>
                          {log.user_name && (
                            <span className="text-xs text-surface-600 dark:text-surface-400 font-medium">
                              by {log.user_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-surface-700 dark:text-surface-300 mt-1 break-words">
                          {log.details}
                        </p>
                        {log.new_value && (
                          <p className="text-xs text-surface-400 mt-1 italic">
                            Comment: "{log.new_value}"
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-surface-400 whitespace-nowrap">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {formatDate(log.created_at)}
                        </p>
                        {log.ip_address && (
                          <p className="text-[10px] text-surface-400 mt-0.5">
                            IP: {log.ip_address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-surface-400">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadLogs(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="btn-ghost btn-sm p-1.5 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const startPage = Math.max(1, pagination.page - 2);
              const page = startPage + i;
              if (page > pagination.totalPages) return null;
              return (
                <button
                  key={page}
                  onClick={() => loadLogs(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === pagination.page
                      ? 'bg-brand-500 text-white'
                      : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => loadLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="btn-ghost btn-sm p-1.5 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
