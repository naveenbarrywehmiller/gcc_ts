import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';

export default function AdminSubdivisions() {
  const toast = useToast();
  const [subdivisions, setSubdivisions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDivisionId, setFilterDivisionId] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', division_id: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [subRes, divRes] = await Promise.all([
        api.get('/subdivisions'),
        api.get('/divisions')
      ]);
      setSubdivisions(subRes.data.subdivisions);
      setDivisions(divRes.data.divisions);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = subdivisions.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesDivision = filterDivisionId ? s.division_id === parseInt(filterDivisionId) : true;
    return matchesSearch && matchesDivision;
  });

  const openCreate = () => { 
    setEditing(null); 
    setForm({ name: '', division_id: filterDivisionId || '' }); 
    setShowModal(true); 
  };
  
  const openEdit = (s) => { 
    setEditing(s); 
    setForm({ name: s.name, division_id: s.division_id }); 
    setShowModal(true); 
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.division_id) {
      toast.error('Name and Division are required');
      return;
    }
    
    try {
      if (editing) {
        await api.put(`/subdivisions/${editing.id}`, form);
        toast.success('Subdivision updated');
      } else {
        await api.post('/subdivisions', form);
        toast.success('Subdivision created');
      }
      setShowModal(false); 
      loadData();
    } catch (err) { 
      toast.error(err.response?.data?.error || 'Failed to save'); 
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this subdivision?')) return;
    try { 
      await api.delete(`/subdivisions/${id}`); 
      toast.success('Subdivision deactivated'); 
      loadData(); 
    } catch (err) { 
      toast.error('Failed to deactivate'); 
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">Subdivisions</h1>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Add Subdivision
        </button>
      </div>
      
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search subdivisions..." 
            className="input pl-9" 
          />
        </div>
        <select 
          className="input max-w-xs" 
          value={filterDivisionId} 
          onChange={e => setFilterDivisionId(e.target.value)}
        >
          <option value="">All Divisions</option>
          {divisions.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Subdivision Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Division</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-surface-800 dark:text-surface-200">{s.name}</td>
                <td className="px-4 py-3 text-sm text-surface-500">{s.division_name}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(s)} className="btn-ghost btn-xs p-1.5">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="btn-ghost btn-xs p-1.5 text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-sm text-surface-400">No subdivisions found</div>}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Subdivision' : 'Create Subdivision'}
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSave} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Subdivision Name *</label>
            <input 
              className="input" 
              value={form.name} 
              onChange={(e) => setForm({ ...form, name: e.target.value })} 
              placeholder="e.g. Frontend" 
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Division *</label>
            <select 
              className="input" 
              value={form.division_id} 
              onChange={e => setForm({ ...form, division_id: e.target.value })}
            >
              <option value="" disabled>Select a division</option>
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
