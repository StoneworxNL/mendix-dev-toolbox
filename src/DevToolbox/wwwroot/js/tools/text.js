import { h, clear, textArea, select, checkbox, input, field, options, split, status, live, kv, card, button, copyText } from '../ui.js';
import { ESCAPE_MODES, escapeText, unescapeText } from '../lib/encoding.js';
import { CASES, LINE_ACTIONS, analyze } from '../lib/textcase.js';

const C = 'Text';

const escape = {
  id: 'escape', name: 'Escape / unescape', category: C, icon: 'quote',
  description: 'Escape text for JSON, C#, regex, SQL, XML, CSV or Mendix expressions, and back.',
  keywords: 'string literal backslash quote escape unescape',
  render(root) {
    const dir = select({ escape: 'Escape', unescape: 'Unescape' }, { persist: 'dir', label: 'Direction' });
    const mode = select(ESCAPE_MODES, { persist: 'mode', label: 'Language' });
    const src = textArea({ label: 'Input', persist: 'input' });
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, options(field('Direction', dir), field('For', mode)), stat.root, split(src.root, out.root));
    return live(root, () => { out.value = dir.value === 'escape' ? escapeText(src.value, mode.value) : unescapeText(src.value, mode.value); }, stat);
  },
};

const analyzer = {
  id: 'text-tools', name: 'Text analyzer & case', category: C, icon: 'case',
  description: 'Count characters, words and lines; convert case; sort, dedupe and trim lines.',
  keywords: 'count words characters camelcase snake_case kebab pascal upper lower sort lines dedupe',
  render(root) {
    const src = textArea({ label: 'Text', persist: 'input', wrap: true, rows: 10 });
    const stats = h('div');
    const out = textArea({ label: 'Result', readonly: true, rows: 10 });
    const apply = (fn) => { out.value = fn(src.value); };
    const caseButtons = Object.values(CASES).map((c) => button(c.label, () => apply(c.fn), { kind: 'chip' }));
    const lineButtons = Object.values(LINE_ACTIONS).map((a) => button(a.label, () => apply((t) => a.fn(t.split(/\r?\n/)).join('\n')), { kind: 'chip' }));
    const use = button('Use result as input', () => { src.value = out.value; src.el.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'ghost', iconName: 'swap' });
    clear(root, split(src.root, stats), card('Convert case', h('div', { class: 'chips' }, caseButtons)), card('Lines', h('div', { class: 'chips' }, lineButtons)), out.root, options(use));
    return live(root, () => {
      const a = analyze(src.value);
      clear(stats, card('Statistics', kv([['Characters', String(a.characters)], ['Without whitespace', String(a.charactersNoSpaces)], ['Words', String(a.words)], ['Lines', String(a.lines)], ['Sentences', String(a.sentences)], ['Paragraphs', String(a.paragraphs)], ['UTF-8 bytes', String(a.bytes)]])),
        a.topWords.length ? card('Most frequent words', h('ol', { class: 'freq' }, a.topWords.map(([w, n]) => h('li', {}, h('span', { class: 'mono' }, w), ` ${n}×`)))) : null);
    });
  },
};

