// OQL (Mendix Object Query Language) tokenizer, formatter, linter and reference data.
// Follows https://docs.mendix.com/refguide/oql/ for Mendix 11, including the OQL v2 rules.

export const RESERVED = new Set(('ALL AND AS ASC AVG BOOLEAN BY CASE CAST CONFLICT COUNT DATEDIFF DATEPART DATETIME DAY DAYOFYEAR DECIMAL DELETE DESC DISTINCT DUPLICATE ELSE END EXISTS FALSE FLOAT FROM FULL GROUP HAVING HOUR IGNORE IN INNER INSERT INTEGER INTO IS JOIN KEY LEFT LIKE LIMIT LONG MATCHED MAX MERGE MILLISECOND MIN MINUTE MONTH NOT NULL OFFSET ON OR ORDER OUTER QUARTER REPLACE RIGHT SECOND SELECT SET SOURCE STRING STRING_AGG SUM TARGET THEN TRUE UNION UPDATE UPSERT USING VALUES WEEK WEEKDAY WHEN WHERE WITH YEAR').split(' '));

/** OQL functions with their syntax and the Mendix version that introduced them (when newer than 10). */
export const FUNCTIONS = [
  { name: 'CAST', syntax: 'CAST(expression AS BOOLEAN | DATETIME | DECIMAL[(precision, scale)] | INTEGER | LONG | STRING)', description: 'Converts a value to another type.' },
  { name: 'COALESCE', syntax: 'COALESCE(expression, expression [, ...])', description: 'Returns the first argument that is not NULL. All arguments must have compatible types.' },
  { name: 'DATEADD', syntax: 'DATEADD(datepart, length, date [, timezone])', description: 'Adds a number of date parts (YEAR, MONTH, DAY, HOUR, ...) to a date.', since: '11.9' },
  { name: 'DATEDIFF', syntax: 'DATEDIFF(unit, startdate, enddate [, timezone])', description: 'Difference between two dates in YEAR, QUARTER, MONTH, DAY, WEEK, HOUR, MINUTE, SECOND or MILLISECOND.' },
  { name: 'DATEFORMAT', syntax: "DATEFORMAT(expression, 'pattern')", description: 'Formats a date as a string.', since: '11.12' },
  { name: 'DATEPARSE', syntax: "DATEPARSE(expression, 'pattern')", description: 'Parses a string into a date.', since: '11.10' },
  { name: 'DATEPART', syntax: 'DATEPART(datepart, date [, timezone])', description: 'Extracts YEAR, QUARTER, MONTH, DAYOFYEAR, DAY, WEEK, WEEKDAY, HOUR, MINUTE, SECOND or MILLISECOND.' },
  { name: 'DATETRUNC', syntax: 'DATETRUNC(datepart, date [, timezone])', description: 'Truncates a date to the given date part.', since: '11.9' },
  { name: 'LENGTH', syntax: 'LENGTH(expression)', description: 'Number of characters in a string.' },
  { name: 'LOCATE', syntax: 'LOCATE(substring, string [, start])', description: 'Position of a substring, starting at 1; 0 when not found.', since: '11.9' },
  { name: 'LOWER', syntax: 'LOWER(expression)', description: 'Converts a string to lower case.' },
  { name: 'LPAD', syntax: "LPAD(expression, length [, 'fill'])", description: 'Pads a string on the left to a given length.', since: '11.12' },
  { name: 'LTRIM', syntax: 'LTRIM(expression)', description: 'Removes leading whitespace.', since: '11.11' },
  { name: 'RANGEBEGIN', syntax: 'RANGEBEGIN($rangeParameter)', description: 'Start value of a range parameter (data sets).' },
  { name: 'RANGEEND', syntax: 'RANGEEND($rangeParameter)', description: 'End value of a range parameter (data sets).' },
  { name: 'REPLACE', syntax: 'REPLACE(expression, pattern, replacement)', description: 'Replaces every occurrence of a substring.' },
  { name: 'ROUND', syntax: 'ROUND(expression, decimals)', description: 'Rounds a number. In OQL v2 the result is always a Decimal.' },
  { name: 'RPAD', syntax: "RPAD(expression, length [, 'fill'])", description: 'Pads a string on the right to a given length.', since: '11.12' },
  { name: 'RTRIM', syntax: 'RTRIM(expression)', description: 'Removes trailing whitespace.', since: '11.11' },
  { name: 'SUBSTRING', syntax: 'SUBSTRING(expression, start [, length])', description: 'Part of a string, starting at 1.', since: '11.9' },
  { name: 'TRIM', syntax: 'TRIM(expression)', description: 'Removes leading and trailing whitespace.', since: '11.11' },
  { name: 'UPPER', syntax: 'UPPER(expression)', description: 'Converts a string to upper case.' },
  { name: 'COUNT', syntax: 'COUNT(*) | COUNT([DISTINCT] path)', description: 'Aggregate: number of rows or non-NULL values.' },
  { name: 'AVG', syntax: 'AVG([DISTINCT] path)', description: 'Aggregate: average.' },
  { name: 'MAX', syntax: 'MAX([DISTINCT] path)', description: 'Aggregate: largest value.' },
  { name: 'MIN', syntax: 'MIN([DISTINCT] path)', description: 'Aggregate: smallest value.' },
  { name: 'SUM', syntax: 'SUM([DISTINCT] path)', description: 'Aggregate: total.' },
  { name: 'STRING_AGG', syntax: "STRING_AGG(path, 'separator')", description: 'Aggregate: joins strings with a separator.' },
];
const FUNCTION_NAMES = new Set(FUNCTIONS.map((f) => f.name));

