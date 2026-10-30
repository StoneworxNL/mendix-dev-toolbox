// JSON array <-> table (CSV/TSV/Markdown) conversion.

export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

export function jsonToRows(json, { flattenNested = true } = {}) {
  let data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(data)) {
    const arr = data && typeof data === 'object' ? Object.values(data).find(Array.isArray) : null;
    if (!arr) throw new Error('Input must be a JSON array of objects (or an object holding one).');
    data = arr;
  }
  const rows = data.map((item) => (item && typeof item === 'object' ? (flattenNested ? flatten(item) : item) : { value: item }));
  const columns = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  return { columns, rows };
}

const cell = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function toDelimited({ columns, rows }, delimiter = ',') {
  const quote = (s) => (s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [columns.map(quote).join(delimiter), ...rows.map((r) => columns.map((c) => quote(cell(r[c]))).join(delimiter))].join('\n');
}

export function toMarkdown({ columns, rows }) {
  const esc = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${columns.map(esc).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${columns.map((c) => esc(cell(r[c]))).join(' | ')} |`)].join('\n');
}

export function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => {
    const v = r[i] ?? '';
    return [h, v !== '' && !isNaN(v) && !/^0\d/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v];
  })));
}
