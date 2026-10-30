// A plain description of a Mendix app's domain model, built from the Studio Pro model API,
// plus generators for documentation (Mermaid ER diagrams and Markdown).

const TYPE_NAMES = {
  AutoNumberAttributeType: 'AutoNumber', BinaryAttributeType: 'Binary', BooleanAttributeType: 'Boolean', DateTimeAttributeType: 'DateTime',
  DecimalAttributeType: 'Decimal', EnumerationAttributeType: 'Enumeration', HashedStringAttributeType: 'HashString', IntegerAttributeType: 'Integer',
  LongAttributeType: 'Long', StringAttributeType: 'String',
};

/**
 * @typedef {{ name: string, type: string, length?: number, enumeration?: string, defaultValue?: string, calculated?: boolean, documentation?: string }} MxAttribute
 * @typedef {{ module: string, name: string, qualifiedName: string, attributes: MxAttribute[], generalization: string | null, persistable: boolean, documentation: string, system: string[], marketplace: boolean }} MxEntity
 * @typedef {{ module: string, name: string, qualifiedName: string, parent: string, child: string, type: 'Reference' | 'ReferenceSet', owner: 'Default' | 'Both', documentation: string, marketplace: boolean }} MxAssociation
 * @typedef {{ entities: MxEntity[], associations: MxAssociation[], enumerations: { module: string, name: string, qualifiedName: string, values: string[] }[] }} MxModel
 */

/**
 * Normalizes domain models loaded through `studioPro.app.model.domainModels`.
 * @param {{ moduleName: string, domainModel: any, marketplace?: boolean }[]} units
 * @param {{ moduleName: string, name: string, values: string[], marketplace?: boolean }[]} [enumerations]
 * @returns {MxModel}
 */
export function normalizeModel(units, enumerations = []) {
  const byId = new Map();
  const entities = [];
  for (const { moduleName, domainModel, marketplace = false } of units) {
    for (const e of domainModel.entities ?? []) {
      const qualifiedName = `${moduleName}.${e.name}`;
      if (e.$ID) byId.set(e.$ID, qualifiedName);
      const gen = e.generalization ?? {};
      const system = gen.$Type === 'DomainModels$NoGeneralization' ? [gen.hasCreatedDate && 'createdDate', gen.hasChangedDate && 'changedDate', gen.hasOwner && 'owner', gen.hasChangedBy && 'changedBy'].filter(Boolean) : [];
      entities.push({
        module: moduleName, name: e.name, qualifiedName, marketplace,
        generalization: gen.$Type === 'DomainModels$Generalization' ? gen.generalization : null,
        persistable: gen.$Type === 'DomainModels$NoGeneralization' ? gen.persistable !== false : true,
        documentation: e.documentation ?? '',
        system,
        attributes: (e.attributes ?? []).map((a) => {
          const t = (a.type?.$Type ?? '').replace('DomainModels$', '');
          return {
            name: a.name, type: TYPE_NAMES[t] ?? t.replace(/AttributeType$/, ''),
            length: t === 'StringAttributeType' ? a.type.length : undefined,
            enumeration: t === 'EnumerationAttributeType' ? a.type.enumeration : undefined,
            defaultValue: a.value?.$Type === 'DomainModels$StoredValue' ? a.value.defaultValue : undefined,
            calculated: a.value?.$Type === 'DomainModels$CalculatedValue',
            documentation: a.documentation ?? '',
          };
        }),
      });
    }
  }
  // Association ends are element ids inside a module and qualified names across modules.
  const ref = (v) => byId.get(v) ?? v;
  const associations = [];
  for (const { moduleName, domainModel, marketplace = false } of units) {
    for (const a of [...(domainModel.associations ?? []), ...(domainModel.crossAssociations ?? [])]) {
      associations.push({
        module: moduleName, name: a.name, qualifiedName: `${moduleName}.${a.name}`, marketplace,
        parent: ref(a.parent), child: ref(a.child), type: a.type, owner: a.owner, documentation: a.documentation ?? '',
      });
    }
  }
  // Generalizations to entities in this model inherit persistability.
  const lookup = new Map(entities.map((e) => [e.qualifiedName, e]));
  for (const e of entities) {
    let g = e.generalization;
    for (let guard = 0; g && guard < 20; guard++) { const p = lookup.get(g); if (!p) break; e.persistable = p.persistable; g = p.generalization; }
  }
  return {
    entities, associations,
    enumerations: enumerations.map((x) => ({ module: x.moduleName, name: x.name, qualifiedName: `${x.moduleName}.${x.name}`, values: x.values, marketplace: x.marketplace ?? false })),
  };
}

