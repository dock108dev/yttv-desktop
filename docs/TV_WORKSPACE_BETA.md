# Q3-B1 — compact remote and organized TV workspace

Updated 2026-10-03 EDT. **Status: READY PLAN / NOT IMPLEMENTED.** This specification records the owner's requested beta additions. It does not establish a new installed candidate, permission grant, display capability or playback count. [NEXT_TASK](../NEXT_TASK.md) owns active work; [ROADMAP](ROADMAP.md) owns sequencing; [BACKLOG](BACKLOG.md) owns status.

## Mixed-service beta extension — R25

The owner also requests Prime Video and Netflix in the same four-slot workspace. [MULTI_SERVICE_BETA](MULTI_SERVICE_BETA.md) extends this specification: four TOTAL enrolled Chrome players across any permitted combination of the three services; initial native content selection plus explicit Add existing player tab. Service-independent geometry/remote state and service-specific native-control adapters are required. Current installed017 has only YouTube TV access; mixed-service implementation and actual playback are NOT RUN.

## Delivery target

Deliver one integrated Chrome TV workspace: a small separate remote, automatically arranged native YouTube TV/Prime Video/Netflix player windows, a ceiling of **four total feeds: the designated original player plus up to three extras across supported services**, and a selectable monitor or rectangular TV area. The remote is a controller and does not count as a feed. The owner should be able to choose an area, add channels, and get a readable arrangement without manually positioning every window.

The user request authorizes local implementation and bounded count-specific installed qualification where the account and supported surfaces allow it. Preserve the current mute and paused-state boundary and owner-only extension management. Finish the complete local candidate before a combined permission/reload handoff. Do not split remote, tiling and feed-count implementation into repeated owner reloads or begin a provider/vendor planning exercise.

Installed baseline remains **v0.1.17 / 50a15df68eb2c3db / extension ID idaaiiafgopfpaojpnhaoefbefllioab**. Retain its bundle, rollback, recorded102-test verification and prior run evidence. Preserve original staged/unstaged work, preferences, guide cache, shortcuts, extension ID/storage and owner tabs. The last captured handback was Comics Unleashed paused4:36,100%,site/tab muted,no extra; capture the actual current state before future runtime work rather than treating that historical snapshot as current.

Current working-tree review found nine source/test inputs newer than the frozen017 inventory; current dist bundle still matches017. Preserve those uncommitted changes, inspect their intent, and verify the complete resulting source before building Q3-B1. Recorded102-test verification qualifies its retained017 inputs, not these newer files.

## Required product behavior

### 1. Compact remote

Provide **Open remote** from the in-player control and extension toolbar. Open or focus one persistent extension popup window. Repeated activation must focus the existing remote rather than create duplicates. A normal action popup that disappears when a player receives focus is not the delivered remote.

Use a compact presentation of the existing guide/Sports bridge: current/selected feed, search, channel results, Watch/Previous, Add, feed focus, explicit audio selection, mute/volume, Arrange, TV area, Expand/Restore and Return original player. Keep large decorative headers and empty video placeholders out of the small remote. It must resize sensibly and preserve readable controls, visible keyboard focus and useful search results.

Keep a small collapsible in-player launcher/control available. Collapse the full drawer while watching; opening the remote must not cover substantial player content. Do not turn a small remote into another full-size dashboard. Closing it leaves every playback window, guide state and audio choice intact. Reopening reconnects to the same workspace.

Remote open/close, focus, geometry and layout actions confer no audio authority. Expose **Focus feed** separately from **Select audio**. Continue the existing serialized mute-before-enable route only for an explicit audio action; the current owner mute hold prevents audible qualification.

### 2. Automatic readable arrangement

Arrange only the explicitly managed player windows within the chosen TV area. Default layouts are one full-area player, two balanced players using the area's aspect ratio, three as a larger selected/main player with two smaller players where readable, and four as a2×2 grid. Keep stable pane order and identity when adding, replacing or closing a feed. A layout may choose another deterministic arrangement when it fits better; disclose the preview before application.

