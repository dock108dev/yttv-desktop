# Retained source-maintenance report

Historical report: its revision, commands and limitations belong to the recorded source pass. It is not current setup guidance.

# Security boundaries and hardening

Updated 2026-10-03 EDT. SEC-01 is implemented and verified offline in current source. It is separate from frozen installed v0.1.17 / 50a15df68eb2c3db. [NEXT_TASK](../../../../NEXT_TASK.md) owns Q3-B1 candidate preparation/activation; [error handling](../../../ERROR_HANDLING.md) owns failure recovery. No account, installation, provider acquisition or live browser operation occurred during this pass.

## Application and trust model

This is a personal local MV3 Chrome client using React/TypeScript, with a Node fixture preview. The superseded NBA metadata relay/client/poller were removed in SSOT-01; no provider activation or configuration is part of current source. YouTube TV owns sign-in, account controls, entitlements and protected playback. The extension does not implement users, roles, a database, admin endpoints, uploads, webhooks, payments or hosted deployment. There are no subprocess execution paths in the application. Safari/native workspaces are placeholders.

| Boundary | Authority and protections |
| --- | --- |
| Page DOM → isolated content adapter → worker | Page-derived guide/player data is untrusted metadata. Navigation is restricted to validated ordinary tv.youtube.com watch targets with fresh channel-bound observations. No page `postMessage` or external runtime-message bridge is exposed. React renders text without raw HTML. |
| Extension/content IPC → browser/storage operations | Browser-supplied extension ID and sender URL determine the allowed boundary; a namespace alone is insufficient. Content control messages require the current extension ID. Runtime command validation bounds fields and payloads before handlers; rejected worker requests increment static diagnostics. |
| Browser storage → startup/UI | Preferences use existing sanitization, with the EH-01 read/write guards. Restored pane, bounds and diagnostic records now select known fields. Stored layout grants no audio authority. Unknown session identity fails closed for new feeds/audio enable. |
| Browser → fixture HTTP server | Production entry binds127.0.0.1:4173. Exact Host and optional same-origin Origin checks, cross-site Fetch Metadata rejection, fixed asset allowlist, canonical-path containment and response headers protect the fixture surface. It has no credentials, backend, provider requests or protected playback. |

Origin/Host are browser request boundaries, not process authentication: a local process can forge them. Same-user malware can already read/change local files and private process configuration. SEC-01 does not claim protection from a compromised owner account, malicious local process, compromised Chrome or compromised installed extension code. No hosted authentication framework is added to the personal prototype.

## Confirmed issues fixed

### Origin-less provider acquisition

Category: local request authorization. Area: `packages/sports-engine/src/relay.ts`. Severity: **medium**. Confidence: **high**. Status: **fixed in SEC-01; executable relay removed in SSOT-01**.

This finding describes the retained SEC-01 revision, not a current activation route. Previously the relay rejected Origin only when present and mismatched, allowing an Origin-less GET with the correct Host to call `poller.refresh()`. A cross-site navigation/image-style request can omit Origin; when the relay is deliberately running, that can consume the owner's provider request budget without reading the CORS-protected response. There is no evidence it exposed the API key or allowed protected-media access.

At the retained SEC-01 revision, the route required the exact extension Origin even when absent or `null`; synthetic tests confirmed rejected requests did not acquire metadata. That implementation was subsequently removed. These results preserve the finding history and do not describe a current route or pending activation.

### Malformed preview path rejects outside the handler

Category: parser/input availability. Area: `scripts/preview.mjs` (now delegates to `scripts/preview-server.mjs`). Severity: **low**. Confidence: **high**. Status: **fixed**.

Previously `decodeURIComponent` ran before the catch in an async HTTP callback. A request containing invalid percent encoding could reject without a handler, potentially terminating the local preview under Node's unhandled-rejection policy. Parsing is now caught and returns400; a subsequent request is tested to succeed. Unknown file errors return a safe500 with a static console code; filesystem details are never returned.

## Hardening opportunities implemented

### Privileged command validation

Category: IPC validation/mass assignment. Area: `apps/chrome-extension/src/adapter.ts`, `background.ts`, `content.tsx`, `diagnostics.ts`. Severity: **low**. Confidence: **high**. Status: **fixed**.

The prior `isMessage` check established only namespace/type string while TypeScript types disappeared at runtime. An erroneous or compromised internal component could submit malformed fields, oversized data or a preference schema-version patch that reset settings through sanitization. There is no demonstrated external website-to-runtime message path, so this is not claimed as remote authorization bypass.

Commands now validate known operation/field types, finite audio ranges, identifiers and timestamps; payload serialization is capped512KB, observations500 rows, preference identifier lists1000 entries and layout lists20. Circular/non-serializable data is rejected. Preference patches allow only intended preference fields; schema version and confirmed channel/history fields are rejected. Legacy `nightMuteLock` remains ignored for compatibility and confers no authority. Missing sender URL cannot imply a privileged extension page. Content control messages require the current extension ID. Worker rejections return static `INVALID_COMMAND`/`INVALID_SENDER` and are counted without request payloads.

### Stored metadata and diagnostic field selection

Category: deserialization/privacy. Area: `apps/chrome-extension/src/background.ts`. Severity: **low**. Confidence: **high**. Status: **fixed**.

Startup previously spread stored pane records and accepted prior diagnostic rows without rebuilding them. Unexpected persisted fields could reach UI snapshots; arbitrary diagnostic cause text could carry private data. A local component with storage access could also supply colliding pane identities. This is not evidence of remote credential extraction.

Restoration now selects pane identity/channel/event fields and finite known bounds, rejects reserved/duplicate pane identity and main-tab collisions, and preserves legitimate window restoration. Prior audio diagnostic rows validate fields and replace free-form cause with a static restored-request label. Guide navigation targets are rebuilt from approved fields. Tests inject synthetic extra fields and confirm they do not appear in snapshots. Intended channel names/program text remain presentation data; they are not made secret by this whitelist.

