# Q3-B1 — mixed-service TV workspace

Updated 2026-10-03 EDT. **Status: READY PLAN / NOT IMPLEMENTED.** The owner expanded the active beta goal to four total feeds across **YouTube TV, Prime Video and Netflix**. This companion extends [TV_WORKSPACE_BETA](TV_WORKSPACE_BETA.md); its compact remote, automatic arrangement and monitor/custom TV-area requirements remain. [NEXT_TASK](../NEXT_TASK.md) owns the active task. No service access, account capability, extension permission or installed mixed-service playback is established by this plan.

## Delivery target

Deliver one Chrome workspace containing up to **four enrolled native web-player tabs total**, in any supported service combination. For example, two YouTube TV players, one Prime Video player and one Netflix player occupy all four slots. The remote and area selector occupy no playback slots. This is a shared four-feed ceiling, not four feeds per service.

The first integration is **Add existing player tab**. The owner opens each service, signs in through its ordinary page, chooses an entitled title/channel and starts or pauses its native player. The workspace then enrolls that explicitly selected tab, arranges it and presents available controls. No API key, catalog account, local service, cross-service sign-in flow or independent movie/TV catalog is needed.

Keep playback in the original supported Chrome pages. Native desktop applications, embedded protected players, a composed video surface, screen capture, DRM extraction and media proxies are outside this task. The services continue to own authentication, entitlements, account limits, captions, ads, seek, episode selection, purchases and playback quality.

Retain the installed v0.1.17 baseline, existing extension ID/storage, rollback, preferences, source and uncommitted work. Preserve the current site/tab mute and paused-program boundary. Capture actual current state before runtime work; a historical handback is not a current observation. Preparing these additions does not authorize audio enable/transfer or navigation that cannot restore the preserved program/position.

## Owner flow

1. Open the compact remote and choose **Add existing player**.
2. Choose YouTube TV, Prime Video or Netflix, then select a specific eligible tab with a service badge and a truthful title/status label.
3. Review enrollment and any deliberate service-access request. If no eligible tab exists, provide **Open service** and brief native-page instructions. Opening the service homepage is not proof of a selected title, sign-in or playback.
4. Enroll the same tab into a dedicated managed window, preserving its player and capturing its return location. Arrange it in the selected TV area without granting audio authority.
5. Add or remove feeds up to the shared limit. Auto arrange, Arrange now, manual positioning, Expand/Restore, monitor selection and rectangle selection apply equally across services.
6. **Remove from workspace / Return tab** returns an owner-supplied tab to its captured location without closing or navigating it. Keep intentional **Close player** distinct where offered. Closing the remote leaves every player intact; reopening reconnects to the same workspace.

Never silently adopt an unrelated owner tab, close it as a test extra or resize a shared window containing other tabs. Enrollment requires explicit selection. A service homepage, login page, purchase page or title-detail page without a supported player is not an active feed. It may remain a pending selection with clear instructions, but does not receive a false playing/ready label.

YouTube TV retains its existing Guide/Sports search and validated Watch/Add route. Netflix and Prime Video initially use native content selection. They do not inherit YouTube TV channel navigation, Previous semantics, live-guide cache or event mapping. A service-specific action appears only where its capability is supported.

## Service and session boundaries

Introduce a service-neutral managed-feed/session contract rather than making every pane a YouTube TV channel. Each enrolled feed has a service ID, stable workspace feed ID, tab/window identity, lifecycle state, sanitized presentation label and current capability results. The designated original player consumes one slot. A service-neutral selection is independent of audio selection.

Keep `packages/yttv-adapter` and the restricted YouTube TV `PlaybackTarget` validation intact. Do not loosen its origin/path/freshness checks to accept arbitrary streaming URLs. Add separate Prime Video and Netflix adapters behind a common capability interface, with their selectors and page details isolated. Shared geometry, session ownership, capacity and tab-mute routing must not depend on service-specific DOM selectors.

Capability detection is independent for each service/player instance:

- Player readiness and observed advancement.
- Presentation title and supported position observation.
- Native player mute and volume control/readback/recovery.
- Play/pause and any supported seek action.
- Native control availability and explicit fallback.

