import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Tag, X } from 'lucide-react';

export default function AdminDepartments() {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');

  // Ownership state
  const [expandedDept, setExpandedDept] = useState(null);
  const [newOwnershipLabel, setNewOwnershipLabel] = useState('');
  const [addingOwnership, setAddingOwnership] = useState(null); // dept id currently adding to

  // Ownership edit state
  const [editingOwnership, setEditingOwnership] = useState(null);
  const [editOwnershipLabel, setEditOwnershipLabel] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/departments')
      .then(res => {
        setDepartments(res.data.departments || []);
      })
      .catch(() => toast.error('Failed to load departments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSaveDept = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    try {
      if (editing) {
        await api.put(`/departments/${editing.id}`, { name });
        toast.success('Department updated');
      } else {
        await api.post('/departments', { name });
        toast.success('Department created');
      }
      setShowModal(false);
      setName('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDeleteDept = async (id) => {
    if (!confirm('Deactivate this department?')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Department deactivated');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const toggleExpand = (deptId) => {
    setExpandedDept(prev => prev === deptId ? null : deptId);
    setAddingOwnership(null);
    setNewOwnershipLabel('');
    setEditingOwnership(null);
  };

  const handleAddOwnership = async (deptId) => {
    if (!newOwnershipLabel.trim()) { toast.error('Ownership label is required'); return; }
    try {
      await api.post('/department-ownerships', { department_id: deptId, label: newOwnershipLabel.trim() });
      toast.success('Ownership added');
      setNewOwnershipLabel('');
      setAddingOwnership(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add ownership');
    }
  };

  const handleDeleteOwnership = async (ownershipId) => {
    try {
      await api.delete(`/department-ownerships/${ownershipId}`);
      toast.success('Ownership removed');
      load();
    } catch {
      toast.error('Failed to remove ownership');
    }
  };

  const handleEditOwnership = async (ownershipId) => {
    if (!editOwnershipLabel.trim()) { toast.error('Label is required'); return; }
    try {
      await api.put(`/department-ownerships/${ownershipId}`, { label: editOwnershipLabel.trim() });
      toast.success('Ownership updated');
      setEditingOwnership(null);
      setEditOwnershipLabel('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update ownership');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Departments</h1>
          <p className="text-xs text-surface-500 mt-0.5">
            Manage departments and their ownership details
          </p>
        </div>
        <button onClick={() => { setEditing(null); setName(''); setShowModal(true); }} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Add Department
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
          ) : departments.length === 0 ? (
            <div className="text-center py-8 text-sm text-surface-400">No departments found</div>
          ) : (
            departments.map(dept => {
              const isExpanded = expandedDept === dept.id;
              const ownerships = dept.ownerships || [];

              return (
                <div key={dept.id} className="transition-colors">
                  {/* Department Row */}
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-800/30 group">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => toggleExpand(dept.id)}
                        className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors shrink-0"
                        title={isExpanded ? 'Collapse' : 'Expand to manage ownership'}
                      >
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-surface-500" />
                          : <ChevronRight className="w-4 h-4 text-surface-400" />
                        }
                      </button>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                          {dept.name}
                        </span>
                        {ownerships.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ownerships.map(o => (
                              <span
                                key={o.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                                  bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400
                                  border border-brand-200 dark:border-brand-800/50"
                              >
                                <Tag className="w-2.5 h-2.5" />
                                {o.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {ownerships.length === 0 && (
                          <p className="text-[10px] text-surface-400 mt-0.5 italic">No ownership details</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => { setEditing(dept); setName(dept.name); setShowModal(true); }}
                        className="btn-ghost btn-xs p-1.5"
                        title="Edit department name"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDept(dept.id)}
                        className="btn-ghost btn-xs p-1.5 text-red-500"
                        title="Deactivate department"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Ownership Panel */}
                  {isExpanded && (
                    <div className="bg-surface-50/50 dark:bg-surface-800/20 border-t border-surface-100 dark:border-surface-800/50
                      px-4 py-3 ml-8 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider">
                          Ownership Details
                        </h3>
                        <button
                          onClick={() => { setAddingOwnership(dept.id); setNewOwnershipLabel(''); }}
                          className="btn-secondary btn-xs gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>

                      {ownerships.length === 0 && addingOwnership !== dept.id && (
                        <p className="text-xs text-surface-400 py-2 text-center italic">
                          No ownership entries yet. Click "Add" to create one.
                        </p>
                      )}

                      {ownerships.length > 0 && (
                        <div className="space-y-1.5">
                          {ownerships.map(o => (
                            <div
                              key={o.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                                bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700
                                group/item hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
                            >
                              {editingOwnership === o.id ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    className="input text-sm flex-1"
                                    value={editOwnershipLabel}
                                    onChange={e => setEditOwnershipLabel(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleEditOwnership(o.id); if (e.key === 'Escape') setEditingOwnership(null); }}
                                    autoFocus
                                  />
                                  <button onClick={() => handleEditOwnership(o.id)} className="btn-primary btn-xs">Save</button>
                                  <button onClick={() => setEditingOwnership(null)} className="btn-ghost btn-xs">Cancel</button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <Tag className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                                    <span className="text-sm text-surface-700 dark:text-surface-300 truncate">{o.label}</span>
                                  </div>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { setEditingOwnership(o.id); setEditOwnershipLabel(o.label); }}
                                      className="btn-ghost btn-xs p-1"
                                      title="Edit"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteOwnership(o.id)}
                                      className="btn-ghost btn-xs p-1 text-red-500 hover:text-red-600"
                                      title="Remove"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add ownership inline form */}
                      {addingOwnership === dept.id && (
                        <div className="flex items-center gap-2 mt-2 animate-fade-in">
                          <input
                            className="input text-sm flex-1"
                            value={newOwnershipLabel}
                            onChange={e => setNewOwnershipLabel(e.target.value)}
                            placeholder="e.g. Design, development. Ownership lies with GCC"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddOwnership(dept.id);
                              if (e.key === 'Escape') { setAddingOwnership(null); setNewOwnershipLabel(''); }
                            }}
                            autoFocus
                          />
                          <button onClick={() => handleAddOwnership(dept.id)} className="btn-primary btn-xs">Add</button>
                          <button
                            onClick={() => { setAddingOwnership(null); setNewOwnershipLabel(''); }}
                            className="btn-ghost btn-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Department Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Department' : 'Add Department'}
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSaveDept} className="btn-primary btn-sm">{editing ? 'Update' : 'Create'}</button>
          </>
        }
      >
        <div>
          <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Name *</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Department name"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSaveDept(); }}
          />
        </div>
      </Modal>
    </div>
  );
}
