import jsyaml from 'js-yaml';
import cronstrue from 'cronstrue';
import { h, clear, textArea, select, checkbox, input, number, field, options, split, status, live, kv, card, button, download } from '../ui.js';
import { jsonToRows, toDelimited, toMarkdown, parseDelimited, cellText } from '../lib/table.js';
import { BASES, parseBigInt, formatBigInt, twosComplement } from '../lib/numbers.js';
import { nextOccurrences, parseCron } from '../lib/cron.js';
import { isRawNumber, parseJson, exactInteger, unsafeIntegers, LOSSLESS } from '../lib/json.js';

const C = 'Converters';

// YAML with integers beyond 2^53 (Mendix object IDs) kept exactly in both directions: this int
// type replaces js-yaml's own, reads large decimal integers as raw JSON and writes them back as digits.
const baseInt = jsyaml.types.int;
const exactInt = new jsyaml.Type('tag:yaml.org,2002:int', {
  kind: 'scalar',
  resolve: baseInt.resolve,
  construct: (data) => {
    const value = baseInt.construct(data);
    if (Number.isSafeInteger(value)) return value;
    const digits = data.replace(/_/g, '').replace(/^\+/, '');
    return exactInteger(digits) ?? value;
  },
  predicate: (v) => isRawNumber(v) || baseInt.predicate(v),
  represent: Object.fromEntries(Object.entries(baseInt.represent).map(([style, fn]) => [style, (v) => (isRawNumber(v) ? v.rawJSON : fn(v))])),
  defaultStyle: baseInt.defaultStyle,
});
export const YAML_SCHEMA = jsyaml.DEFAULT_SCHEMA.extend({ implicit: [exactInt] });

export const jsonToYaml = (text, options = {}) => jsyaml.dump(parseJson(text), { lineWidth: -1, noRefs: true, ...options, schema: YAML_SCHEMA });
export function yamlToJson(text, { indent = 2, sort = false } = {}) {
  const docs = jsyaml.loadAll(text, null, { schema: YAML_SCHEMA });
  let data = docs.length === 1 ? docs[0] : docs;
  if (sort) data = sortDeep(data);
  return JSON.stringify(data, null, indent);
}

/** Status text for JSON with integers that need care, or '' when there are none. */
export function largeIntegerNote(text) {
  const n = unsafeIntegers(text).length;
  if (!n) return '';
  return LOSSLESS ? `${n} integer${n === 1 ? '' : 's'} beyond 2^53 (like Mendix object IDs) kept exactly.` : `${n} integer${n === 1 ? ' is' : 's are'} too large for JavaScript and rounded.`;
}

const jsonYaml = {
  id: 'json-yaml', name: 'JSON ↔ YAML', category: C, icon: 'swap',
  description: 'Convert between JSON and YAML in either direction.',
  keywords: 'yml convert',
  render(root) {
    const dir = select({ 'json-yaml': 'JSON → YAML', 'yaml-json': 'YAML → JSON' }, { persist: 'dir', label: 'Direction' });
    const indent = select({ 2: '2 spaces', 4: '4 spaces' }, { persist: 'indent', label: 'Indent' });
    const sortKeys = checkbox('Sort keys', { persist: 'sort' });
    const src = textArea({ label: 'Input', persist: 'input', placeholder: '{"name": "Mendix"}' });
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    const swap = button('Swap', () => { src.value = out.value; dir.value = dir.value === 'json-yaml' ? 'yaml-json' : 'json-yaml'; run(); }, { kind: 'ghost', iconName: 'swap' });
    clear(root, options(field('Direction', dir), field('Indent', indent), sortKeys.root, swap), stat.root, split(src.root, out.root));
    const run = live(root, () => {
      if (!src.value.trim()) { out.value = ''; return; }
      const n = Number(indent.value);
      if (dir.value === 'json-yaml') {
        out.value = jsonToYaml(src.value, { indent: n, sortKeys: sortKeys.checked });
        const note = largeIntegerNote(src.value);
        if (note) stat.info(note);
      } else {
        out.value = yamlToJson(src.value, { indent: n, sort: sortKeys.checked });
      }
    }, stat);
    return run;
  },
};

export function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object' && !isRawNumber(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}

