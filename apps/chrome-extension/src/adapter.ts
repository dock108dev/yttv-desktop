export { createDOMAdapter, type AdapterObservation, type DOMAdapter } from '../../../packages/yttv-adapter/src/index';
import type { AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { Preferences } from '../../../packages/storage/src/index';
export const MESSAGE_NAMESPACE = 'yttv-desktop.v1';
export type Command =
  | { type: 'GET_SNAPSHOT' | 'PREVIOUS' | 'MUTE' | 'REFRESH' | 'RESTORE_LAYOUT' | 'OPEN_NATIVE_GUIDE' | 'FOCUS_MAIN' }
  | { type: 'WATCH_PROGRAM' | 'ADD_PROGRAM'; channelId: string; title: string; observedAt: string }
  | { type: 'AUDIO' | 'PLAYER_AUDIO'; muted?: boolean; volume?: number; playerKey?: string }
  | { type: 'NATIVE_VOLUME_INPUT'; playerKey: string; observation?: AdapterObservation }
  | { type: 'OBSERVE'; observation: AdapterObservation; playerKey?: string }
  | { type: 'NAVIGATE'; channelId: string }
  | { type: 'PREFERENCE'; patch: Partial<Preferences> }
  | { type: 'CREATE_PANE'; channelId: string }
  | { type: 'REPLACE_PANE'; paneId: string; channelId: string }
  | { type: 'SELECT_PANE' | 'EXPAND_PANE' | 'REMOVE_PANE'; paneId: string }
  | { type: 'SET_DRAWER_STATE'; opened: boolean }
  | { type: 'GET_DRAWER_STATE' }
  | { type: 'GET_OBSERVATION' | 'STATE_CHANGED' | 'TOGGLE_DESKTOP' };
export const envelope = (command: Command) => ({ namespace: MESSAGE_NAMESPACE, ...command });
export const isMessage = (value: unknown): value is Command & { namespace: string } =>
  Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).namespace === MESSAGE_NAMESPACE && typeof (value as Record<string, unknown>).type === 'string');

/** Runtime TypeScript assertions are not validation. Bound IPC before privileged work. */
export function validCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length > 8) return false;
  try { if (JSON.stringify(row).length > 512_000) return false; } catch { return false; }
  const id = (v: unknown) => typeof v === 'string' && Boolean(v.trim()) && v.length <= 200 && !/[\x00-\x1f]/.test(v);
  const observation = (v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const raw = v as Record<string, unknown>;
    return Array.isArray(raw.guide) && raw.guide.length <= 500 && typeof raw.observedAt === 'string' &&
      raw.observedAt.length <= 40 && Number.isFinite(Date.parse(raw.observedAt)) && Boolean(raw.playback && typeof raw.playback === 'object');
  };
  switch (row.type) {
    case 'GET_SNAPSHOT': case 'PREVIOUS': case 'MUTE': case 'REFRESH':
    case 'RESTORE_LAYOUT': case 'OPEN_NATIVE_GUIDE': case 'FOCUS_MAIN': case 'GET_DRAWER_STATE':
    case 'GET_OBSERVATION': case 'STATE_CHANGED': case 'TOGGLE_DESKTOP': return true;
    case 'NAVIGATE': return id(row.channelId);
    case 'SELECT_PANE': case 'EXPAND_PANE': case 'REMOVE_PANE': return id(row.paneId);
    case 'CREATE_PANE': case 'REPLACE_PANE': return id(row.channelId) &&
      row.eventId === undefined && (row.type !== 'REPLACE_PANE' || id(row.paneId));
    case 'SET_DRAWER_STATE': return typeof row.opened === 'boolean';
    case 'OBSERVE': return observation(row.observation) && (row.playerKey === undefined || id(row.playerKey));
    case 'NATIVE_VOLUME_INPUT': return id(row.playerKey) && (row.observation === undefined || observation(row.observation));
    case 'WATCH_PROGRAM': case 'ADD_PROGRAM': return id(row.channelId) && typeof row.title === 'string' &&
      row.title.length > 0 && row.title.length <= 300 && typeof row.observedAt === 'string' && row.observedAt.length <= 40 && Number.isFinite(Date.parse(row.observedAt));
    case 'AUDIO': case 'PLAYER_AUDIO': return (row.muted !== undefined || row.volume !== undefined) &&
      (row.muted === undefined || typeof row.muted === 'boolean') && (row.playerKey === undefined || id(row.playerKey)) &&
      (row.volume === undefined || typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0 && row.volume <= 1);
    case 'PREFERENCE': {
      if (!row.patch || typeof row.patch !== 'object' || Array.isArray(row.patch)) return false;
      const patch = row.patch as Record<string, unknown>;
      const lists = ['favorites', 'hiddenChannels', 'channelOrder', 'favoriteTeams', 'favoriteLeagues'];
      const allowed = [...lists, 'keyboardMappings', 'quadLayouts', 'lastQuad', 'ui'];
      return Object.keys(patch).every(key => allowed.includes(key)) && lists.every(key => patch[key] === undefined ||
        Array.isArray(patch[key]) && patch[key].length <= 1000 && patch[key].every(id)) &&
        (patch.quadLayouts === undefined || Array.isArray(patch.quadLayouts) && patch.quadLayouts.length <= 20);
    }
    default: return false;
  }
}
