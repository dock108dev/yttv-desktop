# Tests

`npm test` runs synthetic unit, DOM and mocked Chrome tests from the repository root. Local and CI use `scripts/test.mjs` to discover `.test.ts`/`.test.tsx` files recursively in tests/apps/packages, excluding dependency and build folders; zero collection fails. CI also requires an unskipped JUnit case from each discovered file. No live account, provider or player operations occur. For focused checks:

```sh
node --import tsx --test tests/ssot.test.ts
node --import tsx --test tests/window-recovery.test.ts
node --import tsx --test packages/ui/src/behavior.test.ts
```

Policy tests protect URL validation, capacity, cached-target refusal, saved-schema sanitation and audio compensation. Worker tests cover ownership, recovery, guide discovery and control cancellation; `helpers/viewing-worker.ts` supplies a reusable mocked browser. Adapter tests use synthetic DOM/player state. UI tests use Happy DOM and React `act` to settle effects and interactions.

`ssot.test.ts` also checks agreement between supported counts in geometry, custom storage and IPC, shared preference merging in the worker/preview, worker use of the storage write queue, and rejection of removed layout/selection commands. Layout and journey tests save through the shared area/layout path.

It also guards storage-owned preference validation in the preview/IPC and delegation from all optional-provider content entries to `provider-content.ts`. `provider-content.test.ts` checks the shared protocol namespaces, sender/service isolation, one-time top-frame installation, generation invalidation and original reply nonce after a rebind. Existing packaged YouTube/Prime/Netflix bridge tests exercise their actual adapter factories through that installer.

`new-show.test.ts` covers cold startup from the remote, default channel selection, mute before navigation, waiting for native player readiness, one Play request, repeated clicks, four-show capacity, native fallback, explicit retry and cancellation. Remote UI tests cover the first-use action and opening/full states.

New-show fixtures also hide initial tab metadata and ordinary blank-tab URLs, matching permission-limited reads. `player-window.test.ts` checks delayed preparation-page identity, moved/shared/repurposed tab refusal and storage compatibility. Interrupted legacy claims require explicit closure confirmation before retry; neither these fixtures nor a preparation-page commit proves provider playback.

The geometry, layout-editor, workspace, domain, remote UI/journey and window-recovery suites cover all one-to-four-show presets, separate custom positions per count, full-size pointer screen coordinates, drawing-window ownership/cancel/save, shared preview/placement, Add preflight, channel replacement, bounds/rollback, Expand/Restore and recovery. Pure planning/coordinate assertions are in `geometry.test.ts`; mocked browser lifecycle and placement are in `workspace.test.ts`. These synthetic checks cannot validate placement on a physical monitor.

The UI suite also verifies shortcut draft discard, focus trapping and return to the launcher after the dialog closes, in addition to saved bindings and conflict rejection.

`docs-check.test.ts` checks portable documentation validation, including exclusion of ignored working notes and detection of broken links. `scripts/ci/test_*.py` covers report validation, the actual aggregate gate, failure/missing/setup outcomes, recursive test discovery, drawing assets and bounded history metrics. Source CI runs these contract tests before the product tests; the workflow and check map is in [CI](../docs/CI.md).

CI contracts also require all three dynamically injected provider scripts in real builds and bundle reports, preserve artifact names through finalization and exclude unknown rerun queue times from latency metrics. Guide-sync timer tests use a controlled Node clock to verify settlement/timeout boundaries without depending on host load; native browser evidence remains separate.

[Fixtures](fixtures/README.md) are illustrative inputs. Mocks cannot prove entitlements, visible playback, heard audio or actual Chrome restoration. See [development](../docs/DEVELOPMENT.md) and [architecture](../docs/ARCHITECTURE.md).

`media-queue.test.ts` and `mixed-worker.test.ts` cover URL/storage bounds, failed writes, durable consumption, stale/duplicate intents, shared legacy/queue reservations, interruption before ownership save, exact late cleanup, unsupported providers and no automatic recovery playback. Remote UI/journey tests cover queue edits, replacement choice, focus and stable slot ordering alongside Return, placement and settings.

