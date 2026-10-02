import { defaultPreferences } from '../../../packages/storage/src/index';
import type { ActionResult, ClientBridge, DesktopSnapshot } from '../../../packages/ui/src/types';
import { envelope, isMessage, type Command } from './adapter';
import { createExtensionLifecycle, type ExtensionLifecycle } from './runtime';

export function createClientBridge(lifecycle: ExtensionLifecycle = createExtensionLifecycle()): ClientBridge & { dispose: () => void } {
  let snapshot: DesktopSnapshot = {
    mode: 'extension', connection: 'waiting', statusMessage: 'Waiting for an observed YouTube TV page. Open its Live guide to load channel candidates.',
    playback: { playing: null, muted: true }, guide: [], preferences: defaultPreferences(), panes: [],
    capabilities: { navigation: false, guide: false, managedWindows: true, audio: false },
  };
  const listeners = new Set<() => void>();
  let refreshing = false;
  lifecycle.onInvalidated(() => {
    snapshot = { ...snapshot, connection: 'unavailable', statusMessage: 'Desktop extension updated. Refresh this YouTube TV page to reconnect; playback remains muted.',
      capabilities: { navigation: false, guide: false, managedWindows: false, audio: false } };
    for (const listener of listeners) listener();
  });
  lifecycle.addCleanup(() => listeners.clear());
  const request = async (command: Command): Promise<ActionResult> => {
    return await lifecycle.guard(() => chrome.runtime.sendMessage(envelope(command))) as ActionResult | undefined ??
      { ok: false, code: 'UNAVAILABLE', reason: 'The local extension is unavailable. Refresh this page after loading or updating the extension.' };
  };
  const refresh = async () => {
    if (refreshing || !lifecycle.active) return; refreshing = true;
    try {
      const response = await lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'GET_SNAPSHOT' }))) as DesktopSnapshot | undefined;
      if (response?.mode === 'extension') { snapshot = response; for (const listener of listeners) listener(); }
      else if (lifecycle.active) { snapshot = { ...snapshot, connection: 'unavailable', statusMessage: 'Extension connection unavailable. YouTube TV playback is still available underneath.' }; for (const listener of listeners) listener(); }
    }
    finally { refreshing = false; }
  };
  const runtimeListener = (message: unknown) => { if (isMessage(message) && message.type === 'STATE_CHANGED') void refresh(); };
  const storageListener = (_changes: unknown, area: string) => { if (area === 'local' || area === 'session') void refresh(); };
  void lifecycle.guard(() => {
    chrome.runtime.onMessage.addListener(runtimeListener);
    lifecycle.addCleanup(() => chrome.runtime.onMessage.removeListener(runtimeListener));
    chrome.storage.onChanged.addListener(storageListener);
    lifecycle.addCleanup(() => chrome.storage.onChanged.removeListener(storageListener));
  });
  void refresh();
  return {
    dispose: () => lifecycle.dispose(),
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    navigateChannel: channelId => request({ type: 'NAVIGATE', channelId }),
    previousChannel: () => request({ type: 'PREVIOUS' }),
    setPreference: patch => request({ type: 'PREFERENCE', patch }),
    createPane: (channelId, eventId) => request({ type: 'CREATE_PANE', channelId, eventId }),
    selectPane: paneId => request({ type: 'SELECT_PANE', paneId }),
    replacePane: (paneId, channelId, eventId) => request({ type: 'REPLACE_PANE', paneId, channelId, eventId }),
    expandPane: paneId => request({ type: 'EXPAND_PANE', paneId }),
    restoreLayout: () => request({ type: 'RESTORE_LAYOUT' }),
    removePane: paneId => request({ type: 'REMOVE_PANE', paneId }),
    mute: () => request({ type: 'MUTE' }),
    refresh: async () => { const result = await request({ type: 'REFRESH' }); await refresh(); return result; },
  };
}
