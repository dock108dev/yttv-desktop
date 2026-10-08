import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { envelope } from '../../apps/chrome-extension/src/adapter';

const bundled = build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const sourcePromise = bundled.then(result => result.outputFiles[0].text);
export async function harness() {
  const source = await sourcePromise;
  const local: Record<string, any> = {}; const session: Record<string, any> = {};
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=main', mutedInfo: { muted: false }, active: true }]]);
  const players = new Map<number, any>([[1, { muted: false, volume: 1, readyState: 4, key: 'player-1', documentId: 'document-1', route: 'watch' }]]);
  const controls: { guideSync?: boolean; tabGetFails?: number; audio?: (id: number, message: any) => Promise<any>; tabFails?: boolean; localFails?: boolean; sessionFails?: boolean; removeFails?: boolean; queryFails?: boolean; sessionReadFails?: boolean } = {};
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
      create: async (row: any) => {
        if (!controls.guideSync) throw new Error('Discovery disabled in unrelated fixture');
        const id = next++; const tab = { id, ...row, mutedInfo: { muted: false } }; tabs.set(id, tab);
        players.set(id, { muted: true, volume: 1, readyState: 0, key: `guide-${id}`, documentId: `guide-doc-${id}`, route: 'guide' });
        log.push({ type: 'discovery', id, row }); return tab;
      },
      query: async () => { if (controls.queryFails) throw new Error('private query'); return [...tabs.values()].filter(tab => tab.url.startsWith('https://tv.youtube.com/')); },
      get: async (id: number) => { if (controls.tabGetFails === id) throw new Error('Transient tab lookup'); if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
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
  const start = () => runInNewContext(source, { chrome, URL, crypto: { randomUUID: () => 'fixture' }, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval });
  let omitDocumentId = false;
  const send = (command: any, id?: number) => new Promise<any>(resolve => listener(envelope(command), id ? { id: 'test', url: tabs.get(id)?.url, tab: tabs.get(id), documentId: omitDocumentId ? undefined : players.get(id).documentId } : { id: 'test', url: 'chrome-extension://test/panel.html' }, resolve));
  const observe = (id = 1, raw = observation(id)) => send({ type: 'OBSERVE', observation: raw, playerKey: players.get(id).key }, id);
  const replacement = (key = 'player-new', documentId = 'document-new') => Object.assign(players.get(1), { volume: 1, key, documentId });
  start(); return { omitDocumentIdentity: () => { omitDocumentId = true; }, start, send, sendFrom: (command: any, sender: any) => new Promise<any>(resolve => listener(envelope(command), sender, resolve)), observe, replacement, observation, players, tabs, log, local, session, controls, advance: () => { clock += 11_000; }, remove: (id = 1) => chrome.tabs.remove(id), updated: (...args: any[]) => updated(...args) };
}
