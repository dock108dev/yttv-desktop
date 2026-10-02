# YouTube TV adapter

`src/index.ts` isolates ordinary DOM guide and player observations. It reads current/next titles, channel labels, supported navigation links and standard HTML video state; it never reads credentials, cookies, internal application globals, protected media URLs, decrypted streams or DRM details.

`createDOMAdapter(document)` provides `getObservation`, `subscribe`, `navigateToChannel`, `mute`, `seedGuide` and `dispose`. Commands return explicit capability results. A requested navigation becomes confirmed only when the expected visible channel and a progressing player are observed; a click or dispatched URL alone is not success. Unknown channel identity is left unknown.

The API currently does not implement authenticated embedded playback, stream composition/capture, program-specific navigation, play/pause/volume controls, or unmute. Browser session management lives in the Chrome bridge and exposes the separate muted-window fallback. The wider proposed adapter API remains a roadmap item rather than an implemented capability claim.

The guide uses normalized channel names for stable IDs because multiple feeds may share a browse identifier. Targets are ordinary observed `tv.youtube.com/watch` pages with allowlisted navigation parameters. They are volatile, timestamped and expire after 30 minutes. Polling identical or hidden guide rows does not renew their timestamps. Newly created watch pages can bootstrap the background’s fresh volatile guide; hard reloads and worker suspension may require reopening the native Live guide.

All video creation, playback and volume changes enforce the user’s overnight mute policy. Mutation observers exclude the injected UI and dispose on page exit. Adapter failure leaves the host player available.

Run `npm test` from the repository root for the focused DOM/URL and simulated Chrome API tests. Live authentication, protected playback, entitlements, simultaneous sessions and performance require separate observed evidence.
