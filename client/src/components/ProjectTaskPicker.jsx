import MultiSelectPicker from './ui/MultiSelectPicker';

export default function ProjectTaskPicker({ classification, tasks, selected, onChange, readOnly }) {
  const items = tasks.filter(t => t.classification === classification && (t.active || selected.includes(t.id))).map(t => ({
    id: t.id, label: t.task_category, disabled: !t.active && !selected.includes(t.id),
    description: `ID ${t.id}${!t.active ? ' · Inactive' : ''}${t.estimated_hours != null ? ` · ${t.estimated_hours} estimated hours` : ''}${t.task_description ? `\n${t.task_description}` : ''}`,
  }));
  return <MultiSelectPicker label={`${classification} tasks`} items={items} selected={selected} onChange={onChange} readOnly={readOnly} empty="No matching tasks" />;
}
