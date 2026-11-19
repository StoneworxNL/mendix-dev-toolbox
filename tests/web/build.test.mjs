// Checks the release build's third-party licence notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledLicenses } from '../../licenses.mjs';

const root = new URL('../..', import.meta.url);

test('release build lists the licence of every bundled package, including dependencies of dependencies', () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe' });
  const notice = readFileSync(new URL('dist/devtoolbox/THIRD_PARTY_LICENSES.txt', root), 'utf8');
  const { dependencies } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  // xmllint-wasm ships unbundled with its own COPYING file.
  for (const name of [...Object.keys(dependencies).filter((d) => d !== 'xmllint-wasm'), 'nearley']) {
    assert.ok(notice.split('\n').some((line) => line.startsWith(`${name} `)), `${name} is missing`);
  }
});

test('a bundled package without any licence stops the release', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dtb-'));
  mkdirSync(join(dir, 'node_modules', 'nolicense'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'nolicense', 'package.json'), '{"name":"nolicense","version":"1.0.0"}');
  assert.throws(() => bundledLicenses({ inputs: { 'node_modules/nolicense/index.js': {} } }, dir), /no licence file/);
});
