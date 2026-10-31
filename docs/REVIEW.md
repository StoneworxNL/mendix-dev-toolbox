# Developer Toolbox: code review (0.3.0, c300fbe)

Scope: every file under `src/`, `build.mjs`, `dev/`, `tests/`, CI, and the `@mendix/extensions-api` 0.11.6-mendix.11.12.6 type definitions. I checked the code against the Mendix docs as of 31 October 2026 (links at the end). Severity:

- **Critical** blocks use or loses data.
- **High** gives wrong results to users.
- **Medium** is a gap or a doc mismatch.
- **Low** is polish.

## Summary

The codebase is small (about 4,200 lines of JS), readable and consistent. It has no framework, a tiny DOM helper and pure libraries with tests. After the 0.3.0 fixes the security posture is good. The main problems:

1. **The XPath helper hangs on an unclosed token.** It saves the text, so it hangs again every time the tool opens (Critical, reproduced).
2. **The OQL linter rejects two documented OQL features:** constants (`$Module.Constant`) and enumeration values (`Module.Enum#Value`).
3. **Some reference data does not match the docs:** `[%MillisecondLength%]` is not a documented token, the `LOCATE` argument order, and the "Java actions only" functions.
4. **The extension uses only a small part of the Studio Pro 11.12 API.** App Explorer context menus, `editDocument`, `documentsChanged`, the element selector, the file API and Maia tools would turn it from a set of utilities into an integrated assistant.

## Critical

### C1. Infinite loop in `lintConstraint` on an unclosed `[%`
`src/toolbox/lib/mxxpath.js:157-162` (the `[` + `%` branch):

```js
const end = text.indexOf('%]', i);   // -1 when the token is not closed
...
i = end + 1;                         // i = 0, so the scan starts again from the beginning
```

With input `[OrderDate > [%BeginOfCurrentDay]` the scan returns to the same `[%` forever. I reproduced it in Node: the call never returns (killed by `timeout 10`).

Why it is critical:
- `live()` runs the check on every keystroke on the UI thread, so the pane or tab freezes.
- The text is saved (`persist: 'input'`) before the debounced check runs. Opening the XPath tool again replays the same text and freezes again. The only way out is clearing the WebView storage.

Fix: `if (end < 0) { add('error', 'Unterminated [% token', i); break; }`. Add a regression test with a time limit. Also consider running all linters with a guard, such as an iteration cap or the same worker plus timeout pattern the Regex tester uses.

## High

### H1. OQL tokenizer rejects constants and enumeration literals
`src/toolbox/lib/oql.js` `tokenize()`:
- `$Sales.MinOrder` stops at the dot and throws `Unexpected character "."`.
- `RealEstate.PropertyTypes#Apartment` throws `Unexpected character "#"`.

Both are documented in the OQL expression syntax (since 11.13, Java actions). Fix: let `param` take dotted names, and accept `#` inside a word token followed by an identifier.

### H2. `[%MillisecondLength%]` is shown as a valid token
`PERIODS` in `mxxpath.js` includes `MillisecondLength`. The docs list Second, Minute, Hour, Day, Week, Month and Year only. The Tokens table shows it, the linter accepts it and `evaluateDateExpression` computes with it. The relative date builder already hides it, which suggests it was known to be invalid. Remove it from the public list, or warn when it is used.

### H3. OQL function reference: argument order and availability
`FUNCTIONS` in `oql.js`:
- `LOCATE` is documented as `LOCATE(expression, substring [, offset])`. The tool shows `LOCATE(substring, string [, start])`. Please check this against the live page, because my source for this signature was a summary of it.
- `DATEADD`, `DATETRUNC`, `DATEPARSE`, `SUBSTRING` and `LOCATE` are **Java actions only**, and the table does not say so. Users building view entities will copy functions that fail there. Add a "Where" column (view entity, data set, Java) and lint for them when the query looks like a view entity.
- `LTRIM`, `RTRIM` and `TRIM` take an optional character: `TRIM(expression [, character])`.
- `DATEFORMAT` and `DATEPARSE` do not accept the letters `u`, `F`, `G`, `k` and `K`. The linter could check the pattern literal.
- The tokenizer comment says block comments nest "since Mendix 11.15". The docs say comments arrived in 11.7.0 with nesting.

