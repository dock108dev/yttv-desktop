"""Protect CI failures, missing reports, and untrusted report text."""
import json
from pathlib import Path
import tempfile
import unittest
import os
import subprocess
import sys
import textwrap
import xml.etree.ElementTree as ET
from run import audit, coverage, escaped, junit, unittest_counts


class Reports(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'report'

    def put(self, text):
        self.path.write_text(text)
        return self.path

    def test_pass_fail_and_skip(self):
        result = junit(self.put('<testsuites><testcase time="1"/><testcase name="broken"><failure/></testcase><testcase><skipped/></testcase></testsuites>'))
        self.assertEqual((result['passed'], result['failed'], result['skipped']), (1, 1, 1))
        self.assertEqual(result['failures'], ['broken'])

    def test_missing_malformed_empty_and_all_skipped_fail(self):
        for xml in ('', '<testsuites/>', '<testsuites><testcase><skipped/></testcase></testsuites>'):
            with self.subTest(xml=xml), self.assertRaises((ValueError, ET.ParseError)):
                junit(self.put(xml))
        self.path.unlink()
        with self.assertRaises(FileNotFoundError):
            junit(self.path)

    def test_coverage_empty_is_not_zero_percent(self):
        with self.assertRaises(ValueError):
            coverage(self.put('TN:\n'))
        result = coverage(self.put('SF:apps/example.ts\nLF:2\nLH:1\nBRF:4\nBRH:1\n'))
        self.assertEqual((result['lines_percent'], result['branches_percent']), (50, 25))

    def test_registry_error_is_not_zero_findings(self):
        with self.assertRaises(ValueError):
            audit(self.put('{"error":{"code":"unavailable"}}'))
        counts = dict(info=0, low=1, moderate=2, high=3, critical=4)
        self.assertEqual(audit(self.put(json.dumps(dict(auditReportVersion=2, metadata=dict(vulnerabilities=counts))))), counts)

    def test_untrusted_names_cannot_inject_html_or_table_rows(self):
        self.assertEqual(escaped('<script>|\nhello'), '&lt;script&gt;&#124; hello')

    def test_report_contract_collection_cannot_be_zero_or_absent(self):
        for log in ('', 'Ran 0 tests in 0.0s\nOK', 'Ran 2 tests in 0.1s\nOK (skipped=2)'):
            with self.subTest(log=log), self.assertRaises(ValueError):
                unittest_counts(self.put(log))
        self.assertEqual(unittest_counts(self.put('Ran 3 tests in 0.1s\nFAILED (failures=1)'))['failures'], 1)

    def test_actual_workflow_gate_rejects_failed_skipped_cancelled_and_missing(self):
        workflow = (Path(__file__).resolve().parents[2] / '.github/workflows/ci.yml').read_text()
        script = textwrap.dedent(workflow.split("python3 - <<'PY'\n", 1)[1].rsplit('\n          PY', 1)[0])
        for source, security, expected in [('success', 'success', 0), ('failure', 'success', 1),
                ('success', 'failure', 1), ('skipped', 'success', 1), ('cancelled', 'success', 1), ('', 'success', 1)]:
            with self.subTest(source=source, security=security):
                env = {**os.environ, 'SOURCE': source, 'SECURITY': security,
                       'TESTED_SHA': 'synthetic', 'EVENT': 'fixture', 'GITHUB_STEP_SUMMARY': str(self.path)}
                self.assertEqual(subprocess.run([sys.executable, '-c', script], env=env, timeout=5).returncode, expected)

if __name__ == '__main__':
    unittest.main()