const jsonTable = {
  id: 'json-table', name: 'JSON ↔ Table (CSV)', category: C, icon: 'table',
  description: 'Turn a JSON array into a table, CSV, TSV or Markdown, or CSV back into JSON.',
  keywords: 'csv tsv markdown spreadsheet excel array grid',
  render(root) {
    const mode = select({ 'json-table': 'JSON → table', 'csv-json': 'CSV → JSON', 'tsv-json': 'TSV → JSON' }, { persist: 'mode', label: 'Mode' });
    const format = select({ csv: 'CSV', tsv: 'TSV', md: 'Markdown', semicolon: 'CSV (semicolon)' }, { persist: 'format', label: 'Output' });
    const flat = checkbox('Flatten nested objects', { checked: true, persist: 'flat' });
    const src = textArea({ label: 'Input', persist: 'input', placeholder: '[{"id": 1, "name": "Ada"}, {"id": 2, "name": "Linus"}]' });
    const out = textArea({ label: 'Output', readonly: true });
    const grid = h('div', { class: 'grid-wrap' });
    const stat = status();
    const save = button('Download', () => download(out.value, `table.${mode.value === 'json-table' ? (format.value === 'md' ? 'md' : format.value === 'tsv' ? 'tsv' : 'csv') : 'json'}`), { kind: 'ghost', iconName: 'download' });
    clear(root, options(field('Mode', mode), field('Output format', format), flat.root, save), stat.root, split(src.root, out.root), grid);
    return live(root, () => {
      clear(grid);
      if (!src.value.trim()) { out.value = ''; return; }
      format.disabled = mode.value !== 'json-table';
      if (mode.value !== 'json-table') {
        out.value = JSON.stringify(parseDelimited(src.value, mode.value === 'tsv-json' ? '\t' : src.value.split('\n')[0].includes(';') && !src.value.split('\n')[0].includes(',') ? ';' : ','), null, 2);
        return;
      }
      const table = jsonToRows(src.value, { flattenNested: flat.checked });
      out.value = format.value === 'md' ? toMarkdown(table) : toDelimited(table, { csv: ',', tsv: '\t', semicolon: ';' }[format.value]);
      grid.append(h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, table.columns.map((c) => h('th', {}, c)))),
        h('tbody', {}, table.rows.slice(0, 500).map((r) => h('tr', {}, table.columns.map((c) => h('td', {}, cellText(r[c]))))))));
      stat.info(`${table.rows.length} rows × ${table.columns.length} columns${table.rows.length > 500 ? ' (preview shows 500)' : ''}. ${largeIntegerNote(src.value)}`.trim());
    }, stat);
  },
};

const numberBase = {
  id: 'number-base', name: 'Number base', category: C, icon: 'hash',
  description: 'Convert integers of any size between binary, octal, decimal and hexadecimal.',
  keywords: 'hex binary octal decimal radix bigint',
  render(root) {
    const from = select(Object.fromEntries(Object.entries(BASES).map(([b, n]) => [b, n])), { value: '10', persist: 'from', label: 'Input base' });
    const custom = number({ value: 36, min: 2, max: 36, width: '5em', persist: 'custom' });
    from.append(h('option', { value: 'custom' }, 'Other base…'));
    const group = checkbox('Group digits', { checked: true, persist: 'group' });
    const src = input({ placeholder: '255', persist: 'value' });
    const stat = status();
    const results = h('div');
    clear(root, options(field('Input base', from), field('Other base', custom), group.root), field('Value', src), stat.root, results);
    return live(root, () => {
      custom.disabled = from.value !== 'custom';
      clear(results);
      if (!src.value.trim()) return;
      const base = from.value === 'custom' ? Number(custom.value) : Number(from.value);
      const v = parseBigInt(src.value, base);
      const g = { group: group.checked };
      const entries = Object.entries(BASES).map(([b, name]) => [name, formatBigInt(v, Number(b), g)]);
      if (from.value === 'custom') entries.push([`Base ${base}`, formatBigInt(v, base)]);
      if (v < 0n) {
        const tc = twosComplement(v);
        if (tc) entries.push([`Two's complement (${tc.bits}-bit hex)`, formatBigInt(tc.value, 16, g)], [`Two's complement (${tc.bits}-bit binary)`, formatBigInt(tc.value, 2, g)]);
      }
      const abs = v < 0n ? -v : v;
      entries.push(['Bits needed', abs === 0n ? '1' : String(abs.toString(2).length)]);
      if (abs <= 0x10ffffn && abs >= 32n) entries.push(['As character', String.fromCodePoint(Number(abs))]);
      results.append(kv(entries));
    }, stat);
  },
};

const pad = (n, l = 2) => String(n).padStart(l, '0');
const TICKS_EPOCH = 621355968000000000n; // .NET ticks at 1970-01-01

