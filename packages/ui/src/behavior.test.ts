import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { resolve } from 'node:path';
import { createDemoBridge } from './demo.js';

// DOM harness only. These tests establish interface behavior, not live service capabilities.
const bundlePromise = build({
  stdin: { contents: "export { mountDesktop } from './packages/ui/src/index.tsx'; export { act } from 'react';", resolveDir: resolve(process.cwd()), loader: 'tsx' }, bundle: true, write: false,
  format: 'iife', globalName: 'DesktopTVUI', platform: 'browser', target: 'es2022',
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' },
});
type HarnessAPI = {
  mountDesktop: (root: unknown, bridge: unknown, options: unknown) => () => void;
  act: (callback: () => void | Promise<void>) => Promise<void>;
};
const harness = (window: Window) => (window as unknown as { DesktopTVUI: HarnessAPI }).DesktopTVUI;
// React's test scheduler flushes commits/effects without wall-clock assumptions.
const settle = (window: Window, action: () => void | Promise<void> = async () => {}) => harness(window).act(action);

async function setup(mockNavigation = false, installed = false, polling = false) {
  const window = new Window({ url: 'http://127.0.0.1:4173/demo.html', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  // Happy DOM lacks the browser task channel used by async act and throws
  // for DevTools profiling marks. Supply only these test-environment seams.
  Object.defineProperty(window, 'MessageChannel', { value: class {
    port1 = { onmessage: null as null | (() => void) };
    port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) };
  } });
  window.console.timeStamp = () => {};
  const sportsTimers: Array<() => void> = [];
  if (polling) {
    const nativeInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: any, interval: number, ...args: any[]) => {
      if (interval === 60_000) { sportsTimers.push(handler); return 999999; }
      return nativeInterval(handler, interval, ...args);
    }) as typeof window.setInterval;
  }
  window.document.body.innerHTML = '<main id="root"></main><video id="host-player"></video>';
  // Evaluation is limited to the locally bundled project source; no remote markup/scripts.
  window.eval(`${(await bundlePromise).outputFiles![0]!.text}\nwindow.DesktopTVUI = DesktopTVUI;`);
  const api = harness(window);
  const bridge = createDemoBridge();
  const navigated: string[] = [];
  if (installed) {
    const original = bridge.getSnapshot.bind(bridge);
    bridge.getSnapshot = async () => ({ ...await original(), mode: 'extension' });
  }
  if (mockNavigation) {
    const fixtureSnapshot = bridge.getSnapshot.bind(bridge);
    bridge.getSnapshot = async () => {
      const snapshot = await fixtureSnapshot();
      return { ...snapshot, mode: 'extension', capabilities: { ...snapshot.capabilities, navigation: true }, guide: snapshot.guide.map(entry => ({ ...entry, available: true, evidenceClass: 'LIVE', target: { kind: 'navigation', channelId: entry.channel.id, url: 'https://tv.youtube.com/watch?v=synthetic-test', verifiedAt: new Date().toISOString(), evidenceClass: 'LIVE' } })) };
    };
    bridge.navigateChannel = async id => { navigated.push(id); return { ok: true }; };
  }
  let unmount = () => {};
  try {
    // Initial snapshot and subscription must precede refresh/actions.
    await settle(window, async () => { unmount = api.mountDesktop(window.document.getElementById('root'), bridge, { demo: !installed }); });
    return { window, bridge, unmount, navigated, sportsTimers };
  } catch (error) {
    unmount(); await window.happyDOM.abort(); throw error;
  }
}

