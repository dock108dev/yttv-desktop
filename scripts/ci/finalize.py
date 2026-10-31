"""Always-run report validation, including setup failures before the check runner."""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import platform
import sys
from run import REQUIRED, audit, bundle, coverage, input_identity, junit, summary, unittest_counts


def finalize(mode, output, outcome):
    output.mkdir(parents=True, exist_ok=True)
    path = output / 'metrics.json'
    try:
        report = json.loads(path.read_text())
        for key in ('schema_version', 'mode', 'checks', 'identity', 'seconds', 'tools', 'platform', 'node', 'python'):
            if key not in report:
                raise ValueError('Incomplete metrics record')
        if report['schema_version'] != 1 or not math.isfinite(report['seconds']) or report['seconds'] < 0:
            raise ValueError('Invalid metrics schema or duration')
        if not {'sha', 'event', 'ref', 'pr_head', 'inputs_sha256', 'run_url'} <= report['identity'].keys():
            raise ValueError('Incomplete candidate identity')
        checks = report['checks']
        if report['mode'] != mode or len(checks) != len(REQUIRED[mode]) or {c['name'] for c in checks} != set(REQUIRED[mode]):
            raise ValueError('Missing/duplicate required checks')
        if report['identity']['inputs_sha256'] != input_identity():
            raise ValueError('Report does not match checked source')
        if os.environ.get('GITHUB_SHA') and report['identity']['sha'] != os.environ['GITHUB_SHA']:
            raise ValueError('Report does not match tested SHA')
        for item in checks:
            if item['result'] not in ('PASS', 'FAIL') or not math.isfinite(item['seconds']) or item['seconds'] < 0:
                raise ValueError('Invalid check outcome')
            if item['result'] == 'PASS' and item['name'] != 'scripts':
                if item.get('exit_code') != 0 or not (output / (item['name'] + '.log')).is_file():
                    raise ValueError('Missing command result/log')
        passed = {c['name'] for c in checks if c['result'] == 'PASS'}
        if mode == 'source':
            if 'tests' in passed:
                if report['tests'] != junit(output / 'junit.xml', report['test_files']) or report['tests']['failed']:
                    raise ValueError('Test counts disagree or fail')
                if report['coverage'] != coverage(output / 'lcov.info'):
                    raise ValueError('Coverage disagrees')
            if 'report-contract' in passed:
                counts = unittest_counts(output / 'report-contract.log')
                if counts['failures'] or counts['errors']:
                    raise ValueError('Report-contract tests failed')
            if 'fresh-build' in passed and report['bundle'] != bundle(output / 'bundle.json'):
                raise ValueError('Bundle report disagrees')
        else:
            if 'dependencies' in passed:
                counts = audit(output / 'dependencies.log')
                if counts != report['dependencies'] or counts['high'] or counts['critical']:
                    raise ValueError('Dependency report disagrees or blocks')
            if 'secrets' in passed and json.loads((output / 'secrets.json').read_text()) != []:
                raise ValueError('Secret report is missing or has findings')
        report['result'] = 'PASS' if outcome == 'success' and len(passed) == len(checks) else 'FAIL'
        if outcome != 'success':
            report['checks'].append(dict(name='job-execution', result='FAIL', seconds=0,
                                         detail=f'Check step outcome: {outcome or "NOT RUN"}; inspect setup and command logs.'))
    except Exception as error:
        if path.exists():
            path.replace(output / 'metrics-invalid.json')
        report = dict(schema_version=1, mode=mode, result='FAIL', seconds=0, platform=platform.platform(),
                      node='unavailable', python=platform.python_version(), tools={},
                      started_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                      artifact_name=os.environ.get('CI_ARTIFACT_NAME'),
                      identity=dict(sha=os.environ.get('GITHUB_SHA', 'local-worktree'), ref=os.environ.get('GITHUB_REF', 'local-worktree'),
                                    event=os.environ.get('GITHUB_EVENT_NAME', 'local'), pr_head=os.environ.get('PR_HEAD_SHA'),
                                    inputs_sha256=None, run_url=None),
                      checks=[dict(name=name, result='NOT RUN', seconds=0,
                                   detail='Required evidence unavailable; setup or report validation failed.') for name in REQUIRED[mode]])
        report['checks'].append(dict(name='report-validation', result='FAIL', seconds=0,
                                     detail=f'{type(error).__name__}: required reports missing, malformed or inconsistent; inspect diagnostics.'))
    # The workflow supplies the upload identity to this always-run step, including setup failures.
    report['artifact_name'] = os.environ.get('CI_ARTIFACT_NAME') or report.get('artifact_name')
    path.write_text(json.dumps(report, indent=2) + '\n')
    rendered = summary(report)
    (output / 'summary.md').write_text(rendered)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(rendered)
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=REQUIRED)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--outcome', required=True, choices=('success', 'failure', 'cancelled', 'skipped', ''))
    args = parser.parse_args()
    sys.exit(finalize(args.mode, args.output.resolve(), args.outcome))
