import { freshnessOf, type ChannelRef, type PlaybackTarget, type SportsEvent } from '../../core/src/index.js';
import { eventVisibility } from '../../sports-engine/src/index.js';
import { resolveEvent } from '../../event-resolver/src/index.js';
import { sanitizeSavedLayout, type SavedQuadLayout } from '../../storage/src/index.js';
import type { GuideEntry } from '../../core/src/index.js';

export interface QuadPane {
  id: string; eventId: string | null; resolvedChannel: ChannelRef | null; playbackTarget: PlaybackTarget | null;
  playbackSession: string | null; lastKnownEvent: SportsEvent | null;
  availability: 'READY' | 'UNAVAILABLE' | 'REVALIDATION_REQUIRED'; muted: boolean;
  audioState?: 'CONFIRMED_MUTED' | 'CONFIRMED_AUDIBLE' | 'UNKNOWN';
}
export interface QuadState {
  panes: QuadPane[]; selectedPaneId: string | null; audioFocusId: string | null;
  layout: 'GRID' | 'EXPANDED'; expandedPaneId: string | null; previousLayout: { selectedPaneId: string | null } | null;
  maxPanes: 2 | 3 | 4; nightMuteLock: boolean; audioError: string | null;
}
export function createQuadState(options: { maxPanes?: 2 | 3 | 4; nightMuteLock?: boolean } = {}): QuadState {
  return { panes: [], selectedPaneId: null, audioFocusId: null, layout: 'GRID', expandedPaneId: null, previousLayout: null,
    maxPanes: options.maxPanes ?? 4, nightMuteLock: options.nightMuteLock ?? true, audioError: null };
}
function validPane(pane: QuadPane): QuadPane {
  if (!pane.id || (pane.lastKnownEvent && pane.eventId !== pane.lastKnownEvent.id) ||
      (pane.playbackTarget && pane.playbackTarget.channelId !== pane.resolvedChannel?.id)) throw new Error('Pane identity, event or channel target is inconsistent.');
  return { ...pane, muted: true };
}
export function addPane(state: QuadState, pane: QuadPane): QuadState {
  if (state.panes.length >= state.maxPanes) throw new Error(`Pane limit ${state.maxPanes} reached; this is a state limit, not proof of stream eligibility.`);
  if (state.panes.some(existing => existing.id === pane.id)) throw new Error('Pane IDs must be unique.');
  if (pane.playbackSession && state.panes.some(existing => existing.playbackSession === pane.playbackSession)) throw new Error('Independent panes require independent playback sessions.');
  return { ...state, panes: [...state.panes, validPane(pane)], selectedPaneId: state.selectedPaneId ?? pane.id };
}
/** Selection never unmutes a session. Runtime audio changes require the explicit handoff below. */
export function selectPane(state: QuadState, paneId: string): QuadState {
  if (!state.panes.some(pane => pane.id === paneId)) return state;
  return { ...state, selectedPaneId: paneId };
}
export function expandPane(state: QuadState, paneId = state.selectedPaneId): QuadState {
  if (!paneId || !state.panes.some(pane => pane.id === paneId)) return state;
  return { ...state, selectedPaneId: paneId, layout: 'EXPANDED', expandedPaneId: paneId,
    previousLayout: state.previousLayout ?? { selectedPaneId: state.selectedPaneId } };
}
export function restoreLayout(state: QuadState): QuadState {
  if (state.layout !== 'EXPANDED') return state;
  const previousId = state.previousLayout?.selectedPaneId;
  return { ...state, layout: 'GRID', expandedPaneId: null, previousLayout: null,
    selectedPaneId: previousId && state.panes.some(pane => pane.id === previousId) ? previousId : state.selectedPaneId };
}
export function replacePane(state: QuadState, paneId: string, replacement: Omit<QuadPane, 'id'>): QuadState {
  if (!state.panes.some(pane => pane.id === paneId)) throw new Error('Cannot replace a missing pane.');
  if (replacement.playbackSession && state.panes.some(pane => pane.id !== paneId && pane.playbackSession === replacement.playbackSession)) throw new Error('Replacement cannot reuse another pane session.');
  const next = validPane({ ...replacement, id: paneId });
  return { ...state, panes: state.panes.map(pane => pane.id === paneId ? next : pane),
    audioFocusId: state.audioFocusId === paneId ? null : state.audioFocusId, audioError: null };
}
export function removePane(state: QuadState, paneId: string): QuadState {
  const panes = state.panes.filter(pane => pane.id !== paneId);
  const next = { ...state, panes, selectedPaneId: state.selectedPaneId === paneId ? panes[0]?.id ?? null : state.selectedPaneId,
    audioFocusId: state.audioFocusId === paneId ? null : state.audioFocusId };
  return state.expandedPaneId === paneId ? { ...next, layout: 'GRID' as const, expandedPaneId: null, previousLayout: null } : next;
}
/** A fresh FINAL updates the pane in place; stale observations never fabricate a terminal state. */
export function updatePaneEvent(state: QuadState, event: SportsEvent, now = Date.now()): QuadState {
  return { ...state, panes: state.panes.map(pane => {
    if (pane.eventId !== event.id) return pane;
    const old = pane.lastKnownEvent;
    if (old && Date.parse(event.fetchedAt) < Date.parse(old.fetchedAt)) return pane;
    return { ...pane, lastKnownEvent: event, availability: freshnessOf(event, now) === 'FRESH' ? pane.availability : 'REVALIDATION_REQUIRED' };
  }) };
}
export interface AudioPort { setMuted(sessionId: string, muted: boolean): Promise<void> }
export async function transferAudioFocus(state: QuadState, paneId: string, port: AudioPort): Promise<QuadState> {
  const target = state.panes.find(pane => pane.id === paneId);
  if (!target) return state;
  const selected = selectPane(state, paneId); const failedMutes = new Set<string>();
  // Mute all existing sessions before even considering enabling one. A failure never enables another source.
  for (const pane of state.panes) if (pane.playbackSession) {
    try { await port.setMuted(pane.playbackSession, true); } catch { failedMutes.add(pane.id); }
  }
  const allMuted: QuadState = { ...selected, panes: selected.panes.map(pane => ({ ...pane, muted: true,
    audioState: failedMutes.has(pane.id) || !pane.playbackSession ? 'UNKNOWN' : 'CONFIRMED_MUTED' })), audioFocusId: null };
  if (failedMutes.size) return { ...allMuted, audioError: 'Mute confirmation failed; audio state is unknown for the failed session and requires retry.' };
  if (state.nightMuteLock) return { ...allMuted, audioError: null };
  if (!target.playbackSession || target.availability !== 'READY') return { ...allMuted, audioError: 'Selected pane has no ready playback session.' };
  try { await port.setMuted(target.playbackSession, false); }
  catch {
    let compensated = true;
    try { await port.setMuted(target.playbackSession, true); } catch { compensated = false; }
    return { ...allMuted, panes: allMuted.panes.map(pane => pane.id === paneId ? { ...pane, audioState: compensated ? 'CONFIRMED_MUTED' : 'UNKNOWN' } : pane),
      audioError: compensated ? 'Audio focus failed; all panes requested muted.' : 'Audio focus and fallback mute failed; selected session audio is unknown.' };
  }
  return { ...allMuted, audioError: null, audioFocusId: paneId, panes: allMuted.panes.map(pane => pane.id === paneId ? { ...pane, muted: false, audioState: 'CONFIRMED_AUDIBLE' } : pane) };
}
/** Serialize rapid clicks so independent handoffs cannot leave two sessions audible. */
export function createAudioFocusController(port: AudioPort) {
  let queue: Promise<QuadState> | null = null;
  return {
    focus(state: QuadState, paneId: string): Promise<QuadState> {
      const next = (queue ?? Promise.resolve(state)).catch(() => state).then(previous => transferAudioFocus({ ...state,
        panes: state.panes.map(pane => ({ ...pane, muted: previous.panes.find(old => old.id === pane.id)?.muted ?? true })), audioFocusId: previous.audioFocusId,
      }, paneId, port));
      queue = next; return next;
    },
  };
}
export interface PlaybackSessionPort { destroyPlaybackSession(sessionId: string): Promise<void> }
export async function replacePaneSession(state: QuadState, paneId: string, replacement: Omit<QuadPane, 'id'>, port: PlaybackSessionPort): Promise<QuadState> {
  const old = state.panes.find(pane => pane.id === paneId);
  if (!old) throw new Error('Cannot replace a missing pane.');
  const next = replacePane(state, paneId, replacement);
  if (old.playbackSession && old.playbackSession !== replacement.playbackSession) await port.destroyPlaybackSession(old.playbackSession);
  return next;
}
export function suggestLiveAlternatives(state: QuadState, events: readonly SportsEvent[], guide: readonly GuideEntry[], now = Date.now()): SportsEvent[] {
  const existing = new Set(state.panes.map(pane => pane.eventId).filter(Boolean));
  return events.filter(event => !existing.has(event.id) && eventVisibility(event, now).group === 'LIVE' && resolveEvent(event, guide, { now }).state === 'CONFIRMED');
}
export function saveQuadLayout(state: QuadState, id: string, name = 'Last QuadBox'): SavedQuadLayout {
  return { id, name, selectedPaneId: state.selectedPaneId, panes: state.panes.map(pane => ({ id: pane.id, eventId: pane.eventId,
    channelId: pane.resolvedChannel?.id ?? null, target: null })) };
}
export function restoreSavedQuadLayout(raw: unknown, options: { maxPanes?: 2 | 3 | 4; nightMuteLock?: boolean } = {}): QuadState {
  const saved = sanitizeSavedLayout(raw); let state = createQuadState(options);
  if (!saved) return state;
  for (const pane of saved.panes.slice(0, state.maxPanes)) state = addPane(state, { id: pane.id, eventId: pane.eventId,
    resolvedChannel: pane.channelId ? { id: pane.channelId, name: 'Saved channel — revalidate' } : null,
    playbackTarget: null, playbackSession: null, lastKnownEvent: null, availability: 'REVALIDATION_REQUIRED', muted: true });
  return saved.selectedPaneId ? selectPane(state, saved.selectedPaneId) : state;
}
