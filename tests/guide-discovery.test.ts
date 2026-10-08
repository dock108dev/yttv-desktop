import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/viewing-worker';

test('fresh guide candidates in another owned player survive stale-original observations and removal without renewed age', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const original = h.observation();
  const cached: any = { ...original.guide[0], metadataSource: 'CACHED', available: false, target: null };
  await h.observe(1, { ...original, guide: [cached] });
  const other = h.observation(2); const at = new Date(Date.now() - 1).toISOString();
  other.guide[0] = { ...other.guide[0], observedAt: at, target: { ...other.guide[0].target, verifiedAt: at, url: 'https://tv.youtube.com/watch?v=fresh-other' } };
  await h.observe(2, other);
  await h.observe(1, { ...h.observation(), guide: [cached] });
  let state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.guide[0].target.url, other.guide[0].target.url);
  assert.equal(state.guide[0].target.verifiedAt, at);
  const extra = state.panes[1]; await h.send({ type: 'REMOVE_PANE', paneId: extra.id });
  state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.guide[0].target.url, other.guide[0].target.url, 'worker retains volatile native observations when their extra closes');
  assert.equal(state.guide[0].observedAt, at, 'retention never renews guide freshness');
  assert.equal(h.log.some(row => row.value?.url === 'https://tv.youtube.com/live'), false);
});


test('first remote open automatically discovers native guide without refreshing or navigating the paused original', async () => {
  const h = await harness(); h.controls.guideSync = true;
  const empty = h.observation(); empty.guide = []; empty.playback.playing = false;
  await h.observe(1, empty);
  const original = structuredClone(h.tabs.get(1));
  const remote = { id: 'test', url: 'chrome-extension://test/remote.html' };
  await h.sendFrom({ type: 'GET_SNAPSHOT' }, remote);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.log.filter(row => row.type === 'discovery').length, 1);
  const helper = h.log.find(row => row.type === 'discovery').id;
  assert.equal(h.tabs.get(helper).mutedInfo.muted, true);
  assert.match(h.tabs.get(helper).url, /live#yttv-guide-sync=/);
  assert.equal((await h.sendFrom({ type: 'GET_SNAPSHOT' }, remote)).guideSyncStatus, 'loading');
  const fresh = h.observation(helper); fresh.guide[0].channel = { id: 'yttv:new', name: 'New channel' }; fresh.guide[0].target.channelId = 'yttv:new';
  fresh.guide[0].target.url = 'https://tv.youtube.com/watch?v=new';
  await h.observe(helper, fresh);
  const state = await h.sendFrom({ type: 'GET_SNAPSHOT' }, remote);
  assert.equal(state.panes.length, 1, 'discovery is never a player or original candidate');
  assert(state.guide.some((row: any) => row.channel.id === 'yttv:new' && row.target));
  assert.deepEqual(h.tabs.get(1), original);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert(!h.tabs.has(helper)); assert.equal((await h.sendFrom({ type: 'GET_SNAPSHOT' }, remote)).guideSyncStatus, 'ready');
  assert.equal(h.log.filter(row => row.type === 'discovery').length, 1);
});


test('first owned playback triggers discovery; repeated observations and nearby Add coalesce without adopting guide as a player', async () => {
  const h = await harness(); h.controls.guideSync = true; await h.observe();
  await new Promise(resolve => setTimeout(resolve, 5));
  const helper = h.log.find(row => row.type === 'discovery').id;
  for (let i = 0; i < 4; i++) await h.observe();
  const guide = h.observation(helper); await h.observe(helper, guide);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })).ok, true);
  assert.equal(h.log.filter(row => row.type === 'discovery').length, 1);
  assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).panes.length, 2);
});
