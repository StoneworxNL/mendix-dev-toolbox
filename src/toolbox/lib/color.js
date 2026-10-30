// Color parsing, conversion and WCAG contrast.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function parseColor(input) {
  const s = input.trim().toLowerCase();
  let m;
  if ((m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s))) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
  }
  const nums = (str) => str.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
  if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const raw = m[1].split(/[\s,/]+/).filter(Boolean);
    const [r, g, b, a = 1] = raw.map((p, i) => (p.endsWith('%') ? (i < 3 ? parseFloat(p) * 2.55 : parseFloat(p) / 100) : parseFloat(p)));
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  }
  if ((m = /^hsla?\(([^)]+)\)$/.exec(s))) {
    const [h, sat, l, a = 1] = nums(m[1].replace(/deg/g, ''));
    return { ...hslToRgb(h, sat > 1 ? sat / 100 : sat, l > 1 ? l / 100 : l), a };
  }
  if ((m = /^hsv\(([^)]+)\)$/.exec(s))) {
    const [h, sat, v] = nums(m[1]);
    return { ...hsvToRgb(h, sat > 1 ? sat / 100 : sat, v > 1 ? v / 100 : v), a: 1 };
  }
  // Named colors: let the browser resolve them when a canvas is available.
  if (typeof document !== 'undefined' && /^[a-z]+$/.test(s)) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#010203';
    ctx.fillStyle = s;
    if (ctx.fillStyle !== '#010203' || s === '#010203') return parseColor(ctx.fillStyle);
  }
  throw new Error('Unrecognized color. Try #3366ff, rgb(51 102 255), hsl(225 100% 60%) or a CSS color name.');
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function hsvToRgb(h, s, v) {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return hslToRgb(h, sl, l);
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

export function rgbToHsv({ r, g, b }) {
  const { h, s, l } = rgbToHsl({ r, g, b });
  const v = l + s * Math.min(l, 1 - l);
  return { h, s: v === 0 ? 0 : 2 * (1 - l / v), v };
}

export function rgbToCmyk({ r, g, b }) {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };
  return { c: (1 - r / 255 - k) / (1 - k), m: (1 - g / 255 - k) / (1 - k), y: (1 - b / 255 - k) / (1 - k), k };
}

export const toHex = ({ r, g, b, a = 1 }) =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}${a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : ''}`;

export function formats(color) {
  const hsl = rgbToHsl(color), hsv = rgbToHsv(color), cmyk = rgbToCmyk(color);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const alpha = color.a < 1 ? ` / ${+color.a.toFixed(2)}` : '';
  return {
    HEX: toHex(color),
    RGB: `rgb(${color.r} ${color.g} ${color.b}${alpha})`,
    HSL: `hsl(${Math.round(hsl.h)} ${pct(hsl.s)} ${pct(hsl.l)}${alpha})`,
    HSV: `hsv(${Math.round(hsv.h)} ${pct(hsv.s)} ${pct(hsv.v)})`,
    CMYK: `cmyk(${pct(cmyk.c)} ${pct(cmyk.m)} ${pct(cmyk.y)} ${pct(cmyk.k)})`,
    'C# Color': `Color.FromArgb(${Math.round(color.a * 255)}, ${color.r}, ${color.g}, ${color.b})`,
  };
}

export function luminance({ r, g, b }) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function scale(color, steps = 9) {
  const { h, s } = rgbToHsl(color);
  return Array.from({ length: steps }, (_, i) => toHex(hslToRgb(h, s, 0.95 - (0.9 * i) / (steps - 1))));
}

// Machado et al. (2009) simulation matrices at full severity, plus achromatopsia.
export const CVD = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

export function simulateCvd(data, matrix) {
  const toLin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; toLin[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
  const toSrgb = (v) => { v = clamp(v); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
  for (let i = 0; i < data.length; i += 4) {
    const r = toLin[data[i]], g = toLin[data[i + 1]], b = toLin[data[i + 2]];
    data[i] = toSrgb(matrix[0] * r + matrix[1] * g + matrix[2] * b);
    data[i + 1] = toSrgb(matrix[3] * r + matrix[4] * g + matrix[5] * b);
    data[i + 2] = toSrgb(matrix[6] * r + matrix[7] * g + matrix[8] * b);
  }
  return data;
}
