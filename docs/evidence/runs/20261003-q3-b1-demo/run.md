# Q3-B1 installed usability failure and bounded setup repair

2026-10-03 EDT. Evidence classes: DEVICE / LIVE_NATIVE_PLAYER_OBSERVATION; owner remote actions pending. Prepared frozen candidate0.2.2 /029d311113a6963f retains its recorded115-test offline verification and109-hash completion review; no rebuild or test rerun. Installed022 identity is not yet independently recorded. Existing uncommitted work, bundles, extension ID/storage and unrelated tabs are preserved.

## Current post-refresh baseline

CUA browser inventory and supported original-player accessibility/DOM observation at approximately11:46–11:48 EDT identified the existing original tab1593754394 and already-open remote1593754473, extension ID idaaiiafgopfpaojpnhaoefbefllioab. Only one native YTTV player tab was present; no demo extras were created by the agent. No extension page was inspected, and no alternate native/worker/storage inspection was attempted. No Reconnect, reload or native refresh was used.

Current original displayed **The Point / CBS2**, live. Native accessibility exposed Pause, Mute and slider100; the active video was advancing, currentTime47307.509134, paused false, muted false, readyState4,1280×720. This is the post-refresh observation, not continuity from historical Comics/CBS positions. Site/tab mute are UNKNOWN from this observation; no inference about audible output.

To comply with the approved muted demonstration, the agent used the visible native Mute control once. Readback exposed Unmute and native slider0, with active video muted true, paused false, currentTime47318.497736. A subsequent sample was47360.471414, muted true, paused false, readyState4,1280×720. No volume slider, audio-enable or transfer control was operated; numerical video volume is unavailable from the returned observation. Muting changes the native displayed slider but does not establish a changed saved volume preference.

## Required remote handoff

The recorded extension-page inspection boundary remains binding. Owner assistance requested only for inaccessible remote controls: choose TV area → Start → Add owner-chosen available content up to four total, report readability or first failure, and include visible Connection identity if available. Approval/reload/refresh were not requested again. Independent native-player observations remain available to verify actual advancing counts after remote actions.

| Criterion | Current verdict |
| --- | --- |
| Integrated compact remote journey | PENDING owner operation of inaccessible controls |
| Automatic readable layout / Close reflow / manual intent | NOT RUN |
| Monitor/custom TV area | NOT RUN |
| Selected Replace / focus / Expand / Restore | NOT RUN |
| Remote close/reopen with retained workspace | NOT RUN |
| Same original Return | NOT RUN |
| Actual concurrent advancing count | One observed; two through four NOT RUN |
| Highest-count ten-minute stability | NOT RUN |
| Service/account refusal | None observed; no count increase attempted |
| Handback | Pending; final same original must be paused/player-muted |

Next: observe remote-created players, exercise the remaining integrated actions with focused owner help, hold highest functioning count ten minutes, close only demo extras and Return/paused-muted handback. Stop count increases on actual service refusal. First-beta release remains OPEN pending demonstrated product behavior and explicit owner acceptance. Broader MVP stays separate; Prime/Netflix remain the final deferred expansion after first-beta release and preceding work completes or is explicitly owner-deferred.

## Owner failure and safe handback

Owner replied: “it is very clunky impossible to use and the buttons dont actually seem to do what they say as it relates to anything outside the youtube video/audio controls. like any screen selection and stuff not working or i cant figure it out at least”. Class OWNER_REPORTED; installed integrated usability FAIL. No exact command/result, installed version/build or placement evidence was supplied; underlying command failure remains UNKNOWN. Do not attribute this to service refusal or a proven browser worker defect.

Fresh browser inventory still showed one original and the same remote, no extras. Agent used native Pause; active-video readback currentTime47446.483809, paused true, muted true, readyState4, native Play/Unmute. Same original identity retained. No workspace enrollment or Return established; no tabs closed, no old-program restoration claimed. No protected frames/audio captured.

## Small cohesive setup repair

Source review found area editor rendered after all remote controls with no focus/scroll handoff, selecting monitor only updated a preview, result text below the whole remote, and Arrange/Restore enabled outside meaningful workspace state. This establishes source usability gaps consistent with the owner report, not the installed command cause.

Moved workspace setup before discovery; area editor now immediately visible with focused controls, keyboard containment, Escape/Cancel returning focus and persistent actions. Explained preview versus application; added Apply and start workspace that saves area then enrolls only after successful save. Existing Apply still saves without enrollment. Result feedback is near setup and retained inside editor on failure. Start disables when already enrolled; Arrange requires enrollment, Restore requires expanded state. Collapsed volume details, simplified fallback screen label and avoided duplicate single-monitor diagrams. Existing permission, navigation, session and audio contracts preserved. No runtime audio/volume commands introduced.

