import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { resolve } from 'node:path';
import { createDemoBridge } from './demo.js';
import { normalizeNBAGame } from '../../sports-engine/src/balldontlie';
import { unavailableSports, type LiveSportsSnapshot } from '../../sports-engine/src/live';

// DOM harness only. These tests establish interface behavior, not live service capabilities.
const bundlePromise = build({
  entryPoints: [resolve(process.cwd(), 'packages/ui/src/index.tsx')], bundle: true, write: false,
  format: 'iife', globalName: 'DesktopTVUI', platform: 'browser', target: 'es2022',
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
});
const pause = () => new Promise(resolvePause => setTimeout(resolvePause, 35));

async function setup(mockNavigation = false, sports?: LiveSportsSnapshot, polling = false) {
  const window = new Window({ url: 'http://127.0.0.1:4173/demo.html', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
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
  const api = (window as unknown as { DesktopTVUI: { mountDesktop: (root: unknown, bridge: unknown, options: unknown) => () => void } }).DesktopTVUI;
  const bridge = createDemoBridge();
  const navigated: string[] = [];
  const eventIntents: string[] = [];
  if (sports) {
    const original = bridge.getSnapshot.bind(bridge);
    bridge.getSnapshot = async () => ({ ...await original(), mode: 'extension', sports });
    bridge.watchEvent = async id => { eventIntents.push(`watch:${id}`); return { ok: true }; };
    bridge.addEvent = async id => { eventIntents.push(`add:${id}`); return { ok: true }; };
    if (polling) bridge.refreshSports = async () => { eventIntents.push('refresh'); return { ok: true }; };
  }
  if (mockNavigation) {
    const fixtureSnapshot = bridge.getSnapshot.bind(bridge);
    bridge.getSnapshot = async () => {
      const snapshot = await fixtureSnapshot();
      return { ...snapshot, mode: 'extension', capabilities: { ...snapshot.capabilities, navigation: true }, guide: snapshot.guide.map(entry => ({ ...entry, available: true, evidenceClass: 'LIVE', target: { kind: 'navigation', channelId: entry.channel.id, url: 'https://tv.youtube.com/watch?v=synthetic-test', verifiedAt: new Date().toISOString(), evidenceClass: 'LIVE' } })) };
    };
    bridge.navigateChannel = async id => { navigated.push(id); return { ok: true }; };
  }
  const unmount = api.mountDesktop(window.document.getElementById('root'), bridge, { demo: !sports });
  return { window, bridge, unmount, navigated, eventIntents, sportsTimers };
}

test('a closed mounted drawer grants no Sports polling demand; reopening restores bounded demand', async () => {
  const { window, unmount, eventIntents, sportsTimers } = await setup(false, unavailableSports(), true);
  try {
    await pause(); const document = window.document;
    document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true })); await pause();
    assert.equal(eventIntents.length, 1); assert.equal(sportsTimers.length, 1);
    const drawer = document.getElementById('root') as any;
    drawer.style.display = 'none'; sportsTimers[0](); assert.equal(eventIntents.length, 1);
    drawer.style.display = 'block'; sportsTimers[0](); assert.equal(eventIntents.length, 2);
    assert.equal(document.querySelectorAll('.sports-card').length, 0);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('installed Sports starts honestly unavailable; Fixture Lab is explicit and unsupported leagues stay empty', async () => {
  const { window, unmount } = await setup(false, unavailableSports());
  try {
    await pause(); const document = window.document;
    (document.querySelector('.desktop-app') as any).dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true })); await pause();
    assert.equal(document.querySelectorAll('.sports-card').length, 0); assert.match(document.body.textContent!, /NBA connection awaits approval/);
    const lab = [...document.querySelectorAll('button')].find(button => button.textContent === 'Open Fixture Lab')!;
    (lab as any).click(); await pause(); assert.ok(document.querySelectorAll('.sports-card').length > 0);
    assert.equal(document.querySelectorAll('.sports-card-actions button:not([disabled])').length, document.querySelectorAll('.sports-card').length);
    ([...document.querySelectorAll('button')].find(button => button.textContent === 'Return to NBA') as any).click(); await pause();
    ([...document.querySelectorAll('button')].find(button => button.textContent === 'MLB · unavailable') as any).click(); await pause();
    assert.equal(document.querySelectorAll('.sports-card').length, 0); assert.match(document.body.textContent!, /League unavailable/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('provider event remains team-searchable without channel knowledge and mapping failure disables actions', async () => {
  const stamp = new Date().toISOString();
  const event = normalizeNBAGame({ id: 9001, datetime: null, status_state: 'suspended', status: 'Suspended',
    home_team: { id: 20, full_name: 'New York Knicks', name: 'Knicks' }, visitor_team: { id: 2, full_name: 'Boston Celtics', name: 'Celtics' } }, stamp);
  const { window, unmount, eventIntents } = await setup(false, { ...unavailableSports(), state: 'READY', events: [event] });
  try {
    await pause(); const document = window.document;
    document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true })); await pause();
    const input = document.querySelector('input[placeholder="Search team or league"]') as any;
    input.value = 'Knicks'; input.dispatchEvent(new window.Event('input', { bubbles: true })); await pause();
    assert.equal(document.querySelectorAll('.sports-card').length, 1);
    assert.match(document.querySelector('.sports-card')!.textContent!, /SUSPENDED/);
    assert.match(document.body.textContent!, /Scheduled: unknown/); assert.match(document.body.textContent!, /Source updated: unknown/);
    assert.match(document.body.textContent!, /Network unknown/); assert.match(document.body.textContent!, /Watch\/Add unavailable/);
    assert.equal(document.querySelectorAll('.sports-card-actions button:not([disabled])').length, 0); assert.deepEqual(eventIntents, []);
  } finally { unmount(); await window.happyDOM.abort(); }
});

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
    assert.match(document.body.textContent ?? '', /Player unknown · Tab unknown/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('managed window screen makes separate original players and audio selection explicit', async () => {
  const { window, unmount } = await setup();
  try {
    await pause();
    window.document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q', bubbles: true, composed: true }));
    await pause();
    assert.equal(window.document.querySelector('h1')?.textContent, 'QuadBox');
    assert.match(window.document.body.textContent ?? '', /does not compose protected video/);
    assert.match(window.document.body.textContent ?? '', /Selecting a feed transfers audio and focus/);
    assert.equal(window.document.querySelectorAll('.pane-window-surface video').length, 0);
    assert.ok(window.document.querySelector('.heading-actions .button[disabled]'));
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('saved bindings drive dispatch and help; conflicts are rejected without losing saved keys', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    await pause();
    const document = window.document;
    document.querySelector('.rail-bottom button')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await pause();
    const change = (label: string, value: string) => {
      const input = document.querySelector(`input[aria-label="${label} key"]`) as any;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const save = () => (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save shortcuts') as any).click();
    change('Sports', 'g'); await pause(); save(); await pause();
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /more than once/);
    assert.equal((await bridge.getSnapshot()).preferences.keyboardMappings.sports, 's');
    change('Sports', 'x'); await pause(); save(); await pause();
    assert.equal((await bridge.getSnapshot()).preferences.keyboardMappings.sports, 'x');
    assert.match(document.querySelector('input[aria-label="Sports key"]')!.parentElement!.textContent!, /x/);
    document.querySelector('[aria-label="Close keyboard shortcuts"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await pause();
    const app = document.querySelector('.desktop-app')!;
    app.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true })); await pause();
    assert.equal(document.querySelector('h1')?.textContent, 'Guide');
    app.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true })); await pause();
    assert.equal(document.querySelector('h1')?.textContent, 'Sports');
    assert.match(document.querySelector('.nav-item[aria-current="page"]')?.getAttribute('title') ?? '', /x/);
  } finally { unmount(); await window.happyDOM.abort(); }
});

