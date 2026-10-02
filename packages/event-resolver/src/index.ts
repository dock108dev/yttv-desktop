import {
  freshnessOf, isPlaybackTarget, normalizeText, timestamp,
  type ChannelRef, type EvidenceClass, type GuideEntry, type PlaybackTarget, type SportsEvent,
} from '../../core/src/index.js';

export type ResolutionState = 'CONFIRMED' | 'AMBIGUOUS' | 'UNAVAILABLE' | 'STALE';
export interface ResolutionEvidence { kind: 'NETWORK' | 'TEAMS' | 'LEAGUE' | 'START' | 'OBSERVATION'; source: string; at: string | null; detail: string; weight: number }
export interface ResolutionCandidate {
  channel: ChannelRef; target: PlaybackTarget | null; confidence: number; reasons: string[]; conflicts: string[];
  provenance: ResolutionEvidence[]; eligible: boolean; targetVerified: boolean; targetState: 'VERIFIED' | 'STALE' | 'UNAVAILABLE'; fresh: boolean; evidenceClass: EvidenceClass;
}
export interface EventResolution {
  eventId: string; state: ResolutionState; candidates: ResolutionCandidate[]; channel: ChannelRef | null;
  selectedChannel: ChannelRef | null; target: PlaybackTarget | null; confidence: number; reasons: string[];
}
export interface ResolverOptions {
  now?: number; minimumConfidence?: number; minimumMargin?: number; guideMaxAgeMs?: number; targetMaxAgeMs?: number; startWindowMs?: number;
}
function leagueKey(value: string): string {
  const text = normalizeText(value);
  if (['ncaa football', 'ncaaf', 'college football', 'ncaa fbs', 'ncaa fcs'].includes(text)) return 'ncaa football';
  return text;
}
function isFreshAt(value: string, now: number, maxAge: number): boolean {
  const time = timestamp(value); return time !== null && time <= now + 30_000 && now - time <= maxAge;
}
function nameInProgram(team: SportsEvent['homeTeam'], title: string): boolean {
  const names = [team.name, team.shortName ?? '', ...(team.aliases ?? [])].map(normalizeText).filter(name => name.length >= 3);
  const padded = ` ${normalizeText(title)} `;
  return names.some(name => padded.includes(` ${name} `));
}
export function resolveEvent(event: SportsEvent, entries: readonly GuideEntry[], options: ResolverOptions = {}): EventResolution {
  const now = options.now ?? Date.now(); const minimum = options.minimumConfidence ?? 0.85; const margin = options.minimumMargin ?? 0.15;
  const candidates: ResolutionCandidate[] = [];
  for (const entry of entries) {
    const provenance: ResolutionEvidence[] = []; const reasons: string[] = []; const conflicts: string[] = [];
    let confidence = 0;
    const channelNames = [entry.channel.name, ...(entry.channel.aliases ?? [])].map(normalizeText);
    const networkMatches = event.broadcastNetworks.filter(network =>
      (!!network.networkId && !!entry.channel.networkId && network.networkId === entry.channel.networkId) || channelNames.includes(normalizeText(network.name)));
    const exactChannel = event.currentChannel?.id === entry.channel.id || event.originalChannel?.id === entry.channel.id;
    if (networkMatches.length || exactChannel) {
      confidence += 0.35;
      provenance.push({ kind: 'NETWORK', source: exactChannel ? event.source : networkMatches[0]?.source ?? event.source,
        at: networkMatches[0]?.observedAt ?? event.sourceUpdatedAt, detail: exactChannel ? 'Stable event channel ID match.' : 'Exact network/channel ID or declared channel alias match.', weight: 0.35 });
    }
    const teamIds = entry.teamIds ?? [];
    const home = teamIds.includes(event.homeTeam.id) || nameInProgram(event.homeTeam, entry.programTitle ?? '');
    const away = teamIds.includes(event.awayTeam.id) || nameInProgram(event.awayTeam, entry.programTitle ?? '');
    if (home || away) {
      const weight = Number(home) * 0.125 + Number(away) * 0.125; confidence += weight;
      provenance.push({ kind: 'TEAMS', source: 'available-guide', at: entry.observedAt, detail: home && away ? 'Both event teams corroborated.' : 'Only one event team corroborated.', weight });
    }
    if (teamIds.length >= 2 && (!teamIds.includes(event.homeTeam.id) || !teamIds.includes(event.awayTeam.id))) conflicts.push('Guide identifies a different matchup.');
    if (entry.league) {
      if (leagueKey(entry.league) === leagueKey(event.league)) {
        confidence += 0.1; provenance.push({ kind: 'LEAGUE', source: 'available-guide', at: entry.observedAt, detail: 'League agrees.', weight: 0.1 });
      } else conflicts.push('Guide league contradicts event league.');
    }
    const guideStart = timestamp(entry.programStart); const eventStart = timestamp(event.scheduledStart);
    if (guideStart !== null && eventStart !== null && Math.abs(guideStart - eventStart) <= (options.startWindowMs ?? 90 * 60_000)) {
      confidence += 0.1; provenance.push({ kind: 'START', source: 'available-guide', at: entry.observedAt, detail: 'Scheduled start is within matching window; scheduled end does not finalize the event.', weight: 0.1 });
    }
    const fresh = isFreshAt(entry.observedAt, now, options.guideMaxAgeMs ?? 90_000);
    const targetShapeValid = isPlaybackTarget(entry.target) && entry.target.channelId === entry.channel.id && entry.target.evidenceClass === entry.evidenceClass;
    const targetVerified = targetShapeValid && isFreshAt(entry.target!.verifiedAt, now, options.targetMaxAgeMs ?? 90_000);
    const targetState = targetVerified ? 'VERIFIED' : targetShapeValid ? 'STALE' : 'UNAVAILABLE';
    if (fresh && targetVerified) {
      confidence += 0.2; provenance.push({ kind: 'OBSERVATION', source: 'available-guide', at: entry.observedAt, detail: 'Fresh same-channel supported navigation target.', weight: 0.2 });
    }
    if (!networkMatches.length && !exactChannel && !home && !away) continue;
    if (!entry.available) reasons.push('Channel eligibility is unavailable or unconfirmed.');
    if (!fresh) reasons.push('Guide observation requires refresh.');
    if (!targetVerified) reasons.push('Current supported playback target is unverified or stale.');
    if (event.evidenceClass !== entry.evidenceClass) {
      conflicts.push('Fixture/replay sports evidence cannot establish a real live matchup or playback target.');
    }
    if (confidence < minimum) reasons.push('Insufficient corroboration; a network label alone is not a confirmed game target.');
    candidates.push({ channel: { ...entry.channel }, target: targetVerified ? entry.target : null, confidence: Math.round(confidence * 1000) / 1000,
      reasons, conflicts, provenance, eligible: entry.available, targetVerified, targetState, fresh, evidenceClass: entry.evidenceClass });
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.channel.name.localeCompare(b.channel.name));
  // Duplicate available guide rows for one channel cannot manufacture or conceal competing broadcasts.
  const uniqueCandidates = candidates.filter((candidate, index) => candidates.findIndex(other => other.channel.id === candidate.channel.id) === index);
  const base = { eventId: event.id, candidates: uniqueCandidates, channel: null, selectedChannel: null, target: null, confidence: uniqueCandidates[0]?.confidence ?? 0 };
  if (!uniqueCandidates.length) return { ...base, state: 'UNAVAILABLE', reasons: ['No observed available guide channel corroborates this event.'] };
  if (freshnessOf(event, now) !== 'FRESH') return { ...base, state: 'STALE', reasons: ['Sports state requires refresh; no target is asserted.'] };
  const usable = uniqueCandidates.filter(candidate => candidate.eligible && candidate.targetVerified && candidate.fresh && !candidate.conflicts.length);
  if (!usable.length) {
    const staleOnly = uniqueCandidates.some(candidate => candidate.eligible && (!candidate.fresh || candidate.targetState === 'STALE') && !candidate.conflicts.length);
    return { ...base, state: staleOnly ? 'STALE' : 'UNAVAILABLE', reasons: [...new Set(uniqueCandidates.flatMap(candidate => [...candidate.reasons, ...candidate.conflicts]))] };
  }
  const first = usable[0]!; const second = usable[1];
  if (first.confidence < minimum || (second && first.confidence - second.confidence < margin - Number.EPSILON)) return {
    ...base, state: 'AMBIGUOUS', reasons: [first.confidence < minimum ? 'More event/channel evidence is needed before enabling Watch/Add.' : 'Multiple available broadcasts are too close; explicit choice or stronger evidence is required.'],
  };
  return { ...base, state: 'CONFIRMED', channel: first.channel, selectedChannel: first.channel, target: first.target, confidence: first.confidence,
    reasons: ['Available channel and fresh supported target are corroborated; confidence is a heuristic, not a probability.'] };
}
