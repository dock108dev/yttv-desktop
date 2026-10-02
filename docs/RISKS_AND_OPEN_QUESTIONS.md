# Risks and open questions

Updated 2026-10-02. These are actual unresolved planning gates, not discovered runtime defects. See [sources](SOURCES.md), [Phase 0](PHASE0_FEASIBILITY.md) and [provider evaluation](PROVIDER_EVALUATION.md).

| ID | Risk / unknown | Impact / response | Resolution owner and gate |
| --- | --- | --- | --- |
| Q01 | Account-specific permitted stream count, household use and channel entitlements uninspected | Cannot claim two/four feeds; verify capability without identity logging; stop on limits | User + P0-A1/A2 |
| Q02 | Independent Chrome render/background/audio/targets/performance untested | Full QuadBox is conditional; retain dual/supported-window/defer routes | Phase 0 evidence |
| Q03 | Browser native multiview is documented unavailable, but independent-session/composition route is unverified | Public feature limitation does not prove feasibility or allowance of our route | P0-A/B policy and technical gates |
| Q04 | DOM selectors, target handles and SPA/player replacement unobserved | Isolated adapter capability failures; original player remains usable | P0-C1 and Phase 1 |
| Q05 | Embed/capture/protected playback/platform allowance unestablished | No assumption that API availability permits recomposition; no bypass | P0-B1/B2, official policy review within later scope |
| Q06 | Sports provider coverage, real freshness, delay/terminal states, broadcasting rights/cost unknown per league | No provider chosen; fixture work can proceed; freshness and unknown explicit | S2-01 with official terms and actual data evidence |
| Q07 | Provider broadcast labels may not resolve to local eligible currently playable YTTV targets | Provenance/confidence/alternatives; no silent fuzzy mapping or forced network move | Resolver fixtures + authorized live mapping |
| Q08 | Data outage/pause/correction/makeup IDs can create false final/live status | Tracked IDs, separate fetch/source freshness, unresolved bucket and corrections | Sports fixtures + per-provider policy |
| Q09 | Proposed performance/freshness/latency budgets need calibration | Record raw measurements and revision; change budgets through decision log, never after-the-fact silent relaxation | Phase 0 / identified product review |
| Q10 | Safari APIs, auth/DRM/injection/session behavior may differ | Shared contracts/domain logic, independent capability matrix; can trail Chrome | SF4-01 |
| Q11 | WKWebView authenticated protected playback may fail or provide no advantage | Test it first; supported-browser controller or defer, no DRM workaround | MAC5-01 |
| Q12 | Shortcuts conflict with text/player/browser/accessibility controls | Context-aware configurable bindings, keyboard/focus tests | C1-03 |
| Q13 | Provider secret cannot be kept confidential in client bundle | Decide permitted credential-free route or minimal sports-metadata relay before integration | S2-01; no service provisioned |
| Q14 | Full Chrome MVP includes the complete Sports/QuadBox flow; feasibility may support only a smaller route | Keep reduced dual/window alternatives distinct; never mark Phase 1/2 or a failed three-game flow as the full MVP | MVP-01 and explicit owner verdict |
| Q15 | Windows evidence absent | Manual matrix remains NOT RUN; don't transfer Mac results | Later actual Windows test |

No additional product-scope question is required to complete this setup. Immediate future execution blockers are missing playback-test authorization, unverified authenticated readiness, account allowance and eligible channels. Technical feasibility gates are pending experiments, not setup failures. No current application bugs can be claimed before an implementation exists.
