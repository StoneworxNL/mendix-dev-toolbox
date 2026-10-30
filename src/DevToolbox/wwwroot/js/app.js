import { h, clear, icon } from './ui.js';
import converters from './tools/converters.js';
import encoders from './tools/encoders.js';
import formatters from './tools/formatters.js';
import generators from './tools/generators.js';
import text from './tools/text.js';
import testers from './tools/testers.js';
import graphics from './tools/graphics.js';

export const TOOLS = [...converters, ...encoders, ...formatters, ...generators, ...text, ...testers, ...graphics];
const CATEGORIES = [...new Set(TOOLS.map((t) => t.category))];

const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(`dtb:${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`dtb:${key}`, JSON.stringify(value)); } catch { /* storage full or blocked */ } },
};

const els = {
  nav: document.getElementById('nav'),
  main: document.getElementById('main'),
  search: document.getElementById('search'),
  shell: document.getElementById('shell'),
};

let favorites = new Set(store.get('favorites', []));
const toggleFavorite = (id) => {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  store.set('favorites', [...favorites]);
  renderNav();
};

function matches(tool, q) {
  if (!q) return true;
  const hay = `${tool.name} ${tool.description} ${tool.keywords ?? ''} ${tool.category}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function navLink(tool, current) {
  return h('a', { href: `#/${tool.id}`, class: `nav-item${tool.id === current ? ' active' : ''}`, 'aria-current': tool.id === current ? 'page' : undefined }, icon(tool.icon), h('span', {}, tool.name));
}

function renderNav() {
  const current = location.hash.slice(2);
  const q = els.search.value.trim();
  const groups = [];
  const favs = TOOLS.filter((t) => favorites.has(t.id) && matches(t, q));
  if (!q) groups.push(h('a', { href: '#/', class: `nav-item${!current ? ' active' : ''}` }, icon('home'), h('span', {}, 'All tools')));
  if (favs.length) groups.push(h('div', { class: 'nav-group' }, h('div', { class: 'nav-heading' }, 'Favorites'), favs.map((t) => navLink(t, current))));
  for (const cat of CATEGORIES) {
    const tools = TOOLS.filter((t) => t.category === cat && matches(t, q));
    if (tools.length) groups.push(h('div', { class: 'nav-group' }, h('div', { class: 'nav-heading' }, cat), tools.map((t) => navLink(t, current))));
  }
  if (!groups.length || (q && groups.length === 0)) groups.push(h('p', { class: 'hint pad' }, 'No tools match.'));
  clear(els.nav, groups);
}

function renderHome() {
  document.title = 'Developer Toolbox';
  const q = els.search.value.trim();
  const tile = (t) => h('a', { href: `#/${t.id}`, class: 'tile' }, h('div', { class: 'tile-icon' }, icon(t.icon)), h('div', {}, h('div', { class: 'tile-name' }, t.name), h('div', { class: 'tile-desc' }, t.description)));
  const favs = TOOLS.filter((t) => favorites.has(t.id) && matches(t, q));
  clear(els.main,
    h('header', { class: 'tool-head' }, h('div', {}, h('h1', {}, 'Developer Toolbox'), h('p', { class: 'lead' }, `${TOOLS.length} offline utilities for everyday developer chores. Everything runs locally inside Studio Pro; nothing you paste leaves your machine.`))),
    favs.length ? h('section', {}, h('h2', {}, 'Favorites'), h('div', { class: 'tiles' }, favs.map(tile))) : null,
    CATEGORIES.map((cat) => {
      const tools = TOOLS.filter((t) => t.category === cat && matches(t, q));
      return tools.length ? h('section', {}, h('h2', {}, cat), h('div', { class: 'tiles' }, tools.map(tile))) : null;
    }));
}

// Restore every [data-persist] control of a tool and save it again whenever it changes.
function bindPersistence(tool, root) {
  for (const el of root.querySelectorAll('[data-persist]')) {
    const key = `tool:${tool.id}:${el.dataset.persist}`;
    const saved = store.get(key);
    if (saved !== null) {
      if (el.type === 'checkbox') el.checked = saved;
      else if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === saved)) el.value = saved;
    }
    const save = () => store.set(key, el.type === 'checkbox' ? el.checked : el.value.length > 200000 ? '' : el.value);
    el.addEventListener('input', save);
    el.addEventListener('change', save);
  }
}

function renderTool(tool) {
  document.title = `${tool.name} · Developer Toolbox`;
  const body = h('div', { class: 'tool-body' });
  const star = h('button', { type: 'button', class: `star${favorites.has(tool.id) ? ' on' : ''}`, title: 'Add to favorites', 'aria-pressed': String(favorites.has(tool.id)), onclick: () => { toggleFavorite(tool.id); star.classList.toggle('on'); star.setAttribute('aria-pressed', String(favorites.has(tool.id))); } }, icon('star'));
  clear(els.main, h('header', { class: 'tool-head' }, h('div', { class: 'tool-icon' }, icon(tool.icon)), h('div', { class: 'grow' }, h('h1', {}, tool.name), h('p', { class: 'lead' }, tool.description)), star), body);
  const run = tool.render(body);
  bindPersistence(tool, body);
  if (typeof run === 'function') run();
  store.set('last', tool.id);
}

function route() {
  const id = location.hash.slice(2);
  const tool = TOOLS.find((t) => t.id === id);
  if (tool) renderTool(tool); else renderHome();
  els.shell.classList.remove('nav-open');
  renderNav();
  els.main.scrollTop = 0;
}

// --- Theme ---------------------------------------------------------------

const themeButton = document.getElementById('theme');
function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  clear(themeButton, icon(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'contrast'));
  themeButton.title = `Theme: ${theme}`;
}
let theme = store.get('theme', 'auto');
applyTheme(theme);
themeButton.addEventListener('click', () => {
  theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme];
  store.set('theme', theme);
  applyTheme(theme);
});

// --- Wiring --------------------------------------------------------------

document.getElementById('menu').addEventListener('click', () => els.shell.classList.toggle('nav-open'));
document.getElementById('scrim').addEventListener('click', () => els.shell.classList.remove('nav-open'));
els.search.addEventListener('input', () => { renderNav(); if (!location.hash.slice(2)) renderHome(); });
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = TOOLS.find((t) => matches(t, els.search.value.trim()));
    if (first) { location.hash = `#/${first.id}`; els.search.value = ''; els.search.blur(); }
  } else if (e.key === 'Escape') { els.search.value = ''; renderNav(); els.search.blur(); }
});
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); els.search.focus(); els.search.select(); }
});
window.addEventListener('hashchange', route);
route();
