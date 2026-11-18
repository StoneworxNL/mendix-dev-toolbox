// Loading an app through a mocked Studio Pro model API. Run with: node --test tests/web
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { readApp, describeStats } = await import(new URL('../../src/toolbox/lib/mxapp.js', import.meta.url));

const entity = (name) => ({ $ID: `e-${name}`, $Type: 'DomainModels$Entity', name, attributes: [], generalization: { $Type: 'DomainModels$NoGeneralization', persistable: true } });
const dm = (id, ...names) => ({ $ID: id, $Type: 'DomainModels$DomainModel', entities: names.map(entity), associations: [], crossAssociations: [] });

const MODULES = [
  { $ID: 'm-own', name: 'InteractiveSVG', fromAppStore: false },
  { $ID: 'm-enum', name: 'EnumTest', fromAppStore: false },
  { $ID: 'm-admin', name: 'Administration', fromAppStore: true },
  { $ID: 'm-sys', name: 'System', fromAppStore: false },
];
const UNITS = { 'dm-own': dm('dm-own', 'Shape', 'Area'), 'dm-enum': dm('dm-enum', 'Thing'), 'dm-admin': dm('dm-admin', 'Account'), 'dm-sys': dm('dm-sys', 'User') };
const UNIT_MODULE = { 'dm-own': 'InteractiveSVG', 'dm-enum': 'EnumTest', 'dm-admin': 'Administration', 'dm-sys': 'System' };

/** A Studio Pro 11.12-like API. `moduleNames: false` leaves moduleName out of the unit infos. */
function mockStudioPro({ moduleNames = true, tree = true, documentsInfo = true, loadUnits = true, byName = true, calls = [] } = {}) {
  const info = (id, extra = {}) => ({ $ID: id, $Type: 'DomainModels$DomainModel', ...(moduleNames ? { moduleName: UNIT_MODULE[id] } : {}), ...extra });
  const domainModels = {
    getUnitsInfo: async () => Object.keys(UNITS).map((id) => info(id)),
    ...(loadUnits ? { loadUnits: async (type, ids) => { calls.push(['loadUnits', type, ids]); return ids.map((id) => UNITS[id]); } }
      : { loadAll: async (filter) => Object.values(UNITS).filter(filter) }),
    ...(byName ? { getDomainModel: async (name) => { calls.push(['getDomainModel', name]); return Object.values(UNITS).find((u) => UNIT_MODULE[u.$ID] === name) ?? null; } } : {}),
  };
  const projects = {
    ...(tree ? { getModulesTree: async (opts) => { calls.push(['getModulesTree', opts]); return MODULES.map((mod) => ({ ...mod, folders: [{ documents: [{ $ID: `mf-${mod.name}`, name: 'ACT_Go' }] }], documents: opts?.includeUnnamed ? Object.keys(UNITS).filter((id) => UNIT_MODULE[id] === mod.name).map((id) => ({ $ID: id, $Type: 'DomainModels$DomainModel' })) : [] })); } } : {}),
    ...(documentsInfo ? { getDocumentsInfo: async (id) => Object.keys(UNITS).filter((u) => UNIT_MODULE[u] === MODULES.find((x) => x.$ID === id).name).map((u) => ({ $ID: u })) } : {}),
  };
  const microflows = { getUnitsInfo: async () => MODULES.map((mod) => ({ $ID: `mf-${mod.name}`, name: 'ACT_Go', ...(moduleNames ? { moduleName: mod.name } : {}) })) };
  const enumerations = { getUnitsInfo: async () => [], loadUnits: async () => [] };
  return { app: { model: { modules: { getModules: async () => MODULES }, domainModels, enumerations, projects, microflows } } };
}

const qualified = (app) => app.model.entities.map((e) => e.qualifiedName).sort();

test('loads own modules when unit infos carry the module name', async () => {
  const app = await readApp(mockStudioPro());
  assert.deepEqual(qualified(app), ['EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
  assert.deepEqual(app.modules.map((m) => m.name), ['Administration', 'EnumTest', 'InteractiveSVG']);
  assert.equal(app.stats.withoutModuleName, 0);
  assert.equal(app.stats.entities, 3);
  assert.deepEqual(app.errors, []);
});

test('maps unit ids to modules through the module tree when moduleName is missing', async () => {
  const calls = [];
  const app = await readApp(mockStudioPro({ moduleNames: false, calls }));
  assert.deepEqual(qualified(app), ['EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
  assert.deepEqual(calls.find((c) => c[0] === 'getModulesTree')[1], { includeUnnamed: true });
  assert.deepEqual(app.stats, { modules: 3, marketplaceModules: 1, domainModelInfos: 4, withoutModuleName: 4, afterFilter: 2, unitsLoaded: 2, entities: 3, via: 'unit infos' });
  // Documents in folders get their module too.
  assert.deepEqual(app.documents.map((d) => d.module).sort(), ['EnumTest', 'InteractiveSVG']);
});

test('includes Marketplace modules when asked, never System', async () => {
  const app = await readApp(mockStudioPro({ moduleNames: false }), { marketplace: true });
  assert.deepEqual(qualified(app), ['Administration.Account', 'EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
  assert.equal(app.model.entities.find((e) => e.module === 'Administration').marketplace, true);
});

test('falls back to the documents of each module without a module tree', async () => {
  const app = await readApp(mockStudioPro({ moduleNames: false, tree: false }));
  assert.deepEqual(qualified(app), ['EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
  assert.match(app.errors.join(), /modules tree: not available/);
});

test('falls back to getDomainModel per module when nothing maps unit ids to modules', async () => {
  const calls = [];
  const app = await readApp(mockStudioPro({ moduleNames: false, tree: false, documentsInfo: false, calls }));
  assert.deepEqual(qualified(app), ['EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
  assert.deepEqual(calls.filter((c) => c[0] === 'getDomainModel').map((c) => c[1]).sort(), ['EnumTest', 'InteractiveSVG']);
  assert.equal(app.stats.via, 'module names');
  assert.equal(app.stats.afterFilter, 0);
});

test('works with the older loadAll API', async () => {
  const app = await readApp(mockStudioPro({ moduleNames: false, loadUnits: false }));
  assert.deepEqual(qualified(app), ['EnumTest.Thing', 'InteractiveSVG.Area', 'InteractiveSVG.Shape']);
});

test('records a failing stage instead of losing it', async () => {
  const sp = mockStudioPro({ byName: false });
  sp.app.model.domainModels.loadUnits = async () => { throw new Error('boom'); };
  const app = await readApp(sp);
  assert.equal(app.model.entities.length, 0);
  assert.deepEqual(app.errors, ['domain models: boom']);
  assert.match(describeStats(app), /^3 modules \(1 Marketplace\) → 4 domain model infos → 2 after filter → 0 loaded via unit infos → 0 entities\. Errors: domain models: boom$/);
});

test('describes missing module names', async () => {
  const app = await readApp(mockStudioPro({ moduleNames: false }));
  assert.equal(describeStats(app), '3 modules (1 Marketplace) → 4 domain model infos (4 without module name) → 2 after filter → 2 loaded via unit infos → 3 entities.');
});
