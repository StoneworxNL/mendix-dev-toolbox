// Unit tests for the pure tool logic. Run with: node --test tests/web
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, createSign, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lib = (name) => import(new URL(`../../src/toolbox/lib/${name}.js`, import.meta.url));
const enc = await lib('encoding');
const { md5 } = await lib('md5');
const tc = await lib('textcase');
const cron = await lib('cron');
const xml = await lib('xml');
const num = await lib('numbers');
const jwt = await lib('jwt');
const color = await lib('color');
const gen = await lib('generators');
const table = await lib('table');
const asn1 = await lib('asn1');

test('base64 round-trips UTF-8 and supports the URL-safe alphabet', () => {
  const text = 'Héllo wörld ✓ 🚀';
  const b64 = enc.bytesToBase64(enc.utf8Encode(text));
  assert.equal(b64, Buffer.from(text).toString('base64'));
  assert.equal(enc.utf8Decode(enc.base64ToBytes(b64)), text);
  const url = enc.bytesToBase64(new Uint8Array([251, 255, 254]), { urlSafe: true, padding: false });
  assert.equal(url, '-__-');
  assert.deepEqual([...enc.base64ToBytes(url)], [251, 255, 254]);
  assert.throws(() => enc.base64ToBytes('not base64!'));
});

test('HTML entities encode and decode', () => {
  assert.equal(enc.htmlEncode('<a href="x">Tom & Jerry\'s</a>'), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(enc.htmlEncode('é', { all: true }), '&#233;');
  assert.equal(enc.htmlDecode('&lt;p&gt; &amp;amp; &#233; &#x1F680; &copy; &bogus;'), '<p> &amp; é 🚀 © &bogus;');
});

test('escape modes round-trip', () => {
  const sample = 'Line "one"\n\tC:\\path it\'s, done';
  for (const mode of Object.keys(enc.ESCAPE_MODES)) {
    assert.equal(enc.unescapeText(enc.escapeText(sample, mode), mode), sample, mode);
  }
  assert.equal(enc.escapeText('a"b\n', 'json'), 'a\\"b\\n');
  assert.equal(enc.unescapeText('\\u00e9\\"', 'json'), 'é"');
  assert.equal(enc.escapeText("it's", 'mendix'), "it''s");
  assert.equal(enc.escapeText('1+1=2?', 'regex'), '1\\+1=2\\?');
});

test('md5 matches node for several lengths', () => {
  for (const len of [0, 1, 55, 56, 63, 64, 65, 1000, 100000]) {
    const data = Buffer.alloc(len, 'a');
    assert.equal(enc.bytesToHex(md5(new Uint8Array(data))), createHash('md5').update(data).digest('hex'), `length ${len}`);
  }
});

test('case conversion', () => {
  const C = tc.CASES;
  assert.equal(C.camel.fn('Hello world-foo_bar'), 'helloWorldFooBar');
  assert.equal(C.pascal.fn('XMLHttpRequest parser'), 'XmlHttpRequestParser');
  assert.equal(C.snake.fn('getUserID'), 'get_user_id');
  assert.equal(C.kebab.fn('Some Title Here'), 'some-title-here');
  assert.equal(C.constant.fn('max retry count'), 'MAX_RETRY_COUNT');
  assert.equal(C.mendix.fn('order line item'), 'Order_Line_Item');
  assert.equal(C.title.fn('the quick brown fox'), 'The Quick Brown Fox');
  assert.equal(C.sentence.fn('HELLO. WORLD! yes'), 'Hello. World! Yes');
  assert.equal(C.camel.fn('one two\nthree four'), 'oneTwo\nthreeFour');
});

test('text analysis', () => {
  const a = tc.analyze('Hello world.\nHello again!\n\nNew paragraph');
  assert.equal(a.words, 6);
  assert.equal(a.lines, 4);
  assert.equal(a.paragraphs, 2);
  assert.equal(a.sentences, 3);
  assert.deepEqual(a.topWords[0], ['hello', 2]);
  assert.deepEqual(tc.LINE_ACTIONS.sortNatural.fn(['a10', 'a2', 'a1']), ['a1', 'a2', 'a10']);
  assert.deepEqual(tc.LINE_ACTIONS.dedupe.fn(['x', 'y', 'x']), ['x', 'y']);
});

test('cron next runs', () => {
  const from = new Date(2026, 0, 1, 10, 7, 30); // Thu 1 Jan 2026 10:07:30 local
  const fmt = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  assert.deepEqual(cron.nextOccurrences('*/15 * * * *', 3, from).map(fmt), ['2026-1-1 10:15:00', '2026-1-1 10:30:00', '2026-1-1 10:45:00']);
  assert.deepEqual(cron.nextOccurrences('0 9 * * MON-FRI', 2, from).map(fmt), ['2026-1-2 9:00:00', '2026-1-5 9:00:00']);
  assert.deepEqual(cron.nextOccurrences('0 0 L * *', 2, from).map(fmt), ['2026-1-31 0:00:00', '2026-2-28 0:00:00']);
  assert.deepEqual(cron.nextOccurrences('30 0 12 * * ?', 1, from).map(fmt), ['2026-1-1 12:00:30']);
  assert.deepEqual(cron.nextOccurrences('@monthly', 1, from).map(fmt), ['2026-2-1 0:00:00']);
  assert.deepEqual(cron.nextOccurrences('0 0 29 2 *', 1, from).map(fmt), ['2028-2-29 0:00:00']);
  assert.throws(() => cron.parseCron('61 * * * *'));
  assert.throws(() => cron.parseCron('* * *'));
});

test('xml format and minify', () => {
  const src = '<?xml version="1.0"?><root a="1"   b="2"><!-- c --><item>Text</item><empty/><x></x><n><m>1</m></n></root>';
  assert.equal(xml.formatXml(src), '<?xml version="1.0"?>\n<root a="1" b="2">\n  <!-- c -->\n  <item>Text</item>\n  <empty/>\n  <x></x>\n  <n>\n    <m>1</m>\n  </n>\n</root>');
  assert.equal(xml.minifyXml(xml.formatXml(src)), '<?xml version="1.0"?><root a="1" b="2"><item>Text</item><empty/><x></x><n><m>1</m></n></root>');
  assert.match(xml.formatXml('<a x="1" y="2"><b/></a>', { newLineAttributes: true }), /<a\n  x="1"\n  y="2">/);
  assert.throws(() => xml.formatXml('<a><b></a>'), /Unexpected <\/a>/);
  assert.equal(xml.formatXml('<a><![CDATA[<x>]]></a>'), '<a>\n  <![CDATA[<x>]]>\n</a>');
});

test('number bases', () => {
  const v = num.parseBigInt('0xFF_FF', 16);
  assert.equal(v, 65535n);
  assert.equal(num.formatBigInt(v, 2, { group: true }), '1111 1111 1111 1111');
  assert.equal(num.formatBigInt(1234567n, 10, { group: true }), '1,234,567');
  assert.equal(num.formatBigInt(num.parseBigInt('18446744073709551616', 10), 16), '10000000000000000');
  assert.deepEqual(num.twosComplement(-1n), { bits: 8, value: 255n });
  assert.throws(() => num.parseBigInt('12', 2));
});

test('jwt sign, decode and verify', async () => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: '42', iat: 1700000000 };
  const token = await jwt.signJwt(header, payload, 'secret');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const expectedSig = createHmac('sha256', 'secret').update(`${b64(header)}.${b64(payload)}`).digest('base64url');
  assert.equal(token, `${b64(header)}.${b64(payload)}.${expectedSig}`);
  assert.deepEqual(jwt.decodeJwt(token).payload, payload);
  assert.equal(await jwt.verifyJwt(token, 'secret'), true);
  assert.equal(await jwt.verifyJwt(token, 'wrong'), false);

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsHeader = b64({ alg: 'RS256', typ: 'JWT' });
  const input = `${rsHeader}.${b64(payload)}`;
  const sig = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(await jwt.verifyJwt(`${input}.${sig}`, pem), true);
  assert.throws(() => jwt.decodeJwt('abc'));
});

