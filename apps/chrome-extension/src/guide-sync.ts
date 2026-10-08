// A short-lived ordinary native Live tab discovers listings without navigating a player.
// Session ownership is transient cleanup evidence, never a saved playback target.
export const GUIDE_SYNC_KEY = 'yttv-desktop.guide-sync.session.v1';
const PREFIX = 'https://tv.youtube.com/live#yttv-guide-sync=';
export const isGuideSyncURL = (url?: string) => Boolean(url?.startsWith(PREFIX));
type Owned = { tabId: number; windowId: number; url: string };
export function createGuideSync(api: typeof chrome, changed: () => Promise<void>, options: { now?: () => number; token?: () => string; timeoutMs?: number; settleMs?: number } = {}) {
  const now = options.now ?? Date.now;
  let owned: Owned | undefined, starting = false, blocked = false, lastAttempt = -Infinity;
  let deadline: ReturnType<typeof setTimeout> | undefined, settle: ReturnType<typeof setTimeout> | undefined;
  let signature = '', status: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';
  const owns = (id: number) => owned?.tabId === id;
  async function close(record: Owned) {
    const tab = await api.tabs.get(record.tabId).catch(() => undefined);
    // Never close a tab that the owner navigated elsewhere or moved to another window.
    if (tab?.windowId === record.windowId && (tab.url === record.url || tab.pendingUrl === record.url)) await api.tabs.remove(record.tabId);
  }
  const ready = (async () => {
    try {
      const stored: any = (await api.storage.session.get(GUIDE_SYNC_KEY))[GUIDE_SYNC_KEY];
      if (stored && Number.isInteger(stored.tabId) && Number.isInteger(stored.windowId) && isGuideSyncURL(stored.url)) await close(stored);
      await api.storage.session.set({ [GUIDE_SYNC_KEY]: null });
    } catch { blocked = true; status = 'unavailable'; }
  })();
  async function finish(success: boolean) {
    const record = owned; if (!record) return;
    if (deadline) clearTimeout(deadline); if (settle) clearTimeout(settle);
    status = success ? 'ready' : 'unavailable';
    try { await close(record); await api.storage.session.set({ [GUIDE_SYNC_KEY]: null }); }
    catch { blocked = true; status = 'unavailable'; }
    finally { if (owned === record) owned = undefined; await changed(); }
  }
  async function request(windowId: number) {
    await ready;
    if (blocked || starting || owned || now() - lastAttempt < 60_000) return;
    starting = true; lastAttempt = now(); status = 'loading'; signature = '';
    let blank: chrome.tabs.Tab | undefined;
    try {
      const url = PREFIX + (options.token?.() ?? crypto.randomUUID());
      blank = await api.tabs.create({ windowId, url: 'about:blank', active: false });
      if (!blank.id || blank.windowId !== windowId) throw new Error('Guide tab unavailable');
      owned = { tabId: blank.id, windowId, url };
      // Browser mute is confirmed before any native page can load or play a preview.
      const muted = await api.tabs.update(blank.id, { muted: true });
      if (muted?.mutedInfo?.muted !== true) throw new Error('Guide mute unconfirmed');
      await api.storage.session.set({ [GUIDE_SYNC_KEY]: owned });
      await api.tabs.update(blank.id, { url: owned.url });
      deadline = setTimeout(() => { void finish(Boolean(signature)); }, options.timeoutMs ?? 15_000);
    } catch {
      status = 'unavailable';
      if (owned) {
        // On pre-navigation failure, close only the exact new blank tab.
        const tab = await api.tabs.get(owned.tabId).catch(() => undefined);
        if (tab?.windowId === owned.windowId && tab.url === 'about:blank') await api.tabs.remove(owned.tabId).catch(() => { blocked = true; });
        else await close(owned).catch(() => { blocked = true; });
        if (!blocked) await api.storage.session.set({ [GUIDE_SYNC_KEY]: null }).catch(() => { blocked = true; }); owned = undefined;
      }
    } finally { starting = false; await changed(); }
  }
  function observed(id: number, nextSignature: string) {
    if (!owns(id) || !nextSignature || nextSignature === signature) return;
    signature = nextSignature;
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => { void finish(true); }, options.settleMs ?? 1000);
  }
  function removed(id: number) {
    if (!owns(id)) return;
    if (deadline) clearTimeout(deadline); if (settle) clearTimeout(settle);
    owned = undefined;
    if (status === 'loading') status = 'unavailable';
    void api.storage.session.set({ [GUIDE_SYNC_KEY]: null }).catch(() => { blocked = true; });
  }
  return { ready, owns, request, observed, removed, get status() { return status; } };
}
