import qrcode from 'qrcode-generator';
import { h, clear, textArea, select, checkbox, input, field, options, split, status, live, kv, card, button, fileDrop, download, readFile, formatBytes, copyText } from '../ui.js';
import { utf8Encode, utf8Decode, bytesToBase64, base64ToBytes, bytesToHex, htmlEncode, htmlDecode } from '../lib/encoding.js';
import { decodeJwt, signJwt, verifyJwt, CLAIMS } from '../lib/jwt.js';
import { pemToDer, decodeCertificate } from '../lib/asn1.js';
import { parseJson } from '../lib/json.js';

const C = 'Encoders & decoders';
const direction = (persist = 'dir') => select({ encode: 'Encode', decode: 'Decode' }, { persist, label: 'Direction' });

const base64Text = {
  id: 'base64', name: 'Base64 text', category: C, icon: 'binary',
  sensitive: true,
  description: 'Encode text to Base64 or Base64URL and back, as UTF-8.',
  keywords: 'b64 base64url atob btoa',
  render(root) {
    const dir = direction();
    const urlSafe = checkbox('URL-safe alphabet', { persist: 'url' });
    const noPad = checkbox('No padding', { persist: 'pad' });
    const src = textArea({ label: 'Input', persist: 'input', wrap: true });
    const out = textArea({ label: 'Output', readonly: true, wrap: true });
    const stat = status();
    clear(root, options(field('Direction', dir), urlSafe.root, noPad.root, button('Swap', () => { src.value = out.value; dir.value = dir.value === 'encode' ? 'decode' : 'encode'; run(); }, { kind: 'ghost', iconName: 'swap' })), stat.root, split(src.root, out.root));
    const run = live(root, () => {
      if (!src.value) { out.value = ''; return; }
      if (dir.value === 'encode') out.value = bytesToBase64(utf8Encode(src.value), { urlSafe: urlSafe.checked, padding: !noPad.checked });
      else {
        const bytes = base64ToBytes(src.value);
        try { out.value = utf8Decode(bytes); } catch { out.value = bytesToHex(bytes); stat.info('The decoded bytes are not UTF-8 text, so they are shown as hex.'); }
      }
    }, stat);
    return run;
  },
};

const MIME_SIGNATURES = [['89504e47', 'image/png'], ['ffd8ff', 'image/jpeg'], ['47494638', 'image/gif'], ['52494646', 'image/webp'], ['424d', 'image/bmp'], ['3c737667', 'image/svg+xml'], ['3c3f786d', 'image/svg+xml'], ['00000100', 'image/x-icon'], ['25504446', 'application/pdf']];

const base64Image = {
  id: 'base64-image', name: 'Base64 image', category: C, icon: 'image',
  sensitive: true,
  description: 'Turn an image into a data URI or Base64, or preview and save Base64 image data.',
  keywords: 'data uri datauri picture png jpeg svg embed',
  render(root) {
    const out = textArea({ label: 'Base64 / data URI', persist: 'data', wrap: true });
    const preview = h('div', { class: 'preview checker' });
    const info = h('div');
    const stat = status();
    const asCss = button('Copy as CSS', () => copyText(`background-image: url("${toDataUri()}");`), { kind: 'ghost' });
    const asImg = button('Copy as <img>', () => copyText(`<img src="${toDataUri()}" alt="" />`), { kind: 'ghost' });
    const save = button('Download', () => { const uri = toDataUri(); const mime = /^data:([^;]+)/.exec(uri)[1]; download(new Blob([base64ToBytes(uri.split(',')[1])], { type: mime }), `image.${mime.split('/')[1].replace('svg+xml', 'svg').replace('x-icon', 'ico')}`); }, { kind: 'ghost', iconName: 'download' });
    const drop = fileDrop({ accept: 'image/*', label: 'Drop an image here or click to choose', onFiles: async ([f]) => { out.value = await readFile(f, 'dataurl'); out.el.dispatchEvent(new Event('input', { bubbles: true })); } });
    function toDataUri() {
      const v = out.value.trim();
      if (v.startsWith('data:')) return v;
      const bytes = base64ToBytes(v);
      const sig = bytesToHex(bytes.subarray(0, 4));
      const mime = MIME_SIGNATURES.find(([s]) => sig.startsWith(s))?.[1] ?? 'image/png';
      return `data:${mime};base64,${v.replace(/\s+/g, '')}`;
    }
    clear(root, drop, options(asCss, asImg, save), stat.root, split(out.root, h('div', { class: 'pane' }, h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, 'Preview')), preview, info)));
    return live(root, () => {
      clear(preview); clear(info);
      if (!out.value.trim()) return;
      const uri = toDataUri();
      const img = h('img', { src: uri, alt: 'Decoded image' });
      img.onload = () => clear(info, kv([['Type', /^data:([^;,]+)/.exec(uri)[1]], ['Dimensions', `${img.naturalWidth} × ${img.naturalHeight}`], ['Size', formatBytes(base64ToBytes(uri.split(',')[1]).length)], ['Base64 length', String(uri.split(',')[1].length)]]));
      img.onerror = () => stat.error('The data does not decode to an image the browser can show.');
      preview.append(img);
    }, stat);
  },
};

