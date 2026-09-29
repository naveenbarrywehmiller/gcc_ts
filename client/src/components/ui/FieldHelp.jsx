import { useId } from 'react';
import tips from '../../data/tooltips.json';

export default function FieldHelp({ label }) {
  const id = useId();
  const text = tips[label];
  if (!text) return null;
  return <span className="relative inline-flex group ml-1 align-middle">
    <button type="button" aria-label={`Help for ${label}`} aria-describedby={id} className="text-xs rounded-full border border-surface-400 w-4 h-4 text-surface-500 focus:outline focus:outline-2">?</button>
    <span id={id} role="tooltip" className="hidden group-hover:block group-focus-within:block absolute bottom-full left-0 mb-1 w-56 p-2 rounded bg-surface-900 text-white text-xs font-normal z-50 shadow-lg">{text}</span>
  </span>;
}
