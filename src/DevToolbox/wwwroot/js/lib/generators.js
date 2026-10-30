// UUID, lorem ipsum and password generators.

const randomInt = (max) => {
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
};

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const dashed = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

export function uuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dashed(hex(b));
}

export function uuidV7(now = Date.now()) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ts = BigInt(now);
  for (let i = 5; i >= 0; i--) { b[i] = Number(ts & 0xffn); ts >>= 8n; }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dashed(hex(b));
}

// v1 with a random node id (no MAC address leaks) and a random clock sequence.
export function uuidV1(now = Date.now()) {
  const t = BigInt(now) * 10000n + 0x01b21dd213814000n;
  const low = (t & 0xffffffffn).toString(16).padStart(8, '0');
  const mid = ((t >> 32n) & 0xffffn).toString(16).padStart(4, '0');
  const high = (((t >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, '0');
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  rnd[0] = (rnd[0] & 0x3f) | 0x80;
  rnd[2] |= 0x01; // multicast bit marks the node id as random
  return `${low}-${mid}-${high}-${hex(rnd.subarray(0, 2))}-${hex(rnd.subarray(2))}`;
}

export function formatUuid(uuid, { upper = false, hyphens = true, braces = false } = {}) {
  let s = hyphens ? uuid : uuid.replace(/-/g, '');
  if (upper) s = s.toUpperCase();
  return braces ? `{${s}}` : s;
}

export function inspectUuid(text) {
  const clean = text.trim().replace(/[{}-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) return null;
  const version = parseInt(clean[12], 16);
  const variantBits = parseInt(clean[16], 16);
  const variant = variantBits >= 0xe ? 'Reserved' : variantBits >= 0xc ? 'Microsoft' : variantBits >= 8 ? 'RFC 9562' : 'NCS';
  let time = null;
  if (version === 7) time = new Date(parseInt(clean.slice(0, 12), 16));
  if (version === 1) {
    const t = BigInt(`0x${clean.slice(13, 16)}${clean.slice(8, 12)}${clean.slice(0, 8)}`);
    time = new Date(Number((t - 0x01b21dd213814000n) / 10000n));
  }
  return { version, variant, time };
}

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra est eros bibendum elit nec luctus magna felis sollicitudin mauris integer in mauris eu nibh euismod gravida duis ac tellus et risus vulputate vehicula donec lobortis risus a elit etiam tempor ut ullamcorper ligula eu tempor congue eros est euismod turpis id tincidunt sapien risus a quam maecenas fermentum consequat mi donec fermentum pellentesque malesuada nulla').split(' ');

const sentence = () => {
  const n = 6 + randomInt(10);
  const words = Array.from({ length: n }, () => WORDS[randomInt(WORDS.length)]);
  if (n > 9) words[3 + randomInt(n - 6)] += ',';
  const s = words.join(' ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
};
const paragraph = () => Array.from({ length: 3 + randomInt(4) }, sentence).join(' ');

export function lorem(kind, count, { classicStart = true } = {}) {
  let out;
  if (kind === 'words') out = Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]).join(' ');
  else if (kind === 'sentences') out = Array.from({ length: count }, sentence).join(' ');
  else out = Array.from({ length: count }, paragraph).join('\n\n');
  if (classicStart) {
    const start = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
    if (kind === 'words') out = start.replace(',', '').toLowerCase().split(' ').slice(0, count).concat(out.split(' ').slice(8)).slice(0, count).join(' ').replace(/^l/, 'L');
    else out = `${start}${out.replace(/^[^.]*/, '').replace(/^\./, '.')}`.replace(/^([^.]*)$/, '$1.');
  }
  return out;
}

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

export function password({ length = 20, lower = true, upper = true, digits = true, symbols = true, excludeAmbiguous = false, extra = '' } = {}) {
  const sets = Object.entries({ lower, upper, digits, symbols }).filter(([, on]) => on).map(([k]) => CHARSETS[k]);
  if (extra) sets.push(extra);
  const clean = sets.map((s) => (excludeAmbiguous ? s.replace(AMBIGUOUS, '') : s)).filter(Boolean);
  if (!clean.length) throw new Error('Pick at least one character set.');
  const all = [...new Set(clean.join(''))].join('');
  // Guarantee one character from each chosen set, then shuffle.
  const chars = clean.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return { value: chars.slice(0, length).join(''), entropy: Math.round(length * Math.log2(all.length)) };
}

export const strength = (bits) => (bits < 40 ? 'Very weak' : bits < 60 ? 'Weak' : bits < 80 ? 'Reasonable' : bits < 120 ? 'Strong' : 'Very strong');
