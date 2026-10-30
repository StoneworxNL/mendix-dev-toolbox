# Developer Toolbox for Mendix Studio Pro

A Studio Pro web extension with 36 developer utilities: Mendix-specific helpers plus the DevToys set, available as a tab or a docked pane. Everything runs locally inside Studio Pro: pasted tokens, certificates and data are never sent anywhere (the Markdown preview loads remote images only when you switch that on). Text typed into the encoders, the JWT tool and the hash tool is not saved between sessions.

| Category | Tools |
| --- | --- |
| Mendix | OQL helper (format, OQL v2 checks, query builder from your domain model, function reference) · XPath constraint helper (syntax check, live values of date tokens, relative date filters) · Date pattern tester (formatDateTime/parseDateTime, local and UTC) · Domain model docs (Markdown and Mermaid ER diagrams) · Naming convention check (Mendix best practices, editable rules) |
| Converters | JSON ↔ YAML · JSON ↔ table (CSV, TSV, Markdown) · Number base (BigInt, two's complement) · Date & timestamp (Unix, ISO 8601, .NET ticks, Excel, time zones, Mendix expression) · Cron parser (plain-English meaning and next runs) |
| Encoders & decoders | Base64 text (UTF-8, URL-safe) · Base64 image / data URI · URL encode & parse · HTML entities · JWT (decode, verify HS/RS/PS/ES, sign HS) · GZip / Deflate · QR code (SVG/PNG) · X.509 certificate decoder |
| Formatters | JSON (indent, minify, sort keys, error line/column) · SQL (14 dialects) · XML (pretty-print, minify, well-formedness) |
| Generators | Hash & checksum (MD5, SHA-1/256/384/512, HMAC, files, SRI, compare) · UUID v1/v4/v7 (bulk, inspect) · Lorem ipsum · Passwords (entropy estimate) |
| Text | Escape/unescape (JSON, C#, regex, SQL, XML, CSV, Mendix) · Analyzer & case conversion (incl. Mendix_Name) and line tools · Text compare (side-by-side, inline, word highlights, unified patch) · Markdown preview · Regex tester (groups, replace) |
| Testers | JSONPath · XPath · XML/XSD validation (libxml2 compiled to WebAssembly) |
| Graphics | Color picker & WCAG contrast · Color blindness simulator · Image converter (PNG/JPEG/WebP, resize, compress, batch) |

The Mendix tools read the open app through the Studio Pro model API (read-only). On the standalone dev page they use a small sample app.

Favorites and last inputs are remembered per tool. The theme follows Studio Pro's light/dark setting unless you pick one. `Ctrl+K` or `/` jumps to the search box.

## Install

Built on the [Web Extensibility API](https://docs.mendix.com/apidocs-mxsdk/apidocs/web-extensibility-api-11/) for Studio Pro 11.12 and later. Needs Node.js 22.

1. Build and copy the extension into your app:
   ```powershell
   npm ci
   npm run build -- --app "C:\Users\me\Mendix\MyApp"
   ```
   This writes `dist/devtoolbox` and copies it to `MyApp\extensions\devtoolbox\`. The folder name must stay `devtoolbox`, because the extension opens its UI as `extension/devtoolbox`.
2. Turn on extension development, which unpublished extensions need: either enable **Extension Development** in Studio Pro's preferences, or start Studio Pro with the flags:
   ```powershell
   & "C:\Program Files\Mendix\11.12.6\modeler\studiopro.exe" "C:\Users\me\Mendix\MyApp\MyApp.mpr" --enable-extension-development --enable-web-extensions
   ```
3. Choose **Extensions → Developer Toolbox → Open in a tab** (or **Open as a docked pane**).

### Distribution

For now the toolbox is used in-house: each developer builds it (or takes the `devtoolbox` artifact from a CI run) and copies it into an app's `extensions` folder, with extension development turned on as above. It is not published on the Mendix Marketplace. The `@mendix/extensions-api` version is pinned exactly, because the API still changes between Studio Pro releases; check the model access calls in `src/toolbox/tools/mendix.js` when you upgrade it.

## Develop

```bash
npm run serve        # the toolbox in a browser at http://localhost:5299/ (rebuilds on change)
npm run watch        # rebuild the extension on change; add -- --app <app folder> to redeploy into an app
npm test             # tool logic: encoders, cron, JWT, X.509, colors, …
npm run test:ui      # opens every tool in headless Chromium; needs Playwright and `npm run serve`
```

In the browser, `?tool=<id>` opens a tool directly and `?theme=dark` pretends Studio Pro is in dark mode.

### Layout

```
src/manifest.json     entry points: main (menu), tab and pane (UI)
src/main/index.js     registers the Extensions menu, the tab and the docked pane
src/ui/               tab and pane entry points; inject styles, read Studio Pro's theme, mount the toolbox
src/toolbox/          the toolbox itself: app shell, UI helpers, tools/ and testable lib/
dev/                  standalone page for working on the toolbox in a browser
build.mjs             esbuild build; copies the manifest and libxml2 (xmllint-wasm) next to the bundle
tests/                node unit tests and the browser smoke test
```

### Adding a tool

Add an object to one of the arrays in `src/toolbox/tools/*.js`:

```js
{
  id: 'my-tool', name: 'My tool', category: 'Text', icon: 'text',
  description: 'One line shown on the home page.',
  keywords: 'extra search words',
  render(root, ctx) {   // ctx.studioPro: the Studio Pro API, or null on the standalone page
    const src = textArea({ label: 'Input', persist: 'input' });   // persist = remembered between sessions
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, stat.root, split(src.root, out.root));
    return live(root, () => { out.value = src.value.toUpperCase(); }, stat);  // reruns on every change; errors show in stat
  },
}
```

Keep logic that can be tested without a browser in `src/toolbox/lib/` and cover it in `tests/web`.
