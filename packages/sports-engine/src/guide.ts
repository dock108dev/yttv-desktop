import { guidePrograms, normalizeText, type GuideEntry, type GuideProgram } from '../../core/src/index';
import { freshLiveTarget } from '../../yttv-adapter/src/index';

export interface SportsListing {
  entry: GuideEntry; program: GuideProgram; index: number;
  competition: string; kind: 'Replay' | 'Studio / analysis' | 'Sports program';
}
/** Only explicit program text supplies classification. Network branding supplies none. */
export function classifySports(program: GuideProgram): Pick<SportsListing, 'competition' | 'kind'> | null {
  const title = program.title.replace(/^Upcoming:\s*/i, '');
  const text = `${title} ${program.detail ?? ''}`;
  // Explicit matchups and named sports/competitions; no team-to-league inference.
  const competition = /\b(WNBA|NBA|NFL|NHL|MLB|MLS|NCAAW Volleyball|NCAA(?: Football| Basketball)?|UEFA|FIFA|Premier League|La Liga|Liga MX|ATP|WTA|PGA|LPGA|NASCAR|Formula 1|UFC|WWE|PPA Tour|Atlantic Coast|Big Ten|SEC)\b/i.exec(text)?.[0];
  const sporting = /\b(sports|football|basketball|baseball|hockey|soccer|volleyball|tennis|golf|pickleball|rugby|cricket|boxing|wrestling|motocross|cross country|Breeders' Cup|Lotte Championship)\b/i.test(title);
  // Generic show words also occur outside sports (for example Canine Countdown).
  const studio = /\b(sportscenter|pardon the interruption|fantasy focus|SEC Now|sports news|sports talk|college football live|inside college football|pro football weekly)\b/i.test(title) ||
    Boolean((competition || sporting) && /\b(countdown|pregame|postgame|prerace|shot clock|scoreboard)\b/i.test(title));
  const matchup = /\S.+\s(?:at|vs\.?|versus)\s\S/i.test(title) &&
    !/\bTV-(?:G|PG|14|MA|Y)\b|\bS\d+\s*E\d+\b/i.test(text) && !/\bnews\b/i.test(title);
  // Directory/promotional rows are not a program.
  if (/watch live sports|more live events|studio shows and originals/i.test(title)) return null;
  if (!competition && !studio && !sporting && !matchup) return null;
  return { competition: competition ?? 'Competition unspecified', kind: /\b(replay|rerun|encore|classic game)\b/i.test(text) ? 'Replay' : studio ? 'Studio / analysis' : 'Sports program' };
}
export function sportsListings(guide: GuideEntry[], query = '', competition = 'ALL'): SportsListing[] {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  return guide.flatMap(entry => (entry.programs?.length ? guidePrograms(entry.programs) : guidePrograms([
    ...(entry.programTitle ? [{ title: entry.programTitle, context: /\bUpcoming:/i.test(entry.programTitle) ? 'UPCOMING' : 'CURRENT' }] : []),
    ...(entry.nextProgramTitle ? [{ title: entry.nextProgramTitle, context: 'NEXT' }] : []),
  ])).flatMap((program, index) => {
    const classification = classifySports(program);
    if (!classification || (competition !== 'ALL' && classification.competition !== competition)) return [];
    const haystack = normalizeText(`${program.title} ${program.detail ?? ''} ${classification.competition} ${entry.channel.name}`);
    return terms.every(term => haystack.includes(term)) ? [{ entry, program, index, ...classification }] : [];
  }));
}
export function listingPlayable(listing: SportsListing, now = Date.now()): boolean {
  return listing.index === 0 && listing.program.context === 'CURRENT' && !/\bUpcoming:/i.test(listing.program.title) &&
    freshLiveTarget(listing.entry, now);
}
