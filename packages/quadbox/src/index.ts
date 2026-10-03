/** Shared serialized audio handoff; browser ownership/window lifecycle belongs to the Chrome worker. */
export interface AudioPane {
  id: string; playbackSession: string | null; availability: 'READY' | 'UNAVAILABLE'; muted: boolean;
  audioState?: 'CONFIRMED_MUTED' | 'CONFIRMED_ENABLED' | 'UNKNOWN';
}
export interface AudioState {
  panes: AudioPane[]; selectedPaneId: string | null; audioFocusId: string | null; audioError: string | null;
}
export function createAudioState(): AudioState {
  return { panes: [], selectedPaneId: null, audioFocusId: null, audioError: null };
}
export interface AudioPort { setMuted(sessionId: string, muted: boolean): Promise<void> }
export async function transferAudioFocus(state: AudioState, paneId: string, port: AudioPort): Promise<AudioState> {
  const target = state.panes.find(pane => pane.id === paneId);
  if (!target) return state;
  const selected = { ...state, selectedPaneId: paneId }; const failedMutes = new Set<string>();
  // Mute all existing sessions before even considering enabling one. A failure never enables another source.
  for (const pane of state.panes) if (pane.playbackSession) {
    try { await port.setMuted(pane.playbackSession, true); } catch { failedMutes.add(pane.id); }
  }
  const allMuted: AudioState = { ...selected, panes: selected.panes.map(pane => ({ ...pane, muted: true,
    audioState: failedMutes.has(pane.id) || !pane.playbackSession ? 'UNKNOWN' : 'CONFIRMED_MUTED' })), audioFocusId: null };
  if (failedMutes.size) return { ...allMuted, audioError: 'Mute confirmation failed; audio state is unknown for the failed session and requires retry.' };
  if (!target.playbackSession || target.availability !== 'READY') return { ...allMuted, audioError: 'Selected pane has no ready playback session.' };
  try { await port.setMuted(target.playbackSession, false); }
  catch {
    let compensated = true;
    try { await port.setMuted(target.playbackSession, true); } catch { compensated = false; }
    return { ...allMuted, panes: allMuted.panes.map(pane => pane.id === paneId ? { ...pane, audioState: compensated ? 'CONFIRMED_MUTED' : 'UNKNOWN' } : pane),
      audioError: compensated ? 'Audio focus failed; all panes requested muted.' : 'Audio focus and fallback mute failed; selected session audio is unknown.' };
  }
  return { ...allMuted, audioError: null, audioFocusId: paneId, panes: allMuted.panes.map(pane => pane.id === paneId ? { ...pane, muted: false, audioState: 'CONFIRMED_ENABLED' } : pane) };
}
/** Serialize rapid clicks so independent handoffs cannot leave two sessions audible. */
export function createAudioFocusController(port: AudioPort) {
  let queue: Promise<AudioState> | null = null;
  return {
    focus(state: AudioState, paneId: string): Promise<AudioState> {
      const next = (queue ?? Promise.resolve(state)).catch(() => state).then(previous => transferAudioFocus({ ...state,
        panes: state.panes.map(pane => ({ ...pane, muted: previous.panes.find(old => old.id === pane.id)?.muted ?? true })), audioFocusId: previous.audioFocusId,
      }, paneId, port));
      queue = next; return next;
    },
  };
}
