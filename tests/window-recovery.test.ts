import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/viewing-worker';

test('remote reopen and worker wake retain three owned windows through blank/loading URLs and manual window moves', async () => {
  const h = await harness(); await h.observe();
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const prior = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(prior.panes.length, 3);
  const extra = prior.panes[1], other = prior.panes[2];
  h.tabs.get(extra.tabId).url = 'about:blank'; h.tabs.get(extra.tabId).windowId = 80;
  h.tabs.get(other.tabId).url = undefined; h.tabs.get(other.tabId).windowId = 90;
  const before = h.log.length;
  let state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 3);
  assert.equal(h.session['yttv-desktop.managed-windows.v1'].panes.length, 2, 'snapshot cannot erase loading ownership');
  h.controls.tabGetFails = extra.tabId;
  h.start(); state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 3);
  h.controls.tabGetFails = undefined;
  h.tabs.get(extra.tabId).url = 'https://tv.youtube.com/watch?v=cbs';
  h.tabs.get(other.tabId).url = 'https://tv.youtube.com/watch?v=cbs';
  state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.panes[1].windowId, 80); assert.equal(state.panes[2].windowId, 90);
  assert(!h.log.slice(before).some(row => row.value?.url || row.type === 'discovery'), 'recovery does not recreate or navigate players');
  h.controls.tabGetFails = extra.tabId;
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 3, 'query confirms owned tab despite transient get failure');
  h.controls.tabGetFails = undefined;
  await h.send({ type: 'REMOVE_PANE', paneId: other.id });
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 2);
  assert(h.tabs.has(extra.tabId)); assert(h.tabs.has(1));
});


test('extension Reload restores three known windows from durable ownership without replaying audio or creating players', async () => {
  const h = await harness(); await h.observe();
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' }); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const prior = await h.send({ type: 'GET_SNAPSHOT' }); const tabs = structuredClone([...h.tabs.values()]);
  for (const key of Object.keys(h.session)) delete h.session[key];
  const before = h.log.length; h.start(); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.panes.length, 3); assert.equal(state.openPlayerWindowCount, 3);
  assert.deepEqual(Array.from(state.panes, (p: any) => p.id), Array.from(prior.panes, (p: any) => p.id));
  assert.deepEqual([...h.tabs.values()], tabs);
  assert(!h.log.slice(before).some(row => row.type === 'tab' || row.type === 'player'));
});

test('already-open players without old ownership are counted and explicitly connected without close/re-add; changed destinations are never adopted', async () => {
  const h = await harness(); await h.observe();
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' }); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  for (const key of Object.keys(h.session)) delete h.session[key];
  delete h.local['yttv-desktop.managed-recovery.v1'];
  h.start(); let state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.panes.length, 1); assert.equal(state.openPlayerWindowCount, 3); assert.equal(state.unassignedPlayers.length, 2);
  const before = h.log.length;
  for (const tab of state.unassignedPlayers) assert.equal((await h.send({ type: 'CONNECT_PANE', tabId: tab.tabId })).ok, true);
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 3); assert.equal(state.unassignedPlayers.length, 0);
  assert(!h.log.slice(before).some(row => row.type === 'tab' || row.type === 'player'));
  for (const key of Object.keys(h.session)) delete h.session[key];
  h.tabs.get(2).url = 'https://owner.example/'; h.start();
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.panes.length, 2); assert(h.tabs.has(2));
});

test('browser restoration with changed IDs still reports all open player windows without adopting unrelated or unmatched tabs', async () => {
  const h = await harness(); await h.observe();
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' }); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  for (const key of Object.keys(h.session)) delete h.session[key];
  for (const [id, tab] of [...h.tabs]) { h.tabs.delete(id); h.tabs.set(id + 100, { ...tab, id: id + 100, windowId: tab.windowId + 100 }); h.players.set(id + 100, h.players.get(id)); }
  h.tabs.set(999, { id: 999, windowId: 999, url: 'https://owner.example/' });
  h.start(); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.openPlayerWindowCount, 3); assert.equal(state.panes.length, 0);
  assert.equal(state.originalCandidates.length, 3); assert.equal(state.unassignedPlayers.length, 3);
  assert(h.tabs.has(999)); assert(!state.originalCandidates.some((row: any) => row.tabId === 999));
});