Add and Close automatically recompute the arrangement while automatic arrangement is enabled. Include **Arrange now** and a clear way to keep manual positions. Do not repeatedly fight the owner's drag/resize. Expand temporarily uses the selected TV area, retaining the complete prior arrangement; Restore returns all affected bounds and selection. Arrange, Expand and Restore preserve player state and audio routing.

Use native supported player windows; do not embed, capture, proxy or reconstruct protected video. The target is a useful collection of arranged Chrome windows, not a promise of one composed video surface. Native borders/titlebars and the site's player layout remain relevant to fit. Do not promise a frame-free window, transparent desktop overlay, true native shell or always-on-top behavior.

### 3. Four total feeds

Replace runtime/UI two-feed guards with one consistent four-total ceiling. A designated main consumes one slot, leaving at most three extras. Remote/selector windows consume none. Count pending creations as reserved slots so rapid Add actions cannot exceed the ceiling. Reconcile closed, detached or changed tabs before reporting count or creating another feed. Do not silently adopt or close unrelated YouTube TV tabs.

Retain fresh-target validation and muted-before-navigation creation. Replacement affects only the selected feed and does not allocate another long-lived feed. New feeds begin muted; saved layouts never restore audio authority. Fifth-feed attempts produce a clear limit result without altering the existing four. Account/browser/channel refusal preserves working feeds and reports that the requested feed could not play.

Four managed windows, four confirmed players and four simultaneously advancing feeds are distinct results. Existing two-feed evidence does not qualify three or four. Do not infer account allowance from four tabs being on one machine, from window creation succeeding, or from a general plan description. Existing playback elsewhere may consume the owner's service allowance; do not disrupt it or bypass restrictions.

### 4. Monitor or rectangular TV area

Offer **This screen**, an optional monitor picker, and **Choose area**. Monitor choice uses the display's usable work area. Choose area lets the owner drag a rectangle on a proportional diagram of the selected monitor, then review/apply it. Provide full-work-area reset and keyboard/numeric adjustment so drawing is not the only input method. The diagram is schematic and must not imply it is a captured desktop image.

Declare `system.display` as an optional permission if used. Request it only from a direct **Choose monitor** user gesture in the extension remote. Explain that it reads monitor names and placement for arranging these windows. Do not request it on startup or add capture/cookie or unrelated host permissions. Mixed-service access follows the precise optional-origin review in MULTI_SERVICE_BETA. The permission decision remains with the owner; denial or unavailable display metadata keeps a working current-screen route with truthful limits. Use the current remote/player screen's available rectangle in the fallback; do not claim it enumerates or identifies all monitors.

Persist selected display/area and layout intent in extension storage with validated schema migration. Store a normalized rectangle relative to the work area together with enough identity/context to revalidate it. Do not persist raw playback URLs, transient navigation authority or a guarantee that a display ID survives reconnection.

## Implementation boundaries

### Reuse the current controller and session seams

`apps/chrome-extension/src/panel.tsx` and `bridge.ts` already mount/use the extension client bridge. Add a remote presentation and explicit remote/workspace commands through `adapter.ts`, `bridge.ts` and the background handler. Keep guide/selector/player details in the existing browser bridge and adapter. The fixed440px drawer in `content.tsx` needs a compact collapsed mode rather than a second independent state model.

`background.ts` owns current main/extra identities, creation, replacement, selection and audio serialization. Its `MAX_TOTAL_WATCH_SESSIONS=2`, one-extra check, `maxPanes:2` and UI two-pane guards are implementation gaps, not the new product ceiling. `packages/quadbox` already models2/3/4 panes; use a shared count/capacity contract and expose it in the snapshot instead of scattering numeric UI guards. Keep account availability distinct from the software ceiling.

### Put the original player in a dedicated managed window

