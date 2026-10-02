# Product brief

Prepared 2026-10-02 from the user-supplied organized requirements, including the completed section 28. This is a faithful planning synthesis, not a verbatim transcript. Requirement IDs below link to the [backlog](BACKLOG.md) and [test plan](ACCEPTANCE_AND_TEST_PLAN.md).

## Intent and boundaries — R01

“YouTube TV provides the streams. We provide the desktop television experience.” Build a modern desktop UI over authorized YouTube TV. YouTube TV owns authentication, entitlements, DRM, delivery, DVR, ads and account management. Our layer owns navigation, display density, local preferences, sports discovery and conditional multiview. Preserve the existing authorized player where practical.

Problems to solve: excessive channel navigation, unused desktop space, cumbersome guide, weak persistent favorite/recent/previous workflows, limited keyboard control, and discovery that wrongly follows TV schedule windows when a game overruns, starts late, is delayed or moves network. The key question is: “Is this game still happening, and where can I watch it?” Current native browser limits must be checked rather than assumed; [official source notes](SOURCES.md) retain today's findings without claiming local feasibility.

No decryption, Widevine reverse engineering, protected-stream proxying, DRM circumvention, Google login/account/billing/DVR replacement, ad avoidance or streaming-provider business. No backend or separate account system for MVP unless a documented provider-auth/rate-limit need makes a minimal service necessary.

## Four near-instant surfaces — R02

Watch, Guide, Sports and QuadBox share a persistent navigation/state model. UI transitions should feel immediate; playback switching remains constrained by the authorized service. Proposed UI and playback latency targets live in the [test plan](ACCEPTANCE_AND_TEST_PLAN.md), not in a guarantee of instant streams.

## Watch and guide — R03–R05

Watch keeps current channel/program/event context and one-action access to previous channel, favorites, recents, guide, sports, QuadBox and search. Dense desktop guide rows support favorites first, custom order, hidden channels, recents, current-channel indicator, current/next programming, sports state, fast search, keyboard navigation, Watch and Add to QuadBox. Sports metadata enriches schedules without owning the stream.

Proposed configurable shortcuts: G Guide, S Sports, Q QuadBox, P Previous, M Mute, 1–4 active pane, Enter expand, Esc restore prior layout, arrows navigate. Resolve conflicts with editable fields, player controls, browser shortcuts and assistive technology before enabling bindings. No shortcut should steal typing or unexpectedly change playback.

YES/Yankees extra innings, ESPN/SportsCenter, FOX/Rutgers and ESPN2/weather delay are illustrative examples. They do not establish current network carriage, local availability, package eligibility or a valid playback target.

## Independent sports engine — R06–R09

Initial leagues: MLB, NFL, NCAA Football, NBA and NHL; league adapters normalize a common extensible event model. Event fields include id, league, homeTeam, awayTeam, scheduledStart, scheduledEnd, status, statusDetail, score, period, clock, broadcastNetworks[], originalChannel, currentChannel and yttvTarget.

States: SCHEDULED, PREGAME, LIVE, DELAYED, HALFTIME, OVERTIME, EXTRA_INNINGS, SUSPENDED, FINAL, POSTPONED and CANCELLED. Freshness and UNKNOWN are separate explicit quality/state extensions proposed in [architecture](ARCHITECTURE.md). A delay or suspension describes a hold, not certainty of active play.

Never remove an event solely because its guide window expired. Consult current sports state; retain discoverability for overtime, extra innings, delay, late start or running long. Fresh FINAL removes it from the live list. Stale or missing data must not assert FINAL or promote an event as live forever. Show last known state/time and unresolved freshness where necessary. Keep a recently scheduled but still active event with score/status/channel and eligible Watch/Add actions.

Team/league search routes through the Sports Engine first. Queries such as Yankees, Rutgers, NFL, NHL, Knicks and Rangers should expose score, period, network and Watch/Add without requiring channel knowledge. These names describe search intent, not guaranteed event/channel availability.

## Event resolver — R10

Resolve real event → broadcast network → user's available YouTube TV channel → currently playable target. Combine provider broadcast metadata, guide metadata, channel/program/team names, league/start time and observed playback metadata. Preserve confidence and provenance. Attempt resolution after changed feeds; ambiguous mapping needs explicit alternatives/unavailable status, never silent trust. A network label alone is not entitlement or current-playback proof.

## QuadBox — R11–R13

Conditional arbitrary 2/3/4-feed layout, subject to Phase 0. Pane shows video, channel, event/status and audio indicator. Single click selects and transfers audio; double click or Enter expands; Esc immediately restores previous layout; Replace opens a compact guide/sports selector. A final game retains its pane and final score, with suggestions drawn from currently live games; it is not destroyed automatically.

Each QuadPane holds eventId, resolvedChannel, playbackTarget and playbackSession. Select games on Sports, then Create QuadBox. Event identity persists across network moves, with resolver confirmation before changing a target. Arbitrary event selection comes before college-football presets. Persist layouts and last QuadBox; restoration must revalidate freshness/availability before playing stale targets.

## Browser and native delivery — R14–R16

Proposed TypeScript/React monorepo: packages/core, ui, sports-engine, yttv-adapter, event-resolver, quadbox and storage; apps/chrome-extension, safari-extension and macos. Chrome is the reference implementation: MV3, content scripts, React injection, tab/window management, Side Panel, commands and local storage as suitable. Capture is a gated possibility only if permitted and viable; an API does not prove protected-video composition is allowed or works.

