import type { GuideEntry } from '../../core/src/index';
import type { Preferences } from '../../storage/src/index';

export interface ActionResult {
  ok: boolean;
  message?: string;
  reason?: string;
  code?: string;
}

export interface UIManagedPane {
  id: string;
  channelId: string;
  channelName: string;
  eventId?: string;
  muted: boolean;
  windowId?: number;
  tabId?: number;
  status?: string;
  error?: string;
}

export interface DesktopSnapshot {
  mode: 'extension' | 'demo';
  connection: 'connected' | 'waiting' | 'unavailable';
  statusMessage?: string;
  currentChannelId?: string;
  currentProgram?: string;
  playback: { playing: boolean | null; muted: boolean | null };
  guide: GuideEntry[];
  preferences: Preferences;
  panes: UIManagedPane[];
  activePaneId?: string;
  expandedPaneId?: string;
  capabilities: {
    navigation: boolean;
    guide: boolean;
    managedWindows: boolean;
    audio: boolean;
  };
  observedAt?: string;
}

export interface ClientBridge {
  getSnapshot(): DesktopSnapshot | Promise<DesktopSnapshot>;
  subscribe(listener: () => void): () => void;
  navigateChannel(channelId: string): Promise<ActionResult>;
  previousChannel(): Promise<ActionResult>;
  setPreference(patch: Partial<Preferences>): Promise<ActionResult>;
  createPane(channelId: string, eventId?: string): Promise<ActionResult>;
  selectPane(paneId: string): Promise<ActionResult>;
  replacePane(paneId: string, channelId: string, eventId?: string): Promise<ActionResult>;
  expandPane(paneId: string): Promise<ActionResult>;
  restoreLayout(): Promise<ActionResult>;
  mute?(): Promise<ActionResult>;
  removePane?(paneId: string): Promise<ActionResult>;
  refresh?(): Promise<ActionResult>;
}

export interface DesktopOptions {
  demo?: boolean;
}
