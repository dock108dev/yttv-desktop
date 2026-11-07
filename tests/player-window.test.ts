import test from 'node:test';
import assert from 'node:assert/strict';
import { readyPlayerWindow } from '../apps/chrome-extension/src/player-window';
import { isPlayerStartUrl } from '../packages/core/src/player-start';
import { emptyMixed, inspectMixed } from '../packages/storage/src/media-queue';

const url = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/player-start.html';
test('preparation waits for visible own-page identity and rejects moved, shared or repurposed tabs', async () => {
  const window = { id: 10, tabs: [{ id: 20, windowId: 10 }] } as chrome.windows.Window;
  let reads = 0;
  const api = { runtime: { getURL: () => url }, tabs: {
    get: async () => ++reads === 1 ? { id: 20, windowId: 10 } : { id: 20, windowId: 10, url },
    query: async () => [{ id: 20, windowId: 10, url }],
  } } as unknown as typeof chrome;
  assert.equal((await readyPlayerWindow(api, window)).url, url);
  assert.equal(reads, 2, 'missing metadata requires a fresh read, not assumed identity');
  for (const patch of [{ windowId: 11 }, { url: 'https://example.test' }, { pendingUrl: 'https://example.test' }, { url: url.replace(/a{32}/, 'b'.repeat(32)) }]) {
    api.tabs.get = async () => ({ id: 20, windowId: 10, url, ...patch }) as chrome.tabs.Tab;
    await assert.rejects(readyPlayerWindow(api, window), /PLAYER_WINDOW_CHANGED/);
  }
  api.tabs.get = async () => ({ id: 20, windowId: 10, url }) as chrome.tabs.Tab;
  api.tabs.query = async () => [{ id: 20 }, { id: 21 }] as chrome.tabs.Tab[];
  await assert.rejects(readyPlayerWindow(api, window), /PLAYER_WINDOW_CHANGED/);
});

test('storage accepts only the exact inert preparation path for created ownership and preserves older blank records', () => {
  const r = emptyMixed(() => crypto.randomUUID());
  const owner = { slotId: r.slots[0].id, service: 'yttv' as const, tabId: 1, windowId: 1, ordinaryUrl: url, createdHere: true };
  r.ownership.push(owner);
  assert(inspectMixed(r).writable);
  for (const bad of [url + '?x=1', url + '#x', url.replace('player-start.html', 'remote.html'), url.replace('chrome-extension:', 'https:')]) {
    assert.equal(isPlayerStartUrl(bad), false);
    assert.equal(inspectMixed({ ...r, ownership: [{ ...owner, ordinaryUrl: bad }] }).writable, false);
  }
  assert.equal(inspectMixed({ ...r, ownership: [{ ...owner, createdHere: false }] }).writable, false);
  assert(inspectMixed({ ...r, ownership: [{ ...owner, ordinaryUrl: 'about:blank' }] }).writable);
});
