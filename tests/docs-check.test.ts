import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const checker = resolve('scripts/check_docs.py');
const scaffold = JSON.parse(execFileSync('python3', ['-c',
  'import json, runpy, sys; m = runpy.run_path(sys.argv[1]); print(json.dumps([m["REQUIRED"], m["WORKSPACES"]]))', checker],
{ encoding: 'utf8' })) as [string[], string[]];

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'yttv-docs-'));
  const root = join(parent, 'checkout');
  const put = (path: string, content: string) => {
    const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
  };
  for (const path of scaffold[0]) put(path, '# Fixture\nStatus: NOT RUN\n');
  copyFileSync(checker, join(root, 'scripts/check_docs.py'));
  put('package.json', JSON.stringify({ private: true, workspaces: ['apps/*', 'packages/*'] }));
  for (const path of scaffold[1]) {
    put(`${path}/package.json`, JSON.stringify({ name: path.replace('/', '-'), private: true }));
    put(`${path}/README.md`, '# Workspace\n');
  }
  put('docs/ACCEPTANCE_AND_TEST_PLAN.md', Array.from({ length: 18 }, (_, i) => `| U${String(i + 1).padStart(2, '0')} | fixture |`).join('\n'));
  const run = (...args: string[]) => {
    const result = spawnSync('python3', [join(root, 'scripts/check_docs.py'), ...args], { encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout) };
  };
  return { put, run, close: () => rmSync(parent, { recursive: true, force: true }) };
}

test('default and explicit portable docs checks need only repository files and disclose historical artifacts', () => {
  const f = fixture();
  try {
    f.put('README.md', '# Fixture\n[Pointer](../yttv_next_steps.md)\n[Review](.local/review.md)\n[Historical inventory](docs/setup-validation.json)\n');
    f.put('.local/private.md', '[Invalid](missing.md)\n');
    const portable = f.run('--repository-only');
    assert.equal(portable.status, 0);
    assert.equal(portable.report.mode, 'repository-only');
    assert.equal(portable.report.local_artifact_links_unavailable.length, 3);
    // Explicit report generation supplies the inventory rather than treating it as unavailable.
    const generated = f.run('--repository-only', '--write-report');
    assert.equal(generated.status, 0);
    assert.equal(generated.report.local_artifact_links_unavailable.length, 2);
    const local = f.run();
    assert.equal(local.status, 0);
    assert.equal(local.report.mode, 'repository-only');
    assert.equal(local.report.local_artifact_links_unavailable.length, 2);
  } finally { f.close(); }
});

test('portable docs checks still reject broken repository links, anchors and external filesystem dependencies', () => {
  const f = fixture();
  try {
    for (const [link, error] of [
      ['missing.md', 'Broken local link'],
      ['docs/PRODUCT.md#missing', 'Broken anchor'],
      ['../other-project/README.md', 'External filesystem dependency'],
    ]) {
      f.put('README.md', `# Fixture\n[Bad](${link})\n`);
      const result = f.run('--repository-only');
      assert.equal(result.status, 1);
      assert.ok(result.report.errors.some((message: string) => message.startsWith(error)), result.report.errors.join('\n'));
    }
  } finally { f.close(); }
});
