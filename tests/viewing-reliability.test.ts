import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { envelope } from '../apps/chrome-extension/src/adapter';

const bundled = build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const sourcePromise = bundled.then(result => result.outputFiles[0].text);
async function harness() {
  const source = await sourcePromise;
  const local: Record<string, any> = {}; const session: Record<string, any> = {};
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=main', mutedInfo: { muted: false }, active: true }]]);
  const players = new Map<number, any>([[1, { muted: false, volume: 1, readyState: 4, key: 'player-1', documentId: 'document-1', route: 'watch' }]]);
  const controls: { audio?: (id: number, message: any) => Promise<any>; tabFails?: boolean; localFails?: boolean; sessionFails?: boolean; removeFails?: boolean; queryFails?: boolean; sessionReadFails?: boolean } = {};
  const log: any[] = []; let next = 2; let listener: any; let removed: any; let updated: any; let clock = Date.now() + 1000;
  const observation = (id = 1) => { const player = players.get(id); const now = new Date(++clock).toISOString(); const guideTime = new Date(Date.now() - 10).toISOString(); return {
    observedAt: now, guideObservedAt: now, route: player.route, currentChannelId: 'yttv:cbs',
    playback: { muted: player.muted, volume: player.volume, readyState: player.readyState, playing: true, currentTime: clock, width: 1280, height: 720 },
    guide: [{ channel: { id: 'yttv:cbs', name: 'CBS' }, observedAt: guideTime, evidenceClass: 'LIVE', available: true,
      target: { kind: 'navigation', channelId: 'yttv:cbs', url: 'https://tv.youtube.com/watch?v=cbs&vp=guide', verifiedAt: guideTime, evidenceClass: 'LIVE' } }],
  }; };
  const chrome = {
    storage: Object.fromEntries(['local', 'session'].map(area => { const data = area === 'local' ? local : session; return [area, {
      get: async (key: string) => { if (area === 'session' && controls.sessionReadFails) throw new Error('private session read'); return { [key]: structuredClone(data[key]) }; }, set: async (value: object) => { if (area === 'local' ? controls.localFails : controls.sessionFails) throw new Error('private token=synthetic'); Object.assign(data, structuredClone(value)); },
    }]; })),
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, sendMessage: async () => undefined, onMessage: { addListener: (fn: any) => { listener = fn; } } },
    tabs: {
      query: async () => { if (controls.queryFails) throw new Error('private query'); return [...tabs.values()].filter(tab => tab.url.startsWith('https://tv.youtube.com/')); },
      get: async (id: number) => { if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
      update: async (id: number, value: any) => { log.push({ type: 'tab', id, value }); const tab = tabs.get(id); if (controls.tabFails) throw new Error('test tab failure'); if (!tab) throw new Error('closed'); Object.assign(tab, value); if ('muted' in value) tab.mutedInfo = { muted: value.muted, reason: 'extension' }; return tab; },
      sendMessage: async (id: number, message: any, options: any) => {
        if (message.type === 'GET_OBSERVATION') return observation(id);
        if (message.type !== 'PLAYER_AUDIO') return undefined;
        log.push({ type: 'player', id, message, options }); if (controls.audio && message.volume !== undefined) return controls.audio(id, message); const player = players.get(id);
        if (options?.documentId && options.documentId !== player.documentId || message.playerKey && message.playerKey !== player.key) return { ok: false };
        if (message.volume !== undefined) player.volume = message.volume;
        if (message.muted !== undefined) player.muted = message.muted;
        return { ok: true, value: { volume: player.volume, muted: player.muted } };
      },
      remove: async (id: number) => { tabs.delete(id); removed(id); },
      onRemoved: { addListener: (fn: any) => { removed = fn; } }, onUpdated: { addListener: (fn: any) => { updated = fn; } },
    },
    windows: {
      create: async () => { const id = next++; const tab = { id, windowId: id, url: 'about:blank', mutedInfo: { muted: true } }; tabs.set(id, tab); players.set(id, { muted: true, volume: .24, readyState: 4, key: `player-${id}`, documentId: `document-${id}`, route: 'watch' }); return { id, tabs: [tab] }; },
      update: async (id: number) => ({ id }), remove: async (id: number) => { if (controls.removeFails) throw new Error('private cleanup'); tabs.delete(id); removed(id); },
    },
  };
  const start = () => runInNewContext(source, { chrome, URL, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
  let omitDocumentId = false;
  const send = (command: any, id?: number) => new Promise<any>(resolve => listener(envelope(command), id ? { id: 'test', url: tabs.get(id)?.url, tab: tabs.get(id), documentId: omitDocumentId ? undefined : players.get(id).documentId } : { id: 'test', url: 'chrome-extension://test/panel.html' }, resolve));
  const observe = (id = 1, raw = observation(id)) => send({ type: 'OBSERVE', observation: raw, playerKey: players.get(id).key }, id);
  const replacement = (key = 'player-new', documentId = 'document-new') => Object.assign(players.get(1), { volume: 1, key, documentId });
  start(); return { omitDocumentIdentity: () => { omitDocumentId = true; }, start, send, sendFrom: (command: any, sender: any) => new Promise<any>(resolve => listener(envelope(command), sender, resolve)), observe, replacement, observation, players, tabs, log, local, session, controls, advance: () => { clock += 11_000; }, remove: (id = 1) => chrome.tabs.remove(id), updated: (...args: any[]) => updated(...args) };
}

test('explicit volume survives a ready replacement without enabling a deliberately muted tab', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); await h.send({ type: 'MUTE' });
  h.replacement(); h.players.get(1).readyState = 0; const before = h.log.length; await h.observe();
  assert.equal(h.log.slice(before).some(row => row.type === 'player'), false, 'loading placeholder cannot consume the saved choice');
  h.players.get(1).readyState = 4; await h.observe();
  assert.equal(h.players.get(1).volume, .37, 'new native player must recover the explicit choice');
  assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert.equal(h.log.slice(before).some(row => row.value?.muted === false || row.message?.muted === false), false);
  const recovery = h.log.slice(before).find(row => row.message?.volume === .37);
  assert.equal(recovery.options.documentId, 'document-new'); assert.equal(recovery.message.playerKey, 'player-new');
});

