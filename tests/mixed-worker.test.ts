import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './helpers/viewing-worker';
import { MIXED_KEY } from '../packages/storage/src/media-queue';

const content = { service: 'yttv', kind: 'live-channel', channelId: 'yttv:cbs' } as const;
async function setup() {
  const h = await harness(); h.controls.nowOffset = 2000; await h.observe();
  h.tabs.set(99, { id: 99, windowId: 99, url: 'chrome-extension://test/remote.html' }); h.session['yttv-desktop.remote.v1'] = 99;
  h.start(); await h.observe();
  const sender = { id: 'test', url: 'chrome-extension://test/remote.html', tab: h.tabs.get(99) };
  const snapshot = async () => (await h.send({ type: 'GET_SNAPSHOT' })).mixed;
  const command = async (fields: any) => h.sendFrom({ type: 'QUEUE', intent: { requestId: randomUUID(), revision: (await snapshot()).record.revision, ...fields } }, sender);
  const add = async () => { assert.equal((await command({ action: 'enqueue', content, label: 'CBS' })).ok, true); return (await snapshot()).record.items.at(-1); };
  const settle = async () => { for (let i = 0; i < 12; i++) { await new Promise(r => setImmediate(r)); await snapshot(); } };
  return { ...h, sender, snapshot, command, add, settle };
}
async function launch(h: Awaited<ReturnType<typeof setup>>, slotIndex = 1) {
  const item = await h.add(), s = (await h.snapshot()).record.slots[slotIndex];
  const fields = { action: 'play', itemId: item.id, slotId: s.id, generation: s.generation };
  assert.equal((await h.command(fields)).ok, true); await h.settle(); return { item, slot: s, fields };
}
async function ready(h: Awaited<ReturnType<typeof setup>>, id = 2) {
  const raw = h.observation(id);
  await h.observe(id, raw); await h.settle();
}
test('remote queue -> muted slot -> durable consumption -> explicit replacement, with duplicate and stale command refusal', async () => {
  const h = await setup(); h.controls.playback = async () => ({ ok: true, value: { playing: true } });
  const { item, slot } = await launch(h);
  assert.equal(h.tabs.get(2).mutedInfo.muted, true);
  assert.equal(h.log.filter(x => x.type === 'playback').length, 0);
  assert.equal(h.local[MIXED_KEY].items[0].id, item.id);
  assert.equal(h.local[MIXED_KEY].claims[0].phase, 'resource-bound');
  const requestId = h.local[MIXED_KEY].claims[0].requestId;
  await ready(h);
  assert.equal(h.local[MIXED_KEY].items.length, 0); assert.equal(h.local[MIXED_KEY].receipts.length, 1);
  assert.equal(h.log.filter(x => x.type === 'playback').length, 1);
  assert.equal((await h.command({ action: 'play', requestId, itemId: item.id, slotId: slot.id, generation: 0, revision: 0 })).ok, true);
  await ready(h); assert.equal(h.log.filter(x => x.type === 'playback').length, 1);
  const replacement = await h.add(); const current = (await h.snapshot()).record.slots[1];
  assert.equal((await h.command({ action: 'play', itemId: replacement.id, slotId: current.id, generation: 0 })).code, 'STALE_QUEUE');
  assert.equal((await h.command({ action: 'play', itemId: replacement.id, slotId: current.id, generation: current.generation })).ok, true);
  await h.settle(); await ready(h);
  assert.equal(h.log.filter(x => x.type === 'create').length, 1); assert.equal(h.players.get(2).volume, .24);
  assert.equal(h.local[MIXED_KEY].receipts.length, 2);
});
test('rejected edit/claim/consumption writes never publish success, launch or native Play', async () => {
  const h = await setup(); const item = await h.add(); let r = (await h.snapshot()).record;
  h.controls.localFails = true;
  assert.equal((await h.command({ action: 'enqueue', content, label: 'duplicate' })).code, 'SAVE_FAILED');
  assert.equal((await h.snapshot()).record.items.length, 1);
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 })).code, 'SAVE_FAILED');
  assert.equal(h.log.filter(x => x.type === 'create').length, 0);
  h.controls.localFails = false;
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 })).ok, true); await h.settle();
  h.controls.localFails = true; await ready(h);
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.log.filter(x => x.type === 'playback').length, 0);
  h.controls.localFails = false; const before = h.log.length; h.start(); await h.send({ type: 'GET_SNAPSHOT' }); await ready(h);
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert(!h.log.slice(before).some(x => x.type === 'playback' || x.value?.url));
});
test('queue sender validation, unsupported provider intent, deliberate duplicates and simultaneous revision binding', async () => {
  const h = await setup(); let r = (await h.snapshot()).record;
  assert.equal((await h.send({ type: 'QUEUE', intent: { action: 'enqueue', requestId: randomUUID(), revision: r.revision, content, label: 'CBS' } })).code, 'INVALID_SENDER');
  await h.add(); await h.add(); r = (await h.snapshot()).record;
  const requests = r.items.map((item: any, i: number) => h.command({ action: 'play', revision: r.revision, itemId: item.id, slotId: r.slots[i + 1].id, generation: 0 }));
  const results = await Promise.all(requests); assert.equal(results.filter(x => x.ok).length, 1); assert.equal(results.find(x => !x.ok)?.code, 'STALE_QUEUE'); await h.settle();
  assert.equal(h.log.filter(x => x.type === 'create').length, 1);
  await h.command({ action: 'enqueue', content: { service: 'youtube', kind: 'video', videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' }, label: 'Later' });
  r = (await h.snapshot()).record;
  assert.equal((await h.command({ action: 'play', itemId: r.items.at(-1).id, slotId: r.slots[2].id, generation: 0 })).code, 'YOUTUBE_ACCESS_REQUIRED');
});
test('restart after committed consumption never repeats native Play or launch; changed content cannot consume', async () => {
  const h = await setup(); await launch(h); const raw = h.observation(2); raw.currentChannelId = 'different';
  await h.observe(2, raw); await h.settle(); assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.log.filter(x => x.type === 'playback').length, 0);
  const r = (await h.snapshot()).record;
  await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[1].id, generation: r.slots[1].generation }); await h.settle(); await ready(h);
  assert.equal(h.local[MIXED_KEY].items.length, 0); const before = h.log.length;
  h.start(); await h.send({ type: 'GET_SNAPSHOT' }); await ready(h);
  assert(!h.log.slice(before).some(x => x.type === 'create' || x.type === 'playback' || x.value?.url));
});

