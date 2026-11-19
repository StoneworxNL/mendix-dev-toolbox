// Mendix date patterns (Java SimpleDateFormat letters) as used by formatDateTime, parseDateTime,
// formatDate and friends. English names; week rules follow the US locale (weeks start on Sunday).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Pattern letters, for the reference table. */
export const LETTERS = [
  ['G', 'Era', 'AD'],
  ['y', 'Year (yy = two digits)', 'yyyy → 2026, yy → 26'],
  ['Y', 'Week year', 'YYYY → 2026'],
  ['M', 'Month in year', 'M → 7, MM → 07, MMM → Jul, MMMM → July'],
  ['L', 'Month (stand-alone form)', 'L → 7, LLLL → July'],
  ['w', 'Week in year', '27'],
  ['W', 'Week in month', '2'],
  ['D', 'Day in year', '189'],
  ['d', 'Day in month', 'd → 8, dd → 08'],
  ['F', 'Day of week in month', '2'],
  ['E', 'Day name in week', 'E → Tue, EEEE → Tuesday'],
  ['u', 'Day number of week (1 = Monday)', '2'],
  ['a', 'AM/PM marker', 'PM'],
  ['H', 'Hour in day (0-23)', 'HH → 14'],
  ['k', 'Hour in day (1-24)', '14'],
  ['K', 'Hour in AM/PM (0-11)', '2'],
  ['h', 'Hour in AM/PM (1-12)', 'hh → 02'],
  ['m', 'Minute in hour', 'mm → 05'],
  ['s', 'Second in minute', 'ss → 09'],
  ['S', 'Millisecond', 'SSS → 042'],
  ['z', 'Time zone name (microflows only)', 'CET'],
  ['Z', 'RFC 822 time zone (microflows only)', '+0100'],
  ['X', 'ISO 8601 time zone (microflows only)', 'X → +01, XX → +0100, XXX → +01:00'],
  ["'text'", 'Literal text; in a Mendix string literal write two quotes: \'\'T\'\'', "yyyy-MM-dd'T'HH:mm → 2026-07-08T14:05"],
];

/** Splits a pattern into letter runs and literal text. Throws on letters SimpleDateFormat rejects. */
export function parsePattern(pattern) {
  const parts = [];
  for (let i = 0; i < pattern.length;) {
    const c = pattern[i];
    if (c === "'") {
      if (pattern[i + 1] === "'") { parts.push({ text: "'" }); i += 2; continue; }
      let j = i + 1;
      let text = '';
      for (;;) {
        if (j >= pattern.length) throw new Error('Unterminated quote in pattern');
        if (pattern[j] === "'") { if (pattern[j + 1] === "'") { text += "'"; j += 2; continue; } break; }
        text += pattern[j++];
      }
      parts.push({ text });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      if (!'GyYMLwWDdFEuaHkKhmsSzZX'.includes(c)) throw new Error(`Illegal pattern character "${c}"; put literal text in single quotes`);
      let j = i;
      while (pattern[j] === c) j++;
      parts.push({ letter: c, count: j - i });
      i = j;
      continue;
    }
    parts.push({ text: c });
    i++;
  }
  return parts;
}

const pad = (n, len) => String(n).padStart(len, '0');

/** Date fields in UTC or local time. */
function fields(date, utc) {
  const g = (m) => date[`get${utc ? 'UTC' : ''}${m}`]();
  return { y: g('FullYear'), M: g('Month'), d: g('Date'), day: g('Day'), H: g('Hours'), m: g('Minutes'), s: g('Seconds'), S: g('Milliseconds'), offset: utc ? 0 : -date.getTimezoneOffset() };
}