An attached tab may be arranged even when some native controls are unavailable. The remote must identify that limit and offer **Focus player / Use native controls**. An unavailable volume capability must not display a successful numeric readback or reuse YouTube TV's recovery status. Unknown title, mute, position or readiness remains unknown. An adapter must not declare playback from a tab title, page URL, successful command acknowledgement or a detected video element alone.

Rebind observations and pending actions to tab, document/player identity and command epoch. Navigation, title/episode change, reload or player replacement invalidates stale callbacks. A late success must not overwrite a newer choice or clear an unrelated failure. Keep each service's failure/readiness state scoped to its feed.

Persist validated layout and TV-area intent separately from playback authority. Session reconnect may validate existing tabs/windows and their observed service; it must not reopen titles, sign in, navigate, recreate missing players or restore audio authority. Do not persist credentials, cookies, signed playback/media URLs or reusable target authority. Preserve existing YouTube TV preferences/history through a versioned migration; namespace service-specific presentation and settings.

## Same-tab enrollment and restoration

Before moving a selected owner tab, capture its original window/index/pinned state, window bounds/focus and observable title, paused state, position, mute and volume. Use a supported same-tab move into a dedicated player window. Do not reload or navigate to detach it. Keep unrelated tabs and their window bounds untouched.

Confirm tab identity and player continuity after move. If detachment changes the title/position/player unexpectedly, stop that enrollment path and report the precise failure. Returning to a title or channel is not equivalent to preserving its original position. Do not seek, replay or skip ads merely to manufacture a restoration result.

Return the same tab to its original window/index when that location remains available. If the original window has legitimately gone away, return the tab to a normal window and disclose the fallback. Restore captured native state only through supported confirmed controls; disclose any unavailable observation or restoration difference. Removal of an attached owner feed is reversible by default. Close only deliberately created test tabs during qualification.

Manual tab moves, origin changes and closures revalidate ownership. A player that leaves its supported service loses service control authority until a fresh explicit eligible selection. Do not seize another tab to replace a missing feed. Window/remote lifecycle and geometry actions preserve native player state and do not change audio.

## Shared audio isolation

Use confirmed Chrome tab mute as the common isolation layer across enrolled services. Distinguish tab mute, native player mute and unknown site mute. Service adapters may additionally use supported native controls; absence of a native readback does not justify guessing it or unmuting a player.

Continue serialized mute-before-enable ownership only for a deliberate audio action, with one selected audio feed and no unintended overlapping managed audio. Confirm the managed feeds are isolated before granting the next feed audio. A refusal preserves safe state and gives a native-control fallback. New extension-created players are muted before navigation. Enrollment captures existing choices and never silently enables audio.

Opening/focusing the remote, focusing a player, attaching/returning a tab, Add/Remove, tiling and Expand/Restore grant no audio authority. Saved layouts never restore audio authority. During the current owner mute hold, keep site/tab mute active and perform no enable/transfer; local tests may verify routing logic, but heard audio remains unqualified until the owner deliberately permits it.

## Service access and permissions

Prepare an exact permission/injection diff for review before activation. Add service access through a direct deliberate activation/attachment action, with optional access and a usable denial result. Do not request blanket all-sites access or silently expand startup permissions. If using `activeTab`, document its per-tab grant and lifetime limits rather than implying persistent service access. If dynamic injection/registration requires `scripting`, include that named permission and reason in the same review.

Select the exact supported player hostname(s) from the owner's observed intended service page. Prime Video can be served by `primevideo.com` or a regional Amazon storefront; do not infer this owner's origin, region, account or sign-in state. Scope Amazon access to the specific required player host, not arbitrary Amazon domains, account pages or unrelated shopping tabs. Browser host access cannot always be narrowed by a URL path; describe its actual extent honestly.

No cookie, credential, authentication extraction, media/CDN, capture or protected-stream permission belongs in this milestone. An unsupported cross-origin player produces a capability refusal until an exact necessary permission change is reviewed; it is not a reason to grant arbitrary domains.