const tok = (type, value, pos) => ({ type, value, pos });

/**
 * Splits OQL into tokens: ws, comment, string, qident ("quoted"), param ($name), number, word
 * (identifiers and dotted names), sysvar ([%Token%]), op, punct. Throws on unterminated input.
 */
export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const start = i;
    if (/\s/.test(c)) { while (i < src.length && /\s/.test(src[i])) i++; out.push(tok('ws', src.slice(start, i), start)); continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < src.length && src[i] !== '\n') i++; out.push(tok('comment', src.slice(start, i), start)); continue; }
    if (c === '/' && src[i + 1] === '*') {
      // Block comments nest since Mendix 11.15.
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; if (!depth) break; } else i++;
      }
      if (depth) throw syntaxError('Unterminated /* comment', src, start);
      out.push(tok('comment', src.slice(start, i), start));
      continue;
    }
    if (c === "'") {
      i++;
      for (;;) {
        if (i >= src.length) throw syntaxError('Unterminated string literal', src, start);
        if (src[i] === "'") { if (src[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      out.push(tok('string', src.slice(start, i), start));
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw syntaxError('Unterminated quoted name', src, start);
      i = end + 1;
      out.push(tok('qident', src.slice(start, i), start));
      continue;
    }
    if (c === '[' && src[i + 1] === '%') {
      const end = src.indexOf('%]', i);
      if (end < 0) throw syntaxError('Unterminated [% token', src, start);
      i = end + 2;
      out.push(tok('sysvar', src.slice(start, i), start));
      continue;
    }
    if (c === '$') { i++; while (i < src.length && /\w/.test(src[i])) i++; out.push(tok('param', src.slice(start, i), start)); continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      while (i < src.length && /[\d.]/.test(src[i])) i++;
      if (/[eE]/.test(src[i] ?? '') && /[-+\d]/.test(src[i + 1] ?? '')) { i += 2; while (/\d/.test(src[i] ?? '')) i++; }
      out.push(tok('number', src.slice(start, i), start));
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      // Dotted names (Module.Entity, alias.Attribute) stay one word; a quoted part after a dot joins it too.
      for (;;) {
        while (i < src.length && /\w/.test(src[i])) i++;
        if (src[i] === '.' && /[A-Za-z_*"]/.test(src[i + 1] ?? '')) {
          i++;
          if (src[i] === '*') { i++; break; }
          if (src[i] === '"') { const end = src.indexOf('"', i + 1); if (end < 0) throw syntaxError('Unterminated quoted name', src, i); i = end + 1; if (src[i] !== '.') break; continue; }
          continue;
        }
        break;
      }
      out.push(tok('word', src.slice(start, i), start));
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['!=', '<=', '>=', '<>', '=='].includes(two)) { out.push(tok('op', two, start)); i += 2; continue; }
    if ('+-*/:%=<>'.includes(c)) { out.push(tok('op', c, start)); i++; continue; }
    if ('(),;'.includes(c)) { out.push(tok('punct', c, start)); i++; continue; }
    throw syntaxError(`Unexpected character "${c}"`, src, start);
  }
  return out;
}

export function position(src, pos) {
  const before = src.slice(0, pos).split('\n');
  return { line: before.length, col: before.at(-1).length + 1 };
}

function syntaxError(message, src, pos) {
  const { line, col } = position(src, pos);
  const e = new Error(`${message} at line ${line}, column ${col}.`);
  e.line = line; e.col = col;
  return e;
}

const upper = (t) => (t.type === 'word' ? t.value.toUpperCase() : t.value);
const isKw = (t, ...kws) => t && t.type === 'word' && kws.includes(t.value.toUpperCase());

// Clause keywords that start on a new line at the current query's indent.
const CLAUSES = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'UNION', 'DELETE', 'UPDATE', 'INSERT', 'SET', 'VALUES']);
const JOIN_START = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'JOIN']);

