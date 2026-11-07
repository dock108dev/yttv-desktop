import { PLAYER_START_PATH } from '../../../packages/core/src/player-start';

export const playerStartUrl = (api: typeof chrome) => api.runtime.getURL(PLAYER_START_PATH);
export const isPlayerStart = (api: typeof chrome, url?: string) => url === playerStartUrl(api);

/** Wait for our inert page to commit. Missing metadata never establishes page identity. */
export async function readyPlayerWindow(api: typeof chrome, window: chrome.windows.Window): Promise<chrome.tabs.Tab> {
  const tabId = window.tabs?.[0]?.id;
  if (window.id === undefined || tabId === undefined) throw Error('PLAYER_WINDOW_IDENTITY');
  const expected = playerStartUrl(api);
  for (let attempt = 0; attempt < 40; attempt++) {
    const tab = await api.tabs.get(tabId);
    if (tab.windowId !== window.id || tab.pendingUrl && tab.pendingUrl !== expected || tab.url && tab.url !== 'about:blank' && tab.url !== expected) throw Error('PLAYER_WINDOW_CHANGED');
    if (tab.url === expected && (!tab.pendingUrl || tab.pendingUrl === expected)) {
      const group = await api.tabs.query({ windowId: window.id });
      if (group.length !== 1 || group[0].id !== tabId) throw Error('PLAYER_WINDOW_CHANGED');
      return tab;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('PLAYER_WINDOW_NOT_READY');
}
