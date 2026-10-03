# Evidence records

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
