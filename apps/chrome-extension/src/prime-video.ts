import { providerNamespace } from './provider-content';
import { recognizeContent, type PlayerBinding } from '../../../packages/core/src/media';
import { createProviderConnection } from './provider-connection';
export const PRIME_VIDEO_ACCESS: chrome.permissions.Permissions = { permissions: ['scripting'], origins: ['https://www.primevideo.com/*'] };
export const PRIME_VIDEO_NAMESPACE = providerNamespace('prime-video');
export const primeVideoContent = (url?: string) => { const r = recognizeContent(url ?? ''); return r.status === 'ok' && r.value.service === 'prime-video' && r.value.url === url ? r.value : undefined; };
export const createPrimeVideoConnection = (api: typeof chrome, revoked: (id: number) => void, current: (b: PlayerBinding) => boolean = () => true) =>
  createProviderConnection({ service: 'prime-video', access: PRIME_VIDEO_ACCESS, namespace: PRIME_VIDEO_NAMESPACE, script: 'prime-video-content.js', accessError: 'PRIME_VIDEO_ACCESS_REQUIRED', content: primeVideoContent }, api, revoked, current);
