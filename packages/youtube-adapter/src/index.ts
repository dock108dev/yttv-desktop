import { recognizeContent, type Capabilities, type Outcome, type PlayerBinding, type PlayerObservation, type ProviderAdapter } from '../../core/src/media';

const unavailable = (code: string): Outcome<never> => ({ status: 'unknown', code, retryable: true, fallback: 'focus-native' });
const supported = { state: 'supported', evidence: 'local-adapter' } as const;
/** Native watch-page DOM only. Selectors are fixture evidence, not a provider API. */
export function createYouTubeAdapter(doc: Document, binding: Omit<PlayerBinding, 'playerKey'>, current: () => boolean = () => true): ProviderAdapter {
  const keys = new WeakMap<Element, string>(); let sequence = 0;
  const recognize = (url: string) => { const result = recognizeContent(url); return result.status === 'ok' && result.value.service === 'youtube' ? result : unavailable('UNSUPPORTED_URL'); };
  const playButtons = () => [...doc.querySelectorAll<HTMLElement>('#movie_player button.ytp-play-button')].filter(b => !b.hidden && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true');
  function read(): Outcome<PlayerObservation> {
    if (!current()) return unavailable('CONNECTION_CHANGED');
    const content = recognize(doc.location.href);
    if (content.status !== 'ok') return unavailable('UNSUPPORTED_URL');
    const roots = doc.querySelectorAll('#movie_player');
    const videos = doc.querySelectorAll('#movie_player video.html5-main-video');
    const pages = doc.querySelectorAll('ytd-watch-flexy[video-id]');
    if (roots.length !== 1 || videos.length !== 1 || pages.length !== 1 || content.value.service !== 'youtube' || pages[0].getAttribute('video-id') !== content.value.videoId) return unavailable('AMBIGUOUS_IDENTITY');
    const root = roots[0], video = videos[0] as HTMLVideoElement;
    if (!keys.has(video)) keys.set(video, crypto.randomUUID());
    const ad = root.classList.contains('ad-showing') || root.classList.contains('ad-interrupting');
    const live = root.classList.contains('ytp-live') || video.duration === Infinity;
    // Require loaded main-content metadata and the watch page's matching DOM ID.
    const kind = ad ? 'ad' : live ? 'live' : Number.isFinite(video.duration) && video.duration > 0 ? 'vod' : 'unknown';
    const ready = !video.error && !video.seeking && video.readyState >= 3 && (kind === 'vod' || kind === 'live');
    const capabilities = Object.fromEntries(['recognizeUrl', 'identity', 'ready', 'play', 'pause', 'setMute', 'readMute', 'setVolume', 'readVolume', 'ended'].map(k => [k, supported])) as Capabilities;
    for (const k of ['play', 'pause', 'setMute', 'setVolume'] as const) if (!ready) capabilities[k] = { state: 'unknown', reason: 'Main content not ready; use native controls.' };
    if (playButtons().length !== 1) for (const k of ['play', 'pause'] as const) capabilities[k] = { state: 'unsupported', reason: 'A unique native Play/Pause button is unavailable.' };
    if (kind !== 'vod') capabilities.ended = { state: 'unknown', reason: 'Completion is not established for ads, live or unknown content.' };
    return { status: 'ok', value: { binding: { ...binding, playerKey: keys.get(video)! }, observedAt: Date.now(), sequence: ++sequence, content: content.value, capabilities,
      readiness: ready ? 'ready' : video.error ? 'needs-attention' : 'loading', kind,
      playing: { state: 'known', value: !video.paused && !video.ended }, muted: { state: 'known', value: video.muted }, volume: { state: 'known', value: video.volume },
      ended: kind === 'vod' && !video.seeking && video.readyState >= 2 ? video.ended && video.currentTime >= video.duration - .25 ? 'confirmed-content-ended' : 'not-ended' : 'unknown' } };
  }
  return { service: 'youtube', recognize, observe: read, async execute(command, expected) {
    const before = read();
    if (before.status !== 'ok' || JSON.stringify(before.value.binding) !== JSON.stringify(expected)) return unavailable('PLAYER_CHANGED');
    if (before.value.readiness !== 'ready') return unavailable('MAIN_CONTENT_UNAVAILABLE');
    const video = doc.querySelector('#movie_player video.html5-main-video') as HTMLVideoElement;
    const muted = video.muted, volume = video.volume;
    try {
      if (command.type === 'play' || command.type === 'pause') {
        const controls = playButtons(); if (controls.length !== 1) return unavailable('CONTROL_UNAVAILABLE');
        if (command.type === 'play' ? video.paused : !video.paused) controls[0].click();
        const deadline = Date.now() + 1500;
        while ((command.type === 'play' ? video.paused : !video.paused) && Date.now() < deadline) {
          const current = read(); if (current.status !== 'ok' || JSON.stringify(current.value.binding) !== JSON.stringify(expected) || JSON.stringify(current.value.content) !== JSON.stringify(before.value.content)) return unavailable('PLAYER_CHANGED');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      else if (command.type === 'mute') video.muted = command.value;
      else if (command.type === 'volume') { if (!Number.isFinite(command.value) || command.value < 0 || command.value > 1) return unavailable('INVALID_VOLUME'); video.volume = command.value; }
      await new Promise(resolve => setTimeout(resolve, 25));
      const after = read();
      if (after.status !== 'ok' || JSON.stringify(after.value.binding) !== JSON.stringify(expected) || JSON.stringify(after.value.content) !== JSON.stringify(before.value.content) || after.value.kind !== before.value.kind || after.value.readiness !== 'ready') return unavailable('PLAYER_CHANGED');
      if (command.type !== 'mute' && video.muted !== muted) video.muted = muted;
      if (command.type !== 'volume' && video.volume !== volume) video.volume = volume;
      if (command.type !== 'mute' && video.muted !== muted || command.type !== 'volume' && video.volume !== volume) return unavailable('AUDIO_CHANGED');
      const matched = command.type === 'play' ? !video.paused : command.type === 'pause' ? video.paused : command.type === 'mute' ? video.muted === command.value : command.type === 'volume' && Math.abs(video.volume - command.value) < .001;
      return matched ? read() : unavailable('READBACK_MISMATCH');
    } catch { return { status: 'needs-attention', code: 'NATIVE_REFUSED', retryable: true, fallback: 'focus-native' }; }
  } };
}
