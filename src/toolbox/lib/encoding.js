// Text <-> bytes <-> Base64 helpers shared by the encoder tools.

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const utf8Encode = (text) => encoder.encode(text);
export const utf8Decode = (bytes) => decoder.decode(bytes);

export function bytesToBase64(bytes, { urlSafe = false, padding = true } = {}) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  let b64 = btoa(binary);
  if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
  if (!padding) b64 = b64.replace(/=+$/, '');
  return b64;
}

export function base64ToBytes(input) {
  let b64 = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error('Input is not valid Base64.');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const bytesToHex = (bytes, upper = false) => {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return upper ? hex.toUpperCase() : hex;
};

export function hexToBytes(hex) {
  const clean = hex.replace(/[\s:]/g, '').replace(/^0x/i, '');
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error('Input is not valid hex.');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

// --- HTML entities -------------------------------------------------------

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', deg: '°', plusmn: '±', times: '×',
  divide: '÷', micro: 'µ', middot: '·', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', hearts: '♥', iexcl: '¡', iquest: '¿', shy: '­', frac12: '½', frac14: '¼', frac34: '¾',
};

export function htmlEncode(text, { all = false } = {}) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else if (all && cp > 126) out += `&#${cp};`;
    else out += ch;
  }
  return out;
}

export function htmlDecode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const cp = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? match;
  });
}

// --- String escaping -----------------------------------------------------

export const ESCAPE_MODES = {
  json: 'JSON / JavaScript string',
  csharp: 'C# / Java string',
  verbatim: 'C# verbatim string (@"...")',
  regex: 'Regular expression',
  sql: 'SQL string literal',
  xml: 'XML attribute / text',
  csv: 'CSV field',
  mendix: 'Mendix expression string',
};

export function escapeText(text, mode) {
  switch (mode) {
    case 'json':
      return JSON.stringify(text).slice(1, -1);
    case 'csharp':
      return text.replace(/[\\"\0\x07\b\f\n\r\t\v]/g, (c) => ({
        '\\': '\\\\', '"': '\\"', '\0': '\\0', '\x07': '\\a', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v',
      })[c]).replace(/[\x01-\x06\x0e-\x1f\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    case 'verbatim':
      return text.replace(/"/g, '""');
    case 'regex':
      return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    case 'sql':
    case 'mendix':
      return text.replace(/'/g, "''");
    case 'xml':
      return htmlEncode(text).replace(/&#39;/g, '&apos;');
    case 'csv':
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    default:
      throw new Error(`Unknown mode ${mode}`);
  }
}

export function unescapeText(text, mode) {
  switch (mode) {
    case 'json':
      return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (m, e) =>
        e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[e]);
    case 'csharp':
      return text.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{1,4}|.)/g, (m, e) => {
        const simple = { '\\': '\\', '"': '"', "'": "'", 0: '\0', a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
        if (e.length === 1) return simple[e] ?? m;
        return String.fromCodePoint(parseInt(e.slice(1), 16));
      });
    case 'verbatim':
      return text.replace(/""/g, '"');
    case 'regex':
      return text.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');
    case 'sql':
    case 'mendix':
      return text.replace(/''/g, "'");
    case 'xml':
      return htmlDecode(text);
    case 'csv': {
      const m = /^"([\s\S]*)"$/.exec(text);
      return m ? m[1].replace(/""/g, '"') : text;
    }
    default:
      throw new Error(`Unknown mode ${mode}`);
  }
}
