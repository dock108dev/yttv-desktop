# Sports provider evaluation

Prepared 2026-10-02. **No vendor selected, provisioned, queried or paid.** This is a documentation review, not evidence of live data quality, complete league coverage or licensed use. Provider API: getEvents(date), getEvent(id), getLiveEvents(); vendor/league normalization remains isolated. [Sources](SOURCES.md) retain dated official findings.

| Candidate | Officially documented signal | Planning assessment / unknowns |
| --- | --- | --- |
| TheSportsDB | Offers a free JSON sports API; premium page describes dedicated production keys and two-minute livescores. [Official API page](https://www.thesportsdb.com/free_sports_api) | Low-cost candidate for a permitted prototype. Verify each initial league, completeness, current broadcast fields, delayed/suspended states, actual cadence/limits and display/caching/redistribution rights. Two-minute livescores may miss proposed freshness targets; do not mark delayed snapshots fresh |
| SportsDataIO | Trial data is scrambled; Discovery Lab is next-day delayed; Leagues API is a distinct commercial live product. [Official developer overview](https://sportsdata.io/developers) | Trial/replay can test shapes, never establish real current-game results. Discovery Lab does not satisfy Live Sports. Live product requires appropriate access/licensing and cost/limits review. Per-league broadcast/change-feed coverage remains to verify |
| Sportradar | NBA workflow documents delayed/resumed/postponed states and makeup-game identity behavior. [Official NBA workflow](https://developer.sportradar.com/basketball/docs/nba-ig-game-status-workflow) | Strong documented state candidate for NBA; this one workflow proves no other league's behavior. Verify MLB/NFL/NCAA Football/NHL coverage, broadcast fields, actual latency/limits, trial restrictions and production licensing/cost through official product terms |
| Explicitly licensed league-specific sources | None selected or verified | Could combine adapters where permissions, rate limits and coverage allow. No reliance on undocumented/internal ESPN endpoints or scraped playback metadata as the Sports Engine source |
| Local synthetic fixtures | No provider dependency | Default for engineering rare-state cases. Not a live-data vendor or product substitute |

Current pricing is deliberately not fixed into a budget; page prices and plans can change. Recheck official terms/quotes before any purchase or provisioning. Initial evaluation spending is zero. “Free” does not establish redistribution rights or suitability for current-game use.

## Required evaluation record

For every candidate and each MLB/NFL/NCAA Football/NBA/NHL adapter, record: product/tier and documentation date; supported competitions/season dates; stable IDs; scheduled/actual times and timezone; score/period/clock semantics; all relevant state mappings including unknown; delay/postponement/resumption accuracy; terminal corrections/makeup identities; broadcast network/local/alternate-feed fields; moved-feed update behavior; update timestamp/freshness/latency; pagination/history/live/tracked-event access; error/429 behavior; permitted request rate and daily budget; license for intended personal/commercial display, cache, attribution and redistribution; auth/secrets/CORS; cost and access expiry; confidence and evidence class.

League coverage grid starts entirely UNVERIFIED. Do not generalize a single sample or marketing page across all competitions. A provider can be useful without broadcast resolution being reliable; the UI must expose that boundary.

## Selection rubric (proposal)

Hard gates: permitted use, feasible credential architecture, initial-league coverage, reliable active/held/final states, actual data freshness compatible with truthful UI, and bounded rate/cost. If any is unknown, do not select for production Live Sports. Broadcast metadata must support resolver candidates; lack of it requires a documented manual/guide-assisted fallback.

Score gated candidates 0–5 per league for state accuracy (25%), freshness/latency (20%), broadcast metadata (20%), coverage/IDs (15%), rights/auth/limits (15%), cost (5%). Retain raw evidence and weighting; a score is a comparison heuristic, not permission or proof. Prefer inexpensive/free only after gates pass. No provider should be chosen merely to avoid documenting licensing or credentials.

Proposed polling: 30 seconds for active/held events only when permitted; slower upcoming refresh and explicit conditional backoff/jitter/cache. Budget `active events × polls per day + schedule/search/detail calls`; exploit permitted batch/live feeds without treating an empty response as finality. Cadence is not an automation/reminder request and no scheduled job has been created.

## Secret handling and alternatives

Do not put provider secrets in an extension bundle or persist them in public/local project evidence. If a source requires a secret, decide on a minimal authorized sports-metadata relay (local service or backend), caching, request limits and provider rights before implementation. A client cannot securely hide a secret. User-supplied local configuration is an option to assess, not a guarantee provider redistribution/extension use is allowed. No video or Google authentication passes through such a relay.

Next provider work is S2-01 after the single-playback foundation, while P0-D1 fixtures can proceed without network access. See [risks](RISKS_AND_OPEN_QUESTIONS.md) and [backlog](BACKLOG.md).
