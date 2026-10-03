export { createDOMAdapter, type AdapterObservation, type DOMAdapter } from '../../../packages/yttv-adapter/src/index';
import type { AdapterObservation } from '../../../packages/yttv-adapter/src/index';
import type { Preferences } from '../../../packages/storage/src/index';
export const MESSAGE_NAMESPACE = 'yttv-desktop.v1';
export type Command =
  | { type: 'GET_SNAPSHOT' | 'PREVIOUS' | 'MUTE' | 'REFRESH' | 'REFRESH_SPORTS' | 'RESTORE_LAYOUT' | 'OPEN_NATIVE_GUIDE' | 'FOCUS_MAIN' }
  | { type: 'WATCH_PROGRAM' | 'ADD_PROGRAM'; channelId: string; title: string; observedAt: string }
  | { type: 'WATCH_EVENT' | 'ADD_EVENT'; eventId: string }
  | { type: 'AUDIO' | 'PLAYER_AUDIO'; muted?: boolean; volume?: number }
  | { type: 'OBSERVE'; observation: AdapterObservation }
  | { type: 'NAVIGATE'; channelId: string }
  | { type: 'PREFERENCE'; patch: Partial<Preferences> }
  | { type: 'CREATE_PANE'; channelId: string; eventId?: string }
  | { type: 'REPLACE_PANE'; paneId: string; channelId: string; eventId?: string }
  | { type: 'SELECT_PANE' | 'EXPAND_PANE' | 'REMOVE_PANE'; paneId: string }
  | { type: 'SET_DRAWER_STATE'; opened: boolean }
  | { type: 'GET_DRAWER_STATE' }
  | { type: 'GET_OBSERVATION' | 'STATE_CHANGED' | 'TOGGLE_DESKTOP' };
export const envelope = (command: Command) => ({ namespace: MESSAGE_NAMESPACE, ...command });
export const isMessage = (value: unknown): value is Command & { namespace: string } =>
  Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).namespace === MESSAGE_NAMESPACE && typeof (value as Record<string, unknown>).type === 'string');
