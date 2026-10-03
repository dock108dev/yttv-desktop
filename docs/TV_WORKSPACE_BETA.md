# Q3-B1 — compact remote and organized TV workspace

**Paused by owner — 2026-10-03 EDT:** resume only on request.024 activation/retry is unconfirmed; follow [NEXT_TASK](../NEXT_TASK.md) for current-state observation, one-time activation if needed, explicit player recovery and the two-feed Add/Arrange check before the remaining four-player journey. No runtime work during pause.


**Current recovery checkpoint — 2026-10-03:**023 TV-area/start filled the requested area PASS OWNER_REPORTED. Owner then reports only NBC Add enabled after guide refresh, followed by Arrange failure “TV area or feed count is unavailable” and **0 /4 feeds**. Historical original tab is absent; two newer YTTV tabs exist but ownership/creation path is unqualified. No tab silently adopted or closed. Prepared **0.2.4 /1cdc745144268bcc**,116-test/typecheck/build/permission verification PASS: explicit existing-player choice when original missing, archived closed-original return record, no-playback/audio/movement during choice, useful missing-player error and disabled-channel explanations.023 retained. Installed repair NOT RUN; changed024 needs owner-only activation then Use this player → Start → Add/Arrange retry. [Evidence](evidence/runs/20261003-q3-b1-recovery/run.md). Two–four advancing, full controls/Return/stability and first-beta release remain OPEN; broader MVP separate; Prime/Netflix final deferred expansion.


**Current owner authorization — 2026-10-03:** approval of the muted workspace demonstration, existing-entry reload and native refresh are owner-confirmed complete. This supersedes earlier pending activation/approval instructions and the old paused-state baseline. Continue from the observed post-refresh state; no repeat approval/reload/refresh. Installed feature/count proof remains open. [Owner continuation](evidence/runs/20261003-q3-b1-r2/owner-continuation.md).

**Current engineering checkpoint — 2026-10-03:** prepared **0.2.2 /029d311113a6963f**, with **115/115 offline tests**, typecheck, production build/permission audit and docs PASS. Integrated remote → bridge → worker tests now cover four feeds, selected replacement, Close/reflow, native closure, reopen, restart and Return. Repaired Sports Replace, original/selected action labels, persistent feed numbers/selection, paused replacement labels and preservation of manual positioning. This is local fixture proof. The owner has now explicitly confirmed demonstration approval, extension reload and native refresh complete. Installed022 identity is to be recorded during the demonstration; workflow and advancing counts remain unqualified. Reobserve the current player after refresh instead of treating the old paused position as current. No repeat approval, reload or refresh is requested;109 current/retained candidate hashes matched in this review. [Repair and approved demonstration handoff](evidence/runs/20261003-q3-b1-r2/run.md).


**Owner clarification — 2026-10-03:** one compact remote must create and manage up to **four total YouTube TV player windows as one automatically arranged TV workspace**. Choosing content, Add/Replace/Close, feed selection/focus, Expand/Restore and reopening the workspace belong to that same remote. Manually opening four tabs and positioning their windows does not satisfy this requirement. The earlier named-channel trial and detailed owner questionnaire are superseded by this integrated product journey; this clarification does not grant playback or audio approval. [New lead handoff](LEAD_ENGINEER_HANDOFF.md).

**Retained021 evidence:** source and reconnect repair are complete in frozen **0.2.1 / 61a83fecdc9217c6**, with recorded113-test normal verification; installed identity is owner-confirmed. Remote has partial owner confirmation; installed arrangement, TV-area workflow, four-player control and advancing playback remain unqualified. Preserve021,020 and017 rollback. The [installed run](evidence/runs/20261003-q3-b1-installed/run.md) retains the technical baseline and earlier observations; it is evidence history, not the active owner script.

Updated 2026-10-03 EDT. **Status: TV-AREA/START OWNER-REPORTED PASS; MISSING-PLAYER RECOVERY LOCAL COMPLETE / INSTALLED RETRY OPEN.** Current source implements the four YTTV features; actual installed control/display/playback evidence remains unqualified. [NEXT_TASK](../NEXT_TASK.md) owns active work; [ROADMAP](ROADMAP.md) owns sequencing; [BACKLOG](BACKLOG.md) owns status.

