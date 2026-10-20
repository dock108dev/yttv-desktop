# Architecture

The runtime is a Chrome Manifest V3 extension over ordinary YouTube TV pages. Video stays in native player windows. The remote and page drawer receive snapshots through a validated bridge; they do not inspect protected streams. The separate fixture preview cannot play video.

## Module ownership

| Responsibility | Module | Callers |
| --- | --- | --- |
| Ordinary watch URL and target validation, program sanitation | `packages/core/src/index.ts` | Adapter, worker observation sanitation, guide cache, Sports |
| Native DOM observation, guide age/eligibility, Play/Pause and volume | `packages/yttv-adapter/src/index.ts` | Content bridge, worker, both interfaces |
| Four-total managed capacity and serialized audio handoff | `packages/quadbox/src/policy.ts`, `index.ts` | Worker Add/Connect/audio, interface controls |
| Preferences/history/layout sanitation and serialized load/save | `packages/storage/src/index.ts` | Worker, Guide ordering, fixture preview |
| Cached presentation metadata without navigation authority | `packages/storage/src/guide-cache.ts` | Worker |
| Guide Sports classification and illustrative fixture states | `packages/sports-engine/src/guide.ts`, `index.ts` | Interfaces and worker program guards |
| Managed identity, privileged commands and cancellation | `apps/chrome-extension/src/background.ts` | Validated bridge commands and browser events |
| Bridge observation sanitation and volatile guide merging | `apps/chrome-extension/src/observations.ts` | Worker-selected sources |
| Reversible enrollment/Return, placement and readback | `apps/chrome-extension/src/workspace.ts`, `packages/quadbox/src/geometry.ts` | Worker and display-area selection |
| Durable ownership/geometry backup | `apps/chrome-extension/src/recovery.ts` | Worker and workspace |
| Bounded native guide discovery helper | `apps/chrome-extension/src/guide-sync.ts` | Worker |
| Remote rendering, shared drawer state and stateless components | `apps/chrome-extension/src/remote.tsx`, `packages/ui/src/index.tsx`, `components.tsx` | Extension entry points and fixture preview |
| Context lifecycle and build/permission audit | `apps/chrome-extension/src/runtime.ts`, `scripts/build.mjs` | Content/panel/worker entries and npm commands |

## Authority and state

The worker serializes managed operations. Pane ownership binds tab/window identity; native controls additionally bind document and player identity before and after readback. Source replacement, navigation, explicit controls and removal cancel obsolete startup/recovery work. Splitting this coordinator into handlers sharing mutable maps would obscure authority and cancellation ordering; independent transformations live outside it.

Targets must be ordinary allowlisted watch URLs with matching channel identity, current LIVE evidence and guide/target ages within 30 minutes. Cached or unchanged hidden guide nodes cannot renew authority. Program actions also revalidate title and observation time. A current guide listing does not establish a game is in progress.

The volatile catalog retains at most 500 rows, including observed ages when source windows close. The durable guide cache contains sanitized presentation metadata only. Native discovery uses an inactive muted Live helper with a 15-second deadline, request coalescing, cooldown and exact cleanup ownership. A helper moved or navigated elsewhere is left alone.

Added players are muted before navigation and attempt native startup once. Play/Pause clicks a unique native button and checks the same player for up to four seconds; it never calls `video.play()` behind the site control. Volume preserves mute. Audio enable uses serialized mute-all-before-enable-one with compensation on failure. Focus and geometry commands carry no audio-enable authority.

## Persistence and recovery

Version 1 preferences store history, channel customization, shortcuts and saved layout intent. Confirmed channel switches alone advance history. Legacy event/layout identifiers remain readable but grant no playback authority; the retired mute-lock field sanitizes to false and cannot be set through commands.

Session records and durable local backups recover known owned windows, Return information and geometry. Recorded ordinary page URLs verify identity, never become eligible guide targets. Recovery observes current audio routing rather than replaying saved enable or mute commands. Missing or changed tab identities require explicit Connect; no unrelated tab is silently adopted or given historical Return authority.

The additive `yttv-desktop.workspace-layout.v1` record stores only version and allowlisted mode (`auto` or `top-bottom`), sanitized by storage. The area schema remains unchanged. Quadbox owns deterministic pair geometry shared by preview and execution; one fills and three/four use legacy automatic geometry while remembering the pair choice. Worker-owned ordering is original first, then the persisted added/connected identity order; channel replacement keeps identity and never reassigns a slot.

`APPLY_TOP_BOTTOM` is validated and serialized by the worker. It requires exactly two connected identities and a monitor-bound area, preflights geometry and any existing dedicated windows, and uses the original continuity/enrollment path when needed. It never adopts an unassigned player or creates a second playback tab. Fixed-mode Add preflights the prospective layout before creating its usual muted player. Monitor identity and the saved logical work area must still match; missing access, changed work areas or missing monitors require deliberate area confirmation, without legacy display fallback. Auto keeps the existing fallback behavior. No new permission is introduced.

Workspace bounds are applied transactionally with readback and rollback. Manual placement stays manual. Return uses supported original placement or reports a normal-window fallback when the former parent is unavailable. Storage writes and physical browser changes are separate operations, so a failed command does not imply a complete rollback.

## Limits

Four managed windows is a software bound independent of account playback allowance. Readback, counts and advancing clocks cannot establish visible video or heard sound. Capability failures retain native fallback. Safari/macOS and event-resolver packages are non-executable placeholders; other services and independent scores are unsupported. There is no backend, account sync, protected-stream composition or remote telemetry.
