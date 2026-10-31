import { h, clear, textArea, select, checkbox, number, input, field, options, split, status, live, card, kv, button, copyButton, copyText, download } from '../ui.js';
import { formatOql, lintOql, buildSelect, FUNCTIONS as OQL_FUNCTIONS } from '../lib/oql.js';
import { lintConstraint, relativeDateConstraint, resolveDateToken, evaluateDateExpression, TOKENS, FUNCTIONS as XPATH_FUNCTIONS, DATE_TOKEN_NAMES, PERIOD_NAMES } from '../lib/mxxpath.js';
import { formatDate, parseDate, mendixLiteral, LETTERS } from '../lib/datepattern.js';
import { normalizeModel, associationsOf, allAttributes, typeLabel, toMermaid, toMarkdown, SAMPLE_UNITS, SAMPLE_ENUMERATIONS, SAMPLE_DOCUMENTS } from '../lib/mxmodel.js';
import { checkNaming, parseRules, DEFAULT_RULES } from '../lib/naming.js';

const C = 'Mendix';

// --- App model access -----------------------------------------------------------

// Document kinds for the naming check, by model API.
const DOCUMENT_APIS = [
  ['microflows', 'Microflow'], ['nanoflows', 'Nanoflow'], ['pages', 'Page'], ['layouts', 'Layout'], ['snippets', 'Snippet'],
  ['enumerations', 'Enumeration'], ['importMappings', 'Import mapping'], ['exportMappings', 'Export mapping'],
  ['xmlSchemas', 'XML schema'], ['jsonStructures', 'JSON structure'], ['workflows', 'Workflow'],
];

const cache = new Map();

/**
 * Reads the app's modules, domain models, enumerations and document names through the
 * Studio Pro model API (read-only). Marketplace modules are only loaded when asked for, because
 * loading units is expensive. Outside Studio Pro it returns a sample app.
 */
