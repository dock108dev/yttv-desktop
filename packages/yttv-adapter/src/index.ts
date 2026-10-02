import { normalizeText, type CapabilityResult, type GuideEntry, type PlaybackTarget } from '../../core/src/index';

/** These selectors are observations of the ordinary public page, not protected player APIs. */
export const SELECTORS = {
  guideRow: 'ytu-epg-row', network: 'ytu-endpoint.network',
  watchEndpoint: 'ytu-endpoint.tenx-thumb[aria-label]', airings: '.airings',
  program: 'main h1, main [role="heading"], [role="main"] h1, [role="main"] [role="heading"]',
} as const;
export const TARGET_MAX_AGE_MS = 30 * 60_000;
export interface PlaybackObservation {
  playing: boolean | null; muted: boolean | null; readyState: number | null;
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
    const channelId = stableChannelId(name); if (seen.has(channelId)) continue;
    seen.add(channelId);
    const href = endpoint?.querySelector('a[href]')?.getAttribute('href');
    const url = href ? navigationUrl(href, document.location?.href) : null;
    const programs = [...row.querySelectorAll(`${SELECTORS.airings} a`)].map(link => text(link)).filter(Boolean);
    const target: PlaybackTarget | null = url ? { kind: 'navigation', channelId, url, verifiedAt: now, evidenceClass: 'LIVE' } : null;
    entries.push({ channel: { id: channelId, name }, programTitle: programs[0], nextProgramTitle: programs[1],
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
export function createDOMAdapter(document: Document, options: { ignoreElement?: Element; nightMuteLock?: boolean } = {}) {
  let guide: GuideEntry[] = []; let guideObservedAt: string | undefined; let guideSignature = '';
  let disposed = false; const listeners = new Set<(observation: AdapterObservation) => void>();
  const pendingNavigations = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const muteVideo = (event?: Event) => {
    const video = event?.target instanceof HTMLVideoElement ? event.target : null;
    if (video) { video.muted = true; video.defaultMuted = true; }
    for (const item of document.querySelectorAll('video')) { item.muted = true; item.defaultMuted = true; }
  };
  // The user requested silence overnight. No unmute code exists in this adapter.
  document.addEventListener('play', muteVideo, true);
  document.addEventListener('playing', muteVideo, true);
  document.addEventListener('volumechange', muteVideo, true);
  muteVideo();
  function getObservation(): AdapterObservation {
    muteVideo();
    const observedAt = new Date().toISOString();
    const route = document.location.pathname.startsWith('/watch') ? 'watch' : document.location.pathname.startsWith('/live') ? 'guide' : 'other';
    // Hidden SPA guide nodes are not a fresh observation. Identical rows must not renew old target timestamps.
    if (route === 'guide') {
      const parsed = parseGuide(document, observedAt);
      const signature = JSON.stringify(parsed.map(entry => [entry.channel.id, entry.target?.url, entry.programTitle, entry.nextProgramTitle]));
      if (parsed.length && signature !== guideSignature) { guide = parsed; guideObservedAt = observedAt; guideSignature = signature; }
    }
    const player = activeVideo(document);
    let currentChannelId: string | undefined;
    if (route === 'watch') {
      const labels = [...document.querySelectorAll('[role="button"], button')].filter(visible).map(node =>
        [node.getAttribute('aria-label')?.trim(), text(node)].filter(Boolean));
      const matched = guide.filter(entry => labels.some(values => values.some(value => normalizeText(value!) === normalizeText(entry.channel.name))));
      if (matched.length === 1) currentChannelId = matched[0].channel.id;
    }
    const program = [...document.querySelectorAll(SELECTORS.program)].filter(visible).map(text).find(Boolean);
    return { guide: guide.map(entry => ({ ...entry })), guideObservedAt, currentChannelId, currentProgram: program,
      playback: { playing: player ? !player.paused && !player.ended && player.readyState >= 2 : null,
        muted: player?.muted ?? null, readyState: player?.readyState ?? null, currentTime: player?.currentTime ?? null,
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
    if (!target || !navigationUrl(target.url) || Date.now() - Date.parse(target.verifiedAt) > TARGET_MAX_AGE_MS) {
      return { ok: false, capability: 'navigateToChannel', code: 'TARGET_UNAVAILABLE', reason: 'Open the YouTube TV Live guide to refresh this channel’s observed navigation target.' };
    }
    const original = getObservation();
    if (original.currentChannelId === channelId && original.playback.playing) return { ok: true, value: original, observedAt: original.observedAt };
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
      guide = entries.filter(entry => entry?.channel?.id && entry.target && navigationUrl(entry.target.url) &&
        entry.target.channelId === entry.channel.id && Date.now() - Date.parse(entry.target.verifiedAt) <= TARGET_MAX_AGE_MS);
      guideObservedAt = guide[0]?.observedAt;
      notify();
    },
    mute: async (): Promise<CapabilityResult<boolean>> => { muteVideo(); return { ok: true, value: true, observedAt: new Date().toISOString() }; },
    subscribe(listener: (observation: AdapterObservation) => void) { listeners.add(listener); listener(getObservation()); return () => listeners.delete(listener); },
    dispose() { disposed = true; observer.disconnect(); clearInterval(interval); if (timer) clearTimeout(timer); for (const cancel of [...pendingNavigations]) cancel(); listeners.clear();
      document.removeEventListener('play', muteVideo, true); document.removeEventListener('playing', muteVideo, true); document.removeEventListener('volumechange', muteVideo, true); },
  };
}
export type DOMAdapter = ReturnType<typeof createDOMAdapter>;