/** Associations that start or end at an entity, with the entity at the other end. */
export function associationsOf(model, qualifiedName) {
  return model.associations.flatMap((a) => [
    a.parent === qualifiedName && { association: a, other: a.child, direction: 'parent' },
    a.child === qualifiedName && a.parent !== a.child && { association: a, other: a.parent, direction: 'child' },
  ].filter(Boolean));
}

/** Attributes of an entity including the ones it inherits. */
export function allAttributes(model, qualifiedName) {
  const out = [];
  const seen = new Set();
  for (let e = model.entities.find((x) => x.qualifiedName === qualifiedName); e && !seen.has(e.qualifiedName); e = model.entities.find((x) => x.qualifiedName === e.generalization)) {
    seen.add(e.qualifiedName);
    out.push(...e.attributes.map((a) => ({ ...a, from: e.qualifiedName })));
  }
  return out;
}

export function typeLabel(a) {
  if (a.type === 'String') return a.length ? `String(${a.length})` : 'String(unlimited)';
  if (a.type === 'Enumeration') return `Enumeration ${a.enumeration}`;
  return a.type;
}

/** Multiplicity as text, following Studio Pro's terms. */
export function multiplicity(a) {
  if (a.type === 'ReferenceSet') return 'many-to-many';
  return a.owner === 'Both' ? 'one-to-one' : 'one-to-many';
}

