export default function ProjectStatus({ status }) {
  if (!status) return null;
  const colors = { Inprogress: 'bg-blue-100 text-blue-800', Hold: 'bg-amber-100 text-amber-800', Completed: 'bg-green-100 text-green-800' };
  return <span className={`inline-block text-xs rounded-full px-2 py-0.5 ${colors[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
}
