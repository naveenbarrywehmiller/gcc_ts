import fields from '../data/timesheetFields.json';
import FieldHelp from './ui/FieldHelp';

export default function TimesheetDetails({ value, onChange, readOnly = false, description }) {
  const render = ({ key, label, type }) => <div key={key} className="min-w-0">
    <label className="block text-xs font-medium mb-1" htmlFor={`detail-${key}`}>{label}<FieldHelp label={label} /></label>
    {readOnly ? <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{value[key] ?? '—'}</p> : type === 'textarea' ?
      <textarea id={`detail-${key}`} className="input" maxLength={4000} value={value[key] ?? ''} onChange={e => onChange({ ...value, [key]: e.target.value })} /> :
      <input id={`detail-${key}`} className="input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} maxLength={4000}
        value={value[key] ?? ''} onChange={e => onChange({ ...value, [key]: e.target.value })} />}
  </div>;
  return <div className="space-y-4 border-t pt-4">
    {readOnly && description && <div><p className="text-xs font-medium mb-1">Description</p><p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{description}</p></div>}
    <p className="text-xs text-surface-500">Optional details for this weekly project/task row. Saved with its hours.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{fields.slice(0, 3).map(render)}</div>
    <details className="rounded-lg border border-surface-300 dark:border-surface-700 p-3">
      <summary className="cursor-pointer font-medium text-sm">Additional Details</summary>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">{fields.slice(3).map(render)}</div>
    </details>
  </div>;
}
