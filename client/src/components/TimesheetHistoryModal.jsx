import { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import Modal from './ui/Modal';
import { Calendar, Filter, Clock, RotateCcw, AlertTriangle } from 'lucide-react';

export default function TimesheetHistoryModal({
  isOpen,
  onClose,
  initialUser = null,
  assignedUsers = [],
  onRecallSuccess = null,
}) {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(initialUser ? initialUser.id : '');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Recall sub-modal state
  const [recallTarget, setRecallTarget] = useState(null);
  const [recallComment, setRecallComment] = useState('');
  const [recalling, setRecalling] = useState(false);

  // Fetch entries across all weeks
  const fetchEntries = async (userId, statusVal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) {
        params.append('user_id', userId);
      } else {
        params.append('assigned_only', 'true');
      }
      if (statusVal) {
        params.append('status', statusVal);
      }

      const res = await api.get(`/admin-ownership/timesheet-history?${params.toString()}`);
      setEntries(res.data.entries || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load timesheet history');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const targetUserId = initialUser ? initialUser.id : '';
      setSelectedUser(targetUserId);
      setSelectedStatus('');
      fetchEntries(targetUserId, '');
    } else {
      setEntries([]);
      setRecallTarget(null);
      setRecallComment('');
    }
  }, [isOpen, initialUser]);

  const totalHours = entries.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);

  const title = initialUser
    ? `Timesheet History — ${initialUser.name} (All Weeks)`
    : 'Assigned Users Timesheet History (All Weeks)';

  const handleOpenRecall = (entry) => {
    setRecallTarget(entry);
    setRecallComment('');
  };

  const handleExecuteRecall = async () => {
    if (!recallTarget) return;
    setRecalling(true);
    try {
      const res = await api.post('/timesheets/recall', {
        user_id: recallTarget.user_id,
        week: recallTarget.week_number,
        year: recallTarget.week_year,
        comment: recallComment || null,
      });
      toast.success(res.data.message || `Week ${recallTarget.week_number} timesheet recalled for correction`);
      setRecallTarget(null);
      setRecallComment('');
      // Reload history entries
      fetchEntries(selectedUser, selectedStatus);
      if (onRecallSuccess) {
        onRecallSuccess();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to recall timesheet');
    } finally {
      setRecalling(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="xl"
        footer={
          <button onClick={onClose} className="btn-secondary btn-sm">
            Close
          </button>
        }
      >
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-surface-200 dark:border-surface-700">
            <div className="text-xs text-surface-500 font-medium flex items-center gap-2">
              <span>
                Showing {entries.length} {entries.length === 1 ? 'entry' : 'entries'} across all weeks
              </span>
              {entries.length > 0 && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-surface-700 dark:text-surface-300">
                    {totalHours.toFixed(1)} hrs total
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* If not locked to a specific single user, allow picking an employee */}
              {!initialUser && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-surface-600 dark:text-surface-400">Employee:</label>
                  <select
                    value={selectedUser}
                    onChange={(e) => {
                      setSelectedUser(e.target.value);
                      fetchEntries(e.target.value, selectedStatus);
                    }}
                    className="select select-sm text-xs py-1 px-2.5 h-8 rounded-lg"
                    id="history-modal-user-select"
                  >
                    <option value="">All My Assigned Users</option>
                    {assignedUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.employee_id ? `(${u.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status filter */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400">Status:</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    fetchEntries(selectedUser, e.target.value);
                  }}
                  className="select select-sm text-xs py-1 px-2.5 h-8 rounded-lg"
                  id="history-modal-status-select"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="recalled">Recalled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Content body */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-2" />
              <p className="text-sm text-surface-400">No timesheet entries found across all weeks.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[55vh] border border-surface-200 dark:border-surface-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-50 dark:bg-surface-800/90 backdrop-blur z-10">
                  <tr className="border-b border-surface-200 dark:border-surface-700 text-xs font-semibold text-surface-500">
                    <th className="text-left px-3 py-2.5">Week</th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    {!initialUser && <th className="text-left px-3 py-2.5">Employee</th>}
                    <th className="text-left px-3 py-2.5">Project</th>
                    <th className="text-left px-3 py-2.5">Task</th>
                    <th className="text-left px-3 py-2.5">Division</th>
                    <th className="text-right px-3 py-2.5">Hours</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
                  {entries.map((e, i) => (
                    <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                      <td className="px-3 py-2 text-surface-700 dark:text-surface-300 font-semibold text-xs whitespace-nowrap">
                        W{e.week_number || '—'} {e.week_year || ''}
                      </td>
                      <td className="px-3 py-2 text-surface-600 dark:text-surface-400 font-mono text-xs whitespace-nowrap">
                        {e.work_date}
                      </td>
                      {!initialUser && (
                        <td className="px-3 py-2 text-surface-800 dark:text-surface-200 font-medium text-xs whitespace-nowrap">
                          {e.user_name}
                          {e.employee_id && (
                            <span className="ml-1 text-[10px] text-surface-400 font-mono">
                              ({e.employee_id})
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-surface-700 dark:text-surface-300">
                        <div>
                          {e.project_code ? (
                            <span className="font-medium text-xs">{e.project_code} — {e.project_name}</span>
                          ) : (
                            <span className="text-xs text-surface-400">—</span>
                          )}
                          {e.ownership_label && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              🏷️ {e.ownership_label}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-surface-500">{e.task_category || '—'}</td>
                      <td className="px-3 py-2 text-xs text-surface-500">{e.division_name || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-xs text-surface-900 dark:text-white">
                        {Number(e.hours).toFixed(1)}h
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`badge-${e.status} text-[10px] px-2 py-0.5 capitalize`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(e.status === 'approved' || e.status === 'submitted') ? (
                          <button
                            onClick={() => handleOpenRecall(e)}
                            className="btn-ghost btn-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1"
                            title={`Recall Week ${e.week_number} (${e.week_year}) timesheet for ${e.user_name}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Recall
                          </button>
                        ) : e.status === 'recalled' ? (
                          <span className="text-[11px] text-amber-500 dark:text-amber-400 italic">
                            Recalled
                          </span>
                        ) : (
                          <span className="text-xs text-surface-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Admin Recall Confirmation Dialog */}
      <Modal
        isOpen={!!recallTarget}
        onClose={() => { setRecallTarget(null); setRecallComment(''); }}
        title={`Recall Timesheet — ${recallTarget?.user_name}`}
        size="md"
        footer={
          <>
            <button
              onClick={() => { setRecallTarget(null); setRecallComment(''); }}
              className="btn-secondary btn-sm"
              disabled={recalling}
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteRecall}
              className="btn-primary btn-sm bg-amber-500 hover:bg-amber-600 border-amber-500 text-white flex items-center gap-1.5"
              disabled={recalling}
            >
              <RotateCcw className="w-4 h-4" />
              {recalling ? 'Recalling...' : 'Confirm Recall'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
            <RotateCcw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Recall Week {recallTarget?.week_number} ({recallTarget?.week_year}) Timesheet
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Recalling this {recallTarget?.status} timesheet will revert its status so {recallTarget?.user_name} can edit and resubmit their hours.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Reason for Recall (optional)
            </label>
            <textarea
              value={recallComment}
              onChange={(e) => setRecallComment(e.target.value)}
              className="input min-h-[80px] resize-none text-xs"
              placeholder="Explain why this timesheet is being recalled for correction..."
              id="history-recall-comment"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
