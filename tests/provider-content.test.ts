import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { providerNamespace } from '../apps/chrome-extension/src/provider-content';
import { YOUTUBE_NAMESPACE } from '../apps/chrome-extension/src/youtube';
import { PRIME_VIDEO_NAMESPACE } from '../apps/chrome-extension/src/prime-video';
import { NETFLIX_NAMESPACE } from '../apps/chrome-extension/src/netflix';

test('worker namespaces match the content transport protocol', () => {
  assert.equal(YOUTUBE_NAMESPACE, providerNamespace('youtube'));
  assert.equal(PRIME_VIDEO_NAMESPACE, providerNamespace('prime-video'));
  assert.equal(NETFLIX_NAMESPACE, providerNamespace('netflix'));
});

test('shared transport isolates providers, invalidates old bindings and retains reply nonce across rebind', async () => {
  const source = (await build({ entryPoints: ['apps/chrome-extension/src/provider-content.ts'], bundle: true,
    write: false, format: 'iife', globalName: 'transport', platform: 'browser' })).outputFiles[0].text;
  for (const [service, marker] of [['youtube', '__youtubeBridge'], ['prime-video', '__primeVideoBridge'], ['netflix', '__netflixBridge']] as const) {
    const listeners: any[] = [], timers: Array<() => void> = [], notices: any[] = [], current: Array<() => boolean> = [];
    let finish!: (value: unknown) => void;
    const window: any = {}; window.top = window;
    const context: any = { window, document: {}, setInterval: (fn: () => void) => timers.push(fn),
      chrome: { runtime: { id: 'extension', onMessage: { addListener: (fn: any) => listeners.push(fn) },
        sendMessage: async (m: any) => notices.push(m) } } };
    runInNewContext(source, context);
    const create = (_doc: any, _binding: any, valid: () => boolean) => {
      current.push(valid);
      return { observe: () => ({ status: 'ok' }), execute: () => new Promise(resolve => { finish = resolve; }) };
    };
    window.top = {};
    context.transport.installProviderContent(service, marker, create);
    assert.equal(listeners.length, 0);
    window.top = window;
    context.transport.installProviderContent(service, marker, create);
    context.transport.installProviderContent(service, marker, create);
    assert.equal(listeners.length, 1); assert.equal(timers.length, 1);
    const call = (message: any, sender: any = { id: 'extension' }) => new Promise<any>(resolve => {
      if (listeners[0]({ namespace: providerNamespace(service), ...message }, sender, resolve) !== true) resolve(undefined);
    });
    const bind = { type: 'bind', binding: { service }, nonce: 'first' };
    for (const sender of [{ id: 'foreign' }, { id: 'extension', tab: { id: 1 } }]) assert.equal(await call(bind, sender), undefined);
    assert.equal(await call({ ...bind, namespace: 'foreign' }), undefined);
    assert.equal(await call({ ...bind, binding: { service: 'yttv' } }), undefined);
    assert.equal(current.length, 0);
    assert.equal((await call(bind)).nonce, 'first');
    assert.equal(await call({ type: 'observe', nonce: 'stale' }), undefined);
    const pending = call({ type: 'execute', nonce: 'first', command: { type: 'pause' } });
    await call({ ...bind, nonce: 'second' });
    assert.equal(current[0](), false); assert.equal(current[1](), true);
    finish({ status: 'unknown' });
    assert.equal((await pending).nonce, 'first');
    assert.equal((await call({ type: 'observe', nonce: 'second' })).nonce, 'second');
    timers[0]();
    assert.equal(notices[0].namespace, providerNamespace(service));
    assert.equal(notices[0].nonce, 'second'); assert.equal(notices[0].observation, undefined);
  }
});
