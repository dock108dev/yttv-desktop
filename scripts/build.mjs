import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outdir = resolve(root, 'dist/chrome-extension');
const manifest = JSON.parse(await readFile(resolve(root, 'apps/chrome-extension/manifest.json'), 'utf8'));
const inlineCSS = {
  name: 'inline-css',
  setup(build) {
    build.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
    build.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
  },
};
await mkdir(outdir, { recursive: true });
for (const [name, format] of [['content', 'iife'], ['background', 'esm'], ['panel', 'iife']]) {
  await build({
    absWorkingDir: root,
    entryPoints: [`apps/chrome-extension/src/${name}.${name === 'background' ? 'ts' : 'tsx'}`],
    outfile: `${outdir}/${name}.js`, bundle: true, format,
    platform: 'browser', target: 'chrome120', minify: false,
    define: { 'process.env.NODE_ENV': '"production"', __YTTV_VERSION__: JSON.stringify(manifest.version) },
    sourcemap: false, legalComments: 'none', plugins: [inlineCSS],
  });
}
for (const file of ['manifest.json', 'panel.html', 'demo.html']) {
  await copyFile(resolve(root, 'apps/chrome-extension', file), resolve(outdir, file));
}
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) throw new Error('Unexpected permission expansion');
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://tv.youtube.com/*'])) throw new Error('Unexpected host expansion');
console.log(`Built ${outdir}; permission audit passed (storage + tv.youtube.com only).`);
