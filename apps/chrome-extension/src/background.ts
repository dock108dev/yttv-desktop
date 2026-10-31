import { createNetflixConnection, NETFLIX_NAMESPACE, netflixContent } from './netflix';
import { createPrimeVideoConnection, PRIME_VIDEO_NAMESPACE, primeVideoContent } from './prime-video';
import { createYouTubeConnection, youtubeContent, YOUTUBE_NAMESPACE } from './youtube';
import type { PlayerObservation, ProviderCommand } from '../../../packages/core/src/media';
import { mediaObservation } from '../../../packages/yttv-adapter/src/media';
import { createMixedWorkspace } from './mixed-workspace';
import { cleanObservation, createGuideCatalog } from './observations';
import { MANAGED_RECOVERY_KEY, restoredBounds, type Bounds } from './recovery';
import { createGuideSync, isGuideSyncURL } from './guide-sync';
import { captureUsable, continuity, type PlayerCapture } from './continuity';
import { createWorkspace } from './workspace';
import { defaultChannel } from './default-channel';
import { createAreaPickerSession } from './area-picker-session';
import { contains, planLayout } from '../../../packages/quadbox/src/geometry';
import { canAddManagedFeed, CURRENT_MANAGED_FEED_LIMIT, MANAGED_FEED_COUNTS } from '../../../packages/quadbox/src/policy';
import { sportsListings, listingPlayable } from '../../../packages/sports-engine/src/guide';
import { createAudioFocusController, createAudioState, type AudioState } from '../../../packages/quadbox/src/index';
import { watchNavigationUrl, type GuideEntry } from '../../../packages/core/src/index';
import { createPreferencesStore, defaultPreferences, patchPreferences, recordConfirmedSwitch, type Preferences } from '../../../packages/storage/src/index';
import { createGuideMetadataStore } from '../../../packages/storage/src/guide-cache';
import { freshLiveTarget, type AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { ActionResult, DesktopSnapshot, UIManagedPane } from '../../../packages/ui/src/types';
import { envelope, isMessage, validCommand, type Command } from './adapter';
import { createFailureDiagnostics, restoredAudioDiagnostics } from './diagnostics';

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
type VolumeChoice = { volume: number; playerKey: string; appliedAt?: string; muted?: true };
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
let audioEnableTarget: { tabId: number; playerKey: string; documentId?: string } | undefined;
const playerIdentities = new Map<number, { playerKey: string; documentId?: string }>();
let audioDiagnostics: NonNullable<DesktopSnapshot['audioDiagnostics']> = [];
let audioLogQueue: Promise<unknown> = Promise.resolve();
const DRAWER_KEY = 'yttv-desktop.open-drawers.v1';

type Pane = UIManagedPane & { windowId: number; tabId: number; savedBounds?: Bounds };
const guideMetadata = createGuideMetadataStore({
  get: async key => (await chrome.storage.local.get(key))[key],
  set: async (key, value) => { await chrome.storage.local.set({ [key]: value }); },
});
const preferencesStore = createPreferencesStore({
  get: async key => (await chrome.storage.local.get(key))[key],
  set: async (key, value) => { await chrome.storage.local.set({ [key]: value }); },
});
let preferences = defaultPreferences();
let preferencesReadable = true;
const confirmedTabs = new Set<number>();
let panes: Pane[] = []; let activePaneId: string | undefined; let expandedPaneId: string | undefined;
let mainTabId: number | undefined;
const requestedClosures = new Set<number>();
let mainWasDesignated = false;
let mainWasCreated = false;
let mainEvent: { eventId: string; channelId: string } | undefined;
let audioFocusId: string | undefined;
let audioError: string | undefined;
let handoffRunning = false;
const tabAudio = new Map<number, { tabMuted: boolean | null; tabMuteReason?: string }>();
const guideCatalog = createGuideCatalog();
const guideSync = createGuideSync(chrome, () => notify());
let remoteGuideRequested = false;
let expirySyncGeneration: string | undefined;
const playingSeen = new Set<number>();
async function syncGuide() {
  await init;
  if (!mainTabId) return;
  const tab = await chrome.tabs.get(mainTabId).catch(() => undefined);
  if (tab && (isYTTV(tab.url) || optionalOwner(mainTabId))) await guideSync.request(tab.windowId);
}
const observations = new Map<number, AdapterObservation>();
const openDrawers = new Set<number>();
let pendingFeedCreations = 0;
let managedQueue: Promise<unknown> = Promise.resolve();
let drawerWriteQueue: Promise<void> = Promise.resolve();
function runManaged<T>(operation: () => Promise<T>): Promise<T> {
  const next = managedQueue.catch(() => undefined).then(operation); managedQueue = next; return next;
}
const workspace = createWorkspace(chrome, controlledPanes);
const areaPicker = createAreaPickerSession(chrome);
const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (code: string, reason: string): ActionResult => ({ ok: false, code, reason });
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;
const isYTTV = (url?: string) => { try { return new URL(url ?? '').origin === 'https://tv.youtube.com'; } catch { return false; } };
// Chrome exposes pendingUrl before the blank tab commits its initial watch navigation.
// Only use this for already-owned extras, retaining their exact tab/window identity.
const pendingWatch = (tab: chrome.tabs.Tab) => (!tab.url || tab.url === 'about:blank') && Boolean(tab.pendingUrl && watchNavigationUrl(tab.pendingUrl));
// Recover only a recorded tab. Unknown lookup state retains ownership; confirmed
// absence or an observed non-YTTV destination can release it without closing anything.
async function lookupOwnedTab(tabId: number, windowId: number): Promise<chrome.tabs.Tab | undefined> {
  try { return await chrome.tabs.get(tabId); }
  catch {
    try { return (await chrome.tabs.query({})).find(tab => tab.id === tabId); }
    catch { return { id: tabId, windowId } as chrome.tabs.Tab; }
  }
}
const youtube = createYouTubeConnection(chrome, id => {
  playerIdentities.delete(id); observations.delete(id); mixed.revoke(id);
}, b => { const r = mixed.snapshot().record; return Boolean(r?.ownership.some(o => o.tabId === b.tabId && o.service === 'youtube' && o.slotId === b.slotId) && r.slots.some(s => s.id === b.slotId && s.generation === b.generation)); });
const primeVideo = createPrimeVideoConnection(chrome, id => {
  playerIdentities.delete(id); observations.delete(id); mixed.revoke(id);
}, b => { const r = mixed.snapshot().record; return Boolean(r?.ownership.some(o => o.tabId === b.tabId && o.service === 'prime-video' && o.slotId === b.slotId) && r.slots.some(s => s.id === b.slotId && s.generation === b.generation)); });
const netflix = createNetflixConnection(chrome, id => {
  playerIdentities.delete(id); observations.delete(id); mixed.revoke(id);
}, b => { const r = mixed.snapshot().record; return Boolean(r?.ownership.some(o => o.tabId === b.tabId && o.service === 'netflix' && o.slotId === b.slotId) && r.slots.some(s => s.id === b.slotId && s.generation === b.generation)); });
const providerFor = (id: number) => optionalOwner(id)?.service === 'netflix' ? netflix : optionalOwner(id)?.service === 'prime-video' ? primeVideo : youtube;
const providerName = (id: number) => optionalOwner(id)?.service === 'netflix' ? 'Netflix' : optionalOwner(id)?.service === 'prime-video' ? 'Prime Video' : 'YouTube';
const forgetProviders = (id: number) => { youtube.forget(id); primeVideo.forget(id); netflix.forget(id); };
const replacementVolumes = new Map<number, number>();
const optionalOwner = (id: number) => mixed.snapshot().record?.ownership.find(o => o.tabId === id && (o.service === 'youtube' || o.service === 'prime-video' || o.service === 'netflix'));
function acceptProvider(id: number, o: PlayerObservation) {
  if (o.capabilities.identity.state !== 'supported') { playerIdentities.delete(id); observations.delete(id); return; }
  playerIdentities.set(id, { playerKey: o.binding.playerKey, documentId: o.binding.documentId });
  observations.set(id, { mainPlayerUnique: true, guide: [], route: 'watch', observedAt: new Date(o.observedAt).toISOString(),
    playback: { playing: o.playing.state === 'known' ? o.playing.value : null, muted: o.muted.state === 'known' ? o.muted.value : null,
      volume: o.volume.state === 'known' ? o.volume.value : null, readyState: o.readiness === 'ready' ? 4 : 0, currentTime: null, width: null, height: null } });
}
async function providerCommand(id: number, command: ProviderCommand) {
  const o = await providerFor(id).execute(id, command);
  if (!o) return { ok: false, code: 'CONTROL_UNAVAILABLE', reason: 'Player control unconfirmed. Use native controls.' };
  acceptProvider(id, o);
  return { ok: true, value: observations.get(id)!.playback };
}
async function connectProviderOwner(id: number) {
  const owner = optionalOwner(id), slot = mixed.snapshot().record?.slots.find(s => s.id === owner?.slotId);
  if (!owner || !slot) return;
  const o = await providerFor(id).connect({ service: owner.service, tabId: id, windowId: owner.windowId, slotId: slot.id, generation: slot.generation, workerEpoch: workerStartedAt, documentId: '', playerKey: '' }, owner.ordinaryUrl);
  if (o) acceptProvider(id, o);
}
const mixed = createMixedWorkspace({
  available: service => service === 'netflix' ? netflix.permitted() : service === 'youtube' ? youtube.permitted() : service === 'prime-video' ? primeVideo.permitted() : Promise.resolve(true),
  uuid: () => crypto.randomUUID(), serial: runManaged, notify,
  get: async key => (await chrome.storage.local.get(key))[key],
  set: async (key, value) => { await chrome.storage.local.set({ [key]: value }); },
  legacy: async () => {
    if (!managedSessionReadable) throw Error('STORAGE_UNAVAILABLE');
    // Read both sources even when session ownership exists; read failure is not emptiness.
    await chrome.storage.local.get(MANAGED_RECOVERY_KEY);
    const result = [];
    for (const id of controlledIds()) {
      if (optionalOwner(id)) continue;
      const tab = await chrome.tabs.get(id);
      if (!tab.url || (!isYTTV(tab.url) && tab.url !== 'about:blank')) throw Error('IDENTITY_UNAVAILABLE');
      result.push({ tabId: id, windowId: tab.windowId, url: tab.url, original: id === mainTabId, createdHere: id === mainTabId ? mainWasCreated : !sourceId(id)?.startsWith('connected-') });
    }
    return result;
  },
  absent: async id => { try { await chrome.tabs.get(id); return false; } catch { try { return !(await chrome.tabs.query({})).some(t => t.id === id); } catch { return false; } } },
  liveTabs: controlledIds, pending: () => 0, // All creation reservations are now durable claims.
  target: channelId => targetFor(channelId)?.target?.url,
  preflight: async (count, newOriginal) => {
    if (!managedSessionReadable) return fail('STORAGE_UNAVAILABLE', 'Managed ownership is unavailable.');
    if (newOriginal) { const released = await workspace.releaseClosedOriginal(); if (!released.ok) return released; }
    return workspace.snapshot().layout === 'auto' ? ok() : workspace.validateLayout(count);
  },
  getTab: id => chrome.tabs.get(id),
  create: async () => { const w = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 780, height: 520 }); if (!w?.tabs?.[0]) throw Error('UNCERTAIN'); return w.tabs[0]; },
  captureReplacement: async owner => {
    if (owner.service === 'netflix') throw Error('NETFLIX_IDENTITY_UNVERIFIED');
    if (owner.service === 'prime-video') throw Error('PRIME_IDENTITY_UNVERIFIED');
    await retainNavigationAudio(owner.tabId);
    const volume = volumeChoices.get(owner.tabId)?.volume; if (volume !== undefined) replacementVolumes.set(owner.tabId, volume);
    forgetProviders(owner.tabId);
  },
  mute: async (owner, replacement) => {
    if (replacement) { addStarts.delete(owner.tabId); if (firstStart?.tabId === owner.tabId) cancelFirstStart(); if (owner.service === 'yttv') await retainNavigationAudio(owner.tabId); }
    const tab = await chrome.tabs.get(owner.tabId);
    if (tab.windowId !== owner.windowId || tab.url !== owner.ordinaryUrl) throw Error('SUPERSEDED');
    if ((await setTabMuted(owner.tabId, true, 'queue launch isolation'))?.mutedInfo?.muted !== true) throw Error('MUTE_FAILED');
    if (replacement && isYTTV(tab.url)) await muteSource(owner.tabId, 'queue replacement');
  },
  navigate: async (owner, url) => {
    const tab = await chrome.tabs.get(owner.tabId);
    if (tab.windowId !== owner.windowId || tab.url !== owner.ordinaryUrl || tab.mutedInfo?.muted !== true) throw Error('SUPERSEDED');
    forgetProviders(owner.tabId); observations.delete(owner.tabId); playerIdentities.delete(owner.tabId); confirmedTabs.delete(owner.tabId);
    await chrome.tabs.update(owner.tabId, { url, muted: true });
  },
  cleanup: async (owner, url) => {
    const tab = await chrome.tabs.get(owner.tabId);
    if (tab.windowId !== owner.windowId || tab.url !== url || tab.pendingUrl) return false;
    const tabs = await chrome.tabs.query({ windowId: owner.windowId });
    if (tabs.length !== 1 || tabs[0].id !== owner.tabId) return false;
    await chrome.tabs.remove(owner.tabId); return true;
  },
  enroll: async (owner, channelId, original, recovering) => {
    if (original) { if (mainTabId && mainTabId !== owner.tabId) throw Error('SUPERSEDED'); mainTabId = owner.tabId; mainWasDesignated = true; mainWasCreated = owner.createdHere; }
    else if (!panes.some(p => p.tabId === owner.tabId)) panes.push({ id: `mixed-${owner.slotId}`, tabId: owner.tabId, windowId: owner.windowId, channelId,
      service: owner.service, channelName: owner.service !== 'yttv' ? providerName(owner.tabId) : targetFor(channelId)?.channel.name ?? 'YouTube TV', feedNumber: mixed.snapshot().record?.slots.find(s => s.id === owner.slotId)!.order! + 1, muted: true });
    const pane = panes.find(p => p.tabId === owner.tabId); if (pane) Object.assign(pane, { channelId: owner.service !== 'yttv' ? 'native-video' : channelId, service: owner.service, channelName: owner.service !== 'yttv' ? providerName(owner.tabId) : targetFor(channelId)?.channel.name ?? 'YouTube TV' });
    if (recovering && pane && owner.service !== 'yttv') {
      const prior = (await readSession(SESSION_KEY))[SESSION_KEY] as { panes?: Pane[] } | undefined;
      const saved = prior?.panes?.find(p => p.tabId === owner.tabId && p.windowId === owner.windowId && p.service === owner.service);
      if (saved) { pane.savedBounds = restoredBounds(saved.savedBounds); if (validId(saved.id)) pane.id = saved.id; }
    }
    if (owner.service !== 'yttv') await connectProviderOwner(owner.tabId).catch(() => undefined);
    await saveControlIdentity().catch(() => failures.record('SESSION_WRITE_FAILED'));
    if (!recovering) {
      if (workspace.snapshot().intent && !workspace.snapshot().enrolled) await moveOriginal(false);
      await reflowWorkspace();
    }
  },
  verify: async (binding, channelId, url) => {
    if (binding.service === 'prime-video' || binding.service === 'netflix') return false; // Main-content identity/readiness not yet qualified.
    if (binding.service === 'youtube') { let o = await providerFor(binding.tabId).observe(binding.tabId);
      const volume = replacementVolumes.get(binding.tabId);
      if (o?.readiness === 'ready' && volume !== undefined) { o = await providerFor(binding.tabId).execute(binding.tabId, { type: 'volume', value: volume }); if (!o) return false; acceptProvider(binding.tabId, o); replacementVolumes.delete(binding.tabId); }
       const tab = await chrome.tabs.get(binding.tabId); return Boolean(o?.readiness === 'ready' && o.content?.service === 'youtube' && o.content.videoId === channelId && o.binding.playerKey === binding.playerKey && o.binding.documentId === binding.documentId && tab.url === url && tab.mutedInfo?.muted === true); }
    const nonce = crypto.randomUUID();
    const tab = await chrome.tabs.get(binding.tabId).catch(() => undefined);
    if (tab?.url !== url || tab.windowId !== binding.windowId || tab.mutedInfo?.muted !== true) return false;
    const raw = await chrome.tabs.sendMessage(binding.tabId, envelope({ type: 'GET_OBSERVATION', connectionNonce: nonce }), { documentId: binding.documentId }).catch(() => undefined);
    const clean = cleanObservation(raw), latest = await chrome.tabs.get(binding.tabId).catch(() => undefined);
    const media = clean ? mediaObservation(clean, binding, 1) : undefined;
    return media?.readiness === 'ready' && raw?.connectionNonce === nonce && raw?.playerKey === binding.playerKey && clean?.mainPlayerUnique === true && clean.currentChannelId === channelId && clean.route === 'watch' &&
      (clean.playback.readyState ?? 0) >= 2 && Date.now() - Date.parse(clean.observedAt) >= 0 && Date.now() - Date.parse(clean.observedAt) < 10_000 &&
      latest?.url === url && latest.windowId === binding.windowId && latest.mutedInfo?.muted === true && playerIdentities.get(binding.tabId)?.documentId === binding.documentId && playerIdentities.get(binding.tabId)?.playerKey === binding.playerKey;
  },
  focus: async owner => { const tab = await chrome.tabs.get(owner.tabId); if (tab.windowId !== owner.windowId) throw Error('SUPERSEDED'); await chrome.tabs.update(owner.tabId, { active: true }); await chrome.windows.update(owner.windowId, { focused: true }); },
  binding: tabId => { const identity = playerIdentities.get(tabId), windowId = tabId === mainTabId ? observations.has(tabId) ? mixed.snapshot().record?.ownership.find(o => o.tabId === tabId)?.windowId : undefined : panes.find(p => p.tabId === tabId)?.windowId;
    return identity?.documentId && windowId !== undefined ? { tabId, windowId, documentId: identity.documentId, playerKey: identity.playerKey } : undefined; },
  play: async binding => {
    const tab = await chrome.tabs.get(binding.tabId), owner = mixed.snapshot().record?.ownership.find(o => o.tabId === binding.tabId);
    if (!owner || tab.url !== owner.ordinaryUrl || tab.windowId !== binding.windowId || mixed.snapshot().record?.slots.find(s => s.id === binding.slotId)?.generation !== binding.generation) return fail('SUPERSEDED', 'Player changed. Use native Play.');
    return playback(sourceId(binding.tabId)!, true, true, binding);
  },
});
const init = (async () => {
  try {
    preferences = await preferencesStore.load();
  } catch { preferencesReadable = false; preferencePersistence = 'unavailable'; failures.record('PREFERENCES_READ_FAILED'); }
  await guideMetadata.load();

  const storedDrawers = (await readSession(DRAWER_KEY))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1000)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const priorLog = (await readSession(AUDIO_LOG_KEY))[AUDIO_LOG_KEY];
  audioDiagnostics = restoredAudioDiagnostics(priorLog);
  const choices = (await readSession(VOLUME_KEY))[VOLUME_KEY];
  if (Array.isArray(choices)) for (const item of choices.slice(0, 100)) {
    if (!Number.isInteger(item?.tabId) || !Number.isFinite(item?.volume) || item.volume < 0 || item.volume > 1 || !validId(item?.playerKey)) continue;
    try { if (isYTTV((await chrome.tabs.get(item.tabId)).url)) volumeChoices.set(item.tabId, { volume: item.volume, playerKey: item.playerKey, appliedAt: typeof item.appliedAt === 'string' ? item.appliedAt : undefined, ...(item.muted === true ? { muted: true } : {}) }); } catch { /* closed */ }
  }
  let session = (await readSession(SESSION_KEY))[SESSION_KEY] as Record<string, unknown> | undefined;
  if (!session && managedSessionReadable) {
    const backup = (await chrome.storage.local.get(MANAGED_RECOVERY_KEY))[MANAGED_RECOVERY_KEY] as any;
    if (backup && Array.isArray(backup.panes)) {
      const matches = async (id: number) => {
        const tab = await chrome.tabs.get(id).catch(() => undefined);
        return Boolean(tab && isYTTV(tab.url) && backup.ownedUrls?.[id] === tab.url);
      };
      const recovered = [];
      for (const pane of backup.panes.slice(0, CURRENT_MANAGED_FEED_LIMIT - 1)) if (await matches(pane?.tabId)) recovered.push(pane);
      session = { ...backup, panes: recovered, mainTabId: await matches(backup.mainTabId) ? backup.mainTabId : undefined };
    }
  }
  mainWasDesignated = session?.mainWasDesignated === true;
  const restoredEvent = session?.mainEvent as typeof mainEvent;
  if (restoredEvent && validId(restoredEvent.eventId) && validId(restoredEvent.channelId)) mainEvent = restoredEvent;
  if (session && Array.isArray(session.panes)) {
    for (const raw of session.panes.slice(0, CURRENT_MANAGED_FEED_LIMIT - 1)) {
      if (!raw || typeof raw !== 'object') continue;
      const pane = raw as Pane;
      if (pane.service && pane.service !== 'yttv' || !validId(pane.id) || pane.id === 'main' || !validId(pane.channelId) || !Number.isInteger(pane.tabId) || !Number.isInteger(pane.windowId) ||
          pane.tabId === session.mainTabId || panes.some(old => old.id === pane.id || old.tabId === pane.tabId)) continue;
      try {
        const tab = await lookupOwnedTab(pane.tabId, pane.windowId);
        if (!tab) continue;
        if (isYTTV(tab.url) || pendingWatch(tab) || !tab.url || tab.url === 'about:blank') {
          panes.push({ id: pane.id, channelId: pane.channelId, channelName: typeof pane.channelName === 'string' ? pane.channelName.slice(0, 150) : 'Added feed',
            feedNumber: Number.isInteger(pane.feedNumber) && pane.feedNumber! >= 2 && pane.feedNumber! <= CURRENT_MANAGED_FEED_LIMIT && !panes.some(p => p.feedNumber === pane.feedNumber) ? pane.feedNumber : MANAGED_FEED_COUNTS.slice(1).find(n => !panes.some(p => p.feedNumber === n)),
            eventId: validId(pane.eventId) ? pane.eventId : undefined, tabId: pane.tabId, windowId: tab.windowId, muted: null,
            savedBounds: restoredBounds(pane.savedBounds), error: pane.id === `cleanup-${pane.tabId}` && tab.url === 'about:blank' && !pendingWatch(tab) ? 'Automatic cleanup failed.' : undefined, status: pane.id === `cleanup-${pane.tabId}` && tab.url === 'about:blank' && !pendingWatch(tab) ? 'Creation failed; close this added window' : 'Restored window; playback not yet confirmed' });
          await readTabAudio(pane.tabId);
        }
      } catch { /* A closed session is not restored or silently recreated. */ }
    }
    // Restoring layout never restores audio authority.
    if ((!session.mainService || session.mainService === 'yttv') && Number.isInteger(session.mainTabId)) {
      try { const tab = await chrome.tabs.get(session.mainTabId as number); if (isYTTV(tab.url) && !panes.some(p => p.tabId === tab.id)) mainTabId = tab.id; mainWasDesignated = true; } catch { /* closed */ }
    }
    mainWasCreated = Boolean(mainTabId && session.mainWasCreated === true);
    if (mainTabId) await readTabAudio(mainTabId);
    const routed = controlledIds().filter(id => tabAudio.get(id)?.tabMuted === false);
    // Observe existing routing rather than replaying a saved enable or muting on reopen.
    if (routed.length === 1) audioFocusId = sourceId(routed[0]);
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
  try { const tab = await chrome.tabs.get(mainTabId); if (optionalOwner(mainTabId) ? tab.url !== optionalOwner(mainTabId)!.ordinaryUrl : !isYTTV(tab.url)) return null;
    const observed = observations.get(mainTabId);
    const requested = guideFor(mainTabId).find(e => e.target?.url === tab.url);
    const channelId = observed?.currentChannelId ?? requested?.channel.id ?? preferences.currentChannel ?? 'main-player';
    const name = optionalOwner(mainTabId) ? providerName(mainTabId) : guideFor(mainTabId).find(e => e.channel.id === channelId)?.channel.name ?? 'Original player';
    return { id: 'main', isMain: true, channelId, channelName: name, eventId: mainEvent?.eventId, tabId: mainTabId, windowId: tab.windowId, ...audioReadback(mainTabId), status: observed?.currentChannelId === channelId ? (confirmedTabs.has(mainTabId) ? 'Player observed advancing' : observed.playback.playing === false ? 'Player paused' : 'Player observed; playback not confirmed') : 'Original player; playback not confirmed' };
  } catch { return null; }
}
function orderedAdded(): Pane[] {
  const record = mixed.snapshot().record;
  const order = (pane: Pane) => record?.slots.find(s => s.id === record.ownership.find(o => o.tabId === pane.tabId)?.slotId)?.order ?? pane.feedNumber ?? 4;
  return [...panes].sort((a, b) => order(a) - order(b));
}
async function controlledPanes(): Promise<Pane[]> { const main = await mainPane(); return [...(main ? [main] : []), ...orderedAdded()]; }
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
// Capture current native choices before extension navigation, including opening Live.
// A guide with no player must retain the prior watch choice. Never recover an unmute.
async function retainNavigationAudio(tabId: number) {
  if (optionalOwner(tabId)) { const o = await providerFor(tabId).observe(tabId); if (o?.volume.state === 'known') volumeChoices.set(tabId, { volume: o.volume.value, playerKey: o.binding.playerKey }); return; }
  const raw = await chrome.tabs.sendMessage(tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined);
  const clean = cleanObservation(raw);
  if (!clean || clean.route !== 'watch' || !validId(raw?.playerKey) || clean.playback.volume == null) return;
  volumeChoices.set(tabId, { volume: clean.playback.volume, playerKey: raw.playerKey, appliedAt: clean.observedAt,
    ...(clean.playback.muted === true ? { muted: true } : {}) });
  invalidateVolume(tabId); await saveVolumeChoices();
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
  try { reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', volume: choice.volume, playerKey, ...(choice.muted === true ? { muted: true } : {}) }), documentId ? { documentId } : undefined); }
  catch { reply = { audioFailure: 'MESSAGE_UNAVAILABLE' }; }
  if (!current()) { logVolume(tabId, choice.volume, 'superseded'); return; }
  if (reply?.ok && Math.abs((reply.value?.volume ?? -1) - choice.volume) <= .001 && (choice.muted !== true || reply.value?.muted === true)) {
    attempt.error = undefined; attempt.failure = undefined;
    volumeRecoveryStatus.set(tabId, 'Restored on ready replacement'); logVolume(tabId, choice.volume, 'confirmed');
    volumeChoices.set(tabId, { ...choice, playerKey, appliedAt: new Date().toISOString() });
    const latest = observations.get(tabId); if (latest) { latest.playback.volume = reply.value.volume; if (choice.muted === true) latest.playback.muted = true; }
    await saveVolumeChoices();
  } else {
    attempt.error = volumeWarning; attempt.failure = reply?.audioFailure === 'MESSAGE_UNAVAILABLE' ? 'MESSAGE_UNAVAILABLE' : volumeFailure(reply);
    volumeRecoveryStatus.set(tabId, attempt.count >= 3 ? 'Recovery unavailable; use native volume' : 'Replacement refused or unavailable');
    logVolume(tabId, choice.volume, 'refused', attempt.failure);
  }
  await notify();
}
async function muteSource(tabId: number, cause: string) {
  const tab = await chrome.tabs.get(tabId); if (optionalOwner(tabId)) {
    if (tab.url !== optionalOwner(tabId)!.ordinaryUrl || tab.windowId !== optionalOwner(tabId)!.windowId) throw Error('PLAYER_CHANGED');
    await setTabMuted(tabId, true, cause); await readTabAudio(tabId);
    if (tabAudio.get(tabId)?.tabMuted !== true) throw Error('Browser mute unavailable');
    const reply = await providerCommand(tabId, { type: 'mute', value: true });
    if (!reply.ok) observations.delete(tabId); return;
  }
  if (!isYTTV(tab.url) && !(panes.some(p => p.tabId === tabId && p.windowId === tab.windowId) && pendingWatch(tab))) throw new Error('Controlled source left YouTube TV');
  await setTabMuted(tabId, true, cause); await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== true) throw new Error('Browser mute readback failed');
  // A muted tab is sufficient isolation even while its player is loading/unavailable.
  try { const identity = playerIdentities.get(tabId); if (!identity?.documentId) return;
    const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: true, playerKey: identity.playerKey }), { documentId: identity.documentId });
    const prior = observations.get(tabId); if (reply?.ok && prior) prior.playback = { ...prior.playback, ...reply.value };
  } catch { /* Browser mute already confirmed; player readback stays unknown/unchanged. */ }
}
const audioController = createAudioFocusController({ async setMuted(sessionId, muted) {
  const tabId = Number(sessionId); if (!controlledIds().includes(tabId)) throw new Error('Uncontrolled source');
  if (muted) { await muteSource(tabId, 'audio handoff isolate'); if (observations.get(tabId)?.playback.muted !== true || !playerIdentities.get(tabId)?.documentId) throw Error('Native mute readback unavailable'); return; }
  const tab = await chrome.tabs.get(tabId); if (!isYTTV(tab.url) && !optionalOwner(tabId)) throw new Error('Source changed');
  const identity = playerIdentities.get(tabId);
  if (!identity?.documentId || audioEnableTarget?.tabId !== tabId || audioEnableTarget.playerKey !== identity.playerKey || audioEnableTarget.documentId !== identity.documentId) throw new Error('Player identity unavailable or changed');
  const reply = optionalOwner(tabId) ? await providerCommand(tabId, { type: 'mute', value: false }) : await chrome.tabs.sendMessage(tabId, envelope({ type: 'PLAYER_AUDIO', muted: false, playerKey: identity.playerKey }), { documentId: identity.documentId });
  if (playerIdentities.get(tabId)?.playerKey !== identity.playerKey || playerIdentities.get(tabId)?.documentId !== identity.documentId) throw new Error('Player changed');
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
  try { await preferencesStore.save(value); preferencePersistence = 'saved'; }
  catch { preferencePersistence = 'unavailable'; failures.record('PREFERENCES_WRITE_FAILED'); throw new Error('Preferences were not saved.'); }
}
async function saveControlIdentity() {
  if (!managedSessionReadable) throw new Error('Managed sessions could not be read; existing records preserved.');
  try {
    const record = { panes, mainService: mainTabId && optionalOwner(mainTabId) ? optionalOwner(mainTabId)!.service : 'yttv', mainTabId, mainWasDesignated, mainWasCreated, mainEvent, activePaneId, expandedPaneId };
    await chrome.storage.session.set({ [SESSION_KEY]: record });
    const ownedUrls: Record<number, string> = {};
    for (const id of controlledIds()) { const tab = await chrome.tabs.get(id).catch(() => undefined); if (isYTTV(tab?.url)) ownedUrls[id] = tab!.url!; }
    await chrome.storage.local.set({ [MANAGED_RECOVERY_KEY]: { ...record, ownedUrls } });
    await mixed.syncLegacy();
  }
  catch { failures.record('SESSION_WRITE_FAILED'); throw new Error('Managed session state was not saved.'); }
}
async function saveSessions() {
  await saveControlIdentity();
  const legacyPanes = panes.filter(p => !optionalOwner(p.tabId));
  preferences.lastQuad = legacyPanes.length ? { id: 'managed-current', name: 'Managed windows',
    panes: legacyPanes.map(pane => ({ id: pane.id, channelId: pane.channelId, eventId: pane.eventId ?? null, target: null })), selectedPaneId: legacyPanes.some(p => p.id === activePaneId) ? activePaneId! : legacyPanes[0].id } : null;
  await savePreferences();
}
async function notify() {
  await chrome.runtime.sendMessage(envelope({ type: 'STATE_CHANGED' })).catch(() => undefined);
  let tabs: chrome.tabs.Tab[];
  try { tabs = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' }); }
  catch { failures.record('NOTIFY_FAILED'); return; }
  await Promise.all(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, envelope({ type: 'STATE_CHANGED' })).catch(() => undefined) : Promise.resolve()));
}
async function observe(tabId: number, raw: AdapterObservation, preserveAudio = false) {
  const clean = cleanObservation(raw); if (!clean) return;
  if (guideSync.owns(tabId)) {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (clean.route === 'guide' && isGuideSyncURL(tab?.url) && tab?.mutedInfo?.muted === true) {
      guideCatalog.retain(clean.guide);
      await guideMetadata.retain(clean.guide);
      guideSync.observed(tabId, clean.guide.length ? JSON.stringify(clean.guide) : '');
      await notify();
    }
    return;
  }
  const prior = observations.get(tabId);
  if (prior && Date.parse(clean.observedAt) < Date.parse(prior.observedAt)) return;
  // A hard navigation temporarily reports no guide. Retain its volatile metadata until a
  // fresh Live guide replaces it, rather than persisting transient watch targets to disk.
  const observation = clean.guide.length || !prior?.guide.length ? clean : { ...clean, guide: prior.guide, guideObservedAt: prior.guideObservedAt };
  const advancing = observation.currentChannelId && observation.currentChannelId === prior?.currentChannelId &&
    observation.route === 'watch' && prior?.route === 'watch' && observation.playback.playing && prior.playback.playing && typeof observation.playback.currentTime === 'number' &&
    typeof prior.playback.currentTime === 'number' && observation.playback.currentTime > prior.playback.currentTime + .05;
  observations.set(tabId, observation);
  const pendingError = playbackErrors.get(tabId);
  if (pendingError && observation.route === 'watch' && (observation.playback.readyState ?? 0) >= 2 && observation.playback.playing === pendingError.playing) playbackErrors.delete(tabId);
  if (advancing) confirmedTabs.add(tabId); else confirmedTabs.delete(tabId);
  if (clean.route === 'guide') await guideMetadata.retain(clean.guide);
  await readTabAudio(tabId);
  if (mainTabId === undefined && !mainWasDesignated && !panes.some(pane => pane.tabId === tabId)) { mainTabId = tabId; mainWasDesignated = true; await saveControlIdentity(); }
  if (controlledIds().includes(tabId)) guideCatalog.retain(clean.guide);
  if (controlledIds().includes(tabId) && clean.route === 'watch' && clean.playback.playing && !playingSeen.has(tabId)) {
    playingSeen.add(tabId); void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED'));
  }
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
  await guideSync.ready;
  if (requestingTabId && (guideSync.owns(requestingTabId) || isGuideSyncURL((await chrome.tabs.get(requestingTabId).catch(() => undefined))?.url))) requestingTabId = undefined;
  if (!mainTabId && !mainWasDesignated && requestingTabId && !panes.some(pane => pane.tabId === requestingTabId)) { mainTabId = requestingTabId; mainWasDesignated = true; await saveControlIdentity(); }
  if (mainTabId) { try { const tab = await chrome.tabs.get(mainTabId); if (isYTTV(tab.url) || optionalOwner(mainTabId)) return mainTabId; } catch { mainTabId = undefined; } }
  if (mainWasDesignated) return undefined;
  if (mixed.snapshot().record?.ownership.some(o => mixed.snapshot().record?.slots.find(s => s.id === o.slotId)?.role === 'original')) return undefined;
  const tabs = (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' })).filter(tab => !guideSync.owns(tab.id!) && !isGuideSyncURL(tab.url));
  const tab = tabs.find(item => item.active && !panes.some(pane => pane.tabId === item.id)) ?? tabs.find(item => !panes.some(pane => pane.tabId === item.id));
  mainTabId = tab?.id; if (mainTabId) mainWasDesignated = true; if (mainTabId) await saveControlIdentity(); return mainTabId;
}
const reconnectAttempts = new Set<number>();
const observationRefreshAt = new Map<number, number>();
async function refreshObservations(preserveAudio = true) {
  await Promise.all(controlledIds().map(async tabId => {
    observationRefreshAt.set(tabId, Date.now());
    try {
      if (optionalOwner(tabId)) { const o = await providerFor(tabId).observe(tabId); if (o) acceptProvider(tabId, o); return; }
      const currentTab = await chrome.tabs.get(tabId); if (!isYTTV(currentTab.url)) return;
      let raw = await chrome.tabs.sendMessage(tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined);
      if (!cleanObservation(raw) && !reconnectAttempts.has(tabId)) {
        if (await chrome.permissions?.contains({ permissions: ['scripting'] })) {
          reconnectAttempts.add(tabId);
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
          raw = await chrome.tabs.sendMessage(tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined);
        }
      }
      if (cleanObservation(raw)) await observe(tabId, raw, preserveAudio);
    } catch { /* Known window stays counted; native controls remain available. */ }
  }));
}
function guideFor(tabId?: number): GuideEntry[] {
  const ownedIds = controlledIds();
  const sources = [...observations.entries()].filter(([id]) => ownedIds.includes(id));
  if (tabId && !sources.some(([id]) => id === tabId) && observations.has(tabId)) sources.push([tabId, observations.get(tabId)!]);
  return guideCatalog.rows(guideMetadata.rows, sources.map(([, source]) => source));
}
async function snapshot(requestingTabId?: number): Promise<DesktopSnapshot> {
  await workspace.ready;
  const tabId = await chooseTab(requestingTabId);
  for (const pane of [...panes]) await requirePane(pane.id);
  if (activePaneId && !(activePaneId === 'main' ? tabId : panes.some(p => p.id === activePaneId))) {
    activePaneId = tabId ? 'main' : panes[0]?.id; await saveControlIdentity();
  }
  if (!activePaneId) activePaneId = tabId ? 'main' : panes[0]?.id;
  if (controlledIds().some(id => !observations.has(id) && Date.now() - (observationRefreshAt.get(id) ?? 0) > 1000)) await refreshObservations();
  if (tabId) await readTabAudio(tabId);
  for (const pane of panes) await readTabAudio(pane.tabId);
  const observation = tabId ? observations.get(tabId) : undefined; const guide = guideFor(tabId);
  const watchTabs = (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' }).catch(() => [] as chrome.tabs.Tab[])).filter(tab => tab.id && isYTTV(tab.url) && new URL(tab.url!).pathname.startsWith('/watch'));
  const openPlayerWindowCount = new Set(watchTabs.map(tab => tab.windowId)).size;
  const unassignedPlayers = watchTabs.filter(tab => !controlledIds().includes(tab.id!)).slice(0, 50).map(tab => ({ tabId: tab.id!, label: (tab.title || 'Existing YouTube TV player').slice(0, 150) }));
  const originalMissing = !tabId && mainWasDesignated;
  if (remoteGuideRequested && guide.length && !guide.some(entry => entry.target)) {
    const generation = guide.map(entry => entry.observedAt).sort().at(-1);
    if (generation !== expirySyncGeneration) { expirySyncGeneration = generation; void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED')); }
  }
  const originalCandidates = originalMissing ? (await chrome.tabs.query({ url: 'https://tv.youtube.com/*' })).filter(t => t.id && isYTTV(t.url) && !guideSync.owns(t.id) && !isGuideSyncURL(t.url) && new URL(t.url!).pathname.startsWith('/watch') && !panes.some(p => p.tabId === t.id)).slice(0, 50).map((t, i) => ({ tabId: t.id!, label: `Player ${i + 1} · ${(observations.get(t.id!)?.currentProgram || t.title || 'YouTube TV').slice(0, 150)}` })) : [];
  const youtubeEnabled = await youtube.permitted();
  const youtubeCandidates = youtubeEnabled ? (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).filter(t => youtubeContent(t.url)).slice(0, 50).map(t => ({ tabId: t.id!, label: (t.title || 'YouTube video').slice(0, 150) })) : [];
  const primeVideoEnabled = await primeVideo.permitted();
  const primeVideoCandidates = primeVideoEnabled ? (await chrome.tabs.query({ url: 'https://www.primevideo.com/*' })).filter(t => primeVideoContent(t.url)).slice(0, 50).map(t => ({ tabId: t.id!, label: (t.title || 'Prime Video').slice(0, 150) })) : [];
  const netflixEnabled = await netflix.permitted();
  const netflixCandidates = netflixEnabled ? (await chrome.tabs.query({ url: 'https://www.netflix.com/*' })).filter(t => netflixContent(t.url)).slice(0, 50).map(t => ({ tabId: t.id!, label: (t.title || 'Netflix').slice(0, 150) })) : [];
  return { netflixEnabled, netflixCandidates, primeVideoEnabled, primeVideoCandidates, youtubeEnabled, youtubeCandidates, mixed: mixed.snapshot(), openingDefaultShow: Boolean(firstStart), openPlayerWindowCount, unassignedPlayers, guideSyncStatus: guideSync.status, originalMissing, originalCandidates, workspace: { ...workspace.snapshot(), enrolled: workspace.snapshot().enrolled && Boolean(tabId) }, pendingFeedCreations: Math.max(0, mixed.capacity() - controlledIds().length), feedLimit: CURRENT_MANAGED_FEED_LIMIT, mode: 'extension', connection: observation ? 'connected' : 'waiting',
    failureDiagnostics: failures.snapshot(), preferencePersistence, guideCacheDiagnostics: guideMetadata.diagnostics,
    guideObservedAt: guide.length ? new Date(Math.max(...guide.map(row => Date.parse(row.observedAt)))).toISOString() : undefined,
    currentConfirmed: Boolean(tabId && confirmedTabs.has(tabId) && observation?.currentChannelId === preferences.currentChannel),
    statusMessage: guideSync.status === 'loading' ? 'Loading channels automatically; current playback stays unchanged.' : guideSync.status === 'unavailable' ? 'Automatic channel loading unavailable. Add current content or use native Live as fallback.' : guide.length && !guide.some(entry => entry.target) ? 'Awaiting fresh native channel data; saved listings cannot authorize navigation.' : guide.length ? 'Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Audio labels describe player and tab routing; listening is a separate check.' : 'Channels load automatically when the remote opens or an owned player starts. Normal playback remains available.',
    currentChannelId: preferences.currentChannel ?? undefined, currentProgram: observation?.currentChannelId === preferences.currentChannel ? observation.currentProgram : undefined,
    playback: { playing: observation?.playback.playing ?? null, ...audioReadback(tabId) }, guide, preferences,
    panes: [...(tabId ? [await mainPane()] : []), ...orderedAdded()].filter((pane): pane is Pane => Boolean(pane)).map(({ savedBounds: _bounds, ...pane }) => ({ ...pane, service: optionalOwner(pane.tabId) ? optionalOwner(pane.tabId)!.service : 'yttv' as const, providerCapabilities: optionalOwner(pane.tabId) ? providerFor(pane.tabId).get(pane.tabId)?.observation?.capabilities ?? null : undefined, ...audioReadback(pane.tabId), playbackState: addStarts.has(pane.tabId) || firstStart?.tabId === pane.tabId ? 'loading' : !observations.get(pane.tabId) || observations.get(pane.tabId)?.route !== 'watch' ? 'unavailable' : (observations.get(pane.tabId)?.playback.readyState ?? 0) < 2 ? 'loading' : observations.get(pane.tabId)?.playback.playing === true ? 'playing' : observations.get(pane.tabId)?.playback.playing === false ? 'paused' : 'unavailable', error: playbackErrors.get(pane.tabId)?.reason ?? pane.error })), activePaneId, expandedPaneId, audioFocusId, audioError: [audioError, ...controlledIds().map(id => observations.get(id)?.route === 'watch' ? volumeAttempts.get(id)?.error : undefined)].filter(Boolean).join(' ') || undefined, audioDiagnostics, volumeDiagnostics,
    volumeRecovery: { savedVolume: volumeChoices.get(tabId!)?.volume ?? null, playerTracked: playerIdentities.has(tabId!), documentBound: Boolean(playerIdentities.get(tabId!)?.documentId), attempts: volumeAttempts.get(tabId!)?.count ?? 0, failure: volumeAttempts.get(tabId!)?.failure, status: volumeRecoveryStatus.get(tabId!) ?? 'No recovery request in this worker' },
    capabilities: { navigation: guide.some(entry => Boolean(entry.target)), guide: guide.length > 0, managedWindows: managedSessionReadable, audio: managedSessionReadable && observation?.playback.muted !== null && observation?.playback.muted !== undefined }, observedAt: observation?.observedAt };
}
async function navigate(channelId: string, requestingTabId?: number): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_CHANNEL', 'A channel identifier is required.');
  const tabId = await chooseTab(requestingTabId);
  if (tabId && optionalOwner(tabId)) return fail('USE_QUEUE', 'Use the queue to replace this video with YouTube TV.');
  if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome and its native Live guide first.');
  if (!guideFor(tabId).some(entry => entry.channel.id === channelId && freshLiveTarget(entry))) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this channel target is unavailable or stale.');
  try {
    await retainNavigationAudio(tabId);
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: 'NAVIGATE', channelId }));
    if (result?.ok && result.value) { await observe(tabId, result.value); return ok('Channel confirmed on the original player.'); }
    return fail(result?.code ?? 'UNKNOWN', result?.reason ?? 'The original player did not confirm this channel.');
  } catch { return fail('NAVIGATION_PENDING', 'A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.'); }
}
function targetFor(channelId: string): GuideEntry | undefined { return guideFor(mainTabId).find(entry => entry.channel.id === channelId && entry.available && entry.target); }
async function requirePane(paneId: string): Promise<Pane | null> {
  const pane = paneId === 'main' ? await mainPane() : panes.find(item => item.id === paneId); if (!pane) return null;
  const tab = await lookupOwnedTab(pane.tabId, pane.windowId);
  if (tab && optionalOwner(pane.tabId) && tab.url !== optionalOwner(pane.tabId)!.ordinaryUrl) return null;
  if (tab && (optionalOwner(pane.tabId) || isYTTV(tab.url) || pendingWatch(tab) || pane.error && tab.url === 'about:blank')) {
    // Ownership follows the known tab when the owner moves it; detection never moves it back.
    if (pane.windowId !== tab.windowId) { pane.windowId = tab.windowId; await saveControlIdentity(); }
    return pane;
  }
  if (tab && (!tab.url || tab.url === 'about:blank')) {
    observations.delete(pane.tabId); pane.status = 'Known window is loading; native controls remain available.';
    return null; // Retain its count/slot but do not dispatch player mutations yet.
  }
  await mixed.closed(pane.tabId);
  panes = panes.filter(item => item.id !== paneId); await saveSessions(); return null;
}
const addStarts = new Map<number, { pane: Pane; deadline: number; url: string; identity?: { playerKey: string; documentId?: string } }>();
const playbackErrors = new Map<number, { reason: string; playing: boolean }>();
async function playback(paneId: string, playing: boolean, mutedStart = false, expected = playerIdentities.get(paneId === 'main' ? mainTabId! : panes.find(p => p.id === paneId)?.tabId!)): Promise<ActionResult> {
  const pane = await requirePane(paneId);
  if (!pane) return fail('PANE_UNAVAILABLE', 'Window unavailable. Use native Play/Pause.');
  const identity = playerIdentities.get(pane.tabId);
  if (optionalOwner(pane.tabId)) {
    if (!expected || identity?.playerKey !== expected.playerKey || identity?.documentId !== expected.documentId) return fail('SUPERSEDED', 'Player changed. Use native controls.');
    if (mutedStart && (await chrome.tabs.get(pane.tabId)).mutedInfo?.muted !== true) return fail('AUDIO_CHANGED', 'Use native Play.');
    return providerCommand(pane.tabId, { type: playing ? 'play' : 'pause' });
  }
  const observation = observations.get(pane.tabId);
  if (!expected || expected.playerKey !== identity?.playerKey || expected.documentId !== identity?.documentId) return fail('SUPERSEDED', 'Player changed. Use native Play/Pause.');
  if (!identity?.documentId || observation?.route !== 'watch' || (observation.playback.readyState ?? 0) < 2)
    return fail('PLAYER_LOADING', 'Player not ready. Use native Play/Pause.');
  const current = () => playerIdentities.get(pane.tabId)?.playerKey === identity.playerKey && playerIdentities.get(pane.tabId)?.documentId === identity.documentId && controlledIds().includes(pane.tabId);
  try {
    if (mutedStart && (await chrome.tabs.get(pane.tabId)).mutedInfo?.muted !== true) return fail('AUDIO_CHANGED', 'Audio changed; use native Play.');
    const reply = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'PLAYER_PLAYBACK', playerKey: identity.playerKey, playing, ...(mutedStart ? { mutedStart: true } : {}) }), { documentId: identity.documentId });
    if (!current()) return fail('SUPERSEDED', 'Player changed. Use native Play/Pause.');
    const tab = await chrome.tabs.get(pane.tabId);
    if (!current() || tab.windowId !== pane.windowId || !isYTTV(tab.url)) return fail('SUPERSEDED', 'Window changed. Use native Play/Pause.');
    if (!reply?.ok || reply.value?.playing !== playing) throw new Error(reply?.reason ?? 'Playback unconfirmed. Use native Play/Pause.');
    const latest = observations.get(pane.tabId); if (latest) latest.playback.playing = reply.value.playing;
    playbackErrors.delete(pane.tabId); await notify(); return ok(playing ? 'Playing observed; check the picture in the player.' : 'Paused.');
  } catch (error) {
    const reason = error instanceof Error && /Use native Play/.test(error.message) ? error.message : 'Playback unavailable or refused. Use native Play/Pause.';
    if (current()) playbackErrors.set(pane.tabId, { reason, playing });
    await notify(); return fail('PLAYBACK_REFUSED', reason);
  }
}
async function startAdded(tabId: number) {
  const start = addStarts.get(tabId); if (!start) return;
  if (start.pane.id === 'main' ? mainTabId !== tabId : !panes.includes(start.pane)) { addStarts.delete(tabId); return; }
  const identity = playerIdentities.get(tabId);
  if (start.identity && (start.identity.playerKey !== identity?.playerKey || start.identity.documentId !== identity?.documentId)) {
    addStarts.delete(tabId); playbackErrors.set(tabId, { reason: 'Player changed. Use native Play.', playing: true }); await notify(); return;
  }
  if (identity) start.identity = identity;
  if (Date.now() >= start.deadline) { addStarts.delete(tabId); playbackErrors.set(tabId, { reason: 'Startup timed out. Use native Play.', playing: true }); await notify(); return; }
  const observed = observations.get(tabId);
  if (!identity?.documentId || observed?.route !== 'watch' || (observed.playback.readyState ?? 0) < 2) return;
  addStarts.delete(tabId); // Exactly one request, including a refusal.
  await playback(start.pane.id, true, true);
}
const FIRST_LIVE_URL = 'https://tv.youtube.com/live';
let firstStart: { tabId: number; windowId: number; deadline: number; watchUrl?: string } | undefined;
let firstStartTimer: ReturnType<typeof setTimeout> | undefined;
function cancelFirstStart() {
  if (firstStartTimer) clearTimeout(firstStartTimer);
  if (firstStart) addStarts.delete(firstStart.tabId);
  firstStart = undefined; firstStartTimer = undefined;
}
function firstStartTimeout() {
  if (firstStartTimer) clearTimeout(firstStartTimer);
  const attempt = firstStart;
  firstStartTimer = setTimeout(() => { void runManaged(async () => {
    if (!attempt || firstStart !== attempt) return;
    await advanceFirstStart(attempt.tabId);
  }).catch(() => {
    if (attempt && firstStart === attempt) {
      playbackErrors.set(attempt.tabId, { reason: 'Startup could not finish. Use the YouTube TV window to choose a show or press Play.', playing: true });
      cancelFirstStart();
    }
    failures.record('COMMAND_FAILED'); void notify().catch(() => failures.record('NOTIFY_FAILED'));
  }); }, 15_000);
}
async function advanceFirstStart(tabId: number) {
  const start = firstStart; if (!start || start.tabId !== tabId) return;
  if (Date.now() >= start.deadline) {
    playbackErrors.set(tabId, { reason: start.watchUrl ? 'This show did not start. Use Play in its YouTube TV window.' : 'Finish signing in or choose a channel in the new window, then press New show to try again.', playing: true });
    cancelFirstStart(); await notify(); return;
  }
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || mainTabId !== tabId || tab.windowId !== start.windowId || tab.mutedInfo?.muted !== true) { cancelFirstStart(); await notify(); return; }
  if (start.watchUrl) {
    if (tab.url !== start.watchUrl && tab.pendingUrl !== start.watchUrl && tab.url !== FIRST_LIVE_URL) { cancelFirstStart(); await notify(); return; }
    if (!addStarts.has(tabId)) { cancelFirstStart(); await notify(); }
    return;
  }
  if (tab.url !== FIRST_LIVE_URL || observations.get(tabId)?.route !== 'guide') return;
  const entry = defaultChannel(guideFor(tabId), preferences.currentChannel); if (!entry?.target) return;
  firstStart = { ...start, watchUrl: entry.target.url, deadline: Date.now() + 15_000 };
  const pane: Pane = { id: 'main', isMain: true, tabId, windowId: start.windowId, channelId: entry.channel.id, channelName: entry.channel.name, muted: true };
  addStarts.set(tabId, { pane, deadline: Date.now() + 15_000, url: entry.target.url });
  firstStartTimeout();
  try { await setTabMuted(tabId, true, 'start default channel', entry.target.url); }
  catch { playbackErrors.set(tabId, { reason: 'Choose a channel in the new window, or press New show to try again.', playing: true }); cancelFirstStart(); }
  await notify();
}
async function beginFirstStart(tabId: number): Promise<ActionResult> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !isYTTV(tab.url) && tab.url !== 'about:blank') {
    if (tab) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    return fail('SIGN_IN_REQUIRED', 'Finish signing in in the new YouTube TV window, then press New show.');
  }
  cancelFirstStart(); playbackErrors.delete(tabId);
  const attempt = { tabId, windowId: tab.windowId, deadline: Date.now() + 15_000 };
  firstStart = attempt;
  firstStartTimeout();
  try {
    await saveControlIdentity();
    if (firstStart !== attempt) return fail('SUPERSEDED', 'Startup cancelled. Use the YouTube TV window or New show when ready.');
    const muted = await setTabMuted(tabId, true, 'open first live guide');
    if (muted?.mutedInfo?.muted !== true) throw new Error('Mute unconfirmed');
    const current = await chrome.tabs.get(tabId);
    if (firstStart !== attempt || current.windowId !== attempt.windowId || current.url !== tab.url || (current.pendingUrl && current.pendingUrl !== tab.pendingUrl && current.pendingUrl !== FIRST_LIVE_URL)) {
      if (firstStart === attempt) cancelFirstStart();
      return fail('SUPERSEDED', 'The window changed. Continue in YouTube TV; startup was cancelled.');
    }
    await chrome.tabs.update(tabId, { url: FIRST_LIVE_URL });
    await advanceFirstStart(tabId); await notify();
    return ok('Opening your first show. Your last channel is used when available.');
  } catch { cancelFirstStart(); return fail('START_UNAVAILABLE', 'YouTube TV could not start. Use the new window to finish setup, then try New show again.'); }
}
async function newShow(): Promise<ActionResult> {
  if (firstStart) return ok('Your first show is still opening.');
  await chooseTab();
  if (!canAddManagedFeed(mixed.capacity())) return fail('SESSION_BOUND', 'Four shows are already open. Remove one to add another.');
  if (mainTabId) {
    const tab = await chrome.tabs.get(mainTabId).catch(() => undefined);
    if (mainWasCreated && !optionalOwner(mainTabId) && tab && !watchNavigationUrl(tab.url ?? '')) return beginFirstStart(mainTabId);
    const entry = defaultChannel(guideFor(mainTabId), preferences.currentChannel);
    return entry ? createPane(entry.channel.id) : fail('CHANNELS_LOADING', 'Channels are still loading. Try New show again in a moment, or use Pick a channel.');
  }
  const released = await workspace.releaseClosedOriginal(); if (!released.ok) return released;
  let created: chrome.windows.Window | undefined;
  const previous = { mainWasDesignated, mainWasCreated, activePaneId, mainEvent };
  let claim: string;
  try { claim = await mixed.reserveLegacy(true); } catch { return fail('SAVE_FAILED', 'Could not reserve a player. No window was opened.'); }
  pendingFeedCreations++;
  try {
    created = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 780, height: 520 });
    const tabId = created?.tabs?.[0]?.id; if (created?.id === undefined || tabId === undefined) throw new Error('Window unavailable');
    await mixed.bindLegacy(claim, created.tabs![0]);
    const muted = await setTabMuted(tabId, true, 'create first show');
    if (muted?.mutedInfo?.muted !== true) throw new Error('Mute unconfirmed');
    mainTabId = tabId; mainWasDesignated = true; mainWasCreated = true; activePaneId = 'main'; mainEvent = undefined;
    await saveControlIdentity();
  } catch {
    const tabId = created?.tabs?.[0]?.id;
    const tab = tabId === undefined ? undefined : await chrome.tabs.get(tabId).catch(() => undefined);
    if (created?.id !== undefined && tab?.windowId === created.id && tab.url === 'about:blank') {
      try { const tabs = await chrome.tabs.query({ windowId: tab.windowId }); if (tabs.length !== 1 || tabs[0].id !== tab.id) throw Error('Changed window'); await chrome.tabs.remove(tab.id!); await mixed.closed(tab.id!); await mixed.finishLegacy(claim); }
      catch {
        mainTabId = tab.id; mainWasDesignated = true; mainWasCreated = true;
        await saveControlIdentity().catch(() => undefined);
        return fail('WINDOW_CLEANUP_FAILED', 'The new window is still open. Use New show to retry it, or close that window.');
      }
    }
    mainTabId = undefined; mainWasDesignated = previous.mainWasDesignated; mainWasCreated = previous.mainWasCreated; activePaneId = previous.activePaneId; mainEvent = previous.mainEvent;
    return fail('WINDOW_FAILED', 'Could not open a new show. Try again.');
  } finally { pendingFeedCreations--; }
  const started = await beginFirstStart(mainTabId!);
  await mixed.finishLegacy(claim, mainTabId); return started;
}
async function createPane(channelId: string, currentContent?: GuideEntry, sourceCurrent?: () => Promise<boolean>): Promise<ActionResult> {
  if (!validId(channelId)) return fail('INVALID_INPUT', 'A valid channel identifier is required.');
  await chooseTab();
  const entry = currentContent ?? targetFor(channelId); if (!entry?.target) return fail('TARGET_UNAVAILABLE', 'Refresh the native Live guide; this target is unavailable or stale.');
  for (const pane of [...panes]) await requirePane(pane.id);
  if (panes.some(p => p.error)) return fail('WINDOW_CLEANUP_FAILED', 'Close the failed added window before creating another feed.');
  if (!mainTabId) return fail('MAIN_UNAVAILABLE', 'Select the original player explicitly before adding feeds.');
  // runManaged reserves pending creations by serializing the capacity check through completion/cleanup.
  if (!canAddManagedFeed(mixed.capacity())) return fail('SESSION_BOUND', 'Four total managed feeds are the software limit. Close an added feed first; account playback allowance is separate.');
  if (workspace.snapshot().layout !== 'auto') {
    const placement = await workspace.validateLayout(mixed.capacity() + 1);
    if (!placement.ok) return placement;
  }
  if (workspace.snapshot().intent && !workspace.snapshot().enrolled) {
    const start = await moveOriginal(false); if (!start.ok) return start;
  }
  let newWindow: chrome.windows.Window | undefined;
  let claim: string;
  try { claim = await mixed.reserveLegacy(false); } catch { return fail('SAVE_FAILED', 'Could not reserve a player. No window was opened.'); }
  pendingFeedCreations++;
  try {
    // Silence BEFORE the navigation can load or play. Do not create the watch URL directly.
    const created = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 780, height: 520 });
    if (!created?.id) throw new Error('Missing managed window identity');
    newWindow = created;
    const tabId = created.tabs?.[0]?.id;
    if (!tabId) throw new Error('Missing managed tab identity');
    await mixed.bindLegacy(claim, created.tabs![0]);
    if ((await setTabMuted(tabId, true, 'create blank feed'))?.mutedInfo?.muted !== true) throw Error('Mute unconfirmed');
    if (sourceCurrent && !await sourceCurrent()) throw new Error('SOURCE_CHANGED');
    await setTabMuted(tabId, true, 'create navigate feed', entry.target.url);
    const pane: Pane = { id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, channelId, channelName: entry.channel.name,
      feedNumber: MANAGED_FEED_COUNTS.slice(1).find(n => !panes.some(p => p.feedNumber === n)), tabId, windowId: created.id, muted: true, status: 'Navigation requested; playback not confirmed' };
    await readTabAudio(mainTabId!);
    if (!audioFocusId && audioReadback(mainTabId).muted === false) audioFocusId = 'main';
    panes.push(pane); const start = { pane, deadline: Date.now() + 15_000, url: entry.target.url }; addStarts.set(tabId, start);
    setTimeout(() => { if (addStarts.get(tabId) === start) void runManaged(() => startAdded(tabId)); }, 15_000);
    if (!activePaneId) activePaneId = 'main'; await saveSessions(); await mixed.finishLegacy(claim, tabId); const layout = await reflowWorkspace(); void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED')); await notify();
    if (!layout.ok) return ok(`Feed created muted. ${layout.reason}`);
    return ok('Window added muted; waiting for its native player.');
  } catch (error) {
    if (newWindow?.id) {
      try {
        const tabId = newWindow.tabs?.[0]?.id; if (!tabId) throw Error('Unknown tab');
        const tab = await chrome.tabs.get(tabId), group = await chrome.tabs.query({ windowId: newWindow.id });
        if (tab.windowId !== newWindow.id || !['about:blank', entry.target.url].includes(tab.url ?? '') || group.length !== 1 || group[0].id !== tabId) throw Error('Changed window');
        await chrome.tabs.remove(tabId); await mixed.closed(tabId); await mixed.finishLegacy(claim);
        panes = panes.filter(p => p.tabId !== tabId);
      }
      catch {
        failures.record('WINDOW_CLEANUP_FAILED');
        const tabId = newWindow.tabs?.[0]?.id;
        if (tabId && !panes.some(p => p.tabId === tabId)) panes.push({ id: `cleanup-${tabId}`, tabId, windowId: newWindow.id,
          channelId, channelName: entry.channel.name, muted: null, status: 'Creation failed; close this added window', error: 'Automatic cleanup failed.' });
        audioError = 'Added window cleanup failed; use native mute and close that window.';
        return fail('WINDOW_CLEANUP_FAILED', audioError);
      }
    }
    if (error instanceof Error && error.message === 'SOURCE_CHANGED') return fail('SUPERSEDED', 'Current content changed before Add. Existing players were preserved.');
    return fail('WINDOW_FAILED', 'The managed browser window could not be created safely; the existing player was preserved.');
  } finally { pendingFeedCreations--; }
}
async function duplicatePane(paneId: string): Promise<ActionResult> {
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'Current player unavailable.');
  const identity = playerIdentities.get(pane.tabId);
  if (!identity?.documentId) return fail('PLAYER_LOADING', 'Current player not connected. Use Reconnect or native controls.');
  const raw = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'GET_OBSERVATION' }), { documentId: identity.documentId }).catch(() => undefined);
  const observed = cleanObservation(raw); const tab = await chrome.tabs.get(pane.tabId).catch(() => undefined);
  const url = tab?.url ? watchNavigationUrl(tab.url) : null;
  if (!url || !tab || tab.windowId !== pane.windowId || observed?.route !== 'watch' || raw?.playerKey !== identity.playerKey ||
      playerIdentities.get(pane.tabId)?.playerKey !== identity.playerKey || playerIdentities.get(pane.tabId)?.documentId !== identity.documentId ||
      Date.now() - Date.parse(observed.observedAt) < 0 || Date.now() - Date.parse(observed.observedAt) > 10_000)
    return fail('SUPERSEDED', 'Current watch content changed or is unavailable. Use native controls.');
  // Explicit duplication uses the current owned native watch URL, never saved guide
  // metadata or a user-supplied URL. It does not promise the same paused position.
  const at = observed.observedAt;
  const channelId = observed.currentChannelId ?? pane.channelId;
  return createPane(channelId, { channel: { id: channelId, name: pane.channelName }, observedAt: at,
    evidenceClass: 'LIVE', available: true, target: { kind: 'navigation', url, channelId, verifiedAt: at, evidenceClass: 'LIVE' } }, async () => {
      const latest = await chrome.tabs.get(pane.tabId).catch(() => undefined);
      return Boolean(latest && latest.url === url && latest.windowId === pane.windowId && controlledIds().includes(pane.tabId) && playerIdentities.get(pane.tabId)?.playerKey === identity.playerKey && playerIdentities.get(pane.tabId)?.documentId === identity.documentId);
    });
}
async function replacePane(paneId: string, channelId: string): Promise<ActionResult> {
  if (mixed.blocked()) return fail('PLAYERS_PENDING', 'Cancel or finish the queued launch before changing channels.');
  const pane = await requirePane(paneId); if (pane && optionalOwner(pane.tabId)) return fail('USE_QUEUE', 'Use the queue destination to replace this YouTube video.'); const entry = targetFor(channelId);
  if (!pane || !entry?.target) return fail('TARGET_UNAVAILABLE', 'The pane or fresh channel target is unavailable.');
  addStarts.delete(pane.tabId); playbackErrors.delete(pane.tabId);
  await retainNavigationAudio(pane.tabId);
  await muteSource(pane.tabId, 'replace feed isolation');
  if (audioFocusId === paneId) audioFocusId = undefined;
  observations.delete(pane.tabId); confirmedTabs.delete(pane.tabId);
  await setTabMuted(pane.tabId, true, 'replace navigate feed', entry.target.url);
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId: undefined, muted: true, status: 'Replacement requested; playback not confirmed' });
  await saveSessions(); await notify(); return ok('Only this feed was replaced, starting muted. Select it to enable audio.');
}
async function selectPane(paneId: string, expected?: { playerKey: string; documentId?: string }): Promise<ActionResult> {
  if (mixed.blocked() || mixed.capacity() > controlledIds().length) return fail('STORAGE_UNAVAILABLE', 'Resolve pending or uncertain players before enabling audio.');
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This controlled player was closed.');
  const identity = expected ?? playerIdentities.get(pane.tabId);
  if (!identity?.documentId || identity.playerKey !== playerIdentities.get(pane.tabId)?.playerKey || identity.documentId !== playerIdentities.get(pane.tabId)?.documentId) return fail('SUPERSEDED', 'Player changed or not ready. Use native audio.');
  audioEnableTarget = { tabId: pane.tabId, ...identity };
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
  } finally { audioEnableTarget = undefined; handoffRunning = false; }
}
async function expandPane(paneId: string): Promise<ActionResult> {
  if (paneId === 'main') return fail('MAIN_NOT_ENROLLED', 'Use Start TV workspace before expanding the original player. Owner windows are preserved.');
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was closed.');
  const tabs = await chrome.tabs.query({ windowId: pane.windowId });
  if (tabs.length !== 1 || tabs[0].id !== pane.tabId) return fail('SHARED_OWNER_WINDOW', 'This player shares an owner window. Native positioning remains available.');
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) { const window = await chrome.windows.get(pane.windowId); pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state }; }
  await chrome.windows.update(pane.windowId, { state: 'maximized', focused: true });
  expandedPaneId = paneId; await saveSessions(); await notify(); return ok('Expanded the browser window; restore returns its saved bounds.');
}
async function restoreLayout(): Promise<ActionResult> {
  const pane = expandedPaneId ? await requirePane(expandedPaneId) : null;
  if (pane?.savedBounds && !pane.isMain) {
    const { state, ...bounds } = pane.savedBounds;
    await chrome.windows.update(pane.windowId, { state: 'normal' }); await chrome.windows.update(pane.windowId, bounds);
    if (state === 'maximized' || state === 'fullscreen') await chrome.windows.update(pane.windowId, { state });
    delete pane.savedBounds;
  }
  expandedPaneId = undefined; await saveSessions(); await notify(); return ok('Restored the managed window layout; audio selection is preserved.');
}
async function removePane(paneId: string): Promise<ActionResult> {
  if (paneId === 'main') return fail('MAIN_PRESERVED', 'The designated main player stays open.');
  const pane = await requirePane(paneId); if (!pane) return fail('PANE_UNAVAILABLE', 'This managed window was already closed.');
  await muteSource(pane.tabId, 'close added feed'); if (audioFocusId === paneId) audioFocusId = undefined;
  addStarts.delete(pane.tabId); playbackErrors.delete(pane.tabId);
  mixed.revoke(pane.tabId); requestedClosures.add(pane.tabId);
  try { await chrome.tabs.remove(pane.tabId); } catch (error) { requestedClosures.delete(pane.tabId); throw error; }
  await mixed.closed(pane.tabId);
  panes = panes.filter(item => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = 'main'; if (expandedPaneId === paneId) expandedPaneId = undefined;
  await saveSessions(); const layout = await reflowWorkspace(); await notify(); return ok(layout.ok ? 'Closed only the selected added feed.' : `Feed closed. ${layout.reason}`);
}
async function syncWorkspaceExpansion(result: ActionResult) {
  if (result.ok && !workspace.snapshot().expanded && expandedPaneId) { expandedPaneId = undefined; await saveControlIdentity(); }
  return result;
}
async function reflowWorkspace() {
  const result = await workspace.reflow();
  return workspace.snapshot().enrolled ? syncWorkspaceExpansion(result) : result;
}
async function moveOriginal(returning: boolean, arrangeAfter = true): Promise<ActionResult> {
  const pane = await mainPane(); if (!pane) return fail('MAIN_UNAVAILABLE', 'Original player unavailable.');
  if (optionalOwner(pane.tabId)) {
    const before = await providerFor(pane.tabId).observe(pane.tabId), tab = await chrome.tabs.get(pane.tabId);
    if (!before || before.capabilities.identity.state !== 'supported' || before.muted.state !== 'known' || before.volume.state !== 'known') return fail('PRESERVATION_UNAVAILABLE', 'Reconnect the native player before arranging this player.');
    const result = returning ? await workspace.returnMain() : await workspace.enroll(arrangeAfter);
    const afterTab = await chrome.tabs.get(pane.tabId);
    const c = providerFor(pane.tabId).get(pane.tabId); if (c) c.binding.windowId = afterTab.windowId;
    // Rebind after an explicit same-tab move; this is observation only.
    await mixed.moved(afterTab);
    await connectProviderOwner(pane.tabId);
    const after = providerFor(pane.tabId).get(pane.tabId)?.observation;
    if (!after || tab.mutedInfo?.muted !== afterTab.mutedInfo?.muted || JSON.stringify(before.muted) !== JSON.stringify(after.muted) || JSON.stringify(before.volume) !== JSON.stringify(after.volume)) return fail('PRESERVATION_UNCONFIRMED', 'Check the native player before further placement.');
    await saveControlIdentity();
    return syncWorkspaceExpansion(result);
  }
  const beforeTab = await chrome.tabs.get(pane.tabId);
  const before = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined) as PlayerCapture | undefined;
  if (!captureUsable(before)) return fail('PRESERVATION_UNAVAILABLE', 'Current player identity, paused position and audio readback are unavailable. Use native controls; original tab was not moved.');
  const result = returning ? await workspace.returnMain() : await workspace.enroll(arrangeAfter);
  const after = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'GET_OBSERVATION' })).catch(() => undefined) as PlayerCapture | undefined;
  const afterTab = await chrome.tabs.get(pane.tabId);
  if (!continuity(before, after) || beforeTab.mutedInfo?.muted !== afterTab.mutedInfo?.muted) {
    const rollback = returning ? undefined : await workspace.returnMain();
    return fail('PRESERVATION_UNCONFIRMED', `Same-tab move did not confirm the captured program, position and audio state. ${rollback?.message ?? rollback?.reason ?? 'Inspect the native player before further workspace actions.'} No program was navigated or replaced.`);
  }
  if (mixed.snapshot().record?.ownership.some(o => o.tabId === pane.tabId)) await mixed.moved(afterTab);
  await saveControlIdentity();
  return syncWorkspaceExpansion(result);
}
async function applyWorkspaceLayout(): Promise<ActionResult> {
  if (pendingFeedCreations || firstStart) return fail('PLAYERS_PENDING', 'Wait for the new show to finish opening.');
  const checked = await workspace.validatePlayers(); if (!checked.ok) return checked;
  if (!workspace.snapshot().enrolled) { const enrolled = await moveOriginal(false, false); if (!enrolled.ok) return enrolled; }
  const result = await workspace.arrange();
  if (result.ok) { expandedPaneId = undefined; await saveControlIdentity(); }
  return result;
}
async function handle(command: Command, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await init; await workspace.ready;
  await mixed.load();
  const contentSender = (sender.frameId === undefined || sender.frameId === 0) && sender.id === chrome.runtime.id && sender.tab?.id && isYTTV(sender.url ?? sender.tab.url);
  const extensionSender = sender.id === chrome.runtime.id && Boolean(sender.url?.startsWith(chrome.runtime.getURL('')));
  if (!contentSender && !extensionSender) { failures.record('INVALID_SENDER'); return fail('INVALID_SENDER', 'This request is outside the local extension boundary.'); }
  if (['REFRESH_SPORTS', 'WATCH_EVENT', 'ADD_EVENT'].includes(command.type) ||
      (['CREATE_PANE', 'REPLACE_PANE'].includes(command.type) && 'eventId' in command))
    return fail('UNSUPPORTED_PATH', 'Provider event playback was removed. Use Guide or guide-based Sports programs.');
  if (!validCommand(command)) { failures.record('INVALID_COMMAND'); return fail('INVALID_COMMAND', 'Invalid or oversized extension command.'); }
  if ((!managedSessionReadable || mixed.unavailable()) && (['NEW_SHOW', 'CONNECT_PANE', 'DUPLICATE_PANE', 'CREATE_PANE', 'ADD_PROGRAM', 'REPLACE_PANE', 'REPLACE_PROGRAM', 'SELECT_PANE'].includes(command.type) ||
      (command.type === 'AUDIO' && command.muted === false)))
    return fail('STORAGE_UNAVAILABLE', 'Managed sessions could not be recovered. Use native mute and existing windows; audio enable and new feeds remain unavailable.');
  if (['START_WORKSPACE', 'RETURN_MAIN', 'ARRANGE', 'SET_TV_AREA', 'AUTO_ARRANGE', 'OPEN_REMOTE', 'NEW_SHOW', 'APPLY_LAYOUT', 'SAVE_AREA_PICKER'].includes(command.type) && !workspace.snapshot().available)
    return fail('STORAGE_UNAVAILABLE', 'Workspace records unavailable; preserved for recovery. Use native controls.');
  // Explicit original-player choices revoke the first-start attempt before they queue.
  if (firstStart && (['PREVIOUS', 'OPEN_NATIVE_GUIDE', 'WATCH_PROGRAM', 'RETURN_MAIN'].includes(command.type) ||
      (['REPLACE_PROGRAM', 'REPLACE_PANE', 'SELECT_PANE'].includes(command.type) && 'paneId' in command && command.paneId === 'main') ||
      (command.type === 'NATIVE_VOLUME_INPUT' && sender.tab?.id === firstStart.tabId))) cancelFirstStart();
  switch (command.type) {
    case 'CONNECT_PRIME_VIDEO': return runManaged(async () => {
      if (!await workspace.isRemoteSender(sender)) return fail('INVALID_SENDER', 'Connect from the current remote.');
      if (!await primeVideo.permitted()) return fail('PRIME_VIDEO_ACCESS_REQUIRED', 'Enable Prime Video, then retry.');
      const tab = await chrome.tabs.get(command.tabId);
      if (!primeVideoContent(tab.url) || tab.pendingUrl && tab.pendingUrl !== tab.url) return fail('UNSUPPORTED_URL', 'Use a canonical Prime Video detail link. Other routes require native use.');
      return fail('MAIN_CONTENT_IDENTITY_UNVERIFIED', 'Prime Video main content identity cannot be verified. Finish selection and use native controls; no player was connected.');
    });
    case 'CONNECT_NETFLIX': return runManaged(async () => {
      if (!await workspace.isRemoteSender(sender)) return fail('INVALID_SENDER', 'Connect from the current remote.');
      if (!await netflix.permitted()) return fail('NETFLIX_ACCESS_REQUIRED', 'Enable Netflix, then retry.');
      const tab = await chrome.tabs.get(command.tabId);
      if (!netflixContent(tab.url) || tab.pendingUrl && tab.pendingUrl !== tab.url) return fail('UNSUPPORTED_URL', 'Use a canonical Netflix title/watch link. Other routes require native use.');
      return fail('MAIN_CONTENT_IDENTITY_UNVERIFIED', 'Netflix main content identity cannot be verified. Finish selection and use native controls; no player was connected.');
    });
    case 'CONNECT_YOUTUBE': return runManaged(async () => {
      if (!await workspace.isRemoteSender(sender) || !await youtube.permitted()) return fail('YOUTUBE_ACCESS_REQUIRED', 'Enable YouTube, then connect from the remote.');
      const tab = await chrome.tabs.get(command.tabId), content = youtubeContent(tab.url);
      if (!content) return fail('UNSUPPORTED_URL', 'Use an ordinary canonical YouTube watch link.');
      try { await mixed.connectYouTube(tab, content); await notify(); return ok('YouTube connected; playback and audio unchanged.'); }
      catch { return fail('CONNECT_FAILED', 'Could not connect. Resolve pending slots or use native controls.'); }
    });
    case 'QUEUE': {
      if (!await workspace.isRemoteSender(sender)) return fail('INVALID_SENDER', 'Queue actions belong to the current remote.');
      if ('content' in command.intent && command.intent.content.service === 'yttv') {
        const channelId = command.intent.content.channelId;
        if (!guideFor(mainTabId).some(g => g.channel.id === channelId) && ![...observations.values()].some(o => o.currentChannelId === channelId)) return fail('INVALID_CONTENT', 'Choose a channel from the native guide.');
      }
      return mixed.command(command.intent);
    }
    case 'CONNECT_PANE': return runManaged(async () => {
      if (!extensionSender || controlledIds().includes(command.tabId)) return fail('PLAYER_UNAVAILABLE', 'Choose an unassigned existing player.');
      if (!mainTabId || !canAddManagedFeed(mixed.capacity())) return fail('SESSION_BOUND', 'Choose the original first; four total managed players is the limit.');
      const tab = await chrome.tabs.get(command.tabId).catch(() => undefined);
      if (!tab || !watchNavigationUrl(tab.url ?? '')) return fail('PLAYER_UNAVAILABLE', 'Existing watch player unavailable.');
      const entry = guideFor(mainTabId).find(row => row.target?.url === tab.url);
      try { await mixed.connectLegacy(tab, false); } catch { return fail('SAVE_FAILED', 'Player ownership could not be saved. Nothing was connected.'); }
      panes.push({ id: `connected-${command.tabId}`, tabId: command.tabId, windowId: tab.windowId, channelId: entry?.channel.id ?? `existing-${command.tabId}`, channelName: entry?.channel.name ?? 'Existing player', feedNumber: MANAGED_FEED_COUNTS.slice(1).find(n => !panes.some(p => p.feedNumber === n)), muted: null });
      await saveControlIdentity();
      for (const id of controlledIds()) await readTabAudio(id);
      const routed = controlledIds().filter(id => tabAudio.get(id)?.tabMuted === false);
      if (routed.length === 1) audioFocusId = sourceId(routed[0]);
      await refreshObservations(true); await notify();
      return ok('Existing player connected without moving, navigating or changing audio.');
    });
    case 'CHOOSE_MAIN': return runManaged(async () => {
      if (!extensionSender) return fail('INVALID_SENDER', 'Choose the original from the remote.');
      if (!managedSessionReadable) return fail('STORAGE_UNAVAILABLE', 'Existing workspace records unavailable; native controls remain available.');
      if (await mainPane()) return fail('ORIGINAL_EXISTS', 'An original player is already controlled.');
      const tab = await chrome.tabs.get(command.tabId).catch(() => undefined);
      if (!tab || !isYTTV(tab.url) || guideSync.owns(command.tabId) || isGuideSyncURL(tab.url) || panes.some(p => p.tabId === command.tabId)) return fail('PLAYER_UNAVAILABLE', 'Choose an existing unassigned YouTube TV player.');
      const requestedAt = Date.now(), connectionNonce = crypto.randomUUID();
      const raw = await chrome.tabs.sendMessage(command.tabId, envelope({ type: 'GET_OBSERVATION', connectionNonce })).catch(() => undefined);
      const clean = cleanObservation(raw), expectedBuild = typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source';
      if (!clean || !captureUsable({ ...clean, playerKey: raw?.playerKey }) || raw.connectionBuild !== expectedBuild || raw.connectionNonce !== connectionNonce || Date.parse(clean.observedAt) < requestedAt || Date.parse(clean.observedAt) > Date.now())
        return fail('PLAYER_UNAVAILABLE', 'This player is not connected and ready. Use its native controls; no player was adopted.');
      const released = await workspace.releaseClosedOriginal(); if (!released.ok) return released;
      try { await mixed.connectLegacy(tab, true); } catch { return fail('SAVE_FAILED', 'Player ownership could not be saved. Resolve old slots before connecting.'); }
      mainTabId = command.tabId; mainWasDesignated = true; mainWasCreated = false; mainEvent = undefined; activePaneId = 'main'; expandedPaneId = undefined; audioFocusId = undefined;
      await saveControlIdentity().catch(() => failures.record('SESSION_WRITE_FAILED'));
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
    case 'NEW_SHOW': return runManaged(async () => {
      if (!extensionSender) return fail('INVALID_SENDER', 'Use New show in the remote.');
      const result = await newShow(); await notify(); return result;
    });
    case 'OPEN_REMOTE': { const result = await workspace.openRemote(); remoteGuideRequested = true; void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED')); return result; }
    case 'START_WORKSPACE': return runManaged(async () => { const result = await moveOriginal(false); await notify(); return result; });
    case 'RETURN_MAIN': return runManaged(async () => { const result = await moveOriginal(true); await notify(); return result; });
    case 'OPEN_AREA_PICKER': return runManaged(async () => extensionSender ? areaPicker.open(command) : fail('INVALID_SENDER', 'Open the drawing window from the remote.'));
    case 'GET_AREA_PICKER': return areaPicker.read(sender);
    case 'CANCEL_AREA_PICKER': return runManaged(async () => {
      const current = await areaPicker.read(sender); if (!current.ok) return current;
      await areaPicker.close(); await workspace.focusRemote(); return ok('Drawing cancelled.');
    });
    case 'SAVE_AREA_PICKER': return runManaged(async () => {
      const current = await areaPicker.read(sender); if (!current.ok || !current.picker) return current;
      const config = current.picker;
      if (!contains(config.workArea, command.area) || (config.mode === 'custom' && (command.customSlots?.length !== config.count || !contains(command.area, config.workArea)))) return fail('INVALID_AREA', 'Draw each show inside the selected monitor.');
      const preview = planLayout(command.area, config.count, 8, config.mode, command.customSlots);
      if (!preview.ok) return fail('AREA_TOO_SMALL', preview.reason);
      if (pendingFeedCreations) return fail('PLAYERS_PENDING', 'Wait for the new show to finish opening, then save again.');
      let result = await workspace.setArea(config.workArea, command.area, config.displayId, config.mode, config.mode === 'custom' ? command.customSlots : undefined, config.count);
      if (result.ok && firstStart) result = { ...ok('Layout saved. Wait for the first show to finish opening, then Arrange shows.'), code: 'LAYOUT_SAVED' };
      if (result.ok && result.code !== 'LAYOUT_SAVED' && (!workspace.snapshot().enrolled || !workspace.snapshot().intent?.autoArrange)) result = await applyWorkspaceLayout();
      if (result.ok) { await syncWorkspaceExpansion(result); await areaPicker.close(); await workspace.focusRemote(); }
      await notify(); return result;
    });
    case 'APPLY_LAYOUT': return runManaged(async () => { const result = await applyWorkspaceLayout(); await notify(); return result; });
    case 'ARRANGE': return runManaged(async () => { const result = await workspace.arrange(); if (result.ok) { expandedPaneId = undefined; await saveControlIdentity(); } await notify(); return result; });
    case 'SET_TV_AREA': return runManaged(async () => { const result = await workspace.setArea(command.workArea, command.area, command.displayId, command.layout, command.customSlots, command.plannedCount); if (workspace.snapshot().enrolled) await syncWorkspaceExpansion(result); await notify(); return result; });
    case 'AUTO_ARRANGE': return runManaged(async () => { const result = await workspace.setAuto(command.enabled); if (workspace.snapshot().enrolled) await syncWorkspaceExpansion(result); await notify(); return result; });
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
        if (optionalOwner(tabId)) return fail('INVALID_SENDER', 'Wrong service.');
        const clean = cleanObservation(command.observation); if (!clean) return fail('INVALID_OBSERVATION', 'Player observation unavailable.');
        if (guideSync.owns(tabId)) { await observe(tabId, clean); return ok(); }
        if (isGuideSyncURL(sender.url ?? sender.tab?.url)) return ok();
        const prior = observations.get(tabId);
        if (prior && Date.parse(clean.observedAt) < Date.parse(prior.observedAt)) return ok();
        const identity = validId(command.playerKey) ? { playerKey: command.playerKey!, documentId: validId(sender.documentId) ? sender.documentId : undefined } : undefined;
        if (identity) {
          const priorIdentity = playerIdentities.get(tabId);
          if (priorIdentity && (priorIdentity.playerKey !== identity.playerKey || priorIdentity.documentId !== identity.documentId)) { invalidateVolume(tabId); mixed.revoke(tabId); }
          playerIdentities.set(tabId, identity);
        }
        await observe(tabId, clean);
        if (identity || firstStart?.tabId === tabId) await runManaged(async () => {
          await advanceFirstStart(tabId);
          if (identity) {
            await reconcileVolume(tabId, identity.playerKey, identity.documentId);
            await mixed.observed(tabId, clean.currentChannelId, clean.route === 'watch' && (clean.playback.readyState ?? 0) >= 2, clean.observedAt);
            if (firstStart?.tabId !== tabId || clean.route === 'watch') await startAdded(tabId);
          }
          await advanceFirstStart(tabId);
        });
      }
      return ok();
    }
    case 'GET_SNAPSHOT': {
      const result = await snapshot(contentSender ? sender.tab!.id : undefined);
      if (extensionSender && sender.url === chrome.runtime.getURL('remote.html') && !remoteGuideRequested) { remoteGuideRequested = true; void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED')); }
      return result;
    }
    case 'FOCUS_MAIN': {
      const pane = await mainPane(); if (!pane) return fail('PANE_UNAVAILABLE', 'Original player unavailable.');
      await chrome.tabs.update(pane.tabId, { active: true }); await chrome.windows.update(pane.windowId, { focused: true });
      if (openDrawers.has(pane.tabId)) await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'TOGGLE_DESKTOP' })).catch(() => undefined);
      return ok('Focused the existing original player.');
    }
    case 'OPEN_NATIVE_GUIDE': {
      if (mainTabId && optionalOwner(mainTabId)) return fail('NATIVE_GUIDE_REQUIRED', 'Open YouTube TV Live in a native tab and connect it to load channels.');
      const tabId = await chooseTab(contentSender ? sender.tab!.id : undefined);
      if (tabId && optionalOwner(tabId)) return fail('USE_QUEUE', 'Use the queue to replace this video with YouTube TV.');
  if (!tabId) return fail('TARGET_UNAVAILABLE', 'Open YouTube TV in Chrome first.');
      await retainNavigationAudio(tabId);
      await chrome.tabs.update(tabId, { url: 'https://tv.youtube.com/live' });
      return ok('Opened native Live in this tab. Fresh guide observations are required before Watch/Add.');
    }
    case 'NAVIGATE': {
      if (firstStart) cancelFirstStart();
      const result = await navigate(command.channelId, contentSender ? sender.tab!.id : undefined);
      if (result.ok || result.code === 'NAVIGATION_PENDING') { mainEvent = undefined; await saveControlIdentity(); }
      return result;
    }
    case 'PREVIOUS': return preferences.previousChannel ? navigate(preferences.previousChannel, contentSender ? sender.tab!.id : undefined) : fail('NO_PREVIOUS', 'No confirmed previous channel yet.');
    case 'PREFERENCE': {
      return runManaged(async () => {
        if (!preferencesReadable) return fail('STORAGE_UNAVAILABLE', 'Preferences could not be read; existing values preserved.');
        const candidate = patchPreferences(preferences, command.patch);
        try { await savePreferences(candidate); }
        catch { return fail('STORAGE_UNAVAILABLE', 'Preferences were not saved. Retry when local storage is available.'); }
        // Do not show an uncommitted patch or roll back unrelated observations received during the write.
        preferences = patchPreferences(preferences, command.patch);
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
    case 'DUPLICATE_PANE': return runManaged(() => duplicatePane(command.paneId));
    case 'CREATE_PANE': return runManaged(() => createPane(command.channelId));
    case 'REPLACE_PANE': return runManaged(() => replacePane(command.paneId, command.channelId));
    case 'SELECT_PANE': return runManaged(() => selectPane(command.paneId));
    case 'EXPAND_PANE': return runManaged(async () => { const result = (workspace.snapshot().enrolled || workspace.snapshot().layout !== 'auto') ? await workspace.expand(command.paneId) : await expandPane(command.paneId); if (result.ok) { expandedPaneId = command.paneId; await saveControlIdentity(); } await notify(); return result; });
    case 'RESTORE_LAYOUT': return runManaged(async () => { const result = (workspace.snapshot().enrolled || workspace.snapshot().layout !== 'auto') ? await workspace.restore() : await restoreLayout(); if (result.ok) { expandedPaneId = undefined; await saveControlIdentity(); } await notify(); return result; });
    case 'REMOVE_PANE': return runManaged(() => removePane(command.paneId));
    case 'MUTE': if (firstStart) cancelFirstStart(); return runManaged(() => muteAll());
    case 'PLAYBACK': {
      const pane = await requirePane(command.paneId); if (pane) { addStarts.delete(pane.tabId); if (firstStart?.tabId === pane.tabId) cancelFirstStart(); }
      const identity = pane ? playerIdentities.get(pane.tabId) : undefined;
      return runManaged(() => playback(command.paneId, command.playing, false, identity));
    }
    case 'AUDIO': {
      const audioPaneId = command.paneId ?? activePaneId ?? 'main';
      const targetId = audioPaneId !== 'main' ? panes.find(p => p.id === audioPaneId)?.tabId : mainTabId;
      const audioIdentity = targetId ? playerIdentities.get(targetId) : undefined;
      if (targetId) { addStarts.delete(targetId); if (firstStart?.tabId === targetId) cancelFirstStart(); }
      const validVolume = typeof command.volume === 'number' && Number.isFinite(command.volume) && command.volume >= 0 && command.volume <= 1;
      // Receipt of a newer choice cancels an in-flight recovery before the managed queue reaches it.
      if (targetId && validVolume) invalidateVolume(targetId);
      const requestEpoch = targetId ? volumeEpochs.get(targetId) ?? 0 : 0;
      return runManaged(async () => {
      if ((command.muted !== undefined && typeof command.muted !== 'boolean') || (command.volume !== undefined && (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1))) return fail('INVALID_AUDIO', 'Invalid audio choice.');
      const pane = await requirePane(audioPaneId); if (command.paneId && (!audioIdentity?.documentId || audioIdentity.playerKey !== playerIdentities.get(pane?.tabId ?? 0)?.playerKey || audioIdentity.documentId !== playerIdentities.get(pane?.tabId ?? 0)?.documentId)) return fail('SUPERSEDED', 'Player changed or not ready. Use native audio.'); if (!pane) return fail('PANE_UNAVAILABLE', 'Open the original player first.');
      try {
        if (command.volume !== undefined) {
          if (pane.tabId !== targetId || (volumeEpochs.get(pane.tabId) ?? 0) !== requestEpoch) return fail('SUPERSEDED', 'A later choice replaced this request.');
          const identity = playerIdentities.get(pane.tabId);
          if (command.paneId && !identity?.documentId) return fail('PLAYER_LOADING', 'Player not ready. Use native volume.');
          const reply = optionalOwner(pane.tabId) ? await providerCommand(pane.tabId, { type: 'volume', value: command.volume }) : await chrome.tabs.sendMessage(pane.tabId, envelope({ type: 'PLAYER_AUDIO', volume: command.volume, playerKey: identity?.playerKey }), identity?.documentId ? { documentId: identity.documentId } : undefined);
          if (pane.tabId !== targetId || (volumeEpochs.get(pane.tabId) ?? 0) !== requestEpoch || !controlledIds().includes(pane.tabId) || (playerIdentities.get(pane.tabId)?.playerKey !== identity?.playerKey || playerIdentities.get(pane.tabId)?.documentId !== identity?.documentId)) return fail('SUPERSEDED', 'A later choice or player replaced this request.');
          if (!reply?.ok || Math.abs((reply.value?.volume ?? -1) - command.volume) > .001) throw new Error(volumeFailure(reply));
          const prior = observations.get(pane.tabId); if (prior) prior.playback.volume = reply.value.volume;
          volumeChoices.set(pane.tabId, { volume: reply.value.volume, playerKey: identity?.playerKey ?? 'awaiting-player', appliedAt: new Date().toISOString() });
          volumeRecoveryStatus.set(pane.tabId, identity ? 'Explicit choice retained' : 'Choice retained; waiting for player identity');
          await saveVolumeChoices();
        }
        if (command.muted === true) { await muteSource(pane.tabId, 'explicit selected mute'); if (audioFocusId === pane.id) audioFocusId = undefined; }
        if (command.muted === false) return selectPane(pane.id, audioIdentity);
        await notify(); return ok('Player audio choice read back; system volume unchanged.');
      } catch (error) {
        const reason = 'Player audio unavailable. Use native mute/volume.';
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

    case 'REFRESH': await refreshObservations(); void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED')); await notify(); return ok('Refreshed observable player and guide state.');
    default: return fail('UNSUPPORTED', 'This operation is unavailable.');
  }
}
function handleProviderMessage(message: any, sender: chrome.runtime.MessageSender, reply: (value: unknown) => void) {
  if (![YOUTUBE_NAMESPACE, PRIME_VIDEO_NAMESPACE, NETFLIX_NAMESPACE].includes(message?.namespace) || message.type !== 'changed') return false;
  void init.then(() => mixed.load()).then(async () => {
    const connection = message.namespace === NETFLIX_NAMESPACE ? netflix : message.namespace === PRIME_VIDEO_NAMESPACE ? primeVideo : youtube;
    if (!await connection.sender(sender, message.nonce)) return;
    const id = sender.tab!.id!;
    await runManaged(async () => {
      const o = await connection.observe(id); if (!o) return;
      acceptProvider(id, o);
      await mixed.observed(id, o.content?.service === 'youtube' ? o.content.videoId : undefined, o.readiness === 'ready' && (o.kind === 'vod' || o.kind === 'live'), new Date(o.observedAt).toISOString());
      await notify();
    });
  }).then(() => reply({ ok: true }), () => reply({ ok: false })); return true;
}
chrome.permissions?.onRemoved?.addListener(() => {
  void Promise.all([['youtube', youtube], ['prime-video', primeVideo], ['netflix', netflix]].map(async ([service, raw]) => {
    const connection = raw as typeof youtube;
    if (!await connection.permitted()) { mixed.revokeService(service as string); for (const o of mixed.snapshot().record?.ownership ?? []) if (o.service === service) { connection.revoke(o.tabId); mixed.revoke(o.tabId); } }
  })).then(notify).catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ([YOUTUBE_NAMESPACE, PRIME_VIDEO_NAMESPACE, NETFLIX_NAMESPACE].includes(message?.namespace)) return handleProviderMessage(message, sender, sendResponse);
  if (!isMessage(message) || ['STATE_CHANGED', 'GET_OBSERVATION', 'TOGGLE_DESKTOP', 'PLAYER_AUDIO', 'PLAYER_PLAYBACK'].includes(message.type)) return false;
  void handle(message, sender).then(async result => {
    // A newly created/moved popup may take focus before geometry starts. Return control
    // to the initiating remote for operations that do not explicitly focus a player.
    if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('remote.html') &&
        ['START_WORKSPACE', 'ARRANGE', 'APPLY_LAYOUT', 'RESTORE_LAYOUT', 'SET_TV_AREA', 'AUTO_ARRANGE', 'NEW_SHOW', 'CREATE_PANE', 'DUPLICATE_PANE', 'ADD_PROGRAM', 'REMOVE_PANE'].includes(message.type))
      await workspace.focusRemote();
    sendResponse(result);
  }, () => {
    failures.record('COMMAND_FAILED');
    sendResponse(fail('UNKNOWN', 'The extension operation did not complete. Browser changes may already have occurred; inspect current state before retrying. Use the original player as fallback.'));
  }).catch(() => failures.record('COMMAND_FAILED'));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  forgetProviders(tabId); mixed.revoke(tabId);
  if (guideSync.owns(tabId)) { guideSync.removed(tabId); return; }
  if (firstStart?.tabId === tabId) cancelFirstStart();
  playingSeen.delete(tabId);
  addStarts.delete(tabId); playbackErrors.delete(tabId);
  const explicitClose = requestedClosures.delete(tabId);
  const removedSourceId = sourceId(tabId);
  if (audioFocusId === removedSourceId) audioFocusId = undefined;
  if (activePaneId === removedSourceId) activePaneId = 'main';
  if (expandedPaneId === removedSourceId) expandedPaneId = undefined;
  invalidateVolume(tabId); volumeChoices.delete(tabId); playerIdentities.delete(tabId);
  observations.delete(tabId); tabAudio.delete(tabId); confirmedTabs.delete(tabId); const removedMain = mainTabId === tabId; if (removedMain) { mainTabId = undefined; mainWasCreated = false; }
  const removed = panes.some(pane => pane.tabId === tabId); panes = panes.filter(pane => pane.tabId !== tabId);
  void init.then(() => runManaged(async () => {
    await mixed.closed(tabId);
    // Independent cleanup writes must all be attempted even if one storage area fails.
    const results = await Promise.allSettled([saveVolumeChoices(),
      openDrawers.delete(tabId) ? saveDrawers() : Promise.resolve(), removed || removedMain ? saveSessions() : Promise.resolve()]);
    if (results.some(result => result.status === 'rejected')) failures.record('TAB_CLOSE_FAILED');
    if (removed || removedMain) { if (!explicitClose) await reflowWorkspace(); await notify(); }
  })).catch(() => failures.record('TAB_CLOSE_FAILED'));
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && optionalOwner(tabId)?.ordinaryUrl === tab.url && !providerFor(tabId).get(tabId)) void init.then(() => runManaged(() => connectProviderOwner(tabId))).catch(() => undefined);
  if (change.status === 'complete' && controlledIds().includes(tabId)) void syncGuide().catch(() => failures.record('GUIDE_SYNC_FAILED'));
  if (change.url && controlledIds().includes(tabId)) void init.then(() => runManaged(() => saveControlIdentity())).catch(() => failures.record('SESSION_WRITE_FAILED'));
  if (change.url && firstStart?.tabId === tabId && change.url !== FIRST_LIVE_URL && change.url !== firstStart.watchUrl) cancelFirstStart();
  if (change.url) { forgetProviders(tabId); mixed.revoke(tabId, change.url); playingSeen.delete(tabId); if (addStarts.get(tabId)?.url !== change.url) addStarts.delete(tabId); playbackErrors.delete(tabId); invalidateVolume(tabId); playerIdentities.delete(tabId); observations.delete(tabId); confirmedTabs.delete(tabId); }
  if (isYTTV(tab.url) && controlledIds().includes(tabId) && panes.length && !handoffRunning && sourceId(tabId) !== audioFocusId && change.mutedInfo?.muted === false)
    void setTabMuted(tabId, true, 'tab update inactive feed').catch(() => { audioError = 'Inactive feed mute failed; use Mute all and inspect audio readback.'; });
});

chrome.action?.onClicked?.addListener(() => { void init.then(async () => { await workspace.openRemote(); await chooseTab(); remoteGuideRequested = true; await syncGuide(); }).catch(() => failures.record('COMMAND_FAILED')); });
chrome.system?.display?.onDisplayChanged?.addListener(() => { void init.then(() => runManaged(async () => { await reflowWorkspace(); await notify(); })).catch(() => failures.record('COMMAND_FAILED')); });
