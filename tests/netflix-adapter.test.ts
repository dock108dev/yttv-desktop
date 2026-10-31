import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createNetflixAdapter } from '../packages/netflix-adapter/src/index';
import { recognizeContent } from '../packages/core/src/media';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
const url = 'https://www.netflix.com/watch/12345';
const binding = { service: 'netflix', tabId: 1, windowId: 2, documentId: 'doc', playerKey: '', slotId: 'slot', generation: 1, workerEpoch: 'epoch' } as const;

test('Netflix preserves numeric title/watch scope and exact existing trackId canonicalization', () => {
  for (const kind of ['title', 'watch']) {
    for (const id of ['0', '123', '0'.repeat(20)]) for (const suffix of ['', '?', '?trackId=123', '?trackId=']) {
      const r = recognizeContent(`https://www.netflix.com/${kind}/${id}${suffix}`); assert.equal(r.status, 'ok');
      if (r.status === 'ok') assert.deepEqual(r.value, { service: 'netflix', kind, titleId: id, url: `https://www.netflix.com/${kind}/${id}` });
    }
    for (const bad of ['', '1'.repeat(21), 'a', '-1', '1.2', '１２', '1/', '%31', '1#', '1?x=1', '1?trackId=1&trackId=2', '../1']) assert.notEqual(recognizeContent(`https://www.netflix.com/${kind}/${bad}`).status, 'ok');
  }
  for (const bad of ['http://www.netflix.com/watch/1', 'https://netflix.com/watch/1', 'https://www.netflix.com:443/watch/1', 'https://www.netflix.com/en/watch/1', 'https://www.netflix.com/browse', 'https://www.netflix.com/profiles/1', 'https://www.netflix.com/search/1', 'https://account.netflix.com/watch/1']) assert.notEqual(recognizeContent(bad).status, 'ok');
});

test('detail, profile, sign-in, episode, maturity, restricted, trailer, ad and main-looking fixtures never establish main identity', async () => {
  // Deliberately ordinary invented HTML: these are negative fixtures, NOT observed Netflix DOM.
  for (const route of ['title', 'watch']) for (const text of ['Detail', 'Choose profile', 'Sign in', 'Episode 2', 'Maturity PIN', 'Account unavailable', 'Trailer', 'Advertisement', 'Main movie']) {
    const w = new Window({ url: `https://www.netflix.com/${route}/12345` }); w.document.body.innerHTML = `<h1>${text}</h1><video controls></video><button>Play</button>`;
    const v = w.document.querySelector('video')!; v.muted = false; v.volume = .37;
    Object.defineProperties(v, { readyState: { value: 4 }, duration: { value: 120 }, ended: { value: true }, paused: { value: false } });
    const a = createNetflixAdapter(w.document as unknown as Document, binding), o = a.observe(); assert.equal(o.status, 'ok'); if (o.status !== 'ok') throw Error();
    assert.equal(o.value.readiness, 'needs-attention'); assert.equal(o.value.kind, 'unknown'); assert.equal(o.value.ended, 'unknown');
    for (const key of ['identity', 'ready', 'play', 'pause', 'setMute', 'readMute', 'setVolume', 'readVolume', 'ended'] as const) assert.equal(o.value.capabilities[key].state, 'unknown');
    for (const command of [{ type: 'play' }, { type: 'pause' }, { type: 'mute', value: true }, { type: 'volume', value: .2 }] as const) assert.equal((await a.execute(command, o.value.binding)).status, 'needs-attention');
    assert.equal(v.muted, false); assert.equal(v.volume, .37); await w.happyDOM.abort();
  }
});

test('Netflix bridge uses the real adapter, rejects subframes and stale/cross-service commands without writes', async () => {
  const source = (await build({ entryPoints: ['apps/chrome-extension/src/netflix-content.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text;
  const w = new Window({ url }); w.document.body.innerHTML = '<video controls></video>'; const v = w.document.querySelector('video')!; v.volume = .63;
  const listeners: any[] = []; const context = { URL, window: w, document: w.document, crypto: webcrypto, setTimeout, setInterval: () => {}, chrome: { runtime: { id: 'extension', onMessage: { addListener: (fn: any) => listeners.push(fn) }, sendMessage: async () => {} } } };
  runInNewContext(source, { ...context, window: { top: {} } }); assert.equal(listeners.length, 0);
  runInNewContext(source + source, context); assert.equal(listeners.length, 1);
  const call = (message: any, sender: any = { id: 'extension' }) => new Promise<any>(resolve => { if (listeners[0]({ namespace: 'yttv-desktop.netflix.v1', ...message }, sender, resolve) !== true) resolve(undefined); });
  assert.equal(await call({ type: 'bind', binding: { ...binding, service: 'youtube' }, nonce: 'nonce' }), undefined);
  assert.equal(await call({ type: 'bind', binding, nonce: 'nonce' }, { id: 'extension', tab: { id: 1 } }), undefined);
  const raw = await call({ type: 'bind', binding, nonce: 'nonce' }); assert.equal(raw.result.value.readiness, 'needs-attention');
  assert.equal(await call({ type: 'observe', nonce: 'stale' }), undefined);
  const result = await call({ type: 'execute', nonce: 'nonce', binding: raw.result.value.binding, command: { type: 'volume', value: 1 } }); assert.notEqual(result.result.status, 'ok'); assert.equal(v.volume, .63);
  w.location.href = 'https://www.amazon.com/watch/12345'; assert.notEqual((await call({ type: 'observe', nonce: 'nonce' })).result.status, 'ok');
  await w.happyDOM.abort();
});