## Scope and later expansion

R21–R24 are the four **YouTube TV first-beta** requirements. [R25 Prime/Netflix](MULTI_SERVICE_BETA.md) is now DEFERRED to the very last planned expansion after the first beta release and preceding planned work is completed or explicitly owner-deferred. It is not part of Q3-B1 delivery or a first-beta gate. No service adapters or additional service access are requested now.

## Delivery target

Deliver one integrated Chrome TV workspace: **one small remote creates and manages up to four total native YouTube TV player windows**, automatically arranged in a selectable monitor or rectangular TV area. The designated original player consumes one slot, leaving up to three extras; the remote consumes none. The owner chooses available content and an area through the remote, then gets a readable workspace without manually opening or positioning each player.

The user request authorizes local implementation and bounded count-specific installed qualification where the account and supported surfaces allow it. Preserve the current mute and paused-state boundary and owner-only extension management. Finish the complete local candidate before a combined permission/reload handoff. Do not split remote, tiling and feed-count implementation into repeated owner reloads or begin a provider/vendor planning exercise.

Candidate022 /029d311113a6963f completes the local integrated workflow repair with115-test verification. Owner explicitly reports demonstration approval, reload and native refresh complete. Proceed to the installed journey; record runtime identity in context and repair only concrete observed gaps. Do not repeat approval/reload/refresh. [Repair review](evidence/runs/20261003-q3-b1-r1/review.md).

Preserve original staged/unstaged work, preferences/cache/shortcuts, extension ID/storage, owner tabs, prior evidence and017 rollback. Observe current post-refresh playback/mute state before the approved demonstration. Owner-reported activation does not establish installed workflow/count proof. Continue without another reload, native-page refresh or standalone identity investigation.

## Required product behavior

### 1. Compact remote

Provide **Open remote** from the in-player control and extension toolbar. Open or focus one persistent extension popup window. Repeated activation must focus the existing remote rather than create duplicates. A normal action popup that disappears when a player receives focus is not the delivered remote.

Use a compact presentation of the existing guide/Sports bridge: current/selected feed, search, channel results, Watch/Previous, Add, feed focus, explicit audio selection, mute/volume, Arrange, TV area, Expand/Restore and Return original player. Keep large decorative headers and empty video placeholders out of the small remote. It must resize sensibly and preserve readable controls, visible keyboard focus and useful search results.

Make the current player selection and each action's destination clear. The owner must be able to select any managed feed and replace just that feed from the remote. Close removes an added feed; Return preserves the owner original. Keep a stable mapping from visible feed labels to actual player windows across replacement, closure, remote reopen and reconnect. Verify current Watch/Previous/Replace and Guide/Sports semantics, original-player special cases, freshness/recovery feedback and native-control fallbacks; these are review seams, not established installed defects.

Keep a small collapsible in-player launcher/control available. Collapse the full drawer while watching; opening the remote must not cover substantial player content. Do not turn a small remote into another full-size dashboard. Closing it leaves every playback window, guide state and audio choice intact. Reopening reconnects to the same workspace.

Remote open/close, focus, geometry and layout actions confer no audio authority. Expose **Focus feed** separately from **Select audio**. Continue the existing serialized mute-before-enable route only for an explicit audio action; the current owner mute hold prevents audible qualification.

### 2. Automatic readable arrangement

Arrange only the explicitly managed player windows within the chosen TV area. Default layouts are one full-area player, two balanced players using the area's aspect ratio, three as a larger selected/main player with two smaller players where readable, and four as a2×2 grid. Keep stable pane order and identity when adding, replacing or closing a feed. A layout may choose another deterministic arrangement when it fits better; disclose the preview before application.

Add and Close recompute arrangement while Auto arrange is enabled. Before reflow, surviving bounds are compared with last verified placement, including after worker restart. Manual changes turn Auto arrange off and retain positions; Arrange now or deliberate Auto arrange resumes placement. Include **Arrange now** and a clear way to keep manual positions. Do not repeatedly fight the owner's drag/resize. Expand temporarily uses the selected TV area, retaining the complete prior arrangement; Restore returns all affected bounds and selection. Arrange, Expand and Restore preserve player state and audio routing.