### Fixture HTTP exposure and asset containment

Category: local HTTP surface/browser defense. Area: `scripts/preview-server.mjs`. Severity: **medium**. Confidence: **high**. Status: **fixed**.

The prior preview accepted arbitrary Host, had no Origin/Fetch Metadata restrictions, served any regular file below its build directory and checked only lexical containment. A rebinding-capable browser origin could reach the server, or an accidentally added build-directory file/symlink could be served. No secret file in that directory was identified, and a same-user process already has filesystem authority; this is defensive hardening, not a demonstrated secret-exfiltration vulnerability.

The server accepts only GET/HEAD for `/`, `/demo.html`, `/panel.js` and `/panel.css`, rejects wrong Host/Origin and cross-site Fetch Metadata, and denies canonical paths outside the asset directory. Preview cannot serve manifests, build inventories or arbitrary files. Responses set no-store, nosniff, no-referrer, frame denial and a CSP permitting only bundled scripts/styles/images, with no network connections. Inline styles remain allowed for the existing React presentation; inline script/eval is not allowed. Tests cover rebinding Host, hostile Origin, cross-site requests, extra files, symlink escape, traversal, invalid encoding, methods, headers and ordinary rendering responses. Canonical path checking is not a defense against a local process racing filesystem changes.

### Extension CSP restrictions

Category: packaged browser defense. Area: `apps/chrome-extension/manifest.json`. Severity: **low**. Confidence: **high**. Status: **fixed in source; browser verification pending**.

Packaged pages previously permitted self-hosted objects. They require none. CSP now uses `object-src 'none'` and `base-uri 'none'`, retaining bundled-only scripts. Requested permissions/host access are unchanged. The in-memory manifest audit passes; loaded Chrome enforcement is untested on this source candidate.

## Intentional acceptable patterns

- **Informational / high confidence / accepted:** no account/session/role service exists in this client. YouTube TV's authentication/entitlements remain authoritative; missing targets fail unavailable instead of probing protected internals.
- **Informational / high confidence / accepted:** preferences/layouts contain only sanitized local intent; volatile navigation targets are not persisted. Cached metadata cannot renew navigation authority. No remote telemetry is added.
- **Informational / high confidence / accepted:** HSTS is inappropriate for the HTTP loopback fixture service. Frame/CSP/cache protections are applied to the actual fixture surface. Noindex is not used as access control. Extension pages are governed by manifest CSP rather than fabricated HTTP headers.
- **Informational / high confidence / accepted:** the lockfile and `npm ci` preserve exact resolved versions. Source scan found no raw HTML rendering, command execution, account token handling or arbitrary fetch/proxy routes in executable app code. This does not establish absence of all vulnerabilities.

## Prioritized remaining work

1. **Manual verification / medium priority / high confidence / deferred to Q3-B1 candidate activation:** verify installed message sender metadata, ordinary controls, loaded CSP, remote focus versus explicit audio and failure feedback on the complete new candidate. SEC-01 used browser mocks; it does not qualify playback or additional feed counts. Preserve installed017 until the integrated candidate is ready.
2. **Dependency verification / low priority / medium confidence / deferred:** review the exact lockfile against current registry advisories when separately scoped. No package CVE is asserted by this pass; no current dependency audit or upgrade has been performed. Reintroducing a provider would require a new source/security contract, not activation of retained configuration.

## Validation evidence — retained SEC-01 revision

Scope/class: local source, synthetic temporary files and ephemeral loopback servers, VM Chrome/browser fixtures, in-memory production compile and offline documentation checks. Environment: existing macOS workspace/dependencies. Date: 2026-10-03 EDT task date. Parent HEAD: `c5a307f319bfe032d97c95b63c987c000e5e67d7`; current tree includes preserved earlier work. Extension input fingerprint: `92001b28359918289addb316672a69d8dca8b76e9387d2d5942f569032be4321`.

Preview code is outside the extension input fingerprint: `scripts/preview.mjs` SHA-256 `dd20e41a1853de53831e513793fb01e2ef1e3f0e1e3eda233293205421b3b3d9`; `scripts/preview-server.mjs` SHA-256 `4703c08e97b09b625cecf13e218d004d440e0207d348615cd8d77f7cbd10a31f`.

- Focused security, sports-relay, viewing-reliability, lifecycle and Chrome-integration tests: **30/30 PASS**. HTTP requests stayed on ephemeral loopback ports and used synthetic data; no provider acquisition occurred.
- `npm run typecheck`: PASS.
- `npm run build -- --check`: PASS; all standard production entry points compile without writing installed files; exact existing storage/tv.youtube.com permission audit passed.
- `node --check scripts/preview.mjs` and `node --check scripts/preview-server.mjs`: PASS.
- Narrow recognizable-secret-pattern scan of tracked text excluding retained evidence: no matching AWS access IDs, private-key markers or GitHub token signatures. Owner/private configuration was not read. This is not a complete secret audit.
- `npm run docs:check` and `git diff --check`: PASS.
- Frozen `dist/chrome-extension` file hashes before/after validation: unchanged.

EH-01's112-test suite remains prior evidence on its recorded fingerprint. This pass intentionally ran the affected30-test surface, not the full suite/CI matrix. No installed browser walk-through, provider request, advisory-registry request, capture, signing, commit/push or publication occurred. Full security assurance, owner acceptance and release qualification are not claimed.

SSOT-01 (2026-10-03): superseded acquisition/relay and permission-candidate paths have been removed from current source. Earlier relay security results above remain historical. [Current module authority](../../../ARCHITECTURE.md).
