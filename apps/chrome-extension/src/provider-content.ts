import type { PlayerBinding, ProviderAdapter } from '../../../packages/core/src/media';

export type OptionalProvider = 'youtube' | 'prime-video' | 'netflix';
export const providerNamespace = (service: OptionalProvider) => `yttv-desktop.${service}.v1`;

/** One isolated-world transport policy; native identity and controls stay in each adapter. */
export function installProviderContent(
  service: OptionalProvider,
  marker: '__youtubeBridge' | '__primeVideoBridge' | '__netflixBridge',
  createAdapter: (document: Document, binding: PlayerBinding, current: () => boolean) => ProviderAdapter,
) {
  const scope = globalThis as typeof globalThis & Partial<Record<typeof marker, boolean>>;
  if (scope[marker] || window.top !== window) return;
  scope[marker] = true;
  const namespace = providerNamespace(service);
  let adapter: ProviderAdapter | undefined, nonce: string | undefined;
  let generation = 0;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab || message?.namespace !== namespace) return false;
    if (message.type === 'bind') {
      const binding = message.binding as PlayerBinding;
      if (binding?.service !== service || typeof message.nonce !== 'string') return false;
      const token = ++generation;
      adapter = createAdapter(document, binding, () => generation === token);
      nonce = message.nonce;
      reply({ nonce, result: adapter.observe() }); return false;
    }
    if (!adapter || message.nonce !== nonce) return false;
    if (message.type === 'observe') { reply({ nonce, result: adapter.observe() }); return false; }
    if (message.type === 'execute') {
      // A later bind must not relabel an old result with the new connection's nonce.
      const requestNonce = nonce;
      void adapter.execute(message.command, message.binding).then(result => reply({ nonce: requestNonce, result }));
      return true;
    }
    return false;
  });
  // Notifications carry no authoritative observation; the worker challenges this document.
  setInterval(() => {
    if (nonce) void chrome.runtime.sendMessage({ namespace, type: 'changed', nonce }).catch(() => undefined);
  }, 1000);
}
