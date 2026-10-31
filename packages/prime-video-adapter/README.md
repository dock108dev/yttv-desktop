# Prime Video adapter

Conservative `ProviderAdapter` for canonical Prime detail intent. Recognizes exactly `https://www.primevideo.com/detail/` followed by one 1–64 ASCII alphanumeric ID. No query, fragment, regional/slug route, Amazon route or direct-player URL is accepted.

Main-content identity and native readiness, Play/Pause, mute/volume/readback and ended remain unknown. Detail pages, previews, trailers, ads and unrelated episodes cannot authorize remote commands or queue consumption. The bridge key identifies the document session only. This package contains no qualified Prime DOM selectors and makes no successful playback claim. All controls return native attention without writes.

See [provider integration](../../docs/ARCHITECTURE.md#provider-integration) for current limitations. The [security document](../../docs/SECURITY.md#optional-prime-video-access) describes permission boundaries.
