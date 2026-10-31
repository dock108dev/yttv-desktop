import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { harness } from './helpers/viewing-worker';
import { MIXED_KEY } from '../packages/storage/src/media-queue';
const content = { service: 'youtube', kind: 'video', videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' } as const;
async function setup(empty = false) {
  const h = await harness(); if (empty) h.tabs.delete(1); h.controls.youtubePermission = true; h.controls.nowOffset = 2000;
  h.tabs.set(99, { id: 99, windowId: 99, url: 'chrome-extension://test/remote.html' }); h.session['yttv-desktop.remote.v1'] = 99; h.start();
  if (!empty) await h.observe();
  const sender = { id: 'test', url: 'chrome-extension://test/remote.html', tab: h.tabs.get(99) };
  const snapshot = async () => (await h.send({ type: 'GET_SNAPSHOT' })).mixed;
  const command = async (fields: any) => h.sendFrom({ type: 'QUEUE', intent: { requestId: randomUUID(), revision: (await snapshot()).record.revision, ...fields } }, sender);
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
  const launch = async (slotIndex = empty ? 0 : 1, ref: any = content) => {
    assert.equal((await command({ action: 'enqueue', content: ref, label: ref.service })).ok, true);
    const r = (await snapshot()).record, slot = r.slots[slotIndex];
    assert.equal((await command({ action: 'play', itemId: r.items.at(-1).id, slotId: slot.id, generation: slot.generation })).ok, true);
    await settle(); return h.local[MIXED_KEY].ownership.find((o: any) => o.slotId === slot.id)?.tabId;
  };
  return { ...h, sender, snapshot, command, settle, launch };
}
test('YouTube starts empty, commits only matching readiness and makes one Play request; restart is read-only', async () => {
  const h = await setup(true), id = await h.launch(); assert.equal(id, 2);
  assert.equal(h.local[MIXED_KEY].ownership[0].service, 'youtube'); assert.equal(h.local[MIXED_KEY].items.length, 1);
  assert.equal(h.tabs.get(id).mutedInfo.muted, true); assert.equal(h.log.filter(x => x.type === 'youtube-control').length, 0);
  await h.youtubeChanged(id); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 0); assert.equal(h.local[MIXED_KEY].receipts.length, 1);
  assert.equal(h.log.filter(x => x.type === 'youtube-control' && x.command.type === 'play').length, 1);
  const boundary = h.log.length; h.start(); await h.snapshot(); await h.youtubeChanged(id); await h.settle();
  assert(!h.log.slice(boundary).some(x => x.type === 'youtube-control' || x.type === 'create' || x.type === 'player' || x.type === 'tab'));
  assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).panes[0].service, 'youtube');
});
test('mixed and repeated YouTube players share four slots, and cross-provider replacement reuses the same tab', async () => {
  const h = await setup();
  for (const index of [1, 2, 3]) { const id = await h.launch(index); await h.youtubeChanged(id); await h.settle(); }
  assert.equal(h.local[MIXED_KEY].ownership.length, 4); assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'SESSION_BOUND');
  const prior = h.local[MIXED_KEY].ownership.find((o: any) => o.slotId === h.local[MIXED_KEY].slots[2].id);
  const id = await h.launch(2, { service: 'yttv', kind: 'live-channel', channelId: 'yttv:cbs' }); assert.equal(id, prior.tabId);
  await h.observe(id); await h.settle(); assert.equal(h.local[MIXED_KEY].items.length, 0);
  assert.equal(h.local[MIXED_KEY].ownership.find((o: any) => o.tabId === id).service, 'yttv');
  assert.equal(await h.launch(2), id); await h.youtubeChanged(id); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 0); assert.equal(h.log.filter(x => x.type === 'create').length, 3);
  assert.equal(h.tabs.get(1).url, 'https://tv.youtube.com/watch?v=main');
});
test('Connect is explicit, preserves audio and works in an empty workspace', async () => {
  const h = await setup(true); h.tabs.set(80, { id: 80, windowId: 80, url: content.url, mutedInfo: { muted: false } }); h.players.set(80, { key: 'p80', documentId: 'd80', readyState: 4, muted: false, volume: .6 });
  assert.equal((await h.send({ type: 'CONNECT_YOUTUBE', tabId: 80 })).ok, false);
  assert.equal((await h.sendFrom({ type: 'CONNECT_YOUTUBE', tabId: 80 }, h.sender)).ok, true);
  assert.equal(h.local[MIXED_KEY].ownership[0].createdHere, false); assert.equal(h.players.get(80).volume, .6); assert.equal(h.players.get(80).muted, false);
  assert(!h.log.some(x => x.type === 'youtube-control' || x.type === 'tab'));
  assert(h.log.filter(x => x.type === 'inject').every(x => x.request.target.frameIds.length === 1 && x.request.target.frameIds[0] === 0 && x.request.files[0] === 'youtube-content.js'));
});
test('ads, wrong sender/document/service and changed player cannot consume a queue item', async () => {
  const h = await setup(), id = await h.launch();
  for (const override of [{ frameId: 1 }, { documentId: 'stale' }, { url: 'https://tv.youtube.com/watch?v=main' }, { id: 'other' }, { tab: { id: 1, windowId: 1 } }]) await h.youtubeChanged(id, override);
  assert.equal(h.local[MIXED_KEY].items.length, 1);
  h.players.get(id).kind = 'ad'; await h.youtubeChanged(id); assert.equal(h.local[MIXED_KEY].items.length, 1);
  h.players.get(id).kind = 'vod'; h.players.get(id).key = 'replaced'; await h.youtubeChanged(id); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.log.filter(x => x.type === 'youtube-control').length, 0);
});
test('denial and revocation retain intent and resources, disable controls and leave YouTube TV available', async () => {
  const h = await setup(); h.controls.youtubePermission = false;
  await h.command({ action: 'enqueue', content, label: 'YouTube' }); let r = (await h.snapshot()).record;
  assert.equal((await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[1].id, generation: 0 })).code, 'YOUTUBE_ACCESS_REQUIRED'); assert.equal(h.log.filter(x => x.type === 'create').length, 0);
  h.controls.youtubePermission = true; await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[1].id, generation: 0 }); await h.settle();
  h.revokeYouTube(); await h.settle(); await h.youtubeChanged(2); r = (await h.snapshot()).record;
  assert.equal(r.items.length, 1); assert.equal(r.ownership.length, 2);
  const state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.find((p: any) => p.tabId === 2).providerCapabilities, null);
  assert.equal((await h.send({ type: 'PLAYBACK', paneId: state.panes.find((p: any) => p.tabId === 2).id, playing: true })).ok, false);
  assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true);
});
test('save failure retains launch and retry reuses resource; native navigation never consumes another video', async () => {
  const h = await setup(), id = await h.launch(); h.controls.localFails = true; await h.youtubeChanged(id); await h.settle(); h.controls.localFails = false;
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.log.filter(x => x.type === 'youtube-control').length, 0);
  const r = (await h.snapshot()).record; await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[1].id, generation: r.slots[1].generation }); await h.settle();
  h.tabs.get(id).url = 'https://www.youtube.com/watch?v=lmnopqrstuv'; h.updated(id, { url: h.tabs.get(id).url }, h.tabs.get(id)); await h.youtubeChanged(id); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.log.filter(x => x.type === 'create').length, 1);
});
test('mixed audio handoff requires every native mute readback; explicit volume keeps mute', async () => {
  const h = await setup(), id = await h.launch(); await h.youtubeChanged(id); await h.settle();
  const state = await h.send({ type: 'GET_SNAPSHOT' }), pane = state.panes.find((p: any) => p.tabId === id);
  assert.equal((await h.send({ type: 'AUDIO', paneId: pane.id, volume: .42 })).ok, true); assert.equal(h.players.get(id).muted, true);
  assert.equal((await h.send({ type: 'AUDIO', paneId: pane.id, muted: false })).ok, true); assert.equal(h.players.get(1).muted, true); assert.equal(h.tabs.get(1).mutedInfo.muted, true); assert.equal(h.players.get(id).volume, .42);
  h.players.get(id).key = 'changed'; assert.equal((await h.send({ type: 'SELECT_PANE', paneId: 'main' })).ok, false); assert.equal(h.tabs.get(1).mutedInfo.muted, true);
});
test('permission audit rejects widened hosts, scripts, frames, CSP and additional access', async () => {
  const { auditManifest } = await import(new URL('../scripts/permission-audit.mjs', import.meta.url).href);
  const manifest = JSON.parse(await readFile('apps/chrome-extension/manifest.json', 'utf8')); auditManifest(manifest);
  for (const change of [(m: any) => m.permissions.push('tabs'), (m: any) => m.optional_permissions.push('activeTab'), (m: any) => m.optional_host_permissions.push('https://youtu.be/*'), (m: any) => m.host_permissions.push('<all_urls>'), (m: any) => m.content_scripts[0].all_frames = true, (m: any) => m.content_scripts[0].js.push('youtube-content.js'), (m: any) => m.content_scripts[0].matches.push('https://www.youtube.com/*'), (m: any) => m.content_security_policy.extension_pages += " https://example.com", (m: any) => m.web_accessible_resources = []]) { const m = structuredClone(manifest); change(m); assert.throws(() => auditManifest(m)); }
});

