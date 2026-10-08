"""Build/install/smoke disposable repository inputs; preserve retained dist."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def export_source(destination):
    files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    for name in sorted(set(files.decode().split('\0')) - {''}):
        source = ROOT / name
        if source.is_symlink():
            raise ValueError(f'Symlink not permitted in CI export: {name}')
        if source.is_file():
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)


def build(report_path):
    with tempfile.TemporaryDirectory(prefix='yttv-ci-build-') as directory:
        root = Path(directory)
        export_source(root)
        subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=root, check=True, timeout=90)
        subprocess.run(['npm', 'run', 'typecheck'], cwd=root, check=True, timeout=30)
        subprocess.run(['npm', 'run', 'docs:check', '--', '--repository-only'], cwd=root, check=True, timeout=30)
        subprocess.run(['npm', 'run', 'build'], cwd=root, check=True, timeout=60)
        output = root / 'dist/chrome-extension'
        manifest = json.loads((output / 'manifest.json').read_text())
        for asset in [manifest['background']['service_worker'], *manifest['content_scripts'][0]['js']]:
            if not (output / asset).is_file():
                raise ValueError(f'Missing manifest asset {asset}')
        for page in ('panel.html', 'remote.html', 'demo.html'):
            for asset in re.findall(r'(?:src|href)="([^"]+)"', (output / page).read_text()):
                if not (output / asset).is_file():
                    raise ValueError(f'Missing HTML asset {asset}')
        for script in output.glob('*.js'):
            subprocess.run(['node', '--check', str(script)], cwd=root, check=True, timeout=10)
        smoke = """
import assert from 'node:assert/strict';
import { createFixturePreviewServer } from './scripts/preview-server.mjs';
import { request } from 'node:http';
const server = createFixturePreviewServer('./dist/chrome-extension', 'fixture.local');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const port = server.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 403);
  for (const path of ['/demo.html', '/panel.js', '/panel.css']) {
    await new Promise((resolve, reject) => {
      request({host:'127.0.0.1', port, path, headers:{host:'fixture.local'}}, response => {
        let bytes=0; response.on('data', chunk => bytes+=chunk.length);
        response.on('end', () => {try { assert.equal(response.statusCode, 200); assert.ok(bytes>0); resolve(); } catch(e) { reject(e); }});
      }).on('error', reject).end();
    });
  }
} finally { await new Promise(resolve => server.close(resolve)); }
"""
        subprocess.run(['node', '--input-type=module', '-e', smoke], cwd=root, check=True, timeout=15)
        assets = {p.name: dict(bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                  for p in sorted(output.iterdir()) if p.is_file()}
        identity = json.loads((output / 'build-identity.json').read_text())
        Path(report_path).write_text(json.dumps(dict(source_fingerprint=identity['sourceFingerprint'],
            assets=assets, total_bytes=sum(a['bytes'] for a in assets.values()),
            baseline=None, budget=None, fixture_smoke='PASS'), indent=2) + '\n')


if __name__ == '__main__':
    build(sys.argv[1])
