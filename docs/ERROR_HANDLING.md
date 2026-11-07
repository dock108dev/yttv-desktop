# Error handling and incident response

## Implemented failure behavior

| Boundary | Behavior and fallback |
| --- | --- |
| Preferences load | Missing values still use sanitized defaults. Invalid serialized JSON rejects with a static safe message. The worker marks failed reads unavailable and refuses writes for that worker lifetime, preserving the stored record. No automatic reset. |
| Settings patch | Serialized with managed operations. The UI receives `STORAGE_UNAVAILABLE` on write rejection; the patch becomes visible only after storage resolves. Existing in-memory choices remain on rejection. Local settings show an alert while preferences persistence is unavailable. A successful later write clears that status; historical failure counters remain. |
| Other preference/session writes | Caller receives failure rather than success. Physical browser changes may already have occurred. Session and preference storage are separate writes, not a transaction; one can succeed while another fails. Do not infer rollback from a failure response. |
| Session restore | Session read failures are counted. If managed-window identity cannot be read, new feed creation/replacement and audio enable/focus return `STORAGE_UNAVAILABLE`; session identity writes are blocked to preserve unread records. Other optional session metadata can fall back without restoring audio authority. |
| Restored audio routing | Recovery observes current routing without replaying mute or enable commands. Audio focus is never restored from saved layout. Failed explicit audio operations remain visible; native mute/close is the fallback. |
| Managed-window creation | Creation failure attempts window removal. If removal fails, return `WINDOW_CLEANUP_FAILED`, retain the known added tab/window for control, and show native mute/close guidance. A failed cleanup cannot be reported as successful restoration of the prior layout. |
| Fresh startup | New show coalesces first-start clicks, allows 15 seconds for native Live listings and then 15 seconds for a ready watch player, with one native Play request. Missing listings, sign-in or refused Play leave native setup/Play available. An explicit retry reuses a known newly created Live window; worker wake does not resume startup. |
| Saved monitor/layout | Fixed layouts require the selected monitor and matching work area. Reselect a changed/unavailable screen. A missing custom layout for the current count uses a labeled Best fit fallback. Too-small planned bounds return a useful error before saving. A valid plan with no shows, or a different current count that cannot fit, stays saved and leaves windows in place. |
| Monitor drawing | The picker binds its owned extension tab/window and selected display. Cancel or close leaves saved settings alone; an expired picker asks to reopen it. Saving uses the existing workspace placement path and reports failures there. Saving during first startup retains the plan for later Arrange. Editing locks during save; cancellation failures explain how to reopen the drawing window. Cleanup closes only the owned temporary tab. |
| Tab closure | In-memory identity is revoked immediately. Serialized cleanup attempts volume, drawer and managed-session writes independently using settled results, counts rejections and consumes detached failures. It does not recreate the closed tab. |
| State notification | Missing message receivers are expected during page navigation/closed drawers. A failed tab inventory query is counted but cannot turn a completed storage write into a failed action. UI refresh/snapshot remains the recovery path. |
| Command boundary | Rejection returns a safe generic failure and increments `COMMAND_FAILED`. The message states that browser changes may already have occurred. Reply-channel errors and initialization rejections are also consumed and counted. |
| Content lifecycle | Known invalidated context stops further calls and runs cleanup once. Ordinary guarded API failures leave the lifecycle active and increment `BRIDGE_FAILED`. One throwing cleanup cannot prevent later cleanup; `CLEANUP_FAILED` records it. |
| Optional guide cache | Read/write failures remain non-fatal, with counters in `guideCacheDiagnostics`. Memory metadata remains usable without navigation authority. After a failed write, an identical fresh observation can retry retention without renewing its timestamp. Cached/fixture input still cannot trigger retention. |

## Diagnostics and privacy

Worker snapshots contain `failureDiagnostics` entries with static code, count, first occurrence and latest occurrence. Codes distinguish preferences read/write, session read/write, diagnostic-log persistence, restore mute, window cleanup, tab-close cleanup, command and notification failure. Content lifecycle exposes the equivalent snapshot through its internal `diagnostics()` API. Inspect the worker console for worker records and the content-script console for lifecycle records using existing developer tooling during local debugging.

