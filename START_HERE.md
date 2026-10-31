# Using the Chrome client

Install or update the extension as described in [development](docs/DEVELOPMENT.md). Click the extension toolbar icon, then **New show**. You do not need to open YouTube TV first.

## Windows and placement

**New show** opens a new player and starts your last channel when available, otherwise the first available live channel. With no player open, it first loads YouTube TV's Live page to find a channel. If sign-in is needed, finish it in that window and press **New show** again. Further presses add shows up to four.

**Pick a channel** opens a searchable channel/program picker. Native listings load automatically through a short-lived inactive, muted Live tab; this helper is not a managed player. **Add current content** can duplicate an owned player's current watch page when other listings are unavailable; playback position may differ. Existing windows can still be chosen or connected.

The limit is four total managed players, including the original and pending creation. Account concurrency is separate. Each card offers Play/Pause, audio, volume, Change channel, Focus, Expand/Restore and Remove (Return for the original).

**Settings & layout** contains the TV area, Start, Arrange, automatic/manual placement and Connection. Add enrolls the original into a saved area when needed. Manual placement stays manual until automatic arrangement is selected. Return restores supported original placement; if its former parent is closed, a normal-window fallback is reported. Remove closes an added player only.

Known windows recover after remote reopen or extension Reload. Open players without surviving ownership records require **Connect existing player**. Connecting does not move, navigate or change audio. A restored tab with a different ID cannot inherit a historical original Return position.

## Arrange one to four shows

Press **Arrange shows**. You can plan and save positions before opening any shows. To change a saved setup, press **Change layout**.

1. Choose **1–4 shows** and a layout: Best fit, Stacked, Side by side, Grid, a larger show on one side, or **Place each show myself**.
2. Press **Choose monitor** and select the screen you want.
3. Press **Draw on monitor**. A full-size drawing window opens on that screen. Draw one TV area for a preset, or one box for each show in a custom layout. You can fine-tune the numbers and copy the coordinates there. Use **Move controls to bottom/top** when the panel covers the place you want to draw; it fades during a drag. This is a monitor-sized canvas rather than a see-through desktop overlay.
4. Press **Save layout**. Use **New show**, **Pick a channel** or Connect to fill any remaining show slots. Changing the show count in setup plans the layout; it does not create extra players. A saved plan remains available when no shows are open. If the current show count cannot fit the planned layout, the current windows stay in place; add/remove shows or choose another layout, then press Arrange shows. Saving during first-show startup waits for you to arrange after startup finishes.

For presets, the small preview and precise fields remain available as an alternative. With **Place each show myself**, saved positions are remembered separately for one, two, three and four shows. Counts without custom positions use Best fit until you draw them.

Press **Arrange shows** to put the current shows back in place. **Channel** changes a show without moving it to another slot; the replacement starts muted. The original player is show 1. With an enrolled workspace or an explicit saved layout, Expand fills the saved TV area (the bounding area of your custom positions); Restore returns the windows to their prior positions. With Best fit and no enrolled workspace, an added player's Expand/Restore uses native maximize/restore, while the original asks you to start the workspace first. A second player sharing a window with unrelated tabs needs its own Chrome window before arranging.

## Manual video queue

Open **Add video** in the remote. Choose a YouTube TV channel from the loaded guide, or save a supported plain YouTube, Prime Video or Netflix link. Saving and editing the queue does not launch anything or change sound. Enabled regular YouTube can play supported watch links. Prime Video and Netflix open muted native attention windows and retain their queue items; their remote playback controls are unavailable.

Use **Play next in** to select an empty slot or explicitly replace a named slot. Replacements reuse the same player window and start muted, retaining the volume choice. An item leaves the queue only after a matching native player is ready and consumption is saved; readiness does not prove playback. If native Play is refused, use the player's controls. There is no automatic advancement.

Use Up/Down, Edit or Remove for waiting items. Cancel launch first to edit a launching item. Removing a launching item revokes its work; an unresolved opening may retain the item until cleanup or confirmation. Retry revalidates the target and reuses the surviving resource. Focus slot brings up native controls without enabling audio.

After an interruption, inspect the named player and retry explicitly. If an opening may have left an unknown window, close it yourself before choosing **I closed the interrupted window**. Known open resources cannot be released by that button. Failed cleanup still counts toward four players. Closing the remote does not cancel playback or worker operations.

A save error never authorizes launch or consumption. **Retry storage** retries a failed read/migration. Damaged or newer-format records remain preserved and read-only; do not clear storage or reinstall as a shortcut. The fixture preview demonstrates queue editing only and cannot play video.

## Playback and audio

New windows start muted; creating one preserves existing windows' audio and volume. Explicit **Channel** replacement mutes the selected player and its tab before navigation; it retains the volume choice for recovery on the replacement player and leaves other players' audio alone. Use **Enable audio** when you want sound from that replacement. Startup waits up to 15 seconds for a ready player and requests its unique native Play control once. Starting the first show also allows 15 seconds for its Live listings. If the show needs attention, use Play or finish setup in its YouTube TV window. A worker restart cancels waiting startup rather than retrying it.

