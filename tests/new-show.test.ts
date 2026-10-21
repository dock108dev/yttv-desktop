import test from 'node:test';
import assert from 'node:assert/strict';
import type { GuideEntry } from '../packages/core/src/index';
import { defaultChannel } from '../apps/chrome-extension/src/default-channel';
import { harness } from './helpers/viewing-worker';

const LIVE = 'https://tv.youtube.com/live';
const WATCH = 'https://tv.youtube.com/watch?v=cbs&vp=guide';
function channel(id: string): GuideEntry {
  const at = new Date(Date.now() - 10).toISOString();
  return { channel: { id, name: id }, observedAt: at, evidenceClass: 'LIVE', available: true,
    target: { kind: 'navigation', channelId: id, url: `https://tv.youtube.com/watch?v=${id}`, verifiedAt: at, evidenceClass: 'LIVE' } };
}
async function cold() { const h = await harness(); await h.send({ type: 'GET_SNAPSHOT' }); await h.remove(); return h; }
async function guide(h: Awaited<ReturnType<typeof harness>>, id = 2) {
  Object.assign(h.players.get(id), { route: 'guide', readyState: 0, playing: false }); await h.observe(id);
}
async function ready(h: Awaited<ReturnType<typeof harness>>, id = 2) {
  Object.assign(h.players.get(id), { route: 'watch', key: `watch-${id}`, documentId: `watch-doc-${id}`, readyState: 4, playing: false }); await h.observe(id);
}

test('default channel uses last watched when live and otherwise the first eligible native listing', () => {
  const a = channel('first'), b = channel('last');
  assert.equal(defaultChannel([a, b], 'last'), b);
  assert.equal(defaultChannel([a, b], 'missing'), a);
  for (const patch of [
    { available: false }, { metadataSource: 'CACHED' }, { programTitle: 'Upcoming: Later' },
    { observedAt: new Date(Date.now() - 31 * 60_000).toISOString() },
    { target: { ...b.target!, evidenceClass: 'FIXTURE' } },
  ]) {
    const invalid = { ...b, ...patch } as GuideEntry;
    assert.equal(defaultChannel([invalid, a], 'last'), a);
    assert.equal(defaultChannel([invalid], 'last'), undefined);
  }
});

test('New show starts from no player: blank, muted Live, fresh channel, ready native Play exactly once', async () => {
  const h = await cold();
  h.tabs.set(90, { id: 90, windowId: 90, url: 'https://example.test', mutedInfo: { muted: false } });
  h.controls.playback = async id => { h.players.get(id).playing = true; return { ok: true, value: { playing: true } }; };
  assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true);
  assert.equal(h.log.filter(row => row.type === 'create').length, 1);
  assert.equal(h.log.find(row => row.type === 'create').row.url, 'about:blank');
  const updates = h.log.filter(row => row.type === 'tab' && row.id === 2);
  assert.equal(updates[0].value.muted, true);
  assert.equal(updates.at(-1).value.url, LIVE);
  assert.equal(h.tabs.get(2).mutedInfo.muted, true);
  let state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.openingDefaultShow, true);
  await Promise.all([h.send({ type: 'NEW_SHOW' }), h.send({ type: 'NEW_SHOW' })]);
  assert.equal(h.log.filter(row => row.type === 'create').length, 1, 'opening clicks coalesce');
  await guide(h); assert.equal(h.tabs.get(2).url, WATCH);
  assert.equal(h.log.filter(row => row.type === 'playback').length, 0);
  Object.assign(h.players.get(2), { route: 'watch', key: 'watch-2', documentId: 'watch-doc-2', readyState: 1 }); await h.observe(2);
  assert.equal(h.log.filter(row => row.type === 'playback').length, 0, 'wait for ready media');
  // The watch document, rather than the Live preview, owns the startup request.
  await ready(h);
  const plays = h.log.filter(row => row.type === 'playback');
  assert.equal(plays.length, 1); assert.equal(plays[0].message.playing, true); assert.equal(plays[0].message.mutedStart, true);
  assert.equal(plays[0].options.documentId, 'watch-doc-2');
  await h.observe(2); state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.openingDefaultShow, false); assert.equal(state.panes[0].playbackState, 'playing');
  assert.equal(h.log.filter(row => row.type === 'playback').length, 1);
  assert.equal(h.log.some(row => row.id === 90), false); assert.equal(h.tabs.get(90).mutedInfo.muted, false);
  assert.equal(h.players.get(2).volume, .24); assert.equal(h.tabs.get(2).mutedInfo.muted, true);
});

