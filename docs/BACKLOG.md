# Backlog

**Active beta milestone Q3-B1 (2026-10-03 EDT):** compact separate remote, automatic readable1–4 TOTAL player windows and monitor/custom TV-area selection. [Current scope](../NEXT_TASK.md), [engineering specification](TV_WORKSPACE_BETA.md). Implementation and installed higher-count qualification are NOT RUN. Preserve installed017 baseline/evidence/rollback and the active mute/paused-session constraints while preparing the complete new candidate. Four playback windows require actual count-specific account/platform evidence; full beta acceptance remains open.

Updated 2026-10-03 EDT. Status vocabulary: READY PLAN, NOT RUN, NOT STARTED, GATED, DEFERRED, COMPLETE (with evidence). Local code and fixture checks exist; live integration is under qualification. Full product acceptance is open.

| ID | Phase / priority | Bounded task | Depends on | Exit evidence / status |
| --- | --- | --- | --- | --- |
| SETUP-01 | Setup | Planning docs, Desktop tracker, private local monorepo/git scaffold | Supplied brief and Desktop conventions | [Setup verification](SETUP_VERIFICATION.md); COMPLETE after recorded checks |
| P0-A1 | 0 / feasibility | [Single/two-session Chrome baseline](../NEXT_TASK.md), ≤45 minutes | Later explicit test request, existing auth, permitted streams | [Session template](evidence/templates/session.md); [Limited muted baseline](evidence/runs/20261002-local-beta/auth-baseline.md); INCONCLUSIVE for full gate |
| P0-A2 | 0 / count qualification | Three/four-session Chrome evidence within Q3-B1 | Owner-selected up-to-four beta scope; actual account/channel allowance and disposable/restorable context | READY PLAN within Q3-B1; real count-specific playback NOT RUN; stop on eligibility/concurrency limit |
| P0-B1 | 0 / feasibility | Assess multi-surface UI and managed tab/window routes; composition decision | Count evidence and permitted navigation method | Managed-window fallback implemented; mock safety tests pass, live qualification underway |
| P0-B2 | 0 / optional | Assess capture only if allowance is established; stop on protected failure | Explicitly scoped capture request, policy allowance, B1 inadequacy | Permission/technical/performance evidence; GATED, never prerequisite for Sports |
| P0-C1 | 0 / P0 | Disposable adapter capability probe: channel/program/state, direct target, guide/player replacement, SPA | Authorized ordinary playback and later scoped harness | Guide extraction and CBS/NBC muted navigation observed; document replacement/drawer repair underway |
| P0-D1 | 0 / P0 | Mapping/status fixture packet: normal, extra innings/OT, delay, overrun, late start, multi-broadcast, stale | No live account needed; fixture provenance policy | Implemented fixture/domain packet: 31 tests PASS; live mapping unqualified |
| P0-G1 | 0 / gate | Decide full QuadBox / dual / managed windows / defer; preserve count/platform limits | Relevant A/B/C and mapping evidence | Recorded decision with exact scope and unknowns; GATED |
| C1-01 | 1 / P0 | Choose tooling and minimal MV3 shell/bridge with isolated adapter contract | Single-playback feasibility; no assumptions from capture | MV3 bundle, build/typecheck/permission audit PASS; user loaded locally |
| C1-02 | 1 / P0 | Watch/Guide navigation and current context; previous/favorites/recents | C1-01 confirmed navigation/state | Code and domain tests PASS; real confirmed CBS/NBC history observed, reload matrix underway |
| C1-03 | 1 / P0 | Dense rows, order/hide, current/next, search, keyboard mappings/settings | C1-02 | Local 54-test candidate PASS; installed save/reload U04 PASS, arrow/Enter/custom dispatch observed; full keyboard/current-next/restart matrix PARTIAL in R1 |
| C1-Q1 | 1 / qualification | Retained single-playback R1/R2 qualification | Identified installed candidate | [R2](evidence/runs/20261002-c1-q1-r2/run.md): 0.1.7 / 9d07499eeceaf524, 66 tests; scoped Watch cache/navigation recovery PASS. Full foundation PARTIAL; expired overnight mute-sampling task superseded |
| C1-Q2 | Interim viewing / feasibility | [Normal audio and supervised main-plus-one-feed milestone](../NEXT_TASK.md) | Core playback/navigation/audio controls; verified account capacity for two-feed trial | **COMPLETE / PASS reduced viewing milestone** on installed018/a87877ca8e207785/same ID: single-feed controls/owner hearing,15m23s720p dual managed windows, audio both directions, replace/layout/background/close.68-test verification retained; full beta and grouped release checks remain separate |
| S2-01 | 2 / future | Independent sports data evaluation | Later explicit scope | DEFERRED; guide-based viewing is active |
| S2-L1 | 2 / historical | Historical provider evidence; source removed by SSOT-01 | [Historical run](evidence/runs/20261002-s2-l1/run.md) | Local79-test verification retained; live acquisition NOT RUN; activation superseded by S2-G1 |
| S2-G1 | 2 / delivered bounded slice | [Native-guide Sports discovery/search and guarded Watch/Add](../NEXT_TASK.md) | Existing authenticated guide and completed C1-Q2 | Installed012/2f3e74113bfb36dc;85-test verify PASS; real search/Watch/Add/cache/recovery PASS; post-refresh audio boundary OPEN; [run](evidence/runs/20261002-s2-g1/run.md) |
| C1-RG1 | 1 / consolidated reliability | Navigation-volume recovery and truthful feedback closeout | S2-G1/C1-Q2 retained |Installed017,102 local tests PASS; scoped navigation volume/feedback PASS;100% restored, paused program/position difference disclosed; full acceptance PARTIAL; no reload pending; [run](evidence/runs/20261002-c1-rg1/run.md) |
| C1-RG2 | Consolidated readiness / handoff | [Evidence reconciliation, missing safe controls/measurements and everyday-use handoff](../NEXT_TASK.md) | Installed017 scoped recovery closeout | **COMPLETE bounded handoff**; current017 unchanged102-test verify retained; safe controls/paused aggregate evidence recorded; exact session preserved; full release/owner checks grouped open; [run](evidence/runs/20261002-c1-rg2/run.md) |
| S2-02 | 2 / future | Independent league state/freshness/overrun | Separately scoped factual source | Synthetic regressions retained; live independent state DEFERRED |
| S2-03 | 2 / P0 + P1 | Sports discovery/search and guide integration | S2-G1 and adapter snapshots | Native-guide viewing loop delivered; independent event-state resolver and wider lifecycle acceptance separate |
| Q3-B1 | 3 / owner-selected beta | [Compact remote, automatic1–4 mixed-service TV layout and monitor/custom area](../NEXT_TASK.md) | Installed017 baseline; [workspace](TV_WORKSPACE_BETA.md) + [YTTV/Prime/Netflix support](MULTI_SERVICE_BETA.md); actual service access/count allowance | READY PLAN; local/installed mixed-service qualification NOT RUN; four TOTAL enrolled feeds, per-service capability/playback conditional |
| Q3-01 | 3 / P1 | Qualified1–4 player management/audio isolation | Q3-B1 and actual account/route capability | Local up-to-four management in Q3-B1; real higher-count playback remains NOT RUN |
| Q3-02 | 3 / P1 | Arrangement/expand/restore/replace/Add/layout intent | Q3-B1 | Integrated TV workspace acceptance planned; former two-window evidence retained in its exact scope |
| Q3-03 | 3 / P2 basics | Retain final panes and suggest freshly live eligible games | Q3-02 + fresh provider/resolver data | No pane destruction or stale live suggestion; GATED |
| MVP-01 | 3 / user acceptance | Verify all 18 Chrome criteria and complete three-game journey | C1, S2 and qualified Q3 integration | [User acceptance flow](ACCEPTANCE_AND_TEST_PLAN.md); exact build, permitted count/route and owner verdict; GATED |
| SF4-01 | 4 / P2 | Safari capability baseline and shared-code port | Chrome boundaries established | Independent Safari matrix, API differences and performance; DEFERRED |
| MAC5-01 | 5 / P3 | WKWebView auth/protected playback spike before native shell work | Explicit later native spike request | Supported playback/auth proof or browser-controller/defer decision; DEFERRED |
| FUT-01 | Later / P2–P3 | Presets, favorite-team personalization, further leagues | Core accepted and scoped demand | New requirements and focused evidence; DEFERRED |

