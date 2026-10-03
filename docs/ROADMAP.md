# Roadmap

Updated 2026-10-02. Local Chrome/domain/UI code now exists; fixture/mock tests and limited real integration are recorded separately. Setup documentation has its own [verification](SETUP_VERIFICATION.md); it is not Phase 0 playback evidence.

| Phase | Deliverable | Exit gate | Current state |
| --- | --- | --- | --- |
| 0 — Feasibility | Disposable playback/navigation/composition/mapping evidence, capability matrix and supported route decision | Record entitlements, measured results, independent audio/control, performance and explicit full/dual/fallback/defer verdict | C1-Q2 reduced dual managed-window trial PASS on018; full feasibility gate INCONCLUSIVE |
| 1 — Chrome single playback foundation | MV3 shell, isolated adapter, Watch/Guide, favorites/recents/previous, order/hide, keyboard and settings | Single-playback integration/SPA failures verified; local workflow and persistence criteria met; authorized player survives augmentation failures | R2 cache/guard/recovery subsets retained. Installed018/a87877ca8e207785 single-feed audio PASS with owner hearing;68-test verification retained. Historical hold superseded; full foundation PARTIAL |
| 2 — Sports | Guide-based discovery/search/Watch/Add first; independent score/state/overrun separate | Guide discovery qualifies separately; full active/held/final and one-hour overrun gates remain open | S2-G1 implemented on010/f24fa0471866e729, 83-test verification PASS, existing permissions; owner reload reported complete; live qualification blocked by browser policy access |
| 3 — Chrome core MVP completion | Conditional event-first arbitrary 2/3/4 panes, single audio owner, expand/restore, replace, overlays/Add/layout persistence and final-pane suggestions | All 18 user criteria and the complete representative flow work reliably in Chrome within permitted counts; independent control/performance proven | [C1-Q2](evidence/runs/20261002-c1-q2/run.md) installed main+one managed-window trial PASS:15m23s720p/audio/replace/layout/background/close; full arbitrary composition gate GATED |
| 4 — Safari next release gate | Shared domain/UI logic behind Safari bridges and documented differences | Independent Safari auth/playback/DRM/injection/sessions/storage/keyboard/performance/composition evidence | DEFERRED |
| 5 — macOS spike | Swift/WKWebView feasibility and browser-controller alternative | Auth/protected playback/persistence first; multiple views/GPU/fullscreen/audio/reuse; demonstrate benefit before product build | DEFERRED |

## Priority versus sequencing

P0 = playback integration, navigation, dense guide, previous/favorites, Live Sports and overrun/delay behavior. Phase 1 is the single-stream foundation; Phase 2 completes the core P0 feature set. The user's complete Chrome core MVP runs through Phase 3, including conditional QuadBox and all [18 acceptance criteria](ACCEPTANCE_AND_TEST_PLAN.md). Neither Phase 1 nor Phase 2 alone is that MVP.

P1 = 2–4-feed QuadBox/audio/event panes, team/league search and Add. Foundational search can arrive with Phase 2 even though its overall ranking is P1. P2 = Safari, presets, favorite teams and recommendations; final-pane suggestion basics are included in the Phase 3 interaction, broader personalization later. P3 = native, additional sports and personalization. Priorities describe value; gates/dependencies decide delivery order.

## Phase 0 decision branches

- Four independent eligible sessions and an allowed reliable composition route pass: plan full 2/3/4 QuadBox for the qualified environment.
- Four fail/are unavailable while two pass: plan dual view first; retain the exact reason four is blocked. Three-view support needs its own evidence.
- Independent sessions work but single-UI composition fails: evaluate managed tabs/windows, clearly label the route; do not claim an in-page QuadBox from tiled windows.
- Coexistence fails: proceed with Phase 1 and independent Phase 2 where single playback is supported, or defer playback integration if even that gate fails. Document a supported window/controller fallback only if demonstrated.

Dual-view-only or managed-window delivery can be useful feasibility-driven alternatives, but must be named and accepted as reduced scope separately. They do not silently replace the full arbitrary 2–4-feed QuadBox MVP or its three-game representative flow. If the requested Chrome flow cannot pass within platform/account restrictions, record the full MVP as blocked/deferred and propose the demonstrated alternative. Never bypass restrictions to pass acceptance.

Phase 0 mapping can use labeled fixtures while playback is blocked. Fixture success does not pass live mapping/playback gates. Sports architecture is independent of QuadBox and YouTube TV DOM extraction.

The [backlog](BACKLOG.md) translates phases into bounded work. [C1-Q2](evidence/runs/20261002-c1-q2/run.md) completed normal audio and the supervised two-feed viewing milestone. The owner ended the overnight mute hold and requested an end to the granular handoff loop. The historical mute evidence stays INCONCLUSIVE; its proposed M1 task is superseded.

A supervised managed-window feasibility trial now requires reliable core playback/navigation/audio controls and verified two-stream account availability. It does not require full Phase 1 release acceptance. Worker/browser restart, disable/enable, complete control/keyboard matrices and formal performance checks remain open release criteria; group them rather than blocking the trial one at a time. Full MVP budgets, U01–U18 and owner acceptance are unchanged. A successful reduced trial cannot pass full QuadBox or beta acceptance.

C1-Q2 is complete on installed018: single-feed audio and15m23s two-feed managed windows PASS. Original playback remains usable after closing only the added feed. Grouped release checks remain open; no pending reload or new task per unmeasured criterion.

Active product scope: [S2-G1 Sports from the native guide](../NEXT_TASK.md). Build browsing/search and validated Watch/Add around sports actually available to the account. Independent scores/game state/overrun remain unqualified; full beta acceptance stays open.

Latest S2-G1 continuation (UTC 2026-10-03T01:19:39.070368+00:00): supported browser retry after owner access-recovery report still denied by unavailable admin-policy verification. Installed qualification remains blocked; no repeat extension reload is needed.

Current S2-G1 state: browser access RECOVERED; installed010/f24fa0471866e729/same ID VERIFIED. Stopped at cached legacy Upcoming/episodic matchup presentation regression; repaired **011/343f238d6223baf3, 84-test normal verification PASS**. One owner repair reload pending, then fresh real qualification. [Canonical next task](../NEXT_TASK.md). Earlier browser denials retained historically; no provider setup or new permissions.
