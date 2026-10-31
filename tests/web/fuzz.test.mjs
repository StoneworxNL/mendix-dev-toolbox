// Feeds the hand-written tokenizers and linters random input. Each run happens in a worker with a
// time limit, so an endless loop fails the test instead of hanging it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

const RUNS = 5000;
const TIME_LIMIT_MS = 20000;

// Characters that mean something to OQL, XPath or date patterns, plus some plain ones.
const ALPHABET = "[]%()'\"/$#.:,;-+*=!<>&|_ \n\tabcxyzSELECTFROMWHEREandor0129yMdHmsSXzZ";
const SEEDS = ['[%', '%]', '[', "[%BeginOfCurrentDay%]", "'[%CurrentDateTime%] - 3 * [%DayLength%]'", 'SELECT ', ' FROM Sales.Order AS o', '/* ', ' */', '--', "yyyy-MM-dd'T'HH", 'contains(', 'Sales.Kind#A', '$Sales.Min'];

const worker = (targets) => `
  const { parentPort, workerData } = require('node:worker_threads');
  (async () => {
    const lib = (n) => import(workerData.base + n + '.js');
    const oql = await lib('oql'), mxx = await lib('mxxpath'), dp = await lib('datepattern'), naming = await lib('naming');
    const fns = {
      lintConstraint: (s) => mxx.lintConstraint(s),
      evaluateDateExpression: (s) => mxx.evaluateDateExpression(s),
      lintOql: (s) => oql.lintOql(s),
      formatOql: (s) => oql.formatOql(s),
      parsePattern: (s) => dp.parsePattern(s),
      parseDate: (s) => dp.parseDate(s.slice(0, 12), s.slice(12)),
      parseRules: (s) => naming.parseRules(s),
    };
    let seed = 42;
    const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const input = () => {
      let s = '';
      for (let len = rand(60); s.length < len;) s += rand(4) ? workerData.alphabet[rand(workerData.alphabet.length)] : workerData.seeds[rand(workerData.seeds.length)];
      return s;
    };
    const problems = [];
    for (const name of ${JSON.stringify(targets)}) {
      for (let k = 0; k < workerData.runs; k++) {
        const s = input();
        try { fns[name](s); } catch (e) { if (!(e instanceof Error) || !e.message) problems.push(name + ' threw a non-error for ' + JSON.stringify(s)); }
      }
    }
    parentPort.postMessage(problems);
  })().catch((e) => parentPort.postMessage(['worker failed: ' + e.stack]));
`;

function fuzz(targets) {
  return new Promise((resolve, reject) => {
    const w = new Worker(worker(targets), { eval: true, workerData: { base: new URL('../../src/toolbox/lib/', import.meta.url).href, runs: RUNS, alphabet: ALPHABET, seeds: SEEDS } });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`${targets.join(', ')} did not finish within ${TIME_LIMIT_MS / 1000} s: probably an endless loop`)); }, TIME_LIMIT_MS);
    w.on('message', (problems) => { clearTimeout(timer); w.terminate(); resolve(problems); });
    w.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

for (const targets of [['lintConstraint', 'evaluateDateExpression'], ['lintOql', 'formatOql'], ['parsePattern', 'parseDate', 'parseRules']]) {
  test(`fuzz: ${targets.join(', ')} finish and only throw errors`, async () => {
    assert.deepEqual(await fuzz(targets), []);
  });
}