test('installed Sports uses guide programs without provider polling; unloaded is distinct from no matches', async () => {
  const { window, bridge, unmount, sportsTimers } = await setup(false, true, true);
  try {
    const base = await bridge.getSnapshot();
    bridge.getSnapshot = async () => ({ ...base, guide: [] }); await settle(window, async () => { await bridge.refresh!(); });
    await settle(window, async () => { window.document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true })); });
    assert.match(window.document.body.textContent!, /Guide not loaded/);
    assert.equal(sportsTimers.length, 0);
    assert.doesNotMatch(window.document.body.textContent!, /API key|relay|awaits approval|Refresh NBA/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('guide Sports searches actual text, labels studio/replay/next/cache and dispatches guarded current Watch/Add', async () => {
  const { window, bridge, unmount } = await setup(false, true);
  const calls: unknown[] = [];
  // An observation precedes the mounted UI clock, just as a real snapshot does.
  const base = await bridge.getSnapshot(); const stamp = base.observedAt!;
  const entry = { ...base.guide[0], evidenceClass: 'LIVE' as const, available: true, observedAt: stamp,
    target: { kind: 'navigation' as const, channelId: base.guide[0].channel.id, url: 'https://tv.youtube.com/watch?v=synthetic', verifiedAt: stamp, evidenceClass: 'LIVE' as const },
    programs: [{ title: 'WNBA Countdown', context: 'CURRENT' as const }, { title: 'Dallas Wings vs. Golden State Valkyries · WNBA', context: 'NEXT' as const }] };
  const cached = { ...entry, channel: { id: 'yttv:cache', name: 'Cached channel' }, metadataSource: 'CACHED' as const, programs: [{title: 'NHL Replay', context: 'CURRENT' as const}] };
  bridge.getSnapshot = async () => ({ ...base, guide: [entry, cached], capabilities: { ...base.capabilities, navigation: true, managedWindows: true }, panes: [] });
  bridge.watchProgram = async (...args) => { calls.push(['watch', ...args]); return {ok: true}; };
  bridge.addProgram = async (...args) => { calls.push(['add', ...args]); return {ok: true}; };
  try {
    await settle(window, async () => { await bridge.refresh!(); });
    const doc = window.document;
    await settle(window, async () => { doc.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', {key:'s', bubbles:true})); });
    assert.equal(doc.querySelectorAll('.sports-card').length, 3);
    assert.match(doc.body.textContent!, /Studio \/ analysis/); assert.match(doc.body.textContent!, /Replay/); assert.match(doc.body.textContent!, /Next listing/);
    const cards = doc.querySelectorAll('.sports-card');
    assert.equal(cards[0].querySelectorAll('button:not([disabled])').length, 2);
    assert.equal(cards[1].querySelectorAll('button:not([disabled])').length, 0);
    assert.equal(cards[2].querySelectorAll('button:not([disabled])').length, 0);
    await settle(window, async () => { (cards[0].querySelector('button') as any).click(); });
    assert.equal(JSON.stringify(calls[0]), JSON.stringify(['watch', entry.channel.id, 'WNBA Countdown', stamp]));
    const input = doc.querySelector('input[placeholder="Search program, team or competition"]') as any;
    const search = async (value: string) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value); await settle(window, async () => { input.dispatchEvent(new window.Event('input',{bubbles:true})); }); };
    await search('Valkyries'); assert.equal(doc.querySelectorAll('.sports-card').length,1);
    await search('missing team'); assert.match(doc.body.textContent!, /No matching programs/);
    await search(''); await settle(window, async () => { (doc.querySelector('.sports-card button:nth-child(2)') as any).click(); });
    assert.equal(JSON.stringify(calls[1]), JSON.stringify(['add',entry.channel.id,'WNBA Countdown',stamp]));
  } finally {unmount(); await window.happyDOM.abort();}
});

test('preview is disclosed, fixtures cannot Watch/Add, favorite settings update through bridge', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    await settle(window);
    const document = window.document;
    assert.match(document.body.textContent ?? '', /LOCAL PREVIEW/);
    assert.match(document.body.textContent ?? '', /No authentication, live scores or video playback/);
    assert.equal(document.querySelectorAll('.guide-row').length, 14);
    assert.equal(document.querySelectorAll('.guide-row-actions button:not([disabled])').length, 0);
    const first = document.querySelector('.favorite-toggle') as unknown as { click(): void };
    const before = (await bridge.getSnapshot()).preferences.favorites.length;
    await settle(window, async () => { first.click(); });
    assert.equal((await bridge.getSnapshot()).preferences.favorites.length, before - 1);
    assert.equal(document.querySelectorAll('.favorite-toggle.is-favorite').length, before - 1);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('workspace shortcuts preserve typing and host-player controls; sports remains fixture only', async () => {
  const { window, unmount } = await setup();
  try {
    await settle(window);
    const document = window.document;
    const input = document.querySelector('input')!;
    await settle(window, async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true })); });
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    await settle(window, async () => { document.querySelector('#host-player')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true })); });
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    await settle(window, async () => { document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true })); });
    assert.equal(document.querySelector('h1')?.textContent, 'Sports');
    assert.match(document.body.textContent ?? '', /FIXTURE LAB/);
    assert.ok(document.querySelectorAll('.sports-card').length >= 3);
    assert.equal(document.querySelectorAll('.sports-card-actions .button:nth-child(2):not([disabled])').length, 0);
    assert.match(document.body.textContent ?? '', /Player unknown · Tab unknown/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('managed window screen makes separate original players and audio selection explicit', async () => {
  const { window, unmount } = await setup();
  try {
    await settle(window);
    await settle(window, async () => { window.document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q', bubbles: true, composed: true })); });
    assert.equal(window.document.querySelector('h1')?.textContent, 'QuadBox');
    assert.match(window.document.body.textContent ?? '', /Video stays in separate YouTube TV windows/);
    assert.match(window.document.body.textContent ?? '', /Select audio also brings that window forward/);
    assert.equal(window.document.querySelectorAll('.pane-window-surface video').length, 0);
    assert.ok(window.document.querySelector('.heading-actions .button[disabled]'));
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('saved bindings drive dispatch and help; conflicts are rejected without losing saved keys', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    await settle(window);
    const document = window.document;
    await settle(window, async () => { document.querySelector('.rail-bottom button')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    const change = (label: string, value: string) => {
      const input = document.querySelector(`input[aria-label="${label} key"]`) as any;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const save = () => (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save shortcuts') as any).click();
    change('Sports', 'g'); await settle(window); save(); await settle(window);
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /more than once/);
    assert.equal((await bridge.getSnapshot()).preferences.keyboardMappings.sports, 's');
    change('Sports', 'x'); await settle(window); save(); await settle(window);
    assert.equal((await bridge.getSnapshot()).preferences.keyboardMappings.sports, 'x');
    assert.match(document.querySelector('input[aria-label="Sports key"]')!.parentElement!.textContent!, /x/);
    await settle(window, async () => { document.querySelector('[aria-label="Close keyboard shortcuts"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    const app = document.querySelector('.desktop-app')!;
    await settle(window, async () => { app.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true })); });
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    await settle(window, async () => { app.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true })); });
    assert.equal(document.querySelector('h1')?.textContent, 'Sports');
    assert.match(document.querySelector('.nav-item[aria-current="page"]')?.getAttribute('title') ?? '', /x/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('guide rows navigate with visible focus; controls, editable ancestors and browser chords own their keys', async () => {
  const { window, unmount } = await setup();
  try {
    await settle(window); const document = window.document;
    const app = document.querySelector('.desktop-app')!;
    const key = (target: any, value: string, extras = {}) => {
      const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, cancelable: true, ...extras });
      void settle(window, () => { target.dispatchEvent(event); }); return event;
    };
    key(app, 'ArrowDown'); await settle(window);
    const rows = document.querySelectorAll('.guide-row');
    assert.equal(document.activeElement, rows[0]);
    key(rows[0], 'ArrowDown'); await settle(window);
    assert.equal(document.activeElement, rows[1]); assert.equal(rows[1].getAttribute('tabindex'), '0');
    key(rows[1], 'ArrowLeft'); await settle(window);
    assert.equal(document.activeElement, rows[1].querySelector('button'));
    assert.equal(key(document.activeElement, 's').defaultPrevented, false); await settle(window);
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    assert.equal(key(app, 's', { metaKey: true }).defaultPrevented, false);
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', 'plaintext-only');
    const child = document.createElement('span'); editable.append(child); app.append(editable);
    assert.equal(key(child, 's').defaultPrevented, false);
    assert.equal(key(rows[1], 'Enter').defaultPrevented, false, 'fixture row cannot navigate');
  } finally { unmount(); await window.happyDOM.abort(); }
});


test('configured activation dispatches the focused synthetic eligible row and teardown removes keyboard handling', async () => {
  const { window, bridge, unmount, navigated } = await setup(true);
  try {
    // Direct fixture patches can report unavailable Node storage before notifying.
    // Publish the changed snapshot explicitly, as the UI action runner does.
    await settle(window, async () => { await bridge.setPreference({ keyboardMappings: { ...(await bridge.getSnapshot()).preferences.keyboardMappings, expand: 'z' } }); await bridge.refresh!(); });
    await settle(window);
    const row = window.document.querySelector('.guide-row')!;
    await settle(window, async () => { row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })); });
    assert.equal(navigated.length, 0);
    await settle(window, async () => { row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true })); });
    assert.equal(navigated.length, 1); assert.equal(navigated[0], 'fixture-channel:espn');
    unmount();
    await settle(window, async () => { row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true })); });
    assert.equal(navigated.length, 1);
  } finally { await window.happyDOM.abort(); }
});