test('native volume change supersedes saved volume; guide preview and old observations cannot overwrite it', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 });
  h.players.get(1).volume = .23; await h.observe();
  const old = h.observation(); h.players.get(1).route = 'guide'; h.replacement('preview', 'document-guide'); await h.observe();
  h.players.get(1).route = 'watch'; h.replacement('watch-again', 'document-watch'); await h.observe();
  assert.equal(h.players.get(1).volume, .23);
  await h.observe(1, old); assert.equal(h.players.get(1).volume, .23);
  assert.equal(h.log.some(row => row.type === 'tab'), false, 'volume alone never mutates tab mute');
});

test('worker wake retains volume choices but grants no saved layout audio authority', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .19 });
  await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const id = (await h.send({ type: 'GET_SNAPSHOT' })).panes[1].id; await h.send({ type: 'SELECT_PANE', paneId: 'main' });
  h.start(); const restored = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(restored.audioFocusId, undefined); assert.equal(h.tabs.get(1).mutedInfo.muted, true); assert.equal(h.tabs.get(2).mutedInfo.muted, true);
  h.replacement(); await h.observe(); assert.equal(h.players.get(1).volume, .19); assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert.equal((await h.send({ type: 'REMOVE_PANE', paneId: id })).ok, true);
  await h.send({ type: 'SELECT_PANE', paneId: 'main' }); const before = h.log.length;
  h.updated(1, { url: h.tabs.get(1).url }, h.tabs.get(1)); h.replacement('post-close', 'post-close-doc'); await h.observe();
  assert.equal(h.tabs.get(1).mutedInfo.muted, false); assert.equal(h.log.slice(before).some(row => row.value?.muted !== undefined), false, 'close then refresh cannot enforce multi-feed mute on the sole main');
  assert.equal(h.session['yttv-desktop.managed-windows.v1'].panes.length, 0);
});

test('explicit choice queued during loading wins over prior volume on eventual readiness', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 });
  h.replacement(); h.players.get(1).readyState = 0; await h.observe();
  await h.send({ type: 'AUDIO', volume: .11 }); h.players.get(1).readyState = 4; await h.observe();
  assert.equal(h.players.get(1).volume, .11);
  h.replacement('later', 'later-doc'); await h.observe(); assert.equal(h.players.get(1).volume, .11);
});

