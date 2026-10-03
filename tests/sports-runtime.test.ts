import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { envelope, type Command } from '../apps/chrome-extension/src/adapter';
import { normalizeNBAGame } from '../packages/sports-engine/src/balldontlie';

// All provider and native-guide inputs are synthetic VM replay; no real player is opened.
test('event-first runtime revalidates guide evidence and preserves identity/main playback through provider failure', async () => {
  let callback: any; let failing = false; const calls: any[] = [];
  let clock = Date.now(); const stamp = () => new Date(clock).toISOString();
  const row = { id: 9001, datetime: stamp(), status_state: 'in_progress', status: '4th Qtr', period: 4,
    home_team: { id: 20, full_name: 'New York Knicks', name: 'Knicks' }, visitor_team: { id: 2, full_name: 'Boston Celtics', name: 'Celtics' } };
  const event = normalizeNBAGame(row, stamp());
  const session: Record<string, any> = {}; let tabCount = 2;
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=synthetic-only', mutedInfo: { muted: false } }]]);
  const chrome = {
    runtime: { id: 'test', getURL: () => 'chrome-extension://test/', getManifest: () => ({ host_permissions: ['http://127.0.0.1:4318/*'] }), sendMessage: async () => {}, onMessage: { addListener: (fn: any) => { callback = fn; } } },
    storage: { local: { get: async () => ({}), set: async () => {} }, session: { get: async (key: string) => ({ [key]: session[key] }), set: async (value: any) => Object.assign(session, structuredClone(value)) } },
    tabs: { query: async () => [...tabs.values()], get: async (id: number) => tabs.get(id),
      update: async (id: number, value: any) => { calls.push(['tab-update', id, value]); Object.assign(tabs.get(id), value); },
      sendMessage: async (id: number, value: any) => { if (value.type === 'NAVIGATE') { calls.push(['navigate', id, value.channelId]); throw new Error('Synthetic navigation pending'); } return undefined; },
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    windows: { create: async (value: any) => { calls.push(['create', value]); const id = tabCount++; const tab = { id, windowId: id, url: value.url }; tabs.set(id, tab); return { id, tabs: [tab] }; }, remove: async () => {} },
  };
  class ClockDate extends Date { static override now() { return clock; } }
  const worker = await build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
  runInNewContext(worker.outputFiles[0].text, { chrome, URL, structuredClone, Date: ClockDate, AbortSignal, fetch: async () => {
    if (failing) throw new Error('Synthetic provider failure'); return new Response(JSON.stringify({ provider: 'balldontlie-nba', state: 'READY', events: [event] }));
  } });
  const sender = { id: 'test', url: tabs.get(1).url, tab: tabs.get(1) };
  const send = (command: Command): Promise<any> => new Promise(resolve => callback(envelope(command), sender, resolve));
  const guide = { channel: { id: 'yttv:synthetic', name: 'Synthetic Sports' }, available: true, programTitle: 'NBA: Boston Celtics at New York Knicks', league: 'NBA', observedAt: stamp(), evidenceClass: 'LIVE',
    target: { kind: 'navigation', channelId: 'yttv:synthetic', url: 'https://tv.youtube.com/watch?v=synthetic-target', verifiedAt: stamp(), evidenceClass: 'LIVE' } };
  const observe = (rows: any[]) => send({ type: 'OBSERVE', observation: { guide: rows, route: 'guide', observedAt: stamp(), playback: { playing: true, muted: false, volume: .37, readyState: 4, currentTime: 10, width: 1280, height: 720 } } });
  await observe([guide]); assert.equal((await send({ type: 'REFRESH_SPORTS' })).ok, true);
  assert.equal((await send({ type: 'CREATE_PANE', channelId: guide.channel.id, eventId: 'fixture:invented' })).ok, false);
  await observe([{ ...guide, league: undefined }]);
  assert.equal((await send({ type: 'WATCH_EVENT', eventId: event.id })).ok, false); assert.equal(calls.length, 0);
  await observe([guide]);
  assert.equal((await send({ type: 'WATCH_EVENT', eventId: event.id })).code, 'NAVIGATION_PENDING');
  assert.equal((await send({ type: 'GET_SNAPSHOT' })).panes[0].eventId, event.id);
  assert.equal((await send({ type: 'ADD_EVENT', eventId: event.id })).ok, true);
  const added = (await send({ type: 'GET_SNAPSHOT' })).panes[1]; assert.equal(added.eventId, event.id);
  const creation = calls.findIndex(call => call[0] === 'create'); assert.equal(calls[creation][1].url, 'about:blank'); assert.equal(calls[creation + 1][2].muted, true);
  assert.equal((await send({ type: 'ADD_EVENT', eventId: event.id })).code, 'SESSION_BOUND');
  const before = calls.length; clock += 60_001; failing = true;
  assert.equal((await send({ type: 'REFRESH_SPORTS' })).ok, false);
  const failed = await send({ type: 'GET_SNAPSHOT' }); assert.equal(failed.sports.events[0].id, event.id); assert.equal(failed.sports.events[0].freshness, 'STALE');
  assert.equal((await send({ type: 'WATCH_EVENT', eventId: event.id })).ok, false); assert.equal(calls.length, before, 'provider failure never changes original playback or managed windows');
  assert.equal(failed.playback.volume, .37);
});
