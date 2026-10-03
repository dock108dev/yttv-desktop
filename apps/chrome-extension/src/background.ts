import { captureUsable, continuity, type PlayerCapture } from './continuity';
import { createWorkspace } from './workspace';
import { CURRENT_MANAGED_FEED_LIMIT } from '../../../packages/quadbox/src/policy';
import { sportsListings, listingPlayable } from '../../../packages/sports-engine/src/guide';
import { createAudioFocusController, createAudioState, type AudioState } from '../../../packages/quadbox/src/index';
import { guidePrograms, isPlaybackTarget, type GuideEntry } from '../../../packages/core/src/index';
import { createPreferencesStore, defaultPreferences, sanitizePreferences, recordConfirmedSwitch, PREFERENCES_KEY, type Preferences } from '../../../packages/storage/src/index';
import { createGuideMetadataStore } from '../../../packages/storage/src/guide-cache';
import { freshLiveTarget, type AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { ActionResult, DesktopSnapshot, UIManagedPane } from '../../../packages/ui/src/types';
import { envelope, isMessage, validCommand, type Command } from './adapter';
import { createFailureDiagnostics } from './diagnostics';

const failures = createFailureDiagnostics();
let preferencePersistence: 'saved' | 'unavailable' = 'saved';
let managedSessionReadable = true;
async function readSession(key: string): Promise<Record<string, unknown>> {
  try { return await chrome.storage.session.get(key); }
  catch {
    if (key === SESSION_KEY) managedSessionReadable = false;
    failures.record('SESSION_READ_FAILED'); return {};
  }
}


const SESSION_KEY = 'yttv-desktop.managed-windows.v1';
const VOLUME_KEY = 'yttv-desktop.player-volume.v1';
const AUDIO_LOG_KEY = 'yttv-desktop.audio-log.v1';
const workerStartedAt = new Date().toISOString();
type VolumeChoice = { volume: number; playerKey: string; appliedAt?: string };
const volumeChoices = new Map<number, VolumeChoice>();
const volumeRecoveryStatus = new Map<number, string>();
type VolumeAttempt = { choice: VolumeChoice; playerKey: string; documentId?: string; count: number; lastAt: number; error?: string; failure?: string };
const volumeAttempts = new Map<number, VolumeAttempt>();
const nativeVolumePending = new Map<number, { playerKey: string; documentId?: string; epoch: number }>();
const volumeEpochs = new Map<number, number>();
let volumeDiagnostics: NonNullable<DesktopSnapshot['volumeDiagnostics']> = [];
const volumeWarning = 'Saved player volume could not be restored. Set the selected volume or use the native player.';
function invalidateVolume(tabId: number) {
  volumeEpochs.set(tabId, (volumeEpochs.get(tabId) ?? 0) + 1);
  nativeVolumePending.delete(tabId); volumeAttempts.delete(tabId); volumeRecoveryStatus.delete(tabId);
}
function volumeFailure(reply: any): string {
  const known = ['PLAYER_CHANGED', 'PLAYER_LOADING', 'CONTROL_UNAVAILABLE', 'CONTROL_READBACK_MISSING', 'NATIVE_REFUSED', 'PLAYER_READBACK_MISMATCH'];
  return known.includes(reply?.audioFailure ?? reply?.code) ? (reply.audioFailure ?? reply.code) : 'UNCONFIRMED_REPLY';
}
function logVolume(tabId: number, volume: number, result: string, failure?: string) {
  const observation = observations.get(tabId);
  volumeDiagnostics.push({ at: new Date().toISOString(), source: sourceId(tabId) === 'main' ? 'main' : 'added', volume,
    route: observation?.route ?? 'other', readyState: observation?.playback.readyState ?? null, result, failure });
  volumeDiagnostics = volumeDiagnostics.slice(-16);
}
const playerIdentities = new Map<number, { playerKey: string; documentId?: string }>();
let audioDiagnostics: NonNullable<DesktopSnapshot['audioDiagnostics']> = [];
let audioLogQueue: Promise<unknown> = Promise.resolve();
const DRAWER_KEY = 'yttv-desktop.open-drawers.v1';

type Bounds = { left?: number; top?: number; width?: number; height?: number; state?: string };
function restoredBounds(raw: unknown): Bounds | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>; const result: Bounds = {};
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    if (row[key] === undefined) continue;
    if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || (['width', 'height'].includes(key) && row[key] <= 0)) return undefined;
    result[key] = row[key];
  }
  if (typeof row.state === 'string' && ['normal', 'maximized', 'minimized', 'fullscreen'].includes(row.state)) result.state = row.state;
  return result;
}
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
let mainWasDesignated = false;
let mainEvent: { eventId: string; channelId: string } | undefined;
let mainBounds: Bounds | undefined;
let audioFocusId: string | undefined;
let audioError: string | undefined;
let handoffRunning = false;
const tabAudio = new Map<number, { tabMuted: boolean | null; tabMuteReason?: string }>();
const observations = new Map<number, AdapterObservation>();
const openDrawers = new Set<number>();
let pendingFeedCreations = 0;
let managedQueue: Promise<unknown> = Promise.resolve();
let preferenceWriteQueue: Promise<void> = Promise.resolve();
let drawerWriteQueue: Promise<void> = Promise.resolve();
function runManaged<T>(operation: () => Promise<T>): Promise<T> {
  const next = managedQueue.catch(() => undefined).then(operation); managedQueue = next; return next;
}
const workspace = createWorkspace(chrome, controlledPanes);
const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (code: string, reason: string): ActionResult => ({ ok: false, code, reason });
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;
const isYTTV = (url?: string) => { try { return new URL(url ?? '').origin === 'https://tv.youtube.com'; } catch { return false; } };
const init = (async () => {
  try {
    preferences = await createPreferencesStore({
      get: async key => (await chrome.storage.local.get(key))[key],
      set: async (key, value) => { await chrome.storage.local.set({ [key]: value }); },
    }).load();
  } catch { preferencesReadable = false; preferencePersistence = 'unavailable'; failures.record('PREFERENCES_READ_FAILED'); }
  await guideMetadata.load();

  const storedDrawers = (await readSession(DRAWER_KEY))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1000)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const priorLog = (await readSession(AUDIO_LOG_KEY))[AUDIO_LOG_KEY];
  // Stored diagnostics are untrusted input too. Arbitrary old fields/text never enter snapshots.
  if (Array.isArray(priorLog)) audioDiagnostics = priorLog.slice(-16).filter(row => row &&
    typeof row.at === 'string' && row.at.length <= 40 && Number.isFinite(Date.parse(row.at)) &&
    typeof row.workerStartedAt === 'string' && row.workerStartedAt.length <= 40 && Number.isFinite(Date.parse(row.workerStartedAt)) &&
    typeof row.muted === 'boolean' && Number.isInteger(row.feeds) && row.feeds >= 0 && row.feeds <= 4 &&
    ['main', 'added'].includes(row.source) && ['main', 'added', 'none'].includes(row.authority) &&
    ['requested', 'confirmed', 'failed'].includes(row.result)).map(row => ({ at: row.at, workerStartedAt: row.workerStartedAt,
      source: row.source, cause: 'restored audio request', muted: row.muted, feeds: row.feeds, authority: row.authority, result: row.result }));
  const choices = (await readSession(VOLUME_KEY))[VOLUME_KEY];
  if (Array.isArray(choices)) for (const item of choices.slice(0, 100)) {
    if (!Number.isInteger(item?.tabId) || !Number.isFinite(item?.volume) || item.volume < 0 || item.volume > 1 || !validId(item?.playerKey)) continue;
    try { if (isYTTV((await chrome.tabs.get(item.tabId)).url)) volumeChoices.set(item.tabId, { volume: item.volume, playerKey: item.playerKey, appliedAt: typeof item.appliedAt === 'string' ? item.appliedAt : undefined }); } catch { /* closed */ }
  }
  const session = (await readSession(SESSION_KEY))[SESSION_KEY] as Record<string, unknown> | undefined;
  mainWasDesignated = session?.mainWasDesignated === true;
  const restoredEvent = session?.mainEvent as typeof mainEvent;
  if (restoredEvent && validId(restoredEvent.eventId) && validId(restoredEvent.channelId)) mainEvent = restoredEvent;
  if (session && Array.isArray(session.panes)) {
    for (const raw of session.panes.slice(0, 3)) {
      if (!raw || typeof raw !== 'object') continue;
      const pane = raw as Pane;
      if (!validId(pane.id) || pane.id === 'main' || !validId(pane.channelId) || !Number.isInteger(pane.tabId) || !Number.isInteger(pane.windowId) ||
          pane.tabId === session.mainTabId || panes.some(old => old.id === pane.id || old.tabId === pane.tabId)) continue;
      try {
        const tab = await chrome.tabs.get(pane.tabId);
        if ((isYTTV(tab.url) || pane.id === `cleanup-${pane.tabId}` && tab.url === 'about:blank') && tab.windowId === pane.windowId) {
          panes.push({ id: pane.id, channelId: pane.channelId, channelName: typeof pane.channelName === 'string' ? pane.channelName.slice(0, 150) : 'Added feed',
            feedNumber: Number.isInteger(pane.feedNumber) && pane.feedNumber! >= 2 && pane.feedNumber! <= 4 && !panes.some(p => p.feedNumber === pane.feedNumber) ? pane.feedNumber : [2, 3, 4].find(n => !panes.some(p => p.feedNumber === n)),
            eventId: validId(pane.eventId) ? pane.eventId : undefined, tabId: pane.tabId, windowId: pane.windowId, muted: null,
            savedBounds: restoredBounds(pane.savedBounds), error: tab.url === 'about:blank' ? 'Automatic cleanup failed.' : undefined, status: tab.url === 'about:blank' ? 'Creation failed; close this added window' : 'Restored window; playback not yet confirmed' });
          try { await setTabMuted(pane.tabId, true, 'worker restore added layout'); }
          catch { failures.record('RESTORE_AUDIO_FAILED'); audioError = 'Restored feed mute could not be confirmed. Use native mute or close the added feed.'; }
        }
      } catch { /* A closed session is not restored or silently recreated. */ }
    }
    // Restoring layout never restores audio authority.
    if (Number.isInteger(session.mainTabId)) {
      try { const tab = await chrome.tabs.get(session.mainTabId as number); if (isYTTV(tab.url) && !panes.some(p => p.tabId === tab.id)) mainTabId = tab.id; mainWasDesignated = true; } catch { /* closed */ }
    }
    if (panes.length && mainTabId) await setTabMuted(mainTabId, true, 'worker restore multiple feeds').catch(() => {
      failures.record('RESTORE_AUDIO_FAILED'); audioError = 'Restored main mute could not be confirmed. Use native mute or close the added feed.';
    });
    const hasPane = (id: unknown) => id === 'main' ? Boolean(mainTabId) : panes.some(pane => pane.id === id);
    if (typeof session.activePaneId === 'string' && hasPane(session.activePaneId)) activePaneId = session.activePaneId;
    if (typeof session.expandedPaneId === 'string' && hasPane(session.expandedPaneId)) expandedPaneId = session.expandedPaneId;
  }
})();
// Keep initialization rejection observable even before the first command arrives.
void init.catch(() => failures.record('COMMAND_FAILED'));

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
    const observed = observations.get(mainTabId);
    const requested = guideFor(mainTabId).find(e => e.target?.url === tab.url);
    const channelId = observed?.currentChannelId ?? requested?.channel.id ?? preferences.currentChannel ?? 'main-player';
    const name = guideFor(mainTabId).find(e => e.channel.id === channelId)?.channel.name ?? 'Original player';
    return { id: 'main', isMain: true, channelId, channelName: name, eventId: mainEvent?.eventId, tabId: mainTabId, windowId: tab.windowId, savedBounds: mainBounds, ...audioReadback(mainTabId), status: observed?.currentChannelId === channelId ? (confirmedTabs.has(mainTabId) ? 'Player observed advancing' : observed.playback.playing === false ? 'Player paused' : 'Player observed; playback not confirmed') : 'Original player; playback not confirmed' };
  } catch { return null; }
}
async function controlledPanes(): Promise<Pane[]> { const main = await mainPane(); return [...(main ? [main] : []), ...panes]; }
async function setTabMuted(tabId: number, muted: boolean, cause: string, url?: string) {
  const row = { at: new Date().toISOString(), workerStartedAt, source: tabId === mainTabId ? 'main' : 'added', cause, muted, feeds: controlledIds().length,
    authority: audioFocusId === 'main' ? 'main' : audioFocusId ? 'added' : 'none', result: 'requested' };
  audioDiagnostics.push(row); audioDiagnostics = audioDiagnostics.slice(-16);
  const persist = () => { const rows = structuredClone(audioDiagnostics); audioLogQueue = audioLogQueue.catch(() => undefined).then(() => chrome.storage.session.set({ [AUDIO_LOG_KEY]: rows })); void audioLogQueue.catch(() => failures.record('AUDIO_LOG_WRITE_FAILED')); };
  try { const result = await chrome.tabs.update(tabId, { muted, ...(url ? { url } : {}) }); row.result = 'confirmed'; persist(); return result; }
  catch (error) { row.result = 'failed'; persist(); throw error; }
}
async function saveVolumeChoices() {
  await chrome.storage.session.set({ [VOLUME_KEY]: [...volumeChoices].map(([tabId, choice]) => ({ tabId, ...choice })) });
}
async function reconcileVolume(tabId: number, playerKey: string, documentId?: string) {
  const identity = playerIdentities.get(tabId); const observation = observations.get(tabId); const choice = volumeChoices.get(tabId);
  if (nativeVolumePending.has(tabId)) return;
  if (!choice || identity?.playerKey !== playerKey || identity.documentId !== documentId || !controlledIds().includes(tabId)) return;
  if (observation?.route !== 'watch' || (observation.playback.readyState ?? 0) < 2 || observation.playback.volume == null) {
    volumeRecoveryStatus.set(tabId, 'Waiting for ready watch player'); return;
  }
  if (choice.playerKey === playerKey) {
    // A later native volume change on this same player becomes the user's current choice.
    if ((!choice.appliedAt || Date.parse(observation.observedAt) > Date.parse(choice.appliedAt)) && choice.volume !== observation.playback.volume) {
      volumeChoices.set(tabId, { ...choice, volume: observation.playback.volume });
      invalidateVolume(tabId); volumeRecoveryStatus.set(tabId, 'Native choice retained'); await saveVolumeChoices();
    }
    return;
  }
  let attempt = volumeAttempts.get(tabId);
  if (!attempt || attempt.choice !== choice || attempt.playerKey !== playerKey || attempt.documentId !== documentId) {
    attempt = { choice, playerKey, documentId, count: 0, lastAt: 0 }; volumeAttempts.set(tabId, attempt);
  }
  // Retry only on later ready observations, twice at most. Persistent refusal keeps the native fallback.
  const now = Date.parse(observation.observedAt);
  if (attempt.count >= 3 || (attempt.count && now - attempt.lastAt < 10_000)) return;
  attempt.count++; attempt.lastAt = now;
  const epoch = volumeEpochs.get(tabId) ?? 0;
  const current = () => volumeChoices.get(tabId) === choice && volumeAttempts.get(tabId) === attempt && (volumeEpochs.get(tabId) ?? 0) === epoch &&
    playerIdentities.get(tabId)?.playerKey === playerKey && playerIdentities.get(tabId)?.documentId === documentId && controlledIds().includes(tabId) &&
    observations.get(tabId)?.route === 'watch' && (observations.get(tabId)?.playback.readyState ?? 0) >= 2;
  volumeRecoveryStatus.set(tabId, 'Checking ready replacement'); logVolume(tabId, choice.volume, 'requested');
  let reply: any;
  try { reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', volume: choice.volume, playerKey }), documentId ? { documentId } : undefined); }
  catch { reply = { audioFailure: 'MESSAGE_UNAVAILABLE' }; }
  if (!current()) { logVolume(tabId, choice.volume, 'superseded'); return; }
  if (reply?.ok && Math.abs((reply.value?.volume ?? -1) - choice.volume) <= .001) {
    attempt.error = undefined; attempt.failure = undefined;
    volumeRecoveryStatus.set(tabId, 'Restored on ready replacement'); logVolume(tabId, choice.volume, 'confirmed');
    volumeChoices.set(tabId, { ...choice, playerKey, appliedAt: new Date().toISOString() });
    const latest = observations.get(tabId); if (latest) latest.playback.volume = reply.value.volume;
    await saveVolumeChoices();
  } else {
    attempt.error = volumeWarning; attempt.failure = reply?.audioFailure === 'MESSAGE_UNAVAILABLE' ? 'MESSAGE_UNAVAILABLE' : volumeFailure(reply);
    volumeRecoveryStatus.set(tabId, attempt.count >= 3 ? 'Recovery unavailable; use native volume' : 'Replacement refused or unavailable');
    logVolume(tabId, choice.volume, 'refused', attempt.failure);
  }
  await notify();
}
async function muteSource(tabId: number, cause: string) {
  const tab = await chrome.tabs.get(tabId); if (!isYTTV(tab.url)) throw new Error('Controlled source left YouTube TV');
  await setTabMuted(tabId, true, cause); await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== true) throw new Error('Browser mute readback failed');
  // A muted tab is sufficient isolation even while its player is loading/unavailable.
  try { const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: true }));
    const prior = observations.get(tabId); if (reply?.ok && prior) prior.playback = { ...prior.playback, ...reply.value };
  } catch { /* Browser mute already confirmed; player readback stays unknown/unchanged. */ }
}
const audioController = createAudioFocusController({ async setMuted(sessionId, muted) {
  const tabId = Number(sessionId); if (!controlledIds().includes(tabId)) throw new Error('Uncontrolled source');
  if (muted) return muteSource(tabId, 'audio handoff isolate');
  const tab = await chrome.tabs.get(tabId); if (!isYTTV(tab.url)) throw new Error('Source left YouTube TV');
  const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: false }));
  if (!reply?.ok || reply.value?.muted !== false) throw new Error('Player unmute unconfirmed');
  const prior = observations.get(tabId); if (prior) prior.playback = { ...prior.playback, ...reply.value };
  await setTabMuted(tabId, false, 'explicit select audio'); await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== false) throw new Error('Tab/site mute remains active');
}});
async function muteAll(preserveError = false): Promise<ActionResult> {
  audioFocusId = undefined;
  if (!preserveError) audioError = undefined;
  let failed = false;
  for (const tabId of controlledIds()) { try { await muteSource(tabId, preserveError ? 'handoff failure isolation' : 'explicit Mute all'); } catch { failed = true; } }
  if (failed) audioError = 'Some controlled sources could not confirm browser mute. Audio state is unknown; use native mute or close the added feed.';
  await notify();
  return failed ? fail('MUTE_FAILED', audioError!) : ok('Browser mute confirmed for the designated main and added feed only.');
}

