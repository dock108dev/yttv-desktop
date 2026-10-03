# C1-Q1 — keyboard implementation and installed-runtime identity gate

Status: LOCAL IMPLEMENTATION/CHECKS PASS; IDENTIFIED INSTALLED FOUNDATION BLOCKED. Conditional two-feed fallback NOT RUN / GATED. Full beta acceptance is open.

Date: 2026-10-02, America/New_York. Final implementation verification completed 15:47 UTC (11:47 AM EDT). Owner reload handoff requested after the first successful build at approximately 15:44 UTC. No owner completion or installed identity confirmation was received before closeout. This is a bounded closeout at the first unmet live gate, not foundation acceptance.

## Exact candidate and environment

Source HEAD `081b65bf6a541290e2b4c09c23351a1d489cd9e7`, main, plus uncommitted implementation and tests in [implementation.patch](implementation.patch). Source-input fingerprint `697b23c29965129c3b8934311439edc42e2a0d07776bb8b31ee6283416339c19`; displayed build ID `697b23c29965129c`. Manifest/build extension version **0.1.4**, root package separately **0.1.0-beta.1**. [Candidate inventory](candidate.json) gives each input hash, patch hash and bundle hashes. Fingerprint includes build script, manifests, lockfile, TypeScript/CSS inputs and extension HTML; tests are recorded by the patch, not embedded into the runtime fingerprint.

Installed extension ID: UNKNOWN. Installed displayed version/build: UNKNOWN. The current ordinary Chrome drawer exposes the old shortcut interface and no visible version. Disk build identity and fixture runtime label do not prove the installed content world has updated. Baseline on-disk bundle hashes are historical in the unchanged handoff review; they were not independently captured again before this rebuild.

Fresh local metadata: macOS 27.0 (26A428), Mac15,6, 11 physical CPU cores, 18 GiB RAM; installed Chrome application metadata **154.0.8037.97**. Earlier record's .93 is historical. Running process binary version was not independently queried. Power/display/network configuration, subscription tier, allowance and household usage are UNKNOWN. No allowance is inferred from the implementation cap.

Working-tree inspection matched the handoff: documentation modifications plus its untracked review record; no newer implementation changes appeared at start. Preserved the handoff review and historical auth/integration records unchanged. [Prior active task](prior-next-task.txt) retains the pre-closeout request. Existing GitHub origin remains configured; no remote operation, commit, push or publication occurred.

## Implemented changes

- Saved mappings now drive Watch/Guide/Sports/QuadBox, Previous, mute, window focus, activate/expand, cancel/restore, arrows, search and help. Shortcut settings display current saved values, allow drafts, validate before Save, support blank to disable, and offer defaults without resetting other preferences.
- Printable unmodified keys, Enter/Escape/arrows are supported. Invalid imported mappings are disabled; duplicate imported keys keep the first action in stable default-map order and disable later collisions. UI Save rejects invalid/duplicate drafts. Control/Command/Alt chords, IME, repeat presses, typing and interactive controls retain ownership. Escape always dismisses the shortcut dialog; mappings otherwise operate on workspace/row focus.
- Guide rows use a visible focus outline and a roving row tab stop. Up/down moves between currently displayed rows, bounded at the ends; left/right enters first/last enabled row control. Tab reaches controls and their native keys remain intact. Activate dispatches only an eligible row; fixtures cannot navigate. Filtering/order changes derive the active entry from the currently rendered row list.
- Current channel presentation now uses confirmed stored history rather than a detected but unconfirmed page label. Out-of-order observations cannot replace newer observations. First/pending observations, rejected navigation, fixture evidence and repeat observations do not create false history in the fake-worker tests.
- Shared adapter target validation requires available LIVE entry/target, matching channel, valid ordinary watch navigation and a finite, nonfuture timestamp within 30 minutes. Adapter and worker dispatch recheck freshness; fixture/replay/malformed/stale targets stay unavailable. Disposed adapter navigation and no-player mute fail explicitly. Planned play/pause/volume/program controls are still absent and no success is claimed for them.
- v0.1.4 exposes a source-input build ID and extension ID in Shortcuts for precise runtime handoff. No extension identity/storage reset, permission expansion or changes to the Sports fixture/live provider boundary.

## Actual local verification

`npm run verify`: **PASS**, final implementation verification at 15:47 UTC: typecheck, **51 tests / 0 failures**, build and exact permission audit (`storage` + `https://tv.youtube.com/*`), documentation validation. Existing lifecycle synthetic tests prove one invalidation notice, observer/timer disposal, bridge listener removal and no further runtime calls; the minimal mute safety listeners deliberately remain until pagehide. This does not qualify real extension reload/disable behavior.

