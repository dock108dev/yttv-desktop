import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AdapterObservation } from '../packages/yttv-adapter/src/index';
import { envelope } from '../apps/chrome-extension/src/adapter';

test('extension scope remains storage and YouTube TV only', async () => {
  const manifest = JSON.parse(await readFile(new URL('../apps/chrome-extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.optional_permissions, ['system.display', 'scripting']);
  assert.deepEqual(manifest.permissions, ['storage']); assert.deepEqual(manifest.host_permissions, ['https://tv.youtube.com/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('managed sessions route audio safely, bounded creation, isolated replacement, sender validation and worker recovery', async () => {
  let listener: ((message: unknown, sender: unknown, reply: (value: any) => void) => unknown) | undefined;
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=original', active: true, mutedInfo: { muted: false } }], [4, { id: 4, windowId: 4, url: 'https://tv.youtube.com/live', mutedInfo: { muted: false } }]]);
  const log: Array<{ operation: string; id?: number; value?: any }> = []; const local: Record<string, unknown> = {}; const session: Record<string, unknown> = {};
  let next = 2; let createGate: Promise<void> | undefined; let creationStarted: (() => void) | undefined;
  let injectionPermission = false;
  let reconnectResponse: ((message: any) => unknown) | undefined;
  let failEnable = false; let failMuteOnce = false; let failFocus = false;
  const players = new Map<number, { muted: boolean; volume: number }>([[1, { muted: false, volume: .37 }]]);
  (globalThis as any).chrome = {
    storage: {
      local: { get: async (key: string) => ({ [key]: structuredClone(local[key]) }), set: async (value: object) => Object.assign(local, structuredClone(value)) },
      session: { get: async (key: string) => ({ [key]: structuredClone(session[key]) }), set: async (value: object) => Object.assign(session, structuredClone(value)) },
    },
    runtime: { id: 'local', getURL: (path: string) => `chrome-extension://local/${path}`, sendMessage: async () => undefined,
      onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    permissions: { contains: async () => injectionPermission },
    scripting: { executeScript: async (value: any) => { log.push({ operation: 'inject', value }); return []; } },
    tabs: {
      query: async (q: any) => [...tabs.values()].filter(tab => q?.windowId !== undefined ? tab.windowId === q.windowId : tab.url.startsWith('https://tv.youtube.com/')), get: async (id: number) => { if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
      update: async (id: number, value: object) => { log.push({ operation: 'update', id, value }); if (failMuteOnce && id === 1 && (value as any).muted === true) { failMuteOnce = false; throw new Error('synthetic mute failure'); }
        Object.assign(tabs.get(id), value); if ('muted' in value) tabs.get(id).mutedInfo = { muted: (value as any).muted, reason: 'extension' }; return tabs.get(id); },
      sendMessage: async (id: number, message: any) => {
        if (message.type === 'GET_OBSERVATION') return reconnectResponse?.(message);
        if (message.type === 'NAVIGATE') { log.push({operation:'navigate',id,value:message}); return {ok:false,code:'TIMEOUT',reason:'Synthetic playback not confirmed'}; }
        if (message.type !== 'PLAYER_AUDIO') return undefined;
        log.push({ operation: 'player-audio', id, value: message });
        if (failEnable && message.muted === false) return { ok: false };
        const player = players.get(id); if (!player) return { ok: false };
        if (message.muted !== undefined) player.muted = message.muted;
        if (message.volume !== undefined) player.volume = message.volume;
        return { ok: true, value: { ...player } };
      }, remove: async (id: number) => { tabs.delete(id); },
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} },
    },
    windows: {
      create: async (value: any) => { while (tabs.has(next)) next++; const id = next++; log.push({ operation: 'create', id, value }); creationStarted?.(); if (createGate) await createGate; const tab = { id, windowId: id, url: value.url }; tabs.set(id, tab); players.set(id, { muted: true, volume: .24 }); return { id, tabs: [tab] }; },
      update: async (id: number, value: any) => { log.push({ operation: 'window-update', id, value }); if (failFocus && value.focused) throw new Error('synthetic focus failure'); return { id }; },
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
    currentChannelId: 'yttv:cbs', playback: { playing: true, muted: false, volume: .37, currentTime: 10, readyState: 4, width: 1280, height: 720 } };
  await send({ type: 'OBSERVE', observation }, { id: 'local', url: 'https://tv.youtube.com/watch?v=original', tab: tabs.get(1) });
  const originalSender = { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) };
  assert.equal((await send({ type: 'RECONNECT_MAIN' })).code, 'INJECTION_PERMISSION');
  injectionPermission = true; const reconnectStart = log.length;
  const nativeBefore = structuredClone({ tab: tabs.get(1), player: players.get(1) });
  const confirmedReconnect = (message: any) => ({ ...observation, observedAt: new Date().toISOString(), playerKey: 'original-player', connectionBuild: 'source', connectionNonce: message.connectionNonce });
  for (const response of [undefined, () => ({}), (m: any) => ({ ...confirmedReconnect(m), observedAt: '2020-01-01T00:00:00Z' }),
    (m: any) => ({ ...confirmedReconnect(m), connectionBuild: 'old-build' }), (m: any) => ({ ...confirmedReconnect(m), connectionNonce: 'old-request' }),
    (m: any) => ({ ...confirmedReconnect(m), playback: { ...observation.playback, volume: null } }),
    (m: any) => ({ ...confirmedReconnect(m), playback: { ...observation.playback, readyState: 0 } })]) {
    reconnectResponse = response;
    assert.equal((await send({ type: 'RECONNECT_MAIN' })).code, 'RECONNECT_UNCONFIRMED');
  }
  reconnectResponse = confirmedReconnect;
  assert.equal((await send({ type: 'RECONNECT_MAIN' })).ok, true);
  reconnectResponse = undefined;
  assert.deepEqual({ tab: tabs.get(1), player: players.get(1) }, nativeBefore);
  assert.equal(log.slice(reconnectStart).filter(x => x.operation === 'inject').length, 8);
  for (const row of log.slice(reconnectStart).filter(x => x.operation === 'inject')) assert.deepEqual(row.value, { target: { tabId: 1 }, files: ['content.js'] });
  assert.equal(log.slice(reconnectStart).some(x => x.operation === 'player-audio' || x.operation === 'navigate' || x.operation === 'create'), false);
  assert.equal(log.slice(reconnectStart).some(x => x.operation === 'update'), false, 'reconnection never reloads/navigates/unmutes');
  assert.equal((await send({ type: 'RECONNECT_MAIN' }, originalSender)).code, 'INVALID_SENDER');
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, false);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true }, originalSender)).ok, true);
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, true);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true })).ok, false, 'popup cannot change another tab’s drawer');
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: true }, { ...originalSender, id: 'unrelated' })).ok, false, 'another extension cannot impersonate the content bridge');
  observation.observedAt = new Date().toISOString();
  const sportsRow = { ...observation.guide[0], programTitle: 'NHL Replay', programs: [{ title: 'NHL Replay', context: 'CURRENT' as const }, {title:'WNBA Countdown',context:'NEXT' as const}] };
  await send({ type:'OBSERVE', observation: {...observation, guide:[sportsRow]} }, originalSender);
  assert.equal((await send({type:'GET_SNAPSHOT'})).guide[0].programs[0].title,'NHL Replay');
  const beforeSportsReject = log.length;
  for (const command of [
    {type:'WATCH_PROGRAM' as const, channelId:'yttv:cbs',title:'WNBA Countdown',observedAt:now},
    {type:'ADD_PROGRAM' as const, channelId:'yttv:cbs',title:'NHL Replay',observedAt:'2020-01-01T00:00:00Z'},
    {type:'WATCH_PROGRAM' as const, channelId:'yttv:cbs',title:'Changed NHL',observedAt:now},
  ]) assert.equal((await send(command)).code,'TARGET_UNAVAILABLE');
  assert.equal(log.length,beforeSportsReject,'changed and future program intents do not navigate or create');
  assert.equal((await send({type:'WATCH_PROGRAM',channelId:'yttv:cbs',title:'NHL Replay',observedAt:now})).code,'TIMEOUT');
  assert.equal(log.at(-1)?.operation,'navigate'); assert.equal(log.at(-1)?.id,1);
  assert.equal(players.get(1)!.volume,.37); assert.equal(players.get(1)!.muted,false);
  let releaseCreation!: () => void; const started = new Promise<void>(resolve => { creationStarted = resolve; });
  createGate = new Promise<void>(resolve => { releaseCreation = resolve; });
  const pendingCreation = send({ type: 'ADD_PROGRAM', channelId: 'yttv:cbs', title:'NHL Replay', observedAt:now });
  await started; const pendingSnapshot = await send({ type: 'GET_SNAPSHOT' });
  assert.equal(pendingSnapshot.pendingFeedCreations, 1); assert.equal(pendingSnapshot.panes.length, 1);
  releaseCreation(); assert.equal((await pendingCreation).ok, true); createGate = undefined; creationStarted = undefined;
  const creation = log.findIndex(item => item.operation === 'create');
  assert.equal(log[creation].value.url, 'about:blank');
  assert.deepEqual(log[creation + 1], { operation: 'update', id: 2, value: { muted: true } });
  assert.equal(log[creation + 2].value.muted, true); assert.equal(log[creation + 2].value.url, observation.guide[0].target!.url);
  const snapshot = await send({ type: 'GET_SNAPSHOT' }); const paneId = snapshot.panes[1].id;
  const managedSender = { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) };
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, managedSender)).opened, false, 'new managed player does not inherit the original drawer state');
  assert.equal(snapshot.panes[0].id, 'main'); assert.equal(snapshot.playback.muted, false);
  const beforeSelection = log.length;
  assert.equal((await send({ type: 'SELECT_PANE', paneId })).ok, true);
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, false);
  assert.equal(players.get(2)!.volume, .24, 'selection preserves player volume');
  const selectionLog = log.slice(beforeSelection);
  assert(selectionLog.findIndex(x => x.id === 1 && x.value?.muted === true) < selectionLog.findIndex(x => x.id === 2 && x.value?.muted === false));
  const retiredBoundary = log.length;
  for (const command of [{ type: 'REFRESH_SPORTS' }, { type: 'WATCH_EVENT', eventId: 'old-provider' },
    { type: 'CREATE_PANE', channelId: 'yttv:cbs', eventId: 'old-provider' }])
    assert.equal((await send(command as any)).code, 'UNSUPPORTED_PATH');
  assert.equal(log.length, retiredBoundary, 'retired commands cannot mutate players/windows');
  const attempts = await Promise.all(Array.from({ length: 3 }, () => send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })));
  assert.deepEqual(attempts.map(result => result.ok), [true, true, false], 'pending creations serialize through the shared four-feed ceiling');
  assert.equal(attempts[2].code, 'SESSION_BOUND');
  const four = await send({ type: 'GET_SNAPSHOT' }); assert.equal(four.panes.length, 4);
  const focusStart = log.length;
  await send({ type: 'FOCUS_PANE', paneId });
  assert.equal(log.slice(focusStart).some(row => row.value?.muted !== undefined || row.operation === 'player-audio'), false);
  for (const extra of four.panes.slice(2)) await send({ type: 'REMOVE_PANE', paneId: extra.id });
  assert.equal(tabs.size, 3, 'only main, one added and unrelated native Live after closing test companions');
  assert.equal((await send({ type: 'PREFERENCE', patch: { nightMuteLock: true } } as any)).code, 'INVALID_COMMAND');
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).preferences.nightMuteLock, false);
  await Promise.all([send({ type: 'SELECT_PANE', paneId: 'main' }), send({ type: 'SELECT_PANE', paneId })]);
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, false);
  failEnable = true;
  assert.equal((await send({ type: 'SELECT_PANE', paneId: 'main' })).ok, false);
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, true);
  assert.match((await send({ type: 'GET_SNAPSHOT' })).audioError, /failed/);
  failEnable = false; failMuteOnce = true;
  const muteFailLog = log.length;
  assert.equal((await send({ type: 'SELECT_PANE', paneId })).ok, false);
  assert.equal(log.slice(muteFailLog).some(x => x.value?.muted === false), false, 'failed isolation never enables target');
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, true, 'compensation retries failed mutes');
  failFocus = true;
  assert.equal((await send({ type: 'SELECT_PANE', paneId })).ok, false);
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, true);
  failFocus = false;
  assert.equal((await send({ type: 'SELECT_PANE', paneId: 'main' })).ok, true);
  assert.equal((await send({ type: 'AUDIO', volume: .19 })).ok, true);
  assert.equal(players.get(1)!.volume, .19);
  assert.equal((await send({ type: 'AUDIO', volume: 2 })).ok, false);
  assert.equal((await send({ type: 'MUTE' })).ok, true);
  assert.equal(tabs.get(1).mutedInfo.muted, true); assert.equal(tabs.get(2).mutedInfo.muted, true);
  assert.equal(tabs.get(4).mutedInfo.muted, false, 'unrelated YouTube TV tab stays untouched');
  assert.equal(log.some(x => x.id === 4 && (x.operation === 'update' || x.operation === 'player-audio')), false);

  const rejected = await send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' }, { id: 'unrelated', url: 'https://evil.example/', tab: tabs.get(1) });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'INVALID_SENDER');
  assert.equal(tabs.size, 3);

  const secondChannel = { ...observation.guide[0], channel: { id: 'yttv:fox', name: 'FOX' }, target: { ...observation.guide[0].target!, channelId: 'yttv:fox', url: 'https://tv.youtube.com/watch?v=fox&vp=guide' } };
  await send({ type: 'OBSERVE', observation: { ...observation, guide: [...observation.guide, secondChannel], playback: { ...observation.playback, currentTime: 11 } } }, { id: 'local', url: tabs.get(1).url, tab: tabs.get(1) });
  const untouchedOriginal = tabs.get(1).url; const untouchedOtherPane = tabs.get(4).url;
  const beforeReplacement = log.length;
  assert.equal((await send({ type: 'REPLACE_PANE', paneId, channelId: 'yttv:fox' })).ok, true);
  assert.equal(tabs.get(2).url, secondChannel.target.url);
  assert.equal(tabs.get(1).url, untouchedOriginal); assert.equal(tabs.get(4).url, untouchedOtherPane);
  assert.deepEqual(log.slice(beforeReplacement).filter(item => item.value?.url).map(item => item.id), [2]);

  const beforeMainExpand = log.length; assert.equal((await send({ type: 'EXPAND_PANE', paneId: 'main' })).code, 'MAIN_NOT_ENROLLED'); assert.equal(log.length, beforeMainExpand);
  assert.equal((await send({ type: 'EXPAND_PANE', paneId })).ok, true);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).expandedPaneId, paneId);
  assert.equal((await send({ type: 'RESTORE_LAYOUT' })).ok, true);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).expandedPaneId, undefined);
  assert(log.some(item => item.operation === 'window-update' && item.value?.width === 780));

  const paneObservation = { ...observation, guide: [...observation.guide, secondChannel], currentChannelId: 'yttv:fox' };
  await send({ type: 'OBSERVE', observation: paneObservation }, { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) });
  assert.match((await send({ type: 'GET_SNAPSHOT' })).panes[1].status, /not confirmed/);
  await send({ type: 'OBSERVE', observation: { ...paneObservation, playback: { ...paneObservation.playback, currentTime: 12 } } }, { id: 'local', url: tabs.get(2).url, tab: tabs.get(2) });
  assert.match((await send({ type: 'GET_SNAPSHOT' })).panes[1].status, /observed advancing/);

  // A worker restart revalidates stored tab IDs, never recreates missing sessions, and
  // does not treat a tab subsequently navigated elsewhere as an owned player.
  tabs.get(4).url = 'https://example.com/';
  const createsBeforeRecovery = log.filter(item => item.operation === 'create').length;
  const restartedWorker = await build({ entryPoints: [new URL('../apps/chrome-extension/src/background.ts', import.meta.url).pathname], bundle: true, write: false, format: 'iife', platform: 'browser' });
  runInNewContext(restartedWorker.outputFiles[0].text, { chrome: (globalThis as any).chrome, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
  const recovered = await send({ type: 'GET_SNAPSHOT' });
  assert.equal(recovered.panes.length, 2); assert.equal(recovered.panes[1].tabId, 2); assert.equal(recovered.panes[1].muted, true);
  assert.equal(log.filter(item => item.operation === 'create').length, createsBeforeRecovery);
  assert.equal(recovered.audioFocusId, undefined, 'worker restoration conveys no audio authority');
  assert.equal(recovered.playback.tabMuted, true);
  assert.equal(recovered.capabilities.navigation, false, 'transient navigation targets cannot survive without fresh content observation');
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, true, 'open drawer survives document and worker replacement');
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, managedSender)).opened, false);
  assert.equal((await send({ type: 'SET_DRAWER_STATE', opened: false }, originalSender)).ok, true);
  assert.equal((await send({ type: 'GET_DRAWER_STATE' }, originalSender)).opened, false);
  // Fresh-worker pending and unavailable observations cannot fabricate confirmed history.
  const pending = { ...observation, observedAt: new Date(Date.now()).toISOString(), playback: { ...observation.playback, currentTime: 20 } };
  const beforePending = recovered.preferences.currentChannel;
  await send({ type: 'OBSERVE', observation: pending }, originalSender);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).currentChannelId, beforePending);
  const nextObservation = { ...pending, observedAt: new Date(Date.now()).toISOString(), playback: { ...pending.playback, currentTime: 21 } };
  await send({ type: 'OBSERVE', observation: nextObservation }, originalSender);
  const confirmed = await send({ type: 'GET_SNAPSHOT' });
  assert.equal(confirmed.currentChannelId, 'yttv:cbs');
  const confirmedHistory = confirmed.preferences.recentChannels;
  const fixtureObservation = { ...nextObservation, currentChannelId: 'fixture:fox', guide: [{ ...secondChannel, channel: { id: 'fixture:fox', name: 'FOX fixture' }, evidenceClass: 'FIXTURE' as const }], playback: { ...pending.playback, currentTime: 22 } };
  await send({ type: 'OBSERVE', observation: fixtureObservation }, originalSender);
  assert.deepEqual((await send({ type: 'GET_SNAPSHOT' })).preferences.recentChannels, confirmedHistory);
  const failedNavigation = await send({ type: 'NAVIGATE', channelId: 'missing' }, originalSender);
  assert.equal(failedNavigation.ok, false); assert.equal(failedNavigation.code, 'TARGET_UNAVAILABLE');
  assert.deepEqual((await send({ type: 'GET_SNAPSHOT' })).preferences.recentChannels, confirmedHistory);
  const oldObservation = { ...pending, observedAt: '2020-01-01T00:00:00Z', currentChannelId: 'yttv:fox', guide: [secondChannel], playback: { ...pending.playback, currentTime: 100 } };
  await send({ type: 'OBSERVE', observation: oldObservation }, originalSender);
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).currentChannelId, 'yttv:cbs');
  assert.equal((await send({ type: 'REMOVE_PANE', paneId: 'main' })).ok, false);
  assert.equal((await send({ type: 'REMOVE_PANE', paneId })).ok, true);
  assert.equal(tabs.has(1), true); assert.equal(tabs.has(2), false);
  assert.equal((await send({ type: 'AUDIO', muted: false })).ok, true);
  assert.equal(tabs.get(1).mutedInfo.muted, false);
  const normalRefresh = log.length; await send({ type: 'REFRESH' });
  assert.equal(log.slice(normalRefresh).some(x => x.operation === 'update'), false, 'single-player observations do not enforce mute');
  assert.equal(players.get(1)!.volume, .19);
});
