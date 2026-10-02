# Decision log

Updated 2026-10-02. “Accepted” below means a planning/setup choice within this request, not product acceptance. Use [decision template](evidence/templates/decision.md) for later capability decisions.

| ID | Date | Status | Decision and basis | Consequences / revisit |
| --- | --- | --- | --- | --- |
| D001 | 2026-10-02 | Accepted for setup | Place yttv-desktop directly under Desktop with sibling yttv_next_steps.md, following inspected existing project/tracker layout | Detailed canonical task inside repo; Desktop tracker points to it; no sibling edits |
| D002 | 2026-10-02 | Accepted | Documentation-first scaffold, private local git main, no dependencies or runnable application | No installation, sign-in, live tests, credentials, remote or publication in setup |
| D003 | 2026-10-02 | Accepted | YouTube TV owns authentication/entitlements/DRM/delivery/DVR/ads/account management | Our failures preserve supported playback; no stream extraction/proxy/bypass |
| D004 | 2026-10-02 | Accepted as proposed architecture | Shared TypeScript/React domain/UI packages, isolated YTTV selectors/browser bridges, vendor-neutral Sports Engine independent of DOM and QuadBox | Toolchain/contracts remain unimplemented; choose runtime tooling later |
| D005 | 2026-10-02 | Accepted | P0-A1 is the next bounded two-session Chrome baseline, later authorized execution only | Pass does not qualify four feeds, capture, adapter control, Safari or Windows |
| D006 | 2026-10-02 | Accepted | Distinguish phase sequence from priority: Phase 1 foundation, Phase 2 P0 Sports, Phase 3 complete Chrome core MVP | All 18 user criteria and complete flow required; Safari next release gate; native separate |
| D007 | 2026-10-02 | Proposed policy | Freshness/UNKNOWN and unresolved retention prevent guide-end finality or stale perpetual live claims | Validate per-provider timestamp/pause semantics; record any change before implementation |
| D008 | 2026-10-02 | Proposed budgets | Measurable Phase 0 render/audio/navigation/CPU/RAM targets and explicit GPU/network unknowns | Calibrate with observations; never silently redefine pass after a failure |
| D009 | 2026-10-02 | Pending | Composition route and qualified feed count | Requires entitlement, render/control and performance evidence; full/dual/windows/defer |
| D010 | 2026-10-02 | Pending | Provider and auth/metadata-relay approach | Requires per-league coverage/rights/freshness/broadcast/limits/cost decision; no provisioning |
| D011 | 2026-10-02 | Pending | Safari and native viability | Independent Safari tests; native auth/protected playback first |
| D012 | 2026-10-02 | Accepted | Completed section 28 supplies explicit user acceptance | Preserve 18 criteria/E2E flow; engineering budgets proposed; reduced-scope alternatives distinct from full MVP |

Retain dates, evidence class/revision and unknowns. An official API page can inform a design decision but cannot substitute for local playback evidence. Link failed/blocked experiments too; no live result exists yet.
