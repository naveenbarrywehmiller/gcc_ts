export default function TimesheetDescription({ entry }) {
  return <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
    <p>{entry.project_description || entry.description || '—'}</p>
    {entry.project_description && entry.description && entry.description !== entry.project_description &&
      <p className="mt-2"><span className="font-medium">Daily note: </span>{entry.description}</p>}
  </div>;
}