Focused regressions cover configured dispatch/help, conflict rejection, editable ancestors/browser chords/interactive controls, guide focus, positive activation through a synthetic eligible-row bridge, keyboard teardown, mapping import sanitation, disposed/no-player behavior, stale/malformed/fixture target rejection and pending/failed/out-of-order history. Existing fake Chrome managed-window safety/recovery tests still pass. These are synthetic evidence, not actual LIVE channel entitlement even when test objects use the LIVE enum to exercise the adapter boundary.

Retained verification failure: the first 50-test run had 49 PASS / 1 FAIL in the new shortcut-edit harness. The harness set React's tracked value directly and saved before a state turn, so the draft did not update. Corrected the input prototype setter/event and awaited rendering; focused test then passed. No live runtime repair verdict is inferred from this harness correction. A final positive activation/teardown regression raised the total to 51.

## Browser observations — separate evidence classes

**Ordinary Chrome, existing unidentified runtime:** native accessibility inspection found Chrome on New Tab, with the previous beta group closed. Left that group closed and unrelated tabs unchanged. Opened one designated `https://tv.youtube.com/live` test tab. The extension had site access; native guide, Library/Home/Live, search/help and account controls were present. Opened the Desktop drawer: one open/close toggle was observed, its old shortcut help remained, CBS 2 favorite and CBS/NBC recents were visible. UI reported connected / playback observed / MUTED. No independent video advancement, resolution, tab-mute property, audible state, DOM host count or account entitlement was measured. No Watch/Add/managed-window action was taken. These limited observations are not replacement evidence for v0.1.4. Favorites/history visibility does not establish same-identity extension-reload persistence.

**Local fixture preview, in-app browser:** started the repository loopback preview server; initial attempt before the server was running returned connection refused. Subsequent preview loaded v0.1.4 / build 697b23c29965129c. At the default 1280×720 viewport, ArrowDown from ESPN focused FOX and computed outline style was solid. At 440×740, document width stayed 440 and guide width was 408; the shortcut dialog width was 416 and its 1700px contents scrolled. Saved Sports=x, invoked x from a guide row, observed Sports and its x help, reloaded and observed x retained. Restored the tested shortcut mapping to defaults through the same UI and reset the viewport override. Fixture Watch/Add remained disabled. This is fixture UI/storage/layout evidence only; narrow installed Shadow DOM still requires its own check.

Sanitized fixture images: [guide focus](fixture-guide-focus.png), [narrow guide](fixture-narrow-guide.png), [narrow shortcut settings](fixture-narrow-shortcuts.png). They contain no real video/account content. No protected video frames, media URLs, raw live DOM/network payloads, credentials, cookies or tokens were intentionally collected or retained in the run artifacts.

## Required acceptance verdicts on the identified installed runtime

| Criterion | Verdict | Evidence / unmet subcriteria |
| --- | --- | --- |
| U01 | BLOCKED | Old runtime drawer opens; v0.1.4 identity, one DOM host and installed readability unverified. Initial native Live ingestion is still needed; cached guide availability after worker/browser restart is unqualified. |
| U02 | BLOCKED | No fresh confirmed guide/favorite/recent/search switches or trustworthy baseline/timing on v0.1.4. |
| U03 | BLOCKED | Confirmed-history domain/fake-worker regressions PASS; actual Previous on candidate not run. |
| U04 | BLOCKED | Synthetic settings/order/hide tests and fixture key persistence PASS; same installed ID navigation/page/extension-reload persistence not run. |
| U17 single playback | BLOCKED | Native guide/account/navigation controls present in old runtime; actual candidate player/account/DVR/ads accessibility and function not qualified. |
| U18 single playback | BLOCKED | Synthetic invalidation and fixture isolation PASS; actual reload/context invalidation/disable, no new extension error loop, supported muted playback survival and refreshed reconnect not run. |
| AC01 | BLOCKED | Single-player candidate accessibility/context and teardown open. Sports/qualified QuadBox/live context unavailable; full criterion cannot pass from this subset. |
| AC02 | INCONCLUSIVE | Full/narrow fixture layout and keyboard focus observed; installed width and 30 transitions per surface with p95 ≤150ms not measured. |
| AC03 | BLOCKED | Local confirmed-history guards PASS; live Previous/favorites/failed navigation and p95 switch ≤8s against baseline unmeasured. |
| AC04 | BLOCKED | Local order/hide/search/settings logic PASS; installed persistence/guide refresh and current/next completeness open; schedule/availability never fabricated. |
| AC05 | BLOCKED | Configurable UI/dispatch and native-focus preservation PASS in synthetic/fixture paths; actual installed keyboard/player/browser matrix open. |
| AC13 | BLOCKED | Local failures/fixture independence/lifecycle cleanup PASS; live enhancement failure, observer cleanup, no continuing errors and original muted playback survival open; provider behavior remains fixture-only. |

