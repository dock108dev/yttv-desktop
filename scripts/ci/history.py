"""Read at most 30 CI runs over 30 days. Advisory metadata only; never download/execute reports."""
import argparse
from collections import Counter
import datetime as dt
import json
import math
import os
from pathlib import Path
import platform
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from run import escaped


def stamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))


def duration(start, end):
    try:
        value = (stamp(end) - stamp(start)).total_seconds()
        return value if value >= 0 else None
    except (ValueError, TypeError, AttributeError):
        return None


def timing(values):
    values = [value for value in values if value is not None]
    return dict(samples=len(values), median_seconds=statistics.median(values) if values else None,
                p95_seconds=sorted(values)[math.ceil(.95 * len(values)) - 1] if len(values) >= 20 else None)


def collect(repo, get, now, limit=30):
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', repo) or not 1 <= limit <= 30:
        raise ValueError('Use owner/repo and 1–30 runs')
    since = (now - dt.timedelta(days=30)).date().isoformat()
    data = get(f'/repos/{repo}/actions/workflows/ci.yml/runs?' + urllib.parse.urlencode(
        dict(per_page=limit, status='completed', created=f'>={since}')))
    runs = data['workflow_runs']
    total = data['total_count']
    if not isinstance(runs, list):
        raise ValueError('Missing workflow run list')
    records, unavailable = [], []
    for run in runs[:limit]:
        if stamp(run['created_at']) < now - dt.timedelta(days=30) or stamp(run['created_at']) > now:
            continue
        record = {key: run[key] for key in ('id', 'head_sha', 'event', 'conclusion', 'run_attempt', 'created_at', 'html_url')}
        record.update(first_attempt=None, queue_seconds=None, execution_span_seconds=None, job_seconds=None,
                      failed_jobs=[], failed_steps=[])
        if run['run_attempt'] == 1:
            record['first_attempt'] = run['conclusion']
        else:
            try:
                record['first_attempt'] = get(f'/repos/{repo}/actions/runs/{run["id"]}/attempts/1')['conclusion']
            except (OSError, ValueError, KeyError) as error:
                unavailable.append(dict(run_id=run['id'], evidence='first attempt', error=type(error).__name__))
        try:
            data = get(f'/repos/{repo}/actions/runs/{run["id"]}/attempts/{run["run_attempt"]}/jobs?per_page=100')
            jobs = data['jobs']
            if not jobs or len(jobs) != data['total_count'] or any(not job.get('started_at') or not job.get('completed_at') for job in jobs):
                raise ValueError('Incomplete job timestamps/list')
            start, end = min(job['started_at'] for job in jobs), max(job['completed_at'] for job in jobs)
            record['queue_seconds'] = duration(run['created_at'], start)
            record['execution_span_seconds'] = duration(start, end)
            seconds = [duration(job['started_at'], job['completed_at']) for job in jobs]
            record['job_seconds'] = sum(seconds) if all(n is not None for n in seconds) else None
            record['failed_jobs'] = [job['name'] for job in jobs if job['conclusion'] == 'failure']
            record['failed_steps'] = [step['name'] for job in jobs for step in job.get('steps', []) if step['conclusion'] == 'failure']
        except (OSError, ValueError, KeyError) as error:
            unavailable.append(dict(run_id=run['id'], evidence='jobs', error=type(error).__name__))
        records.append(record)
    groups = {}
    for event in sorted({r['event'] for r in records}):
        rows = [r for r in records if r['event'] == event]
        eligible = [r for r in rows if r['first_attempt'] in ('success', 'failure', 'timed_out', 'action_required')]
        groups[event] = dict(runs=len(rows), conclusions=dict(Counter(r['conclusion'] for r in rows)),
            first_attempt_observed=len(eligible), first_attempt_pass_percent=100 * sum(r['first_attempt'] == 'success' for r in eligible) / len(eligible) if eligible else None,
            rerun_runs=sum(r['run_attempt'] > 1 for r in rows), extra_attempts=sum(r['run_attempt'] - 1 for r in rows),
            recovered_runs=sum(r['run_attempt'] > 1 and r['first_attempt'] == 'failure' and r['conclusion'] == 'success' for r in rows),
            queue=timing([r['queue_seconds'] for r in rows]), execution_span=timing([r['execution_span_seconds'] for r in rows]),
            failure_steps=dict(Counter(step for r in rows for step in r['failed_steps'])))
    measured_jobs = [r['job_seconds'] for r in records if r['job_seconds'] is not None]
    return dict(schema_version=1, result='UNAVAILABLE' if not records else 'PARTIAL' if unavailable else 'PASS', repository=repo,
                sampled_at_utc=now.isoformat(), window_days=30, max_runs=limit, sample_size=len(records),
                server_total=total, groups=groups, runs=records, unavailable=unavailable,
                observed_job_minutes=sum(measured_jobs) / 60 if measured_jobs else None,
                critical_path_seconds=None, billing_cost=None, quota=None, baseline=None,
                comparability='Descriptive workflow history across SHAs/configurations; no comparable performance baseline. Latest-attempt job times only; not billed minutes. Rerun recovery alone is not a flake diagnosis.')


