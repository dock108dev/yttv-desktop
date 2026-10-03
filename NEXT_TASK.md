# Next action — Q3-B1 TV workspace beta

Updated2026-10-03 EDT. This file owns the active task. Owner-selected beta requirements: **compact separate remote, automatic readable arrangement, up to four TOTAL playback windows across YouTube TV/Prime Video/Netflix, and monitor/custom TV-area selection.** Deliver these together as one integrated milestone. [Workspace specification](docs/TV_WORKSPACE_BETA.md), [mixed-service specification](docs/MULTI_SERVICE_BETA.md). Local implementation and bounded count-specific live qualification are in scope, subject to the account/platform's actual permitted playback.

## Baseline and current state

Last observed installed **v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab**, recorded102-test verification and54 matching hashes at its prior handoff. [Usable-build handoff](docs/evidence/runs/20261002-c1-rg2/run.md), [retained acceptance ledger](docs/evidence/runs/20261002-c1-rg2/acceptance-ledger.md). Existing runtime caps two total feeds and lacks automatic tiling, monitor selection and persistent compact remote. New features NOT IMPLEMENTED/NOT QUALIFIED. Full MVP/beta remains open.

Last handback: CBS Comics Unleashed paused4:36,100%,site/tab muted,no extra. Capture actual current state before testing. Active mute request stays: no enable/transfer/site-mute changes. Preserve paused program/position; do not navigate/replace it without a verified supported restoration path or a fresh disposable owner-approved context. Returning to a channel does not restore the same program/position.

Preserve source/index/uncommitted work, ID/storage/preferences/favorites/history, prior failures/rollback and existing102-test proof in its recorded scope. No new runtime or extension-management action occurs in this planning update.

The initial planning review found nine source/test inputs newer than the frozen017 inventory at that time; subsequent maintenance below adds further source changes, while dist remains frozen017. Preserve those uncommitted changes, inspect their intent, and verify the complete resulting source before building Q3-B1. Recorded102-test verification qualifies its retained017 inputs, not these newer files. [Input review](docs/evidence/runs/20261003-q3-b1-planning/baseline-input-review.json).

## Integrated implementation

1. **Remote:** a persistent singleton extension-page popup with compact primary controls and expandable Guide/Sports/search. Closing/reopening the remote leaves playback intact. Keep a compact/collapsible in-player entry/control. Reuse the existing state/bridge; opening the remote or focusing a window grants no audio authority. Native system frame is acceptable; always-on-top is not promised by Chrome.
2. **TV workspace:** explicitly enroll playback tabs into dedicated managed windows, including original main where a supported reversible detach preserves its tab/player. Never arrange a general owner browser window containing unrelated tabs. Save original parent/index/bounds and offer Return/restore. Verify actual identity/player continuity; do not navigate merely to detach.
3. **Arrange:** Auto arrange and Arrange now apply a stable readable layout on Add/Close/count/TV-area changes.1 fills area;2 uses the suitable orientation;3 uses a readable balanced layout;4 defaults2×2. Respect video aspect, minimum usable dimensions, native frames and accessible controls; apply/read back actual bounds. Too-small areas produce a useful resize/fewer-feed choice rather than overlap/offscreen placement. Expand and restore return to the same grid. Only enrolled player windows move; remote/owner tabs/windows are excluded.
4. **Four total:** replace all scattered two-feed guards with one shared capability/limit up to4 (main+3 extras). Add/Replace/Close/Select/focus/audio isolation/session restore must operate correctly at each supported count. Fresh target/eligibility guards and no saved audio authority remain. Manage partial creation/closed tabs/failure without mutating unaffected players. Never infer provider stream allowance from the number of windows on one device; report actual count-specific refusal. Geometry fixtures cannot establish concurrent playback.
5. **TV area:** choose a monitor's usable work area or draw/resize a rectangle on a proportional monitor diagram. Store display/rectangle intent separately from playback targets/sessions. Use optional `system.display` for enumeration on a deliberate user action, with a current-screen/manual-area fallback when unavailable/denied. No screen capture or desktop recording is required. Handle negative origins/scaling/Dock/menu bar/native chrome/minimum sizes and unplug/rearranged displays. Cancel changes nothing; reset/full-monitor choices are explicit.

## Mixed-service support — R25

