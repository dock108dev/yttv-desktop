# Retained source-maintenance report

Historical report: its revision, commands and limitations belong to the recorded source pass. It is not current setup guidance.

# Error handling and incident response

Updated 2026-10-03 EDT. This describes edited source, not the frozen installed v0.1.17 bundle. Parent Git revision: `c5a307f319bfe032d97c95b63c987c000e5e67d7`; source fingerprint: `54c404b1f7ad5ea90110cfb2562bae98932b2bc2bc5b5e26d310626c091d7748`. The tree includes earlier uncommitted implementation; the pass preserves it. [NEXT_TASK](../../../../NEXT_TASK.md) owns activation and acceptance boundaries.

## Implemented failure behavior

| Boundary | Behavior and fallback |
| --- | --- |
| Preferences load | Missing values still use sanitized defaults. Invalid serialized JSON rejects with a static safe message. The worker marks failed reads unavailable and refuses writes for that worker lifetime, preserving the stored record. No automatic reset. |
| Settings patch | Serialized with managed operations. The UI receives `STORAGE_UNAVAILABLE` on write rejection; the patch becomes visible only after storage resolves. Existing in-memory choices remain on rejection. Local settings show an alert while preferences persistence is unavailable. A successful later write clears that status; historical failure counters remain. |
| Other preference/session writes | Caller receives failure rather than success. Physical browser changes may already have occurred. Session and preference storage are separate writes, not a transaction; one can succeed while another fails. Do not infer rollback from a failure response. |
| Session restore | Session read failures are counted. If managed-window identity cannot be read, new feed creation/replacement and audio enable/focus return `STORAGE_UNAVAILABLE`; session identity writes are blocked to preserve unread records. Other optional session metadata can fall back without restoring audio authority. |
| Restored audio isolation | Failed mute is visible through `audioError` and `RESTORE_AUDIO_FAILED`. A restored pane is not assigned a successful mute value before confirmation. Audio focus is never restored from saved layout. Native mute/close remains the supported fallback. |
| Managed-window creation | Creation failure attempts window removal. If removal fails, return `WINDOW_CLEANUP_FAILED`, retain the known added tab/window for control, and show native mute/close guidance. A failed cleanup cannot be reported as successful restoration of the prior layout. |
| Tab closure | In-memory identity is revoked immediately. Serialized cleanup attempts volume, drawer and managed-session writes independently using settled results, counts rejections and consumes detached failures. It does not recreate the closed tab. |
| State notification | Missing message receivers are expected during page navigation/closed drawers. A failed tab inventory query is counted but cannot turn a completed storage write into a failed action. UI refresh/snapshot remains the recovery path. |
| Command boundary | Rejection returns a safe generic failure and increments `COMMAND_FAILED`. The message states that browser changes may already have occurred. Reply-channel errors and initialization rejections are also consumed and counted. |
| Content lifecycle | Known invalidated context stops further calls and runs cleanup once. Ordinary guarded API failures leave the lifecycle active and increment `BRIDGE_FAILED`. One throwing cleanup cannot prevent later cleanup; `CLEANUP_FAILED` records it. |
| Optional guide cache | Read/write failures remain non-fatal, with counters in `guideCacheDiagnostics`. Memory metadata remains usable without navigation authority. After a failed write, an identical fresh observation can retry retention without renewing its timestamp. Cached/fixture input still cannot trigger retention. |

## Diagnostics and privacy

Worker snapshots contain `failureDiagnostics` entries with static code, count, first occurrence and latest occurrence. Codes distinguish preferences read/write, session read/write, diagnostic-log persistence, restore mute, window cleanup, tab-close cleanup, command and notification failure. Content lifecycle exposes the equivalent snapshot through its internal `diagnostics()` API. Inspect the worker console for worker records and the content-script console for lifecycle records using existing developer tooling when that inspection is in scope.