/**
 * Formats OQL: keywords in upper case (unless `keywordCase` is 'preserve' or 'lower'),
 * one clause per line, one SELECT column per line, joins and AND/OR conditions indented.
 */
export function formatOql(src, { indent = '  ', keywordCase = 'upper' } = {}) {
  const tokens = tokenize(src).filter((t) => t.type !== 'ws');
  const kw = (t) => {
    if (t.type !== 'word' || t.value.includes('.') || !(RESERVED.has(t.value.toUpperCase()) || FUNCTION_NAMES.has(t.value.toUpperCase()))) return t.value;
    return keywordCase === 'lower' ? t.value.toLowerCase() : keywordCase === 'preserve' ? t.value : t.value.toUpperCase();
  };
  const lines = [];
  let line = '';
  let level = 0; // indent of the current query
  const stack = []; // per open paren: { subquery, level, clause }
  let clause = '';
  let caseDepth = 0;
  const newline = (extra = 0) => { if (line.trim()) lines.push(line.trimEnd()); line = indent.repeat(level + extra); };
  const write = (text, space = true) => {
    if (space && line.trim() && !/[(\s]$/.test(line) && !line.endsWith('/') && !line.endsWith('.')) line += ' ';
    line += text;
  };
  let prev = null;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const U = upper(t);
    const next = tokens[k + 1];
    if (t.type === 'comment') {
      if (t.value.startsWith('--')) { write(t.value); newline(clause === 'SELECT' ? 1 : 0); } else write(t.value);
      prev = t; continue;
    }
    if (t.type === 'word' && CLAUSES.has(U) && !caseDepth && !(U === 'ORDER' && !isKw(next, 'BY')) && !(U === 'GROUP' && !isKw(next, 'BY'))) {
      clause = U === 'GROUP' || U === 'ORDER' ? `${U} BY` : U;
      if (U === 'UNION') { newline(); write(kw(t)); if (isKw(next, 'ALL')) { write(kw(next)); k++; } newline(); prev = t; continue; }
      if (U === 'SET' && isKw(prev, 'UPDATE')) { /* UPDATE ... SET handled as clause */ }
      newline();
      write(kw(t));
      if (U === 'GROUP' || U === 'ORDER') { write(kw(next)); k++; }
      if (U === 'SELECT') {
        if (isKw(tokens[k + 1], 'DISTINCT')) { write(kw(tokens[k + 1])); k++; }
        newline(1);
      }
      prev = tokens[k]; continue;
    }
    if (t.type === 'word' && JOIN_START.has(U) && !caseDepth && clause === 'FROM') {
      newline(1);
      write(kw(t));
      while (tokens[k + 1] && isKw(tokens[k + 1], 'OUTER', 'JOIN')) { k++; write(kw(tokens[k])); }
      prev = tokens[k]; continue;
    }
    if (t.type === 'word' && (U === 'AND' || U === 'OR') && !caseDepth && (clause === 'WHERE' || clause === 'HAVING') && !stack.some((s) => !s.subquery)) {
      newline(1); write(kw(t)); prev = t; continue;
    }
    if (U === 'CASE') caseDepth++;
    if (U === 'END' && caseDepth) caseDepth--;
    if (t.value === '(') {
      const subquery = isKw(next, 'SELECT');
      const fn = prev && (prev.type === 'word' && (!RESERVED.has(upper(prev)) || FUNCTION_NAMES.has(upper(prev)) || ['DATEDIFF', 'DATEPART', 'CAST'].includes(upper(prev))) && !['IN', 'EXISTS', 'AS', 'ON', 'AND', 'OR', 'NOT', 'FROM', 'JOIN', 'WHERE', 'SELECT'].includes(upper(prev)));
      write('(', !fn);
      const lineIndent = Math.floor((line.length - line.trimStart().length) / indent.length);
      stack.push({ subquery, level, clause, caseDepth, lineIndent });
      if (subquery) { level = lineIndent + 1; caseDepth = 0; }
      prev = t; continue;
    }
    if (t.value === ')') {
      const s = stack.pop();
      if (s?.subquery) { level = s.level; clause = s.clause; caseDepth = s.caseDepth; newline(); line = indent.repeat(s.lineIndent); }
      line += ')';
      prev = t; continue;
    }
    if (t.value === ',') {
      line = line.trimEnd() + ',';
      const inParens = stack.length && !stack.at(-1).subquery;
      if (clause === 'SELECT' && !inParens && !caseDepth) newline(1);
      prev = t; continue;
    }
    if (t.value === ';') { line = line.trimEnd() + ';'; newline(); lines.push(''); prev = t; continue; }
    if (t.value === '/' ) { line = line.trimEnd() + '/'; prev = t; continue; }
    if (t.type === 'op' && t.value === '-' && (!prev || prev.type === 'op' || prev.value === '(' || prev.value === ',' || (prev.type === 'word' && RESERVED.has(upper(prev)) && !['END', 'NULL', 'TRUE', 'FALSE'].includes(upper(prev))))) {
      write('-'); prev = { type: 'unary', value: '-' }; continue;
    }
    if (prev?.type === 'unary' || prev?.value === '/') { line += kw(t); prev = t; continue; }
    write(kw(t));
    prev = t;
  }
  newline();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.join('\n');
}

