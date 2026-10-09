import TimesheetDetails from './TimesheetDetails';
import TimesheetDescription from './TimesheetDescription';

export default function TimesheetEntryTable({ entries }) {
  if (!entries) return <p role="status" className="text-sm text-surface-500">Loading details…</p>;
  return <div className="table-container"><table className="block md:table w-full text-sm">
    <thead className="hidden md:table-header-group"><tr className="text-left text-xs text-surface-500">
      {['Date', 'Project / Task', 'Hours', 'Description'].map(label => <th key={label} className="p-2">{label}</th>)}
    </tr></thead>
    <tbody className="block md:table-row-group divide-y divide-surface-200 dark:divide-surface-800">
      {entries.map(entry => <tr key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 md:table-row md:p-0 align-top">
        <td className="md:p-2 whitespace-nowrap">{entry.work_date}</td>
        <td className="min-w-0 col-span-2 row-start-2 md:p-2"><div className="w-full md:w-64 whitespace-normal [overflow-wrap:anywhere]">
          <p className="font-medium">{entry.project_code ? `${entry.project_code} — ${entry.project_name}` : entry.task_category}</p>
          {entry.project_code && <p className="text-xs text-surface-500">{entry.task_category}</p>}
          {entry.ownership_label && <p className="text-xs text-emerald-600">{entry.ownership_label}</p>}
          <details className="mt-2"><summary className="cursor-pointer min-h-[44px] py-3 text-xs text-brand-600">Review details</summary>
            <TimesheetDetails value={JSON.parse(entry.details_json || '{}')} description={entry.project_description} readOnly />
          </details>
        </div></td>
        <td className="col-start-2 row-start-1 md:p-2 font-semibold">{entry.hours}h</td>
        <td className="min-w-0 col-span-2 row-start-3 md:p-2"><div className="w-full md:w-72"><span className="block md:hidden text-xs font-medium mb-1">Description</span><TimesheetDescription entry={entry} /></div></td>
      </tr>)}
    </tbody>
  </table></div>;
}
