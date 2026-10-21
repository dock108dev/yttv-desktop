/** One test inventory for local npm test and CI; no browser or account access. */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export async function discoverTests(root) {
  const files = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) files.push(path);
    }
  }
  for (const folder of ['tests', 'packages', 'apps']) await visit(resolve(root, folder));
  if (!files.length) throw new Error('No test files discovered');
  return files.sort();
}

async function main() {
  const root = resolve(import.meta.dirname, '..');
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--reports-dir' || !args[1])) throw new Error('Use --reports-dir PATH or no options');
  const files = await discoverTests(root);
  const flags = ['--import', 'tsx', '--test', '--test-timeout=60000'];
  if (args.length) {
    const output = resolve(args[1]);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'test-files.json'), JSON.stringify(files.map(path => relative(root, path)), null, 2) + '\n');
    flags.push('--experimental-test-coverage', '--test-coverage-include=apps/**', '--test-coverage-include=packages/**',
      '--test-coverage-exclude=**/*.test.ts', '--test-coverage-exclude=**/*.test.tsx', '--test-reporter=junit',
      `--test-reporter-destination=${resolve(output, 'junit.xml')}`, '--test-reporter=lcov', `--test-reporter-destination=${resolve(output, 'lcov.info')}`);
  }
  const child = spawn(process.execPath, [...flags, ...files], { cwd: root, stdio: 'inherit' });
  process.exitCode = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', code => done(code ?? 1));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
