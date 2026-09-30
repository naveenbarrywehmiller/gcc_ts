// Date-only arithmetic in UTC prevents DST shifts. Only today's date uses local time.
export function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function weekStart(date) {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

export function weekInfo(date) {
  const thursday = new Date(`${addDays(weekStart(date), 3)}T00:00:00Z`);
  const year = thursday.getUTCFullYear();
  return { year, week: Math.ceil(((thursday - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7) };
}

export function formatDate(date, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

export function calendarDays(anchor, mode) {
  if (mode === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const first = `${anchor.slice(0, 7)}-01`;
  const last = new Date(`${first}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const start = weekStart(first);
  const end = addDays(weekStart(last.toISOString().slice(0, 10)), 6);
  return Array.from({ length: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 }, (_, i) => addDays(start, i));
}

export function shiftPeriod(anchor, mode, direction) {
  if (mode === 'week') return addDays(anchor, direction * 7);
  const date = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