Use native supported player windows; do not embed, capture, proxy or reconstruct protected video. The target is a useful collection of arranged Chrome windows, not a promise of one composed video surface. Native borders/titlebars and the site's player layout remain relevant to fit. Do not promise a frame-free window, transparent desktop overlay, true native shell or always-on-top behavior.

### 3. Four total feeds

Retain one shared four-total ceiling in runtime and UI. A designated main consumes one slot, leaving at most three extras. Remote/selector windows consume none. Count pending creations as reserved slots so rapid Add actions cannot exceed the ceiling. Reconcile closed, detached or changed tabs before reporting count or creating another feed. Do not silently adopt or close unrelated YouTube TV tabs.

Retain fresh-target validation and muted-before-navigation creation. Replacement affects only the selected feed and does not allocate another long-lived feed. New feeds begin muted; saved layouts never restore audio authority. Fifth-feed attempts produce a clear limit result without altering the existing four. Account/browser/channel refusal preserves working feeds and reports that the requested feed could not play.

Four managed windows, four confirmed players and four simultaneously advancing feeds are distinct results. Existing two-feed evidence does not qualify three or four. Do not infer account allowance from four tabs being on one machine, from window creation succeeding, or from a general plan description. Existing playback elsewhere may consume the owner's service allowance; do not disrupt it or bypass restrictions.

### 4. Monitor or rectangular TV area

Offer **This screen**, an optional monitor picker, and **Choose area**. Monitor choice uses the display's usable work area. Choose area lets the owner drag a rectangle on a proportional diagram of the selected monitor, then review/apply it. Provide full-work-area reset and keyboard/numeric adjustment so drawing is not the only input method. The diagram is schematic and must not imply it is a captured desktop image.

Declare `system.display` as an optional permission if used. Request it only from a direct **Choose monitor** user gesture in the extension remote. Explain that it reads monitor names and placement for arranging these windows. Do not request it on startup or add capture/cookie or unrelated host permissions. Prime/Netflix access is deferred to the final post-beta milestone; current host access stays YouTube TV only. The permission decision remains with the owner; denial or unavailable display metadata keeps a working current-screen route with truthful limits. Use the current remote/player screen's available rectangle in the fallback; do not claim it enumerates or identifies all monitors.

Persist selected display/area and layout intent in extension storage with validated schema migration. Store a normalized rectangle relative to the work area together with enough identity/context to revalidate it. Do not persist raw playback URLs, transient navigation authority or a guarantee that a display ID survives reconnection.

## Implementation boundaries

### Reuse the current controller and session seams

`apps/chrome-extension/src/remote.tsx` uses the existing client bridge and worker-owned workspace/session state; `panel.tsx` and the in-player control remain supporting entry points. Review and extend these seams for concrete gaps rather than adding an independent remote state model. Keep guide/selector/player details in the existing browser bridge and adapter, and keep the in-player launcher compact.

`background.ts` owns current main/extra identities, creation, replacement, selection and audio serialization. Candidate021 uses the shared four-total ceiling; retain a single capacity contract rather than scattered guards. `packages/quadbox` models2/3/4 panes and shared geometry; keep count/capacity exposed in the snapshot instead of scattering numeric UI guards. Keep account availability distinct from the software ceiling.

### Put the original player in a dedicated managed window

Auto-layout must never resize the shared owner browser window containing unrelated tabs. On an explicit **Start TV workspace** action, move the existing designated main tab into a dedicated popup player window using its existing tab identity, without loading a new playback URL or replacing the program. Capture original window ID, tab index/pinned state, focus/bounds and relevant player/mute/volume state first.

Support **Return original player** using that same tab. Restore it to the original window/index when available; if that window legitimately no longer exists, return the same tab to a normal window and disclose the fallback. Preserve other tabs and window bounds. Never close the main as an extra feed. If main detachment cannot preserve the captured paused program/position, stop that path and report the capability failure; do not navigate to the same channel and label it restoration.

Tab/window moves, manual tab detachment, closure and reload must revalidate ownership. Session restore may reconnect to validated existing windows, but must not silently recreate feeds, replace the main or grant audio. Handle a user manually closing the main as a missing main; do not seize another owner tab without explicit selection.

