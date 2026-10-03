import { ACTIVE_STATUSES, HELD_STATUSES, isoNow, timestamp, type EventStatus, type SportsEvent, type SportsProvider, type Team } from '../../core/src/index';
import { normalizeEvent, SportsProviderError } from './index';
import { NBA_DISCLOSURE } from './live';

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim().slice(0, 150) : null;
function team(value: unknown): Team {
  const row = record(value);
  if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || !text(row.full_name)) throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA team identity.');
  return { id: `balldontlie:nba:team:${row.id}`, name: text(row.full_name)!, shortName: text(row.name) ?? undefined,
    aliases: [text(row.abbreviation)].filter((value): value is string => Boolean(value)) };
}
export function normalizeNBAGame(value: unknown, fetchedAt: string): SportsEvent {
  const row = record(value);
  if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0) throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA event identity.');
  const lifecycle: Record<string, EventStatus> = { scheduled: 'SCHEDULED', in_progress: 'LIVE', final: 'FINAL',
    postponed: 'POSTPONED', canceled: 'CANCELLED', delayed: 'DELAYED', suspended: 'SUSPENDED', abandoned: 'UNKNOWN', unknown: 'UNKNOWN' };
  const label = text(row.status);
  // Explicit lifecycle takes precedence; an unknown/new lifecycle never falls through to inferred finality.
  let status: EventStatus = typeof row.status_state === 'string' ? lifecycle[row.status_state] ?? 'UNKNOWN' :
    row.postponed === true ? 'POSTPONED' : label === 'Final' ? 'FINAL' : label === 'Halftime' ? 'HALFTIME' :
    /^(1st|2nd|3rd|4th) Qtr$/.test(label ?? '') ? 'LIVE' : /^\d{1,2}:\d{2} [ap]m ET$/i.test(label ?? '') ? 'SCHEDULED' : 'UNKNOWN';
  const period = typeof row.period === 'number' && Number.isInteger(row.period) && row.period > 0 ? row.period : null;
  if (status === 'LIVE' && label === 'Halftime') status = 'HALFTIME';
  if (status === 'LIVE' && period !== null && period > 4) status = 'OVERTIME';
  const started = ['LIVE', 'HALFTIME', 'OVERTIME', 'FINAL', 'DELAYED', 'SUSPENDED'].includes(status);
  const score = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  return normalizeEvent({ id: `balldontlie:nba:game:${row.id}`, providerEventId: String(row.id), league: 'NBA',
    homeTeam: team(row.home_team), awayTeam: team(row.visitor_team), scheduledStart: timestamp(row.datetime) === null ? null : String(row.datetime),
    scheduledEnd: null, status, statusDetail: label, score: started ? { home: score(row.home_team_score), away: score(row.visitor_team_score) } : null,
    period: period === null ? null : period > 4 ? `Overtime ${period - 4}` : `Quarter ${period}`,
    clock: /^\d{1,2}:\d{2}$/.test(text(row.time) ?? '') ? text(row.time) : null,
    broadcastNetworks: [], source: 'balldontlie-nba', evidenceClass: 'LIVE', fetchedAt,
    // Game schema has no documented source-update timestamp. Never use scheduled datetime as update time.
    sourceUpdatedAt: null, freshness: 'FRESH',
  });
}

/** Server-side only: authorization is injected by the local metadata relay, never the extension. */
export function createNBAProvider(options: { request: (url: string) => Promise<Response>; clock?: () => number }): SportsProvider {
  const clock = options.clock ?? Date.now;
  let windowEvents: SportsEvent[] = [];
  let attempts: number[] = [];
  let denied = false;
  let retryAt = 0;
  async function request(url: URL): Promise<unknown> {
    const now = clock(); attempts = attempts.filter(at => now - at < 60_000);
    if (denied) throw new SportsProviderError('UNAVAILABLE', 'NBA authorization denied; restart only after correcting owner configuration.');
    if (now < retryAt || attempts.length >= 4) throw new SportsProviderError('RATE_LIMITED', 'NBA request budget/backoff active.');
    attempts.push(now); // Failed requests consume the four/minute local budget too.
    let response: Response;
    try { response = await options.request(url.href); } catch { throw new SportsProviderError('UNAVAILABLE', 'NBA provider request failed.'); }
    if ([401, 403].includes(response.status)) denied = true;
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = header && /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, (timestamp(header) ?? 0) - now);
      retryAt = now + Math.max(120_000, seconds);
      throw new SportsProviderError('RATE_LIMITED', 'NBA provider rate limited; backoff active.');
    }
    if (response.status === 404) throw new SportsProviderError('NOT_FOUND', 'NBA event unavailable; retained state preserved.');
    if (!response.ok) throw new SportsProviderError('UNAVAILABLE', 'NBA provider unavailable or authorization denied.');
    try { return await response.json(); } catch { throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA response.'); }
  }
  return {
    id: 'balldontlie-nba', evidenceClass: 'LIVE', disclosure: NBA_DISCLOSURE,
    async getEvents(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || timestamp(`${date}T12:00:00Z`) === null || isoNow(Date.parse(`${date}T12:00:00Z`)).slice(0, 10) !== date) throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA schedule date.');
      const day = Date.parse(`${date}T12:00:00Z`); const found: SportsEvent[] = [];
      // Yesterday/today/tomorrow crosses UTC/US date boundaries. Include preseason explicitly.
      for (const seasonType of [null, 'preseason']) {
        const url = new URL('https://api.balldontlie.io/v1/games');
        url.searchParams.set('start_date', isoNow(day - 86_400_000).slice(0, 10));
        url.searchParams.set('end_date', isoNow(day + 86_400_000).slice(0, 10)); url.searchParams.set('per_page', '100');
        if (seasonType) url.searchParams.set('season_type', seasonType);
        const cursors = new Set<string>();
        for (;;) {
          const payload = record(await request(url));
          if (!Array.isArray(payload.data) || payload.data.length > 100) throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA schedule response.');
          found.push(...payload.data.map(row => normalizeNBAGame(row, isoNow(clock()))));
          const next = record(payload.meta).next_cursor;
          if (next === null || next === undefined) break;
          if (!Number.isSafeInteger(next) || cursors.has(String(next))) throw new SportsProviderError('UNAVAILABLE', 'Invalid NBA pagination.');
          cursors.add(String(next)); url.searchParams.set('cursor', String(next));
          // request() enforces the hard budget even for unexpected pagination.
        }
      }
      windowEvents = [...new Map(found.map(event => [event.id, event])).values()];
      return structuredClone(windowEvents);
    },
    async getLiveEvents() { return structuredClone(windowEvents.filter(event => ACTIVE_STATUSES.has(event.status) || HELD_STATUSES.has(event.status))); },
    async getEvent(id) {
      const number = /^(?:balldontlie:nba:game:)?([1-9]\d{0,12})$/.exec(id)?.[1];
      if (!number) throw new SportsProviderError('NOT_FOUND', 'Invalid NBA event identity.');
      const payload = record(await request(new URL(`https://api.balldontlie.io/v1/games/${number}`)));
      const event = normalizeNBAGame(payload.data, isoNow(clock()));
      if (event.providerEventId !== number) throw new SportsProviderError('UNAVAILABLE', 'NBA detail identity mismatch.');
      return event;
    },
  };
}
