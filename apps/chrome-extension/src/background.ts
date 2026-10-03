import { sportsListings, listingPlayable } from '../../../packages/sports-engine/src/guide';
import { createAudioFocusController, createQuadState, type QuadState } from '../../../packages/quadbox/src/index';
import { guidePrograms, isPlaybackTarget, type GuideEntry } from '../../../packages/core/src/index';
import { defaultPreferences, sanitizePreferences, recordConfirmedSwitch, PREFERENCES_KEY, type Preferences } from '../../../packages/storage/src/index';
import { createGuideMetadataStore } from '../../../packages/storage/src/guide-cache';
import { freshLiveTarget, type AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { ActionResult, DesktopSnapshot, UIManagedPane } from '../../../packages/ui/src/types';
import { envelope, isMessage, type Command } from './adapter';
import { createSportsClient, SPORTS_PERMISSION } from './sports';
import { resolveEvent } from '../../../packages/event-resolver/src/index';

const SPORTS_SESSION_KEY = 'yttv-desktop.nba-metadata.v1';
const sports = createSportsClient({ permitted: () => chrome.runtime.getManifest?.().host_permissions?.includes(SPORTS_PERMISSION) ?? false });

const SESSION_KEY = 'yttv-desktop.managed-windows.v1';
const DRAWER_KEY = 'yttv-desktop.open-drawers.v1';
const MAX_TOTAL_WATCH_SESSIONS = 2;
type Bounds = { left?: number; top?: number; width?: number; height?: number; state?: string };
type Pane = UIManagedPane & { windowId: number; tabId: number; savedBounds?: Bounds };
const guideMetadata = createGuideMetadataStore({
  get: async key => (await chrome.storage.local.get(key))[key],
  set: async (key, value) => { await chrome.storage.local.set({ [key]: value }); },
});
let preferences = defaultPreferences();
let preferencesReadable = true;
const confirmedTabs = new Set<number>();
let panes: Pane[] = []; let activePaneId: string | undefined; let expandedPaneId: string | undefined;
let mainTabId: number | undefined;
let mainEvent: { eventId: string; channelId: string } | undefined;
let mainBounds: Bounds | undefined;
let audioFocusId: string | undefined;
let audioError: string | undefined;
let handoffRunning = false;
const tabAudio = new Map<number, { tabMuted: boolean | null; tabMuteReason?: string }>();
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
  try {
    const stored = await chrome.storage.local.get(PREFERENCES_KEY);
    preferences = sanitizePreferences(stored[PREFERENCES_KEY]);
  } catch { preferencesReadable = false; }
  await guideMetadata.load();
  sports.restore((await chrome.storage.session.get(SPORTS_SESSION_KEY).catch(() => ({} as Record<string, unknown>)))[SPORTS_SESSION_KEY]);

  const storedDrawers = (await chrome.storage.session.get(DRAWER_KEY).catch(() => ({} as Record<string, unknown>)))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1000)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const session = (await chrome.storage.session.get(SESSION_KEY).catch(() => ({} as Record<string, unknown>)))[SESSION_KEY] as Record<string, unknown> | undefined;
  const restoredEvent = session?.mainEvent as typeof mainEvent;
  if (restoredEvent && validId(restoredEvent.eventId) && validId(restoredEvent.channelId)) mainEvent = restoredEvent;
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
    // Restoring layout never restores audio authority.
    if (Number.isInteger(session.mainTabId)) {
      try { const tab = await chrome.tabs.get(session.mainTabId as number); if (isYTTV(tab.url) && !panes.some(p => p.tabId === tab.id)) mainTabId = tab.id; } catch { /* closed */ }
    }
    if (panes.length && mainTabId) await chrome.tabs.update(mainTabId, { muted: true }).catch(() => undefined);
    if (typeof session.expandedPaneId === 'string' && panes.some(pane => pane.id === session.expandedPaneId)) expandedPaneId = session.expandedPaneId;
  }
})();