test('native order restoration keeps favorites, hidden channels, bindings and history', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    const baseline = (await bridge.getSnapshot()).preferences;
    await settle(window, async () => { await bridge.setPreference({ channelOrder: ['fixture-channel:fox', 'fixture-channel:espn'], hiddenChannels: ['fixture-channel:fox'] }); await bridge.refresh!(); });
    const document = window.document;
    await settle(window, async () => { (Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Customize') as any).click(); });
    await settle(window, async () => { (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Use native order') as any).click(); });
    const after = (await bridge.getSnapshot()).preferences;
    assert.deepEqual(after.channelOrder, []);
    assert.deepEqual(after.hiddenChannels, ['fixture-channel:fox']);
    for (const key of ['favorites', 'keyboardMappings', 'currentChannel', 'previousChannel', 'recentChannels'] as const) assert.deepEqual(after[key], baseline[key]);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('cached guide and saved Watch history stay understandable with disabled navigation and native recovery', async () => {
  const { window, bridge, unmount, navigated } = await setup();
  try {
    const base = await bridge.getSnapshot(); let recovery = 0;
    bridge.getSnapshot = async () => ({ ...base, mode: 'extension', connection: 'connected', currentConfirmed: false,
      guideObservedAt: '2026-10-01T16:00:00Z', currentChannelId: base.guide[0].channel.id,
      preferences: { ...base.preferences, currentChannel: base.guide[0].channel.id, previousChannel: base.guide[1].channel.id, favorites: [base.guide[0].channel.id, 'yttv:synthetic-missing'], recentChannels: [base.guide[0].channel.id, 'yttv:synthetic-missing'] },
      guide: base.guide.map(row => ({ ...row, evidenceClass: 'LIVE', metadataSource: 'CACHED', target: null, available: false })),
      capabilities: { ...base.capabilities, navigation: false } });
    bridge.recoverGuide = async () => { recovery++; return { ok: true }; };
    // Remount with extension mode so the recovery panel is included.
    unmount();
    const api = harness(window);
    const cleanup = api.mountDesktop(window.document.getElementById('root'), bridge, { demo: false });
    try {
      await settle(window); const document = window.document;
      assert.match(document.body.textContent!, /Last observed program/);
      assert(document.querySelector('.guide-footer')!.textContent!.includes(new Date('2026-10-01T16:00:00Z').toLocaleString()));
      assert.equal(document.querySelector('.connection-help')!.closest('details'), null);
      assert.equal(document.querySelector('.audio-controls details')!.hasAttribute('open'), false);
      assert.equal(document.querySelectorAll('.guide-row-actions button:not([disabled])').length, 0);
      await settle(window, async () => { (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Open YouTube TV Live') as any).click(); }); assert.equal(recovery, 1);
      await settle(window, async () => { document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true, composed: true })); });
      assert.match(document.body.textContent!, /Last confirmed channel · saved/);
      assert.match(document.body.textContent!, /Saved channel \(synthetic-missing\)/);
      assert.equal(document.querySelectorAll('.quick-channel:not([disabled])').length, 0);
      assert(document.querySelector('.previous-strip button[disabled]'));
      assert.equal(navigated.length, 0);
      assert.doesNotMatch(document.body.textContent!, /Playing in the original supported browser tab/);
    } finally { cleanup(); }
  } finally { await window.happyDOM.abort(); }
});


test('visible audio controls dispatch selected mute volume and scoped mute-all without claiming heard sound', async () => {
  const { window, bridge, unmount } = await setup();
  const calls: unknown[] = []; const original = bridge.getSnapshot.bind(bridge);
  bridge.getSnapshot = async () => ({ ...(await original()), playback: { playing: true, muted: false, playerMuted: false, tabMuted: false, volume: .37 },
    capabilities: { navigation: false, guide: true, managedWindows: false, audio: true } });
  bridge.setAudio = async change => { calls.push(change); return { ok: true }; };
  bridge.mute = async () => { calls.push('mute-all'); return { ok: true }; };
  bridge.focusOriginal = async () => { calls.push('original'); return { ok: true }; };
  try {
    await settle(window, async () => { await bridge.refresh!(); });
    const doc = window.document;
    assert.match(doc.body.textContent!, /Player enabled · Tab enabled · Site unknown · Volume 37%/);
    const button = (name: string) => [...doc.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
    await settle(window, async () => { button('Mute selected').click(); });
    assert.equal(JSON.stringify(calls[0]), JSON.stringify({ muted: true }));
    await settle(window, async () => { button('Mute all').click(); }); assert.equal(calls[1], 'mute-all');
    await settle(window, async () => { button('Original player').click(); }); assert.equal(calls[2], 'original');
    const slider = doc.querySelector('input[aria-label="Selected player volume"]') as any;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(slider, '20');
    await settle(window, async () => { slider.dispatchEvent(new window.Event('input', { bubbles: true })); });
    assert.equal(JSON.stringify(calls[3]), JSON.stringify({ volume: .2 }));
    assert.match(doc.body.textContent!, /audible sound requires listening/i);
  } finally { unmount(); await window.happyDOM.abort(); }
});