async function saveDrawers() {
  const tabIds = [...openDrawers];
  const next = drawerWriteQueue.catch(() => undefined).then(() => chrome.storage.session.set({ [DRAWER_KEY]: tabIds }));
  drawerWriteQueue = next; await next;
}

async function savePreferences(value: Preferences = preferences) {
  if (!preferencesReadable) throw new Error('Preferences storage could not be read; existing values preserved.');
  const clean = sanitizePreferences(value);
  const next = preferenceWriteQueue.catch(() => undefined).then(() => chrome.storage.local.set({ [PREFERENCES_KEY]: clean }));
  preferenceWriteQueue = next;
  try { await next; preferencePersistence = 'saved'; }
  catch { preferencePersistence = 'unavailable'; failures.record('PREFERENCES_WRITE_FAILED'); throw new Error('Preferences were not saved.'); }
}
async function saveControlIdentity() {
  if (!managedSessionReadable) throw new Error('Managed sessions could not be read; existing records preserved.');
  try { await chrome.storage.session.set({ [SESSION_KEY]: { panes, mainTabId, mainWasDesignated, mainEvent, activePaneId, expandedPaneId } }); }
  catch { failures.record('SESSION_WRITE_FAILED'); throw new Error('Managed session state was not saved.'); }
}
async function saveSessions() {
  await saveControlIdentity();
  preferences.lastQuad = panes.length ? { id: 'managed-current', name: 'Managed windows',
    panes: panes.map(pane => ({ id: pane.id, channelId: pane.channelId, eventId: pane.eventId ?? null, target: null })), selectedPaneId: activePaneId ?? panes[0].id } : null;
  await savePreferences();
}
async function notify() {
  await chrome.runtime.sendMessage(envelope({ type: 'STATE_CHANGED' })).catch(() => undefined);
  let tabs: chrome.tabs.Tab[];
  try { tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' }); }
  catch { failures.record('NOTIFY_FAILED'); return; }
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
    target: entry.metadataSource !== 'CACHED' && isPlaybackTarget(entry.target) && freshLiveTarget(entry) ? {
      kind: 'navigation', channelId: entry.target.channelId, url: entry.target.url,
      verifiedAt: entry.target.verifiedAt, evidenceClass: entry.target.evidenceClass,
    } : null,
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
async function observe(tabId: number, raw: AdapterObservation, preserveAudio = false) {
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
  if (mainTabId === undefined && !mainWasDesignated && !panes.some(pane => pane.tabId === tabId)) { mainTabId = tabId; mainWasDesignated = true; await saveControlIdentity(); }
  if (tabId === mainTabId && observation.currentChannelId && advancing) {
    const updated = recordConfirmedSwitch(preferences, observation.currentChannelId);
    if (updated !== preferences && mainEvent && mainEvent.channelId !== observation.currentChannelId) mainEvent = undefined;
    if (updated !== preferences) { preferences = updated; await savePreferences(); }
  }
  const pane = panes.find(item => item.tabId === tabId);
  if (pane) {
    const current = observation.guide.find(e => e.channel.id === observation.currentChannelId) ?? guideFor(mainTabId).find(e => e.channel.id === observation.currentChannelId);
    if (current) Object.assign(pane, { channelId: current.channel.id, channelName: current.channel.name });
    Object.assign(pane, audioReadback(tabId));
    pane.status = observation.currentChannelId === pane.channelId && advancing ? 'Player observed advancing' : 'Navigation requested; playback not confirmed';
  }
  if (!preserveAudio && !handoffRunning && panes.length && controlledIds().includes(tabId) && sourceId(tabId) !== audioFocusId && tabAudio.get(tabId)?.tabMuted === false) {
    await setTabMuted(tabId, true, 'observation inactive feed').catch(() => { audioError = 'Inactive feed tab mute failed; audio state is unknown. Use Mute all.'; });
    await readTabAudio(tabId);
  }
  await notify();
}
async function chooseTab(requestingTabId?: number): Promise<number | undefined> {
  if (!mainTabId && !mainWasDesignated && requestingTabId && !panes.some(pane => pane.tabId === requestingTabId)) { mainTabId = requestingTabId; mainWasDesignated = true; await saveControlIdentity(); }
  if (mainTabId) { try { const tab = await chrome.tabs.get(mainTabId); if (isYTTV(tab.url)) return mainTabId; } catch { mainTabId = undefined; } }
  if (mainWasDesignated) return undefined;
  const tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
  const tab = tabs.find(item => item.active && !panes.some(pane => pane.tabId === item.id)) ?? tabs.find(item => !panes.some(pane => pane.tabId === item.id));
  mainTabId = tab?.id; if (mainTabId) mainWasDesignated = true; if (mainTabId) await saveControlIdentity(); return mainTabId;
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
  await workspace.ready;
  const tabId = await chooseTab(requestingTabId);
  for (const pane of [...panes]) await requirePane(pane.id);
  if (activePaneId && !(activePaneId === 'main' ? tabId : panes.some(p => p.id === activePaneId))) {
    activePaneId = tabId ? 'main' : panes[0]?.id; await saveControlIdentity();
  }
  if (!activePaneId) activePaneId = tabId ? 'main' : panes[0]?.id;
  if (tabId && !observations.has(tabId)) await refreshObservations();
  if (tabId) await readTabAudio(tabId);
  for (const pane of panes) await readTabAudio(pane.tabId);
  const observation = tabId ? observations.get(tabId) : undefined; const guide = guideFor(tabId);
  const originalMissing = !tabId && mainWasDesignated;
  const originalCandidates = originalMissing ? (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' })).filter(t => t.id && isYTTV(t.url) && new URL(t.url!).pathname.startsWith('/watch') && !panes.some(p => p.tabId === t.id)).slice(0, 50).map((t, i) => ({ tabId: t.id!, label: `Player ${i + 1} · ${(observations.get(t.id!)?.currentProgram || t.title || 'YouTube TV').slice(0, 150)}` })) : [];
  return { originalMissing, originalCandidates, workspace: { ...workspace.snapshot(), enrolled: workspace.snapshot().enrolled && Boolean(tabId) }, pendingFeedCreations, feedLimit: CURRENT_MANAGED_FEED_LIMIT, mode: 'extension', connection: observation ? 'connected' : 'waiting',
    failureDiagnostics: failures.snapshot(), preferencePersistence, guideCacheDiagnostics: guideMetadata.diagnostics,
    guideObservedAt: guide.length ? new Date(Math.max(...guide.map(row => Date.parse(row.observedAt)))).toISOString() : undefined,
    currentConfirmed: Boolean(tabId && confirmedTabs.has(tabId) && observation?.currentChannelId === preferences.currentChannel),
    statusMessage: guide.length && !guide.some(entry => entry.target) ? 'Saved guide metadata · last observed, not current. Open native Live to validate navigation; playback stays unchanged.' : guide.length ? 'Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Audio labels describe player and tab routing; listening is a separate check.' : 'Open the native YouTube TV Live guide to observe channel navigation targets. Normal playback remains available.',
    currentChannelId: preferences.currentChannel ?? undefined, currentProgram: observation?.currentChannelId === preferences.currentChannel ? observation.currentProgram : undefined,
    playback: { playing: observation?.playback.playing ?? null, ...audioReadback(tabId) }, guide, preferences,
    panes: [...(tabId ? [await mainPane()] : []), ...panes].filter((pane): pane is Pane => Boolean(pane)).map(({ savedBounds: _bounds, ...pane }) => ({ ...pane, ...audioReadback(pane.tabId) })), activePaneId, expandedPaneId, audioFocusId, audioError: [audioError, ...controlledIds().map(id => observations.get(id)?.route === 'watch' ? volumeAttempts.get(id)?.error : undefined)].filter(Boolean).join(' ') || undefined, audioDiagnostics, volumeDiagnostics,
    volumeRecovery: { savedVolume: volumeChoices.get(tabId!)?.volume ?? null, playerTracked: playerIdentities.has(tabId!), documentBound: Boolean(playerIdentities.get(tabId!)?.documentId), attempts: volumeAttempts.get(tabId!)?.count ?? 0, failure: volumeAttempts.get(tabId!)?.failure, status: volumeRecoveryStatus.get(tabId!) ?? 'No recovery request in this worker' },
    capabilities: { navigation: guide.some(entry => Boolean(entry.target)), guide: guide.length > 0, managedWindows: managedSessionReadable, audio: managedSessionReadable && observation?.playback.muted !== null && observation?.playback.muted !== undefined }, observedAt: observation?.observedAt };
}
async function navigate(channelId: string, requestingTabId?: number): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_CHANNEL', 'A channel identifier is required.');
  const tabId = await chooseTab(requestingTabId);
  if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome and its native Live guide first.');
  if (!guideFor(tabId).some(entry => entry.channel.id === channelId && freshLiveTarget(entry))) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this channel target is unavailable or stale.');
  try {
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: 'NAVIGATE', channelId }));
    if (result?.ok && result.value) { await observe(tabId, result.value); return ok('Channel confirmed on the original player.'); }
    return fail(result?.code ?? 'UNKNOWN', result?.reason ?? 'The original player did not confirm this channel.');
  } catch { return fail('NAVIGATION_PENDING', 'A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.'); }
}
function targetFor(channelId: string): GuideEntry | undefined { return guideFor(mainTabId).find(entry => entry.channel.id === channelId && entry.available && entry.target); }
async function requirePane(paneId: string): Promise<Pane | null> {
  const pane = paneId === 'main' ? await mainPane() : panes.find(item => item.id === paneId); if (!pane) return null;
  try { const tab = await chrome.tabs.get(pane.tabId); if ((isYTTV(tab.url) || pane.error && tab.url === 'about:blank') && tab.windowId === pane.windowId) return pane; } catch { /* closed */ }
  panes = panes.filter(item => item.id !== paneId); await saveSessions(); return null;
}
async function createPane(channelId: string): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_INPUT', 'A valid channel identifier is required.');
  await chooseTab();
  const entry = targetFor(channelId); if (!entry?.target) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this target is unavailable or stale.');
  for (const pane of [...panes]) await requirePane(pane.id);
  if (panes.some(p => p.error)) return fail('WINDOW_CLEANUP_FAILED', 'Close the failed added window before creating another feed.');
  if (!mainTabId) return fail('MAIN_UNAVAILABLE', 'Select the original player explicitly before adding feeds.');
  // runManaged reserves pending creations by serializing the capacity check through completion/cleanup.
  if (controlledIds().length + pendingFeedCreations >= CURRENT_MANAGED_FEED_LIMIT) return fail('SESSION_BOUND', 'Four total managed feeds are the software limit. Close an added feed first; account playback allowance is separate.');
  let newWindow: chrome.windows.Window | undefined;
  pendingFeedCreations++;
  try {
    // Silence BEFORE the navigation can load or play. Do not create the watch URL directly.
    const created = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 780, height: 520 });
    if (!created?.id) throw new Error('Missing managed window identity');
    newWindow = created;
    const tabId = created.tabs?.[0]?.id;
    if (!tabId) throw new Error('Missing managed tab identity');
    await setTabMuted(tabId, true, 'create blank feed');
    await setTabMuted(tabId, true, 'create navigate feed', entry.target.url);
    const pane: Pane = { id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, channelId, channelName: entry.channel.name,
      feedNumber: [2, 3, 4].find(n => !panes.some(p => p.feedNumber === n)), tabId, windowId: created.id, muted: true, status: 'Navigation requested; playback not confirmed' };
    await readTabAudio(mainTabId!);
    if (!audioFocusId && audioReadback(mainTabId).muted === false) audioFocusId = 'main';
    panes.push(pane); if (!activePaneId) activePaneId = 'main'; await saveSessions(); const layout = await workspace.reflow(); await notify();
    if (!layout.ok) return ok(`Feed created muted. ${layout.reason}`);
    return ok('Created a separate muted browser window. Playback remains unconfirmed until its player is observed.');
  } catch {
    if (newWindow?.id) {
      try { await chrome.windows.remove(newWindow.id); panes = panes.filter(p => p.windowId !== newWindow!.id); }
      catch {
        failures.record('WINDOW_CLEANUP_FAILED');
        const tabId = newWindow.tabs?.[0]?.id;
        if (tabId && !panes.some(p => p.tabId === tabId)) panes.push({ id: `cleanup-${tabId}`, tabId, windowId: newWindow.id,
          channelId, channelName: entry.channel.name, muted: null, status: 'Creation failed; close this added window', error: 'Automatic cleanup failed.' });
        audioError = 'Added window cleanup failed; use native mute and close that window.';
        return fail('WINDOW_CLEANUP_FAILED', audioError);
      }
    }
    return fail('WINDOW_FAILED', 'The managed browser window could not be created safely; the existing player was preserved.');
  } finally { pendingFeedCreations--; }
}
async function replacePane(paneId: string, channelId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); const entry = targetFor(channelId);
  if (!pane || !entry?.target) return fail('TARGET_UNAVAILABLE', 'The pane or fresh channel target is unavailable.');
  await muteSource(pane.tabId, 'replace feed isolation');
  if (audioFocusId === paneId) audioFocusId = undefined;
  observations.delete(pane.tabId); confirmedTabs.delete(pane.tabId);
  await setTabMuted(pane.tabId, true, 'replace navigate feed', entry.target.url);
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId: undefined, muted: true, status: 'Replacement requested; playback not confirmed' });
  await saveSessions(); await notify(); return ok('Only this feed was replaced, starting muted. Select it to enable audio.');
}
async function selectPane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This controlled player was closed.');
  handoffRunning = true;
  try {
    const state: AudioState = { ...createAudioState(), panes: (await controlledPanes()).map(item => ({
      id: item.id,
      playbackSession: String(item.tabId), availability: 'READY', muted: audioReadback(item.tabId).muted !== false,
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
  if (paneId === 'main') return fail('MAIN_NOT_ENROLLED', 'Use Start TV workspace before expanding the original player. Owner windows are preserved.');
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was closed.');
  const tabs = await chrome.tabs.query({ windowId: pane.windowId });
  if (tabs.length !== 1 || tabs[0].id !== pane.tabId) return fail('SHARED_OWNER_WINDOW', 'This player shares an owner window. Native positioning remains available.');
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) { const window = await chrome.windows.get(pane.windowId); pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state }; }
  await chrome.windows.update(pane.windowId, { state: 'maximized', focused: true });
  if (paneId === 'main') mainBounds = pane.savedBounds;
  expandedPaneId = paneId; await saveSessions(); await notify(); return ok('Expanded the browser window; restore returns its saved bounds.');
}
async function restoreLayout(): Promise<ActionResult> {
  const pane = expandedPaneId ? await requirePane(expandedPaneId) : null;
  if (pane?.savedBounds && !pane.isMain) {
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
  await muteSource(pane.tabId, 'close added feed'); if (audioFocusId === paneId) audioFocusId = undefined;
  await chrome.tabs.remove(pane.tabId); panes = panes.filter(item => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = 'main'; if (expandedPaneId === paneId) expandedPaneId = undefined;
  await saveSessions(); const layout = await workspace.reflow(); await notify(); return ok(layout.ok ? 'Closed only the selected added feed.' : `Feed closed. ${layout.reason}`);
}
async function moveOriginal(returning: boolean): Promise<ActionResult> {
  const pane = await mainPane(); if (!pane) return fail('MAIN_UNAVAILABLE', 'Original player unavailable.');
  const beforeTab = await chrome.tabs.get(pane.tabId);
  const before = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined) as PlayerCapture | undefined;
  if (!captureUsable(before)) return fail('PRESERVATION_UNAVAILABLE', 'Current player identity, paused position and audio readback are unavailable. Use native controls; original tab was not moved.');
  const result = returning ? await workspace.returnMain() : await workspace.enroll();
  const after = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined) as PlayerCapture | undefined;
  const afterTab = await chrome.tabs.get(pane.tabId);
  if (!continuity(before, after) || beforeTab.mutedInfo?.muted !== afterTab.mutedInfo?.muted) {
    const rollback = returning ? undefined : await workspace.returnMain();
    return fail('PRESERVATION_UNCONFIRMED', `Same-tab move did not confirm the captured program, position and audio state. ${rollback?.message ?? rollback?.reason ?? 'Inspect the native player before further workspace actions.'} No program was navigated or replaced.`);
  }
  return result;
}
async function handle(command: Command, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await init; await workspace.ready;
  const contentSender = sender.id === chrome.runtime.id && sender.tab?.id && isYTTV(sender.url ?? sender.tab.url);
  const extensionSender = sender.id === chrome.runtime.id && Boolean(sender.url?.startsWith(chrome.runtime.getURL('')));
  if (!contentSender && !extensionSender) { failures.record('INVALID_SENDER'); return fail('INVALID_SENDER', 'This request is outside the local extension boundary.'); }
  if (['REFRESH_SPORTS', 'WATCH_EVENT', 'ADD_EVENT'].includes(command.type) ||
      (['CREATE_PANE', 'REPLACE_PANE'].includes(command.type) && 'eventId' in command))
    return fail('UNSUPPORTED_PATH', 'Provider event playback was removed. Use Guide or guide-based Sports programs.');
  if (!validCommand(command)) { failures.record('INVALID_COMMAND'); return fail('INVALID_COMMAND', 'Invalid or oversized extension command.'); }
  if (!managedSessionReadable && (['CREATE_PANE', 'ADD_PROGRAM', 'REPLACE_PANE', 'REPLACE_PROGRAM', 'SELECT_PANE'].includes(command.type) ||
      (command.type === 'AUDIO' && command.muted === false)))
    return fail('STORAGE_UNAVAILABLE', 'Managed sessions could not be recovered. Use native mute and existing windows; audio enable and new feeds remain unavailable.');
  if (['START_WORKSPACE', 'RETURN_MAIN', 'ARRANGE', 'SET_TV_AREA', 'AUTO_ARRANGE', 'OPEN_REMOTE'].includes(command.type) && !workspace.snapshot().available)
    return fail('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
  switch (command.type) {
    case 'CHOOSE_MAIN': return runManaged(async () => {
      if (!extensionSender) return fail('INVALID_SENDER', 'Choose the original from the remote.');
      if (!managedSessionReadable) return fail('STORAGE_UNAVAILABLE', 'Existing workspace records unavailable; native controls remain available.');
      if (await mainPane()) return fail('ORIGINAL_EXISTS', 'An original player is already controlled.');
      const tab = await chrome.tabs.get(command.tabId).catch(() => undefined);
      if (!tab || !isYTTV(tab.url) || panes.some(p => p.tabId === command.tabId)) return fail('PLAYER_UNAVAILABLE', 'Choose an existing unassigned YouTube TV player.');
      const requestedAt = Date.now(), connectionNonce = crypto.randomUUID();
      const raw = await chrome.tabs.sendMessage(command.tabId, envelope({ type: 'GET_OBSERVATION', connectionNonce })).catch(() => undefined);
      const clean = cleanObservation(raw), expectedBuild = typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source';
      if (!clean || !captureUsable({ ...clean, playerKey: raw?.playerKey }) || raw.connectionBuild !== expectedBuild || raw.connectionNonce !== connectionNonce || Date.parse(clean.observedAt) < requestedAt || Date.parse(clean.observedAt) > Date.now())
        return fail('PLAYER_UNAVAILABLE', 'This player is not connected and ready. Use its native controls; no player was adopted.');
      const released = await workspace.releaseClosedOriginal(); if (!released.ok) return released;
      const priorMain = mainTabId, priorSelected = activePaneId, priorEvent = mainEvent, priorExpanded = expandedPaneId, priorAudio = audioFocusId;
      mainTabId = command.tabId; mainWasDesignated = true; mainEvent = undefined; activePaneId = 'main'; expandedPaneId = undefined; audioFocusId = undefined;
      try { await saveControlIdentity(); } catch { mainTabId = priorMain; activePaneId = priorSelected; mainEvent = priorEvent; expandedPaneId = priorExpanded; audioFocusId = priorAudio; return fail('STORAGE_UNAVAILABLE', 'Player choice could not be saved; native controls remain available.'); }
      await observe(command.tabId, raw, true); await notify();
      return ok('Chosen player connected without moving it or changing playback or audio. Start TV workspace to arrange it. The previous closed original cannot be returned.');
    });
    case 'RECONNECT_MAIN': return runManaged(async () => {
      if (!extensionSender) return fail('INVALID_SENDER', 'Reconnect belongs to the extension remote.');
      if (!await chrome.permissions.contains({ permissions: ['scripting'] })) return fail('INJECTION_PERMISSION', 'Reconnect access denied. Existing native playback remains available.');
      const tabId = await chooseTab(); if (!tabId || !isYTTV((await chrome.tabs.get(tabId)).url)) return fail('MAIN_UNAVAILABLE', 'Original YouTube TV tab unavailable.');
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      const requestedAt = Date.now(); const connectionNonce = crypto.randomUUID();
      const raw = await chrome.tabs.sendMessage(tabId, envelope({ type: 'GET_OBSERVATION', connectionNonce })).catch(() => undefined);
      const clean = cleanObservation(raw);
      const expectedBuild = typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source';
      if (!clean || !captureUsable({ ...clean, playerKey: raw?.playerKey }) || clean.playback.readyState === null || clean.playback.readyState < 2 ||
          raw.connectionBuild !== expectedBuild || raw.connectionNonce !== connectionNonce ||
          Date.parse(clean.observedAt) < requestedAt || Date.parse(clean.observedAt) > Date.now() ||
          mainTabId !== tabId || !isYTTV((await chrome.tabs.get(tabId)).url)) {
        await notify();
        return fail('RECONNECT_UNCONFIRMED', 'Connection not confirmed. Keep native playback unchanged and retry Reconnect original player.');
      }
      await observe(tabId, raw, true); await notify(); return ok('Controls reconnected to the existing original tab without page refresh or navigation.');
    });
    case 'OPEN_REMOTE': return workspace.openRemote();
    case 'START_WORKSPACE': return runManaged(async () => { const result = await moveOriginal(false); await notify(); return result; });
    case 'RETURN_MAIN': return runManaged(async () => { const result = await moveOriginal(true); await notify(); return result; });
    case 'ARRANGE': return runManaged(async () => { const result = await workspace.arrange(); await notify(); return result; });
    case 'SET_TV_AREA': return runManaged(async () => { const result = await workspace.setArea(command.workArea, command.area, command.displayId); await notify(); return result; });
    case 'AUTO_ARRANGE': return runManaged(async () => { const result = await workspace.setAuto(command.enabled); await notify(); return result; });
    case 'ACTIVE_PANE': return runManaged(async () => { const pane = await requirePane(command.paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'Player unavailable.'); activePaneId = pane.id; await saveSessions(); await notify(); return ok('Selected controls; window focus and audio choice preserved.'); });
    case 'FOCUS_PANE': return runManaged(async () => {
      const pane = await requirePane(command.paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'Player unavailable.');
      await chrome.tabs.update(pane.tabId, { active: true }); await chrome.windows.update(pane.windowId, { focused: true });
      activePaneId = pane.id; await saveSessions(); await notify(); return ok('Feed focused; audio choice unchanged.');
    });
    case 'GET_DRAWER_STATE': return contentSender ? { opened: openDrawers.has(sender.tab!.id!) } : fail('INVALID_SENDER', 'Drawer state belongs to the requesting YouTube TV tab.');
    case 'SET_DRAWER_STATE': {
      if (!contentSender || typeof command.opened !== 'boolean') return fail('INVALID_SENDER', 'Only the current YouTube TV content tab can set its drawer state.');
      if (command.opened) openDrawers.add(sender.tab!.id!); else openDrawers.delete(sender.tab!.id!);
      await saveDrawers(); return ok();
    }
    case 'NATIVE_VOLUME_INPUT': {
      if (!contentSender || !validId(command.playerKey)) return fail('INVALID_SENDER', 'Native volume belongs to its current content player.');
      const tabId = sender.tab!.id!; const identity = playerIdentities.get(tabId);
      if (!controlledIds().includes(tabId) || identity?.playerKey !== command.playerKey || identity.documentId !== sender.documentId) return fail('SUPERSEDED', 'Native player changed.');
      if (!command.observation) {
        if (observations.get(tabId)?.route !== 'watch' || (observations.get(tabId)?.playback.readyState ?? 0) < 2) return fail('PLAYER_LOADING', 'Wait for the native watch player.');
        invalidateVolume(tabId);
        nativeVolumePending.set(tabId, { ...identity, epoch: volumeEpochs.get(tabId)! });
        volumeRecoveryStatus.set(tabId, 'Waiting for native volume choice'); return ok();
      }
      const pending = nativeVolumePending.get(tabId); const clean = cleanObservation(command.observation);
      if (!pending || pending.epoch !== volumeEpochs.get(tabId)) return fail('SUPERSEDED', 'A newer choice replaced native settlement.');
      if (!clean || clean.route !== 'watch' || (clean.playback.readyState ?? 0) < 2 || clean.playback.volume == null) { volumeRecoveryStatus.set(tabId, 'Native choice unconfirmed; use native volume'); return fail('SUPERSEDED', 'Native volume not confirmed on the current watch player.'); }
      nativeVolumePending.delete(tabId);
      volumeChoices.set(tabId, { volume: clean.playback.volume, playerKey: command.playerKey, appliedAt: clean.observedAt });
      volumeRecoveryStatus.set(tabId, 'Native choice retained'); await observe(tabId, clean); await saveVolumeChoices(); await notify(); return ok();
    }
    case 'OBSERVE': {
      if (contentSender) {
        const tabId = sender.tab!.id!;
        const clean = cleanObservation(command.observation); if (!clean) return fail('INVALID_OBSERVATION', 'Player observation unavailable.');
        const prior = observations.get(tabId);
        if (prior && Date.parse(clean.observedAt) < Date.parse(prior.observedAt)) return ok();
        const identity = validId(command.playerKey) ? { playerKey: command.playerKey!, documentId: validId(sender.documentId) ? sender.documentId : undefined } : undefined;
        if (identity) {
          const priorIdentity = playerIdentities.get(tabId);
          if (priorIdentity?.playerKey !== identity.playerKey || priorIdentity.documentId !== identity.documentId) invalidateVolume(tabId);
          playerIdentities.set(tabId, identity);
        }
        await observe(tabId, clean);
        if (identity) await runManaged(() => reconcileVolume(tabId, identity.playerKey, identity.documentId));
      }
      return ok();
    }
    case 'GET_SNAPSHOT': return snapshot(contentSender ? sender.tab!.id : undefined);
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
      return runManaged(async () => {
        if (!preferencesReadable) return fail('STORAGE_UNAVAILABLE', 'Preferences could not be read; existing values preserved.');
        // Current/previous/recents are confirmed-playback state, not editable preferences.
        const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent, nightMuteLock: _mute, ...patch } = command.patch ?? {};
        const candidate = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: false });
        try { await savePreferences(candidate); }
        catch { return fail('STORAGE_UNAVAILABLE', 'Preferences were not saved. Retry when local storage is available.'); }
        // Do not show an uncommitted patch or roll back unrelated observations received during the write.
        preferences = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: false });
        await notify(); return ok('Local preferences saved.');
      });
    }
    case 'WATCH_PROGRAM':
    case 'ADD_PROGRAM':
    case 'REPLACE_PROGRAM': {
      const act = async () => {
        const listing = sportsListings(guideFor(mainTabId)).find(item => item.entry.channel.id === command.channelId && item.program.title === command.title && item.entry.observedAt === command.observedAt);
        if (!listing || !listingPlayable(listing)) return fail('TARGET_UNAVAILABLE', 'This program changed or has no fresh current target. Open native Live to recover listings.');
        return command.type === 'ADD_PROGRAM' ? createPane(command.channelId) : command.type === 'REPLACE_PROGRAM' ? replacePane(command.paneId, command.channelId) : navigate(command.channelId, mainTabId);
      };
      return runManaged(act);
    }
    case 'CREATE_PANE': return runManaged(() => createPane(command.channelId));
    case 'REPLACE_PANE': return runManaged(() => replacePane(command.paneId, command.channelId));
    case 'SELECT_PANE': return runManaged(() => selectPane(command.paneId));
    case 'EXPAND_PANE': return runManaged(async () => { const result = workspace.snapshot().enrolled ? await workspace.expand(command.paneId) : await expandPane(command.paneId); if (result.ok) { expandedPaneId = command.paneId; await saveControlIdentity(); } await notify(); return result; });
    case 'RESTORE_LAYOUT': return runManaged(async () => { const result = workspace.snapshot().enrolled ? await workspace.restore() : await restoreLayout(); if (result.ok) { expandedPaneId = undefined; await saveControlIdentity(); } await notify(); return result; });
    case 'REMOVE_PANE': return runManaged(() => removePane(command.paneId));
    case 'MUTE': return runManaged(() => muteAll());
    case 'AUDIO': {
      const targetId = activePaneId && activePaneId !== 'main' ? panes.find(p => p.id === activePaneId)?.tabId : mainTabId;
      const validVolume = typeof command.volume === 'number' && Number.isFinite(command.volume) && command.volume >= 0 && command.volume <= 1;
      // Receipt of a newer choice cancels an in-flight recovery before the managed queue reaches it.
      if (targetId && validVolume) invalidateVolume(targetId);
      const requestEpoch = targetId ? volumeEpochs.get(targetId) ?? 0 : 0;
      return runManaged(async () => {
      if ((command.muted !== undefined && typeof command.muted !== 'boolean') || (command.volume !== undefined && (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1))) return fail('INVALID_AUDIO', 'Invalid audio choice.');
      const pane = await requirePane(activePaneId ?? 'main'); if (!pane) return fail('PANE_UNAVAILABLE', 'Open the original player first.');
      try {
        if (command.volume !== undefined) {
          if (pane.tabId !== targetId || (volumeEpochs.get(pane.tabId) ?? 0) !== requestEpoch) return fail('SUPERSEDED', 'A later choice replaced this request.');
          const identity = playerIdentities.get(pane.tabId);
          const reply = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'PLAYER_AUDIO', volume: command.volume, playerKey: identity?.playerKey }), identity?.documentId ? { documentId: identity.documentId } : undefined);
          if (pane.tabId !== targetId || (volumeEpochs.get(pane.tabId) ?? 0) !== requestEpoch || !controlledIds().includes(pane.tabId)) return fail('SUPERSEDED', 'A later choice or player replaced this request.');
          if (!reply?.ok || Math.abs((reply.value?.volume ?? -1) - command.volume) > .001) throw new Error(volumeFailure(reply));
          const prior = observations.get(pane.tabId); if (prior) prior.playback.volume = reply.value.volume;
          volumeChoices.set(pane.tabId, { volume: reply.value.volume, playerKey: identity?.playerKey ?? 'awaiting-player', appliedAt: new Date().toISOString() });
          volumeRecoveryStatus.set(pane.tabId, identity ? 'Explicit choice retained' : 'Choice retained; waiting for player identity');
          await saveVolumeChoices();
        }
        if (command.muted === true) { await muteSource(pane.tabId, 'explicit selected mute'); if (audioFocusId === pane.id) audioFocusId = undefined; }
        if (command.muted === false) return selectPane(pane.id);
        await notify(); return ok('Player audio choice read back; system volume unchanged.');
      } catch (error) {
        const reason = 'Player audio operation failed; use the original player or retry.';
        if (command.volume !== undefined) {
          if (pane.tabId === targetId && (volumeEpochs.get(pane.tabId) ?? 0) === requestEpoch && controlledIds().includes(pane.tabId)) {
            const choice = volumeChoices.get(pane.tabId) ?? { volume: command.volume, playerKey: 'unconfirmed' };
            const identity = playerIdentities.get(pane.tabId);
            volumeAttempts.set(pane.tabId, { choice, playerKey: identity?.playerKey ?? 'unconfirmed', documentId: identity?.documentId, count: 0, lastAt: 0, error: reason });
            volumeRecoveryStatus.set(pane.tabId, 'Explicit volume unavailable; use native volume');
            logVolume(pane.tabId, command.volume, 'refused', volumeFailure({ audioFailure: error instanceof Error ? error.message : undefined }));
          }
        } else audioError = reason;
        await notify(); return fail('AUDIO_FAILED', reason);
      }
    }); }

    case 'REFRESH': await refreshObservations(); await notify(); return ok('Refreshed observable player and guide state.');
    default: return fail('UNSUPPORTED', 'This operation is unavailable.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message) || ['STATE_CHANGED', 'GET_OBSERVATION', 'TOGGLE_DESKTOP', 'PLAYER_AUDIO'].includes(message.type)) return false;
  void handle(message, sender).then(sendResponse, () => {
    failures.record('COMMAND_FAILED');
    sendResponse(fail('UNKNOWN', 'The extension operation did not complete. Browser changes may already have occurred; inspect current state before retrying. Use the original player as fallback.'));
  }).catch(() => failures.record('COMMAND_FAILED'));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  const removedSourceId = sourceId(tabId);
  if (audioFocusId === removedSourceId) audioFocusId = undefined;
  if (activePaneId === removedSourceId) activePaneId = 'main';
  if (expandedPaneId === removedSourceId) expandedPaneId = undefined;
  invalidateVolume(tabId); volumeChoices.delete(tabId); playerIdentities.delete(tabId);
  observations.delete(tabId); tabAudio.delete(tabId); confirmedTabs.delete(tabId); const removedMain = mainTabId === tabId; if (removedMain) mainTabId = undefined;
  const removed = panes.some(pane => pane.tabId === tabId); panes = panes.filter(pane => pane.tabId !== tabId);
  void init.then(() => runManaged(async () => {
    // Independent cleanup writes must all be attempted even if one storage area fails.
    const results = await Promise.allSettled([saveVolumeChoices(),
      openDrawers.delete(tabId) ? saveDrawers() : Promise.resolve(), removed || removedMain ? saveSessions() : Promise.resolve()]);
    if (results.some(result => result.status === 'rejected')) failures.record('TAB_CLOSE_FAILED');
    if (removed || removedMain) { await workspace.reflow(); await notify(); }
  })).catch(() => failures.record('TAB_CLOSE_FAILED'));
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) { invalidateVolume(tabId); playerIdentities.delete(tabId); observations.delete(tabId); confirmedTabs.delete(tabId); }
  if (isYTTV(tab.url) && controlledIds().includes(tabId) && panes.length && !handoffRunning && sourceId(tabId) !== audioFocusId && change.mutedInfo?.muted === false)
    void setTabMuted(tabId, true, 'tab update inactive feed').catch(() => { audioError = 'Inactive feed mute failed; use Mute all and inspect audio readback.'; });
});

chrome.action?.onClicked?.addListener(() => { void workspace.openRemote().catch(() => failures.record('COMMAND_FAILED')); });
chrome.system?.display?.onDisplayChanged?.addListener(() => { void init.then(() => runManaged(async () => { await workspace.reflow(); await notify(); })).catch(() => failures.record('COMMAND_FAILED')); });
