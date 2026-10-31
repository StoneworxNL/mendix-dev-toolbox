// Mendix XPath constraints: token reference, date token arithmetic and a syntax check.
// See https://docs.mendix.com/refguide/xpath-keywords-and-system-variables/

/**
 * Date tokens with how to compute them, given `now`, the options and a calendar `c` that reads and
 * builds dates in either local time or UTC. `firstDay` is the first day of the week (0 = Sunday).
 */
const DATE_TOKENS = {
  CurrentDateTime: (d) => d,
  BeginOfCurrentMinute: (d, o, c) => c.begin(d, 'minute'),
  EndOfCurrentMinute: (d, o, c) => c.end(d, 'minute'),
  BeginOfCurrentHour: (d, o, c) => c.begin(d, 'hour'),
  EndOfCurrentHour: (d, o, c) => c.end(d, 'hour'),
  BeginOfCurrentDay: (d, o, c) => c.begin(d, 'day'),
  EndOfCurrentDay: (d, o, c) => c.end(d, 'day'),
  BeginOfYesterday: (d, o, c) => c.begin(c.addDays(d, -1), 'day'),
  EndOfYesterday: (d, o, c) => c.end(c.addDays(d, -1), 'day'),
  BeginOfTomorrow: (d, o, c) => c.begin(c.addDays(d, 1), 'day'),
  EndOfTomorrow: (d, o, c) => c.end(c.addDays(d, 1), 'day'),
  BeginOfCurrentWeek: (d, o, c) => c.begin(c.addDays(d, -((c.get(d).day - o.firstDay + 7) % 7)), 'day'),
  EndOfCurrentWeek: (d, o, c) => c.end(c.addDays(d, 6 - ((c.get(d).day - o.firstDay + 7) % 7)), 'day'),
  BeginOfCurrentMonth: (d, o, c) => c.begin(d, 'month'),
  EndOfCurrentMonth: (d, o, c) => c.end(d, 'month'),
  BeginOfCurrentYear: (d, o, c) => c.begin(d, 'year'),
  EndOfCurrentYear: (d, o, c) => c.end(d, 'year'),
};

const PERIODS = { MillisecondLength: 'ms', SecondLength: 's', MinuteLength: 'min', HourLength: 'h', DayLength: 'd', WeekLength: 'w', MonthLength: 'mo', YearLength: 'y' };

const humanize = (k) => k.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const TOKENS = [
  ['[%CurrentUser%]', 'The signed-in user (System.User).'],
  ['[%CurrentObject%]', 'The object of the enclosing data view (pages only; not in OQL or microflows).'],
  ['[%UserRole_Name%]', 'A user role, for example [System.UserRoles = \'[%UserRole_Administrator%]\'].'],
  ...Object.keys(DATE_TOKENS).flatMap((k) => (k === 'CurrentDateTime' ? [[`[%${k}%]`, 'Now.']] : [[`[%${k}%]`, `${humanize(k)} in the user's time zone.`], [`[%${k}UTC%]`, 'Same, in UTC.']])),
  ...Object.keys(PERIODS).map((k) => [`[%${k}%]`, `A period to add to or subtract from a date token: '[%BeginOfCurrentDay%] - 3 * [%${k}%]'.`]),
];

export const FUNCTIONS = [
  ['contains(Attribute, \'text\')', 'Attribute contains the text (case-insensitive).'],
  ['starts-with(Attribute, \'text\')', 'Attribute starts with the text.'],
  ['ends-with(Attribute, \'text\')', 'Attribute ends with the text.'],
  ['not(constraint)', 'Negates a constraint, for example not(Module.Order_Customer/Module.Customer).'],
  ['true() / false()', 'Boolean values: [IsActive = true()].'],
  ['string-length(Attribute)', 'Length of a string attribute.'],
  ['length(Attribute)', 'Length of a string attribute (alias).'],
  ['year-from-dateTime(Attribute)', 'Also month-, day-, hours-, minutes-, seconds-, quarter-, day-of-year-, week- and weekday-from-dateTime.'],
  ['id', 'The object id: [id = $Object] or [id = \'[%CurrentUser%]\'].'],
];

const KNOWN_FUNCTIONS = new Set(['contains', 'starts-with', 'ends-with', 'not', 'true', 'false', 'string-length', 'length',
  ...['year', 'month', 'day', 'hours', 'minutes', 'seconds', 'quarter', 'day-of-year', 'week', 'weekday'].map((p) => `${p}-from-dateTime`),
  'avg', 'count', 'max', 'min', 'sum']);

/**
 * Calendar arithmetic in local time or UTC. Everything goes through date fields, so a UTC token
 * never depends on the local offset (which differs across a daylight saving change).
 */
