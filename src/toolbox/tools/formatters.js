import { format as formatSql } from 'sql-formatter';
import { clear, textArea, select, checkbox, field, options, split, status, live } from '../ui.js';
import { formatXml, minifyXml } from '../lib/xml.js';
import { sortDeep } from './converters.js';

const C = 'Formatters';
const INDENTS = { 2: '2 spaces', 4: '4 spaces', tab: 'Tab', min: 'Minified' };
const indentText = (v) => (v === 'tab' ? '\t' : ' '.repeat(Number(v)));

// Point at the line and column of a JSON.parse error, which only reports an offset.
function jsonError(e, text) {
  const m = /position (\d+)/.exec(e.message);
  if (!m) return e;
  const pos = Number(m[1]);
  const before = text.slice(0, pos).split('\n');
  return new Error(`${e.message.replace(/ in JSON at position \d+.*$/, '')} at line ${before.length}, column ${before.at(-1).length + 1}.`);
}

const json = {
  id: 'json-format', name: 'JSON formatter', category: C, icon: 'braces',
  description: 'Pretty-print, minify, sort and validate JSON.',
  keywords: 'beautify prettify minify validate lint json5',
  render(root) {
    const indent = select(INDENTS, { persist: 'indent', label: 'Indent' });
    const sortKeys = checkbox('Sort keys', { persist: 'sort' });
    const escapeUnicode = checkbox('Escape non-ASCII', { persist: 'ascii' });
    const src = textArea({ label: 'Input', persist: 'input', placeholder: '{"paste":"json here"}' });
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, options(field('Indent', indent), sortKeys.root, escapeUnicode.root), stat.root, split(src.root, out.root));
    return live(root, () => {
      if (!src.value.trim()) { out.value = ''; return; }
      let data;
      try { data = JSON.parse(src.value); } catch (e) { out.value = ''; throw jsonError(e, src.value); }
      if (sortKeys.checked) data = sortDeep(data);
      let text = indent.value === 'min' ? JSON.stringify(data) : JSON.stringify(data, null, indentText(indent.value));
      if (escapeUnicode.checked) text = text.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
      out.value = text;
      stat.ok('Valid JSON');
    }, stat);
  },
};

const sql = {
  id: 'sql-format', name: 'SQL formatter', category: C, icon: 'database',
  description: 'Format SQL for PostgreSQL, SQL Server, MySQL, Oracle, SQLite, OQL-style queries and more.',
  keywords: 'beautify query tsql plsql postgres mssql oql',
  render(root) {
    const dialect = select({ sql: 'Standard SQL', postgresql: 'PostgreSQL', transactsql: 'SQL Server (T-SQL)', mysql: 'MySQL', mariadb: 'MariaDB', plsql: 'Oracle PL/SQL', sqlite: 'SQLite', db2: 'Db2', snowflake: 'Snowflake', bigquery: 'BigQuery', redshift: 'Redshift', spark: 'Spark', hive: 'Hive', trino: 'Trino' }, { value: 'postgresql', persist: 'dialect', label: 'Dialect' });
    const keywordCase = select({ upper: 'UPPER', lower: 'lower', preserve: 'Preserve' }, { persist: 'kw', label: 'Keyword case' });
    const indent = select({ 2: '2 spaces', 4: '4 spaces', tab: 'Tab' }, { persist: 'indent', label: 'Indent' });
    const lines = select({ 1: '1', 2: '2' }, { persist: 'lines', label: 'Lines between queries' });
    const src = textArea({ label: 'Input', persist: 'input', placeholder: 'select a.name, count(*) from account a join "order" o on o.account_id = a.id group by a.name' });
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, options(field('Dialect', dialect), field('Keyword case', keywordCase), field('Indent', indent), field('Lines between queries', lines)), stat.root, split(src.root, out.root));
    return live(root, () => {
      if (!src.value.trim()) { out.value = ''; return; }
      out.value = formatSql(src.value, {
        language: dialect.value, keywordCase: keywordCase.value,
        tabWidth: indent.value === 'tab' ? 2 : Number(indent.value), useTabs: indent.value === 'tab',
        linesBetweenQueries: Number(lines.value),
      });
    }, stat);
  },
};

const xml = {
  id: 'xml-format', name: 'XML formatter', category: C, icon: 'code',
  description: 'Pretty-print or minify XML and check that it is well formed.',
  keywords: 'beautify prettify minify xhtml svg soap wsdl',
  render(root) {
    const indent = select(INDENTS, { persist: 'indent', label: 'Indent' });
    const attrs = checkbox('Attributes on new lines', { persist: 'attrs' });
    const comments = checkbox('Keep comments when minifying', { checked: true, persist: 'comments' });
    const src = textArea({ label: 'Input', persist: 'input', placeholder: '<root><item id="1">Hello</item></root>' });
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, options(field('Indent', indent), attrs.root, comments.root), stat.root, split(src.root, out.root));
    return live(root, () => {
      if (!src.value.trim()) { out.value = ''; return; }
      const doc = new DOMParser().parseFromString(src.value, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) { out.value = ''; throw new Error(err.textContent.replace(/\s+/g, ' ').replace(/^.*?error[^:]*:\s*/i, '').trim()); }
      out.value = indent.value === 'min' ? minifyXml(src.value, { removeComments: !comments.checked }) : formatXml(src.value, { indent: indentText(indent.value), newLineAttributes: attrs.checked });
      stat.ok('Well-formed XML');
    }, stat);
  },
};

export default [json, sql, xml];
