// Third-party licence notices for the release build: every npm package that esbuild bundled,
// found through the build's metafile, so dependencies of dependencies are included too.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Package folders (with the last node_modules, so nested copies count) of every bundled input. */
export function bundledPackageDirs(metafile) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
    if (m) dirs.add(m[1]);
  }
  return [...dirs];
}

/**
 * One entry per bundled package: name, version and licence text (the licence file, or the
 * package.json `license` field when the package ships none). Throws when a package has neither,
 * so a release never goes out without a notice.
 */
export function bundledLicenses(metafile, root = '.') {
  const byKey = new Map();
  for (const dir of bundledPackageDirs(metafile)) {
    const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (byKey.has(key)) continue;
    const file = readdirSync(join(root, dir)).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
    if (!file && !license) throw new Error(`${key} is bundled but has no licence file and no license field; add its notice by hand before releasing.`);
    byKey.set(key, { name: pkg.name, version: pkg.version, text: file ? readFileSync(join(root, dir, file), 'utf8').trim() : `License: ${license} (the package ships no licence file)` });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function thirdPartyNotice(entries) {
  const sections = entries.map(({ name, version, text }) => `${name} ${version}\n${'='.repeat(`${name} ${version}`.length)}\n\n${text}`);
  return `Third-party software bundled in the Developer Toolbox\n\n${sections.join('\n\n\n')}\n`;
}
