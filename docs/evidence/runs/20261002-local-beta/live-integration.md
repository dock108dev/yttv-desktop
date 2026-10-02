# Chrome local integration observations

Status: PARTIAL OBSERVED; full beta acceptance and full Phase 0 gates remain open.

2026-10-02 UTC, same Mac/Chrome environment as [auth baseline](auth-baseline.md). Initial installed bundle was unversioned in UI (prior to 0.1.2). User personally loaded/reloaded the unpacked extension; automation never inspected or controlled chrome://extensions because browser policy explicitly blocked it and forbade alternate-surface workarounds. Source/build versions and installed runtime must be distinguished.

## Initial real checks

- Fresh tv.youtube.com/live tab showed exactly one Desktop toggle/content host. Drawer displayed 169 deduplicated observed guide candidates. A normal watch href is navigation evidence only; it does not establish entitlement for every row.
- CBS 2 was starred. Pressing its compact-guide Watch navigated the ordinary original player and confirmed CBS 2 current. Native YTTV player reached 1280×720, muted=true, paused=false, readyState 4, with advancing time.
- NBC 4 compact-guide Watch navigated its original player at 1280×720 and muted=true. Client current/recents showed NBC 4 and CBS 2; Previous named CBS 2.
- Previous returned to the CBS 2 ordinary player, observed 1280×720 and muted=true, with advancing time. No protected media URL was extracted, and no playback content was captured.
- The original YTTV account/menu/player controls remained present. Complete DVR/ads/account functional testing was not performed.

## Failures retained and repairs

Ordinary channel navigation replaced the document, closing the drawer. Repaired source uses per-tab extension session state; new managed tabs remain closed. Mock state/recovery/isolation checks pass. Real repaired navigation remains to be qualified.

A cropped [initial drawer screenshot](installed-drawer-v010.jpg) shows a crowded 440px layout. The crop contains only the opaque client surface, no protected video or account data. Source now uses container-width responsive rules. Real repaired visual checks remain to be recorded.

User console reported repeated `Extension context invalidated` exceptions from the old content observer after reloading the extension. Original calls caught promise rejection but not synchronous sendMessage throws. The allowed YTTV tab was refreshed at approximately 04:08 UTC; the fresh player resumed at 1280×720, muted=true. Later time advanced from 46800.793337 to 46873.102509. Console retained old errors last timestamp 04:08:27; no later errors were observed in the next read. This is fresh-tab recovery, not qualification of the source invalidation repair.

Fresh runtime still displayed `LOCAL BETA` without the version added in bundle 0.1.2. Desktop files were 0.1.2. Therefore runtime update was not confirmed. In that fresh runtime favorites/history were empty; whether extension removal/reinstall or a different load identity caused reset is UNKNOWN. Do not call real preference persistence across reload PASS until qualified on an identified runtime.

Upstream YTTV LegacyDataMixin, onTabsDataChanged and unload-policy warnings are distinct from our context invalidation error; no causal claim is made.

## Untested remainder

Managed-window create/replace/expand/restore and continuous simultaneous playback; repaired lifecycle/drawer/layout in the identified new runtime; real persistence after reload; full failure/teardown; player/session limits; audible audio focus; resource budget; provider/mapping/Live Sports; full 18 criteria; Safari/Windows/native. All overnight audio remains muted.
