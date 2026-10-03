# Error handling and incident response

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

Exception text, stacks, URLs, guide text, provider bodies and identifiers are not added to these diagnostic records. A production stack can contain private page/provider data, so diagnostics use static boundary codes plus candidate identity and timestamps instead of serializing arbitrary exceptions. Use synthetic reproduction and local source inspection to locate unexpected errors; do not copy raw Chrome/page/provider output into incident reports.

## Recovery procedure

1. Distinguish the installed version/build from the current source fingerprint. An offline build identifies source inputs; it does not inspect Chrome or establish live capability.
2. For storage failures, preserve existing records. Retry a failed settings patch only when storage is available. A read failure remains blocked until a later worker initialization succeeds; a successful later worker initialization can recover; no automatic storage reset occurs. Do not clear storage or reinstall.
3. For audio isolation or cleanup failure, use the original native mute and close the affected added window. Treat player/tab readback and heard sound separately. Never retry audio enable while managed identity is unknown.
4. For a generic command failure, inspect current windows/settings before retrying: navigation, focus, replacement or closure may have completed before a later write failed. No automatic retry of browser mutations is added.
5. Record safe code/count/time and exact candidate/environment, reproduce with synthetic state where possible, make a bounded repair, and qualify the new candidate separately. Preserve earlier failure evidence.

## Recovery limits

Expected capability failures include stale/missing targets, absent/loading players and missing receivers during navigation. They leave native controls available. Audio transfer mutes before enabling one player and compensates failed enable operations with mute. Queues recover from a prior rejection so later operations can run; the original caller still receives its failure. Preview-only preference fallback is visit-scoped and labeled.

Offline tests reproduce storage, command, lifecycle and cleanup failures with synthetic state. They do not establish live failure frequency, audible output, installed-browser enforcement or account allowance. Historical source checks are retained in [error-handling evidence](evidence/runs/20261003-error-source/report.md).
