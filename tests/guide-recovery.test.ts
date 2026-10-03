import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { envelope, type Command } from '../apps/chrome-extension/src/adapter';
import { defaultPreferences, PREFERENCES_KEY } from '../packages/storage/src/index';
import { GUIDE_CACHE_KEY } from '../packages/storage/src/guide-cache';

// VM-only bridge fixtures: no browser, real playback handle or real navigation is available.
const worker = build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const stamp = new Date(Date.now() - 1000).toISOString();
const rows = ['a', 'unavailable', 'b'].map(id => ({ channel: { id: `yttv:synthetic-${id}`, name: `Synthetic ${id}` }, programTitle: 'Synthetic program', observedAt: stamp, evidenceClass: 'LIVE', available: false, target: null }));
const prefs = { ...defaultPreferences(), favorites: [rows[0].channel.id], hiddenChannels: [rows[1].channel.id], channelOrder: rows.map(r => r.channel.id).reverse(), currentChannel: rows[0].channel.id, previousChannel: rows[2].channel.id, recentChannels: [rows[0].channel.id, rows[2].channel.id] };
const watch = () => ({ guide: [], route: 'watch', observedAt: new Date().toISOString(), playback: { playing: true, muted: true, readyState: 4, currentTime: 10 } });
async function harness(cache: unknown = { schemaVersion: 1, observedAt: stamp, rows }, failCache = false, failPrefs = false) {
  const local: Record<string, unknown> = { [GUIDE_CACHE_KEY]: structuredClone(cache), [PREFERENCES_KEY]: structuredClone(prefs) };
  const actions: unknown[] = []; let callback: any;
  const sender = { id: 'synthetic-extension', url: 'https://tv.youtube.com/watch?v=synthetic-test-only', tab: { id: 1 } };
  const chrome = {
    storage: { local: { get: async (key: string) => { if ((failCache && key === GUIDE_CACHE_KEY) || (failPrefs && key === PREFERENCES_KEY)) throw new Error('Synthetic storage failure'); return { [key]: structuredClone(local[key]) }; }, set: async (value: object) => { if (failCache && GUIDE_CACHE_KEY in value) throw new Error('Synthetic cache write failure'); Object.assign(local, structuredClone(value)); } }, session: { get: async () => ({}), set: async () => {} } },
    runtime: { id: 'synthetic-extension', getURL: () => 'chrome-extension://synthetic-extension/', sendMessage: async () => {}, onMessage: { addListener: (fn: any) => { callback = fn; } } },
    tabs: { query: async () => [{ id: 1, url: sender.url, active: true }], get: async () => ({ id: 1, url: sender.url }), update: async (_id: number, value: unknown) => { actions.push(structuredClone(value)); }, sendMessage: async (_id: number, message: any) => message.type === 'GET_OBSERVATION' ? watch() : { ok: false, code: 'TARGET_UNAVAILABLE' }, onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
  };
  const restart = async () => { runInNewContext((await worker).outputFiles[0].text, { chrome, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval }); };
  await restart();
  const send = (command: Command): Promise<any> => new Promise(resolve => callback(envelope(command), sender, (value: unknown) => resolve(structuredClone(value))));
  return { send, local, actions, restart };
}

test('fresh worker plus runtime reload and Watch initialization restores rows/preferences with disabled authority and unchanged history', async () => {
  const h = await harness();
  for (let i = 0; i < 2; i++) {
    const snap = await h.send({ type: 'GET_SNAPSHOT' });
    assert.deepEqual(snap.guide.map((r: any) => r.channel.id), rows.map(r => r.channel.id));
    assert.deepEqual(snap.preferences, prefs); assert.equal(snap.currentConfirmed, false);
    assert.equal(snap.capabilities.navigation, false); assert.equal(snap.guideObservedAt, stamp);
    assert(snap.guide.every((r: any) => r.metadataSource === 'CACHED' && !r.available && r.target === null && r.observedAt === stamp));
    await h.send({ type: 'OBSERVE', observation: { ...watch(), guide: snap.guide, guideObservedAt: stamp } as any });
    assert.deepEqual((await h.send({ type: 'GET_SNAPSHOT' })).preferences, prefs);
    assert.equal((await h.send({ type: 'PREVIOUS' })).code, 'TARGET_UNAVAILABLE');
    assert.equal((await h.send({ type: 'CREATE_PANE', channelId: rows[0].channel.id })).code, 'TARGET_UNAVAILABLE');
    assert.equal(h.actions.some((a: any) => a.url), false, 'restoration never navigates');
    await h.restart();
  }
});

test('native Live reacquisition enables only fresh validated targets and preserves missing/unavailable rows', async () => {
  const h = await harness(); await h.send({ type: 'GET_SNAPSHOT' });
  const fresh = new Date().toISOString();
  const validated = { ...rows[0], observedAt: fresh, available: true, target: { kind: 'navigation', channelId: rows[0].channel.id, url: 'https://tv.youtube.com/watch?v=synthetic-test-only', verifiedAt: fresh, evidenceClass: 'LIVE' } };
  await h.send({ type: 'OBSERVE', observation: { ...watch(), route: 'guide', guide: [validated, { ...rows[2], observedAt: fresh, target: { ...validated.target, channelId: rows[2].channel.id, url: 'https://media.invalid/synthetic' }, available: true }], guideObservedAt: fresh } as any });
  const snap = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(snap.capabilities.navigation, true); assert.equal(snap.guide.length, 3);
  assert(snap.guide[0].target); assert.equal(snap.guide[1].target, null); assert.equal(snap.guide[2].target, null);
  assert.deepEqual(snap.preferences, prefs); assert.equal(snap.currentConfirmed, false);
  assert.doesNotMatch(JSON.stringify(h.local[GUIDE_CACHE_KEY]), /https:|verifiedAt|tabId|windowId/);
  await h.restart(); assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).capabilities.navigation, false);
});

test('missing or failed cache preserves preferences Watch playback and explicit same-tab Live recovery', async () => {
  for (const h of [await harness(null), await harness({ schemaVersion: 2 }), await harness(null, true)]) {
    const snap = await h.send({ type: 'GET_SNAPSHOT' });
    assert.deepEqual(snap.preferences, prefs); assert.equal(snap.playback.playing, true); assert.equal(snap.capabilities.navigation, false);
    assert.equal((await h.send({ type: 'OPEN_NATIVE_GUIDE' })).ok, true);
    assert.deepEqual(h.actions.at(-1), { url: 'https://tv.youtube.com/live' });
  }
});

test('failed preference read cannot overwrite retained preferences or block optional cached guide', async () => {
  const h = await harness(undefined, false, true);
  assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).guide.length, 3);
  assert.equal((await h.send({ type: 'PREFERENCE', patch: { favorites: [] } })).ok, false);
  assert.deepEqual(h.local[PREFERENCES_KEY], prefs);
});
