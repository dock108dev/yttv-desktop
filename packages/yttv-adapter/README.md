# YouTube TV adapter

`src/index.ts` isolates ordinary DOM guide/player observations and native audio controls. It never reads credentials, cookies, internal application globals, protected media URLs, decrypted streams or DRM details.

`createDOMAdapter(document)` returns `getObservation`, `subscribe`, `navigateToChannel`, `seedGuide`, `setPlayback`, `setAudio`, `mute` and `dispose`. Navigation confirms only after the expected channel and an advancing player are observed. Missing/unknown/stale targets and absent/loading players return explicit capability failures.

`setAudio({ muted, volume })` supports player mute and volume. The volume path uses the ordinary native slider/change contract, validates native/player readback and preserves mute during volume changes. `mute()` is a convenience mute operation. Browser tab mute and managed-window lifecycle belong to the Chrome worker. `setPlayback` requests a uniquely identified native Play/Pause button once and checks the same player, preserving audio choices. Missing or refused controls return native fallback. Seek, captions and quality remain native service controls; there is no protected-video composition API.

Channel IDs use normalized names because feeds can share browse identifiers. Watch targets are observed tv.youtube.com pages with allowlisted parameters and 30-minute freshness. `freshGuideObservation` owns observation age for both presentation and `freshLiveTarget`; current metadata alone never grants navigation. Polling identical or hidden rows does not renew them; cached metadata cannot navigate. Hard reload/worker suspension can require reopening native Live. Disposal cancels pending navigation/observers without taking over the original player.

[Adapter tests](../../tests/yttv-adapter.test.ts) use synthetic DOM/player state. [Architecture](../../docs/ARCHITECTURE.md) describes shared target validation; real playback/entitlements remain separate evidence.
