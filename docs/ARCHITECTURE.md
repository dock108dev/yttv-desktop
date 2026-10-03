# Proposed architecture

Status: shared contracts and the Chrome foundation are implemented. The S2-L1 NBA adapter, metadata-only local relay, provider-state UI and guarded event intents are verified locally; real acquisition/mapping awaits the combined access/permission handoff. Detailed proposals below remain design context where not reflected by current code/evidence. Read [product](PRODUCT.md), [Phase 0 gates](PHASE0_FEASIBILITY.md) and [sources](SOURCES.md).

## Boundaries and package ownership

| Workspace | Responsibility | Dependency boundary |
| --- | --- | --- |
| packages/core | Event/channel IDs, shared contracts, errors, freshness, capability results | No DOM, provider, browser or UI dependency |
| packages/ui | Watch/Guide/Sports/QuadBox components, accessible focus and keyboard behavior | core; receives view models/callbacks |
| packages/sports-engine | League/provider adapters, normalization, polling/cache, search, visibility policy | core; no YTTV DOM dependency |
| packages/yttv-adapter | Selectors, player observations/navigation, capability negotiation | core; browser bridge injected by app |
| packages/event-resolver | Event/network/channel/target matching with provenance/confidence | core; sports and guide snapshots as inputs |
| packages/quadbox | Event panes, sessions, audio focus, expand/restore, replace, suggestions | core; adapter contract supplied at runtime |
| packages/storage | Versioned local preference/layout persistence and migrations | core; browser storage bridge supplied by app |
| apps/chrome-extension | MV3 shell, content-script/Side Panel/background bridge, tab/window management | Compose shared packages; Chrome-specific capabilities |
| apps/safari-extension | Safari package and browser bridge | Same domain logic; explicit API/capability differences |
| apps/macos | Conditional Swift host, React bridge, window/media integration | Deferred; authenticated playback gate first |

Flow: provider → Sports Engine → resolver + available guide/channel snapshot → UI intents → adapter/session manager → original authorized player. Sports can operate with unavailable guide/playback targets. Adapter failure disables augmentation without tearing down YouTube TV playback. UI never obtains DRM keys, stream bytes or Google credentials.

Chrome content scripts use isolated execution environments; plan an explicit, narrow validated message bridge when necessary. A side panel can host navigation but is not proof that it can host protected playback. Safari reuse and WKWebView feasibility remain independent questions. [Official API notes](SOURCES.md) support these planning boundaries.

## Event model and freshness

Conceptual TypeScript contract (not executable source):

```ts
type EventStatus = 'SCHEDULED' | 'PREGAME' | 'LIVE' | 'DELAYED' |
  'HALFTIME' | 'OVERTIME' | 'EXTRA_INNINGS' | 'SUSPENDED' |
  'FINAL' | 'POSTPONED' | 'CANCELLED' | 'UNKNOWN';
interface Event {
  id: string; league: string; homeTeam: Team; awayTeam: Team;
  scheduledStart: string; scheduledEnd: string | null; // UTC ISO timestamps
  status: EventStatus; statusDetail: string | null;
  score: Score | null; period: string | null; clock: string | null;
  broadcastNetworks: BroadcastCandidate[];
  originalChannel: ChannelRef | null; currentChannel: ChannelRef | null;
  yttvTarget: PlaybackTarget | null;
  providerEventId: string; source: string;
  fetchedAt: string; sourceUpdatedAt: string | null;
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceClass: 'FIXTURE' | 'REPLAY' | 'LIVE';
}
interface SportsProvider {
  getEvents(date: string): Promise<Event[]>;
  getEvent(id: string): Promise<Event>;
  getLiveEvents(): Promise<Event[]>;
}
```

Team, Score, BroadcastCandidate, ChannelRef and PlaybackTarget are planned shared types, not defined source exports yet. Provider IDs are namespaced; league-specific period/clock semantics remain adapter-owned. A null is unknown/unavailable, never a fabricated zero score or channel. scheduledEnd is guide planning data, never authority for finality.

Proposed status policy: fresh LIVE/HALFTIME/OVERTIME/EXTRA_INNINGS remain in Live Sports after scheduledEnd. Fresh DELAYED/SUSPENDED remain discoverable in an explicitly labeled held-events group, with no active-play promise. Fresh FINAL/POSTPONED/CANCELLED leave active groups; FINAL panes remain with the final result. SCHEDULED/PREGAME stay in upcoming unless a provider establishes an active state. Do not infer a game started from its scheduled start.

Proposed polling policy, subject to permitted provider rates: active/held event refresh every 30 seconds; mark stale after three missed refresh windows (90 seconds) or a provider timestamp outside its documented freshness budget. Retain last known state under “Status unavailable — last update …” for up to two hours after the last reliable observation, then move to an unresolved/history area. Do not declare FINAL at either boundary. A returning fresh observation can restore active visibility. Treat request-time freshness and event-update freshness separately: a successfully fetched stale snapshot is still stale. League/provider-specific pause semantics may require longer source-update budgets; document before adopting.

