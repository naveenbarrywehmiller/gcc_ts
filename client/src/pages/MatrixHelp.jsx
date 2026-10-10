import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Grid2X2, Search } from 'lucide-react';
import { useAuth } from '../contexts/auth';
import api from '../services/api';

const roleNames = { 'system admin': 'System Admin', manager: 'Manager', admin: 'Admin', employee: 'Employee' };

function Access({ value }) {
  return <span className={value.allowed ? 'text-emerald-700 dark:text-emerald-300' : 'text-surface-500 dark:text-surface-400'}>{value.scope}</span>;
}

export default function MatrixHelp() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('');
  const [mine, setMine] = useState(false);
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['access-matrix', user.id, user.role],
    queryFn: async () => (await api.get('/help/matrix')).data,
  });
  const allRows = data?.rows || [];
  const roles = data?.roles || [];
  const term = search.trim().toLowerCase();
  const rows = allRows.filter(row => (!area || row.area === area) && (!mine || row.access[user.role]?.allowed) &&
    [row.area, row.action, row.note, ...Object.values(row.access).map(value => value.scope)].join(' ').toLowerCase().includes(term));

  return <div className="space-y-5 min-w-0 animate-fade-in">
    <header className="card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Grid2X2 className="w-6 h-6 text-brand-600 shrink-0 mt-1" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Matrix help</h1>
          <p className="text-sm text-surface-600 dark:text-surface-300 mt-2">Permissions for every page and function. Your role: <strong>{roleNames[user.role]}</strong>.</p>
          <p className="text-sm text-surface-600 dark:text-surface-300 mt-2">Managers maintain shared settings companywide and manage monthly records in their assigned division. Admins maintain users, projects and tasks. Only System Admins remove shared settings or change privileged roles and administrator access.</p>
        </div>
      </div>
    </header>
    {isPending ? <p role="status" className="card p-5">Loading permission matrix…</p> : isError ? <div role="alert" className="card p-5">
      <p>Unable to load the permission matrix.</p><button className="btn-secondary mt-3" disabled={isFetching} onClick={() => refetch()}>Retry</button>
    </div> : <>
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <label className="text-sm flex-1 min-w-0 basis-full sm:basis-64">Search functions
          <span className="relative block mt-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" aria-hidden="true" /><input type="search" className="input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search pages, actions or rules" /></span>
        </label>
        <div className="text-sm w-full sm:w-64"><label htmlFor="matrix-area" className="block">Page or area</label><select id="matrix-area" className="input mt-1" value={area} onChange={event => setArea(event.target.value)}><option value="">All areas</option>{[...new Set(allRows.map(row => row.area))].map(value => <option key={value}>{value}</option>)}</select></div>
        <label className="inline-flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={event => setMine(event.target.checked)} />Show functions available to me</label>
      </div>
      <p className="text-sm text-surface-500" aria-live="polite">{rows.length} of {allRows.length} functions. Assigned scope limits apply even when a function is available.</p>
      {!rows.length ? <p className="card p-5">No matching functions. Try another search or area.</p> : <>
        <div className="hidden lg:block card overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Permission matrix table">
            <table className="w-full min-w-[1100px] text-sm text-left">
              <caption className="sr-only">Access by page, function and role</caption>
              <thead className="bg-surface-100 dark:bg-surface-800"><tr><th scope="col" className="p-4">Page / Function</th>{roles.map(role => <th scope="col" key={role} className={`p-4 ${role === user.role ? 'text-brand-700 dark:text-brand-300' : ''}`}>{roleNames[role]}{role === user.role ? ' (you)' : ''}</th>)}<th scope="col" className="p-4">Rules</th></tr></thead>
              <tbody>{rows.map(row => <tr key={`${row.area}:${row.action}`} className="border-t border-surface-200 dark:border-surface-700 align-top">
                <th scope="row" className="p-4 font-normal max-w-xs"><span className="block font-semibold">{row.area}</span><span className="block mt-1">{row.action}</span></th>
                {roles.map(role => <td key={role} className={`p-4 max-w-[220px] ${role === user.role ? 'bg-brand-50/50 dark:bg-brand-950/20' : ''}`}><Access value={row.access[role]} /></td>)}
                <td className="p-4 max-w-sm text-surface-600 dark:text-surface-300">{row.note || '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="lg:hidden space-y-3">{rows.map(row => <article key={`${row.area}:${row.action}`} className="card p-4 min-w-0">
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{row.area}</p><h2 className="font-semibold mt-1">{row.action}</h2>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">{roles.map(role => <div key={role} className={`min-w-0 rounded-lg p-3 ${role === user.role ? 'bg-brand-50 dark:bg-brand-950/30' : 'bg-surface-50 dark:bg-surface-800/50'}`}><dt className="text-xs font-semibold">{roleNames[role]}{role === user.role ? ' (you)' : ''}</dt><dd className="text-sm mt-1 break-words"><Access value={row.access[role]} /></dd></div>)}</dl>
          {row.note && <p className="text-sm text-surface-600 dark:text-surface-300 mt-3 break-words">{row.note}</p>}
        </article>)}</div>
      </>}
    </>}
  </div>;
}
