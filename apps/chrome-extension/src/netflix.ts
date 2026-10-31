import { providerNamespace } from './provider-content';
import { recognizeContent, type PlayerBinding } from '../../../packages/core/src/media';
import { createProviderConnection } from './provider-connection';
export const NETFLIX_ACCESS: chrome.permissions.Permissions = { permissions: ['scripting'], origins: ['https://www.netflix.com/*'] };
export const NETFLIX_NAMESPACE = providerNamespace('netflix');
export const netflixContent = (url?: string) => { const r = recognizeContent(url ?? ''); return r.status === 'ok' && r.value.service === 'netflix' && r.value.url === url ? r.value : undefined; };
export const createNetflixConnection = (api: typeof chrome, revoked: (id: number) => void, current: (b: PlayerBinding) => boolean = () => true) =>
  createProviderConnection({ service: 'netflix', access: NETFLIX_ACCESS, namespace: NETFLIX_NAMESPACE, script: 'netflix-content.js', accessError: 'NETFLIX_ACCESS_REQUIRED', content: netflixContent }, api, revoked, current);