`youtube-adapter.test.ts` provides coverage for native DOM identity, controls/readback, ads/live/buffering/ended guards and URL boundaries; `youtube-bridge.test.ts` exercises the packaged bridge and actual adapter with top-frame, nonce and superseded-binding guards; `youtube-worker.test.ts` covers mixed startup/replacement, Connect, permissions, sender/document guards, crash-safe consumption, conservative audio and exact build audit. `remote-ui.test.ts` covers permission denial, disabled provider controls and native fallback. These are synthetic tests, not provider playback evidence.

Prime negative adapter/bridge fixtures are in `prime-video-adapter.test.ts`; permission, attention ownership, recovery, replacement refusal, mixed capacity/audio and origin guards are in `prime-video-worker.test.ts`. Remote permission/native-fallback behavior is in `remote-ui.test.ts`. They deliberately do not contain positive Prime playback/control evidence.

Netflix negative adapter/packaged bridge and parser boundaries are in `netflix-adapter.test.ts`; service permissions, attention launch/recovery, shared capacity, replacement refusal, late callbacks, cleanup, audio and connection rejection are in `netflix-worker.test.ts`. The remote test covers the direct permission gesture, denial and disabled controls/native fallback. These fixtures contain no positive Netflix playback evidence. Supported-provider consumption-save/retry, layouts, Return and settings remain covered by the shared worker/regression suites.

## Focused regression review

| Behavior / scenario | Test references | Failure caught and test boundary | Disposition |
| --- | --- | --- | --- |
| Automatic connection, overflow and retry | `auto-connect.test.ts`, automatic-start case in `remote-ui.test.ts`, `remote-journey.test.ts` | Prevents arbitrary adoption of five players, retry loops and audio changes; pure coordinator, simulated DOM and actual bundled worker with Chrome fakes | Keep |
| Prepared windows and interrupted opening | `player-window.test.ts`, `new-show.test.ts`, `mixed-worker.test.ts` | Refuses missing/foreign identity, preserves uncertain capacity and checks mute before navigation; synthetic browser/storage failures | Keep |
| Saved window positions | Save-position cases in `workspace.test.ts` | Checks no browser mutations, exact later restore and refusal of changed identity/bounds; changing title/audio metadata remains allowed | Strengthened |
| Unobstructed original player | `chrome-runtime.test.ts`, `chrome-integration.test.ts` | Checks hidden page controls and idempotent hide after stale saved drawer state; packaged content/worker with DOM and Chrome fakes | Strengthened |
| Drawing and remote startup | `layout-editor.test.ts`, `remote-launch.test.ts` | Checks actual HTML module loading contract, sender identity and explicit launch/storage failures; synthetic runtime | Keep |
| Required distribution assets | `scripts/ci/test_contract.py` | Missing preparation page must fail output validation and report qualification; disposable files, no installed browser | Strengthened |

The table covers the recent remote, connection, preparation and placement changes; it is not an audit of every repository test. Local focused runs use explicit Node test-file arguments because the current runner has recursive discovery but no dependency-based selector or reusable result cache. Full CI discovery remains unchanged. Prior results are reusable only when all relevant source, tests, configuration and dependencies are unchanged.

## Verification limits

Synthetic checks cannot establish which build Chrome loaded, provider access, pictures, heard sound, physical monitor placement or owner acceptance. Prime Video and Netflix have negative capability fixtures, not positive playback evidence. User-operated native checks and exact-commit hosted CI are separate from local source validation. Generated reports remain ignored and are not prerequisites for reading this documentation.

The compact remote checks cover collapsed optional services, connected-only counts, visible interrupted-opening recovery, closure failure/retry, and unobstructed playback without page launchers. A synthetic browser preview at 380 × 570 confirmed the two-player controls fit without scrolling; it does not establish installed playback.

Existing-player UI checks cover a visible two-player list, serial Connect all, and direct permission gestures. Workspace tests verify Save current positions writes a recoverable custom layout without window/audio mutations, restores exact positions later, and refuses shared/minimized/offscreen/moving windows. The journey checks reconnecting an outdated original adapter without navigation.

`auto-connect.test.ts` covers automatic one-to-four connection, overflow, detection errors, partial failure and explicit retries. Remote tests cover automatic startup and suppression of repeated failed attempts. Drawing tests check the actual HTML module declaration, startup fallback and extension-page sender identity without a tab. These checks remain synthetic.
