import type { ContentRef, PlayerBinding, PlayerObservation, ProviderCommand } from '../../../packages/core/src/media';
export interface ProviderConnectionConfig {
  service: 'youtube' | 'prime-video' | 'netflix'; access: chrome.permissions.Permissions;
  namespace: string; script: string; accessError: string;
  content(url?: string): Exclude<ContentRef, { service: 'yttv' }> | undefined;
}
/** Packaged top-frame bridge; service-specific recognition remains outside orchestration. */
export function createProviderConnection(config: ProviderConnectionConfig, api: typeof chrome, revoked: (id: number) => void, current: (b: PlayerBinding) => boolean = () => true) {
  const connections = new Map<number, { binding: PlayerBinding; nonce: string; url: string; observation?: PlayerObservation }>();
  const permitted = () => api.permissions?.contains(config.access) ?? Promise.resolve(false);
  function revoke(id: number) { if (connections.delete(id)) revoked(id); }
  async function valid(id: number) {
    const c = connections.get(id), tab = await api.tabs.get(id).catch(() => undefined), allowed = await permitted();
    if (connections.get(id) !== c) return;
    if (!c || !current(c.binding) || !allowed || tab?.windowId !== c.binding.windowId || tab.url !== c.url || tab.pendingUrl && tab.pendingUrl !== c.url) { revoke(id); return; }
    return c;
  }
  async function receive(id: number, raw: any, expected: NonNullable<ReturnType<typeof connections.get>>, initial = false) {
    if (connections.get(id) !== expected) return;
    const c = await valid(id); if (c !== expected || connections.get(id) !== expected) return;
    const o = raw?.result?.value as PlayerObservation | undefined;
    if (!c || raw?.nonce !== c.nonce || raw?.result?.status !== 'ok' || !o || o.content?.service !== config.service || o.content.url !== config.content(c.url)?.url || !Number.isFinite(o.observedAt) || Date.now() - o.observedAt > 5000 || o.observedAt > Date.now() || typeof o.binding?.playerKey !== 'string' || o.binding.playerKey.length > 200 || !o.binding.playerKey || !Number.isSafeInteger(o.sequence) || o.sequence < 1 || c.observation && o.sequence <= c.observation.sequence ||
      Object.entries(c.binding).some(([k, v]) => !(initial && k === 'playerKey') && o.binding[k as keyof PlayerBinding] !== v)) { revoke(id); return; }
    c.binding = o.binding; c.observation = o; return o;
  }
  return { permitted, revoke, forget: (id: number) => connections.delete(id), get: (id: number) => connections.get(id),
    async connect(binding: PlayerBinding, url: string) {
      if (binding.service !== config.service || !current(binding) || !config.content(url) || !await permitted()) throw Error(config.accessError);
      const tab = await api.tabs.get(binding.tabId);
      if (tab.url !== url || tab.windowId !== binding.windowId || tab.pendingUrl && tab.pendingUrl !== url) throw Error('PLAYER_CHANGED');
      const results = await api.scripting.executeScript({ target: { tabId: binding.tabId, frameIds: [0] }, files: [config.script] });
      const frame = results.find(r => r.frameId === 0);
      if (!frame?.documentId) throw Error('DOCUMENT_UNAVAILABLE');
      const c = { binding: { ...binding, documentId: frame.documentId }, nonce: crypto.randomUUID(), url };
      connections.set(binding.tabId, c);
      const raw = await api.tabs.sendMessage(binding.tabId, { namespace: config.namespace, type: 'bind', binding: c.binding, nonce: c.nonce }, { documentId: frame.documentId });
      // Loading / missing DOM is retryable within this document; never authorize controls yet.
      if (raw?.result?.status !== 'ok') return undefined;
      return receive(binding.tabId, raw, c, true);
    },
    async observe(id: number) {
      const c = await valid(id); if (!c) return;
      const raw = await api.tabs.sendMessage(id, { namespace: config.namespace, type: 'observe', nonce: c.nonce }, { documentId: c.binding.documentId }).catch(() => undefined);
      if (raw?.result?.status !== 'ok' && !c.observation) return;
      return receive(id, raw, c, !c.observation);
    },
    async execute(id: number, command: ProviderCommand) {
      const c = await valid(id); if (!c?.observation) return;
      const raw = await api.tabs.sendMessage(id, { namespace: config.namespace, type: 'execute', binding: c.binding, nonce: c.nonce, command }, { documentId: c.binding.documentId }).catch(() => undefined);
      if (raw?.result?.status !== 'ok') return;
      return receive(id, raw, c);
    },
    async sender(sender: chrome.runtime.MessageSender, nonce: unknown) {
      const id = sender.tab?.id, c = id ? await valid(id) : undefined;
      return Boolean(c && sender.id === api.runtime.id && sender.frameId === 0 && sender.documentId === c.binding.documentId && sender.tab?.windowId === c.binding.windowId && sender.url === c.url && nonce === c.nonce);
    },
  };
}