test('guide rows navigate with visible focus; controls, editable ancestors and browser chords own their keys', async () => {
  const { window, unmount } = await setup();
  try {
    await pause(); const document = window.document;
    const app = document.querySelector('.desktop-app')!;
    const key = (target: any, value: string, extras = {}) => {
      const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, cancelable: true, ...extras });
      target.dispatchEvent(event); return event;
    };
    key(app, 'ArrowDown'); await pause();
    const rows = document.querySelectorAll('.guide-row');
    assert.equal(document.activeElement, rows[0]);
    key(rows[0], 'ArrowDown'); await pause();
    assert.equal(document.activeElement, rows[1]); assert.equal(rows[1].getAttribute('tabindex'), '0');
    key(rows[1], 'ArrowLeft'); await pause();
    assert.equal(document.activeElement, rows[1].querySelector('button'));
    assert.equal(key(document.activeElement, 's').defaultPrevented, false); await pause();
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
    await bridge.setPreference({ keyboardMappings: { ...(await bridge.getSnapshot()).preferences.keyboardMappings, expand: 'z' } });
    await pause();
    const row = window.document.querySelector('.guide-row')!;
    row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })); await pause();
    assert.equal(navigated.length, 0);
    row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true })); await pause();
    assert.equal(navigated.length, 1); assert.equal(navigated[0], 'fixture-channel:espn');
    unmount();
    row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true })); await pause();
    assert.equal(navigated.length, 1);
  } finally { await window.happyDOM.abort(); }
});

