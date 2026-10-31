import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { harness } from './helpers/viewing-worker';
import { MIXED_KEY } from '../packages/storage/src/media-queue';
import { createNetflixConnection } from '../apps/chrome-extension/src/netflix';
const content = { service: 'netflix', kind: 'watch', titleId: '12345', url: 'https://www.netflix.com/watch/12345' } as const;
async function setup(empty = false) {
  const h = await harness(); if (empty) h.tabs.delete(1); h.controls.youtubePermission = true; h.controls.netflixPermission = true; h.controls.nowOffset = 2000;
  h.tabs.set(99, { id: 99, windowId: 99, url: 'chrome-extension://test/remote.html' }); h.session['yttv-desktop.remote.v1'] = 99; h.start(); if (!empty) await h.observe();
  const sender = { id: 'test', url: 'chrome-extension://test/remote.html', tab: h.tabs.get(99) };
  const snapshot = async () => (await h.send({ type: 'GET_SNAPSHOT' })).mixed;
  const command = async (fields: any) => h.sendFrom({ type: 'QUEUE', intent: { requestId: randomUUID(), revision: (await snapshot()).record.revision, ...fields } }, sender);
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
  const launch = async (slotIndex = empty ? 0 : 1, ref: any = content) => {
    assert.equal((await command({ action: 'enqueue', content: ref, label: ref.service })).ok, true);
    const r = (await snapshot()).record, slot = r.slots[slotIndex];
    const result = await command({ action: 'play', itemId: r.items.at(-1).id, slotId: slot.id, generation: slot.generation });
    await settle(); return { result, id: h.local[MIXED_KEY].ownership.find((o: any) => o.slotId === slot.id)?.tabId, slot };
  };
  return { ...h, sender, snapshot, command, settle, launch };
}
test('Netflix starts empty muted, retains intent/claim and reports attention; restart performs no launch, consumption or audio writes', async () => {
  const h = await setup(true), { result, id, slot } = await h.launch(); assert(result.ok); assert.equal(id, 2);
  assert.equal(h.tabs.get(id).mutedInfo.muted, true); assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.local[MIXED_KEY].claims.length, 1);
  assert.match((await h.snapshot()).states[slot.id], /identity unverified/);
  const injection = h.log.find(x => x.type === 'inject'); assert.deepEqual(JSON.parse(JSON.stringify(injection.request)), { target: { tabId: id, frameIds: [0] }, files: ['netflix-content.js'] });
  const before = h.log.length; h.start(); await h.snapshot(); await h.settle();
  assert.equal(h.local[MIXED_KEY].items.length, 1); assert.equal(h.local[MIXED_KEY].receipts.length, 0);
  assert(!h.log.slice(before).some(x => x.type === 'create' || x.type.includes('control') || x.type === 'player' || x.value?.url || x.value?.muted !== undefined));
});
test('denial, save failure and explicit Connect cannot consume or adopt an unverified Netflix player', async () => {
  const h = await setup(); h.controls.netflixPermission = false; assert.equal((await h.launch()).result.code, 'NETFLIX_ACCESS_REQUIRED'); assert(!h.log.some(x => x.type === 'create'));
  h.controls.netflixPermission = true; h.controls.localFails = true;
  const r = (await h.snapshot()).record; assert.equal((await h.command({ action: 'play', itemId: r.items[0].id, slotId: r.slots[1].id, generation: 0 })).code, 'SAVE_FAILED');
  h.controls.localFails = false; h.tabs.set(50, { id: 50, windowId: 50, url: content.url });
  assert.equal((await h.sendFrom({ type: 'CONNECT_NETFLIX', tabId: 50 }, h.sender)).code, 'MAIN_CONTENT_IDENTITY_UNVERIFIED');
  h.tabs.get(50).url = 'https://www.amazon.com/watch/12345'; assert.equal((await h.sendFrom({ type: 'CONNECT_NETFLIX', tabId: 50 }, h.sender)).code, 'UNSUPPORTED_URL');
  assert.equal(h.local[MIXED_KEY].ownership.length, 1); assert(!h.log.some(x => x.type === 'inject' || x.type === 'create'));
});
test('YouTube TV, YouTube and Netflix share four slots; replacement into Netflix reuses a tab and unknown Netflix audio blocks replacing out', async () => {
  const h = await setup(); const prime = await h.launch(1);
  const youtube = await h.launch(2, { service: 'youtube', kind: 'video', videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' }); await h.youtubeChanged(youtube.id); await h.settle();
  await h.launch(3); assert.equal(h.local[MIXED_KEY].ownership.length, 4); assert.equal(h.log.filter(x => x.type === 'create').length, 3);
  // Unknown native volume cannot be overwritten using stale previous-provider choices.
  const replaced = await h.launch(1, { service: 'youtube', kind: 'video', videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' }); assert.equal(replaced.result.code, 'NETFLIX_IDENTITY_UNVERIFIED'); assert.equal(replaced.id, prime.id);
  const back = await h.launch(2); assert(back.result.ok); assert.equal(back.id, youtube.id); assert.equal(h.log.filter(x => x.type === 'create').length, 3);
  const r = (await h.snapshot()).record, item = r.items.at(-1), slot = r.slots[2];
  assert.equal((await h.command({ action: 'play', itemId: item.id, slotId: slot.id, generation: slot.generation })).code, 'NETFLIX_IDENTITY_UNVERIFIED'); await h.settle();
  assert.equal(h.log.filter(x => x.type === 'create').length, 3); assert(h.local[MIXED_KEY].items.some((i: any) => i.id === item.id));
  const before = h.log.length; const audio = await h.send({ type: 'AUDIO', paneId: 'main', muted: false }); assert.equal(audio.ok, false); assert.notEqual(audio.code, 'INVALID_COMMAND');
  assert(!h.log.slice(before).some(x => x.value?.muted === false || x.message?.muted === false));
});
test('revocation cancels unbound creation and late callbacks cannot navigate; known ownership remains counted on revocation', async () => {
  const h = await setup(); let release!: () => void; h.controls.afterCreate = () => new Promise<void>(r => { release = r; });
  await h.launch(); h.revokeNetflix(); await h.settle(); release(); await h.settle(); assert.equal(h.tabs.has(2), false); assert.equal(h.local[MIXED_KEY].items.length, 1); assert(!h.log.some(x => x.id === 2 && x.value?.url));
  h.controls.afterCreate = undefined; h.controls.netflixPermission = true; const { id } = await h.launch(); h.revokeNetflix(); await h.settle();
  assert(h.local[MIXED_KEY].ownership.some((o: any) => o.tabId === id)); assert.equal(h.local[MIXED_KEY].receipts.length, 0);
});
test('Netflix connection rejects stale nonces, wrong origin/frame/document, changed identity and cross-service replies', async () => {
  for (const mutation of ['nonce', 'service', 'player', 'origin', 'document', 'frame', 'generation', 'window', 'episode']) {
    let raw: any, serial = 0; const revoked: number[] = []; let tab = { id: 1, windowId: 2, url: content.url as string };
    const api = { runtime: { id: 'ext' }, permissions: { contains: async () => true }, scripting: { executeScript: async () => [{ frameId: 0, documentId: 'doc' }] }, tabs: { get: async () => tab, sendMessage: async (_id: number, m: any) => {
      if (m.type === 'bind') raw = { nonce: m.nonce, result: { status: 'ok', value: { binding: { ...m.binding, playerKey: 'key' }, content, observedAt: Date.now(), sequence: ++serial } } };
      else { raw.result.value.sequence = ++serial; if (mutation === 'nonce') raw.nonce = 'forged'; if (mutation === 'service') raw.result.value.content = { ...content, service: 'youtube' }; if (mutation === 'player') raw.result.value.binding.playerKey = 'changed'; if (mutation === 'generation') raw.result.value.binding.generation++; if (mutation === 'episode') raw.result.value.content = { ...content, titleId: '999', url: 'https://www.netflix.com/watch/999' }; }
      return structuredClone(raw);
    } } } as unknown as typeof chrome;
    const c = createNetflixConnection(api, id => revoked.push(id)); await c.connect({ service: 'netflix', tabId: 1, windowId: 2, documentId: '', playerKey: '', slotId: 'slot', generation: 1, workerEpoch: 'epoch' }, content.url);
    if (mutation === 'window') tab = { ...tab, windowId: 3 };
    if (mutation === 'origin') tab = { ...tab, url: 'https://www.amazon.com/watch/12345' };
    if (mutation === 'document' || mutation === 'frame') assert.equal(await c.sender({ id: 'ext', tab, url: content.url, frameId: mutation === 'frame' ? 1 : 0, documentId: mutation === 'document' ? 'changed' : 'doc' } as chrome.runtime.MessageSender, raw.nonce), false);
    else { assert.equal(await c.observe(1), undefined); assert.equal(revoked.length, 1); }
  }
});
test('exact manifest rejects extra Netflix account/regional origins, protected-stream and broad permissions', async () => {
  const { auditManifest } = await import(new URL('../scripts/permission-audit.mjs', import.meta.url).href);
  const manifest = JSON.parse(await readFile('apps/chrome-extension/manifest.json', 'utf8')); auditManifest(manifest);
  for (const origin of ['https://*.netflix.com/*', 'https://netflix.com/*', 'https://account.netflix.com/*']) { const m = structuredClone(manifest); m.optional_host_permissions.push(origin); assert.throws(() => auditManifest(m)); }
  for (const permission of ['cookies', 'tabs', 'webRequest', 'tabCapture', 'activeTab']) { const m = structuredClone(manifest); m.optional_permissions.push(permission); assert.throws(() => auditManifest(m)); }
});

test('cancelled Netflix cleanup failure remains counted and blocks audio even after its claim is removed', async () => {
  const h = await setup(), { id } = await h.launch(); h.controls.removeFails = true;
  const item = (await h.snapshot()).record.items[0]; assert((await h.command({ action: 'cancel', itemId: item.id })).ok); await h.settle();
  assert.equal(h.local[MIXED_KEY].claims.length, 0); assert(h.local[MIXED_KEY].ownership.some((o: any) => o.tabId === id));
  const before = h.log.length; const result = await h.send({ type: 'AUDIO', paneId: 'main', muted: false }); assert.equal(result.ok, false); assert.notEqual(result.code, 'INVALID_COMMAND');
  assert(!h.log.slice(before).some(x => x.value?.muted === false || x.message?.muted === false));
});
test('cross-origin navigation revokes Netflix authority, retains capacity and permits native focus without adoption', async () => {
  const h = await setup(), { id, slot } = await h.launch();
  h.tabs.get(id).url = 'https://www.amazon.com/watch/12345'; h.updated(id, { url: h.tabs.get(id).url }, h.tabs.get(id)); await h.settle();
  const r = (await h.snapshot()).record; assert.equal(r.items.length, 1); assert(r.ownership.some((o: any) => o.tabId === id));
  const before = h.log.length;
  assert((await h.command({ action: 'focus', slotId: slot.id, generation: r.slots[1].generation })).ok); await h.settle();
  assert(!h.log.slice(before).some(x => x.type === 'inject' || x.type.includes('control') || x.value?.url || x.value?.muted !== undefined));
});

test('four-service attention mixture retains all claims and unknown Prime blocks handoff after Netflix cancellation', async () => {
  const h = await setup(); h.controls.primeVideoPermission = true;
  const prime = await h.launch(1, { service: 'prime-video', kind: 'detail', titleId: 'Ab0123', url: 'https://www.primevideo.com/detail/Ab0123' });
  const yt = await h.launch(2, { service: 'youtube', kind: 'video', videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' });
  await h.youtubeChanged(yt.id); await h.settle();
  const nf = await h.launch(3, { service: 'netflix', kind: 'title', titleId: '42', url: 'https://www.netflix.com/title/42' });
  assert.equal(h.local[MIXED_KEY].ownership.length, 4);
  assert.equal(h.log.filter(x => x.type === 'create').length, 3);
  assert.equal(h.local[MIXED_KEY].items.filter((i: any) => ['prime-video', 'netflix'].includes(i.content.service)).length, 2);
  const r = (await h.snapshot()).record, item = r.items.find((i: any) => i.content.service === 'netflix');
  assert((await h.command({ action: 'cancel', itemId: item.id })).ok); await h.settle();
  assert(!h.tabs.has(nf.id)); assert(h.tabs.has(prime.id));
  const before = h.log.length; assert.equal((await h.send({ type: 'AUDIO', paneId: 'main', muted: false })).ok, false);
  assert(!h.log.slice(before).some(x => x.value?.muted === false || x.message?.muted === false));
});

test('Netflix connection never injects without permission, ownership generation, canonical origin or matching window', async () => {
  const b = { service: 'netflix', tabId: 1, windowId: 2, documentId: '', playerKey: '', slotId: 'slot', generation: 1, workerEpoch: 'epoch' } as const;
  for (const reason of ['permission', 'generation', 'origin', 'window', 'pending']) {
    let injections = 0;
    const api = { permissions: { contains: async () => reason !== 'permission' }, scripting: { executeScript: async () => { injections++; return []; } }, tabs: { get: async () => ({ windowId: reason === 'window' ? 3 : 2, url: content.url, pendingUrl: reason === 'pending' ? 'https://www.netflix.com/watch/999' : undefined }) } } as unknown as typeof chrome;
    const c = createNetflixConnection(api, () => {}, () => reason !== 'generation');
    await assert.rejects(c.connect(b, reason === 'origin' ? 'https://account.netflix.com/watch/1' : content.url));
    assert.equal(injections, 0);
  }
});