function loadApp(ctx, { refresh = false, marketplace: withMarketplace = false } = {}) {
  const key = withMarketplace ? 'all' : 'own';
  if (cache.has(key) && !refresh) return cache.get(key);
  const promise = (async () => {
    const sp = ctx?.studioPro;
    if (!sp) {
      const modules = [{ name: 'Sales', marketplace: false }, { name: 'Administration', marketplace: false }];
      return { connected: false, modules, model: normalizeModel(SAMPLE_UNITS, SAMPLE_ENUMERATIONS), documents: SAMPLE_DOCUMENTS, unavailable: [] };
    }
    const m = sp.app.model;
    const mods = await m.modules.getModules();
    const marketplace = new Set(mods.filter((x) => x.fromAppStore).map((x) => x.name));
    const modules = mods.map((x) => ({ name: x.name, marketplace: x.fromAppStore })).filter((x) => x.name !== 'System').sort((a, b) => a.name.localeCompare(b.name));
    const wanted = (moduleName) => moduleName && moduleName !== 'System' && (withMarketplace || !marketplace.has(moduleName));

    const loadUnits = async (api, type) => {
      const infos = (await api.getUnitsInfo()).filter((i) => wanted(i.moduleName));
      if (!infos.length) return [];
      const ids = infos.map((i) => i.$ID);
      // Newer API versions document loadUnits(type, ids); this one has loadAll(filter, max).
      const units = typeof api.loadUnits === 'function' ? await api.loadUnits(type, ids) : await api.loadAll((u) => ids.includes(u.$ID), ids.length);
      const moduleOf = new Map(infos.map((i) => [i.$ID, i.moduleName]));
      return units.map((u, k) => ({ unit: u, moduleName: moduleOf.get(u.$ID) ?? infos[k]?.moduleName ?? '' }));
    };
    const unavailable = [];
    const [domainModels, enumerations] = await Promise.all([
      loadUnits(m.domainModels, 'DomainModels$DomainModel'),
      loadUnits(m.enumerations, 'Enumerations$Enumeration').catch(() => { unavailable.push('Enumeration'); return []; }),
    ]);
    const model = normalizeModel(
      domainModels.map(({ unit, moduleName }) => ({ moduleName, domainModel: unit, marketplace: marketplace.has(moduleName) })),
      enumerations.map(({ unit, moduleName }) => ({ moduleName, name: unit.name, values: (unit.values ?? []).map((v) => v.name), marketplace: marketplace.has(moduleName) })),
    );
    const documents = [];
    await Promise.all(DOCUMENT_APIS.map(async ([api, kind]) => {
      try {
        for (const i of await m[api].getUnitsInfo()) if (wanted(i.moduleName) && i.name) documents.push({ module: i.moduleName, kind, name: i.name, marketplace: marketplace.has(i.moduleName) });
      } catch {
        unavailable.push(kind); // not in this Studio Pro version's API
      }
    }));
    return { connected: true, modules, model, documents, unavailable: [...new Set(unavailable)].sort() };
  })();
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * "Your app" or "sample model" line with a refresh button. Each time a tool opens it reads the
 * model again, so edits made in Studio Pro since the last visit show up.
 * @param {{ marketplace?: () => boolean }} [options]
 */
function sourceBar(ctx, onLoad, { marketplace = () => false } = {}) {
  const text = h('span', { class: 'hint' }, 'Loading the app model…');
  let latest = 0;
  const reload = (refresh) => {
    const mine = ++latest;
    text.textContent = 'Loading the app model…';
    return loadApp(ctx, { refresh, marketplace: marketplace() }).then((app) => {
      if (mine !== latest) return;
      text.textContent = app.connected
        ? `Your app: ${app.model.entities.length} entities in ${new Set(app.model.entities.map((e) => e.module)).size} modules${marketplace() ? ', Marketplace modules included' : ''}.`
        : 'Sample model. Open the toolbox from Studio Pro (Extensions > Developer Toolbox) to use your app.';
      onLoad(app);
    }, (e) => { if (mine === latest) text.textContent = `Could not read the app model: ${e.message ?? e}`; });
  };
  // After the tool's saved options (like "Marketplace modules") are restored.
  queueMicrotask(() => reload(true));
  const root = h('div', { class: 'source-bar' }, text, ctx?.studioPro && button('Refresh', () => reload(true), { kind: 'ghost', iconName: 'refresh' }));
  return Object.assign(root, { reload });
}

const issueList = (issues, where) => h('ul', { class: 'issues' }, issues.map((i) => h('li', { class: `sev-${i.severity}` }, h('span', { class: 'sev' }, i.severity), where ? h('span', { class: 'hint mono' }, where(i)) : null, h('span', {}, i.message))));

function entitySelect(model, { includeMarketplace = false, filter = () => true } = {}) {
  const byModule = new Map();
  for (const e of model.entities) if ((includeMarketplace || !e.marketplace) && filter(e)) (byModule.get(e.module) ?? byModule.set(e.module, []).get(e.module)).push(e);
  return h('select', { 'aria-label': 'Entity' }, [...byModule].sort(([a], [b]) => a.localeCompare(b)).map(([m, es]) => h('optgroup', { label: m }, es.sort((a, b) => a.name.localeCompare(b.name)).map((e) => h('option', { value: e.qualifiedName }, e.name)))));
}

const checkList = (items, checked = () => false) => {
  const boxes = items.map((it) => checkbox(it.label, { checked: checked(it) }));
  return { root: h('div', { class: 'checklist' }, boxes.map((b) => b.root)), values: () => items.filter((_, k) => boxes[k].checked).map((it) => it.value), boxes };
};

// --- OQL ----------------------------------------------------------------------------

const oql = {
  id: 'oql', name: 'OQL helper', category: C, icon: 'database',
  description: 'Format and check OQL for view entities and data sets, build queries from your domain model and look up OQL functions.',
  keywords: 'mendix oql query view entity dataset select join lint v2 format',
  render(root, ctx) {
    const keywordCase = select({ upper: 'UPPER', lower: 'lower', preserve: 'Preserve' }, { persist: 'kw', label: 'Keyword case' });
    const indent = select({ 2: '2 spaces', 4: '4 spaces', tab: 'Tab' }, { persist: 'indent', label: 'Indent' });
    const src = textArea({ label: 'OQL', persist: 'input', value: "select c.Name, count(o.ID) as Orders\nfrom Sales.Customer as c\nleft join c/Sales.Order_Customer/Sales.\"Order\" as o\nwhere c.IsActive = true and o.OrderDate > '[%BeginOfCurrentYear%]'\ngroup by c.Name\norder by Orders desc limit 10" });
    const out = textArea({ label: 'Formatted', readonly: true });
    const stat = status();
    const issuesBox = h('div');

    // Query builder
    const builder = h('div', { class: 'stack' });
    const preview = h('pre', { class: 'code-block mono' });
    let app = null;
    const renderBuilder = () => {
      const model = app.model;
      if (!model.entities.length) { clear(builder, h('p', { class: 'hint' }, 'No entities found.')); return; }
      const entity = entitySelect(model);
      const limit = number({ value: 100, min: 0, width: '90px' });
      const where = input({ placeholder: "Use the aliases from the query" });
      const attrsBox = h('div');
      const joinsBox = h('div', { class: 'stack' });
      let attrs; let joins = [];
      const update = () => {
        preview.textContent = buildSelect({
          entity: entity.value, attributes: attrs.values(),
          joins: joins.filter((j) => j.on.checked).map((j) => ({ association: j.association, target: j.target, type: j.type.value, attributes: j.attrs.values() })),
          where: where.value, limit: Number(limit.value) || undefined,
        });
      };
      const pick = () => {
        attrs = checkList(allAttributes(model, entity.value).map((a) => ({ label: `${a.name}  ${typeLabel(a)}`, value: a.name })), (it) => true);
        clear(attrsBox, h('div', { class: 'field-label' }, 'Attributes'), attrs.root);
        joins = associationsOf(model, entity.value).map(({ association: a, other }) => {
          const on = checkbox(`${a.name} → ${other}`);
          const type = select({ INNER: 'INNER JOIN', LEFT: 'LEFT JOIN' }, { value: 'LEFT', label: 'Join type' });
          const otherAttrs = checkList(allAttributes(model, other).map((x) => ({ label: `${x.name}  ${typeLabel(x)}`, value: x.name })));
          const body = h('div', { class: 'join-body', hidden: true }, options(field('Join', type)), otherAttrs.root);
          on.el.addEventListener('change', () => { body.hidden = !on.checked; });
          return { on, type, attrs: otherAttrs, association: a.qualifiedName, target: other, root: h('div', { class: 'join' }, on.root, body) };
        });
        clear(joinsBox, joins.length ? [h('div', { class: 'field-label' }, 'Join over associations'), joins.map((j) => j.root)] : null);
        update();
      };
      entity.addEventListener('change', pick);
      clear(builder,
        options(field('Entity', entity), field('Where', where), field('Limit', limit)),
        attrsBox, joinsBox,
        h('div', { class: 'pane' }, h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, 'Query'), h('div', { class: 'pane-tools' },
          copyButton(() => preview.textContent),
          button('Use in editor', () => { src.value = preview.textContent; src.el.dispatchEvent(new Event('input', { bubbles: true })); src.el.scrollIntoView({ block: 'nearest' }); }, { kind: 'ghost' }))), preview));
      builder.addEventListener('change', update);
      builder.addEventListener('input', update);
      pick();
    };
    const builderCard = card('Query builder', sourceBar(ctx, (a) => { app = a; renderBuilder(); }), builder);

    const reference = card('OQL functions', h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Syntax'), h('th', {}, 'Description'), h('th', {}, 'Since'))),
      h('tbody', {}, OQL_FUNCTIONS.map((f) => h('tr', {}, h('td', { class: 'mono' }, f.syntax), h('td', {}, f.description), h('td', {}, f.since ?? '')))))),
    h('p', { class: 'hint' }, 'Operators: + - * : (divide) % = != < <= > >= AND OR NOT LIKE IN EXISTS IS [NOT] NULL. Parameters: $Name (data sets). Quote reserved names: Sales."Order". System variables go in quotes: \'[%CurrentUser%]\'.'));

    clear(root, options(field('Keyword case', keywordCase), field('Indent', indent)), stat.root, issuesBox, split(src.root, out.root), builderCard, reference);
    return live(root, () => {
      clear(issuesBox);
      out.value = '';
      if (!src.value.trim()) return;
      const issues = lintOql(src.value);
      if (issues.length) clear(issuesBox, issueList(issues, (i) => `${i.line}:${i.col}`));
      try {
        out.value = formatOql(src.value, { keywordCase: keywordCase.value, indent: indent.value === 'tab' ? '\t' : ' '.repeat(Number(indent.value)) });
      } catch (e) { stat.error(e); return; }
      const errors = issues.filter((i) => i.severity === 'error').length;
      if (errors) stat.error(`${errors} error${errors === 1 ? '' : 's'} found`);
      else stat.ok(issues.length ? `No errors; ${issues.length} suggestion${issues.length === 1 ? '' : 's'}` : 'No problems found');
    }, stat);
  },
};

