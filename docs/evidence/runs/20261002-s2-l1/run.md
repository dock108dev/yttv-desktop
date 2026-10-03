# S2-L1 — NBA integration prepared; activation blocked

2026-10-02 America/New_York. Local implementation complete and `npm run verify` **PASS: 79 tests, typecheck, build and documentation checks**. **No working live delivery is claimed.** One combined external activation handoff remains: owner-supplied NBA Free key plus exact loopback permission/reload. [Permission/access review](permission-review.md), [source decision](source-decision.md), [candidate inventory](candidate.json), [verification output](verification.txt).

## Identity and preservation

Installed baseline freshly read from Chrome Shortcuts at 2026-10-03T00:35:53.991Z: **v0.1.8 / a87877ca8e207785 / idaaiiafgopfpaojpnhaoefbefllioab**. CBS 2 was playing; player/tab audio enabled, volume displayed 100%, site mute unknown. This is routing/UI readback, not a new listening qualification. The native playback timeline advanced during inspection. No navigation, audio adjustment, reload, new feed, account operation or protected capture. The identity dialog and drawer were closed back to the original viewing state. The first semantic click timed out without changing the drawer; one native control succeeded. This transport limit caused no source/playback repair.

The original dist v0.1.8 bundle is copied to baseline-018-bundle; existing tracked edits are retained in baseline-working-tree.patch, and earlier evidence/untracked guide code stays in place. After verification, the existing Loaded from folder was restored byte-for-byte to the retained v0.1.8 bundle. New v0.1.9 outputs remain in their archived review directories and the separate sports candidate folder. No reset, cleanup, commit, remote operation or publication. Existing playback qualification remains attached to the old candidate; it is not automatically attributed to this new bundle.

Prepared standard **v0.1.9 / 9ed7cd8afadd5013**, storage + tv.youtube.com only; separate unapproved sports candidate **v0.1.9 / 57058bd9d522e2bd**, adding only `http://127.0.0.1:4318/*`. Source inputs and all bundle hashes are in candidate.json. Both bundles are retained. Neither was reloaded into Chrome.

## Implemented scope

- Server-side NBA Free Games adapter, explicit lifecycle normalization, nullable schedule/score/clock/broadcasts/update-time, namespaced stable IDs, preseason/non-preseason batches, bounded cursor handling and tracked detail refresh.
- Sports Engine retention plus coalesced demand polling. Four attempts/minute maximum, errors included, 60-second refresh minimum, exponential backoff, Retry-After enforcement and stop on denied authorization. Empty/missing/error never erases or finalizes tracked games.
- Fixed loopback metadata-only relay with private process configuration, no arbitrary proxy/URL route, no key in browser code, sanitized failure output, no video/Google credentials.
- Installed composition path now receives provider snapshots instead of default illustrative fixtures. NBA-only coverage, team search, truthful retrieval versus unknown source-update labels, retained/stale cards and clear unavailable actions. Fixture Lab remains explicit and isolated.
- Resolver alternative for absent broadcast metadata: provider active/held event plus both native teams, explicit native NBA league and fresh eligible target. Cached observations cannot gain authority. Event intents are revalidated at the background/action boundary, refuse ambiguity and preserve identity on the main player/one added pane. Feed count and playback/audio implementation remain unchanged.

## Evidence classes and results

Official documentation: selection/use/tier/rate/status/schema facts in source-decision.md. No documented NBA broadcast field or update timestamp; no guaranteed latency is asserted.

Local synthetic regressions: 79 total PASS, including 11 new tests covering normalization/unknowns/OT/suspension, cursor/rate/authorization behavior, midnight window/tracked events/coalescing/backoff, no-permission/no-fetch, stale/ambiguous/network-free resolution, relay route/origin isolation, event-first bridge identity/main-plus-one safety/provider failure and installed UI separation/search/unavailable leagues and hidden-drawer polling suppression. Existing C1 regressions pass. VM harnesses now expose the native structuredClone global used by the metadata client; this does not change browser behavior.

Offline UI review: [retained image](offline-sports-unavailable.png) and offline-review source/bundle. Explicitly marked not installed/no requests/no playback; missing-provider screen only. Full-page screenshot stitching repeats the fixed navigation rail; it is not evidence of installed layout duplication.

Access gate: YTTV_NBA_API_KEY absent; [startup output](access-check.txt) stops before acquisition. **Zero provider requests.** No live schedule, score, team-search or real mapping was observed, and no “no live game” conclusion is inferred. Watch and Add live qualification remain separately NOT RUN. Synthetic delay/OT fixtures are not real-game observations.

Playback: reused completed C1-Q2 15m23s practical qualification as baseline context. No new playback/audio algorithm or defect justified repeating it. Local failure tests preserve original player volume and issue zero playback/window changes on provider failure.

## Disposition

S2-L1: **implementation verified / LIVE ACTIVATION BLOCKED**, not fixture-only delivery and not complete live acceptance. Source decision, private-config template, reviewed permission candidate and one combined owner handoff are concrete. Continue this same task after private key configuration and exact permission approval. Verify actual NBA events/schedules/search/status/freshness, bind installed identity, and separately observe an eligible mapped Watch/Add if native corroboration exists. If mapping/game activity is unavailable, retain that coverage limit; do not improvise a target.

Full beta, all U01–U18, arbitrary three/four-feed composition, broader lifecycle/control/performance/platform tests and owner acceptance remain grouped open release work. No purchases/provisioning, protected capture/bypass, remote operations or publication.
