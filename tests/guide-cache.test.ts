import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideMetadataStore, readGuideCache, GUIDE_CACHE_MAX_ROWS, PROGRAM_METADATA_MAX_AGE_MS } from '../packages/storage/src/guide-cache';
import type { GuideEntry } from '../packages/core/src/index';

const now = Date.parse('2026-10-02T16:00:00Z');
const row = (id = 'yttv:synthetic-a', age = 1000): GuideEntry => ({ channel: { id, name: 'Synthetic channel' },
  programTitle: 'Synthetic program', nextProgramTitle: 'Synthetic next', evidenceClass: 'LIVE', observedAt: new Date(now - age).toISOString(),
  available: true, target: { kind: 'navigation', channelId: id, url: 'https://tv.youtube.com/watch?v=synthetic-test-only', verifiedAt: new Date(now - age).toISOString(), evidenceClass: 'LIVE' } });
const raw = (rows = [row()]): unknown => ({ schemaVersion: 1, observedAt: new Date(now).toISOString(), rows });

test('metadata whitelist drops URLs, targets, credentials and session authority without renewing age', () => {
  const cache = readGuideCache({ ...(raw() as object), token: 'private', tabId: 123, rows: [{ ...row(), sessionId: 'private', password: 'private' }] }, now)!;
  assert.equal(cache.rows[0].observedAt, row().observedAt);
  assert.equal(cache.rows[0].metadataSource, 'CACHED'); assert.equal(cache.rows[0].target, null); assert.equal(cache.rows[0].available, false);
  assert.doesNotMatch(JSON.stringify(cache), /https:|synthetic-test-only|private|tabId|sessionId|password|verifiedAt/);
  const reread = readGuideCache(cache, now + 10_000)!;
  assert.equal(reread.observedAt, cache.observedAt); assert.equal(reread.rows[0].observedAt, cache.rows[0].observedAt);
});

test('stale program metadata expires while unavailable identity and observed order remain', () => {
  const rows = [row('yttv:synthetic-a', PROGRAM_METADATA_MAX_AGE_MS + 1), { ...row('yttv:synthetic-b'), available: false, target: null }];
  const cache = readGuideCache(raw(rows), now)!;
  assert.deepEqual(cache.rows.map(r => r.channel.id), rows.map(r => r.channel.id));
  assert.equal(cache.rows[0].programTitle, undefined); assert.equal(cache.rows[0].nextProgramTitle, undefined);
  assert.equal(cache.rows[0].observedAt, rows[0].observedAt); assert.equal(cache.rows[1].programTitle, 'Synthetic program');
});

test('missing malformed future unsupported duplicate and oversized cache states fail closed', () => {
  for (const value of [undefined, null, 'bad-json', [], {}, { ...(raw() as object), schemaVersion: 2 },
    { ...(raw() as object), observedAt: new Date(now + 1).toISOString() }, raw([{ ...row(), observedAt: new Date(now + 1).toISOString() }]),
    raw([{ ...row(), observedAt: 'bad-date' }]), raw([row(), row()]), raw(Array.from({ length: GUIDE_CACHE_MAX_ROWS + 1 }, (_, i) => row(`yttv:synthetic-${i}`))),
    { ...(raw() as object), extra: 'x'.repeat(512_001) }, raw([{ ...row(), channel: { id: 'https://example.test/token=secret', name: 'bad' } }])]) {
    assert.equal(readGuideCache(value, now), null);
  }
});

test('failed storage read or write keeps metadata recovery optional and permits later fresh retention', async () => {
  let reject = true; let stored: unknown;
  const store = createGuideMetadataStore({ get: async () => { throw new Error('synthetic read failure'); }, set: async (_key, value) => { if (reject) throw new Error('synthetic write failure'); stored = value; } }, () => now);
  assert.equal(await store.load(), null);
  await store.retain([row()]); assert.equal(store.rows.length, 1);
  reject = false; await store.retain([row('yttv:synthetic-a', 0)]);
  assert.equal(readGuideCache(stored, now)!.rows[0].observedAt, row('yttv:synthetic-a', 0).observedAt);
});

test('serialized asynchronous writes cannot overwrite a newer guide and older observations are ignored', async () => {
  let stored: unknown; let release!: () => void; let calls = 0;
  const store = createGuideMetadataStore({ get: async () => undefined, set: async (_key, value) => { calls++; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); stored = value; } }, () => now);
  await store.load();
  const older = store.retain([row()]); await Promise.resolve(); await Promise.resolve();
  const newer = store.retain([{ ...row('yttv:synthetic-a', 0), programTitle: 'New synthetic program' }, row('yttv:synthetic-b')]);
  assert.equal(calls, 1); release(); await Promise.all([older, newer]);
  await store.retain([row('yttv:synthetic-a', 5000)]);
  assert.equal(readGuideCache(stored, now)!.rows[0].programTitle, 'New synthetic program'); assert.equal(calls, 2);
  assert.deepEqual(store.rows.map(r => r.channel.id), ['yttv:synthetic-a', 'yttv:synthetic-b']);
});

test('cache reads cached Watch observations and fixture observations never write or renew metadata', async () => {
  let writes = 0;
  const store = createGuideMetadataStore({ get: async () => raw(), set: async () => { writes++; } }, () => now);
  const loaded = await store.load(); await store.retain(store.rows); await store.retain([{ ...row(), evidenceClass: 'FIXTURE' }]);
  assert.equal(writes, 0); assert.equal(store.rows[0].observedAt, loaded!.rows[0].observedAt);
});


test('optional cache failure is counted and identical fresh input retries without renewing evidence', async () => {
  let fail = true; let stored: unknown;
  const store = createGuideMetadataStore({ get: async () => undefined, set: async (_key, value) => {
    if (fail) throw new Error('private storage error'); stored = value;
  } }, () => now);
  await store.retain([row()]); assert.equal(store.diagnostics.writes, 1);
  assert.equal(store.diagnostics.persistence, 'unavailable');
  fail = false; await store.retain([row()]);
  assert.equal(store.diagnostics.persistence, 'available');
  assert.equal(readGuideCache(stored, now)!.observedAt, row().observedAt);
});