test('native order restoration keeps favorites, hidden channels, bindings and history', async () => {
  const { window, bridge, unmount } = await setup();
  try {
    const baseline = (await bridge.getSnapshot()).preferences;
    await bridge.setPreference({ channelOrder: ['fixture-channel:fox', 'fixture-channel:espn'], hiddenChannels: ['fixture-channel:fox'] });
    await pause();
    const document = window.document;
    (Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Customize') as any).click();
    await pause();
    (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Use native order') as any).click();
    await pause();
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
    const api = (window as unknown as { DesktopTVUI: { mountDesktop: (root: unknown, bridge: unknown, options: unknown) => () => void } }).DesktopTVUI;
    const cleanup = api.mountDesktop(window.document.getElementById('root'), bridge, { demo: false });
    try {
      await pause(); const document = window.document;
      assert.match(document.body.textContent!, /LAST OBSERVED PROGRAM/);
      assert.match(document.querySelector('.guide-footer')!.textContent!, /2026-10-01T16:00:00Z/);
      assert.equal(document.querySelectorAll('.guide-row-actions button:not([disabled])').length, 0);
      (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Open native Live') as any).click(); await pause(); assert.equal(recovery, 1);
      document.querySelector('.desktop-app')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true, composed: true })); await pause();
      assert.match(document.body.textContent!, /LAST CONFIRMED CHANNEL · SAVED/);
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
    await bridge.refresh!(); await pause();
    const doc = window.document;
    assert.match(doc.body.textContent!, /Player enabled · Tab enabled · Site unknown · Volume 37%/);
    const button = (name: string) => [...doc.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
    button('Mute selected').click(); await pause();
    assert.equal(JSON.stringify(calls[0]), JSON.stringify({ muted: true }));
    button('Mute all').click(); await pause(); assert.equal(calls[1], 'mute-all');
    button('Original player').click(); await pause(); assert.equal(calls[2], 'original');
    const slider = doc.querySelector('input[aria-label="Selected player volume"]') as any;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(slider, '20');
    slider.dispatchEvent(new window.Event('input', { bubbles: true })); await pause();
    assert.equal(JSON.stringify(calls[3]), JSON.stringify({ volume: .2 }));
    assert.match(doc.body.textContent!, /audible sound requires listening/i);
  } finally { unmount(); await window.happyDOM.abort(); }
});
