import { watchNavigationUrl } from '../../../packages/core/src/index';
import { isUUID, sanitizeContent, type MixedRecordV1, type MixedSnapshot, type QueueIntent, type PlayerBinding, type ContentRef } from '../../../packages/core/src/media';
import { createMixedStore, emptyMixed } from '../../../packages/storage/src/media-queue';
import { consumeQueue, editQueue, mixedCapacity } from '../../../packages/quadbox/src/queue';
import { canAddManagedFeed } from '../../../packages/quadbox/src/policy';
import type { ActionResult } from '../../../packages/ui/src/types';

type Owner = MixedRecordV1['ownership'][number];
type Tab = { id?: number; windowId: number; url?: string; pendingUrl?: string; mutedInfo?: { muted: boolean } };
type Attempt = { id: string; slotId: string; generation: number; itemId: string; url: string; channelId: string; service: 'yttv' | 'youtube' | 'prime-video' | 'netflix'; epoch: string;
  created?: boolean; createPending?: boolean; revoked?: boolean;
  phase: 'creating' | 'navigating' | 'observing' | 'committing' | 'done' | 'cancelled'; resource?: Owner; identity?: PlayerBinding; deadline: number; remove?: boolean };
interface Host {
  captureReplacement?(owner: Owner): Promise<void>;
  available?(service: string): Promise<boolean>; uuid(): string; serial<T>(fn: () => Promise<T>): Promise<T>; notify(): Promise<void>;
  get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>;
  legacy(): Promise<{ tabId: number; windowId: number; url: string; original: boolean; createdHere: boolean }[]>;
  absent(id: number): Promise<boolean>;
  liveTabs(): number[]; pending(): number; target(channelId: string): string | undefined;
  preflight(count: number, newOriginal: boolean): Promise<ActionResult>; getTab(id: number): Promise<Tab>;
  create(): Promise<Tab>; mute(owner: Owner, replacement: boolean): Promise<void>;
  navigate(owner: Owner, url: string): Promise<void>; cleanup(owner: Owner, url: string): Promise<boolean>;
  enroll(owner: Owner, channelId: string, original: boolean, recovering?: boolean): Promise<void>;
  verify(binding: PlayerBinding, channelId: string, url: string): Promise<boolean>;
  focus(owner: Owner): Promise<void>;
  play(binding: PlayerBinding): Promise<ActionResult>; binding(tabId: number): Omit<PlayerBinding, 'slotId' | 'generation' | 'workerEpoch' | 'service'> | undefined;
}
const success = (message: string): ActionResult => ({ ok: true, message });
const failure = (code: string): ActionResult => ({ ok: false, code, reason: ({
  NETFLIX_IDENTITY_UNVERIFIED: 'Netflix audio and content identity are unverified. Close the native window before reusing this slot.', NETFLIX_ACCESS_REQUIRED: 'Enable Netflix in the remote, then retry. Use native controls.',
  STALE_QUEUE: 'The queue changed. Review it and try again.', PRIME_IDENTITY_UNVERIFIED: 'Prime Video audio and content identity are unverified. Close the native window before reusing this slot.', PRIME_VIDEO_ACCESS_REQUIRED: 'Enable Prime Video in the remote, then retry. Use native controls.', YOUTUBE_ACCESS_REQUIRED: 'Enable YouTube in the remote, then retry. Native controls remain available.', SAVE_FAILED: 'Could not save. Nothing further was launched or consumed. Retry explicitly.',
  STORAGE_UNAVAILABLE: 'Queue storage is unavailable. Existing records are preserved.', UNSUPPORTED: 'This service is saved for later. Its player adapter is not implemented.',
  TARGET_UNAVAILABLE: 'Refresh the native YouTube TV guide before trying this channel.', CAPACITY: 'Four players are open or reserved. Choose a replacement or resolve an interrupted opening.',
  BUSY: 'This opening is still pending. Cancel it and resolve its window before replacing it.', SUPERSEDED: 'The player changed. Review the slot and retry explicitly.',
  QUEUE_FULL: 'The queue is full (100 videos). Remove an item first.', CANCEL_FIRST: 'Cancel this launch before editing it.',
  UNCERTAIN: 'An interrupted opening may have left a window. Close that window, then confirm it is closed.',
} as Record<string, string>)[code] ?? 'This queue action could not finish. Refresh and try again.' });
export function validQueueIntent(raw: unknown): raw is QueueIntent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  if (!isUUID(r.requestId) || !Number.isSafeInteger(r.revision) || Number(r.revision) < 0) return false;
  const fields: Record<string, string[]> = { 'retry-storage': [], enqueue: ['content', 'label'], edit: ['itemId', 'content', 'label'], move: ['itemId', 'offset'], remove: ['itemId'], cancel: ['itemId'], play: ['itemId', 'slotId', 'generation'], 'confirm-closed': ['slotId', 'generation'], focus: ['slotId', 'generation'] };
  if (typeof r.action !== 'string' || !fields[r.action] || Object.keys(r).some(k => !['action', 'requestId', 'revision', ...fields[r.action as string]].includes(k))) return false;
  if ('itemId' in r && !isUUID(r.itemId) || 'slotId' in r && !isUUID(r.slotId)) return false;
  if (['play', 'confirm-closed', 'focus'].includes(r.action) && (!Number.isSafeInteger(r.generation) || Number(r.generation) < 0)) return false;
  if (['enqueue', 'edit'].includes(r.action) && (!sanitizeContent(r.content) || typeof r.label !== 'string' || r.label.length > 200)) return false;
  return r.action !== 'move' || r.offset === -1 || r.offset === 1;
}
export function createMixedWorkspace(host: Host) {
  const store = createMixedStore(host), epoch = host.uuid(), attempts = new Map<string, Attempt>();
  const states: Record<string, string> = {}, requests = new Map<string, ActionResult>();
  let loaded = false, ready: Promise<void> | undefined;
  const record = () => store.snapshot.record;
  const persist = (change: (r: MixedRecordV1) => void) => store.update(record()!.revision, change);
  const current = (a: Attempt) => a.epoch === epoch && attempts.get(a.slotId) === a && a.phase !== 'cancelled' && record()?.claims.some(c => c.operationId === a.id && c.generation === a.generation);
  async function load() {
    if (!ready) ready = (async () => {
      await store.load(async () => {
        const r = emptyMixed(host.uuid);
        for (const p of await host.legacy()) {
          const s = p.original ? r.slots[0] : r.slots.find(s => s.role === 'added' && !r.ownership.some(o => o.slotId === s.id));
          if (!s) throw Error('CAPACITY');
          r.ownership.push({ slotId: s.id, service: 'yttv', tabId: p.tabId, windowId: p.windowId, ordinaryUrl: p.url, createdHere: p.createdHere });
        }
        return r;
      });
      loaded = true;
      for (const c of record()?.claims ?? []) states[c.slotId] = c.phase === 'claimed' ? 'Interrupted opening — confirm its window is closed' : 'Interrupted — retry explicitly';
      // Never replay or consume saved claims. Reattach only exact known YTTV identities.
      for (const o of record()?.ownership ?? []) {
        try {
          const tab = await host.getTab(o.tabId);
          if (tab.windowId !== o.windowId || tab.url !== o.ordinaryUrl || !['yttv', 'youtube', 'prime-video', 'netflix'].includes(o.service)) { states[o.slotId] = 'Player changed — native controls available'; continue; }
          const item = record()?.items.find(i => i.id === record()?.claims.find(c => c.slotId === o.slotId)?.itemId);
          if (!host.liveTabs().includes(o.tabId) || o.service !== 'yttv') await host.enroll(o, item?.content.service === 'yttv' ? item.content.channelId : 'restored-player', record()!.slots.find(s => s.id === o.slotId)?.role === 'original', true);
        } catch { states[o.slotId] = 'Player unavailable — confirm it is closed'; }
      }
    })();
    return ready;
  }
  async function syncLegacy() {
    if (!loaded || !store.snapshot.writable) return;
    const rows = await host.legacy(), r = record()!;
    const added = rows.filter(p => !r.ownership.some(o => o.tabId === p.tabId));
    const changed = rows.filter(p => r.ownership.some(o => o.tabId === p.tabId && !r.claims.some(c => c.slotId === o.slotId) && (o.windowId !== p.windowId || o.ordinaryUrl !== p.url)));
    if (!added.length && !changed.length) return;
    await persist(next => {
      for (const p of changed) {
        const owner = next.ownership.find(o => o.tabId === p.tabId)!;
        owner.windowId = p.windowId; owner.ordinaryUrl = p.url;
        next.slots.find(s => s.id === owner.slotId)!.generation++;
      }
      for (const p of added) {
        const s = next.slots.find(s => (p.original ? s.role === 'original' : s.role === 'added') && !next.ownership.some(o => o.slotId === s.id) && !next.claims.some(c => c.slotId === s.id));
        if (!s) throw Error('CAPACITY');
        next.ownership.push({ slotId: s.id, service: 'yttv', tabId: p.tabId, windowId: p.windowId, ordinaryUrl: p.url, createdHere: p.createdHere });
      }
    });
  }
  async function exact(a: Attempt) {
    if (!current(a) || !a.resource) return false;
    const tab = await host.getTab(a.resource.tabId).catch(() => undefined);
    return current(a) && tab?.windowId === a.resource.windowId && (tab.url === a.resource.ordinaryUrl || tab.url === a.url || tab.pendingUrl === a.url);
  }
  async function cleanLate(a: Attempt, owner: Owner) {
    const closed = await host.cleanup(owner, 'about:blank').catch(() => false);
    if (closed) await persist(r => {
      r.ownership = r.ownership.filter(o => o.tabId !== owner.tabId);
      r.claims = r.claims.filter(c => c.operationId !== a.id);
      if (a.remove) r.items = r.items.filter(i => i.id !== a.itemId);
    }).catch(() => { states[a.slotId] = 'Save error — opening remains reserved'; });
    else states[a.slotId] = 'Cleanup pending — close the new window and confirm';
  }
  async function begin(a: Attempt, replacement: boolean) {
    try {
      if (!a.resource) {
        // Browser creation is intentionally outside the serialized phase. The durable claim already exists.
        a.createPending = true;
        const tab = await host.create();
        a.createPending = false; a.created = true;
        await host.serial(async () => {
          if (!tab.id || !Number.isInteger(tab.windowId)) throw Error('UNCERTAIN');
          const owner: Owner = { slotId: a.slotId, service: a.service, tabId: tab.id, windowId: tab.windowId, ordinaryUrl: 'about:blank', createdHere: true };
          a.resource = owner;
          if (!current(a)) { await cleanLate(a, owner); return; }
          try { await persist(r => { r.ownership.push(owner); Object.assign(r.claims.find(c => c.operationId === a.id)!, { phase: 'resource-bound', tabId: owner.tabId, windowId: owner.windowId }); }); }
          catch { a.phase = 'cancelled'; await cleanLate(a, owner); throw Error('SAVE_FAILED'); }
        });
      }
      if (!await exact(a)) throw Error('SUPERSEDED');
      await host.mute(a.resource!, replacement);
      if (!await exact(a)) throw Error('SUPERSEDED');
      if (host.available && !await host.available(a.service)) throw Error(a.service === 'netflix' ? 'NETFLIX_ACCESS_REQUIRED' : a.service === 'prime-video' ? 'PRIME_VIDEO_ACCESS_REQUIRED' : 'YOUTUBE_ACCESS_REQUIRED');
      const fresh = a.service !== 'yttv' ? a.url : host.target(a.channelId); if (!fresh || fresh !== a.url) throw Error('TARGET_UNAVAILABLE');
      // Publish expected navigation before dispatch, so its event does not revoke itself.
      a.phase = 'navigating';
      await host.navigate(a.resource!, a.url);
      await host.serial(async () => {
        if (!await exact(a)) throw Error('SUPERSEDED');
        await persist(r => { Object.assign(r.ownership.find(o => o.slotId === a.slotId)!, { ordinaryUrl: a.url, service: a.service }); });
        if (!current(a)) return;
        a.resource!.ordinaryUrl = a.url; a.resource!.service = a.service; a.phase = 'observing'; a.deadline = Date.now() + 15_000;
        await host.enroll(a.resource!, a.channelId, record()!.slots.find(s => s.id === a.slotId)!.role === 'original');
        states[a.slotId] = a.service === 'netflix' ? 'Finish selection in Netflix — identity unverified; use native controls' : a.service === 'prime-video' ? 'Finish selection in Prime Video — identity unverified; use native controls' : 'Waiting for native player';
        // No qualified main-content signal exists yet. Keep intent and counted ownership; permit an explicit retry/replacement.
        if (a.service === 'prime-video' || a.service === 'netflix') a.phase = 'cancelled';
        const timer = setTimeout(() => { void host.serial(async () => {
          if (current(a) && a.phase === 'observing') { a.phase = 'cancelled'; states[a.slotId] = 'Needs attention — retry or use native controls'; await host.notify(); }
        }); }, 15_000); (timer as unknown as { unref?: () => void }).unref?.();
        await host.notify();
      });
    } catch (error) {
      a.createPending = false;
      await host.serial(async () => { if (attempts.get(a.slotId) === a) { a.phase = 'cancelled'; states[a.slotId] = error instanceof Error && error.message === 'SAVE_FAILED' ? 'Save error — retry explicitly' : 'Needs attention — retry or use native controls'; } await host.notify(); });
    }
  }
  async function command(intent: QueueIntent): Promise<ActionResult> {
    await load();
    return host.serial(async () => {
      try {
        if (intent.action === 'retry-storage') { ready = undefined; await load(); return store.snapshot.writable ? success('Queue storage reloaded.') : failure('STORAGE_UNAVAILABLE'); }
        if (!store.snapshot.writable) throw Error('STORAGE_UNAVAILABLE');
        if (requests.has(intent.requestId)) return requests.get(intent.requestId)!;
        let r = record()!;
        if (r.claims.some(c => c.requestId === intent.requestId) || r.receipts.some(c => c.requestId === intent.requestId)) return success('This request was already recorded.');
        if (r.revision !== intent.revision) throw Error('STALE_QUEUE');
        if (intent.action === 'focus') {
          const owner = r.ownership.find(o => o.slotId === intent.slotId);
          if (!owner || !r.slots.some(s => s.id === intent.slotId && s.generation === intent.generation)) throw Error('SUPERSEDED');
          await host.focus(owner); return success('Native player focused. Audio unchanged.');
        } else if (intent.action === 'confirm-closed') {
          const s = r.slots.find(s => s.id === intent.slotId && s.generation === intent.generation); if (!s) throw Error('STALE_QUEUE');
          if (attempts.get(s.id)?.createPending) throw Error('BUSY');
          const owner = r.ownership.find(o => o.slotId === s.id) ?? attempts.get(s.id)?.resource;
          if (owner && !await host.absent(owner.tabId)) throw Error('BUSY');
          attempts.delete(s.id);
          await persist(r => { r.claims = r.claims.filter(c => c.slotId !== s.id); r.ownership = r.ownership.filter(o => o.slotId !== s.id); r.slots.find(x => x.id === s.id)!.generation++; });
          delete states[s.id];
        } else if (intent.action === 'cancel' || intent.action === 'remove' && r.claims.some(c => c.itemId === intent.itemId)) {
          const claim = r.claims.find(c => c.itemId === intent.itemId); if (!claim) throw Error('ITEM_MISSING');
          const a = attempts.get(claim.slotId); if (a) { a.phase = 'cancelled'; a.remove = intent.action === 'remove'; }
          // Unbound cancellation retains its claim/item until the exact callback or owner confirmation resolves uncertainty.
          await persist(r => {
            r.slots.find(s => s.id === claim.slotId)!.generation++;
            const c = r.claims.find(c => c.operationId === claim.operationId)!; c.generation++;
            if (c.phase === 'resource-bound') { r.claims = r.claims.filter(x => x !== c); if (intent.action === 'remove') r.items = r.items.filter(i => i.id !== intent.itemId); }
          });
          if (a?.created && a.resource && !a.createPending && !a.revoked) {
            const owner = a.resource, expected = host.binding(owner.tabId);
            if (!a.identity || expected?.documentId === a.identity.documentId && expected.playerKey === a.identity.playerKey) {
              const closed = await host.cleanup(owner, a.url).catch(() => false);
              if (closed) await persist(r => { r.ownership = r.ownership.filter(o => o.tabId !== owner.tabId); });
              else states[claim.slotId] = 'Cleanup pending — close the new window';
            }
          }
          states[claim.slotId] = states[claim.slotId]?.startsWith('Cleanup') ? states[claim.slotId] : claim.phase === 'claimed' ? 'Cancelled opening — confirm its window is closed' : 'Cancelled — native player retained';
        } else if (intent.action === 'play') {
          const item = r.items.find(i => i.id === intent.itemId), slot = r.slots.find(s => s.id === intent.slotId);
          if (!item || !slot || slot.generation !== intent.generation) throw Error('STALE_QUEUE');
          if (host.available && !await host.available(item.content.service)) throw Error(item.content.service === 'netflix' ? 'NETFLIX_ACCESS_REQUIRED' : item.content.service === 'prime-video' ? 'PRIME_VIDEO_ACCESS_REQUIRED' : 'YOUTUBE_ACCESS_REQUIRED');
          const old = r.claims.find(c => c.slotId === slot.id || c.itemId === item.id);
          if (old && (old.slotId !== slot.id || old.phase === 'claimed' || ['creating', 'navigating', 'observing', 'committing'].includes(attempts.get(old.slotId)?.phase ?? ''))) throw Error('BUSY');
          const owner = r.ownership.find(o => o.slotId === slot.id);
          if (!owner && !canAddManagedFeed(mixedCapacity(r, host.liveTabs(), host.pending()))) throw Error('CAPACITY');
          if (owner) {
            const tab = await host.getTab(owner.tabId);
            if (tab.windowId !== owner.windowId || (tab.url !== owner.ordinaryUrl && !(owner.service === 'yttv' && tab.url && watchNavigationUrl(tab.url) === tab.url))) throw Error('SUPERSEDED');
            // Explicit replacement can reuse a same-service native channel change, never another service.
            owner.ordinaryUrl = tab.url!;
          }
          const url = item.content.service !== 'yttv' ? item.content.url : host.target(item.content.channelId); if (!url) throw Error('TARGET_UNAVAILABLE');
          const placement = await host.preflight(mixedCapacity(r, host.liveTabs(), host.pending()) + (owner ? 0 : 1), !owner && slot.role === 'original'); if (!placement.ok) return placement;
          if (owner) await host.captureReplacement?.(owner);
          const a: Attempt = { id: host.uuid(), itemId: item.id, slotId: slot.id, generation: slot.generation + 1, epoch, url, channelId: item.content.service === 'youtube' ? item.content.videoId : item.content.service !== 'yttv' ? item.content.titleId : item.content.channelId, service: item.content.service, phase: owner ? 'navigating' : 'creating', resource: owner, deadline: Date.now() + 30_000 };
          await persist(next => {
            next.slots.find(s => s.id === slot.id)!.generation = a.generation;
            if (owner) Object.assign(next.ownership.find(o => o.slotId === slot.id)!, owner);
            if (old) next.claims = next.claims.filter(c => c !== next.claims.find(c => c.operationId === old.operationId));
            next.claims.push({ operationId: a.id, requestId: intent.requestId, itemId: item.id, slotId: slot.id, generation: a.generation, phase: owner ? 'resource-bound' : 'claimed', ...(owner ? { tabId: owner.tabId, windowId: owner.windowId } : {}) });
          });
          attempts.set(slot.id, a); states[slot.id] = 'Launching muted';
          const timer = setTimeout(() => { void host.serial(async () => {
            if (current(a) && a.phase !== 'done') { a.phase = 'cancelled'; states[a.slotId] = 'Interrupted opening — retry or resolve its window'; await host.notify(); }
          }).catch(() => undefined); }, 30_000); (timer as unknown as { unref?: () => void }).unref?.();
          void begin(a, Boolean(owner));
        } else await store.update(intent.revision, r => editQueue(r, intent, host.uuid, Date.now()));
        const result = success('Queue saved.'); requests.set(intent.requestId, result); if (requests.size > 128) requests.delete(requests.keys().next().value!);
        await host.notify().catch(() => undefined); return result;
      } catch (error) { return failure(error instanceof Error ? error.message : 'UNKNOWN'); }
    });
  }
  return {
    load, syncLegacy, command,
    async moved(tab: Tab) {
      const owner = record()?.ownership.find(o => o.tabId === tab.id);
      if (!owner || tab.url !== owner.ordinaryUrl) throw Error('PLAYER_CHANGED');
      await persist(r => { r.ownership.find(o => o.tabId === tab.id)!.windowId = tab.windowId; for (const c of r.claims) if (c.tabId === tab.id) c.windowId = tab.windowId; });
      for (const a of attempts.values()) if (a.resource && a.resource.tabId === tab.id) { a.resource.windowId = tab.windowId; if (a.identity) a.identity.windowId = tab.windowId; }
    },
    async connectYouTube(tab: Tab, content: ContentRef) {
      if (content.service !== 'youtube' || !store.snapshot.writable || !tab.id || !tab.url) throw Error('PLAYER_CHANGED');
      const r = record()!;
      let owner = r.ownership.find(o => o.tabId === tab.id);
      if (owner && (owner.service !== 'youtube' || r.claims.some(c => c.slotId === owner!.slotId))) throw Error('BUSY');
      const slot = owner ? r.slots.find(s => s.id === owner!.slotId) : r.slots.find(s => !r.ownership.some(o => o.slotId === s.id) && !r.claims.some(c => c.slotId === s.id));
      if (!slot || !owner && !canAddManagedFeed(mixedCapacity(r, host.liveTabs()))) throw Error('CAPACITY');
      await persist(next => {
        next.slots.find(s => s.id === slot.id)!.generation++;
        const current = next.ownership.find(o => o.slotId === slot.id);
        if (current) Object.assign(current, { ordinaryUrl: tab.url!, windowId: tab.windowId });
        else next.ownership.push({ slotId: slot.id, service: 'youtube', tabId: tab.id!, windowId: tab.windowId, ordinaryUrl: tab.url!, createdHere: false });
      });
      owner = record()!.ownership.find(o => o.slotId === slot.id)!;
      await host.enroll(owner, content.videoId, slot.role === 'original', true);
      states[slot.id] = 'Connected — audio unchanged';
    },
    async connectLegacy(tab: Tab, original: boolean) {
      if (!store.snapshot.writable || !tab.id || !tab.url || !watchNavigationUrl(tab.url)) throw Error('STORAGE_UNAVAILABLE');
      if (record()!.ownership.some(o => o.tabId === tab.id)) return;
      const r = record()!;
      const slot = r.slots.find(s => (original ? s.role === 'original' : s.role === 'added') && !r.ownership.some(o => o.slotId === s.id) && !r.claims.some(c => c.slotId === s.id));
      if (!slot || !canAddManagedFeed(mixedCapacity(r, host.liveTabs()))) throw Error('CAPACITY');
      await persist(r => {
        r.slots.find(s => s.id === slot.id)!.generation++;
        r.ownership.push({ slotId: slot.id, service: 'yttv', tabId: tab.id!, windowId: tab.windowId, ordinaryUrl: tab.url!, createdHere: false });
      });
    },
    async reserveLegacy(original: boolean) {
      if (!store.snapshot.writable) throw Error('STORAGE_UNAVAILABLE');
      const r = record()!, slot = r.slots.find(s => (original ? s.role === 'original' : s.role === 'added') && !r.ownership.some(o => o.slotId === s.id) && !r.claims.some(c => c.slotId === s.id));
      if (!slot || !canAddManagedFeed(mixedCapacity(r, host.liveTabs()))) throw Error('CAPACITY');
      const operationId = host.uuid();
      await persist(r => {
        const s = r.slots.find(s => s.id === slot.id)!; s.generation++;
        r.claims.push({ source: 'legacy', operationId, requestId: host.uuid(), slotId: s.id, generation: s.generation, phase: 'claimed' });
      });
      states[slot.id] = 'Opening YouTube TV'; return operationId;
    },
    async bindLegacy(operationId: string, tab: Tab) {
      if (!tab.id || !Number.isInteger(tab.windowId) || tab.url !== 'about:blank') throw Error('SUPERSEDED');
      await persist(r => {
        const c = r.claims.find(c => c.operationId === operationId); if (!c) throw Error('SUPERSEDED');
        r.ownership.push({ slotId: c.slotId, service: 'yttv', tabId: tab.id!, windowId: tab.windowId, ordinaryUrl: 'about:blank', createdHere: true });
        Object.assign(c, { phase: 'resource-bound', tabId: tab.id, windowId: tab.windowId });
      });
    },
    async finishLegacy(operationId: string, tabId?: number) {
      const c = record()?.claims.find(c => c.operationId === operationId); if (!c) return;
      const tab = tabId ? await host.getTab(tabId) : undefined;
      await persist(r => {
        const owner = r.ownership.find(o => o.slotId === c.slotId);
        if (tab && owner && tab.id === owner.tabId && tab.windowId === owner.windowId && tab.url) owner.ordinaryUrl = tab.url;
        else if (tabId) throw Error('SUPERSEDED');
        r.claims = r.claims.filter(x => x.operationId !== operationId);
      });
      delete states[c.slotId];
    },
    snapshot(): MixedSnapshot { const s = store.snapshot; return { ...s, states: { ...states } }; },
    capacity() { return mixedCapacity(record(), host.liveTabs(), host.pending()); },
    unavailable() { return loaded && !store.snapshot.writable; },
    blocked() { return loaded && (!store.snapshot.writable || Boolean(record()?.claims.length)); },
    revokeService(service: string) {
      for (const a of attempts.values()) if (a.service === service) { a.phase = 'cancelled'; states[a.slotId] = 'Access removed — enable service and retry explicitly'; }
    },
    revoke(tabId: number, url?: string) {
      const matching = [...attempts.values()].filter(a => a.resource?.tabId === tabId);
      if (url !== undefined && matching.some(a => a.url === url && ['navigating', 'observing'].includes(a.phase))) return;
      for (const a of matching) { a.revoked = true; a.phase = 'cancelled'; states[a.slotId] = 'Player changed — retry explicitly'; }
      const owner = record()?.ownership.find(o => o.tabId === tabId);
      if (owner && store.snapshot.writable) void host.serial(async () => {
        if (!record()?.ownership.some(o => o.tabId === tabId)) return;
        await persist(r => {
          const s = r.slots.find(s => s.id === owner.slotId)!; s.generation++;
          const c = r.claims.find(c => c.slotId === s.id); if (c) c.generation = s.generation;
        });
        states[owner.slotId] = 'Player changed — retry explicitly'; await host.notify();
      }).catch(() => { states[owner.slotId] = 'Save error — use native controls'; });
    },
    async closed(tabId: number) {
      if (!loaded || !store.snapshot.writable) return;
      const owner = record()?.ownership.find(o => o.tabId === tabId); if (!owner) return;
      await persist(r => { r.ownership = r.ownership.filter(o => o.tabId !== tabId); r.claims = r.claims.filter(c => c.slotId !== owner.slotId); r.slots.find(s => s.id === owner.slotId)!.generation++; });
      states[owner.slotId] = 'Player closed — item retained';
    },
    async observed(tabId: number, channelId: string | undefined, ready: boolean, observedAt: string) {
      const a = [...attempts.values()].find(a => a.resource?.tabId === tabId && a.phase === 'observing');
      if (!a || !current(a)) return;
      const identity = host.binding(tabId);
      if (!identity || !ready || Date.now() - Date.parse(observedAt) > 10_000 || Date.parse(observedAt) > Date.now() || Date.now() > a.deadline) return;
      if (channelId !== a.channelId || a.identity && (a.identity.documentId !== identity.documentId || a.identity.playerKey !== identity.playerKey)) { a.revoked = true; a.phase = 'cancelled'; states[a.slotId] = 'Player changed — retry explicitly'; return; }
      a.identity = { ...identity, service: a.service, slotId: a.slotId, generation: a.generation, workerEpoch: epoch };
      if (!await exact(a) || !await host.verify(a.identity, a.channelId, a.url) || !current(a)) return;
      try {
        a.phase = 'committing';
        await persist(r => consumeQueue(r, a.id, Date.now()));
        // A navigation received while storage was committing revokes the Play grant.
        if ((a.phase as string) !== 'committing' || attempts.get(a.slotId) !== a) { states[a.slotId] = 'Consumed — player changed; use native controls'; return; }
        a.phase = 'done'; states[a.slotId] = 'Ready — muted';
        // Commit is final. Recovery never replays this volatile one-shot authorization.
        const binding = a.identity;
        if (attempts.get(a.slotId) !== a || host.binding(tabId)?.playerKey !== binding.playerKey || host.binding(tabId)?.documentId !== binding.documentId) return;
        void host.play(binding).then(result => host.serial(async () => {
          if (attempts.get(a.slotId) === a && a.phase === 'done') { states[a.slotId] = result.ok ? 'Ready — muted' : 'Ready — use native Play'; await host.notify(); }
        }));
      } catch { a.phase = 'cancelled'; states[a.slotId] = 'Save error — retry explicitly'; }
      await host.notify();
    },
  };
}
