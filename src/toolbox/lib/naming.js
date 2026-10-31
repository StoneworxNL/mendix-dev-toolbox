// Naming convention check, after Mendix "Best practices for naming conventions" (Studio Pro 11):
// https://docs.mendix.com/refguide/naming-conventions/

/** Default rules as editable text: `<document kind> <prefixes|suffixes>: values`. */
export const DEFAULT_RULES = `# Mendix best practices for naming conventions (Studio Pro 11). Edit to match your team.
# Prefixes and suffixes are matched without regard to case (BCo_ and BCO_ are the same).

# Microflows: {PREFIX}_{Entity}_{Operation}. A microflow that fits none of these has no prefix.
microflow prefixes: ACT_ SUB_ DS_ VAL_ CAL_ BCO_ ACO_ BCR_ ACR_ BDE_ ADE_ BRO_ ARO_ OEN_ OCH_ OLE_ SCE_ ASU_ BSD_ HCH_ WFA_ WFS_ WFC_ TEST_ UT_ CWS_ CRS_ PWS_ PRS_ POS_ DCM_ IVK_
nanoflow prefixes: ACT_ SUB_ DS_ VAL_ OEN_ OCH_ OLE_ IVK_
# Prefixes that are allowed but no longer recommended, with the replacement.
deprecated prefixes: IVK_=ACT_

page suffixes: _Overview _New _Edit _NewEdit _View _Select _MultiSelect _Tooltip _Workflow
page names: Home_Desktop_* Home_Tablet_* Home_Phone_*
layout prefixes: Responsive_ Tablet_ Phone_ NativePhone_ Popup_ Atlas_
snippet prefixes: SNIP_
enumeration prefixes: ENUM_
import mapping prefixes: IMM_
export mapping prefixes: EXM_
xml schema prefixes: XSD_
json structure prefixes: JSON_
`;

const KINDS = ['microflow', 'nanoflow', 'page', 'layout', 'snippet', 'enumeration', 'import mapping', 'export mapping', 'xml schema', 'json structure', 'workflow'];

/** Whether checkNaming looks at documents of this kind with these rules (workflows are always checked). */
export const isChecked = (kind, rules) => kind.toLowerCase() === 'workflow' || Boolean(rules[kind.toLowerCase()]);

/** Parses rule text into `{ [kind]: { prefixes?: string[], suffixes?: string[], names?: string[] }, deprecated: Map }`. */
export function parseRules(text) {
  const rules = { deprecated: new Map() };
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([a-z ]+?)\s+(prefixes|suffixes|names)\s*:\s*(.*)$/i.exec(line);
    if (!m) throw new Error(`Line ${n + 1}: write "<kind> prefixes: A_ B_", "<kind> suffixes: _X" or "<kind> names: Home_*"`);
    const kind = m[1].toLowerCase();
    const values = m[3].split(/[\s,]+/).filter(Boolean);
    if (kind === 'deprecated') { for (const v of values) { const [from, to] = v.split('='); rules.deprecated.set(from.toUpperCase(), to ?? ''); } continue; }
    if (!KINDS.includes(kind)) throw new Error(`Line ${n + 1}: unknown kind "${m[1]}"; use one of ${KINDS.join(', ')}`);
    (rules[kind] ??= {})[m[2].toLowerCase()] = values;
  }
  return rules;
}

const pascal = /^[A-Z][A-Za-z0-9]*$/;
const startsWithCI = (s, p) => s.toUpperCase().startsWith(p.toUpperCase());
const endsWithCI = (s, p) => s.toUpperCase().endsWith(p.toUpperCase());
const wildcard = (pattern, name) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(name);
const looksPlural = (name) => /[^su]s$/.test(name) && !/(ss|us|is|ics|news|status|data)$/i.test(name);

/**
 * @typedef {{ module: string, kind: string, name: string, severity: 'error' | 'warning' | 'hint', message: string, suggestion?: string }} NamingIssue
 */

/**
 * Checks document names (`{ module, kind, name }`, kind as in KINDS but capitalised freely)
 * and, when given, the domain model (see mxmodel.js).
 * @returns {NamingIssue[]}
 */
