# Using the Chrome client

Build and load the extension as described in [Development](docs/DEVELOPMENT.md). Open YouTube TV and use its normal sign-in and player controls. The extension does not manage authentication or subscriptions.

## Guide and Sports

Click **Desktop** to open the drawer. Open the native **Live** guide to observe channel/program listings, then choose **Guide** to search, filter favorites/recents or customize stars/order/hide. **Show hidden channels** reveals hidden entries; **Use native order** resets ordering only.

**Sports** searches team, competition and program text present in your guide. Current/next/upcoming labels describe listings, not confirmed game state. No live scores, overtime or final status are supplied. The separately labeled Fixture Lab is illustrative and cannot Watch/Add.

Fresh eligible **Watch** actions navigate the original player. **Previous** uses confirmed channel history. Pending actions do not mean playback was confirmed. **Add** opens one muted managed window alongside main; two feeds total is the supported software limit. **QuadBox** controls these separate windows, including selection, replacement, expand/restore and closing the extra. It is not a composed protected-video player.

**Original player** closes the drawer; **Desktop** reopens it. Native captions, quality, seeking, Library/DVR and account controls remain available.

## Audio and shortcuts

The selected-player slider changes volume. Player mute and Chrome tab mute are separate; site mute is unknown to the app. Selecting a feed transfers audio and focus together, after muting managed feeds; **Mute all** mutes main and the extra. New windows start muted. Saved layouts and closing an extra do not automatically restore audible main playback. When native volume cannot be confirmed, use the original slider. Readback alone does not prove heard sound.

Focus the workspace or a guide row for `w` Watch, `g` Guide, `s` Sports, `q` window controls, `/` search and `p` Previous. Arrows move row focus; Tab reaches controls; Enter activates eligible rows. Editable fields, native controls and browser chords retain their keys. **?** opens editable bindings; duplicates are rejected, blank disables a binding, and Escape closes the dialog.

## Recovery and data

Cached or last-observed guide text cannot authorize navigation. **Open native Live** or **Refresh guide** reacquires targets in the main tab. This can replace a paused program; returning to the same channel does not restore its program/position. Prefer the original player when exact paused content must be preserved.

Close the drawer and use native controls when enhanced controls fail. Do not clear storage or reinstall to recover metadata. Settings/history/layout intent are stored locally for the extension ID. Update an existing installation with Reload on its existing entry to retain those records. [Failure recovery](docs/ERROR_HANDLING.md) explains storage and cleanup failures.

Four feeds, automatic layouts, monitor selection, mixed services and independent Sports state are unsupported. [Development](docs/DEVELOPMENT.md) and [architecture](docs/ARCHITECTURE.md) describe current code; [retained readiness evidence](docs/evidence/runs/20261002-c1-rg2/run.md) qualifies its own installed build only.