test('mute diagnostics identify bounded extension callers without guide, URLs, account or authority restoration', async () => {
  const h = await harness(); await h.observe();
  for (let i = 0; i < 20; i++) await h.send({ type: 'MUTE' });
  const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(snapshot.audioDiagnostics.length, 16); assert(snapshot.audioDiagnostics.every((row: any) => row.cause === 'explicit Mute all' && row.result === 'confirmed' && row.muted));
  assert.doesNotMatch(JSON.stringify(snapshot.audioDiagnostics), /youtube|watch\?|yttv:cbs|document-1|player-1/);
  assert.equal(snapshot.audioFocusId, undefined);
});


test('optional sender document metadata cannot silently drop a successful volume choice', async () => {
  const h = await harness(); h.omitDocumentIdentity(); await h.observe();
  assert.equal((await h.send({ type: 'AUDIO', volume: .42 })).ok, true);
  await h.send({ type: 'MUTE' }); h.replacement(); await h.observe();
  assert.equal(h.players.get(1).volume, .42);
  assert.equal(h.tabs.get(1).mutedInfo.muted, true);
});


test('replacement failure then confirmed success reconciles only its scoped warning', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  h.controls.audio = async () => ({ ok: false, audioFailure: 'NATIVE_REFUSED' }); await h.observe();
  let state = await h.send({ type: 'GET_SNAPSHOT' }); assert.match(state.audioError, /Saved player volume/); assert.equal(state.volumeRecovery.failure, 'NATIVE_REFUSED');
  h.controls.tabFails = true; await h.send({ type: 'MUTE' }); h.controls.tabFails = false;
  h.controls.audio = undefined; h.advance(); await h.observe();
  state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(h.players.get(1).volume, .37);
  assert.equal(state.volumeRecovery.status, 'Restored on ready replacement'); assert.doesNotMatch(state.audioError, /Saved player volume/);
  assert.match(state.audioError, /could not confirm browser mute/, 'volume recovery must preserve unrelated isolation failure');
});

test('persistent refusal is bounded and remains visibly unavailable with the native fallback', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  h.controls.audio = async () => ({ ok: false, audioFailure: 'NATIVE_REFUSED', reason: 'secret URL https://private.test' });
  const before = h.log.length;
  for (let i = 0; i < 12; i++) { h.advance(); await h.observe(); }
  const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(h.log.slice(before).filter(r => r.message?.volume !== undefined).length, 3);
  assert.equal(state.volumeRecovery.savedVolume, .37); assert.equal(h.players.get(1).volume, 1);
  assert.equal(state.volumeRecovery.status, 'Recovery unavailable; use native volume'); assert.match(state.audioError, /native player/);
  assert.doesNotMatch(JSON.stringify(state.volumeDiagnostics), /secret|private|document|player-new/);
});

test('late recovery success cannot erase a newer failed explicit choice or overwrite saved choice', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  let release!: (reply: any) => void; let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  h.controls.audio = async (_id, message) => { if (message.volume === .37) { entered(); return new Promise(r => { release = r; }); } return { ok: false, audioFailure: 'NATIVE_REFUSED' }; };
  const old = h.observe(); await started; const newer = h.send({ type: 'AUDIO', volume: .61 });
  await new Promise(r => setTimeout(r, 0)); release({ ok: true, value: { volume: .37 } }); await old; assert.equal((await newer).ok, false);
  const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.match(state.audioError, /Player audio operation failed/); assert.equal(state.volumeRecovery.savedVolume, .37, 'failed newer choice is not saved as confirmed');
  assert.equal(state.volumeRecovery.status, 'Explicit volume unavailable; use native volume');
  assert(state.volumeDiagnostics.some((r: any) => r.result === 'superseded'));
});

test('late refusal after a new player or closed session leaves no stale warning', async () => {
  for (const close of [false, true]) {
    const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
    let release!: (reply: any) => void; let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
    h.controls.audio = async () => { entered(); return new Promise(r => { release = r; }); };
    const old = h.observe(); await started;
    if (close) await h.remove(); else { h.replacement('latest', 'latest-doc'); h.players.get(1).readyState = 0; }
    const latest = close ? undefined : h.observe(); await new Promise(r => setTimeout(r, 0));
    release({ ok: false, audioFailure: 'NATIVE_REFUSED' }); await old; if (latest) await latest;
    const state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.audioError, undefined); assert.notEqual(state.volumeRecovery.status, 'Replacement refused or unavailable');
  }
});

