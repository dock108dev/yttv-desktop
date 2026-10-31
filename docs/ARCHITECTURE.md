# Architecture

The runtime is a Chrome Manifest V3 extension with a React remote and an isolated page drawer. Video, sign-in and account controls remain in native provider windows. The separate loopback fixture preview has no playback or account integration. There is no backend, account sync, protected-stream composition or remote telemetry.

## Module ownership

| Responsibility | Authoritative module | Callers |
| --- | --- | --- |
| Ordinary URL/content validation and shared contracts | `packages/core/src/index.ts`, `media.ts` | Adapters, storage, queue and worker |
| Native DOM identity, guide eligibility and player controls | Service adapter packages | Content bridges and worker |
| Capacity and audio transfer | `packages/quadbox/src/policy.ts`, `index.ts` | Worker, geometry, validation and UI |
| Layout planning | `packages/quadbox/src/geometry.ts` | Workspace, remote and monitor drawing |
| Preferences, history and layout sanitation | `packages/storage/src/index.ts` | Worker IPC and fixture preview |
| Mixed queue persistence | `packages/storage/src/media-queue.ts` | Mixed workspace |
| Pure queue edits, claims and consumption | `packages/quadbox/src/queue.ts` | Mixed workspace and preview |
| Browser identities, mutations and cancellation | `apps/chrome-extension/src/background.ts` | Extension commands and browser events |
| Queue launch and recovery coordination | `apps/chrome-extension/src/mixed-workspace.ts` | Worker |
| Optional-provider content transport | `apps/chrome-extension/src/provider-content.ts` | YouTube, Prime Video and Netflix content entries |
| Optional-provider document/slot connections | `apps/chrome-extension/src/provider-connection.ts` | Service configurations and worker |
| Observation sanitation and retained guide | `apps/chrome-extension/src/observations.ts` | Worker |
| Cached guide presentation | `packages/storage/src/guide-cache.ts` | Worker |
| Temporary native guide discovery | `apps/chrome-extension/src/guide-sync.ts` | Worker |
| Placement, enrollment and Return | `apps/chrome-extension/src/workspace.ts` | Worker |
| Durable recovery and stored bounds | `apps/chrome-extension/src/recovery.ts` | Worker and workspace |
| Static diagnostic counters and log sanitation | `apps/chrome-extension/src/diagnostics.ts` | Worker and lifecycle |
| Monitor drawing and coordinate preparation | `area-picker-session.ts`, `area-picker.ts`, `area-selection.ts` in the Chrome app | Worker and drawing window |
| UI rendering and snapshot subscription | `packages/ui/src`, Chrome `remote.tsx` | Drawer, panel, remote and fixture preview |
| Manifest permissions and bundled entries | `scripts/permission-audit.mjs`, `scripts/build.mjs` | Build and CI |

## Browser authority and audio

The worker serializes managed operations. Ownership binds tab/window identity; native controls also bind document/player identity before dispatch and after readback. Navigation, source replacement, removal and explicit controls cancel obsolete startup or recovery work. Unknown identities never acquire authority through a cached listing or a saved layout.

Quadbox's four-total limit includes owned tabs and pending or uncertain creation. Account concurrency is independent. Focus and geometry never enable audio. New and replaced players are muted before navigation. Explicit audio enable mutes all managed players before enabling the selected one, requires readback, and attempts compensation on failure. Volume changes preserve mute. Native controls remain the fallback when a provider cannot establish capability.

YouTube TV startup uses a fresh native live listing and makes one native Play request. Guide discovery uses an inactive browser-muted helper with a 15-second deadline, coalesced requests and cooldown. Only its exact owned tab is cleaned up; a moved or repurposed tab is left alone. Watch targets must be ordinary allowlisted URLs, match channel identity and have live guide/target observations no older than 30 minutes. Cached metadata cannot renew navigation authority.

## Queue and persistence

Queue edits do not launch playback. A manual launch saves a claim before browser creation, persists ownership before navigation, verifies matching readiness and durably records consumption before requesting Play once. Browser creation runs outside the serialized mutation section; completion re-enters with operation, generation and worker-epoch guards. Distinct tabs and unbound claims count toward capacity, without counting a bound claim twice. There is no automatic queue advancement or restart playback.