test('further New shows reuse the channel policy, stop at four and preserve existing audio and content', async () => {
  const h = await harness(); await h.observe();
  h.players.get(1).volume = .37; const original = structuredClone(h.tabs.get(1));
  h.controls.playback = async id => { h.players.get(id).playing = true; return { ok: true, value: { playing: true } }; };
  for (const id of [2, 3, 4]) { assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true); await ready(h, id); }
  assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).panes.length, 4);
  assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'SESSION_BOUND');
  assert.equal(h.log.filter(row => row.type === 'create').length, 3);
  assert.deepEqual(h.tabs.get(1), original); assert.equal(h.players.get(1).volume, .37);
  assert.equal(h.log.some(row => row.id === 1 && ['tab', 'player', 'playback'].includes(row.type)), false);
  assert.equal(h.log.filter(row => row.type === 'playback').length, 3);
});

test('slow first guide stops with a useful fallback and an explicit retry reuses the new window', async () => {
  const h = await cold(); await h.send({ type: 'NEW_SHOW' });
  h.controls.nowOffset = 16_000; await guide(h);
  let state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.openingDefaultShow, false); assert.match(state.panes[0].error, /choose a channel/);
  assert.equal(h.tabs.get(2).url, LIVE); assert.equal(h.log.some(row => row.type === 'playback'), false);
  assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true);
  assert.equal(h.log.filter(row => row.type === 'create').length, 1);
  assert.equal(h.tabs.get(2).url, WATCH);
  h.controls.playback = async () => ({ ok: false }); await ready(h); await h.observe(2);
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.openingDefaultShow, false);
  assert.match(state.panes[0].error, /native Play/); assert.equal(h.log.filter(row => row.type === 'playback').length, 1, 'native refusal is not retried');
});

test('navigation, closing and explicit audio changes end startup without later hidden navigation or Play', async () => {
  for (const action of ['navigate', 'close', 'mute']) {
    const h = await cold(); await h.send({ type: 'NEW_SHOW' });
    if (action === 'navigate') { h.tabs.get(2).url = 'https://tv.youtube.com/library'; h.updated(2, { url: h.tabs.get(2).url }, h.tabs.get(2)); }
    else if (action === 'close') await h.remove(2);
    else await h.send({ type: 'MUTE' });
    const before = h.log.length;
    if (action !== 'close') await guide(h);
    const state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.openingDefaultShow, false);
    assert.equal(h.log.slice(before).some(row => row.value?.url || row.type === 'playback' || row.type === 'create'), false);
  }
});

test('worker wake observes a first window without resuming startup, and explicit New show can retry', async () => {
  const h = await cold(); await h.send({ type: 'NEW_SHOW' });
  // End the old worker attempt, retaining its known Live window record.
  await h.send({ type: 'MUTE' }); const before = h.log.length;
  h.start(); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.openingDefaultShow, false); assert.equal(state.panes.length, 1);
  await guide(h); assert.equal(h.log.slice(before).some(row => row.value?.url || row.type === 'playback'), false);
  assert.equal((await h.send({ type: 'NEW_SHOW' })).ok, true);
  assert.equal(h.log.filter(row => row.type === 'create').length, 1); assert.equal(h.tabs.get(2).url, WATCH);
  await h.send({ type: 'MUTE' });
});

test('New show is remote-only and failure to mute a blank window cannot load YouTube TV', async () => {
  const h = await harness(); await h.observe();
  assert.equal((await h.send({ type: 'NEW_SHOW' }, 1)).code, 'INVALID_SENDER');
  assert.equal(h.log.some(row => row.type === 'create'), false);
  await h.remove(); h.controls.tabFails = true;
  assert.equal((await h.send({ type: 'NEW_SHOW' })).code, 'WINDOW_FAILED');
  assert.equal(h.tabs.has(2), false); assert.equal(h.log.some(row => row.value?.url), false);
});
