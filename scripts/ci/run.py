"""Bounded, offline product checks or registry-backed security checks with reports.

Reports are evidence only. No browser, installation, publishing or owner-state access.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import math
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from fresh_build import REQUIRED_ASSETS

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {
    'source': ('report-contract', 'typecheck', 'tests', 'build-permissions', 'docs', 'scripts', 'fresh-build'),
    'security': ('actionlint', 'dependencies', 'secrets'),
}


def junit(path, expected_files=None):
    tree = ET.parse(path)
    cases = list(tree.iter('testcase'))
    if not cases:
        raise ValueError('Missing test collection: zero testcases')
    failed = [c for c in cases if c.find('failure') is not None or c.find('error') is not None]
    skipped = [c for c in cases if c.find('skipped') is not None]
    if len(skipped) == len(cases):
        raise ValueError('All tests skipped')
    times = [float(c.get('time', '0')) for c in cases]
    if any(not math.isfinite(value) or value < 0 for value in times):
        raise ValueError('Invalid testcase duration')
    if expected_files is not None:
        if not expected_files or len(expected_files) != len(set(expected_files)):
            raise ValueError('Missing or duplicate test-file inventory')
        collected = {str(Path(c.get('file', '')).resolve()) for c in cases if c not in skipped}
        missing = [name for name in expected_files if str((ROOT / name).resolve()) not in collected]
        if missing:
            raise ValueError('Missing or fully skipped test files: ' + ', '.join(missing))
    return dict(total=len(cases), passed=len(cases)-len(failed)-len(skipped),
                failed=len(failed), skipped=len(skipped),
                case_seconds=sum(times),
                failures=[c.get('name', 'unnamed')[:240] for c in failed][:10])


def coverage(path):
    values = {key: 0 for key in ('LF', 'LH', 'BRF', 'BRH')}
    records, current = [], None
    for line in path.read_text().splitlines():
        key, _, value = line.partition(':')
        if key == 'SF':
            if current is not None:
                records.append(current)
            current = {}
        elif key in values:
            if current is None or key in current:
                raise ValueError('Coverage counters outside a file or duplicated')
            current[key] = int(value)
    if current is not None:
        records.append(current)
    for record in records:
        if not {'LF', 'LH'} <= record.keys() or any(n < 0 for n in record.values()) or record['LH'] > record['LF']:
            raise ValueError('Invalid per-file coverage counts')
        if ('BRF' in record) != ('BRH' in record) or record.get('BRH', 0) > record.get('BRF', 0):
            raise ValueError('Invalid branch coverage counts')
        for key in values:
            values[key] += record.get(key, 0)
    if not records or not values['LF']:
        raise ValueError('Empty/malformed required coverage')
    return dict(files=len(records), lines_percent=100*values['LH']/values['LF'],
                branches_percent=100*values['BRH']/values['BRF'] if values['BRF'] else None, **values)


def audit(path):
    data = json.loads(path.read_text())
    if data.get('error') or data.get('auditReportVersion') != 2:
        raise ValueError('Audit unavailable or unsupported report')
    counts = data['metadata']['vulnerabilities']
    for severity in ('info', 'low', 'moderate', 'high', 'critical'):
        if type(counts[severity]) is not int or counts[severity] < 0:
            raise ValueError('Malformed severity count')
    return counts


def bundle(path):
    data = json.loads(path.read_text())
    if not re.fullmatch(r'[a-f0-9]{64}', data.get('source_fingerprint', '')) or data.get('fixture_smoke') != 'PASS':
        raise ValueError('Missing/malformed required build report')
    assets = data.get('assets', {})
    if not all(name in assets for name in REQUIRED_ASSETS):
        raise ValueError('Missing required distribution assets')
    for info in assets.values():
        if type(info.get('bytes')) is not int or info['bytes'] <= 0 or not re.fullmatch(r'[a-f0-9]{64}', info.get('sha256', '')):
            raise ValueError('Invalid asset measurements')
    if data.get('total_bytes') != sum(info['bytes'] for info in assets.values()):
        raise ValueError('Invalid bundle total')
    return data


def unittest_counts(path):
    text = path.read_text()
    found = re.search(r'Ran (\d+) tests? in ([\d.]+)s', text)
    if not found or int(found[1]) == 0:
        raise ValueError('Missing/zero report-contract test collection')
    counts = {key: int(re.search(rf'{key}=(\d+)', text)[1]) if re.search(rf'{key}=(\d+)', text) else 0
              for key in ('failures', 'errors', 'skipped')}
    if counts['skipped'] == int(found[1]):
        raise ValueError('All report-contract tests skipped')
    return dict(total=int(found[1]), seconds=float(found[2]), **counts)


def escaped(value):
    return html.escape(str(value)).replace('|', '&#124;').replace('\n', ' ').replace('`', '&#96;').replace('[', '&#91;').replace(']', '&#93;')


def input_identity():
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    digest = hashlib.sha256()
    for name in sorted(set(names.decode().split('\0')) - {''}):
        path = ROOT / name
        if path.is_file():
            digest.update(name.encode() + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()


def summary(report):
    identity = report['identity']
    rows = ['## YTTV ' + escaped(report['mode']) + ' — ' + report['result'], '',
            f"Tested SHA: `{escaped(identity['sha'])}`; event: {escaped(identity['event'])}; ref: {escaped(identity['ref'])}",
            f"PR head: `{escaped(identity['pr_head'])}`; platform: {escaped(report['platform'])}; Node: {escaped(report['node'])}; Python: {escaped(report['python'])}",
            f"Repository input SHA-256: `{identity['inputs_sha256']}`; tools: {escaped(report['tools'])}",
            f"Run: {escaped(identity['run_url'])}; elapsed checks: {report['seconds']:.2f}s", '',
            '| Check | Outcome | Seconds | Detail |', '| --- | --- | ---: | --- |']
    for check in report['checks']:
        rows.append(f"| {escaped(check['name'])} | {check['result']} | {check['seconds']:.2f} | {escaped(check.get('detail', ''))} |")
    for key in ('tests', 'report_contract_tests', 'coverage', 'dependencies', 'secrets'):
        if report.get(key) is not None:
            rows.extend(['', f"{key}: {escaped(json.dumps(report[key]))}"])
    if report.get('bundle') is not None:
        rows.extend(['', f"Bundle: {report['bundle']['total_bytes']} bytes; fixture smoke: {report['bundle']['fixture_smoke']}; baseline unavailable."])
    blocker = next((c['name'] for c in report['checks'] if c['result'] != 'PASS'), None)
    rows.extend(['', f"Next action: inspect {escaped(blocker)} diagnostics." if blocker else
                 'All applicable checks passed. Hosted/browser playback and owner acceptance are separate.',
                 f"Reports: artifact {escaped(report.get('artifact_name') or 'local output directory')} (7 days in Actions). Full logs and metrics.json; source jobs also retain JUnit/LCOV.",
                 'Coverage is V8 executed-source instrumentation via tsx, without a TS source-map baseline; no coverage/size budget or trend claim.'])
    return '\n'.join(rows) + '\n'


def run(mode, output):
    output.mkdir(parents=True, exist_ok=True)
    # Each invocation owns a fresh directory; never accept reports left by a previous run.
    if any(output.iterdir()):
        raise ValueError('Report directory must be empty')
    started = time.monotonic()
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    env = os.environ
    report = dict(schema_version=1, mode=mode, result='FAIL', started_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                  platform=platform.platform(), python=platform.python_version(),
                  node=subprocess.check_output(['node', '--version'], text=True, timeout=10).strip(),
                  tools=dict(npm=subprocess.check_output(['npm', '--version'], text=True, timeout=10).strip()),
                  identity=dict(sha=env.get('GITHUB_SHA', sha), ref=env.get('GITHUB_REF', 'local-worktree'),
                                inputs_sha256=input_identity(),
                                event=env.get('GITHUB_EVENT_NAME', 'local'), pr_head=env.get('PR_HEAD_SHA') or None,
                                run_url=(f"{env.get('GITHUB_SERVER_URL', 'https://github.com')}/{env.get('GITHUB_REPOSITORY')}/actions/runs/{env.get('GITHUB_RUN_ID')}" if env.get('GITHUB_RUN_ID') else None)),
                  artifact_name=env.get('CI_ARTIFACT_NAME'),
                  checks=[], tests=None, coverage=None, dependencies=None, secrets=None, bundle=None)
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    report['tools']['locked'] = {name: lock['packages'][f'node_modules/{name}']['version']
                                for name in ('typescript', 'tsx', 'esbuild', 'react', 'happy-dom')}

    def check(name, command=None, validate=None, cwd=ROOT, timeout=180):
        before = time.monotonic()
        item = dict(name=name, result='FAIL', seconds=0, exit_code=None)
        report['checks'].append(item)
        try:
            if command:
                with (output / f'{name}.log').open('w') as log:
                    proc = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        item['exit_code'] = proc.wait(timeout=timeout)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait()
                        raise ValueError(f'Timed out after {timeout}s; process group stopped')
            if validate:
                validate()
            if command and item['exit_code'] != 0:
                raise ValueError(f"Command exit {item['exit_code']}; see {name}.log")
            item['result'] = 'PASS'
        except Exception as exc:
            item['detail'] = str(exc)[:500]
        item['seconds'] = round(time.monotonic()-before, 3)
        print(f"{name}: {item['result']} ({item['seconds']}s)", flush=True)
        if item['result'] != 'PASS' and env.get('GITHUB_ACTIONS') == 'true':
            print(f'::error title=CI check failure::{name}: see retained diagnostics', flush=True)

    if mode == 'source':
        check('report-contract', [sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts/ci', '-p', 'test_*.py'],
              validate=lambda: report.update(report_contract_tests=unittest_counts(output / 'report-contract.log')))
        check('typecheck', ['npm', 'run', 'typecheck'])
        def test_reports():
            files = json.loads((output / 'test-files.json').read_text())
            if not isinstance(files, list) or any(not isinstance(name, str) or not (ROOT / name).resolve().is_relative_to(ROOT) for name in files):
                raise ValueError('Invalid test-file inventory')
            report['test_files'] = files
            report['tests'] = junit(output / 'junit.xml', files)
            report['coverage'] = coverage(output / 'lcov.info')
            if report['tests']['failed']:
                raise ValueError('JUnit reports failing/cancelled tests')
        check('tests', ['node', 'scripts/test.mjs', '--reports-dir', str(output)], validate=test_reports, timeout=300)
        check('build-permissions', ['npm', 'run', 'build', '--', '--check'])
        check('docs', ['npm', 'run', 'docs:check', '--', '--repository-only'])
        def syntax():
            for path in sorted(ROOT.glob('scripts/*.mjs')):
                subprocess.run(['node', '--check', str(path)], check=True, timeout=10)
            for path in sorted(ROOT.glob('scripts/**/*.py')):
                compile(path.read_text(), str(path), 'exec')
        check('scripts', validate=syntax)
        check('fresh-build', [sys.executable, str(ROOT / 'scripts/ci/fresh_build.py'), str(output / 'bundle.json')],
              validate=lambda: report.update(bundle=bundle(output / 'bundle.json')), timeout=240)
    else:
        for name, args in [('actionlint', ['-version']), ('gitleaks', ['version'])]:
            try:
                report['tools'][name] = subprocess.check_output([name, *args], text=True, timeout=10).strip().splitlines()[0]
            except (OSError, subprocess.SubprocessError, IndexError):
                report['tools'][name] = None  # Each independent check below still runs and fails visibly if unavailable.
        check('actionlint', ['actionlint', '-color', '-shellcheck='])
        check('dependencies', ['npm', 'audit', '--json', '--audit-level=high'],
              validate=lambda: report.update(dependencies=audit(output / 'dependencies.log')), timeout=90)
        def secret_report():
            findings = json.loads((output / 'secrets.json').read_text())
            if not isinstance(findings, list):
                raise ValueError('Malformed secret scan report')
            report['secrets'] = dict(findings=len(findings), severity='not provided by Gitleaks')
            if findings:
                raise ValueError('Secret findings require review')
        # Git history/owner files are excluded: scan only repository-deliverable files.
        with tempfile.TemporaryDirectory(prefix='yttv-secret-scan-') as folder:
            from fresh_build import export_source
            export_source(Path(folder))
            check('secrets', ['gitleaks', 'dir', folder, '--redact=100', '--no-banner', '--report-format=json',
                             f'--report-path={output / "secrets.json"}'], validate=secret_report)
        report['security_data_checked_at_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
        licenses = {}
        for name, package in lock['packages'].items():
            if 'node_modules/' in name:
                license_name = package.get('license', 'UNKNOWN')
                licenses[license_name] = licenses.get(license_name, 0) + 1
        report['license_inventory'] = licenses
    report['result'] = 'PASS' if {c['name'] for c in report['checks']} == set(REQUIRED[mode]) and all(c['result'] == 'PASS' for c in report['checks']) else 'FAIL'
    report['seconds'] = round(time.monotonic()-started, 3)
    report['baseline'] = None
    report['artifact_bytes_before_metrics'] = sum(p.stat().st_size for p in output.iterdir() if p.is_file())
    (output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    rendered = summary(report)
    (output / 'summary.md').write_text(rendered)
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('source', 'security'))
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    sys.exit(run(args.mode, args.output.resolve()))
