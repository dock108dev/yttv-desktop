import { providerNamespace } from './provider-content';
import { createProviderConnection } from './provider-connection';
import { recognizeContent, type PlayerBinding } from '../../../packages/core/src/media';
export const YOUTUBE_ACCESS: chrome.permissions.Permissions = { permissions: ['scripting'], origins: ['https://www.youtube.com/*'] };
export const YOUTUBE_NAMESPACE = providerNamespace('youtube');
export const youtubeContent = (url?: string) => { const r = recognizeContent(url ?? ''); return r.status === 'ok' && r.value.service === 'youtube' && url?.startsWith('https://www.youtube.com/') ? r.value : undefined; };
export const createYouTubeConnection = (api: typeof chrome, revoked: (id: number) => void, current: (b: PlayerBinding) => boolean = () => true) =>
  createProviderConnection({ service: 'youtube', access: YOUTUBE_ACCESS, namespace: YOUTUBE_NAMESPACE, script: 'youtube-content.js', accessError: 'YOUTUBE_ACCESS_REQUIRED', content: youtubeContent }, api, revoked, current);