const url = {
  id: 'url', name: 'URL encode & parse', category: C, icon: 'link',
  sensitive: true,
  description: 'Percent-encode or decode text, and break a URL into its parts and query parameters.',
  keywords: 'percent encode uri query string querystring parameters',
  render(root) {
    const dir = select({ encode: 'Encode component', encodeUri: 'Encode full URL', decode: 'Decode', form: 'Decode form data (+ as space)' }, { persist: 'dir', label: 'Mode' });
    const src = textArea({ label: 'Input', persist: 'input', wrap: true });
    const out = textArea({ label: 'Output', readonly: true, wrap: true });
    const parts = h('div');
    const stat = status();
    clear(root, options(field('Mode', dir)), stat.root, split(src.root, out.root), parts);
    return live(root, () => {
      clear(parts);
      const v = src.value;
      if (!v) { out.value = ''; return; }
      out.value = dir.value === 'encode' ? encodeURIComponent(v) : dir.value === 'encodeUri' ? encodeURI(v) : decodeURIComponent(dir.value === 'form' ? v.replace(/\+/g, ' ') : v);
      const candidate = dir.value.startsWith('encode') ? v.trim() : out.value.trim();
      let u;
      try { u = new URL(candidate); } catch { return; }
      parts.append(card('URL parts', kv([['Protocol', u.protocol], ['Username', u.username], ['Host', u.hostname], ['Port', u.port || '(default)'], ['Path', decodeURIComponent(u.pathname)], ['Query', u.search], ['Fragment', u.hash], ['Origin', u.origin]])));
      const params = [...u.searchParams];
      if (params.length) parts.append(card(`Query parameters (${params.length})`, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Value'))), h('tbody', {}, params.map(([k, val]) => h('tr', {}, h('td', { class: 'mono' }, k), h('td', { class: 'mono' }, val)))))));
    }, stat);
  },
};

const html = {
  id: 'html', name: 'HTML entities', category: C, icon: 'code',
  description: 'Escape text for HTML or decode named and numeric entities.',
  keywords: 'escape entity entities amp lt gt xml',
  render(root) {
    const dir = direction();
    const all = checkbox('Encode all non-ASCII characters', { persist: 'all' });
    const src = textArea({ label: 'Input', persist: 'input', wrap: true });
    const out = textArea({ label: 'Output', readonly: true, wrap: true });
    const stat = status();
    clear(root, options(field('Direction', dir), all.root), stat.root, split(src.root, out.root));
    return live(root, () => { out.value = dir.value === 'encode' ? htmlEncode(src.value, { all: all.checked }) : htmlDecode(src.value); }, stat);
  },
};

const fmtClaim = (k, v) => (['exp', 'nbf', 'iat', 'auth_time'].includes(k) && typeof v === 'number' ? `${v}  (${new Date(v * 1000).toLocaleString()})` : typeof v === 'object' ? JSON.stringify(v) : String(v));

const jwt = {
  id: 'jwt', name: 'JWT', category: C, icon: 'key',
  sensitive: true,
  description: 'Decode a JSON Web Token, check its signature and expiry, or sign a new HMAC token.',
  keywords: 'json web token bearer oauth oidc jws claims',
  render(root) {
    const mode = select({ decode: 'Decode & verify', encode: 'Encode (sign)' }, { persist: 'mode', label: 'Mode' });
    const token = textArea({ label: 'Token', persist: 'token', wrap: true, rows: 6 });
    const header = textArea({ label: 'Header', persist: 'header', value: '{\n  "alg": "HS256",\n  "typ": "JWT"\n}', rows: 6 });
    const payload = textArea({ label: 'Payload', persist: 'payload', value: `{\n  "sub": "1234567890",\n  "name": "Jane Developer",\n  "iat": ${Math.floor(Date.now() / 1000)}\n}`, rows: 10 });
    const key = textArea({ label: 'Secret or public key (PEM)', persist: 'key', rows: 4, wrap: true });
    const b64 = checkbox('Secret is Base64', { persist: 'b64' });
    const claims = h('div');
    const stat = status();
    const sig = status();
    clear(root, options(field('Mode', mode), b64.root), stat.root, split(token.root, h('div', { class: 'stack' }, header.root, payload.root)), key.root, sig.root, claims);
    return live(root, async () => {
      clear(claims); sig.clear();
      const encoding = mode.value === 'encode';
      token.el.readOnly = encoding; header.el.readOnly = !encoding; payload.el.readOnly = !encoding;
      if (encoding) {
        if (!key.value) { sig.info('Enter a secret to sign the token.'); token.value = ''; return; }
        token.value = await signJwt(parseJson(header.value), parseJson(payload.value), key.value, { secretIsBase64: b64.checked });
        sig.ok('Signed.');
        return;
      }
      if (!token.value.trim()) return;
      const d = decodeJwt(token.value);
      header.value = JSON.stringify(d.header, null, 2);
      payload.value = JSON.stringify(d.payload, null, 2);
      const now = Date.now() / 1000;
      const p = d.payload;
      if (p.exp && p.exp < now) stat.error(`Expired ${new Date(p.exp * 1000).toLocaleString()}.`);
      else if (p.nbf && p.nbf > now) stat.error(`Not valid before ${new Date(p.nbf * 1000).toLocaleString()}.`);
      else if (p.exp) stat.ok(`Valid until ${new Date(p.exp * 1000).toLocaleString()}.`);
      claims.append(card('Claims', kv(Object.entries(p).map(([k, v]) => [CLAIMS[k] ? `${CLAIMS[k]} (${k})` : k, fmtClaim(k, v)]))));
      if (key.value) {
        try { (await verifyJwt(token.value, key.value, { secretIsBase64: b64.checked })) ? sig.ok('Signature verified.') : sig.error('Invalid signature.'); } catch (e) { sig.error(e); }
      } else sig.info(`Signed with ${d.header.alg}. Enter the secret or public key to verify the signature.`);
    }, stat);
  },
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const gzip = {
  id: 'gzip', name: 'GZip / Deflate', category: C, icon: 'archive',
  sensitive: true,
  description: 'Compress text to Base64 GZip, Deflate or raw Deflate, and decompress it again.',
  keywords: 'compress decompress zlib deflate inflate',
  render(root) {
    const dir = select({ compress: 'Compress', decompress: 'Decompress' }, { persist: 'dir', label: 'Direction' });
    const fmt = select({ gzip: 'GZip', deflate: 'Deflate (zlib)', 'deflate-raw': 'Raw Deflate' }, { persist: 'fmt', label: 'Format' });
    const src = textArea({ label: 'Input', persist: 'input', wrap: true });
    const out = textArea({ label: 'Output', readonly: true, wrap: true });
    const stat = status();
    clear(root, options(field('Direction', dir), field('Format', fmt)), stat.root, split(src.root, out.root));
    return live(root, async () => {
      if (!src.value) { out.value = ''; return; }
      if (dir.value === 'compress') {
        const input = utf8Encode(src.value);
        const z = await pipe(input, new CompressionStream(fmt.value));
        out.value = bytesToBase64(z);
        stat.info(`${formatBytes(input.length)} → ${formatBytes(z.length)} (${Math.round((z.length / input.length) * 100)}%)`);
      } else {
        const bytes = base64ToBytes(src.value);
        try { out.value = utf8Decode(await pipe(bytes, new DecompressionStream(fmt.value))); } catch (e) { throw new Error(`Could not decompress: is this ${fmt.selectedOptions[0].text} data?`); }
      }
    }, stat);
  },
};

const qr = {
  id: 'qr', name: 'QR code', category: C, icon: 'qr',
  description: 'Generate a QR code for text, a URL or Wi-Fi credentials, and save it as SVG or PNG.',
  keywords: 'qrcode barcode wifi',
  render(root) {
    const src = textArea({ label: 'Content', persist: 'input', wrap: true, rows: 5, value: 'https://www.mendix.com' });
    const level = select({ L: 'Low (7%)', M: 'Medium (15%)', Q: 'Quartile (25%)', H: 'High (30%)' }, { value: 'M', persist: 'ecc', label: 'Error correction' });
    const size = input({ value: '8', type: 'number', persist: 'size' });
    const preview = h('div', { class: 'preview qr' });
    const stat = status();
    let svg = '';
    const png = () => {
      const img = new Image();
      img.onload = () => { const c = h('canvas', { width: img.width * 2, height: img.height * 2 }); const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => download(b, 'qr-code.png')); };
      img.src = `data:image/svg+xml;base64,${bytesToBase64(utf8Encode(svg))}`;
    };
    clear(root, options(field('Error correction', level), field('Cell size', size), button('Download SVG', () => download(svg, 'qr-code.svg', 'image/svg+xml'), { kind: 'ghost', iconName: 'download' }), button('Download PNG', png, { kind: 'ghost', iconName: 'download' }), button('Copy SVG', () => copyText(svg), { kind: 'ghost', iconName: 'copy' })), stat.root, split(src.root, preview));
    return live(root, () => {
      clear(preview);
      if (!src.value) return;
      const q = qrcode(0, level.value);
      q.addData(unescape(encodeURIComponent(src.value)), 'Byte');
      q.make();
      svg = q.createSvgTag({ cellSize: Math.max(1, Number(size.value) || 8), margin: 16, scalable: true });
      preview.innerHTML = svg;
      stat.info(`Version ${(q.getModuleCount() - 17) / 4}, ${q.getModuleCount()} × ${q.getModuleCount()} modules`);
    }, stat);
  },
};

const certificate = {
  id: 'certificate', name: 'Certificate decoder', category: C, icon: 'shield',
  description: 'Read an X.509 certificate (PEM or Base64 DER): subject, issuer, validity, SANs and fingerprints.',
  keywords: 'x509 pem der ssl tls cer crt fingerprint',
  render(root) {
    const src = textArea({ label: 'Certificate (PEM)', persist: 'input', rows: 12, placeholder: '-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----' });
    const drop = fileDrop({ accept: '.pem,.crt,.cer,.der', label: 'Drop a .pem, .crt, .cer or .der file', onFiles: async ([f]) => { const buf = new Uint8Array(await readFile(f, 'buffer')); src.value = buf[0] === 0x30 ? bytesToBase64(buf) : new TextDecoder().decode(buf); src.el.dispatchEvent(new Event('input', { bubbles: true })); } });
    const results = h('div');
    const stat = status();
    clear(root, drop, stat.root, split(src.root, results));
    return live(root, async () => {
      clear(results);
      if (!src.value.trim()) return;
      const c = await decodeCertificate(pemToDer(src.value));
      const name = (parts) => parts.map(([k, v]) => `${k}=${v}`).join(', ');
      if (c.expired) stat.error(`Expired on ${c.notAfter.toLocaleString()}.`);
      else stat.ok(`Valid until ${c.notAfter.toLocaleString()} (${Math.ceil((c.notAfter - Date.now()) / 86400000)} days left).`);
      results.append(
        card('Certificate', kv([['Subject', name(c.subject)], ['Issuer', c.selfSigned ? `${name(c.issuer)} (self-signed)` : name(c.issuer)], ['Valid from', c.notBefore?.toISOString()], ['Valid to', c.notAfter?.toISOString()], ['Serial number', c.serial], ['Version', `v${c.version}`], ['Signature algorithm', c.signatureAlgorithm], ['Public key', c.publicKey], ['SHA-1 fingerprint', c.sha1], ['SHA-256 fingerprint', c.sha256]])),
        c.extensions.length ? card('Extensions', kv(c.extensions.map((e) => [`${e.name}${e.critical ? ' (critical)' : ''}`, e.value]))) : null,
      );
    }, stat);
  },
};

export default [base64Text, base64Image, url, html, jwt, gzip, qr, certificate];
