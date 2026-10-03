# CI UI scheduling repair

Recorded2026-10-03 EDT; evidence class: local offline DOM/compile/documentation checks. Environment: macOS, Node22.18.0, existing locked dependencies. Parent HEAD `c87c323ca0eb59915f632734996efb20aebfe656`; edited `packages/ui/src/behavior.test.ts` SHA256 `d831a6f8b9a009ed0d8e2ce207df2316bdaf6d535236a1bdd116b9161abccaf2`.

## Problem and repair

The owner-supplied Ubuntu CI log reports zero Sports/Guide rows and Guide remaining visible after QuadBox dispatch. Fixed35ms waits and returning from setup before the snapshot/subscription commit allow these assertions to run early. The previously passing isolated local run did not reproduce those hosted failures.

The local harness now bundles React development `act` with the same UI entry, flushes initial mounting before returning and scopes direct DOM actions to the scheduler. Happy DOM needs minimal task-channel and no-op DevTools profiling support for this test scheduler. Production runtime code is unchanged and production compilation remains a separate check.

Sports fixture observations use the original snapshot timestamp so they precede the mounted UI clock rather than accidentally appearing in the future. Direct fixture preference patches explicitly refresh: Node storage is unavailable and the demo bridge can return before notifying; the UI action runner normally performs that refresh. Assertions for freshness, disabled/cache/fixture controls, keyboard isolation and exact Watch/Add dispatch remain intact.

## Checks and boundary

- `npm run verify:source`: PASS;98/98 tests, strict typecheck, in-memory production build/exact permission audit and portable docs.
- Eight isolated UI-suite processes, four concurrent at a time: PASS;11/11 each,88/88 total. Logs retained locally in `.local/ci-ui-repair`.
- Final documentation and diff checks: PASS.

These checks establish local source/test behavior only. Hosted rerun, installed browser behavior, playback and owner acceptance are NOT RUN. Exit143 indicates termination but the supplied excerpt does not identify cancellation, timeout or another cause. No workflow timeout/cancellation policy was changed. No build output was written, extension reloaded, browser/account accessed, commit pushed or publication performed.

Next bounded action: observe Repository checks on the next authorized hosted run. The integrated Q3-B1 milestone remains active.
