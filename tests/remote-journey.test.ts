import { webcrypto } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import type { AdapterObservation } from '../packages/yttv-adapter/src/index';
import type { GuideEntry } from '../packages/core/src/index';
import { planLayout } from '../packages/quadbox/src/geometry';
import { envelope } from '../apps/chrome-extension/src/adapter';

test('real remote → bridge → worker journey targets four feeds, reflows, preserves manual placement and reopens truthfully', async () => {
  const [ui, worker] = await Promise.all([
    build({ stdin: { contents: "export { mountRemote } from './apps/chrome-extension/src/remote.tsx'; export { createClientBridge } from './apps/chrome-extension/src/bridge'; export { act } from 'react';", resolveDir: resolve(process.cwd()), loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'RemoteUI', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' } }),
    build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' }),
  ]);
  const window = new Window({ url: 'http://127.0.0.1/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  Object.defineProperty(window, 'MessageChannel', { value: class { port1 = { onmessage: null as null | (() => void) }; port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) }; } });
  window.console.timeStamp = () => {};
  Object.assign(window.screen, { availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 30 });
  const listeners = new Set<any>(), removed = new Set<any>(), local: any = {}, session: any = {}, log: any[] = [];
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 10, index: 1, pinned: false, active: true, url: 'https://tv.youtube.com/watch?v=original', mutedInfo: { muted: true } }], [9, { id: 9, windowId: 10, index: 0, url: 'https://owner.example/' }]]);
  const windows = new Map<number, any>([[10, { id: 10, left: 20, top: 30, width: 1200, height: 800, state: 'normal' }]]);
  const now = new Date().toISOString();
  const guide: GuideEntry[] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name, i) => ({ channel: { id: `yttv:${i}`, name }, programTitle: `${name} NHL Live`, programs: [{ title: `${name} NHL Live`, context: 'CURRENT' }], available: true, target: { kind: 'navigation', channelId: `yttv:${i}`, url: `https://tv.youtube.com/watch?v=feed${i}`, verifiedAt: now, evidenceClass: 'LIVE' }, observedAt: now, evidenceClass: 'LIVE' }));
  let clockOffset = 0;
  let replacementAudioReset = false, refusePlay = false, replaceDuringPlay = false; let replaceDuringAudio: number | undefined;
  const playing = new Map<number, boolean>();
  const observation = (id: number): AdapterObservation & { playerKey: string } => ({ route: 'watch', playerKey: `player-${id}`, currentChannelId: guide.find(e => e.target?.url === tabs.get(id)?.url)?.channel.id ?? 'yttv:0', currentProgram: 'Synthetic program', guide, guideObservedAt: now, observedAt: new Date(Date.now() + clockOffset).toISOString(), playback: { playing: playing.get(id) ?? false, muted: !replacementAudioReset, volume: replacementAudioReset ? 1 : .37, currentTime: 50, readyState: 4, width: 1280, height: 720 } });
  const store = (data: any) => ({ get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])), set: async (v: object) => Object.assign(data, structuredClone(v)) });
  let next = 20, failPlacement = false, deferNavigation = false; let duplicateSourceChange: number | undefined;
  const event = (set = new Set<any>()) => ({ addListener: (fn: any) => set.add(fn), removeListener: (fn: any) => set.delete(fn) });
  const sender = { id: 'local', url: 'chrome-extension://local/remote.html' };
  const api: any = {
    runtime: { id: 'local', getURL: (p: string) => `chrome-extension://local/${p}`, onMessage: event(listeners), sendMessage: (m: any) => {
      if (m.type === 'STATE_CHANGED') { for (const fn of [...listeners]) fn(m, sender, () => {}); return Promise.resolve(); }
      return new Promise(res => { for (const fn of [...listeners]) fn(m, sender, res); });
    } },
    storage: { local: store(local), session: store(session), onChanged: event() },
    permissions: { contains: async () => false, request: async () => false },
    tabs: {
      get: async (id: number) => { if (!tabs.has(id)) throw Error('closed'); return { ...tabs.get(id) }; },
      query: async (q: any) => [...tabs.values()].filter(t => q.windowId !== undefined ? t.windowId === q.windowId : t.url.startsWith('https://tv.youtube.com/')),
      update: async (id: number, v: any) => { log.push(['tab', id, v]); if (deferNavigation && v.url) { const { url, ...rest } = v; Object.assign(tabs.get(id), rest, { pendingUrl: url }); } else Object.assign(tabs.get(id), v); if (v.muted !== undefined) tabs.get(id).mutedInfo = { muted: v.muted }; return tabs.get(id); },
      move: async (id: number, v: any) => { log.push(['move', id, v]); Object.assign(tabs.get(id), v); return tabs.get(id); },
      sendMessage: async (id: number, m: any) => { if (m.type === 'GET_OBSERVATION') return { ...observation(id), connectionBuild: 'source', connectionNonce: m.connectionNonce }; if (m.type === 'STATE_CHANGED') return; log.push(['player', id, m]); if (m.type === 'PLAYER_PLAYBACK') { if (replaceDuringPlay) { replaceDuringPlay = false; for (const fn of listeners) fn(envelope({ type: 'OBSERVE', playerKey: 'changed-mid-command', observation: observation(id) }), { id: 'local', url: tabs.get(id).url, tab: tabs.get(id), documentId: `new-doc-${id}` }, () => {}); } if (refusePlay) return { ok: false, reason: 'Synthetic service refusal. Use native Play.' }; playing.set(id, m.playing); return { ok: true, value: { ...observation(id).playback, playing: m.playing } }; } if (m.type === 'PLAYER_AUDIO') { if (replaceDuringAudio && id === 1 && m.muted === true) { const replaced = replaceDuringAudio; replaceDuringAudio = undefined; for (const fn of listeners) fn(envelope({ type: 'OBSERVE', playerKey: 'changed-during-isolation', observation: observation(replaced) }), { id: 'local', url: tabs.get(replaced).url, tab: tabs.get(replaced), documentId: `new-doc-${replaced}` }, () => {}); } replacementAudioReset = false; return { ok: true, value: { muted: m.muted ?? true, volume: m.volume ?? .37 } }; } return { ok: false, code: 'TIMEOUT', reason: 'Synthetic native navigation refused' }; },
      remove: async (id: number) => { log.push(['close', id]); tabs.delete(id); for (const fn of removed) fn(id); }, onRemoved: event(removed), onUpdated: event(),
    },
    windows: {
      get: async (id: number) => { if (!windows.has(id)) throw Error('closed'); return { ...windows.get(id) }; },
      create: async (v: any) => { if (v.url === 'about:blank' && duplicateSourceChange) { tabs.get(duplicateSourceChange).url = 'https://tv.youtube.com/watch?v=native-replacement'; duplicateSourceChange = undefined; } const id = next++; log.push(['create', id, v]); windows.set(id, { id, left: 10, top: 40, width: 960, height: 640, state: 'normal', ...v }); const tabId = v.tabId ?? id; if (v.tabId) tabs.get(tabId).windowId = id; else tabs.set(id, { id, windowId: id, url: v.url, index: 0 }); return { ...windows.get(id), tabs: [tabs.get(tabId)] }; },
      update: async (id: number, v: any) => { log.push(['bounds', id, v]); if (failPlacement && v.width) { failPlacement = false; throw Error('Synthetic placement refusal'); } Object.assign(windows.get(id), v); return { ...windows.get(id) }; },
      remove: async (id: number) => { windows.delete(id); for (const [tid, tab] of tabs) if (tab.windowId === id) await api.tabs.remove(tid); },
    },
  };
  class WorkerDate extends Date { static now() { return Date.now() + clockOffset; } }
  runInNewContext(worker.outputFiles[0].text, { Date: WorkerDate, crypto: webcrypto, TextEncoder, chrome: api, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
  const workerListener = [...listeners][0];
  const send = (c: any) => api.runtime.sendMessage(envelope(c));
  const observePlayer = (id: number, readyState = 4, key = `player-${id}`) => new Promise(res => { for (const fn of listeners) fn(envelope({ type: 'OBSERVE', playerKey: key, observation: { ...observation(id), playback: { ...observation(id).playback, readyState } } }), { id: 'local', url: tabs.get(id).url, tab: tabs.get(id), documentId: `doc-${id}` }, res); });
  await send({ type: 'GET_SNAPSHOT' });
  await new Promise(res => { for (const fn of listeners) fn(envelope({ type: 'OBSERVE', observation: observation(1) }), { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) }, res); });
  (window as any).chrome = api;
  window.eval(`${ui.outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`);
  window.document.body.innerHTML = '<div id="test-root"></div>';
  const uiApi = (window as any).RemoteUI;
  let dispose = () => {}, bridge: any;
  const mount = async () => { bridge = uiApi.createClientBridge(); await uiApi.act(async () => { dispose = uiApi.mountRemote(window.document.getElementById('test-root'), bridge); await bridge.refresh(); }); };
  const sync = async () => { await uiApi.act(async () => { await bridge.refresh(); }); };
  const interactions: string[] = [];
  const click = async (label: string, scope: any = window.document) => { const b = [...scope.querySelectorAll('button')].find((b: any) => b.textContent === label) as any; assert(b, label); assert.equal(b.disabled, false, label); interactions.push(label); await uiApi.act(async () => b.click()); await sync(); };
  const row = (name: string) => [...window.document.querySelectorAll('.results article')].find(r => r.querySelector('strong')?.textContent === name)!;
  const card = (id: string) => { const pane = [...window.document.querySelectorAll('.window-cards article')].find(r => r.querySelector('strong')?.textContent?.includes(id))!; assert(pane); return pane; };
  const select = async (id: string) => { await send({ type: 'FOCUS_PANE', paneId: id }); await sync(); };
  const snapshot = () => send({ type: 'GET_SNAPSHOT' });
  // Opening Live must retain the paused original's native choices for its next watch player.
  await send({ type: 'OPEN_NATIVE_GUIDE' });
  assert.equal(session['yttv-desktop.player-volume.v1'][0].volume, .37);
  assert.equal(session['yttv-desktop.player-volume.v1'][0].muted, true);
  tabs.get(1).url = 'https://tv.youtube.com/watch?v=original'; replacementAudioReset = true;
  await new Promise(res => { for (const fn of listeners) fn(envelope({ type: 'OBSERVE', playerKey: 'replacement', observation: observation(1) }), { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) }, res); });
  assert(log.some(x => x[0] === 'player' && x[1] === 1 && x[2].type === 'PLAYER_AUDIO' && x[2].volume === .37 && x[2].muted === true), 'ready replacement restores volume and mute without unmute');
  assert.equal((await snapshot()).playback.playerMuted, true);
  const ownerTab = structuredClone(tabs.get(9)), ownerWindow = structuredClone(windows.get(10));
  try {
    await mount(); await click('TV area'); await click('Apply');
    assert.equal((await snapshot()).workspace.enrolled, false);
    deferNavigation = true; await click('Pick a channel'); await click('Choose Beta', row('Beta'));
    let pending = await snapshot(); assert.equal(pending.workspace.enrolled, true, 'Add automatically enrolls/arranges in saved area'); assert.notEqual(tabs.get(1).windowId, 10); assert.equal(pending.panes.length, 2, 'pending watch navigation retains owned feed');
    assert.equal(pending.workspace.actual.length, 2, 'pending feed participates in arrangement');
    const loading = tabs.get(pending.panes[1].tabId); assert.equal(loading.url, 'about:blank');
    loading.url = loading.pendingUrl; delete loading.pendingUrl; deferNavigation = false; await sync();
    const extra = pending.panes[1]; const startBoundary = log.length;
    await observePlayer(extra.tabId, 1); assert.equal(log.slice(startBoundary).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 0);
    assert.equal((await snapshot()).panes[1].playbackState, 'loading');
    await observePlayer(extra.tabId); await sync();
    assert.equal(log.slice(startBoundary).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 1, 'one start on delayed readiness');
    assert.equal((await snapshot()).panes[1].playbackState, 'playing');
    await observePlayer(extra.tabId); assert.equal(log.slice(startBoundary).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 1);
    // One-time pair setup reuses the actual editor and two already-owned players.
    const pairArea = { left: 900, top: 100, width: 1000, height: 950 };
    const displayWork = { left: 0, top: 30, width: 1920, height: 1040 };
    api.permissions.contains = async () => true; api.permissions.request = async () => true;
    api.system = { display: { getInfo: async () => [{ id: 'fixed-monitor', name: 'Synthetic monitor', workArea: displayWork }] } };
    const pairSetupAt = log.length;
    await click('Change layout'); assert(window.document.querySelector('[role=dialog]'));
    await click('Choose monitor');
    const layoutSelect = window.document.querySelector('select[aria-label="Show layout"]')!;
    (layoutSelect as any).value = 'top-bottom'; await uiApi.act(async () => layoutSelect.dispatchEvent(new window.Event('change', { bubbles: true })));
    (window.document.querySelector('.mini-area-editor summary') as any).click();
    const numeric = [...window.document.querySelectorAll('input[type=number]')];
    for (const [index, key] of (['left', 'top', 'width', 'height'] as const).entries()) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(numeric[index], String(pairArea[key]));
      await uiApi.act(async () => numeric[index].dispatchEvent(new window.Event('input', { bubbles: true })));
    }
    const pairPlan = planLayout(pairArea, 2, 8, 'top-bottom'); assert(pairPlan.ok);
    const preview = [...window.document.querySelectorAll('[role=dialog] .slot-preview')]; assert.equal(preview.length, 2);
    assert.deepEqual(preview.map(p => p.textContent), ['Show 1', 'Show 2']);
    assert.equal((preview[1] as any).style.top, `${100 * (pairPlan.bounds[1].top - displayWork.top) / displayWork.height}%`);
    await click('Save layout');
    let pairState = await snapshot(); assert.equal(pairState.workspace.layout, 'top-bottom');
    assert.deepEqual(JSON.parse(JSON.stringify(pairState.workspace.actual.map((r: any) => r.bounds))), pairPlan.bounds);
    assert.match(card('Original').textContent!, /Top · Original/); assert.match(card('Beta').textContent!, /Bottom · Window 2/);
    assert.equal(log.slice(pairSetupAt).filter(x => x[0] === 'bounds' && x[2]?.width).length, 2, 'confirming an enrolled pair arranges once');
    assert(!log.slice(pairSetupAt).some(x => x[0] === 'create' || x[0] === 'tab' || x[0] === 'player'), 'setup reuses players and changes only geometry');
    for (const slot of ['Original', 'Beta']) { await click('Expand', card(slot)); assert.deepEqual(JSON.parse(JSON.stringify((await snapshot()).workspace.actual[0].bounds)), pairArea); await click('Restore', card(slot)); }
    const pairIds = Array.from(pairState.panes, (p: any) => p.id);
    await click('Channel', card('Beta')); await click('Choose Beta', row('Beta'));
    assert.deepEqual(Array.from((await snapshot()).panes, (p: any) => p.id), pairIds, 'replacement preserves Top/Bottom identity');
    await uiApi.act(async () => dispose());
    const interactionAt = interactions.length; interactions.push('toolbar'); await send({ type: 'OPEN_REMOTE' });
    const reopenAt = log.length; await mount();
    assert.equal(log.length, reopenAt, 'reopen has no physical mutation');
    const repeatAt = log.length; await click('Arrange shows');
    pairState = await snapshot(); assert.deepEqual(JSON.parse(JSON.stringify(pairState.workspace.actual.map((r: any) => r.bounds))), pairPlan.bounds);
    assert.equal(log.slice(repeatAt).filter(x => x[0] === 'bounds' && x[2]?.width).length, 2, 'one visible Apply action moves each player once');
    assert(!log.slice(repeatAt).some(x => x[0] === 'create' || x[0] === 'tab' || x[0] === 'player'));
    // Recorded ordinary repeat use: toolbar opens remote (1), visible shortcut applies (2).
    // No settings, selection or modal confirmation is needed after genuine setup.
    assert.deepEqual(interactions.slice(interactionAt), ['toolbar', 'Arrange shows']);
    assert.equal(interactions.length - interactionAt, 2);
    api.system.display.getInfo = async () => [{ id: 'other-monitor', workArea: displayWork }];
    const lostAt = log.length; await click('Arrange shows');
    assert.match(window.document.body.textContent!, /Saved monitor.*unavailable/); assert(log.slice(lostAt).every(x => x[0] === 'bounds' && Object.keys(x[2]).every(k => k === 'focused')), 'failure may focus remote, never move players');
    assert(window.document.querySelector('button') && [...window.document.querySelectorAll('button')].some(b => b.textContent === 'Change layout'));
    const addLostAt = log.length; assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:2' })).code, 'AREA_UNAVAILABLE');
    assert(!log.slice(addLostAt).some(x => x[0] === 'create' || x[0] === 'tab' || x[0] === 'player'), 'fixed-area Add also preflights before creation');
    api.system.display.getInfo = async () => [{ id: 'fixed-monitor', name: 'Synthetic monitor', workArea: displayWork }];
    await click('Arrange shows');
    const audioBefore = log.filter(x => x[2]?.type === 'PLAYER_AUDIO' || x[2]?.muted !== undefined).length;
    await click('Pause', card('Beta')); assert.equal((await snapshot()).panes[1].playbackState, 'paused');
    await click('Play', card('Beta')); assert.equal(playing.get(1), undefined, 'extra Play does not target original');
    assert.equal(log.filter(x => x[2]?.type === 'PLAYER_AUDIO' || x[2]?.muted !== undefined).length, audioBefore, 'Play/Pause carries no audio mutation');
    replaceDuringPlay = true; const stale = await send({ type: 'PLAYBACK', paneId: extra.id, playing: false }); assert.equal(stale.code, 'SUPERSEDED', 'document replacement invalidates late command readback');
    await observePlayer(extra.tabId);
    await observePlayer(1); const volumeBefore = log.length;
    assert.equal((await send({ type: 'AUDIO', paneId: extra.id, volume: .21 })).ok, true);
    const volume = log.slice(volumeBefore).filter(x => x[2]?.type === 'PLAYER_AUDIO'); assert.equal(volume.length, 1); assert.equal(volume[0][1], extra.tabId); assert.equal(volume[0][2].muted, undefined);

    const handoffAt = log.length; replaceDuringAudio = extra.tabId;
    assert.equal((await send({ type: 'AUDIO', paneId: extra.id, muted: false })).ok, false);
    assert.equal(log.slice(handoffAt).some(x => x[2]?.muted === false), false, 'replacement during peer isolation cannot enable audio');
    await observePlayer(extra.tabId);
    assert.equal((await send({ type: 'SET_TV_AREA', workArea: displayWork, area: pairArea, displayId: 'fixed-monitor', layout: 'grid', plannedCount: 4 })).ok, true);
    await click('Expand', card('Beta'));
    for (const name of ['Gamma', 'Delta']) { await click('Pick a channel'); await click(`Choose ${name}`, row(name)); }
    let s = await snapshot(); assert.equal(s.expandedPaneId, undefined, 'Add reflow clears expanded controls after restoring the arrangement'); assert.equal(s.workspace.expanded, false);
    await click('Arrange shows'); assert.equal((await snapshot()).workspace.actual.length, 4);
    refusePlay = true; const gamma = s.panes[2]; const refusedAt = log.length;
    await observePlayer(gamma.tabId); await observePlayer(gamma.tabId);
    assert.equal(log.slice(refusedAt).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 1, 'refusal is not retried');
    assert.match((await snapshot()).panes[2].error, /native Play/); refusePlay = false;
    playing.set(gamma.tabId, true); await observePlayer(gamma.tabId); assert.equal((await snapshot()).panes[2].error, undefined, 'observed native success clears historical refusal');
    const delta = s.panes[3]; await observePlayer(delta.tabId, 1); const replacedAt = log.length;
    await observePlayer(delta.tabId, 4, 'replacement-delta');
    assert.equal(log.slice(replacedAt).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 0, 'replacement cancels delayed Add');
    assert.match((await snapshot()).panes[3].error, /Player changed/);
    assert.equal(s.panes.length, 4); assert.equal(s.workspace.actual.length, 4);
    assert.match(window.document.body.textContent!, /4 \/ 4 windows/);
    assert.equal((window.document.querySelector('button.primary') as any).disabled, true); assert.equal(window.document.querySelectorAll('.window-cards article').length, 4);
    const created = log.filter(x => x[0] === 'create').length;
    assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:1' })).code, 'SESSION_BOUND'); assert.equal(log.filter(x => x[0] === 'create').length, created);
    const chosen = s.panes[2], untouched = s.panes.filter((p: any) => p.id !== chosen.id).map((p: any) => [p.tabId, tabs.get(p.tabId).url]);
    await select(chosen.id); const boundary = log.length; await click('Focus', card('Gamma')); await click('Expand', card('Gamma')); await click('Restore');
    assert.deepEqual(log.slice(boundary).filter(x => x[0] === 'player' || x[2]?.muted !== undefined), [], 'selection/focus/geometry confer no audio command');
    await click('Channel', card('Gamma')); await click('Choose Alpha', row('Alpha')); s = await snapshot(); assert.equal(s.panes[2].id, chosen.id); assert.equal(s.panes[2].channelName, 'Alpha');
    assert.equal(tabs.get(chosen.tabId).url, guide[0].target!.url); for (const [id, url] of untouched) assert.equal(tabs.get(id).url, url);
    await select('main'); await click('Channel', card('Original')); await click('Choose Beta', row('Beta')); assert.equal((await snapshot()).panes[0].channelName, 'Beta', 'paused original replacement label does not wait for confirmed history');
    await select(chosen.id); await click('Channel', card('Window 3'));
    const sports = [...window.document.querySelectorAll('label')].find(l => l.textContent?.includes('Sports listings'))!.querySelector('input') as any; await uiApi.act(async () => sports.click());
    const sportsRow = [...window.document.querySelectorAll('.results article')].find(r => r.querySelector('strong')?.textContent === 'Delta')!;
    await click('Choose Delta', sportsRow); assert.equal(tabs.get(chosen.tabId).url, guide[3].target!.url);
    const rejectedAt = log.length; assert.equal((await send({ type: 'REPLACE_PROGRAM', paneId: chosen.id, channelId: 'yttv:3', title: 'Changed program', observedAt: now })).code, 'TARGET_UNAVAILABLE'); assert.equal(log.length, rejectedAt);
    const closeBoundary = log.length; await click('Remove', card('Window 3')); s = await snapshot();
    assert.equal(log.slice(closeBoundary).filter(x => x[0] === 'bounds' && x[2]?.width).length, 3, 'explicit Close arranges remaining players once, without later native-close reflow stealing focus'); assert.equal(s.panes.length, 3); assert.equal(s.activePaneId, 'main'); assert.equal(s.workspace.actual.length, 3);
    assert.equal(s.panes[2].feedNumber, 4, 'surviving feed retains number after another closes');
    // Native close publishes count and reflow to the open remote.
    await uiApi.act(async () => api.tabs.remove(s.panes[1].tabId)); await sync(); s = await snapshot(); assert.equal(s.panes.length, 2); assert.equal(s.workspace.actual.length, 2);
    await uiApi.act(async () => dispose()); await mount(); assert.match(window.document.body.textContent!, /2 \/ 4 windows/);
    await click('Arrange now'); failPlacement = true; await click('Arrange now'); assert.match(window.document.body.textContent!, /Previous bounds restored/);
    // The full-size picker saves real screen coordinates through the worker, not the small preview.
    const customBoxes = [{ left: 50, top: 100, width: 850, height: 450 }, { left: 1000, top: 600, width: 850, height: 400 }];
    const customSlots = customBoxes.map(r => ({ left: (r.left - displayWork.left) / displayWork.width, top: (r.top - displayWork.top) / displayWork.height, width: r.width / displayWork.width, height: r.height / displayWork.height }));
    await send({ type: 'AUTO_ARRANGE', enabled: false });
    assert.equal((await send({ type: 'OPEN_AREA_PICKER', workArea: displayWork, displayId: 'fixed-monitor', mode: 'custom', count: 2 })).ok, true);
    const pickerTab = [...tabs.values()].find(t => t.url === 'chrome-extension://local/area-picker.html')!;
    const pickerSender = { id: 'local', url: pickerTab.url, tab: pickerTab };
    const pickerSend = (command: any) => new Promise<any>(res => workerListener(envelope(command), pickerSender, res));
    assert.equal((await send({ type: 'GET_AREA_PICKER' })).ok, false, 'only the drawing window reads its pending configuration');
    assert.equal((await pickerSend({ type: 'GET_AREA_PICKER' })).picker.count, 2);
    assert.equal((await send({ type: 'SAVE_AREA_PICKER', area: displayWork, customSlots })).ok, false, 'another extension page cannot save a drawing');
    const drawnAt = log.length;
    assert.equal((await pickerSend({ type: 'SAVE_AREA_PICKER', area: displayWork, customSlots })).ok, true);
    s = await snapshot(); assert.equal(s.workspace.layout, 'custom');
    assert.deepEqual(JSON.parse(JSON.stringify(s.workspace.actual.map((r: any) => r.bounds))), customBoxes);
    assert.equal(tabs.has(pickerTab.id), false, 'successful save closes the owned drawing window');
    assert.equal(s.workspace.intent.autoArrange, false, 'explicit Save applies positions without switching manual mode back on');
    assert(!log.slice(drawnAt).some(x => x[0] === 'player' || x[0] === 'tab'), 'drawing only changes geometry');
    await send({ type: 'AUTO_ARRANGE', enabled: true });
    await click('Arrange now'); const remaining = (await snapshot()).panes[1]; windows.get(remaining.windowId).left += 45;
    assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:2' })).ok, true); await sync();
    const timedOut = (await snapshot()).panes.find((p: any) => p.id !== 'main' && p.id !== remaining.id); const timeoutBoundary = log.length; clockOffset = 16_000;
    await observePlayer(timedOut.tabId); clockOffset = 0;
    assert.match((await snapshot()).panes.find((p: any) => p.id === timedOut.id).error, /Startup timed out/);
    assert.equal(log.slice(timeoutBoundary).filter(x => x[2]?.type === 'PLAYER_PLAYBACK').length, 0, 'expired readiness cannot start late');
    assert.equal((await snapshot()).workspace.intent.autoArrange, false); assert.match(window.document.body.textContent!, /Manual window positions preserved/);
    await select(remaining.id);
    await uiApi.act(async () => dispose()); listeners.delete(workerListener);
    const createsBeforeRestart = log.filter(x => x[0] === 'create').length;
    runInNewContext(worker.outputFiles[0].text, { Date: WorkerDate, crypto: webcrypto, TextEncoder, chrome: api, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
    await mount(); s = await snapshot(); assert.equal(s.panes.length, 3); assert.equal(s.panes.find((p: any) => p.id === remaining.id).feedNumber, 4); assert.equal(s.panes[1].id, timedOut.id, 'reused lower slots retain stable ordering'); assert.equal(s.activePaneId, remaining.id);
    assert.equal(log.filter(x => x[0] === 'create').length, createsBeforeRestart);
    assert.equal(s.workspace.intent.autoArrange, false);
    await click('Return original'); assert.equal(tabs.get(1).windowId, 10); assert.deepEqual(tabs.get(9), ownerTab); assert.deepEqual(windows.get(10), ownerWindow);
    await click('Start TV workspace');
    clockOffset = 31 * 60_000; await observePlayer(1); await sync(); const duplicateAt = log.length;
    assert((await snapshot()).guide.every((e: any) => !e.available), 'expired guide remains unavailable');
    await click('Pick a channel'); const originalNow = (await snapshot()).panes[0];
    await click(`Add current Original · ${originalNow.channelName}`);
    const duplicated = (await snapshot()).panes.find((p: any) => !['main', remaining.id, timedOut.id].includes(p.id)); assert.equal(tabs.get(duplicated.tabId).url, tabs.get(1).url);
    assert.equal(log.slice(duplicateAt).some(x => x[1] === 1 && x[2]?.url), false, 'current-content Add never navigates original to guide');
    await send({ type: 'REMOVE_PANE', paneId: duplicated.id }); clockOffset = 0; await sync();
    await observePlayer(1); const sourceURL = tabs.get(1).url, countBeforeStale = (await snapshot()).panes.length; duplicateSourceChange = 1;
    const staleDuplicate = await send({ type: 'DUPLICATE_PANE', paneId: 'main' }); assert.equal(staleDuplicate.code, 'SUPERSEDED');
    assert.equal((await snapshot()).panes.length, countBeforeStale, 'source change removes only the newly created blank extra'); tabs.get(1).url = sourceURL;
    await uiApi.act(async () => api.tabs.remove(1)); await sync();
    assert.equal((await snapshot()).panes.some((p: any) => p.id === 'main'), false); assert.equal((await snapshot()).activePaneId, remaining.id); assert.deepEqual(tabs.get(9), ownerTab);
    for (const p of (await snapshot()).panes) await api.tabs.remove(p.tabId); await sync();
    assert.equal((await send({ type: 'ARRANGE' })).code, 'PLAYERS_UNAVAILABLE');
    tabs.set(30, { id: 30, windowId: 30, index: 0, pinned: false, url: guide[0].target!.url, mutedInfo: { muted: true } });
    windows.set(30, { id: 30, left: 70, top: 80, width: 1200, height: 800, state: 'normal' });
    await sync(); assert.equal((await snapshot()).panes.length, 0, 'new owner tab is never silently adopted');
    assert.match(window.document.body.textContent!, /previous original player was closed/);
    assert.equal((await send({ type: 'CHOOSE_MAIN', tabId: 9 })).code, 'PLAYER_UNAVAILABLE');
    const recoveryBoundary = log.length; await click('Use this player');
    s = await snapshot(); assert.equal(s.panes[0].tabId, 30); assert.equal(s.workspace.enrolled, false);
    assert.equal(log.length, recoveryBoundary, 'explicit choice changes no playback, audio, windows or navigation');
    assert.equal(session['yttv-desktop.closed-original.v1'].origin.tabId, 1, 'closed original evidence retained');
    await click('Start TV workspace'); assert.equal((await snapshot()).workspace.enrolled, true);
    assert.equal((await send({ type: 'CHOOSE_MAIN', tabId: 30 })).code, 'ORIGINAL_EXISTS');
    assert.equal(log.some(x => x[2]?.muted === false), false, 'entire journey stays muted');
  } finally { await uiApi.act(async () => dispose()); await window.happyDOM.abort(); }
});
