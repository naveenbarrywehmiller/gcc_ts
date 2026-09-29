import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/toast';
import Modal from '../../components/ui/Modal';
import FieldHelp from '../../components/ui/FieldHelp';
import ProjectStatus from '../../components/ProjectStatus';

const fields = [
  ['project_code', 'Project Code'], ['project_name', 'Project Name'], ['gcc_project_code', 'GCC - Project Code'],
  ['priority', 'Priority'], ['product', 'Product'], ['product_module', 'Product module'],
  ['requested_by', 'Requested By'], ['responsibility', 'Responsibility'],
  ['input_received_date', 'Input Received Date', 'date'], ['start_date', 'Start Date', 'date'],
  ['target_date', 'Target Date', 'date'], ['delivered_date', 'Delivered Date', 'date'],
  ['budget_hours', 'Budget Hours', 'number'], ['customer_name', 'Customer Name'],
];
export default function AdminProjects() {
  const toast = useToast();
  const cache = useQueryClient();
  const fileRef = useRef(null);
  const [filters, setFilters] = useState({ search: '', division_id: '', subdivision_id: '', project_status: '', active: '1' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);
  const options = useQuery({ queryKey: ['project-options'], queryFn: () => api.get('/projects/options').then(r => r.data) });
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-projects', filters, page], queryFn: () => api.get('/projects', { params: { ...filters, page, limit: 25 } }).then(r => r.data) });
  const divisions = options.data?.divisions || [];
  const locations = options.data?.subdivisions || [];
  const dropdowns = [
    ['activity', 'Work Type', options.data?.activities || []],
    ['team_type', 'Dedicated/Flex', options.data?.supporting_categories || []],
  ];
  const updateFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value, ...(key === 'division_id' ? { subdivision_id: '' } : {}) })); setPage(1); };
  const refresh = () => { cache.invalidateQueries({ queryKey: ['admin-projects'] }); cache.invalidateQueries({ queryKey: ['timesheet'] }); };
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      if (form.id) await api.put(`/projects/${form.id}`, form); else await api.post('/projects', form);
      setForm(null); refresh(); toast.success('Project saved');
    } catch (err) { toast.error(err.response?.data?.error || 'Unable to save project'); }
    finally { setBusy(false); }
  };
  const download = async template => {
    setBusy(true);
    try {
      const res = await api.get('/projects/export', { params: { ...filters, template }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data); const link = document.createElement('a');
      link.href = url; link.download = template ? 'project-template.xlsx' : 'projects.xlsx'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Download failed'); } finally { setBusy(false); }
  };
  const importFile = async e => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true);
    const body = new FormData(); body.append('file', file);
    if (filters.division_id) body.append('division_id', filters.division_id);
    try {
      const res = await api.post('/import/projects', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Imported ${res.data.imported} projects`); refresh(); setPage(1);
    } catch (err) { setErrors([err.response?.data?.error || 'Import failed', ...(err.response?.data?.errors || [])]); }
    finally { setBusy(false); e.target.value = ''; }
  };
  const deactivate = async p => {
    if (!confirm(`Deactivate ${p.project_code}?`)) return;
    setBusy(true);
    try { await api.delete(`/projects/${p.id}`); refresh(); toast.success('Project deactivated'); }
    catch (err) { toast.error(err.response?.data?.error || 'Unable to deactivate'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-bold">Projects</h1>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="btn-secondary btn-sm" onClick={() => download(true)}>Download Template</button>
        <button disabled={busy} className="btn-secondary btn-sm" onClick={() => download(false)}>Export Projects</button>
        <button disabled={busy} className="btn-secondary btn-sm" onClick={() => fileRef.current.click()}>Import Excel</button>
        <button disabled={busy || options.isLoading} className="btn-primary btn-sm" onClick={() => setForm({ project_status: 'Inprogress', division_id: filters.division_id || (divisions.length === 1 ? divisions[0].id : ''), subdivision_id: '' })}>Add Project</button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv" onChange={importFile} />
      </div>
    </div>
    <p className="text-xs text-surface-500">Import creates new projects only. Duplicate codes reject the entire file. Select a division below when it is not supplied in the file.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <input className="input" aria-label="Search projects" placeholder="Search projects…" value={filters.search} onChange={e => updateFilter('search', e.target.value)} />
      <select className="input" aria-label="Filter division" value={filters.division_id} onChange={e => updateFilter('division_id', e.target.value)}><option value="">All assigned divisions</option>{divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <select className="input" aria-label="Filter location" value={filters.subdivision_id} onChange={e => updateFilter('subdivision_id', e.target.value)}><option value="">All locations</option>{locations.filter(s => !filters.division_id || s.division_id === Number(filters.division_id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="input" aria-label="Filter status" value={filters.project_status} onChange={e => updateFilter('project_status', e.target.value)}><option value="">All statuses</option>{['Inprogress', 'Hold', 'Completed'].map(s => <option key={s}>{s}</option>)}</select>
      <select className="input" aria-label="Filter active projects" value={filters.active} onChange={e => updateFilter('active', e.target.value)}><option value="1">Active projects</option><option value="0">Inactive projects</option><option value="all">All projects</option></select>
    </div>
    {(isError || options.isError) && <p role="alert" className="text-red-600">Unable to load projects. Please refresh and try again.</p>}
    <div className="table-container overflow-x-auto"><table className="w-full text-sm">
      <thead><tr>{['Project Code', 'Project Name', 'Division', 'Location', 'Status', 'Budget Hours', 'Actions'].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
      <tbody>{data?.projects.map(p => <tr key={p.id} className="border-t border-surface-200 dark:border-surface-700">
        <td className="p-3">{p.project_code}</td><td className="p-3">{p.project_name}</td><td className="p-3">{p.division_name || 'Unassigned'}</td><td className="p-3">{p.subdivision_name || '—'}</td>
        <td className="p-3"><ProjectStatus status={p.project_status} /></td><td className="p-3">{p.budget_hours ?? '—'}</td>
        <td className="p-3"><button className="btn-secondary btn-sm mr-2" disabled={busy} onClick={() => setForm({ ...p })}>Edit</button>{p.active === 1 && <button disabled={busy} className="text-red-600 text-xs" onClick={() => deactivate(p)}>Deactivate</button>}</td>
      </tr>)}{!data?.projects.length && <tr><td colSpan={7} className="p-6 text-center">{isLoading ? 'Loading…' : 'No matching projects'}</td></tr>}</tbody>
    </table></div>
    <div className="flex items-center justify-between"><span className="text-sm">{data?.total || 0} projects · Page {page} of {Math.max(1, Math.ceil((data?.total || 0) / 25))}</span><div className="flex gap-2"><button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="btn-secondary btn-sm" disabled={page * 25 >= (data?.total || 0)} onClick={() => setPage(p => p + 1)}>Next</button></div></div>
    <Modal isOpen={!!form} onClose={() => !busy && setForm(null)} title={form?.id ? 'Edit Project' : 'Add Project'} size="xl">
      {form && <form onSubmit={save} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(([key, label, type = 'text']) => <div key={key}><label htmlFor={`project-${key}`} className="block text-xs font-medium mb-1">{label}{['project_code', 'project_name'].includes(key) ? ' *' : ''}<FieldHelp label={label} /></label><input id={`project-${key}`} className="input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} maxLength={1000} required={['project_code', 'project_name'].includes(key)} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}
        {dropdowns.map(([key, label, items]) => <div key={key}>
          <label htmlFor={`project-${key}`} className="block text-xs font-medium mb-1">{label}<FieldHelp label={label} /></label>
          <select id={`project-${key}`} className="input" disabled={options.isLoading || options.isError} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}>
            <option value="">Select {label}</option>
            {form[key] && !items.some(item => item.name === form[key]) && <option value={form[key]}>{form[key]} (current value)</option>}
            {items.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </div>)}
        <div><label className="block text-xs mb-1" htmlFor="project-status">Status<FieldHelp label="Status" /></label><select id="project-status" className="input" value={form.project_status} onChange={e => setForm({ ...form, project_status: e.target.value })}>{['Inprogress', 'Hold', 'Completed'].map(s => <option key={s}>{s}</option>)}</select></div>
        <div><label className="block text-xs mb-1" htmlFor="project-division">Division<FieldHelp label="Division" /></label><select id="project-division" className="input" value={form.division_id || ''} onChange={e => setForm({ ...form, division_id: e.target.value, division: '', subdivision_id: '' })}><option value="">Select division</option>{divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label className="block text-xs mb-1" htmlFor="project-location">Location<FieldHelp label="Location" /></label><select id="project-location" className="input" value={form.subdivision_id || ''} onChange={e => setForm({ ...form, subdivision_id: e.target.value })}><option value="">No location</option>{locations.filter(s => s.division_id === Number(form.division_id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        {form.id && <label className="flex gap-2 items-center"><input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />Active project</label>}
      </div><button disabled={busy} className="btn-primary" type="submit">{busy ? 'Saving…' : 'Save Project'}</button></form>}
    </Modal>
    <Modal isOpen={!!errors} onClose={() => setErrors(null)} title="Project import failed"><ul className="list-disc pl-5 space-y-2 text-sm">{errors?.map((error, i) => <li key={i}>{error}</li>)}</ul></Modal>
  </div>;
}
