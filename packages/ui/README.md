# UI

Status: implemented shared React interface for the local Chrome build. Interface and simulated-DOM evidence do not establish live playback, licensed sports coverage or a complete beta.

`src/index.tsx` exports `DesktopApp` and `mountDesktop(element, bridge, options)`. The asynchronous [bridge contract](src/types.ts) receives observations and confirmed action results from the Chrome app. Components never inspect YouTube TV DOM, credentials or protected video. The same interface mounts inside an isolated content-script drawer or a standalone extension page.

The four surfaces provide current-player context, a compact guide with local favorites/order/hide settings and confirmed recent/previous history, a disclosed Sports fixture lab, and managed-window controls. The original player remains in its browser window; the interface contains no proxy or fake video player. `src/demo.ts` provides a clearly labeled local preview with separate preference storage and disabled real playback actions.

Night mode is locked to mute. Window selection changes focus only. No interface control or shortcut enables audio. Sports cards recompute freshness every 30 seconds and label stale snapshots as unavailable with last-known state. Illustrative fixtures cannot establish real channel mapping or enable Watch/Add.

Keyboard bindings are scoped to the workspace, including Shadow DOM composed paths, and exclude editable fields and original player controls. Buttons retain their native Enter behavior. Narrow 440px content drawers use horizontal navigation and dense responsive rows; larger pages use a navigation rail.

Run the focused interface behavior harness from the repository root:

```sh
node --import tsx --test packages/ui/src/behavior.test.ts
```

The harness uses bundled local source and simulated DOM. It checks fixture disclosure/disabled playback, preference updates, keyboard isolation and the managed-window/mute boundary. It is distinct from visual browser inspection, real YouTube TV navigation and concurrent-playback qualification.

See [architecture](../../docs/ARCHITECTURE.md), [backlog](../../docs/BACKLOG.md), [acceptance](../../docs/ACCEPTANCE_AND_TEST_PLAN.md) and [next task](../../NEXT_TASK.md) for remaining release gates.
