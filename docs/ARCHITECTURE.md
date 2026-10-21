# Architecture

The runtime is a Chrome Manifest V3 extension over ordinary YouTube TV pages. Video stays in native player windows. The remote and page drawer receive snapshots through a validated bridge; they do not inspect protected streams. The separate fixture preview cannot play video.

## Module ownership

| Responsibility | Module | Callers |
| --- | --- | --- |
| Ordinary watch URL and target validation, program sanitation | `packages/core/src/index.ts` | Adapter, worker observation sanitation, guide cache, Sports |
| Native DOM observation, guide age/eligibility, Play/Pause and volume | `packages/yttv-adapter/src/index.ts` | Content bridge, worker, both interfaces |
| Four-total managed capacity, supported show counts and serialized audio handoff | `packages/quadbox/src/policy.ts`, `index.ts` | Worker Add/Connect/recovery/audio, geometry, command validation, storage, interface controls |
| Preferences/history/layout sanitation, editable patch merging and serialized load/save | `packages/storage/src/index.ts` | Worker, Guide ordering, fixture preview |
| Cached presentation metadata without navigation authority | `packages/storage/src/guide-cache.ts` | Worker |
| Guide Sports classification and illustrative fixture states | `packages/sports-engine/src/guide.ts`, `index.ts` | Interfaces and worker program guards |
| Managed identity, privileged commands and cancellation | `apps/chrome-extension/src/background.ts` | Validated bridge commands and browser events |
| Default startup channel selection | `apps/chrome-extension/src/default-channel.ts` | Worker New show, shared native eligibility policy |
| Bridge observation sanitation and volatile guide merging | `apps/chrome-extension/src/observations.ts` | Worker-selected sources |
| Reversible enrollment/Return, placement and readback | `apps/chrome-extension/src/workspace.ts`, `packages/quadbox/src/geometry.ts` | Worker and display-area selection |
| Monitor drawing window, ownership and coordinate preparation | `apps/chrome-extension/src/area-picker-session.ts`, `area-picker.ts`, `area-selection.ts` | Worker and remote layout setup |
| Durable ownership/geometry backup | `apps/chrome-extension/src/recovery.ts` | Worker and workspace |
| Bounded native guide discovery helper | `apps/chrome-extension/src/guide-sync.ts` | Worker |
| Remote rendering, shared drawer state and stateless components | `apps/chrome-extension/src/remote.tsx`, `packages/ui/src/index.tsx`, `components.tsx` | Extension entry points and fixture preview |
| Shortcut drafts, validation, focus lifecycle and diagnostic display | `packages/ui/src/shortcuts-dialog.tsx` | Shared drawer through explicit save/close callbacks |
| Context lifecycle and build/permission audit | `apps/chrome-extension/src/runtime.ts`, `scripts/build.mjs` | Content/panel/worker entries and npm commands |

## Authority and state

The worker serializes managed operations. Pane ownership binds tab/window identity; native controls additionally bind document and player identity before and after readback. Source replacement, navigation, explicit controls and removal cancel obsolete startup/recovery work. Splitting this coordinator into handlers sharing mutable maps would obscure authority and cancellation ordering; independent transformations live outside it.

Capacity comes from quadbox's `CURRENT_MANAGED_FEED_LIMIT`, `MANAGED_FEED_COUNTS`, `isManagedFeedCount` and `canAddManagedFeed`. Geometry, drawing commands, custom-position storage, recovery and the remote use these shared rules. Version 1 saved QuadBox records retain their original four-pane schema bound separately from runtime capacity.

The worker keeps one `createPreferencesStore` instance for both reads and serialized writes. The worker and fixture preview apply editable changes through storage's `patchPreferences`: partial UI edits preserve other UI choices, and patches cannot replace confirmed current/previous/recent history or schema. The worker reapplies a saved patch to the latest observed state so a completed write does not erase newer confirmed history.

Targets must be ordinary allowlisted watch URLs with matching channel identity, current LIVE evidence and guide/target ages within 30 minutes. Cached or unchanged hidden guide nodes cannot renew authority. Program actions also revalidate title and observation time. A current guide listing does not establish a game is in progress.

The volatile catalog retains at most 500 rows, including observed ages when source windows close. The durable guide cache contains sanitized presentation metadata only. Native discovery uses an inactive muted Live helper with a 15-second deadline, request coalescing, cooldown and exact cleanup ownership. A helper moved or navigated elsewhere is left alone.

