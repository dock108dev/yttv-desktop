import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isPlaybackTarget, watchNavigationUrl, type GuideEntry } from '../packages/core/src/index';
import { freshGuideObservation, freshLiveTarget, navigationUrl, TARGET_MAX_AGE_MS } from '../packages/yttv-adapter/src/index';
import { CURRENT_MANAGED_FEED_LIMIT, canAddManagedFeed } from '../packages/quadbox/src/policy';
import { createAudioState, createAudioFocusController, transferAudioFocus, type AudioState } from '../packages/quadbox/src/index';
import { sanitizePreferences } from '../packages/storage/src/index';
import * as storage from '../packages/storage/src/index';
import { validCommand } from '../apps/chrome-extension/src/adapter';

const now = Date.parse('2026-10-03T16:00:00Z');
const stamp = new Date(now).toISOString();
function row(): GuideEntry { return { channel: { id: 'yttv:cbs', name: 'CBS' }, available: true, observedAt: stamp,
  evidenceClass: 'LIVE', target: { kind: 'navigation', channelId: 'yttv:cbs', url: 'https://tv.youtube.com/watch?v=synthetic', verifiedAt: stamp, evidenceClass: 'LIVE' } }; }
function audioState(): AudioState { return { ...createAudioState(), panes: ['one', 'two'].map(id => ({ id, playbackSession: id, availability: 'READY', muted: true })) }; }

test('UI and worker use the current shared limit, separate from account allowance and saved layouts', async () => {
  assert.equal(CURRENT_MANAGED_FEED_LIMIT, 4);
  for (const n of [-1, 1.5, NaN, 4, 5]) assert.equal(canAddManagedFeed(n), false);
  assert.equal(canAddManagedFeed(0), true); assert.equal(canAddManagedFeed(1), true); assert.equal(canAddManagedFeed(2), true); assert.equal(canAddManagedFeed(3), true);
  for (const file of ['packages/ui/src/index.tsx', 'apps/chrome-extension/src/background.ts']) {
    const source = await readFile(file, 'utf8'); assert.match(source, /quadbox\/src\/policy/);
    assert.doesNotMatch(source, /panes\.length\s*[<>]=?\s*[12]/);
  }
  const worker = await readFile('apps/chrome-extension/src/background.ts', 'utf8');
  assert.match(worker, /!canAddManagedFeed\(controlledIds\(\)\.length \+ pendingFeedCreations\)/);
  assert.doesNotMatch(worker, /controlledIds\(\)\.length[^\n]*>= CURRENT_MANAGED_FEED_LIMIT/);
});

test('guide age has one boundary for display and target eligibility', async () => {
  for (const [age, expected] of [[0, true], [TARGET_MAX_AGE_MS, true], [TARGET_MAX_AGE_MS + 1, false], [-1, false]] as const) {
    const entry = { ...row(), observedAt: new Date(now - age).toISOString() };
    assert.equal(freshGuideObservation(entry, now), expected);
    assert.equal(freshLiveTarget(entry, now), expected);
  }
  for (const entry of [{ ...row(), observedAt: 'invalid' }, { ...row(), metadataSource: 'CACHED' as const },
    { ...row(), evidenceClass: 'REPLAY' as const }]) assert.equal(freshGuideObservation(entry, now), false);
  // Current metadata is useful even when no navigation target is available.
  assert(freshGuideObservation({ ...row(), available: false, target: null }, now));
  assert.equal(freshLiveTarget({ ...row(), available: false, target: null }, now), false);
  const ui = await readFile('packages/ui/src/index.tsx', 'utf8');
  assert.match(ui, /!freshGuideObservation\(item.entry, clock\)/);
  assert.doesNotMatch(ui, /30 \* 60000/);
});

test('unused preference APIs cannot reintroduce alternate writes or reset paths', () => {
  for (const symbol of ['DEFAULT_PREFERENCES', 'toggleFavorite', 'setChannelHidden', 'exportPreferences', 'importPreferences']) {
    assert.equal(symbol in storage, false, symbol);
  }
  const store = storage.createPreferencesStore({ async get() { return undefined; }, async set() {} });
  assert.equal('reset' in store, false);
  assert.equal(typeof store.load, 'function'); assert.equal(typeof store.save, 'function');
  assert.notEqual(storage.defaultPreferences(), storage.defaultPreferences());
});

