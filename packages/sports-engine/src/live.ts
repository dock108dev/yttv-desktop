import { freshnessOf, isoNow, type SportsEvent } from '../../core/src/index';
import { SportsEngine } from './index';

export interface LiveSportsSnapshot {
  provider: string; leagues: string[]; events: SportsEvent[];
  state: 'READY' | 'ACCESS_REQUIRED' | 'PERMISSION_REQUIRED' | 'UNAVAILABLE' | 'RATE_LIMITED';
  disclosure: string; fetchedAt: string | null; nextRefreshAt: string | null;
}
export const NBA_DISCLOSURE = 'NBA · BALLDONTLIE · best-effort current game data. Source update time and delivery delay are unknown. Broadcast metadata is unavailable. Other leagues are not connected.';
export function unavailableSports(state: LiveSportsSnapshot['state'] = 'PERMISSION_REQUIRED'): LiveSportsSnapshot {
  return { provider: 'balldontlie-nba', leagues: ['NBA'], events: [], state, disclosure: NBA_DISCLOSURE,
    fetchedAt: null, nextRefreshAt: null };
}
/** No autonomous background acquisition: one coalesced refresh per demand window. */
export class SportsPoller {
  private result = unavailableSports('ACCESS_REQUIRED');
  private pending: Promise<LiveSportsSnapshot> | null = null;
  private next = 0;
  private failures = 0;
  constructor(private readonly engine: SportsEngine, private readonly clock: () => number = Date.now) {}
  snapshot(): LiveSportsSnapshot {
    return { ...structuredClone(this.result), events: this.result.events.map(event => ({ ...structuredClone(event),
      freshness: this.result.state === 'READY' ? freshnessOf(event, this.clock()) : 'STALE' })) };
  }
  refresh(): Promise<LiveSportsSnapshot> {
    if (this.pending) return this.pending;
    if (this.clock() < this.next) return Promise.resolve(this.snapshot());
    this.pending = this.perform().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async perform(): Promise<LiveSportsSnapshot> {
    const value = await this.engine.refresh();
    this.failures = value.error ? this.failures + 1 : 0;
    // 60s minimum; exponential failure backoff to 15m. A 429 cannot trigger a retry storm.
    this.next = this.clock() + Math.min(900_000, 60_000 * 2 ** Math.min(this.failures, 4));
    this.result = { provider: this.engine.provider.id, leagues: ['NBA'], events: value.events,
      state: value.error ?? 'READY', disclosure: this.engine.provider.disclosure,
      fetchedAt: value.error ? this.result.fetchedAt : isoNow(this.clock()), nextRefreshAt: isoNow(this.next) };
    return this.snapshot();
  }
}
