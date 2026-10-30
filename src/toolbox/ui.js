// Small DOM helpers so each tool can describe its UI declaratively.

import { ICONS } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied to clipboard');
}

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? ICONS.tool;
  return svg;
}

export function button(label, onClick, { kind = '', title, iconName } = {}) {
  return h('button', { type: 'button', class: `btn ${kind}`, title, onclick: onClick }, iconName && icon(iconName), label);
}

export const copyButton = (get) => button('Copy', () => copyText(typeof get === 'function' ? get() : get.value), { kind: 'ghost', iconName: 'copy' });

/** A labelled text area. `persist` stores the value per tool between sessions. */
export function textArea({ label, placeholder = '', readonly = false, persist, rows, wrap = false, actions = [], value = '' } = {}) {
  const ta = h('textarea', { class: `code${wrap ? ' wrap' : ''}`, placeholder, readOnly: readonly, spellcheck: false, rows, 'data-persist': persist, 'aria-label': label });
  ta.value = value;
  const tools = [...actions];
  if (readonly) tools.push(copyButton(ta));
  else {
    tools.push(button('Paste', async () => { try { ta.value = await navigator.clipboard.readText(); ta.dispatchEvent(new Event('input', { bubbles: true })); } catch { toast('Clipboard is not available'); } }, { kind: 'ghost', iconName: 'paste' }));
    tools.push(button('Clear', () => { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'ghost', iconName: 'clear' }));
  }
  const root = h('div', { class: 'pane' }, h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, label), h('div', { class: 'pane-tools' }, tools)), ta);
  return { root, el: ta, get value() { return ta.value; }, set value(v) { ta.value = v; } };
}

export function select(options, { value, persist, onChange, label } = {}) {
  const entries = Array.isArray(options) ? options.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(options);
  const el = h('select', { 'data-persist': persist, 'aria-label': label, onchange: onChange }, entries.map(([v, l]) => h('option', { value: v }, typeof l === 'object' ? l.label : l)));
  if (value !== undefined) el.value = value;
  return el;
}

export function checkbox(label, { checked = false, persist, onChange } = {}) {
  const input = h('input', { type: 'checkbox', checked, 'data-persist': persist, onchange: onChange });
  return { root: h('label', { class: 'check' }, input, label), el: input, get checked() { return input.checked; } };
}

export const number = ({ value, min, max, step, placeholder, persist, onInput, width } = {}) =>
  h('input', { type: 'number', value, min, max, step, placeholder, 'data-persist': persist, oninput: onInput, style: width ? { width } : undefined });

export const input = ({ value = '', placeholder = '', persist, onInput, mono = true, type = 'text' } = {}) => {
  const el = h('input', { type, placeholder, 'data-persist': persist, oninput: onInput, class: mono ? 'mono' : '', spellcheck: false });
  el.value = value;
  return el;
};

export const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'hint' }, hint));

export const options = (...items) => h('div', { class: 'options' }, items);

export const row = (...items) => h('div', { class: 'row' }, items);

export const split = (...panes) => h('div', { class: 'split' }, panes);

export const card = (title, ...body) => h('section', { class: 'card' }, title && h('h3', {}, title), body);

export function status() {
  const el = h('div', { class: 'status', role: 'status' });
  return {
    root: el,
    error(msg) { el.className = 'status error'; el.textContent = msg instanceof Error ? msg.message : String(msg); },
    ok(msg) { el.className = 'status ok'; el.textContent = msg; },
    info(msg) { el.className = 'status'; el.textContent = msg; },
    clear() { el.className = 'status'; el.textContent = ''; },
  };
}

/** A read-only value with a copy button, for key/value result lists. */
export function kv(entries) {
  return h('dl', { class: 'kv' }, entries.filter(Boolean).map(([k, v]) => [
    h('dt', {}, k),
    h('dd', {}, h('span', { class: 'mono' }, v ?? ''), v !== undefined && v !== '' && h('button', { type: 'button', class: 'mini', title: 'Copy', onclick: () => copyText(String(v)) }, icon('copy'))),
  ]));
}

export function fileDrop({ accept, multiple = false, label = 'Drop a file here or click to choose', onFiles }) {
  const fileInput = h('input', { type: 'file', accept, multiple, hidden: true, onchange: () => fileInput.files.length && onFiles([...fileInput.files]) });
  const zone = h('div', { class: 'drop', tabindex: 0, role: 'button', onclick: () => fileInput.click(), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click() }, icon('upload'), h('span', {}, label), fileInput);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
  return zone;
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  h('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const readFile = (file, as = 'text') => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  if (as === 'dataurl') r.readAsDataURL(file);
  else if (as === 'buffer') r.readAsArrayBuffer(file);
  else r.readAsText(file);
});

export const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

/** Wires every control in `root` so that changing it reruns `fn`; errors land in `stat`. */
export function live(root, fn, stat) {
  const run = async () => {
    try { stat?.clear(); await fn(); } catch (e) { if (stat) stat.error(e); else console.error(e); }
  };
  const d = debounce(run, 120);
  root.addEventListener('input', (e) => { if (!e.target.readOnly) d(); });
  root.addEventListener('change', (e) => { if (!e.target.readOnly) d(); });
  return run;
}