// --- XPath constraints ---------------------------------------------------------------

const fmtDate = (d) => formatDate(d, 'EEE yyyy-MM-dd HH:mm:ss.SSS');

const xpath = {
  id: 'mx-xpath', name: 'XPath constraint helper', category: C, icon: 'path',
  description: 'Check Mendix XPath constraints, see what date tokens like [%BeginOfCurrentDay%] - 3 * [%YearLength%] resolve to, and build relative date filters.',
  keywords: 'mendix xpath constraint token currentuser date retrieve access rule',
  render(root, ctx) {
    const src = textArea({ label: 'Constraint', persist: 'input', rows: 4, value: "[Status = 'Open']\n[OrderDate >= '[%BeginOfCurrentDay%] - 7 * [%DayLength%]']\n[Sales.Order_Customer/Sales.Customer/IsActive = true()]" });
    const firstDay = select([['1', 'Monday'], ['0', 'Sunday'], ['6', 'Saturday']], { persist: 'firstDay', label: 'First day of the week' });
    const stat = status();
    const issuesBox = h('div');
    const datesBox = h('div');

    // Relative date builder
    const attribute = input({ value: 'OrderDate', persist: 'attr' });
    const attrList = h('datalist', { id: 'mx-xpath-attrs' });
    attribute.setAttribute('list', 'mx-xpath-attrs');
    const operator = select(['>=', '>', '<', '<=', '=', '!='], { persist: 'op', label: 'Operator' });
    const base = select(DATE_TOKEN_NAMES, { value: 'BeginOfCurrentDay', persist: 'base', label: 'Token' });
    const amount = number({ value: -7, persist: 'amount', width: '80px' });
    const period = select(PERIOD_NAMES.filter((p) => p !== 'MillisecondLength'), { value: 'DayLength', persist: 'period', label: 'Period' });
    const utc = checkbox('UTC', { persist: 'utc' });
    const built = h('code', { class: 'mono' });
    const builtValue = h('span', { class: 'hint' });
    const builder = card('Relative date filter',
      options(field('Attribute', attribute), field('Operator', operator), field('Token', base), field('Add', amount), field('Period', period), utc.root, attrList),
      h('div', { class: 'built' }, built, builtValue,
        button('Copy', () => copyText(built.textContent), { kind: 'ghost', iconName: 'copy' }),
        button('Add to constraint', () => { src.value = `${src.value.trimEnd()}${src.value.trim() ? '\n' : ''}${built.textContent}`; src.el.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'ghost' })),
      sourceBar(ctx, (app) => clear(attrList, app.model.entities.flatMap((e) => e.attributes.filter((a) => a.type === 'DateTime').map((a) => h('option', { value: a.name }, e.qualifiedName))))));

    const tokenRows = h('tbody');
    const tokens = card('Tokens', h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Token'), h('th', {}, 'Now'), h('th', {}, 'Meaning'))), tokenRows)),
      h('p', { class: 'hint' }, 'Tokens always go inside quotes. Date tokens can be combined with periods in one string, without parentheses: \'[%BeginOfCurrentDay%] - 3 * [%YearLength%] + [%HourLength%]\'. Values here use this computer\'s time zone; in Mendix the non-UTC tokens use the user\'s time zone.'));
    const functions = card('Functions', h('table', { class: 'grid' }, h('tbody', {}, XPATH_FUNCTIONS.map(([f, d]) => h('tr', {}, h('td', { class: 'mono' }, f), h('td', {}, d))))),
      h('p', { class: 'hint' }, 'Operators: = != < <= > >= and or; + - * div in server-side XPath. Empty values: [Name = empty] or [Name != empty]. Association paths: [Module.Order_Customer/Module.Customer/Name = \'x\'], or just [Module.Order_Customer] to require one.'));

    clear(root, options(field('First day of the week', firstDay, 'BeginOfCurrentWeek depends on the user\'s language.')), stat.root, issuesBox, src.root, datesBox, builder, tokens, functions);

    return live(root, () => {
      const opts = { now: new Date(), firstDay: Number(firstDay.value) };
      clear(tokenRows, TOKENS.map(([t, d]) => {
        const name = t.slice(2, -2);
        const value = resolveDateToken(name, opts);
        return h('tr', {}, h('td', { class: 'mono' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); copyText(`'${t}'`); } }, t)), h('td', { class: 'mono' }, value ? fmtDate(value) : ''), h('td', {}, d));
      }));
      const expr = relativeDateConstraint({ attribute: attribute.value.trim() || 'Attribute', operator: operator.value, base: base.value, amount: amount.value, period: period.value, utc: utc.checked });
      built.textContent = expr;
      try { builtValue.textContent = `→ ${fmtDate(evaluateDateExpression(/'(.*)'/.exec(expr)[1], opts))}`; } catch (e) { builtValue.textContent = e.message; }

      clear(issuesBox); clear(datesBox);
      if (!src.value.trim()) return;
      const { issues, dates } = lintConstraint(src.value, opts);
      const lineOf = (i) => { const before = src.value.trim().slice(0, i.index).split('\n'); return `${before.length}:${before.at(-1).length + 1}`; };
      if (issues.length) clear(issuesBox, issueList(issues, lineOf));
      if (dates.length) clear(datesBox, card('Date values right now', kv(dates.map((d) => [d.expression, fmtDate(d.value)]))));
      const errors = issues.filter((i) => i.severity === 'error').length;
      if (errors) stat.error(`${errors} error${errors === 1 ? '' : 's'} found`);
      else stat.ok(issues.length ? `No errors; ${issues.length} suggestion${issues.length === 1 ? '' : 's'}` : 'No problems found');
    }, stat);
  },
};

