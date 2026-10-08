import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideSync, GUIDE_SYNC_KEY } from '../apps/chrome-extension/src/guide-sync';

function fixture(stored?: any) {
  let clock = 0; const tabs = new Map<number, any>([[1, { id: 1, windowId: 10, url: 'https://tv.youtube.com/watch?v=original', mutedInfo: { muted: false } }]]);
  if (stored) tabs.set(stored.tabId, { id: stored.tabId, windowId: stored.windowId, url: stored.url });
  const session: any = { [GUIDE_SYNC_KEY]: stored }; const log: any[] = []; let sync: ReturnType<typeof createGuideSync>;
  let muteFails = false, storageFails = false, closeFails = false;
  const api: any = { storage: { session: { get: async (key: string) => ({ [key]: session[key] }), set: async (row: any) => { if (storageFails) throw Error(); Object.assign(session, row); } } }, tabs: {
    create: async (row: any) => { const tab = { id: 2, ...row }; tabs.set(2, tab); log.push(['create', row]); return tab; },
    get: async (id: number) => tabs.get(id),
    update: async (id: number, row: any) => { log.push(['update', id, row]); const tab = tabs.get(id); Object.assign(tab, row); if (row.muted !== undefined) tab.mutedInfo = { muted: !muteFails && row.muted }; return tab; },
    remove: async (id: number) => { if (closeFails) throw Error(); log.push(['remove', id]); tabs.delete(id); sync?.removed(id); },
  } };
  sync = createGuideSync(api, async () => {}, { now: () => clock, token: () => 'fixture', timeoutMs: 25, settleMs: 5 });
  return { sync, tabs, session, log, advance: () => { clock += 60_001; }, failMute: () => { muteFails = true; }, failStorage: () => { storageFails = true; }, failClose: () => { closeFails = true; } };
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('automatic discovery is inactive, browser-muted before native navigation, coalesced and closed after data settles', async () => {
  const h = fixture(); const original = structuredClone(h.tabs.get(1));
  await Promise.all([h.sync.request(10), h.sync.request(10)]);
  assert.equal(h.log.filter(row => row[0] === 'create').length, 1);
  assert.equal(h.log[0][1].active, false);
  assert.deepEqual(h.log[1], ['update', 2, { muted: true }]);
  assert.match(h.log[2][2].url, /^https:\/\/tv\.youtube\.com\/live#yttv-guide-sync=/);
  assert.equal(h.sync.status, 'loading'); assert(h.sync.owns(2));
  h.sync.observed(99, 'unrelated'); await wait(7); assert.equal(h.sync.status, 'loading');
  h.sync.observed(2, 'rows'); await wait(8);
  assert.equal(h.sync.status, 'ready'); assert(!h.tabs.has(2)); assert.deepEqual(h.tabs.get(1), original);
  await h.sync.request(10); assert.equal(h.log.filter(row => row[0] === 'create').length, 1, 'no repeated snapshot/playing retry');
  h.advance(); await h.sync.request(10); h.sync.observed(2, 'new rows'); await wait(8);
  assert.equal(h.log.filter(row => row[0] === 'create').length, 2);
});

test('no native guide data times out truthfully and a navigated-away helper is never closed', async () => {
  const h = fixture(); await h.sync.request(10); h.tabs.get(2).url = 'https://owner.example/';
  await wait(35); assert.equal(h.sync.status, 'unavailable'); assert(h.tabs.has(2)); assert.equal(h.session[GUIDE_SYNC_KEY], null);
});

test('mute or session failure stops before native navigation and cleans only the newly created blank', async () => {
  for (const failure of ['mute', 'storage']) {
    const h = fixture(); await h.sync.ready; if (failure === 'mute') h.failMute(); else h.failStorage();
    await h.sync.request(10); assert.equal(h.sync.status, 'unavailable'); assert(!h.tabs.has(2));
    assert(!h.log.some(row => row[2]?.url)); assert(h.tabs.has(1));
  }
});

test('worker wake cleans exact recorded discovery ownership without touching a moved or reused tab', async () => {
  const record = { tabId: 7, windowId: 10, url: 'https://tv.youtube.com/live#yttv-guide-sync=prior' };
  for (const moved of [false, true]) {
    const h = fixture(record); if (moved) h.tabs.get(7).windowId = 20;
    await h.sync.ready; assert.equal(h.tabs.has(7), moved); assert(h.tabs.has(1));
  }
});

test('failed cleanup retains recovery ownership and blocks more discovery tabs', async () => {
  const h = fixture(); await h.sync.request(10); h.failClose(); h.sync.observed(2, 'rows'); await wait(8);
  assert.equal(h.sync.status, 'unavailable'); assert(h.session[GUIDE_SYNC_KEY]);
  h.advance(); await h.sync.request(10); assert.equal(h.log.filter(row => row[0] === 'create').length, 1);
});
