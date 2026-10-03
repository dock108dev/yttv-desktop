import { normalizeText, type CapabilityResult, type GuideEntry, type GuideProgram, type PlaybackTarget } from '../../core/src/index';

/** These selectors are observations of the ordinary public page, not protected player APIs. */
export const SELECTORS = {
  guideRow: 'ytu-epg-row', network: 'ytu-endpoint.network',
  watchEndpoint: 'ytu-endpoint.tenx-thumb[aria-label]', airings: '.airings',
  program: 'main h1, main [role="heading"], [role="main"] h1, [role="main"] [role="heading"]',
} as const;
export const TARGET_MAX_AGE_MS = 30 * 60_000;
export function freshLiveTarget(entry: GuideEntry, now = Date.now()): boolean {
  const target = entry.target;
  if (/\bUpcoming:/i.test(entry.programTitle ?? '') || (entry.programs?.length && entry.programs[0].context !== 'CURRENT')) return false;
  if (entry.metadataSource === 'CACHED' || !entry.available || entry.evidenceClass !== 'LIVE' || !target || target.evidenceClass !== 'LIVE' || target.channelId !== entry.channel.id || !navigationUrl(target.url)) return false;
  const age = now - Date.parse(target.verifiedAt);
  return Number.isFinite(age) && age >= 0 && age <= TARGET_MAX_AGE_MS;
}
export interface PlaybackObservation {
  playing: boolean | null; muted: boolean | null; volume?: number | null; readyState: number | null;
  currentTime: number | null; width: number | null; height: number | null;
}
export interface AdapterObservation {
  guide: GuideEntry[]; guideObservedAt?: string; currentChannelId?: string;
  currentProgram?: string; playback: PlaybackObservation; observedAt: string;
  route: 'guide' | 'watch' | 'other';
}

