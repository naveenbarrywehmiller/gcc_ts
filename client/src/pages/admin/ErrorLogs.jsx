import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function ErrorLogs() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['system-error-logs'], queryFn: () => api.get('/error-logs').then(r => r.data), retry: false });
  return <div className="space-y-4"><div className="flex justify-between"><h1 className="text-xl font-bold">Error Logs</h1><button className="btn-secondary btn-sm" onClick={() => refetch()}>Refresh</button></div>
    <p className="text-sm text-surface-500">Technical system failures. Oldest entries are removed when the total reaches 100 KB. Business activity remains in Audit Log.</p>
    {isLoading && <p>Loading…</p>}{isError && <p role="alert" className="text-red-600">Unable to load system errors.</p>}
    {data && <p className="text-xs">{data.entries.length} entries · {data.bytes.toLocaleString()} / {data.maxBytes.toLocaleString()} bytes</p>}
    {data?.entries.length === 0 && <p className="p-6 border rounded-lg">No system errors recorded.</p>}
    {data?.entries.map((entry, i) => <details key={`${entry.timestamp}:${i}`} className="border border-surface-300 dark:border-surface-700 rounded-lg p-3"><summary className="cursor-pointer text-sm">{entry.timestamp} · {entry.source} · {entry.type}{entry.code ? ` (${entry.code})` : ''}</summary><pre className="mt-3 text-xs whitespace-pre-wrap break-all">{entry.stack.join('\n') || 'No stack trace available'}</pre></details>)}
  </div>;
}