### H4. Day, week, month and year periods: calendar or fixed length?
The XPath page defines `[%DayLength%]` as "the length of one day (24 hour)". `addPeriod` treats days and weeks as calendar steps, which matter across a DST change. Either can be right, but the tool presents its answer as fact. Verify against a running app, for example a microflow that logs `'[%BeginOfCurrentDay%] + 1 * [%DayLength%]'` on the day before the DST change. Then adjust the code or add a note saying which rule it follows.

## Medium

### Mendix tools
- **M1. Workflows are listed but never checked.** `DOCUMENT_APIS` loads `workflows`, but `naming.js` `KINDS` has no `workflow`. Those names are skipped silently and still counted in "Checked N names". The convention for workflows is noun plus verb, such as `EmployeeOnboarding`.
- **M2. The naming check misses document kinds the 11.12 API exposes:**
  - `scheduledEvents`: the event should share the name of its `SCE_` microflow, which is a useful cross-check.
  - `rules`
  - `constants`
  - `javaActions` and `javaScriptActions`
  - `consumedRestServices` and `publishedRestServices`, which should match the `CRS_`/`PRS_` microflows
  - `regularExpressions`
  - `dataSets`
  - `menuDocuments`
  - `buildingBlocks` and `pageTemplates`
- **M3. The model is read again in full on every tool open**, from `sourceBar`'s `reload(true)`. The API has `projectChanges` events (`documentsChanged`, `elementsRenamed`, `documentAdded`). Use them to invalidate the cache, so large apps load once and stay current.
- **M4. `loadAll` loads only 10 units by default** (`maxUnitsToLoad?`, "Defaults to 10 units" in the typings). The fallback passes `ids.length`, which is correct. Any new call site must do the same, so a comment or wrapper would help.
- **M5. NULL hint is misleading.** The XPath linter tells users to replace `NULL` with `empty`, but the docs list `NULL` and `empty` as equivalent keywords. Downgrade it to style, or drop it.
- **M6. Mermaid alias syntax needs a recent renderer.** `Entity["Module.Entity"]` needs Mermaid 10.5 or later. The status text promises rendering "on GitHub, Azure DevOps, Confluence", but some of those ship older Mermaid. Offer a "compatible" mode that uses `Module_Entity` without aliases.
- **M7. The Regex tester is JavaScript-flavored, but Mendix uses Java regex** (`java.util.regex.Pattern`) in validation rules, Regular Expression documents and `isMatch()`. Validation matches the whole string. Add a "Mendix (Java)" mode that anchors the pattern, warns about JS-only syntax and flags Java-only constructs (possessive quantifiers, `\p{Alpha}`, `\A`, `\Z`).
- **M8. The date pattern tester uses US week rules only.** Mendix formats with the user's locale, so `w` in the Netherlands is an ISO week. Add a locale choice using `Intl.Locale.weekInfo` or a fixed ISO option.

### Platform integration
- **M9. Pane and tab are two separate toolbox instances** with shared `localStorage` and no sync. Use `ui.messagePassing` (11.3+) to keep favorites, theme and last tool in sync, or simply re-read storage on `focus`.
- **M10. State is global, not per app.** Everything lives in the Studio Pro WebView profile under `dtb:`, so inputs from one customer's app appear when another app is open. Scope keys by project using `app.projectManager.getProjectMetadata()` (11.15+) or a hash of the module list, or store per-app settings with `app.files.putFile()` (for example `.devtoolbox/settings.json`).
- **M11. The Regex worker fallback misses async failures.** The `try/catch` around `new Worker(blobUrl)` only catches synchronous errors. If Studio Pro's content security policy blocks `blob:` workers, the failure arrives through `onerror`, the tool reports an error and never falls back to inline matching. Fall back on the first `onerror` that arrives before any message.
- **M12. Cancelled regex runs leave promises that never settle.** `pending.cancel()` terminates the worker but never rejects the earlier promise. The cost is small, but rejecting with an `AbortError` that `live()` ignores would be cleaner.