function controlledIds(): number[] { return [...new Set([...(mainTabId ? [mainTabId] : []), ...panes.map(p => p.tabId)])]; }
function sourceId(tabId: number): string | undefined { return tabId === mainTabId ? 'main' : panes.find(p => p.tabId === tabId)?.id; }
async function readTabAudio(tabId: number) {
  try { const tab = await chrome.tabs.get(tabId); tabAudio.set(tabId, { tabMuted: typeof tab.mutedInfo?.muted === 'boolean' ? tab.mutedInfo.muted : null, tabMuteReason: tab.mutedInfo?.reason }); }
  catch { tabAudio.delete(tabId); }
}
function audioReadback(tabId?: number) {
  const player = tabId ? observations.get(tabId)?.playback : undefined; const tab = tabId ? tabAudio.get(tabId) : undefined;
  const playerMuted = player?.muted ?? null; const tabMuted = tab?.tabMuted ?? null;
  return { playerMuted, tabMuted, siteMuted: null, tabMuteReason: tab?.tabMuteReason, volume: player?.volume ?? null,
    muted: playerMuted === true || tabMuted === true ? true : playerMuted === false && tabMuted === false ? false : null };
}
async function mainPane(): Promise<Pane | null> {
  if (!mainTabId) return null;
  try { const tab = await chrome.tabs.get(mainTabId); if (!isYTTV(tab.url)) return null;
    const channelId = preferences.currentChannel ?? 'main-player'; const name = guideFor(mainTabId).find(e => e.channel.id === channelId)?.channel.name ?? 'Original player';
    return { id: 'main', isMain: true, channelId, channelName: name, eventId: mainEvent?.eventId, tabId: mainTabId, windowId: tab.windowId, savedBounds: mainBounds, ...audioReadback(mainTabId), status: 'Designated main player' };
  } catch { return null; }
}
async function controlledPanes(): Promise<Pane[]> { const main = await mainPane(); return [...(main ? [main] : []), ...panes]; }
async function muteSource(tabId: number) {
  const tab = await chrome.tabs.get(tabId); if (!isYTTV(tab.url)) throw new Error('Controlled source left YouTube TV');
  await chrome.tabs.update(tabId, { muted: true }); await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== true) throw new Error('Browser mute readback failed');
  // A muted tab is sufficient isolation even while its player is loading/unavailable.
  try { const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: true }));
    const prior = observations.get(tabId); if (reply?.ok && prior) prior.playback = { ...prior.playback, ...reply.value };
  } catch { /* Browser mute already confirmed; player readback stays unknown/unchanged. */ }
}
const audioController = createAudioFocusController({ async setMuted(sessionId, muted) {
  const tabId = Number(sessionId); if (!controlledIds().includes(tabId)) throw new Error('Uncontrolled source');
  if (muted) return muteSource(tabId);
  const tab = await chrome.tabs.get(tabId); if (!isYTTV(tab.url)) throw new Error('Source left YouTube TV');
  const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: false }));
  if (!reply?.ok || reply.value?.muted !== false) throw new Error('Player unmute unconfirmed');
  const prior = observations.get(tabId); if (prior) prior.playback = { ...prior.playback, ...reply.value };
  await chrome.tabs.update(tabId, { muted: false }); await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== false) throw new Error('Tab/site mute remains active');
}});
async function muteAll(preserveError = false): Promise<ActionResult> {
  audioFocusId = undefined;
  if (!preserveError) audioError = undefined;
  let failed = false;
  for (const tabId of controlledIds()) { try { await muteSource(tabId); } catch { failed = true; } }
  if (failed) audioError = 'Some controlled sources could not confirm browser mute. Audio state is unknown; use native mute or close the added feed.';
  await notify();
  return failed ? fail('MUTE_FAILED', audioError!) : ok('Browser mute confirmed for the designated main and added feed only.');
}

async function saveDrawers() {
  const tabIds = [...openDrawers];
  const next = drawerWriteQueue.catch(() => undefined).then(() => chrome.storage.session.set({ [DRAWER_KEY]: tabIds }));
  drawerWriteQueue = next; await next;
}

