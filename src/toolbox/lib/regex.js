// Helpers for the Regex tester.

/**
 * Names of the capture groups of a JavaScript pattern by group number: `names[0]` is group 1,
 * `null` for an unnamed group. Named and unnamed groups are numbered together, left to right.
 */
export function captureNames(source) {
  const names = [];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (source[i + 1] !== '?') { names.push(null); continue; }
    // (?<name>…) captures; (?:…), (?=…), (?!…), (?<=…) and (?<!…) do not.
    if (source[i + 2] === '<' && source[i + 3] !== '=' && source[i + 3] !== '!') {
      const end = source.indexOf('>', i + 3);
      names.push(end < 0 ? null : source.slice(i + 3, end));
    }
  }
  return names;
}

/** Runs a regex over text; self-contained so it can also run in a worker. */
export function matchRegex({ source, flags, text, replacement }) {
  const re = new RegExp(source, flags);
  const found = [];
  if (re.global || re.sticky) {
    for (const m of text.matchAll(re.global ? re : new RegExp(source, `${flags}g`))) { found.push(m); if (found.length > 5000) break; }
  } else { const m = re.exec(text); if (m) found.push(m); }
  const matches = found.map((m) => ({ items: [...m], index: m.index }));
  return { matches, replacedText: replacement ? text.replace(new RegExp(source, flags), replacement) : '' };
}

/** The worker's source: it says 'ready' once it runs, then answers each job with a result or an error. */
export const WORKER_SOURCE = `const matchRegex = ${matchRegex.toString()};
postMessage({ type: 'ready' });
onmessage = ({ data }) => {
  try { postMessage({ type: 'result', result: matchRegex(data) }); }
  catch (e) { postMessage({ type: 'error', message: String((e && e.message) || e) }); }
};`;

/** Text longer than this is cut when matching has to run on the UI thread, without a time limit. */
export const INLINE_LIMIT = 20000;

const unpack = ({ matches, replacedText }) => ({ matches: matches.map((m) => Object.assign(m.items, { index: m.index })), replacedText });

/**
 * Runs regex jobs in a worker with a time limit, so catastrophic backtracking cannot freeze the UI.
 * Only a worker that fails or stays silent before saying 'ready' counts as blocked by the host
 * (for example a content security policy on blob: scripts); matching then runs inline on at most
 * INLINE_LIMIT characters, between `onInlineStart` and `onInlineEnd`. An error in a job stays an
 * error of that job.
 * @param {{ makeWorker: () => any, timeoutMs?: number, startupMs?: number, onInlineStart?: () => void, onInlineEnd?: () => void }} options
 */
export function createRegexRunner({ makeWorker, timeoutMs = 1500, startupMs = 5000, onInlineStart = () => {}, onInlineEnd = () => {} }) {
  let worker = null;
  let ready = false;
  let blocked = false;
  let pending = null;

  const inline = (job) => {
    const truncated = job.text.length > INLINE_LIMIT;
    onInlineStart();
    try {
      return { ...unpack(matchRegex(truncated ? { ...job, text: job.text.slice(0, INLINE_LIMIT) } : job)), inline: true, truncated };
    } finally { onInlineEnd(); }
  };
  const stop = (w) => { w.terminate(); if (worker === w) { worker = null; ready = false; } };

  function run(source, flags, text, replacement) {
    const job = { source, flags, text, replacement };
    pending?.cancel(); // a newer input replaces the running one
    if (blocked) return Promise.resolve().then(() => inline(job));
    if (!worker) {
      try { worker = makeWorker(); ready = false; } catch { blocked = true; return Promise.resolve().then(() => inline(job)); }
    }
    const w = worker;
    return new Promise((resolve, reject) => {
      let timer = null;
      const done = () => { clearTimeout(timer); clearTimeout(startup); pending = null; };
      const fallBack = () => { done(); stop(w); blocked = true; try { resolve(inline(job)); } catch (e) { reject(e); } };
      const startTimer = () => { timer = setTimeout(() => { done(); stop(w); reject(new Error(`Stopped after ${timeoutMs / 1000} s: the pattern takes too long on this text (catastrophic backtracking?)`)); }, timeoutMs); };
      const startup = ready ? null : setTimeout(fallBack, startupMs);
      pending = { cancel: () => { done(); stop(w); } };
      w.onmessage = ({ data }) => {
        if (data?.type === 'ready') { ready = true; clearTimeout(startup); startTimer(); return; }
        done();
        if (data?.type === 'error') reject(new Error(data.message));
        else resolve({ ...unpack(data.result), inline: false, truncated: false });
      };
      w.onerror = (e) => {
        e?.preventDefault?.();
        if (!ready) { fallBack(); return; } // could not start: the host blocks workers
        done(); stop(w); reject(new Error(e?.message || 'The regex worker failed'));
      };
      if (ready) startTimer();
      w.postMessage(job);
    });
  }
  return { run, get blocked() { return blocked; } };
}
