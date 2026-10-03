/** Shared domain contracts. No DOM, credentials, stream URLs or browser dependencies. */
export const EVENT_STATUSES = [
  'SCHEDULED', 'PREGAME', 'LIVE', 'DELAYED', 'HALFTIME', 'OVERTIME',
  'EXTRA_INNINGS', 'SUSPENDED', 'FINAL', 'POSTPONED', 'CANCELLED', 'UNKNOWN',
] as const;
export type EventStatus = typeof EVENT_STATUSES[number];
export type EvidenceClass = 'FIXTURE' | 'REPLAY' | 'LIVE';
export type Freshness = 'FRESH' | 'STALE' | 'UNKNOWN';
export interface Team { id: string; name: string; shortName?: string; aliases?: string[] }
export interface Score { home: number | null; away: number | null }
export interface BroadcastCandidate { networkId?: string; name: string; source?: string; observedAt?: string }
export interface ChannelRef { id: string; name: string; networkId?: string; aliases?: string[] }
/** A supported YouTube TV page handle, never a media/CDN/signed stream URL. */
export interface PlaybackTarget {
  kind: 'navigation'; channelId: string; url: string; verifiedAt: string; evidenceClass: EvidenceClass;
}
export interface GuideProgram {
  title: string; detail?: string; scheduleText?: string;
  context: 'CURRENT' | 'NEXT' | 'UPCOMING';
}
/** Presentation metadata only; never restores navigation authority. */
export function guidePrograms(raw: unknown): GuideProgram[] {
  if (!Array.isArray(raw)) return [];
  const cleanText = (v: unknown, limit: number) => typeof v === 'string' && v.trim() && v.length <= limit &&
    !/[\x00-\x1f]|https?:\/\/|(?:token|credential|password|signature)=/i.test(v) ? v : undefined;
  return raw.slice(0, 8).flatMap(p => {
    const title = cleanText(p?.title, 300);
    return title && ['CURRENT', 'NEXT', 'UPCOMING'].includes(p.context) ? [{ title,
      detail: cleanText(p.detail, 300), scheduleText: cleanText(p.scheduleText, 100), context: p.context }] : [];
  });
}
export interface GuideEntry {
  programs?: GuideProgram[];
  metadataSource?: 'OBSERVED' | 'CACHED';
  channel: ChannelRef; programTitle?: string; nextProgramTitle?: string;
  programStart?: string; programEnd?: string; league?: string; teamIds?: string[];
  available: boolean; target: PlaybackTarget | null; observedAt: string; evidenceClass: EvidenceClass;
}
export interface SportsEvent {
  id: string; league: string; homeTeam: Team; awayTeam: Team;
  scheduledStart: string | null; scheduledEnd: string | null;
  status: EventStatus; statusDetail: string | null; score: Score | null; period: string | null; clock: string | null;
  broadcastNetworks: BroadcastCandidate[]; originalChannel: ChannelRef | null; currentChannel: ChannelRef | null;
  yttvTarget: PlaybackTarget | null; providerEventId: string; source: string;
  fetchedAt: string; sourceUpdatedAt: string | null; freshness: Freshness; evidenceClass: EvidenceClass;
}
export type Event = SportsEvent;

export type CapabilityErrorCode = 'UNSUPPORTED' | 'NOT_AUTHENTICATED' | 'NOT_ENTITLED' |
  'TARGET_UNAVAILABLE' | 'DOM_CHANGED' | 'TIMEOUT' | 'UNKNOWN';
export type CapabilityResult<T> = { ok: true; value: T; observedAt: string } |
  { ok: false; code: CapabilityErrorCode; capability: string; reason: string };

export const ACTIVE_STATUSES: ReadonlySet<EventStatus> = new Set(['LIVE', 'HALFTIME', 'OVERTIME', 'EXTRA_INNINGS']);
export const HELD_STATUSES: ReadonlySet<EventStatus> = new Set(['DELAYED', 'SUSPENDED']);
export const TERMINAL_STATUSES: ReadonlySet<EventStatus> = new Set(['FINAL', 'POSTPONED', 'CANCELLED']);
export interface FreshnessPolicy {
  fetchMaxAgeMs: number; sourceMaxAgeMs: number; futureClockSkewMs: number; uncertainRetentionMs: number;
}
export const DEFAULT_FRESHNESS_POLICY: Readonly<FreshnessPolicy> = {
  fetchMaxAgeMs: 90_000, sourceMaxAgeMs: 90_000, futureClockSkewMs: 30_000, uncertainRetentionMs: 2 * 60 * 60_000,
};
export function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function isoNow(now: number | Date = Date.now()): string {
  return new Date(now instanceof Date ? now.getTime() : now).toISOString();
}
export function freshnessOf(
  event: Pick<SportsEvent, 'fetchedAt' | 'sourceUpdatedAt' | 'freshness'>,
  now = Date.now(), policy: Partial<FreshnessPolicy> = {},
): Freshness {
  const limits = { ...DEFAULT_FRESHNESS_POLICY, ...policy };
  const fetched = timestamp(event.fetchedAt);
  const updated = timestamp(event.sourceUpdatedAt);
  if (fetched === null || fetched > now + limits.futureClockSkewMs) return 'UNKNOWN';
  if (event.freshness === 'UNKNOWN') return 'UNKNOWN';
  if (event.freshness === 'STALE' || now - fetched > limits.fetchMaxAgeMs) return 'STALE';
  if (event.sourceUpdatedAt !== null && (updated === null || updated > now + limits.futureClockSkewMs)) return 'UNKNOWN';
  if (updated !== null && now - updated > limits.sourceMaxAgeMs) return 'STALE';
  return 'FRESH';
}
export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function isPlaybackTarget(value: unknown): value is PlaybackTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  if (target.kind !== 'navigation' || typeof target.channelId !== 'string' || !target.channelId ||
      typeof target.url !== 'string' || target.url.length > 8192 || timestamp(target.verifiedAt) === null ||
      !['LIVE', 'FIXTURE', 'REPLAY'].includes(String(target.evidenceClass))) return false;
  return watchNavigationUrl(target.url) !== null;
}
/** Canonical ordinary watch-page handle policy; no credentials, media endpoints or arbitrary parameters. */
export function watchNavigationUrl(value: string, base = 'https://tv.youtube.com'): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.hostname !== 'tv.youtube.com' || url.port || url.username || url.password || url.hash ||
        !/^\/watch(?:\/[^/?#]+)?\/?$/.test(url.pathname)) return null;
    if ([...url.searchParams.entries()].some(([key, value]) => !['v', 'channel', 'channelId', 'vp', 'vpp'].includes(key) || value.length > 4096)) return null;
    if (url.pathname.replace(/\/$/, '') === '/watch' && !['v', 'channel', 'channelId'].some(key => url.searchParams.get(key))) return null;
    return url.href.length <= 8192 ? url.href : null;
  } catch { return null; }
}
