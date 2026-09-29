const ICAL = require('ical.js');

function calendarYear(value) {
  if (!/^\d{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > 9998) {
    throw new Error('Select a year between 1900 and 9998');
  }
  return Number(value);
}

function parseHolidays(source, year) {
  year = calendarYear(year);
  source = source.replace(/^\uFEFF/, '').trim();
  if (!/^BEGIN:VCALENDAR\s*$/im.test(source) || !/END:VCALENDAR\s*$/i.test(source.trim())) {
    throw new Error('File must contain a complete iCalendar calendar');
  }
  const calendar = new ICAL.Component(ICAL.parse(source));
  if (calendar.name !== 'vcalendar') throw new Error('File must contain an iCalendar calendar');
  const components = calendar.getAllSubcomponents('vevent');
  if (!components.length) throw new Error('No calendar events found');
  if (components.length > 5000) throw new Error('Calendar contains too many events');
  // ICAL.Time normalizes impossible dates; reject them before hydration.
  for (const component of components) {
    for (const property of component.getAllProperties()) {
      const [key, , type, ...values] = property.toJSON();
      if (type !== 'date') continue;
      for (const value of values) {
        const parsed = new Date(`${value}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
          throw new Error(`Invalid holiday date in ${key}`);
        }
      }
    }
  }
  const start = ICAL.Time.fromDateString(`${year}-01-01`);
  const end = ICAL.Time.fromDateString(`${year + 1}-01-01`);
  const holidays = [];
  let skipped = 0;
  let iterations = 0;
  const exceptions = components.filter(c => c.hasProperty('recurrence-id'));
  const masters = components.filter(c => !c.hasProperty('recurrence-id'));
  for (const component of masters) {
    const event = new ICAL.Event(component);
    for (const exception of exceptions.filter(c => c.getFirstPropertyValue('uid') === event.uid)) {
      event.relateException(new ICAL.Event(exception));
    }
    if (component.getFirstPropertyValue('status') === 'CANCELLED') { skipped++; continue; }
    if (!event.startDate) throw new Error('An event is missing its start date');
    if (!event.startDate.isDate) { skipped++; continue; }
    for (const rule of component.getAllProperties('rrule')) {
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.getFirstValue().freq)) {
        throw new Error('Holiday recurrence must be daily, weekly, monthly or yearly');
      }
    }
    const iterator = event.iterator();
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (++iterations > 20000) throw new Error('Calendar recurrence is too large; export a smaller date range');
      if (next.compare(end) >= 0) break;
      const occurrence = event.getOccurrenceDetails(next);
      if (occurrence.item.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const name = occurrence.item.summary?.trim();
      if (!name || name.length > 1000) throw new Error('Each holiday needs a name of 1–1000 characters');
      if (!occurrence.startDate.isDate || !occurrence.endDate.isDate) throw new Error('Holiday dates must be all-day dates');
      if (occurrence.endDate.compare(occurrence.startDate) <= 0) throw new Error('Holiday end date must follow its start date');
      const day = occurrence.startDate.compare(start) < 0 ? start.clone() : occurrence.startDate.clone();
      // iCalendar all-day DTEND is exclusive.
      while (day.compare(occurrence.endDate) < 0 && day.compare(end) < 0) {
        if (holidays.length >= 10000) throw new Error('Calendar contains too many holiday dates');
        holidays.push({ date: day.toString(), name });
        day.adjust(1, 0, 0, 0);
      }
      if (!event.isRecurring()) break;
    }
  }
  if (exceptions.some(c => !masters.some(m => m.getFirstPropertyValue('uid') === c.getFirstPropertyValue('uid')))) {
    throw new Error('Calendar contains recurrence exceptions without their original event');
  }
  return { holidays, skipped };
}

function exportHolidays(holidays) {
  const calendar = new ICAL.Component('vcalendar');
  calendar.addPropertyWithValue('version', '2.0');
  calendar.addPropertyWithValue('prodid', '-//GCC Timesheet//Holidays//EN');
  calendar.addPropertyWithValue('calscale', 'GREGORIAN');
  for (const holiday of holidays) {
    const event = new ICAL.Event();
    event.uid = `holiday-${holiday.date}@gcc-timesheet`;
    event.summary = holiday.name;
    event.startDate = ICAL.Time.fromDateString(holiday.date);
    const end = event.startDate.clone();
    end.adjust(1, 0, 0, 0);
    event.endDate = end;
    event.component.addPropertyWithValue('dtstamp', ICAL.Time.now().convertToZone(ICAL.Timezone.utcTimezone));
    calendar.addSubcomponent(event.component);
  }
  return calendar.toString() + '\r\n';
}

module.exports = { calendarYear, parseHolidays, exportHolidays };
