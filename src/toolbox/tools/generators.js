import { h, clear, textArea, select, checkbox, input, number, field, options, split, status, live, kv, card, button, fileDrop, readFile, copyText, formatBytes } from '../ui.js';
import { utf8Encode, bytesToHex, bytesToBase64 } from '../lib/encoding.js';
import { md5 } from '../lib/md5.js';
import { uuidV1, uuidV4, uuidV7, formatUuid, inspectUuid, lorem, password, strength } from '../lib/generators.js';

const C = 'Generators';
const ALGS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

async function digest(alg, bytes) {
  if (alg === 'MD5') return md5(bytes);
  return new Uint8Array(await crypto.subtle.digest(alg, bytes));
}

async function hmac(alg, keyText, bytes) {
  const key = await crypto.subtle.importKey('raw', utf8Encode(keyText), { name: 'HMAC', hash: alg }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
}

const hash = {
  id: 'hash', name: 'Hash & checksum', category: C, icon: 'fingerprint',
  sensitive: true,
  description: 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of text or files, HMAC, and checksum comparison.',
  keywords: 'md5 sha sha1 sha256 sha512 hmac digest checksum integrity sri',
  render(root) {
    const src = textArea({ label: 'Text', persist: 'input', rows: 6 });
    const upper = checkbox('Uppercase', { persist: 'upper' });
    const outFmt = select({ hex: 'Hex', base64: 'Base64' }, { persist: 'fmt', label: 'Output' });
    const key = input({ placeholder: 'Optional HMAC key', persist: 'key' });
    const compare = input({ placeholder: 'Paste an expected checksum to compare', persist: 'compare' });
    let file = null;
    const fileInfo = h('span', { class: 'hint' });
    const drop = fileDrop({ label: 'Or drop a file to hash it', onFiles: async ([f]) => { file = { name: f.name, bytes: new Uint8Array(await readFile(f, 'buffer')) }; fileInfo.textContent = `${f.name} (${formatBytes(f.size)})`; run(); } });
    const results = h('div');
    const stat = status();
    const clearFile = button('Hash text instead', () => { file = null; fileInfo.textContent = ''; run(); }, { kind: 'ghost' });
    clear(root, options(field('Output', outFmt), upper.root, field('HMAC key', key), field('Compare with', compare)), split(src.root, h('div', { class: 'stack' }, drop, h('div', { class: 'row' }, fileInfo, clearFile))), stat.root, results);
    const run = live(root, async () => {
      clear(results);
      const bytes = file ? file.bytes : utf8Encode(src.value);
      const entries = [];
      for (const alg of ALGS) {
        if (key.value && alg === 'MD5') continue;
        const d = key.value ? await hmac(alg, key.value, bytes) : await digest(alg, bytes);
        let v = outFmt.value === 'hex' ? bytesToHex(d) : bytesToBase64(d);
        if (upper.checked && outFmt.value === 'hex') v = v.toUpperCase();
        entries.push([key.value ? `HMAC-${alg}` : alg, v]);
      }
      if (!key.value) {
        const sri = bytesToBase64(await digest('SHA-384', bytes));
        entries.push(['Subresource integrity', `sha384-${sri}`]);
      }
      results.append(card(file ? `Hashes of ${file.name}` : 'Hashes', kv(entries)));
      const expected = compare.value.trim().toLowerCase();
      if (expected) {
        const hit = entries.find(([, v]) => v.toLowerCase() === expected || v === compare.value.trim());
        hit ? stat.ok(`Match: ${hit[0]}`) : stat.error('No hash matches the expected checksum.');
      }
    }, stat);
    return run;
  },
};

const uuid = {
  id: 'uuid', name: 'UUID generator', category: C, icon: 'id',
  description: 'Generate v4, v7 or v1 UUIDs in bulk, and inspect an existing UUID.',
  keywords: 'guid uuidv4 uuidv7 ulid unique id',
  render(root) {
    const version = select({ 4: 'v4 (random)', 7: 'v7 (time-ordered)', 1: 'v1 (time, random node)', nil: 'Nil' }, { value: '4', persist: 'v', label: 'Version' });
    const count = number({ value: 5, min: 1, max: 10000, persist: 'count', width: '7em' });
    const upper = checkbox('Uppercase', { persist: 'upper' });
    const hyphens = checkbox('Hyphens', { checked: true, persist: 'hyphens' });
    const braces = checkbox('Braces', { persist: 'braces' });
    const out = textArea({ label: 'UUIDs', readonly: true, rows: 12 });
    const check = input({ placeholder: 'Paste a UUID to inspect it', persist: 'inspect' });
    const info = h('div');
    const stat = status();
    const generate = () => {
      const n = Math.min(10000, Math.max(1, Number(count.value) || 1));
      const make = { 4: uuidV4, 7: uuidV7, 1: uuidV1, nil: () => '00000000-0000-0000-0000-000000000000' }[version.value];
      out.value = Array.from({ length: n }, () => formatUuid(make(), { upper: upper.checked, hyphens: hyphens.checked, braces: braces.checked })).join('\n');
    };
    clear(root, options(field('Version', version), field('How many', count), upper.root, hyphens.root, braces.root, button('Generate', generate, { kind: 'primary', iconName: 'refresh' })), out.root, card('Inspect', field('UUID', check), info), stat.root);
    const inspect = () => {
      clear(info);
      if (!check.value.trim()) return;
      const r = inspectUuid(check.value);
      info.append(r ? kv([['Version', String(r.version)], ['Variant', r.variant], r.time && ['Timestamp', r.time.toISOString()]]) : h('div', { class: 'status error' }, 'That is not a UUID.'));
    };
    // Inspecting should not regenerate the list, so keep its events away from the live handler.
    check.addEventListener('input', (e) => { e.stopPropagation(); inspect(); });
    const run = live(root, generate, stat);
    return () => { inspect(); return run(); };
  },
};

const loremIpsum = {
  id: 'lorem', name: 'Lorem ipsum', category: C, icon: 'text',
  description: 'Placeholder text by words, sentences or paragraphs.',
  keywords: 'placeholder dummy filler text',
  render(root) {
    const kind = select({ paragraphs: 'Paragraphs', sentences: 'Sentences', words: 'Words' }, { persist: 'kind', label: 'Unit' });
    const count = number({ value: 3, min: 1, max: 1000, persist: 'count', width: '6em' });
    const classic = checkbox('Start with "Lorem ipsum…"', { checked: true, persist: 'classic' });
    const html = checkbox('Wrap paragraphs in <p>', { persist: 'html' });
    const out = textArea({ label: 'Text', readonly: true, wrap: true, rows: 16 });
    const stat = status();
    const gen = () => {
      let t = lorem(kind.value, Math.min(1000, Math.max(1, Number(count.value) || 1)), { classicStart: classic.checked });
      if (html.checked) t = t.split('\n\n').map((p) => `<p>${p}</p>`).join('\n');
      out.value = t;
    };
    clear(root, options(field('Unit', kind), field('Count', count), classic.root, html.root, button('Generate', gen, { kind: 'primary', iconName: 'refresh' })), stat.root, out.root);
    return live(root, gen, stat);
  },
};

const passwords = {
  id: 'password', name: 'Password generator', category: C, icon: 'lock',
  description: 'Strong random passwords from the Web Crypto random source, with an entropy estimate.',
  keywords: 'secret random passphrase token api key',
  render(root) {
    const length = number({ value: 24, min: 4, max: 512, persist: 'len', width: '6em' });
    const count = number({ value: 5, min: 1, max: 500, persist: 'count', width: '6em' });
    const sets = ['lower', 'upper', 'digits', 'symbols'].map((s) => [s, checkbox({ lower: 'a-z', upper: 'A-Z', digits: '0-9', symbols: '!@#…' }[s], { checked: true, persist: s })]);
    const ambiguous = checkbox('Exclude look-alikes (Il1O0)', { persist: 'amb' });
    const extra = input({ placeholder: 'Extra characters', persist: 'extra' });
    const out = textArea({ label: 'Passwords', readonly: true, rows: 10 });
    const stat = status();
    const gen = () => {
      const opts = { length: Number(length.value) || 24, excludeAmbiguous: ambiguous.checked, extra: extra.value, ...Object.fromEntries(sets.map(([k, c]) => [k, c.checked])) };
      const list = Array.from({ length: Math.min(500, Number(count.value) || 1) }, () => password(opts));
      out.value = list.map((p) => p.value).join('\n');
      stat.info(`About ${list[0].entropy} bits of entropy each: ${strength(list[0].entropy)}`);
    };
    clear(root, options(field('Length', length), field('How many', count), ...sets.map(([, c]) => c.root), ambiguous.root, field('Extra', extra), button('Generate', gen, { kind: 'primary', iconName: 'refresh' })), stat.root, out.root);
    return live(root, gen, stat);
  },
};

export default [hash, uuid, loremIpsum, passwords];
