import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import TimesheetHistoryModal from '../../components/TimesheetHistoryModal';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX, Dice5, Eye, EyeOff, Copy, Key, Building2, AlertTriangle, Power, UserPlus, UserMinus, History } from 'lucide-react';

export default function AdminUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [supportingCategories, setSupportingCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters and Sort State
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    division_id: '',
    subdivision_id: '',
    department_id: '',
    supporting_category_id: '',
    role: '',
    status: 'all'
  });
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ 
    name: '', email: '', password: '', role: 'employee', 
    division_id: '', department_id: '', supporting_category_id: '', employee_id: '' 
  });
  const [showPassword, setShowPassword] = useState(false);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // Division assignment modal
  const [showDivModal, setShowDivModal] = useState(false);
  const [divEditUser, setDivEditUser] = useState(null);
  const [selectedDivisions, setSelectedDivisions] = useState([]);

  // Assign/Release confirmation modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignAction, setAssignAction] = useState(''); // 'assign' or 'release'
  const [assigning, setAssigning] = useState(false);

  // Timesheet history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);

  const loadData = () => {
    setLoading(true);
    
    const params = {
      search,
      division_id: filters.division_id || undefined,
      department_id: filters.department_id || undefined,
      supporting_category_id: filters.supporting_category_id || undefined,
      role: filters.role || undefined,
      active: filters.status === 'active' ? 1 : filters.status === 'inactive' ? 0 : undefined,
      sort_by: sortBy,
      sort_dir: sortDir
    };

    Promise.all([
      api.get('/users', { params }),
      api.get('/divisions'),
      api.get('/subdivisions'),
      api.get('/departments'),
      api.get('/supporting-categories')
    ]).then(([uRes, divRes, subRes, deptRes, scRes]) => {
      setUsers(uRes.data.users);
      setDivisions(divRes.data.divisions);
      setSubdivisions(subRes.data.subdivisions);
      setDepartments(deptRes.data.departments);
      setSupportingCategories(scRes.data.categories);
    }).catch(() => toast.error('Failed to load data')).finally(() => setLoading(false));
  };

  useEffect(() => { 
    // Add debounce for search typing
    const timer = setTimeout(() => {
      loadData(); 
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters, sortBy, sortDir]);

  const activeCount = users.filter(u => u.active).length;
  const inactiveCount = users.length - activeCount;

  const openCreate = () => {
    setEditing(null);
    setForm({ 
      name: '', email: '', password: '', role: 'employee', 
      division_id: '', department_id: '', supporting_category_id: '', employee_id: '' 
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setForm({ 
      name: user.name, 
      email: user.email, 
      password: '', 
      role: user.role, 
      division_id: user.division_id || '', 
      department_id: user.department_id || '', 
      supporting_category_id: user.supporting_category_id || '',
      employee_id: user.employee_id || ''
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const generatePassword = async () => {
    try {
      const res = await api.get('/users/generate-password');
      setForm(prev => ({ ...prev, password: res.data.password }));
      setShowPassword(true);
      toast.success('Password generated');
    } catch {
      toast.error('Failed to generate password');
    }
  };

  const copyPassword = () => {
    if (form.password) {
      navigator.clipboard.writeText(form.password);
      toast.success('Password copied to clipboard');
    }
  };

  const handleSave = async () => {
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success('User updated');
      } else {
        if (!form.password) { toast.error('Password is required'); return; }
        await api.post('/users', form);
        toast.success('User created');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save user');
    }
  };

  const handleToggleActive = async (user) => {
    const action = user.active ? 'deactivate' : 'activate';
    if (!confirm(`${user.active ? 'Deactivate' : 'Activate'} ${user.name}?`)) return;
    try {
      const res = await api.post(`/users/${user.id}/toggle-active`);
      toast.success(res.data.message);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action} user`);
    }
  };

  const openDeleteModal = (user) => {
    setDeleteTarget(user);
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const res = await api.delete(`/users/${deleteTarget.id}/permanent`);
      toast.success(res.data.message);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  // Division assignment
  const openDivisionModal = async (user) => {
    setDivEditUser(user);
    try {
      const res = await api.get(`/users/${user.id}/divisions`);
      setSelectedDivisions(res.data.divisions.map(d => d.id));
    } catch {
      setSelectedDivisions([]);
    }
    setShowDivModal(true);
  };

  const toggleDivision = (divId) => {
    setSelectedDivisions(prev =>
      prev.includes(divId) ? prev.filter(id => id !== divId) : [...prev, divId]
    );
  };

  const saveDivisions = async () => {
    try {
      await api.put(`/users/${divEditUser.id}/divisions`, { division_ids: selectedDivisions });
      toast.success('Divisions updated');
      setShowDivModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update divisions');
    }
  };

  // Admin assign/release
  const openAssignConfirm = (user, action) => {
    setAssignTarget(user);
    setAssignAction(action);
    setShowAssignModal(true);
  };

  const handleAssignRelease = async () => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      if (assignAction === 'assign') {
        const res = await api.post(`/admin-ownership/assign/${assignTarget.id}`);
        toast.success(res.data.message);
      } else {
        const res = await api.post(`/admin-ownership/release/${assignTarget.id}`);
        toast.success(res.data.message);
      }
      setShowAssignModal(false);
      setAssignTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${assignAction} user`);
    } finally {
      setAssigning(false);
    }
  };

  const openHistoryModal = (user) => {
    setHistoryUser(user);
    setShowHistoryModal(true);
  };

  const openAllAssignedHistory = () => {
    setHistoryUser(null);
    setShowHistoryModal(true);
  };

  // Helper to determine admin display
  const getAdminDisplay = (user) => {
    if (!user.admin_id) {
      if (user.id === currentUser?.id) {
        return <span className="text-emerald-600 dark:text-emerald-400 italic font-medium" title="No admin assigned — you can self-post your timesheet">Not Assigned (Self)</span>;
      }
      return <span className="text-surface-400 italic">Not Assigned</span>;
    }
    if (user.admin_id === currentUser?.id) return <span className="text-brand-600 dark:text-brand-400 font-semibold">You</span>;
    return <span className="text-surface-600 dark:text-surface-300">{user.admin_name}</span>;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Users</h1>
          <p className="text-xs text-surface-500 mt-1">
            {activeCount} Active • {inactiveCount} Inactive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAllAssignedHistory} className="btn-secondary btn-sm" id="view-assigned-history-btn" title="View timesheets for all your assigned users across all weeks">
            <History className="w-4 h-4" /> Assigned Timesheets (All Weeks)
          </button>
          <button onClick={openCreate} className="btn-primary btn-sm" id="create-user-btn">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-50 dark:bg-surface-800/50 p-4 rounded-xl border border-surface-200 dark:border-surface-700 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="input pl-9 w-full"
            />
          </div>
          <select value={filters.division_id} onChange={(e) => setFilters({...filters, division_id: e.target.value})} className="input">
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filters.department_id} onChange={(e) => setFilters({...filters, department_id: e.target.value})} className="input">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filters.supporting_category_id} onChange={(e) => setFilters({...filters, supporting_category_id: e.target.value})} className="input">
            <option value="">All Supporting Categories</option>
            {supportingCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.role} onChange={(e) => setFilters({...filters, role: e.target.value})} className="input">
            <option value="">All Roles</option>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} className="input">
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <div className="col-span-1 lg:col-span-2 flex gap-2">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input flex-1">
              <option value="name">Sort by Name</option>
              <option value="email">Sort by Email</option>
              <option value="role">Sort by Role</option>
              <option value="division">Sort by Division</option>
              <option value="department">Sort by Department</option>
              <option value="supporting_category">Sort by Supp. Category</option>
              <option value="status">Sort by Status</option>
              <option value="created_at">Sort by Date Created</option>
            </select>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className="input w-32">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? <LoadingSkeleton /> : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Employee ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Division</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Admin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800/50">
              {users.map(user => (
                <tr key={user.id} className={`hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors ${!user.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{user.name}</span>
                        <span className={`ml-2 badge ${user.role === 'admin' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'}`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.employee_id || '—'}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.division_name || user.division || '—'}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.department_name || '—'}</td>
                  <td className="px-4 py-3 text-sm">{getAdminDisplay(user)}</td>
                  <td className="px-4 py-3">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><UserCheck className="w-3.5 h-3.5" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-surface-400"><UserX className="w-3.5 h-3.5" /> Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Admin ownership actions — for other active users */}
                      {user.id !== currentUser?.id && user.active && (
                        <>
                          {!user.admin_id && (
                            <button onClick={() => openAssignConfirm(user, 'assign')} className="btn-ghost btn-xs p-1.5 text-emerald-500 hover:text-emerald-600" title="Assign to me">
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {user.admin_id === currentUser?.id && (
                            <button onClick={() => openAssignConfirm(user, 'release')} className="btn-ghost btn-xs p-1.5 text-amber-500 hover:text-amber-600" title="Release from me">
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                      {/* Timesheet history */}
                      <button onClick={() => openHistoryModal(user)} className="btn-ghost btn-xs p-1.5" title="Timesheet History">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {user.role === 'admin' && (
                        <button onClick={() => openDivisionModal(user)} className="btn-ghost btn-xs p-1.5" title="Manage Divisions">
                          <Building2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEdit(user)} className="btn-ghost btn-xs p-1.5" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`btn-ghost btn-xs p-1.5 ${user.active ? 'text-amber-500 hover:text-amber-600' : 'text-emerald-500 hover:text-emerald-600'}`}
                        title={user.active ? 'Deactivate User' : 'Activate User'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(user)}
                        className="btn-ghost btn-xs p-1.5 text-red-500 hover:text-red-600"
                        title="Permanently Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && users.length === 0 && (
          <div className="text-center py-8 text-sm text-surface-400">No users found</div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit User' : 'Create User'}
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSave} className="btn-primary btn-sm">
              {editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Email *</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Employee ID</label>
            <input className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. EMP-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Password {editing ? '(leave blank to keep current)' : '*'}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="input pr-20"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {form.password && (
                    <button
                      type="button"
                      onClick={copyPassword}
                      className="p-1.5 rounded text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={generatePassword}
                className="btn-secondary btn-sm shrink-0 gap-1.5"
              >
                <Dice5 className="w-4 h-4" />
                Generate
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Division</label>
              <select className="input" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })}>
                <option value="">— Select —</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Department</label>
              <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">— Select —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Supporting Category</label>
              <select className="input" value={form.supporting_category_id} onChange={(e) => setForm({ ...form, supporting_category_id: e.target.value })}>
                <option value="">— Select —</option>
                {supportingCategories.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Division Assignment Modal */}
      <Modal
        isOpen={showDivModal}
        onClose={() => setShowDivModal(false)}
        title={`Manage Divisions — ${divEditUser?.name || ''}`}
        size="md"
        footer={
          <>
            <button onClick={() => setShowDivModal(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={saveDivisions} className="btn-primary btn-sm">
              <Building2 className="w-4 h-4" /> Save Divisions
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            Select the divisions this admin can manage. They will only see timesheets from their assigned divisions.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {divisions.map(d => (
              <label
                key={d.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedDivisions.includes(d.id)
                    ? 'border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-950/20'
                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDivisions.includes(d.id)}
                  onChange={() => toggleDivision(d.id)}
                  className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* Assign/Release Confirmation Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setAssignTarget(null); }}
        title={assignAction === 'assign' ? 'Assign User' : 'Release User'}
        size="sm"
        footer={
          <>
            <button onClick={() => { setShowAssignModal(false); setAssignTarget(null); }} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={handleAssignRelease}
              disabled={assigning}
              className={`btn-sm px-4 py-2 rounded-lg text-white font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                assignAction === 'assign' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {assignAction === 'assign' ? <UserPlus className="w-4 h-4 inline mr-1.5" /> : <UserMinus className="w-4 h-4 inline mr-1.5" />}
              {assigning ? 'Processing...' : assignAction === 'assign' ? 'Assign to Me' : 'Release'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {assignAction === 'assign' ? (
            <p className="text-sm text-surface-600 dark:text-surface-400">
              Assign <strong className="text-surface-900 dark:text-white">{assignTarget?.name}</strong> to yourself as admin?
            </p>
          ) : (
            <p className="text-sm text-surface-600 dark:text-surface-400">
              Release <strong className="text-surface-900 dark:text-white">{assignTarget?.name}</strong> from your admin assignment? They will become unassigned and another authorized admin can assign them.
            </p>
          )}
        </div>
      </Modal>

      {/* Timesheet History Modal */}
      <TimesheetHistoryModal
        isOpen={showHistoryModal}
        onClose={() => {
          setShowHistoryModal(false);
          setHistoryUser(null);
        }}
        initialUser={historyUser}
        assignedUsers={users.filter(u => u.admin_id === currentUser?.id)}
      />

      {/* Permanent Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }}
        title="Permanently Delete User"
        size="sm"
        footer={
          <>
            <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={handlePermanentDelete}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              className="btn-sm px-4 py-2 rounded-lg text-white font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <Trash2 className="w-4 h-4 inline mr-1.5" />
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">This action cannot be undone!</p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">
                You are about to permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}).
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700">
            <p className="text-xs text-surface-600 dark:text-surface-400">
              <strong>What happens:</strong>
            </p>
            <ul className="text-xs text-surface-500 dark:text-surface-400 mt-1.5 space-y-1 list-disc list-inside">
              <li>The user will be permanently removed from the system</li>
              <li>Their timesheet data will no longer appear in any reports or dashboards</li>
              <li>The user will no longer be able to log in</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Type <strong className="text-red-600 dark:text-red-400">DELETE</strong> to confirm
            </label>
            <input
              className="input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
