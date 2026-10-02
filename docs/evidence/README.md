# Phase 0 evidence

**No experiment has run.** These templates prepare future evidence; they are not results. See [Phase 0 plan](../PHASE0_FEASIBILITY.md) and [next task](../../NEXT_TASK.md).

| Template | Use |
| --- | --- |
| [Session](templates/session.md) | Source/environment/prerequisites, baseline/count/resource/audio/background measurements, stop reason and verdict |
| [Capability matrix](templates/capability-matrix.md) | Count/platform/route-specific support, unsupported/unknown and evidence refs |
| [Mapping case](templates/mapping-case.md) | Event/provider/guide/entitlement/target provenance, expected versus observed and confidence |
| [Decision](templates/decision.md) | Full/dual/managed-window/defer choice with evidence and untested scope |

Copy only when starting the corresponding requested task to `runs/<UTC-date>-<task-id>/`. Never backfill a live record from a fixture. Record experiment revision using git rev-parse HEAD and note any uncommitted changes. A task with absent prerequisites ends BLOCKED before account/playback access.

Evidence classes: DOCUMENTATION (official page/design), FIXTURE (synthetic), REPLAY (historical or provider simulated timing), LIVE (current authorized actual stream/provider observation), DEVICE (observed browser/hardware behavior), OWNER (explicit usefulness/acceptance verdict). A record can reference multiple classes while describing each separately. “Manual” is a method, not a live-evidence guarantee.

Verdicts: NOT RUN, PASS, FAIL, BLOCKED, INCONCLUSIVE. Missing measurements are UNKNOWN, not zero. Preserve failure/stop results, revision and time. Exclusions must be reasoned and visible; no silent deletion of stalls or conflicting mappings. Keep anonymized capability notes, permitted channel labels and resource measurements. Never retain credentials, tokens, cookies, signed media URLs, raw account/DOM/network payloads, protected frames/audio or account screenshots.

For rare live states, fixtures qualify intended logic; live evidence is separate and may remain unavailable. Do not claim Windows support from macOS, Safari from Chrome, automation from manual controls, four feeds from two, or protected composition from API existence.
