# Chrome extension

**Current engineering checkpoint — 2026-10-03:** prepared **0.2.2 /029d311113a6963f**, with **115/115 offline tests**, typecheck, production build/permission audit and docs PASS. Integrated remote → bridge → worker tests now cover four feeds, selected replacement, Close/reflow, native closure, reopen, restart and Return. Repaired Sports Replace, original/selected action labels, persistent feed numbers/selection, paused replacement labels and preservation of manual positioning. This is local fixture proof;022 activation and installed workflow/playback are NOT RUN. Last owner-confirmed installed identity remains021 /61a83fecdc9217c6. Current paused/muted playback is untouched; all84 prior recorded hashes matched retained evidence. [Repair and one activation/demo handoff](../../docs/evidence/runs/20261003-q3-b1-r2/run.md).


The root build bundles the content, worker, remote and retained panel entries into `dist/chrome-extension`. The content entry mounts an isolated Shadow DOM launcher; the service worker owns commands, browser windows and storage. One compact separate remote uses the shared bridge to create and manage the entire TV workspace. See [Development](../../docs/DEVELOPMENT.md) for build/load/update steps.

The manifest requires storage and tv.youtube.com access, with optional `system.display` for monitor selection and `scripting` for the narrowly scoped original-player reconnect. The native player/account UI stays available. Launcher state is tab-scoped in extension session storage; newly created managed windows start with the launcher closed.

Guide actions need fresh observed ordinary watch targets. Confirmed history advances only when the expected channel and advancing player are observed. Guide-based Sports revalidates program title/timestamp before Watch/Add; fixtures cannot authorize playback.

The current ceiling is **four total feeds**, including the designated main and pending creation, owned by [shared policy](../../packages/quadbox/src/policy.ts), independently of account allowance. The remote consumes no feed slot. Product-created players are arranged in the chosen monitor/TV area, with Add/Close reflow, selected-player replacement and Expand/Restore. Returning the owner-supplied original restores its supported window state. Manual four-tab setup alone does not fulfill the [first-beta workflow](../../docs/TV_WORKSPACE_BETA.md).

Added windows are blank and tab-muted before navigation. Feed selection/focus is separate from explicit audio selection, which uses serialized mute-before-enable isolation. Volume preserves mute choices; native readback failures produce fallback guidance. Worker restart revalidates existing sessions and does not reopen windows or restore saved audio authority. Source controls exist in frozen0.2.1; installed integrated layout/area/four-player operation and advancing counts remain unqualified.

[Chrome integration tests](../../tests/chrome-integration.test.ts), [adapter tests](../../tests/yttv-adapter.test.ts), [architecture](../../docs/ARCHITECTURE.md) and [usage](../../START_HERE.md) describe these seams. Mocks do not establish actual account/playback capability.
