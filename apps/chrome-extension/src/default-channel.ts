import type { GuideEntry } from '../../../packages/core/src/index';
import { freshLiveTarget } from '../../../packages/yttv-adapter/src/index';
/** Saved channel IDs express preference; only current native listings authorize a new player. */
export function defaultChannel(entries: GuideEntry[], lastWatched?: string | null): GuideEntry | undefined {
  const available = entries.filter(entry => freshLiveTarget(entry));
  return available.find(entry => entry.channel.id === lastWatched) ?? available[0];
}