def render(report):
    def measured(value):
        return f'{value:.2f}' if value is not None else 'unavailable'
    rows = ['## CI health — ' + escaped(report['result']), '',
            f"Metadata only: up to {report['max_runs']} completed CI runs in the last 30 days; sampled {escaped(report['sampled_at_utc'])}.",
            f"Sample: {report['sample_size']}; observed latest-attempt job minutes: {measured(report.get('observed_job_minutes'))}. Quota/cost and DAG critical path unavailable.", '',
            '| Event | Runs | First-attempt pass | Rerun runs | Queue median s | Execution-span median / p95 s |',
            '| --- | ---: | --- | ---: | --- | --- |']
    if report.get('reporter'):
        rows[2:2] = [f"Reporter: {escaped(json.dumps(report['reporter']))}", '']
    for event, group in report.get('groups', {}).items():
        rows.append(f"| {escaped(event)} | {group['runs']} | {measured(group['first_attempt_pass_percent'])} ({group['first_attempt_observed']} observed; %) | {group['rerun_runs']} | {measured(group['queue']['median_seconds'])} | {measured(group['execution_span']['median_seconds'])} / {measured(group['execution_span']['p95_seconds'])} |")
    rows += ['', escaped(report.get('comparability', 'Metadata unavailable; inspect health.json.')),
             'Cancelled/skipped runs are separate conclusions and excluded from pass-rate denominators. p95 needs at least 20 timestamp samples per event.',
             'No failing tests are retried, no baselines replaced and no repository settings changed. Run links, failure steps, missing-data reasons and timestamps: health.json in this run’s 7-day artifact.']
    return '\n'.join(rows) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--limit', type=int, default=30)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.limit <= 30 or not re.fullmatch(r'[\w.-]+/[\w.-]+', args.repository):
        parser.error('Use owner/repo and 1–30 runs')
    args.output.mkdir(parents=True, exist_ok=False)
    deadline = time.monotonic() + 240
    def get(path):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Metadata collection deadline')
        headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
        if os.environ.get('GH_TOKEN'):
            headers['Authorization'] = 'Bearer ' + os.environ['GH_TOKEN']
        request = urllib.request.Request('https://api.github.com' + path, headers=headers)
        with urllib.request.urlopen(request, timeout=min(20, remaining)) as response:
            data = response.read(4 * 1024 * 1024 + 1)
        if len(data) > 4 * 1024 * 1024:
            raise ValueError('Metadata response too large')
        return json.loads(data)
    now = dt.datetime.now(dt.timezone.utc)
    try:
        report = collect(args.repository, get, now, args.limit)
    except (OSError, ValueError, KeyError) as error:
        report = dict(schema_version=1, result='UNAVAILABLE', sample_size=0, max_runs=args.limit, sampled_at_utc=now.isoformat(),
                      groups={}, unavailable=[dict(evidence='run history', error=type(error).__name__)])
    report['reporter'] = dict(sha=os.environ.get('GITHUB_SHA'), ref=os.environ.get('GITHUB_REF'), event=os.environ.get('GITHUB_EVENT_NAME'),
                             run_id=os.environ.get('GITHUB_RUN_ID'), run_attempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
                             platform=platform.platform(), python=platform.python_version(),
                             run_url=(f"https://github.com/{args.repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}" if os.environ.get('GITHUB_RUN_ID') else None))
    (args.output / 'health.json').write_text(json.dumps(report, indent=2) + '\n')
    rendered = render(report)
    (args.output / 'summary.md').write_text(rendered)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(rendered)
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
