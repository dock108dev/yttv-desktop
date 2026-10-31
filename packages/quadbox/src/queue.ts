import type { MixedRecordV1, QueueIntent } from '../../core/src/media';
import { mediaLabel, sanitizeContent } from '../../core/src/media';
/** Bound claims count with ownership once; unknown creation always consumes capacity. */
export function mixedCapacity(record: MixedRecordV1 | undefined, liveTabs: number[], pending = 0): number {
  return new Set([...liveTabs, ...(record?.ownership.map(o => o.tabId) ?? [])]).size + pending + (record?.claims.filter(c => c.phase === 'claimed' && !record.ownership.some(o => o.slotId === c.slotId)).length ?? 0);
}
export function editQueue(record: MixedRecordV1, intent: QueueIntent, uuid: () => string, now: number) {
  if (intent.action === 'enqueue') {
    if (record.items.length >= 100) throw Error('QUEUE_FULL');
    const content = sanitizeContent(intent.content); if (!content) throw Error('INVALID_CONTENT');
    record.items.push({ id: uuid(), content, label: mediaLabel(intent.label), createdAt: now }); return;
  }
  if (!('itemId' in intent)) throw Error('INVALID_COMMAND');
  const index = record.items.findIndex(i => i.id === intent.itemId); if (index < 0) throw Error('ITEM_MISSING');
  if (record.claims.some(c => c.itemId === intent.itemId)) throw Error('CANCEL_FIRST');
  if (intent.action === 'remove') record.items.splice(index, 1);
  else if (intent.action === 'edit') {
    const content = sanitizeContent(intent.content); if (!content) throw Error('INVALID_CONTENT');
    Object.assign(record.items[index], { content, label: mediaLabel(intent.label) });
  } else if (intent.action === 'move') {
    const waiting = record.items.map((item, index) => ({ item, index })).filter(({ item }) => !record.claims.some(c => c.itemId === item.id));
    const destination = waiting[waiting.findIndex(row => row.index === index) + intent.offset]?.index;
    if (destination === undefined) throw Error('QUEUE_POSITION');
    [record.items[index], record.items[destination]] = [record.items[destination], record.items[index]];
  } else throw Error('INVALID_COMMAND');
}
export function consumeQueue(record: MixedRecordV1, operationId: string, now: number) {
  const claim = record.claims.find(c => c.operationId === operationId);
  if (!claim || !claim.itemId || claim.phase !== 'resource-bound' || !record.items.some(i => i.id === claim.itemId)) throw Error('SUPERSEDED');
  record.items = record.items.filter(i => i.id !== claim.itemId); record.claims = record.claims.filter(c => c !== claim);
  record.receipts.push({ requestId: claim.requestId, operationId, itemId: claim.itemId, slotId: claim.slotId, generation: claim.generation, committedAt: now });
}