Affected UI test verifies no mount/Cancel writes, editor focus/return, combined save-before-start, failed save stopping start while retaining error/editor, permission-denial fallback. Real remote→bridge→worker journey now enters through combined Apply/start and still covers four feeds, isolated targeting, reflow, manual placement, reopen/restart and Return. Initial failure-injection mock used a nested command field rather than actual envelope shape; corrected before final verification.

Static source-rendered fixtures at420×640 and320×640 reviewed in isolated localhost in-app browser; area selection and apply/start controls visible/readable. No owner extension page inspected. Static fixtures establish layout only, not installed functionality.

Prepared **0.2.3 /3816ccffacb840b2**, full fingerprint `3816ccffacb840b2a35cfeb9a2b83c0417c23dac2d443a039a182e84477ce6bc`. Normal verification115/115 tests, typecheck, in-memory production/permission check and docs PASS; complete production build PASS. Logs/fixture HTML and independent022/023 bundles retained under `.local/q3-b1-demo`; [candidate inventory](candidate.json) binds source/test/bundle/freeze. New023 installation NOT RUN. No repair success on installed runtime is claimed. Existing work/evidence retained.

Final verdicts: integrated remote FAIL OWNER_REPORTED; layout/TV-area/targeting/reopen/Return NOT QUALIFIED; actual advancing one observed,2–4 NOT RUN; ten-minute stability NOT RUN. Service refusal NONE OBSERVED. First beta OPEN. Bounded next task is owner-only changed023 activation followed by one TV-area/start check and then remaining approved journey. No native refresh or repeat muted approval.

## Later owner setup result

2026-10-03 EDT, after023 repair handoff. Owner: “it worked and filled the area requested. no multiview support currently?” **TV-area/start placement PASS OWNER_REPORTED** for the exercised area. This supersedes pending setup retry; no further reload/refresh requested. Runtime version/build, chosen route/geometry and current playback state were not independently observed in this reply. Do not infer four-feed support from single-area fill.

Current implementation supports remote Add up to four total separate managed YTTV player windows, automatically arranged; this is distinct from a single composed-video surface. Next: use remote Guide/search Add for a second player, then continue count/control/stability qualification.2–4 advancing, targeting/reopen/Return and ten-minute stability remain NOT RUN/unqualified; first-beta release OPEN. Historical failed usability report and its exact evidence are retained.

## Add-disabled report — investigation pending

Owner reports “add is greyed out”. Installed Add journey is BLOCKED OWNER_REPORTED; exact selected listing/reason unknown. Source guard disables Add for busy operation, non-fresh/non-current/missing or cached playback target, or four-total capacity including pending creations. These are possible conditions, not an established cause. Asked whether every channel or only the chosen listing is affected.

Supported native observation initially found original tab1593754394 on native Live guide, with some current sport links pointing to `/live` and other listings showing `/watch` links. Before further read-only observation that tab disappeared. Fresh inventory then showed YTTV tabs1593754495 and1593754499 on the same ordinary NBC watch page, remote1593754487; prior original absent. Tab creation/closure origin and workspace ownership UNKNOWN; no agent navigation/creation/closure/mute/volume action in this continuation. Do not qualify Add success, same-original Return or two advancing feeds from this inventory. Native1593754495 displayed Motul Petit Le Mans/NBC4 with Pause/Mute controls. Its launcher DOM build **3816ccffacb840b2**, matching prepared023, with no refresh-required state. This records current launcher identity only, not independent worker/remote identity. No extension page inspection or alternate workaround.

Await focused owner listing/reason context; use supported native recovery if stale/absent targets, preserve fresh-target restrictions and repair only an established gap. No rebuild/reload requested.

### Owner narrows the Add/arrangement failure

Owner: “after refresh NBC was not greyed out and I hit add but arrange then didnt work from there”; correction: “nbc was the only one NOT greyed”. Add/NBC activation after guide refresh is OWNER_REPORTED, not independently observed creation or advancement. Auto/explicit arrangement failure OWNER_REPORTED; precise result and enrollment state pending. This supersedes the earlier all-listing ambiguity. Supported native guide observation showed CBS/current sport `/live` links versus NBC/current `/watch` link, consistent with missing eligible direct targets. Does not prove every disabled listing cause; no unsafe target eligibility relaxation.

Asked only for Arrange now's visible message and Workspace ready versus Set up state, to distinguish area minimum/clamping/enrollment/identity/manual-mode failure before repair. No new source/bundle/runtime mutation or reload request.
