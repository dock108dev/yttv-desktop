# Current product behavior

The Chrome extension augments authorized YouTube TV playback. It does not replace the player, account, subscriptions, DVR or content delivery.

## Browsing and navigation

The drawer shows observed channels and program text, with search, favorites, hidden channels, ordering and confirmed recent/previous history. Watch uses fresh ordinary watch-page targets. Cached listings remain readable but cannot authorize navigation; native Live can refresh them. Sports classifies/searches guide program text and separates current/next/upcoming listings from illustrative fixtures. It supplies no independent scores or live game state.

## Managed windows and audio

The original player plus one added browser window are the current supported software limit. Each remains a native service player; no protected-video grid is rendered inside the extension. Added tabs are muted before navigation. Replacement, close and expand/restore affect the chosen feed. Selection transfers audio/focus together using mute-before-enable isolation. Volume preserves mute choices and requires native/player readback. Site mute is unknown; native controls remain the fallback.

Local preferences/history/layout intent are sanitized and stored for the extension ID. Saved layouts grant no navigation or audio authority and do not automatically relaunch content. Storage failures are explicit and preserve unread records/prior choices where possible; browser changes and storage writes are not one transaction.

## Unsupported capabilities

Automatic tiling, monitor/custom TV-area selection, four-feed operation, Prime Video/Netflix, Safari/native clients, independent sports providers and event-to-channel resolution are not implemented. Actual playback concurrency depends on the account/platform and is not established by window count or fixtures. Full release/performance/accessibility qualification is not established by offline checks.

[Usage](../START_HERE.md), [development](DEVELOPMENT.md), [architecture](ARCHITECTURE.md) and [failure recovery](ERROR_HANDLING.md) describe current behavior. The separate [engineering requirements](planning/PRODUCT_REQUIREMENTS.md) retain proposed capabilities and stable requirement identifiers.