Auto-layout must never resize the shared owner browser window containing unrelated tabs. On an explicit **Start TV workspace** action, move the existing designated main tab into a dedicated popup player window using its existing tab identity, without loading a new playback URL or replacing the program. Capture original window ID, tab index/pinned state, focus/bounds and relevant player/mute/volume state first.

Support **Return original player** using that same tab. Restore it to the original window/index when available; if that window legitimately no longer exists, return the same tab to a normal window and disclose the fallback. Preserve other tabs and window bounds. Never close the main as an extra feed. If main detachment cannot preserve the captured paused program/position, stop that path and report the capability failure; do not navigate to the same channel and label it restoration.

Tab/window moves, manual tab detachment, closure and reload must revalidate ownership. Session restore may reconnect to validated existing windows, but must not silently recreate feeds, replace the main or grant audio. Handle a user manually closing the main as a missing main; do not seize another owner tab without explicit selection.

### Separate geometry from sessions and audio

Add a pure geometry planner in an appropriate shared module, independent of Chrome calls, guide data, playback and audio. Its inputs include selected work area/TV rectangle, stable managed pane order, count, expanded state, gaps and readable minimum outer-window dimensions. Its output is planned bounds or an explicit too-small/unavailable result. Validate finite bounded numbers; support negative x/y, portrait/landscape areas and rounding without gaps extending outside the area.

The Chrome bridge applies planned bounds only to validated managed windows. Save the previous complete arrangement, normalize window state before sizing, and read back actual bounds after changes. Chrome/OS may clamp sizes or positions; compare requested/actual fit and readability rather than accepting a successful API acknowledgement as layout proof. Bound retries; avoid resize-event feedback loops. On partial application failure, restore affected windows where possible and report any remaining difference.

Use one documented coordinate system consistent with Chrome window/display observations. Do not multiply placement coordinates by devicePixelRatio indiscriminately. Account for monitor scale, OS work-area reservations, browser frame size and site minimum player layout. Learn or safely validate actual minimum window dimensions through readback. A TV area that cannot fit the requested count must offer enlargement/fewer feeds rather than overlap, inaccessible controls or silently rendering clipped players.

Refresh display metadata on topology changes and before applying a saved area. If a monitor disappears, keep/recover managed windows on an available area and show an actionable placement notice; never move unrelated windows or auto-navigate players. Revalidate saved normalized geometry against the new work area. Current-screen fallback lacks a complete topology and must retain that limitation.

## Focused tests and acceptance

Add meaningful behavior tests, reusing current background/UI harnesses where possible:

- Pure layout1/2/3/4; aspect-ratio choices; negative coordinates; scaled/moved work areas; integer rounding; containment/nonoverlap; too-small areas and malformed saved geometry.
- Main-tab move/Return preserving identity and other owner tabs; vanished original window; already-dedicated main; failed move/readback and partial arrangement rollback.
- Singleton remote reopen/focus; remote close leaves all feeds; compact keyboard/search usability; focus-only actions produce no mute/unmute commands.
- Four-total reservations under concurrent Add; fifth rejection; closure/replacement reconciliation; untouched unrelated tabs; fresh/cache guards; refusal preserves existing feeds.
- Permission requested only from the explicit monitor gesture; denial/revocation/unavailable metadata uses fallback; drag-to-work-area mapping and accessible rectangle adjustment; missing display recovery.
- Expanded full arrangement restoration, manual-versus-automatic sizing, stale callbacks and session reconnect without new playback/audio authority. Retain existing audio-failure and volume-recovery regressions.

Run normal verification after implementation and prepare an exact source/test/bundle inventory plus the complete rollback bundle. Documentation-only work needs the lightweight documentation check; no verification count from the old candidate belongs to changed inputs.

Installed acceptance must report these criteria separately:

