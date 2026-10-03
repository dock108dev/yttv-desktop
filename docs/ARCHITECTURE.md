# Current architecture and sources of truth

The supported runtime is the restricted Chrome YouTube TV client and its isolated, non-playing fixture preview. Sports discovery uses authenticated guide text. Independent provider scores, event-to-channel resolution, Safari/native playback and mixed-service/four-player workspace behavior are not implemented current paths. Proposed capabilities are documented separately in the engineering roadmap.

## Domain authority

Domain: **Navigation handles and shared contracts**

Authoritative module: [packages/core/src/index.ts](../packages/core/src/index.ts).

Why this is authoritative: `watchNavigationUrl` validates ordinary watch-page URLs once; `isPlaybackTarget` validates their identity/evidence metadata. `guidePrograms` sanitizes program fields. No protected-stream, account or credential access.

Known callers: YouTube TV adapter, Chrome worker observation sanitation, guide cache and Sports listing expansion.

Domain: **YouTube TV observation and current target eligibility**

Authoritative module: [packages/yttv-adapter/src/index.ts](../packages/yttv-adapter/src/index.ts).

Why this is authoritative: selectors and native player controls stay here. `freshLiveTarget` requires a current non-cached LIVE listing, matching validated LIVE target, and guide/target ages within30 minutes. Adapter `navigationUrl` delegates to the shared URL validator.

Known callers: adapter navigation, Chrome worker snapshots/navigation/Add/Replace, Guide UI and Sports `listingPlayable`.

Domain: **Sports discovery and illustrative state**

Authoritative module: [guide.ts](../packages/sports-engine/src/guide.ts) for ordinary browsing; [index.ts](../packages/sports-engine/src/index.ts) for the separate fixture lab.

Why this is authoritative: guide classification uses explicit program text without inventing game state; `listingPlayable` checks the current program and delegates target authority to the adapter. Fixture normalization/visibility/search never grants playback authority. No external provider is acquired by current source.

Known callers: shared UI; worker `WATCH_PROGRAM`/`ADD_PROGRAM` revalidate title, timestamp and current listing immediately before actions. The demo and Fixture Lab render illustrative events with Watch/Add disabled by construction.

Domain: **Managed feed capacity and audio handoff**

Authoritative module: [policy.ts](../packages/quadbox/src/policy.ts) and [index.ts](../packages/quadbox/src/index.ts).

Why this is authoritative: the current managed ceiling is two total feeds, used by UI and worker; account allowance is an independent runtime bound. The shared audio controller serializes mute-all-before-enable-one and compensates failures.

Known callers: Chrome worker managed creation/audio selection and shared UI Add controls. Four-feed creation is unsupported.

Domain: **Browser ownership, privileged commands and runtime state**

Authoritative module: [background.ts](../apps/chrome-extension/src/background.ts); [adapter.ts](../apps/chrome-extension/src/adapter.ts) owns the command envelope/validation.

Why this is authoritative: the worker alone owns enrolled window/tab identity, session restoration, observed state and mutations. Sender validation precedes command dispatch. Legacy provider commands fail with `UNSUPPORTED_PATH`; ordinary malformed commands fail explicitly. The bridge transports supported commands rather than implementing another policy.

Known callers: [bridge.ts](../apps/chrome-extension/src/bridge.ts), content script, extension page. Content player controls are validated again at the browser/adapter seam.

Domain: **Persistence**

Authoritative module: [storage index](../packages/storage/src/index.ts) and [guide cache](../packages/storage/src/guide-cache.ts).

Why this is authoritative: preferences/history/layout sanitation and serialized writes have one implementation. Failed writes preserve prior choices; unreadable records remain explicit. Guide cache stores sanitized metadata, never navigation authority. Confirmed switches alone update history.

Known callers: worker local/session bridges, isolated demo preference storage, Guide ordering and schema validation tests.

Domain: **Rendering, lifecycle and builds**

Authoritative module: [UI](../packages/ui/src/index.tsx), [runtime lifecycle](../apps/chrome-extension/src/runtime.ts), [build](../scripts/build.mjs).

Why this is authoritative: one UI receives bridge snapshots and uses shared eligibility/limit policies. Production entry points compose it with the validated Chrome bridge; the explicit demo uses separate synthetic storage. The standard build audits storage plus tv.youtube.com only. Unknown build options, including unsupported alternative build modes, fail before writing. `--check` compiles in memory and preserves frozen output.

Known callers: content/panel entry points and npm build/preview commands; focused tests compile the current source, against current source.

## Retained schema and evidence boundaries

Preferences still read the version1 schema, including inert historical fields and saved event/layout identifiers, so existing local records and layout intent remain readable. `nightMuteLock` always sanitizes to false and is no longer an accepted setting command. Old event metadata may remain in session records but has no event action, provider client or resolver caller; the retired sports cache is neither loaded nor deleted. Restore may recover up to three previously stored extras for safe control/cleanup; this does not permit new feeds beyond the current two-total ceiling. Removing these records requires a schema migration that preserves existing settings.

The event-resolver workspace manifest remains a non-executable future boundary alongside Safari/macOS placeholders; no duplicate resolver implementation remains. Existing frozen bundles, failed runs and historical source/provider evidence stay intact and qualify only their recorded revisions. Historical evidence is not current setup guidance. [Provider boundaries](PROVIDER_EVALUATION.md), [error behavior](ERROR_HANDLING.md), [security](SECURITY.md).
