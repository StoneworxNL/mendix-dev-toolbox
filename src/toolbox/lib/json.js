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

/** Whether a parsed value is a number kept as raw JSON. */
export const isRawNumber = (v) => LOSSLESS && JSON.isRawJSON(v);
