import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function SimpleListManager({ endpoint, title, fieldName = 'name', idLabel }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');

  const load = () => {
    setLoading(true);
    api.get(endpoint).then(res => {
      const key = Object.keys(res.data)[0];
      setItems(res.data[key] || []);
    }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(`${fieldName} is required`); return; }
    try {
      if (editing) { await api.put(`${endpoint}/${editing.id}`, { [fieldName]: name }); toast.success('Updated'); }
      else { await api.post(endpoint, { [fieldName]: name }); toast.success('Created'); }
      setShowModal(false); setName(''); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this item?')) return;
    try { await api.delete(`${endpoint}/${id}`); toast.success('Deactivated'); load(); } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">{title}</h1>
        <button onClick={() => { setEditing(null); setName(''); setShowModal(true); }} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Add {title.slice(0, -1)}
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-4 w-20 rounded" />
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-surface-400">No items found</div>
          ) : (
            items.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors group">
                <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{item[fieldName]}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(item); setName(item[fieldName]); setShowModal(true); }} className="btn-ghost btn-xs p-1.5">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="btn-ghost btn-xs p-1.5 text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit ${title.slice(0,-1)}` : `Add ${title.slice(0,-1)}`}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button></>}>
        <div>
          <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={`${title.slice(0,-1)} name`} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
        </div>
      </Modal>
    </div>
  );
}

// Wrapper components
export function AdminDivisions() {
  return <SimpleListManager endpoint="/divisions" title="Divisions" fieldName="name" />;
}

export function AdminActivities() {
  return <SimpleListManager endpoint="/activities" title="Activities" fieldName="name" />;
}

export function AdminSupportingCategories() {
  return <SimpleListManager endpoint="/supporting-categories" title="Supporting Categories" fieldName="name" />;
}
