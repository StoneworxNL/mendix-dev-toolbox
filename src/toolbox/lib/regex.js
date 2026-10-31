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
