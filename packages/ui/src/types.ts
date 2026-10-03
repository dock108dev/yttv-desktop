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
  feedNumber?: number;
  eventId?: string;
  muted: boolean | null;
  playerMuted?: boolean | null;
  tabMuted?: boolean | null;
  siteMuted?: boolean | null;
  tabMuteReason?: string;
  volume?: number | null;
  isMain?: boolean;
  windowId?: number;
  tabId?: number;
  status?: string;
  error?: string;
}

export interface DesktopSnapshot {
  originalMissing?: boolean;
  originalCandidates?: { tabId: number; label: string }[];
  workspace?: { available?: boolean; intent: import('../../quadbox/src/geometry').AreaIntent | null; enrolled: boolean; notice: string; actual: { id: string; bounds: import('../../quadbox/src/geometry').Rect }[]; expanded: boolean };
  feedLimit?: number;
  pendingFeedCreations?: number;
  mode: 'extension' | 'demo';
  connection: 'connected' | 'waiting' | 'unavailable';
  statusMessage?: string;
  preferencePersistence?: 'saved' | 'unavailable';
  guideCacheDiagnostics?: { reads: number; writes: number; persistence: string };
  failureDiagnostics?: { code: string; count: number; firstAt: string; lastAt: string }[];
  currentConfirmed?: boolean;
  guideObservedAt?: string;
  currentChannelId?: string;
  currentProgram?: string;
  playback: { playing: boolean | null; muted: boolean | null; playerMuted?: boolean | null; tabMuted?: boolean | null; siteMuted?: boolean | null; tabMuteReason?: string; volume?: number | null };
  audioFocusId?: string;
  audioError?: string;
  volumeDiagnostics?: { at: string; source: string; volume: number; route: string; readyState: number | null; result: string; failure?: string }[];
  volumeRecovery?: { savedVolume: number | null; playerTracked: boolean; documentBound: boolean; status: string; attempts?: number; failure?: string };
  audioDiagnostics?: Array<{ at: string; workerStartedAt: string; source: string; cause: string; muted: boolean; feeds: number; authority: string; result: string }>;
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
  watchProgram?(channelId: string, title: string, observedAt: string): Promise<ActionResult>;
  addProgram?(channelId: string, title: string, observedAt: string): Promise<ActionResult>;
  previousChannel(): Promise<ActionResult>;
  setPreference(patch: Partial<Preferences>): Promise<ActionResult>;
  createPane(channelId: string): Promise<ActionResult>;
  selectPane(paneId: string): Promise<ActionResult>;
  replacePane(paneId: string, channelId: string): Promise<ActionResult>;
  expandPane(paneId: string): Promise<ActionResult>;
  restoreLayout(): Promise<ActionResult>;
  focusPane?(paneId: string): Promise<ActionResult>;
  openRemote?(): Promise<ActionResult>;
  focusOriginal?(): Promise<ActionResult>;
  setAudio?(change: { muted?: boolean; volume?: number }): Promise<ActionResult>;
  mute?(): Promise<ActionResult>;
  removePane?(paneId: string): Promise<ActionResult>;
  recoverGuide?(): Promise<ActionResult>;
  refresh?(): Promise<ActionResult>;
}

export interface DesktopOptions {
  demo?: boolean;
  extensionId?: string;
}