The four workspace slots may contain any permitted mix of YouTube TV, Prime Video and Netflix; e.g.2 YouTube TV+1 Prime+1 Netflix. These are native Chrome web players, not native desktop-app control or a re-embedded composite. Global enrolled-feed ceiling4 and each service's actual account/title allowance are separate.

- Add a service picker and **Add existing player tab**. The owner opens/signs in/chooses content through its ordinary service. Explicitly enroll the chosen tab; moving/returning it preserves the same player and position where supported. Opening a service homepage is not a confirmed feed. Do not silently adopt other tabs or automate sign-in/account/purchase operations.
- Separate service-neutral feed/session/geometry ownership from service-specific adapters. Retain current YTTV Guide/Sports/channel/Previous and strict target validation. Netflix/Prime use their own native content navigation; they do not inherit YTTV guide/state or target assumptions.
- Independently detect and qualify each service's title/readiness/advancement/play-pause/native volume/mute capabilities. Provide truthful native-player fallbacks. Shared Chrome tab mute isolates managed feeds; active mute request remains. Focus/arrange/open/restore grants no audio authority, and saved layouts never relaunch content or enable sound.
- Prepare precise optional access for actual official player origins plus any necessary injection API permission. Netflix/Prime are new access, not already granted by current storage+tv.youtube.com manifest. Prime may use primevideo.com or an Amazon storefront depending on actual native routing; observe the required origin before choosing its host pattern. Request only necessary service access through explicit activation/attachment, with an owner-reviewed permission diff and the same combined candidate/reload handoff. No all-sites/cookie/CDN/capture access or credential extraction.
- Preserve owner-attached tabs separately from app-created extras: Return/detach an owner tab; close only app-created test feeds unless the owner explicitly closes a tab. Capture original parent/index/bounds/title/position/mute/volume, revalidate identity/service/ownership on navigation/reconnection, and isolate one service's refusal/closure from other working feeds. No signed media URLs, credentials or raw transient navigation authority persisted.
- Add per-service and mixed-service tests; qualify each real service separately, then actual mixed3/four advancing players where allowed. Window geometry, enrolled count, controls and concurrent playback are separate verdicts. Account/title/household restrictions produce explicit supported limits. Original paused-main preservation still constrains active-count tests.

## Acceptance and qualification

Use meaningful pure geometry/schema tests and browser mocks for1–4 layouts, Add/Close/Replace/event ordering, focus versus audio, remote singleton, main detach/return, partial layout rollback, stale displays, denied permission, fresh target and restored-layout guards. Verify readable local fixtures before one complete candidate. Run normal verification; freeze exact candidate and retain017 rollback.

Prepare the whole candidate and precise permission diff before one combined owner handoff if needed. Extension management remains owner-only, existing entry/ID/storage retained. New display-information access is optional and consented through the explicit monitor-selection flow; do not silently grant permission or expand host access. No audio enable while mute is held.

After installed identity is bound, observe remote, TV-area choice, reflow/expand/restore/return and count-specific session behavior. Qualify2→3→4 ordinary playback only where actual account/channel/platform allowance permits and a restorable/disposable context exists; stop at the first concurrency/eligibility failure. Retain functional1/2 support and label any3/4 blocker precisely. Four concurrent advancing players and workable geometry require real evidence; local mocks or four window handles are insufficient. Do not force an upgrade or bypass limits. Audio's generic1–4 routing can be locally verified; heard sound stays owner-held.

## Delivery

Update specification/run/status/backlog/roadmap/acceptance/START_HERE/Desktop pointer together. Report five beta feature verdicts (remote, arrangement, four-total capacity, TV area and mixed services), exact installed candidate, count/service-specific geometry/playback limits, optional-display/service permission results and owner handback. Keep this one complete product milestone. Full composition/Sports state/performance/accessibility/U01–U18/owner beta signoff remain qualified only by their own evidence.

No independent Sports API/key/service work, protected-video capture/proxying/bypass, platform port, purchase, remote operation or publication. Historical mute/refusal uncertainty alone does not create a repair task.


## EH-01 — completed Abend source pass

2026-10-03 EDT: the attached error-handling request is **COMPLETE for local source and offline validation**. Failed preference patches retain prior choices; unreadable preferences/session records are preserved; unknown managed-session identity blocks new feeds/audio enable; restore-mute and cleanup errors stay explicit; detached close tasks consume failures; bounded static diagnostics and optional guide-cache retries expose degradation. [Behavior and operations](docs/ERROR_HANDLING.md).