| Criterion | Required evidence |
| --- | --- |
| Remote | Persistent small window, singleton reopen, readable guide/Sports search, unobscured players, closing/reopening preserves sessions. |
| Main preservation | Same main tab before/after detach/Return, unrelated tabs/bounds unchanged, captured program/paused position/mute/volume confirmed or precise disclosed difference. |
| Geometry | Actual1/2/3/4 window bounds inside chosen area, readable native players, no overlap/clipping, Add/Close reflow, Expand/Restore, manual mode. A paused player can qualify geometry only. |
| Display/area | Available monitor picker and drawn rectangle or explicit current-screen fallback; requested/actual placement agrees. Real topology/scaling tests only where available. |
| Session ceiling | Main plus three extras maximum; fifth rejection; independent replacement/close; no extra sessions or unrelated tab takeover. |
| Playback count | Count-specific simultaneous advancing native-player observations at2/3/4 where permitted, distinct from window existence and preserved prior two-feed evidence. |
| Audio hold | Site/tab mute remains active; no enable/transfer. Geometry/session actions produce no unintended audio. Existing audible two-feed evidence remains historical. |

For bounded live qualification, use one consolidated run after the completed candidate and any owner permission/reload step. Capture actual state first. Preserve the original paused main and its position; do not replace it for a guide refresh or active-feed benchmark without a verified restoration path. Qualify its geometry while paused. If four simultaneous advancing feeds require resuming/replacing that preserved main and restoration cannot be established, record four-active playback as unrun pending the owner-held action; three added advancing players plus a paused main is not a four-active pass.

Where permitted and safe, collect a short settled observation for each newly exercised count, then one10-minute observation at the highest functioning count. Record channel eligibility, per-player advancement/ready state, quality, loading/refusal, responsiveness and available aggregate resources. Stop increasing count on a service/account refusal or destabilization, close only newly created extras and preserve working playback. Do not invent formal per-feed performance from Chrome-wide samples. Reuse prior two-feed sustained evidence unless these changes produce a relevant regression.

Evidence must identify exact installed version/build/ID, source hashes, method/time/environment, permission state, logical work area and requested/actual bounds, controlled versus advancing count, mute/volume readbacks, and precise handback. Keep sanitized refusal/failure evidence and earlier runs. A local fake display or window fixture establishes local logic only. Update NEXT_TASK, ROADMAP, BACKLOG, START_HERE, evidence index and the Desktop pointer together; keep broader MVP/beta acceptance open until its separate criteria pass.

## Handoff and stop rules

Prepare the whole feature candidate and local review before asking for owner actions. If necessary, combine the exact optional monitor permission explanation and one existing-entry reload into a single concrete handoff. Owner performs extension management; preserve ID/storage and the confirmed Loaded from folder. No remove/reinstall, alternate extension-management workaround or clearing storage. A permission denial must not block the usable current-screen implementation.

Deliver working remote/arrangement/count controls or a specific observed capability refusal with the remaining criterion open. Do not claim the four-feed beta requirement is fulfilled if only four windows or local tests passed. Historical mute/refusal attribution stays documented; it is not a reason to reopen unrelated repair work. No API keys, sports provider acquisition, native/Safari/Windows port, publication, purchases, capture/protected playback workarounds or full release-hardening expansion are included.

## Primary implementation references

- [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows): supported create/move/resize methods, existing-tab creation, outer-window bounds, window state and committed bounds events. Actual continuity and size fit still require runtime evidence.
- [Chrome system.display API](https://developer.chrome.com/docs/extensions/reference/api/system/display): optional monitor metadata via `getInfo`, display bounds/work area and display-change notification. Do not use ChromeOS-only display-configuration/calibration methods on macOS.
- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions): optional permission declaration/request and direct user-gesture requirement; denial must be handled.
- [YouTube TV concurrent viewing](https://support.google.com/youtubetv/answer/7069119?hl=en): the general service describes up to three simultaneous devices. This does not define how this owner's separate browser windows will be accounted for.
- [YouTube TV4K Plus features and conditions](https://support.google.com/youtubetv/answer/10383365?hl=en): in-home concurrent-stream options have plan/network/device conditions. Do not assume the owner's account or Chrome runtime qualifies, and do not buy or upgrade a plan in this task.
