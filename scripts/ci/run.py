"""Bounded, offline product checks or registry-backed security checks with reports.

Reports are evidence only. No browser, installation, publishing or owner-state access.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
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

ROOT = Path(__file__).resolve().parents[2]


def junit(path):
    tree = ET.parse(path)
    cases = list(tree.iter('testcase'))
    if not cases:
        raise ValueError('Missing test collection: zero testcases')
    failed = [c for c in cases if c.find('failure') is not None or c.find('error') is not None]
    skipped = [c for c in cases if c.find('skipped') is not None]
    if len(skipped) == len(cases):
        raise ValueError('All tests skipped')
    return dict(total=len(cases), passed=len(cases)-len(failed)-len(skipped),
                failed=len(failed), skipped=len(skipped),
                case_seconds=sum(float(c.get('time', '0')) for c in cases),
                failures=[c.get('name', 'unnamed')[:240] for c in failed][:10])


def coverage(path):
    values = {k: 0 for k in ('LF', 'LH', 'BRF', 'BRH')}
    files = 0
    for line in path.read_text().splitlines():
        key, _, value = line.partition(':')
        if key == 'SF':
            files += 1
        if key in values:
            values[key] += int(value)
    if not files or not values['LF']:
        raise ValueError('Empty/malformed required coverage')
    if any(n < 0 for n in values.values()) or values['LH'] > values['LF'] or values['BRH'] > values['BRF']:
        raise ValueError('Invalid coverage counts')
    return dict(files=files, lines_percent=100*values['LH']/values['LF'],
                branches_percent=100*values['BRH']/values['BRF'] if values['BRF'] else None,
                **values)


def audit(path):
    data = json.loads(path.read_text())
    if data.get('error') or data.get('auditReportVersion') != 2:
        raise ValueError('Audit unavailable or unsupported report')
    counts = data['metadata']['vulnerabilities']
    for severity in ('info', 'low', 'moderate', 'high', 'critical'):
        if not isinstance(counts[severity], int) or counts[severity] < 0:
            raise ValueError('Malformed severity count')
    return counts


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
        if key in report:
            rows.extend(['', f"{key}: {escaped(json.dumps(report[key]))}"])
    if 'bundle' in report:
        rows.extend(['', f"Bundle: {report['bundle']['total_bytes']} bytes; fixture smoke: {report['bundle']['fixture_smoke']}; baseline unavailable."])
    blocker = next((c['name'] for c in report['checks'] if c['result'] != 'PASS'), None)
    rows.extend(['', f"Next action: inspect {escaped(blocker)} diagnostics." if blocker else
                 'All applicable checks passed. Hosted/browser playback and owner acceptance are separate.',
                 'Full logs, JUnit, LCOV and metrics.json: this job’s run-specific artifact (7 days).',
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
                  checks=[])
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
        files = sorted(ROOT.glob('tests/*.test.ts')) + sorted(ROOT.glob('packages/ui/src/*.test.ts'))
        report['test_files'] = [str(p.relative_to(ROOT)) for p in files]
        if not files:
            check('tests', validate=lambda: junit(output / 'missing.xml'))
        else:
            def test_reports():
                report['tests'] = junit(output / 'junit.xml')
                report['coverage'] = coverage(output / 'lcov.info')
                if report['tests']['failed']:
                    raise ValueError('JUnit reports failing/cancelled tests')
            check('tests', ['node', '--import', 'tsx', '--test', '--test-timeout=60000',
                  '--experimental-test-coverage', '--test-coverage-include=apps/**', '--test-coverage-include=packages/**',
                  '--test-coverage-exclude=**/*.test.ts', '--test-reporter=junit',
                  f'--test-reporter-destination={output / "junit.xml"}', '--test-reporter=lcov',
                  f'--test-reporter-destination={output / "lcov.info"}', *map(str, files)], validate=test_reports, timeout=300)
        check('build-permissions', ['npm', 'run', 'build', '--', '--check'])
        check('docs', ['npm', 'run', 'docs:check', '--', '--repository-only'])
        def syntax():
            for path in sorted(ROOT.glob('scripts/*.mjs')):
                subprocess.run(['node', '--check', str(path)], check=True, timeout=10)
            for path in sorted(ROOT.glob('scripts/**/*.py')):
                compile(path.read_text(), str(path), 'exec')
        check('scripts', validate=syntax)
        check('fresh-build', [sys.executable, str(ROOT / 'scripts/ci/fresh_build.py'), str(output / 'bundle.json')],
              validate=lambda: report.update(bundle=json.loads((output / 'bundle.json').read_text())), timeout=180)
    else:
        for name, args in [('actionlint', ['-version']), ('gitleaks', ['version'])]:
            report['tools'][name] = subprocess.check_output([name, *args], text=True, timeout=10).strip().splitlines()[0]
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
    report['result'] = 'PASS' if all(c['result'] == 'PASS' for c in report['checks']) else 'FAIL'
    report['seconds'] = round(time.monotonic()-started, 3)
    report['baseline'] = None
    report['artifact_bytes_before_metrics'] = sum(p.stat().st_size for p in output.iterdir() if p.is_file())
    (output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    rendered = summary(report)
    (output / 'summary.md').write_text(rendered)
    if env.get('GITHUB_STEP_SUMMARY'):
        with open(env['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(rendered)
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('source', 'security'))
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    sys.exit(run(args.mode, args.output.resolve()))
