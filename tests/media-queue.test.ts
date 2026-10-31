import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { recognizeContent, type QueueIntent } from '../packages/core/src/media';
import { createMixedStore, emptyMixed, inspectMixed, MIXED_KEY } from '../packages/storage/src/media-queue';
import { consumeQueue, editQueue, mixedCapacity } from '../packages/quadbox/src/queue';
import { validQueueIntent } from '../apps/chrome-extension/src/mixed-workspace';

const content = { service: 'yttv', kind: 'live-channel', channelId: 'yttv:cbs' } as const;
function enqueue(revision: number): QueueIntent { return { action: 'enqueue', requestId: randomUUID(), revision, content, label: 'CBS' }; }
test('ordinary content URLs canonicalize locally and reject authority, query and route confusion', () => {
  const accepted = [
    ['https://youtu.be/abcdefghijk?si=share', 'https://www.youtube.com/watch?v=abcdefghijk'],
    ['https://www.youtube.com/watch?v=abcdefghijk&feature=share', 'https://www.youtube.com/watch?v=abcdefghijk'],
    ['https://www.netflix.com/watch/123?trackId=1', 'https://www.netflix.com/watch/123'],
    ['https://www.primevideo.com/detail/ABC123', 'https://www.primevideo.com/detail/ABC123'],
  ];
  for (const [input, expected] of accepted) { const r = recognizeContent(input); assert.equal(r.status, 'ok'); if (r.status === 'ok') assert.equal('url' in r.value && r.value.url, expected); }
  for (const bad of ['http://youtu.be/abcdefghijk', 'https://www.youtube.com:443/watch?v=abcdefghijk', 'https://a@www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk#', 'https://www.youtube.com/watch?v=abcdefghijk&v=abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&token=secret', 'https://www.youtube.com/shorts/abcdefghijk', 'https://youtu.be/a%2fb', 'https://www.netflix.com/title/1?other=x', 'https://www.primevideo.com/detail/ABC?si=x', 'https://tv.youtube.com/watch?v=cbs', 'https://www.youtube.com/watch?v=abcdefghijk\n']) assert.equal(recognizeContent(bad).status, 'failure', bad);
});
test('storage preserves damaged/future/oversized envelopes and exposes valid items without authorizing writes', async () => {
  const r = emptyMixed(randomUUID); editQueue(r, enqueue(0), randomUUID, Date.now());
  const bad = structuredClone(r); bad.items.push({ ...bad.items[0], id: randomUUID(), content: {} as any });
  let writes = 0; const original = JSON.stringify(bad);
  const store = createMixedStore({ get: async () => bad, set: async () => { writes++; } });
  const state = await store.load(async () => { throw Error('migration forbidden'); });
  assert.equal(state.writable, false); assert.equal(state.record?.items.length, 1);
  await assert.rejects(store.update(0, r => { r.items = []; })); assert.equal(writes, 0); assert.equal(JSON.stringify(bad), original);
  assert.equal(inspectMixed({ ...r, version: 2 }).writable, false);
  assert.equal(inspectMixed({ ...r, extra: 'x'.repeat(256 * 1024) }).writable, false);
  assert.equal(inspectMixed({ ...r, slots: [r.slots[0], r.slots[0]] }).writable, false);
});
test('serialized revisions await persistence; deliberate duplicates, limits and failed consumption retain intent', async () => {
  let value: any; let fail = false;
  const store = createMixedStore({ get: async () => value, set: async (_k, v) => { if (fail) throw Error(); value = structuredClone(v); } });
  await store.load(async () => emptyMixed(randomUUID));
  const results = await Promise.allSettled([store.update(0, r => editQueue(r, enqueue(0), randomUUID, Date.now())), store.update(0, r => editQueue(r, enqueue(0), randomUUID, Date.now()))]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected']);
  await store.update(1, r => editQueue(r, enqueue(1), randomUUID, Date.now()));
  assert.equal(store.snapshot.record!.items.length, 2);
  const before = structuredClone(store.snapshot.record); fail = true;
  await assert.rejects(store.update(2, r => editQueue(r, enqueue(2), randomUUID, Date.now()))); assert.deepEqual(store.snapshot.record, before);
  fail = false;
  await store.update(2, r => { while (r.items.length < 100) editQueue(r, enqueue(2), randomUUID, Date.now()); });
  await assert.rejects(store.update(3, r => editQueue(r, enqueue(3), randomUUID, Date.now())), /QUEUE_FULL/);
  const op = randomUUID();
  await store.update(3, r => {
    const s = r.slots[0]; r.ownership.push({ slotId: s.id, service: 'yttv', tabId: 1, windowId: 1, ordinaryUrl: 'about:blank', createdHere: true });
    r.claims.push({ operationId: op, requestId: randomUUID(), itemId: r.items[0].id, slotId: s.id, generation: 0, phase: 'resource-bound', tabId: 1, windowId: 1 });
  });
  fail = true; await assert.rejects(store.update(4, r => consumeQueue(r, op, Date.now()))); assert.equal(store.snapshot.record!.items.length, 100); assert.equal(store.snapshot.record!.receipts.length, 0);
  fail = false; await store.update(4, r => consumeQueue(r, op, Date.now())); assert.equal(store.snapshot.record!.items.length, 99); assert.equal(store.snapshot.record!.receipts.length, 1);
  await assert.rejects(store.update(5, r => consumeQueue(r, op, Date.now())), /SUPERSEDED/);
});
test('failed reads and failed additive migrations never write defaults or legacy keys', async () => {
  for (const mode of ['read', 'migration', 'save']) {
    const keys: string[] = [];
    const store = createMixedStore({ get: async () => { if (mode === 'read') throw Error(); return undefined; }, set: async key => { keys.push(key); throw Error(); } });
    assert.equal((await store.load(async () => { if (mode === 'migration') throw Error(); return emptyMixed(randomUUID); })).writable, false);
    assert.deepEqual(keys, mode === 'save' ? [MIXED_KEY] : []);
  }
});
test('capacity deduplicates bound claims but retains uncertainty; IPC rejects unbound or extra authority', () => {
  const r = emptyMixed(randomUUID); editQueue(r, enqueue(0), randomUUID, Date.now());
  const slot = r.slots[1];
  r.claims.push({ operationId: randomUUID(), requestId: randomUUID(), itemId: r.items[0].id, slotId: slot.id, generation: 0, phase: 'claimed' });
  assert.equal(mixedCapacity(r, [1, 2, 3]), 4);
  r.ownership.push({ slotId: slot.id, service: 'yttv', tabId: 2, windowId: 2, ordinaryUrl: 'about:blank', createdHere: true });
  Object.assign(r.claims[0], { phase: 'resource-bound', tabId: 2, windowId: 2 });
  assert.equal(mixedCapacity(r, [1, 2, 3]), 3); assert.equal(mixedCapacity(r, [1, 2, 3], 1), 4);
  const intent = enqueue(0); assert(validQueueIntent(intent)); assert(!validQueueIntent({ ...intent, tabId: 100 })); assert(!validQueueIntent({ ...intent, requestId: 'short' }));
});