const mermaidId = (q) => q.replace(/[^\w]/g, '_');
const mermaidText = (s) => s.replace(/"/g, "'");

/** Mermaid erDiagram for the entities of the given modules (all when empty). */
export function toMermaid(model, { modules = [], attributes = true } = {}) {
  const inScope = (q) => !modules.length || modules.includes(q.split('.')[0]);
  const entities = model.entities.filter((e) => inScope(e.qualifiedName));
  const names = new Set(entities.map((e) => e.qualifiedName));
  const lines = ['erDiagram'];
  for (const e of entities) {
    if (!attributes || !e.attributes.length) { lines.push(`  ${mermaidId(e.qualifiedName)}["${e.qualifiedName}"]`); continue; }
    lines.push(`  ${mermaidId(e.qualifiedName)}["${e.qualifiedName}"] {`);
    for (const a of e.attributes) lines.push(`    ${a.type} ${a.name}${a.enumeration || a.length || a.calculated ? ` "${mermaidText([a.enumeration, a.length && `length ${a.length}`, a.calculated && 'calculated'].filter(Boolean).join(', '))}"` : ''}`);
    lines.push('  }');
  }
  for (const a of model.associations) {
    if (!names.has(a.parent) && !names.has(a.child)) continue;
    for (const q of [a.parent, a.child]) if (!names.has(q)) { names.add(q); lines.push(`  ${mermaidId(q)}["${q}"]`); }
    const shape = a.type === 'ReferenceSet' ? '}o--o{' : a.owner === 'Both' ? '|o--o|' : '}o--o|';
    lines.push(`  ${mermaidId(a.parent)} ${shape} ${mermaidId(a.child)} : "${mermaidText(a.name)}"`);
  }
  for (const e of entities) {
    if (!e.generalization) continue;
    if (!names.has(e.generalization)) { names.add(e.generalization); lines.push(`  ${mermaidId(e.generalization)}["${e.generalization}"]`); }
    lines.push(`  ${mermaidId(e.qualifiedName)} |o..|| ${mermaidId(e.generalization)} : "generalizes"`);
  }
  return lines.join('\n');
}

const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

/** Markdown documentation: one section per module and entity. */
export function toMarkdown(model, { modules = [], diagram = true, title = 'Domain model' } = {}) {
  const mods = [...new Set(model.entities.map((e) => e.module))].filter((m) => !modules.length || modules.includes(m)).sort();
  const out = [`# ${title}`, ''];
  for (const m of mods) {
    out.push(`## ${m}`, '');
    if (diagram) out.push('```mermaid', toMermaid(model, { modules: [m], attributes: false }), '```', '');
    for (const e of model.entities.filter((x) => x.module === m).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`### ${e.name}`, '');
      const facts = [e.generalization && `Generalization: \`${e.generalization}\``, !e.persistable && 'Non-persistable', e.system.length && `System members: ${e.system.join(', ')}`].filter(Boolean);
      if (e.documentation) out.push(e.documentation, '');
      if (facts.length) out.push(facts.join(' · '), '');
      if (e.attributes.length) {
        out.push('| Attribute | Type | Default | Documentation |', '| --- | --- | --- | --- |');
        for (const a of e.attributes) out.push(`| ${mdCell(a.name)} | ${mdCell(typeLabel(a))}${a.calculated ? ' (calculated)' : ''} | ${mdCell(a.defaultValue)} | ${mdCell(a.documentation)} |`);
        out.push('');
      }
      const assocs = associationsOf(model, e.qualifiedName).filter((x) => x.direction === 'parent');
      if (assocs.length) {
        out.push('| Association | To | Multiplicity | Owner |', '| --- | --- | --- | --- |');
        for (const { association: a } of assocs) out.push(`| ${mdCell(a.name)} | ${mdCell(a.child)} | ${multiplicity(a)} | ${a.owner === 'Both' ? 'both' : 'parent'} |`);
        out.push('');
      }
    }
    const enums = model.enumerations.filter((x) => x.module === m);
    if (enums.length) {
      out.push(`### Enumerations in ${m}`, '');
      for (const x of enums) out.push(`- **${x.name}**: ${x.values.map((v) => `\`${v}\``).join(', ')}`);
      out.push('');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}

/** A small app for the standalone page and tests, shaped like the Studio Pro model API. */
export const SAMPLE_UNITS = (() => {
  const str = (length = 200) => ({ $Type: 'DomainModels$StringAttributeType', length });
  const t = (name) => ({ $Type: `DomainModels$${name}AttributeType` });
  const attr = (name, type, extra = {}) => ({ name, type, value: { $Type: 'DomainModels$StoredValue', defaultValue: '' }, documentation: '', ...extra });
  const noGen = (extra = {}) => ({ $Type: 'DomainModels$NoGeneralization', persistable: true, hasCreatedDate: false, hasChangedDate: false, hasOwner: false, hasChangedBy: false, ...extra });
  return [
    { moduleName: 'Sales', domainModel: {
      entities: [
        { $ID: 's1', name: 'Customer', documentation: 'A person or company that buys from us.', generalization: noGen({ hasCreatedDate: true }), attributes: [attr('Name', str()), attr('Email', str(320)), attr('IsActive', t('Boolean'), { value: { $Type: 'DomainModels$StoredValue', defaultValue: 'true' } }), attr('customer_type', { $Type: 'DomainModels$EnumerationAttributeType', enumeration: 'Sales.ENUM_CustomerType' })] },
        { $ID: 's2', name: 'Order', generalization: noGen({ hasCreatedDate: true, hasOwner: true }), attributes: [attr('Number', t('AutoNumber')), attr('OrderDate', t('DateTime')), attr('TotalAmount', t('Decimal'), { value: { $Type: 'DomainModels$CalculatedValue', microflow: 'Sales.CAL_Order_TotalAmount' } }), attr('Status', { $Type: 'DomainModels$EnumerationAttributeType', enumeration: 'Sales.OrderStatus' })] },
        { $ID: 's3', name: 'OrderLine', generalization: noGen(), attributes: [attr('Quantity', t('Integer')), attr('UnitPrice', t('Decimal')), attr('_SyncHash', str(64))] },
        { $ID: 's4', name: 'Products', generalization: noGen(), attributes: [attr('Name', str()), attr('Price', t('Decimal'))] },
        { $ID: 's5', name: 'OrderSearch', generalization: noGen({ persistable: false }), attributes: [attr('FromDate', t('DateTime')), attr('Query', str())] },
      ],
      associations: [
        { name: 'Order_Customer', parent: 's2', child: 's1', type: 'Reference', owner: 'Default', documentation: '' },
        { name: 'OrderLine_Order', parent: 's3', child: 's2', type: 'Reference', owner: 'Default', documentation: '' },
        { name: 'OrderLine_Products', parent: 's3', child: 's4', type: 'Reference', owner: 'Default', documentation: '' },
        { name: 'Customer_Favourite', parent: 's1', child: 's4', type: 'ReferenceSet', owner: 'Default', documentation: '' },
      ],
      crossAssociations: [
        { name: 'Customer_Account', parent: 's1', child: 'Administration.Account', type: 'Reference', owner: 'Both', documentation: '' },
      ],
    } },
    { moduleName: 'Administration', domainModel: {
      entities: [
        { $ID: 'a1', name: 'Account', generalization: { $Type: 'DomainModels$Generalization', generalization: 'System.User' }, attributes: [attr('FullName', str()), attr('Email', str()), attr('IsLocalUser', t('Boolean'))] },
      ],
      associations: [], crossAssociations: [],
    } },
  ];
})();

export const SAMPLE_ENUMERATIONS = [
  { moduleName: 'Sales', name: 'ENUM_CustomerType', values: ['Private', 'Business'] },
  { moduleName: 'Sales', name: 'OrderStatus', values: ['Draft', 'Confirmed', 'Shipped', 'Cancelled'] },
];

/** Document names for the naming check sample. */
export const SAMPLE_DOCUMENTS = [
  ['Sales', 'Microflow', 'ACT_Order_Confirm'], ['Sales', 'Microflow', 'SUB_Order_CalculateTotals'], ['Sales', 'Microflow', 'CAL_Order_TotalAmount'],
  ['Sales', 'Microflow', 'BCo_Order'], ['Sales', 'Microflow', 'ConfirmOrder'], ['Sales', 'Microflow', 'IVK_Customer_Save'],
  ['Sales', 'Microflow', 'DS_Customer_GetActive'], ['Sales', 'Microflow', 'ScheduledCleanup'], ['Sales', 'Microflow', 'TEST_Order_Totals'],
  ['Sales', 'Nanoflow', 'OCH_Order_Status'], ['Sales', 'Nanoflow', 'refreshList'],
  ['Sales', 'Page', 'Order_Overview'], ['Sales', 'Page', 'Order_NewEdit'], ['Sales', 'Page', 'CustomerDetails'], ['Sales', 'Page', 'Products_Select'],
  ['Sales', 'Snippet', 'SNIP_OrderLines'], ['Sales', 'Snippet', 'CustomerCard'],
  ['Sales', 'Enumeration', 'ENUM_CustomerType'], ['Sales', 'Enumeration', 'OrderStatus'],
  ['Sales', 'Layout', 'Atlas_Default'], ['Sales', 'Layout', 'MainLayout'],
  ['Sales', 'Import mapping', 'IMM_Order'], ['Sales', 'Export mapping', 'OrderExport'], ['Sales', 'JSON structure', 'JSON_Order'],
  ['Administration', 'Page', 'Account_Overview'], ['Administration', 'Page', 'Home_Desktop_Default'], ['Administration', 'Microflow', 'ASU_Administration_Start'],
].map(([module, kind, name]) => ({ module, kind, name }));