function parseDateInput(text, kind) {
  const s = text.trim();
  if (!s) return null;
  switch (kind) {
    case 'auto': {
      if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (s.replace('-', '').length >= 17) return parseDateInput(s, 'ticks');
        return new Date(Math.abs(n) >= 1e11 ? n : n * 1000);
      }
      if (/^\/Date\((-?\d+)/.test(s)) return new Date(Number(/^\/Date\((-?\d+)/.exec(s)[1]));
      const d = new Date(s);
      if (isNaN(d)) throw new Error('Could not read that date. Try ISO 8601, a Unix timestamp or .NET ticks.');
      return d;
    }
    case 'unix': return new Date(Number(s) * 1000);
    case 'unixms': return new Date(Number(s));
    case 'ticks': return new Date(Number((BigInt(s) - TICKS_EPOCH) / 10000n));
    case 'excel': return new Date(Math.round((Number(s) - 25569) * 86400000));
    default: return new Date(s);
  }
}

function relative(d) {
  const diff = (d.getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [u, s] of units) if (Math.abs(diff) >= s || u === 'second') return rtf.format(Math.round(diff / s), u);
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y) / 86400000 + 1) / 7))}`;
}

const dateTime = {
  id: 'date', name: 'Date & timestamp', category: C, icon: 'clock',
  description: 'Convert between Unix time, ISO 8601, .NET ticks, Excel serial dates and time zones.',
  keywords: 'epoch unix time timestamp iso utc ticks timezone',
  render(root) {
    const kind = select({ auto: 'Detect automatically', unix: 'Unix seconds', unixms: 'Unix milliseconds', ticks: '.NET ticks', excel: 'Excel serial date', iso: 'Date string' }, { persist: 'kind', label: 'Input' });
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tz = select(['UTC', ...zones.filter((z) => z !== 'UTC')], { value: here, persist: 'tz', label: 'Time zone' });
    const src = input({ placeholder: 'Unix time, ISO date, ticks…', persist: 'value' });
    const now = button('Now', () => { src.value = String(Math.floor(Date.now() / 1000)); kind.value = 'auto'; run(); }, { iconName: 'clock' });
    const stat = status();
    const results = h('div');
    clear(root, options(field('Input type', kind), field('Show in time zone', tz), now), field('Value', src), stat.root, results);
    const run = live(root, () => {
      clear(results);
      const d = parseDateInput(src.value, kind.value);
      if (!d) return;
      if (isNaN(d)) throw new Error('That is not a valid date.');
      const zoned = new Intl.DateTimeFormat('en-CA', { timeZone: tz.value, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d);
      const p = Object.fromEntries(zoned.map((x) => [x.type, x.value]));
      const offset = (p.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
      const ms = d.getTime();
      results.append(kv([
        ['ISO 8601 (UTC)', d.toISOString()],
        [`ISO 8601 (${tz.value})`, `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`],
        ['Readable', new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long', timeZone: tz.value }).format(d)],
        ['RFC 7231 (HTTP)', d.toUTCString()],
        ['Unix seconds', String(Math.floor(ms / 1000))],
        ['Unix milliseconds', String(ms)],
        ['.NET ticks', String(BigInt(ms) * 10000n + TICKS_EPOCH)],
        ['Excel serial date', String(+(ms / 86400000 + 25569).toFixed(6))],
        ['Mendix expression', `parseDateTimeUTC('${d.toISOString().slice(0, 19)}', 'yyyy-MM-dd''T''HH:mm:ss')`],
        ['Relative', relative(d)],
        ['Day of year / ISO week', `${Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000)} / ${isoWeek(d)}`],
      ]));
    }, stat);
    return run;
  },
};

const cron = {
  id: 'cron', name: 'Cron parser', category: C, icon: 'calendar',
  description: 'Explain a cron expression in plain English and list its next run times.',
  keywords: 'schedule crontab quartz scheduled event',
  render(root) {
    const src = input({ value: '*/15 9-17 * * MON-FRI', persist: 'expr' });
    const count = number({ value: 10, min: 1, max: 100, persist: 'count', width: '6em' });
    const stat = status();
    const results = h('div');
    const presets = ['* * * * *', '0 * * * *', '0 0 * * *', '0 9 * * MON-FRI', '0 0 1 * *', '0 0 L * *', '0 0/30 8-18 ? * MON-FRI'].map((p) => button(p, () => { src.value = p; run(); }, { kind: 'chip' }));
    clear(root, field('Expression', src, '5 fields (minute hour day month weekday) or 6 with leading seconds. Names, ranges, steps, L and @daily work.'), options(field('Next runs', count), ...presets), stat.root, results);
    const run = live(root, () => {
      clear(results);
      if (!src.value.trim()) return;
      parseCron(src.value);
      let text = '';
      try { text = cronstrue.toString(src.value, { use24HourTimeFormat: true, verbose: true }); } catch { text = '(no description available)'; }
      const runs = nextOccurrences(src.value, Number(count.value) || 10);
      const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      results.append(card('Meaning', h('p', { class: 'lead' }, text)), card(`Next ${runs.length} runs (local time)`, h('ol', { class: 'runs mono' }, runs.map((d) => h('li', {}, fmt.format(d))))));
    }, stat);
    return run;
  },
};

export default [jsonYaml, jsonTable, numberBase, dateTime, cron];
