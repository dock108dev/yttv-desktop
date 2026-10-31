import { recognizeContent, type Capabilities, type Outcome, type PlayerBinding, type PlayerObservation, type ProviderAdapter } from '../../core/src/media';

const attention = 'Finish selection in Netflix. Main content identity is unverified; use native controls.';
const unavailable = (code: string): Outcome<PlayerObservation> => ({ status: 'needs-attention', code, retryable: false, fallback: 'focus-native' });
/** No provider DOM selectors have been qualified. A title/watch reference is intent, never player identity.
 * Public HTML video existence is deliberately insufficient: it may be a trailer, ad or other episode.
 * Do not add guessed selectors, page-text classifiers or a confirmation that bypasses this boundary.
 */
export function createNetflixAdapter(doc: Document, binding: Omit<PlayerBinding, 'playerKey'>, current: () => boolean = () => true): ProviderAdapter {
  const documentKey = crypto.randomUUID(); let sequence = 0;
  const recognize: ProviderAdapter['recognize'] = url => {
    const r = recognizeContent(url);
    return r.status === 'ok' && r.value.service === 'netflix' && r.value.url === url ? r : { status: 'unsupported', code: 'NETFLIX_REFERENCE_REQUIRED', retryable: false, fallback: 'focus-native' };
  };
  function read(): Outcome<PlayerObservation> {
    if (!current() || binding.service !== 'netflix') return unavailable('CONNECTION_CHANGED');
    const r = recognize(doc.location.href);
    if (r.status !== 'ok') return unavailable('NETFLIX_REFERENCE_REQUIRED');
    const capabilities = Object.fromEntries(['recognizeUrl', 'identity', 'ready', 'play', 'pause', 'setMute', 'readMute', 'setVolume', 'readVolume', 'ended'].map(k => [k, { state: 'unknown', reason: attention }])) as Capabilities;
    capabilities.recognizeUrl = { state: 'supported', evidence: 'local-adapter' };
    return { status: 'ok', value: { binding: { ...binding, playerKey: documentKey }, content: r.value, observedAt: Date.now(), sequence: ++sequence,
      capabilities, readiness: 'needs-attention', reason: attention, kind: 'unknown', playing: { state: 'unknown' }, muted: { state: 'unknown' }, volume: { state: 'unknown' }, ended: 'unknown' } };
  }
  return { service: 'netflix', recognize, observe: read, async execute(_command, expected) {
    const r = read();
    if (r.status !== 'ok' || JSON.stringify(r.value.binding) !== JSON.stringify(expected)) return unavailable('PLAYER_CHANGED');
    return unavailable('MAIN_CONTENT_IDENTITY_UNVERIFIED');
  } };
}
