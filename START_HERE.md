# Using the Chrome client

Install or update the extension as described in [development](docs/DEVELOPMENT.md). Open YouTube TV normally and use the extension toolbar icon to open the remote.

## Windows and placement

Choose an original player when prompted. **Add window** opens a searchable channel/program picker. Native listings load automatically through a short-lived inactive, muted Live tab; this helper is not a managed player. **Add current content** can duplicate an owned player's current watch page when other listings are unavailable; playback position may differ.

The limit is four total managed players, including the original and pending creation. Account concurrency is separate. Each card offers Play/Pause, audio, volume, Change channel, Focus, Expand/Restore and Remove (Return for the original).

**Settings & layout** contains the TV area, Start, Arrange, automatic/manual placement and Connection. Add enrolls the original into a saved area when needed. Manual placement stays manual until automatic arrangement is selected. Return restores supported original placement; if its former parent is closed, a normal-window fallback is reported. Remove closes an added player only.

Known windows recover after remote reopen or extension Reload. Open players without surviving ownership records require **Connect existing player**. Connecting does not move, navigate or change audio. A restored tab with a different ID cannot inherit a historical original Return position.

## Two shows, top and bottom

For this update, close the remote and Reload the existing extension entry at `chrome://extensions`, then reopen the remote from the toolbar. Version **0.2.13** appears under **Settings & layout → Connection**. Keep the existing entry and its settings.

Press **Two shows · Top/bottom**, then **Choose monitor**, allow monitor access if prompted, and select **Philips** in the Monitor list. Draw the right-hand rectangle from your reference image, leaving the left desktop available, or adjust **left, top, width, height** under **Adjust area precisely**. Check the Top (1)/Bottom (2) preview, then press **Save Top/bottom area**. Confirm an existing saved rectangle if it matches. No full-monitor area is assumed for a new pair. Reference-image pixels must be calibrated to Chrome’s logical coordinates; native video can letterbox.

Save the area once. The original is **Top**, and the second connected player is **Bottom**. Connect the intended existing player explicitly, or use the ordinary Add picker for another show. Connecting preserves position/audio; a connected player sharing a window with other tabs must first be moved to its own Chrome window using native controls. Change channels on the cards to keep their slots. No additional player is created simply to arrange a pair.

With two players connected, the visible shortcut reapplies the remembered rectangle in one action. A synthetic journey records two actions including opening the remote; actual ordinary-use effort remains an owner check. **Reselect TV area** is available next to the preview. Expand fills only this rectangle; Restore returns both players to their prior bounds. Explicit application works in manual mode without enabling automatic Add/Close reflow.

For the first try, confirm both shows visibly advance, press the shortcut again, try Expand/Restore on each player, then close and reopen the remote and reapply the shortcut. Keep your current mute/volume choices; newly added players start muted. Report the first concrete problem, which action triggered it, and what happened versus what you expected. That feedback determines the next fix.

Top/bottom is saved separately from the area; Auto remains the legacy default and is available under Settings & layout. One player fills the area. Three/four players use the existing automatic geometry and remember Top/bottom, while the two-show shortcut refuses the count mismatch. It never closes or selects extra players silently.

The fixed arrangement requires the existing optional monitor access. If that monitor/access is missing or its logical work area changes, placement stops for deliberate reselection. It never chooses a different monitor or switches to side-by-side. Bounds refusal reports rollback limits and retains native positioning/Return. Opening the remote does not itself rearrange players or change playback/audio.

## Playback and audio

Added windows are muted before navigation. Startup waits up to 15 seconds for a ready player and requests its unique native Play control once. If that request is unavailable or unconfirmed, use native Play. A worker restart cancels waiting startup rather than retrying it.

Volume changes never unmute. **Enable audio** explicitly transfers audio through mute-all-before-enable-one policy at the selected player's existing volume. Focus, Play/Pause and placement do not transfer audio. Player mute and Chrome tab mute are separate; site mute can be unknown. Readback and advancing clocks do not prove a visible picture or heard sound.

## Guide, Sports and shortcuts

The page's **Desktop** launcher opens the drawer. Guide supports search, favorites, recents, order and hiding. Previous uses confirmed channel history. Native captions, quality, seeking, Library/DVR and account controls remain available.

Sports searches competition, team and program text from native listings. Current/next/upcoming labels describe guide context, not game status. There are no independent live scores. The labeled Fixture Lab is illustrative and cannot Watch/Add.

With focus in the workspace or guide rows, default shortcuts are `w` Watch, `g` Guide, `s` Sports, `q` window controls, `/` search and `p` Previous. Arrows move row focus; Tab reaches controls; Enter activates eligible rows. Editable fields, native controls and browser chords retain their keys. **?** edits bindings; duplicate bindings are rejected, blank disables a binding, and Escape closes the dialog.

## When controls are unavailable

Cached or expired listings cannot authorize navigation. Native controls and Add current content may remain available. **Open native guide for other channels** changes the original view and cannot promise restoration of a paused position. A discovery tab moved or navigated elsewhere is left alone.

Connection can request optional, narrowly scoped reconnect access. Without it, use native controls or a normal page refresh. Do not clear extension storage or reinstall to recover metadata. See [troubleshooting](docs/ERROR_HANDLING.md).
