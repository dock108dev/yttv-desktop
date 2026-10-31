import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { validCommand } from '../apps/chrome-extension/src/adapter';
import { cleanObservation } from '../apps/chrome-extension/src/observations';

test('preference IPC rejects malformed nested edits while allowing partial choices and explicit clears', () => {
  for (const patch of [{ ui: null }, { ui: [] }, { ui: { theme: {} } }, { ui: { denseGuide: 'false' } },
    { ui: { privatePayload: 'synthetic' } }, { keyboardMappings: 'reset' }, { keyboardMappings: { mute: 7 } },
    { keyboardMappings: { unknownAction: 'x' } }, { keyboardMappings: { mute: 'Ctrl+M' } },
    { quadLayouts: [null] }, { lastQuad: {} }]) {
    assert.equal(validCommand({ type: 'PREFERENCE', patch }), false, JSON.stringify(patch));
  }
  for (const patch of [{ ui: { theme: 'light' } }, { keyboardMappings: { mute: '' } },
    { favorites: [], quadLayouts: [], lastQuad: null }]) assert.equal(validCommand({ type: 'PREFERENCE', patch }), true);
});

test('untrusted playback measurements cannot manufacture ready state or propagate nonfinite geometry', () => {
  const raw: any = { guide: [], observedAt: new Date().toISOString(), route: 'watch', playback: {} };
  for (const value of [-1, 5, 999, 2.5, Infinity, NaN, '4', null]) {
    raw.playback = { readyState: value, currentTime: -1, width: Infinity, height: NaN };
    const clean = cleanObservation(raw)!;
    assert.equal(clean.playback.readyState, null);
    assert.equal(clean.playback.currentTime, null);
    assert.equal(clean.playback.width, null);
    assert.equal(clean.playback.height, null);
  }
  for (const readyState of [0, 1, 2, 3, 4]) {
    raw.playback = { readyState, currentTime: 0, width: 1920, height: 1080, muted: false, volume: .37 };
    const clean = cleanObservation(raw)!;
    assert.deepEqual(clean.playback, { ...raw.playback, playing: null });
  }
});

test('IPC rejects malformed, oversized and mass-assignment commands before privileged handlers', () => {
  for (const value of [null, [], { type: 'UNKNOWN' }, { type: 'NAVIGATE', channelId: 7 },
    { type: 'SELECT_PANE', paneId: '' }, { type: 'CHOOSE_MAIN', tabId: 0 }, { type: 'CHOOSE_MAIN', tabId: '30' }, { type: 'AUDIO', volume: NaN }, { type: 'PLAYER_AUDIO', muted: 'false' },
    { type: 'PREFERENCE', patch: { schemaVersion: 99 } }, { type: 'PREFERENCE', patch: { currentChannel: 'unconfirmed' } },
    { type: 'PREFERENCE', patch: { favorites: Array(1001).fill('x') } },
    { type: 'OBSERVE', observation: { guide: Array(501).fill({}), observedAt: new Date().toISOString(), playback: {} } },
    { type: 'GET_SNAPSHOT', payload: 'x'.repeat(512_001) }]) assert.equal(validCommand(value), false);
  const circular: any = { type: 'PREFERENCE' }; circular.patch = circular; assert.equal(validCommand(circular), false);
  for (const value of [{ type: 'GET_SNAPSHOT' }, { type: 'NAVIGATE', channelId: 'yttv:cbs' },
    { type: 'PLAYER_AUDIO', volume: .4, playerKey: 'fixture' }, { type: 'AUDIO', muted: true },
    { type: 'PREFERENCE', patch: { favorites: ['yttv:cbs'], ui: { theme: 'dark' } } }]) assert.equal(validCommand(value), true);
});

test('fixture preview blocks rebinding/cross-site access, extra files, symlink escape and malformed paths', async () => {
  const { createFixturePreviewServer } = await import(new URL('../scripts/preview-server.mjs', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'yttv-security-')); const outside = await mkdtemp(join(tmpdir(), 'yttv-outside-'));
  await writeFile(join(root, 'demo.html'), '<!doctype html><p>Synthetic</p>');
  await writeFile(join(root, 'build-identity.json'), 'synthetic-private');
  await writeFile(join(outside, 'panel.js'), 'synthetic-outside'); await symlink(join(outside, 'panel.js'), join(root, 'panel.js'));
  const server = createFixturePreviewServer(root); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const send = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Promise<any>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: { Host: '127.0.0.1:4173', ...headers } }, res => {
      let body = ''; res.on('data', bytes => body += bytes); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
  try {
    const allowed = await send('/'); assert.equal(allowed.status, 200); assert.match(allowed.body, /Synthetic/);
    assert.equal(allowed.headers['x-content-type-options'], 'nosniff'); assert.equal(allowed.headers['x-frame-options'], 'DENY');
    assert.match(allowed.headers['content-security-policy'], /connect-src 'none'/);
    assert.equal((await send('/demo.html', {}, 'HEAD')).body, '');
    for (const result of [await send('/', { Host: 'evil.example' }), await send('/', { Origin: 'https://evil.example' }),
      await send('/', { 'Sec-Fetch-Site': 'cross-site' }), await send('/build-identity.json'), await send('/panel.js'),
      await send('/../private'), await send('/%zz'), await send('/%2e%2e%2fprivate'), await send('/', {}, 'POST')]) {
      assert(result.status >= 400); assert.doesNotMatch(result.body, /synthetic-private|synthetic-outside/);
    }
    assert.equal((await send('/')).status, 200, 'malformed input does not break subsequent requests');
  } finally { server.close(); await once(server, 'close'); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
