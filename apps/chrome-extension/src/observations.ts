import { guidePrograms, type GuideEntry } from '../../../packages/core/src/index';
import { freshLiveTarget, type AdapterObservation } from '../../../packages/yttv-adapter/src/index';

const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;

/** Sanitize bridge observations without acquiring browser ownership or mutating players. */
export function cleanObservation(raw: AdapterObservation): AdapterObservation | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.guide) || !Number.isFinite(Date.parse(raw.observedAt))) return null;
  const guide: GuideEntry[] = raw.guide.slice(0, 500).filter(entry => entry && entry.evidenceClass === 'LIVE' && validId(entry.channel?.id) && typeof entry.channel.name === 'string' && entry.channel.name.length <= 150 && Number.isFinite(Date.parse(entry.observedAt))).map(entry => {
    const target = freshLiveTarget(entry) ? entry.target : null;
    return {
      channel: { id: entry.channel.id, name: entry.channel.name },
      programs: guidePrograms(entry.programs),
      programTitle: typeof entry.programTitle === 'string' ? entry.programTitle.slice(0, 300) : undefined,
      nextProgramTitle: typeof entry.nextProgramTitle === 'string' ? entry.nextProgramTitle.slice(0, 300) : undefined,
      league: entry.league === 'NBA' && /\bNBA\b/i.test(entry.programTitle ?? '') ? 'NBA' : undefined,
      metadataSource: entry.metadataSource === 'CACHED' ? 'CACHED' : 'OBSERVED',
      available: Boolean(target),
      target: target ? {
        kind: 'navigation', channelId: target.channelId, url: target.url,
        verifiedAt: target.verifiedAt, evidenceClass: target.evidenceClass,
      } : null,
      observedAt: entry.observedAt, evidenceClass: 'LIVE',
    };
  });
  return { guide, guideObservedAt: raw.guideObservedAt,
    currentChannelId: validId(raw.currentChannelId) && guide.some(entry => entry.channel.id === raw.currentChannelId) ? raw.currentChannelId : undefined,
    currentProgram: typeof raw.currentProgram === 'string' ? raw.currentProgram.slice(0, 300) : undefined,
    playback: { playing: typeof raw.playback?.playing === 'boolean' ? raw.playback.playing : null,
      volume: typeof raw.playback?.volume === 'number' && raw.playback.volume >= 0 && raw.playback.volume <= 1 ? raw.playback.volume : null,
      muted: typeof raw.playback?.muted === 'boolean' ? raw.playback.muted : null,
      readyState: Number.isInteger(raw.playback?.readyState) ? raw.playback.readyState : null,
      currentTime: typeof raw.playback?.currentTime === 'number' && Number.isFinite(raw.playback.currentTime) ? raw.playback.currentTime : null,
      width: typeof raw.playback?.width === 'number' ? raw.playback.width : null, height: typeof raw.playback?.height === 'number' ? raw.playback.height : null },
    observedAt: raw.observedAt, route: ['guide', 'watch', 'other'].includes(raw.route) ? raw.route : 'other' };
}
/** Volatile guide metadata outlives source tabs, but never renews observation age.
 * Ownership filtering belongs to the worker; only its chosen observations enter here. */
export function createGuideCatalog() {
  const retained = new Map<string, GuideEntry>();
  return {
    retain(entries: GuideEntry[]) {
      for (const entry of entries) {
        const prior = retained.get(entry.channel.id);
        if (entry.metadataSource !== 'CACHED' && (!prior || Date.parse(entry.observedAt) >= Date.parse(prior.observedAt))) {
          retained.set(entry.channel.id, entry);
        }
      }
      while (retained.size > 500) retained.delete(retained.keys().next().value!);
    },
    rows(cached: GuideEntry[], sources: AdapterObservation[], now = Date.now()): GuideEntry[] {
      const rows = [...retained.values()];
      for (const row of cached) if (rows.length < 500 && !rows.some(entry => entry.channel.id === row.channel.id)) rows.push(row);
      for (const source of sources) for (const entry of source.guide) {
        const index = rows.findIndex(row => row.channel.id === entry.channel.id);
        if (index < 0) { if (rows.length < 500) rows.push(entry); }
        else if (Date.parse(entry.observedAt) > Date.parse(rows[index].observedAt) ||
          (Date.parse(entry.observedAt) === Date.parse(rows[index].observedAt) && freshLiveTarget(entry, now) && !freshLiveTarget(rows[index], now))) rows[index] = entry;
      }
      return rows.map(entry => {
        const fresh = freshLiveTarget(entry, now);
        return { ...entry, available: Boolean(entry.available && fresh), target: fresh ? entry.target : null };
      });
    },
  };
}
