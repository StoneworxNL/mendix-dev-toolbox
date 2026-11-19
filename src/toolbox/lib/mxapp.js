// Reads an app's modules, domain models, enumerations and document names through the Studio Pro
// model API (read-only). Kept free of DOM code so it can be tested with a mocked API.
import { normalizeModel } from './mxmodel.js';

// Document kinds for the naming check, by model API.
export const DOCUMENT_APIS = [
  ['microflows', 'Microflow'], ['nanoflows', 'Nanoflow'], ['pages', 'Page'], ['layouts', 'Layout'], ['snippets', 'Snippet'],
  ['enumerations', 'Enumeration'], ['importMappings', 'Import mapping'], ['exportMappings', 'Export mapping'],
  ['xmlSchemas', 'XML schema'], ['jsonStructures', 'JSON structure'], ['workflows', 'Workflow'],
];

const message = (e) => String(e?.message ?? e);

/**
 * @param {any} studioPro the `studioPro` object of the extensions API
 * @param {{ marketplace?: boolean }} [options] also load Marketplace modules
 * @returns {Promise<{ connected: true, modules: {name: string, marketplace: boolean}[], model: any, documents: any[], unavailable: string[], stats: Record<string, any>, errors: string[] }>}
 */
export async function readApp(studioPro, { marketplace: withMarketplace = false } = {}) {
  const m = studioPro.app.model;
  const errors = [];
  const note = (stage, e) => errors.push(`${stage}: ${message(e)}`);
  const stats = { modules: 0, marketplaceModules: 0, domainModelInfos: 0, withoutModuleName: 0, afterFilter: 0, unitsLoaded: 0, entities: 0, via: 'unit infos' };

  const mods = (await m.modules.getModules()).filter((x) => x?.name);
  const marketplace = new Set(mods.filter((x) => x.fromAppStore).map((x) => x.name));
  const modules = mods.map((x) => ({ name: x.name, marketplace: !!x.fromAppStore })).filter((x) => x.name !== 'System').sort((a, b) => a.name.localeCompare(b.name));
  stats.modules = modules.length;
  stats.marketplaceModules = modules.filter((x) => x.marketplace).length;
  const wanted = (moduleName) => !!moduleName && moduleName !== 'System' && (withMarketplace || !marketplace.has(moduleName));

  // Unit infos do not always carry the module name (it is optional in the API, and missing for
  // unnamed units such as domain models). Map unit ids to modules through the project tree then.
  let unitModules;
  const moduleOfUnit = () => unitModules ??= (async () => {
    const map = new Map();
    const walk = (node, moduleName) => {
      for (const d of node?.documents ?? []) if (d?.$ID) map.set(d.$ID, moduleName);
      for (const f of node?.folders ?? []) walk(f, moduleName);
    };
    try {
      if (typeof m.projects?.getModulesTree !== 'function') throw new Error('not available');
      for (const tree of await m.projects.getModulesTree({ includeUnnamed: true })) walk(tree, tree.name);
    } catch (e) {
      note('modules tree', e);
      // Fall back to the documents directly inside each module (where domain models live).
      if (typeof m.projects?.getDocumentsInfo === 'function') {
        await Promise.all(mods.map(async (mod) => {
          try {
            for (const d of await m.projects.getDocumentsInfo(mod.$ID)) if (d?.$ID) map.set(d.$ID, mod.name);
          } catch (err) { note(`documents of ${mod.name}`, err); }
        }));
      }
    }
    return map;
  })();

  const withModules = async (infos) => {
    if (infos.every((i) => i.moduleName)) return infos;
    const map = await moduleOfUnit();
    return infos.map((i) => (i.moduleName ? i : { ...i, moduleName: map.get(i.$ID) ?? '' }));
  };

  const loadUnits = async (api, type, count) => {
    const all = (await api.getUnitsInfo()) ?? [];
    if (count) { stats.domainModelInfos = all.length; stats.withoutModuleName = all.filter((i) => !i.moduleName).length; }
    const infos = (await withModules(all)).filter((i) => wanted(i.moduleName));
    if (count) stats.afterFilter = infos.length;
    if (!infos.length) return [];
    const ids = infos.map((i) => i.$ID);
    // Newer API versions document loadUnits(type, ids); older ones have loadAll(filter, max).
    const units = (typeof api.loadUnits === 'function' ? await api.loadUnits(type, ids) : await api.loadAll((u) => ids.includes(u.$ID), ids.length)) ?? [];
    const moduleOf = new Map(infos.map((i) => [i.$ID, i.moduleName]));
    return units.map((u, k) => u && { unit: u, moduleName: moduleOf.get(u.$ID) ?? infos[k]?.moduleName ?? '' }).filter((x) => x?.moduleName);
  };

  const unavailable = [];
  const countEntities = (list) => list.reduce((n, { unit }) => n + (unit?.entities?.length ?? 0), 0);
  let [domainModels, enumerations] = await Promise.all([
    loadUnits(m.domainModels, 'DomainModels$DomainModel', true).catch((e) => { note('domain models', e); return []; }),
    loadUnits(m.enumerations, 'Enumerations$Enumeration').catch((e) => { note('enumerations', e); unavailable.push('Enumeration'); return []; }),
  ]);
  stats.unitsLoaded = domainModels.length;

  // Last resort: ask for each module's domain model by name.
  const names = modules.filter((x) => wanted(x.name)).map((x) => x.name);
  if (countEntities(domainModels) === 0 && names.length && typeof m.domainModels?.getDomainModel === 'function') {
    const byName = (await Promise.all(names.map(async (name) => {
      try {
        const unit = await m.domainModels.getDomainModel(name);
        return unit && { unit, moduleName: name };
      } catch (e) { note(`domain model of ${name}`, e); return null; }
    }))).filter(Boolean);
    if (countEntities(byName) > 0 || !domainModels.length) {
      domainModels = byName;
      stats.via = 'module names';
      stats.unitsLoaded = byName.length;
    }
  }
  stats.entities = countEntities(domainModels);

  const model = normalizeModel(
    domainModels.map(({ unit, moduleName }) => ({ moduleName, domainModel: unit, marketplace: marketplace.has(moduleName) })),
    enumerations.map(({ unit, moduleName }) => ({ moduleName, name: unit.name, values: (unit.values ?? []).map((v) => v.name), marketplace: marketplace.has(moduleName) })),
  );

  const documents = [];
  await Promise.all(DOCUMENT_APIS.map(async ([api, kind]) => {
    let infos;
    try {
      infos = await m[api].getUnitsInfo();
    } catch {
      unavailable.push(kind); // not in this Studio Pro version's API
      return;
    }
    try {
      for (const i of await withModules(infos ?? [])) if (wanted(i.moduleName) && i.name) documents.push({ module: i.moduleName, kind, name: i.name, marketplace: marketplace.has(i.moduleName) });
    } catch (e) { note(kind, e); }
  }));

  return { connected: true, modules, model, documents, unavailable: [...new Set(unavailable)].sort(), stats, errors };
}

/** One line for the "Details" toggle of the source bar. */
export function describeStats({ stats, errors = [] }) {
  if (!stats) return '';
  const s = stats;
  const parts = [
    `${s.modules} modules (${s.marketplaceModules} Marketplace)`,
    `${s.domainModelInfos} domain model infos${s.withoutModuleName ? ` (${s.withoutModuleName} without module name)` : ''}`,
    `${s.afterFilter} after filter`,
    `${s.unitsLoaded} loaded via ${s.via}`,
    `${s.entities} entities`,
  ];
  return parts.join(' → ') + (errors.length ? `. Errors: ${errors.join('; ')}` : '.');
}
