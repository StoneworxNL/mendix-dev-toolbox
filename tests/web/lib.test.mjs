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

// --- Mendix tools ---------------------------------------------------------------

const oql = await lib('oql');
const dp = await lib('datepattern');
const mxx = await lib('mxxpath');
const mxm = await lib('mxmodel');
const naming = await lib('naming');

test('OQL formatter breaks clauses, columns, joins and conditions', () => {
  const out = oql.formatOql("select c.Name, count(o.ID) as Orders from Sales.Customer as c left join c/Sales.Order_Customer/Sales.\"Order\" as o where c.IsActive = true and o.Total > -1 group by c.Name order by Orders desc limit 10");
  assert.equal(out, [
    'SELECT', '  c.Name,', '  COUNT(o.ID) AS Orders', 'FROM Sales.Customer AS c', '  LEFT JOIN c/Sales.Order_Customer/Sales."Order" AS o',
    'WHERE c.IsActive = TRUE', '  AND o.Total > -1', 'GROUP BY c.Name', 'ORDER BY Orders DESC', 'LIMIT 10',
  ].join('\n'));
  assert.match(oql.formatOql('select x.ID from A.B as x where x.ID in (select y.ID from A.C as y)'), /WHERE x\.ID IN \(\n  SELECT\n    y\.ID\n  FROM A\.C AS y\n\)$/);
});

test('OQL linter reports v2 rules and common mistakes', () => {
  const messages = (q) => oql.lintOql(q).map((i) => i.message).join('\n');
  assert.match(messages('SELECT COUNT(*) FROM Sales.Customer'), /alias/);
  assert.match(messages('SELECT Total FROM Sales.Order'), /reserved word; quote it: Sales\."Order"/);
  assert.match(messages('SELECT c.Name AS N FROM A.C AS c JOIN A.D AS d'), /JOIN needs an ON/);
  assert.match(messages('SELECT c.Name AS N FROM A.C AS c WHERE N = 1'), /column alias/);
  assert.match(messages("SELECT c.Name FROM A.C AS c WHERE c.Owner = [%CurrentUser%]"), /must be quoted/);
  assert.match(messages('SELECT c.Name FROM A.C AS c WHERE c.X = NULL'), /IS NULL/);
  assert.match(messages('SELECT (c.X FROM A.C AS c'), /never closed/);
  assert.equal(oql.lintOql("SELECT c.Name, c.Age FROM A.C AS c WHERE c.Name LIKE 'A%' ORDER BY c.Name LIMIT 5").length, 0);
});

test('OQL query builder joins over association paths', () => {
  const q = oql.buildSelect({ entity: 'Sales.Order', attributes: ['Number'], joins: [{ association: 'Sales.Order_Customer', target: 'Sales.Customer', attributes: ['Number'] }] });
  assert.equal(q, 'SELECT\n  o.Number,\n  c.Number AS CustomerNumber\nFROM Sales."Order" AS o\n  INNER JOIN o/Sales.Order_Customer/Sales.Customer AS c');
});