test('original Return lineage survives YouTube TV → YouTube replacement and explicit placement never changes audio', async () => {
  const h = await setup();
  h.tabs.get(1).index = 1; h.tabs.get(1).pinned = false;
  assert.equal((await h.send({ type: 'START_WORKSPACE' })).ok, true);
  const origin = structuredClone(h.session['yttv-desktop.main-return.v1']);
  const originalWindow = h.tabs.get(1).windowId;
  const id = await h.launch(0); assert.equal(id, 1); await h.youtubeChanged(id); await h.settle();
  assert.equal(h.tabs.get(1).windowId, originalWindow);
  assert.deepEqual(h.session['yttv-desktop.main-return.v1'], origin);
  const before = h.log.length;
  const result = await h.send({ type: 'RETURN_MAIN' }); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.tabs.get(1).windowId, 1); assert.equal(h.players.get(1).volume, 1);
  assert(!h.log.slice(before).some(x => x.type === 'youtube-control' || x.type === 'player' || x.value?.url || x.value?.muted !== undefined));
  assert.equal(h.local[MIXED_KEY].ownership.find((o: any) => o.tabId === 1).windowId, 1);
  assert.equal(h.local[MIXED_KEY].ownership.find((o: any) => o.tabId === 1).service, 'youtube');
  assert.equal(origin.windowId, 1); assert.equal(origin.tabId, 1);
  assert.equal(h.session['yttv-desktop.main-return.v1'], null);
});
test('YouTube pending creation retains shared capacity across a worker restart and permission loss', async () => {
  const h = await setup();
  for (const i of [1, 2]) { const id = await h.launch(i); await h.youtubeChanged(id); await h.settle(); }
  h.controls.afterCreate = () => new Promise<void>(() => {});
  await h.launch(3); assert.equal(h.local[MIXED_KEY].claims[0].phase, 'claimed');
  const before = h.log.length; h.start(); await h.snapshot(); h.revokeYouTube(); await h.settle();
  assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'SESSION_BOUND');
  assert.equal(h.local[MIXED_KEY].claims[0].phase, 'claimed');
  assert(!h.log.slice(before).some(x => x.type === 'create' || x.type === 'youtube-control' || x.value?.url || x.value?.muted !== undefined));
});
test('restored permission requires explicit Connect and reinjects only the owned top frame', async () => {
  const h = await setup(), id = await h.launch(); await h.youtubeChanged(id); await h.settle();
  h.revokeYouTube(); await h.settle(); h.controls.youtubePermission = true;
  const before = h.log.length; await h.snapshot(); assert(!h.log.slice(before).some(x => x.type === 'inject'));
  assert.equal((await h.sendFrom({ type: 'CONNECT_YOUTUBE', tabId: id }, h.sender)).ok, true);
  assert(h.log.slice(before).some(x => x.type === 'inject' && x.request.target.tabId === id && x.request.target.frameIds[0] === 0));
  assert(!h.log.slice(before).some(x => x.type === 'youtube-control' || x.value?.url || x.value?.muted !== undefined));
});

