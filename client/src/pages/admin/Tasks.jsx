import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import { Plus, Search, Edit2, Trash2, Check, X as XIcon } from 'lucide-react';

export default function AdminTasks() {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ classification: '', task_category: '', task_description: '', requires_project: true });

  const load = () => {
    setLoading(true);
    api.get('/tasks').then(res => setTasks(res.data.tasks)).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = tasks.filter(t =>
    t.task_category.toLowerCase().includes(search.toLowerCase()) ||
    (t.classification || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.task_description || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ classification: '', task_category: '', task_description: '', requires_project: true }); setShowModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ classification: t.classification || '', task_category: t.task_category, task_description: t.task_description || '', requires_project: t.requires_project === 1 }); setShowModal(true); };

  const handleSave = async () => {
    try {
      if (editing) { await api.put(`/tasks/${editing.id}`, form); toast.success('Task updated'); }
      else { await api.post('/tasks', form); toast.success('Task created'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this task?')) return;
    try { await api.delete(`/tasks/${id}`); toast.success('Task deactivated'); load(); } catch { toast.error('Failed'); }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">Tasks</h1>
        <button onClick={openCreate} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Task</button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="input pl-9" />
      </div>
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Classification</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Requires Project</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3">
                  <span className={`badge ${t.classification === 'Billable' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'}`}>
                    {t.classification || 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-surface-800 dark:text-surface-200">{t.task_category}</td>
                <td className="px-4 py-3 text-sm text-surface-500">{t.task_description || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {t.requires_project === 1 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Check className="w-3 h-3" /> Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                      <XIcon className="w-3 h-3" /> No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="btn-ghost btn-xs p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(t.id)} className="btn-ghost btn-xs p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-sm text-surface-400">No tasks found</div>}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Task' : 'Create Task'}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Classification</label>
            <select className="input" value={form.classification} onChange={e => setForm({ ...form, classification: e.target.value })}>
              <option value="">Select...</option>
              <option value="Billable">Billable</option>
              <option value="Non-Billable">Non-Billable</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Task Category *</label>
            <input className="input" value={form.task_category} onChange={e => setForm({ ...form, task_category: e.target.value })} placeholder="e.g. Development" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Description</label>
            <textarea className="input" rows={3} value={form.task_description} onChange={e => setForm({ ...form, task_description: e.target.value })} placeholder="Task description" />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800/30 border border-surface-200 dark:border-surface-700">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">Requires Project</label>
              <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                When enabled, users must select a project for this task category. Disable for standalone categories like Leave, Meeting, etc.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, requires_project: !form.requires_project })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                form.requires_project ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'
              }`}
              role="switch"
              aria-checked={form.requires_project}
              id="requires-project-toggle"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  form.requires_project ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
