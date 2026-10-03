# YouTube TV Desktop Client

**Paused by owner — 2026-10-03 EDT:** resume only on request.024 activation/retry is unconfirmed; follow [NEXT_TASK](NEXT_TASK.md) for current-state observation, one-time activation if needed, explicit player recovery and the two-feed Add/Arrange check before the remaining four-player journey. No runtime work during pause.


**Current recovery checkpoint — 2026-10-03:**023 TV-area/start filled the requested area PASS OWNER_REPORTED. Owner then reports only NBC Add enabled after guide refresh, followed by Arrange failure “TV area or feed count is unavailable” and **0 /4 feeds**. Historical original tab is absent; two newer YTTV tabs exist but ownership/creation path is unqualified. No tab silently adopted or closed. Prepared **0.2.4 /1cdc745144268bcc**,116-test/typecheck/build/permission verification PASS: explicit existing-player choice when original missing, archived closed-original return record, no-playback/audio/movement during choice, useful missing-player error and disabled-channel explanations.023 retained. Installed repair NOT RUN; changed024 needs owner-only activation then Use this player → Start → Add/Arrange retry. [Evidence](docs/evidence/runs/20261003-q3-b1-recovery/run.md). Two–four advancing, full controls/Return/stability and first-beta release remain OPEN; broader MVP separate; Prime/Netflix final deferred expansion.


**Current owner authorization — 2026-10-03:** approval of the muted workspace demonstration, existing-entry reload and native refresh are owner-confirmed complete. This supersedes earlier pending activation/approval instructions and the old paused-state baseline. Continue from the observed post-refresh state; no repeat approval/reload/refresh. Installed feature/count proof remains open. [Owner continuation](docs/evidence/runs/20261003-q3-b1-r2/owner-continuation.md).

**Current engineering checkpoint — 2026-10-03:** prepared **0.2.2 /029d311113a6963f**, with **115/115 offline tests**, typecheck, production build/permission audit and docs PASS. Integrated remote → bridge → worker tests now cover four feeds, selected replacement, Close/reflow, native closure, reopen, restart and Return. Repaired Sports Replace, original/selected action labels, persistent feed numbers/selection, paused replacement labels and preservation of manual positioning. This is local fixture proof. The owner has now explicitly confirmed demonstration approval, extension reload and native refresh complete. Installed022 identity is to be recorded during the demonstration; workflow and advancing counts remain unqualified. Reobserve the current player after refresh instead of treating the old paused position as current. No repeat approval, reload or refresh is requested;109 current/retained candidate hashes matched in this review. [Repair and approved demonstration handoff](docs/evidence/runs/20261003-q3-b1-r2/run.md).


**Retained021 checkpoint — 2026-10-03:** installed **0.2.1 / 61a83fecdc9217c6** is owner-confirmed; the frozen candidate retains recorded **113-test** verification, with020 and017 rollback preserved. The goal is **one compact remote that creates and manages up to four TOTAL YouTube TV player windows as one automatically arranged workspace**. Remote opening/usability has partial owner confirmation; integrated arrangement, TV area, controls and simultaneous advancing playback remain unqualified. The earlier detailed questionnaire and named-channel trial are superseded by a practical workflow review; their historical evidence remains retained. Preserve the current paused/player-muted state. No playback-changing approval is inferred from the correction. First beta remains OPEN; broader MVP acceptance is separate, and Prime/Netflix remain the final deferred post-beta expansion. [New lead handoff](docs/LEAD_ENGINEER_HANDOFF.md), [clarification](docs/evidence/runs/20261003-remote-workspace-clarification/run.md).

**Historical source-completion checkpoint — 2026-10-03:** Q3-B1-R1 is COMPLETE for source/verification/freeze: **0.2.1 / 61a83fecdc9217c6**,113/113 offline tests, typecheck and production build/permission audit PASS. Healthy same-build dedupe, invalidated/different-build replacement and fresh usable current-build reconnect confirmation are covered.020 and017 rollback preserved. At that freeze checkpoint, changed021 owner activation/Connection observations were pending; the installed checkpoint above now supersedes that activation instruction. One consolidated installed run remains OPEN for all four first-beta features and advancing counts. No native player/runtime/audio actions occurred during this source-completion stage. Prime/Netflix remain final deferred post-first-beta work, outside beta gates. This disposition supersedes earlier prospective reconnect-repair instructions; earlier candidate evidence retains its own scope. [Source-completion run](docs/evidence/runs/20261003-q3-b1-r1/run.md).

A local Chrome extension centered on one compact remote: browse the observed YouTube TV guide, find Sports programs, add and manage up to four total player windows, and arrange them together in a chosen TV area. The prepared candidate still awaits installed qualification of that complete workflow. YouTube TV owns playback, sign-in and account controls. Guide-based Sports needs no API key; independent live scores are not supplied.

## Quickstart

Requirements: Node22 ([.nvmrc](.nvmrc)), npm, Python3.14 and desktop Chrome for the extension.

```sh
npm ci
npm run verify:source
npm run build
npm run preview
```

Open `http://127.0.0.1:4173` for the illustrative interface. Preview cannot sign in or play video. To use the extension, load `dist/chrome-extension` through Chrome's **Load unpacked** control, then open YouTube TV normally. [Development](docs/DEVELOPMENT.md) covers build effects and updating an existing installation; [usage](START_HERE.md) explains Guide, Sports and audio controls.

`verify:source` checks types, offline tests, compilation/permissions and docs without writing output. `build` replaces the bundle in `dist/chrome-extension`; keep a separate source copy when preserving an existing installed bundle. No environment variables or backend are needed.

## Support and limits

Current source supports YouTube TV only, with four total managed feeds, a persistent compact remote, automatic arrangement and a monitor/custom TV area. These new controls await installed qualification. Prime Video/Netflix are the very last planned expansion after first-beta release and preceding planned work is completed or explicitly owner-deferred. They are not a first-beta gate; no service work now. Safari/native clients remain unimplemented. Window count does not prove account concurrency allowance. Sports text comes from guide listings and does not confirm live game state.

Frozen source candidate **0.2.1 / 61a83fecdc9217c6** includes the completed reconnect repair and113-test normal verification. Its installed identity is owner-confirmed; connected in-page controls were observed after an owner native refresh, so reconnect-alone success and original-program continuity remain unqualified. The remote has partial owner confirmation; installed layout, area, controls and advancing-count evidence remain open. Retained **v0.1.17 / 50a15df68eb2c3db** evidence and rollback keep their original scope. Offline tests are not installed-playback or release qualification. See [readiness evidence](docs/evidence/runs/20261002-c1-rg2/run.md) for the observed scope.

## Documentation

- [Development and CI](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md), [failure recovery](docs/ERROR_HANDLING.md)
- [Documentation index](docs/README.md), [evidence](docs/evidence/README.md)

Protected streams and credentials are never extracted or proxied. Native account/player controls stay available; saved layouts grant no audio authority.

[Current next action](NEXT_TASK.md): conduct the already-approved muted remote-led demonstration. Owner reports reload/native refresh complete; no repeat activation or approval. Observe the current post-refresh state and use the supported paused/player-muted handback. Installed controls/layout/area, real concurrently advancing count and ten-minute stability remain open. [Evidence and handoff](docs/evidence/runs/20261003-q3-b1-r2/run.md).
