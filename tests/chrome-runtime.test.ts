import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { createExtensionLifecycle } from '../apps/chrome-extension/src/runtime';
import { createClientBridge } from '../apps/chrome-extension/src/bridge';

test('invalidated synchronous and asynchronous APIs clean up once and never retry', async () => {
  for (const operation of [() => { throw new Error('Extension context invalidated.'); }, () => Promise.reject(new Error('Extension context invalidated.'))]) {
    const lifecycle = createExtensionLifecycle(); let disposed = 0; let notices = 0; let calls = 0;
    lifecycle.addCleanup(() => { disposed++; throw new Error('Extension context invalidated.'); });
    lifecycle.onInvalidated(() => notices++);
    await lifecycle.guard(() => { calls++; return operation(); });
    assert.equal(lifecycle.active, false); assert.equal(lifecycle.invalidated, true);
    await lifecycle.guard(() => { calls++; return 1; }); lifecycle.invalidate(); lifecycle.dispose();
    assert.equal(calls, 1); assert.equal(disposed, 1); assert.equal(notices, 1);
  }
  const ordinary = createExtensionLifecycle();
  await ordinary.guard(() => Promise.reject(new Error('The message port closed during navigation.')));
  assert.equal(ordinary.active, true, 'ordinary page navigation does not falsely invalidate the context'); ordinary.dispose();
});

test('bridge unregisters runtime/storage listeners and stops sending after invalidation', async () => {
  const runtimeListeners = new Set<Function>(); const storageListeners = new Set<Function>(); let calls = 0; let invalid = false;
  (globalThis as any).chrome = {
    runtime: { sendMessage: () => { calls++; if (invalid) throw new Error('Extension context invalidated.'); return Promise.resolve(undefined); },
      onMessage: { addListener: (fn: Function) => runtimeListeners.add(fn), removeListener: (fn: Function) => runtimeListeners.delete(fn) } },
    storage: { onChanged: { addListener: (fn: Function) => storageListeners.add(fn), removeListener: (fn: Function) => storageListeners.delete(fn) } },
  };
  const bridge = createClientBridge(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runtimeListeners.size, 1); assert.equal(storageListeners.size, 1);
  invalid = true; assert.equal((await bridge.navigateChannel('yttv:cbs')).ok, false);
  assert.equal(runtimeListeners.size, 0); assert.equal(storageListeners.size, 0);
  const stoppedCalls = calls;
  await bridge.refresh!(); await bridge.navigateChannel('yttv:fox');
  assert.equal(calls, stoppedCalls); assert.match((await bridge.getSnapshot()).statusMessage!, /Refresh/);
  bridge.dispose();
});

test('content invalidation disposes observers/timers, keeps mute safety and one notice; reinjection/SPA never duplicate UI', async () => {
  const bundle = await build({ entryPoints: [new URL('../apps/chrome-extension/src/content.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'iife', platform: 'browser',
    plugins: [{ name: 'isolated-content-fixture', setup(builder) {
      builder.onResolve({ filter: /packages\/ui\/src\/index$/ }, () => ({ path: 'ui-fixture', namespace: 'fixture' }));
      builder.onResolve({ filter: /styles\.css\?inline$/ }, () => ({ path: 'css-fixture', namespace: 'fixture' }));
      builder.onLoad({ filter: /ui-fixture/, namespace: 'fixture' }, () => ({ contents: 'export function mountDesktop(){ globalThis.fixtureMounts++; return () => { globalThis.fixtureUnmounts++; }; }', loader: 'js' }));
      builder.onLoad({ filter: /css-fixture/, namespace: 'fixture' }, () => ({ contents: 'export default ".desktop-app{}";', loader: 'js' }));
    } }],
  });
  const window = new Window({ url: 'https://tv.youtube.com/live' });
  window.document.body.innerHTML = '<video></video>';
  const intervals = new Set<ReturnType<typeof setInterval>>(); const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const runtimeListeners = new Set<Function>(); const storageListeners = new Set<Function>();
  let invalid = false; let calls = 0; let disconnects = 0;
  const NativeObserver = window.MutationObserver;
  class ObservedMutationObserver extends NativeObserver { override disconnect() { disconnects++; super.disconnect(); } }
  const context: any = {
    window, document: window.document, HTMLVideoElement: window.HTMLVideoElement, MutationObserver: ObservedMutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window), URL, fixtureMounts: 0, fixtureUnmounts: 0,
    setInterval: (fn: () => void, duration: number) => { const id = setInterval(fn, duration); intervals.add(id); return id; },
    clearInterval: (id: ReturnType<typeof setInterval>) => { intervals.delete(id); clearInterval(id); },
    setTimeout: (fn: () => void, duration: number) => { const id = setTimeout(() => { timeouts.delete(id); fn(); }, duration); timeouts.add(id); return id; },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => { timeouts.delete(id); clearTimeout(id); },
    chrome: { runtime: {
      sendMessage: () => { calls++; if (invalid) throw new Error('Extension context invalidated.'); return Promise.resolve(undefined); },
      onMessage: { addListener: (fn: Function) => runtimeListeners.add(fn), removeListener: (fn: Function) => runtimeListeners.delete(fn) },
    }, storage: { onChanged: { addListener: (fn: Function) => storageListeners.add(fn), removeListener: (fn: Function) => storageListeners.delete(fn) } } },
  };
  try {
    runInNewContext(bundle.outputFiles[0].text, context);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(context.fixtureMounts, 1); assert.equal(intervals.size, 1); assert.equal(runtimeListeners.size, 2);
    // Reinjecting on the same document and an ordinary SPA mutation cannot mount twice.
    runInNewContext(bundle.outputFiles[0].text, context);
    window.location.href = 'https://tv.youtube.com/watch?v=fixture'; window.document.body.append(window.document.createElement('div'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(context.fixtureMounts, 1); assert.equal(intervals.size, 1);
    invalid = true;
    const host = window.document.getElementById('yttv-desktop-local-beta')!;
    (host.shadowRoot!.querySelector('.toggle') as any).click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(context.fixtureUnmounts, 1); assert.equal(intervals.size, 0); assert.equal(timeouts.size, 0);
    assert.equal(runtimeListeners.size, 0); assert.equal(storageListeners.size, 0); assert(disconnects >= 1);
    assert.equal(host.shadowRoot!.querySelectorAll('[role="status"]').length, 1);
    assert.match(host.shadowRoot!.textContent!, /Refresh this YouTube TV page/);
    const stoppedCalls = calls;
    window.document.body.append(window.document.createElement('div'));
    (host.shadowRoot!.querySelector('.toggle') as any).click();
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(calls, stoppedCalls);
    const video = window.document.querySelector('video')!; video.muted = false;
    video.dispatchEvent(new window.Event('playing', { bubbles: true })); assert.equal(video.muted, true);
  } finally {
    for (const id of intervals) clearInterval(id); for (const id of timeouts) clearTimeout(id); await window.happyDOM.abort();
  }
});
