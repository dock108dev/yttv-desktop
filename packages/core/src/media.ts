/** Durable intent is deliberately separate from runtime playback authority. */
export type ServiceId = 'yttv' | 'youtube' | 'prime-video' | 'netflix';
export type ContentRef =
  | { service: 'yttv'; kind: 'live-channel'; channelId: string }
  | { service: 'youtube'; kind: 'video'; videoId: string; url: string }
  | { service: 'prime-video'; kind: 'detail'; titleId: string; url: string }
  | { service: 'netflix'; kind: 'title' | 'watch'; titleId: string; url: string };
export type Capability = { state: 'supported'; evidence: 'local-adapter' | 'documented-api' }
  | { state: 'unsupported' | 'unknown'; reason: string };
export type CapabilityName = 'recognizeUrl' | 'identity' | 'ready' | 'play' | 'pause' | 'setMute' | 'readMute' | 'setVolume' | 'readVolume' | 'ended';
export type Capabilities = Record<CapabilityName, Capability>;
export type Reading<T> = { state: 'known'; value: T } | { state: 'unknown' };
export interface PlayerBinding { service: ServiceId; tabId: number; windowId: number; documentId: string; playerKey: string; slotId: string; generation: number; workerEpoch: string }
export interface PlayerObservation {
  binding: PlayerBinding; observedAt: number; sequence: number; content: ContentRef | null; capabilities: Capabilities;
  readiness: 'loading' | 'ready' | 'needs-attention' | 'unknown' | 'failed'; reason?: string;
  kind: 'live' | 'vod' | 'ad' | 'unknown'; playing: Reading<boolean>; muted: Reading<boolean>; volume: Reading<number>;
  ended: 'confirmed-content-ended' | 'not-ended' | 'unknown';
}
export type ProviderCommand = { type: 'play' | 'pause' } | { type: 'mute'; value: boolean } | { type: 'volume'; value: number };
export type Outcome<T> = { status: 'ok'; value: T } | { status: 'unsupported' | 'unknown' | 'needs-attention' | 'failure'; code: string; retryable: boolean; fallback: 'focus-native' | 'open-native' };
export interface ProviderAdapter { service: ServiceId; recognize(url: string): Outcome<ContentRef>; observe(): Outcome<PlayerObservation>; execute(command: ProviderCommand, expected: PlayerBinding): Promise<Outcome<PlayerObservation>> }
export interface QueueItem { id: string; content: ContentRef; label: string; createdAt: number; preferredSlotId?: string }
export interface StableSlot {
  id: string; order: number; generation: number; role: 'original' | 'added';
  state: 'empty' | 'reserved' | 'loading' | 'ready' | 'attention' | 'failed' | 'interrupted' | 'cleanup-pending';
  binding?: PlayerBinding; operationId?: string;
}
export interface LaunchOperation {
  id: string; requestId: string; itemId: string; slotId: string; generation: number; workerEpoch: string;
  phase: 'reserved' | 'creating' | 'navigating' | 'observing' | 'attention' | 'committing' | 'done' | 'cancelled' | 'failed';
  deadline: number; expectedContent: ContentRef; resource?: { tabId: number; windowId: number; ownedCreation: boolean };
}
export interface MixedRecordV1 {
  version: 1; revision: number; items: QueueItem[];
  slots: Pick<StableSlot, 'id' | 'order' | 'generation' | 'role'>[];
  ownership: { slotId: string; service: ServiceId; tabId: number; windowId: number; ordinaryUrl: string; createdHere: boolean }[];
  claims: { operationId: string; requestId: string; itemId?: string; source?: 'legacy'; slotId: string; generation: number; phase: 'claimed' | 'resource-bound'; tabId?: number; windowId?: number }[];
  receipts: { requestId: string; operationId: string; itemId: string; slotId: string; generation: number; committedAt: number }[];
}
export const isUUID = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const mediaLabel = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().slice(0, 200);
export function recognizeContent(input: string): Outcome<ContentRef> {
  const invalid = (): Outcome<ContentRef> => ({ status: 'failure', code: 'PLAIN_LINK_REQUIRED', retryable: false, fallback: 'open-native' });
  if (input.length > 2048 || /[\x00-\x20\x7f-\x9f]/.test(input) || /%2f|%5c|\\/i.test(input) || !/^https:\/\/[a-z.]+\//.test(input)) return invalid();
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || input.includes('#') || !input.startsWith(`https://${u.hostname}/`)) return invalid();
    if (input.slice(input.indexOf('/', 8)).split('?')[0] !== u.pathname) return invalid();
    const params = [...u.searchParams.keys()];
    if (new Set(params).size !== params.length) return invalid();
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtu.be') {
      const short = u.hostname === 'youtu.be';
      if (params.some(k => !['si', 'feature', ...(short ? [] : ['v'])].includes(k))) return invalid();
      const id = short ? u.pathname.slice(1) : u.searchParams.get('v');
      if ((!short && u.pathname !== '/watch') || !id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return invalid();
      return { status: 'ok', value: { service: 'youtube', kind: 'video', videoId: id, url: `https://www.youtube.com/watch?v=${id}` } };
    }
    if (u.hostname === 'www.primevideo.com') {
      const match = /^\/detail\/([A-Za-z0-9]{1,64})$/.exec(u.pathname);
      if (!match || input.includes('?')) return invalid();
      return { status: 'ok', value: { service: 'prime-video', kind: 'detail', titleId: match[1], url: `https://www.primevideo.com/detail/${match[1]}` } };
    }
    if (u.hostname === 'www.netflix.com') {
      const match = /^\/(title|watch)\/([0-9]{1,20})$/.exec(u.pathname);
      if (!match || params.some(k => k !== 'trackId')) return invalid();
      return { status: 'ok', value: { service: 'netflix', kind: match[1] as 'title' | 'watch', titleId: match[2], url: `https://www.netflix.com/${match[1]}/${match[2]}` } };
    }
  } catch { /* Invalid ordinary URL. */ }
  return invalid();
}
export function sanitizeContent(value: unknown): ContentRef | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as Record<string, unknown>;
  if (r.service === 'yttv' && r.kind === 'live-channel' && typeof r.channelId === 'string' && r.channelId.length > 0 && r.channelId.length <= 200 && !/[\x00-\x20\x7f-\x9f]/.test(r.channelId))
    return { service: 'yttv', kind: 'live-channel', channelId: r.channelId };
  if (typeof r.url !== 'string') return;
  const parsed = recognizeContent(r.url);
  if (parsed.status === 'ok' && parsed.value.service === r.service && parsed.value.kind === r.kind && ('videoId' in parsed.value ? parsed.value.videoId === r.videoId : 'titleId' in parsed.value && parsed.value.titleId === r.titleId)) return parsed.value;
}
export type QueueIntent = { requestId: string; revision: number } & (
  | { action: 'enqueue'; content: ContentRef; label: string }
  | { action: 'edit'; itemId: string; content: ContentRef; label: string }
  | { action: 'move'; itemId: string; offset: -1 | 1 }
  | { action: 'remove' | 'cancel'; itemId: string }
  | { action: 'play'; itemId: string; slotId: string; generation: number }
  | { action: 'retry-storage' }
  | { action: 'confirm-closed' | 'focus'; slotId: string; generation: number });
export interface MixedSnapshot { record?: MixedRecordV1; writable: boolean; error?: string; states: Record<string, string> }