test('pending creation shares the four-player limit with New show/Connect; cancelled late callback only cleans its exact blank', async () => {
  const h = await setup();
  await h.send({ type: 'NEW_SHOW' }); await h.send({ type: 'NEW_SHOW' });
  const item = await h.add(); let r = (await h.snapshot()).record;
  let release!: () => void; h.controls.afterCreate = () => new Promise<void>(resolve => { release = resolve; });
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[3].id, generation: 0 })).ok, true);
  await h.settle();
  assert.equal(h.local[MIXED_KEY].claims[0].phase, 'claimed');
  assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'SESSION_BOUND');
  h.tabs.set(90, { id: 90, windowId: 90, url: 'https://tv.youtube.com/watch?v=other' });
  assert.equal((await h.send({ type: 'CONNECT_PANE', tabId: 90 })).code, 'SESSION_BOUND');
  r = (await h.snapshot()).record;
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[3].id, generation: r.slots[3].generation })).code, 'BUSY');
  assert.equal((await h.command({ action: 'remove', itemId: item.id })).ok, true);
  release(); await h.settle();
  assert.equal(h.tabs.has(4), false); assert.equal(h.tabs.has(90), true);
  assert.equal(h.local[MIXED_KEY].claims.length, 0); assert.equal(h.local[MIXED_KEY].items.length, 0);
  assert(!h.log.some(x => x.id === 4 && (x.value?.url || x.type === 'playback')));
});
test('ownership-save failure and failed cleanup retain uncertainty across worker interruption', async () => {
  const h = await setup(); const item = await h.add(); let r = (await h.snapshot()).record;
  h.controls.afterCreate = async () => { h.controls.localFails = true; h.controls.removeFails = true; };
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 })).ok, true); await h.settle();
  assert.equal(h.tabs.get(2).url, 'about:blank'); assert.equal(h.local[MIXED_KEY].claims[0].phase, 'claimed');
  h.controls.localFails = false; h.controls.afterCreate = undefined;
  const before = h.log.length; h.start(); await h.send({ type: 'GET_SNAPSHOT' });
  r = (await h.snapshot()).record;
  assert.equal(r.claims[0].phase, 'claimed'); assert.equal(r.ownership.length, 1);
  assert(!h.log.slice(before).some(x => x.type === 'create' || x.type === 'playback' || x.value?.url));
  assert.match((await h.snapshot()).states[r.slots[1].id], /Interrupted opening/);
  assert.equal((await h.send({ type: 'SELECT_PANE', paneId: 'main' })).code, 'STORAGE_UNAVAILABLE');
});
test('restart in the create-to-binding gap holds reservation and never scans/adopts the blank resource', async () => {
  const h = await setup(); const item = await h.add(); const r = (await h.snapshot()).record;
  h.controls.afterCreate = () => new Promise<void>(() => {});
  await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 }); await h.settle();
  assert(h.tabs.has(2)); assert.equal(h.local[MIXED_KEY].ownership.length, 1);
  const before = h.log.length; h.start(); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.mixed.record.claims.length, 1); assert.equal(state.panes.length, 1);
  assert(!h.log.slice(before).some(x => x.type === 'create' || x.type === 'playback' || x.value?.url));
  assert.equal(h.tabs.get(2).url, 'about:blank');
});

