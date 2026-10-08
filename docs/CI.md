# Continuous integration

`.github/workflows/ci.yml` runs on pull requests, main pushes, manual dispatch and a weekly schedule. Node 22 and Python 3.14 are the runner environments. The stable **Repository checks** job requires both source and security jobs to succeed; failure, cancellation or a skipped/missing job cannot pass it.

## Checks and reports

The source job runs strict TypeScript checks, synthetic tests, documentation validation, workflow/script validation and a disposable fresh-source build with fixture HTTP smoke checks. The fresh build installs from the lockfile and verifies generated assets without replacing local build output.

The security job runs high-severity npm dependency auditing and redacted Gitleaks scanning of deliverable files. It does not scan ignored personal files or rewrite Git history. CLI downloads use pinned versions and checksums; download/scanner failures fail the job. Actionlint validates workflow syntax. Dependabot checks npm and GitHub Actions weekly; review CLI pins separately.

Native summaries and artifacts contain check outcomes, timing, test failures/counts, JUnit, LCOV, dependency severity and bundle measurements. Missing or malformed required reports fail checks. Coverage and package size are measurements without arbitrary percentage/size gates. Artifacts have seven-day retention. There are no external report services, automatic PR comments or publishing steps.

## Local reproduction

For ordinary development, use the focused commands in [development](DEVELOPMENT.md). To reproduce the broader CI jobs, use fresh output directories:

```sh
npm ci --no-audit --no-fund
python3 scripts/ci/install_tools.py /tmp/yttv-tools
PATH="/tmp/yttv-tools:$PATH" python3 scripts/ci/run.py security --output /tmp/yttv-security-new
python3 scripts/ci/run.py source --output /tmp/yttv-source-new
python3 -m unittest discover -s scripts/ci -p 'test_*.py'
```

Tool installation downloads official release archives. Security auditing sends dependency names/versions to the configured npm registry. The source job installs dependencies in a disposable export and may start a fixture-only loopback server; cleanup stops that server. These commands require network access and do not access a live YouTube TV account.

## Trust and limitations

Actions are pinned to full commit SHAs. The workflow token has read-only content access and checkout does not persist credentials. There are no secrets, self-hosted runners, `pull_request_target` or release operations. Reports escape contributor-supplied text and are never executed.

Checks qualify source and mocked behavior, not visible playback, account concurrency, real browser restoration, Safari/native support or audible output. Registry/scanner outages fail security validation; absent measurements are not treated as zero. Hosted results must be read from the actual Actions run.
