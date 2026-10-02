# Next task — P0-A1: Chrome two-session baseline

Updated 2026-10-02. **READY AS A PLAN; EXECUTION NOT RUN.** This is the authoritative task. See the [Phase 0 plan](docs/PHASE0_FEASIBILITY.md) and [session template](docs/evidence/templates/session.md).

## Purpose and scope

Establish whether two ordinary authorized Chrome/macOS YouTube TV sessions can render separate eligible channels concurrently and retain independent audio control. Start with a single-session baseline, then two sessions. Maximum 45 minutes of operator time. No extension, injection, capture, embedded player, Safari, native app or provider integration in this task.

## Prerequisites for the later run

- The user expressly requests the playback test and personally handles any needed authentication.
- Use an existing supported Chrome installation and the user's authorized membership. Record browser/macOS versions, machine model/RAM, power state, display setup, connection type and an anonymized subscription capability note.
- Determine allowed simultaneous streams and other household streams without collecting account identifiers. If a second stream is not permitted/available, mark BLOCKED; do not try another profile, account or network to evade the restriction.
- Choose two available channels and record sanitized channel labels. Illustrative networks from the brief are not entitlement proof.
- Copy the template to `docs/evidence/runs/<UTC-date>-p0-a1/session.md`; record source revision and start time. No session record should imply an experiment happened merely because the template exists.

## Procedure

1. Record the unenhanced single-session baseline: 5 minutes at 720p when that quality is available. Use player-reported quality; record UNKNOWN if unavailable. Record process-tree CPU/RAM, available GPU diagnostics, network method and visible rendering/stalls.
2. Open the second ordinary tab/window to a different eligible channel. Arrange visible windows and measure 15 minutes of concurrent playback at the same available quality. Include 5 minutes with one tab in the background, then return and verify its video advanced. Use visible program progression, not merely an audio indicator.
3. Perform 10 audio handoffs using existing player controls: mute the old source, unmute the new one, verify no unintended overlap. Record independent control success, handoff timing and failures. Do not claim controllable extension sessions from this manual result.
4. Record 5 minutes of steady two-session CPU/RAM samples at 30-second intervals; capture GPU and network metrics only through ordinary diagnostics that do not expose tokens or content. If no trustworthy measurement is available, mark UNKNOWN. Never invent a zero.
5. If 720p is stable and 1080p is available, observe 5 minutes at 1080p; label that shorter observation as preliminary. Otherwise record unavailable/not attempted. Do not force unsupported resolutions.
6. Close only the test-created extra surface, restore the original supported player, and record result, stop reason and evidence limits. Do not save screenshots containing protected video or private account details.

## Proposed success criteria

Use [Phase 0's proposed budgets](docs/PHASE0_FEASIBILITY.md#proposed-measurement-budgets). Two independent eligible feeds remain visible/advancing for the 15-minute window, including return from background; no entitlement/DRM/session-limit error; 10/10 independent audio handoffs; no unexplained freeze over 10 seconds and at most one unplanned stall over 3 seconds per feed. Ads/channel transitions are recorded separately, never silently discarded.

Two-versus-one steady-state mean CPU increase should be at most 150 percentage points across the same Chrome process tree (100% = one logical core), RAM increase at most 1.5 GiB, and no thermal/memory-pressure warning. Record measurement method and absolute values. Missing rendering/audio evidence prevents PASS; missing performance data gives INCONCLUSIVE for that gate. These are proposed engineering budgets, not owner acceptance or vendor guarantees.

## Stop conditions

Stop at missing authorization/authentication/entitlement, stream-limit or protected-playback error, two repeated unexplained freezes, thermal or memory-pressure warning, unintended persistent audio, interference with another user's playback, unsafe evidence exposure, or 45 minutes elapsed. Close test-created extra surfaces and retain a sanitized BLOCKED/FAIL/INCONCLUSIVE record. Do not troubleshoot by bypassing a gate or purchasing an upgrade.

## Deliverable and next boundary

One completed session record with baseline and two-session measurements, 10 audio outcomes, background behavior, quality, limitations and PASS/FAIL/BLOCKED/INCONCLUSIVE verdict. Update [P0-A1 in the backlog](docs/BACKLOG.md), [decisions](docs/DECISIONS.md) and this task. A passing result can support a separate P0-A2 three/four-session task only within verified entitlements; it does not prove composition, adapter automation, Safari, Windows, native playback or product acceptance.

## Current blockers

Execution authorization, authenticated playback readiness, account-specific stream allowance and channel eligibility are unverified. No live test has been started. Documentation setup itself is complete once [setup verification](docs/SETUP_VERIFICATION.md) passes.