test('fresh guide, unique player and current document are required; closure retains the item without auto advancement', async () => {
  const h = await setup(); const item = await h.add(); let r = (await h.snapshot()).record;
  h.controls.nowOffset = 31 * 60_000;
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 })).code, 'TARGET_UNAVAILABLE');
  h.controls.nowOffset = 2000;
  await h.command({ action: 'play', itemId: item.id, slotId: r.slots[1].id, generation: 0 }); await h.settle();
  h.players.get(2).unique = false; await ready(h);
  assert.equal(h.local[MIXED_KEY].items.length, 1);
  h.players.get(2).unique = true;
  await h.sendFrom({ type: 'OBSERVE', playerKey: h.players.get(2).key, observation: h.observation(2) }, { id: 'test', url: h.tabs.get(2).url, tab: h.tabs.get(2), documentId: 'old-document', frameId: 0 });
  await h.settle(); assert.equal(h.local[MIXED_KEY].items.length, 1);
  await h.remove(2); await h.settle(); r = (await h.snapshot()).record;
  assert.equal(r.items.length, 1); assert.equal(r.claims.length, 0); assert.equal(r.ownership.length, 1);
  assert.equal(h.log.filter(x => x.type === 'create').length, 1); assert.equal(h.log.filter(x => x.type === 'playback').length, 0);
});
test('four occupied slots replace the named player without a fifth creation and preserve the original', async () => {
  const h = await setup();
  for (let i = 0; i < 3; i++) assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true);
  const original = structuredClone(h.tabs.get(1)); const item = await h.add(), r = (await h.snapshot()).record;
  assert.equal(r.ownership.length, 4);
  const owner = r.ownership.find((o: any) => o.slotId === r.slots[2].id);
  await h.command({ action: 'play', itemId: item.id, slotId: r.slots[2].id, generation: r.slots[2].generation }); await h.settle(); await ready(h, owner.tabId);
  assert.equal(h.log.filter(x => x.type === 'create').length, 3);
  assert.equal(h.local[MIXED_KEY].receipts.length, 1); assert.deepEqual(h.tabs.get(1), original);
  assert.equal(h.local[MIXED_KEY].ownership.find((o: any) => o.slotId === r.slots[2].id).tabId, owner.tabId);
});
test('additive migration preserves existing preference, layout and recovery keys', async () => {
  const h = await setup(); await h.send({ type: 'NEW_SHOW' });
  delete h.local[MIXED_KEY]; h.local['yttv-desktop.workspace-layout.v1'] = { version: 1, mode: 'auto' };
  const before = structuredClone(h.local); h.start(); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.mixed.writable, true); assert.equal(state.mixed.record.ownership.length, 2);
  for (const key of Object.keys(before)) assert.deepEqual(h.local[key], before[key], key);
  assert.equal(state.mixed.record.slots.find((s: any) => s.id === state.mixed.record.ownership.find((o: any) => o.tabId === 1).slotId).role, 'original');
});

test('legacy New show persists its reservation before creation and binding before navigation', async () => {
  const h = await setup(); let sawClaim = false;
  h.controls.afterCreate = async () => {
    sawClaim = h.local[MIXED_KEY].claims.some((c: any) => c.source === 'legacy' && c.phase === 'claimed');
    h.controls.localFails = true; h.controls.removeFails = true;
  };
  assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, false); assert(sawClaim);
  assert.equal(h.tabs.get(2).url, 'about:blank'); assert.equal(h.local[MIXED_KEY].claims[0].source, 'legacy');
  h.controls.localFails = false; const boundary = h.log.length; h.start(); await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(h.local[MIXED_KEY].claims.length, 1);
  assert(!h.log.slice(boundary).some(x => x.value?.url || x.type === 'create' || x.type === 'playback'));
});
test('failed reservation and Connect writes cannot create or publish an enrollment', async () => {
  const h = await setup(); h.controls.localFails = true;
  assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'SAVE_FAILED');
  h.tabs.set(90, { id: 90, windowId: 90, url: 'https://tv.youtube.com/watch?v=native' });
  assert.equal((await h.send({ type: 'CONNECT_PANE', tabId: 90 })).code, 'SAVE_FAILED');
  assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).panes.length, 1);
  assert.equal(h.log.filter(x => x.type === 'create').length, 0);
});
