import { watchNavigationUrl } from '../../core/src/index';
import { isUUID, mediaLabel, sanitizeContent, type MixedRecordV1, type QueueItem } from '../../core/src/media';
export const MIXED_KEY = 'yttv-desktop.mixed-workspace.v1';
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const unique = (rows: any[], key: string) => new Set(rows.map(r => r[key])).size === rows.length;
export function emptyMixed(uuid: () => string): MixedRecordV1 {
  return { version: 1, revision: 0, items: [], slots: Array.from({ length: 4 }, (_, order) => ({ id: uuid(), order, generation: 0, role: order === 0 ? 'original' : 'added' })), ownership: [], claims: [], receipts: [] };
}
function item(raw: any): QueueItem | undefined {
  const content = sanitizeContent(raw?.content);
  if (!content || !isUUID(raw.id) || typeof raw.label !== 'string' || !Number.isFinite(raw.createdAt) || raw.createdAt < 0 || (raw.preferredSlotId !== undefined && !isUUID(raw.preferredSlotId))) return;
  return { id: raw.id, content, label: mediaLabel(raw.label), createdAt: raw.createdAt, ...(raw.preferredSlotId ? { preferredSlotId: raw.preferredSlotId } : {}) };
}
export function inspectMixed(raw: any): { record?: MixedRecordV1; writable: boolean; error?: string } {
  const bad = { writable: false, error: 'Saved queue unavailable. The original record is preserved.' };
  try {
    if (!raw || raw.version !== 1 || !integer(raw.revision) || new TextEncoder().encode(JSON.stringify(raw)).length > 256 * 1024) return bad;
    for (const [key, limit] of [['items', 100], ['slots', 4], ['ownership', 4], ['claims', 4], ['receipts', 128]] as const) if (!Array.isArray(raw[key]) || raw[key].length > limit) return bad;
    if (!unique(raw.items, 'id') || !unique(raw.slots, 'id') || !unique(raw.slots, 'order') || !unique(raw.ownership, 'tabId') || !unique(raw.ownership, 'slotId') || !unique(raw.claims, 'slotId') || !unique(raw.claims.filter((c: any) => c.itemId !== undefined), 'itemId') || !unique(raw.claims, 'requestId') || !unique(raw.claims, 'operationId') || !unique(raw.receipts, 'requestId') || !unique(raw.receipts, 'itemId') || !unique(raw.receipts, 'operationId')) return bad;
    const slots = raw.slots.map((s: any) => {
      if (!isUUID(s.id) || !integer(s.order) || s.order > 3 || !integer(s.generation) || !['original', 'added'].includes(s.role) || (s.role === 'original') !== (s.order === 0)) throw Error();
      return { id: s.id, order: s.order, generation: s.generation, role: s.role };
    });
    const ownership = raw.ownership.map((o: any) => {
      if (!slots.some((s: any) => s.id === o.slotId) || !['yttv', 'youtube', 'prime-video', 'netflix'].includes(o.service) || !integer(o.tabId) || !integer(o.windowId) || typeof o.createdHere !== 'boolean' || typeof o.ordinaryUrl !== 'string') throw Error();
      if (/[\x00-\x20\x7f]|%2f|%5c|\\/i.test(o.ordinaryUrl)) throw Error();
      const u = new URL(o.ordinaryUrl === 'about:blank' ? 'https://tv.youtube.com/' : o.ordinaryUrl);
      const hosts = { yttv: 'tv.youtube.com', youtube: 'www.youtube.com', 'prime-video': 'www.primevideo.com', netflix: 'www.netflix.com' };
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || o.ordinaryUrl !== 'about:blank' && u.hostname !== hosts[o.service as keyof typeof hosts] || o.ordinaryUrl.length > 2048) throw Error();
      if (o.ordinaryUrl !== 'about:blank' && (o.service === 'yttv' ? !(watchNavigationUrl(o.ordinaryUrl) === o.ordinaryUrl || /^https:\/\/tv\.youtube\.com\/(live|library)?$/.test(o.ordinaryUrl)) : !sanitizeContent({ service: o.service, kind: o.service === 'youtube' ? 'video' : o.service === 'prime-video' ? 'detail' : u.pathname.split('/')[1], videoId: u.searchParams.get('v'), titleId: u.pathname.split('/')[2], url: o.ordinaryUrl }))) throw Error();
      return { slotId: o.slotId, service: o.service, tabId: o.tabId, windowId: o.windowId, ordinaryUrl: o.ordinaryUrl, createdHere: o.createdHere };
    });
    const items = raw.items.map(item).filter(Boolean) as QueueItem[];
    const claims = raw.claims.map((c: any) => {
      if (![c.operationId, c.requestId, c.slotId].every(isUUID) || (c.source === 'legacy' ? c.itemId !== undefined : !isUUID(c.itemId)) || (c.source !== undefined && c.source !== 'legacy') || !slots.some((s: any) => s.id === c.slotId && s.generation === c.generation) || (c.source !== 'legacy' && !items.some(i => i.id === c.itemId)) || !['claimed', 'resource-bound'].includes(c.phase)) throw Error();
      if (c.phase === 'resource-bound' ? !ownership.some((o: any) => o.slotId === c.slotId && o.tabId === c.tabId && o.windowId === c.windowId) : c.tabId !== undefined || c.windowId !== undefined || ownership.some((o: any) => o.slotId === c.slotId)) throw Error();
      return { operationId: c.operationId, requestId: c.requestId, ...(c.source === 'legacy' ? { source: 'legacy' as const } : { itemId: c.itemId }), slotId: c.slotId, generation: c.generation, phase: c.phase, ...(c.phase === 'resource-bound' ? { tabId: c.tabId, windowId: c.windowId } : {}) };
    });
    const receipts = raw.receipts.map((r: any) => {
      if (![r.operationId, r.requestId, r.itemId, r.slotId].every(isUUID) || !integer(r.generation) || !slots.some((s: any) => s.id === r.slotId && s.generation >= r.generation) || !Number.isFinite(r.committedAt) || r.committedAt < 0 || items.some(i => i.id === r.itemId) || claims.some((c: any) => c.requestId === r.requestId)) throw Error();
      return { requestId: r.requestId, operationId: r.operationId, itemId: r.itemId, slotId: r.slotId, generation: r.generation, committedAt: r.committedAt };
    });
    const record = { version: 1 as const, revision: raw.revision, items, slots, ownership, claims, receipts };
    return { record, writable: items.length === raw.items.length, ...(items.length !== raw.items.length ? { error: `${raw.items.length - items.length} saved items are damaged. Valid items are shown; the original record is preserved and edits are disabled.` } : {}) };
  } catch { return bad; }
}
export function createMixedStore(io: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }) {
  let state: ReturnType<typeof inspectMixed> = { writable: false, error: 'Loading queue.' };
  let writes: Promise<unknown> = Promise.resolve();
  return {
    get snapshot() { return structuredClone(state); },
    async load(migrate: () => Promise<MixedRecordV1>) {
      try {
        const raw = await io.get(MIXED_KEY);
        if (raw !== undefined) state = inspectMixed(raw);
        else { const record = await migrate(); if (!inspectMixed(record).writable) throw Error(); await io.set(MIXED_KEY, record); state = { record, writable: true }; }
      } catch { state = { writable: false, error: 'Queue storage could not be read or migrated. Existing records are preserved.' }; }
      return this.snapshot;
    },
    update(revision: number, change: (record: MixedRecordV1) => void): Promise<MixedRecordV1> {
      const next = writes.catch(() => undefined).then(async () => {
        if (!state.writable || !state.record) throw Error('STORAGE_UNAVAILABLE');
        if (state.record.revision !== revision) throw Error('STALE_QUEUE');
        const candidate = structuredClone(state.record); change(candidate); candidate.revision++;
        candidate.receipts = candidate.receipts.filter(r => r.committedAt >= Date.now() - 7 * 86400_000).slice(-128);
        const checked = inspectMixed(candidate); if (!checked.writable || !checked.record) throw Error('INVALID_QUEUE');
        try { await io.set(MIXED_KEY, checked.record); } catch { state.error = 'Queue changes could not be saved. Retry explicitly.'; throw Error('SAVE_FAILED'); }
        state = { record: checked.record, writable: true }; return structuredClone(checked.record);
      }); writes = next; return next;
    },
  };
}