async function savePreferences() {
  if (!preferencesReadable) throw new Error('Preferences storage could not be read; existing values preserved.');
  const clean = sanitizePreferences(preferences);
  const next = preferenceWriteQueue.catch(() => undefined).then(() => chrome.storage.local.set({ [PREFERENCES_KEY]: clean }));
  preferenceWriteQueue = next; await next;
}
async function saveControlIdentity() {
  await chrome.storage.session.set({ [SESSION_KEY]: { panes, mainTabId, mainEvent, activePaneId, expandedPaneId } });
}
async function saveSessions() {
  await saveControlIdentity();
  preferences.lastQuad = panes.length ? { id: 'managed-current', name: 'Managed windows',
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
  const guide: GuideEntry[] = raw.guide.slice(0, 500).filter(entry => entry && entry.evidenceClass === 'LIVE' && validId(entry.channel?.id) && typeof entry.channel.name === 'string' && entry.channel.name.length <= 150 && Number.isFinite(Date.parse(entry.observedAt))).map(entry => ({
    channel: { id: entry.channel.id, name: entry.channel.name },
    programs: guidePrograms(entry.programs),
    programTitle: typeof entry.programTitle === 'string' ? entry.programTitle.slice(0, 300) : undefined,
    nextProgramTitle: typeof entry.nextProgramTitle === 'string' ? entry.nextProgramTitle.slice(0, 300) : undefined,
    league: entry.league === 'NBA' && /\bNBA\b/i.test(entry.programTitle ?? '') ? 'NBA' : undefined,
    metadataSource: entry.metadataSource === 'CACHED' ? 'CACHED' : 'OBSERVED',
    available: Boolean(entry.metadataSource !== 'CACHED' && isPlaybackTarget(entry.target) && freshLiveTarget(entry)),
    target: entry.metadataSource !== 'CACHED' && isPlaybackTarget(entry.target) && freshLiveTarget(entry) ? entry.target : null,
    observedAt: entry.observedAt, evidenceClass: 'LIVE',
  }));
  return { guide, guideObservedAt: raw.guideObservedAt,
    currentChannelId: validId(raw.currentChannelId) && guide.some(entry => entry.channel.id === raw.currentChannelId) ? raw.currentChannelId : undefined,
    currentProgram: typeof raw.currentProgram === 'string' ? raw.currentProgram.slice(0, 300) : undefined,
    playback: { playing: typeof raw.playback?.playing === 'boolean' ? raw.playback.playing : null,
      volume: typeof raw.playback?.volume === 'number' && raw.playback.volume >= 0 && raw.playback.volume <= 1 ? raw.playback.volume : null,
      muted: typeof raw.playback?.muted === 'boolean' ? raw.playback.muted : null,
      readyState: Number.isInteger(raw.playback?.readyState) ? raw.playback.readyState : null,
      currentTime: typeof raw.playback?.currentTime === 'number' && Number.isFinite(raw.playback.currentTime) ? raw.playback.currentTime : null,
      width: typeof raw.playback?.width === 'number' ? raw.playback.width : null, height: typeof raw.playback?.height === 'number' ? raw.playback.height : null },
    observedAt: raw.observedAt, route: ['guide', 'watch', 'other'].includes(raw.route) ? raw.route : 'other' };
}
async function observe(tabId: number, raw: AdapterObservation) {
  const clean = cleanObservation(raw); if (!clean) return;
  const prior = observations.get(tabId);
  if (prior && Date.parse(clean.observedAt) < Date.parse(prior.observedAt)) return;
  // A hard navigation temporarily reports no guide. Retain its volatile metadata until a
  // fresh Live guide replaces it, rather than persisting transient watch targets to disk.
  const observation = clean.guide.length || !prior?.guide.length ? clean : { ...clean, guide: prior.guide, guideObservedAt: prior.guideObservedAt };
  const advancing = observation.currentChannelId && observation.currentChannelId === prior?.currentChannelId &&
    observation.route === 'watch' && prior?.route === 'watch' && observation.playback.playing && prior.playback.playing && typeof observation.playback.currentTime === 'number' &&
    typeof prior.playback.currentTime === 'number' && observation.playback.currentTime > prior.playback.currentTime + .05;
  observations.set(tabId, observation);
  if (advancing) confirmedTabs.add(tabId); else confirmedTabs.delete(tabId);
  if (clean.route === 'guide') await guideMetadata.retain(clean.guide);
  await readTabAudio(tabId);
  if (mainTabId === undefined && !panes.some(pane => pane.tabId === tabId)) { mainTabId = tabId; await saveControlIdentity(); }
  if (tabId === mainTabId && observation.currentChannelId && advancing) {
    const updated = recordConfirmedSwitch(preferences, observation.currentChannelId);
    if (updated !== preferences && mainEvent && mainEvent.channelId !== observation.currentChannelId) mainEvent = undefined;
    if (updated !== preferences) { preferences = updated; await savePreferences(); }
  }
  const pane = panes.find(item => item.tabId === tabId);
  if (pane) {
    Object.assign(pane, audioReadback(tabId));
    pane.status = observation.currentChannelId === pane.channelId && advancing ? 'Player observed advancing' : 'Navigation requested; playback not confirmed';
  }
  if (!handoffRunning && panes.length && controlledIds().includes(tabId) && sourceId(tabId) !== audioFocusId && tabAudio.get(tabId)?.tabMuted === false) {
    await chrome.tabs.update(tabId, { muted: true }).catch(() => { audioError = 'Inactive feed tab mute failed; audio state is unknown. Use Mute all.'; });
    await readTabAudio(tabId);
  }
  await notify();
}
async function chooseTab(requestingTabId?: number): Promise<number | undefined> {
  if (!mainTabId && requestingTabId && !panes.some(pane => pane.tabId === requestingTabId)) { mainTabId = requestingTabId; await saveControlIdentity(); }
  if (mainTabId) { try { const tab = await chrome.tabs.get(mainTabId); if (isYTTV(tab.url)) return mainTabId; } catch { mainTabId = undefined; } }
  const tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
  const tab = tabs.find(item => item.active && !panes.some(pane => pane.tabId === item.id)) ?? tabs.find(item => !panes.some(pane => pane.tabId === item.id));
  mainTabId = tab?.id; if (mainTabId) await saveControlIdentity(); return mainTabId;
}
async function refreshObservations() {
  await Promise.all(controlledIds().map(async tabId => {
    try { const raw = await chrome.tabs.sendMessage(tabId, envelope({ type: 'GET_OBSERVATION' })); if (cleanObservation(raw)) await observe(tabId, raw); } catch { /* Page may still be loading. */ }
  }));
}
function guideFor(tabId?: number): GuideEntry[] {
  const candidate = tabId ? observations.get(tabId) : undefined;
  const source = candidate?.guide.length ? candidate : [...observations.values()].filter(item => item.guide.length).sort((a, b) => Date.parse(b.guideObservedAt ?? b.observedAt) - Date.parse(a.guideObservedAt ?? a.observedAt))[0];
  const rows = guideMetadata.rows;
  for (const entry of source?.guide ?? []) {
    const index = rows.findIndex(row => row.channel.id === entry.channel.id);
    if (index < 0) rows.push(entry);
    else if (Date.parse(entry.observedAt) >= Date.parse(rows[index].observedAt)) rows[index] = entry;
  }
  return rows.map(entry => {
    const fresh = freshLiveTarget(entry);
    return { ...entry, available: Boolean(entry.available && fresh), target: fresh ? entry.target : null };
  });
}
async function snapshot(requestingTabId?: number): Promise<DesktopSnapshot> {
  const tabId = await chooseTab(requestingTabId);
  if (tabId && !observations.has(tabId)) await refreshObservations();
  if (tabId) await readTabAudio(tabId);
  for (const pane of panes) await readTabAudio(pane.tabId);
  const observation = tabId ? observations.get(tabId) : undefined; const guide = guideFor(tabId);
  return { mode: 'extension', connection: observation ? 'connected' : 'waiting',
    guideObservedAt: guide.length ? new Date(Math.max(...guide.map(row => Date.parse(row.observedAt)))).toISOString() : undefined,
    currentConfirmed: Boolean(tabId && confirmedTabs.has(tabId) && observation?.currentChannelId === preferences.currentChannel),
    statusMessage: guide.length && !guide.some(entry => entry.target) ? 'Saved guide metadata · last observed, not current. Open native Live to validate navigation; playback stays unchanged.' : guide.length ? 'Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Audio labels describe player and tab routing; listening is a separate check.' : 'Open the native YouTube TV Live guide to observe channel navigation targets. Normal playback remains available.',
    currentChannelId: preferences.currentChannel ?? undefined, currentProgram: observation?.currentChannelId === preferences.currentChannel ? observation.currentProgram : undefined,
    playback: { playing: observation?.playback.playing ?? null, ...audioReadback(tabId) }, guide, preferences, sports: sports.snapshot(),
    panes: [...(tabId ? [await mainPane()] : []), ...panes].filter((pane): pane is Pane => Boolean(pane)).map(({ savedBounds: _bounds, ...pane }) => ({ ...pane, ...audioReadback(pane.tabId) })), activePaneId, expandedPaneId, audioFocusId, audioError,
    capabilities: { navigation: guide.some(entry => Boolean(entry.target)), guide: guide.length > 0, managedWindows: true, audio: observation?.playback.muted !== null && observation?.playback.muted !== undefined }, observedAt: observation?.observedAt };
}
async function navigate(channelId: string, requestingTabId?: number, eventId?: string): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_CHANNEL', 'A channel identifier is required.');
  const tabId = await chooseTab(requestingTabId);
  if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome and its native Live guide first.');
  if (!guideFor(tabId).some(entry => entry.channel.id === channelId && freshLiveTarget(entry))) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this channel target is unavailable or stale.');
  if (eventId && !eventMapsTo(eventId, channelId)) return fail('EVENT_UNMAPPED', 'Sports or guide state changed before navigation; refresh the event mapping.');
  try {
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: 'NAVIGATE', channelId }));
    if (result?.ok && result.value) { await observe(tabId, result.value); return ok('Channel confirmed on the original player.'); }
    return fail(result?.code ?? 'UNKNOWN', result?.reason ?? 'The original player did not confirm this channel.');
  } catch { return fail('NAVIGATION_PENDING', 'A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.'); }
}
async function refreshSports(): Promise<ActionResult> {
  const value = await sports.refresh();
  if (value.state !== 'PERMISSION_REQUIRED') await chrome.storage.session.set({ [SPORTS_SESSION_KEY]: value });
  await notify();
  return value.state === 'READY' ? ok('NBA metadata refreshed. Provider update time and latency remain unknown.') :
    fail(value.state, value.state === 'PERMISSION_REQUIRED' ? 'NBA relay permission awaits owner approval; installed playback is preserved.' : 'NBA metadata unavailable; retained games are preserved. Check the local relay and authorized project key.');
}
function eventMapsTo(eventId: string, channelId: string): boolean {
  const state = sports.snapshot(); const event = state.events.find(candidate => candidate.id === eventId);
  const guide = guideFor(mainTabId);
  if (state.state !== 'READY' || !event || resolveEvent(event, guide).channel?.id !== channelId) return false;
  return !state.events.some(other => other.id !== eventId && resolveEvent(other, guide).channel?.id === channelId);
}
async function eventAction(eventId: string, add: boolean, requestingTabId?: number): Promise<ActionResult> {
  if (!validId(eventId)) return fail('INVALID_EVENT', 'A real provider event identifier is required.');
  const tabId = await chooseTab(requestingTabId);
  const state = sports.snapshot(); const event = state.events.find(candidate => candidate.id === eventId);
  if (state.state !== 'READY' || !event) return fail('SPORTS_UNAVAILABLE', 'Refresh NBA metadata before Watch/Add.');
  const guide = guideFor(tabId); const resolution = resolveEvent(event, guide);
  if (resolution.state !== 'CONFIRMED' || !resolution.channel || !resolution.target) return fail('EVENT_UNMAPPED', resolution.reasons.join(' '));
  // Another tracked matchup resolving to this airing is an event ambiguity too.
  if (state.events.some(other => other.id !== eventId && resolveEvent(other, guide).channel?.id === resolution.channel!.id)) return fail('EVENT_AMBIGUOUS', 'More than one provider event matches this airing.');
  if (add) return createPane(resolution.channel.id, eventId);
  const previousEvent = mainEvent;
  mainEvent = { eventId, channelId: resolution.channel.id };
  const result = await navigate(resolution.channel.id, requestingTabId, eventId);
  if (!result.ok && result.code !== 'NAVIGATION_PENDING') mainEvent = previousEvent;
  await saveControlIdentity();
  return result;
}
function targetFor(channelId: string): GuideEntry | undefined { return guideFor(mainTabId).find(entry => entry.channel.id === channelId && entry.available && entry.target); }
async function requirePane(paneId: string): Promise<Pane | null> {
  const pane = paneId === 'main' ? await mainPane() : panes.find(item => item.id === paneId); if (!pane) return null;
  try { const tab = await chrome.tabs.get(pane.tabId); if (isYTTV(tab.url) && tab.windowId === pane.windowId) return pane; } catch { /* closed */ }
  panes = panes.filter(item => item.id !== paneId); await saveSessions(); return null;
}
async function createPane(channelId: string, eventId?: string): Promise<ActionResult> {
  if (!validId(channelId) || (eventId !== undefined && !validId(eventId))) return fail('INVALID_INPUT', 'A valid channel and optional event identifier are required.');
  await chooseTab();
  if (eventId && !eventMapsTo(eventId, channelId)) return fail('EVENT_UNMAPPED', 'This event has no fresh unambiguous mapping to the requested channel.');
  const entry = targetFor(channelId); if (!entry?.target) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this target is unavailable or stale.');
  const watchTabs = (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' })).filter(tab => isWatch(tab.url));
  if (watchTabs.length >= MAX_TOTAL_WATCH_SESSIONS || panes.length >= 1) return fail('SESSION_BOUND', 'This viewing milestone permits the designated main feed plus one managed feed only. Other active playback also consumes account capacity.');
  if (eventId && (!eventMapsTo(eventId, channelId) || targetFor(channelId)?.target?.url !== entry.target.url)) return fail('EVENT_UNMAPPED', 'Event mapping changed before managed-feed creation.');
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
    await readTabAudio(mainTabId!);
    if (!audioFocusId && audioReadback(mainTabId).muted === false) audioFocusId = 'main';
    panes.push(pane); if (!activePaneId) activePaneId = 'main'; await saveSessions(); await notify();
    return ok('Created a separate muted browser window. Playback remains unconfirmed until its player is observed.');
  } catch {
    if (newWindow?.id) panes = panes.filter(p => p.windowId !== newWindow!.id);
    if (newWindow?.id) await chrome.windows.remove(newWindow.id).catch(() => undefined);
    return fail('WINDOW_FAILED', 'The managed browser window could not be created safely; the existing player was preserved.');
  }
}
async function replacePane(paneId: string, channelId: string, eventId?: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); const entry = targetFor(channelId);
  if (!pane || !entry?.target || (eventId !== undefined && !validId(eventId))) return fail('TARGET_UNAVAILABLE', 'The pane or fresh channel target is unavailable.');
  if (eventId && !eventMapsTo(eventId, channelId)) return fail('EVENT_UNMAPPED', 'This event has no fresh unambiguous mapping to the requested channel.');
  await muteSource(pane.tabId);
  if (audioFocusId === paneId) audioFocusId = undefined;
  observations.delete(pane.tabId); confirmedTabs.delete(pane.tabId);
  await chrome.tabs.update(pane.tabId, { url: entry.target.url, muted: true });
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId, muted: true, status: 'Replacement requested; playback not confirmed' });
  await saveSessions(); await notify(); return ok('Only this feed was replaced, starting muted. Select it to enable audio.');
}
async function selectPane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This controlled player was closed.');
  handoffRunning = true;
  try {
    const state: QuadState = { ...createQuadState({ maxPanes: 2, nightMuteLock: false }), panes: (await controlledPanes()).map(item => ({
      id: item.id, resolvedChannel: { id: item.channelId, name: item.channelName }, playbackTarget: null, eventId: null,
      playbackSession: String(item.tabId), lastKnownEvent: null, availability: 'READY', muted: audioReadback(item.tabId).muted !== false,
    })) };
    const result = await audioController.focus(state, paneId);
    audioFocusId = result.audioFocusId ?? undefined; audioError = result.audioError ?? undefined;
    activePaneId = paneId;
    if (audioError) { await muteAll(true); return fail('AUDIO_HANDOFF_FAILED', audioError); }
    await chrome.tabs.update(pane.tabId, { active: true });
    await chrome.windows.update(pane.windowId, { focused: true });
    await saveSessions(); await refreshObservations(); await notify();
    return ok('Selected feed: player and tab audio enabled at its existing volume. Audible sound needs listening confirmation.');
  } catch {
    audioError = 'Audio or window focus handoff failed. Controlled feeds were requested muted; check the readback.';
    await muteAll(true); return fail('AUDIO_HANDOFF_FAILED', audioError);
  } finally { handoffRunning = false; }
}
async function expandPane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was closed.');
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) { const window = await chrome.windows.get(pane.windowId); pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state }; }
  await chrome.windows.update(pane.windowId, { state: 'maximized', focused: true });
  if (paneId === 'main') mainBounds = pane.savedBounds;
  expandedPaneId = paneId; await saveSessions(); await notify(); return ok('Expanded the browser window; restore returns its saved bounds.');
}
async function restoreLayout(): Promise<ActionResult> {
  const pane = expandedPaneId ? await requirePane(expandedPaneId) : null;
  if (pane?.savedBounds) {
    const { state, ...bounds } = pane.savedBounds;
    await chrome.windows.update(pane.windowId, { state: 'normal' }); await chrome.windows.update(pane.windowId, bounds);
    if (state === 'maximized' || state === 'fullscreen') await chrome.windows.update(pane.windowId, { state });
    delete pane.savedBounds; if (pane.id === 'main') mainBounds = undefined;
  }
  expandedPaneId = undefined; await saveSessions(); await notify(); return ok('Restored the managed window layout; audio selection is preserved.');
}
async function removePane(paneId: string): Promise<ActionResult> {
  if (paneId === 'main') return fail('MAIN_PRESERVED', 'The designated main player stays open.');
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was already closed.');
  await muteSource(pane.tabId); if (audioFocusId === paneId) audioFocusId = undefined;
  await chrome.tabs.remove(pane.tabId); panes = panes.filter(item => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = 'main'; if (expandedPaneId === paneId) expandedPaneId = undefined;
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
    case 'REFRESH_SPORTS': return refreshSports();
    case 'WATCH_EVENT': return runManaged(() => eventAction(command.eventId, false, contentSender ? sender.tab!.id : undefined));
    case 'ADD_EVENT': return runManaged(() => eventAction(command.eventId, true, contentSender ? sender.tab!.id : undefined));
    case 'FOCUS_MAIN': {
      const pane = await mainPane(); if (!pane) return fail('PANE_UNAVAILABLE', 'Original player unavailable.');
      await chrome.tabs.update(pane.tabId, { active: true }); await chrome.windows.update(pane.windowId, { focused: true });
      if (openDrawers.has(pane.tabId)) await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'TOGGLE_DESKTOP' })).catch(() => undefined);
      return ok('Focused the existing original player.');
    }
    case 'OPEN_NATIVE_GUIDE': {
      const tabId = await chooseTab(contentSender ? sender.tab!.id : undefined);
      if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome first.');
      await chrome.tabs.update(tabId, { url: 'https://tv.youtube.com/live' });
      return ok('Opened native Live in this tab. Fresh guide observations are required before Watch/Add.');
    }
    case 'NAVIGATE': {
      const result = await navigate(command.channelId, contentSender ? sender.tab!.id : undefined);
      if (result.ok || result.code === 'NAVIGATION_PENDING') { mainEvent = undefined; await saveControlIdentity(); }
      return result;
    }
    case 'PREVIOUS': return preferences.previousChannel ? navigate(preferences.previousChannel, contentSender ? sender.tab!.id : undefined) : fail('NO_PREVIOUS', 'No confirmed previous channel yet.');
    case 'PREFERENCE': {
      // Current/previous/recents are confirmed-playback state, not editable preferences.
      const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent, nightMuteLock: _mute, ...patch } = command.patch ?? {};
      preferences = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: false });
      await savePreferences(); await notify(); return ok('Local preferences saved.');
    }
    case 'WATCH_PROGRAM':
    case 'ADD_PROGRAM': {
      const act = async () => {
        const listing = sportsListings(guideFor(mainTabId)).find(item => item.entry.channel.id === command.channelId && item.program.title === command.title && item.entry.observedAt === command.observedAt);
        if (!listing || !listingPlayable(listing)) return fail('TARGET_UNAVAILABLE', 'This program changed or has no fresh current target. Open native Live to recover listings.');
        return command.type === 'ADD_PROGRAM' ? createPane(command.channelId) : navigate(command.channelId, mainTabId);
      };
      return runManaged(act);
    }
    case 'CREATE_PANE': return runManaged(() => createPane(command.channelId, command.eventId));
    case 'REPLACE_PANE': return runManaged(() => replacePane(command.paneId, command.channelId, command.eventId));
    case 'SELECT_PANE': return runManaged(() => selectPane(command.paneId));
    case 'EXPAND_PANE': return runManaged(() => expandPane(command.paneId));
    case 'RESTORE_LAYOUT': return runManaged(restoreLayout);
    case 'REMOVE_PANE': return runManaged(() => removePane(command.paneId));
    case 'MUTE': return runManaged(() => muteAll());
    case 'AUDIO': return runManaged(async () => {
      if ((command.muted !== undefined && typeof command.muted !== 'boolean') || (command.volume !== undefined && (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1))) return fail('INVALID_AUDIO', 'Invalid audio choice.');
      const pane = await requirePane(activePaneId ?? 'main'); if (!pane) return fail('PANE_UNAVAILABLE', 'Open the original player first.');
      try {
        if (command.volume !== undefined) {
          const reply = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'PLAYER_AUDIO', volume: command.volume }));
          if (!reply?.ok || Math.abs((reply.value?.volume ?? -1) - command.volume) > .001) throw new Error('volume');
          const prior = observations.get(pane.tabId); if (prior) prior.playback.volume = reply.value.volume;
        }
        if (command.muted === true) { await muteSource(pane.tabId); if (audioFocusId === pane.id) audioFocusId = undefined; }
        if (command.muted === false) return selectPane(pane.id);
        await notify(); return ok('Player audio choice read back; system volume unchanged.');
      } catch { audioError = 'Player audio operation failed; use the original player or retry.'; await notify(); return fail('AUDIO_FAILED', audioError); }
    });
    case 'REFRESH': await refreshObservations(); await notify(); return ok('Refreshed observable player and guide state.');
    default: return fail('UNSUPPORTED', 'This operation is unavailable.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message) || ['STATE_CHANGED', 'GET_OBSERVATION', 'TOGGLE_DESKTOP', 'PLAYER_AUDIO'].includes(message.type)) return false;
  void handle(message, sender).then(sendResponse, () => sendResponse(fail('UNKNOWN', 'The extension operation failed; underlying YouTube TV playback is preserved.')));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  const removedSourceId = sourceId(tabId);
  if (audioFocusId === removedSourceId) audioFocusId = undefined;
  if (activePaneId === removedSourceId) activePaneId = 'main';
  if (expandedPaneId === removedSourceId) expandedPaneId = undefined;
  observations.delete(tabId); tabAudio.delete(tabId); confirmedTabs.delete(tabId); if (mainTabId === tabId) mainTabId = undefined;
  void init.then(async () => { if (openDrawers.delete(tabId)) await saveDrawers(); });
  const removed = panes.some(pane => pane.tabId === tabId); panes = panes.filter(pane => pane.tabId !== tabId);
  if (removed) void init.then(saveSessions).then(notify);
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) { observations.delete(tabId); confirmedTabs.delete(tabId); }
  if (isYTTV(tab.url) && controlledIds().includes(tabId) && panes.length && !handoffRunning && sourceId(tabId) !== audioFocusId && change.mutedInfo?.muted === false)
    void chrome.tabs.update(tabId, { muted: true }).catch(() => { audioError = 'Inactive feed mute failed; use Mute all and inspect audio readback.'; });
});
