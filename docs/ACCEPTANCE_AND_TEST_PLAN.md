# User acceptance and test plan

Updated 2026-10-03 EDT. C1-RG2 consolidated readiness/handoff COMPLETE in the authorized main-plus-one scope. Current installed017/50a15df68eb2c3db/same ID and54 unchanged hashes retain102-test verification. **Full foundation/MVP/beta and owner signoff remain PARTIAL/OPEN.** [Every U01–U18 and AC01–AC14 exact-candidate disposition](evidence/runs/20261002-c1-rg2/acceptance-ledger.md) separates observed results, local tests, unrun/blocked cases and deferred features. [One release ledger](evidence/runs/20261002-c1-rg2/release-checks.md) owns remaining prerequisites. Historical listening stays on008, guide Sports viewing on012, and current navigation-volume/feedback on017. No current audio enable/transfer or lifecycle acceptance inferred.

## Explicit user criteria — complete Chrome core MVP

| User criterion | Required Chrome behavior | Planned evidence |
| --- | --- | --- |
| U01 | Immediately access a compact live guide without navigating through the standard UI | Integrated browser guide entry and usability review |
| U02 | Switch channels quickly through guide, favorites, recents and search | Confirmed target/channel observations for each path, timing versus baseline |
| U03 | Previous returns to the last watched channel | Confirmed-switch state and failed-navigation regression cases |
| U04 | Channel order, favorites and hidden-channel settings persist | Save/reload/reopen on the identified Chrome build |
| U05 | Team search finds the current game from actual game state | Sports query/state fixtures plus permitted current provider evidence |
| U06 | Extra innings/overtime beyond scheduled end remains findable | One-hour-overrun fixture and separate actual observed mapping/playback when available |
| U07 | A game active after weather delay, late start or disruption remains findable | Delay/resume/late-start fixtures and explicit status/freshness; held games not falsely labeled active play |
| U08 | Resolve an eligible available channel and launch it directly | Entitlement/candidate provenance, ambiguity handling and current target confirmation |
| U09 | Live Sports shows scores, state and channel with Watch/Add | Integrated Sports view, truthful unknown/unavailable actions and mapping |
| U10 | Add arbitrary 2–4 eligible channels/events into QuadBox | Independent arbitrary selection and event/channel pane cases at qualified counts |
| U11 | Streams play simultaneously where browser/YouTube TV restrictions permit | Count/quality/route/account-specific live evidence and disclosed unsupported counts |
| U12 | Click or shortcut transfers audio focus; others remain muted and visible | Audio and render checks, keyboard/focus conflict cases |
| U13 | Expand one pane and return to the same QuadBox layout | Selected pane, layout snapshot and Esc/restore evidence |
| U14 | Replace one pane independently | Other panes' channel/event/session/audio state retained |
| U15 | Finished game shows final state and live replacements | Fresh FINAL pane retained; suggestions require fresh current status/eligible mapping |
| U16 | Last QuadBox and UI preferences persist locally | Save/reopen with fresh entitlement/target revalidation; no transient session replay |
| U17 | Normal YouTube TV features remain available | Original player/account/DVR/ads controls accessible in integrated build |
| U18 | Sports data, resolver or UI failure gracefully preserves underlying playback | Provider/ambiguity/injection failure and teardown evidence |

The complete flow must work reliably in Chrome for the core MVP to be complete. Safari compatibility is the next release gate. Native macOS remains a separate feasibility-driven phase, not an MVP requirement. Platform/account limitations remain binding. A demonstrated smaller dual-view or managed-window delivery requires an explicitly separate scope verdict; it does not silently pass the full QuadBox/three-game flow.

## Representative end-to-end flow

The following game scores, channels and times are illustrative fixtures, not real-event, carriage or entitlement claims:

1. Open authorized YouTube TV in Chrome and enter the desktop UI.
2. Open Live Sports. Show Yankees 5–5, bottom 11, YES; Rutgers 24–21, fourth quarter 3:18, FOX; Georgia 17–14, resumed after a delay, ESPN2. Show eligibility/mapping and freshness honestly.
3. Add the three games to QuadBox. All three authorized eligible feeds play simultaneously within permitted browser/account restrictions.
4. Click Yankees: its audio becomes active; the other two feeds remain visible and muted.
5. Expand Yankees, then press Esc. Restore the same three-pane layout and event identities.
6. Receive a fresh Yankees FINAL state. Retain its pane/final score and present replacement choices from currently live eligible games.
7. Replace only the Yankees pane. Rutgers and Georgia keep their sessions and state; audio focus remains coherent.
8. Separately verify persistence/reopen, ordinary YouTube TV controls and provider/resolver/UI failure isolation for U16–U18.

