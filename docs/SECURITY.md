# Security boundaries

The application is a local Chrome MV3 client and an isolated Node fixture-preview server. YouTube TV owns authentication, entitlements, account controls and protected playback. There is no application account service, database, admin API, upload endpoint, provider relay or hosted backend. Safari/native workspaces have no executable client.

## Trust boundaries

| Boundary | Implemented protection |
| --- | --- |
| Page DOM → adapter → worker | Treat guide/player observations as untrusted metadata. Accept only fresh channel-bound ordinary tv.youtube.com watch targets. No protected media URLs, credentials or internal application globals are read. |
| Extension IPC → privileged operations | Validate browser-supplied sender ID/URL before dispatch and bound command fields/payloads. No external runtime-message or page postMessage bridge is exposed. |
| Storage → runtime/UI | Sanitize preferences and select known restored pane/bounds/diagnostic fields. Stored layouts never restore audio authority; unreadable identity blocks new feeds/audio enable. |
| Rendering | React renders text without raw HTML. Components consume bridge snapshots, not provider/player internals. |
| Browser → fixture server | Bind127.0.0.1:4173; enforce Host, optional same-origin Origin and Fetch Metadata checks. Serve only demo HTML/panel JS/CSS, with canonical containment and defensive response headers. |

The manifest permits only storage and `https://tv.youtube.com/*`. It requests no cookies, broad tabs, capture, webRequest or all-sites access. Packaged CSP uses bundled scripts, `object-src 'none'` and `base-uri 'none'`. Build validation rejects a permission/host change before writing.

## Validation and diagnostics

Commands are capped512KB; observations500 rows; preference identifier lists1000 entries; layouts20. Audio values must be finite and in range. Invalid commands/senders produce static diagnostic codes rather than logging payloads. Restoration selects known fields and prevents duplicate/reserved pane identities. [Failure recovery](ERROR_HANDLING.md) describes preservation and partial-write limits.

Preview accepts GET/HEAD on `/`, `/demo.html`, `/panel.js` and `/panel.css`. Invalid encoding returns400; unsupported paths/assets and canonical symlink escapes are rejected. Responses use no-store, nosniff, no-referrer, frame denial and a CSP with no network connections. Inline styles support React presentation; inline scripts/eval are not allowed.

Origin/Host checks constrain browser requests, not other local processes: they can forge headers. Canonical containment does not defend against a local process racing filesystem changes. The app cannot protect a compromised OS, Chrome profile or installed extension. Diagnostics contain bounded static codes/counts/timestamps; no remote telemetry is added.

## Testing and limits

[Security tests](../tests/security.test.ts) use synthetic data, disposable files and ephemeral loopback ports. Worker/adapter tests cover rejected senders, malformed commands and restored-field sanitation. These checks do not establish loaded-browser CSP enforcement, absence of all vulnerabilities, audible output or protected playback. Dependency advisory results require a current review of the exact lockfile; no current advisory scan is claimed.

[Retained security evidence](evidence/runs/20261003-security-source/report.md) records earlier source checks and retired provider findings at their own revision. Proposed services need independent origin/capability/permission review; current permissions do not cover them.