Cancellation revokes pending work but retains uncertain resources until exact cleanup or explicit closed-window confirmation. Failed cleanup still consumes capacity. Replacement keeps the selected slot, tab, geometry and legitimate Return lineage. A provider that cannot report native volume cannot safely be replaced out of its slot; close its native window instead.

Preferences use a serialized store. Live edits from both IPC and preview use storage-owned validation and patch merging. Confirmed switches alone update current/previous/recent channel history. Cached guide data contains presentation metadata, never watch targets. Mixed queue records use a separate bounded versioned envelope; unreadable or newer records remain read-only rather than being reset.

Session records and durable local backups recover known ownership and geometry. Recovery observes audio without replaying enable/mute, Play or navigation. Changed browser IDs require explicit Connect and cannot inherit historical Return authority. Legacy saved-layout identifiers remain readable, but saved targets and the retired mute-lock field grant no control authority. Browser mutations and storage writes are separate operations, so a failure does not imply complete rollback.

## Layout and drawing

Geometry, storage, command counts and UI share quadbox's supported one-to-four-show counts. Layouts include Best fit, stacked, side by side, grid, larger-main and custom positions. Custom rectangles are normalized to a selected monitor work area and saved separately per show count. Missing custom positions use a labeled Best fit fallback. Fixed layouts require the selected monitor and matching work area.

The monitor drawing page is a temporary extension window, not a screen capture or transparent desktop overlay. Its commands bind the exact owned page/tab/window. Cancel leaves saved intent unchanged; save uses workspace placement with readback and rollback. A valid layout can be saved with no players or a different current count without moving windows. Explicit Arrange applies it later.

With an enrolled workspace or explicit layout, Expand/Restore uses workspace geometry. In Best fit without enrollment, added players use native maximize/restore; the original requires enrollment. Return uses captured original placement or reports a normal-window fallback. Windows shared with unrelated tabs are not silently rearranged.

## Provider integration

Each adapter implements the service/content/capability/observation contracts in `core/media.ts`. URL recognition, identity, readiness and individual controls are separate capabilities. An ordinary URL or visible video alone cannot prove main-content identity, entitlement or audible output.

- **YouTube TV:** native guide and player DOM drive channel navigation and supported controls. Selectors stay in `packages/yttv-adapter`; the content bridge also owns drawer and native-volume notifications.
- **YouTube:** ordinary watch identity and supported controls use `packages/youtube-adapter`. Ads/loading/unknown identity cannot consume queue intent. Live content does not report on-demand completion. DOM assumptions are fixture-tested, not a stable provider API or proof of live playback.
- **Prime Video and Netflix:** URL recognition, optional permissions and native attention-window lifecycles exist. Main-content/episode identity, readiness, Play/Pause, native mute/volume and completion remain unavailable. Connect refuses adoption, queue items stay pending, and shared audio enable is blocked when mute readback is unknown. Adapters do not guess selectors or inspect private provider state.

Optional providers share top-frame installation, protocol namespaces, sender/nonce checks and rebind invalidation. Pending replies keep their request nonce across rebinding. Worker connections additionally check permission, current URL, browser document, tab/window, player key, monotonic observations and slot generation. Lost access revokes control but retains intent and uncertain capacity. See [usage](../START_HERE.md#regular-youtube) for accepted link forms and [security](SECURITY.md#optional-access) for exact permissions.

## Structural constraints

Keep the worker's original-player identity, volume epochs, first-start cancellation and browser callbacks under one serialized coordinator. Further extraction needs explicit state/port interfaces; independently stateful handlers or shared writable maps would hide cancellation and commit ordering. Pure sanitation, geometry, provider transport and queue policy belong in their existing modules.

The shared UI keeps surface selection, keyboard dispatch and focus-sensitive controls together; snapshot subscription and shortcut drafts have separate owners. UI tests share a controlled DOM lifecycle. The stylesheet is an ordered cascade with later responsive overrides used by both drawer and preview; component extraction must preserve that order and scope.

Safari/macOS and event-resolver workspaces are non-executable placeholders. Independent sports scores, arbitrary provider embedding, stream interception and DRM bypass are not implemented.