// --- Date patterns -------------------------------------------------------------------

const PRESETS = ['yyyy-MM-dd', 'dd-MM-yyyy', 'dd/MM/yyyy HH:mm', 'MM/dd/yyyy h:mm a', "yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ssXXX", 'EEEE d MMMM yyyy', 'MMM d, yyyy', 'HH:mm:ss', 'yyyyMMdd', "'Week' w, yyyy"];

const localInputValue = (d) => formatDate(d, "yyyy-MM-dd'T'HH:mm:ss");

const datePattern = {
  id: 'mx-date-pattern', name: 'Date pattern tester', category: C, icon: 'calendar',
  description: 'Try patterns for formatDateTime, parseDateTime and friends, see the output in local time and UTC and copy the ready expression.',
  keywords: 'mendix date format parse formatDateTime parseDateTime simpledateformat pattern utc',
  render(root) {
    const pattern = input({ value: "yyyy-MM-dd'T'HH:mm:ss", persist: 'pattern' });
    const when = h('input', { type: 'datetime-local', step: 1, 'aria-label': 'Date' });
    when.value = localInputValue(new Date());
    const now = button('Now', () => { when.value = localInputValue(new Date()); when.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'ghost' });
    const variable = input({ value: '$Date', persist: 'var' });
    const parseText = input({ placeholder: 'Text to parse with the pattern', persist: 'parse' });
    const stat = status();
    const result = h('div');
    const parsed = h('div');
    const chips = h('div', { class: 'chips' }, PRESETS.map((p) => button(p, () => { pattern.value = p; pattern.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'chip' })));
    const letters = card('Pattern letters', h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Letter'), h('th', {}, 'Meaning'), h('th', {}, 'Example'))), h('tbody', {}, LETTERS.map(([l, m, e]) => h('tr', {}, h('td', { class: 'mono' }, l), h('td', {}, m), h('td', { class: 'mono' }, e)))))),
      h('p', { class: 'hint' }, 'Repeat a letter for more digits (dd → 08). Two-digit years (yy) parse within 80 years before and 20 after today in microflows, 50/50 in nanoflows. Names are shown in English; Mendix uses the user\'s language. Week numbers here follow US rules.'));
    clear(root, field('Pattern', pattern), chips, options(field('Date', when), now, field('Variable', variable)), stat.root, result, card('Parse', field('Text', parseText), parsed), letters);
    return live(root, () => {
      clear(result); clear(parsed);
      const date = when.value ? new Date(when.value) : new Date();
      const lit = mendixLiteral(pattern.value);
      const v = variable.value.trim() || '$Date';
      clear(result, kv([
        ['formatDateTime', formatDate(date, pattern.value)],
        ['formatDateTimeUTC', formatDate(date, pattern.value, { utc: true })],
        ['Expression', `formatDateTime(${v}, ${lit})`],
        ['UTC expression', `formatDateTimeUTC(${v}, ${lit})`],
        ['Parse expression', `parseDateTime($Text, ${lit})`],
      ]));
      if (parseText.value.trim()) {
        try {
          const local = parseDate(parseText.value.trim(), pattern.value);
          const asUtc = parseDate(parseText.value.trim(), pattern.value, { utc: true });
          clear(parsed, kv([['parseDateTime', `${formatDate(local, 'yyyy-MM-dd HH:mm:ss.SSS')} (local) = ${local.toISOString()}`], ['parseDateTimeUTC', asUtc.toISOString()]]));
        } catch (e) { clear(parsed, h('div', { class: 'status error' }, e.message)); }
      }
    }, stat);
  },
};

