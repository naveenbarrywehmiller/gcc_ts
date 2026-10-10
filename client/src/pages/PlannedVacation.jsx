import { hasPermission } from '../utils/permissions';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Save, Palmtree } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/auth';
import { useToast } from '../contexts/toast';
import { addDays, calendarDays, formatDate, shiftPeriod, todayDate, weekInfo, weekStart } from '../lib/vacationDates';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function PlannedVacation() {
  const { user } = useAuth();
  const canViewTeam = hasPermission(user, 'teamVacation');
  const toast = useToast();
  const cache = useQueryClient();
  const [anchor, setAnchor] = useState(todayDate);
  const [mode, setMode] = useState('week');
  const [view, setView] = useState('mine');
  const [employee, setEmployee] = useState('');
  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(false);
  const [rangeStart, setRangeStart] = useState(todayDate);
  const [rangeEnd, setRangeEnd] = useState(todayDate);
  const team = view === 'team';
  const days = calendarDays(anchor, mode);
  const start = days[0];
  const end = days.at(-1);
  const week = weekInfo(anchor);
  const today = todayDate();
  const changeCount = Object.keys(pending).length;
  const plans = useQuery({
    queryKey: ['planned-vacations', user.id, view, start, end, team ? employee : ''],
    queryFn: () => api.get('/planned-vacations', {
      params: { start, end, view, ...(team && employee ? { employee_id: employee } : {}) },
    }).then(response => response.data.plans),
  });
  const holidays = useQuery({
    queryKey: ['vacation-holidays', user.id],
    queryFn: () => api.get('/holidays').then(response => response.data.holidays),
  });
  const employees = useQuery({
    queryKey: ['planned-vacation-employees', user.id],
    enabled: canViewTeam && team,
    queryFn: () => api.get('/planned-vacations/employees').then(response => response.data.employees),
  });
  const byDate = new Map();
  for (const plan of plans.data || []) {
    if (!byDate.has(plan.vacation_date)) byDate.set(plan.vacation_date, []);
    byDate.get(plan.vacation_date).push(plan);
  }
  const holidaysByDate = new Map((holidays.data || []).map(holiday => [holiday.date, holiday]));

  function queueChanges(next) {
    if (Object.keys(next).length > 366) {
      toast.error('Save your changes before selecting more than 366 days.');
      return;
    }
    setPending(next);
  }

  function toggleDate(date) {
    const saved = byDate.has(date);
    const selected = pending[date] ?? saved;
    const next = { ...pending };
    const planned = !selected;
    if (planned === saved) delete next[date];
    else next[date] = planned;
    queueChanges(next);
  }

  function selectRange(event) {
    event.preventDefault();
    const length = Math.round((Date.parse(rangeEnd) - Date.parse(rangeStart)) / 86400000) + 1;
    if (!Number.isFinite(length) || length < 1 || length > 366) {
      toast.error('Choose a date range of 1–366 days.');
      return;
    }
    const next = { ...pending };
    for (let i = 0; i < length; i++) next[addDays(rangeStart, i)] = true;
    queueChanges(next);
    setAnchor(rangeStart);
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch('/planned-vacations', {
        changes: Object.entries(pending).map(([date, planned]) => ({ date, planned })),
      });
      await cache.invalidateQueries({ queryKey: ['planned-vacations'] });
      setPending({});
      toast.success('Planned vacation saved');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to save. Your selections are still here; please retry.');
    } finally {
      setSaving(false);
    }
  }

  function currentWeek() {
    setAnchor(todayDate());
    setMode('week');
  }

  return <div className="space-y-5 animate-fade-in">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-3">
          <Palmtree className="w-7 h-7 text-brand-600" />Planned Vacation
        </h1>
        <p className="mt-1 text-sm text-surface-500">Plan your days away and share them with your admin. Planning only; no approval is required.</p>
      </div>
      {canViewTeam && <div className="flex rounded-lg border border-surface-200 dark:border-surface-700 p-1 gap-1" aria-label="Vacation view">
        {[['mine', 'My vacation'], ['team', 'Team vacation']].map(([value, label]) => <button key={value}
          className={view === value ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} aria-pressed={view === value}
          disabled={saving || (changeCount > 0 && view !== value)} onClick={() => setView(value)}>{label}</button>)}
      </div>}
    </div>

    {team && <div className="flex flex-wrap items-end gap-4">
      <div className="text-sm w-full sm:w-80"><label htmlFor="vacation-employee">Employee</label>
        <select id="vacation-employee" className="input mt-1" value={employee} onChange={event => setEmployee(event.target.value)} disabled={employees.isPending || employees.isError}>
          <option value="">All employees in your access</option>
          {(employees.data || []).map(person => <option key={person.id} value={person.id}>{person.name}{person.division_name ? ` · ${person.division_name}` : ''}</option>)}
        </select>
      </div>
      <p className="text-sm text-surface-500 pb-2">{user.role === 'system admin' ? 'Showing plans across all divisions.' : 'Showing plans in your assigned divisions.'} Use the calendar to choose the date period.</p>
      {employees.isError && <p role="alert" className="text-red-600 text-sm">Unable to load employee filters. <button className="underline" onClick={() => employees.refetch()}>Retry</button></p>}
    </div>}

    <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 overflow-hidden" aria-label="Vacation calendar">
      <div className="p-3 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 w-full sm:w-auto">
          <button className="btn-ghost p-2" aria-label={`Previous ${mode}`} disabled={saving} onClick={() => setAnchor(shiftPeriod(anchor, mode, -1))}><ChevronLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[200px] text-center sm:text-left">
            <h2 className="text-lg font-semibold">{mode === 'week' ? `Week ${week.week} · ${week.year}` : formatDate(anchor, { month: 'long', year: 'numeric' })}</h2>
            <p className="text-sm text-surface-500">{mode === 'week' ? `${formatDate(start)} – ${formatDate(end)}` : 'Monday–Sunday · ISO week numbers'}</p>
          </div>
          <button className="btn-ghost p-2" aria-label={`Next ${mode}`} disabled={saving} onClick={() => setAnchor(shiftPeriod(anchor, mode, 1))}><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center flex-wrap gap-2 min-w-0">
          <button className="btn-secondary btn-sm" disabled={saving} onClick={currentWeek}>Current Week</button>
          <button className={mode === 'week' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} disabled={saving} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Week</button>
          <button className={mode === 'month' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} disabled={saving} aria-pressed={mode === 'month'} onClick={() => setMode('month')}><CalendarDays className="w-4 h-4" />Open month calendar</button>
          <label className="text-xs text-surface-500">Go to date<input type="date" className="input mt-1" aria-label="Go to date" min="1900-01-01" max="9998-12-31" value={anchor} disabled={saving} onChange={event => { if (event.target.validity.valid && event.target.value) setAnchor(event.target.value); }} /></label>
        </div>
      </div>
      <div className="px-5 py-3 text-sm text-surface-500 flex flex-wrap justify-between gap-2">
        <span>{team ? 'Saved vacation plans for the displayed dates.' : 'Click a day to add or remove it, then save your changes.'}</span>
        <span aria-live="polite">{plans.isFetching ? 'Loading plans…' : `${plans.data?.length || 0} saved ${team ? 'employee-days' : 'days'} in view`}</span>
      </div>
      {plans.isError && <p role="alert" className="px-5 pb-3 text-sm text-red-600">Unable to load vacation plans. <button className="underline" onClick={() => plans.refetch()}>Retry</button></p>}
      {holidays.isPending && <p role="status" className="px-5 pb-3 text-sm text-surface-500">Loading holidays…</p>}
      {holidays.isError && <p role="alert" className="px-5 pb-3 text-sm text-red-600">Unable to load holidays. <button className="underline" onClick={() => holidays.refetch()}>Retry holidays</button></p>}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]" aria-busy={plans.isFetching || holidays.isFetching}>
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] bg-surface-50 dark:bg-surface-800/50 border-y border-surface-200 dark:border-surface-700">
            <span className="p-3 text-xs font-semibold text-surface-500">Week</span>
            {weekdays.map(day => <span key={day} className="p-3 text-xs font-semibold text-surface-500">{day}</span>)}
          </div>
          {Array.from({ length: days.length / 7 }, (_, row) => {
            const rowDays = days.slice(row * 7, row * 7 + 7);
            const rowWeek = weekInfo(rowDays[0]);
            const thisWeek = weekStart(today) === rowDays[0];
            return <div key={rowDays[0]} className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b last:border-b-0 border-surface-200 dark:border-surface-700">
              <button className={`px-2 py-4 text-sm self-stretch border-r border-surface-200 dark:border-surface-700 ${thisWeek ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'}`}
                title={`Week ${rowWeek.week}, ${rowWeek.year}`} aria-label={`Show week ${rowWeek.week}, ${rowWeek.year}`} disabled={saving}
                onClick={() => { setAnchor(rowDays[0]); setMode('week'); }}><span className="font-bold">{rowWeek.week}</span><span className="block text-[10px] mt-1">{rowWeek.year}</span></button>
              {rowDays.map((date, index) => {
                const entries = byDate.get(date) || [];
                const saved = entries.length > 0;
                const selected = !team && (pending[date] ?? saved);
                const changed = !team && Object.hasOwn(pending, date);
                const holiday = holidaysByDate.get(date);
                const otherMonth = mode === 'month' && date.slice(0, 7) !== anchor.slice(0, 7);
                const content = <>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
                    <span className={`text-sm font-semibold ${date === today ? `rounded-full px-2 py-1 ${selected ? 'bg-white text-brand-900' : 'bg-brand-600 text-white'}` : otherMonth && !selected ? 'text-surface-400' : ''}`}>{formatDate(date, { month: 'short', day: 'numeric' })}</span>
                    {date === today && <span className={`text-[10px] ${selected ? 'text-brand-100' : 'text-brand-600 dark:text-brand-400'}`}>Today</span>}
                  </div>
                  {holiday && <span className="mb-2 block rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100 break-words">Holiday · {holiday.name}</span>}
                  {team ? <div className="space-y-1">{entries.map(entry => <div key={entry.id} className="rounded bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs px-2 py-1 break-words">{entry.employee_name}</div>)}</div> :
                    <span className={`flex items-start gap-1.5 text-xs ${selected ? 'text-white font-semibold' : 'text-surface-400'}`}>
                      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      <span>{selected ? (changed ? 'Selected · unsaved' : 'Planned vacation') : changed ? 'Removal · unsaved' : 'Select day'}</span>
                    </span>}
                </>;
                const className = `min-w-0 p-3 text-left border-r last:border-r-0 border-surface-200 dark:border-surface-700 ${mode === 'week' ? 'min-h-[220px]' : 'min-h-[112px]'} ${selected ? 'bg-brand-700 text-white ring-2 ring-inset ring-brand-900 dark:ring-brand-300' : holiday ? 'bg-amber-50 dark:bg-amber-950/30' : index >= 5 || otherMonth ? 'bg-surface-50 dark:bg-surface-800/30' : ''}`;
                return team ? <div key={date} className={className}>{content}</div> :
                  <button key={date} className={`${className} transition-colors ${selected ? 'hover:bg-brand-800' : 'hover:bg-brand-100 dark:hover:bg-brand-950/60'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:-outline-offset-2 disabled:cursor-wait`}
                    aria-label={`${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${holiday ? `, Holiday: ${holiday.name}` : ''}`} aria-pressed={selected}
                    disabled={saving || plans.isPending || plans.isError} onClick={() => toggleDate(date)}>{content}</button>;
              })}
            </div>;
          })}
        </div>
      </div>
    </section>

    {!team && <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 space-y-4">
      <form onSubmit={selectRange} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">From<input type="date" className="input mt-1" min="1900-01-01" max="9998-12-31" value={rangeStart} onChange={event => setRangeStart(event.target.value)} required disabled={saving} /></label>
        <label className="text-sm">To<input type="date" className="input mt-1" min={rangeStart || '1900-01-01'} max="9998-12-31" value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} required disabled={saving} /></label>
        <button type="submit" className="btn-secondary" disabled={saving}>Select range</button>
        <p className="text-xs text-surface-500 pb-2">Includes every date in the range, including weekends. Click any day to adjust.</p>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 dark:border-surface-700 pt-4">
        <div aria-live="polite" className="text-sm"><span className="font-medium">{changeCount ? `${changeCount} date changes ready to save` : 'All changes saved'}</span>
          <p className="text-xs text-surface-500 mt-1">Save before leaving this page{canViewTeam ? ' or switching to the team view' : ''}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!changeCount || saving} onClick={() => setPending({})}>Discard changes</button>
          <button className="btn-primary" disabled={!changeCount || saving || plans.isPending || plans.isError} onClick={save}><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save vacation'}</button>
        </div>
      </div>
      {changeCount > 0 && <details className="text-sm"><summary className="cursor-pointer text-surface-500">Review all unsaved dates ({changeCount})</summary><ul className="mt-2 max-h-40 overflow-y-auto space-y-1">{Object.entries(pending).sort(([a], [b]) => a.localeCompare(b)).map(([date, planned]) => <li key={date}>{formatDate(date)} — {planned ? 'Plan vacation' : 'Remove vacation'}</li>)}</ul></details>}
    </section>}

    {team && !plans.isPending && !plans.isError && <section className="rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <h2 className="p-4 font-semibold bg-white dark:bg-surface-900">Team plans · {formatDate(start)} – {formatDate(end)}</h2>
      {!plans.data?.length ? <p className="p-5 text-sm text-surface-500">No planned vacation for these dates and employee filter.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <thead className="bg-surface-50 dark:bg-surface-800"><tr>{['Employee', 'Division', 'Date', 'Week'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{plans.data.map(plan => { const info = weekInfo(plan.vacation_date); return <tr key={plan.id} className="border-t border-surface-200 dark:border-surface-700"><td className="px-4 py-3">{plan.employee_name}</td><td className="px-4 py-3">{plan.division_name || '—'}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(plan.vacation_date)}</td><td className="px-4 py-3 whitespace-nowrap">Week {info.week} · {info.year}</td></tr>; })}</tbody>
      </table></div>}
    </section>}
  </div>;
}
