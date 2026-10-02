# Phase 0 feasibility plan

Status: full capability gates remain unqualified. [Limited authenticated muted Chrome observations](evidence/runs/20261002-local-beta/auth-baseline.md) now exist after a later explicit implementation/test request. [NEXT_TASK](../NEXT_TASK.md) owns current scope. The original setup did not access accounts/streams. Overnight audio must remain muted, overriding audible portions of planned procedures. Public-source review is in [SOURCES](SOURCES.md).

## Evidence and prerequisites

Use [session](evidence/templates/session.md), [capability matrix](evidence/templates/capability-matrix.md), [mapping case](evidence/templates/mapping-case.md) and [decision](evidence/templates/decision.md) templates. Record exact source revision, time, platform/browser version, hardware/power/display/network, authorized channel eligibility, permitted session count, method and evidence class. Document other household-stream effects without identities. Do not force a fourth base-plan stream.

Keep standard authorized playback as the control. Quality comes from the player's reported mode; record actual 720p/1080p availability and frame rate when shown. Tests cannot assume every channel has both modes. Do not retain protected video, credentials, cookies, signed URLs or raw DOM/network payloads. Screenshots are optional only if safely limited to non-content diagnostics; sanitized manual records are adequate.

## A — independent sessions

1. P0-A1 single and two-session Chrome/macOS baseline: ordinary separate channels, visible render and background return, independent mute/audio, measured resource use; full protocol in NEXT_TASK.
2. P0-A2 separate three/four-session task only where account/channel entitlements permit. At each count: 15-minute steady render, 5-minute background interval, 20 audio transfers, independent channel changes on each surface, no cross-pane mutation, available 720p then 1080p observations. Test 1080p for a full 15-minute interval before claiming its qualification. Use the same baseline/measurement methods. Bound that task to 90 minutes; stop at first failed entitlement or safety gate.
3. P0-C1 later disposable adapter harness: verify independently controllable session identities, confirmed targets and mute/volume, player replacement and DOM-change resilience. Manual A results do not prove automated adapter capability.
4. Repeat critical tests independently on Safari/macOS in SF4-01. Chrome/Windows remains a separate device matrix, NOT RUN on this Mac.

Capture simultaneous rendering directly by visible advancement checks per surface; audio alone does not prove video. Document tab visibility, occlusion, minimized state and background throttling. A fresh foreground screenshot is not continuous-playback evidence.

## B — composition route

Consider in order: (1) multiple supported playback surfaces in one UI, (2) managed tabs/windows, (3) captured tabs only with established allowance and supported protected playback, (4) managed multiwindow fallback. Evaluate each on allowed operation, authenticated player compatibility, session counts, target/audio control, foreground/background render, expand/restore and measured resources. Side Panel/navigation APIs do not imply embed permission or protected-video rendering.

Select the simplest reliable route. A failure caused by cross-origin/frame restrictions, protected capture, account limits or DRM is a capability result. Never disable protections, copy session credentials or proxy streams to obtain a pass. No capture experiment is authorized by this setup. If tiled windows are the only viable route, label them managed windows; do not describe them as a composed single-surface QuadBox.

## C — navigation and resilience

Later harness checks current channel/program read, direct channel/program navigation, play/pause/mute/unmute/volume, playback state and observe/unsubscribe, guide change, player replacement and SPA route survival. Run 10 supported navigation attempts per target class; record target verification and failures. Confirm that augmentation teardown/failure preserves the original player and account controls. Require no duplicate overlays/observers and no unintended extra sessions after repeated route changes.

No direct URL pattern or selector is considered stable until observed and isolated in the adapter. Read failures return UNKNOWN, commands fail explicitly. Do not infer current live playback from a guide row alone.

## D — event mapping and scheduled-end override

Cases: normal game; overtime; extra innings; weather delay; scheduled end one hour ago while still in progress; late start; multiple broadcasts; moved network; stale/missing state; final; suspended/resumed; postponed with makeup identity; channel-name variants/local affiliates; unavailable entitlement; day/timezone boundary.

Fixtures can qualify normalization/visibility/resolver logic once implemented. Each fixture states synthetic inputs and expected outputs. Live observations separately qualify the provider/channel target for that exact event/account/time. Provider replay is historical/simulated timing, never current-game proof. The most important eventual integrated case is an event still in progress one hour after the guide window, remaining discoverable and watchable when eligible and confidently mapped.

## Proposed measurement budgets

These are initial engineering gates, subject to a documented decision before changing them. They are not vendor promises or owner-approved acceptance thresholds.

| Measure | Proposed gate / method |
| --- | --- |
| Render | 15 minutes at each qualified count/quality; each surface visibly advances; background return verified; no entitlement/DRM/session error |
| Stability | No unexplained freeze >10 seconds; ≤1 unplanned stall >3 seconds per surface per 15 minutes; record buffering/ad/transition cause and exclusions |
| Manual audio baseline | 10/10 independent handoffs in P0-A1; only selected source audible or all muted; record timing without implying automation |
| Adapter audio/control | 20/20 isolated mute/select and target-change outcomes for the qualified count; proposed p95 audio transfer ≤500 ms with a trustworthy timer |
| Navigation | ≥9/10 supported target attempts confirmed; proposed p95 click-to-visible playback ≤8 seconds and no >2-second regression against same-channel baseline; record actual sampling |
| CPU | Same Chrome process tree including renderer/GPU processes, 30-second samples for 5 minutes; mean delta vs single session ≤150 percentage points at two feeds, ≤300 at four; 100% = one logical core |
| RAM | Same process-tree method; delta vs single ≤1.5 GiB at two feeds, ≤3 GiB at four; no memory-pressure warning; state whether metric is RSS/working set and avoid double counting shared memory |
| GPU | Record supported diagnostic, utilization/decoder behavior and display configuration; unavailable = UNKNOWN. No thermal warning. Missing diagnostics leaves GPU assessment inconclusive |
| Network | Record sanitized OS-level or trusted diagnostic throughput method, sample period and connection; no fixed bandwidth promise. No signed media request inspection/storage |
| 3-feed budget | Record count-specific data; proposed deltas interpolate to CPU ≤225 points, RAM ≤2.25 GiB. A two/four pass does not automatically qualify three |

PASS requires rendering, independent control/audio, target confirmation, entitlement and the required CPU/RAM/stability budget evidence. Missing a required measurement = INCONCLUSIVE for that gate. Unavailable GPU/network diagnostics remain explicit limitations; the route decision must state whether they prevent confidence in “acceptable performance.” Do not claim a complete performance gate while materially missing diagnostics.

## Stop and gate decision

Stop on missing authorization/auth/eligibility, session-limit/DRM/protected-capture restriction, repeated stalls/freezes, thermal/memory pressure, persistent unintended audio, household-playback disruption, credential/content exposure risk or task time limit. Restore supported playback by closing only test-created surfaces. Record FAIL/BLOCKED/INCONCLUSIVE and the exact untested remainder. Do not purchase upgrades or seek workarounds to restrictions.

Full QuadBox needs four permitted simultaneous reliable independently controllable/mutable/muteable targets, a supported allowed route and acceptable measured performance. Four failing with two passing selects dual-view first. Composition failure with sessions passing selects a demonstrated managed-surface fallback. Coexistence failure permits improved single-playback UI/Sports or a documented defer verdict. Sports must not depend on the QuadBox gate. Record decisions in [DECISIONS](DECISIONS.md).
