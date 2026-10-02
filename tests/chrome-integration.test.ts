import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AdapterObservation } from '../packages/yttv-adapter/src/index';
import { envelope } from '../apps/chrome-extension/src/adapter';

test('extension scope remains storage and YouTube TV only', async () => {
  const manifest = JSON.parse(await readFile(new URL('../apps/chrome-extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['storage']); assert.deepEqual(manifest.host_permissions, ['https://tv.youtube.com/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('managed sessions enforce silence, bounded creation, isolated replacement, sender validation and worker recovery', async () => {
  let listener: ((message: unknown, sender: unknown, reply: (value: any) => void) => unknown) | undefined;
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=original', active: true }]]);
  const log: Array<{ operation: string; id?: number; value?: any }> = []; const local: Record<string, unknown> = {}; const session: Record<string, unknown> = {};
  let next = 2;
  (globalThis as any).chrome = {
    storage: {
      local: { get: async (key: string) => ({ [key]: structuredClone(local[key]) }), set: async (value: object) => Object.assign(local, structuredClone(value)) },
      session: { get: async (key: string) => ({ [key]: structuredClone(session[key]) }), set: async (value: object) => Object.assign(session, structuredClone(value)) },
    },
    runtime: { id: 'local', getURL: (path: string) => `chrome-extension://local/${path}`, sendMessage: async () => undefined,
      onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    tabs: {
      query: async () => [...tabs.values()].filter(tab => tab.url.startsWith('https://tv.youtube.com/')), get: async (id: number) => { if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
      update: async (id: number, value: object) => { log.push({ operation: 'update', id, value }); Object.assign(tabs.get(id), value); return tabs.get(id); },
      sendMessage: async () => undefined, remove: async (id: number) => { tabs.delete(id); },
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} },
    },
    windows: {
      create: async (value: any) => { const id = next++; log.push({ operation: 'create', id, value }); const tab = { id, windowId: id, url: value.url }; tabs.set(id, tab); return { id, tabs: [tab] }; },
      update: async (id: number, value: any) => { log.push({ operation: 'window-update', id, value }); return { id }; },
      get: async (id: number) => ({ id, state: 'normal', left: 50, top: 50, width: 780, height: 520 }),
      remove: async (id: number) => tabs.delete(id),
    },
  };
  await import('../apps/chrome-extension/src/background');
  const send = (command: Parameters<typeof envelope>[0], sender: unknown = { id: 'local', url: 'chrome-extension://local/panel.html' }): Promise<any> =>
    new Promise(resolve => listener!(envelope(command), sender, resolve));
  const now = new Date().toISOString();
  const observation: AdapterObservation = { route: 'watch', observedAt: now, guideObservedAt: now,
    guide: [{ channel: { id: 'yttv:cbs', name: 'CBS' }, available: true, target: { kind: 'navigation', channelId: 'yttv:cbs', url: 'https://tv.youtube.com/watch?v=cbs&vp=guide', verifiedAt: now, evidenceClass: 'LIVE' }, observedAt: now, evidenceClass: 'LIVE' }],
    currentChannelId: 'yttv:cbs', playback: { playing: true, muted: true, currentTime: 10, readyState: 4, width: 1280, height: 720 } };
  await send({ type: 'OBSERVE', observation }, { id: 'local', url: 'https://tv.youtube.com/watch?v=original', tab: tabs.get(1) });
  const originalSender = { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) };
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, false);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true }, originalSender)).ok, true);
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, true);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true })).ok, false, 'popup cannot change another tab’s drawer');
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true }, { ...originalSender, id: 'unrelated' })).ok, false, 'another extension cannot impersonate the content bridge');
  assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })).ok, true);
  const creation = log.findIndex(item => item.operation === 'create');
  assert.equal(log[creation].value.url, 'about:blank');
  assert.deepEqual(log[creation + 1], { operation: 'update', id: 2, value: { muted: true } });
  assert.equal(log[creation + 2].value.muted, true); assert.equal(log[creation + 2].value.url, observation.guide[0].target!.url);
  const snapshot = await send({ type: 'GET_SNAPSHOT' }); const paneId = snapshot.panes[0].id;
  const managedSender = { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) };
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, managedSender)).opened, false, 'new managed player does not inherit the original drawer state');
  assert.equal((await send({ type: 'SELECT_PANE', paneId })).ok, true);
  assert.equal(log.some(item => item.value?.muted === false), false);
  assert.equal((await send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })).ok, true);
  const fourth = await send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  assert.equal(fourth.ok, false); assert.equal(fourth.code, 'SESSION_BOUND'); assert.equal(tabs.size, 3);
  await send({ type: 'PREFERENCE', patch: { nightMuteLock: false } });
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).preferences.nightMuteLock, true);

  const rejected = await send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' }, { id: 'unrelated', url: 'https://evil.example/', tab: tabs.get(1) });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'INVALID_SENDER');
  assert.equal(tabs.size, 3);

  const secondChannel = { ...observation.guide[0], channel: { id: 'yttv:fox', name: 'FOX' }, target: { ...observation.guide[0].target!, channelId: 'yttv:fox', url: 'https://tv.youtube.com/watch?v=fox&vp=guide' } };
  await send({ type: 'OBSERVE', observation: { ...observation, guide: [...observation.guide, secondChannel], playback: { ...observation.playback, currentTime: 11 } } }, { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) });
  const untouchedOriginal = tabs.get(1).url; const untouchedOtherPane = tabs.get(3).url;
  const beforeReplacement = log.length;
  assert.equal((await send({ type: 'REPLACE_PANE', paneId, channelId: 'yttv:fox' })).ok, true);
  assert.equal(tabs.get(2).url, secondChannel.target.url);
  assert.equal(tabs.get(1).url, untouchedOriginal); assert.equal(tabs.get(3).url, untouchedOtherPane);
  assert.deepEqual(log.slice(beforeReplacement).filter(item => item.value?.url).map(item => item.id), [2]);

  assert.equal((await send({ type: 'EXPAND_PANE', paneId })).ok, true);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).expandedPaneId, paneId);
  assert.equal((await send({ type: 'RESTORE_LAYOUT' })).ok, true);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).expandedPaneId, undefined);
  assert(log.some(item => item.operation === 'window-update' && item.value?.width === 780));

  const paneObservation = { ...observation, guide: [...observation.guide, secondChannel], currentChannelId: 'yttv:fox' };
  await send({ type: 'OBSERVE', observation: paneObservation }, { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) });
  assert.match((await send({ type: 'GET_SNAPSHOT' })).panes[0].status, /not confirmed/);
  await send({ type: 'OBSERVE', observation: { ...paneObservation, playback: { ...paneObservation.playback, currentTime: 12 } } }, { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) });
  assert.match((await send({ type: 'GET_SNAPSHOT' })).panes[0].status, /observed advancing/);
  assert.equal(log.some(item => item.value?.muted === false), false);

  // A worker restart revalidates stored tab IDs, never recreates missing sessions, and
  // does not treat a tab subsequently navigated elsewhere as an owned player.
  tabs.get(3).url = 'https://example.com/';
  const createsBeforeRecovery = log.filter(item => item.operation === 'create').length;
  const restartedWorker = await build({ entryPoints: [new URL('../apps/chrome-extension/src/background.ts', import.meta.url).pathname], bundle: true, write: false, format: 'iife', platform: 'browser' });
  runInNewContext(restartedWorker.outputFiles[0].text, { chrome: (globalThis as any).chrome, URL, setTimeout, clearTimeout, setInterval, clearInterval });
  const recovered = await send({ type: 'GET_SNAPSHOT' });
  assert.equal(recovered.panes.length, 1); assert.equal(recovered.panes[0].tabId, 2); assert.equal(recovered.panes[0].muted, true);
  assert.equal(log.filter(item => item.operation === 'create').length, createsBeforeRecovery);
  assert.equal(recovered.capabilities.navigation, false, 'transient navigation targets cannot survive without fresh content observation');
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, true, 'open drawer survives document and worker replacement');
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, managedSender)).opened, false);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: false }, originalSender)).ok, true);
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, false);
});