const diff = {
  id: 'diff', name: 'Text compare', category: C, icon: 'diff',
  description: 'Compare two texts line by line, word by word or character by character.',
  keywords: 'diff compare difference changes merge',
  render(root) {
    const mode = select({ lines: 'Lines', words: 'Words', chars: 'Characters', json: 'JSON (normalized)' }, { persist: 'mode', label: 'Compare by' });
    const view = select({ split: 'Side by side', inline: 'Inline' }, { persist: 'view', label: 'View' });
    const ignoreCase = checkbox('Ignore case', { persist: 'case' });
    const ignoreWs = checkbox('Ignore whitespace', { persist: 'ws' });
    const a = textArea({ label: 'Original', persist: 'a' });
    const b = textArea({ label: 'Changed', persist: 'b' });
    const result = h('div', { class: 'diff' });
    const stat = status();
    clear(root, options(field('Compare by', mode), field('View', view), ignoreCase.root, ignoreWs.root), split(a.root, b.root), stat.root, result);
    return live(root, () => {
      clear(result);
      let left = a.value, right = b.value;
      if (!left && !right) return;
      const opts = { ignoreCase: ignoreCase.checked, ignoreWhitespace: ignoreWs.checked };
      let parts;
      if (mode.value === 'json') {
        const norm = (t) => JSON.stringify(JSON.parse(t), null, 2);
        left = norm(left); right = norm(right);
        parts = Diff.diffLines(left, right, opts);
      } else if (mode.value === 'lines') parts = Diff.diffLines(left, right, { ...opts, newlineIsToken: false });
      else if (mode.value === 'words') parts = ignoreWs.checked ? Diff.diffWords(left, right, opts) : Diff.diffWordsWithSpace(left, right, opts);
      else parts = Diff.diffChars(left, right, opts);
      const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 1), 0);
      const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 1), 0);
      if (!added && !removed) { stat.ok('The texts are identical.'); return; }
      stat.info(`${added} added, ${removed} removed (${mode.value === 'json' ? 'lines' : mode.value})`);
      const lineMode = mode.value === 'lines' || mode.value === 'json';
      if (view.value === 'split' && lineMode) {
        const rows = [];
        let ln = 1, rn = 1;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const lines = p.value.replace(/\n$/, '').split('\n');
          if (p.removed && parts[i + 1]?.added) {
            const next = parts[++i].value.replace(/\n$/, '').split('\n');
            for (let j = 0; j < Math.max(lines.length, next.length); j++) {
              const l = lines[j], r = next[j];
              const wd = l !== undefined && r !== undefined ? Diff.diffWordsWithSpace(l, r) : null;
              rows.push([l === undefined ? null : ln++, l, 'del', r === undefined ? null : rn++, r, 'ins', wd]);
            }
          } else for (const l of lines) {
            if (p.removed) rows.push([ln++, l, 'del', null, undefined, '']);
            else if (p.added) rows.push([null, undefined, '', rn++, l, 'ins']);
            else rows.push([ln++, l, '', rn++, l, '']);
          }
        }
        const words = (wd, side) => wd.filter((x) => !(side === 'l' ? x.added : x.removed)).map((x) => (x.added || x.removed ? h('mark', {}, x.value) : x.value));
        result.append(h('table', { class: 'diff-table mono' }, h('tbody', {}, rows.map(([l, lt, lc, r, rt, rc, wd]) => h('tr', {},
          h('td', { class: 'ln' }, l ?? ''), h('td', { class: lt === undefined ? 'empty' : lc }, wd ? words(wd, 'l') : lt ?? ''),
          h('td', { class: 'ln' }, r ?? ''), h('td', { class: rt === undefined ? 'empty' : rc }, wd ? words(wd, 'r') : rt ?? ''))))));
      } else {
        result.append(h('pre', { class: 'diff-inline mono' }, parts.map((p) => (p.added ? h('ins', {}, p.value) : p.removed ? h('del', {}, p.value) : p.value))));
      }
      result.append(options(button('Copy unified patch', () => copyText(Diff.createTwoFilesPatch('original', 'changed', left, right)), { kind: 'ghost', iconName: 'copy' })));
    }, stat);
  },
};

const markdown = {
  id: 'markdown', name: 'Markdown preview', category: C, icon: 'markdown',
  description: 'Write GitHub-flavored Markdown and see it rendered; copy the HTML.',
  keywords: 'md readme gfm render html',
  render(root) {
    const src = textArea({ label: 'Markdown', persist: 'input', wrap: true, value: '# Hello Mendix\n\n- [x] Studio Pro extension\n- [ ] Ship it\n\n| Tool | Category |\n| --- | --- |\n| JSON formatter | Formatters |\n\n```js\nconsole.log("hi");\n```\n' });
    const preview = h('article', { class: 'markdown-body' });
    let html = '';
    const head = h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, 'Preview'), h('div', { class: 'pane-tools' }, button('Copy HTML', () => copyText(html), { kind: 'ghost', iconName: 'copy' })));
    clear(root, split(src.root, h('div', { class: 'pane' }, head, preview)));
    return live(root, () => {
      html = DOMPurify.sanitize(marked.parse(src.value, { gfm: true, breaks: false }));
      preview.innerHTML = html;
      for (const a of preview.querySelectorAll('a')) { a.target = '_blank'; a.rel = 'noopener'; }
    });
  },
};

