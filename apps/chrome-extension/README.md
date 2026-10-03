# Chrome extension

The root build bundles `src/content.tsx`, `src/background.ts` and `src/panel.tsx` into `dist/chrome-extension`. The content entry mounts an isolated Shadow DOM drawer; the service worker owns commands, browser windows and storage; the toolbar popup uses the same UI bridge. See [Development](../../docs/DEVELOPMENT.md) for build/load/update steps.

The manifest requests storage and tv.youtube.com access only. The native player/account UI stays available. Drawer state is tab-scoped in extension session storage; newly created managed windows start closed.

Guide actions need fresh observed ordinary watch targets. Confirmed history advances only when the expected channel and advancing player are observed. Guide-based Sports revalidates program title/timestamp before Watch/Add; fixtures cannot authorize playback.

The current ceiling is **two total feeds**, owned by [shared policy](../../packages/quadbox/src/policy.ts), independently of account allowance. Added windows are blank and tab-muted before navigation. Selecting a feed transfers audio and focus together, with serialized mute-before-enable isolation. Volume preserves mute choices; native readback failures produce fallback guidance. Replacement affects only the chosen feed; expand/restore retains its bounds. Worker restart revalidates existing sessions and does not reopen windows or restore saved audio authority.

[Chrome integration tests](../../tests/chrome-integration.test.ts), [adapter tests](../../tests/yttv-adapter.test.ts), [architecture](../../docs/ARCHITECTURE.md) and [usage](../../START_HERE.md) describe these seams. Mocks do not establish actual account/playback capability.