Fixture UI/state testing can exercise the rare-state journey after implementation. Only actual authorized playback evidence can establish the simultaneous rendering, independent audio and target parts. The named networks might be unavailable; a live qualification uses actual eligible equivalents with recorded provenance rather than pretending these fixtures were watched. If three eligible simultaneous sessions cannot be established, record that the representative full flow is blocked and preserve any demonstrated reduced alternative separately.

## Proposed engineering criteria and verification

These specify measurable budgets and planned checks supporting U01–U18. Their numbers are engineering proposals, not additional quoted user requirements or completed acceptance.

| ID / requirements | Proposed acceptance behavior | Planned verification |
| --- | --- | --- |
| AC01 / R01–R03 | Authorized playback/account controls remain accessible; Watch/Guide/Sports/qualified QuadBox share current context | Browser/manual original-player control, injected-UI failure and teardown |
| AC02 / R02–R05 | Watch/Guide/Sports surface change p95 ≤150 ms for local cached UI on a recorded Mac; display supports dense readable keyboard navigation | Instrumented 30 transitions per surface, desktop viewport checks/accessibility; playback latency separately measured |
| AC03 / R03–R05 | Confirmed channel switch updates current/previous/recents correctly; one-action previous and favorites work | Unit state transitions and browser navigation including failure/repeated observer events; proposed playback p95 ≤8 seconds vs baseline |
| AC04 / R04–R05 | Guide favorites/order/hide, current/next, fast search and Watch/Add availability reflect saved state | Fixture view-model tests, settings reload, browser keyboard/focus and guide refresh |
| AC05 / R05,R23 | G/S/Q/P/M/1–4/Enter/Esc/arrows are configurable and do not steal input/player/browser focus | Editable-input/contenteditable, assistive navigation and player-control interaction tests |
| AC06 / R06–R09,R19 | Fresh in-progress event one hour after scheduledEnd remains discoverable with score/status and eligible confidently mapped Watch/Add | Fixture override first; separate observed live overrun and actual mapped target evidence when available |
| AC07 / R06–R09 | Delayed/suspended explicitly indicate hold; stale/unknown never falsely assert FINAL or remain live forever; fresh final exits Live Sports | Normalization/transitions/missed polls/empty feed/freshness/two-hour unresolved retention fixtures; no guide-end final inference |
| AC08 / R10 | Resolver presents provenance/confidence, blocks ambiguity/unavailable entitlement and verifies changed targets | Names/IDs/local affiliates/multiple feeds/moved-network/conflict/stale-target fixtures plus authorized browser mapping |
| AC09 / R09,R22 | Team/league search returns relevant events without channel knowledge and labels data freshness/availability | Search fixtures for requested league/team examples, empty/error/429 handling; provider coverage review |
| AC10 / R11–R13 | Supported count 2/3/4 renders independent eligible feeds with one audible source; selection and Replace do not mutate other panes | Count-specific Phase 0/live matrix + state/audio handoff tests; no entitlement assumptions |
| AC11 / R11–R13 | Enter/double-click expand; Esc restores prior layout p95 ≤150 ms for local UI; final pane remains with final score and fresh eligible suggestions | State/focus/gesture race fixtures, 30 expand/restore transitions, live qualified route check |
| AC12 / R13,R23 | Add/Create preserves event identity; network move resolves safely; saved layout restores after revalidation | Resolver/QuadBox/persistence fixtures; current target and entitlement browser evidence |
| AC13 / R24–R25 | Adapter/provider failures are explicit; Sports independent of DOM; original playback survives enhanced-guide failure | Failure injection, stale/unknown checks, observer cleanup and sanitized-log inspection |
| AC14 / R14–R16 | Shared domain/UI logic with independent Safari qualification; native gate decides supported route or defer | Safari/macOS matrix later; separate WKWebView auth/protected playback spike; no transfer of Chrome results |

Phase 1 can pass AC01–AC05/AC13 for a single-playback foundation milestone. Phase 2 supplies P0 Sports and resolver behavior. Complete Chrome core MVP runs through Phase 3 and requires U01–U18 and the full representative flow, including qualified QuadBox. Owner usefulness/acceptance is a separate later explicit verdict on an identified build. Record unsupported counts/routes honestly; reduced-scope alternatives remain separate.

## Planned automated tests

Automated domain/adapter/mock Chrome tests exist and pass; local fixture UI checks and limited real guide/channel checks are recorded in the dated run. Broader tests below remain planned unless that run explicitly records them. [tests/README](../tests/README.md) owns future placement; [fixture catalog](../tests/fixtures/README.md) lists cases.

