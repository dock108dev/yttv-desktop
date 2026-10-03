import { freshnessOf, timestamp } from '../../../packages/core/src/index';
import { mergeEventSnapshots, normalizeEvent } from '../../../packages/sports-engine/src/index';
import { NBA_DISCLOSURE, unavailableSports, type LiveSportsSnapshot } from '../../../packages/sports-engine/src/live';

export const SPORTS_PERMISSION = 'http://127.0.0.1:4318/*';
export const SPORTS_URL = 'http://127.0.0.1:4318/v1/nba/snapshot';
export function validateSportsSnapshot(raw: unknown): LiveSportsSnapshot {
  const value = raw as LiveSportsSnapshot | null;
  if (!value || value.provider !== 'balldontlie-nba' || !Array.isArray(value.events) || value.events.length > 500 ||
    !['READY', 'UNAVAILABLE', 'RATE_LIMITED', 'ACCESS_REQUIRED'].includes(value.state)) throw new Error('Invalid sports metadata.');
  const events = value.events.map(event => {
    if (!event || event.source !== value.provider || event.evidenceClass !== 'LIVE' || event.league !== 'NBA' ||
      !/^balldontlie:nba:game:[1-9]\d{0,12}$/.test(event.id) || timestamp(event.fetchedAt) === null ||
      event.id !== `balldontlie:nba:game:${event.providerEventId}`) throw new Error('Invalid sports identity.');
    return normalizeEvent({ ...event, originalChannel: null, currentChannel: null, broadcastNetworks: [], sourceUpdatedAt: null });
  });
  return { provider: value.provider, leagues: ['NBA'], state: value.state, events, disclosure: NBA_DISCLOSURE,
    fetchedAt: timestamp(value.fetchedAt) === null ? null : value.fetchedAt,
    nextRefreshAt: timestamp(value.nextRefreshAt) === null ? null : value.nextRefreshAt };
}
export function createSportsClient(options: { permitted: () => boolean; request?: typeof fetch; clock?: () => number }) {
  const clock = options.clock ?? Date.now; const request: typeof fetch = options.request ?? ((url, init) => globalThis.fetch(url, init));
  let current = unavailableSports(); let next = 0; let failures = 0;
  let pending: Promise<LiveSportsSnapshot> | null = null;
  function snapshot(): LiveSportsSnapshot {
    return { ...structuredClone(current), events: current.events.map(event => ({ ...structuredClone(event),
      freshness: current.state === 'READY' ? freshnessOf(event, clock()) : 'STALE' })) };
  }
  async function perform(): Promise<LiveSportsSnapshot> {
    if (!options.permitted()) { current = { ...current, state: 'PERMISSION_REQUIRED' }; return snapshot(); }
    try {
      const response = await request(SPORTS_URL, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Sports relay unavailable.');
      const incoming = validateSportsSnapshot(await response.json());
      current = { ...incoming, events: mergeEventSnapshots(current.events, incoming.events) };
      failures = current.state === 'READY' ? 0 : failures + 1;
    } catch { current = { ...current, state: 'UNAVAILABLE' }; failures++; }
    next = clock() + Math.min(900_000, 60_000 * 2 ** Math.min(failures, 4));
    const providerNext = timestamp(current.nextRefreshAt);
    if (providerNext !== null) next = Math.max(next, Math.min(clock() + 900_000, providerNext));
    return snapshot();
  }
  return { snapshot, restore(raw: unknown) { try { current = validateSportsSnapshot(raw); } catch { /* Retain initial unavailable state. */ } },
    refresh(): Promise<LiveSportsSnapshot> {
      if (pending) return pending;
      if (clock() < next) return Promise.resolve(snapshot());
      pending = perform().finally(() => { pending = null; }); return pending;
    } };
}