test('queued earlier explicit volume cannot overwrite a later successful choice', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  let release!: (reply: any) => void; let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  h.controls.audio = async () => { entered(); return new Promise(r => { release = r; }); };
  const old = h.observe(); await started; const first = h.send({ type: 'AUDIO', volume: .42 }); const last = h.send({ type: 'AUDIO', volume: .61 });
  await new Promise(r => setTimeout(r, 0)); h.controls.audio = undefined; release({ ok: true, value: { volume: .37 } });
  await old; assert.equal((await first).code, 'SUPERSEDED'); assert.equal((await last).ok, true);
  assert.equal(h.players.get(1).volume, .61); assert.equal((await h.send({ type: 'GET_SNAPSHOT' })).volumeRecovery.savedVolume, .61);
});


test('native volume intent cancels an older replacement result and its settled choice survives the next replacement', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  let release!: (reply: any) => void; let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  h.controls.audio = async () => { entered(); return new Promise(r => { release = r; }); };
  const old = h.observe(); await started;
  await h.send({ type: 'NATIVE_VOLUME_INPUT', playerKey: 'player-new' }, 1);
  h.players.get(1).volume = .61; await h.send({ type: 'NATIVE_VOLUME_INPUT', playerKey: 'player-new', observation: h.observation() }, 1);
  release({ ok: false, audioFailure: 'NATIVE_REFUSED' }); await old;
  let state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.audioError, undefined); assert.equal(state.volumeRecovery.savedVolume, .61);
  h.controls.audio = undefined; h.replacement('next', 'next-doc'); await h.observe(); assert.equal(h.players.get(1).volume, .61);
});


test('confirmed recovery removes the preceding volume warning without another mute or user retry', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 }); h.replacement();
  h.controls.audio = async () => ({ ok: false, audioFailure: 'NATIVE_REFUSED' }); await h.observe();
  assert.match((await h.send({ type: 'GET_SNAPSHOT' })).audioError, /Saved player volume/);
  h.controls.audio = undefined; h.advance(); await h.observe();
  const state = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(state.volumeRecovery.status, 'Restored on ready replacement');
  assert.equal(state.audioError, undefined); assert.equal(state.volumeRecovery.savedVolume, .37); assert.equal(h.players.get(1).volume, .37);
});


test('stale native settlement cannot replace later Desktop success or its current feedback', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'AUDIO', volume: .37 });
  await h.send({ type: 'NATIVE_VOLUME_INPUT', playerKey: 'player-1' }, 1); h.players.get(1).volume = .23; const stale = h.observation();
  await h.send({ type: 'AUDIO', volume: .61 });
  const reply = await h.send({ type: 'NATIVE_VOLUME_INPUT', playerKey: 'player-1', observation: stale }, 1);
  assert.equal(reply.code, 'SUPERSEDED'); const state = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(state.volumeRecovery.savedVolume, .61); assert.equal(state.volumeRecovery.status, 'Explicit choice retained'); assert.equal(state.audioError, undefined);
});


test('failed preference patch preserves visible and durable choices; a later retry recovers', async () => {
  const h = await harness(); await h.observe();
  await h.send({ type: 'PREFERENCE', patch: { favorites: ['yttv:cbs'] } });
  h.controls.localFails = true;
  const failed = await h.send({ type: 'PREFERENCE', patch: { favorites: ['yttv:other'] } });
  assert.equal(failed.code, 'STORAGE_UNAVAILABLE');
  let snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.deepEqual(Array.from(snapshot.preferences.favorites), ['yttv:cbs']);
  assert.deepEqual(h.local['yttv-desktop.preferences.v1'].favorites, ['yttv:cbs']);
  assert.equal(snapshot.preferencePersistence, 'unavailable');
  assert(snapshot.failureDiagnostics.some((row: any) => row.code === 'PREFERENCES_WRITE_FAILED'));
  assert.doesNotMatch(JSON.stringify(snapshot.failureDiagnostics), /private|token|synthetic/);
  h.controls.localFails = false;
  assert.equal((await h.send({ type: 'PREFERENCE', patch: { favorites: ['yttv:other'] } })).ok, true);
  snapshot = await h.send({ type: 'GET_SNAPSHOT' }); assert.equal(snapshot.preferencePersistence, 'saved');
});