// --- Domain model documentation -----------------------------------------------------------

const domainDocs = {
  id: 'mx-domain-docs', name: 'Domain model docs', category: C, icon: 'table',
  description: 'Generate Markdown documentation and Mermaid ER diagrams of your domain model: entities, attributes, associations and enumerations.',
  keywords: 'mendix domain model entity association documentation mermaid er diagram markdown export',
  render(root, ctx) {
    const format = select({ markdown: 'Markdown with diagrams', mermaid: 'Mermaid ER diagram' }, { persist: 'format', label: 'Format' });
    const showAttrs = checkbox('Attributes in diagram', { checked: true, persist: 'attrs' });
    const market = checkbox('Marketplace modules', { persist: 'market' });
    const modsBox = h('div');
    const out = textArea({ label: 'Output', readonly: true, actions: [button('Download', () => download(out.value, format.value === 'mermaid' ? 'domain-model.mmd' : 'domain-model.md', 'text/markdown'), { kind: 'ghost', iconName: 'download' })] });
    const stat = status();
    let app = null;
    let mods = null;
    const run = () => {
      if (!app) return;
      const selected = mods.values();
      const model = app.model;
      out.value = format.value === 'mermaid' ? toMermaid(model, { modules: selected, attributes: showAttrs.checked }) : toMarkdown(model, { modules: selected, title: 'Domain model' });
      const n = model.entities.filter((e) => selected.includes(e.module)).length;
      stat.info(`${selected.length} module${selected.length === 1 ? '' : 's'}, ${n} entit${n === 1 ? 'y' : 'ies'}. Mermaid renders on GitHub, Azure DevOps, Confluence and in VS Code.`);
    };
    const renderModules = () => {
      const list = app.modules.filter((m) => (market.checked || !m.marketplace) && app.model.entities.some((e) => e.module === m.name));
      mods = checkList(list.map((m) => ({ label: m.name, value: m.name })), () => true);
      clear(modsBox, h('div', { class: 'field-label' }, 'Modules'), mods.root, h('div', { class: 'chips' },
        button('All', () => { mods.boxes.forEach((b) => { b.el.checked = true; }); run(); }, { kind: 'chip' }),
        button('None', () => { mods.boxes.forEach((b) => { b.el.checked = false; }); run(); }, { kind: 'chip' })));
      run();
    };
    const bar = sourceBar(ctx, (a) => { app = a; renderModules(); }, { marketplace: () => market.checked });
    market.el.addEventListener('change', () => bar.reload(false));
    clear(root, bar, options(field('Format', format), showAttrs.root, market.root), modsBox, stat.root, out.root);
    root.addEventListener('change', (e) => { if (e.target !== market.el) run(); });
  },
};