Update only the items supported by evidence. Planned, fixture, replay, live/device and owner acceptance are distinct. An initial git commit or passing link check does not complete any playback or product criterion.



Retained S2-G1 baseline: Installed **v0.1.12 / 2f3e74113bfb36dc / idaaiiafgopfpaojpnhaoefbefllioab** verified. **85-test normal verification PASS; real discovery/search and eligible Watch/main + Add/one managed feed PASS.** Cached61-card read-only guard and native recovery PASS; original CBS restored at720p with player/tab enabled100%, added feed closed, favorites/history/shortcut choices retained. No API key, setup, service or new permissions. One later main-tab refresh showed tab mute; restored with the existing control, cause/lifecycle preservation remains OPEN. No explicit replay was listed; Replay and unloaded-guide behavior have local tests only. C1-Q2 long dual-viewing evidence reused; independent scores/state/overrun and broader release checks remain grouped open. [Next task](../NEXT_TASK.md).


## C1-RG1 current reliability continuation

Current C1-RG1: **installed v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab confirmed; navigation-recovery closeout finished.** Recovery-feedback coherence and scoped navigation-volume retention PASS: main-alone90% and main-plus-one80% agree across settled native sliders, Desktop observed-player, saved choice and Restored status with no warning. Initial ready-watch NATIVE_REFUSED was followed by confirmed current replacement; a later loading completion was superseded. Exact mismatching native/player input and initial016 refusal remain UNKNOWN. Scoped warning/choice ordering, persistent fallback and unrelated isolation coverage pass102-test normal verification; frozen016 reproduces stale feedback.100% restored via confirmed supported control; CBS Comics Unleashed paused4:36, site/tab mute active, no extra. Captured News11pm8:10 is not restored because current rendered controls offer a different program. Owner reload cleared extension tab mute; Mute all reasserted before testing while native site mute stayed active. Only test extra1593754440 closed; preferences/storage/permissions/index/rollback/prior evidence preserved. Prior016 ordinary-refresh/viewing and C1-Q2 long trial retained. Historical tab-mute caller UNKNOWN; owner-held audio and broader release checks stay grouped. Full C1-RG1/beta acceptance PARTIAL; no reload pending. [Evidence](evidence/runs/20261002-c1-rg1/run.md).