// --- Linting -----------------------------------------------------------------

/** Splits a token list on top-level commas. */
function splitTopLevel(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.value === '(') depth++;
    if (t.value === ')') depth--;
    if (t.value === ',' && depth === 0) { parts.push([]); continue; }
    parts.at(-1).push(t);
  }
  return parts.filter((p) => p.length);
}

const isPath = (ts) => ts.length && ts.every((t, i) => (i % 2 === 0 ? t.type === 'word' || t.type === 'qident' : t.value === '/'));

/**
 * Checks OQL against common mistakes and the OQL v2 rules. Returns
 * `{ severity: 'error' | 'warning' | 'hint', message, line, col }[]`, sorted by position.
 */
export function lintOql(src) {
  const issues = [];
  let all;
  try { all = tokenize(src); } catch (e) { return [{ severity: 'error', message: e.message.replace(/ at line.*$/, ''), line: e.line, col: e.col }]; }
  const tokens = all.filter((t) => t.type !== 'ws' && t.type !== 'comment');
  const add = (severity, message, t) => issues.push({ severity, message, ...position(src, t?.pos ?? 0) });

  // Brackets
  const open = [];
  for (const t of tokens) {
    if (t.value === '(') open.push(t);
    if (t.value === ')' && !open.pop()) add('error', 'Closing parenthesis without a matching "("', t);
  }
  for (const t of open) add('error', 'Parenthesis is never closed', t);

  // Token-level checks
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    if (t.value === '==') add('error', 'Use = to compare, not ==', t);
    if (t.value === '<>') add('warning', 'Use != for "not equal"', t);
    if (t.value === '/' && (prev?.type === 'number' || next?.type === 'number')) add('error', 'OQL divides with ":" (a "/" separates path steps)', t);
    if (t.type === 'sysvar') {
      if (/CurrentObject/i.test(t.value)) add('error', '[%CurrentObject%] is not supported in OQL', t);
      else add('error', `System variables must be quoted: '${t.value}'`, t);
    }
    if (t.type === 'string' && /\[%CurrentObject%\]/i.test(t.value)) add('error', '[%CurrentObject%] is not supported in OQL', t);
    if (t.type === 'word' && t.value.includes('.')) {
      for (const part of t.value.split('.').slice(1)) {
        if (RESERVED.has(part.toUpperCase())) add('error', `"${part}" is a reserved word; quote it: ${t.value.replace(new RegExp(`\\.${part}\\b`), `."${part}"`)}`, t);
      }
    }
    if (t.value === ';' && next) add('hint', 'OQL runs one statement; the text after ";" may be ignored', t);
    if (t.type === 'word' && t.value.toUpperCase() === 'TOP') add('error', 'OQL has no TOP; use LIMIT n', t);
    if (t.type === 'word' && /^(ISNULL|IFNULL|NVL)$/i.test(t.value) && next?.value === '(') add('error', `${t.value}() is not an OQL function; use COALESCE()`, t);
    if (t.type === 'word' && /^(GETDATE|NOW|CURRENT_TIMESTAMP)$/i.test(t.value)) add('error', `${t.value} is not available in OQL; use '[%CurrentDateTime%]'`, t);
    if (t.type === 'word' && /^(CONCAT)$/i.test(t.value) && next?.value === '(') add('error', 'CONCAT() is not an OQL function; use + to join strings', t);
    if (t.type === 'word' && t.value.toUpperCase() === 'BETWEEN') add('error', 'OQL has no BETWEEN; use x >= a AND x <= b', t);
  }

  // Query structure, per query level (subqueries handled recursively by scanning parentheses).
  lintQueries(tokens, add, issues);
  return issues.sort((a, b) => a.line - b.line || a.col - b.col);
}

