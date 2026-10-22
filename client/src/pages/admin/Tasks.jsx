import { taskPlanningFields } from '../../utils/taskPlanningFields';
import FieldHelp from '../../components/ui/FieldHelp';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { downloadCatalog, importSummary } from '../../utils/catalogTransfer';
import api from '../../services/api';
import { useToast } from '../../contexts/toast';
import { useAuth } from '../../contexts/auth';
import { hasPermission } from '../../utils/permissions';
import Modal from '../../components/ui/Modal';
import ActiveLabel from '../../components/ActiveLabel';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';

export default function AdminTasks() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = hasPermission(user, 'tasks');
  const cache = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [ownerships, setOwnerships] = useState([]);
  const [ownershipError, setOwnershipError] = useState(false);
  const [ownershipLoading, setOwnershipLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('1');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ classification: '', task_category: '', task_description: '', ownership_id: '' });
  const ownershipRequired = form.classification === 'Productive';
  const selectedOwnership = ownerships.find(item => item.id === Number(form.ownership_id));
  const selectedOwnershipText = selectedOwnership
    ? `${selectedOwnership.department_name} — ${selectedOwnership.label}`
    : editing && Number(form.ownership_id) === editing.ownership_id ? `${editing.ownership_department_name} — ${editing.ownership_label}` : '';
  const loadOwnerships = useCallback(() => {
    setOwnershipLoading(true);
    setOwnershipError(false);
    api.get('/department-ownerships').then(res => setOwnerships(res.data.ownerships.filter(item => item.department_active)))
      .catch(() => setOwnershipError(true)).finally(() => setOwnershipLoading(false));
  }, []);

  const load = useCallback(() => {
    api.get('/tasks', { params: { active } }).then(res => setTasks(res.data.tasks)).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, [toast, active]);
  useEffect(() => { load(); }, [load]);

  const filtered = tasks.filter(t =>
    t.task_category.toLowerCase().includes(search.toLowerCase()) ||
    (t.classification || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.task_description || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ classification: '', task_category: '', task_description: '', ownership_id: '' }); loadOwnerships(); setShowModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ ...t, ownership_id: t.ownership_id || '' }); loadOwnerships(); setShowModal(true); };

  const handleSave = async () => {
    try {
      if (!form.task_category.trim() || !form.classification) { toast.error('Enter a task name and select a classification'); return; }
      if (ownershipRequired && !form.ownership_id) { toast.error('Ownership Details is required for Productive tasks'); document.getElementById('task-ownership')?.focus(); return; }
      if (editing) { await api.put(`/tasks/${editing.id}`, form); toast.success('Task updated'); }
      else { await api.post('/tasks', form); toast.success('Task created'); }
      setShowModal(false); load(); cache.invalidateQueries({ queryKey: ['project-options'] });
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this task?')) return;
    try { await api.delete(`/tasks/${id}`); toast.success('Task deactivated'); load(); } catch { toast.error('Failed'); }
  };

  const download = async () => {
    setBusy(true);
    try { await downloadCatalog('/tasks/export', { search, active }, 'tasks.xlsx'); }
    catch { toast.error('Download failed'); }
    finally { setBusy(false); }
  };
  const importFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    const body = new FormData(); body.append('file', file);
    try {
      const response = await api.post('/import/tasks', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(importSummary(response.data)); load();
      for (const queryKey of [['project-options'], ['projects'], ['admin-projects'], ['tasks'], ['timesheet'], ['dashboard']]) cache.invalidateQueries({ queryKey });
    } catch (error) { setErrors([error.response?.data?.error || 'Import failed', ...(error.response?.data?.errors || [])]); }
    finally { setBusy(false); e.target.value = ''; }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">Task Name/Number</h1>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={download} className="btn-secondary btn-sm">Export Tasks</button>
          {canManage && <>
            <button disabled={busy} onClick={() => fileRef.current.click()} className="btn-secondary btn-sm">Import Excel</button>
            <input ref={fileRef} type="file" hidden accept=".xlsx,.csv" onChange={importFile} />
            <button disabled={busy} onClick={openCreate} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Task</button>
          </>}
        </div>
      </div>
      {!canManage && <p className="text-sm text-surface-500">View shared tasks used across all divisions.</p>}
      {canManage && <div className="space-y-1 text-xs text-surface-500">
        <p>Export Tasks downloads the current filters, or headers for an empty list. Edit and reimport to update tasks; keep existing Task IDs and leave IDs blank for new rows. Excel includes Classification, Ownership Details, and Active dropdowns. Ownership Details is required for Productive tasks and optional for Non-Productive tasks. Maintain ownership entries under Departments.</p>
        <p>Removing a row from an exported Excel file deactivates that exported task. CSV and older files update or add rows without deactivating missing tasks. Any invalid row rejects the entire import. Keep the workbook’s hidden sheets. Tasks are shared across all divisions; classification cannot change after assignment or time entry.</p>
      </div>}
      <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input type="text" aria-label="Search tasks" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="input pl-9" />
      </div>
      <select aria-label="Filter active tasks" className="input sm:max-w-xs" value={active} onChange={e => setActive(e.target.value)}>
        <option value="1">Active tasks</option><option value="0">Inactive tasks</option><option value="all">All tasks</option>
      </select>
      </div>
      <p aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400"><ActiveLabel active>Active</ActiveLabel><ActiveLabel active={false}>Inactive</ActiveLabel></p>
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Classification</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Ownership Details</th>
              {taskPlanningFields.map(([key, label]) => <th key={key} className="text-left px-4 py-3 text-xs font-semibold text-surface-500 whitespace-nowrap">{label}</th>)}
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              {canManage && <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3">
                  <span className={`badge ${t.classification === 'Productive' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'}`}>
                    {t.classification || 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-surface-800 dark:text-surface-200"><ActiveLabel active={t.active}>{t.task_category}</ActiveLabel></td>
                <td className="px-4 py-3 text-sm text-surface-500">{t.task_description || '—'}</td>
                <td className="px-4 py-3 text-sm text-surface-500"><span className="block text-xs">{t.ownership_department_name}</span>{t.ownership_label || (t.classification === 'Productive' ? 'Not assigned' : '—')}</td>
                {taskPlanningFields.map(([key]) => <td key={key} className="px-4 py-3 text-sm text-surface-500 whitespace-nowrap">{t[key] ?? '—'}</td>)}
                <td className="px-4 py-3 text-sm text-surface-500">{t.active ? 'Active' : 'Inactive'}</td>
                {canManage && <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="btn-ghost btn-xs p-1.5" aria-label={`Edit ${t.task_category}`}><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(t.id)} className="btn-ghost btn-xs p-1.5 text-red-500" aria-label={`Deactivate ${t.task_category}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-sm text-surface-400">No tasks found</div>}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Task' : 'Create Task'}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} disabled={ownershipRequired && (ownershipLoading || ownershipError)} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div>
            <label htmlFor="task-classification" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Classification *</label>
            <select id="task-classification" className="input" value={form.classification || ''} onChange={e => setForm({ ...form, classification: e.target.value })}>
              <option value="">Select...</option>
              <option value="Productive">Productive</option>
              <option value="Non-Productive">Non-Productive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5" htmlFor="task-name">Task Name/Number *<FieldHelp label="Task Name/Number" /></label>
            <input id="task-name" className="input" value={form.task_category} onChange={e => setForm({ ...form, task_category: e.target.value })} placeholder="e.g. Development" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5" htmlFor="task-description">Description<FieldHelp label="Task Description" /></label>
            <textarea id="task-description" className="input" rows={3} value={form.task_description || ''} onChange={e => setForm({ ...form, task_description: e.target.value })} placeholder="Task description" />
          </div>
          <div>
            <label htmlFor="task-ownership" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Ownership Details {ownershipRequired ? '*' : '(optional)'}</label>
            <select id="task-ownership" required={ownershipRequired} disabled={ownershipLoading || ownershipError} aria-describedby="task-ownership-help" className="input" value={form.ownership_id} onChange={e => setForm({ ...form, ownership_id: e.target.value })}>
              <option value="">{ownershipLoading ? 'Loading ownership details…' : 'Select ownership details'}</option>
              {form.ownership_id && !ownerships.some(item => item.id === Number(form.ownership_id)) && <option value={form.ownership_id}>{editing?.ownership_department_name} — {editing?.ownership_label} (inactive)</option>}
              {ownerships.map(item => <option key={item.id} value={item.id}>{item.department_name} — {item.label}</option>)}
            </select>
            {selectedOwnershipText && <p className="mt-1 text-xs text-surface-600 dark:text-surface-300 break-words">{selectedOwnershipText}</p>}
            <p id="task-ownership-help" className="mt-1 text-xs text-surface-500 dark:text-surface-400">{ownershipLoading ? 'Loading the Department ownership list.' : ownershipError ? 'Unable to load ownership details.' : ownerships.length ? 'Choose an entry maintained under Departments.' : 'No active ownership entries. Ask a Manager or System Admin to add Ownership Details under Departments.'}</p>
            {ownershipError && <button type="button" onClick={loadOwnerships} className="btn-secondary btn-sm mt-2">Retry ownership details</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {taskPlanningFields.map(([key, label, type]) => <div key={key} className="min-w-0"><label htmlFor={`task-${key}`} className="block text-xs font-medium mb-1.5">{label} <span className="text-surface-500">(optional)</span></label><input id={`task-${key}`} type={type} className="input" min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}
          </div>
        </div>
      </Modal>
      <Modal isOpen={!!errors} onClose={() => setErrors(null)} title="Task import failed">
        <ul className="list-disc pl-5 space-y-2 text-sm break-words" role="alert">{errors?.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </Modal>
    </div>
  );
}