### Engineering
- **M13. No tests for the Mendix UI paths.** `loadApp` with a mocked `studioPro.app.model` is untested: `loadUnits` vs `loadAll`, the `unavailable` handling and Marketplace filtering. There are also no fuzz or property tests for the hand-written tokenizers, the place where C1 and H1 came from. A small fuzz run over `lintConstraint`, `lintOql`, `formatOql` and `parsePattern`, with random strings and a time limit, would have found C1.
- **M14. The smoke test checks happy paths only.** Add an "evil input" pass per tool: an unclosed quote, `[%`, 1 MB of text, emoji and a NUL character.
- **M15. Untracked C# leftovers** (`src/DevToolbox/`, `tests/DevToolbox.Tests/`, `tools/`) sit in the working tree since `.gitignore` stopped ignoring them. Delete them so nobody commits the DLLs by accident.

## Low

- `app.js` `renderNav`: `!groups.length || (q && groups.length === 0)`. The second half is redundant.
- `naming` reruns the whole check on every keystroke in the rules editor, with no debounce. Use `debounce` from `ui.js`.
- `domainDocs`: the module selection resets to all modules on each reload. Save the selection like the other options.
- `formatters.js` JSON "Escape non-ASCII" escapes surrogate pairs one code unit at a time. The result is valid JSON but hard to read. Use the `u` flag and `codePointAt`.
- `copyText` falls back to `document.execCommand('copy')`, which is deprecated. It's fine as a fallback, but log it.
- `build.mjs` imports `node:fs` dynamically inside the plugin although `existsSync` is already imported statically. Import `readdirSync` at the top.
- `manifest.json` has no `name` or `version`, and the README should say where permissions live. The docs contradict each other (`manifest.json` `mendixComponent.permissions` vs `package.json` `mendix.permissions`), so check against the generator output and say which one the toolbox uses.
- `isSingleton` on `tabs.open` exists in the 11.12 typings but is undocumented, so track it in case it changes.
- Accessibility: the tool tiles are `<a href="#">` (fine), but the custom drop zone, the favorite star and the theme cycle button need visible focus styles. Check `styles.css` with keyboard-only navigation.

## What is good

- Clear module boundaries: pure `lib/` modules with tests, thin `tools/`, one DOM helper.
- The 0.3.0 security fixes are sound: sensitive tools keep only their options, DOMPurify runs with a remote image gate, the regex runs in a worker with a time limit and object URLs are revoked.
- The UTC token rewrite is correct and tested across DST in `Europe/Amsterdam`.
- Model access is read-only and gated (Marketplace modules are opt-in), with a graceful fallback from `loadUnits` to `loadAll`.
- CI builds, tests and runs a real browser smoke test, and the build artifact is uploaded.

## Sources

- Web Extensibility API (11): https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/
  - release notes: https://docs.mendix.com/releasenotes/studio-pro/web-extensibility-api/
  - tab-api, dockable-pane-api, menu-api, model-api, preference-api, dialog-api, editor-api, message-passing-api, element-selector-api, local-app-files-api, runtime-configuration-api, runtime-controller-api, tools-api, version-control-api, custom-blob-document-api, migration-guide, extension-permissions
- XPath: https://docs.mendix.com/refguide/xpath-keywords-and-system-variables/, /xpath-operators/, /xpath-constraint-functions/
- OQL: https://docs.mendix.com/refguide/oql/, /oql-clauses/, /oql-v2/, /oql-expression-syntax/, /oql-statements/
- Naming: https://docs.mendix.com/refguide/naming-convention-best-practices/
- Regex: https://docs.mendix.com/refguide/regular-expressions/
- Best Practice Recommender: https://docs.mendix.com/refguide/best-practice-recommender/
- Maia for OQL: https://docs.mendix.com/refguide/maia-for-oql/
- Type definitions: `node_modules/@mendix/extensions-api/dist/index.d.ts` (0.11.6-mendix.11.12.6)
