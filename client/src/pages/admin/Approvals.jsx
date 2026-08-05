import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import {
  ChevronLeft, ChevronRight, Check, X, Clock, RotateCcw,
  MessageSquare, Calendar, Filter, Eye, ChevronDown, ChevronUp
} from 'lucide-react';

function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

function getWeekMonday(weekNum, year) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  return targetMonday;
}

function getWeekLabel(weekNum, year) {
  const mon = getWeekMonday(weekNum, year);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export default function AdminApprovals() {
  const toast = useToast();
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekInfo, setCurrentWeekInfo] = useState(() => getISOWeekInfo(new Date()));
  const [divisionFilter, setDivisionFilter] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userDetails, setUserDetails] = useState({});

  // Modal state
  const [actionModal, setActionModal] = useState({ open: false, type: '', userId: null, userName: '' });
  const [actionComment, setActionComment] = useState('');

  const { week, year } = currentWeekInfo;
  const weekLabel = getWeekLabel(week, year);

  useEffect(() => {
    api.get('/divisions').then(res => setDivisions(res.data.divisions)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api.get(`/timesheets/summary?week=${week}&year=${year}`)
      .then(res => setSummaries(res.data.summaries))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [week, year]);

  // Load user detail entries when expanded
  const toggleExpand = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (!userDetails[userId]) {
      try {
        const res = await api.get(`/timesheets/all?week=${week}&year=${year}&user_id=${userId}`);
        setUserDetails(prev => ({ ...prev, [userId]: res.data.entries }));
      } catch {
        toast.error('Failed to load details');
      }
    }
  };

  const openActionModal = (type, userId, userName) => {
    setActionModal({ open: true, type, userId, userName });
    setActionComment('');
  };

  const handleAction = async () => {
    const { type, userId } = actionModal;
    try {
      if (type === 'approve') {
        await api.post('/timesheets/approve', { user_id: userId, week, year, comment: actionComment || null });
        toast.success('Timesheet approved');
      } else if (type === 'reject') {
        await api.post('/timesheets/reject', { user_id: userId, week, year, comment: actionComment || null });
        toast.success('Timesheet rejected');
      } else if (type === 'recall') {
        await api.post('/timesheets/recall', { user_id: userId, week, year, comment: actionComment || null });
        toast.success('Timesheet recalled');
      }
      setActionModal({ open: false, type: '', userId: null, userName: '' });
      setActionComment('');
      setUserDetails({});
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    }
  };

  const prevWeek = () => {
    const mon = getWeekMonday(week, year);
    mon.setUTCDate(mon.getUTCDate() - 7);
    setCurrentWeekInfo(getISOWeekInfo(mon));
  };
  const nextWeek = () => {
    const mon = getWeekMonday(week, year);
    mon.setUTCDate(mon.getUTCDate() + 7);
    setCurrentWeekInfo(getISOWeekInfo(mon));
  };

  if (loading) return <LoadingSkeleton />;

  // Filter by division
  const filtered = divisionFilter
    ? summaries.filter(s => s.division === divisionFilter)
    : summaries;

  const submitted = filtered.filter(s => s.status === 'submitted');
  const approved = filtered.filter(s => s.status === 'approved');
  const rejected = filtered.filter(s => s.status === 'rejected');
  const recalled = filtered.filter(s => s.status === 'recalled');
  const drafts = filtered.filter(s => s.status === 'draft');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="btn-ghost btn-sm p-1.5"><ChevronLeft className="w-5 h-5" /></button>
          <div className="text-center min-w-[240px]">
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">Week {week}</h1>
            <p className="text-xs text-surface-500 dark:text-surface-400">{weekLabel}</p>
          </div>
          <button onClick={nextWeek} className="btn-ghost btn-sm p-1.5"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3">
          {/* Division filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400" />
            <select
              className="input-sm w-40"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              id="division-filter"
            >
              <option value="">All Divisions</option>
              {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          {/* Status summary badges */}
          <div className="flex items-center gap-2 text-xs">
            {submitted.length > 0 && <span className="badge-submitted">Pending: {submitted.length}</span>}
            {approved.length > 0 && <span className="badge-approved">Approved: {approved.length}</span>}
            {rejected.length > 0 && <span className="badge-rejected">Rejected: {rejected.length}</span>}
            {recalled.length > 0 && <span className="badge-recalled bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Recalled: {recalled.length}</span>}
            {drafts.length > 0 && <span className="badge-draft">Draft: {drafts.length}</span>}
          </div>
        </div>
      </div>

      {/* Pending approvals */}
      {submitted.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Pending Approval ({submitted.length})
          </h2>
          <div className="space-y-2">
            {submitted.map(s => (
              <div key={`${s.user_id}-submitted`}>
                <div className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-semibold">
                        {s.user_name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{s.user_name}</p>
                        <p className="text-xs text-surface-400">{s.email} • {s.division || 'No division'}</p>
                      </div>
                      <button
                        onClick={() => toggleExpand(s.user_id)}
                        className="btn-ghost btn-sm text-xs"
                        title="View details"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {expandedUser === s.user_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right mr-2">
                        <p className="text-lg font-bold text-surface-900 dark:text-white">{s.total_hours?.toFixed(1)}h</p>
                        <p className="text-xs text-surface-400">{s.days_worked} days</p>
                      </div>
                      <button onClick={() => openActionModal('approve', s.user_id, s.user_name)} className="btn-primary btn-sm" title="Approve">
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => openActionModal('reject', s.user_id, s.user_name)} className="btn-danger btn-sm" title="Reject">
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedUser === s.user_id && userDetails[s.user_id] && (
                    <div className="mt-4 pt-4 border-t border-surface-200 dark:border-surface-800">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-surface-400">
                            <th className="text-left pb-2">Date</th>
                            <th className="text-left pb-2">Project</th>
                            <th className="text-left pb-2">Task</th>
                            <th className="text-right pb-2">Hours</th>
                            <th className="text-left pb-2">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
                          {userDetails[s.user_id].map((e, i) => (
                            <tr key={i} className="hover:bg-surface-50/50 dark:hover:bg-surface-800/20">
                              <td className="py-2 text-surface-600 dark:text-surface-400">
                                {new Date(e.work_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </td>
                              <td className="py-2 font-medium text-surface-800 dark:text-surface-200">{e.project_code} — {e.project_name}</td>
                              <td className="py-2 text-surface-500">{e.task_category || '—'}</td>
                              <td className="py-2 text-right font-semibold text-surface-900 dark:text-white">{e.hours}h</td>
                              <td className="py-2 text-surface-400 truncate max-w-[200px]">{e.description || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" /> Approved ({approved.length})
          </h2>
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Division</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Days</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Comment</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
                {approved.map(s => (
                  <tr key={`${s.user_id}-approved`} className="hover:bg-surface-50 dark:hover:bg-surface-800/30">
                    <td className="px-4 py-3 text-sm font-medium text-surface-800 dark:text-surface-200">{s.user_name}</td>
                    <td className="px-4 py-3 text-sm text-surface-500">{s.division || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-surface-900 dark:text-white text-right">{s.total_hours?.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-sm text-surface-500 text-right">{s.days_worked}</td>
                    <td className="px-4 py-3 text-xs text-surface-400 max-w-[200px] truncate">{s.admin_comment || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openActionModal('recall', s.user_id, s.user_name)}
                        className="btn-ghost btn-xs text-amber-600 hover:text-amber-700 dark:text-amber-400"
                        title="Recall for correction"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Recall
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recalled */}
      {recalled.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-500" /> Recalled ({recalled.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recalled.map(s => (
              <div key={`${s.user_id}-recalled`} className="card p-4 border-l-4 border-l-amber-400">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 text-xs font-semibold">
                    {s.user_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 dark:text-surface-300 truncate">{s.user_name}</p>
                    <p className="text-xs text-surface-400">{s.total_hours?.toFixed(1)}h • {s.days_worked} days</p>
                  </div>
                </div>
                {s.admin_comment && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded p-2 mt-1">
                    <MessageSquare className="w-3 h-3 inline mr-1" />
                    {s.admin_comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-2">
            <X className="w-4 h-4 text-red-500" /> Rejected ({rejected.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rejected.map(s => (
              <div key={`${s.user_id}-rejected`} className="card p-4 border-l-4 border-l-red-400">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 text-xs font-semibold">
                    {s.user_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 dark:text-surface-300 truncate">{s.user_name}</p>
                    <p className="text-xs text-surface-400">{s.total_hours?.toFixed(1)}h • {s.days_worked} days</p>
                  </div>
                </div>
                {s.admin_comment && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded p-2 mt-1">
                    <MessageSquare className="w-3 h-3 inline mr-1" />
                    {s.admin_comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3">Drafts (Not Submitted)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drafts.map(s => (
              <div key={`${s.user_id}-draft`} className="card p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-surface-500 text-xs font-semibold">
                  {s.user_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-600 dark:text-surface-400 truncate">{s.user_name}</p>
                  <p className="text-xs text-surface-400">{s.total_hours?.toFixed(1)}h • {s.days_worked} days</p>
                </div>
                <span className="badge-draft">Draft</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summaries.length === 0 && (
        <div className="card p-12 text-center">
          <Calendar className="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400">No timesheet data for Week {week}</p>
          <p className="text-xs text-surface-400 mt-1">{weekLabel}</p>
        </div>
      )}

      {/* Action Modal (Approve/Reject/Recall with comment) */}
      <Modal
        isOpen={actionModal.open}
        onClose={() => setActionModal({ open: false, type: '', userId: null, userName: '' })}
        title={
          actionModal.type === 'approve' ? `Approve Timesheet — ${actionModal.userName}` :
          actionModal.type === 'reject' ? `Reject Timesheet — ${actionModal.userName}` :
          `Recall Timesheet — ${actionModal.userName}`
        }
        size="md"
        footer={
          <>
            <button onClick={() => setActionModal({ open: false, type: '', userId: null, userName: '' })} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button
              onClick={handleAction}
              className={`btn-sm ${
                actionModal.type === 'approve' ? 'btn-primary' :
                actionModal.type === 'reject' ? 'btn-danger' :
                'btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500'
              }`}
            >
              {actionModal.type === 'approve' && <><Check className="w-4 h-4" /> Approve</>}
              {actionModal.type === 'reject' && <><X className="w-4 h-4" /> Reject</>}
              {actionModal.type === 'recall' && <><RotateCcw className="w-4 h-4" /> Recall</>}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className={`flex items-start gap-3 p-3 rounded-lg ${
            actionModal.type === 'approve' ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30' :
            actionModal.type === 'reject' ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30' :
            'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30'
          }`}>
            {actionModal.type === 'approve' && <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
            {actionModal.type === 'reject' && <X className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
            {actionModal.type === 'recall' && <RotateCcw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
            <p className="text-sm text-surface-700 dark:text-surface-300">
              {actionModal.type === 'approve' && `Approve ${actionModal.userName}'s timesheet for Week ${week}, ${year}?`}
              {actionModal.type === 'reject' && `Reject ${actionModal.userName}'s timesheet for Week ${week}, ${year}? They will be able to make corrections and resubmit.`}
              {actionModal.type === 'recall' && `Recall ${actionModal.userName}'s approved timesheet for Week ${week}, ${year}? This will allow them to make corrections.`}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Comment {actionModal.type === 'approve' ? '(optional)' : '(recommended)'}
            </label>
            <textarea
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              className="input min-h-[80px] resize-none"
              placeholder={
                actionModal.type === 'approve' ? 'Add a comment (optional)...' :
                actionModal.type === 'reject' ? 'Explain the reason for rejection...' :
                'Explain why this timesheet is being recalled...'
              }
              id="action-comment"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
