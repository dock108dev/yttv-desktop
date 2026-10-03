# Roadmap

**Active beta milestone Q3-B1 (2026-10-03 EDT):** compact separate remote, automatic readable1–4 TOTAL player windows and monitor/custom TV-area selection. [Current scope](../NEXT_TASK.md), [engineering specification](TV_WORKSPACE_BETA.md). Implementation and installed higher-count qualification are NOT RUN. Preserve installed017 baseline/evidence/rollback and the active mute/paused-session constraints while preparing the complete new candidate. Four playback windows require actual count-specific account/platform evidence; full beta acceptance remains open.

Updated 2026-10-03 EDT. Local Chrome/domain/UI code now exists; fixture/mock tests and limited real integration are recorded separately. Setup documentation has its own [verification](SETUP_VERIFICATION.md); it is not Phase 0 playback evidence.

| Phase | Deliverable | Exit gate | Current state |
| --- | --- | --- | --- |
| 0 — Feasibility | Disposable playback/navigation/composition/mapping evidence, capability matrix and supported route decision | Record entitlements, measured results, independent audio/control, performance and explicit full/dual/fallback/defer verdict | C1-Q2 reduced dual managed-window trial PASS on018; full feasibility gate INCONCLUSIVE |
| 1 — Chrome single playback foundation | MV3 shell, isolated adapter, Watch/Guide, favorites/recents/previous, order/hide, keyboard and settings | Single-playback integration/SPA failures verified; local workflow and persistence criteria met; authorized player survives augmentation failures | R2 cache/guard/recovery subsets retained. Installed018/a87877ca8e207785 single-feed audio PASS with owner hearing;68-test verification retained. Historical hold superseded; full foundation PARTIAL |
| 2 — Sports | Native-guide discovery/search/Watch/Add delivered; independent state separate | Guide loop qualifies separately; active/held/final and one-hour overrun gates remain open | Installed01285-test verify and real discovery/search/Watch/Add/cache/recovery PASS; post-refresh audio boundary and full release checks open |
| 3 — Chrome core MVP completion | Compact remote, auto1–4 mixed-service Chrome TV workspace, selected monitor/area; broader independent state separate | Q3-B1 beta requirements and permitted service/count-specific playback; full U01–U18 remain open | Q3-B1 READY PLAN for YTTV/Prime/Netflix; current017 YTTV-only baseline retained; mixed implementation/qualification NOT RUN |
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

C1-RG2 readiness/handoff is COMPLETE in its bounded scope; [current disposition](../NEXT_TASK.md) and the grouped release ledger below supersede the planning state. The working main-plus-one route is handed off with exact paused viewing state preserved; full MVP acceptance remains open.



Retained S2-G1 baseline: Installed **v0.1.12 / 2f3e74113bfb36dc / idaaiiafgopfpaojpnhaoefbefllioab** verified. **85-test normal verification PASS; real discovery/search and eligible Watch/main + Add/one managed feed PASS.** Cached61-card read-only guard and native recovery PASS; original CBS restored at720p with player/tab enabled100%, added feed closed, favorites/history/shortcut choices retained. No API key, setup, service or new permissions. One later main-tab refresh showed tab mute; restored with the existing control, cause/lifecycle preservation remains OPEN. No explicit replay was listed; Replay and unloaded-guide behavior have local tests only. C1-Q2 long dual-viewing evidence reused; independent scores/state/overrun and broader release checks remain grouped open. [Next task](../NEXT_TASK.md).


## C1-RG1 current reliability continuation

Current C1-RG1: **installed v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab confirmed; navigation-recovery closeout finished.** Recovery-feedback coherence and scoped navigation-volume retention PASS: main-alone90% and main-plus-one80% agree across settled native sliders, Desktop observed-player, saved choice and Restored status with no warning. Initial ready-watch NATIVE_REFUSED was followed by confirmed current replacement; a later loading completion was superseded. Exact mismatching native/player input and initial016 refusal remain UNKNOWN. Scoped warning/choice ordering, persistent fallback and unrelated isolation coverage pass102-test normal verification; frozen016 reproduces stale feedback.100% restored via confirmed supported control; CBS Comics Unleashed paused4:36, site/tab mute active, no extra. Captured News11pm8:10 is not restored because current rendered controls offer a different program. Owner reload cleared extension tab mute; Mute all reasserted before testing while native site mute stayed active. Only test extra1593754440 closed; preferences/storage/permissions/index/rollback/prior evidence preserved. Prior016 ordinary-refresh/viewing and C1-Q2 long trial retained. Historical tab-mute caller UNKNOWN; owner-held audio and broader release checks stay grouped. Full C1-RG1/beta acceptance PARTIAL; no reload pending. [Evidence](evidence/runs/20261002-c1-rg1/run.md).

## C1-RG2 consolidated readiness closeout

Updated 2026-10-03 EDT. **COMPLETE for consolidated evidence/readiness and everyday-use handoff; usable main-plus-one managed-window scope; full foundation/MVP/beta and owner signoff PARTIAL/OPEN.** Installed **v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab**,54 hashes unchanged, recorded102-test verification retained. No repair/build/reload pending. [Verdict](evidence/runs/20261002-c1-rg2/run.md), [all U01–U18/AC mappings](evidence/runs/20261002-c1-rg2/acceptance-ledger.md), [one grouped remaining release ledger](evidence/runs/20261002-c1-rg2/release-checks.md), [everyday use](../START_HERE.md).

Current017 navigation-volume/recovery feedback and muted main+one retained; guide Sports012 and practical dual/listening008 retain their original scope. New safe cached-settings, keyboard-dialog/failure/Find and original-player controls passed. Exact Comics Unleashed paused4:36/100%/720p and player/tab/site mute preserved; no program replacement or test surface. Active mute holds audio; unsupported lifecycle unrun. Three timing samples/surface include transport overhead;11 paused Chrome-tree samples over5min provide aggregate context only, not matched active/per-feed budgets. Independent game-state/scores and full composition remain open. Prior sections are retained history; this closeout and NEXT_TASK own current disposition.


2026-10-03 source-only maintenance: [EH-01](ERROR_HANDLING.md) completed under the explicit Abend request, with112 offline tests and in-memory build/typecheck/docs verification. Playback, Sports, composition and release gates are unchanged. Installed017 remains frozen and distinct from edited source. The Q3-B1 candidate should incorporate this maintenance; [NEXT_TASK](../NEXT_TASK.md) owns that integrated milestone.


2026-10-03 SEC-01 source hardening is complete with30 focused offline tests and compile/docs verification. [Security boundaries and follow-ups](SECURITY.md) remain distinct from live/installed qualification. Q3-B1 incorporates these changes without advancing any playback or release gate.
