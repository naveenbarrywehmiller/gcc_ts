import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CircleHelp } from 'lucide-react';
import { useAuth } from '../contexts/auth';
import api from '../services/api';

function GuideGroup({ id, title, description, guides }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div>
        <h2 id={`${id}-title`} className="text-lg sm:text-xl font-semibold text-surface-900 dark:text-white">{title}</h2>
        <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">{description}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {guides.map(guide => (
          <article key={guide.id} id={guide.id} className="card p-4 sm:p-5 min-w-0 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-surface-900 dark:text-white">{guide.title}</h3>
                <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">{guide.description}</p>
              </div>
              <Link to={guide.path} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline shrink-0">
                Open page <ArrowRight className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">: {guide.title}</span>
              </Link>
            </div>
            <ol className="mt-3 space-y-2 list-decimal pl-5 text-sm text-surface-700 dark:text-surface-200 break-words">
              {guide.steps.map(step => <li key={step} className="pl-1">{step}</li>)}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Help() {
  const { user } = useAuth();
  const roleLabel = user?.role === 'employee' ? 'User' : user?.role === 'system admin' ? 'System admin' : user?.role === 'admin' ? 'Admin' : 'Manager';
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['help', user?.id, user?.role],
    queryFn: async () => (await api.get('/help')).data,
  });
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      <header className="card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 flex items-center justify-center shrink-0"><CircleHelp className="w-5 h-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-white">Help</h1>
            <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">Find instructions for the pages available to you.</p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">Your category: {roleLabel}</p>
          </div>
        </div>
      </header>

      {isPending ? <div className="card p-5 text-sm text-surface-600 dark:text-surface-300" role="status">Loading help…</div> :
        isError ? <div className="card p-5" role="alert">
          <p className="text-sm text-surface-700 dark:text-surface-200">Unable to load help. Please try again.</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Retrying…' : 'Retry'}</button>
        </div> : <>
          <nav aria-label="Help categories" className="card p-3 sm:p-4 flex flex-wrap gap-2">
            <BookOpen className="w-5 h-5 text-surface-500 shrink-0 self-center mr-1" aria-hidden="true" />
            {groups.map(group => (
              <a key={group.id} href={`#${group.id}`} className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40 dark:hover:text-brand-300">
                {group.title}
              </a>
            ))}
          </nav>

          {groups.map(group => <GuideGroup key={group.id} {...group} />)}
        </>}
    </div>
  );
}