This two-hour retention is a proposed uncertainty-display limit, not a maximum game length; fresh active events are not cut off. Reconcile previous-day schedules and tracked event IDs across midnight/timezones, pagination and delayed resumption. An empty/error getLiveEvents response does not finalize previously tracked games. Allow corrected terminal results and changed provider IDs with provenance; do not silently merge a postponed game with its makeup event.

## Resolver contract

Return eventId, candidates[], selectedChannel/target or null, confidence, reasons, evidence timestamps, conflicts, entitlement state, target verification state and resolution state (CONFIRMED/AMBIGUOUS/UNAVAILABLE/STALE). Preserve originalChannel; currentChannel updates only from corroborated evidence. Broadcast metadata indicates a candidate network, not present user eligibility.

Proposed scoring: stable network/channel ID 0.35; corroborated program/team names 0.25; league and start-window agreement 0.20; fresh channel/playback observation 0.20. Require an available user channel, a controllable supported target and no contradiction before Watch/Add. A score ≥0.85 with ≥0.15 margin is a candidate confirmation rule to calibrate with fixtures; it is not a probability. Lower/near-tied scores show alternatives. Region, add-on, local affiliate, alternate feed and guide-overrun mismatches must not silently select a target.

A changed-feed observation reruns matching. Ask for explicit user selection when ambiguous; never switch a QuadPane just because a fuzzy program title wins. UNKNOWN entitlement/target verification shows a channel candidate and explanatory availability state, not a guaranteed playable button.

## Isolated YouTube TV adapter

Planned stable API: getCurrentChannel, getCurrentProgram, navigateToChannel, navigateToProgram, play, pause, mute, unmute, setVolume, getGuideEntries, getPlaybackState, observePlaybackState, createPlaybackSession, destroyPlaybackSession. Document arguments, timeout/cancellation and session identity when implementing. Reads may return unknown; commands return explicit capability/result errors rather than reporting success on a dispatched DOM click.

A capabilities snapshot reports support for each operation, session limit evidence and current browser/player identity. Result shape: `{ok: true, value, observedAt}` or `{ok: false, code, capability, reason}`. Distinguish UNSUPPORTED, NOT_AUTHENTICATED, NOT_ENTITLED, TARGET_UNAVAILABLE, DOM_CHANGED, TIMEOUT and UNKNOWN; never probe protected internals to fill a missing capability.

Keep all selectors and SPA/player observations here. Dispose old observers on replacement, debounce snapshots, revalidate targets and survive guide/player/route changes without duplicate injection or leaked sessions. Session creation is a capability gate, not a guarantee the service grants another stream. PlaybackTarget is a supported navigation handle, never a signed protected-media URL. Persist channel/event IDs and layout intent, not transient playback sessions.

## QuadBox and persistence

QuadPane: eventId (nullable for ordinary TV), resolvedChannel, playbackTarget, playbackSession, lastKnownEvent/status, availability and audio state. Session IDs are transient. Exactly one pane owns audio unless all are explicitly muted. Transfer mutes the old session before enabling the new; failed handoff yields explicit all-muted/retry state. Expanded view retains a layout snapshot for Esc. Single/double click timing must avoid racing selection and expansion. Replace must dispose only the replaced session and preserve remaining panes.

Fresh FINAL keeps the pane and score; live suggestions recheck freshness and mapping. Event-driven channel changes preserve event identity, selection and layout. Restore revalidates entitlements and current target; do not auto-open multiple stale sessions on startup.

Storage owns schemaVersion, favorites, hiddenChannels, channelOrder, recentChannels, previousChannel, favoriteTeams, favoriteLeagues, keyboardMappings, quadLayouts, lastQuad and UI preferences. Proposed recents cap: 20 stable channel IDs; previous updates only after confirmed navigation, not failed attempts or observer noise. Define data migration/export/reset with validation before implementation; no account sync in MVP.

## Failure, privacy and service need

Logs use YTTV_ADAPTER, SPORTS_PROVIDER, EVENT_RESOLVER, PLAYBACK, QUADBOX and UI with sanitized IDs, capability/error code and timing. No credentials, cookies, tokens, playback URLs, protected frames/audio or raw page dumps. Enhanced guide fails independently; original playback remains accessible. Provider failure shows freshness/unknown states and leaves channel navigation usable.

A client bundle cannot hide a vendor secret. Prefer an explicitly permitted credential-free source; otherwise decide on a minimal authorized local/server relay, rate limiting and cache with provider rights first. No relay, backend, credentials or account has been created. A relay can serve licensed sports metadata only, never protected video.
