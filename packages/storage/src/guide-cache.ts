import type { GuideEntry } from '../../core/src/index';
import type { StorageBridge } from './index';

export const GUIDE_CACHE_KEY = 'yttv-desktop.guide-metadata.v1';
export const GUIDE_CACHE_MAX_ROWS = 500;
export const GUIDE_CACHE_MAX_BYTES = 512_000;
export const PROGRAM_METADATA_MAX_AGE_MS = 24 * 60 * 60_000;
export interface GuideMetadataCache { schemaVersion: 1; observedAt: string; rows: GuideEntry[] }
const safeText = (value: unknown, limit: number): value is string => typeof value === 'string' &&
  Boolean(value.trim()) && value.length <= limit && !/[\x00-\x1f]|https?:\/\/|(?:token|credential|password|signature)=/i.test(value);
const pastTimestamp = (value: unknown, now: number): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
/** Whitelist presentation only. Never deserialize targets or session authority. Old rows keep
 * their identity/order; program text expires after one day without renewing observation age. */
export function readGuideCache(raw: unknown, now = Date.now()): GuideMetadataCache | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cache = raw as Record<string, unknown>;
  if (cache.schemaVersion !== 1 || !pastTimestamp(cache.observedAt, now) || !Array.isArray(cache.rows) ||
      !cache.rows.length || cache.rows.length > GUIDE_CACHE_MAX_ROWS) return null;
  try { if (JSON.stringify(raw).length > GUIDE_CACHE_MAX_BYTES / 4) return null; } catch { return null; }
  const ids = new Set<string>(); const rows: GuideEntry[] = [];
  for (const value of cache.rows) {
    if (!value || typeof value !== 'object') return null;
    const row = value as GuideEntry;
    if (!safeText(row.channel?.id, 200) || !safeText(row.channel?.name, 150) || ids.has(row.channel.id) ||
        row.evidenceClass !== 'LIVE' || !pastTimestamp(row.observedAt, now) || Date.parse(row.observedAt) > Date.parse(cache.observedAt)) return null;
    ids.add(row.channel.id);
    const programFresh = now - Date.parse(row.observedAt) <= PROGRAM_METADATA_MAX_AGE_MS;
    rows.push({ channel: { id: row.channel.id, name: row.channel.name },
      programTitle: programFresh && safeText(row.programTitle, 300) ? row.programTitle : undefined,
      nextProgramTitle: programFresh && safeText(row.nextProgramTitle, 300) ? row.nextProgramTitle : undefined,
      observedAt: row.observedAt, evidenceClass: 'LIVE', metadataSource: 'CACHED', available: false, target: null });
  }
  return { schemaVersion: 1, observedAt: cache.observedAt, rows };
}
export function createGuideMetadataStore(bridge: StorageBridge, now = () => Date.now()) {
  let cache: GuideMetadataCache | null = null;
  let queue: Promise<void> = Promise.resolve();
  return {
    async load() { try { cache = readGuideCache(await bridge.get(GUIDE_CACHE_KEY), now()); } catch { cache = null; } return cache; },
    get rows(): GuideEntry[] { return readGuideCache(cache, now())?.rows ?? []; },
    async retain(entries: GuideEntry[]): Promise<void> {
      // Seeded/cached Watch observations cannot renew metadata or acquire authority.
      const applicable = entries.filter(row => row.metadataSource !== 'CACHED' && row.evidenceClass === 'LIVE');
      if (!applicable.length) return;
      const observedAt = applicable.reduce((at, row) => Date.parse(row.observedAt) > Date.parse(at) ? row.observedAt : at, applicable[0].observedAt);
      const incoming = readGuideCache({ schemaVersion: 1, observedAt, rows: applicable }, now());
      if (!incoming) return;
      const merged = [...(cache?.rows ?? [])]; let changed = false;
      for (const row of incoming.rows) {
        const index = merged.findIndex(old => old.channel.id === row.channel.id);
        if (index < 0) { if (merged.length < GUIDE_CACHE_MAX_ROWS) { merged.push(row); changed = true; } }
        else if (Date.parse(row.observedAt) > Date.parse(merged[index].observedAt)) { merged[index] = row; changed = true; }
      }
      if (!changed) return;
      cache = { schemaVersion: 1, observedAt: cache && Date.parse(cache.observedAt) > Date.parse(observedAt) ? cache.observedAt : observedAt, rows: merged };
      const retained = cache;
      // Capture each sanitized revision and serialize writes; a delayed old write cannot win.
      const next = queue.catch(() => undefined).then(() => bridge.set(GUIDE_CACHE_KEY, retained));
      queue = next;
      try { await next; } catch { /* Cache is optional; playback/preferences and Live fallback survive. */ }
    },
  };
}