- Core/sports: each league normalization, nullable score/clock, state transitions including corrections, guide-end override, delay/late start/overrun, stale/unknown and paused updates, timezone/midnight, tracked IDs after empty live feed, postponed/makeup identity.
- Resolver: stable IDs/channel names, aliases/local affiliate differences, team/league/start match, conflicting evidence, confidence tie/margin, multiple broadcasts, unavailable entitlement, stale target and network moves.
- Storage: all required keys, order/hidden/favorite interaction, capped recents and confirmed previous, schema migration/corrupt input, persistence/reload, layout restore with revalidation; no transient session/secret persistence.
- QuadBox: arbitrary event panes, single audio owner/all-muted, failed transfer, independent Replace/dispose, expand/restore/gesture race, event moves, FINAL pane retention, fresh recommendations, unsupported count.
- Provider adapters/search: rate/error/backoff/429, cache/freshness/source timestamps, payload missing fields, coverage gaps, pagination, query matching and stable identifiers. Replay/fixtures label their evidence class.
- Browser: navigation/current channel/program, guide updates, channel switching, original player controls, replacement/SPA survival, duplicate injection/observer cleanup, editable input shortcuts and enhancement failure isolation.

## Manual device matrix — qualification incomplete

| Environment | Required future evidence | Current status |
| --- | --- | --- |
| Chrome / macOS | Single playback → 2/3/4 as permitted, audio/targets, injection/SPA, 720p/1080p availability, resources and chosen route | Limited 720p muted auth/guide/channel observations in Chrome154; full continuous/audio/performance/count matrix unqualified |
| Chrome / Windows | Same relevant matrix on actual Windows hardware | NOT RUN; cannot qualify from this Mac |
| Safari / macOS | Auth/protected playback, shared bridge, injection, storage/shortcuts, sessions/background/audio/performance/route | NOT RUN; independent qualification required |
| Native / macOS | Auth/persistence/protected playback first, then multiple views/GPU/fullscreen/audio/reuse | DEFERRED; WKWebView compatibility unverified |

Use [evidence templates](evidence/README.md). Record exact revision and environment; fixtures passing do not establish provider freshness, channel availability, stream counts, DRM, protected capture, browser behavior, owner acceptance or publication readiness. Repeat applicable checks only after meaningful changes or unresolved failures.


## C1-RG2 consolidated readiness closeout

Updated 2026-10-03 EDT. **COMPLETE for consolidated evidence/readiness and everyday-use handoff; usable main-plus-one managed-window scope; full foundation/MVP/beta and owner signoff PARTIAL/OPEN.** Installed **v0.1.17 / 50a15df68eb2c3db / idaaiiafgopfpaojpnhaoefbefllioab**,54 hashes unchanged, recorded102-test verification retained. No repair/build/reload pending. [Verdict](evidence/runs/20261002-c1-rg2/run.md), [all U01–U18/AC mappings](evidence/runs/20261002-c1-rg2/acceptance-ledger.md), [one grouped remaining release ledger](evidence/runs/20261002-c1-rg2/release-checks.md), [everyday use](../START_HERE.md).

Current017 navigation-volume/recovery feedback and muted main+one retained; guide Sports012 and practical dual/listening008 retain their original scope. New safe cached-settings, keyboard-dialog/failure/Find and original-player controls passed. Exact Comics Unleashed paused4:36/100%/720p and player/tab/site mute preserved; no program replacement or test surface. Active mute holds audio; unsupported lifecycle unrun. Three timing samples/surface include transport overhead;11 paused Chrome-tree samples over5min provide aggregate context only, not matched active/per-feed budgets. Independent game-state/scores and full composition remain open. Prior sections are retained history; this closeout and NEXT_TASK own current disposition.

## Owner-selected beta workspace acceptance — 2026-10-03

| ID | Required beta behavior | Evidence boundary |
| --- | --- | --- |
| BTV01 / R21 | Compact persistent remote; expandable discovery; reopening/closing leaves players intact | Installed remote/singleton/responsive/focus observations; Chrome native frame acceptable |
| BTV02 / R22 | Auto-arrange1–4 enrolled players readably inside TV area; Add/Close reflow and Expand/Restore preserve layout | Pure geometry plus installed actual bounds/video/control accessibility; unrelated windows unchanged |
| BTV03 / R23 | Up to four TOTAL players with isolated Add/Replace/Close and audio ownership | Meaningful1–4 local session tests plus actual allowed count-specific advancing playback; account refusal is explicit, not bypassed |
| BTV04 / R24 | Choose monitor or draw/resize TV rectangle; persist area, cancel/reset, recover changed displays | Logical-coordinate/scaling/negative-origin/min-size/permission tests and installed monitor/area readback; no capture required |
| BTV05 / R25 | Four TOTAL enrolled Chrome feeds may mix YouTube TV, Prime Video and Netflix, with explicit tab enrollment/Return, service-aware native controls/fallbacks and isolated failures | Local service/mixed-session regressions plus real service-specific readiness/controls and permitted mixed3/4 advancing-player observations; host consent is explicit, windows alone are insufficient |
