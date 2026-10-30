// Mendix XPath constraints: token reference, date token arithmetic and a syntax check.
// See https://docs.mendix.com/refguide/xpath-keywords-and-system-variables/

/** Date tokens with how to compute them. `firstDay` is the first day of the week (0 = Sunday). */
const DATE_TOKENS = {
  CurrentDateTime: (d) => d,
  BeginOfCurrentMinute: (d) => startOf(d, 'minute'),
  EndOfCurrentMinute: (d) => endOf(d, 'minute'),
  BeginOfCurrentHour: (d) => startOf(d, 'hour'),
  EndOfCurrentHour: (d) => endOf(d, 'hour'),
  BeginOfCurrentDay: (d) => startOf(d, 'day'),
  EndOfCurrentDay: (d) => endOf(d, 'day'),
  BeginOfYesterday: (d) => startOf(addDays(d, -1), 'day'),
  EndOfYesterday: (d) => endOf(addDays(d, -1), 'day'),
  BeginOfTomorrow: (d) => startOf(addDays(d, 1), 'day'),
  EndOfTomorrow: (d) => endOf(addDays(d, 1), 'day'),
  BeginOfCurrentWeek: (d, o) => startOf(addDays(d, -((d.getDay() - o.firstDay + 7) % 7)), 'day'),
  EndOfCurrentWeek: (d, o) => endOf(addDays(d, 6 - ((d.getDay() - o.firstDay + 7) % 7)), 'day'),
  BeginOfCurrentMonth: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
  EndOfCurrentMonth: (d) => new Date(new Date(d.getFullYear(), d.getMonth() + 1, 1) - 1),
  BeginOfCurrentYear: (d) => new Date(d.getFullYear(), 0, 1),
  EndOfCurrentYear: (d) => new Date(new Date(d.getFullYear() + 1, 0, 1) - 1),
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

function startOf(d, unit) {
  const x = new Date(d);
  if (unit === 'day') x.setHours(0, 0, 0, 0);
  if (unit === 'hour') x.setMinutes(0, 0, 0);
  if (unit === 'minute') x.setSeconds(0, 0);
  return x;
}
function endOf(d, unit) {
  const x = startOf(d, unit);
  const ms = { day: 864e5, hour: 36e5, minute: 6e4 }[unit];
  return new Date(x.getTime() + ms - 1);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function addPeriod(d, unit, n) {
  const x = new Date(d);
  if (unit === 'mo') x.setMonth(x.getMonth() + n);
  else if (unit === 'y') x.setFullYear(x.getFullYear() + n);
  else x.setTime(x.getTime() + n * { ms: 1, s: 1e3, min: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[unit]);
  return x;
}

function toUtcView(fn) {
  // UTC variants: compute in UTC by shifting the clock so local getters read UTC fields.
  return (d, o) => {
    const shift = d.getTimezoneOffset() * 6e4;
    const r = fn(new Date(d.getTime() + shift), o);
    return new Date(r.getTime() - shift);
  };
}

/** Resolves a single date token name (without [% %]) to a Date, or null when it is not a date token. */
export function resolveDateToken(name, { now = new Date(), firstDay = 1 } = {}) {
  const utc = name.endsWith('UTC') && name !== 'CurrentDateTime';
  const base = utc ? name.slice(0, -3) : name;
  const fn = DATE_TOKENS[base];
  if (!fn) return null;
  return (utc ? toUtcView(fn) : fn)(now, { firstDay });
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
    date = addPeriod(date, unit, n);
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
