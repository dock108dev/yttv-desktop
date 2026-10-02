# Local beta candidate status

Updated 2026-10-02. This is a local beta candidate, not completion of the full Chrome MVP. The user's original 18 criteria stay in [acceptance](ACCEPTANCE_AND_TEST_PLAN.md). [Run records](evidence/runs/README.md) separate synthetic results from real observations.

## Implemented and checked

- Private local TypeScript/React workspaces, locked dependencies, build, type checking, 43 automated tests and exact permission audit.
- MV3 extension with tv.youtube.com-only access and local storage; content drawer isolates the original player.
- Real compact guide candidates and ordinary CBS/NBC channel navigation; current/recents/Previous state uses confirmed advancing playback.
- Favorites/order/hide/search and local preferences; fixture UI confirms favorite/hidden persistence. Additional real reload checks remain recorded individually.
- Sports normalization/search/freshness/overrun/delay, resolver provenance/ambiguity and event-pane transitions tested using explicit fixtures. Fixture Sports has no playable live targets.
- Managed separate browser windows with mute-before-navigation, independent replacement, saved expand/restore bounds and ID revalidation on worker recovery. Mock tests prove command sequencing, not actual playback feasibility.
- Per-tab drawer open state repair for full document replacement. All real player and tab audio locked muted overnight; no real unmute path.

## Remaining beta release gates

Live Sports/provider licensing/coverage/freshness/broadcast mapping is not connected. In-page composed video QuadBox is not implemented; managed windows are a disclosed fallback. Four-stream support is disabled and account allowance is unverified. Continuous stalls/render/resource qualification and audible handoff remain unrun. Safari/Windows/native remain untested. Full U01–U18/three-game acceptance is not met.

Keyboard mappings are persisted in the shared state but the current UI uses its default scoped bindings; configurable mapping UI and guide arrow navigation remain incomplete. Playback play/pause/volume/program-navigation contract methods remain planned beyond implemented guide/navigation/mute/observation. Layout IDs persist but recreating last QuadBox requires an explicit future revalidation/reopen workflow. Failure isolation and extension disable/teardown still need real browser tests.

No purchases, provider keys/accounts, credentials extraction, protected stream proxy/capture, DRM bypass, remote repo or publication. Local installation/reload required user handoff because browser automation explicitly blocks extension-management pages.
