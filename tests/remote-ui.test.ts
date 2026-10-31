import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { resolve } from 'node:path';
import { areaIntent } from '../packages/quadbox/src/geometry';
import { createDemoBridge } from '../packages/ui/src/demo';
const bundle = build({ stdin: { contents: "export { mountRemote } from './apps/chrome-extension/src/remote.tsx'; export { act } from 'react';", resolveDir: resolve(process.cwd()), loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'RemoteUI', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' } });
test('New show is available from an empty remote and reflects startup and the four-show limit', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  const commands: any[] = [];
  (window as any).chrome = { runtime: { sendMessage: async (command: any) => { commands.push(command); return { ok: true, message: 'Opening your first show.' }; } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`); window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, mode: 'extension' as const, panes: [] as typeof base.panes, openingDefaultShow: false };
  let listener = () => {}, dispose = () => {}; bridge.getSnapshot = () => structuredClone(state); bridge.subscribe = fn => { listener = fn; return () => {}; }; bridge.refresh = async () => { listener(); return { ok: true }; };
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.equal(button('New show').disabled, false); assert.equal(button('Pick a channel'), undefined);
    assert.equal(button('Arrange shows').disabled, false, 'layout planning is available before creating shows');
    assert.match(window.document.querySelector('.first-use')!.textContent!, /start your last channel/);
    await api.act(async () => button('New show').click());
    assert.deepEqual(commands.map(c => c.type), ['NEW_SHOW']);
    state.openingDefaultShow = true; await api.act(async () => listener()); assert.equal(button('Opening…').disabled, true);
    state.openingDefaultShow = false; state.panes = [{ id: 'main', isMain: true, channelId: 'yttv:cbs', channelName: 'CBS', muted: true }]; await api.act(async () => listener());
    assert.equal(button('New show').disabled, false); assert(button('Pick a channel'));
    state.panes = Array.from({ length: 4 }, (_, i) => ({ ...state.panes[0], id: i === 0 ? 'main' : `pane-${i}`, isMain: i === 0 }));
    await api.act(async () => listener()); assert.equal(button('New show').disabled, true);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('compact remote reconnects snapshot, separates focus/audio, searches with keyboard-accessible controls and cancels area without writes', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  Object.assign(window.screen, { availWidth: 1440, availHeight: 900, availLeft: -1440, availTop: 30 });
  const commands: any[] = []; let refuseArea = false;
  (window as any).chrome = { runtime: { sendMessage: async (c: any) => { commands.push(c); return refuseArea && c.type === 'SET_TV_AREA' ? { ok: false, reason: 'Area could not be saved.' } : { ok: true }; } }, permissions: { request: async () => { commands.push('permission'); return false; } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`);
  window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot(), calls: string[] = [];
  bridge.getSnapshot = async () => ({ ...base, mode: 'extension', panes: [{ id: 'main', isMain: true, channelId: base.guide[0].channel.id, channelName: 'Original player', muted: true, volume: .37 }], activePaneId: 'main' });
  bridge.focusPane = async id => { calls.push(`focus:${id}`); return { ok: true }; };
  bridge.selectPane = async id => { calls.push(`audio:${id}`); return { ok: true }; };
  let dispose: () => void = () => {};
  const click = async (text: string) => { const button = [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!; assert(button); await api.act(async () => button.click()); };
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.match(window.document.body.textContent!, /1 \/ 4 windows/); assert.equal(commands.length, 0);
    await click('Focus'); assert.deepEqual(calls, ['focus:main']); await click('Pick a channel');
    const search = window.document.querySelector('input[type=search]')!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'nonmatching channel');
    await api.act(async () => search.dispatchEvent(new window.Event('input', { bubbles: true })));
    assert.match(window.document.body.textContent!, /No available matches yet/); assert(window.document.querySelector('[aria-label="Content picker"]'));
    await click('TV area'); assert.equal(window.document.querySelectorAll('input[type=number]').length, 4);
    assert.equal(window.document.activeElement?.textContent, 'Cancel');
    assert(window.document.querySelector('[role=dialog]'));
    await click('Cancel'); assert.equal(commands.length, 0);
    assert.equal(window.document.activeElement?.textContent, 'TV area');
    await click('TV area');
    await click('Apply and start workspace');
    assert.deepEqual(commands.map(c => c.command?.type ?? c.type), ['SET_TV_AREA', 'START_WORKSPACE']);
    assert.equal(window.document.querySelector('[role=dialog]'), null); commands.length = 0;
    refuseArea = true; await click('TV area'); await click('Apply and start workspace');
    assert.deepEqual(commands.map(c => c.command?.type ?? c.type), ['SET_TV_AREA']);
    assert(window.document.querySelector('[role=dialog]')); assert.match(window.document.body.textContent!, /Area could not be saved/);
    await click('Cancel'); commands.length = 0; refuseArea = false;
    await click('TV area'); await click('Choose monitor'); assert.deepEqual(commands, ['permission']); assert.match(window.document.body.textContent!, /denied/);
    await click('Cancel'); await api.act(async () => dispose());
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.match(window.document.body.textContent!, /Original player/); assert.equal(calls.filter(x => x.startsWith('audio')).length, 0);
    await api.act(async () => dispose());
    const monitorWork = { left: -1007, top: -1410, width: 3440, height: 1410 };
    const custom = { left: -900, top: -1350, width: 3200, height: 1280 };
    const intent = areaIntent(monitorWork, custom, false, 'saved-monitor')!;
    (window as any).chrome.permissions.contains = async () => true;
    (window as any).chrome.system = { display: { getInfo: async () => [{ id: 'first', name: 'Monitor', workArea: { left: 0, top: 30, width: 1440, height: 900 } }, { id: 'saved-monitor', name: 'Monitor', workArea: monitorWork }] } };
    bridge.getSnapshot = async () => ({ ...base, workspace: { available: true, enrolled: false, expanded: false, actual: [], notice: 'Saved area', intent }, panes: [{ id: 'main', isMain: true, channelId: base.guide[0].channel.id, channelName: 'Original player', muted: true }], activePaneId: 'main' });
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    commands.length = 0; await click('TV area');
    const values = () => [...window.document.querySelectorAll('input[type=number]')].map(x => Number((x as any).value));
    assert.deepEqual(values(), [-900, -1350, 3200, 1280], 'opening editor retains saved monitor and custom rectangle');
    assert.equal((window.document.querySelector('[role=dialog] select') as any).value, '1');
    assert.match(window.document.body.textContent!, /Monitor 2/); assert.deepEqual(commands, [], 'granted display read requests no permission or writes');
    await click('Cancel'); await click('TV area'); await click('Apply');
    const applied = JSON.parse(JSON.stringify(commands))[0]; assert.equal(applied.displayId, 'saved-monitor'); assert.deepEqual(applied.area, custom);
    assert.equal(commands.length, 1);
    commands.length = 0; (window as any).chrome.permissions.contains = async () => false;
    await click('TV area'); assert.deepEqual(values(), [-900, -1350, 3200, 1280]);
    assert.match(window.document.body.textContent!, /Saved monitor unavailable/); await click('Cancel'); assert.deepEqual(commands, []);

  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('remote keeps picker drafts and focus, uses observed playback toggles, and retains failures separately from success', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  const successTimers: (() => void)[] = [], originalTimer = window.setTimeout.bind(window);
  window.setTimeout = ((fn: any, delay?: number, ...args: any[]) => { if (delay === 5000) successTimers.push(fn); return originalTimer(fn, delay, ...args); }) as typeof window.setTimeout;
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`);
  window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, audioError: 'Native audio connection unavailable.', panes: [{ id: 'main', isMain: true, channelId: 'fixture-channel:espn', channelName: 'ESPN', muted: true, volume: .37, playbackState: 'paused' as 'paused' | 'playing' | 'unavailable' }] };
  let listener = () => {}, dispose = () => {}; const playback: boolean[] = [];
  bridge.getSnapshot = () => structuredClone(state);
  bridge.subscribe = fn => { listener = fn; return () => {}; };
  bridge.refresh = async () => { listener(); return { ok: true }; };
  bridge.setPlayback = async (_, playing) => { playback.push(playing); state.panes[0].playbackState = playing ? 'playing' : 'paused'; return { ok: true, message: 'Playback updated.' }; };
  bridge.setPaneAudio = async () => ({ ok: false, reason: 'Synthetic audio refusal. Use native controls.' });
  bridge.duplicatePane = async () => ({ ok: true, message: 'Window added.' });
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  const click = async (text: string) => { assert(button(text)); await api.act(async () => button(text).click()); };
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.equal(button('Pause'), undefined, 'observed paused state needs only Play');
    await click('Play'); assert.equal(button('Play'), undefined); assert(button('Pause')); assert.deepEqual(playback, [true]);
    assert.match(window.document.querySelector('[role=alert]')!.textContent!, /Native audio connection unavailable/, 'routine success cannot hide audio errors');
    await api.act(async () => successTimers.at(-1)!()); assert.equal(window.document.querySelector('.feedback.success'), null);
    await click('Enable audio'); assert.match(window.document.querySelector('.feedback.error')!.textContent!, /Synthetic audio refusal/);
    const timerCount = successTimers.length; await api.act(async () => listener()); assert.equal(successTimers.length, timerCount, 'failures are not automatically dismissed');
    await click('Pick a channel'); const search = window.document.querySelector('input[type=search]')!;
    assert.equal(window.document.activeElement, search);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'ESPN');
    await api.act(async () => search.dispatchEvent(new window.Event('input', { bubbles: true })));
    await api.act(async () => listener()); assert.equal((search as any).value, 'ESPN'); assert.equal(window.document.activeElement, search);
    await api.act(async () => search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(window.document.querySelector('[aria-label="Content picker"]'), null); assert.equal(window.document.activeElement, button('Pick a channel'));
    await click('Pick a channel'); await click('Add current Original · ESPN'); assert.equal(window.document.activeElement, button('Pick a channel'), 'successful asynchronous choice restores trigger focus after busy clears');
    state.panes[0].playbackState = 'unavailable'; await api.act(async () => listener()); assert(button('Play')); assert(button('Pause'), 'unknown state keeps both native action choices');
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('layout setup gives simple steps, supports all counts and sends full-size drawing to the chosen monitor', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {}; Object.assign(window.screen, { availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 30 });
  const commands: any[] = [], work = { left: 0, top: 30, width: 1920, height: 1040 };
  (window as any).chrome = { runtime: { sendMessage: async (c: any) => { commands.push(c); return { ok: true }; } }, permissions: { contains: async () => true, request: async () => true }, system: { display: { getInfo: async () => [{ id: 'monitor', name: 'Chosen display', workArea: work }] } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`); window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, workspace: { intent: null as ReturnType<typeof areaIntent>, layout: 'auto' as 'auto' | 'top-bottom', enrolled: false, expanded: false, notice: '', actual: [] }, unassignedPlayers: [{ tabId: 8, label: 'Intended existing show' }], panes: [{ id: 'main', isMain: true, channelId: 'original', channelName: 'Original', muted: true }] };
  let listener = () => {}, dispose = () => {}; bridge.getSnapshot = () => structuredClone(state); bridge.subscribe = fn => { listener = fn; return () => {}; }; bridge.refresh = async () => { listener(); return { ok: true }; };
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  const click = async (text: string) => { assert(button(text)); await api.act(async () => button(text).click()); };
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    await click('Arrange shows'); assert.equal(window.document.activeElement?.textContent, 'Cancel');
    await api.act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })));
    assert.equal(window.document.activeElement?.textContent, 'Use small preview instead', 'closed preview fields stay out of the modal tab order');
    await api.act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', cancelable: true })));
    assert.equal(window.document.activeElement?.textContent, 'Cancel');
    assert.equal(button('Save layout').disabled, true); assert.equal(window.document.querySelectorAll('.slot-preview').length, 0, 'first use has no assumed full-monitor rectangle');
    await api.act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(window.document.querySelector('[role=dialog]'), null); assert.equal(window.document.activeElement, button('Arrange shows')); assert.equal(commands.length, 0);
    await click('Arrange shows'); await click('Choose monitor');
    assert.equal(button('Save layout').disabled, true, 'monitor selection alone does not assume full screen');
    const layout = window.document.querySelector('select[aria-label="Show layout"]')!;
    (layout as any).value = 'top-bottom'; await api.act(async () => layout.dispatchEvent(new window.Event('change', { bubbles: true })));
    const count = window.document.querySelector('select[aria-label="Number of shows"]')!;
    (count as any).value = '2'; await api.act(async () => count.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.deepEqual([...window.document.querySelectorAll('.setup-step')].map(e => e.textContent), ['1. Choose your layout', '2. Choose your monitor', '3. Draw and save']);
    (window.document.querySelector('.mini-area-editor summary') as any).click();
    const values = [900, 100, 1000, 950], inputs = [...window.document.querySelectorAll('input[type=number]')];
    for (const [i, input] of inputs.entries()) { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, String(values[i])); await api.act(async () => input.dispatchEvent(new window.Event('input', { bubbles: true }))); }
    assert.deepEqual([...window.document.querySelectorAll('.slot-preview')].map(e => e.textContent), ['Show 1', 'Show 2']);
    assert.equal(button('Save layout').disabled, false); await click('Save layout');
    assert.deepEqual(commands.map(c => c.type), ['SET_TV_AREA', 'APPLY_LAYOUT']); assert.equal(commands[0].layout, 'top-bottom'); assert.equal(commands[0].displayId, 'monitor'); assert.equal(commands[1].type, 'APPLY_LAYOUT');
    assert.equal(window.document.querySelector('[aria-label="Content picker"]'), null, 'existing players are offered for connection before Add');
    state.workspace.intent = areaIntent(work, { left: 900, top: 100, width: 1000, height: 950 }, true, 'monitor'); state.workspace.layout = 'top-bottom'; await api.act(async () => listener());
    commands.length = 0; await click('Arrange shows'); assert.deepEqual(commands.map(c => c.type), ['APPLY_LAYOUT']);
    await click('Connect Intended existing show'); assert.equal(commands.at(-1).type, 'CONNECT_PANE'); assert.equal(commands.at(-1).tabId, 8);
    state.unassignedPlayers = []; state.panes.push({ id: 'connected-8', isMain: false, channelId: 'second', channelName: 'Second', muted: true }); await api.act(async () => listener());
    commands.length = 0; await click('Arrange shows'); assert.deepEqual(commands.map(c => c.type), ['APPLY_LAYOUT']); assert.equal(window.document.querySelector('[role=dialog]'), null);
    assert.match(window.document.querySelector('.window-cards')!.textContent!, /Top · Original.*Bottom · Window/s);
    await click('Change layout');
    const countAgain = window.document.querySelector('select[aria-label="Number of shows"]')!;
    const layoutAgain = window.document.querySelector('select[aria-label="Show layout"]')!;
    (countAgain as any).value = '4'; await api.act(async () => countAgain.dispatchEvent(new window.Event('change', { bubbles: true })));
    (layoutAgain as any).value = 'custom'; await api.act(async () => layoutAgain.dispatchEvent(new window.Event('change', { bubbles: true })));
    commands.length = 0; await click('Draw on monitor');
    assert.equal(commands[0].type, 'OPEN_AREA_PICKER'); assert.equal(commands[0].count, 4); assert.equal(commands[0].mode, 'custom'); assert.equal(commands[0].displayId, 'monitor');
    assert.equal(window.document.querySelector('[role=dialog]'), null);
    await api.act(async () => dispose()); commands.length = 0; await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); }); assert.equal(commands.length, 0);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('queue editing is keyboard accessible, preserves focus after removal, requires replacement choice and reports unavailable storage honestly', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`);
  window.document.body.innerHTML = '<div id="test-root" style="width:320px"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge();
  let dispose = () => {};
  const click = async (text: string) => { const b = [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!; assert(b); assert(!b.disabled); await api.act(async () => b.click()); };
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.match(window.document.body.textContent!, /No videos queued/);
    await click('Add to queue'); await click('Add to queue');
    assert.equal(window.document.querySelectorAll('.mixed-queue li').length, 2);
    await click('Down'); await click('Edit');
    assert.equal(window.document.activeElement?.tagName, 'SELECT');
    await click('Cancel edit'); await click('Remove');
    assert.equal(window.document.activeElement?.textContent, 'Queue (1/100)');
    await click('Play next'); assert.match(window.document.querySelector('.mixed-queue [role=alert]')!.textContent!, /Fixture preview only/);
    await api.act(async () => dispose());
    const state = await bridge.getSnapshot();
    state.mixed!.record!.ownership = state.mixed!.record!.slots.map((s, index) => ({ slotId: s.id, service: 'yttv', tabId: index + 1, windowId: index + 1, ordinaryUrl: 'about:blank', createdHere: true }));
    bridge.getSnapshot = () => state;
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    const select = window.document.querySelector('[aria-label="Queue destination"]')! as any;
    assert.equal(select.value, ''); assert.match(select.textContent, /Choose a replacement/);
    assert.equal([...window.document.querySelectorAll('button')].find(b => b.textContent === 'Play next')!.disabled, true);
    await api.act(async () => dispose());
    state.mixed = { writable: false, error: 'Saved queue unavailable.', states: {} };
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    assert.match(window.document.querySelector('.mixed-queue [role=alert]')!.textContent!, /unavailable/);
    assert.doesNotMatch(window.document.querySelector('.mixed-queue')!.textContent!, /No videos queued/);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('YouTube enable is a direct permission gesture; denial retains queue and unavailable controls expose native fallback', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  let granted = false; const requests: any[] = [], commands: any[] = [];
  (window as any).chrome = { permissions: { request: (request: any) => { requests.push(request); return Promise.resolve(granted); } }, runtime: { sendMessage: async (c: any) => { commands.push(c); return { ok: true }; } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`); window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, youtubeEnabled: false, youtubeCandidates: [{ tabId: 55, label: 'Native YouTube' }], panes: [{ id: 'main', channelId: 'abcdefghijk', channelName: 'YouTube', service: 'youtube' as const, muted: null, providerCapabilities: null }] };
  let listener = () => {}, dispose = () => {}; bridge.getSnapshot = () => structuredClone(state); bridge.subscribe = fn => { listener = fn; return () => {}; }; bridge.refresh = async () => { state.youtubeEnabled = granted; listener(); return { ok: true }; };
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    const before = JSON.stringify(state.mixed);
    await api.act(async () => button('Enable YouTube').click());
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ permissions: ['scripting'], origins: ['https://www.youtube.com/*'] }]);
    assert.match(window.document.body.textContent, /access denied/); assert.equal(JSON.stringify(state.mixed), before);
    assert.equal(button('Play').disabled, true); assert.equal(button('Enable audio').disabled, true); assert.equal(button('Native player').disabled, false);
    granted = true; await api.act(async () => button('Enable YouTube').click()); assert.equal(button('Enable YouTube'), undefined);
    await api.act(async () => button('Connect Native YouTube').click()); assert.equal(commands.at(-1).type, 'CONNECT_YOUTUBE'); assert.equal(commands.at(-1).tabId, 55);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('Prime Video enable is a direct permission gesture; denial retains queue and unavailable controls expose native fallback', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  let granted = false; const requests: any[] = [], commands: any[] = [];
  (window as any).chrome = { permissions: { request: (request: any) => { requests.push(request); return Promise.resolve(granted); } }, runtime: { sendMessage: async (c: any) => { commands.push(c); return { ok: true }; } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`); window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, primeVideoEnabled: false, primeVideoCandidates: [{ tabId: 55, label: 'Native Prime Video' }], panes: [{ id: 'main', channelId: 'abcdefghijk', channelName: 'Prime Video', service: 'prime-video' as const, muted: null, providerCapabilities: null }] };
  let listener = () => {}, dispose = () => {}; bridge.getSnapshot = () => structuredClone(state); bridge.subscribe = fn => { listener = fn; return () => {}; }; bridge.refresh = async () => { state.primeVideoEnabled = granted; listener(); return { ok: true }; };
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    const before = JSON.stringify(state.mixed);
    await api.act(async () => button('Enable Prime Video').click());
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ permissions: ['scripting'], origins: ['https://www.primevideo.com/*'] }]);
    assert.match(window.document.body.textContent, /access denied/); assert.equal(JSON.stringify(state.mixed), before);
    assert.equal(button('Play').disabled, true); assert.equal(button('Enable audio').disabled, true); assert.equal(button('Native player').disabled, false);
    granted = true; await api.act(async () => button('Enable Prime Video').click()); assert.equal(button('Enable Prime Video'), undefined);
    await api.act(async () => button('Connect Native Prime Video').click()); assert.equal(commands.at(-1).type, 'CONNECT_PRIME_VIDEO'); assert.equal(commands.at(-1).tabId, 55);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});

test('Netflix enable is a direct permission gesture; denial retains queue and unavailable controls expose native fallback', async () => {
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  let granted = false; const requests: any[] = [], commands: any[] = [];
  (window as any).chrome = { permissions: { request: (request: any) => { requests.push(request); return Promise.resolve(granted); } }, runtime: { sendMessage: async (c: any) => { commands.push(c); return { ok: true }; } } };
  window.eval(`${(await bundle).outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`); window.document.body.innerHTML = '<div id="test-root"></div>';
  const api = (window as any).RemoteUI, bridge = createDemoBridge(), base = await bridge.getSnapshot();
  let state = { ...base, netflixEnabled: false, netflixCandidates: [{ tabId: 55, label: 'Native Netflix' }], panes: [{ id: 'main', channelId: 'abcdefghijk', channelName: 'Netflix', service: 'netflix' as const, muted: null, providerCapabilities: null }] };
  let listener = () => {}, dispose = () => {}; bridge.getSnapshot = () => structuredClone(state); bridge.subscribe = fn => { listener = fn; return () => {}; }; bridge.refresh = async () => { state.netflixEnabled = granted; listener(); return { ok: true }; };
  const button = (text: string) => [...window.document.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await api.act(async () => { dispose = api.mountRemote(window.document.getElementById('test-root'), bridge); });
    const before = JSON.stringify(state.mixed);
    await api.act(async () => button('Enable Netflix').click());
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ permissions: ['scripting'], origins: ['https://www.netflix.com/*'] }]);
    assert.match(window.document.body.textContent, /access denied/); assert.equal(JSON.stringify(state.mixed), before);
    assert.equal(button('Play').disabled, true); assert.equal(button('Enable audio').disabled, true); assert.equal(button('Native player').disabled, false);
    granted = true; await api.act(async () => button('Enable Netflix').click()); assert.equal(button('Enable Netflix'), undefined);
    await api.act(async () => button('Connect Native Netflix').click()); assert.equal(commands.at(-1).type, 'CONNECT_NETFLIX'); assert.equal(commands.at(-1).tabId, 55);
  } finally { await api.act(async () => dispose()); await window.happyDOM.abort(); }
});