Checked source fingerprint **54c404b1f7ad5ea90110cfb2562bae98932b2bc2bc5b5e26d310626c091d7748**, parent HEAD `c5a307f319bfe032d97c95b63c987c000e5e67d7`, with earlier uncommitted work preserved. Typecheck,112/112 offline tests, in-memory standard build/permission audit and docs check PASS. Frozen `dist/chrome-extension` hashes unchanged. Edited source is separate from installed017; no install/reload/live playback/provider/external action occurred in EH-01. Prior102-test/54-input statements qualify their retained candidate only.

The independently updated Q3-B1 task above remains active. Bounded follow-up: include these source changes in its complete candidate preparation and qualify affected failure behavior under that task's runtime gates. No standalone reload or release claim follows from this pass.


## SEC-01 — completed source security hardening

2026-10-03 EDT: the attached Security Hardening Implementation Prompt is COMPLETE for bounded local fixes/offline checks. Command/sender validation, restored-field selection, relay Origin requirements, fixture-server access/asset/header protections and packaged CSP are hardened. [Findings, trust boundaries and prioritized remainder](docs/SECURITY.md).

Extension source fingerprint `92001b28359918289addb316672a69d8dca8b76e9387d2d5942f569032be4321`;30/30 affected offline tests, typecheck, in-memory build/permission audit, preview syntax and docs/diff checks PASS. Installed017 bundle unchanged; no browser/provider/external action occurred. Earlier EH-01 source identity/test results remain historical evidence. Q3-B1 remains active: integrate these edits into its complete candidate and qualify affected browser behavior there; do not create a separate reload for this maintenance.


## UX-01 — completed local presentation cleanup

2026-10-03: implemented the attached ordinary-experience cleanup in shared UI copy/layout only. Task-first headings, readable rows/controls, compact managed panes and named secondary details retain playback eligibility, persisted values and action contracts. [Design notes](packages/ui/README.md) and [matched synthetic review](.local/ux-review/review.md).

Source `9ef3258e2e8c472b49349aef2792e463d19a16728c8c165eae2c6e553d509c82`: typecheck,11/11 UI tests and in-memory standard build/permission audit PASS. Matched desktop/narrow populated, empty, cached/disabled and error screens, keyboard disclosure access,320px reflow and simulated enlarged text checked. Documentation and diff checks PASS. Frozen017 files unchanged. No installed/live/owner acceptance or release qualification. Q3-B1 remains active; bounded next work is integration of these source changes into its complete candidate and runtime gates.


## SSOT-01 — completed current-source enforcement

2026-10-03 EDT: current supported Guide-based Sports, shared watch-page/target eligibility, current two-total feed limit, worker-owned browser lifecycle, serialized audio and storage contracts now have [explicit authoritative modules](docs/ARCHITECTURE.md). Removed superseded NBA acquisition/client/relay/poller, permission-candidate build option/launcher, provider-event commands/unreachable UI, test-only alternate pane lifecycle/resolver and historical-worker test override. Retired event commands fail explicitly; saved schema identifiers and existing records remain inert/readable. Source removed in this pass is retained under `.local/ssot-review/before` for review.

Source fingerprint `7a163ef7d23822cd9ce28b841cd1eaa187e2da069badd5e8d043afa73227ad22`; parent HEAD `c5a307f319bfe032d97c95b63c987c000e5e67d7`.79/79 affected offline tests, typecheck, standard in-memory build/exact permission audit, docs check and diff check PASS. [SSOT guard tests](tests/ssot.test.ts) cover retirement, shared policy, schema preservation and compensated/serialized audio; existing UI/worker tests protect supported actions. Frozen017 files match their pre-maintenance hashes. No packaging/install/live acquisition/playback, owner-data migration, remote action, release or owner acceptance occurred. Earlier source identities and test counts qualify only their recorded revisions.

Q3-B1 remains active: integrate this source into its complete candidate and qualify changed browser behavior under its runtime gates. Removing inert saved legacy fields, or adding a new independently sourced event resolver/provider, requires a separately scoped schema/source contract; it is not a reason to revive the retired path.


## CI-01 — completed local CI readiness

