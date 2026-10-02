# Authenticated muted playback baseline

Status: OBSERVED, LIMITED — not the complete P0-A1 qualification.

Run started 2026-10-02 03:34 UTC. Observation owner: local Codex executor. Source: initial planning commit 903a7aabe1ac8b3dfab52fb54db9b585ce29336b plus uncommitted implementation. Method: ordinary supported Chrome UI and read-only DOM video state; no credential, cookie, token, protected frame or media URL extraction.

## Environment and authorization

macOS 27.0 (26A428), Mac15,6, 11 physical CPU cores, 18 GiB memory. Installed Chrome app metadata: 154.0.8037.93. Safari metadata: 27.0; Safari playback was not tested. Power/display/network setup and subscription tier remain UNKNOWN. Existing requested account was confirmed in the YouTube TV account menu; account identifier is deliberately omitted. No password or Keychain access was needed. User authorized local implementation and the unpacked extension with tv.youtube.com access, tab controls and local preferences. User then required all audio muted overnight.

## Actual observations

- Existing Chrome profile opened YouTube TV already signed in. Guide and authorized player opened normally; no sign-in, purchase or subscription change.
- CBS 2 ordinary player: 1280×720, readyState 4, paused=false, muted=true. Samples advanced from currentTime 46825.462537 to 46985.272671, then 47357.838644 and 47529.498391.
- NBC 4 second ordinary player: 1280×720, readyState 4, paused=false. Chrome site mute was already on before this player opened. Its player initially reported muted=false while inaudible at browser level; the existing Mute control was immediately applied. It then reported muted=true and advanced from 47004.482102 to 47176.479783.
- Chrome tab accessibility reported Audio muted; site context menu showed Unmute Site after enabling site mute. Do not undo this overnight.
- The first player continued to advance while the second was opened/inspected. This is limited background progression evidence, not a controlled 15-minute matrix.
- One Chrome process-name-only sample: total approximately 86 CPU percentage points and 2.37 GiB resident memory across Chrome processes. Includes all Chrome work and unrelated existing tabs; no clean single-versus-two delta, GPU or network measurement. This is a point sample, not a budget pass.

## Limits and next boundary

No continuous rendered-frame/stall instrumentation, 1080p, audible handoff, 3/4-stream qualification, account-specific allowance confirmation, Safari/Windows/native playback, capture or recomposition was tested. No full P0 gate passes. Four-stream operation must remain disabled until allowed account capability and independent evidence exist. Audio focus uses state-only/fake tests overnight; audible handoff remains NOT RUN.

Stop if an entitlement/DRM/session-limit error, freeze, interference, unexpected audio or thermal warning appears. Do not bypass restrictions or upgrade the plan. Preserve ordinary playback if the enhancement fails.
