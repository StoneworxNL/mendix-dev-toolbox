import { JSONPath } from 'jsonpath-plus';
import { h, clear, textArea, select, input, field, options, split, status, live, card, kv, button } from '../ui.js';

const C = 'Testers';

const jsonPath = {
  id: 'jsonpath', name: 'JSONPath tester', category: C, icon: 'path',
  description: 'Query JSON with JSONPath expressions and see the matching values and their paths.',
  keywords: 'json path query filter jq select',
  render(root) {
    const expr = input({ value: '$.store.book[?(@.price < 10)].title', persist: 'expr' });
    const src = textArea({ label: 'JSON', persist: 'input', value: JSON.stringify({ store: { book: [{ title: 'Sayings of the Century', price: 8.95 }, { title: 'Sword of Honour', price: 12.99 }, { title: 'Moby Dick', price: 8.99 }], bicycle: { color: 'red', price: 19.95 } } }, null, 2) });
    const out = textArea({ label: 'Result', readonly: true });
    const show = select({ value: 'Values', path: 'Paths', pointer: 'JSON Pointers' }, { persist: 'show', label: 'Show' });
    const stat = status();
    const examples = ['$..price', '$.store.book[*].title', '$.store.book[-1:]', '$..book[?(@.price > 10)]', '$.store.*', '$..book.length'].map((e) => button(e, () => { expr.value = e; run(); }, { kind: 'chip' }));
    clear(root, field('Expression', expr), options(field('Show', show), ...examples), stat.root, split(src.root, out.root));
    const run = live(root, () => {
      out.value = '';
      if (!expr.value.trim() || !src.value.trim()) return;
      const json = JSON.parse(src.value);
      const result = JSONPath({ path: expr.value, json, resultType: show.value, eval: 'safe' });
      out.value = show.value === 'value' ? JSON.stringify(result, null, 2) : result.join('\n');
      stat.info(`${result.length} result${result.length === 1 ? '' : 's'}`);
    }, stat);
    return run;
  },
};

function serializeNode(n) {
  if (n.nodeType === Node.ATTRIBUTE_NODE) return `@${n.name}="${n.value}"`;
  if (n.nodeType === Node.ELEMENT_NODE) return new XMLSerializer().serializeToString(n);
  return n.textContent;
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`${label}: ${err.textContent.replace(/\s+/g, ' ').trim()}`);
  return doc;
}

const xpath = {
  id: 'xpath', name: 'XPath tester', category: C, icon: 'path',
  description: 'Evaluate XPath 1.0 expressions against XML, including namespaced documents.',
  keywords: 'xml query xpath xslt select nodes',
  render(root) {
    const expr = input({ value: '//book[price > 10]/title', persist: 'expr' });
    const src = textArea({ label: 'XML', persist: 'input', value: '<library>\n  <book id="1"><title>Clean Code</title><price>9.50</price></book>\n  <book id="2"><title>Domain-Driven Design</title><price>42</price></book>\n</library>' });
    const out = textArea({ label: 'Result', readonly: true });
    const stat = status();
    clear(root, field('Expression', expr, 'Prefixes declared on the root element resolve automatically.'), stat.root, split(src.root, out.root));
    return live(root, () => {
      out.value = '';
      if (!expr.value.trim() || !src.value.trim()) return;
      const doc = parseXml(src.value, 'XML');
      const nsMap = {};
      for (const a of doc.documentElement.attributes) if (a.name.startsWith('xmlns')) nsMap[a.name.split(':')[1] ?? ''] = a.value;
      const resolver = (prefix) => nsMap[prefix] ?? null;
      const r = doc.evaluate(expr.value, doc, resolver, XPathResult.ANY_TYPE, null);
      if (r.resultType === XPathResult.NUMBER_TYPE) out.value = String(r.numberValue);
      else if (r.resultType === XPathResult.STRING_TYPE) out.value = r.stringValue;
      else if (r.resultType === XPathResult.BOOLEAN_TYPE) out.value = String(r.booleanValue);
      else {
        const nodes = [];
        for (let n = r.iterateNext(); n; n = r.iterateNext()) nodes.push(serializeNode(n));
        out.value = nodes.join('\n');
        stat.info(`${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
      }
    }, stat);
  },
};

// libxml2 compiled to WebAssembly. It ships as static files next to the bundle (see build.mjs),
// because it starts its own module worker and loads the .wasm relative to itself.
let xmllint;
async function validateXsd(xml, xsd) {
  xmllint ??= import(/* @vite-ignore */ new URL('./xmllint/index-browser.mjs', import.meta.url).href);
  const { validateXML } = await xmllint;
  try {
    return await validateXML({ xml: [{ fileName: 'document.xml', contents: xml }], schema: [{ fileName: 'schema.xsd', contents: xsd }] });
  } catch (e) {
    // A broken schema rejects instead of reporting validation errors.
    return { valid: false, errors: String(e.message ?? e).split('\n').filter((l) => l.trim() && !/fails to compile|failed to compile/.test(l)).map((line) => {
      const m = /^([^:]+):(\d+): (.*)$/.exec(line);
      return m ? { loc: { fileName: m[1], lineNumber: Number(m[2]) }, message: m[3] } : { loc: null, message: line };
    }) };
  }
}

const xsd = {
  id: 'xsd', name: 'XML / XSD validator', category: C, icon: 'check',
  description: 'Check XML against an XSD schema with libxml2, with line numbers for every error.',
  keywords: 'schema validate xsd xml wsdl import mapping',
  render(root) {
    const xml = textArea({ label: 'XML', persist: 'xml', value: '<order id="7">\n  <customer>Jane</customer>\n  <total>12.50</total>\n</order>' });
    const schema = textArea({ label: 'XSD schema', persist: 'xsd', value: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  <xs:element name="order">\n    <xs:complexType>\n      <xs:sequence>\n        <xs:element name="customer" type="xs:string"/>\n        <xs:element name="total" type="xs:decimal"/>\n      </xs:sequence>\n      <xs:attribute name="id" type="xs:int" use="required"/>\n    </xs:complexType>\n  </xs:element>\n</xs:schema>' });
    const results = h('div');
    const stat = status();
    clear(root, stat.root, split(xml.root, schema.root), results);
    return live(root, async () => {
      clear(results);
      if (!xml.value.trim()) return;
      parseXml(xml.value, 'XML');
      if (!schema.value.trim()) { stat.ok('Well-formed XML. Add a schema to validate it.'); return; }
      parseXml(schema.value, 'Schema');
      const { valid, errors } = await validateXsd(xml.value, schema.value);
      if (valid) { stat.ok('Valid: the XML matches the schema.'); return; }
      stat.error(`${errors.length} validation error${errors.length === 1 ? '' : 's'}`);
      results.append(card('Errors', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Line'), h('th', {}, 'Message'))),
        h('tbody', {}, errors.map((e) => h('tr', {}, h('td', {}, e.loc?.fileName ?? ''), h('td', {}, e.loc?.lineNumber ?? ''), h('td', {}, e.message.replace(/^element \S+: /, ''))))))));
    }, stat);
  },
};

export default [jsonPath, xpath, xsd];
