# Developer Toolbox for Mendix Studio Pro

A Studio Pro extension with 31 DevToys-style developer utilities, available as a tab or a dockable pane. Everything runs locally inside Studio Pro, so pasted tokens, certificates and data never leave your machine.

| Category | Tools |
| --- | --- |
| Converters | JSON ↔ YAML · JSON ↔ table (CSV, TSV, Markdown) · Number base (BigInt, two's complement) · Date & timestamp (Unix, ISO 8601, .NET ticks, Excel, time zones, Mendix expression) · Cron parser (plain-English meaning and next runs) |
| Encoders & decoders | Base64 text (UTF-8, URL-safe) · Base64 image / data URI · URL encode & parse · HTML entities · JWT (decode, verify HS/RS/PS/ES, sign HS) · GZip / Deflate · QR code (SVG/PNG) · X.509 certificate decoder |
| Formatters | JSON (indent, minify, sort keys, error line/column) · SQL (14 dialects) · XML (pretty-print, minify, well-formedness) |
| Generators | Hash & checksum (MD5, SHA-1/256/384/512, HMAC, files, SRI, compare) · UUID v1/v4/v7 (bulk, inspect) · Lorem ipsum · Passwords (entropy estimate) |
| Text | Escape/unescape (JSON, C#, regex, SQL, XML, CSV, Mendix) · Analyzer & case conversion (incl. Mendix_Name) and line tools · Text compare (side-by-side, inline, word highlights, unified patch) · Markdown preview · Regex tester (groups, replace) |
| Testers | JSONPath · XPath · XML/XSD validation (runs in .NET inside Studio Pro) |
| Graphics | Color picker & WCAG contrast · Color blindness simulator · Image converter (PNG/JPEG/WebP, resize, compress, batch) |

Favorites, last inputs and the light/dark theme are remembered per tool. `Ctrl+K` or `/` jumps to the search box.

## Install

Requires Studio Pro 11.12 or later (the extension targets .NET 10, like Studio Pro 11.12).

1. Build and copy the extension into your app:
   ```powershell
   ./scripts/install.ps1 -AppDir "C:\Users\me\Mendix\MyApp"
   ```
   This puts `Stoneworx.DevToolbox.dll` and `manifest.json` in `MyApp\extensions\DevToolbox\`. You can also unzip a release `DevToolbox-x.y.z.zip` there.
2. Start Studio Pro with extension development enabled, which unpublished extensions need:
   ```powershell
   & "C:\Program Files\Mendix\11.12.6\modeler\studiopro.exe" --enable-extension-development
   ```
3. Open the app and choose **Extensions → Open Developer Toolbox** (or **…as pane** to dock it next to your editor).

## Develop

The UI is plain HTML, CSS and ES modules in `src/DevToolbox/wwwroot`, embedded into the DLL and served by Studio Pro's built-in web server. There is no front-end build step. Third-party libraries are vendored in `wwwroot/vendor` (versions and licenses in `VERSIONS.txt`).

```bash
dotnet run --project tools/DevHost           # serves the UI at http://localhost:5299/dev-toolbox/index.html
dotnet test DevToolbox.slnx                  # C#: XSD validator and request handler
node --test tests/web/*.test.mjs             # JS: tool logic (encoders, cron, JWT, X.509, colors, …)
node tests/ui/smoke.mjs                      # opens every tool in headless Chromium (needs Playwright and the dev host)
./scripts/package.sh                         # dist/DevToolbox-<version>.zip
```

The dev host reuses the extension's own request handler, so the XSD endpoint works there too. Embedded files are only refreshed on rebuild, so restart the dev host after changing `wwwroot`.

### Adding a tool

Add an object to one of the arrays in `wwwroot/js/tools/*.js`:

```js
{
  id: 'my-tool', name: 'My tool', category: 'Text', icon: 'text',
  description: 'One line shown on the home page.',
  keywords: 'extra search words',
  render(root) {
    const src = textArea({ label: 'Input', persist: 'input' });   // persist = remembered between sessions
    const out = textArea({ label: 'Output', readonly: true });
    const stat = status();
    clear(root, stat.root, split(src.root, out.root));
    return live(root, () => { out.value = src.value.toUpperCase(); }, stat);  // reruns on every change; errors show in stat
  },
}
```

Keep logic that can be tested without a browser in `wwwroot/js/lib/` and cover it in `tests/web`.

## Layout

```
src/DevToolbox/          the extension
  DevToolboxMenu.cs      Extensions menu entries
  DevToolboxPane.cs      dockable pane and tab view models (WebView)
  DevToolboxWebServer.cs serves wwwroot and the /api/validate-xsd endpoint
  XsdValidator.cs        schema validation with DTDs and external resolution disabled
  wwwroot/               the web UI
tests/                   .NET, JS and browser tests
tools/DevHost/           standalone host for working on the UI in a browser
```