Safari shares UI, engine, resolver, state, adapter contracts and QuadBox logic behind browser bridges. Independently validate auth, protected playback, injection, sessions, storage, keyboard controls, performance and composition; it may trail Chrome.

Native macOS is a later conditional Swift shell/WKWebView/shared React spike. First prove authenticated protected playback, auth persistence, multiple views, GPU, fullscreen, audio and extension reuse. Proceed only if demonstrably better or more reliable. If incompatible, assess a native controller around a supported browser without circumventing restrictions. Goals include app window/fullscreen control, media keys and menu-bar affordances.

## Feasibility-first implementation — R17–R20

Phase 0 uses disposable capability harnesses before product implementation. Test independent 2/3/4 Chrome sessions, background behavior, limits/DRM, audio, DOM resilience and CPU/GPU/RAM/network at available 720p/1080p; repeat critical Safari checks later. Consider composition in order: multiple surfaces within one UI, managed tabs/windows, gated capture, managed multiwindow fallback. Choose the simplest reliable allowed route.

Test current channel/program identification, direct navigation, playback state, guide updates, player replacement and SPA survival. Test normal sports mapping, overtime/extra innings, delay, overrun, late starts and multiple broadcasts. Fixtures cover rare conditions, explicitly distinct from observed live evidence.

Full QuadBox requires four reliable independently controllable/mutable/muteable sessions and acceptable measured performance within actual entitlements. If four fail and two work, deliver dual view first. If coexistence fails, advance guide/navigation and Sports independently, with a supported managed-window fallback where feasible or defer multiview. No base-plan assumption of four streams.

## Phases and priorities — R21

Phase 1 improves single-playback Chrome: shell/adapter, navigation, dense guide, favorites, recents, previous, order/hide, shortcuts and persistence. Phase 2 adds provider integration, normalization/polling, team search, game state, resolver, Sports and guide enrichment. Phase 3 adds conditional QuadBox/audio/event panes, expand/restore/replace, overlays, Add and final-game suggestions, completing the Chrome core MVP only when its full user acceptance flow works reliably. Phase 4 ports Safari as the next release gate; Phase 5 separately evaluates native macOS.

Overall P0 includes playback integration, navigation, guide, previous/favorites, Live Sports and overrun/delay behavior. P1 includes QuadBox 2–4, audio, event panes, sports search/Add. P2 includes Safari, presets, favorite teams and recommendations. P3 includes native, additional sports and personalization. Delivery sequence and feature priority are separate: the Phase 1 foundation precedes P0 Sports in Phase 2; Phase 1 alone does not satisfy the complete P0 promise. Both Phase 2 Sports and Phase 3 QuadBox are required for the user's complete Chrome MVP; a feasibility-driven smaller delivery is a distinct alternative. See [roadmap](ROADMAP.md).

## Data, local state and failures — R22–R25

Vendor-neutral provider interface: getEvents(date), getEvent(id), getLiveEvents(), returning Promise<Event[]> or Promise<Event> as appropriate. Start inexpensive/free only when rights and coverage permit. Evaluate leagues, latency, broadcast metadata, delay/postponement states, rate limits, licensing and cost. Never package provider secrets in an extension; document minimal server/local relay alternatives before provisioning anything.

Local state: favorites, hiddenChannels, channelOrder, recentChannels, previousChannel, favoriteTeams, favoriteLeagues, keyboardMappings, quadLayouts, lastQuad and UI preferences. No new account system for MVP.

Enhanced guide failure must allow authorized playback to continue. Sports does not depend on DOM parsing. Log categories: YTTV_ADAPTER, SPORTS_PROVIDER, EVENT_RESOLVER, PLAYBACK, QUADBOX, UI. Never log credentials, tokens, signed playback URLs or protected content.

Plan fixtures and automated tests for normalization, transitions, event/channel and channel-name matching, persistence, QuadBox state, provider adapters and sports search. Browser checks cover navigation/switch/guide/player/SPA/injection. Manual playback matrix: Chrome/macOS, Chrome/Windows and Safari/macOS. This Mac cannot supply Windows qualification.

## Explicit Chrome core MVP acceptance — R26

Completed section 28 defines the user's 18 success criteria: compact guide access; fast switching via guide/favorites/recents/search; Previous; persistent channel settings; actual-state team search; overtime/extra-innings and delay/late-start discoverability; eligible direct targets; Live Sports score/state/channel Watch/Add; arbitrary 2–4 eligible feeds where restrictions permit; audio focus with other panes muted and visible; expand/restore; independent Replace; final state/live alternatives; last layout/UI persistence; original YTTV features; and failure isolation. See the full [user acceptance table and representative flow](ACCEPTANCE_AND_TEST_PLAN.md).

Representative fixture journey: open YouTube TV → desktop UI → Live Sports with Yankees 5–5 bottom 11 on YES, Rutgers 24–21 fourth quarter 3:18 on FOX and Georgia 17–14 resumed after a delay on ESPN2 → add three games → simultaneous playback → Yankees audio focus → expand → Esc same layout → Yankees FINAL → live alternatives → replace only that pane. The event/network/score examples are illustrative fixtures, not confirmed carriage or real-game facts.

If the entire flow works reliably in Chrome, the core MVP is complete. Safari compatibility is the next release gate. Native macOS remains a separate feasibility-driven phase and is not an MVP requirement. Engineering measurement targets remain proposals; a passing documentation check is not acceptance of this flow.