Finish the integrated local candidate, optional display/service permission explanation and rollback before one combined owner activation/reload handoff. Extension management stays owner-only. Preserve the existing entry, ID, storage and confirmed Loaded from folder; no remove/reinstall, duplicate entry, storage clearing or alternate extension-management workaround.

## Capacity and failure handling

Use one shared ceiling of four enrolled feeds, including pending creations/enrollments. Rapid requests cannot create a fifth. Remote/selector windows do not count. Reject the fifth without altering the existing four. Reconcile closed/moved tabs before reporting capacity.

The software ceiling and service allowances are separate. Existing playback elsewhere may consume account capacity. Never infer allowance from tabs sharing one machine, window creation success, general plan documentation or another service's successful feed. Do not buy an upgrade, sign into a different account, stop unrelated playback or bypass a restriction to reach four.

A refused Prime title, Netflix concurrency error, expired sign-in, closed tab, blocked adapter or arrangement failure is scoped to that feed. Retain unaffected playback, position and audio choices. Preserve the prior complete arrangement for bounded rollback after partial placement failure. Show service and action-specific failures with a native fallback, and avoid an endless retry/creation loop.

Four enrolled handles, four ready players and four simultaneously advancing players are separate verdicts. A paused preserved main plus three advancing extras is not a four-active pass. Report service mix as well as total count.

## Focused verification and installed evidence

Reuse the original Q3-B1 geometry/remote/TV-area tests. Add meaningful mixed-service tests for neutral identity and migration, explicit eligible-tab selection, same-tab enrollment/return, capability denial, exact permission gating, stale document/player actions, mixed-service shared-capacity reservations, fifth rejection, cross-service failure isolation, native-control fallbacks and tab-mute ordering. Retain the existing YouTube TV target/audio/volume regressions.

Run normal verification on the complete resulting source, including preserved newer uncommitted inputs. Freeze an exact source/test/bundle inventory and rollback. Old 102-test evidence qualifies its retained candidate only.

After one complete candidate and any owner activation/reload, bind installed version/build/extension ID. Use restorable or owner-approved disposable contexts and the active mute hold. Qualify a real player from each requested service separately before mixed three and mixed four, where account/title/browser capability permits. Then observe the highest functioning mixed count for the bounded sustained period in TV_WORKSPACE_BETA. Stop increasing count on a service/account refusal or destabilization; preserve the working feeds.

Record the services and observed player count, requested/actual window bounds, readiness/advancement, quality where exposed, native/tab mute distinctions, supported versus native-fallback controls, controller reopen, Add/Remove reflow, Expand/Restore, TV-area selection and same-tab return. Reuse prior evidence in its exact scope. Local mocks establish logic, not cross-service playback, accounts or quality. Aggregate Chrome resources do not establish per-service attribution.

Deliver separate verdicts for remote/layout/area, YouTube TV regression preservation, Prime integration, Netflix integration, shared four-feed capacity and each observed mixed playback count. Missing credentials/access, unavailable title/control, actual concurrency refusal or protected-page limitation remains an explicit open criterion. Update the main specification, usage instructions, evidence and canonical trackers together. Full MVP/beta acceptance stays open until its own criteria pass.

## Primary references

These official pages were reviewed for this planning scope on 2026-10-03. They support native browser eligibility and service-specific limits; they do not establish this owner's account, Chrome session, regional title entitlement, simultaneous-window accounting or adapter support.

- [Netflix supported browsers and system requirements](https://help.netflix.com/en/node/30081): supported computer browsers and platform/quality requirements. Native playback eligibility does not qualify extension controls.
- [Netflix Plans and Pricing](https://help.netflix.com/en/node/24926): simultaneous viewing is plan-dependent. Do not assume the owner's plan or equate a window with a device.
- [Amazon Prime Video Usage Rules](https://www.primevideo.com/help?nodeId=G202095500): restrictions vary by title access type, same-title use, region and add-on subscription; different storefronts are supported entry points. Do not collapse these into one unconditional feed allowance.
- [Prime Video — Watch on Your Computer](https://www.primevideo.com/help?nodeId=GUX9FYHU5D8LC9EJ): supported native computer browser viewing. Observe the actual intended player origin before requesting service access.
