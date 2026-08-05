'use strict';

/**
 * Compute ISO 8601 week number (same as Microsoft Outlook).
 * Week 1 is the first week with at least 4 days in the new year.
 * Weeks start on Monday.
 *
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {{ week: number, year: number }}
 */
function getISOWeekNumber(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

/**
 * Get Monday and Sunday dates for a given ISO week/year.
 *
 * @param {number} weekNum - ISO week number
 * @param {number} year    - ISO week year
 * @returns {{ startDate: string, endDate: string, monday: Date, sunday: Date }}
 */
function getWeekDateRange(weekNum, year) {
  // Find Jan 4 of the year (always in ISO week 1)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  // Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  // Monday of requested week
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  // Sunday of requested week
  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);

  const fmt = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  return {
    startDate: fmt(targetMonday),
    endDate: fmt(targetSunday),
    monday: targetMonday,
    sunday: targetSunday,
  };
}

module.exports = { getISOWeekNumber, getWeekDateRange };
