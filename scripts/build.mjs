import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sportsCandidate = process.argv.includes('--sports-candidate');
const outdir = resolve(root, sportsCandidate ? 'dist/sports-permission-candidate' : 'dist/chrome-extension');
const manifest = JSON.parse(await readFile(resolve(root, 'apps/chrome-extension/manifest.json'), 'utf8'));
if (sportsCandidate) manifest.host_permissions.push('http://127.0.0.1:4318/*');
// Stable runtime identity for the actual inputs, including uncommitted repairs.
const inputs = ['scripts/build.mjs', 'scripts/sports-relay.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'apps/chrome-extension/manifest.json', 'apps/chrome-extension/panel.html', 'apps/chrome-extension/demo.html'];
for (const folder of ['apps/chrome-extension/src', 'packages']) {
  for (const file of await readdir(resolve(root, folder), { recursive: true })) {
    if (/\.(ts|tsx|css)$/.test(file) && !file.includes('node_modules') && !file.endsWith('.test.ts')) inputs.push(`${folder}/${file}`);
  }
}
const sourceInputs = [];
const sourceHash = createHash('sha256');
sourceHash.update(JSON.stringify(manifest)).update('\0');
for (const path of inputs.sort()) {
  const bytes = await readFile(resolve(root, path));
  sourceInputs.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
  sourceHash.update(path).update('\0').update(bytes).update('\0');
}
const sourceFingerprint = sourceHash.digest('hex');
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
    define: { 'process.env.NODE_ENV': '"production"', __YTTV_VERSION__: JSON.stringify(manifest.version), __YTTV_BUILD__: JSON.stringify(sourceFingerprint.slice(0, 16)) },
    sourcemap: false, legalComments: 'none', plugins: [inlineCSS],
  });
}
for (const file of ['panel.html', 'demo.html']) {
  await copyFile(resolve(root, 'apps/chrome-extension', file), resolve(outdir, file));
}
await writeFile(resolve(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) throw new Error('Unexpected permission expansion');
const expectedHosts = sportsCandidate ? ['https://tv.youtube.com/*', 'http://127.0.0.1:4318/*'] : ['https://tv.youtube.com/*'];
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedHosts)) throw new Error('Unexpected host expansion');
await writeFile(resolve(outdir, 'build-identity.json'), JSON.stringify({ version: manifest.version, sourceFingerprint, sourceInputs }, null, 2) + '\n');
console.log(`Built ${outdir}; exact permission audit passed (${sportsCandidate ? 'UNAPPROVED sports candidate: storage + tv.youtube.com + 127.0.0.1' : 'storage + tv.youtube.com only'}).`);
