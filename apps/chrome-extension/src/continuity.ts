import type { AdapterObservation } from '../../../packages/yttv-adapter/src/index';
export type PlayerCapture = AdapterObservation & { playerKey?: string };
export function captureUsable(v: PlayerCapture | undefined): v is PlayerCapture {
  return Boolean(v?.route === 'watch' && v.playerKey && typeof v.playback.playing === 'boolean' &&
    typeof v.playback.muted === 'boolean' && Number.isFinite(v.playback.currentTime) && v.playback.currentTime !== null &&
    Number.isFinite(v.playback.volume) && v.playback.volume !== null);
}
/** Same tab is necessary but not sufficient: fail explicitly on player replacement or paused-position drift. */
export function continuity(before: PlayerCapture, after: PlayerCapture | undefined): boolean {
  if (!captureUsable(before) || !captureUsable(after)) return false;
  const a = before.playback, b = after.playback;
  return before.playerKey === after.playerKey && before.currentProgram === after.currentProgram && before.currentChannelId === after.currentChannelId &&
    a.playing === b.playing && a.muted === b.muted && Math.abs(a.volume! - b.volume!) < .01 &&
    (a.playing ? b.currentTime! >= a.currentTime! - 1 && b.currentTime! - a.currentTime! <= 30 : Math.abs(a.currentTime! - b.currentTime!) <= 1);
}