export function stableChannelId(name: string): string {
  return `yttv:${normalizeText(name).replace(/ /g, '-')}`;
}
export function navigationUrl(value: string, base = 'https://tv.youtube.com'): string | null {
  try {
    const url = new URL(value, base);
    if (url.origin !== 'https://tv.youtube.com' || url.username || url.password || url.hash ||
      !/^\/watch(?:\/[^/?#]+)?\/?$/.test(url.pathname)) return null;
    // Only ordinary guide navigation parameters. Never accept arbitrary origins or media/CDN handles.
    if ([...url.searchParams.keys()].some(key => !['v', 'vp', 'vpp', 'channel', 'channelId'].includes(key))) return null;
    if (url.pathname.replace(/\/$/, '') === '/watch' && !['v', 'channel', 'channelId'].some(key => url.searchParams.get(key))) return null;
    if (url.href.length > 8192) return null;
    return url.href;
  } catch { return null; }
}
function text(node: Element | null): string { return node?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300) ?? ''; }
function visible(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
}
export function parseGuide(document: Document, now = new Date().toISOString()): GuideEntry[] {
  const entries: GuideEntry[] = []; const seen = new Set<string>();
  for (const row of document.querySelectorAll(SELECTORS.guideRow)) {
    const endpoint = row.querySelector(SELECTORS.watchEndpoint);
    const label = endpoint?.getAttribute('aria-label') ?? '';
    const name = /^watch\s+(.+)$/i.exec(label)?.[1]?.trim() || text(row.querySelector(`${SELECTORS.network} a`)) || text(row.querySelector(SELECTORS.network));
    if (!name || name.length > 150) continue;
    const links = [...row.querySelectorAll(`${SELECTORS.airings} a`)];
    const programs: GuideProgram[] = links.slice(0, 8).map((link, index) => {
      const title = text(link.querySelector('.primary-text')) || text(link);
      return { title, detail: text(link.querySelector('.tertiary-container')) || undefined,
        scheduleText: text(link.querySelector('.time-text')) || undefined,
        context: /^Upcoming:/i.test(title) || (index === 0 && /^\/?browse\//.test(link.getAttribute('href') ?? '')) ? 'UPCOMING' : index === 0 ? 'CURRENT' : 'NEXT' };
    });
    let channelId = stableChannelId(name);
    // Native guide can list several distinct event feeds under the same network.
    // Keep the existing primary channel identity; retain additional listings separately.
    if (seen.has(channelId)) channelId += ':' + normalizeText(programs[0]?.title ?? '').replace(/ /g, '-').slice(0, 140);
    if (seen.has(channelId)) continue;
    seen.add(channelId);
    const href = endpoint?.querySelector('a[href]')?.getAttribute('href');
    // Native thumbnail endpoints can be empty on a fresh guide. Its first
    // current-program link is also an ordinary supported navigation control.
    // Never skip forward to a later airing (which could schedule a future show).
    const currentHref = row.querySelector(`${SELECTORS.airings} a`)?.getAttribute('href');
    const currentUrl = currentHref ? navigationUrl(currentHref, document.location?.href) : null;
    const thumbUrl = href ? navigationUrl(href, document.location?.href) : null;
    const ambiguous = Boolean(currentHref && (!currentUrl || (thumbUrl && thumbUrl !== currentUrl)));
    const url = programs[0]?.context === 'UPCOMING' || ambiguous ? null : (href ? navigationUrl(href, document.location?.href) : null) ??
      (currentHref ? navigationUrl(currentHref, document.location?.href) : null);
    const target: PlaybackTarget | null = url ? { kind: 'navigation', channelId, url, verifiedAt: now, evidenceClass: 'LIVE' } : null;
    const league = /\bNBA\b/i.test(programs[0]?.title ?? '') ? 'NBA' : undefined;
    entries.push({ channel: { id: channelId, name }, programTitle: programs[0]?.title, nextProgramTitle: programs[1]?.title, programs, league,
      available: Boolean(target), target, observedAt: now, evidenceClass: 'LIVE' });
  }
  return entries;
}
/** Return the visible advancing player before hidden/paused preview nodes. */
export function activeVideo(document: Document): HTMLVideoElement | null {
  const videos = [...document.querySelectorAll('video')];
  return videos.sort((a, b) => scoreVideo(b) - scoreVideo(a))[0] ?? null;
}
function scoreVideo(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  return (visible(video) ? 1e9 : 0) + (!video.paused && video.readyState >= 2 ? 1e8 : 0) + rect.width * rect.height;
}
export function createDOMAdapter(document: Document, options: { ignoreElement?: Element } = {}) {
  let guide: GuideEntry[] = []; let guideObservedAt: string | undefined; let guideSignature = '';
  let disposed = false; const listeners = new Set<(observation: AdapterObservation) => void>();
  const pendingNavigations = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function getObservation(): AdapterObservation {
    const observedAt = new Date().toISOString();
    const route = document.location.pathname.startsWith('/watch') ? 'watch' : document.location.pathname.startsWith('/live') ? 'guide' : 'other';
    // Hidden SPA guide nodes are not a fresh observation. Identical rows must not renew old target timestamps.
    if (route === 'guide') {
      const parsed = parseGuide(document, observedAt);
      const signature = JSON.stringify(parsed.map(entry => [entry.channel.id, entry.target?.url, entry.programTitle, entry.nextProgramTitle, entry.programs]));
      if (parsed.length && signature !== guideSignature) { guide = parsed; guideObservedAt = observedAt; guideSignature = signature; }
    }
    const player = activeVideo(document);
    let currentChannelId: string | undefined;
    if (route === 'watch') {
      const labels = [...document.querySelectorAll('[role="button"], button')].filter(visible).map(node =>
        [node.getAttribute('aria-label')?.trim(), text(node)].filter(Boolean));
      const matched = guide.filter(entry => labels.some(values => values.some(value => normalizeText(value!) === normalizeText(entry.channel.name))));
      if (matched.length === 1) currentChannelId = matched[0].channel.id;
      else if (matched.length > 1) {
        const exact = matched.filter(entry => entry.target?.url === navigationUrl(document.location.href));
        if (exact.length === 1) currentChannelId = exact[0].channel.id;
      }
    }
    const program = [...document.querySelectorAll(SELECTORS.program)].filter(visible).map(text).find(Boolean);
    return { guide: guide.map(entry => ({ ...entry })), guideObservedAt, currentChannelId, currentProgram: program,
      playback: { playing: player ? !player.paused && !player.ended && player.readyState >= 2 : null,
        muted: player?.muted ?? null, volume: player?.volume ?? null, readyState: player?.readyState ?? null, currentTime: player?.currentTime ?? null,
        width: player?.videoWidth ?? null, height: player?.videoHeight ?? null }, observedAt, route };
  }
  function notify() { if (!disposed) { const observation = getObservation(); for (const listener of listeners) listener(observation); } }
  function schedule() { if (!disposed && timer === undefined) timer = setTimeout(() => { timer = undefined; notify(); }, 250); }
  const observer = new MutationObserver(records => {
    if (records.some(record => !options.ignoreElement?.contains(record.target))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'href'] });
  const interval = setInterval(notify, 3000);
  async function navigateToChannel(channelId: string): Promise<CapabilityResult<AdapterObservation>> {
    const entry = guide.find(item => item.channel.id === channelId); const target = entry?.target;
    if (disposed || !entry || !target || !freshLiveTarget(entry)) {
      return { ok: false, capability: 'navigateToChannel', code: 'TARGET_UNAVAILABLE', reason: 'Open the YouTube TV Live guide to refresh this channel’s observed navigation target.' };
    }
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find(item => navigationUrl(item.getAttribute('href')!, document.location.href) === target.url);
    if (link) link.click(); else document.location.assign(target.url);
    return new Promise(resolve => {
      const deadline = Date.now() + 15_000; let lastTime: number | null = null; let settled = false;
      let cancel: () => void = () => undefined;
      const finish = (value: CapabilityResult<AdapterObservation>) => { if (!settled) { settled = true; clearInterval(poll); pendingNavigations.delete(cancel); resolve(value); } };
      const poll = setInterval(() => {
        if (disposed) return finish({ ok: false, capability: 'navigateToChannel', code: 'UNKNOWN', reason: 'The page navigated; playback confirmation is pending on the replacement page.' });
        const observation = getObservation();
        if (observation.currentChannelId === channelId && observation.playback.playing) {
          const current = observation.playback.currentTime;
          if (current !== null && lastTime !== null && current > lastTime + .05) return finish({ ok: true, value: observation, observedAt: observation.observedAt });
          lastTime = current;
        } else lastTime = null;
        if (Date.now() >= deadline) finish({ ok: false, capability: 'navigateToChannel', code: 'TIMEOUT', reason: 'Navigation was requested, but the channel and advancing player could not both be confirmed. The original player remains accessible.' });
      }, 300);
      cancel = () => finish({ ok: false, capability: 'navigateToChannel', code: 'UNKNOWN', reason: 'The adapter was disposed before playback confirmation.' });
      pendingNavigations.add(cancel);
    });
  }
  return {
    getObservation, navigateToChannel,
    seedGuide(entries: GuideEntry[]) {
      if (guide.length || !Array.isArray(entries)) return;
      // Unavailable rows still carry guide metadata and saved ordering. Keep them
      // across document replacement without promoting missing/stale targets.
      guide = entries.filter(entry => entry?.evidenceClass === 'LIVE' && typeof entry.channel?.id === 'string' &&
        Boolean(entry.channel.id.trim()) && typeof entry.channel.name === 'string' &&
        Number.isFinite(Date.parse(entry.observedAt))).map(entry => {
        const playable = freshLiveTarget(entry);
        return { ...entry, available: playable, target: playable ? entry.target : null };
      });
      guideObservedAt = guide.length ? new Date(Math.max(...guide.map(entry => Date.parse(entry.observedAt)))).toISOString() : undefined;
      notify();
    },
    setAudio: async (change: { muted?: boolean; volume?: number }): Promise<CapabilityResult<PlaybackObservation>> => {
      const player = activeVideo(document);
      if (disposed || !player) return { ok: false, capability: 'audio', code: 'TARGET_UNAVAILABLE', reason: 'No observable player is available. Use the original player.' };
      if ((change.muted !== undefined && typeof change.muted !== 'boolean') ||
          (change.volume !== undefined && (!Number.isFinite(change.volume) || change.volume < 0 || change.volume > 1)))
        return { ok: false, capability: 'audio', code: 'UNKNOWN', reason: 'Invalid player audio choice.' };
      try {
        if (change.volume !== undefined) player.volume = change.volume;
        if (change.muted !== undefined) player.muted = change.muted;
        const playback = getObservation().playback;
        if ((change.muted !== undefined && playback.muted !== change.muted) ||
            (change.volume !== undefined && Math.abs((playback.volume ?? -1) - change.volume) > .001)) throw new Error('Readback mismatch');
        notify();
        return { ok: true, value: playback, observedAt: new Date().toISOString() };
      } catch { return { ok: false, capability: 'audio', code: 'UNKNOWN', reason: 'Player audio readback did not confirm the choice.' }; }
    },
    mute: async (): Promise<CapabilityResult<boolean>> => {
      const player = activeVideo(document);
      if (disposed || !player) return { ok: false, capability: 'mute', code: 'TARGET_UNAVAILABLE', reason: 'No active adapter player is available.' };
      player.muted = true; notify();
      return { ok: true, value: player.muted, observedAt: new Date().toISOString() };
    },
    subscribe(listener: (observation: AdapterObservation) => void) { listeners.add(listener); listener(getObservation()); return () => listeners.delete(listener); },
    dispose() { disposed = true; observer.disconnect(); clearInterval(interval); if (timer) clearTimeout(timer); for (const cancel of [...pendingNavigations]) cancel(); listeners.clear(); },
  };
}
export type DOMAdapter = ReturnType<typeof createDOMAdapter>;
