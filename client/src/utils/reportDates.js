const DAY = 86400000;
export function dateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function presetDates(preset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'this-week') {
    const start = new Date(today);
    start.setDate(start.getDate() - (start.getDay() || 7) + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start_date: dateISO(start), end_date: dateISO(end) };
  }
  const offset = preset === 'last-month' ? -1 : preset === 'last-3-months' ? -3 : 0;
  return {
    start_date: dateISO(new Date(today.getFullYear(), today.getMonth() + offset, 1)),
    end_date: dateISO(new Date(today.getFullYear(), today.getMonth() + (offset ? 0 : 1), 0)),
  };
}
export function rangeError(start, end) {
  const valid = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) return 'Choose valid start and end dates.';
  if (start.slice(0, 4) < '1900' || end.slice(0, 4) > '9998')
    return 'Choose dates between 1900 and 9998.';
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY + 1;
  if (days < 1 || days > 366) return 'Choose a date range of 1–366 days.';
  return '';
}
export function displayDate(date) {
  if (!date) return '—';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
export function displayRange(start, end) {
  return `${displayDate(start)} – ${displayDate(end)}`;
}
export function reportParams(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== '' && value !== null && value !== undefined
    )
  );
}
