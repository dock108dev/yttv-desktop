import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { resolve } from 'node:path';
import { createDemoBridge } from './demo.js';

// DOM harness only. These tests establish interface behavior, not live service capabilities.
const bundlePromise = build({
  entryPoints: [resolve(process.cwd(), 'packages/ui/src/index.tsx')], bundle: true, write: false,
  format: 'iife', globalName: 'DesktopTVUI', platform: 'browser', target: 'es2022',
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
});
const pause = () => new Promise(resolvePause => setTimeout(resolvePause, 35));

async function setup() {
  const window = new Window({ url: 'http://127.0.0.1:4173/demo.html', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  window.document.body.innerHTML = '<main id="root"></main><video id="host-player"></video>';
  // Evaluation is limited to the locally bundled project source; no remote markup/scripts.
  window.eval(`${(await bundlePromise).outputFiles![0]!.text}\nwindow.DesktopTVUI = DesktopTVUI;`);
  const api = (window as unknown as { DesktopTVUI: { mountDesktop: (root: unknown, bridge: unknown, options: unknown) => () => void } }).DesktopTVUI;
  const bridge = createDemoBridge();
  const unmount = api.mountDesktop(window.document.getElementById('root'), bridge, { demo: true });
  return { window, bridge, unmount };
}

test('preview is disclosed, fixtures cannot Watch/Add, favorite settings update through bridge', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    await pause();
    const document = window.document;
    assert.match(document.body.textContent ?? '', /LOCAL PREVIEW/);
    assert.match(document.body.textContent ?? '', /No authentication, live scores or video playback/);
    assert.equal(document.querySelectorAll('.guide-row').length, 14);
    assert.equal(document.querySelectorAll('.guide-row-actions button:not([disabled])').length, 0);
    const first = document.querySelector('.favorite-toggle') as unknown as { click(): void };
    const before = (await bridge.getSnapshot()).preferences.favorites.length;
    first.click(); await pause();
    assert.equal((await bridge.getSnapshot()).preferences.favorites.length, before - 1);
    assert.equal(document.querySelectorAll('.favorite-toggle.is-favorite').length, before - 1);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('workspace shortcuts preserve typing and host-player controls; sports remains fixture only', async () => {
  const { window, unmount } = await setup();
  try {
    await pause();
    const document = window.document;
    const input = document.querySelector('input')!;
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true }));
    await pause();
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    document.querySelector('#host-player')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true }));
    await pause();
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true }));
    await pause();
    assert.equal(document.querySelector('h1')?.textContent, 'Sports');
    assert.match(document.body.textContent ?? '', /FIXTURE LAB/);
    assert.ok(document.querySelectorAll('.sports-card').length >= 3);
    assert.equal(document.querySelectorAll('.sports-card-actions .button:nth-child(2):not([disabled])').length, 0);
    assert.match(document.body.textContent ?? '', /All playback muted/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('managed window screen makes separate original players and muted focus explicit', async () => {
  const { window, unmount } = await setup();
  try {
    await pause();
    window.document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q', bubbles: true, composed: true }));
    await pause();
    assert.equal(window.document.querySelector('h1')?.textContent, 'QuadBox');
    assert.match(window.document.body.textContent ?? '', /does not compose protected video/);
    assert.match(window.document.body.textContent ?? '', /Night mode is locked/);
    assert.equal(window.document.querySelectorAll('.pane-window-surface video').length, 0);
    assert.ok(window.document.querySelector('.heading-actions .button[disabled]'));
  } finally { unmount(); await window.happyDOM.abort(); }
});
