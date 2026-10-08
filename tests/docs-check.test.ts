import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const checker = resolve('scripts/check_docs.py');
const required = JSON.parse(execFileSync('python3', ['-c',
  'import json, runpy, sys; print(json.dumps(runpy.run_path(sys.argv[1])["REQUIRED"]))', checker],
{ encoding: 'utf8' })) as string[];

function fixture(git = true) {
  const root = mkdtempSync(join(tmpdir(), 'yttv-docs-'));
  const put = (path: string, content: string) => {
    const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
  };
  for (const path of required) put(path, '# Fixture\n');
  copyFileSync(checker, join(root, 'scripts/check_docs.py'));
  put('.gitignore', '.local/\ndocs/evidence/\nworking-notes.md\n');
  put('package.json', JSON.stringify({ private: true, workspaces: ['apps/*', 'packages/*'] }));
  for (const path of ['apps/chrome-extension', 'packages/core']) {
    put(`${path}/package.json`, JSON.stringify({ name: path.replace('/', '-'), private: true }));
    put(`${path}/README.md`, '# Workspace\n');
  }
  if (git) execFileSync('git', ['init', '--quiet', root]);
  const run = (...args: string[]) => {
    const result = spawnSync('python3', [join(root, 'scripts/check_docs.py'), ...args], { encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout) };
  };
  return { put, run, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('deliverable docs checks ignore local notes and require no plans or generated inventories', () => {
  const f = fixture();
  try {
    f.put('.local/private.md', '[Bad](missing.md)\n');
    f.put('docs/evidence/private.md', '[Bad](missing.md)\n');
    f.put('working-notes.md', '[Bad](../private-tracker.md)\n');
    const portable = f.run('--repository-only');
    assert.equal(portable.status, 0);
    assert.equal(portable.report.mode, 'repository-only');
    assert.equal(f.run().status, 0);
    f.put('docs/new-guide.md', '[Bad](missing.md)\n');
    assert.equal(f.run().status, 1, 'new nonignored docs must be checked before staging');
  } finally { f.close(); }
});

test('docs checks reject broken links, anchors, private pointers and ignored dependencies', () => {
  const f = fixture();
  try {
    f.put('.local/private.md', '# Private\n');
    for (const [link, error] of [
      ['missing.md', 'Broken local link'],
      ['docs/ARCHITECTURE.md#missing', 'Broken anchor'],
      ['../private-tracker.md', 'External filesystem dependency'],
      ['.local/private.md', 'Link to local-only file'],
    ]) {
      f.put('README.md', `# Fixture\n[Bad](${link})\n`);
      const result = f.run();
      assert.equal(result.status, 1);
      assert.ok(result.report.errors.some((message: string) => message.startsWith(error)), result.report.errors.join('\n'));
    }
    f.put('README.md', '# Fixture\n[Valid](docs/ARCHITECTURE.md#fixture)\n');
    assert.equal(f.run().status, 0);
  } finally { f.close(); }
});

test('clean source archives validate without Git metadata', () => {
  const f = fixture(false);
  try { assert.equal(f.run().status, 0); } finally { f.close(); }
});

test('workspace discovery checks new packages rather than a frozen scaffold list', () => {
  const f = fixture();
  try {
    f.put('packages/new/package.json', JSON.stringify({ name: 'packages-core', private: true }));
    f.put('packages/new/README.md', '# Package\n');
    assert.ok(f.run().report.errors.some((message: string) => message.startsWith('Duplicate workspace name')));
  } finally { f.close(); }
});
