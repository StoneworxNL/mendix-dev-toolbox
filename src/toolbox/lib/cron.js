// Cron expression parsing and next-occurrence calculation.
// Supports 5 fields (min hour dom mon dow) and 6 fields with leading seconds (Quartz/Spring style),
// plus names (JAN, MON), ranges, steps, lists, ?, L for last day of month, and @-macros.

const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseField(spec, min, max, names) {
  const set = new Set();
  const value = (s) => {
    const upper = s.toUpperCase();
    const idx = names ? names.indexOf(upper) : -1;
    const n = idx >= 0 ? idx + (min === 1 ? 1 : 0) : Number(s);
    if (!Number.isInteger(n)) throw new Error(`Invalid value "${s}"`);
    return n;
  };
  for (const part of spec.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step "${stepText}"`);
    let lo, hi;
    if (range === '*' || range === '?') { lo = min; hi = max; }
    else if (range.includes('-')) { [lo, hi] = range.split('-').map(value); }
    else { lo = value(range); hi = stepText === undefined ? lo : max; }
    if (lo < min || hi > max || lo > hi) throw new Error(`Value out of range in "${part}" (${min}-${max})`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

export function parseCron(expression) {
  let expr = expression.trim();
  expr = MACROS[expr.toLowerCase()] ?? expr;
  const fields = expr.split(/\s+/);
  if (fields.length === 5) fields.unshift('0');
  if (fields.length !== 6) throw new Error('Expected 5 fields (or 6 with seconds).');
  const [sec, min, hour, dom, mon, dow] = fields;
  const lastDay = dom.toUpperCase() === 'L';
  // Both 0 and 7 mean Sunday, so ranges like 1-7 and 5-7 are valid.
  const dowSet = new Set([...parseField(dow, 0, 7, DAYS)].map((d) => d % 7));
  return {
    seconds: parseField(sec, 0, 59),
    minutes: parseField(min, 0, 59),
    hours: parseField(hour, 0, 23),
    days: lastDay ? new Set() : parseField(dom, 1, 31),
    lastDay,
    months: parseField(mon, 1, 12, MONTHS),
    weekdays: dowSet,
    domRestricted: !['*', '?'].includes(dom),
    dowRestricted: !['*', '?'].includes(dow),
    hasSeconds: expression.trim().split(/\s+/).length === 6,
  };
}

function dayMatches(c, d) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const domOk = c.lastDay ? d.getDate() === last : c.days.has(d.getDate());
  const dowOk = c.weekdays.has(d.getDay());
  // Standard cron: when both are restricted, either one matching is enough.
  if ((c.domRestricted || c.lastDay) && c.dowRestricted) return domOk || dowOk;
  if (c.domRestricted || c.lastDay) return domOk;
  if (c.dowRestricted) return dowOk;
  return true;
}

export function nextOccurrences(expression, count = 10, from = new Date()) {
  const c = parseCron(expression);
  const results = [];
  const d = new Date(from.getTime());
  d.setMilliseconds(0);
  d.setSeconds(d.getSeconds() + 1);
  const limit = new Date(from.getFullYear() + 8, 0, 1);
  while (results.length < count && d < limit) {
    if (!c.months.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0); continue; }
    if (!dayMatches(c, d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0); continue; }
    if (!c.hours.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0); continue; }
    if (!c.minutes.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1, 0); continue; }
    if (!c.seconds.has(d.getSeconds())) { d.setSeconds(d.getSeconds() + 1); continue; }
    results.push(new Date(d.getTime()));
    d.setSeconds(d.getSeconds() + 1);
  }
  return results;
}
