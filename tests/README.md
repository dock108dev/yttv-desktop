# Tests

`npm test` runs synthetic unit, DOM and mocked Chrome tests from the repository root. No live account, provider or player operations occur. For focused checks:

```sh
node --import tsx --test tests/ssot.test.ts
node --import tsx --test tests/window-recovery.test.ts
node --import tsx --test packages/ui/src/behavior.test.ts
```

Policy tests protect URL validation, capacity, cached-target refusal, saved-schema sanitation and audio compensation. Worker tests cover ownership, recovery, guide discovery and control cancellation; `helpers/viewing-worker.ts` supplies a reusable mocked browser. Adapter tests use synthetic DOM/player state. UI tests use Happy DOM and React `act` to settle effects and interactions.

`docs-check.test.ts` checks portable documentation validation, including ignored working notes and broken links. CI report tests live in `scripts/ci/test_reports.py`.

[Fixtures](fixtures/README.md) are illustrative inputs. Mocks cannot prove entitlements, visible playback, heard audio or actual Chrome restoration. See [development](../docs/DEVELOPMENT.md) and [architecture](../docs/ARCHITECTURE.md).
