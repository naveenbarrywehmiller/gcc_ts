export default function ActiveLabel({ active, children }) {
  const label = active ? 'Active' : 'Inactive';
  return <span className="inline-flex min-w-0 items-baseline gap-2">
    <span role="img" aria-label={label} title={label} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 ${active
      ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-400'
      : 'border-surface-500 dark:border-surface-400'}`} />
    <span className="min-w-0">{children}</span>
  </span>;
}
