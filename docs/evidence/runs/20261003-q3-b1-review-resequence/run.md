# Q3-B1 completion review and first-beta resequencing

Date2026-10-03 EDT. Evidence class: OWNER_SCOPE_CORRECTION / READ_ONLY_SOURCE_REVIEW / RETAINED_CANDIDATE_RECHECK / DOCUMENTATION. No product source edits, rebuild, product tests, browser/extension/permission/account/audio/playback actions, commit/push or publication occurred in this review. Pre-edit canonical docs/Desktop pointer are retained in `prior-docs`.

## Owner scope and release order

First beta includes the four YouTube TV features: compact remote, automatic readable arrangement, up to four TOTAL native feeds and monitor/custom TV rectangle. Prime Video/Netflix R25 is DEFERRED as the very last currently planned expansion after first-beta release and preceding planned work is completed or explicitly owner-deferred. It is not a first-beta dependency or acceptance gate. Canonical task/roadmap/backlog/specs/product/acceptance/decision/development/usage/agent instructions/indexes/Desktop pointer updated; historical mixed-first-beta run observations remain unchanged.

Current order: bounded reconnect repair → one consolidated YTTV installed qualification → grouped scoped first-beta readiness and owner release decision → remaining planned work as prioritized or explicitly owner-deferred → mixed services last. Original full-MVP U01–U18/Sports/composition acceptance is retained separately; no gate has been manufactured as passed.

## Candidate and completion assessment

Frozen candidate **0.2.0 / b7b2f2eee9eb58f5**, expected ID `idaaiiafgopfpaojpnhaoefbefllioab`. [Engineer evidence](../20261003-q3-b1-implementation/run.md) records113-test normal verification/typecheck/build/exact permission/docs PASS. Read-only recheck found **72/72 matches**:35 source inputs,16 test inputs,12 output files and9 installed017 rollback files. [Recheck](candidate-recheck.json). Recorded verification log is present; tests were not independently rerun.

Source implements remote singleton/compact controls, geometry/readback compensation, explicit dedicated-window original enrollment/Return, shared four-total admission, focus/audio separation and optional TV-area/display selection. These claims have meaningful offline tests, not installed acceptance. Source review found one cohesive reconnect lifecycle/result defect below; no other definite material defect was established.

Retained installed observation confirms Chrome version0.2.0, same ID/Loaded from folder and toolbar remote creation. Exact Connection build/render/reconnect, installed geometry/area/controls and advancing counts1–4 remain unqualified. Tool policy rejects extension-page inspection and forbids alternate-surface workarounds; this is not evidence of a playback/account refusal. Owner reload already completed; no second unchanged-candidate reload is needed. Last observed native paused/player-muted currentTime46795.899082 was unchanged after remote opening; displayed4:36/100% and site/tab mute retained. No new runtime observations were made here.

## Reviewed defect — reconnect lifecycle and truthful success

**Priority: pre-beta repair, Q3-B1-R1.**

- [content.tsx](../../../../apps/chrome-extension/src/content.tsx), line22: existing launcher with the same build causes unconditional return. Invalidation at lines48–59 leaves that launcher marked refresh-required while disposing the bridge. Reinjecting the same build therefore skips creation of a fresh active instance. Preserve healthy deduplication, but replace/dispose invalidated instances safely.
- [background.ts](../../../../apps/chrome-extension/src/background.ts), lines551–556: RECONNECT_MAIN injects the packaged script, refreshes observations with failure handling, and returns success without requiring a fresh usable binding. A successful script call is not proof that controls connected.
- [chrome-integration.test.ts](../../../../tests/chrome-integration.test.ts), lines33–40/68: mock injection succeeds and GET_OBSERVATION is undefined, yet the test expects reconnect success. [Runtime tests](../../../../tests/chrome-runtime.test.ts) cover dedupe/invalidation separately, not invalidated same-build reinjection.

Repair both in one bounded change. Require a confirmed same-tab/current-build fresh usable bridge/observation for success; fail or remain pending truthfully when absent, stale or invalid. Preserve tab/program/position/mute/volume, and never navigate/refresh the native player to recover. Add focused regressions for healthy singleton, invalidated same-build/different-build recovery, no response/stale/invalid responses and real confirmed success. Verify the resulting source and freeze a new identity before any owner activation handoff. Current020/113-test proof remains unchanged until then.

## Next installed work and release disposition

After the complete repair candidate, use one exact owner-only same-entry reload/reconnect handoff if required. Keep ID/storage/confirmed folder,017 rollback and original owner tabs. No removal/reinstall/storage clearing or blocked-inspection workaround. Owner observations can qualify the inaccessible remote; they must include render/build and actual reconnect result, not just a success message.

Continue the grouped remote → TV-area/Cancel/reset → same-tab enrollment/Return → real1–4 bounds/reflow/Replace/manual/Expand/Restore/fifth rejection/unrelated-window preservation sequence. Keep active site/tab mute. Active counts require a proven restorable or owner-approved disposable context; the preserved paused main is not an advancing feed. Stop at actual eligibility/refusal, record functional count and observe the highest functioning active count for ten minutes. No repeated reload campaign solely for the tool boundary.

Prime/Netflix adapters, access and accounts are outside current work. First-beta release stays open pending its scoped evidence and owner decision; original full MVP remains separately open. Documentation validation is recorded below after final consistency checks.

## Validation

Repository documentation check PASS:75 Markdown files,661 local links, no errors/missing local artifacts. Documentation whitespace check PASS after removing an extra EOF blank line. Product/source inputs and bundles remain unchanged;113-test engineering verification is retained rather than rerun.
