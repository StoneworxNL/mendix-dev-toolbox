// Opens every tool in headless Chromium, feeds it sample input and fails on script errors.
// Start the dev server first: npm run serve
// Usage: node tests/ui/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';

// require() so a globally installed Playwright (NODE_PATH) works too.
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:5299/';
const shots = process.argv[3];

const SAMPLES = {
  oql: [null, /SELECT\n  c\.Name,\n  COUNT\(o\.ID\) AS Orders/, 'No problems found'],
  'mx-xpath': [null, null, 'Date values right now'],
  'mx-date-pattern': [null, null, 'formatDateTimeUTC'],
  'mx-domain-docs': [null, /# Domain model\n\n## Administration/],
  'mx-naming': [null, null, 'IVK_ is no longer recommended'],
  'json-yaml': ['{"name":"Mendix","tags":["low-code","studio"],"nested":{"a":1}}', /name: Mendix/],
  'json-table': ['[{"id":1,"name":"Ada"},{"id":2,"name":"Linus"}]', /id,name\n1,Ada/],
  'number-base': ['255', null, 'FF'],
  date: ['1700000000', null, '2023-11-14T22:13:20.000Z'],
  cron: [null, null, 'Next 10 runs'],
  base64: ['Hello Mendix', /SGVsbG8gTWVuZGl4/],
  url: ['https://example.com/a b?x=1&y=two', /https%3A%2F%2Fexample\.com/, 'Query parameters (2)'],
  html: ['<b>&</b>', /&lt;b&gt;&amp;&lt;\/b&gt;/],
  jwt: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', null, 'John Doe'],
  gzip: ['hello hello hello hello', /^H4sI/],
  qr: [null, null, 'Version'],
  'json-format': ['{"b":1,"a":[1,2]}', /\{\n  "b": 1/],
  'sql-format': ['select a, b from t where x = 1', /SELECT\n  a,\n  b\nFROM/],
  'xml-format': ['<a><b>1</b></a>', /<a>\n  <b>1<\/b>\n<\/a>/],
  hash: ['abc', null, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  uuid: [null, /^[0-9a-f-]{36}\n/],
  lorem: [null, /^Lorem ipsum/],
  password: [null, /^\S{24}\n/],
  escape: ['say "hi"\n', /say \\"hi\\"\\n/],
  'text-tools': ['one two three', null, 'Words'],
  diff: [null, null, '2 added, 1 removed'],
  markdown: [null, null, 'Hello Mendix'],
  regex: [null, null, '2 matches'],
  jsonpath: [null, /Sayings of the Century/],
  xpath: [null, /Domain-Driven Design/],
  xsd: [null, null, 'Valid: the XML matches the schema.'],
  color: [null, null, 'Contrast'],
  'color-blind': [null, null],
  'image-converter': [null, null],
};

const browser = await chromium.launch();
const errors = [];
const openPage = async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return p;
};
let page = await openPage();
await page.goto(base);
const ids = await page.$$eval('.tile', (tiles) => [...new Set(tiles.map((t) => t.dataset.tool))]);
console.log(`${ids.length} tools`);
if (shots) await page.screenshot({ path: `${shots}/home.png` });

let failed = 0;
for (const id of ids) {
  const before = errors.length;
  await page.goto(`${base}?tool=${id}`);
  await page.waitForSelector('.tool-body > *');
  const [input, outputRe, expectText] = SAMPLES[id] ?? [];
  if (id === 'diff') {
    const [a, b] = await page.$$('.tool-body textarea');
    await a.fill('alpha\nbeta\ngamma\n');
    await b.fill('alpha\nBETA\ngamma\ndelta\n');
  }
  if (input !== null && input !== undefined) {
    const target = (await page.$('.tool-body textarea:not([readonly])')) ? '.tool-body textarea:not([readonly])' : '.tool-body input.mono';
    await page.fill(target, input);
  }
  await page.waitForTimeout(400);
  const problems = [];
  if (outputRe) {
    const outputs = await page.$$eval('textarea[readonly]', (els) => els.map((e) => e.value));
    if (!outputs.some((v) => outputRe.test(v))) problems.push(`output ${outputRe} not found in ${JSON.stringify(outputs).slice(0, 200)}`);
  }
  if (expectText) {
    const text = await page.$eval('.tool-body', (el) => el.innerText);
    if (!text.includes(expectText)) problems.push(`text "${expectText}" not shown`);
  }
  const errText = await page.$$eval('.status.error', (els) => els.map((e) => e.textContent));
  if (errText.length && id !== 'jwt') problems.push(`error status: ${errText.join(' | ')}`);
  problems.push(...errors.slice(before));
  if (shots) await page.screenshot({ path: `${shots}/${id}.png`, fullPage: false });
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${id}${problems.length ? `\n     ${problems.join('\n     ')}` : ''}`);
  if (problems.length) failed++;
}

// Hostile input: every tool must stay responsive and not throw. If typing and a round trip to
// the page take more than 5 s, the tool is stuck in a loop.
const EVIL = ['[%BeginOfCurrentDay', '\'unclosed "quote /* [% $ # \\', 'x'.repeat(200000), '😀\u0000‮{"a":[', ''];
const within = (ms, work) => Promise.race([work.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
for (const id of ids) {
  const before = errors.length;
  await page.goto(`${base}?tool=${id}`);
  await page.waitForSelector('.tool-body > *');
  const field = (await page.$('.tool-body textarea:not([readonly]):visible')) ?? (await page.$('.tool-body input.mono[type=text]:visible'));
  if (!field) continue;
  const problems = [];
  for (const text of EVIL) {
    const ok = await within(5000, (async () => { await field.fill(text); await page.waitForTimeout(250); await page.evaluate(() => true); })().catch((e) => problems.push(`fill failed: ${e.message.split('\n')[0]}`)));
    if (!ok) { problems.push(`stuck after ${JSON.stringify(text.slice(0, 40))}`); break; }
  }
  problems.push(...errors.slice(before));
  if (problems.length) { console.log(`FAIL ${id} (hostile input)\n     ${problems.join('\n     ')}`); failed++; }
  else console.log(`ok   ${id} (hostile input)`);
  if (problems.some((p) => p.startsWith('stuck'))) { await within(2000, page.close()); page = await openPage(); } // a stuck page cannot be reused
}

// Narrow viewport, like a docked pane.
await page.setViewportSize({ width: 420, height: 800 });
await page.goto(`${base}?tool=json-format`);
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) { console.log('FAIL narrow layout scrolls horizontally'); failed++; }
if (shots) await page.screenshot({ path: `${shots}/narrow.png` });

await browser.close();
console.log(failed ? `${failed} failing` : 'all tools ok');
process.exit(failed ? 1 : 0);
