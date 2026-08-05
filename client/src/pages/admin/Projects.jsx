import { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';

export default function AdminProjects() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterDivisionId, setFilterDivisionId] = useState('');
  const [filterSubdivisionId, setFilterSubdivisionId] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ project_code: '', project_name: '', customer_name: '', activity: '', division_id: '', subdivision_id: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/projects'),
      api.get('/divisions'),
      api.get('/subdivisions')
    ]).then(([pRes, dRes, sRes]) => {
      setProjects(pRes.data.projects);
      setDivisions(dRes.data.divisions);
      setSubdivisions(sRes.data.subdivisions);
    }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };
  
  useEffect(() => { load(); }, []);

  const filtered = projects.filter(p => {
    const matchesSearch = 
      p.project_code.toLowerCase().includes(search.toLowerCase()) ||
      p.project_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.customer_name || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesDiv = filterDivisionId ? p.division_id === parseInt(filterDivisionId) : true;
    const matchesSubdiv = filterSubdivisionId ? p.subdivision_id === parseInt(filterSubdivisionId) : true;
    
    return matchesSearch && matchesDiv && matchesSubdiv;
  });

  // Cascading options for filters
  const filterSubdivisionOptions = useMemo(() => {
    if (!filterDivisionId) return subdivisions;
    return subdivisions.filter(s => s.division_id === parseInt(filterDivisionId));
  }, [subdivisions, filterDivisionId]);

  // Cascading options for form
  const formSubdivisionOptions = useMemo(() => {
    if (!form.division_id) return [];
    return subdivisions.filter(s => s.division_id === parseInt(form.division_id));
  }, [subdivisions, form.division_id]);

  // When form division changes, reset subdivision if it's no longer valid
  useEffect(() => {
    if (form.subdivision_id) {
      const isValid = formSubdivisionOptions.some(s => s.id === parseInt(form.subdivision_id));
      if (!isValid) {
        setForm(prev => ({ ...prev, subdivision_id: '' }));
      }
    }
  }, [form.division_id, formSubdivisionOptions, form.subdivision_id]);

  // When filter division changes, reset filter subdivision
  useEffect(() => {
    setFilterSubdivisionId('');
  }, [filterDivisionId]);

  const openCreate = () => { 
    setEditing(null); 
    setForm({ project_code: '', project_name: '', customer_name: '', activity: '', division_id: '', subdivision_id: '' }); 
    setShowModal(true); 
  };
  
  const openEdit = (p) => { 
    setEditing(p); 
    setForm({ 
      project_code: p.project_code, 
      project_name: p.project_name, 
      customer_name: p.customer_name || '', 
      activity: p.activity || '', 
      division_id: p.division_id || '', 
      subdivision_id: p.subdivision_id || '' 
    }); 
    setShowModal(true); 
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/projects/${editing.id}`, form);
        toast.success('Project updated');
      } else {
        await api.post('/projects', form);
        toast.success('Project created');
      }
      setShowModal(false); 
      load();
    } catch (err) { 
      toast.error(err.response?.data?.error || 'Failed to save'); 
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this project?')) return;
    try { 
      await api.delete(`/projects/${id}`); 
      toast.success('Project deactivated'); 
      load(); 
    } catch (err) { 
      toast.error('Failed'); 
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">Projects</h1>
        <button onClick={openCreate} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Project</button>
      </div>

      <div className="bg-surface-50 dark:bg-surface-800/50 p-4 rounded-xl border border-surface-200 dark:border-surface-700 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search projects..." 
              className="input pl-9 w-full" 
            />
          </div>
          <select 
            className="input" 
            value={filterDivisionId} 
            onChange={e => setFilterDivisionId(e.target.value)}
          >
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select 
            className="input" 
            value={filterSubdivisionId} 
            onChange={e => setFilterSubdivisionId(e.target.value)}
            disabled={!filterDivisionId}
          >
            <option value="">All Subdivisions</option>
            {filterSubdivisionOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Project Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Division</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Subdivision</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3 text-sm font-mono font-semibold text-brand-600 dark:text-brand-400">{p.project_code}</td>
                <td className="px-4 py-3 text-sm font-medium text-surface-800 dark:text-surface-200">{p.project_name}</td>
                <td className="px-4 py-3 text-sm text-surface-500">{p.customer_name || '—'}</td>
                <td className="px-4 py-3 text-sm text-surface-500">{p.division_name || p.division || '—'}</td>
                <td className="px-4 py-3 text-sm text-surface-500">{p.subdivision_name || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="btn-ghost btn-xs p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(p.id)} className="btn-ghost btn-xs p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-sm text-surface-400">No projects found</div>}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Project' : 'Create Project'}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Project Code *</label>
              <input className="input" value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} placeholder="PRJ-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Project Name *</label>
              <input className="input" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="Project name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Customer Name</label>
              <input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Customer name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Activity</label>
              <input className="input" value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} placeholder="Development" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Division</label>
              <select className="input" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })}>
                <option value="">— Select —</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Subdivision</label>
              <select 
                className="input" 
                value={form.subdivision_id} 
                onChange={(e) => setForm({ ...form, subdivision_id: e.target.value })}
                disabled={!form.division_id}
              >
                <option value="">— Select —</option>
                {formSubdivisionOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