export function checkNaming({ documents = [], model = null, modules = [] }, rules = parseRules(DEFAULT_RULES)) {
  const issues = [];
  const add = (module, kind, name, severity, message, suggestion) => issues.push({ module, kind, name, severity, message, suggestion });
  const entityNames = new Set(model?.entities.map((e) => e.name.toUpperCase()) ?? []);

  for (const m of modules) if (!pascal.test(m)) add(m, 'Module', m, 'warning', 'Module names use UpperCamelCase and name the module\'s responsibility, like CustomerManagement');

  for (const d of documents) {
    const kind = d.kind.toLowerCase();
    if (kind === 'workflow' && !pascal.test(d.name)) {
      add(d.module, d.kind, d.name, 'warning', 'Workflow names are a noun and a verb in PascalCase, without a prefix, like EmployeeOnboarding', d.name.split('_').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(''));
    }
    const rule = rules[kind];
    if (!rule) continue;
    const prefix = /^([A-Za-z]+_)/.exec(d.name)?.[1];
    if (kind === 'microflow' || kind === 'nanoflow') {
      const known = rule.prefixes ?? [];
      if (prefix && rules.deprecated.has(prefix.toUpperCase())) {
        const to = rules.deprecated.get(prefix.toUpperCase());
        add(d.module, d.kind, d.name, 'warning', `${prefix} is no longer recommended${to ? `; use ${to}` : ''}`, to ? to + d.name.slice(prefix.length) : undefined);
      } else if (prefix && /^[A-Z]{2,5}_$/i.test(prefix) && !known.some((p) => p.toUpperCase() === prefix.toUpperCase())) {
        add(d.module, d.kind, d.name, 'warning', `${prefix} is not a standard ${kind} prefix (${known.join(' ')})`);
      } else if (!prefix) {
        add(d.module, d.kind, d.name, 'hint', `No prefix. Fine when no standard purpose applies; otherwise use one, like ACT_ for buttons or SUB_ for sub-${kind}s`);
      }
      const p = prefix?.toUpperCase();
      if (p && /^(BCO|ACO|BCR|ACR|BDE|ADE|BRO|ARO|CAL)_$/.test(p) && entityNames.size) {
        const entity = d.name.slice(prefix.length).split('_')[0];
        if (!entityNames.has(entity.toUpperCase())) add(d.module, d.kind, d.name, 'hint', `${prefix} is followed by the entity name; no entity "${entity}" found`);
      }
      if (p === 'CAL_' && d.name.split('_').length < 3) add(d.module, d.kind, d.name, 'hint', 'Calculated attribute microflows are named CAL_{Entity}_{Attribute}');
      const rest = prefix ? d.name.slice(prefix.length) : d.name;
      if (rest && /^[a-z]/.test(rest)) add(d.module, d.kind, d.name, 'hint', 'Use PascalCase after the prefix: {PREFIX}_{Entity}_{Operation}', prefix ? prefix + rest[0].toUpperCase() + rest.slice(1) : rest[0].toUpperCase() + rest.slice(1));
      continue;
    }
    if (rule.names?.some((n) => wildcard(n, d.name))) continue;
    if (rule.suffixes && !rule.suffixes.some((s) => endsWithCI(d.name, s))) {
      add(d.module, d.kind, d.name, kind === 'page' ? 'hint' : 'warning', `${d.kind} names end with ${rule.suffixes.join(', ')}${kind === 'page' ? ' (pages that are part of a process may not)' : ''}`);
    }
    if (rule.prefixes && !rule.prefixes.some((p) => startsWithCI(d.name, p))) {
      add(d.module, d.kind, d.name, 'warning', `${d.kind} names start with ${rule.prefixes.join(' or ')}`, rule.prefixes.length === 1 ? rule.prefixes[0] + d.name : undefined);
    }
  }

  for (const e of model?.entities ?? []) {
    if (/^[a-z]/.test(e.name)) add(e.module, 'Entity', e.name, 'error', 'Entity names use PascalCase; a lower-case name can clash with the module\'s Java package', e.name[0].toUpperCase() + e.name.slice(1));
    else if (e.name.includes('_')) add(e.module, 'Entity', e.name, 'warning', 'Avoid underscores in entity names; use PascalCase like LogEntry', e.name.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(''));
    else if (!pascal.test(e.name)) add(e.module, 'Entity', e.name, 'warning', 'Entity names use PascalCase');
    if (looksPlural(e.name)) add(e.module, 'Entity', e.name, 'hint', 'Entity names are singular (Customer, not Customers)', e.name.replace(/ies$/, 'y').replace(/s$/, ''));
    for (const a of e.attributes) {
      const name = a.name.replace(/^_/, '');
      const where = `${e.name}.${a.name}`;
      if (/^[a-z]/.test(name)) add(e.module, 'Attribute', where, 'warning', 'Attribute names use PascalCase, like FirstName', (a.name.startsWith('_') ? '_' : '') + name.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(''));
      else if (name.includes('_')) add(e.module, 'Attribute', where, 'warning', 'Avoid underscores in attribute names; only technical attributes start with one (_SyncHash)', (a.name.startsWith('_') ? '_' : '') + name.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(''));
    }
  }

  for (const a of model?.associations ?? []) {
    const parent = a.parent.split('.').at(-1);
    const child = a.child.split('.').at(-1);
    const expected = `${parent}_${child}`;
    if (a.name !== expected && !a.name.startsWith(`${expected}_`)) {
      add(a.module, 'Association', a.name, 'warning', `Studio Pro names this association ${expected}; keep that name and add a purpose for extra associations (${expected}_Delivery)`, expected);
    }
  }
  const order = { error: 0, warning: 1, hint: 2 };
  return issues.sort((x, y) => order[x.severity] - order[y.severity] || x.module.localeCompare(y.module) || x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name));
}
