import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { envelope } from '../../apps/chrome-extension/src/adapter';

const bundled = build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const sourcePromise = bundled.then(result => result.outputFiles[0].text);
export async function harness() {
  const source = await sourcePromise;
  const local: Record<string, any> = {}; const session: Record<string, any> = {};
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 1, url: 'https://tv.youtube.com/watch?v=main', mutedInfo: { muted: false }, active: true }]]);
  const windows = new Map<number, any>([[1, { id: 1, left: 20, top: 30, width: 1000, height: 700, state: 'normal' }]]);
  const players = new Map<number, any>([[1, { muted: false, volume: 1, readyState: 4, key: 'player-1', documentId: 'document-1', route: 'watch' }]]);
  const controls: { netflixPermission?: boolean; primeVideoPermission?: boolean; youtubePermission?: boolean; youtubeReply?: (id: number, result: any) => any; afterCreate?: () => Promise<void>; nowOffset?: number; playback?: (id: number, message: any, options: any) => Promise<any>; guideSync?: boolean; tabGetFails?: number; audio?: (id: number, message: any) => Promise<any>; tabFails?: boolean; localFails?: boolean; sessionFails?: boolean; removeFails?: boolean; queryFails?: boolean; sessionReadFails?: boolean } = {};
  const log: any[] = []; let next = 2; let listeners: any[] = []; const listener = (message: any, sender: any, reply: any) => { for (const fn of listeners) if (fn(message, sender, reply) === true) return true; reply(undefined); return false; }; let removed: any; let updated: any; let clock = Date.now() + 1000; let permissionsRemoved: any;
  const youtubeBindings = new Map<number, any>();
  const observation = (id = 1) => { const player = players.get(id); const now = new Date(++clock).toISOString(); const guideTime = new Date(Date.now() - 10).toISOString(); return {
    mainPlayerUnique: player.unique !== false, observedAt: now, guideObservedAt: now, route: player.route, currentChannelId: 'yttv:cbs',
    playback: { muted: player.muted, volume: player.volume, readyState: player.readyState, playing: player.playing ?? true, currentTime: clock, width: 1280, height: 720 },
    guide: [{ channel: { id: 'yttv:cbs', name: 'CBS' }, observedAt: guideTime, evidenceClass: 'LIVE', available: true,
      target: { kind: 'navigation', channelId: 'yttv:cbs', url: 'https://tv.youtube.com/watch?v=cbs&vp=guide', verifiedAt: guideTime, evidenceClass: 'LIVE' } }],
  }; };
  const chrome = {
    permissions: { contains: async (request: any) => request.origins?.includes('https://www.netflix.com/*') ? controls.netflixPermission === true : request.origins?.includes('https://www.primevideo.com/*') ? controls.primeVideoPermission === true : controls.youtubePermission === true, onRemoved: { addListener: (fn: any) => { permissionsRemoved = fn; } } },
    scripting: { executeScript: async (request: any) => { log.push({ type: 'inject', request }); if (!(request.files[0] === 'netflix-content.js' ? controls.netflixPermission : request.files[0] === 'prime-video-content.js' ? controls.primeVideoPermission : controls.youtubePermission)) throw Error('denied'); return [{ frameId: 0, documentId: players.get(request.target.tabId)?.documentId }]; } },
    storage: Object.fromEntries(['local', 'session'].map(area => { const data = area === 'local' ? local : session; return [area, {
      get: async (key: string | string[]) => { if (area === 'session' && controls.sessionReadFails) throw new Error('private session read'); return Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(data[k])])); }, set: async (value: object) => { if (area === 'local' ? controls.localFails : controls.sessionFails) throw new Error('private token=synthetic'); Object.assign(data, structuredClone(value)); },
    }]; })),
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, sendMessage: async () => undefined, onMessage: { addListener: (fn: any) => { listeners.push(fn); } } },
    tabs: {
      create: async (row: any) => {
        if (!controls.guideSync) throw new Error('Discovery disabled in unrelated fixture');
        const id = next++; const tab = { id, ...row, mutedInfo: { muted: false } }; tabs.set(id, tab);
        players.set(id, { muted: true, volume: 1, readyState: 0, key: `guide-${id}`, documentId: `guide-doc-${id}`, route: 'guide' });
        log.push({ type: 'discovery', id, row }); return tab;
      },
      query: async (query: any = {}) => { if (controls.queryFails) throw new Error('private query'); return [...tabs.values()].filter(tab => (query.windowId === undefined || tab.windowId === query.windowId) && (!query.url || tab.url?.startsWith(query.url.replace('*', '')))); },
      get: async (id: number) => { if (controls.tabGetFails === id) throw new Error('Transient tab lookup'); if (!tabs.has(id)) throw new Error('closed'); return tabs.get(id); },
      update: async (id: number, value: any) => { log.push({ type: 'tab', id, value }); const tab = tabs.get(id); if (controls.tabFails) throw new Error('test tab failure'); if (!tab) throw new Error('closed'); Object.assign(tab, value); if ('muted' in value) tab.mutedInfo = { muted: value.muted, reason: 'extension' }; return tab; },
      sendMessage: async (id: number, message: any, options: any) => {
        if (message.namespace === 'yttv-desktop.netflix.v1' || message.namespace === 'yttv-desktop.youtube.v1' || message.namespace === 'yttv-desktop.prime-video.v1') {
          const p = players.get(id); if (!p || options?.documentId !== p.documentId) return;
          if (message.type === 'bind') youtubeBindings.set(id, message);
          const b = youtubeBindings.get(id); if (!b || b.nonce !== message.nonce) return;
          if (message.namespace === 'yttv-desktop.prime-video.v1') {
            if (message.type === 'execute') { log.push({ type: 'prime-control-refused', id }); return { nonce: b.nonce, result: { status: 'needs-attention' } }; }
            const capabilities = Object.fromEntries(['recognizeUrl','identity','ready','play','pause','setMute','readMute','setVolume','readVolume','ended'].map(k => [k, { state: 'unknown', reason: 'Identity unverified' }]));
            return { nonce: b.nonce, result: { status: 'ok', value: { binding: { ...b.binding, playerKey: p.key }, observedAt: Date.now(), sequence: p.sequence = (p.sequence ?? 0) + 1, content: { service: 'prime-video', kind: 'detail', titleId: new URL(tabs.get(id).url).pathname.split('/')[2], url: tabs.get(id).url }, capabilities, readiness: 'needs-attention', kind: 'unknown', playing: { state: 'unknown' }, muted: { state: 'unknown' }, volume: { state: 'unknown' }, ended: 'unknown' } } };
          }
          if (message.namespace === 'yttv-desktop.netflix.v1') {
            if (message.type === 'execute') { log.push({ type: 'prime-control-refused', id }); return { nonce: b.nonce, result: { status: 'needs-attention' } }; }
            const capabilities = Object.fromEntries(['recognizeUrl','identity','ready','play','pause','setMute','readMute','setVolume','readVolume','ended'].map(k => [k, { state: 'unknown', reason: 'Identity unverified' }]));
            return { nonce: b.nonce, result: { status: 'ok', value: { binding: { ...b.binding, playerKey: p.key }, observedAt: Date.now(), sequence: p.sequence = (p.sequence ?? 0) + 1, content: { service: 'netflix', kind: new URL(tabs.get(id).url).pathname.split('/')[1], titleId: new URL(tabs.get(id).url).pathname.split('/')[2], url: tabs.get(id).url }, capabilities, readiness: 'needs-attention', kind: 'unknown', playing: { state: 'unknown' }, muted: { state: 'unknown' }, volume: { state: 'unknown' }, ended: 'unknown' } } };
          }
          if (message.type === 'execute') {
            log.push({ type: 'youtube-control', id, command: message.command });
            if (message.binding.playerKey !== p.key || p.kind === 'ad') return { nonce: b.nonce, result: { status: 'unknown' } };
            if (message.command.type === 'play') p.playing = true;
            if (message.command.type === 'pause') p.playing = false;
            if (message.command.type === 'mute') p.muted = message.command.value;
            if (message.command.type === 'volume') p.volume = message.command.value;
          }
          const capabilities = Object.fromEntries(['recognizeUrl','identity','ready','play','pause','setMute','readMute','setVolume','readVolume','ended'].map(k => [k, { state: 'supported', evidence: 'local-adapter' }]));
          const result = { nonce: b.nonce, result: { status: 'ok', value: { binding: { ...b.binding, playerKey: p.key }, observedAt: Date.now(), sequence: p.sequence = (p.sequence ?? 0) + 1,
            content: { service: 'youtube', kind: 'video', videoId: new URL(tabs.get(id).url).searchParams.get('v'), url: tabs.get(id).url }, capabilities,
            readiness: p.readyState >= 3 && p.kind !== 'ad' ? 'ready' : 'loading', kind: p.kind ?? 'vod',
            playing: { state: 'known', value: p.playing ?? false }, muted: { state: 'known', value: p.muted }, volume: { state: 'known', value: p.volume }, ended: 'not-ended' } } };
          return controls.youtubeReply ? controls.youtubeReply(id, result) : result;
        }
        if (message.type === 'GET_OBSERVATION' && options?.documentId && options.documentId !== players.get(id)?.documentId) return undefined;
        if (message.type === 'GET_OBSERVATION') return { ...observation(id), playerKey: players.get(id)?.key, connectionNonce: message.connectionNonce };
        if (message.type === 'PLAYER_PLAYBACK') { log.push({ type: 'playback', id, message, options }); return controls.playback?.(id, message, options); }
        if (message.type !== 'PLAYER_AUDIO') return undefined;
        log.push({ type: 'player', id, message, options }); if (controls.audio && message.volume !== undefined) return controls.audio(id, message); const player = players.get(id);
        if (options?.documentId && options.documentId !== player.documentId || message.playerKey && message.playerKey !== player.key) return { ok: false };
        if (message.volume !== undefined) player.volume = message.volume;
        if (message.muted !== undefined) player.muted = message.muted;
        return { ok: true, value: { volume: player.volume, muted: player.muted } };
      },
      move: async (id: number, value: any) => { log.push({ type: 'move', id, value }); Object.assign(tabs.get(id), value); return tabs.get(id); },
      remove: async (id: number) => { if (controls.removeFails) throw Error('cleanup refused'); tabs.delete(id); removed(id); },
      onRemoved: { addListener: (fn: any) => { removed = fn; } }, onUpdated: { addListener: (fn: any) => { updated = fn; } },
    },
    windows: {
      create: async (row: any) => { const id = next++; windows.set(id, { id, left: 20, top: 30, width: 780, height: 520, state: 'normal', ...row }); log.push({ type: 'create', id, row }); if (row.tabId) { tabs.get(row.tabId).windowId = id; return { ...windows.get(id), tabs: [tabs.get(row.tabId)] }; } const tab = { id, windowId: id, url: 'about:blank', mutedInfo: { muted: true } }; tabs.set(id, tab); players.set(id, { muted: true, volume: .24, readyState: 4, key: `player-${id}`, documentId: `document-${id}`, route: 'watch' }); await controls.afterCreate?.(); return { id, tabs: [tab] }; },
      get: async (id: number) => { if (!windows.has(id)) windows.set(id, { id, left: 20, top: 30, width: 1000, height: 700, state: 'normal' }); return { ...windows.get(id) }; },
      update: async (id: number, value: any) => { log.push({ type: 'bounds', id, value }); Object.assign(windows.get(id) ?? {}, value); return { ...windows.get(id), id }; }, remove: async (id: number) => { if (controls.removeFails) throw new Error('private cleanup'); tabs.delete(id); removed(id); },
    },
  };
  class FixtureDate extends Date { static now() { return Date.now() + (controls.nowOffset ?? 0); } }
  const start = () => { listeners = []; return runInNewContext(source, { Date: FixtureDate, chrome, URL, crypto: webcrypto, TextEncoder, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval }); };
  let omitDocumentId = false;
  const send = (command: any, id?: number) => new Promise<any>(resolve => listener(envelope(command), id ? { id: 'test', url: tabs.get(id)?.url, tab: tabs.get(id), documentId: omitDocumentId ? undefined : players.get(id).documentId } : { id: 'test', url: 'chrome-extension://test/panel.html' }, resolve));
  const observe = (id = 1, raw = observation(id)) => send({ type: 'OBSERVE', observation: raw, playerKey: players.get(id).key }, id);
  const replacement = (key = 'player-new', documentId = 'document-new') => Object.assign(players.get(1), { volume: 1, key, documentId });
  start(); return { revokeNetflix: () => { controls.netflixPermission = false; permissionsRemoved(); }, revokePrimeVideo: () => { controls.primeVideoPermission = false; permissionsRemoved(); }, revokeYouTube: () => { controls.youtubePermission = false; permissionsRemoved(); },
    youtubeChanged: (id: number, override: any = {}) => new Promise<any>(resolve => listener({ namespace: 'yttv-desktop.youtube.v1', type: 'changed', nonce: youtubeBindings.get(id)?.nonce }, { id: 'test', tab: tabs.get(id), url: tabs.get(id)?.url, frameId: 0, documentId: players.get(id)?.documentId, ...override }, resolve)), omitDocumentIdentity: () => { omitDocumentId = true; }, start, send, sendFrom: (command: any, sender: any) => new Promise<any>(resolve => listener(envelope(command), sender, resolve)), observe, replacement, observation, players, tabs, windows, log, local, session, controls, advance: () => { clock += 11_000; }, remove: (id = 1) => chrome.tabs.remove(id), updated: (...args: any[]) => updated(...args) };
}
