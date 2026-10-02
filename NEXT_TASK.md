# Next task — local Chrome beta qualification

Updated 2026-10-02. Active user request expanded setup into an overnight local implementation. Existing-account authentication and two ordinary muted 720p playback surfaces are [observed with limits](docs/evidence/runs/20261002-local-beta/auth-baseline.md). This is not full beta acceptance.

## Current bounded task

Build and install the local MV3 client with only storage and tv.youtube.com host access. Verify actual guide extraction, one confirmed channel switch and Previous, preference persistence, fail-open behavior and managed-window creation/replacement/restore. Keep every real player and managed tab muted overnight. Test audio transitions using fake ports only. Preserve all unrelated tabs/projects and the supported player.

Run type checking, focused domain/bridge tests, permission/build audit, local fixture UI checks and real Chrome checks. Record attempted failures and actual results separately from plans. A local build or fixture success must not be called live Sports, full QuadBox or beta acceptance.

## Stop conditions

Stop the affected experiment at missing authorization, entitlement or protected-playback errors, stream limits, repeated freeze, thermal/memory warning, unexpected audio or interference. No alternate account/profile/network workaround, protected-video capture, purchase or remote publication.

## Remaining release gates

- Licensed timely Sports provider covering all requested leagues and broadcast/status metadata; fixture-only Sports is not accepted live Sports.
- Fresh exact/ambiguous event-channel mapping and scheduled-end override against live evidence.
- Account allowance plus independently controlled 2/3/4 playback, continuous stability/resource budgets, actual audio handoff after the owner permits sound.
- Full 18 user criteria and representative game flow; Safari follows as its own release gate; native remains a separate spike.

See [acceptance](docs/ACCEPTANCE_AND_TEST_PLAN.md), [Phase 0](docs/PHASE0_FEASIBILITY.md), [backlog](docs/BACKLOG.md), and [decisions](docs/DECISIONS.md). After the overnight implementation, replace this with one bounded unresolved qualification task based on the completed run record.
