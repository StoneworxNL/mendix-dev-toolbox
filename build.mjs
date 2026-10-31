// Builds the Studio Pro web extension into dist/devtoolbox.
//   node build.mjs                       build once
//   node build.mjs --watch               rebuild on change
//   node build.mjs --serve [port]        run the toolbox in a browser at http://localhost:5299/
//   node build.mjs --app <app folder>    also copy the build into <app>/extensions/devtoolbox
//   node build.mjs --sourcemap           include source maps (always on with --watch and --serve)
// MENDIX_APP_DIR works as an alternative to --app.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NAME = 'devtoolbox'; // folder name in <app>/extensions; must match the componentName in src/main
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };

const appDir = option('app') ?? process.env.MENDIX_APP_DIR;
const outDir = `dist/${NAME}`;
// Source maps only for development: in a release they would more than double what ships in the app.
const dev = flag('watch') || flag('serve') || flag('sourcemap');

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  splitting: true,
  treeShaking: true,
  minify: !flag('watch') && !flag('serve'),
  sourcemap: dev ? 'linked' : false,
  logLevel: 'info',
  // Releases get one THIRD_PARTY_LICENSES.txt instead of a .LEGAL.txt per chunk.
  legalComments: dev ? 'linked' : 'none',
  // Provided by Studio Pro at runtime.
  external: ['@mendix/component-framework', '@mendix/model-access-sdk', '@mendix/model-access-registry'],
  loader: { '.css': 'text' },
};

// libxml2 (xmllint-wasm) spawns a module worker and fetches its .wasm relative to itself, so it ships unbundled.
async function copyXmllint(dir) {
  const src = 'node_modules/xmllint-wasm';
  await mkdir(join(dir, 'xmllint'), { recursive: true });
  for (const f of ['index-browser.mjs', 'xmllint-browser.mjs', 'xmllint.wasm', 'COPYING']) await copyFile(join(src, f), join(dir, 'xmllint', f));
}

// The license texts of the runtime dependencies, which are bundled into the chunks.
async function writeThirdPartyLicenses(dir) {
  const { dependencies } = JSON.parse(await readFile('package.json', 'utf8'));
  const sections = [];
  for (const name of Object.keys(dependencies).sort()) {
    const pkgDir = join('node_modules', name);
    const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
    const file = readdirSync(pkgDir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const text = file ? (await readFile(join(pkgDir, file), 'utf8')).trim() : `License: ${pkg.license ?? 'see the package'} (no license file in the package)`;
    sections.push(`${name} ${pkg.version}\n${'='.repeat(`${name} ${pkg.version}`.length)}\n\n${text}`);
  }
  await writeFile(join(dir, 'THIRD_PARTY_LICENSES.txt'), `Third-party software bundled in the Developer Toolbox\n\n${sections.join('\n\n\n')}\n`);
}

const extensionFiles = {
  name: 'extension-files',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await copyFile('src/manifest.json', join(outDir, 'manifest.json'));
      await copyXmllint(outDir);
      if (!dev) await writeThirdPartyLicenses(outDir);
      if (!appDir) return;
      if (!existsSync(appDir) || !readdirSync(appDir).some((f) => f.endsWith('.mpr'))) {
        console.error(`No Mendix app (.mpr) found in ${appDir}; not copying the extension.`);
        return;
      }
      const target = join(resolve(appDir), 'extensions', NAME);
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      await cp(outDir, target, { recursive: true });
      console.log(`Copied to ${target}`);
    });
  },
};

if (flag('serve')) {
  const dir = 'dist/standalone';
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await copyFile('dev/index.html', join(dir, 'index.html'));
  await copyXmllint(dir);
  const ctx = await esbuild.context({ ...common, outdir: dir, entryPoints: { standalone: 'dev/standalone.js' } });
  await ctx.watch();
  const port = Number(option('serve')) || 5299;
  await ctx.serve({ servedir: dir, port, host: 'localhost' });
  console.log(`Developer Toolbox: http://localhost:${port}/`);
} else {
  await rm(outDir, { recursive: true, force: true });
  const ctx = await esbuild.context({
    ...common,
    outdir: outDir,
    entryPoints: { main: 'src/main/index.js', tab: 'src/ui/tab.js', pane: 'src/ui/pane.js' },
    plugins: [extensionFiles],
  });
  if (flag('watch')) await ctx.watch();
  else { await ctx.rebuild(); await ctx.dispose(); }
}
