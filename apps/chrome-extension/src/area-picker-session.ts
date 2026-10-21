import { contains, validRect, type LayoutMode, type Rect } from '../../../packages/quadbox/src/geometry';
import type { ActionResult } from '../../../packages/ui/src/types';
export interface AreaPickerConfig {
  workArea: Rect; displayId: string; mode: LayoutMode; count: number; area?: Rect; slots?: Rect[];
}
export interface AreaPickerReply extends ActionResult { picker?: AreaPickerConfig }
/** The worker owns this temporary extension window; it is never a player. */
export function createAreaPickerSession(api: typeof chrome) {
  let active: { windowId: number; tabId: number; config: AreaPickerConfig } | undefined;
  let opening: Promise<AreaPickerReply> | undefined;
  const url = api.runtime.getURL('area-picker.html');
  async function owned() {
    if (!active) return false;
    try {
      const tabs = await api.tabs.query({ windowId: active.windowId });
      return tabs.length === 1 && tabs[0].id === active.tabId && tabs[0].url === url;
    } catch { return false; }
  }
  async function close() {
    const tabId = active?.tabId, canClose = await owned(); active = undefined;
    if (canClose && tabId !== undefined) await api.tabs.remove(tabId).catch(() => undefined);
  }
  return {
    open(config: AreaPickerConfig): Promise<AreaPickerReply> {
      const task = (async (): Promise<AreaPickerReply> => {
      if (!await api.permissions.contains({ permissions: ['system.display'] })) return { ok: false, reason: 'Choose monitor first so the drawing window opens on the right screen.' };
      const display = (await api.system.display.getInfo()).find(d => d.id === config.displayId);
      if (!display || !validRect(display.workArea) || !contains(display.workArea, config.workArea) || !contains(config.workArea, display.workArea)) return { ok: false, reason: 'Your monitor changed. Choose it again.' };
      await close();
      const window = await api.windows.create({ url, type: 'popup', focused: true, ...config.workArea });
      if (window?.id === undefined) return { ok: false, reason: 'Could not open the drawing window. Use the small preview instead.' };
      const tab = window.tabs?.[0] ?? (await api.tabs.query({ windowId: window.id }))[0];
      if (tab?.id === undefined) return { ok: false, reason: 'Drawing window unavailable. Close the new window if it is empty, then try again.' };
      active = { windowId: window.id, tabId: tab.id, config: structuredClone(config) };
      return { ok: true, message: 'Draw your layout on the selected monitor.' };
      })();
      opening = task;
      void task.finally(() => { if (opening === task) opening = undefined; }).catch(() => undefined);
      return task;
    },
    async read(sender: chrome.runtime.MessageSender): Promise<AreaPickerReply> {
      await opening?.catch(() => undefined);
      if (!active || sender.id !== api.runtime.id || sender.url !== url || sender.tab?.id !== active.tabId || sender.tab.windowId !== active.windowId || !await owned()) return { ok: false, reason: 'Open a new drawing window from the remote.' };
      return { ok: true, picker: structuredClone(active.config) };
    },
    close,
  };
}
