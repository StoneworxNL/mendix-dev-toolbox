# Developer Toolbox: peer review and future work

Reviewed at `620f106` (branch `phase0-stabilize`, PR #3) on 31 October 2026. The review covers all of `src/`, `build.mjs`, `dev/`, `tests/` and CI. Mendix sources are the docs, release notes and feature calendar as published that day; each item links its source. Mendix publishes no separate roadmap page (www.mendix.com/roadmap is a marketing page), so "roadmap" here means three things: the [feature release calendar](https://docs.mendix.com/releasenotes/feature-release-calendar/), the [LTS/MTS table](https://docs.mendix.com/releasenotes/studio-pro/lts-mts/) and forward-looking notes in the release notes.

This file supersedes `docs/REVIEW.md` for anything still open and adjusts `docs/ROADMAP.md` where Mendix's own plans changed the picture.

Severity: **Critical** blocks use or loses data · **High** gives wrong results or creates a compliance risk · **Medium** is a gap users will hit · **Low** is polish.
Effort: **S** up to a day · **M** a few days · **L** a week or more.

---

## Part 1: peer review

### 1.1 Were the Phase 0 fixes (`c76046d`, `620f106`) correct and complete?

| Fix | Verdict |
| --- | --- |
| XPath: unclosed `[%` loop (`mxxpath.js`) | ✅ Correct. Scanning stops with an error, and the bracket check still reports anything left open. The fuzz test fails on the old code and passes now. |
| XPath: quadratic function-name regex | ✅ Correct (`(?<![\w-])` anchor). 200,000 characters are now instant. |
| XPath: `[%MillisecondLength%]` removed, `NULL` accepted | ✅ Matches [the system variables page](https://docs.mendix.com/refguide/xpath-keywords-and-system-variables/). |
| OQL: `$Module.Constant`, `Module.Enum#Value` | ✅ Tokenizes and formats. ⚠️ The linter doesn't say these are Java-only ([11.13 notes](https://docs.mendix.com/releasenotes/studio-pro/11.13/)); see M6. |
| OQL: `LOCATE` order, `TRIM` character, "Java actions only" column | ✅ Matches the [expression syntax page](https://docs.mendix.com/refguide/oql-expression-syntax/). |
| Naming: workflows checked, count fixed | ✅ Works. The suggestion keeps prefix letters (`WF_Order_Approve` becomes `WFOrderApprove`); see L1. |
| Regex: inline fallback when workers are blocked | ⚠️ Works, but too broad; see M2. |
| Cron: 7 as Sunday in ranges | ✅ Correct for Vixie and Spring cron. Quartz numbering (1 = Sunday) is still not supported; see L5. |
| JSON: integers beyond 2^53 kept | ✅ Correct in the formatter and in Text compare. ⚠️ Other JSON tools still round them; see H2. |
| Regex: group names by number | ✅ Correct for normal patterns. `v`-flag nested classes aren't handled; see L6. |
| Release build: no maps or `.LEGAL.txt`, one licence file | ⚠️ The size win is real (13.0 MB down to 5.1 MB), but the licence file is incomplete; see H1. |
| Tests: fuzz and hostile-input smoke | ✅ Useful. The fuzz seed is fixed and the smoke test types into the first field only; see L7. |

### 1.2 Findings

#### High

**H1. `THIRD_PARTY_LICENSES.txt` misses bundled packages** (`build.mjs:48-60`). Introduced by `620f106`.
- The licence file lists only the direct `dependencies` in `package.json`.
- The bundle also contains `nearley`, which `sql-formatter` uses (checked with an esbuild metafile).
- `legalComments: 'none'` now removes the `@license` comments that used to travel with the code.
- The result is a release with MIT code whose licence text isn't included.
- Fix: build with `metafile: true`, collect each `node_modules/<pkg>` that appears in `metafile.inputs`, and write their licences. Add a test that fails when a bundled package has no entry. **S**

**H2. Mendix object IDs are still rounded in four JSON tools.** The lossless parser (`lib/json.js`) is only used by the JSON formatter and Text compare. These tools still call `JSON.parse`:
- JSON ↔ YAML (`converters.js:28`)
- JSON ↔ Table/CSV (`table.js:13`)
- JSONPath tester (`testers.js:21`)
- JWT sign (`encoders.js:138`)

A Mendix REST export with 64-bit IDs comes out of JSON → CSV with different IDs and no warning.
- Fix: use `parseJson` everywhere.
- For YAML, emit raw numbers through a custom js-yaml type.
- For JSONPath, compare raw numbers as strings, or warn with `unsafeIntegers`.
- **S–M**

#### Medium

**M1. JWT "Signature verified" can be wrong when the algorithm doesn't match the key** (`lib/jwt.js:51`). This is the classic "alg confusion" case. A token with `alg: HS256` and a public key pasted into the key box is checked as HMAC, with the PEM text used as the secret. A forged token signed that way shows "Signature verified".
- Fix: when `alg` is `HS*` and the key text contains `-----BEGIN`, refuse and explain.
- Show the key type the algorithm expects next to the key box. **S**

**M2. The Regex worker fallback can turn off the time limit for good** (`text.js:189`).
- Any error before a worker's first answer sets `workersBlocked`. That includes a runtime error in the first job, such as a stack overflow on huge input, not just a worker that can't start.
- From then on every pattern runs on the UI thread, without the 1.5 s limit.
- Fix: have the worker post `'ready'` when it starts. Treat only a failure before `'ready'` as "blocked", and keep reporting job errors as errors. **S**

**M3. Downloads may not work inside Studio Pro.** These features save files with `<a download>` (`ui.js:144`):
- QR code
- Image converter
- Colour blindness simulator
- Domain model docs
- JSON → CSV
- Base64 image

Nothing in the Web Extensibility docs says the extension WebView handles downloads.
- Test it in Studio Pro 11.12 and 11.16.
- Offer "Save to app folder" through `studioPro.app.files.putFile` (in the 11.12 typings; [local app files API](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/local-app-files-api/)) as a fallback, or as the default for text outputs. **S–M**

**M4. The model is reloaded on every tool open** (`mendix.js:79`, still open from REVIEW M3). Large apps pay the full `loadUnits` cost each time.
- `studioPro.app.projectChanges` provides `documentsChanged` and `elementsRenamed` (both 11.12) and `documentAdded`.
- The [consistency checks page](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/consistency-checks/) shows this exact pattern. **M**

**M5. Installing requires extension development mode.** The README tells every developer to enable "Extension Development" or start Studio Pro with `--enable-extension-development`. Studio Pro 11.12+ module packages can carry extensions:
- the package manifest records whether a module "contains extensions or AI skills" ([11.12.5 and 11.14 notes](https://docs.mendix.com/releasenotes/studio-pro/11.14/))
- extension settings appear on add-on modules (11.12.1 and 11.13 fixes)

Shipping the toolbox as an add-on module through the company's private Marketplace would remove the dev-mode step and give versioned updates. This needs a spike to confirm the packaging steps. **M**

**M6. The OQL linter doesn't flag Java-only features.** These parse but fail in view entities and data sets ([OQL page](https://docs.mendix.com/refguide/oql/), [11.13](https://docs.mendix.com/releasenotes/studio-pro/11.13/), [11.15](https://docs.mendix.com/releasenotes/studio-pro/11.15/)):
- constants and enumeration literals
- `DATEADD`, `DATETRUNC`, `DATEPARSE`, `LOCATE` and `SUBSTRING`
- parenthesized `UNION` subqueries

Add a "Target: view entity / data set / Java" selector and lint for it. **S**

**M7. Still open from REVIEW.md:**
- Mermaid alias syntax needs Mermaid 10.5+ (REVIEW M6)
- US-only week numbers in the date pattern tester (M8)
- Java regex flavour (M7)
- pane and tab don't sync (M9)
- state isn't kept per project (M10)
- no tests for `loadApp` with a mocked API (M13)

Each is planned in Part 2.

#### Low

- **L1.** The workflow naming suggestion keeps prefix letters (`naming.js:71`). Strip a leading `XX_` prefix before making it PascalCase.
- **L2.** `loadImage` leaks its object URL when `img.decode()` fails (`graphics.js:46`). "Download all" encodes every image a second time and starts many downloads at once.
- **L3.** `uuidV7` isn't monotonic within one millisecond (`generators.js:21`), so a batch of generated v7 UUIDs may not sort in order. Use the RFC 9562 counter method.
- **L4.** `htmlDecode` knows about 45 named entities (`encoding.js:68`), so `&eacute;` stays as it is. Decode through `DOMParser`, which is offline and safe for text.
- **L5.** Cron says "Quartz/Spring" but uses Spring numbering (0 or 7 = Sunday). Quartz uses 1 = Sunday and an optional year field. Add a dialect selector, or drop "Quartz" from the help text.
- **L6.** `captureNames` (`regex.js:7`) treats the first `]` as the end of a class, so `v`-flag nested classes such as `[[a-z]--[aeiou]]` give wrong group numbers.
- **L7.** The fuzz test always uses seed 42 and the same 14 building blocks (`fuzz.test.mjs:12,28`). Rotate the seed per CI run and print it. The hostile-input smoke test fills only the first visible field (`smoke.mjs:98`).
- **L8.** `smoke.mjs:98` contains a literal U+202E (right-to-left override) instead of the `‮` escape. GitHub flags bidi control characters in source. Write it as an escape.
- **L9.** The Date tool reads a 16-digit microsecond timestamp as milliseconds (`converters.js:122`), giving a year around 50,000. Detect 16 digits as microseconds.
- **L10.** Only inputs have explicit focus styles (`styles.css:106`). Add `:focus-visible` for buttons, tiles, nav links and the drop zone, and a `forced-colors` pass.

### 1.3 What is good

- Phase 0 removed the only real crash. The new fuzz and hostile-input tests guard the hand-written parsers, which is where the bugs were.
- The pure `lib/` modules plus thin `tools/` layout keeps fixes small and testable: 35 unit tests, 3 fuzz tests, and a smoke test over 36 tools.
- The release bundle is 60% smaller.
- The build already lists `@mendix/model-access-registry` as external, which Studio Pro [11.13 made mandatory](https://docs.mendix.com/releasenotes/studio-pro/11.13/) for web extensions.
- The privacy story holds: nothing leaves the machine unless the user turns on remote images.

---

## Part 2: what Mendix is shipping and planning

### 2.1 Version timeline ([LTS/MTS](https://docs.mendix.com/releasenotes/studio-pro/lts-mts/))

| Version | Type | Date | What it means for the toolbox |
| --- | --- | --- | --- |
| 11.12 | LTS | June 2026 (11.12.6: 8 October) | **Baseline.** Has the Maia tool API since 11.12.5, the extension-in-module packaging, and `documentsChanged`. |
| 11.16 | monthly | 28 October 2026 | Maia chat prefill and user-authentication APIs. Known issue: client-certificate calls fail ([11.16 notes](https://docs.mendix.com/releasenotes/studio-pro/11.16/)). |
| 11.18 | LTS (planned) | December 2026 | Next test target. |
| 11.24 | LTS (planned) | June 2027 | Long-term support target. |
| 12.0 | major (planned) | June 2027 | Removes Java 21, the Dojo client and some Java APIs ([11.14](https://docs.mendix.com/releasenotes/studio-pro/11.14/), [11.16 blog](https://www.mendix.com/blog/mendix-release-11-16/)). Nothing announced for the extension API yet. |

**Plan:** support 11.12.5+ and feature-detect anything newer. Run the smoke test against 11.12.6, the latest 11.x and each new LTS. The Web Extensibility API is still labelled beta ([API page](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/)), and it has had breaking changes in 11.2, 11.6 and 11.12. Treat every minor version as possibly breaking.

### 2.2 Where Mendix's own features overlap

| Mendix feature | Status | Effect on the toolbox |
| --- | --- | --- |
| **Maia Make: OQL and view entities** ([Maia Make](https://docs.mendix.com/refguide/maia-make/), 11.9; [Maia for OQL](https://docs.mendix.com/refguide/maia-for-oql/)) | Shipped. Online, signed in, view entities only, no custom-named or cross-module associations. | **Don't build natural-language → OQL.** Keep the offline formatter, linter and model-aware builder; they cover the cases Maia doesn't. |
| **Maia: XPath error feedback** ([11.15](https://docs.mendix.com/releasenotes/studio-pro/11.15/)) | Shipped (Maia only) | Keep the token evaluator and the date filter builder; Maia doesn't show what a date token resolves to. |
| **Studio Pro OQL INSERT/UPDATE validation** ([11.15](https://docs.mendix.com/releasenotes/studio-pro/11.15/)) | Shipped | Don't duplicate this in the linter. |
| **Maia Make: JSON structures (11.13), import and export mappings (11.16)** | Shipped | **Deprioritize** ROADMAP Phase 2's "JSON → integration in one step". Maia does it inside Studio Pro. |
| **Maia: generate test data** ([calendar](https://docs.mendix.com/releasenotes/feature-release-calendar/)) | Private beta, 2026 | Don't build a test-data generator. |
| **JSON Transformations** (calendar) | Public beta, H2 2026 | Watch it. The JSONPath tester stays useful for REST payloads, but don't grow it into a transformation editor. |
| **Visual revision comparison** (calendar) | Public beta, H2 2026 | No overlap with text diff. |
| **Best Practice Recommender** ([page](https://docs.mendix.com/refguide/best-practice-recommender/); security rules in 11.15) | Shipped | It still has no naming rules. **The naming check stays a differentiator.** Match its CSV columns so teams can merge both reports. |
| **Module-to-module dependency specification** (calendar) | GA, Q1 2027 | Opportunity: later, a module dependency view built on that metadata. |

### 2.3 New extension points to use

| API or feature | Since | Use |
| --- | --- | --- |
| `studioPro.ai.tools.registerTool` ([Tools API](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/tools-api/)) | 11.12.5 / 11.15 | Offer the toolbox's deterministic checks to Maia (3.1) |
| `studioPro.ai.chat` prefill ([web API notes](https://docs.mendix.com/releasenotes/studio-pro/web-extensibility-api/)) | 11.16 | "Ask Maia to fix" buttons (3.2) |
| `projectChanges` events | 11.12 | Live model cache (M4) |
| `app.projectManager` `projectOpened` / `projectClosing` / `getProjectMetadata` | 11.15 | Per-project state |
| Custom blob documents and [consistency checks](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/consistency-checks/) | 11.4 / 11.15 | Naming issues in the Errors pane (3.3) |
| `ui.elementSelectors` (module preselect from 11.12.3) | 11.5 | Native entity and module pickers |
| [Agent instructions (AGENTS.md)](https://docs.mendix.com/refguide/maia-agent-instructions/) | 11.12 | Teach Maia the team's naming rules (3.4) |
| [Studio Pro MCP server](https://docs.mendix.com/refguide/studio-pro-mcp-server/) | 11.10 | Not documented whether registered tools are exposed. If they are, toolbox checks reach external agents too; verify. |

Not possible today (documented limits, so don't plan around them):
- Extensions cannot add consistency errors to standard microflows, pages or entities. The API covers custom blob documents only.
- Agent skills cannot ship in add-on or solution modules ([skills page](https://docs.mendix.com/refguide/maia-agent-skills/)).
- There is no theme-change event.

---

## Part 3: future work

### Phase A: finish hardening (0.3.2) · about 2 days

| # | Item | Effort | Why |
| --- | --- | --- | --- |
| A1 | Complete licence file from the esbuild metafile (H1) | S | Compliance for every release |
| A2 | Lossless JSON in YAML, CSV, JSONPath and JWT (H2) | S–M | Mendix IDs must not change |
| A3 | Reject a PEM key used as an HMAC secret in JWT (M1) | S | Prevents a wrong "verified" |
| A4 | Worker `'ready'` handshake for the Regex tester (M2) | S | Keeps the time limit |
| A5 | Test downloads in Studio Pro; add "Save to app folder" (M3) | S–M | Several tools depend on downloads |
| A6 | Low items L1–L10 | S each | Polish; L8 before the next PR |

### Phase B: Mendix-native foundation (0.4) · about 2–3 weeks

| # | Item | Effort | Why / source |
| --- | --- | --- | --- |
| B1 | **Live model cache** on `projectChanges`, scoped by `getProjectMetadata` | M | M4; [consistency checks pattern](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/consistency-checks/) |
| B2 | **Version gate**: read the Studio Pro version from preferences (11.12+), feature-detect each API, and show a "features available here" page | S | The beta API breaks between minor versions ([web API notes](https://docs.mendix.com/releasenotes/studio-pro/web-extensibility-api/)) |
| B3 | **Distribution as an add-on module** on the private Marketplace. Spike the packaging, then automate with the Marketplace Publish API (June and August 2026 updates) | M | Removes dev mode (M5); [Marketplace notes 2026](https://docs.mendix.com/releasenotes/marketplace/2026/) |
| B4 | **Security hygiene for publishing**: `npm audit` in CI, Dependabot. The Marketplace now scans components weekly and deprecates any that are still vulnerable after 30 days | S | [Marketplace notes, September 2026](https://docs.mendix.com/releasenotes/marketplace/2026/) |
| B5 | OQL target selector and Java-only lint (M6); 11.15 parenthesized `UNION` | S | [OQL](https://docs.mendix.com/refguide/oql/), [11.15](https://docs.mendix.com/releasenotes/studio-pro/11.15/) |
| B6 | Mocked-API tests for `loadApp`, the event cache and version gates | M | REVIEW M13 |

### Phase C: Maia integration (0.5) · about 2–3 weeks

The roadmap-driven core: Mendix is moving Studio Pro towards Maia-driven, agent-style development ([11.16 blog](https://www.mendix.com/blog/mendix-release-11-16/), Maia Plan Mode). The toolbox's value is that it is **deterministic, offline and grounded in the model**: Maia can call it instead of guessing.

| # | Item | Effort | Why / source |
| --- | --- | --- | --- |
| C1 | **Register Maia tools**: `toolbox_check_naming`, `toolbox_lint_oql`, `toolbox_format_oql`, `toolbox_resolve_xpath_date`, `toolbox_domain_docs`. Each has a clear JSON input schema. Needs the `register-ai-tools` permission and handles `permissionsChanged`. | M | [Tools API](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/tools-api/); available on the 11.12 LTS from 11.12.5 |
| C2 | **"Ask Maia" buttons** next to lint and naming issues, prefilled with the issue, document and convention. Never auto-sent. 11.16+ only, behind the version gate. | S | `studioPro.ai.chat` ([web API notes](https://docs.mendix.com/releasenotes/studio-pro/web-extensibility-api/)) |
| C3 | **Naming rules → AGENTS.md**: write the team's naming rules as a section of `skillssource/AGENTS.md` (or per module) with `app.files.putFile`, after showing a preview. Maia then names new documents correctly. | S–M | [Agent instructions](https://docs.mendix.com/refguide/maia-agent-instructions/) (11.12). Extensions can't ship skills, but they can write project files. |
| C4 | **Check what Maia changed**: rerun the naming check on the documents in each `documentsChanged` event. The 11.12 typings' `ChangeSource` (unspecified, undo/redo, web model) can't tell Maia's edits apart yet, so check every changed document and watch for a Maia source in later API versions. | M | The Changes pane shows Maia edits ([11.16](https://docs.mendix.com/releasenotes/studio-pro/11.16/)) |
| C5 | Spike: are registered tools exposed through the Studio Pro MCP server? If yes, document how to use the toolbox from Claude Code and other external agents. | S | [MCP server](https://docs.mendix.com/refguide/studio-pro-mcp-server/) |

### Phase D: naming and documentation in Studio Pro (0.6) · about 3 weeks

| # | Item | Effort | Why / source |
| --- | --- | --- | --- |
| D1 | **Naming rules as a custom document** ("Toolbox naming rules", custom blob document). Its consistency check reports violations in the **Errors pane**, with `dependentElementIds` so they recheck on change. Team rules live in the app and in version control. | L | The only documented way to reach the Errors pane ([custom blob](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/custom-blob-document-api/), [consistency checks](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/consistency-checks/)) |
| D2 | Naming check 2.0: all document kinds in the 11.12 API, cross-checks (scheduled events, REST services, CAL_), click to open (`editDocument`), rename with preview, App Explorer context menu | L | ROADMAP 3.2; [naming conventions](https://docs.mendix.com/refguide/naming-convention-best-practices/) |
| D3 | Domain docs written into the app folder (`docs/domain-model.md`), a Mermaid compatible mode, PlantUML and DBML | M | ROADMAP 3.5; REVIEW M6 |
| D4 | Module dependency view (from model references now; from Mendix's dependency specification once it ships) | M | [Feature calendar](https://docs.mendix.com/releasenotes/feature-release-calendar/), Q1 2027 |

### Phase E: keep the generic tools sharp (ongoing)

| # | Item | Effort | Why |
| --- | --- | --- | --- |
| E1 | Regex tester "Mendix (Java)" mode: full-string match, Java-only syntax warnings, "Save as Regular Expression document" | M | [Regular expressions](https://docs.mendix.com/refguide/regular-expressions/) use `java.util.regex` |
| E2 | Locale-aware week numbers in the date pattern tester, using the app's languages | S | REVIEW M8 |
| E3 | Pane and tab sync through `messagePassing`; per-project storage | S–M | REVIEW M9, M10 |
| E4 | Accessibility pass (L10) and a keyboard-only smoke test | S | |

### What to stop or not start

- Natural-language → OQL or XPath generation: Maia does it.
- JSON → JSON structure and import mapping generation: Maia does it since 11.13 and 11.16. Keep only a "check the generated names" step (C4).
- A test-data generator: Maia has one in private beta.
- Any C# extension work: the C# API is in maintenance only ([C# API page](https://docs.mendix.com/apidocs-mxsdk/apidocs/csharp-extensibility-api-11/)). Delete the leftover C# folders.

### Suggested order

1. A1–A4 and L8 (a few days), then merge PR #3.
2. B1, B2, B3: the foundation, and the end of dev-mode installs.
3. C1, C2, C3: the biggest return for the least work, and in line with where Mendix is heading.
4. D1, D2: naming issues in the Errors pane.
5. The rest by demand.

### Open questions

- Is the Web Extensibility API GA in any 11.x LTS? The docs still say beta.
- Can an add-on module that contains an extension be installed without extension development mode? To check in B3.
- Are tools registered with `registerTool` visible to MCP clients? To check in C5.
- Will Mendix 12 (June 2027) keep the 11.x extension API? Nothing is announced yet; it will be announced at least a year ahead according to the [LTS page](https://docs.mendix.com/releasenotes/studio-pro/lts-mts/).
