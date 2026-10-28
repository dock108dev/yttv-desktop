# Tests

`npm test` runs synthetic unit, DOM and mocked Chrome tests from the repository root. Local and CI use `scripts/test.mjs` to discover `.test.ts`/`.test.tsx` files recursively in tests/apps/packages, excluding dependency and build folders; zero collection fails. CI also requires an unskipped JUnit case from each discovered file. No live account, provider or player operations occur. For focused checks:

```sh
node --import tsx --test tests/ssot.test.ts
node --import tsx --test tests/window-recovery.test.ts
node --import tsx --test packages/ui/src/behavior.test.ts
```

Policy tests protect URL validation, capacity, cached-target refusal, saved-schema sanitation and audio compensation. Worker tests cover ownership, recovery, guide discovery and control cancellation; `helpers/viewing-worker.ts` supplies a reusable mocked browser. Adapter tests use synthetic DOM/player state. UI tests use Happy DOM and React `act` to settle effects and interactions.

`ssot.test.ts` also checks agreement between supported counts in geometry, custom storage and IPC, shared preference merging in the worker/preview, worker use of the storage write queue, and rejection of removed layout/selection commands. Layout and journey tests save through the shared area/layout path.

`new-show.test.ts` covers cold startup from the remote, default channel selection, mute before navigation, waiting for native player readiness, one Play request, repeated clicks, four-show capacity, native fallback, explicit retry and cancellation. Remote UI tests cover the first-use action and opening/full states.

The geometry, layout-editor, workspace, domain, remote UI/journey and window-recovery suites cover all one-to-four-show presets, separate custom positions per count, full-size pointer screen coordinates, drawing-window ownership/cancel/save, shared preview/placement, Add preflight, channel replacement, bounds/rollback, Expand/Restore and recovery. Pure planning/coordinate assertions are in `geometry.test.ts`; mocked browser lifecycle and placement are in `workspace.test.ts`. These synthetic checks cannot validate placement on a physical monitor.

The UI suite also verifies shortcut draft discard, focus trapping and return to the launcher after the dialog closes, in addition to saved bindings and conflict rejection.

`docs-check.test.ts` checks portable documentation validation, including exclusion of ignored working notes and detection of broken links. `scripts/ci/test_*.py` covers report validation, the actual aggregate gate, failure/missing/setup outcomes, recursive test discovery, drawing assets and bounded history metrics. Source CI runs these contract tests before the product tests; the workflow and check map is in [CI](../docs/CI.md).

[Fixtures](fixtures/README.md) are illustrative inputs. Mocks cannot prove entitlements, visible playback, heard audio or actual Chrome restoration. See [development](../docs/DEVELOPMENT.md) and [architecture](../docs/ARCHITECTURE.md).

## Verification status

Current source `8376ee3` (extension 0.2.15, including dependency maintenance) passed [hosted Ubuntu CI](../docs/CI.md#verified-execution) on October 25, 2026. That run exercised the shared product-test inventory, Python reporting contracts, strict types, in-memory build, documentation checks and a clean install/build/fixture smoke check. Security ran in its separate passing job. The earlier October 20 pass established the expanded implementation; old notes calling integration tests unexecuted are superseded.

The October 25 documentation audit also passed strict typecheck, in-memory compilation/permission validation and **53 focused synthetic tests**, with no failures, skips or cancellations, using:

```sh
node --import tsx --test tests/ssot.test.ts tests/new-show.test.ts tests/layout-editor.test.ts tests/window-recovery.test.ts tests/remote-journey.test.ts tests/viewing-reliability.test.ts
```

These checks corroborate the documented capacity/storage/audio boundaries, startup, layout drawing, remote journey and recovery. The audit reused the current hosted full-suite result rather than repeating a full CI campaign. Earlier counts of 163 product tests and 17 reporting tests refer to an older local run, not the current test inventory. Neither local checks nor hosted Ubuntu establish hosted macOS execution, CI health, installed Chrome recovery, physical monitor behavior or owner acceptance. Follow the [ordinary-use review](../START_HERE.md#personal-use-scope-and-review) for the latter.
