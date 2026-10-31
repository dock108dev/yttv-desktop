import type { Capabilities, PlayerBinding, PlayerObservation, Reading } from '../../core/src/media';
import type { AdapterObservation } from './index';
const supported = { state: 'supported', evidence: 'local-adapter' } as const;
/** Capability implementation is independent of whether a particular page exposes a control. */
export const YTTV_CAPABILITIES: Capabilities = {
  recognizeUrl: { state: 'unsupported', reason: 'CHANNEL_ASSOCIATION_REQUIRED' },
  identity: supported, ready: supported, play: supported, pause: supported,
  setMute: supported, readMute: supported, setVolume: supported, readVolume: supported,
  ended: { state: 'unknown', reason: 'LIVE_CONTENT_HAS_NO_RELIABLE_END' },
};
const reading = <T>(value: T | null | undefined): Reading<T> => value == null ? { state: 'unknown' } : { state: 'known', value };
/** Worker supplies the trusted binding; this adapter mapping supplies no ownership authority. */
export function mediaObservation(observation: AdapterObservation, binding: PlayerBinding, sequence: number): PlayerObservation {
  const ready = observation.route === 'watch' && observation.mainPlayerUnique === true && Boolean(observation.currentChannelId) && (observation.playback.readyState ?? 0) >= 2;
  return { binding, sequence, observedAt: Date.parse(observation.observedAt), capabilities: YTTV_CAPABILITIES,
    content: observation.currentChannelId ? { service: 'yttv', kind: 'live-channel', channelId: observation.currentChannelId } : null,
    readiness: ready ? 'ready' : observation.route === 'watch' ? 'loading' : 'needs-attention',
    kind: observation.currentChannelId ? 'live' : 'unknown', playing: reading(observation.playback.playing), muted: reading(observation.playback.muted), volume: reading(observation.playback.volume), ended: 'unknown' };
}