All listed BLOCKED verdicts are identity-gated; they do not assert that the repaired code failed live. Owner acceptance NOT RUN. No full Phase 1 gate or full beta acceptance.

## Lifecycle and conditional fallback

Installed reload/context-invalidated notice, before/after console window, disable/teardown and refresh reconnect **BLOCKED / NOT RUN**. Do not treat the historical successful refresh or the current fresh guide tab as invalidation repair proof. Record extension-origin errors only after a fresh time boundary; separate old errors and upstream YouTube TV warnings.

Two-feed managed-window result: **NOT RUN / GATED** by foundation acceptance, actual account allowance and available streams including main and household use. No extra managed feed created; no 15-minute/720p or background-return run; CPU/RAM/GPU/network/stall/nav budgets **INCONCLUSIVE** for live performance. Worker/create/mute/replace/focus/expand/restore mock results remain local only. No third/fourth feed. Audible handoff **NOT RUN**; selecting a window is focus-only. All real sound remains restricted.

## Precise owner action and one next task

First unresolved gate: identify the installed runtime. In `chrome://extensions`, reload the **existing** YouTube TV Desktop — Local Beta entry for `/Users/michaelfuscoletti/Desktop/yttv-desktop/dist/chrome-extension`; retain its ID and storage, do not Remove/Load unpacked/clear preferences. Refresh only the designated **Live - YouTube TV** test tab. Open Desktop → Shortcuts and confirm **Runtime v0.1.4 · build 697b23c29965129c**, then record its extension ID. NEXT_TASK's existing owner-only extension-management handoff and restriction on alternate-surface workarounds were honored; no new blocked-page policy verdict is claimed in this run.

One bounded next task: **C1-Q1-R1 — identify and qualify the single-playback v0.1.4 runtime**, using that reload handoff followed by U01–U04, applicable U17/U18 and AC01–AC05/AC13 navigation/persistence/lifecycle checks. Preserve baseline preferences before controlled edits and track ID across extension reload. Stop the affected check at missing auth/entitlement, unexpected audio, protected/session-limit error, freeze, thermal/memory warning, interference or unsafe evidence. Close only test-created extras; preserve ordinary supported playback. No two-feed dispatch until foundation PASS and verified account availability; any later conditional run is separately bounded to 45 minutes with 15 minutes at available 720p and explicit missing-measurement verdicts.

## Bundle SHA-256

| File under dist/chrome-extension | SHA-256 |
| --- | --- |
| background.js | `b673128a5fd400d52b34200b823161f2e5daebed9a09965fd2336c0654b0713e` |
| build-identity.json | `910df1f66162db3543532a45809525160940c89c8fd4c2b6d8c5fa5c4f42ff29` |
| content.css | `f29932c9b03995125873fb9cbd57c5156886b1ca8d164fd9003673e155a56d64` |
| content.js | `cb43a3a32d75d4448588a2683a81ce96b95a4c97cda8118ca4fec1be5e4cf118` |
| demo.html | `3c9e7900572da3fde9e8f91d66ce5922e722a9874d842ed4cfef7fc43fdd7233` |
| manifest.json | `293dd9976371db22e003340328b121ceca0f98c4c8ac417dd7ee4348c2d964ec` |
| panel.css | `f29932c9b03995125873fb9cbd57c5156886b1ca8d164fd9003673e155a56d64` |
| panel.html | `d863a609f93f24379d38a4a1373b51bfc84ba46339089242b3e47b181129492e` |
| panel.js | `c18e56fd3e559990c2e1dfa35a0707e6f386f709d66dd5d1c65944516f7544d4` |

Post-closeout documentation check: **PASS** at 15:52 UTC, 41 Markdown files / 190 local links / 10 private workspaces / all 18 criteria. `git diff --check` PASS. Source inputs, implementation patch and every recorded bundle hash rechecked unchanged after documentation closeout.