function lintQueries(tokens, add) {
  // Find each SELECT and the token range of its query (until the paren that encloses it closes).
  for (let k = 0; k < tokens.length; k++) {
    if (!isKw(tokens[k], 'SELECT')) continue;
    let depth = 0;
    let end = k + 1;
    for (; end < tokens.length; end++) {
      const t = tokens[end];
      if (t.value === '(') depth++;
      if (t.value === ')') { if (depth === 0) break; depth--; }
      if (depth === 0 && (isKw(t, 'UNION') || t.value === ';')) break;
    }
    const nested = tokens[k - 1]?.value === '(';
    const unionPart = isKw(tokens[end], 'UNION') || isKw(tokens[k - 1], 'UNION') || isKw(tokens[k - 2], 'UNION');
    lintSelect(tokens.slice(k, end), add, { nested, unionPart });
  }
}

function clausesOf(tokens) {
  // Top-level clause boundaries of one SELECT.
  const clauses = {};
  let depth = 0;
  let current = null;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.value === '(') depth++;
    if (t.value === ')') depth--;
    if (depth === 0 && t.type === 'word') {
      const U = t.value.toUpperCase();
      const name = U === 'GROUP' || U === 'ORDER' ? (isKw(tokens[k + 1], 'BY') ? `${U} BY` : null) : ['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET'].includes(U) ? U : null;
      if (name) { current = clauses[name] = { kw: t, tokens: [] }; if (name.endsWith(' BY')) k++; continue; }
    }
    current?.tokens.push(t);
  }
  return clauses;
}