function calendar(utc) {
  const get = (d) => (utc
    ? { y: d.getUTCFullYear(), M: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), day: d.getUTCDay() }
    : { y: d.getFullYear(), M: d.getMonth(), d: d.getDate(), h: d.getHours(), m: d.getMinutes(), day: d.getDay() });
  const make = (y, M, d = 1, h = 0, m = 0) => (utc ? new Date(Date.UTC(y, M, d, h, m)) : new Date(y, M, d, h, m));
  const begin = (date, unit) => {
    const f = get(date);
    return { year: () => make(f.y, 0), month: () => make(f.y, f.M), day: () => make(f.y, f.M, f.d), hour: () => make(f.y, f.M, f.d, f.h), minute: () => make(f.y, f.M, f.d, f.h, f.m) }[unit]();
  };
  // The end of a period is one millisecond before the next one begins.
  const end = (date, unit) => {
    const f = get(date);
    const next = { year: () => make(f.y + 1, 0), month: () => make(f.y, f.M + 1), day: () => make(f.y, f.M, f.d + 1), hour: () => new Date(begin(date, 'hour').getTime() + 36e5), minute: () => new Date(begin(date, 'minute').getTime() + 6e4) }[unit]();
    return new Date(next.getTime() - 1);
  };
  const addDays = (date, n) => { const x = new Date(date); if (utc) x.setUTCDate(x.getUTCDate() + n); else x.setDate(x.getDate() + n); return x; };
  const addMonths = (date, n) => { const x = new Date(date); if (utc) x.setUTCMonth(x.getUTCMonth() + n); else x.setMonth(x.getMonth() + n); return x; };
  return { get, begin, end, addDays, addMonths };
}

// Days, weeks, months and years are calendar steps in the token's time zone; shorter periods are fixed lengths.
function addPeriod(d, unit, n, c) {
  if (unit === 'd') return c.addDays(d, n);
  if (unit === 'w') return c.addDays(d, 7 * n);
  if (unit === 'mo') return c.addMonths(d, n);
  if (unit === 'y') return c.addMonths(d, 12 * n);
  return new Date(d.getTime() + n * { ms: 1, s: 1e3, min: 6e4, h: 36e5 }[unit]);
}

const isUtcToken = (name) => name.endsWith('UTC') && DATE_TOKENS[name.slice(0, -3)] !== undefined;

/** Resolves a single date token name (without [% %]) to a Date, or null when it is not a date token. */
export function resolveDateToken(name, { now = new Date(), firstDay = 1 } = {}) {
  const utc = isUtcToken(name);
  const fn = DATE_TOKENS[utc ? name.slice(0, -3) : name];
  if (!fn) return null;
  return fn(now, { firstDay }, calendar(utc));
}

/**
 * Evaluates the contents of a quoted date expression such as
 * `[%BeginOfCurrentDay%] - 3 * [%YearLength%] + [%HourLength%]`. Returns a Date or throws.
 */
export function evaluateDateExpression(expr, options = {}) {
  const m = /^\s*\[%(\w+)%\]\s*/.exec(expr);
  if (!m) throw new Error('A date expression starts with a date token such as [%BeginOfCurrentDay%]');
  let date = resolveDateToken(m[1], options);
  if (!date) throw new Error(`[%${m[1]}%] is not a date token`);
  let rest = expr.slice(m[0].length);
  const term = /^([+-])\s*(?:(\d+)\s*\*\s*)?\[%(\w+)%\]\s*(?:\*\s*(\d+)\s*)?/;
  while (rest.trim()) {
    if (/[()]/.test(rest)) throw new Error('Parentheses are not allowed in date token expressions');
    const t = term.exec(rest);
    if (!t) throw new Error(`Cannot read "${rest.trim()}": use + or - followed by [number *] [%PeriodLength%]`);
    const unit = PERIODS[t[3]];
    if (!unit) throw new Error(`[%${t[3]}%] is not a period; use one of ${Object.keys(PERIODS).map((k) => `[%${k}%]`).join(', ')}`);
    const n = Number(t[2] ?? t[4] ?? 1) * (t[1] === '-' ? -1 : 1);
    date = addPeriod(date, unit, n, calendar(isUtcToken(m[1])));
    rest = rest.slice(t[0].length);
  }
  return date;
}

const isTokenName = (name) => name === 'CurrentUser' || name === 'CurrentObject' || /^UserRole_\w+$/.test(name) || resolveDateToken(name) || PERIODS[name];

/**
 * Checks a Mendix XPath constraint such as `[Status = 'Open'][DateCreated > '[%BeginOfCurrentDay%]']`.
 * Returns `{ severity, message, index }[]` plus the evaluated date expressions.
 */
