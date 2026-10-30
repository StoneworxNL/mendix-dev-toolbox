// Tokenizer-based XML pretty printer and minifier. It keeps comments, CDATA and processing
// instructions intact and never reorders attributes, so the output diff stays readable.

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>|<\/?[^>]+>|[^<]+/gi;

export function tokenizeXml(xml) {
  const tokens = [];
  for (const m of xml.matchAll(TOKEN)) {
    const t = m[0];
    if (t.startsWith('<!--')) tokens.push({ type: 'comment', text: t });
    else if (t.startsWith('<![CDATA[')) tokens.push({ type: 'cdata', text: t });
    else if (t.startsWith('<?') || /^<!DOCTYPE/i.test(t)) tokens.push({ type: 'decl', text: t });
    else if (t.startsWith('</')) tokens.push({ type: 'close', text: t, name: t.slice(2, -1).trim() });
    else if (t.startsWith('<')) tokens.push({ type: t.endsWith('/>') ? 'empty' : 'open', text: t, name: /^<([^\s/>]+)/.exec(t)?.[1] });
    else tokens.push({ type: 'text', text: t });
  }
  return tokens;
}

export function formatXml(xml, { indent = '  ', newLineAttributes = false } = {}) {
  const tokens = tokenizeXml(xml);
  const stack = [];
  const lines = [];
  let depth = 0;
  const pad = () => indent.repeat(depth);
  const oneLine = (t) => t.text.replace(/\s+/g, ' ').replace(/\s+(\/?>)$/, '$1');
  const tag = (t) => {
    if (!newLineAttributes) return oneLine(t);
    const attrs = [...t.text.matchAll(/([^\s=<>/]+)\s*=\s*("[^"]*"|'[^']*')/g)].map((m) => `${m[1]}=${m[2]}`);
    if (attrs.length < 2) return oneLine(t);
    const end = t.type === 'empty' ? '/>' : '>';
    return `<${t.name}\n${attrs.map((a) => pad() + indent + a).join('\n')}${end}`;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'text') {
      const trimmed = t.text.trim();
      if (trimmed) lines.push(pad() + trimmed);
      continue;
    }
    if (t.type === 'open') {
      // Keep <a>text</a> on one line.
      const next = tokens[i + 1], after = tokens[i + 2];
      if (next?.type === 'text' && after?.type === 'close' && after.name === t.name && !next.text.includes('\n')) {
        lines.push(pad() + tag(t) + next.text.trim() + after.text);
        i += 2;
        continue;
      }
      if (next?.type === 'close' && next.name === t.name) {
        lines.push(pad() + tag(t) + next.text);
        i += 1;
        continue;
      }
      lines.push(pad() + tag(t));
      stack.push(t.name);
      depth++;
      continue;
    }
    if (t.type === 'close') {
      const expected = stack.pop();
      if (expected !== t.name) throw new Error(`Unexpected </${t.name}>${expected ? `, expected </${expected}>` : ''}.`);
      depth--;
      lines.push(pad() + t.text);
      continue;
    }
    lines.push(pad() + (t.type === 'empty' ? tag(t) : t.text));
  }
  if (stack.length) throw new Error(`Unclosed element <${stack.pop()}>.`);
  return lines.join('\n');
}

export function minifyXml(xml, { removeComments = true } = {}) {
  return tokenizeXml(xml)
    .filter((t) => !(removeComments && t.type === 'comment'))
    .map((t) => (t.type === 'text' ? (t.text.trim() ? t.text.replace(/\s+/g, ' ').trim() : '') : t.type === 'open' || t.type === 'empty' ? t.text.replace(/\s+/g, ' ').replace(/\s+(\/?>)$/, '$1') : t.text))
    .join('');
}
