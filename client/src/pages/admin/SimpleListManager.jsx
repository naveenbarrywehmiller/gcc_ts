import { useAuth } from '../../contexts/auth';
import { hasPermission } from '../../utils/permissions';
import FieldHelp from '../../components/ui/FieldHelp';
import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/toast';
import Modal from '../../components/ui/Modal';
import AdminSubdivisions from './Subdivisions';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';

export default function SimpleListManager({ endpoint, title, fieldName = 'name', withLocations = false }) {
  const toast = useToast();
  const { user } = useAuth();
  const isPlatform = endpoint === '/platforms';
  const canEdit = hasPermission(user, isPlatform ? 'accessGrants' : 'catalogEdit');
  const canDelete = hasPermission(user, 'catalogDelete');
  const cache = useQueryClient();
  const itemLabel = title === 'Divisions' ? 'Division' : title;
  const [platforms, setPlatforms] = useState([]);
  const [platformId, setPlatformId] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [expandedDivision, setExpandedDivision] = useState(null);
  const [search, setSearch] = useState('');
  const filteredItems = items.filter(item => (!platformFilter || String(item.platform_id) === platformFilter) && [item[fieldName], item.platform_name || '', item.id].some(value => String(value).toLowerCase().includes(search.trim().toLowerCase())));

  const load = useCallback(() => {
    api.get(endpoint).then(res => {
      const key = Object.keys(res.data)[0];
      setItems(res.data[key] || []);
    }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, [toast, endpoint]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (withLocations) api.get('/platforms').then(r => setPlatforms(r.data.platforms)).catch(() => toast.error('Unable to load Platforms')); }, [withLocations, toast]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(`${fieldName} is required`); return; }
    if (withLocations && !platformId) { toast.error('Platform is required'); return; }
    try {
      if (editing) { await api.put(`${endpoint}/${editing.id}`, { [fieldName]: name, ...(withLocations ? { platform_id: Number(platformId) } : {}) }); toast.success('Updated'); }
      else { await api.post(endpoint, { [fieldName]: name, ...(withLocations ? { platform_id: Number(platformId) } : {}) }); toast.success('Created'); }
      setShowModal(false); setName(''); load(); cache.invalidateQueries();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this item?')) return;
    try { await api.delete(`${endpoint}/${id}`); toast.success('Deactivated'); load(); cache.invalidateQueries(); } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">{title}<FieldHelp label={itemLabel} /></h1>
        {canEdit && <button onClick={() => { setEditing(null); setName(''); setPlatformId(''); setShowModal(true); }} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Add {itemLabel}
        </button>}
      </div>
      {withLocations && <select className="input max-w-sm" aria-label="Filter Platform" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}><option value="">All Platforms</option>{platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      {<div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input type="search" aria-label={`Search ${title}`} value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${title}…`} className="input pl-9" />
      </div>}
      <div className="card overflow-hidden">
        <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-4 w-20 rounded" />
              </div>
            ))
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-surface-400">{withLocations ? 'No divisions found' : 'No items found'}</div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id}>
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors group">
                  <span className="min-w-0 text-sm font-medium text-surface-800 dark:text-surface-200 break-words">{withLocations && <span className="block text-xs text-surface-500">{item.platform_name}</span>}{item[fieldName]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {withLocations && <button type="button" className="btn-secondary btn-sm" aria-expanded={expandedDivision === item.id} aria-controls={`division-locations-${item.id}`}
                      onClick={() => setExpandedDivision(expandedDivision === item.id ? null : item.id)}>
                      Locations {expandedDivision === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>}
                    {canEdit && <button onClick={() => { setEditing(item); setName(item[fieldName]); setPlatformId(item.platform_id || ''); setShowModal(true); }} className="btn-ghost btn-xs p-1.5" aria-label={`Edit ${item[fieldName]}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>}
                    {canDelete && <button onClick={() => handleDelete(item.id)} className="btn-ghost btn-xs p-1.5 text-red-500" aria-label={`Delete ${item[fieldName]}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>}
                  </div>
                </div>
                {withLocations && expandedDivision === item.id && <div id={`division-locations-${item.id}`} className="border-t border-surface-200 dark:border-surface-800 p-3 sm:p-4 bg-surface-50 dark:bg-surface-950/30">
                  <AdminSubdivisions division={item} />
                </div>}
              </div>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={showModal && canEdit} onClose={() => setShowModal(false)} title={editing ? `Edit ${itemLabel}` : `Add ${itemLabel}`}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-3">
          {withLocations && <div><label htmlFor="division-platform" className="block text-xs mb-1">Platform *</label><select id="division-platform" required className="input" value={platformId} onChange={e => setPlatformId(e.target.value)}><option value="">Select Platform</option>{platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{editing && <p className="text-xs text-surface-500 mt-2">Reclassifying a division also reclassifies its historical reports. Only a System Admin can change its Platform.</p>}</div>}
          <label htmlFor="simple-list-name" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Name *</label>
          <input id="simple-list-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder={`${itemLabel} name`} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
        </div>
      </Modal>
    </div>
  );
}

// Wrapper components
export function AdminDivisions() {
  return <SimpleListManager endpoint="/divisions" title="Divisions" fieldName="name" withLocations />;
}

export function AdminActivities() {
  return <SimpleListManager endpoint="/activities" title="Work Type" fieldName="name" />;
}

export function AdminSupportingCategories() {
  return <SimpleListManager endpoint="/supporting-categories" title="Dedicated/Flex" fieldName="name" />;
}

export function AdminPlatforms() {
  return <SimpleListManager endpoint="/platforms" title="Platforms" />;
}
