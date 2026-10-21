"""CI integration contracts: discovery, shipped assets and fail-closed final reporting."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from finalize import finalize
from fresh_build import validate_output
from run import REQUIRED, bundle, input_identity, junit

ROOT = Path(__file__).resolve().parents[2]


class Contracts(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)

    def test_inventory_finds_tests_in_every_component_and_excludes_dependencies(self):
        for name in ('tests/a.test.ts', 'packages/example/src/b.test.tsx', 'apps/example/c.test.ts',
                     'packages/example/node_modules/ignored.test.ts'):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        script = "import {discoverTests} from './scripts/test.mjs'; console.log(JSON.stringify(await discoverTests(process.argv[1])));"
        files = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, str(self.root)], cwd=ROOT, text=True, timeout=10))
        self.assertEqual(len(files), 3)
        self.assertTrue(any(name.endswith('b.test.tsx') for name in files))
        for name in files:
            Path(name).unlink()
        self.assertNotEqual(subprocess.run(['node', '--input-type=module', '-e', script, str(self.root)], cwd=ROOT,
                                          capture_output=True, timeout=10).returncode, 0)

    def test_each_expected_test_file_must_collect_an_unskipped_case(self):
        path = self.root / 'junit.xml'
        path.write_text(f'<testsuites><testcase file="{ROOT}/tests/a.test.ts" time="1"/></testsuites>')
        self.assertEqual(junit(path, ['tests/a.test.ts'])['passed'], 1)
        with self.assertRaises(ValueError):
            junit(path, ['tests/a.test.ts', 'tests/missing.test.ts'])
        path.write_text('<testsuites><testcase time="NaN"/></testsuites>')
        with self.assertRaises(ValueError):
            junit(path)

    def test_distribution_checks_drawing_assets_and_all_manifest_content_scripts(self):
        manifest = dict(background=dict(service_worker='background.js'), content_scripts=[dict(js=['content.js']), dict(css=['extra.css'])])
        (self.root / 'manifest.json').write_text(json.dumps(manifest))
        for name in ('background.js', 'content.js', 'extra.css', 'panel.html', 'remote.html', 'demo.html'):
            (self.root / name).write_text('synthetic')
        (self.root / 'area-picker.html').write_text('<script src="area-picker.js"></script><link href="area-picker.css">')
        with self.assertRaises(ValueError):
            validate_output(self.root)
        for name in ('area-picker.js', 'area-picker.css'):
            (self.root / name).write_text('synthetic')
        validate_output(self.root)
        (self.root / 'extra.css').unlink()
        with self.assertRaises(ValueError):
            validate_output(self.root)
        with self.assertRaises(ValueError):
            bundle(self.root / 'manifest.json')

    def security_report(self):
        report = dict(schema_version=1, mode='security', result='PASS', seconds=1, platform='synthetic', node='synthetic', python='synthetic', tools={},
                      identity=dict(sha='synthetic', event='synthetic', ref='synthetic', pr_head=None, inputs_sha256=input_identity(), run_url=None),
                      checks=[dict(name=name, result='PASS', seconds=0, exit_code=0) for name in REQUIRED['security']],
                      dependencies=dict(info=0, low=0, moderate=0, high=0, critical=0))
        (self.root / 'metrics.json').write_text(json.dumps(report))
        (self.root / 'dependencies.log').write_text(json.dumps(dict(auditReportVersion=2, metadata=dict(vulnerabilities=report['dependencies']))))
        (self.root / 'secrets.json').write_text('[]')
        for name in ('actionlint', 'secrets'):
            (self.root / (name + '.log')).write_text('')

    def test_finalizer_revalidates_raw_reports_and_upstream_outcomes(self):
        with patch.dict(os.environ, {'GITHUB_SHA': 'synthetic', 'GITHUB_STEP_SUMMARY': ''}):
            for outcome in ('success', 'failure', 'skipped', 'cancelled', ''):
                self.security_report()
                self.assertEqual(finalize('security', self.root, outcome), 0 if outcome == 'success' else 1)
            self.security_report()
            (self.root / 'secrets.json').unlink()
            self.assertEqual(finalize('security', self.root, 'success'), 1)
            report = json.loads((self.root / 'metrics.json').read_text())
            self.assertEqual(report['result'], 'FAIL')
            self.assertIn('NOT RUN', (self.root / 'summary.md').read_text())

    def test_missing_and_incomplete_reports_never_pass(self):
        with patch.dict(os.environ, {'GITHUB_STEP_SUMMARY': ''}):
            self.assertEqual(finalize('source', self.root, 'success'), 1)
            (self.root / 'metrics.json').write_text('{}')
            self.assertEqual(finalize('security', self.root, 'success'), 1)
            self.security_report()
            report = json.loads((self.root / 'metrics.json').read_text())
            report['checks'].pop()
            (self.root / 'metrics.json').write_text(json.dumps(report))
            self.assertEqual(finalize('security', self.root, 'success'), 1)


if __name__ == '__main__':
    unittest.main()