`YTTV_FAILURE` console warnings emit on occurrence counts1,2,4,8,16 and subsequent powers of two. Every failure is still counted. The map is bounded by the finite set of codes, and returned records are copied. This intentional log reduction prevents observer storms without making repeated failure look like success. Counters live only for the current worker/content context; restart clears them. There is no remote telemetry or durable failure-history promise. Guide-cache counters are snapshot-only; existing audio/volume diagnostic rings remain separate.

Exception text, stacks, URLs, guide text, provider bodies and identifiers are not added to these diagnostic records. A production stack can contain private page/provider data, so this pass deliberately uses static boundary codes plus candidate identity and timestamps instead of serializing arbitrary exceptions. Use synthetic reproduction and local source inspection to locate unexpected errors; do not copy raw Chrome/page/provider output into incident reports.

## Recovery procedure

1. Distinguish the installed version/build from the current source fingerprint. An offline build identifies source inputs; it does not inspect Chrome or establish live capability.
2. For storage failures, preserve existing records. Retry a failed settings patch only when storage is available. A read failure remains blocked until a later worker initialization succeeds; restarting/reloading is an owner-scoped runtime action, not automatic recovery. Do not clear storage or reinstall.
3. For audio isolation or cleanup failure, use the original native mute and close the affected added window. Treat player/tab readback and heard sound separately. Never retry audio enable while managed identity is unknown.
4. For a generic command failure, inspect current windows/settings before retrying: navigation, focus, replacement or closure may have completed before a later write failed. No automatic retry of browser mutations is added.
5. Record safe code/count/time and exact candidate/environment, reproduce with synthetic state where possible, make a bounded repair, and qualify the new candidate separately. Preserve earlier failure evidence.

## Deliberate resilience retained

Repository review covered current app bridges/UI, storage, core validators, adapter, QuadBox/audio controller, sports client/engine/poller/relay and local scripts; retained bundles/evidence are immutable historical material. URL/parser validators returning unavailable, expired cached targets, absent/loading/closed players and missing message receivers are expected capability outcomes. Ordinary native playback remains separate from augmentation.

Sports retains explicit permission/access/unavailable/rate-limit state, stale last-known data and demand-driven request coalescing/backoff; empty/error data does not finalize a game. Provider/relay errors remain redacted; independent state is separate from guide-derived discovery. Audio transfer retains mute-before-enable and compensating mute, with explicit failed/unknown outcomes. Queues intentionally recover from a prior rejection so a later operation can run; the original caller still receives its own rejection or failure result. Preview-only local-storage fallback remains visit-scoped and labeled. TypeScript's library check skip is a dependency-check choice, not suppression of application errors.

## Validation and remaining boundaries

Environment: local macOS workspace, existing dependencies, Node synthetic fixtures/VM browser ports; no owner storage/browser access. Method: source inspection and offline tests; evidence class **FIXTURE / local compile / documentation**. Checked 2026-10-03T04:29–04:30Z; recorded under the owner-selected 2026-10-03 EDT task date.

- `npm run typecheck`: PASS.
- Focused failure/cache/lifecycle/viewing tests:32/32 PASS before the additional session-read guard; the final basic suite includes that guard and all focused cases.
- `npm test`:112/112 PASS. Updated the prior corrupt-JSON test to require explicit rejection instead of silent defaults. An initial new restore test was corrected to accept the subsequent equivalent mute-failure warning while checking the restore diagnostic code.
- `npm run build -- --check`: PASS for all three standard production entry points; exact storage/tv.youtube.com permission audit; no output writes.
- `npm run docs:check`: PASS. Local links/paths only; no network/provider checks.
- Frozen `dist/chrome-extension` file hashes compared before/after validation: unchanged.

No installed/live playback, listening, lifecycle, provider request, packaging/signing, reload, remote operation or publication was performed. Source is not activated or release-qualified. Partial storage after physical browser mutation is explicitly possible; the pass does not add a transactional browser/storage journal. Durable cross-restart diagnostics would require a separately designed retention policy. Next work is integration into the independently updated Q3-B1 complete candidate and its affected runtime qualification per NEXT_TASK; this pass does not activate source. Prior full release/owner acceptance remains in its grouped ledger.
