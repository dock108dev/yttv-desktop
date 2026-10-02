# Roadmap

Updated 2026-10-02. Local Chrome/domain/UI code now exists; fixture/mock tests and limited real integration are recorded separately. Setup documentation has its own [verification](SETUP_VERIFICATION.md); it is not Phase 0 playback evidence.

| Phase | Deliverable | Exit gate | Current state |
| --- | --- | --- | --- |
| 0 — Feasibility | Disposable playback/navigation/composition/mapping evidence, capability matrix and supported route decision | Record entitlements, measured results, independent audio/control, performance and explicit full/dual/fallback/defer verdict | Limited muted 1/2-player observations; full gate INCONCLUSIVE |
| 1 — Chrome single playback foundation | MV3 shell, isolated adapter, Watch/Guide, favorites/recents/previous, order/hide, keyboard and settings | Single-playback integration/SPA failures verified; local workflow and persistence criteria met; authorized player survives augmentation failures | Local code built; real integration qualification underway |
| 2 — Sports | Provider adapter, league states/search, polling/freshness, scheduled-end override, resolver and guide enrichment | Fresh active event one hour beyond guide end remains discoverable and eligible mapped Watch works; held/stale/final states truthful | Shared/fixture implementation; live provider GATED |
| 3 — Chrome core MVP completion | Conditional event-first arbitrary 2/3/4 panes, single audio owner, expand/restore, replace, overlays/Add/layout persistence and final-pane suggestions | All 18 user criteria and the complete representative flow work reliably in Chrome within permitted counts; independent control/performance proven | GATED |
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

The [backlog](BACKLOG.md) translates phases into bounded work. The active next task is [local Chrome qualification](../NEXT_TASK.md); this roadmap does not authorize executing all phases.