test('watch-page URL policy is shared by target validation and the adapter', () => {
  assert.equal(navigationUrl, watchNavigationUrl);
  for (const url of ['https://evil.example/watch?v=x', 'https://tv.youtube.com/live', 'https://tv.youtube.com/watch',
    'https://tv.youtube.com/watch?v=x&token=secret', 'https://tv.youtube.com/watch?v=x#private',
    `https://tv.youtube.com/watch?v=${'x'.repeat(4097)}`]) {
    assert.equal(watchNavigationUrl(url), null); assert.equal(isPlaybackTarget({ ...row().target, url }), false);
    assert.equal(freshLiveTarget({ ...row(), target: { ...row().target!, url } }, now), false);
  }
  assert(watchNavigationUrl('/watch?v=synthetic&vp=guide')); assert(freshLiveTarget(row(), now));
  for (const item of [{ ...row(), observedAt: new Date(now - TARGET_MAX_AGE_MS - 1).toISOString() },
    { ...row(), observedAt: new Date(now + 1).toISOString() }, { ...row(), metadataSource: 'CACHED' as const },
    { ...row(), evidenceClass: 'REPLAY' as const }, { ...row(), target: { ...row().target!, channelId: 'other' } }]) assert.equal(freshLiveTarget(item, now), false);
});

test('retired provider commands, event-bound pane options and mute-hold setting are rejected', () => {
  for (const command of [{ type: 'REFRESH_SPORTS' }, { type: 'WATCH_EVENT', eventId: 'old' }, { type: 'ADD_EVENT', eventId: 'old' },
    { type: 'CREATE_PANE', channelId: 'yttv:cbs', eventId: 'old' }, { type: 'PREFERENCE', patch: { nightMuteLock: true } }]) assert.equal(validCommand(command), false);
  assert(validCommand({ type: 'WATCH_PROGRAM', channelId: 'yttv:cbs', title: 'NHL', observedAt: stamp }));
});

test('obsolete acquisition modules and permission-candidate launcher cannot become working paths', async () => {
  for (const file of ['apps/chrome-extension/src/sports.ts', 'packages/sports-engine/src/balldontlie.ts',
    'packages/sports-engine/src/relay.ts', 'packages/sports-engine/src/live.ts', 'scripts/sports-relay.ts', 'packages/event-resolver/src/index.ts']) await assert.rejects(access(file));
  const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
  assert.equal(scripts['sports:relay'], undefined); assert.equal(scripts['build:sports-candidate'], undefined);
  assert.throws(() => execFileSync(process.execPath, ['scripts/build.mjs', '--sports-candidate', '--check'], { stdio: 'pipe' }), /Unsupported build option/);
});

test('shared audio handoff mutes all before enabling one and serialization prevents overlap', async () => {
  const state = audioState(); const calls: [string, boolean][] = [];
  const selected = await transferAudioFocus(state, 'two', { async setMuted(id, muted) { calls.push([id, muted]); } });
  assert.deepEqual(calls, [['one', true], ['two', true], ['two', false]]); assert.equal(selected.audioFocusId, 'two');
  const audible = new Set<string>(); let peak = 0;
  const controller = createAudioFocusController({ async setMuted(id, muted) {
    await Promise.resolve(); if (muted) audible.delete(id); else audible.add(id); peak = Math.max(peak, audible.size);
  } });
  const [, last] = await Promise.all([controller.focus(state, 'one'), controller.focus(state, 'two')]);
  assert.equal(peak, 1); assert.equal(last.audioFocusId, 'two'); assert.deepEqual([...audible], ['two']);
});

test('failed mute blocks enable; failed enable compensates without claiming sound', async () => {
  const calls: boolean[] = [];
  const blocked = await transferAudioFocus(audioState(), 'two', { async setMuted(id, muted) { calls.push(muted); if (id === 'one') throw Error('synthetic'); } });
  assert(calls.every(Boolean)); assert.equal(blocked.audioFocusId, null); assert.equal(blocked.panes[0].audioState, 'UNKNOWN');
  const retries: [string, boolean][] = [];
  const failed = await transferAudioFocus(audioState(), 'two', { async setMuted(id, muted) { retries.push([id, muted]); if (!muted) throw Error('synthetic'); } });
  assert.deepEqual(retries.at(-1), ['two', true]); assert.equal(failed.audioFocusId, null);
  let targetAttempts = 0;
  const unknown = await transferAudioFocus(audioState(), 'two', { async setMuted(id) { if (id === 'two' && ++targetAttempts > 1) throw Error('synthetic'); } });
  assert.equal(unknown.audioFocusId, null); assert.equal(unknown.panes[1].audioState, 'UNKNOWN'); assert.match(unknown.audioError!, /fallback mute failed/);
});

test('saved layout compatibility retains identifiers but never navigation/session or audio authority', () => {
  const prefs = sanitizePreferences({ schemaVersion: 1, nightMuteLock: true, lastQuad: { id: 'old', name: 'Saved', selectedPaneId: 'one',
    panes: [{ id: 'one', channelId: 'yttv:cbs', eventId: 'old-provider-event', target: row().target, playbackSession: 'volatile' }] } });
  assert.equal(prefs.nightMuteLock, false); assert.equal(prefs.lastQuad?.panes[0].eventId, 'old-provider-event');
  assert.equal(prefs.lastQuad?.panes[0].target, null); assert.doesNotMatch(JSON.stringify(prefs), /volatile/);
});
