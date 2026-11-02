// Third-party licence notices for the release build: every npm package that esbuild bundled,
// found through the build's metafile, so dependencies of dependencies are included too.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Licence, copying and notice files, in any of the usual spellings (LICENSE, LICENCE.md, LICENSE-MIT, COPYING, NOTICE).
const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.\-_].*)?$/i;

const MIT = (copyright) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * Packages that ship no licence file, with the notice to include instead. Each entry needs the
 * copyright line from the package's own source, because MIT and BSD require it to travel along.
 */
export const KNOWN_NOTICES = {
  // Copyright line from the header of node_modules/qrcode-generator/dist/qrcode.js.
  'qrcode-generator': MIT('Copyright (c) 2009 Kazuhiko Arase'),
};

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
 * One entry per bundled package: name, version and notice text (its licence and notice files, or
 * its KNOWN_NOTICES entry). Throws for any other package, so a release never ships code without
 * its copyright notice.
 */
export function bundledLicenses(metafile, root = '.', known = KNOWN_NOTICES) {
  const byKey = new Map();
  for (const dir of bundledPackageDirs(metafile)) {
    const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (byKey.has(key)) continue;
    const files = readdirSync(join(root, dir)).filter((f) => NOTICE_FILE.test(f)).sort();
    const text = files.length ? files.map((f) => readFileSync(join(root, dir, f), 'utf8').trim()).join('\n\n') : known[pkg.name];
    if (!text) throw new Error(`${key} is bundled but ships no licence file; add its copyright notice to KNOWN_NOTICES in licenses.mjs before releasing.`);
    byKey.set(key, { name: pkg.name, version: pkg.version, text });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function thirdPartyNotice(entries) {
  const sections = entries.map(({ name, version, text }) => `${name} ${version}\n${'='.repeat(`${name} ${version}`.length)}\n\n${text}`);
  return `Third-party software bundled in the Developer Toolbox\n\n${sections.join('\n\n\n')}\n`;
}