// --- Naming conventions -------------------------------------------------------------

const naming = {
  id: 'mx-naming', name: 'Naming convention check', category: C, icon: 'check',
  description: 'Check microflows, pages, entities, attributes, associations and more against the Mendix naming conventions, or your own rules.',
  keywords: 'mendix naming convention best practice prefix suffix lint quality microflow page entity',
  render(root, ctx) {
    const market = checkbox('Marketplace modules', { persist: 'market' });
    const hints = checkbox('Show hints', { checked: true, persist: 'hints' });
    const moduleSel = h('select', { 'aria-label': 'Module' });
    const rules = textArea({ label: 'Rules', persist: 'rules', rows: 14, value: DEFAULT_RULES, actions: [button('Reset', () => { rules.value = DEFAULT_RULES; rules.el.dispatchEvent(new Event('input', { bubbles: true })); }, { kind: 'ghost', iconName: 'refresh' })] });
    const stat = status();
    const table = h('div', { class: 'grid-wrap tall' });
    let app = null;
    let issues = [];
    const asText = (sep) => [['Severity', 'Module', 'Kind', 'Name', 'Problem', 'Suggestion'], ...issues.map((i) => [i.severity, i.module, i.kind, i.name, i.message, i.suggestion ?? ''])]
      .map((r) => (sep === 'md' ? `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |` : r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))).map((l, k) => (sep === 'md' && k === 0 ? `${l}\n|${' --- |'.repeat(6)}` : l)).join('\n');
    const run = () => {
      if (!app) return;
      let parsedRules;
      try { parsedRules = parseRules(rules.value); } catch (e) { stat.error(e); return; }
      const allowed = (m) => (market.checked || !app.modules.find((x) => x.name === m)?.marketplace) && (!moduleSel.value || moduleSel.value === m);
      const model = { ...app.model, entities: app.model.entities.filter((e) => allowed(e.module)), associations: app.model.associations.filter((a) => allowed(a.module)) };
      issues = checkNaming({ documents: app.documents.filter((d) => allowed(d.module)), model, modules: app.modules.map((m) => m.name).filter(allowed) }, parsedRules)
        .filter((i) => hints.checked || i.severity !== 'hint');
      const count = (s) => issues.filter((i) => i.severity === s).length;
      const checked = app.documents.filter((d) => allowed(d.module)).length + model.entities.length + model.associations.length;
      const skipped = app.unavailable.length ? ` Not checked, because this Studio Pro version can't list them: ${app.unavailable.join(', ')}.` : '';
      if (!issues.length && !skipped) stat.ok(`Checked ${checked} names: all follow the conventions.`);
      else stat.info(`Checked ${checked} names: ${count('error')} errors, ${count('warning')} warnings${hints.checked ? `, ${count('hint')} hints` : ''}.${skipped}`);
      clear(table, issues.length ? h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['', 'Module', 'Kind', 'Name', 'Problem', 'Suggestion'].map((t) => h('th', {}, t)))),
        h('tbody', {}, issues.map((i) => h('tr', { class: `sev-${i.severity}` }, h('td', {}, h('span', { class: 'sev' }, i.severity)), h('td', {}, i.module), h('td', {}, i.kind), h('td', { class: 'mono' }, i.name), h('td', {}, i.message), h('td', { class: 'mono' }, i.suggestion ?? ''))))) : null);
    };
    const fillModules = () => {
      const current = moduleSel.value;
      clear(moduleSel, h('option', { value: '' }, 'All modules'), app.modules.filter((m) => market.checked || !m.marketplace).map((m) => h('option', { value: m.name }, m.name)));
      moduleSel.value = [...moduleSel.options].some((o) => o.value === current) ? current : '';
    };
    const bar = sourceBar(ctx, (a) => { app = a; fillModules(); run(); }, { marketplace: () => market.checked });
    market.el.addEventListener('change', () => bar.reload(false));
    clear(root,
      bar,
      options(field('Module', moduleSel), market.root, hints.root, button('Copy as CSV', () => copyText(asText(',')), { kind: 'ghost', iconName: 'copy' }), button('Copy as Markdown', () => copyText(asText('md')), { kind: 'ghost', iconName: 'copy' })),
      stat.root, table,
      h('details', { class: 'card' }, h('summary', {}, 'Rules'), h('p', { class: 'hint' }, 'Based on Mendix "Best practices for naming conventions" for Studio Pro 11. Entity, attribute, association and module checks are built in.'), rules.root));
    root.addEventListener('input', () => run());
    root.addEventListener('change', () => run());
  },
};

export default [oql, xpath, datePattern, domainDocs, naming];
