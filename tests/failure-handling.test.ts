import test from 'node:test';
import assert from 'node:assert/strict';
import { createFailureDiagnostics } from '../apps/chrome-extension/src/diagnostics';
import { createExtensionLifecycle } from '../apps/chrome-extension/src/runtime';
import { createPreferencesStore } from '../packages/storage/src/index';

test('bounded diagnostics count every failure, emit sparse static records and return isolated copies', () => {
  const original = console.warn; const logs: unknown[] = [];
  console.warn = (...args) => { logs.push(args); };
  try {
    const diagnostics = createFailureDiagnostics(() => '2026-10-03T12:00:00.000Z');
    for (let i = 0; i < 17; i++) diagnostics.record('COMMAND_FAILED');
    assert.equal(logs.length, 5); assert.equal(diagnostics.snapshot()[0].count, 17);
    diagnostics.snapshot()[0].count = 999; assert.equal(diagnostics.snapshot()[0].count, 17);
  } finally { console.warn = original; }
});

test('ordinary lifecycle failures are observable; one failed cleanup never skips the remaining cleanup', async () => {
  const lifecycle = createExtensionLifecycle(); let cleaned = false;
  lifecycle.addCleanup(() => { throw new Error('private token=fixture'); });
  lifecycle.addCleanup(() => { cleaned = true; });
  await lifecycle.guard(() => { throw new Error('private URL fixture'); });
  assert.equal(lifecycle.active, true); lifecycle.dispose();
  assert.equal(cleaned, true);
  assert.deepEqual(lifecycle.diagnostics().map(row => row.code), ['BRIDGE_FAILED', 'CLEANUP_FAILED']);
  assert.doesNotMatch(JSON.stringify(lifecycle.diagnostics()), /token|private|fixture|URL/);
});

test('invalid serialized preferences reject safely instead of silently returning defaults', async () => {
  const store = createPreferencesStore({ get: async () => '{private broken JSON', set: async () => {} });
  await assert.rejects(store.load(), { message: 'Stored preferences are unreadable; existing values preserved.' });
});