export function lintConstraint(src, options = {}) {
  const issues = [];
  const dates = [];
  const add = (severity, message, index) => issues.push({ severity, message, index });
  const text = src.trim();
  if (!text) return { issues, dates };
  if (text.startsWith('//')) add('hint', 'This is a full XPath query; in a constraint property start with [ instead of //Module.Entity', 0);
  else if (!text.startsWith('[')) add('error', 'A constraint starts with [', 0);
  if (!text.endsWith(']')) add('error', 'A constraint ends with ]', text.length - 1);

  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && !(text[j] === c && text[j + 1] !== c)) j += text[j] === c ? 2 : 1;
      if (j >= text.length) { add('error', 'Unterminated string', i); break; }
      const value = text.slice(i + 1, j);
      if (/\[%/.test(value)) {
        const names = [...value.matchAll(/\[%(\w+)%\]/g)].map((m) => m[1]);
        for (const n of names) if (!isTokenName(n)) add('warning', `Unknown token [%${n}%]`, i);
        if (names.some((n) => resolveDateToken(n))) {
          try { dates.push({ expression: value, value: evaluateDateExpression(value, options), index: i }); } catch (e) { add('error', e.message, i); }
        } else if (names.length > 1 || value.replace(/\[%\w+%\]/, '').trim()) add('warning', 'Only date tokens can be combined with other text inside one string', i);
      }
      i = j;
      continue;
    }
    if (c === '[' && text[i + 1] === '%') {
      const end = text.indexOf('%]', i);
      const name = text.slice(i + 2, end);
      add('error', `Put tokens in quotes: '[%${name}%]'`, i);
      i = end + 1;
      continue;
    }
    if (c === '[' || c === '(') stack.push([c, i]);
    if (c === ']' || c === ')') {
      const open = stack.pop();
      if (!open || open[0] !== (c === ']' ? '[' : '(')) add('error', `Unexpected "${c}"`, i);
    }
    const two = text.slice(i, i + 2);
    if (two === '==') { add('error', 'Use = to compare, not ==', i); i++; }
    else if (two === '&&' || two === '||') { add('error', `Use ${two === '&&' ? 'and' : 'or'} instead of ${two}`, i); i++; }
    else if (two === '<>') { add('error', 'Use != for "not equal"', i); i++; }
    else if (c === '!' && text[i + 1] !== '=') add('error', 'Use not(...) to negate', i);
  }
  for (const [c, i] of stack) add('error', `"${c}" is never closed`, i);

  // Words outside strings
  const outside = text.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (m) => ' '.repeat(m.length));
  for (const m of outside.matchAll(/([A-Za-z][\w-]*)\s*\(/g)) {
    if (!KNOWN_FUNCTIONS.has(m[1])) add('warning', `Unknown function ${m[1]}()`, m.index);
  }
  for (const m of outside.matchAll(/(?<![\w./])(AND|OR|And|Or|NOT|Not)\b(?![\w./])/g)) add('error', `Operators are lower case: ${m[1].toLowerCase()}`, m.index);
  for (const m of outside.matchAll(/\bdiv\b/g)) add('hint', 'div works in XPath run on the server (microflows, data sources), not in client-side constraints', m.index);
  for (const m of outside.matchAll(/(?<![\w./'])(true|false)\b(?![\w./]|\s*\()/g)) add('warning', `Write ${m[1]}() with parentheses`, m.index);
  for (const m of outside.matchAll(/(?<![\w./])(NULL|Null)\b(?![\w./])/g)) add('hint', 'Write empty for an empty value: [Name = empty]', m.index);
  for (const m of outside.matchAll(/=\s*null\b/g)) add('hint', 'Write empty for an empty value: [Name = empty]', m.index);
  return { issues: issues.sort((a, b) => a.index - b.index), dates };
}

/** Builds a relative date constraint. */
export function relativeDateConstraint({ attribute, operator = '>=', base = 'BeginOfCurrentDay', amount = 0, period = 'DayLength', utc = false }) {
  const token = `[%${base}${utc && base !== 'CurrentDateTime' ? 'UTC' : ''}%]`;
  const n = Number(amount);
  const offset = n ? ` ${n < 0 ? '-' : '+'} ${Math.abs(n) === 1 ? '' : `${Math.abs(n)} * `}[%${period}%]` : '';
  return `[${attribute} ${operator} '${token}${offset}']`;
}

export const DATE_TOKEN_NAMES = Object.keys(DATE_TOKENS);
export const PERIOD_NAMES = Object.keys(PERIODS);
