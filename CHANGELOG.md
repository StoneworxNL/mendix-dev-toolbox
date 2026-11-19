# Changelog

## 0.3.0 (unreleased)

### Added
- Mendix tools: OQL helper (formatter, OQL v2 checks, query builder from the domain model, function reference), XPath constraint helper (syntax check, live values of date tokens, relative date filters), date pattern tester (formatDateTime/parseDateTime), domain model docs (Markdown and Mermaid ER diagrams) and naming convention check (Mendix best practices, editable rules).
- Markdown preview: remote images load only when "Load remote images" is on.
- License (MIT), `engines` (Node 22 or later) and this changelog.

### Changed
- Text typed into the Base64, URL, JWT, GZip and hash tools is no longer saved between sessions; values saved by 0.2.0 are removed once.
- The Regex tester runs in a worker and stops a pattern after 1.5 s, so catastrophic backtracking no longer freezes Studio Pro.
- The theme follows Studio Pro again when you switch it while the toolbox is open.
- The Mendix tools read the app model again each time they open, and load Marketplace modules only when asked.
- `js-yaml` 4.3.2 (security fixes), GitHub Actions v5, `npm run serve` listens on localhost only.

### Fixed
- UTC date tokens (`[%BeginOfCurrentMonthUTC%]` and others) were an hour off when the local offset had changed since the start of the period.
- The naming check says which document kinds it could not read instead of reporting them as fine.
- The image tools release thumbnails and previews they no longer show.

## 0.2.0

- Ported from the C# Extensions API to the Web Extensibility API.

## 0.1.0

- 31 DevToys-style tools: converters, encoders and decoders, formatters, generators, text tools, testers and graphics.
