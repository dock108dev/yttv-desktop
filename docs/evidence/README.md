# Evidence records

**Current recovery checkpoint — 2026-10-03:**023 TV-area/start filled the requested area PASS OWNER_REPORTED. Owner then reports only NBC Add enabled after guide refresh, followed by Arrange failure “TV area or feed count is unavailable” and **0 /4 feeds**. Historical original tab is absent; two newer YTTV tabs exist but ownership/creation path is unqualified. No tab silently adopted or closed. Prepared **0.2.4 /1cdc745144268bcc**,116-test/typecheck/build/permission verification PASS: explicit existing-player choice when original missing, archived closed-original return record, no-playback/audio/movement during choice, useful missing-player error and disabled-channel explanations.023 retained. Installed repair NOT RUN; changed024 needs owner-only activation then Use this player → Start → Add/Arrange retry. [Evidence](runs/20261003-q3-b1-recovery/run.md). Two–four advancing, full controls/Return/stability and first-beta release remain OPEN; broader MVP separate; Prime/Netflix final deferred expansion.


Current local workflow repair: [Q3-B1-R2](runs/20261003-q3-b1-r2/run.md),022 /029d311113a6963f,115 tests PASS; activation/installed workflow/advancing count NOT RUN.

**Installed checkpoint — 2026-10-03:** identity **0.2.1 /61a83fecdc9217c6** OWNER_CONFIRMED; frozen021/020/017 preserved, no reload/rebuild. Fresh current CBS baseline remains paused/player-muted46940.540876; numeric volume UNKNOWN, native slider0/UI100%, site/tab confirmation pending. One coordinated remote/search/singleton/state/TV-area owner checklist and precise named main+NBC4/ABC7/ESPN four-total disposable trial approval are pending. Remote PARTIAL prior owner report; arrangement/four-total/TV-area installed and advancing1–4/ten-minute hold NOT RUN. Enrollment/Return needs usable current numeric-volume and mute captures. Original Comics continuity unqualified across owner refresh. First beta OPEN; broader MVP separate; mixed services final post-beta. [Consolidated run](runs/20261003-q3-b1-installed/run.md).

**Current disposition — 2026-10-03:** Q3-B1-R1 is COMPLETE for source/verification/freeze: **0.2.1 / 61a83fecdc9217c6**,113/113 offline tests, typecheck and production build/permission audit PASS. Healthy same-build dedupe, invalidated/different-build replacement and fresh usable current-build reconnect confirmation are covered.020 and017 rollback preserved. Changed021 owner-only activation/Connection observations are PENDING; one consolidated installed run remains OPEN for all four first-beta features and advancing counts. No native player/runtime/audio actions occurred. Prime/Netflix remain final deferred post-first-beta work, outside beta gates. This disposition supersedes earlier prospective reconnect-repair instructions; earlier candidate evidence retains its own scope. [Repair and installed run](runs/20261003-q3-b1-r1/run.md).

## Git storage

Git retains evidence templates, the run index and Markdown run summaries. Screenshots, copied extension/rollback bundles, machine-readable observations, patches, logs and prior-document snapshots under `runs/` stay local and are ignored. Keep each run summary concise, with candidate identity, checks, outcome and limitations. Links to local artifacts are useful on the machine that collected them; those artifacts are unavailable in a fresh checkout. Preserve existing local artifacts when removing them from Git tracking. The documentation check reports missing local artifact references separately from broken documentation links.

[Run records](runs/README.md) contain observed results at their own revision and scope. Templates are explicitly NOT RUN until completed for an actual experiment.

| Template | Use |
| --- | --- |
| [Session](templates/session.md) | Source/environment/prerequisites, baseline/count/resource/audio/background measurements, stop reason and verdict |
| [Capability matrix](templates/capability-matrix.md) | Count/platform/route-specific support, unsupported/unknown and evidence refs |
| [Mapping case](templates/mapping-case.md) | Event/provider/guide/entitlement/target provenance, expected versus observed and confidence |
| [Decision](templates/decision.md) | Full/dual/managed-window/defer choice with evidence and untested scope |

Copy when recording an experiment to `runs/<UTC-date>-<task-id>/`. Never backfill a live record from a fixture. Record experiment revision using git rev-parse HEAD and note any uncommitted changes. Record absent prerequisites explicitly; do not infer a live result from a fixture.

Evidence classes: DOCUMENTATION (official page/design), FIXTURE (synthetic), REPLAY (historical or provider simulated timing), LIVE (current authorized actual stream/provider observation), DEVICE (observed browser/hardware behavior), OWNER (explicit usefulness/acceptance verdict). A record can reference multiple classes while describing each separately. “Manual” is a method, not a live-evidence guarantee.

Verdicts: NOT RUN, PASS, FAIL, BLOCKED, INCONCLUSIVE. Missing measurements are UNKNOWN, not zero. Preserve failure/stop results, revision and time. Exclusions must be reasoned and visible; no silent deletion of stalls or conflicting mappings. Keep anonymized capability notes, permitted channel labels and resource measurements. Never retain credentials, tokens, cookies, signed media URLs, raw account/DOM/network payloads, protected frames/audio or account screenshots.

For rare live states, fixtures qualify intended logic; live evidence is separate and may remain unavailable. Do not claim Windows support from macOS, Safari from Chrome, automation from manual controls, four feeds from two, or protected composition from API existence.

- [Q3-B1 local candidate and grouped owner handoff](runs/20261003-q3-b1-implementation/run.md): four requested YTTV controls implemented locally; new installed controls/active counts NOT RUN; full beta OPEN.
