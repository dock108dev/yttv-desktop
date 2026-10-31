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

Local `npm test` and CI share recursive `.test.ts`/`.test.tsx` discovery under `tests`, `apps` and `packages`. CI requires an unskipped JUnit case for each discovered file. A disposable source export independently installs the lockfile, builds the extension, validates manifest content scripts, all three dynamically injected provider scripts, and all four HTML pages with their referenced assets, and serves the fixture preview. It leaves local build output untouched.

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

Health reports separate first-attempt results, rerun recovery and cancellations. Cancelled/skipped runs are excluded from pass-rate denominators. Queue time runs from creation to first job start for first attempts only; rerun queue time stays null because an enqueue timestamp is unavailable; execution span runs from first job start to last completion. Summed job seconds describe observed execution, not billing.

Medians use available samples; p95 requires at least 20 samples per event. Missing metadata remains null or PARTIAL with a reason. Requests have time and size limits, a 240-second overall deadline and a one-page run limit. Recovery on rerun alone does not identify a flaky test, and historical runs across revisions are not a regression baseline. Account quota, billing and unavailable coverage/size comparisons are not inferred.

## Check map and deliberate omissions

All source/security checks below are required by the workflow aggregate when selected; branch enforcement remains a recommended setting.

| Area / product risk | Exact workflow / job / command | Event / platform | Policy | Reason / evidence |
| --- | --- | --- | --- | --- |
| Types and unused code | CI / source / `npm run typecheck` | PR, main push, weekly/manual; Ubuntu, selected macOS | Required | Strict TypeScript, noUnusedLocals/noUnusedParameters across Chrome, packages and tests. No second general-purpose linter configured; adding a style ruleset would require broad unrelated cleanup. |
| Reporting false greens | CI / source / `python3 -m unittest discover -s scripts/ci -p 'test_*.py'` | Same | Required | Executes real aggregate script plus missing/failing/skipped/invalid report, collection, build-asset and history fixtures. |
| Product behavior and UI journeys | CI / source / `node scripts/test.mjs --reports-dir OUTPUT` | Same | Required | Recursively includes all application/package/test suites, persistence/recovery, provider refusal, worker lifecycle, keyboard focus and fixture UI. Per-file collection guard, JUnit and LCOV. |
| Compilation/privilege drift | CI / source / `npm run build -- --check` | Same | Required | Bundles every Chrome entry and checks exact manifest permissions/CSP; no retained-output writes. |
| Documentation and executable scripts | CI / source / `npm run docs:check -- --repository-only`; `scripts` check in `run.py` | Same | Required | Portable links/manifests, Node syntax and Python compilation. No authored shell scripts; embedded workflow syntax is checked by actionlint. No formatter policy exists; repo-wide reformat is intentionally omitted. |
| Reproducibility/distribution | CI / source / `python3 scripts/ci/fresh_build.py OUTPUT/bundle.json` | Same | Required | Disposable deliverable export, independent `npm ci`, strict types/docs/build, all packaged assets including runtime-injected providers, JS syntax and ephemeral loopback smoke. Includes proposed nonignored additions locally; hosted checkout can only test committed files. |
| Workflow security | CI / security / `actionlint -color -shellcheck=` | PR, push, schedule/manual; Ubuntu | Required | Pinned CLI; SHA-pinned actions, read-only permissions, no secrets/privileged PR events, always-run aggregate, no path filters or blanket continue-on-error. |
| Dependencies and licenses | CI / security / `npm audit --json --audit-level=high` | Same | Required scan; license inventory advisory | High/critical and registry/report failures block; all severities reported, no suppressions. Lockfile licenses counted without legal-policy claims. OSV would overlap the current npm-only scan; not added. |
| Secrets | CI / security / `gitleaks dir EXPORT --redact=100 --no-banner --report-format=json --report-path=OUTPUT/secrets.json` | Same | Required | Deliverable export only, no owner files or history; findings/outage fail. No new SaaS upload. |
| Coverage and size | CI / source / LCOV plus `bundle.json` | Same | Advisory measurements; required report validity | File/line/branch counters and bytes/SHA-256 per asset. No like-for-like baseline or justified blocking budget; changed-code coverage and deltas remain unavailable. |
| Compatibility | CI / source matrix | Ubuntu PR/main; macOS 15 weekly/manual | Required when selected | Node 24 and Python 3.14; no Safari/native executable, Windows-specific client or backend/service matrix to qualify. Live Chrome version/OS behavior is separate user-operated evidence. |
| Reliability/resources | CI health / `python3 scripts/ci/history.py --repository OWNER/REPO --limit 30 --output OUTPUT` | Weekly/manual Ubuntu | Advisory, independent | Bounded read-only metadata; first attempts, reruns, failure steps, queue/execution medians, p95 only at 20 samples; measured job minutes are not billing. Python runtime is explicitly selected. |
| Database/migrations/containers/IaC | None | N/A | N/A | No database, sidecar, container or deployed infrastructure. Storage/schema compatibility uses synthetic product tests. |
| Native playback/accessibility/performance | Existing synthetic UI tests; no protected-player automation | Local fixture / manual device evidence | Limited automated scope | Keyboard/focus checks exist. Lighthouse scores for a fixture page would not measure native playback or extension performance; no lab score gate or benchmark trend is invented. |
| Release/provenance/signing | None | N/A | Separate authorization | No publishing workflow or distributable signing process exists; ordinary CI cannot install, Reload or publish. |

Source and security run independently, with `Repository checks` depending on both. Only the compatibility matrix is shared; no reusable workflow/composite action is justified for the short one-off steps. Push checks test merged state, weekly checks refresh external advisory data and broaden platform coverage. Workflow dispatch is limited to a boolean compatibility input; health accepts a validated integer 1–30. No branch/path filters can strand a PR check.

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
