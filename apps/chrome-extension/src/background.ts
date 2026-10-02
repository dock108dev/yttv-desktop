import { isPlaybackTarget, type GuideEntry } from '../../../packages/core/src/index';
import { defaultPreferences, sanitizePreferences, recordConfirmedSwitch, PREFERENCES_KEY, type Preferences } from '../../../packages/storage/src/index';
import { navigationUrl, TARGET_MAX_AGE_MS, type AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { ActionResult, DesktopSnapshot, UIManagedPane } from '../../../packages/ui/src/types';
import { envelope, isMessage, type Command } from './adapter';

const SESSION_KEY = 'yttv-desktop.managed-windows.v1';
const DRAWER_KEY = 'yttv-desktop.open-drawers.v1';
const MAX_TOTAL_WATCH_SESSIONS = 3;
type Bounds = { left?: number; top?: number; width?: number; height?: number; state?: string };
type Pane = UIManagedPane & { windowId: number; tabId: number; savedBounds?: Bounds };
let preferences = defaultPreferences();
let panes: Pane[] = []; let activePaneId: string | undefined; let expandedPaneId: string | undefined;
let mainTabId: number | undefined;
const observations = new Map<number, AdapterObservation>();
const openDrawers = new Set<number>();
let managedQueue: Promise<unknown> = Promise.resolve();
let preferenceWriteQueue: Promise<void> = Promise.resolve();
let drawerWriteQueue: Promise<void> = Promise.resolve();
function runManaged<T>(operation: () => Promise<T>): Promise<T> {
  const next = managedQueue.catch(() => undefined).then(operation); managedQueue = next; return next;
}
const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (code: string, reason: string): ActionResult => ({ ok: false, code, reason });
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;
const isYTTV = (url?: string) => { try { return new URL(url ?? '').origin === 'https://tv.youtube.com'; } catch { return false; } };
const isWatch = (url?: string) => { try { return isYTTV(url) && new URL(url!).pathname.startsWith('/watch'); } catch { return false; } };
const init = (async () => {
  const stored = await chrome.storage.local.get(PREFERENCES_KEY);
  preferences = sanitizePreferences(stored[PREFERENCES_KEY]);
  // No user interface or imported preferences can disable the explicit overnight mute policy.
  preferences.nightMuteLock = true;
  const storedDrawers = (await chrome.storage.session.get(DRAWER_KEY))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1000)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const session = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as Record<string, unknown> | undefined;
  if (session && Array.isArray(session.panes)) {
    for (const raw of session.panes.slice(0, 3)) {
      if (!raw || typeof raw !== 'object') continue;
      const pane = raw as Pane;
      if (!validId(pane.id) || !validId(pane.channelId) || !Number.isInteger(pane.tabId) || !Number.isInteger(pane.windowId)) continue;
      try {
        const tab = await chrome.tabs.get(pane.tabId);
        if (isYTTV(tab.url) && tab.windowId === pane.windowId) {
          panes.push({ ...pane, muted: true }); await chrome.tabs.update(pane.tabId, { muted: true });
        }
      } catch { /* A closed session is not restored or silently recreated. */ }
    }
    if (typeof session.activePaneId === 'string' && panes.some(pane => pane.id === session.activePaneId)) activePaneId = session.activePaneId;
    if (typeof session.expandedPaneId === 'string' && panes.some(pane => pane.id === session.expandedPaneId)) expandedPaneId = session.expandedPaneId;
  }
})();

async function saveDrawers() {
  const tabIds = [...openDrawers];
  const next = drawerWriteQueue.catch(() => undefined).then(() => chrome.storage.session.set({ [DRAWER_KEY]: tabIds }));
  drawerWriteQueue = next; await next;
}