### Separate geometry from sessions and audio

Retain and verify the existing pure geometry planner in `packages/quadbox/src/geometry.ts`, independent of Chrome calls, guide data, playback and audio. Its inputs include selected work area/TV rectangle, stable managed pane order, count, expanded state, gaps and readable minimum outer-window dimensions. Its output is planned bounds or an explicit too-small/unavailable result. Validate finite bounded numbers; support negative x/y, portrait/landscape areas and rounding without gaps extending outside the area.

The Chrome bridge applies planned bounds only to validated managed windows. Save the previous complete arrangement, normalize window state before sizing, and read back actual bounds after changes. Chrome/OS may clamp sizes or positions; compare requested/actual fit and readability rather than accepting a successful API acknowledgement as layout proof. Bound retries; avoid resize-event feedback loops. On partial application failure, restore affected windows where possible and report any remaining difference.

Use one documented coordinate system consistent with Chrome window/display observations. Do not multiply placement coordinates by devicePixelRatio indiscriminately. Account for monitor scale, OS work-area reservations, browser frame size and site minimum player layout. Learn or safely validate actual minimum window dimensions through readback. A TV area that cannot fit the requested count must offer enlargement/fewer feeds rather than overlap, inaccessible controls or silently rendering clipped players.

Refresh display metadata on topology changes and before applying a saved area. If a monitor disappears, keep/recover managed windows on an available area and show an actionable placement notice; never move unrelated windows or auto-navigate players. Revalidate saved normalized geometry against the new work area. Current-screen fallback lacks a complete topology and must retain that limitation.

## Focused tests and acceptance

The primary acceptance journey starts with one normal authorized YTTV player: open the remote, choose the TV area, start the workspace, use remote discovery/Add to reach the permitted count up to four, select and replace an extra, focus/expand/restore a feed, close one and observe automatic reflow, reopen the same remote with accurate remaining players, then Return the original. Use currently available content selected by the owner or engineer; no fixed channel names, tab IDs, raw playback timestamps or coordinate-reporting questionnaire are product requirements. Observe the actual players and complete workflow, with focused owner help only for inaccessible surfaces.

Add meaningful behavior tests, reusing current background/UI harnesses where possible:

- Pure layout1/2/3/4; aspect-ratio choices; negative coordinates; scaled/moved work areas; integer rounding; containment/nonoverlap; too-small areas and malformed saved geometry.
- Main-tab move/Return preserving identity and other owner tabs; vanished original window; already-dedicated main; failed move/readback and partial arrangement rollback.
- Singleton remote reopen/focus; remote close leaves all feeds; compact keyboard/search usability; focus-only actions produce no mute/unmute commands.
- Integrated remote actions across multiple feeds: Add, select, Replace, Close/reflow and reopen keep visible labels/count and actual player targeting coherent; exercise the original and extra-feed paths, not only a single mocked main.
- Four-total reservations under concurrent Add; fifth rejection; closure/replacement reconciliation; untouched unrelated tabs; fresh/cache guards; refusal preserves existing feeds.
- Permission requested only from the explicit monitor gesture; denial/revocation/unavailable metadata uses fallback; drag-to-work-area mapping and accessible rectangle adjustment; missing display recovery.
- Expanded full arrangement restoration, manual-versus-automatic sizing, stale callbacks and session reconnect without new playback/audio authority. Retain existing audio-failure and volume-recovery regressions.

Run normal verification after concrete source changes and prepare an exact source/test/bundle inventory plus the complete rollback bundle. Retain unchanged021's recorded verification without rebuilding merely to repeat it. Documentation-only work needs the lightweight documentation check; no verification count from the old candidate belongs to changed inputs.

Installed acceptance must report these criteria separately:

