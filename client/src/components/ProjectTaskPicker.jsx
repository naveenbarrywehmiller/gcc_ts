import { useState } from 'react';

export default function ProjectTaskPicker({ classification, tasks, selected, onChange, readOnly }) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const matching = tasks.filter(t => t.classification === classification && (t.active || selected.includes(t.id)) &&
    (!selectedOnly || selected.includes(t.id)) && `${t.id} ${t.task_category} ${t.task_description || ''}`.toLowerCase().includes(search.toLowerCase()));
  const id = classification === 'Billable' ? 'billable-tasks' : 'non-billable-tasks';
  return <section className="min-w-0 space-y-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="text-sm font-semibold">{classification} tasks <span className="text-surface-500">({selected.length} selected)</span></h3>
    <input id={`${id}-search`} aria-label={`Search ${classification} tasks`} className="input" placeholder="Search name, number or description…" value={search} onChange={e => setSearch(e.target.value)} />
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />Show selected only</label>
    {!readOnly && <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary btn-sm" disabled={!matching.some(t => t.active && !selected.includes(t.id))} onClick={() => onChange([...new Set([...selected, ...matching.filter(t => t.active).map(t => t.id)])])}>Select filtered</button>
      <button type="button" className="btn-ghost btn-sm" disabled={!matching.some(t => selected.includes(t.id))} onClick={() => onChange(selected.filter(id => !matching.some(t => t.id === id)))}>Clear filtered</button>
    </div>}
    <div className="max-h-60 overflow-y-auto space-y-1" role="group" aria-label={`${classification} task choices`}>
      {matching.map(t => <label key={t.id} className="flex min-h-11 items-start gap-3 rounded p-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-sm cursor-pointer">
        <input className="mt-1 shrink-0" type="checkbox" disabled={readOnly || (!t.active && !selected.includes(t.id))} checked={selected.includes(t.id)} onChange={e => onChange(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} />
        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">{t.task_category}</span><span className="block text-xs text-surface-500">ID {t.id}{!t.active ? ' · Inactive' : ''}{t.estimated_hours != null ? ` · ${t.estimated_hours} estimated hours` : ''}</span>{t.task_description && <span className="block text-xs text-surface-500">{t.task_description}</span>}</span>
      </label>)}
      {!matching.length && <p className="p-2 text-sm text-surface-500">No matching tasks</p>}
    </div>
  </section>;
}
