// Case conversion and line utilities for the text tools.

export function splitWords(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

// Each converter works line by line so a list of identifiers converts in one go.
const perLine = (fn) => (text) => text.split('\n').map(fn).join('\n');

export const CASES = {
  lower: { label: 'lower case', fn: (t) => t.toLowerCase() },
  upper: { label: 'UPPER CASE', fn: (t) => t.toUpperCase() },
  sentence: { label: 'Sentence case', fn: (t) => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toUpperCase()) },
  title: { label: 'Title Case', fn: (t) => t.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()) },
  camel: { label: 'camelCase', fn: perLine((l) => splitWords(l).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')) },
  pascal: { label: 'PascalCase', fn: perLine((l) => splitWords(l).map(cap).join('')) },
  snake: { label: 'snake_case', fn: perLine((l) => splitWords(l).map((w) => w.toLowerCase()).join('_')) },
  constant: { label: 'CONSTANT_CASE', fn: perLine((l) => splitWords(l).map((w) => w.toUpperCase()).join('_')) },
  kebab: { label: 'kebab-case', fn: perLine((l) => splitWords(l).map((w) => w.toLowerCase()).join('-')) },
  cobol: { label: 'COBOL-CASE', fn: perLine((l) => splitWords(l).map((w) => w.toUpperCase()).join('-')) },
  train: { label: 'Train-Case', fn: perLine((l) => splitWords(l).map(cap).join('-')) },
  dot: { label: 'dot.case', fn: perLine((l) => splitWords(l).map((w) => w.toLowerCase()).join('.')) },
  mendix: { label: 'Mendix_Name (Pascal_Snake)', fn: perLine((l) => splitWords(l).map(cap).join('_')) },
  alternating: { label: 'aLtErNaTiNg', fn: (t) => { let i = 0; return t.replace(/\p{L}/gu, (c) => (i++ % 2 ? c.toUpperCase() : c.toLowerCase())); } },
  inverse: { label: 'iNVERSE cASE', fn: (t) => t.replace(/\p{L}/gu, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())) },
};

export const LINE_ACTIONS = {
  sortAsc: { label: 'Sort A→Z', fn: (lines) => [...lines].sort((a, b) => a.localeCompare(b)) },
  sortDesc: { label: 'Sort Z→A', fn: (lines) => [...lines].sort((a, b) => b.localeCompare(a)) },
  sortNatural: { label: 'Natural sort', fn: (lines) => [...lines].sort(new Intl.Collator(undefined, { numeric: true }).compare) },
  reverse: { label: 'Reverse lines', fn: (lines) => [...lines].reverse() },
  shuffle: { label: 'Shuffle', fn: (lines) => { const a = [...lines]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } },
  dedupe: { label: 'Remove duplicates', fn: (lines) => [...new Set(lines)] },
  removeEmpty: { label: 'Remove empty lines', fn: (lines) => lines.filter((l) => l.trim()) },
  trim: { label: 'Trim lines', fn: (lines) => lines.map((l) => l.trim()) },
  number: { label: 'Number lines', fn: (lines) => lines.map((l, i) => `${i + 1}. ${l}`) },
};

export function analyze(text) {
  const bytes = new TextEncoder().encode(text).length;
  const words = text.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const freq = new Map();
  for (const w of words) {
    const k = w.toLowerCase();
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return {
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/g, '')].length,
    words: words.length,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    sentences: (text.match(/[^.!?\s][^.!?]*(?:[.!?]+|$)/g) ?? []).length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    bytes,
    topWords: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}
