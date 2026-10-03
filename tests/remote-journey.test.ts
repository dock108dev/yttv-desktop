import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import type { AdapterObservation } from '../packages/yttv-adapter/src/index';
import type { GuideEntry } from '../packages/core/src/index';
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
  const observation = (id: number): AdapterObservation & { playerKey: string } => ({ route: 'watch', playerKey: `player-${id}`, currentChannelId: guide.find(e => e.target?.url === tabs.get(id)?.url)?.channel.id ?? 'yttv:0', currentProgram: 'Synthetic program', guide, guideObservedAt: now, observedAt: new Date().toISOString(), playback: { playing: false, muted: true, volume: .37, currentTime: 50, readyState: 4, width: 1280, height: 720 } });
  const store = (data: any) => ({ get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])), set: async (v: object) => Object.assign(data, structuredClone(v)) });
  let next = 20, failPlacement = false;
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
      update: async (id: number, v: any) => { log.push(['tab', id, v]); Object.assign(tabs.get(id), v); if (v.muted !== undefined) tabs.get(id).mutedInfo = { muted: v.muted }; return tabs.get(id); },
      move: async (id: number, v: any) => { log.push(['move', id, v]); Object.assign(tabs.get(id), v); return tabs.get(id); },
      sendMessage: async (id: number, m: any) => { if (m.type === 'GET_OBSERVATION') return { ...observation(id), connectionBuild: 'source', connectionNonce: m.connectionNonce }; if (m.type === 'STATE_CHANGED') return; log.push(['player', id, m]); if (m.type === 'PLAYER_AUDIO') return { ok: true, value: { muted: true, volume: .37 } }; return { ok: false, code: 'TIMEOUT', reason: 'Synthetic native navigation refused' }; },
      remove: async (id: number) => { log.push(['close', id]); tabs.delete(id); for (const fn of removed) fn(id); }, onRemoved: event(removed), onUpdated: event(),
    },
    windows: {
      get: async (id: number) => { if (!windows.has(id)) throw Error('closed'); return { ...windows.get(id) }; },
      create: async (v: any) => { const id = next++; log.push(['create', id, v]); windows.set(id, { id, left: 10, top: 40, width: 960, height: 640, state: 'normal', ...v }); const tabId = v.tabId ?? id; if (v.tabId) tabs.get(tabId).windowId = id; else tabs.set(id, { id, windowId: id, url: v.url, index: 0 }); return { ...windows.get(id), tabs: [tabs.get(tabId)] }; },
      update: async (id: number, v: any) => { log.push(['bounds', id, v]); if (failPlacement && v.width) { failPlacement = false; throw Error('Synthetic placement refusal'); } Object.assign(windows.get(id), v); return { ...windows.get(id) }; },
      remove: async (id: number) => { windows.delete(id); for (const [tid, tab] of tabs) if (tab.windowId === id) await api.tabs.remove(tid); },
    },
  };
  runInNewContext(worker.outputFiles[0].text, { crypto: { randomUUID: () => 'synthetic-connection' }, chrome: api, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
  const workerListener = [...listeners][0];
  const send = (c: any) => api.runtime.sendMessage(envelope(c));
  await send({ type: 'GET_SNAPSHOT' });
  await new Promise(res => { for (const fn of listeners) fn(envelope({ type: 'OBSERVE', observation: observation(1) }), { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) }, res); });
  (window as any).chrome = api;
  window.eval(`${ui.outputFiles[0].text}\nwindow.RemoteUI = RemoteUI;`);
  window.document.body.innerHTML = '<div id="test-root"></div>';
  const uiApi = (window as any).RemoteUI;
  let dispose = () => {}, bridge: any;
  const mount = async () => { bridge = uiApi.createClientBridge(); await uiApi.act(async () => { dispose = uiApi.mountRemote(window.document.getElementById('test-root'), bridge); await bridge.refresh(); }); };
  const sync = async () => { await uiApi.act(async () => { await bridge.refresh(); }); };
  const click = async (label: string, scope: any = window.document) => { const b = [...scope.querySelectorAll('button')].find((b: any) => b.textContent === label) as any; assert(b, label); assert.equal(b.disabled, false, label); await uiApi.act(async () => b.click()); await sync(); };
  const row = (name: string) => [...window.document.querySelectorAll('.results article')].find(r => r.querySelector('strong')?.textContent === name)!;
  const select = async (id: string) => { const s = window.document.querySelector('select')!; await uiApi.act(async () => { s.value = id; s.dispatchEvent(new window.Event('change', { bubbles: true })); }); await sync(); };
  const snapshot = () => send({ type: 'GET_SNAPSHOT' });
  const ownerTab = structuredClone(tabs.get(9)), ownerWindow = structuredClone(windows.get(10));
  try {
    await mount(); await click('TV area'); await click('Apply and start workspace');
    assert.equal((await snapshot()).workspace.enrolled, true); assert.notEqual(tabs.get(1).windowId, 10);
    for (const name of ['Beta', 'Gamma', 'Delta']) await click('Add', row(name));
    let s = await snapshot(); assert.equal(s.panes.length, 4); assert.equal(s.workspace.actual.length, 4);
    assert.match(window.document.body.textContent!, /4 \/ 4 feeds/);
    assert([...window.document.querySelectorAll('.results button')].filter(b => b.textContent === 'Add').every(b => (b as any).disabled));
    const created = log.filter(x => x[0] === 'create').length;
    assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:1' })).code, 'SESSION_BOUND'); assert.equal(log.filter(x => x[0] === 'create').length, created);
    const chosen = s.panes[2], untouched = s.panes.filter((p: any) => p.id !== chosen.id).map((p: any) => [p.tabId, tabs.get(p.tabId).url]);
    await select(chosen.id); const boundary = log.length; await click('Focus feed'); await click('Expand'); await click('Restore');
    assert.deepEqual(log.slice(boundary).filter(x => x[0] === 'player' || x[2]?.muted !== undefined), [], 'selection/focus/geometry confer no audio command');
    await click('Replace selected', row('Alpha')); s = await snapshot(); assert.equal(s.panes[2].id, chosen.id); assert.equal(s.panes[2].channelName, 'Alpha');
    assert.equal(tabs.get(chosen.tabId).url, guide[0].target!.url); for (const [id, url] of untouched) assert.equal(tabs.get(id).url, url);
    await select('main'); await click('Replace selected', row('Beta')); assert.equal((await snapshot()).panes[0].channelName, 'Beta', 'paused original replacement label does not wait for confirmed history');
    await select(chosen.id);
    const sports = [...window.document.querySelectorAll('label')].find(l => l.textContent?.includes('Sports listings'))!.querySelector('input') as any; await uiApi.act(async () => sports.click());
    const sportsRow = [...window.document.querySelectorAll('.results article')].find(r => r.querySelector('strong')?.textContent === 'Delta NHL Live')!;
    await click('Replace selected', sportsRow); assert.equal(tabs.get(chosen.tabId).url, guide[3].target!.url);
    const rejectedAt = log.length; assert.equal((await send({ type: 'REPLACE_PROGRAM', paneId: chosen.id, channelId: 'yttv:3', title: 'Changed program', observedAt: now })).code, 'TARGET_UNAVAILABLE'); assert.equal(log.length, rejectedAt);
    await click('Close selected'); s = await snapshot(); assert.equal(s.panes.length, 3); assert.equal(s.activePaneId, 'main'); assert.equal(s.workspace.actual.length, 3);
    assert.equal(s.panes[2].feedNumber, 4, 'surviving feed retains number after another closes');
    // Native close publishes count and reflow to the open remote.
    await uiApi.act(async () => api.tabs.remove(s.panes[1].tabId)); await sync(); s = await snapshot(); assert.equal(s.panes.length, 2); assert.equal(s.workspace.actual.length, 2);
    await uiApi.act(async () => dispose()); await mount(); assert.match(window.document.body.textContent!, /2 \/ 4 feeds/);
    await click('Arrange now'); failPlacement = true; await click('Arrange now'); assert.match(window.document.body.textContent!, /Previous bounds restored/);
    await click('Arrange now'); const remaining = (await snapshot()).panes[1]; windows.get(remaining.windowId).left += 45;
    assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:2' })).ok, true); await sync();
    assert.equal((await snapshot()).workspace.intent.autoArrange, false); assert.match(window.document.body.textContent!, /Manual window positions preserved/);
    await select(remaining.id);
    await uiApi.act(async () => dispose()); listeners.delete(workerListener);
    const createsBeforeRestart = log.filter(x => x[0] === 'create').length;
    runInNewContext(worker.outputFiles[0].text, { crypto: { randomUUID: () => 'synthetic-connection' }, chrome: api, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
    await mount(); s = await snapshot(); assert.equal(s.panes.length, 3); assert.equal(s.panes[1].feedNumber, 4); assert.equal(s.activePaneId, remaining.id);
    assert.equal(log.filter(x => x[0] === 'create').length, createsBeforeRestart);
    assert.equal(s.workspace.intent.autoArrange, false);
    await click('Return original player'); assert.equal(tabs.get(1).windowId, 10); assert.deepEqual(tabs.get(9), ownerTab); assert.deepEqual(windows.get(10), ownerWindow);
    await click('Start TV workspace');
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