test('restored layout mute refusal stays visible and grants no audio authority', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  h.controls.tabFails = true; h.start();
  const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.match(snapshot.audioError, /mute failed|mute could not be confirmed/);
  assert.equal(snapshot.audioFocusId, undefined);
  assert(snapshot.failureDiagnostics.some((row: any) => row.code === 'RESTORE_AUDIO_FAILED' && row.count === 2));
});

test('failed creation cleanup retains the added window for control and reports explicit failure', async () => {
  const h = await harness(); await h.observe(); h.controls.tabFails = true; h.controls.removeFails = true;
  assert.equal((await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })).code, 'WINDOW_CLEANUP_FAILED');
  const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(snapshot.panes.length, 2); assert.match(snapshot.audioError, /cleanup failed/);
  assert(snapshot.failureDiagnostics.some((row: any) => row.code === 'WINDOW_CLEANUP_FAILED'));
});

test('tab close consumes storage rejections and records failure without recreating the feed', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  h.controls.sessionFails = true; h.controls.localFails = true; await h.remove(2);
  await new Promise(resolve => setTimeout(resolve, 20));
  const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(snapshot.panes.length, 1);
  assert(snapshot.failureDiagnostics.some((row: any) => row.code === 'TAB_CLOSE_FAILED'));
});

test('notification query failure cannot turn a durable preference save into a failed command', async () => {
  const h = await harness(); await h.observe(); h.controls.queryFails = true;
  assert.equal((await h.send({ type: 'PREFERENCE', patch: { favorites: ['yttv:cbs'] } })).ok, true);
  h.controls.queryFails = false;
  const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert(snapshot.failureDiagnostics.some((row: any) => row.code === 'NOTIFY_FAILED'));
});


test('unreadable session restoration blocks feed creation and audio enable without overwriting records', async () => {
  const h = await harness(); await h.observe(); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const before = structuredClone(h.session['yttv-desktop.managed-windows.v1']);
  h.controls.sessionReadFails = true; h.start();
  assert.equal((await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' })).code, 'STORAGE_UNAVAILABLE');
  assert.equal((await h.send({ type: 'AUDIO', muted: false })).code, 'STORAGE_UNAVAILABLE');
  assert.equal((await h.send({ type: 'SELECT_PANE', paneId: 'main' })).code, 'STORAGE_UNAVAILABLE');
  assert.deepEqual(h.session['yttv-desktop.managed-windows.v1'], before);
});


test('unknown extension sender and invalid patches cannot mutate preferences or browser windows', async () => {
  const h = await harness(); await h.observe(); const before = h.log.length;
  assert.equal((await h.sendFrom({ type: 'MUTE' }, { id: 'test' })).code, 'INVALID_SENDER');
  assert.equal((await h.send({ type: 'PREFERENCE', patch: { schemaVersion: 100 } })).code, 'INVALID_COMMAND');
  assert.equal((await h.send({ type: 'AUDIO', muted: 'false' })).code, 'INVALID_COMMAND');
  assert.equal(h.log.length, before);
});

test('restored panes and diagnostics cannot carry arbitrary stored payloads into snapshots', async () => {
  const h = await harness(); const raw: any = h.observation(); raw.guide[0].target.privatePayload = 'synthetic-secret';
  await h.observe(1, raw); await h.send({ type: 'CREATE_PANE', channelId: 'yttv:cbs' });
  const saved = h.session['yttv-desktop.managed-windows.v1'];
  saved.panes[0].privatePayload = 'synthetic-secret'; saved.panes[0].error = 'synthetic-secret';
  saved.panes[0].savedBounds = { width: 780, height: 520, left: -780, top: 0, secret: 'synthetic-secret' };
  const log = h.session['yttv-desktop.audio-log.v1'];
  log[0].privatePayload = 'synthetic-secret'; log[0].cause = 'synthetic-secret';
  h.start(); const snapshot = await h.send({ type: 'GET_SNAPSHOT' });
  assert.equal(snapshot.panes.length, 2);
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-secret|privatePayload/);
});
