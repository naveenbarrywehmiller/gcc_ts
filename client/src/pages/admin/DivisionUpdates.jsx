import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/toast';
import { useAuth } from '../../contexts/auth';
import FieldHelp from '../../components/ui/FieldHelp';

function RecordForm({ record, divisionId, month, kind }) {
  const [form, setForm] = useState({ travel_visa: record?.travel_visa || '', open_positions: record?.open_positions ?? '', new_joiners: record?.new_joiners ?? '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const cache = useQueryClient();
  const travel = kind === 'travel';
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      await api.put('/division-updates', { division_id: divisionId, month, ...(travel ? { travel_visa: form.travel_visa } : { open_positions: form.open_positions, new_joiners: form.new_joiners }) });
      await cache.invalidateQueries({ queryKey: ['division-updates', divisionId, month] });
      toast.success('Monthly record saved');
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-4">
    {travel ? <div><label htmlFor="travel-visa" className="block text-sm mb-2">Travel &amp; VISA<FieldHelp label="Travel & VISA" /></label><textarea id="travel-visa" rows={7} maxLength={10000} className="input" value={form.travel_visa} onChange={e => setForm({ ...form, travel_visa: e.target.value })} /></div> :
      <div className="grid grid-cols-2 gap-4">{[['open_positions', 'Open Position'], ['new_joiners', 'New Joiners']].map(([key, label]) => <div key={key}><label htmlFor={key} className="block text-sm mb-2">{label}<FieldHelp label="Open Position / New Joiners" /></label><input id={key} className="input" type="number" min="0" step="1" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}</div>}
    <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    {record?.updated_at && <p className="text-xs text-surface-500">Last saved: {record.updated_at} UTC</p>}
  </form>;
}

export default function DivisionUpdates({ kind }) {
  const { user } = useAuth();
  const [divisionId, setDivisionId] = useState('');
  const [month, setMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; });
  const options = useQuery({ queryKey: ['project-options', user.id], queryFn: () => api.get('/projects/options').then(r => r.data) });
  const divisions = options.data?.division_update_divisions || [];
  const selected = divisionId || (divisions.length === 1 ? String(divisions[0].id) : '');
  const query = useQuery({ queryKey: ['division-updates', selected, month], enabled: !!selected && !!month,
    queryFn: () => api.get('/division-updates', { params: { division_id: selected, month } }).then(r => r.data) });
  return <div className="max-w-3xl space-y-5"><h1 className="text-xl font-bold">{kind === 'travel' ? 'Travel & VISA' : 'Open Position / New Joiners'}</h1>
    <p className="text-sm text-surface-500">One record per division and month. Select an earlier month to view or update its record.</p>
    <div className="grid grid-cols-2 gap-4"><label className="text-sm">Division<select className="input mt-1" value={selected} onChange={e => setDivisionId(e.target.value)}><option value="">Select division</option>{divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="text-sm">Month<input type="month" className="input mt-1" value={month} onChange={e => setMonth(e.target.value)} /></label></div>
    {(query.isError || options.isError) && <p role="alert" className="text-red-600">Unable to load this record. Please refresh.</p>}
    {query.isLoading && <p>Loading…</p>}
    {selected && month && query.data && !query.isError && <RecordForm key={`${selected}:${month}:${kind}`} record={query.data.record} divisionId={selected} month={month} kind={kind} />}
  </div>;
}
