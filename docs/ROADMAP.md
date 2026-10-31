# Developer Toolbox: roadmap

> **Status (31 October 2026):** Phase 0 is done (PR #3). [`FUTURE-WORK.md`](FUTURE-WORK.md) re-plans the rest against Mendix's release calendar and takes precedence where they differ. In particular, "JSON → integration in one step" (Phase 2) is deprioritized, because Maia creates JSON structures and import/export mappings since 11.13 and 11.16. Maia tool registration also moves earlier.

Where the toolbox can go after 0.3.0. The plan is based on the code review (`docs/REVIEW.md`), the Mendix docs as of 31 October 2026 and what the `@mendix/extensions-api` 11.12 type definitions actually expose.

**Direction:** turn it from "DevToys inside Studio Pro" into "the Mendix developer's assistant inside Studio Pro". The generic tools stay. The growth is in tools that know the app model, react to what the developer is doing and write their results back into the app.

---

## 1. What the platform offers (docs analysis)

### 1.1 Web Extensibility API by version (beta; C# extensibility is in maintenance only)

| Since | API | Used now? | Why it matters for the toolbox |
| --- | --- | --- | --- |
| 10.21 | panes, tabs, extensions menu | ✅ | Already used |
| 11.0 | `ui.dialogs`, `ui.notifications`, `ui.preferences` (theme, language) | theme only | Notifications for long checks; dialogs for "pick and insert" flows |
| 11.1 | `ui.editors.getActiveDocument`, `editDocument`, `activeDocumentChanged` | ❌ | Make tools context-aware (the OQL helper follows the open view entity; naming issues open the document) |
| 11.3 | `ui.messagePassing`, `ui.versionControl` | ❌ | Sync pane and tab; branch-aware reports |
| 11.4 | `dialogs.showProgressDialog`, `customBlobDocuments` | ❌ | Progress for full-model scans; custom documents (see 3.4) |
| 11.5 | `ui.elementSelectors` (document/entity picker) | ❌ | Native entity pickers instead of HTML selects |
| 11.6 | Menus use `action` (commands removed) | ✅ | Done right |
| 11.9 | `runtime.controller` (`connectionChanged`), `runtime.configuration` (constants), extension permissions | ❌ (permission declared, not used) | Runtime-aware tools; constants viewer |
| 11.10 | Model writes: `addJsonStructure`, `addImportMapping`, `addExportMapping`, mapping elements | ❌ | "JSON → JSON structure + import mapping" in one click |
| 11.12 | `documentsChanged` / `elementsRenamed`, `permissionsChanged`, Studio Pro version in preferences; model element helpers **removed** | ❌ | Keep the model cache current; version-gate features |
| 11.12.5 | `ai.tools.registerTool` (permission `register-ai-tools`) | ❌ | Offer toolbox functions to Maia |
| 11.15 | `featureFlags`, `projectManager` (`projectOpened`/`projectClosing`, `getProjectMetadata`) | ❌ | Per-project state; clean up on close |
| 11.16 | `ui.userAuthentication`, `ai.chat` (prefill Maia) | ❌ | "Ask Maia about this issue" buttons |

The 11.12 type definitions also have APIs that are barely documented yet:
- `appExplorer.addContextMenu(menu, documentType)` and `documents.addContextMenu(...)`: right-click menus on App Explorer documents.
- `app.files.getFiles(glob, { metadata: true })`, `getFile`, `putFile`, `deleteFile`, inside the app folder only. The `.mpr` and `.git` are off limits.
- `httpProxy.getProxyUrl(url)`, which goes around CORS through Studio Pro.
- Model access for about 45 document types: constants, rules, scheduled events, Java and JavaScript actions, REST and OData services, regular expressions, view entity sources, data sets, menus, module security and more.

Constraints to design around:
- The whole API is **beta**.
- Only `getUnitsInfo`, `loadAll` and `loadUnits` exist for reading. **`loadAll` defaults to 10 units.**
- There is **no theme-change event**.
- **Content security policy and sandbox rules for extension iframes are not documented.** That covers workers, wasm, `blob:` URLs and remote images, so test each in Studio Pro.
- Maia AI tools ask the user to confirm each call and cannot be unregistered.
- Permissions are opt-in per project. The docs disagree on whether they go in `manifest.json` or `package.json`.

### 1.2 Mendix features that overlap, and how to stay complementary

- **Best Practice Recommender**: offline, with auto-fix and CSV export. It "only detects a subset of the documented best practices", and its docs don't mention naming. The toolbox's naming check fills that gap. Next steps: auto-fix (rename) and the same CSV columns, so teams can merge both reports.
- **Maia for OQL** (Maia Make chat in 11.9+): generates view-entity OQL online. It does not support custom-named or cross-module associations. The toolbox's offline OQL builder and linter cover exactly those cases, and work without signing in.
- **OQL playground** (service.mendixcloud.com/p/OQL): online. The toolbox stays offline.

---

## 2. Phase 0: stabilize (0.3.1, about 1–2 days)

| # | Item | Done when |
| --- | --- | --- |
| 0.1 | Fix the `lintConstraint` infinite loop (REVIEW C1) | A test with an unclosed `[%` returns within 50 ms |
| 0.2 | Fuzz the tokenizers and linters (`lintConstraint`, `lintOql`, `formatOql`, `parsePattern`, `parseDate`): 10,000 random inputs each, with a time limit | Runs in `npm test`, no hangs or throws escape |
| 0.3 | OQL: accept `$Module.Constant` and `Enum#Value` (H1); fix the `LOCATE` order and the `TRIM` family's optional character; add a "Java only" column (H3) | Tests cover each documented example |
| 0.4 | Remove `[%MillisecondLength%]` (H2); soften the `NULL` hint (M5) | Token table matches the docs list |
| 0.5 | Check Day/Week period arithmetic against a running app (H4); write the rule in the UI | One-paragraph note in the tool and the README |
| 0.6 | Naming: add `workflow` rules; stop counting unchecked kinds (M1) | Counts match |
| 0.7 | Regex worker: fall back to inline matching on an async `onerror` (M11) | Works with workers blocked |
| 0.8 | Delete the C# leftovers; add an "evil input" pass to the smoke test (M14, M15) | CI green |

## 3. Phase 1: context-aware Mendix tools (0.4, about 2–3 weeks)

### 3.1 Live model cache
- Load the model once and keep it current with `projectChanges` (`documentsChanged`, `elementsRenamed`, `documentAdded`). Re-read only the changed units with `loadUnits`.
- Show a progress dialog (`showProgressDialog`) for the first load of big apps.
- Scope cached data and saved inputs per project (`getProjectMetadata`, 11.15+; fall back to a hash of the module list).

### 3.2 Naming check 2.0
- Cover every document kind the API exposes (M2). Cross-checks:
  - `SCE_` microflow name equals the scheduled event name.
  - `CRS_` and `PRS_` names match the REST services.
  - `CAL_{Entity}_{Attribute}` points to an attribute that is really calculated by that microflow.
  - Before/after-commit microflow prefixes (`BCO_`, `ACO_` and so on) match how the entity actually uses them in its event handlers.
- Click an issue to open the document (`editors.editDocument`).
- **Auto-fix**: rename through the model API with a preview and confirmation. Studio Pro updates references on rename.
- Rule presets (Mendix default, plus import and export of team rules as JSON). Save team rules in the app with `app.files.putFile('.devtoolbox/naming.json')` so they go into version control with the app.
- Output that matches the Best Practice Recommender CSV columns (Category, Code, Message, Element, Document, Module).
- An App Explorer context menu: "Check naming in this module".

### 3.3 OQL and view entities
- Read the open view entity's OQL (`getActiveDocument`, `viewEntitySourceDocuments`), lint it in place and offer "Format and write back".
- Check the query against the model: unknown entities, attributes and associations, type mismatches in `CASE`/`COALESCE`, and the OQL v2 rules that need types.
- Version-aware function list: read the Studio Pro version from preferences (11.12+) and grey out functions the app's version lacks (DATEADD 11.9, DATEFORMAT 11.12 and so on).
- Context-aware warnings: Java-only functions used in a view entity.

### 3.4 XPath
- Use the entity picker (`elementSelectors.selectEntity`), then autocomplete attributes and association paths in the constraint editor.
- Check paths against the model: the association exists and its direction is right.
- "Where is this XPath used?": scan microflows and access rules for constraints with the same token use. Needs `microflows` loading; measure the cost first.

### 3.5 Domain model docs
- One click to write `docs/domain-model.md` into the app folder (`app.files.putFile`), so it goes into version control and renders in Git hosting.
- A Mermaid "compatible" mode (M6), plus PlantUML and DBML output.
- Optional: document access rules per module role (`moduleSecurity`).

## 4. Phase 2: write-back and generators (0.5, about 3–4 weeks)

- **JSON → integration in one step**: paste JSON, then create the JSON structure (`addJsonStructure`), an import mapping and an optional non-persistable entity. Names follow the conventions (`JSON_`, `IMM_`).
- **Regex → Regular Expression document**: the tester gets a "Mendix (Java)" mode (M7) and "Save as Regular Expression document".
- **Enumeration from CSV or JSON**: create or update an `ENUM_` with captions in each language of the app.
- **Constants viewer**: list `runtime.configuration.getConstants()`. Private ones show only with the `runtime-configuration-private` permission, and the toolbox reacts to `permissionsChanged`.
- **Date pattern tester**: locale-aware week rules (M8), and the app's languages from `getPreferences().language`.
- **Snippet library as a custom document**: a `customBlobDocuments` type ("Toolbox snippets") for team OQL, XPath and regex snippets kept in the model, so they travel with the app.

## 5. Phase 3: runtime and Maia (0.6+)

- **Runtime panel**: watch `runtime.controller` `connectionChanged`. When the app runs locally, offer:
  - quick links (the app, `/rest-doc/`, the OData metadata)
  - a REST tester that calls published REST services through `httpProxy.getProxyUrl` to get around CORS
  - XPath/OQL result preview, if a safe runtime query channel becomes available (today the extension API has none)
- **Maia tools** (`ai.tools.registerTool`, permission `register-ai-tools`): expose deterministic, offline functions to Maia:
  - `toolbox_lint_oql`
  - `toolbox_check_naming`
  - `toolbox_resolve_date_token`
  - `toolbox_domain_docs`

  Maia gets exact answers instead of guesses. Each call asks the user to confirm, so tool names and descriptions must be clear.
- **"Ask Maia" buttons** (`ai.chat` prefill, 11.16+) next to lint issues: "Explain this OQL v2 error", "Suggest a name".
- **Version control aware**: show the branch and last commit (`versionControl`) in reports, and limit the naming check to documents changed since a commit, which needs a diff source. Note the Recommender's "Limit to uncommitted" as a model.

## 6. Cross-cutting work

| Area | Plan |
| --- | --- |
| Compatibility | Feature-detect every API (`typeof api.x === 'function'`) and keep the 11.12 floor. Add a "Studio Pro features" page that lists what is available in the running version. Track the 11.6 menu change, the 11.12 helper removal and the beta status. |
| Content security policy | Test workers, `blob:` URLs, wasm (xmllint) and remote images inside Studio Pro on each minor release, and record the results in `docs/HOST-CONSTRAINTS.md`. |
| Testing | Fuzz tests (Phase 0); a mocked `studioPro` for `loadApp`, write-back and the event flows; a Studio Pro end-to-end test on a sample app (`--enable-extension-development`) run by hand before each release. |
| TypeScript | Move `lib/` to TS or JSDoc with `checkJs`, using the extensions-api types to catch API drift, like the `loadAll` default of 10. |
| Packaging | Keep in-house distribution (the Marketplace has no "Extension" content type yet). Ship a versioned zip from CI with release notes from `CHANGELOG.md`. Revisit when Mendix opens extension publishing. |
| Privacy | Keep the "nothing leaves your machine" promise. Any feature that goes online (proxy, Maia) is opt-in and labelled. |
| Accessibility | Keyboard pass, focus styles and ARIA live regions for status lines. |

## 7. Suggested order

1. Phase 0 entirely, since C1 is user-facing.
2. Live model cache (3.1), because everything in Phase 1 depends on it.
3. Naming check 2.0 (3.2): the most visible value for teams.
4. OQL and view entities (3.3), then XPath (3.4).
5. JSON → integration (Phase 2): deprioritized; Maia covers it (see FUTURE-WORK.md).
6. Maia tools (Phase 3), once the deterministic functions are stable.

## 8. Open questions

- Does the toolbox need to support Studio Pro versions before 11.12? That decides how much feature detection to keep.
- Should team naming rules live in the app (`.devtoolbox/`) or in each developer's profile?
- Is model write-back (renames, generated documents) acceptable for in-house use, or should the toolbox stay read-only?
- Is there interest in a Marketplace listing once Mendix supports extensions there?
