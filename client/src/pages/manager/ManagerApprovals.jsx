import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Check, X, Search, ChevronDown, ChevronRight, Clock, AlertCircle } from 'lucide-react';
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // Ensure the date isn't offset by timezone
  const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  return localDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function ManagerApprovals() {
  const [expandedUsers, setExpandedUsers] = useState({});
  const [comment, setComment] = useState('');
  const [selectedAction, setSelectedAction] = useState({ userId: null, week: null, year: null, type: null });
  const [searchTerm, setSearchTerm] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  // Fetch pending approvals for the manager's team
  const { data: pendingApprovals, isLoading } = useQuery({
    queryKey: ['manager-approvals'],
    queryFn: async () => {
      const res = await api.get('/manager/pending-approvals');
      return res.data.weeks;
    }
  });

  // Action mutation (approve/reject)
  const actionMutation = useMutation({
    mutationFn: async ({ action, ...data }) => {
      await api.post(`/timesheets/${action}`, data);
    },
    onSuccess: (_, variables) => {
      toast.success(`Timesheet ${variables.action}d successfully`);
      setComment('');
      setSelectedAction({ userId: null, week: null, year: null, type: null });
      queryClient.invalidateQueries(['manager-approvals']);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || `Failed to ${variables.action} timesheet`);
    }
  });

  const handleAction = (userId, week, year, action) => {
    if (action === 'approve') {
      // Direct approval without comment
      actionMutation.mutate({ action, user_id: userId, week, year });
    } else {
      // Require comment for rejection
      setSelectedAction({ userId, week, year, type: action });
    }
  };

  const submitActionWithComment = () => {
    if (selectedAction.type === 'reject' && !comment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    actionMutation.mutate({
      action: selectedAction.type,
      user_id: selectedAction.userId,
      week: selectedAction.week,
      year: selectedAction.year,
      comment
    });
  };

  // Fetch detailed entries for an expanded row
  const toggleUserExpansion = async (userId, week, year) => {
    const key = `${userId}-${week}-${year}`;
    if (expandedUsers[key]) {
      setExpandedUsers(prev => ({ ...prev, [key]: null }));
    } else {
      // Load details
      try {
        const res = await api.get(`/manager/week-details/${userId}/${year}/${week}`);
        setExpandedUsers(prev => ({ ...prev, [key]: res.data.entries }));
      } catch (err) {
        toast.error('Failed to load details');
      }
    }
  };

  const filteredApprovals = pendingApprovals?.filter(p => 
    p.user_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.user_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Team Approvals</h1>
        <p className="text-surface-400">Review and approve timesheets for your team members.</p>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-surface-800 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-xl text-sm text-white placeholder:text-surface-500 focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-surface-400">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            {pendingApprovals?.length || 0} pending review
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-surface-400">Loading approvals...</div>
        ) : filteredApprovals?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-surface-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-medium text-white">All caught up!</h3>
            <p className="text-surface-400 mt-1">No timesheets are currently awaiting your approval.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {filteredApprovals?.map(approval => {
              const key = `${approval.user_id}-${approval.week_number}-${approval.week_year}`;
              const isExpanded = !!expandedUsers[key];
              const details = expandedUsers[key];

              return (
                <div key={key} className="group">
                  {/* Row Header */}
                  <div className="p-4 flex items-center justify-between hover:bg-surface-800/50 transition-colors">
                    <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => toggleUserExpansion(approval.user_id, approval.week_number, approval.week_year)}>
                      <button className="p-1 hover:bg-surface-700 rounded transition-colors">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                      </button>
                      <div>
                        <div className="font-medium text-white">{approval.user_name}</div>
                        <div className="text-xs text-surface-400">{approval.user_email} • {approval.team_type}</div>
                      </div>
                      <div className="ml-auto mr-8 flex items-center gap-6 text-sm">
                        <div className="text-surface-300">
                          <span className="text-surface-500">Week:</span> {approval.week_number}/{approval.week_year}
                        </div>
                        <div className="font-medium text-brand-400">
                          {approval.total_hours}h
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(approval.user_id, approval.week_number, approval.week_year, 'approve')}
                        disabled={actionMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 font-medium text-sm transition-colors"
                      >
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => handleAction(approval.user_id, approval.week_number, approval.week_year, 'reject')}
                        disabled={actionMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 font-medium text-sm transition-colors"
                      >
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="bg-surface-950 p-4 border-t border-surface-800">
                      {details ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-surface-500 border-b border-surface-800">
                                <th className="pb-2 font-medium">Date</th>
                                <th className="pb-2 font-medium">Project/Task</th>
                                <th className="pb-2 font-medium text-right">Hours</th>
                                <th className="pb-2 font-medium pl-4">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-800/50">
                              {details.map(entry => (
                                <tr key={entry.id} className="text-surface-300">
                                  <td className="py-2 whitespace-nowrap">{formatDate(entry.work_date)}</td>
                                  <td className="py-2">
                                    {entry.project_code ? (
                                      <span><span className="text-brand-400">{entry.project_code}</span> — {entry.task_category}</span>
                                    ) : (
                                      <span className="text-surface-400">{entry.task_category}</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right font-medium">{entry.hours}h</td>
                                  <td className="py-2 pl-4 truncate max-w-xs">{entry.description || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-surface-500 animate-pulse">Loading details...</div>
                      )}
                    </div>
                  )}

                  {/* Rejection Comment Form */}
                  {selectedAction.userId === approval.user_id && selectedAction.type === 'reject' && selectedAction.week === approval.week_number && (
                    <div className="p-4 bg-red-500/5 border-t border-red-500/10">
                      <label className="block text-sm font-medium text-red-400 mb-2">Reason for rejection (required)</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Please provide details for the employee to correct..."
                          className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-red-500/40 focus:border-red-500"
                          autoFocus
                        />
                        <button
                          onClick={submitActionWithComment}
                          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          onClick={() => setSelectedAction({ userId: null, type: null })}
                          className="px-4 py-2 bg-surface-800 text-surface-300 text-sm font-medium rounded-lg hover:bg-surface-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
