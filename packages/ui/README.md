# Shared UI

`src/index.tsx` exports `DesktopApp` and `mountDesktop(element, bridge, options)`. The [asynchronous bridge](src/types.ts) supplies observations, preferences and confirmed action results. Components do not inspect service DOM or protected media. The interface mounts in a content drawer or extension page.

Guide provides search, favorites/order/hide and confirmed recent/previous history. Sports searches guide programs with freshness guards; a separate Fixture Lab is illustrative and cannot Watch/Add. QuadBox controls two total separate original player windows. Selecting a feed transfers audio/focus; new windows start muted. `src/demo.ts` provides a labeled preview with separate local preference storage and disabled playback actions.

Keyboard handling respects editable fields, native controls, browser chords and Shadow DOM composed paths. Narrow drawers use horizontal navigation and wrapping rows; larger pages use a navigation rail. Primary controls keep44px height; secondary audio/listing/build details are disclosed separately while current blockers remain visible.

Run `node --import tsx --test packages/ui/src/behavior.test.ts` from the repository root. The harness bundles the development React test scheduler and uses `act` to flush mounting, effects and interactions rather than fixed sleeps. Minimal task-channel/profiling shims cover missing simulated-browser APIs; production compilation is checked separately. It checks bridge actions, fixture disclosure, keyboard isolation and disabled/cached states in simulated DOM. It is not installed playback or visual/accessibility qualification. See [architecture](../../docs/ARCHITECTURE.md).
