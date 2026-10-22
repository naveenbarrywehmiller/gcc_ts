import MultiSelectPicker from '../../components/ui/MultiSelectPicker';
import FieldHelp from '../../components/ui/FieldHelp';
import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/toast';
import { useAuth } from '../../contexts/auth';
import { hasPermission } from '../../utils/permissions';
import Modal from '../../components/ui/Modal';
import { LoadingSkeleton } from '../../components/ui/Skeleton';
import TimesheetHistoryModal from '../../components/TimesheetHistoryModal';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX, Dice5, Eye, EyeOff, Copy, Building2, AlertTriangle, Power, UserPlus, UserMinus, History } from 'lucide-react';

export default function AdminUsers() {
  const toast = useToast();
  const { user: currentUser, isSystemAdmin } = useAuth();
  const canManage = hasPermission(currentUser, 'users');
  const cache = useQueryClient();
  const [managedDivisions, setManagedDivisions] = useState([]);
  const canEditAccount = user => user.can_manage;
  const canViewHistory = user => isSystemAdmin || managedDivisions.some(d => d.id === user.division_id);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [, setSubdivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [supportingCategories, setSupportingCategories] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters and Sort State
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    platform_id: '',
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
    division_id: '', department_id: '', supporting_category_id: '', employee_id: '', job_title_id: ''
  });
  const [formPlatformIds, setFormPlatformIds] = useState([]);
  const [formDivisionIds, setFormDivisionIds] = useState([]);
  const [originalDivisionIds, setOriginalDivisionIds] = useState([]);
  const [showPassword, setShowPassword] = useState(false);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // Assign/Release confirmation modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignAction, setAssignAction] = useState(''); // 'assign' or 'release'
  const [assigning, setAssigning] = useState(false);

  // Timesheet history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);

  const loadData = useCallback(() => {
    
    const params = {
      search,
      platform_id: filters.platform_id || undefined,
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
      api.get('/supporting-categories'),
      api.get('/projects/options'),
      api.get('/platforms'),
      api.get('/job-titles')
    ]).then(([uRes, divRes, subRes, deptRes, scRes, optionsRes, platformsRes, jobTitlesRes]) => {
      setJobTitles(jobTitlesRes.data.jobTitles);
      setPlatforms(platformsRes.data.platforms);
      setUsers(uRes.data.users);
      setSummary(uRes.data.summary);
      setDivisions(divRes.data.divisions);
      setSubdivisions(subRes.data.subdivisions);
      setDepartments(deptRes.data.departments);
      setSupportingCategories(scRes.data.categories);
      setManagedDivisions(optionsRes.data.divisions);
    }).catch(() => toast.error('Failed to load data')).finally(() => setLoading(false));
  }, [toast, search, filters, sortBy, sortDir]);

  useEffect(() => { 
    // Add debounce for search typing
    const timer = setTimeout(() => {
      loadData(); 
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  const activeCount = users.filter(u => u.active).length;
  const inactiveCount = users.length - activeCount;

  const openCreate = () => {
    setEditing(null);
    const defaultDivision = !isSystemAdmin && managedDivisions.length === 1 ? managedDivisions[0].id : '';
    setForm({ 
      name: '', email: '', password: '', role: 'employee', 
      division_id: defaultDivision, department_id: '', supporting_category_id: '', employee_id: '', job_title_id: ''
    });
    setFormDivisionIds(defaultDivision ? [Number(defaultDivision)] : []);
    setOriginalDivisionIds([]);
    setFormPlatformIds(defaultDivision ? [divisions.find(d => d.id === defaultDivision)?.platform_id].filter(Boolean) : []);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = async (user) => {
    const activeDivisionIds = new Set(divisions.map(d => d.id));
    let assignedDivisionIds = user.division_id && activeDivisionIds.has(Number(user.division_id)) ? [Number(user.division_id)] : [];
    if (user.role === 'admin' || user.role === 'employee') {
      try {
        const res = await api.get(`/users/${user.id}/divisions`);
        // The API resolves legacy defaults and explicitly saved grants consistently.
        assignedDivisionIds = res.data.division_ids.filter(id => activeDivisionIds.has(id));
      } catch {
        toast.error('Unable to load division assignments');
        return;
      }
    }
    setFormPlatformIds([...new Set([...(user.platform_ids || []), ...divisions.filter(d => assignedDivisionIds.includes(d.id)).map(d => d.platform_id)])]);
    setEditing(user);
    setFormDivisionIds(assignedDivisionIds);
    setOriginalDivisionIds(assignedDivisionIds);
    setForm({ 
      name: user.name, 
      email: user.email, 
      password: '', 
      role: user.role, 
      division_id: ['admin', 'employee'].includes(user.role)
        ? (assignedDivisionIds.includes(Number(user.division_id)) ? user.division_id : assignedDivisionIds[0] || '')
        : user.division_id || '',
      department_id: user.department_id || '', 
      supporting_category_id: user.supporting_category_id || '',
      employee_id: user.employee_id || '',
      job_title_id: user.job_title_id || ''
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
    if (!form.job_title_id) {
      toast.error('Job title is required');
      document.getElementById('user-form-job-title')?.focus();
      return;
    }
    try {
      const hasDivisionChoices = form.role === 'admin' || form.role === 'employee';
      if (hasDivisionChoices && formDivisionIds.length === 0) { toast.error('Select at least one division'); return; }
      const payload = { ...form, platform_ids: formPlatformIds };
      if (hasDivisionChoices) {
        payload.division_ids = formDivisionIds;
        payload.division_id = formDivisionIds.includes(Number(form.division_id)) ? form.division_id : formDivisionIds[0];
      }
      if (editing) {
        if (!payload.password) delete payload.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success('User updated');
        if (editing.id === currentUser?.id) {
          window.location.reload();
          return;
        }
      } else {
        if (!form.password) { toast.error('Password is required'); return; }
        await api.post('/users', payload);
        toast.success('User created');
      }
      setShowModal(false);
      cache.invalidateQueries();
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

  const hasDivisionChoices = form.role === 'admin' || form.role === 'employee';
  const editingOwnAdmin = editing?.id === currentUser?.id && editing?.role === 'admin';
  const availableDivisions = isSystemAdmin
    ? divisions
    : form.role === 'employee'
      ? divisions.filter(d => managedDivisions.some(managed => managed.id === d.id) || originalDivisionIds.includes(d.id))
      : managedDivisions;
  const changeDivisions = nextIds => {
    setFormDivisionIds(nextIds);
    if (!nextIds.includes(Number(form.division_id))) setForm(prev => ({ ...prev, division_id: nextIds[0] || '' }));
  };
  const changePlatforms = nextIds => {
    const removed = formDivisionIds.filter(id => !nextIds.includes(divisions.find(d => d.id === id)?.platform_id));
    if (removed.length && !confirm(`Removing this Platform selection will remove ${removed.length} Division assignment(s). Continue?`)) return;
    setFormPlatformIds(nextIds);
    changeDivisions(formDivisionIds.filter(id => !removed.includes(id)));
    if (form.division_id && !nextIds.includes(divisions.find(d => d.id === Number(form.division_id))?.platform_id)) setForm(prev => ({ ...prev, division_id: '' }));
  };
  const platformChoices = [...new Map([...platforms.map(p => [p.id, { id:p.id,label:p.name }]), ...availableDivisions.map(d => [d.platform_id, { id:d.platform_id,label:d.platform_name,disabled:!isSystemAdmin && !managedDivisions.some(m => m.platform_id === d.platform_id) }])]).values()];
  const divisionChoices = availableDivisions.filter(d => formPlatformIds.includes(d.platform_id));

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
      if (user.id === currentUser?.id && hasPermission(currentUser, 'selfPost')) {
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
        {canManage && <div className="flex flex-wrap items-center gap-2">
          <button onClick={openAllAssignedHistory} className="btn-secondary btn-sm" id="view-assigned-history-btn" title="View timesheets for all your assigned users across all weeks">
            <History className="w-4 h-4" /> Assigned Timesheets (All Weeks)
          </button>
          <button disabled={!isSystemAdmin && managedDivisions.length === 0} onClick={openCreate} className="btn-primary btn-sm" id="create-user-btn">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>}
      </div>
      {!canManage && <p className="text-sm text-surface-500">View users across all divisions. Account changes are handled by Admins and System Admins.</p>}

      <section aria-label="Registered users by role" className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[[null, 'Total registered'], ['system admin', 'System Admins'], ['manager', 'Managers'], ['admin', 'Admins'], ['employee', 'Employees'], ['viewer', 'Viewers']].map(([role, label]) =>
            <button key={role || 'total'} type="button" className={`card p-3 sm:p-4 text-left min-h-[88px] hover:border-brand-400 ${filters.role === (role || '') ? 'border-brand-500' : ''}`}
              aria-pressed={filters.role === (role || '')} onClick={() => setFilters(previous => ({ ...previous, role: role || '' }))}>
              <span className="block text-xs text-surface-500 break-words">{label}</span>
              <strong className="block mt-2 text-2xl">{summary ? (role ? summary.by_role[role] || 0 : summary.total) : '—'}</strong>
            </button>)}
        </div>
        <p className="text-xs text-surface-500">Companywide registrations include active and inactive accounts. Select a role to filter the list. Showing {users.length}{summary ? ` of ${summary.total}` : ''} registered users.</p>
      </section>

      {/* Filters */}
      <div className="bg-surface-50 dark:bg-surface-800/50 p-4 rounded-xl border border-surface-200 dark:border-surface-700 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="input pl-9 w-full"
            />
          </div>
          <select className="input" aria-label="Filter users by Platform" value={filters.platform_id} onChange={e => setFilters({ ...filters, platform_id:e.target.value, division_id:'' })}><option value="">All Platforms</option>{platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select aria-label="Filter users by division" value={filters.division_id} onChange={(e) => setFilters({...filters, division_id: e.target.value})} className="input">
            <option value="">All Divisions</option>
            {divisions.filter(d => !filters.platform_id || d.platform_id === Number(filters.platform_id)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Filter users by department" value={filters.department_id} onChange={(e) => setFilters({...filters, department_id: e.target.value})} className="input">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Filter users by supporting category" value={filters.supporting_category_id} onChange={(e) => setFilters({...filters, supporting_category_id: e.target.value})} className="input">
            <option value="">All Supporting Categories</option>
            {supportingCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="Filter users by role" value={filters.role} onChange={(e) => setFilters({...filters, role: e.target.value})} className="input">
            <option value="">All Roles</option>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
            <option value="system admin">System Admin</option>
          </select>
          <select aria-label="Filter users by status" value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} className="input">
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <div className="col-span-1 lg:col-span-2 flex gap-2">
            <select aria-label="Sort users by" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input flex-1">
              <option value="name">Sort by Name</option>
              <option value="email">Sort by Email</option>
              <option value="role">Sort by Role</option>
              <option value="division">Sort by Division</option>
              <option value="department">Sort by Department</option>
              <option value="supporting_category">Sort by Supp. Category</option>
              <option value="status">Sort by Status</option>
              <option value="created_at">Sort by Date Created</option>
            </select>
            <select aria-label="Sort direction" value={sortDir} onChange={(e) => setSortDir(e.target.value)} className="input w-32">
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Job Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Division</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Admin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                {canManage && <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>}
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
                  <td className="px-4 py-3 text-sm text-surface-500">{user.job_title_name || 'Not assigned'}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-surface-500"><span className="block text-xs text-surface-500">{user.platforms?.map(p => p.name).join(', ') || 'Unmapped'}</span>{user.division_name || user.division || '—'}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{user.department_name || '—'}</td>
                  <td className="px-4 py-3 text-sm">{getAdminDisplay(user)}</td>
                  <td className="px-4 py-3">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><UserCheck className="w-3.5 h-3.5" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-surface-400"><UserX className="w-3.5 h-3.5" /> Inactive</span>
                    )}
                  </td>
                  {canManage && <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Admin ownership actions — for other active users */}
                      {user.id !== currentUser?.id && user.active && canViewHistory(user) && (
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
                      <button disabled={!canViewHistory(user)} onClick={() => openHistoryModal(user)} className="btn-ghost btn-xs p-1.5" title="Timesheet History">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {isSystemAdmin && user.role === 'admin' && (
                        <button onClick={() => openEdit(user)} className="btn-ghost btn-xs p-1.5" title="Manage Divisions">
                          <Building2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button disabled={!canEditAccount(user)} onClick={() => openEdit(user)} className="btn-ghost btn-xs p-1.5" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={!canEditAccount(user) || user.id === currentUser.id || user.role === 'system admin'}
                        className={`btn-ghost btn-xs p-1.5 ${user.active ? 'text-amber-500 hover:text-amber-600' : 'text-emerald-500 hover:text-emerald-600'}`}
                        title={user.active ? 'Deactivate User' : 'Activate User'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(user)}
                        disabled={!canEditAccount(user) || user.id === currentUser.id || user.role === 'system admin'}
                        className="btn-ghost btn-xs p-1.5 text-red-500 hover:text-red-600"
                        title="Permanently Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>}
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
            <label htmlFor="user-form-name" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Name *<FieldHelp label="Team Member name" /></label>
            <input id="user-form-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </div>
          <div>
            <label htmlFor="user-form-email" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Email *</label>
            <input id="user-form-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" />
          </div>
          <div>
            <label htmlFor="user-form-employee-id" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Employee ID<FieldHelp label="Employee - ID" /></label>
            <input id="user-form-employee-id" className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. EMP-001" />
          </div>
          <div>
            <label htmlFor="user-form-job-title" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Job Title *</label>
            <select id="user-form-job-title" required aria-describedby="job-title-help" className="input" value={form.job_title_id} onChange={e => setForm({ ...form, job_title_id: e.target.value })}>
              <option value="">Select job title</option>
              {form.job_title_id && !jobTitles.some(title => title.id === Number(form.job_title_id)) && <option value={form.job_title_id}>{editing?.job_title_name} (inactive)</option>}
              {jobTitles.map(title => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
            <p id="job-title-help" className="mt-1 text-xs text-surface-500 dark:text-surface-400">{jobTitles.length ? 'Select a title. You can update it when the person’s position changes.' : 'No active job titles. Ask a Manager or System Admin to add one in Job Title.'}</p>
          </div>
          <div>
            <label htmlFor="user-form-password" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Password {editing ? '(leave blank to keep current)' : '*'}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="user-form-password"
                  className="input pr-20"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {form.password && (
                    <button
                      type="button"
                      aria-label="Copy password"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="user-form-role" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Role</label>
              <select id="user-form-role" disabled={!isSystemAdmin} className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Employee</option>
                {(isSystemAdmin || form.role === 'manager') && <option value="manager">Manager</option>}
                {(isSystemAdmin || form.role === 'admin') && <option value="admin">Admin</option>}
                {isSystemAdmin && <option value="system admin">System Admin</option>}
                {(isSystemAdmin || form.role === 'viewer') && <option value="viewer">Viewer</option>}
              </select>
              {!isSystemAdmin && <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">Only a System Admin can change privileged roles.</p>}
            </div>
            <div>
              <label htmlFor="user-form-supporting-category" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Dedicated/Flex<FieldHelp label="Dedicated / Flex" /></label>
              <select id="user-form-supporting-category" className="input" value={form.supporting_category_id} onChange={(e) => setForm({ ...form, supporting_category_id: e.target.value })}>
                <option value="">— Select —</option>
                {form.supporting_category_id && !supportingCategories.some(d => d.id === Number(form.supporting_category_id)) && <option value={form.supporting_category_id}>{editing?.supporting_category_name} (inactive)</option>}
                {supportingCategories.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
          </div>
          <MultiSelectPicker label="Platforms" items={platformChoices} selected={formPlatformIds} onChange={changePlatforms} readOnly={editingOwnAdmin && !isSystemAdmin} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={hasDivisionChoices ? 'sm:col-span-2 min-w-0' : 'min-w-0'}>
              {hasDivisionChoices ? (
                <fieldset disabled={editingOwnAdmin && !isSystemAdmin}>
                  <legend className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Divisions *</legend>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">{form.role === 'admin' ? 'Select the divisions this admin can manage.' : 'Select the divisions this employee can book time in.'} Mark one as the primary division.</p>
                  <MultiSelectPicker label="Divisions" items={divisionChoices.map(d => ({ id: d.id, label: d.name, description: d.platform_name, disabled: !isSystemAdmin && !managedDivisions.some(m => m.id === d.id) }))} selected={formDivisionIds} onChange={changeDivisions} readOnly={editingOwnAdmin && !isSystemAdmin} renderExtra={d => formDivisionIds.includes(d.id) && <label className="flex min-h-11 items-center gap-2 text-xs"><input type="radio" name="primary-user-division" aria-label={`Primary division: ${d.label}`} checked={Number(form.division_id) === d.id} onChange={() => setForm(prev => ({ ...prev, division_id: d.id }))} />Primary</label>} />
                </fieldset>
              ) : (
                <label htmlFor="user-form-division" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Division<FieldHelp label="Division" /></label>
              )}
              {!hasDivisionChoices && (
                <select id="user-form-division" className="input" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {form.division_id && !availableDivisions.some(d => d.id === Number(form.division_id)) && <option value={form.division_id}>{editing?.division_name || editing?.division} (current)</option>}
                  {divisionChoices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
            <div className="min-w-0">
              <label htmlFor="user-form-department" className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Department</label>
              <select id="user-form-department" className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">— Select —</option>
                {form.department_id && !departments.some(d => d.id === Number(form.department_id)) && <option value={form.department_id}>{editing?.department_name} (inactive)</option>}
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
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
              <li>The account will be anonymized and removed from the user list</li>
              <li>All historical records will be preserved under [Deleted User]</li>
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
