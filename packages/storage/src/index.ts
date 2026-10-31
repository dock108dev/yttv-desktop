import { isLayoutMode, validCustomSlots, type LayoutMode, type Rect } from '../../quadbox/src/geometry';
import { MANAGED_FEED_COUNTS } from '../../quadbox/src/policy';
import { normalizeText, type GuideEntry, type PlaybackTarget } from '../../core/src/index.js';

export type KeyboardAction = 'watch' | 'search' | 'help' | 'guide' | 'sports' | 'quadbox' | 'previous' | 'mute' | 'pane1' |
  'pane2' | 'pane3' | 'pane4' | 'expand' | 'restore' | 'up' | 'down' | 'left' | 'right';
export const DEFAULT_KEYBOARD_MAPPINGS: Record<KeyboardAction, string> = {
  guide: 'g', sports: 's', quadbox: 'q', previous: 'p', mute: 'm', pane1: '1', pane2: '2', pane3: '3', pane4: '4',
  expand: 'Enter', restore: 'Escape', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  watch: 'w', search: '/', help: '?',
};
export const KEYBOARD_LABELS: Record<KeyboardAction, string> = {
  watch: 'Watch', guide: 'Guide', sports: 'Sports', quadbox: 'QuadBox', previous: 'Previous channel', mute: 'Mute all',
  pane1: 'Focus window 1', pane2: 'Focus window 2', pane3: 'Focus window 3', pane4: 'Focus window 4',
  expand: 'Activate row / expand window', restore: 'Cancel / restore layout', up: 'Previous guide row', down: 'Next guide row',
  left: 'First row control', right: 'Last row control', search: 'Search', help: 'Show shortcuts',
};
/** Only unmodified keys: browser chords, Tab, space and function keys retain native ownership. */
export function normalizeKeyboardKey(value: string): string | null {
  const key = value.trim();
  if (!key) return '';
  const named = ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].find(item => item.toLowerCase() === key.toLowerCase());
  return named ?? (/^[!-~]$/.test(key) ? key.toLowerCase() : null);
}
export function validateKeyboardMappings(mappings: Record<KeyboardAction, string>): string | null {
  const used = new Set<string>();
  for (const action of Object.keys(DEFAULT_KEYBOARD_MAPPINGS) as KeyboardAction[]) {
    const key = normalizeKeyboardKey(mappings[action]);
    if (key === null) return `${KEYBOARD_LABELS[action]}: use one printable key, Enter, Escape or an arrow key.`;
    if (key && used.has(key)) return `The key ${key} is assigned more than once. Use a different key or leave it blank.`;
    if (key) used.add(key);
  }
  return null;
}
export interface SavedQuadPane { id: string; eventId: string | null; channelId: string | null; target: PlaybackTarget | null }
export interface SavedQuadLayout { id: string; name: string; panes: SavedQuadPane[]; selectedPaneId: string | null }
export interface Preferences {
  schemaVersion: 1; favorites: string[]; hiddenChannels: string[]; channelOrder: string[]; recentChannels: string[];
  currentChannel: string | null; previousChannel: string | null; favoriteTeams: string[]; favoriteLeagues: string[];
  keyboardMappings: Record<KeyboardAction, string>; quadLayouts: SavedQuadLayout[]; lastQuad: SavedQuadLayout | null;
  ui: { denseGuide: boolean; theme: 'dark' | 'light' | 'system'; lastSurface: 'WATCH' | 'GUIDE' | 'SPORTS' | 'QUADBOX' };
  /** Legacy schema field retained for compatibility; the expired hold conveys no audio authority. */
  nightMuteLock: boolean;
}
export const PREFERENCES_KEY = 'yttv-desktop.preferences.v1';
export const RECENTS_LIMIT = 20;
export function defaultPreferences(): Preferences {
  return {
    schemaVersion: 1, favorites: [], hiddenChannels: [], channelOrder: [], recentChannels: [], currentChannel: null,
    previousChannel: null, favoriteTeams: [], favoriteLeagues: [], keyboardMappings: { ...DEFAULT_KEYBOARD_MAPPINGS },
    quadLayouts: [], lastQuad: null, ui: { denseGuide: true, theme: 'dark', lastSurface: 'GUIDE' }, nightMuteLock: false,
  };
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const identifier = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.length <= 200 ? value : null;
const ids = (value: unknown, limit = 500): string[] => Array.isArray(value) ? [...new Set(value.map(identifier).filter((id): id is string => id !== null))].slice(0, limit) : [];
export function sanitizeSavedLayout(value: unknown): SavedQuadLayout | null {
  const input = object(value); const id = identifier(input.id);
  if (!id || !Array.isArray(input.panes) || input.panes.length < 1 || input.panes.length > 4) return null;
  const paneIds = new Set<string>(); const panes: SavedQuadPane[] = [];
  for (const raw of input.panes) {
    const pane = object(raw); const paneId = identifier(pane.id);
    if (!paneId || paneIds.has(paneId)) return null;
    paneIds.add(paneId);
    const channelId = identifier(pane.channelId);
    // Navigation handles observed in a guide may contain volatile page state. Reacquire them on restore.
    panes.push({ id: paneId, eventId: identifier(pane.eventId), channelId, target: null });
  }
  const selected = identifier(input.selectedPaneId);
  return { id, name: typeof input.name === 'string' ? input.name.slice(0, 100) : 'Saved layout', panes,
    selectedPaneId: selected && paneIds.has(selected) ? selected : panes[0]?.id ?? null };
}
/** Whitelisting intentionally drops sessions, passwords, tokens and arbitrary extension/page state. */
export function sanitizePreferences(value: unknown): Preferences {
  const input = object(value); const defaults = defaultPreferences();
  // Unknown future schemas are not guessed or overwritten by a migration.
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1 && input.schemaVersion !== 0) return defaults;
  const keyboard = object(input.keyboardMappings); const mappings = { ...defaults.keyboardMappings };
  const used = new Set<string>();
  for (const action of Object.keys(mappings) as KeyboardAction[]) {
    const proposed = typeof keyboard[action] === 'string' && (keyboard[action] as string).length <= 24 ? (keyboard[action] as string).trim() : mappings[action];
    // Empty disables a key. Duplicate custom keys cannot trigger multiple actions.
    const normalized = normalizeKeyboardKey(proposed) ?? '';
    mappings[action] = normalized && used.has(normalized) ? '' : normalized;
    if (normalized) used.add(normalized);
  }
  const ui = object(input.ui);
  const layouts = Array.isArray(input.quadLayouts) ? input.quadLayouts.map(sanitizeSavedLayout).filter((layout): layout is SavedQuadLayout => layout !== null).slice(0, 20) : [];
  const uniqueLayouts = layouts.filter((layout, index) => layouts.findIndex(other => other.id === layout.id) === index);
  return {
    schemaVersion: 1, favorites: ids(input.favorites), hiddenChannels: ids(input.hiddenChannels), channelOrder: ids(input.channelOrder),
    recentChannels: ids(input.recentChannels, RECENTS_LIMIT), currentChannel: identifier(input.currentChannel), previousChannel: identifier(input.previousChannel),
    favoriteTeams: ids(input.favoriteTeams), favoriteLeagues: ids(input.favoriteLeagues), keyboardMappings: mappings,
    quadLayouts: uniqueLayouts, lastQuad: sanitizeSavedLayout(input.lastQuad),
    ui: { denseGuide: typeof ui.denseGuide === 'boolean' ? ui.denseGuide : defaults.ui.denseGuide,
      theme: ['dark', 'light', 'system'].includes(String(ui.theme)) ? ui.theme as Preferences['ui']['theme'] : defaults.ui.theme,
      lastSurface: ['WATCH', 'GUIDE', 'SPORTS', 'QUADBOX'].includes(String(ui.lastSurface)) ? ui.lastSurface as Preferences['ui']['lastSurface'] : defaults.ui.lastSurface },
    nightMuteLock: false, // The temporary overnight hold is retired; this field conveys no audio authority.
  };
}
/** Reject malformed live edits before persistence; legacy stored records still use sanitation. */
export function validPreferencePatch(value: unknown): value is Partial<Preferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const lists = ['favorites', 'hiddenChannels', 'channelOrder', 'favoriteTeams', 'favoriteLeagues'];
  const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
  const id = (v: unknown) => identifier(v) !== null && !/[\x00-\x1f]/.test(v as string);
  if (!Object.keys(patch).every(key => [...lists, 'keyboardMappings', 'quadLayouts', 'lastQuad', 'ui'].includes(key)) ||
      !lists.every(key => patch[key] === undefined || Array.isArray(patch[key]) && patch[key].length <= 1000 && patch[key].every(id))) return false;
  if (patch.keyboardMappings !== undefined && (!record(patch.keyboardMappings) ||
      !Object.entries(patch.keyboardMappings).every(([key, v]) => Object.hasOwn(DEFAULT_KEYBOARD_MAPPINGS, key) &&
        typeof v === 'string' && v.length <= 24 && normalizeKeyboardKey(v) !== null))) return false;
  if (patch.ui !== undefined && (!record(patch.ui) || !Object.entries(patch.ui).every(([key, v]) =>
      key === 'denseGuide' ? typeof v === 'boolean' : key === 'theme' ? ['dark', 'light', 'system'].includes(v as string) :
        key === 'lastSurface' && ['WATCH', 'GUIDE', 'SPORTS', 'QUADBOX'].includes(v as string)))) return false;
  if (patch.quadLayouts !== undefined && (!Array.isArray(patch.quadLayouts) || patch.quadLayouts.length > 20 ||
      !patch.quadLayouts.every(layout => sanitizeSavedLayout(layout) !== null))) return false;
  return patch.lastQuad === undefined || patch.lastQuad === null || sanitizeSavedLayout(patch.lastQuad) !== null;
}

