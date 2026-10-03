import {
  ACTIVE_STATUSES, HELD_STATUSES, TERMINAL_STATUSES, EVENT_STATUSES, DEFAULT_FRESHNESS_POLICY,
  freshnessOf, normalizeText, timestamp, isoNow,
  type SportsEvent, type SportsProvider, type EventStatus, type FreshnessPolicy, type EvidenceClass, type Team,
} from '../../core/src/index.js';

export const FIXTURE_DISCLOSURE = 'Illustrative fixtures — not live scores, channel carriage, entitlement, or playback evidence.';
export type VisibilityGroup = 'LIVE' | 'HELD' | 'UPCOMING' | 'UNCERTAIN' | 'HISTORY';
export interface EventVisibility { group: VisibilityGroup; label: string; isFresh: boolean; activePlay: boolean; reason: string }
const STATUS_LABELS: Record<EventStatus, string> = {
  SCHEDULED: 'Scheduled', PREGAME: 'Pregame', LIVE: 'Live', DELAYED: 'Delayed', HALFTIME: 'Halftime',
  OVERTIME: 'Overtime', EXTRA_INNINGS: 'Extra innings', SUSPENDED: 'Suspended', FINAL: 'Final',
  POSTPONED: 'Postponed', CANCELLED: 'Cancelled', UNKNOWN: 'Status unknown',
};
export function eventVisibility(event: SportsEvent, now = Date.now(), policy: Partial<FreshnessPolicy> = {}): EventVisibility {
  const freshness = freshnessOf(event, now, policy);
  if (freshness !== 'FRESH') {
    const sourceTime = timestamp(event.sourceUpdatedAt); const fetchTime = timestamp(event.fetchedAt);
    const futureLimit = now + (policy.futureClockSkewMs ?? DEFAULT_FRESHNESS_POLICY.futureClockSkewMs);
    const lastObservation = sourceTime !== null && sourceTime <= futureLimit ? sourceTime :
      fetchTime !== null && fetchTime <= futureLimit ? fetchTime : null;
    const retain = lastObservation !== null && now - lastObservation <= (policy.uncertainRetentionMs ?? DEFAULT_FRESHNESS_POLICY.uncertainRetentionMs);
    return { group: retain ? 'UNCERTAIN' : 'HISTORY', label: 'Status unavailable', isFresh: false, activePlay: false,
      reason: retain ? `Last known: ${STATUS_LABELS[event.status]}; current state requires refresh.` : 'Current state unresolved; not promoted as live and not assumed final.' };
  }
  if (ACTIVE_STATUSES.has(event.status)) return {
    group: 'LIVE', label: event.statusDetail || STATUS_LABELS[event.status], isFresh: true,
    activePlay: event.status !== 'HALFTIME', reason: 'Fresh sports state controls visibility regardless of scheduled end.',
  };
  if (HELD_STATUSES.has(event.status)) return {
    group: 'HELD', label: event.statusDetail || STATUS_LABELS[event.status], isFresh: true, activePlay: false,
    reason: 'Discoverable on hold; active play is not asserted.',
  };
  if (TERMINAL_STATUSES.has(event.status)) return {
    group: 'HISTORY', label: STATUS_LABELS[event.status], isFresh: true, activePlay: false, reason: 'Fresh provider terminal state.',
  };
  if (event.status === 'SCHEDULED' || event.status === 'PREGAME') return {
    group: 'UPCOMING', label: event.statusDetail || STATUS_LABELS[event.status], isFresh: true, activePlay: false,
    reason: 'Scheduled time never establishes that play started.',
  };
  return { group: 'UNCERTAIN', label: 'Status unknown', isFresh: true, activePlay: false, reason: 'Provider did not establish an event state.' };
}
function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null; }
function team(value: Team): Team {
  if (!value || typeof value.id !== 'string' || !value.id.trim() || typeof value.name !== 'string' || !value.name.trim()) throw new Error('Event requires named home and away teams with stable IDs.');
  return { id: value.id, name: value.name.trim(), ...(nullableText(value.shortName) ? { shortName: value.shortName } : {}),
    ...(Array.isArray(value.aliases) ? { aliases: value.aliases.filter(alias => typeof alias === 'string').slice(0, 30) } : {}) };
}
function scoreValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
export type EventInput = Partial<SportsEvent> & Pick<SportsEvent, 'id' | 'league' | 'homeTeam' | 'awayTeam' | 'scheduledStart'>;
export function normalizeEvent(input: EventInput, options: { now?: number; source?: string; evidenceClass?: EvidenceClass } = {}): SportsEvent {
  if (!input.id || !input.league || (input.scheduledStart !== null && timestamp(input.scheduledStart) === null)) throw new Error('Event requires a stable ID, league and valid or unknown scheduled start.');
  const status = EVENT_STATUSES.includes(input.status as EventStatus) ? input.status as EventStatus : 'UNKNOWN';
  const now = options.now ?? Date.now();
  const evidenceClass = ['FIXTURE', 'REPLAY', 'LIVE'].includes(String(input.evidenceClass)) ? input.evidenceClass! : options.evidenceClass ?? 'REPLAY';
  return {
    id: input.id, league: input.league, homeTeam: team(input.homeTeam), awayTeam: team(input.awayTeam),
    scheduledStart: input.scheduledStart === null ? null : new Date(input.scheduledStart).toISOString(), scheduledEnd: timestamp(input.scheduledEnd) !== null ? new Date(input.scheduledEnd!).toISOString() : null,
    status, statusDetail: nullableText(input.statusDetail),
    score: input.score ? { home: scoreValue(input.score.home), away: scoreValue(input.score.away) } : null,
    period: nullableText(input.period), clock: nullableText(input.clock),
    broadcastNetworks: Array.isArray(input.broadcastNetworks) ? input.broadcastNetworks.filter(network => network && nullableText(network.name)).map(network => ({
      name: network.name.trim(), ...(nullableText(network.networkId) ? { networkId: network.networkId } : {}),
      ...(nullableText(network.source) ? { source: network.source } : {}),
      ...(timestamp(network.observedAt) !== null ? { observedAt: network.observedAt } : {}),
    })) : [],
    originalChannel: input.originalChannel ? { ...input.originalChannel } : null, currentChannel: input.currentChannel ? { ...input.currentChannel } : null,
    // Provider input cannot grant playback eligibility. Resolution uses a current observed guide instead.
    yttvTarget: null, providerEventId: input.providerEventId || input.id, source: input.source || options.source || 'unverified',
    fetchedAt: timestamp(input.fetchedAt) !== null ? new Date(input.fetchedAt!).toISOString() : isoNow(now),
    sourceUpdatedAt: timestamp(input.sourceUpdatedAt) !== null ? new Date(input.sourceUpdatedAt!).toISOString() : null,
    freshness: ['FRESH', 'STALE', 'UNKNOWN'].includes(String(input.freshness)) ? input.freshness! : 'UNKNOWN', evidenceClass,
  };
}
const LEAGUE_ALIASES: Record<string, string[]> = {
  MLB: ['baseball', 'major league baseball'], NFL: ['football', 'national football league'],
  NCAA_FOOTBALL: ['ncaa football', 'college football', 'ncaaf', 'ncaa'], NBA: ['basketball', 'national basketball association'],
  NHL: ['hockey', 'national hockey league'],
};
export function searchEvents(events: readonly SportsEvent[], query: string, options: { now?: number; includeHistory?: boolean } = {}): SportsEvent[] {
  const normalized = normalizeText(query); const tokens = normalized.split(' ').filter(Boolean);
  const now = options.now ?? Date.now();
  return events.map((event, index) => {
    const names = [event.homeTeam.name, event.awayTeam.name, event.homeTeam.shortName ?? '', event.awayTeam.shortName ?? '',
      ...(event.homeTeam.aliases ?? []), ...(event.awayTeam.aliases ?? [])].map(normalizeText);
    const leagues = [event.league, ...(LEAGUE_ALIASES[event.league.toUpperCase().replace(/[\s-]+/g, '_')] ?? [])].map(normalizeText);
    const text = [...names, ...leagues, ...event.broadcastNetworks.map(network => normalizeText(network.name))].join(' ');
    const visibility = eventVisibility(event, now);
    const matches = tokens.every(token => text.includes(token));
    const exactTeam = normalized && names.some(name => name === normalized || name.includes(normalized));
    const exactLeague = normalized && leagues.some(league => league === normalized);
    const rank = (exactTeam ? 100 : exactLeague ? 50 : 0) + ({ LIVE: 20, HELD: 15, UNCERTAIN: 10, UPCOMING: 5, HISTORY: 0 }[visibility.group]);
    return { event, index, matches: matches && (options.includeHistory !== false || visibility.group !== 'HISTORY'), rank };
  }).filter(result => result.matches).sort((a, b) => b.rank - a.rank || a.index - b.index).map(({ event }) => event);
}
/** Empty feeds/errors never erase or finalize a tracked event. A newer provider correction is accepted. */
export function mergeEventSnapshots(previous: readonly SportsEvent[], incoming: readonly SportsEvent[]): SportsEvent[] {
  const events = new Map(previous.map(event => [event.id, event]));
  for (const next of incoming) {
    const old = events.get(next.id);
    if (!old) { events.set(next.id, next); continue; }
    const oldFetched = timestamp(old.fetchedAt) ?? -Infinity; const nextFetched = timestamp(next.fetchedAt) ?? -Infinity;
    const oldUpdated = timestamp(old.sourceUpdatedAt); const nextUpdated = timestamp(next.sourceUpdatedAt);
    if (nextFetched < oldFetched || (oldUpdated !== null && nextUpdated !== null && nextUpdated < oldUpdated)) continue;
    if (old.source !== next.source || old.evidenceClass !== next.evidenceClass) continue;
    events.set(next.id, next);
  }
  return [...events.values()];
}
export class SportsProviderError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'UNAVAILABLE' | 'RATE_LIMITED', message: string) { super(message); this.name = 'SportsProviderError'; }
}
export function createIllustrativeFixtures(now: number | Date = Date.now()): SportsEvent[] {
  const time = now instanceof Date ? now.getTime() : now; const iso = (offset: number) => isoNow(time + offset);
  const event = (id: string, league: string, home: Team, away: Team, status: EventStatus, network: string, extras: Partial<SportsEvent>): SportsEvent => normalizeEvent({
    id: `fixture:${id}`, providerEventId: id, source: 'illustrative-fixtures', evidenceClass: 'FIXTURE', league, homeTeam: home, awayTeam: away,
    scheduledStart: iso(-3 * 60 * 60_000), scheduledEnd: iso(-60 * 60_000), fetchedAt: iso(0), sourceUpdatedAt: iso(0), freshness: 'FRESH',
    status, broadcastNetworks: [{ name: network, networkId: network, source: 'illustrative-fixtures', observedAt: iso(0) }], ...extras,
  }, { now: time });
  return [
    event('yankees-extra-innings', 'MLB', { id: 'fixture:nyy', name: 'New York Yankees', shortName: 'Yankees', aliases: ['NYY'] },
      { id: 'fixture:bos', name: 'Boston Red Sox', shortName: 'Red Sox' }, 'EXTRA_INNINGS', 'YES', { score: { home: 5, away: 5 }, period: 'Bottom 11', statusDetail: 'Extra innings — beyond scheduled end' }),
    event('rutgers-fourth', 'NCAA_FOOTBALL', { id: 'fixture:rutgers', name: 'Rutgers Scarlet Knights', shortName: 'Rutgers' },
      { id: 'fixture:opponent-rutgers', name: 'Illustrative Opponent' }, 'LIVE', 'FOX', { score: { home: 24, away: 21 }, period: '4th quarter', clock: '3:18', scheduledEnd: iso(20 * 60_000) }),
    event('georgia-resumed', 'NCAA_FOOTBALL', { id: 'fixture:georgia', name: 'Georgia Bulldogs', shortName: 'Georgia' },
      { id: 'fixture:opponent-georgia', name: 'Illustrative Opponent' }, 'LIVE', 'ESPN2', { score: { home: 17, away: 14 }, period: '3rd quarter', statusDetail: 'Resumed after weather delay', scheduledEnd: iso(-10 * 60_000) }),
    event('rangers-delayed', 'NHL', { id: 'fixture:nyr', name: 'New York Rangers', shortName: 'Rangers', aliases: ['NYR'] },
      { id: 'fixture:bos-nhl', name: 'Boston Bruins', shortName: 'Bruins' }, 'DELAYED', 'ESPN', { score: null, period: null, statusDetail: 'Start delayed — play not confirmed' }),
    event('knicks-upcoming', 'NBA', { id: 'fixture:nyk', name: 'New York Knicks', shortName: 'Knicks', aliases: ['NYK'] },
      { id: 'fixture:bos-nba', name: 'Boston Celtics', shortName: 'Celtics' }, 'SCHEDULED', 'ESPN', { scheduledStart: iso(2 * 60 * 60_000), scheduledEnd: iso(5 * 60 * 60_000) }),
    event('nfl-unknown', 'NFL', { id: 'fixture:nyg', name: 'New York Giants', shortName: 'Giants' },
      { id: 'fixture:opponent-nfl', name: 'Illustrative Opponent' }, 'UNKNOWN', 'FOX', { score: null, statusDetail: 'Provider state unavailable', freshness: 'UNKNOWN' }),
  ];
}
export function createFixtureProvider(now: number | Date = Date.now()): SportsProvider {
  const fixtures = createIllustrativeFixtures(now);
  const clone = (event: SportsEvent): SportsEvent => structuredClone(event);
  return {
    id: 'illustrative-fixtures', evidenceClass: 'FIXTURE', disclosure: FIXTURE_DISCLOSURE,
    async getEvents(date: string) {
      const parsed = timestamp(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parsed === null || isoNow(parsed).slice(0, 10) !== date) throw new SportsProviderError('UNAVAILABLE', 'Expected a valid UTC date in YYYY-MM-DD format.');
      return fixtures.filter(event => event.scheduledStart?.slice(0, 10) === date).map(clone);
    },
    async getEvent(id: string) {
      const event = fixtures.find(candidate => candidate.id === id || candidate.providerEventId === id);
      if (!event) throw new SportsProviderError('NOT_FOUND', 'Illustrative event not found.');
      return clone(event);
    },
    async getLiveEvents() { return fixtures.filter(event => ACTIVE_STATUSES.has(event.status) || HELD_STATUSES.has(event.status)).map(clone); },
  };
}
export class SportsEngine {
  private events: SportsEvent[] = [];
  private lastError: 'UNAVAILABLE' | 'RATE_LIMITED' | null = null;
  private trackedCursor = 0;
  constructor(public readonly provider: SportsProvider, private readonly clock: () => number = Date.now) {}
  snapshot(): { events: SportsEvent[]; error: 'UNAVAILABLE' | 'RATE_LIMITED' | null; evidenceClass: EvidenceClass; disclosure: string } {
    return { events: structuredClone(this.events), error: this.lastError, evidenceClass: this.provider.evidenceClass, disclosure: this.provider.disclosure };
  }
  async refresh(date = isoNow(this.clock()).slice(0, 10)): Promise<ReturnType<SportsEngine['snapshot']>> {
    try {
      const scheduled = await this.provider.getEvents(date);
      const live = await this.provider.getLiveEvents();
      // Namespace and evidence-class disagreement is a provider failure, never silently promoted.
      const incoming = [...scheduled, ...live];
      if (incoming.some(event => event.source !== this.provider.id || event.evidenceClass !== this.provider.evidenceClass)) throw new SportsProviderError('UNAVAILABLE', 'Provider evidence identity mismatch.');
      this.events = mergeEventSnapshots(this.events, incoming); this.lastError = null;
      // One round-robin detail per refresh keeps missing held/active IDs alive across dates.
      const missing = this.events.filter(event => !incoming.some(next => next.id === event.id) && !TERMINAL_STATUSES.has(event.status));
      if (missing.length) {
        const requested = missing[this.trackedCursor++ % missing.length].id;
        const tracked = await this.provider.getEvent(requested);
        if (tracked.id !== requested || tracked.source !== this.provider.id || tracked.evidenceClass !== this.provider.evidenceClass) throw new SportsProviderError('UNAVAILABLE', 'Tracked event identity mismatch.');
        this.events = mergeEventSnapshots(this.events, [tracked]);
      }
    } catch (error) {
      this.lastError = error instanceof SportsProviderError && error.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UNAVAILABLE';
    }
    return this.snapshot();
  }
  search(query: string, includeHistory = true): SportsEvent[] { return searchEvents(this.events, query, { now: this.clock(), includeHistory }); }
}
