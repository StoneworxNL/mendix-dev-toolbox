// Builds the Studio Pro web extension into dist/devtoolbox.
//   node build.mjs                       build once
//   node build.mjs --watch               rebuild on change
//   node build.mjs --serve [port]        run the toolbox in a browser at http://localhost:5299/
//   node build.mjs --app <app folder>    also copy the build into <app>/extensions/devtoolbox
//   node build.mjs --sourcemap           include source maps (always on with --watch and --serve)
// MENDIX_APP_DIR works as an alternative to --app.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundledLicenses, thirdPartyNotice } from './licenses.mjs';

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
  metafile: !dev,
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

const extensionFiles = {
  name: 'extension-files',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await copyFile('src/manifest.json', join(outDir, 'manifest.json'));
      await copyXmllint(outDir);
      // The licence notices of every bundled package, found through the metafile.
      if (!dev) {
        try {
          await writeFile(join(outDir, 'THIRD_PARTY_LICENSES.txt'), thirdPartyNotice(bundledLicenses(result.metafile)));
        } catch (e) {
          console.error(`Release build stopped: ${e.message}`);
          process.exitCode = 1;
          return;
        }
      }
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