async function savePreferences() {
  const clean = sanitizePreferences({ ...preferences, nightMuteLock: true });
  const next = preferenceWriteQueue.catch(() => undefined).then(() => chrome.storage.local.set({ [PREFERENCES_KEY]: clean }));
  preferenceWriteQueue = next; await next;
}
async function saveSessions() {
  await chrome.storage.session.set({ [SESSION_KEY]: { panes, activePaneId, expandedPaneId } });
  preferences.lastQuad = panes.length ? { id: 'managed-current', name: 'Managed windows — muted',
    panes: panes.map(pane => ({ id: pane.id, channelId: pane.channelId, eventId: pane.eventId ?? null, target: null })), selectedPaneId: activePaneId ?? panes[0].id } : null;
  await savePreferences();
}
async function notify() {
  await chrome.runtime.sendMessage(envelope({ type: 'STATE_CHANGED' })).catch(() => undefined);
  const tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
  await Promise.all(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, envelope({ type: 'STATE_CHANGED' })).catch(() => undefined) : Promise.resolve()));
}
function cleanObservation(raw: AdapterObservation): AdapterObservation | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.guide) || !Number.isFinite(Date.parse(raw.observedAt))) return null;
  const guide: GuideEntry[] = raw.guide.slice(0, 500).filter(entry => entry && validId(entry.channel?.id) && typeof entry.channel.name === 'string' && entry.channel.name.length <= 150 && Number.isFinite(Date.parse(entry.observedAt))).map(entry => ({
    channel: { id: entry.channel.id, name: entry.channel.name },
    programTitle: typeof entry.programTitle === 'string' ? entry.programTitle.slice(0, 300) : undefined,
    nextProgramTitle: typeof entry.nextProgramTitle === 'string' ? entry.nextProgramTitle.slice(0, 300) : undefined,
    available: Boolean(entry.available && isPlaybackTarget(entry.target) && entry.target.channelId === entry.channel.id),
    target: isPlaybackTarget(entry.target) && entry.target.channelId === entry.channel.id && navigationUrl(entry.target.url) ? entry.target : null,
    observedAt: entry.observedAt, evidenceClass: 'LIVE',
  }));
  return { guide, guideObservedAt: raw.guideObservedAt,
    currentChannelId: validId(raw.currentChannelId) && guide.some(entry => entry.channel.id === raw.currentChannelId) ? raw.currentChannelId : undefined,
    currentProgram: typeof raw.currentProgram === 'string' ? raw.currentProgram.slice(0, 300) : undefined,
    playback: { playing: typeof raw.playback?.playing === 'boolean' ? raw.playback.playing : null,
      muted: typeof raw.playback?.muted === 'boolean' ? raw.playback.muted : null,
      readyState: Number.isInteger(raw.playback?.readyState) ? raw.playback.readyState : null,
      currentTime: typeof raw.playback?.currentTime === 'number' && Number.isFinite(raw.playback.currentTime) ? raw.playback.currentTime : null,
      width: typeof raw.playback?.width === 'number' ? raw.playback.width : null, height: typeof raw.playback?.height === 'number' ? raw.playback.height : null },
    observedAt: raw.observedAt, route: ['guide', 'watch', 'other'].includes(raw.route) ? raw.route : 'other' };
}
async function observe(tabId: number, raw: AdapterObservation) {
  const clean = cleanObservation(raw); if (!clean) return;
  const prior = observations.get(tabId);
  // A hard navigation temporarily reports no guide. Retain its volatile metadata until a
  // fresh Live guide replaces it, rather than persisting transient watch targets to disk.
  const observation = clean.guide.length || !prior?.guide.length ? clean : { ...clean, guide: prior.guide, guideObservedAt: prior.guideObservedAt };
  const advancing = observation.currentChannelId && observation.currentChannelId === prior?.currentChannelId &&
    observation.playback.playing && typeof observation.playback.currentTime === 'number' &&
    typeof prior.playback.currentTime === 'number' && observation.playback.currentTime > prior.playback.currentTime + .05;
  observations.set(tabId, observation);
  await chrome.tabs.update(tabId, { muted: true }).catch(() => undefined);
  if (mainTabId === undefined && !panes.some(pane => pane.tabId === tabId)) mainTabId = tabId;
  if (tabId === mainTabId && observation.currentChannelId && advancing) {
    const updated = recordConfirmedSwitch(preferences, observation.currentChannelId);
    if (updated !== preferences) { preferences = updated; await savePreferences(); }
  }
  const pane = panes.find(item => item.tabId === tabId);
  if (pane) {
    pane.muted = true;
    pane.status = observation.currentChannelId === pane.channelId && advancing ? 'Player observed advancing; muted' : 'Navigation requested; playback not confirmed';
  }
  await notify();
}
async function chooseTab(requestingTabId?: number): Promise<number | undefined> {
  if (requestingTabId && !panes.some(pane => pane.tabId === requestingTabId)) mainTabId = requestingTabId;
  if (mainTabId) { try { const tab = await chrome.tabs.get(mainTabId); if (isYTTV(tab.url)) return mainTabId; } catch { mainTabId = undefined; } }
  const tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
  const tab = tabs.find(item => item.active && !panes.some(pane => pane.tabId === item.id)) ?? tabs.find(item => !panes.some(pane => pane.tabId === item.id)) ?? tabs[0];
  mainTabId = tab?.id; return mainTabId;
}
async function refreshObservations() {
  const tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
  await Promise.all(tabs.map(async tab => {
    if (!tab.id) return;
    await chrome.tabs.update(tab.id, { muted: true });
    try { const raw = await chrome.tabs.sendMessage(tab.id, envelope({ type: 'GET_OBSERVATION' })); const clean = cleanObservation(raw); if (clean) observations.set(tab.id, clean); } catch { /* Page may still be loading. */ }
  }));
}
function guideFor(tabId?: number): GuideEntry[] {
  const candidate = tabId ? observations.get(tabId) : undefined;
  const source = candidate?.guide.length ? candidate : [...observations.values()].filter(item => item.guide.length).sort((a, b) => Date.parse(b.guideObservedAt ?? b.observedAt) - Date.parse(a.guideObservedAt ?? a.observedAt))[0];
  return (source?.guide ?? []).map(entry => {
    const fresh = entry.target && Date.now() - Date.parse(entry.target.verifiedAt) <= TARGET_MAX_AGE_MS;
    return { ...entry, available: Boolean(entry.available && fresh), target: fresh ? entry.target : null };
  });
}
async function snapshot(requestingTabId?: number): Promise<DesktopSnapshot> {
  const tabId = await chooseTab(requestingTabId);
  if (tabId && !observations.has(tabId)) await refreshObservations();
  const observation = tabId ? observations.get(tabId) : undefined; const guide = guideFor(tabId);
  return { mode: 'extension', connection: observation ? 'connected' : 'waiting',
    statusMessage: guide.length ? 'Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Managed windows remain muted overnight.' : 'Open the native YouTube TV Live guide to observe channel navigation targets. Normal playback remains available.',
    currentChannelId: observation?.currentChannelId, currentProgram: observation?.currentProgram,
    playback: { playing: observation?.playback.playing ?? null, muted: true }, guide, preferences,
    panes: panes.map(({ savedBounds: _bounds, ...pane }) => pane), activePaneId, expandedPaneId,
    capabilities: { navigation: guide.some(entry => Boolean(entry.target)), guide: guide.length > 0, managedWindows: true, audio: false }, observedAt: observation?.observedAt };
}
async function navigate(channelId: string, requestingTabId?: number): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_CHANNEL', 'A channel identifier is required.');
  const tabId = await chooseTab(requestingTabId);
  if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome and its native Live guide first.');
  await chrome.tabs.update(tabId, { muted: true });
  try {
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: 'NAVIGATE', channelId }));
    if (result?.ok && result.value) { await observe(tabId, result.value); return ok('Channel confirmed on the original muted player.'); }
    return fail(result?.code ?? 'UNKNOWN', result?.reason ?? 'The original player did not confirm this channel.');
  } catch { return fail('NAVIGATION_PENDING', 'A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.'); }
}
function targetFor(channelId: string): GuideEntry | undefined { return guideFor(mainTabId).find(entry => entry.channel.id === channelId && entry.available && entry.target); }
async function requirePane(paneId: string): Promise<Pane | null> {
  const pane = panes.find(item => item.id === paneId); if (!pane) return null;
  try { const tab = await chrome.tabs.get(pane.tabId); if (isYTTV(tab.url) && tab.windowId === pane.windowId) return pane; } catch { /* closed */ }
  panes = panes.filter(item => item.id !== paneId); await saveSessions(); return null;
}
async function createPane(channelId: string, eventId?: string): Promise<ActionResult> {
  if (!validId(channelId) || (eventId !== undefined && !validId(eventId))) return fail('INVALID_INPUT', 'A valid channel and optional event identifier are required.');
  const entry = targetFor(channelId); if (!entry?.target) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this target is unavailable or stale.');
  const watchTabs = (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' })).filter(tab => isWatch(tab.url));
  if (watchTabs.length >= MAX_TOTAL_WATCH_SESSIONS || panes.length >= MAX_TOTAL_WATCH_SESSIONS) return fail('SESSION_BOUND', 'The local beta allows at most three total YouTube TV watch sessions, including the original player. Four-stream feasibility is unqualified; no account limit is bypassed.');
  let newWindow: chrome.windows.Window | undefined;
  try {
    // Silence BEFORE the navigation can load or play. Do not create the watch URL directly.
    const created = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 780, height: 520 });
    if (!created?.id) throw new Error('Missing managed window identity');
    newWindow = created;
    const tabId = created.tabs?.[0]?.id;
    if (!tabId) throw new Error('Missing managed tab identity');
    await chrome.tabs.update(tabId, { muted: true });
    await chrome.tabs.update(tabId, { url: entry.target.url, muted: true });
    const pane: Pane = { id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, channelId, channelName: entry.channel.name,
      eventId, tabId, windowId: created.id, muted: true, status: 'Navigation requested; playback not confirmed' };
    panes.push(pane); activePaneId = pane.id; await saveSessions(); await notify();
    return ok('Created a separate muted browser window. Playback remains unconfirmed until its player is observed.');
  } catch {
    if (newWindow?.id) await chrome.windows.remove(newWindow.id).catch(() => undefined);
    return fail('WINDOW_FAILED', 'The managed browser window could not be created safely; the existing player was preserved.');
  }
}
async function replacePane(paneId: string, channelId: string, eventId?: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); const entry = targetFor(channelId);
  if (!pane || !entry?.target || (eventId !== undefined && !validId(eventId))) return fail('TARGET_UNAVAILABLE', 'The pane or fresh channel target is unavailable.');
  await chrome.tabs.update(pane.tabId, { muted: true });
  await chrome.tabs.update(pane.tabId, { url: entry.target.url, muted: true });
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId, muted: true, status: 'Replacement requested; playback not confirmed' });
  await saveSessions(); await notify(); return ok('Only this pane was replaced; all managed windows remain muted.');
}
async function selectPane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was closed.');
  for (const other of panes) await chrome.tabs.update(other.tabId, { muted: true }).catch(() => undefined);
  activePaneId = paneId; await chrome.tabs.update(pane.tabId, { active: true, muted: true }); await chrome.windows.update(pane.windowId, { focused: true });
  await saveSessions(); await notify(); return ok('Selected this window. Overnight audio remains muted in every pane.');
}
async function expandPane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was closed.');
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) { const window = await chrome.windows.get(pane.windowId); pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state }; }
  await chrome.tabs.update(pane.tabId, { muted: true }); await chrome.windows.update(pane.windowId, { state: 'maximized', focused: true });
  expandedPaneId = paneId; activePaneId = paneId; await saveSessions(); await notify(); return ok('Expanded the browser window; restore returns its saved bounds.');
}
async function restoreLayout(): Promise<ActionResult> {
  const pane = expandedPaneId ? await requirePane(expandedPaneId) : null;
  if (pane?.savedBounds) {
    const { state, ...bounds } = pane.savedBounds;
    await chrome.windows.update(pane.windowId, { state: 'normal' }); await chrome.windows.update(pane.windowId, bounds);
    if (state === 'maximized' || state === 'fullscreen') await chrome.windows.update(pane.windowId, { state });
    delete pane.savedBounds;
  }
  expandedPaneId = undefined; await saveSessions(); await notify(); return ok('Restored the managed window layout; audio stays muted.');
}
async function removePane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was already closed.');
  await chrome.tabs.remove(pane.tabId); panes = panes.filter(item => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = panes[0]?.id; if (expandedPaneId === paneId) expandedPaneId = undefined;
  await saveSessions(); await notify(); return ok('Closed only the selected managed test tab.');
}
async function handle(command: Command, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await init;
  const contentSender = sender.id === chrome.runtime.id && sender.tab?.id && isYTTV(sender.url ?? sender.tab.url);
  const extensionSender = sender.id === chrome.runtime.id && (!sender.url || sender.url.startsWith(chrome.runtime.getURL('')));
  if (!contentSender && !extensionSender) return fail('INVALID_SENDER', 'This request is outside the local extension boundary.');
  switch (command.type) {
    case 'GET_DRAWER_STATE': return contentSender ? { opened: openDrawers.has(sender.tab!.id!) } : fail('INVALID_SENDER', 'Drawer state belongs to the requesting YouTube TV tab.');
    case 'SET_DRAWER_STATE': {
      if (!contentSender || typeof command.opened !== 'boolean') return fail('INVALID_SENDER', 'Only the current YouTube TV content tab can set its drawer state.');
      if (command.opened) openDrawers.add(sender.tab!.id!); else openDrawers.delete(sender.tab!.id!);
      await saveDrawers(); return ok();
    }
    case 'OBSERVE': if (contentSender) await observe(sender.tab!.id!, command.observation); return ok();
    case 'GET_SNAPSHOT': return snapshot(contentSender ? sender.tab!.id : undefined);
    case 'NAVIGATE': return navigate(command.channelId, contentSender ? sender.tab!.id : undefined);
    case 'PREVIOUS': return preferences.previousChannel ? navigate(preferences.previousChannel, contentSender ? sender.tab!.id : undefined) : fail('NO_PREVIOUS', 'No confirmed previous channel yet.');
    case 'PREFERENCE': {
      // Current/previous/recents are confirmed-playback state, not editable preferences.
      const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent, nightMuteLock: _mute, ...patch } = command.patch ?? {};
      preferences = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: true });
      await savePreferences(); await notify(); return ok('Local preferences saved.');
    }
    case 'CREATE_PANE': return runManaged(() => createPane(command.channelId, command.eventId));
    case 'REPLACE_PANE': return runManaged(() => replacePane(command.paneId, command.channelId, command.eventId));
    case 'SELECT_PANE': return runManaged(() => selectPane(command.paneId));
    case 'EXPAND_PANE': return runManaged(() => expandPane(command.paneId));
    case 'RESTORE_LAYOUT': return runManaged(restoreLayout);
    case 'REMOVE_PANE': return runManaged(() => removePane(command.paneId));
    case 'MUTE': await refreshObservations(); await notify(); return ok('All YouTube TV test tabs are muted.');
    case 'REFRESH': await refreshObservations(); await notify(); return ok('Refreshed observable player and guide state.');
    default: return fail('UNSUPPORTED', 'This operation is unavailable.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message) || ['STATE_CHANGED', 'GET_OBSERVATION', 'TOGGLE_DESKTOP'].includes(message.type)) return false;
  void handle(message, sender).then(sendResponse, () => sendResponse(fail('UNKNOWN', 'The extension operation failed; underlying YouTube TV playback is preserved.')));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  observations.delete(tabId); if (mainTabId === tabId) mainTabId = undefined;
  void init.then(async () => { if (openDrawers.delete(tabId)) await saveDrawers(); });
  const removed = panes.some(pane => pane.tabId === tabId); panes = panes.filter(pane => pane.tabId !== tabId);
  if (removed) void init.then(saveSessions).then(notify);
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (isYTTV(tab.url) && (change.url || change.mutedInfo?.muted === false)) void chrome.tabs.update(tabId, { muted: true }).catch(() => undefined);
});
