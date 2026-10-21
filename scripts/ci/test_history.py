"""History metrics never invent first-attempt success or comparable timing evidence."""
import datetime as dt
import unittest
from history import collect, render, timing

NOW = dt.datetime(2026, 10, 20, 16, tzinfo=dt.timezone.utc)


def run(number, event='push', conclusion='success', attempt=1):
    return dict(id=number, head_sha=str(number), event=event, conclusion=conclusion, run_attempt=attempt,
                created_at='2026-10-20T12:00:00Z', html_url=f'https://github.com/example/repo/actions/runs/{number}')


class History(unittest.TestCase):
    def fake(self, runs, missing=False):
        def get(path):
            if '/workflows/' in path:
                return dict(total_count=len(runs), workflow_runs=runs)
            if '/attempts/1' in path and not path.endswith('/jobs?per_page=100'):
                return dict(conclusion='failure')
            if missing:
                raise OSError('synthetic outage')
            return dict(total_count=2, jobs=[dict(name='source', conclusion='success', started_at='2026-10-20T12:00:10Z', completed_at='2026-10-20T12:00:30Z'),
                                            dict(name='security', conclusion='success', started_at='2026-10-20T12:00:15Z', completed_at='2026-10-20T12:00:25Z')])
        return get

    def test_events_first_attempt_reruns_and_cancellations_are_separate(self):
        runs = [run(1), run(2, conclusion='failure'), run(3, attempt=2), run(4, conclusion='cancelled'), run(5, 'pull_request')]
        report = collect('example/repo', self.fake(runs), NOW)
        push = report['groups']['push']
        self.assertAlmostEqual(push['first_attempt_pass_percent'], 100 / 3)
        self.assertEqual((push['rerun_runs'], push['extra_attempts'], push['recovered_runs']), (1, 1, 1))
        self.assertEqual(push['conclusions']['cancelled'], 1)
        self.assertEqual(report['groups']['pull_request']['first_attempt_pass_percent'], 100)
        self.assertEqual(push['queue']['median_seconds'], 10)
        self.assertEqual(push['execution_span']['median_seconds'], 20)
        self.assertEqual(report['observed_job_minutes'], 2.5, 'parallel job seconds are resource time, not elapsed time')
        self.assertIsNone(push['execution_span']['p95_seconds'])
        self.assertIsNone(report['baseline'])

    def test_missing_timestamps_remain_null_and_partial(self):
        report = collect('example/repo', self.fake([run(1)], missing=True), NOW)
        self.assertEqual(report['result'], 'PARTIAL')
        self.assertIsNone(report['runs'][0]['queue_seconds'])
        self.assertIsNone(report['groups']['push']['execution_span']['median_seconds'])
        self.assertEqual(len(report['unavailable']), 1)

    def test_empty_history_is_not_a_pass_rate_or_timing(self):
        report = collect('example/repo', self.fake([]), NOW)
        self.assertEqual(report['sample_size'], 0)
        self.assertEqual(report['groups'], {})
        self.assertIn('Sample: 0', render(report))

    def test_limits_and_stale_runs(self):
        for count in (0, 31):
            with self.assertRaises(ValueError):
                collect('example/repo', self.fake([]), NOW, count)
        old = {**run(1), 'created_at': '2026-08-01T00:00:00Z'}
        self.assertEqual(collect('example/repo', self.fake([old]), NOW)['sample_size'], 0)
        self.assertEqual(timing(list(range(20)))['p95_seconds'], 18)

    def test_untrusted_step_names_are_escaped_and_not_executed(self):
        report = collect('example/repo', self.fake([run(1, event='<script>|\ninjected')]), NOW)
        report['reporter'] = dict(sha='synthetic', ref='<script>', python='3.14', platform='synthetic')
        self.assertIn('Reporter:', render(report))
        self.assertNotIn('<script>', render(report))


if __name__ == '__main__':
    unittest.main()
