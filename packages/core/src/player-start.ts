/** Inert extension page used before muting and navigating a newly created player. */
export const PLAYER_START_PATH = 'player-start.html';
/** Storage shape only; the worker must additionally match its own runtime URL. */
export function isPlayerStartUrl(value: unknown): value is string {
  return typeof value === 'string' && /^chrome-extension:\/\/[a-p]{32}\/player-start\.html$/.test(value);
}