Added players are muted before navigation and attempt native startup once. Play/Pause clicks a unique native button and checks the same player for up to four seconds; it never calls `video.play()` behind the site control. Volume preserves mute. Audio enable uses serialized mute-all-before-enable-one with compensation on failure. Focus and geometry commands carry no audio-enable authority.

The remote's `NEW_SHOW` command chooses the last confirmed channel when eligible, otherwise the first fresh native live listing (`default-channel.ts`). With no original, the worker creates a blank popup, confirms browser mute, and loads the native Live page. A bounded observation-driven startup selects a fresh watch target and then uses the same single native Play request as added players. Repeated clicks coalesce during first startup. Explicit controls, changed navigation/identity, closure or timeout end that attempt. Session records remember that the original was created here so an explicit retry can reuse its Live window; waiting startup itself is never restored. Existing players' content and audio are preserved.

## Persistence and recovery

Version 1 preferences store history, channel customization, shortcuts and saved layout intent. Confirmed channel switches alone advance history. Legacy event/layout identifiers remain readable but grant no playback authority; the retired mute-lock field sanitizes to false and cannot be set through commands.

Session records and durable local backups recover known owned windows, Return information and geometry. Recorded ordinary page URLs verify identity, never become eligible guide targets. Recovery observes current audio routing rather than replaying saved enable or mute commands. Missing or changed tab identities require explicit Connect; no unrelated tab is silently adopted or given historical Return authority.

Added windows outside an enrolled workspace retain native maximize/restore, while enrolled windows use workspace geometry and Return records. These are supported lifecycle cases, so their recovery data and native fallback remain in place.

The `yttv-desktop.workspace-layout.v1` record stores version, an allowlisted layout mode, and optional normalized custom positions keyed by show count (1–4), sanitized by storage. Existing Auto/Top-bottom records remain readable and the area schema is unchanged. Quadbox owns shared preset/custom geometry for one to four shows. Custom positions are normalized to the monitor work area and stored independently for each count; missing custom counts use an explicitly described Best fit fallback. Worker-owned ordering is original first, then the persisted added/connected identity order; channel replacement keeps identity and never reassigns a slot.

`APPLY_LAYOUT` is validated and serialized by the worker for one to four connected identities. It preflights geometry and dedicated windows, then uses the original continuity/enrollment path when needed. Layout changes save through `SET_TV_AREA` or the owned drawing window, both calling `workspace.setArea`; fixed and custom modes share validation and persistence. `ARRANGE` reapplies the saved plan. These paths never adopt an unassigned player or create a second playback tab. Fixed-mode Add preflights the prospective layout before creating its usual muted player. Monitor identity and the saved logical work area must still match; missing access, changed work areas or missing monitors require deliberate area confirmation, without legacy display fallback. Auto keeps the existing fallback behavior. The drawing window uses existing extension permissions.

The worker owns the temporary `area-picker.html` drawing window through `area-picker-session.ts`. It opens a normal monitor-sized extension popup, with no capture or playback access. Pointer screen coordinates select actual logical bounds; `area-selection.ts` prepares geometry shared with preview/execution. Picker reads/saves/cancel bind the exact extension page and owned tab/window. Closing or cancelling leaves saved placement alone; saving goes through the worker’s existing workspace transaction. A repurposed/shared picker window is left alone. The temporary picker is not a managed feed and an expired picker asks the user to reopen it. Custom saves retain the full selected-monitor coordinate frame. Cleanup removes only its owned tab. The drawing panel can move between top and bottom and fades during a drag.

Layout saves validate the selected planned count separately from the current player count. A plan can be retained with no players, or when a different current count cannot fit, without moving windows or treating the saved plan as a failure. Saving during first-show startup also retains the plan for later Arrange.

Workspace bounds are applied transactionally with readback and rollback. Manual placement stays manual. Return uses supported original placement or reports a normal-window fallback when the former parent is unavailable. Storage writes and physical browser changes are separate operations, so a failed command does not imply a complete rollback.

## Limits

Four managed windows is a software bound independent of account playback allowance. Readback, counts and advancing clocks cannot establish visible video or heard sound. Capability failures retain native fallback. Safari/macOS and event-resolver packages are non-executable placeholders; other services and independent scores are unsupported. There is no backend, account sync, protected-stream composition or remote telemetry.

## UI structure

The shared UI entry coordinates bridge snapshots, surface navigation, replacement selection and keyboard dispatch. The shortcut dialog owns its temporary drafts, validation and focus lifecycle; saving remains in the bridge/storage path.

The shared stylesheet supplies the drawer and fixture interface as one ordered cascade, including later container-query overrides. Preserve that order when changing or extracting styles so narrow-drawer behavior remains consistent.
