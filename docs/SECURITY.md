# Security boundaries

The application is a local Chrome MV3 client and an isolated Node fixture-preview server. YouTube TV owns authentication, entitlements, account controls and protected playback. There is no application account service, database, admin API, upload endpoint, provider relay or hosted backend. Safari/native workspaces have no executable client.

## Trust boundaries

| Boundary | Implemented protection |
| --- | --- |
| Page DOM → adapter → worker | Treat guide/player observations as untrusted metadata. Accept only fresh channel-bound ordinary tv.youtube.com watch targets. No protected media URLs, credentials or internal application globals are read. |
| Extension IPC → privileged operations | Validate browser-supplied sender ID/URL before dispatch and bound command fields/payloads. No external runtime-message or page postMessage bridge is exposed. |
| Storage → runtime/UI | Sanitize preferences and select known restored pane/bounds/diagnostic fields. Stored layouts never restore audio authority; unreadable identity blocks new feeds/audio enable. |
| Rendering | React renders text without raw HTML. Components consume bridge snapshots, not provider/player internals. |
| Browser → fixture server | Bind to `127.0.0.1:4173`; enforce Host, optional same-origin Origin and Fetch Metadata checks. Serve only demo HTML/panel JS/CSS, with canonical containment and defensive response headers. |

Required manifest access is storage and `https://tv.youtube.com/*`; optional access is described below. It requests no cookies, broad tabs, capture, webRequest or all-sites access. Packaged CSP uses bundled scripts, `object-src 'none'` and `base-uri 'none'`. Build validation rejects a permission/host change before writing.

## Validation and diagnostics

Commands are capped at 512 KB, observations at 500 rows, preference identifier lists at 1,000 entries and layouts at 20. Audio values must be finite and in range. Invalid commands/senders produce static diagnostic codes rather than logging payloads. Restoration selects known fields and prevents duplicate/reserved pane identities. [Failure recovery](ERROR_HANDLING.md) describes preservation and partial-write limits.

Live preference edits also validate nested UI fields, known keyboard actions/key syntax and saved-layout structure before persistence, using storage-owned `validPreferencePatch`. Partial edits and explicit empty lists, disabled keys and null last-layout remain supported. Existing stored records still use the legacy sanitizer; no schema migration is introduced. Observation sanitation accepts only integer ready states 0–4 and finite nonnegative time/dimensions; invalid measurements become unknown without changing native audio.

Preview accepts GET/HEAD on `/`, `/demo.html`, `/panel.js` and `/panel.css`. Invalid encoding returns 400; unsupported paths/assets and canonical symlink escapes are rejected. Responses use no-store, nosniff, no-referrer, frame denial and a CSP with no network connections. Inline styles support React presentation; inline scripts/eval are not allowed.

Origin/Host checks constrain browser requests, not other local processes: they can forge headers. Canonical containment does not defend against a local process racing filesystem changes. The app cannot protect a compromised OS, Chrome profile or installed extension. Diagnostics contain bounded static codes/counts/timestamps; no remote telemetry is added.

## Testing and limits

[Security tests](../tests/security.test.ts) use synthetic data, disposable files and ephemeral loopback ports. Worker/adapter tests cover rejected senders, malformed commands and restored-field sanitation. These checks do not establish loaded-browser CSP enforcement, absence of all vulnerabilities, audible output or protected playback. Dependency advisories change; rerun the [CI dependency check](CI.md) for the current lockfile.

## Optional access

Optional `system.display` reads monitor metadata for area selection. Optional `scripting` reconnects the designated YouTube TV player using only packaged `content.js`; it cannot inject arbitrary commands or automate authentication. Permission requests are deliberate user actions. Recovery may reuse an already-granted scripting permission without prompting. The native player remains fallback when access is unavailable.

### Optional YouTube access

YouTube uses exactly `https://www.youtube.com/*` to optional host permissions. **Enable YouTube** requests that origin and `scripting` directly in its click handler. Required YouTube TV/storage access and optional display access are unchanged. No `youtu.be` access or redirect fetch is needed. No persistent YouTube content-script registration is added: only packaged `youtube-content.js`, top frame 0, on explicitly managed/connected tabs.

Every YouTube connection uses the browser-returned document ID, a worker nonce and service/tab/window/slot-generation binding. Commands and observations recheck permission, current URL, document, player key and monotonic sequence. Notifications independently validate the browser-supplied sender; payload IDs cannot select another player. Revocation clears control authority and interrupts pending claims without dropping queue intent or uncertain resource counts. Native focus remains available.

`scripts/permission-audit.mjs`, called before build output, checks exact required/optional permissions, optional hosts, content-script entries and packaged CSP. Regression tests reject extra origins, wildcard hosts, broad access, extra scripts, subframes, CSP widening and external/resource exposure.


### Optional Prime Video access

Prime Video uses optional `https://www.primevideo.com/*`. **Enable Prime Video** requests that host plus `scripting` synchronously from the click gesture. Injection uses packaged `prime-video-content.js` and frame 0 only on an explicitly managed detail tab. Required permissions, YouTube access and saved schemas remain unchanged. No Amazon/account hosts, wildcard subdomains, cookies, broad tabs, capture, webRequest or activeTab are granted.

All optional providers use `provider-connection.ts` with separate service configurations. Injection checks the current service/slot and pending navigation; replies bind document, nonce, exact content URL, sequence and current slot generation. Cross-origin navigation or removed access cancels authority without releasing uncertain resources. Unknown Prime identity cannot authorize a native control or consume a queue item. Explicit Connect refuses unqualified identity without adopting a tab. Readiness and control support cannot be inferred from the access grant.


### Optional Netflix access

Netflix uses optional `https://www.netflix.com/*`. Enable Netflix requests the host and scripting directly in the click gesture. `netflix-content.js` is a packaged top-frame script injected only into explicitly owned canonical title/watch tabs. Listing eligible Connect candidates does not inject or adopt them; Connect refuses unknown main-content identity. No account domains, wildcard hosts, broad tabs, cookies, capture or network interception were added. The exact permission/build audit rejects those expansions.

Netflix shares current origin/service, tab/window, document, nonce, player-key, sequence and slot-generation checks. Permission loss cancels authority and pending creation while preserving intent and surviving/uncertain capacity. Controls and consumption cannot be authorized by a parsed URL, media element, clock, user confirmation or keyboard shortcut. Native navigation revokes stale authority. Recovery does not write playback/audio or navigate. Browser mute is launch isolation only, not native mute readback.
