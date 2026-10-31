import { emptyMixed } from '../../storage/src/media-queue';
import { editQueue } from '../../quadbox/src/queue';
import type { GuideEntry } from '../../core/src/index';
import { defaultPreferences, patchPreferences, sanitizePreferences, validPreferencePatch } from '../../storage/src/index';
import type { ActionResult, ClientBridge, DesktopSnapshot } from './types';

const PREVIEW_STORAGE_KEY = 'yttv-desktop.local-preview.preferences.v1';

/** A clearly labeled local UI preview. It does not navigate, authenticate, or play video. */
export function createDemoBridge(): ClientBridge {
  const now = Date.now();
  const entries: [string, string, string][] = [
    ['espn', 'ESPN', 'SportsCenter'], ['fox', 'FOX', 'Illustrative college football'],
    ['yes', 'YES', 'Illustrative baseball'], ['espn2', 'ESPN2', 'Illustrative resumed game'],
    ['nbc', 'NBC', 'Evening news'], ['cbs', 'CBS', 'The Late Show'], ['abc', 'ABC', 'Local programming'],
    ['tnt', 'TNT', 'Illustrative basketball'], ['tbs', 'TBS', 'Comedy block'], ['cnn', 'CNN', 'Newsroom'],
    ['hgtv', 'HGTV', 'Home renovation'], ['food', 'Food Network', 'Kitchen competition'],
    ['discovery', 'Discovery', 'Documentary'], ['pbs', 'PBS', 'Nature'],
  ];
  const guide: GuideEntry[] = entries.map(([id, name, title], index) => ({
    channel: { id: `fixture-channel:${id}`, name, networkId: name }, programTitle: title,
    programStart: new Date(now - (index % 3 + 1) * 15 * 60_000).toISOString(),
    programEnd: new Date(now + (index % 4 + 1) * 15 * 60_000).toISOString(),
    available: false, target: null, observedAt: new Date(now).toISOString(), evidenceClass: 'FIXTURE',
  }));
  let preferences = defaultPreferences();
  preferences.favorites = ['fixture-channel:espn', 'fixture-channel:fox', 'fixture-channel:yes'];
  try {
    const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (saved) preferences = sanitizePreferences(JSON.parse(saved));
  } catch { /* Local storage can be unavailable; preview remains usable for this visit. */ }
  let snapshot: DesktopSnapshot = {
    mixed: { record: emptyMixed(() => crypto.randomUUID()), writable: true, states: {} }, mode: 'demo', connection: 'connected', statusMessage: 'Local fixture preview. No YouTube TV session is connected.',
    playback: { playing: null, muted: null }, guide, preferences, panes: [],
    capabilities: { navigation: false, guide: true, managedWindows: false, audio: false }, observedAt: new Date(now).toISOString(),
  };
  const listeners = new Set<() => void>();
  const unavailable = async (): Promise<ActionResult> => ({ ok: false, code: 'FIXTURE_ONLY', reason: 'This local preview contains fixtures. No real channel, session, account or protected playback is connected.' });
  return {
    getSnapshot: () => structuredClone(snapshot),
    async queueIntent(intent) {
      if (['play', 'focus', 'confirm-closed', 'cancel'].includes(intent.action)) return { ok: false, reason: 'Fixture preview only. No player can be launched or controlled here.' };
      const record = structuredClone(snapshot.mixed!.record!);
      if (record.revision !== intent.revision) return { ok: false, reason: 'Preview queue changed. Try again.' };
      try { editQueue(record, intent, () => crypto.randomUUID(), Date.now()); record.revision++; }
      catch { return { ok: false, reason: 'Preview edit unavailable.' }; }
      snapshot.mixed = { record, writable: true, states: {} }; listeners.forEach(listener => listener()); return { ok: true };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    navigateChannel: unavailable, previousChannel: unavailable, createPane: unavailable, selectPane: unavailable,
    replacePane: unavailable, expandPane: unavailable, restoreLayout: unavailable, mute: unavailable,
    async setPreference(patch) {
      if (!validPreferencePatch(patch)) return { ok: false, code: 'INVALID_COMMAND', reason: 'Invalid preference edit.' };
      snapshot = { ...snapshot, preferences: patchPreferences(snapshot.preferences, patch) };
      try { localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(snapshot.preferences)); }
      catch { return { ok: false, reason: 'Preview settings changed for this visit; this browser does not permit local storage.' }; }
      listeners.forEach(listener => listener());
      return { ok: true };
    },
    async refresh() { listeners.forEach(listener => listener()); return { ok: true }; },
  };
}
