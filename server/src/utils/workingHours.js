// Match the timesheet's eight-hour weekday convention and company holiday calendar.
function expectedWeekHours(startDate, holidayDates) {
  const holidays = new Set(holidayDates);
  const day = new Date(`${startDate}T00:00:00Z`);
  let hours = 0;
  for (let i = 0; i < 7; i++) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !holidays.has(day.toISOString().slice(0, 10))) hours += 8;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return hours;
}

module.exports = { expectedWeekHours };