Volume changes never unmute. **Enable audio** explicitly transfers audio through mute-all-before-enable-one policy at the selected player's existing volume. Focus, Play/Pause and placement do not transfer audio. Player mute and Chrome tab mute are separate; site mute can be unknown. Readback and advancing clocks do not prove a visible picture or heard sound.

## Guide, Sports and shortcuts

The page's **Desktop** launcher opens the drawer. Guide supports search, favorites, recents, order and hiding. Previous uses confirmed channel history. Native captions, quality, seeking, Library/DVR and account controls remain available.

Sports searches competition, team and program text from native listings. Current/next/upcoming labels describe guide context, not game status. There are no independent live scores. The labeled Fixture Lab is illustrative and cannot Watch/Add.

With focus in the workspace or guide rows, default shortcuts are `w` Watch, `g` Guide, `s` Sports, `q` window controls, `/` search and `p` Previous. Arrows move row focus; Tab reaches controls; Enter activates eligible rows. Editable fields, native controls and browser chords retain their keys. **?** edits bindings; duplicate bindings are rejected, blank disables a binding, and Escape closes the dialog.

## When controls are unavailable

Cached or expired listings cannot authorize navigation. Native controls and Add current content may remain available. **Open native guide for other channels** changes the original view and cannot promise restoration of a paused position. A discovery tab moved or navigated elsewhere is left alone.

Connection can request optional, narrowly scoped reconnect access. Without it, use native controls or a normal page refresh. Do not clear extension storage or reinstall to recover metadata. See [troubleshooting](docs/ERROR_HANDLING.md).

## Regular YouTube

Choose **Enable YouTube** in the remote to grant `www.youtube.com` and scripting access. Add an ordinary `https://www.youtube.com/watch?v=VIDEO_ID` or `https://youtu.be/VIDEO_ID` link, then choose **Play next** and a destination slot. Short links normalize locally without contacting `youtu.be`. Existing eligible native tabs appear as **Connect** choices after enabling access. Connect observes their existing playback and audio; it does not move or restart them. Use Connect again after a changed video/player or restored permission.

YouTube shares the four-player limit, queue receipts, replacement slots and placement controls with YouTube TV. New and replaced players are browser-muted before navigation. Play/Pause requires an available native button and matching readback. Mute and volume require a current player; changing volume preserves mute. **Enable audio** requires every managed player's mute readback. **Native player** focuses the existing tab if remote controls are unavailable.

Ads, buffering and unknown identity do not consume queued intent. Live watch content stays manually controlled and never reports on-demand completion. Advancement is always manual. Shorts, playlists, live-path links, embeds, music/mobile domains and paid catalogs are not supported entry paths. Prime Video and Netflix limitations are described below.

If access is denied or removed, queued links and uncertain windows remain counted. Enable access and explicitly retry or Connect; nothing reopens automatically. Local fixtures do not establish visible playback, heard audio, account entitlement or actual mixed concurrency.

## Prime Video — attention support only

Choose **Enable Prime Video**, add a canonical `https://www.primevideo.com/detail/TITLE_ID` link, and select **Play next**. The remote opens the detail reference in a browser-muted native window using one of the four shared slots. The queue item remains pending. Use **Focus slot** to finish sign-in, profile/episode selection, or entitlement decisions yourself in Prime Video. Redirects to Amazon or any other origin stop remote integration; native focus remains available.

This build cannot verify Prime main-content identity, readiness, Play/Pause, native mute/volume or completion. It never treats a visible video, trailer, title ID or arbitrary episode as the queued main content. **Connect** explains this limitation without adopting a player. No confirmation button can override missing evidence. Native sound remains user-operated; the remote refuses shared audio enable while Prime native mute cannot be verified.

Replacement into Prime reuses the selected tab and preserves its real Return lineage. Replacement out of Prime, including Retry, is refused because the selected native volume cannot be read reliably. Close the native window before reusing that slot. Cancellation retains any resource whose cleanup fails. Existing native focus remains available. Placement that needs original-player continuity/readback may also be refused; no unknown audio state is treated as preserved. Nothing advances automatically.

## Netflix — attention support only

Choose **Enable Netflix** to request only `www.netflix.com` and scripting access. Add `https://www.netflix.com/title/DIGITS` or `https://www.netflix.com/watch/DIGITS` (1–20 digits), then choose **Play next** and a slot. The existing parser removes `trackId` decoration and rejects other parameters/routes. A title is not an episode; a watch link is not proof of ready main content.

The page opens browser-muted and counts toward the shared four-window limit. Its queue item stays pending. **Focus slot** or **Native player** lets you finish profile, sign-in, episode, maturity and account decisions yourself. The remote shows general attention; it cannot distinguish these prompts reliably. Play/Pause, native mute/volume and ended detection remain unknown. Connect explains the missing identity evidence without adopting or changing your player. Shared Enable audio is blocked while Netflix or Prime state is unknown.

Replacement into Netflix reuses the selected tab. Replacement out and Retry are refused before mutation because native volume cannot be preserved reliably; close the native window before reusing its slot. Focus and recovery do not navigate, play, consume intent or change sound. Permission denial/revocation retains intent and counted resources. See [provider boundaries](docs/ARCHITECTURE.md#provider-integration) for the implementation limits.