/** Editable choices share one merge policy; confirmed history and schema remain storage-owned. */
export function patchPreferences(preferences: Preferences, patch: Partial<Preferences>): Preferences {
  const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent,
    schemaVersion: _schema, nightMuteLock: _mute, ...editable } = patch;
  return sanitizePreferences({ ...preferences, ...editable, ui: { ...preferences.ui, ...editable.ui } });
}
/** Call only after the adapter confirms the new channel; attempts and repeated observations are ignored. */
export function recordConfirmedSwitch(preferences: Preferences, channelId: string, confirmed = true): Preferences {
  if (!confirmed || !identifier(channelId) || channelId === preferences.currentChannel) return preferences;
  return { ...preferences, previousChannel: preferences.currentChannel, currentChannel: channelId,
    recentChannels: [channelId, ...preferences.recentChannels.filter(id => id !== channelId)].slice(0, RECENTS_LIMIT) };
}
export function orderGuide(entries: readonly GuideEntry[], preferences: Preferences, options: { query?: string; includeHidden?: boolean } = {}): GuideEntry[] {
  const query = normalizeText(options.query ?? ''); const tokens = query.split(' ').filter(Boolean);
  const order = new Map(preferences.channelOrder.map((id, index) => [id, index]));
  const favorite = new Set(preferences.favorites); const hidden = new Set(preferences.hiddenChannels);
  return entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
    if (!options.includeHidden && hidden.has(entry.channel.id)) return false;
    const text = normalizeText([entry.channel.name, ...(entry.channel.aliases ?? []), entry.programTitle ?? '', entry.nextProgramTitle ?? ''].join(' '));
    const words = text.split(' ');
    return tokens.every(token => token.length === 1 ? words.includes(token) : text.includes(token));
  }).sort((a, b) => Number(favorite.has(b.entry.channel.id)) - Number(favorite.has(a.entry.channel.id)) ||
    (order.get(a.entry.channel.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.entry.channel.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ entry }) => entry);
}
export interface StorageBridge { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
export function createPreferencesStore(bridge: StorageBridge) {
  let writeQueue: Promise<void> = Promise.resolve();
  return {
    async load(): Promise<Preferences> {
      const raw = await bridge.get(PREFERENCES_KEY);
      if (typeof raw === 'string') {
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { throw new Error('Stored preferences are unreadable; existing values preserved.'); }
        return sanitizePreferences(parsed);
      }
      return sanitizePreferences(raw);
    },
    save(preferences: Preferences): Promise<void> {
      const clean = sanitizePreferences(preferences);
      const write = writeQueue.catch(() => undefined).then(() => bridge.set(PREFERENCES_KEY, clean));
      writeQueue = write; return write;
    },
  };
}

/** Additive workspace preference. No targets, identities or audio authority. */
export const WORKSPACE_LAYOUT_KEY = 'yttv-desktop.workspace-layout.v1';
export interface WorkspaceLayoutPreference { version: 1; mode: LayoutMode; customLayouts?: Record<string, Rect[]> }
export function sanitizeWorkspaceLayout(value: unknown): WorkspaceLayoutPreference {
  const raw = object(value);
  const result: WorkspaceLayoutPreference = { version: 1, mode: raw.version === 1 && isLayoutMode(raw.mode) ? raw.mode : 'auto' };
  const layouts = object(raw.customLayouts), customLayouts: Record<string, Rect[]> = {};
  if (raw.version === 1) for (const count of MANAGED_FEED_COUNTS) {
    const slots = layouts[String(count)];
    if (validCustomSlots(slots, count)) customLayouts[String(count)] = slots.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
  }
  if (Object.keys(customLayouts).length) result.customLayouts = customLayouts;
  return result;
}

export * from './media-queue';