test('revocation during an unbound opening cancels navigation and late cleanup cannot consume the item', async () => {
  const h = await setup(); let release!: () => void;
  h.controls.afterCreate = () => new Promise<void>(resolve => { release = resolve; });
  await h.launch(); h.revokeYouTube(); await h.settle(); release(); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.tabs.has(2), false);
  assert(!h.log.some(x => x.id === 2 && (x.value?.url || x.type === 'youtube-control')));
});
test('replacement restores captured volume, and a failed consumption retry commits once without another window', async () => {
  const h = await setup(); h.players.get(1).volume = .61;
  const id = await h.launch(0); h.players.get(id).volume = 1;
  h.controls.localFails = true; await h.youtubeChanged(id); await h.settle();
  assert.equal(h.players.get(id).volume, .61); assert.equal(h.local[MIXED_KEY].items.length, 1);
  h.controls.localFails = false; const r = (await h.snapshot()).record;
  await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[0].id, generation: r.slots[0].generation }); await h.settle(); await h.youtubeChanged(id); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 0); assert.equal(h.local[MIXED_KEY].receipts.length, 1);
  assert.equal(h.log.filter(x => x.type === 'create').length, 0);
  assert.equal(h.log.filter(x => x.type === 'youtube-control' && x.command.type === 'play').length, 1);
});

test('late replies from a superseded connection cannot revoke its replacement', async () => {
  const { createYouTubeConnection } = await import('../apps/chrome-extension/src/youtube');
  let release!: (value: any) => void, late: any, hold = false, serial = 0; const revoked: number[] = [];
  let active: any;
  const api = { permissions: { contains: async () => true }, scripting: { executeScript: async () => [{ frameId: 0, documentId: 'doc' }] }, tabs: {
    get: async () => ({ id: 1, windowId: 1, url: content.url }),
    sendMessage: async (_id: number, m: any) => {
      if (m.type === 'bind') active = m;
      const raw = { nonce: active.nonce, result: { status: 'ok', value: { binding: { ...active.binding, playerKey: 'native' }, content, observedAt: Date.now(), sequence: ++serial } } };
      if (hold && m.type === 'observe') { late = raw; return new Promise(resolve => { release = resolve; }); }
      return raw;
    },
  } } as unknown as typeof chrome;
  const connection = createYouTubeConnection(api, id => revoked.push(id));
  const b = { service: 'youtube' as const, tabId: 1, windowId: 1, documentId: '', playerKey: '', slotId: 'slot', generation: 1, workerEpoch: 'epoch' };
  await connection.connect(b, content.url); hold = true;
  const pending = connection.observe(1); while (!release) await new Promise(r => setImmediate(r));
  await connection.connect({ ...b, generation: 2 }, content.url); release(late); await pending;
  assert.equal(connection.get(1)?.binding.generation, 2); assert.equal(revoked.length, 0);
});
