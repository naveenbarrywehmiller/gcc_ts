export function weekLink(path, week, year) {
  return `${path}?week=${week}&year=${year}`;
}

// Ignore malformed links, including week 53 in years with only 52 ISO weeks.
export function weekFromSearch(search, fallback) {
  const params = new URLSearchParams(search);
  const week = Number(params.get('week'));
  const year = Number(params.get('year'));
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(week) || week < 1 || week > 53) return fallback;
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (week === 53 && jan1 !== 4 && !(jan1 === 3 && leap)) return fallback;
  return { week, year };
}
