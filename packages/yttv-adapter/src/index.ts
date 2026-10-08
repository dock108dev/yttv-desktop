import { isPlaybackTarget, watchNavigationUrl, normalizeText, type CapabilityResult, type GuideEntry, type GuideProgram, type PlaybackTarget } from '../../core/src/index';

/** These selectors are observations of the ordinary public page, not protected player APIs. */
export const SELECTORS = {
  guideRow: 'ytu-epg-row', network: 'ytu-endpoint.network',
  watchEndpoint: 'ytu-endpoint.tenx-thumb[aria-label]', airings: '.airings',
  program: 'main h1, main [role="heading"], [role="main"] h1, [role="main"] [role="heading"]',
  playbackControl: 'ytu-player-controls button[aria-label], ytu-player-controls [role="button"][aria-label], ytu-play-pause-button[aria-label], ytu-play-pause-button [aria-label], button.ytp-play-button',
  volumeSlider: 'ytu-player-controls ytu-volume-slider tp-yt-paper-slider[role="slider"]',
} as const;
export const TARGET_MAX_AGE_MS = 30 * 60_000;
/** Observation age policy shared by presentation and navigation eligibility. */
export function freshGuideObservation(entry: GuideEntry, now = Date.now()): boolean {
  const age = now - Date.parse(entry.observedAt);
  return entry.metadataSource !== 'CACHED' && entry.evidenceClass === 'LIVE' &&
    Number.isFinite(age) && age >= 0 && age <= TARGET_MAX_AGE_MS;
}
export function freshLiveTarget(entry: GuideEntry, now = Date.now()): boolean {
  const target = entry.target;
  if (/\bUpcoming:/i.test(entry.programTitle ?? '') || (entry.programs?.length && entry.programs[0].context !== 'CURRENT')) return false;
  if (!freshGuideObservation(entry, now) || !entry.available || !target || target.evidenceClass !== 'LIVE' || target.channelId !== entry.channel.id || !isPlaybackTarget(target)) return false;
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
/** Adapter entry point delegates URL policy to the shared domain validator. */
export const navigationUrl = watchNavigationUrl;
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
      if (!Array.isArray(entries)) return;
      const priorSignature = JSON.stringify(guide);
      // Unavailable rows still carry guide metadata and saved ordering. Keep them
      // across document replacement without promoting missing/stale targets.
      const incoming = entries.slice(0, 500).filter(entry => entry?.evidenceClass === 'LIVE' && typeof entry.channel?.id === 'string' &&
        Boolean(entry.channel.id.trim()) && typeof entry.channel.name === 'string' &&
        Number.isFinite(Date.parse(entry.observedAt))).map(entry => {
        const playable = freshLiveTarget(entry);
        return { ...entry, available: playable, target: playable ? entry.target : null };
      });
      const merged = new Map(guide.map(entry => [entry.channel.id, entry]));
      for (const entry of incoming) {
        const prior = merged.get(entry.channel.id);
        if (!prior || Date.parse(entry.observedAt) > Date.parse(prior.observedAt)) merged.set(entry.channel.id, entry);
      }
      guide = [...merged.values()].slice(0, 500);
      if (JSON.stringify(guide) === priorSignature) return;
      guideObservedAt = guide.length ? new Date(Math.max(...guide.map(entry => Date.parse(entry.observedAt)))).toISOString() : undefined;
      notify();
    },
    setPlayback: async (playing: boolean, mutedStart = false, stillCurrent = () => true): Promise<CapabilityResult<PlaybackObservation>> => {
      const player = activeVideo(document);
      const refuse = (code: string, reason: string): CapabilityResult<PlaybackObservation> => ({ ok: false, capability: 'playback', code: 'TARGET_UNAVAILABLE', reason: `${code}: ${reason} Use native Play/Pause.` });
      const current = () => !disposed && activeVideo(document) === player && stillCurrent();
      if (!player || !current() || getObservation().route !== 'watch') return refuse('PLAYER_UNAVAILABLE', 'Watch player unavailable.');
      const before = getObservation().playback;
      if (playing ? before.playing === true : player.paused) {
        if (mutedStart) player.muted = true;
        return { ok: true, value: getObservation().playback, observedAt: new Date().toISOString() };
      }
      const controls = [...document.querySelectorAll<HTMLElement>(SELECTORS.playbackControl)].filter(node => {
        const label = node.getAttribute('aria-label')?.trim() ?? node.getAttribute('title')?.trim() ?? '';
        return visible(node) && node.getAttribute('aria-disabled') !== 'true' && !node.hasAttribute('disabled') &&
          (playing ? /^Play(?: video)?(?: \(k\))?$/i : /^Pause(?: video)?(?: \(k\))?$/i).test(label);
      });
      const unique = controls.filter(node => !controls.some(other => other !== node && node.contains(other)));
      if (unique.length !== 1) return refuse('CONTROL_UNAVAILABLE', 'A unique native playback control is unavailable.');
      if (mutedStart) player.muted = true;
      // The site's ordinary button owns playback orchestration; do not call video.play()
      // behind that control or synthesize a trusted gesture/security workaround.
      try { unique[0].click(); }
      catch { return refuse('CONTROL_REFUSED', 'Native control request failed.'); }
      const deadline = Date.now() + 4000;
      const expectedMuted = mutedStart || before.muted === true, expectedVolume = before.volume;
      while (current()) {
        // Restore this same player's captured choice if the native handler changes
        // audio as a side effect; no audio transfer or new volume choice is implied.
        try {
          if (player.muted !== expectedMuted) player.muted = expectedMuted;
          if (expectedVolume != null && player.volume !== expectedVolume) player.volume = expectedVolume;
        } catch { return refuse('AUDIO_PRESERVATION_FAILED', 'Playback could not preserve audio choices.'); }
        const value = getObservation().playback;
        if ((playing ? value.playing === true : player.paused) && (!mutedStart || value.muted === true)) {
          notify(); return { ok: true, value, observedAt: new Date().toISOString() };
        }
        if (Date.now() >= deadline) return refuse('CONTROL_UNCONFIRMED', 'Native control did not confirm the requested state.');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return refuse('PLAYER_CHANGED', 'Player changed during the request.');
    },
    setAudio: async (change: { muted?: boolean; volume?: number }): Promise<CapabilityResult<PlaybackObservation> & { audioFailure?: string }> => {
      const player = activeVideo(document);
      if (disposed || !player) return { ok: false, capability: 'audio', code: 'TARGET_UNAVAILABLE', reason: 'No observable player is available. Use the original player.' };
      if ((change.muted !== undefined && typeof change.muted !== 'boolean') ||
          (change.volume !== undefined && (!Number.isFinite(change.volume) || change.volume < 0 || change.volume > 1)))
        return { ok: false, capability: 'audio', code: 'UNKNOWN', reason: 'Invalid player audio choice.' };
      let audioFailure = 'PLAYER_READBACK_MISMATCH';
      try {
        if (change.volume !== undefined) {
          const sliders = document.querySelectorAll<HTMLElement>(SELECTORS.volumeSlider);
          if (sliders.length) {
            const slider = sliders.length === 1 ? sliders[0] : undefined;
            if (!slider || slider.getAttribute('min') !== '0' || slider.getAttribute('max') !== '100') { audioFailure = 'CONTROL_UNAVAILABLE'; throw new Error('Native volume control unavailable'); }
            // The site's native choice can overwrite a direct video.volume write.
            // Use the ordinary slider value/change contract and require player readback.
            const muted = player.muted;
            try {
              // DOM attributes cross content-script isolation; custom component
              // properties belong to the site's world and are not our control API.
              slider.setAttribute('value', String(change.volume * 100));
              slider.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true, composed: true }));
              await new Promise(resolve => setTimeout(resolve, 150));
              const nativeValue = Number(slider.getAttribute('aria-valuenow'));
              if (disposed || activeVideo(document) !== player) { audioFailure = 'PLAYER_CHANGED'; throw new Error('Player replaced'); }
              if (player.readyState < 2) { audioFailure = 'PLAYER_LOADING'; throw new Error('Player loading'); }
              if (!slider.isConnected) { audioFailure = 'CONTROL_UNAVAILABLE'; throw new Error('Control replaced'); }
              if (!slider.hasAttribute('aria-valuenow') || !Number.isFinite(nativeValue)) { audioFailure = 'CONTROL_READBACK_MISSING'; throw new Error('Native readback unavailable'); }
              if (Math.abs(player.volume - change.volume) > .001 || Math.abs(nativeValue - change.volume * 100) > .1) { audioFailure = 'NATIVE_REFUSED'; throw new Error('Native volume choice refused'); }
            } finally { player.muted = muted; } // Volume alone carries no unmute choice, even on failure.
          } else player.volume = change.volume;
        }
        if (change.muted !== undefined) player.muted = change.muted;
        const playback = getObservation().playback;
        if ((change.muted !== undefined && playback.muted !== change.muted) ||
            (change.volume !== undefined && Math.abs((playback.volume ?? -1) - change.volume) > .001)) throw new Error('Readback mismatch');
        notify();
        return { ok: true, value: playback, observedAt: new Date().toISOString() };
      } catch { return { ok: false, capability: 'audio', code: 'UNKNOWN', audioFailure, reason: 'Player audio readback did not confirm the choice. Use the native volume control.' }; }
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
