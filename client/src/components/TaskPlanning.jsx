import { taskPlanningFields } from '../utils/taskPlanningFields';

export default function TaskPlanning({ task }) {
  if (!task) return null;
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-sm">
    {taskPlanningFields.map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-xs text-surface-500">{label}</dt><dd className="break-words">{task[key] ?? '—'}</dd></div>)}
  </dl>;
}
