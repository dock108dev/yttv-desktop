import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { MANAGED_RECOVERY_KEY } from '../apps/chrome-extension/src/recovery';

test('actual toolbar handler distinguishes startup, storage, creation and connection failures without touching players', async () => {
  const bundle = await build({ entryPoints: ['apps/chrome-extension/src/background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
  for (const boundary of ['startup', 'storage', 'create', 'connection', 'success', 'empty-backup', 'malformed-backup', 'sync-lookup-failure']) {
    let click: (() => void) | undefined;
    const warnings: string[] = [], creates: unknown[] = [];
    const local: Record<string, unknown> = {}, session: Record<string, unknown> = { 'yttv-desktop.guide-sync.session.v1': null };
    if (boundary === 'empty-backup') local[MANAGED_RECOVERY_KEY] = { panes: [], ownedUrls: {} };
    if (boundary === 'malformed-backup') local[MANAGED_RECOVERY_KEY] = { panes: [null, {}, { tabId: '7' }], mainTabId: '7', ownedUrls: {} };
    if (boundary === 'sync-lookup-failure') local[MANAGED_RECOVERY_KEY] = { panes: [], mainTabId: 7, ownedUrls: { 7: 'https://tv.youtube.com/watch?v=fixture' } };
    const priorBackup = structuredClone(local[MANAGED_RECOVERY_KEY]);
    const priorSession = structuredClone(session);
    const event = { addListener() {} };
    const store = (data: Record<string, unknown>, area: string) => ({
      async get(keys: string | string[]) {
        if (boundary === 'startup' && keys === MANAGED_RECOVERY_KEY || boundary === 'storage' && area === 'session' && Array.isArray(keys)) throw Error('private synthetic storage failure');
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]));
      },
      async set(values: object) { Object.assign(data, structuredClone(values)); },
    });
    const untouched = () => { throw Error('Player mutation is outside remote launch'); };
    const chrome = {
      action: { onClicked: { addListener(fn: () => void) { click = fn; } } },
      runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, onMessage: event, async sendMessage() {} },
      storage: { local: store(local, 'local'), session: store(session, 'session') },
      permissions: { onRemoved: event, async contains() { return false; } },
      tabs: { onRemoved: event, onUpdated: event,
        get(id: unknown) {
          // Chrome validates arguments synchronously, before returning a Promise.
          if (!Number.isSafeInteger(id) || Number(id) <= 0) throw TypeError('Invalid tabId argument');
          if (boundary === 'sync-lookup-failure') throw Error('Synthetic synchronous lookup failure');
          return Promise.reject(Error('Closed tab'));
        },
        async query() { if (boundary === 'connection') throw Error('private query failure'); return []; }, update: untouched, remove: untouched, move: untouched, sendMessage: untouched },
      windows: { async create(options: unknown) { if (boundary === 'create') throw Error('private create failure'); creates.push(options); return { id: 42 }; }, update: untouched, remove: untouched },
    };
    runInNewContext(bundle.outputFiles[0].text, { chrome, crypto: webcrypto, URL, TextEncoder, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval,
      console: { warn: (message: string) => warnings.push(message) } });
    assert(click, 'worker registers the real toolbar listener');
    click();
    await new Promise(resolve => setImmediate(resolve));
    const expected = { startup: 'WORKER_INITIALIZATION_FAILED', storage: 'REMOTE_STORAGE_UNAVAILABLE', create: 'REMOTE_CREATE_FAILED', connection: 'REMOTE_CONNECTION_FAILED' }[boundary];
    assert.deepEqual(warnings, expected ? [`YTTV_FAILURE ${expected}`] : [], boundary);
    assert.equal(creates.length, ['startup', 'storage', 'create'].includes(boundary) ? 0 : 1, boundary);
    assert.deepEqual(local[MANAGED_RECOVERY_KEY], priorBackup, 'startup does not rewrite saved player ownership');
    assert.doesNotMatch(JSON.stringify(warnings), /private/);
    if (boundary === 'startup' || boundary === 'storage') { assert.deepEqual(local, {}); assert.deepEqual(session, priorSession); }
  }
});
