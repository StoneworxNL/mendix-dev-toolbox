// JSON parsing that keeps integers beyond 2^53 exactly, such as Mendix object IDs.
// JSON.parse would round 281474976710657123 to 281474976710657120.

const INTEGER = /^-?\d+$/;

/** True when this JavaScript engine can keep the source text of numbers (Chromium 114+, Node 21+). */
export const LOSSLESS = typeof JSON.rawJSON === 'function';

/** Integer literals outside strings that a JavaScript number cannot hold exactly. */
export function unsafeIntegers(text) {
  const outsideStrings = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return [...outsideStrings.matchAll(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)]
    .map((m) => m[0])
    .filter((n) => INTEGER.test(n) && !Number.isSafeInteger(Number(n)));
}

/** Like JSON.parse, but large integers come back as raw JSON that JSON.stringify writes unchanged. */
export function parseJson(text) {
  if (!LOSSLESS) return JSON.parse(text);
  return JSON.parse(text, (key, value, context) => (typeof value === 'number' && !Number.isSafeInteger(value) && INTEGER.test(context?.source ?? '') ? JSON.rawJSON(context.source) : value));
}

/**
 * An exact large integer that also works where JavaScript turns values into text, such as YAML
 * mapping keys: String() gives its digits and JSON.stringify writes them unquoted.
 */
export class ExactInteger {
  constructor(digits) { this.rawJSON = digits; Object.freeze(this); }
  toString() { return this.rawJSON; }
  toJSON() { return JSON.rawJSON(this.rawJSON); }
  // js-yaml turns keys that report as [object Object] into that text; this one reports differently.
  get [Symbol.toStringTag]() { return 'ExactInteger'; }
}

/** Whether a parsed value is a large integer kept exactly (raw JSON or ExactInteger). */
export const isRawNumber = (v) => LOSSLESS && (JSON.isRawJSON(v) || v instanceof ExactInteger);

/**
 * A number for the integer text `digits`: a plain number when that is exact, otherwise raw JSON
 * (or null when this engine cannot keep it, so the caller can fall back to text).
 */
export function exactInteger(digits) {
  const n = Number(digits);
  if (Number.isSafeInteger(n)) return n;
  return LOSSLESS && /^-?(0|[1-9]\d*)$/.test(digits) ? JSON.rawJSON(digits) : null;
}
