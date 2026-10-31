# YouTube adapter

Implements the [shared provider contract](../core/src/media.ts) for regular YouTube's ordinary watch pages. URL canonicalization remains in core. DOM selectors, native Play/Pause button dispatch, HTML media mute/volume readback and content classification live here. No private globals, stream URLs, iframe API, credentials or network requests are used.

Capabilities require a unique main video, a matching `ytd-watch-flexy` video ID and a recognized URL. Play/Pause also requires a unique enabled native button. Loaded metadata and enough current data distinguish ready content from loading. Recognized ad classes disable readiness and commands; live markers disable ended classification. Unknown metadata, missing/duplicate players, stale identities and failed readback retain native fallback. Volume preserves mute. Ended observations never advance the queue.

These selectors and classifications are **fixture-tested, live-unverified**. YouTube does not document this watch-page DOM as a stable control API. Browser media methods/properties describe readback semantics, not provider support. See [provider integration](../../docs/ARCHITECTURE.md#provider-integration).