test('color conversions and contrast', () => {
  const c = color.parseColor('#264AE5');
  assert.deepEqual(c, { r: 38, g: 74, b: 229, a: 1 });
  assert.deepEqual(color.parseColor('rgb(38 74 229)'), c);
  const back = color.parseColor(color.formats(c).HSL);
  assert.ok(Math.abs(back.r - c.r) <= 2 && Math.abs(back.b - c.b) <= 2);
  assert.equal(color.toHex(color.parseColor('#abc')), '#aabbcc');
  assert.equal(color.contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }).toFixed(1), '21.0');
  assert.equal(color.scale(c).length, 9);
  assert.equal(color.formats(c).CMYK, 'cmyk(83% 68% 0% 10%)');
});

test('uuid generators', () => {
  const v4 = gen.uuidV4();
  assert.match(v4, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const now = Date.UTC(2026, 9, 30, 12);
  const v7 = gen.uuidV7(now);
  assert.equal(gen.inspectUuid(v7).version, 7);
  assert.equal(gen.inspectUuid(v7).time.getTime(), now);
  const v1 = gen.uuidV1(now);
  assert.equal(gen.inspectUuid(v1).version, 1);
  assert.equal(gen.inspectUuid(v1).time.getTime(), now);
  assert.equal(gen.formatUuid(v4, { upper: true, hyphens: false, braces: true }).length, 34);
  assert.equal(gen.inspectUuid('nope'), null);
});

test('lorem and passwords', () => {
  assert.equal(gen.lorem('words', 5).split(' ').length, 5);
  assert.match(gen.lorem('words', 3), /^Lorem ipsum dolor$/);
  assert.equal(gen.lorem('paragraphs', 3).split('\n\n').length, 3);
  assert.match(gen.lorem('sentences', 2), /^Lorem ipsum dolor sit amet, consectetur adipiscing elit/);
  const p = gen.password({ length: 32, symbols: false, excludeAmbiguous: true });
  assert.equal(p.value.length, 32);
  assert.match(p.value, /^[a-zA-Z0-9]+$/);
  assert.doesNotMatch(p.value, /[Il1O0o]/);
  assert.match(p.value, /[a-z]/); assert.match(p.value, /[A-Z]/); assert.match(p.value, /\d/);
  assert.throws(() => gen.password({ lower: false, upper: false, digits: false, symbols: false }));
});

test('json array to table and back', () => {
  const t = table.jsonToRows('[{"id":1,"a":{"b":"x,y"}},{"id":2,"c":[1,2]}]');
  assert.deepEqual(t.columns, ['id', 'a.b', 'c']);
  assert.equal(table.toDelimited(t), 'id,a.b,c\n1,"x,y",\n2,,"[1,2]"');
  assert.match(table.toMarkdown(t), /^\| id \| a\.b \| c \|\n\| --- \| --- \| --- \|/);
  assert.deepEqual(table.parseDelimited('id,name,ok\n1,"Doe, J",true\n007,x,false\n'), [{ id: 1, name: 'Doe, J', ok: true }, { id: '007', name: 'x', ok: false }]);
  assert.deepEqual(table.jsonToRows({ items: [{ a: 1 }] }).rows, [{ a: 1 }]);
});

test('x509 certificate decoding matches node', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dtb-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '30',
    '-subj', '/C=NL/O=Stoneworx/CN=toolbox.test', '-addext', 'subjectAltName=DNS:toolbox.test,DNS:*.toolbox.test,IP:127.0.0.1'], { stdio: 'ignore' });
  const pem = readFileSync(join(dir, 'c.pem'), 'utf8');
  const ref = new X509Certificate(pem);
  const c = await asn1.decodeCertificate(asn1.pemToDer(pem));
  assert.deepEqual(c.subject, [['C', 'NL'], ['O', 'Stoneworx'], ['CN', 'toolbox.test']]);
  assert.equal(c.selfSigned, true);
  assert.equal(c.sha256, ref.fingerprint256);
  assert.equal(c.serial.replace(/^0+/, ''), ref.serialNumber.replace(/^0+/, ''));
  assert.equal(c.notAfter.getTime(), new Date(ref.validTo).getTime());
  assert.equal(c.publicKey, 'RSA 2048 bit');
  assert.equal(c.extensions.find((e) => e.name === 'Subject Alternative Name').value, 'DNS: toolbox.test, DNS: *.toolbox.test, IP: 127.0.0.1');
  assert.equal(c.version, 3);
});