const dayOfYear = (y, M, d) => Math.round((Date.UTC(y, M, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;

// US rules: weeks start on Sunday and week 1 is the week that contains January 1.
function weekOfYear(y, M, d) {
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const nextJan1 = new Date(Date.UTC(y + 1, 0, 1)).getUTCDay();
  const doy = dayOfYear(y, M, d);
  const daysInYear = dayOfYear(y, 11, 31);
  // The last days of December belong to week 1 of next year when that week contains January 1.
  if (doy > daysInYear - nextJan1 && nextJan1 !== 0) return { week: 1, weekYear: y + 1 };
  return { week: Math.floor((doy - 1 + jan1) / 7) + 1, weekYear: y };
}

function zone(offset, style, count) {
  const sign = offset < 0 ? '-' : '+';
  const a = Math.abs(offset);
  const hh = pad(Math.floor(a / 60), 2);
  const mm = pad(a % 60, 2);
  if (style === 'X') {
    if (offset === 0) return 'Z';
    return count === 1 ? `${sign}${hh}${mm === '00' ? '' : mm}` : count === 2 ? `${sign}${hh}${mm}` : `${sign}${hh}:${mm}`;
  }
  return `${sign}${hh}${mm}`;
}

function zoneName(date, utc, long) {
  if (utc) return long ? 'Coordinated Universal Time' : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZoneName: long ? 'long' : 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

/** Formats a Date like Mendix formatDateTime (`utc: false`) or formatDateTimeUTC (`utc: true`). */
export function formatDate(date, pattern, { utc = false } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const f = fields(date, utc);
  const { week, weekYear } = weekOfYear(f.y, f.M, f.d);
  return parsePattern(pattern).map((p) => {
    if (p.text !== undefined) return p.text;
    const n = p.count;
    switch (p.letter) {
      case 'G': return f.y > 0 ? 'AD' : 'BC';
      case 'y': return n === 2 ? pad(f.y % 100, 2) : pad(f.y, n);
      case 'Y': return n === 2 ? pad(weekYear % 100, 2) : pad(weekYear, n);
      case 'M': case 'L': return n >= 4 ? MONTHS[f.M] : n === 3 ? MONTHS[f.M].slice(0, 3) : pad(f.M + 1, n);
      case 'w': return pad(week, n);
      case 'W': { const first = new Date(Date.UTC(f.y, f.M, 1)).getUTCDay(); return pad(Math.floor((f.d - 1 + first) / 7) + 1, n); }
      case 'D': return pad(dayOfYear(f.y, f.M, f.d), n);
      case 'd': return pad(f.d, n);
      case 'F': return pad(Math.floor((f.d - 1) / 7) + 1, n);
      case 'E': return n >= 4 ? DAYS[f.day] : DAYS[f.day].slice(0, 3);
      case 'u': return pad(f.day || 7, n);
      case 'a': return f.H < 12 ? 'AM' : 'PM';
      case 'H': return pad(f.H, n);
      case 'k': return pad(f.H || 24, n);
      case 'K': return pad(f.H % 12, n);
      case 'h': return pad(f.H % 12 || 12, n);
      case 'm': return pad(f.m, n);
      case 's': return pad(f.s, n);
      case 'S': return pad(f.S, n);
      case 'z': return zoneName(date, utc, n >= 4);
      case 'Z': return zone(f.offset, 'Z', n);
      case 'X': return zone(f.offset, 'X', n);
      default: return '';
    }
  }).join('');
}

/**
 * Parses text with a pattern like Mendix parseDateTime[UTC]. Two-digit years (yy) use the
 * microflow rule: within 80 years before and 20 years after today.
 */
export function parseDate(text, pattern, { utc = false, now = new Date() } = {}) {
  const parts = parsePattern(pattern);
  let i = 0;
  const v = { y: 1970, M: 0, d: 1, H: 0, m: 0, s: 0, S: 0, pm: null, h12: null, offset: null };
  const fail = (what) => { throw new Error(`Could not parse ${what} at position ${i + 1} ("${text.slice(i, i + 12)}")`); };
  const num = (max, what) => {
    const m = new RegExp(`^[+-]?\\d{1,${max}}`).exec(text.slice(i));
    if (!m) fail(what);
    i += m[0].length;
    return Number(m[0]);
  };
  const name = (list, what) => {
    const rest = text.slice(i).toLowerCase();
    for (const [k, n] of list.map((x, k) => [k, x]).sort((a, b) => b[1].length - a[1].length)) {
      for (const cand of [n, n.slice(0, 3)]) if (rest.startsWith(cand.toLowerCase())) { i += cand.length; return k; }
    }
    return fail(what);
  };
  parts.forEach((p, k) => {
    if (p.text !== undefined) {
      if (text.slice(i, i + p.text.length) !== p.text) fail(`"${p.text}"`);
      i += p.text.length;
      return;
    }
    // Adjacent numeric fields (yyyyMMdd) need fixed widths.
    const nx = parts[k + 1];
    const nextIsNumber = Boolean(nx?.letter) && !'EaGzZX'.includes(nx.letter) && !('ML'.includes(nx.letter) && nx.count >= 3);
    const width = nextIsNumber ? p.count : 9;
    switch (p.letter) {
      case 'y': case 'Y': {
        const start = i;
        const y = num(p.count === 2 && !nextIsNumber ? 9 : width, 'year');
        if (i - start <= 2 && p.count <= 2) {
          const pivot = now.getFullYear() - 80;
          let full = Math.floor(pivot / 100) * 100 + y;
          if (full < pivot) full += 100;
          v.y = full;
        } else v.y = y;
        break;
      }
      case 'M': case 'L': v.M = p.count >= 3 ? name(MONTHS, 'month name') : num(width, 'month') - 1; break;
      case 'd': v.d = num(width, 'day'); break;
      case 'D': v.doy = num(width, 'day of year'); break;
      case 'E': name(DAYS, 'day name'); break;
      case 'u': case 'F': case 'w': case 'W': num(width, p.letter); break;
      case 'H': v.H = num(width, 'hour'); break;
      case 'k': v.H = num(width, 'hour') % 24; break;
      case 'K': case 'h': v.h12 = num(width, 'hour') % 12; break;
      case 'a': v.pm = name(['AM', 'PM'], 'AM/PM') === 1; break;
      case 'm': v.m = num(width, 'minute'); break;
      case 's': v.s = num(width, 'second'); break;
      case 'S': v.S = num(width, 'millisecond'); break;
      case 'G': name(['BC', 'AD'], 'era'); break;
      case 'Z': case 'X': {
        if (text[i] === 'Z') { i++; v.offset = 0; break; }
        const m = /^([+-])(\d{2}):?(\d{2})?/.exec(text.slice(i));
        if (!m) fail('time zone');
        i += m[0].length;
        v.offset = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
        break;
      }
      case 'z': { const m = /^(UTC|GMT|Z)/i.exec(text.slice(i)); if (!m) fail('time zone name'); i += m[0].length; v.offset = 0; break; }
      default: break;
    }
  });
  if (i < text.length) throw new Error(`Unparsed text after position ${i}: "${text.slice(i)}"`);
  if (v.h12 !== null) v.H = v.h12 + (v.pm ? 12 : 0);
  else if (v.pm !== null && v.H < 12 && v.pm) v.H += 12;
  if (v.M > 11 || v.d < 1 || v.d > 31 || v.H > 23 || v.m > 59 || v.s > 59) throw new Error('A field is out of range');
  const args = [v.y, v.M, v.doy ?? v.d, v.H, v.m, v.s, v.S];
  if (v.doy) args[1] = 0;
  if (v.offset !== null) return new Date(Date.UTC(...args) - v.offset * 60000);
  return utc ? new Date(Date.UTC(...args)) : new Date(...args);
}

/** Writes a pattern as a Mendix expression string literal (single quotes doubled). */
export const mendixLiteral = (pattern) => `'${pattern.replace(/'/g, "''")}'`;
