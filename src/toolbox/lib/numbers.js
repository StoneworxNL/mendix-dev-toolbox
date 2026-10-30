// Arbitrary-precision base conversion with BigInt.

export const BASES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hexadecimal' };
const PREFIX = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export function parseBigInt(text, base) {
  let s = text.trim().replace(/[\s_,']/g, '');
  let negative = false;
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (PREFIX[base]) s = s.replace(PREFIX[base], '');
  if (!s) throw new Error('Enter a number.');
  let value = 0n;
  const b = BigInt(base);
  for (const ch of s.toLowerCase()) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error(`"${ch}" is not a valid base-${base} digit.`);
    value = value * b + BigInt(d);
  }
  return negative ? -value : value;
}

export function formatBigInt(value, base, { group = false } = {}) {
  const negative = value < 0n;
  let s = (negative ? -value : value).toString(base);
  if (base === 16) s = s.toUpperCase();
  if (group) {
    const size = base === 10 ? 3 : 4;
    const sep = base === 10 ? ',' : ' ';
    s = s.replace(new RegExp(`\\B(?=(.{${size}})+$)`, 'g'), sep);
  }
  return (negative ? '-' : '') + s;
}

// Two's complement view of a negative number in the smallest common width that fits it.
export function twosComplement(value) {
  for (const bits of [8, 16, 32, 64, 128]) {
    const min = -(1n << BigInt(bits - 1));
    if (value >= min) return { bits, value: (1n << BigInt(bits)) + value };
  }
  return null;
}