`YTTV_FAILURE` console warnings emit on occurrence counts 1, 2, 4, 8, 16 and subsequent powers of two. Every failure is still counted. The map is bounded by the finite set of codes, and returned records are copied. This intentional log reduction prevents observer storms without making repeated failure look like success. Counters live only for the current worker/content context; restart clears them. There is no remote telemetry or durable failure-history promise. Guide-cache counters are snapshot-only; existing audio/volume diagnostic rings remain separate.

Exception text, stacks, URLs, guide text, provider bodies and identifiers are not added to these diagnostic records. A production stack can contain private page/provider data, so diagnostics use static boundary codes and timestamps instead of serializing arbitrary exceptions. Use synthetic reproduction and local source inspection to locate unexpected errors; do not copy raw Chrome/page/provider output into incident reports.

## Recovery procedure

Open the remote from Chrome’s extension toolbar icon. Playback no longer has floating extension buttons, and saved drawer visibility is not restored over video. After Reload, automatic connection replaces an old page bridge when reconnect permission is already granted. If old buttons remain, use **Retry detection** in the remote and allow reconnect access, or refresh the affected player when convenient. Reconnection preserves native playback and audio. Old contexts stop observing and hide their drawer after invalidation.

If the toolbar launcher also fails, inspect the **service worker → Console** from the existing extension card. `WORKER_INITIALIZATION_FAILED` identifies worker startup failure. `REMOTE_STORAGE_UNAVAILABLE`, `REMOTE_CREATE_FAILED`, `REMOTE_FOCUS_FAILED` and `REMOTE_SAVE_FAILED` distinguish unreadable workspace records, refused window creation, refused focus and failed recovery persistence. A focus failure retains the existing remote without creating a duplicate. `REMOTE_CONNECTION_FAILED` means the remote opened but selecting the original tab failed; `GUIDE_SYNC_FAILED` identifies later guide discovery failure. These static codes do not include private exception text. An old `CONTEXT_INVALIDATED` entry from `content.js` does not diagnose a toolbar failure.

An empty saved workspace can legitimately lack an original tab ID. Recovery skips missing or invalid IDs before calling Chrome and handles both synchronous lookup failures and rejected promises. It does not rewrite the saved ownership record or change native playback while checking it.

New player windows use the packaged `player-start.html` page because ordinary blank-tab URL metadata may be withheld by Chrome. Creation waits for the exact extension-owned page in the original single-tab window; missing metadata is not treated as proof of identity. The existing mute-before-navigation rule still applies, and permissions are unchanged. An interrupted, unbound opening stays reserved until the owner closes its window and confirms closure in the recovery section at the top of the remote. Older `about:blank` ownership records remain readable.

1. Check the installed version under **Settings & layout → Connection**. Source changes appear only after rebuilding and reloading the existing extension entry; a successful build cannot confirm live playback.
2. For storage failures, preserve existing records. Retry a failed settings patch only when storage is available. After a read failure, writes remain blocked until a later worker initialization reads the record successfully. Storage is never reset automatically. Do not clear storage or reinstall.
3. For audio isolation or cleanup failure, use the original native mute and close the affected added window. Treat player/tab readback and heard sound separately. Never retry audio enable while managed identity is unknown.
4. For a generic command failure, inspect current windows/settings before retrying: navigation, focus, replacement or closure may have completed before a later write failed. Browser mutations are not retried automatically.
5. Note the safe error code and environment, reproduce with synthetic state where possible, and check the affected behavior after a focused fix.

## Recovery limits

Expected capability failures include stale/missing targets, absent/loading players and missing receivers during navigation. They leave native controls available. Audio transfer mutes before enabling one player and compensates failed enable operations with mute. Queues recover from a prior rejection so later operations can run; the original caller still receives its failure. Preview-only preference fallback is visit-scoped and labeled.

Automatic player connection runs one bounded pass per detected-player change. Failed queries, stale adapters, unavailable storage and more than four candidates remain visible with Retry detection; connection does not move or alter sound. Reconnect permission is requested only on an explicit retry/connection gesture.

The full-size drawing page loads its bundle as a JavaScript module. A static startup message remains visible if loading fails, and unavailable configuration produces recovery text. Extension-page document identity is resolved through runtime contexts when Chrome omits the sender tab.
