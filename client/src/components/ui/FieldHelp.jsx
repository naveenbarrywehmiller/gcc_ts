import { useId } from 'react';
import tips from '../../data/tooltips.json';

export default function FieldHelp({ label }) {
  const id = useId();
  const text = tips[label];
  if (!text) return null;
  return <span className="relative inline-flex group ml-1 align-middle">
    <button type="button" aria-label={`Help for ${label}`} aria-describedby={id} className="text-xs rounded-full border border-surface-400 w-6 h-6 text-surface-500 focus:outline focus:outline-2">?</button>
    <span id={id} role="tooltip" className="hidden group-hover:block group-focus-within:block fixed inset-x-4 bottom-4 w-auto sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-1 sm:w-56 p-2 rounded bg-surface-900 text-white text-xs font-normal z-50 shadow-lg">{text}</span>
  </span>;
}
