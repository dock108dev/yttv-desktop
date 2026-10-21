import { CURRENT_MANAGED_FEED_LIMIT, isManagedFeedCount } from '../../../packages/quadbox/src/policy';
import { sanitizeWorkspaceLayout, WORKSPACE_LAYOUT_KEY } from '../../../packages/storage/src/index';
import { recoveredSession, saveWorkspaceSession } from './recovery';
import { areaIntent, boundingArea, contains, planLayout, readIntent, resolveArea, validRect, MIN_PLAYER, type LayoutMode, type AreaIntent, type Rect } from '../../../packages/quadbox/src/geometry';
import type { ActionResult } from '../../../packages/ui/src/types';
export const AREA_KEY = 'yttv-desktop.tv-area.v1';
const RETURN_KEY = 'yttv-desktop.main-return.v1';
const EXPANDED_KEY = 'yttv-desktop.expanded-bounds.v1';
const PLACEMENT_KEY = 'yttv-desktop.placement.v1';
const REMOTE_KEY = 'yttv-desktop.remote.v1';
interface Player { id: string; tabId: number; windowId: number }
interface Origin { tabId: number; windowId: number; index: number; pinned: boolean; bounds: Rect; dedicatedWindowId?: number }
const success = (message: string): ActionResult => ({ ok: true, message });
const failure = (code: string, reason: string): ActionResult => ({ ok: false, code, reason });
function bounds(w: chrome.windows.Window): Rect {
  const r = { left: w.left!, top: w.top!, width: w.width!, height: w.height! };
  if (!validRect(r)) throw new Error('Window bounds unavailable'); return r;
}
/** Geometry has no audio/navigation port. Callers serialize mutations with feed lifecycle. */
export function createWorkspace(api: typeof chrome, players: () => Promise<Player[]>) {
  let available = true;
  let layout = sanitizeWorkspaceLayout(null);
  let intent: AreaIntent | null = null, origin: Origin | undefined, remoteId: number | undefined;
  let notice = 'Choose This screen or a monitor, then Start TV workspace.';
  let actual: { id: string; bounds: Rect }[] = [];
  let placement: { player: Player; rect: Rect }[] = [];
  let expanded: { players: Player[]; bounds: Rect[] } | undefined;
  let remoteQueue: Promise<unknown> = Promise.resolve();
  const ready = (async () => {
    intent = readIntent((await api.storage.local.get(AREA_KEY))[AREA_KEY]);
    layout = sanitizeWorkspaceLayout((await api.storage.local.get(WORKSPACE_LAYOUT_KEY))[WORKSPACE_LAYOUT_KEY]);
    const session = await recoveredSession(api, [RETURN_KEY, REMOTE_KEY, EXPANDED_KEY, PLACEMENT_KEY]);
    const raw = session[RETURN_KEY] as Origin;
    if (raw && Number.isInteger(raw.tabId) && Number.isInteger(raw.windowId) && Number.isInteger(raw.index) && raw.index >= 0 && typeof raw.pinned === 'boolean' && validRect(raw.bounds) && (raw.dedicatedWindowId === undefined || Number.isInteger(raw.dedicatedWindowId))) {
      origin = { tabId: raw.tabId, windowId: raw.windowId, index: raw.index, pinned: raw.pinned, bounds: { ...raw.bounds }, dedicatedWindowId: raw.dedicatedWindowId };
    }
    const saved = session[EXPANDED_KEY] as typeof expanded;
    if (saved && Array.isArray(saved.players) && Array.isArray(saved.bounds) && saved.players.length <= CURRENT_MANAGED_FEED_LIMIT && saved.players.length === saved.bounds.length && saved.bounds.every(validRect) && saved.players.every((p: Player) => typeof p.id === 'string' && p.id.length <= 200 && Number.isInteger(p.tabId) && Number.isInteger(p.windowId)))
      expanded = { players: saved.players.map((p: Player) => ({ id: p.id, tabId: p.tabId, windowId: p.windowId })), bounds: saved.bounds.map((r: Rect) => ({ left: r.left, top: r.top, width: r.width, height: r.height })) };
    const placed = session[PLACEMENT_KEY];
    if (Array.isArray(placed) && placed.length <= CURRENT_MANAGED_FEED_LIMIT && placed.every(r => validRect(r?.rect) && typeof r?.player?.id === 'string' && r.player.id.length <= 200 && Number.isInteger(r.player.tabId) && Number.isInteger(r.player.windowId)))
      placement = placed.map(r => ({ player: { id: r.player.id, tabId: r.player.tabId, windowId: r.player.windowId }, rect: { left: r.rect.left, top: r.rect.top, width: r.rect.width, height: r.rect.height } }));
    if (Number.isInteger(session[REMOTE_KEY])) remoteId = session[REMOTE_KEY] as number;
  })().catch(() => { available = false; notice = 'Workspace storage unavailable; prior records preserved. Use native controls.'; });
  const saveExpanded = () => saveWorkspaceSession(api, { [EXPANDED_KEY]: expanded ?? null });
  const saveOrigin = () => saveWorkspaceSession(api, { [RETURN_KEY]: origin ?? null });
  async function dedicated(p: Player) {
    const tab = await api.tabs.get(p.tabId);
    if (tab.windowId !== p.windowId) throw new Error('Player moved; reconnect explicitly before arranging.');
    const tabs = await api.tabs.query({ windowId: p.windowId });
    if (tabs.length !== 1 || tabs[0].id !== p.tabId) throw new Error(p.id === 'main' ? 'Original player shares an owner window. Use Start TV workspace.' : 'Player shares a window with other tabs. Move it to its own Chrome window before arranging, or use native positioning.');
    if (p.id === 'main' && (origin?.tabId !== p.tabId || origin.dedicatedWindowId !== p.windowId)) throw new Error('Original player is not enrolled. Use Start TV workspace.');
  }
  async function currentArea(mode = layout.mode): Promise<Rect | null> {
    if (!intent) { notice = 'Choose a TV area first.'; return null; }
    if (mode !== 'auto' && !intent.displayId) { notice = 'Choose monitor and confirm your TV rectangle for this layout. Native positioning remains available.'; return null; }
    if (intent.displayId) {
      let displays: chrome.system.display.DisplayUnitInfo[] = [];
      try { if (await api.permissions.contains({ permissions: ['system.display'] })) displays = await api.system.display.getInfo(); } catch { /* fallback below */ }
      const display = displays.find(d => d.id === intent!.displayId);
      if (!display || !validRect(display.workArea)) {
        if (mode !== 'auto') { notice = 'Saved monitor or monitor access unavailable. Choose monitor and reselect the TV area; players remain unchanged. Use native positioning meanwhile.'; return null; }
        const fallback = displays.find(d => validRect(d.workArea));
        if (fallback) { notice = 'Selected monitor disconnected. Recovered placement on an available monitor; choose and Apply a new TV area.'; return resolveArea(intent, fallback.workArea); }
        notice = 'Selected monitor is unavailable. Choose This screen to recover placement; players remain unchanged.';
        return null;
      }
      if (mode !== 'auto' && (['left', 'top', 'width', 'height'] as const).some(k => display.workArea[k] !== intent!.workArea[k])) { notice = 'Saved monitor work area changed. Reselect and confirm the TV area before arranging; players remain unchanged.'; return null; }
      return resolveArea(intent, display.workArea);
    }
    return resolveArea(intent);
  }
  async function focusRemote() {
    if (!remoteId) return;
    try {
      const tabs = await api.tabs.query({ windowId: remoteId });
      if (tabs.length === 1 && tabs[0].url === api.runtime.getURL('remote.html')) await api.windows.update(remoteId, { focused: true });
    } catch { /* Closing the remote never recreates it. */ }
  }
  async function apply(rows: Player[], targets: Rect[]) {
    const previous: { player: Player; rect: Rect; state?: chrome.windows.Window['state'] }[] = [];
    let keepRemote = false;
    try { if (remoteId) keepRemote = (await api.windows.get(remoteId)).focused === true; } catch { /* closed remote */ }
    try {
      for (const p of rows) { await dedicated(p); const w = await api.windows.get(p.windowId); previous.push({ player: p, rect: bounds(w), state: w.state }); }
      actual = [];
      for (let i = 0; i < rows.length; i++) {
        const p = rows[i]; await dedicated(p);
        await api.windows.update(p.windowId, { state: 'normal' });
        await api.windows.update(p.windowId, targets[i]);
        const rect = bounds(await api.windows.get(p.windowId)); actual.push({ id: p.id, bounds: rect });
        if (!contains(targets[i], rect, 2) || !contains(rect, targets[i], 2) || rect.width < MIN_PLAYER.width || rect.height < MIN_PLAYER.height) throw new Error('OS clamped player bounds. Enlarge the TV area or use fewer feeds.');
      }
      if (layout.mode !== 'auto' && !await currentArea()) throw new Error('Saved monitor or work area changed during placement. Reselect the TV area.');
      const nextPlacement = rows.map((player, i) => ({ player: { id: player.id, tabId: player.tabId, windowId: player.windowId }, rect: { ...actual[i].bounds } }));
      await saveWorkspaceSession(api, { [PLACEMENT_KEY]: nextPlacement }); placement = nextPlacement;
      return success('Actual player bounds checked. Playback and audio choices preserved.');
    } catch (error) {
      const failures: string[] = [];
      for (const old of previous) try {
        await dedicated(old.player); await api.windows.update(old.player.windowId, { state: 'normal' }); await api.windows.update(old.player.windowId, old.rect);
        if (old.state === 'maximized' || old.state === 'fullscreen') await api.windows.update(old.player.windowId, { state: old.state });
        const restored = bounds(await api.windows.get(old.player.windowId));
        if (old.state === 'normal' && (!contains(old.rect, restored, 2) || !contains(restored, old.rect, 2))) failures.push(old.player.id);
      } catch { failures.push(old.player.id); }
      actual = []; notice = `${error instanceof Error ? error.message : 'Arrangement failed.'}${failures.length ? ` Restoration incomplete for ${failures.join(', ')}; use native positioning.` : ' Previous bounds restored.'}`;
      return failure('LAYOUT_UNAVAILABLE', notice);
    } finally {
      // Chrome can focus a player during state/bounds changes. Preserve an initiating remote.
      if (keepRemote) await focusRemote();
    }
  }
  async function arrange() {
    await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
    const area = await currentArea(); if (!area) return failure('AREA_UNAVAILABLE', notice);
    const rows = await players();
    if (!rows.length) { notice = 'No managed players remain. Choose an existing player in the remote to start a new workspace.'; return failure('PLAYERS_UNAVAILABLE', notice); }
    const plan = planLayout(area, rows.length, 8, layout.mode, layout.customLayouts?.[rows.length]);
    if (!plan.ok) { notice = plan.reason; return failure('AREA_TOO_SMALL', notice); }
    const result = await apply(rows, plan.bounds);
    if (result.ok && expanded) { expanded = undefined; await saveExpanded(); }
    notice = result.reason ?? `${notice.includes('disconnected') ? notice + ' ' : ''}${plan.description}. ${result.message}`; return result;
  }
  async function validateLayout(count: number) {
    await ready; if (!available) return failure('STORAGE_UNAVAILABLE', notice);
    const area = await currentArea(); if (!area) return failure('AREA_UNAVAILABLE', notice);
    const plan = planLayout(area, count, 8, layout.mode, layout.customLayouts?.[count]);
    return plan.ok ? success('Saved area and layout ready.') : failure('AREA_TOO_SMALL', plan.reason);
  }
  async function restore() {
    await ready; if (!available) return failure('STORAGE_UNAVAILABLE', notice);
    if (!expanded) return success('No expanded arrangement to restore.');
    if (layout.mode !== 'auto' && !await currentArea()) return failure('AREA_UNAVAILABLE', notice);
    const saved = expanded;
    const live = await players();
    const remaining = saved.players.map((p, i) => ({ p, r: saved.bounds[i] })).filter(({ p }) => live.some(x => x.id === p.id && x.tabId === p.tabId && x.windowId === p.windowId));
    const result = await apply(remaining.map(x => x.p), remaining.map(x => x.r));
    if (result.ok) { expanded = undefined; await saveExpanded(); } return result;
  }
  return {
    ready, focusRemote, validateLayout,
    snapshot: () => ({ layout: layout.mode, customLayouts: layout.customLayouts, available, intent, enrolled: Boolean(origin), notice, actual, expanded: Boolean(expanded) }),
    async releaseClosedOriginal() {
      await ready;
      if (!available) return failure('STORAGE_UNAVAILABLE', notice);
      if (!origin) return success('No previous original return record.');
      // A failed get alone is not proof of closure. Confirm absence without adopting any tab.
      const live = await api.tabs.query({});
      if (live.some(tab => tab.id === origin!.tabId)) return failure('ORIGINAL_EXISTS', 'Previous original still exists. Return or reconnect it before choosing another player.');
      await saveWorkspaceSession(api, {
        'yttv-desktop.closed-original.v1': { origin, expanded: expanded ?? null, placement },
        [RETURN_KEY]: null, [EXPANDED_KEY]: null,
      });
      origin = undefined; expanded = undefined; actual = [];
      notice = 'Previous original was closed. Choose a new original explicitly; its position and audio stay unchanged.';
      return success(notice);
    },
    async openRemote() {
      const next = remoteQueue.catch(() => undefined).then(async () => {
        await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
        if (remoteId) try {
          const tabs = await api.tabs.query({ windowId: remoteId });
          if (tabs.length === 1 && tabs[0].url === api.runtime.getURL('remote.html')) { await api.windows.update(remoteId, { focused: true }); return success('Remote focused.'); }
        } catch { /* closed */ }
        const w = await api.windows.create({ url: api.runtime.getURL('remote.html'), type: 'popup', width: 420, height: 640, focused: true });
        if (!w?.id) return failure('REMOTE_UNAVAILABLE', 'Remote could not be opened. Use the player controls.');
        remoteId = w.id; await saveWorkspaceSession(api, { [REMOTE_KEY]: remoteId }); return success('Remote opened. Closing it leaves playback intact.');
      }); remoteQueue = next; return next;
    },
    async setArea(work: Rect, area: Rect, displayId?: string, mode?: LayoutMode, customSlots?: Rect[], plannedCount?: number) {
      await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
      mode ??= layout.mode;
      if (mode !== 'auto' && !displayId) return failure('DISPLAY_REQUIRED', 'Choose monitor, then draw or confirm your TV rectangle. Native positioning remains available.');
      const next = areaIntent(work, mode === 'custom' ? work : area, intent?.autoArrange ?? true, displayId);
      if (!next) return failure('INVALID_AREA', 'Area must fit within the selected usable screen.');
      if (displayId) {
        if (!await api.permissions.contains({ permissions: ['system.display'] })) return failure('DISPLAY_PERMISSION', mode !== 'auto' ? 'Monitor access unavailable. Choose monitor to reselect the fixed area, or use native positioning.' : 'Monitor access unavailable. Use This screen.');
        const display = (await api.system.display.getInfo()).find(d => d.id === displayId);
        if (!display || (['left', 'top', 'width', 'height'] as const).some(key => display.workArea[key] !== work[key])) return failure('DISPLAY_CHANGED', 'Monitor changed. Refresh monitor selection before applying.');
      }
      const count = (await players()).length;
      const previewCount = plannedCount ?? customSlots?.length ?? Math.max(1, count);
      const plan = planLayout(resolveArea(next), previewCount, 8, mode, customSlots ?? layout.customLayouts?.[previewCount]);
      if (!plan.ok) return failure('AREA_TOO_SMALL', plan.reason);
      const prior = intent, priorLayout = layout;
      const nextLayout = sanitizeWorkspaceLayout({ ...layout, version: 1, mode, ...(customSlots ? { customLayouts: { ...layout.customLayouts, [customSlots.length]: customSlots } } : {}) });
      await api.storage.local.set({ [AREA_KEY]: next, [WORKSPACE_LAYOUT_KEY]: nextLayout }); intent = next; layout = nextLayout;
      notice = 'TV area saved. Only enrolled player windows will move.';
      const currentPlan = count ? planLayout(resolveArea(next), count, 8, mode, nextLayout.customLayouts?.[count]) : undefined;
      if (!count || (previewCount !== count && !currentPlan?.ok)) {
        notice = !count ? `Layout saved for ${previewCount} shows. Use New show or Connect when ready.` : `Layout saved for ${previewCount} shows. The current ${count} shows do not fit; add or remove shows, or choose another layout, then Arrange shows.`;
        return { ...success(notice), code: 'LAYOUT_SAVED' };
      }
      if (origin && intent.autoArrange) { const result = await arrange(); if (!result.ok) { await api.storage.local.set({ [AREA_KEY]: prior, [WORKSPACE_LAYOUT_KEY]: priorLayout }); intent = prior; layout = priorLayout; } return result; } return success(notice);
    },
    async validatePlayers() {
      const rows = await players();
      if (!isManagedFeedCount(rows.length) || !rows.some(p => p.id === 'main')) return failure('PLAYERS_UNAVAILABLE', 'Connect one to four shows first.');
      const checked = await validateLayout(rows.length); if (!checked.ok) return checked;
      try { for (const p of rows) if (p.id !== 'main' || origin) await dedicated(p); }
      catch (error) { return failure('PLAYER_MOVED', error instanceof Error ? error.message : 'Use native positioning.'); }
      return success('Shows and layout ready.');
    },
    async setAuto(enabled: boolean) {
      await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.'); if (!intent) return failure('AREA_UNAVAILABLE', 'Choose a TV area first.');
      if (enabled && origin && layout.mode !== 'auto') { const checked = await validateLayout((await players()).length); if (!checked.ok) return checked; }
      const next = { ...intent, autoArrange: enabled }; await api.storage.local.set({ [AREA_KEY]: next }); intent = next;
      return enabled && origin ? arrange() : success('Manual positioning enabled. Arrange now still works.');
    },
    async enroll(arrangeAfter = true) {
      await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
      if (layout.mode !== 'auto' && !await currentArea()) return failure('AREA_UNAVAILABLE', notice);
      const p = (await players()).find(p => p.id === 'main'); if (!p) return failure('MAIN_UNAVAILABLE', 'Original player unavailable.');
      if (origin) { try { await dedicated(p); return success('Original player already enrolled.'); } catch { return failure('MAIN_MOVED', 'Original player changed windows. Return it before enrolling again.'); } }
      const tab = await api.tabs.get(p.tabId), w = await api.windows.get(tab.windowId);
      origin = { tabId: p.tabId, windowId: tab.windowId, index: tab.index, pinned: tab.pinned, bounds: bounds(w) };
      // Retain recovery identity before any move. No URL, navigation or audio mutation.
      await saveOrigin();
      try {
        const created = await api.windows.create({ tabId: p.tabId, type: 'popup', focused: false, width: 960, height: 640 });
        const moved = await api.tabs.get(p.tabId);
        if (!created?.id || moved.windowId !== created.id) throw new Error('Same-tab enrollment was not confirmed.');
        origin.dedicatedWindowId = created.id; await saveOrigin();
        const result = arrangeAfter && intent?.autoArrange ? await arrange() : success('Same original tab enrolled. Player continuity still needs installed observation.');
        return result;
      } catch {
        try { await api.tabs.move(p.tabId, { windowId: origin.windowId, index: origin.index }); await api.tabs.update(p.tabId, { pinned: origin.pinned }); origin = undefined; await saveOrigin(); }
        catch { await saveOrigin(); }
        return failure('MAIN_MOVE_FAILED', 'Original player move failed. Use Return original player or native tab controls; playback was not navigated.');
      }
    },
    async returnMain() {
      await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.'); if (!origin) return success('Original player has not been moved.');
      const p = (await players()).find(p => p.id === 'main');
      if (!p || p.tabId !== origin.tabId) return failure('MAIN_UNAVAILABLE', 'Captured original tab is unavailable; no other tab was adopted.');
      const tab = await api.tabs.get(p.tabId);
      if (origin.dedicatedWindowId && tab.windowId !== origin.dedicatedWindowId && tab.windowId !== origin.windowId) return failure('MAIN_MOVED', 'Original tab was moved manually; return it through native tab controls.');
      let fallback = false;
      try { await api.windows.get(origin.windowId); } catch { fallback = true; }
      if (fallback) await api.windows.create({ tabId: p.tabId, type: 'normal', ...origin.bounds });
      else await api.tabs.move(p.tabId, { windowId: origin.windowId, index: origin.index });
      await api.tabs.update(p.tabId, { pinned: origin.pinned });
      const returned = await api.tabs.get(p.tabId);
      if (!fallback && returned.windowId !== origin.windowId) return failure('RETURN_FAILED', 'Same-tab return was not confirmed.');
      origin = undefined; expanded = undefined; placement = []; actual = []; await saveOrigin(); await saveExpanded(); await saveWorkspaceSession(api, { [PLACEMENT_KEY]: [] });
      return success(fallback ? 'Same original tab returned to a normal window; original parent no longer exists.' : 'Same original tab returned to its captured parent/index. Owner window bounds were untouched.');
    },
    arrange, restore,
    async reflow() { await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.'); if (origin && intent?.autoArrange) {
      // Read actual windows before automatic reflow, including after worker restart.
      // A user drag/resize disables automatic placement; explicit Arrange remains available.
      if (!expanded) for (const row of await players()) {
        const prior = placement.find(p => p.player.id === row.id && p.player.tabId === row.tabId && p.player.windowId === row.windowId);
        if (!prior) continue;
        const live = bounds(await api.windows.get(row.windowId));
        if (!contains(prior.rect, live, 2) || !contains(live, prior.rect, 2)) {
          const next = { ...intent, autoArrange: false }; await api.storage.local.set({ [AREA_KEY]: next }); intent = next;
          notice = 'Manual window positions preserved. Auto arrange is off; use Arrange now or enable Auto arrange to reflow.';
          return success(notice);
        }
      }
      return arrange();
    } return success('Manual positions preserved.'); },
    async expand(id: string) {
      await ready; if (!available) return failure('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.'); const area = await currentArea(); if (!area) return failure('AREA_UNAVAILABLE', notice);
      if (expanded) { const result = await restore(); if (!result.ok) return result; }
      const rows = await players(), p = rows.find(p => p.id === id); if (!p) return failure('PANE_UNAVAILABLE', 'Player unavailable.');
      const saved: Rect[] = []; for (const row of rows) { await dedicated(row); saved.push(bounds(await api.windows.get(row.windowId))); }
      expanded = { players: rows, bounds: saved }; await saveExpanded();
      const customPlan = layout.mode === 'custom' ? planLayout(area, rows.length, 8, 'custom', layout.customLayouts?.[rows.length]) : undefined;
      const target = customPlan?.ok ? boundingArea(customPlan.bounds) : area;
      const result = await apply([p], [target]);
      if (!result.ok) { expanded = undefined; await saveExpanded(); }
      else await api.windows.update(p.windowId, { focused: true });
      return result;
    },
  };
}