2026-10-03 EDT: [Repository checks](.github/workflows/ci.yml) now covers PR/main/manual triggers, clean locked installation, Node22/Python3.14, typecheck, offline tests, in-memory build/permissions and portable documentation validation. SHA-pinned Actions, read-only permissions, cancellation/timeout and failure logs configured; Dependabot now covers npm and Actions. [Commands and boundaries](docs/DEVELOPMENT.md#pull-request-ci).

Local clean source-only rehearsal PASS:98/98 offline tests (including two docs-check regressions), typecheck, build audit, portable/local documentation and YAML/config inspection. Extension source fingerprint remains `7a163ef7d23822cd9ce28b841cd1eaa187e2da069badd5e8d043afa73227ad22`; parent HEAD `c5a307f319bfe032d97c95b63c987c000e5e67d7`. Workflow/checker/test edits are uncommitted source maintenance; frozen017 bundle hashes unchanged. Hosted new-source execution NOT RUN. Read-only GitHub inspection found existing managed CodeQL and no required main checks; no settings, commit, push, installed/live or release action.

Q3-B1 remains active. Bounded CI follow-up: observe **Repository checks**, **Analyze (python)** and **Analyze (javascript-typescript)** on the next authorized PR; setting required checks is a separately authorized repository-settings operation. Local CI readiness does not establish live beta/owner acceptance.


## CLEAN-01 — completed bounded repository cleanup

2026-10-03 EDT: concise README and one current [development guide](docs/DEVELOPMENT.md) replace overlapping setup/candidate histories. Current security guidance no longer presents the removed relay as executable; historical SEC-01 findings remain revision-bound. Environment template contains no obsolete API-key setup. Source-only `verify:source` checks without overwriting frozen output; compiler checks unused locals/parameters. Diagnostics formatting is clarified without changing behavior. Cohesive worker/UI retained for concrete Q3-B1 service/geometry boundaries, not split by size alone.

Generated `docs/setup-validation.json` removed from the Git index and narrowly ignored; original local bytes remain available, with historical references explicitly local-only. Authored source/assets/tests/fixtures/run notes and frozen017/rollback preserved. [Checker regression](tests/docs-check.test.ts) covers missing historical inventory and explicit report generation. Parent HEAD `c5a307f319bfe032d97c95b63c987c000e5e67d7`; source fingerprint `0109a6f101c9ee85cc50efdc966beca40881787b459a43b47da37f52d51a3c99`. Strict typecheck,12/12 affected tests, in-memory build/permissions, local/portable docs and diff checks PASS. `npm run verify:source` in a fresh source export without local artifacts PASS with98/98 offline tests, using existing clean locked dependencies. Frozen output hashes and local inventory match pre-cleanup bytes. Review/evidence retained in `.local/cleanup-review`.

No commit, push, history rewrite, packaging/install, owner-state or live operation. Existing staged/unfinished work remains in place. Q3-B1 stays active; integrate current maintenance into its complete candidate and qualify affected installed behavior there. CI hosted observation remains pending a separately authorized PR.


## DOC-01 — completed public documentation accuracy

2026-10-03 EDT: README/usage/development/product/architecture/security/recovery and workspace notes now describe current implementation without private setup dependencies or internal milestone narration. Corrected two-total feed/audio/adapter-volume claims. Proposed requirements moved to `docs/planning/PRODUCT_REQUIREMENTS.md` with editable engineering links rebased; existing plans/status remain authoritative. Earlier security/error source reports retained in evidence records; prior immutable runtime records untouched.

Default docs checking now uses repository files only; `--repository-only` remains a compatible alias. Missing historical external/generated references are recorded, not read as prerequisites. Updated two regression tests verify default/explicit portable checks and broken-link/anchor guards. Styling comment now describes its reason rather than a private template reference; runtime behavior unchanged.

Strict typecheck,2/2 affected checker tests, normal production build/exact permission audit in a disposable source export, default docs check without sibling/private artifacts, built fixture HTML loopback response and final docs/diff checks PASS. Source fingerprint `fe101bf3cc23768882cd631c733f8885bcc578441b53cf670846e25850a574cd`; parent HEAD `c5a307f319bfe032d97c95b63c987c000e5e67d7`. Frozen original bundle unchanged. Earlier98-test results remain prior maintenance evidence; no full suite/CI/browser/live/release campaign repeated. No commit/push/install or owner-state action.

Q3-B1 remains active; broader mixed-service/layout/capacity and installed/hosted acceptance require their existing gates. These documentation changes do not activate proposed features. Review and portable build evidence are retained in `.local/docs-accuracy-review`.