| Criterion | Required evidence |
| --- | --- |
| Integrated remote journey | The same compact remote creates and manages the complete workspace using the journey above; the owner does not manually open or arrange four independent tabs. Each selected action reaches the intended feed. |
| Remote | Persistent small window, singleton reopen, readable guide/Sports search, unobscured players, closing/reopening preserves sessions. |
| Main preservation | Same main tab before/after detach/Return, unrelated tabs/bounds unchanged, captured program/paused position/mute/volume confirmed or precise disclosed difference. |
| Geometry | Actual1/2/3/4 window bounds inside chosen area, readable native players, no overlap/clipping, Add/Close reflow, Expand/Restore, manual mode. A paused player can qualify geometry only. |
| Display/area | Available monitor picker and drawn rectangle or explicit current-screen fallback; requested/actual placement agrees. Real topology/scaling tests only where available. |
| Session ceiling | Main plus three extras maximum; fifth rejection; independent replacement/close; no extra sessions or unrelated tab takeover. |
| Playback count | Count-specific simultaneous advancing native-player observations at2/3/4 where permitted, distinct from window existence and preserved prior two-feed evidence. |
| Audio hold | Preserve the current observed paused/player-muted state and active owner audio hold; do not infer site/tab state from player mute. Geometry/session actions produce no unintended audio. Existing audible two-feed evidence remains historical. |

For bounded live qualification, use the now explicitly approved muted product demonstration. Owner reports existing-entry reload and native refresh complete; do not repeat activation or approval. Capture current post-refresh technical state internally. The approved demonstration may resume/replace original content and change its position, with no audio enable/transfer/volume change. Close only demonstration extras, Return the same original where supported and leave it paused/player-muted at its then-current position. No exhaustive owner checklist is required. Four advancing players require four actual advancing players: a paused original plus three advancing extras proves geometry and at most three advancing feeds.

Where permitted and safe, collect a short settled observation for each newly exercised count, then one10-minute observation at the highest functioning count. Record channel eligibility, per-player advancement/ready state, quality, loading/refusal, responsiveness and available aggregate resources. Stop increasing count on a service/account refusal or destabilization, close only newly created extras and preserve working playback. Do not invent formal per-feed performance from Chrome-wide samples. Reuse prior two-feed sustained evidence unless these changes produce a relevant regression.

Evidence must identify exact installed version/build/ID, source hashes, method/time/environment, permission state, logical work area and requested/actual bounds, controlled versus advancing count, mute/volume readbacks, and precise handback. Keep sanitized refusal/failure evidence and earlier runs. A local fake display or window fixture establishes local logic only. Update NEXT_TASK, ROADMAP, BACKLOG, START_HERE, evidence index and the Desktop pointer together; keep broader MVP/beta acceptance open until its separate criteria pass.

## Handoff and stop rules

Prepare any concrete repair and local review before asking for owner activation. Installed021 identity is already confirmed; no unchanged-candidate reload is indicated. If source changes require activation, combine the exact optional permission explanation and one existing-entry reload into a single concrete handoff. Owner performs extension management; preserve ID/storage and the confirmed Loaded from folder. No remove/reinstall, alternate extension-management workaround or clearing storage. A permission denial must not block the usable current-screen implementation.

Deliver working remote/arrangement/count controls or a specific observed capability refusal with the remaining criterion open. Do not claim the four-feed beta requirement is fulfilled if only four windows or local tests passed. Historical mute/refusal attribution stays documented; it is not a reason to reopen unrelated repair work. No API keys, sports provider acquisition, native/Safari/Windows port, publication, purchases, capture/protected playback workarounds or full release-hardening expansion are included.

## Primary implementation references

- [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows): supported create/move/resize methods, existing-tab creation, outer-window bounds, window state and committed bounds events. Actual continuity and size fit still require runtime evidence.
- [Chrome system.display API](https://developer.chrome.com/docs/extensions/reference/api/system/display): optional monitor metadata via `getInfo`, display bounds/work area and display-change notification. Do not use ChromeOS-only display-configuration/calibration methods on macOS.
- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions): optional permission declaration/request and direct user-gesture requirement; denial must be handled.
- [YouTube TV concurrent viewing](https://support.google.com/youtubetv/answer/7069119?hl=en): the general service describes up to three simultaneous devices. This does not define how this owner's separate browser windows will be accounted for.
- [YouTube TV4K Plus features and conditions](https://support.google.com/youtubetv/answer/10383365?hl=en): in-home concurrent-stream options have plan/network/device conditions. Do not assume the owner's account or Chrome runtime qualifies, and do not buy or upgrade a plan in this task.
