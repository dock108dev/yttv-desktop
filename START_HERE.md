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

## Personal-use scope and review

The supported goal is a Chrome YouTube TV remote that starts without a pre-opened player, manages one to four shows, saves preset or custom positions on a selected monitor, and retains native playback/account controls. The Philips right-hand top/bottom setup is one supported arrangement. Existing saved settings, player identities, Return behavior, unrelated tabs and current audio choices must remain intact. A transparent desktop overlay, other services/platforms and independent sports scores are outside this goal.

After following the [existing-entry update instructions](docs/DEVELOPMENT.md#chrome-installation-and-updates), review the flow through ordinary use:

1. When convenient, try New show from an empty session; finish any sign-in in YouTube TV. Choose/add the shows you want within your account's allowance.
2. Choose a preset or draw custom positions on your monitor. Reapply the saved layout, change a channel, and try Expand/Restore and Return where useful. Count selection saves a plan; it does not create players.
3. Reopen the remote and, during an update, Reload the existing extension with known players still open. Check that the open-window count/cards recover, positions remain useful, and mute/volume choices remain as selected. Explicitly Connect players whose ownership records or browser IDs no longer match; do not close/re-add them to repair a count.
4. Report the first problem with the action, expected result and actual result, or confirm that the update is useful as delivered. The owner decides acceptance or requests a concrete correction. This is ordinary feedback, not a requirement to exhaust every layout combination.

The earlier owner report covered the initial 0.2.13 top/bottom setup. It does not establish acceptance of the expanded 0.2.15 flow. [Verification](docs/CI.md#verified-execution) covers the committed source; native picture, heard audio, physical placement and actual setup effort require user-operated observation.