function lintSelect(tokens, add, { nested, unionPart }) {
  const c = clausesOf(tokens);
  if (!c.FROM) { add('error', 'SELECT without FROM', c.SELECT?.kw ?? tokens[0]); return; }

  // Select list: every column that is not a plain attribute needs an alias (OQL v2).
  const aliases = new Set();
  const columnNames = new Map();
  let selectTokens = c.SELECT?.tokens ?? [];
  if (isKw(selectTokens[0], 'DISTINCT')) selectTokens = selectTokens.slice(1);
  for (const col of splitTopLevel(selectTokens)) {
    const asIdx = col.findIndex((t) => isKw(t, 'AS'));
    let expr = col;
    let alias = null;
    if (asIdx >= 0) { expr = col.slice(0, asIdx); alias = col[asIdx + 1]?.value; } else if (col.length >= 2 && col.at(-1).type === 'word' && !col.at(-1).value.includes('.') && isPath(col.slice(0, -1))) { expr = col.slice(0, -1); alias = col.at(-1).value; }
    if (alias) aliases.add(alias.replace(/"/g, '').toLowerCase());
    const star = expr.length === 1 && (expr[0].value === '*' || expr[0].value.endsWith('.*'));
    if (!alias && !star && !isPath(expr)) add('warning', 'Give this column an alias with AS: OQL v2 requires one for every column that is not an attribute', expr[0]);
    const name = (alias ?? (isPath(expr) ? expr.at(-1).value.split('.').at(-1) : '')).replace(/"/g, '').toLowerCase();
    if (name) { if (columnNames.has(name)) add('warning', `Two columns are both named "${name}"; give one an alias`, expr[0]); else columnNames.set(name, true); }
  }

  // FROM aliases
  const fromAliases = new Set();
  const from = c.FROM.tokens;
  for (let k = 0; k < from.length; k++) if (isKw(from[k], 'AS') && from[k + 1]) fromAliases.add(from[k + 1].value.replace(/"/g, '').toLowerCase());

  // JOIN needs ON unless it follows an association path.
  for (let k = 0; k < from.length; k++) {
    if (!isKw(from[k], 'JOIN')) continue;
    const target = [];
    let j = k + 1;
    for (; j < from.length && !isKw(from[j], 'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL'); j++) target.push(from[j]);
    while (j < from.length && !isKw(from[j], 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL')) j++;
    const hasOn = isKw(from[j], 'ON');
    const viaAssociation = target.some((t) => t.value === '/');
    if (!hasOn && !viaAssociation) add('error', 'JOIN needs an ON condition or an association path (alias/Module.Association/Module.Entity)', from[k]);
  }

  // Aliases from SELECT cannot be used in WHERE (subqueries have their own names).
  const whereTop = [];
  const nestedAt = [];
  for (const [i, t] of (c.WHERE?.tokens ?? []).entries()) {
    if (t.value === '(') nestedAt.push(isKw(c.WHERE.tokens[i + 1], 'SELECT'));
    else if (t.value === ')') nestedAt.pop();
    else if (!nestedAt.includes(true)) whereTop.push(t);
  }
  for (const t of whereTop) {
    if (t.type === 'word' && !t.value.includes('.') && aliases.has(t.value.toLowerCase()) && !fromAliases.has(t.value.toLowerCase()) && !RESERVED.has(t.value.toUpperCase())) {
      add('error', `"${t.value}" is a column alias; WHERE cannot use it, repeat the expression instead`, t);
    }
  }

  // GROUP BY on an association path is not allowed in v2.
  for (const t of c['GROUP BY']?.tokens ?? []) if (t.value === '/') { add('warning', 'OQL v2 cannot GROUP BY an association path; JOIN the entity and group by its alias', t); break; }

  if (c.HAVING && !c['GROUP BY']) add('hint', 'HAVING without GROUP BY filters the whole result as one group', c.HAVING.kw);
  if ((nested || unionPart) && c['ORDER BY'] && !c.LIMIT && !c.OFFSET) add('warning', 'ORDER BY in a subquery or UNION part needs LIMIT or OFFSET', c['ORDER BY'].kw);
  if (c.LIMIT && !c['ORDER BY']) add('hint', 'LIMIT without ORDER BY returns an unpredictable set of rows', c.LIMIT.kw);
  if (c.WHERE?.tokens.some((t) => t.value === '=' ) && c.WHERE.tokens.some((t, i, a) => t.value === '=' && isKw(a[i + 1], 'NULL'))) {
    const t = c.WHERE.tokens.find((x, i, a) => x.value === '=' && isKw(a[i + 1], 'NULL'));
    add('warning', 'Compare with IS NULL instead of = NULL', t);
  }
}

// --- Query builder -------------------------------------------------------------

const aliasFor = (name, used) => {
  const base = name.replace(/[^A-Za-z]/g, '').slice(0, 1).toLowerCase() || 't';
  let a = base;
  for (let n = 2; used.has(a); n++) a = `${base}${n}`;
  used.add(a);
  return a;
};
const quoteName = (n) => (RESERVED.has(n.toUpperCase()) ? `"${n}"` : n);
export const quoteQualified = (q) => q.split('.').map((p, i) => (i ? quoteName(p) : p)).join('.');

/**
 * Builds a SELECT for an entity and optional joins over associations.
 * @param {{ entity: string, attributes: string[], joins?: { association: string, target: string, attributes: string[], type?: string }[], where?: string, orderBy?: string, limit?: number }} q
 */
export function buildSelect({ entity, attributes, joins = [], where = '', orderBy = '', limit }) {
  const used = new Set();
  const root = aliasFor(entity.split('.').at(-1), used);
  const columns = attributes.map((a) => `${root}.${quoteName(a)}`);
  const joinLines = [];
  const names = new Set(attributes.map((a) => a.toLowerCase()));
  for (const j of joins) {
    const alias = aliasFor(j.target.split('.').at(-1), used);
    joinLines.push(`${(j.type ?? 'INNER').toUpperCase()} JOIN ${root}/${quoteQualified(j.association)}/${quoteQualified(j.target)} AS ${alias}`);
    for (const a of j.attributes) {
      const label = names.has(a.toLowerCase()) ? `${j.target.split('.').at(-1)}${a}` : a;
      names.add(label.toLowerCase());
      columns.push(`${alias}.${quoteName(a)}${label !== a ? ` AS ${label}` : ''}`);
    }
  }
  if (!columns.length) columns.push(`${root}.ID`);
  const sql = [`SELECT ${columns.join(', ')}`, `FROM ${quoteQualified(entity)} AS ${root}`, ...joinLines];
  if (where.trim()) sql.push(`WHERE ${where.trim()}`);
  if (orderBy.trim()) sql.push(`ORDER BY ${orderBy.trim()}`);
  if (limit) sql.push(`LIMIT ${limit}`);
  return formatOql(sql.join('\n'));
}