test('date patterns format and parse like SimpleDateFormat', () => {
  const d = new Date(Date.UTC(2026, 6, 8, 14, 5, 9, 42));
  assert.equal(dp.formatDate(d, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", { utc: true }), '2026-07-08T14:05:09.042Z');
  assert.equal(dp.formatDate(d, "EEEE d MMMM yy, h:mm a 'o''clock'", { utc: true }), "Wednesday 8 July 26, 2:05 PM o'clock");
  assert.equal(dp.formatDate(d, 'D u k K', { utc: true }), '189 3 14 2');
  assert.throws(() => dp.formatDate(d, 'yyyy-MM-ddTHH'), /Illegal pattern character "T"/);
  assert.equal(dp.parseDate('2026-07-08T16:05:09+02:00', "yyyy-MM-dd'T'HH:mm:ssXXX").toISOString(), '2026-07-08T14:05:09.000Z');
  assert.equal(dp.parseDate('20260708', 'yyyyMMdd', { utc: true }).toISOString(), '2026-07-08T00:00:00.000Z');
  assert.equal(dp.parseDate('8 Jul 26 2:05 PM', 'd MMM yy h:mm a', { utc: true, now: d }).toISOString(), '2026-07-08T14:05:00.000Z');
  assert.equal(dp.mendixLiteral("yyyy-MM-dd'T'HH"), "'yyyy-MM-dd''T''HH'");
});

test('XPath date tokens evaluate and constraints are checked', () => {
  const now = new Date(2026, 9, 30, 15, 20);
  const r = mxx.evaluateDateExpression('[%BeginOfCurrentDay%] - 3 * [%YearLength%] + [%HourLength%]', { now });
  assert.deepEqual([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()], [2023, 9, 30, 1]);
  const week = mxx.resolveDateToken('BeginOfCurrentWeek', { now, firstDay: 1 });
  assert.deepEqual([week.getDate(), week.getHours()], [26, 0]);
  assert.throws(() => mxx.evaluateDateExpression('[%BeginOfCurrentDay%] - (3 * [%DayLength%])', { now }), /Parentheses/);
  const { issues, dates } = mxx.lintConstraint("[Owner = [%CurrentUser%] && Name = 'x'][Due < '[%CurrentDateTime%] + [%WeekLength%]']", { now });
  assert.match(issues.map((i) => i.message).join('\n'), /Put tokens in quotes[\s\S]*Use and instead of &&/);
  assert.equal(dates.length, 1);
  assert.equal(mxx.relativeDateConstraint({ attribute: 'Due', operator: '<', base: 'EndOfCurrentDay', amount: 2, period: 'DayLength' }), "[Due < '[%EndOfCurrentDay%] + 2 * [%DayLength%]']");
  assert.equal(mxx.lintConstraint("[Name = 'x' or contains(Code, 'A')][IsActive = true()]").issues.length, 0);
});

test('domain model normalizes and documents as Mermaid and Markdown', () => {
  const model = mxm.normalizeModel(mxm.SAMPLE_UNITS, mxm.SAMPLE_ENUMERATIONS);
  const assoc = model.associations.find((a) => a.name === 'Order_Customer');
  assert.deepEqual([assoc.parent, assoc.child], ['Sales.Order', 'Sales.Customer']);
  assert.equal(model.entities.find((e) => e.name === 'OrderSearch').persistable, false);
  const mermaid = mxm.toMermaid(model, { modules: ['Sales'] });
  assert.match(mermaid, /Sales_Order \}o--o\| Sales_Customer : "Order_Customer"/);
  assert.match(mermaid, /Sales_Customer \|o--o\| Administration_Account/);
  const md = mxm.toMarkdown(model);
  assert.match(md, /\| Email \| String\(320\) \|/);
  assert.match(md, /\*\*OrderStatus\*\*: `Draft`, `Confirmed`/);
});

test('naming check follows the Mendix conventions', () => {
  const model = mxm.normalizeModel(mxm.SAMPLE_UNITS, mxm.SAMPLE_ENUMERATIONS);
  const issues = naming.checkNaming({ documents: mxm.SAMPLE_DOCUMENTS, model, modules: ['Sales', 'my_module'] });
  const find = (name) => issues.filter((i) => i.name === name);
  assert.equal(find('ACT_Order_Confirm').length, 0);
  assert.equal(find('Order_Overview').length, 0);
  assert.equal(find('Home_Desktop_Default').length, 0);
  assert.equal(find('IVK_Customer_Save')[0].suggestion, 'ACT_Customer_Save');
  assert.equal(find('OrderStatus')[0].suggestion, 'ENUM_OrderStatus');
  assert.equal(find('Customer.customer_type')[0].suggestion, 'CustomerType');
  assert.equal(find('Customer.Email').length, 0);
  assert.equal(find('OrderLine._SyncHash').length, 0);
  assert.equal(find('Customer_Favourite')[0].suggestion, 'Customer_Products');
  assert.equal(find('my_module')[0].severity, 'warning');
  assert.throws(() => naming.parseRules('widgets prefixes: W_'), /unknown kind/);
});

test('XPath check stops at an unclosed token and knows only documented periods', () => {
  const { issues } = mxx.lintConstraint('[OrderDate > [%BeginOfCurrentDay]');
  assert.match(issues.map((i) => i.message).join('\n'), /Unterminated \[% token/);
  assert.ok(!mxx.PERIOD_NAMES.includes('MillisecondLength'));
  assert.throws(() => mxx.evaluateDateExpression('[%CurrentDateTime%] + [%MillisecondLength%]'), /is not a period/);
  assert.equal(mxx.lintConstraint('[Name = empty][Code != NULL]').issues.length, 0);
  assert.match(mxx.lintConstraint('[Name = null]').issues[0].message, /empty or NULL/);
});

test('OQL accepts constants and enumeration values', () => {
  assert.deepEqual(oql.lintOql('SELECT o.Total AS T FROM Sales.Product AS o WHERE o.Total > $Sales.MinOrder'), []);
  assert.deepEqual(oql.lintOql('SELECT p.Name AS N FROM RealEstate.Property AS p WHERE p.Kind = RealEstate.PropertyTypes#Apartment'), []);
  assert.match(oql.formatOql('select p.Name from M.P as p where p.Kind = M.Kinds#Big and p.Price > $M.Min'), /p\.Kind = M\.Kinds#Big\n  AND p\.Price > \$M\.Min/);
  assert.equal(oql.FUNCTIONS.find((f) => f.name === 'LOCATE').syntax, 'LOCATE(expression, substring [, offset])');
  assert.deepEqual(oql.FUNCTIONS.filter((f) => f.javaOnly).map((f) => f.name).sort(), ['DATEADD', 'DATEPARSE', 'DATETRUNC', 'LOCATE', 'SUBSTRING']);
});

test('naming check covers workflows', () => {
  const issues = naming.checkNaming({ documents: mxm.SAMPLE_DOCUMENTS });
  assert.equal(issues.filter((i) => i.name === 'OrderApproval').length, 0);
  assert.equal(issues.find((i) => i.name === 'WF_Order_Approve').suggestion, 'WFOrderApprove');
  assert.ok(naming.isChecked('Workflow', naming.parseRules('')));
  assert.ok(!naming.isChecked('Page', naming.parseRules('')));
});
