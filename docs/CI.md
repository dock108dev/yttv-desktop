# Continuous integration

GitHub Actions checks the Chrome extension and shared packages with Node 24 (`.nvmrc`), the root npm lockfile and Python 3.14. Tests and preview smoke checks use synthetic data; they cannot validate installed Chrome behavior, protected playback, account allowance or physical monitors.

## Workflows

The `CI` workflow runs on every pull request, main-branch push, manual dispatch and Monday at 09:23 UTC. Scheduled execution uses the default branch and best-effort timing.

| Job | Checks | Platform |
| --- | --- | --- |
| Source and fixture checks | Python CI contract tests, strict TypeScript, synthetic tests, in-memory compilation, documentation and script syntax, clean build and fixture HTTP smoke | Ubuntu 24.04 |
| Workflow and security checks | actionlint, npm audit and a redacted Gitleaks scan | Ubuntu 24.04 |
| macOS compatibility | The same source checks | macOS 15, scheduled or manual dispatch with `compatibility: true` |
| Repository checks | Requires success from security and every selected source job; failures, skips and cancellations fail the aggregate | Ubuntu 24.04 |

`Repository checks` is the stable aggregate name to use in branch protection. Workflow files do not configure repository protection. Before enabling a merge queue, add the `merge_group` trigger so queued changes receive checks. There are no publishing or release jobs.

The independent `CI health` workflow runs Mondays at 09:53 UTC or manually. It reads metadata for up to 30 completed CI runs from the last 30 days, grouped by event. Its advisory result does not affect `Repository checks`.

## Source checks and reports

Local `npm test` and CI share recursive `.test.ts`/`.test.tsx` discovery under `tests`, `apps` and `packages`. CI requires an unskipped JUnit case for each discovered file. A disposable source export independently installs the lockfile, builds the extension, validates the content scripts and all four HTML pages with their referenced assets, and serves the fixture preview. It leaves local build output untouched.

Source reports include JUnit, LCOV, the discovered test-file list and bundle sizes/hashes. Coverage measures executed application/package code through tsx; tests that bundle and evaluate code do not provide complete original-TypeScript coverage. Coverage and bundle size are advisory, with no percentage or size threshold. Missing or malformed required reports still fail the job.

Every source/security job writes `metrics.json`, `summary.md` and logs. Reports include runtime/tool versions, revision and source-input identifiers, outcomes and timings. Pull-request reports distinguish the tested merge revision from the PR head. Local reports also identify uncommitted input changes.

`finalize.py` runs even after a failed step, validates required raw reports and appends the job summary. Setup failures or absent reports produce explicit NOT RUN entries and a failed result. It cannot turn a failed command into a success. Diagnostics are uploaded with run-, attempt- and platform-specific names and retained for seven days. Runner or checkout failures can prevent reporting; the job and aggregate still cannot pass.

## Security and permissions

External actions use full commit SHAs with version comments. Dependabot checks npm dependencies and action pins weekly. Standalone actionlint and Gitleaks versions and archive checksums live in `scripts/ci/install_tools.py`; review releases before changing those pins.

- actionlint validates workflow syntax and expressions. Separate ShellCheck execution is disabled; the repository has no authored shell scripts.
- `npm audit --json --audit-level=high` checks the lockfile against the configured registry. High/critical findings and registry/report failures fail the job; lower severities remain reported. Dependency names and versions are sent to that registry. The license inventory is informational.
- Gitleaks scans a disposable export of deliverable files with redacted output. Ignored local files and Git history are outside this scan. Findings and scanner failures fail the job.

Ordinary CI has read-only repository contents permission, no application secrets and no persistent checkout credentials. It uses hosted runners and does not use `pull_request_target` or `workflow_run`. CI health additionally has `actions: read`; its token is used only by the bounded metadata reader. It does not download or execute artifacts from prior runs.

PR updates cancel superseded runs for the same PR/event. Push, schedule, manual and health runs have separate concurrency groups. Source checks use the npm cache keyed by platform/runtime/lockfile and must also work without it. Disposable exports and fixture servers are cleaned up after use.

## CI health metrics

Health reports separate first-attempt results, rerun recovery and cancellations. Cancelled/skipped runs are excluded from pass-rate denominators. Queue time runs from creation to first job start; execution span runs from first job start to last completion. Summed job seconds describe observed execution, not billing.

Medians use available samples; p95 requires at least 20 samples per event. Missing metadata remains null or PARTIAL with a reason. Requests have time and size limits, a 240-second overall deadline and a one-page run limit. Recovery on rerun alone does not identify a flaky test, and historical runs across revisions are not a regression baseline. Account quota, billing and unavailable coverage/size comparisons are not inferred.

## Verified execution

On October 20, 2026, [main CI run 39526646940](https://github.com/dock108dev/yttv-desktop/actions/runs/39526646940) completed successfully for commit `f9c85f1` (extension 0.2.15). Source and fixture checks, workflow/security checks and the Repository checks aggregate passed. Both finalizers and diagnostic uploads succeeded; source and security artifacts were present. This establishes hosted Ubuntu execution of the committed implementation, including the UI/geometry cleanup. Job-summary rendering was not visually reviewed.

That push did not select the scheduled/manual macOS job. No CI health runs existed when checked. Neither result can be inferred from the Ubuntu pass or earlier local macOS checks. CI health remains advisory; observing it is separate from the product's correctness gate. These records do not establish installed playback or owner acceptance.

## Local reproduction

For everyday changes, use the focused commands in [development](DEVELOPMENT.md). To reproduce the CI runners, install dependencies and create a fresh output directory:

```sh
npm ci --no-audit --no-fund
ci_dir="$(mktemp -d)"
python3 scripts/ci/run.py source --output "$ci_dir/source"
```

Security reproduction downloads the pinned tools from their official release archives and queries the npm registry:

```sh
python3 scripts/ci/install_tools.py "$ci_dir/tools"
PATH="$ci_dir/tools:$PATH" python3 scripts/ci/run.py security --output "$ci_dir/security"
```

Runners reject nonempty report directories; create another temporary directory before repeating a run. They write reports and return a failing exit status when a check fails. GitHub Actions handles finalization and artifact upload separately. Neither runner installs the extension or accesses a YouTube TV account. See [tests](../tests/README.md) for focused synthetic coverage.