const FLAGS = { g: 'global', i: 'ignore case', m: 'multiline', s: 'dot matches newline', u: 'unicode', y: 'sticky' };

const regex = {
  id: 'regex', name: 'Regex tester', category: C, icon: 'regex',
  description: 'Test a JavaScript regular expression: highlighted matches, groups and replace preview.',
  keywords: 'regular expression regexp pattern match replace capture group',
  render(root) {
    const pattern = input({ value: '(\\w+)@(\\w+)\\.com', persist: 'pattern' });
    const flagBoxes = Object.entries(FLAGS).map(([f, label]) => [f, checkbox(f, { checked: f === 'g', persist: `flag-${f}` })]);
    for (const [f, c] of flagBoxes) c.root.title = FLAGS[f];
    const replace = input({ placeholder: 'Replacement, e.g. $2: $1', persist: 'replace' });
    const src = textArea({ label: 'Test text', persist: 'input', wrap: true, value: 'Contact jane@example.com or support@mendix.com.' });
    const highlight = h('pre', { class: 'highlight mono' });
    const groups = h('div');
    const replaced = textArea({ label: 'Replace result', readonly: true, wrap: true, rows: 4 });
    const stat = status();
    const cheats = [['\\d', 'digit'], ['\\w', 'word char'], ['\\s', 'whitespace'], ['.', 'any char'], ['^ $', 'start / end'], ['[abc]', 'set'], ['(…)', 'group'], ['(?<name>…)', 'named group'], ['(?:…)', 'non-capturing'], ['a|b', 'either'], ['* + ?', '0+, 1+, 0-1'], ['{2,5}', 'count'], ['(?=…)', 'lookahead'], ['\\b', 'word boundary']];
    clear(root, field('Pattern', pattern), options(...flagBoxes.map(([, c]) => c.root)), stat.root, split(src.root, h('div', { class: 'pane' }, h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, 'Matches')), highlight)), groups, field('Replace with', replace), replaced.root,
      card('Cheat sheet', h('div', { class: 'cheats' }, cheats.map(([t, d]) => h('span', {}, h('code', {}, t), ` ${d}`)))));
    return live(root, () => {
      clear(groups); clear(highlight);
      replaced.value = '';
      if (!pattern.value) { highlight.textContent = src.value; return; }
      const flags = flagBoxes.filter(([, c]) => c.checked).map(([f]) => f).join('');
      const re = new RegExp(pattern.value, flags);
      const text = src.value;
      const matches = [];
      if (re.global || re.sticky) {
        for (const m of text.matchAll(re.global ? re : new RegExp(re.source, `${flags}g`))) { matches.push(m); if (matches.length > 5000) break; }
      } else { const m = re.exec(text); if (m) matches.push(m); }
      let last = 0;
      for (const m of matches) {
        highlight.append(text.slice(last, m.index), h('mark', { title: `Match at ${m.index}` }, m[0] || '∅'));
        last = m.index + m[0].length;
      }
      highlight.append(text.slice(last));
      stat.info(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);
      if (matches.length) {
        const names = matches[0].groups ? Object.keys(matches[0].groups) : [];
        const cols = matches[0].length - 1;
        groups.append(card('Groups', h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Index'), h('th', {}, 'Match'), Array.from({ length: cols }, (_, i) => h('th', {}, names[i] ? `${i + 1} ‹${names[i]}›` : `${i + 1}`)))),
          h('tbody', {}, matches.slice(0, 200).map((m, n) => h('tr', {}, h('td', {}, n + 1), h('td', {}, m.index), h('td', { class: 'mono' }, m[0]), Array.from({ length: cols }, (_, i) => h('td', { class: 'mono' }, m[i + 1] ?? '—')))))))));
      }
      if (replace.value) replaced.value = text.replace(re, replace.value);
    }, stat);
  },
};

export default [escape, analyzer, diff, markdown, regex];