## C1-RG2 consolidated readiness closeout

Updated 2026-10-03 EDT. **COMPLETE for consolidated evidence/readiness and everyday-use handoff; usable main-plus-one managed-window scope; full foundation/MVP/beta and owner signoff PARTIAL/OPEN.** Installed **v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab**,54 hashes unchanged, recorded102-test verification retained. No repair/build/reload pending. [Verdict](evidence/runs/20261002-c1-rg2/run.md), [all U01–U18/AC mappings](evidence/runs/20261002-c1-rg2/acceptance-ledger.md), [one grouped remaining release ledger](evidence/runs/20261002-c1-rg2/release-checks.md), [everyday use](../START_HERE.md).

Current017 navigation-volume/recovery feedback and muted main+one retained; guide Sports012 and practical dual/listening008 retain their original scope. New safe cached-settings, keyboard-dialog/failure/Find and original-player controls passed. Exact Comics Unleashed paused4:36/100%/720p and player/tab/site mute preserved; no program replacement or test surface. Active mute holds audio; unsupported lifecycle unrun. Three timing samples/surface include transport overhead;11 paused Chrome-tree samples over5min provide aggregate context only, not matched active/per-feed budgets. Independent game-state/scores and full composition remain open. Prior sections are retained history; this closeout and NEXT_TASK own current disposition.


## EH-01 — explicit Abend source implementation

**COMPLETE, source only (2026-10-03 EDT).** Storage commit visibility, session recovery gates, audio/cleanup errors and detached tasks hardened; bounded safe diagnostics and optional cache retry implemented.112/112 offline tests, typecheck, in-memory standard build/permission audit and documentation check PASS. [Behavior, retained resilience and limits](ERROR_HANDLING.md). Installed017/evidence/rollback unchanged; live behavior and release acceptance remain unqualified for these edits. Follow-up: integrate into the active Q3-B1 complete candidate and affected runtime qualification. NEXT_TASK remains the disposition authority.


## SEC-01 — source security hardening

COMPLETE for local implementation/offline validation (2026-10-03 EDT). IPC/storage restoration, local HTTP boundaries and CSP tightened;30 affected tests/typecheck/in-memory build/preview syntax/docs/diff checks PASS. [Security findings and remainder](SECURITY.md). Installed017 unchanged; loaded Chrome and provider activation remain untested. Integrate with Q3-B1 rather than a standalone reload.

## SSOT-01 — current-source enforcement

COMPLETE locally (2026-10-03). [Module ownership](ARCHITECTURE.md): superseded provider and alternate pane manager paths removed; navigation/guide/pane policies shared; saved schema/evidence retained.79 affected offline tests, typecheck, in-memory build/permissions and docs/diff checks PASS. Installed017 unchanged. Q3-B1 remains active; browser/owner qualification not performed.


## CI-01 — repository CI readiness

COMPLETE locally (2026-10-03), hosted UNVERIFIED. [Stable PR job](../.github/workflows/ci.yml), portable docs validation with two regression tests, Node22 runtime file, weekly npm/Actions Dependabot and retained failure diagnostics configured. Clean install,98 offline tests, typecheck, in-memory build/permissions and docs/YAML inspection PASS; frozen017 preserved. Managed CodeQL retained and settings unchanged. [Workflow details](DEVELOPMENT.md#pull-request-ci). Next CI boundary is observation on an authorized PR; Q3-B1 remains the active product milestone.


## CLEAN-01 — maintainable current source tree

COMPLETE locally (2026-10-03): concise README/current Development and reconciled Security/setup guidance; no obsolete provider-key template; source-only verification and unused-symbol checks; diagnostics readability. Generated initial setup inventory untracked/ignored with exact local bytes preserved; authored fixtures/assets and frozen017 retained.12 affected tests and98-test clean-export source verification/typecheck/build/docs PASS. [Current disposition](../NEXT_TASK.md#clean-01--completed-bounded-repository-cleanup). No commit/push/history rewrite or installed/live qualification. Q3-B1 remains active.


## DOC-01 — public current-code documentation

COMPLETE locally (2026-10-03): current guides corrected/consolidated; proposed requirement identifiers retained in [engineering requirements](planning/PRODUCT_REQUIREMENTS.md); source-maintenance reports retained in evidence. Default docs check no longer needs external maintenance files;2 regression tests, typecheck, production build/permission audit and docs check in portable export, fixture asset response and diff checks PASS. Frozen017 preserved, no install/commit/push/live action. Q3-B1 remains active; current API/support limits are explicit.
