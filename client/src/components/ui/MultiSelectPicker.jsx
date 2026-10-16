import { useId, useState } from 'react';

// Shared filtered-selection behavior for project tasks, Platforms, Divisions and users.
export default function MultiSelectPicker({ label, items, selected, onChange, readOnly = false, empty = 'No matching items', renderExtra }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const matching = items.filter(item => (!selectedOnly || selected.includes(item.id)) &&
    `${item.id} ${item.label} ${item.description || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="min-w-0 space-y-2 rounded-lg border border-surface-200 dark:border-surface-700 p-3" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="text-sm font-semibold">{label} <span className="text-surface-500" aria-live="polite">({selected.length} selected)</span></h3>
    <input aria-label={`Search ${label}`} className="input" placeholder="Search name, number or description…" value={search} onChange={e => setSearch(e.target.value)} />
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />Show selected only</label>
    {!readOnly && <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary btn-sm" disabled={!matching.some(item => !item.disabled && !selected.includes(item.id))} onClick={() => onChange([...new Set([...selected, ...matching.filter(item => !item.disabled).map(item => item.id)])])}>Select filtered</button>
      <button type="button" className="btn-ghost btn-sm" disabled={!matching.some(item => !item.disabled && selected.includes(item.id))} onClick={() => onChange(selected.filter(id => !matching.some(item => item.id === id && !item.disabled)))}>Clear filtered</button>
    </div>}
    <div className="max-h-60 overflow-y-auto space-y-1" role="group" aria-label={`${label} choices`}>
      {matching.map(item => <div key={item.id} className="flex flex-wrap min-w-0 items-center gap-2 rounded p-2 hover:bg-surface-50 dark:hover:bg-surface-800">
        <label className="flex min-w-0 flex-1 min-h-11 items-start gap-3 text-sm cursor-pointer">
          <input className="mt-1 shrink-0" type="checkbox" disabled={readOnly || item.disabled} checked={selected.includes(item.id)} onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
          <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">{item.label}</span>{item.description && <span className="block text-xs text-surface-500 whitespace-pre-line">{item.description}</span>}</span>
        </label>
        {renderExtra?.(item)}
      </div>)}
      {!matching.length && <p className="p-2 text-sm text-surface-500">{empty}</p>}
    </div>
  </section>;
}
