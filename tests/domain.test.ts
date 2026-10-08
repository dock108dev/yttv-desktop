import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshnessOf, isPlaybackTarget, type GuideEntry, type PlaybackTarget, type SportsEvent,
} from '../packages/core/src/index.js';
import {
  defaultPreferences, sanitizePreferences, recordConfirmedSwitch, orderGuide, createPreferencesStore,
  RECENTS_LIMIT, PREFERENCES_KEY,
} from '../packages/storage/src/index.js';
import {
  createIllustrativeFixtures, eventVisibility, normalizeEvent, searchEvents,
} from '../packages/sports-engine/src/index.js';


const NOW = Date.parse('2026-10-02T12:00:00Z');
const iso = (offset = 0) => new Date(NOW + offset).toISOString();
const fixtures = () => createIllustrativeFixtures(NOW);
function target(channelId: string, overrides: Partial<PlaybackTarget> = {}): PlaybackTarget {
  return { kind: 'navigation', channelId, url: `https://tv.youtube.com/watch/fixture-${encodeURIComponent(channelId)}`,
    verifiedAt: iso(), evidenceClass: 'FIXTURE', ...overrides };
}
function guide(event: SportsEvent, id = 'fixture:yes', overrides: Partial<GuideEntry> = {}): GuideEntry {
  const network = event.broadcastNetworks[0]!;
  return { channel: { id, name: network.name, networkId: network.networkId }, available: true, target: target(id),
    observedAt: iso(), evidenceClass: 'FIXTURE', programTitle: `${event.awayTeam.name} at ${event.homeTeam.name}`,
    programStart: event.scheduledStart ?? undefined, programEnd: event.scheduledEnd ?? undefined, league: event.league,
    teamIds: [event.homeTeam.id, event.awayTeam.id], ...overrides };
}
test('scheduled-end override follows fresh actual sports states, including one-hour overrun', () => {
  const event = fixtures()[0]!;
  assert.equal(Date.parse(event.scheduledEnd!), NOW - 60 * 60_000);
  assert.equal(eventVisibility(event, NOW).group, 'LIVE');
  for (const status of ['LIVE', 'HALFTIME', 'OVERTIME', 'EXTRA_INNINGS'] as const) {
    assert.equal(eventVisibility({ ...event, status, statusDetail: null }, NOW).group, 'LIVE');
  }
  assert.equal(eventVisibility({ ...event, status: 'HALFTIME', statusDetail: null }, NOW).activePlay, false);
});
test('delay, suspension and past start remain truthful without active-play assumptions', () => {
  const event = fixtures()[0]!;
  for (const status of ['DELAYED', 'SUSPENDED'] as const) {
    const visibility = eventVisibility({ ...event, status, statusDetail: null }, NOW);
    assert.equal(visibility.group, 'HELD'); assert.equal(visibility.activePlay, false);
  }
  assert.equal(eventVisibility({ ...event, status: 'SCHEDULED', statusDetail: null }, NOW).group, 'UPCOMING');
  assert.equal(eventVisibility(fixtures()[2]!, NOW).group, 'LIVE');
});
test('stale/unknown states are bounded uncertainty, never inferred FINAL or perpetual live', () => {
  const event = fixtures()[0]!;
  assert.equal(eventVisibility(event, NOW + 90_001).group, 'UNCERTAIN');
  const old = eventVisibility(event, NOW + 2 * 60 * 60_000 + 1);
  assert.equal(old.group, 'HISTORY'); assert.equal(old.label, 'Status unavailable');
  assert.equal(event.status, 'EXTRA_INNINGS');
  assert.equal(eventVisibility({ ...event, status: 'FINAL', fetchedAt: iso(-120_000), sourceUpdatedAt: iso(-120_000) }, NOW).isFresh, false);
  assert.equal(eventVisibility({ ...event, status: 'FINAL' }, NOW).group, 'HISTORY');
});
test('request freshness does not refresh old source data and future timestamps are unknown', () => {
  const event = fixtures()[0]!;
  assert.equal(freshnessOf({ ...event, sourceUpdatedAt: iso(-120_000) }, NOW), 'STALE');
  assert.equal(freshnessOf({ ...event, fetchedAt: iso(31_000) }, NOW), 'UNKNOWN');
  assert.equal(freshnessOf({ ...event, sourceUpdatedAt: iso(31_000) }, NOW), 'UNKNOWN');
  assert.equal(freshnessOf({ ...event, fetchedAt: 'not-a-date' }, NOW), 'UNKNOWN');
  assert.equal(freshnessOf({ ...event, freshness: 'UNKNOWN' }, NOW), 'UNKNOWN');
  const impossibleFuture = { ...event, sourceUpdatedAt: '2099-01-01T00:00:00Z' };
  assert.equal(eventVisibility(impossibleFuture, NOW + 2 * 60 * 60_000 + 1).group, 'HISTORY');
});
test('normalization preserves missing values and rejects fabricated scores/playback entitlement', () => {
  const event = fixtures()[0]!;
  const result = normalizeEvent({ ...event, status: 'not-a-status' as SportsEvent['status'],
    score: { home: Number.NaN, away: -1 }, clock: '', yttvTarget: target('yes') }, { now: NOW });
  assert.equal(result.status, 'UNKNOWN'); assert.deepEqual(result.score, { home: null, away: null });
  assert.equal(result.clock, null); assert.equal(result.yttvTarget, null);
  assert.equal(normalizeEvent({ ...event, score: null }, { now: NOW }).score, null);
  assert.throws(() => normalizeEvent({ ...event, scheduledStart: 'bad-date' }), /scheduled start/);
});
test('team and league search works independently of guide and respects normalized aliases', () => {
  const events = fixtures();
  assert.equal(searchEvents(events, 'Yánkees', { now: NOW })[0]?.id, events[0]?.id);
  assert.equal(searchEvents(events, 'NYY', { now: NOW })[0]?.id, events[0]?.id);
  assert.equal(searchEvents(events, 'Rutgers', { now: NOW })[0]?.id, events[1]?.id);
  assert.equal(searchEvents(events, 'college football', { now: NOW }).length, 2);
  assert.equal(searchEvents(events, 'NHL', { now: NOW })[0]?.id, events[3]?.id);
  assert.equal(searchEvents(events, 'Knicks', { now: NOW })[0]?.id, events[4]?.id);
  assert.equal(searchEvents(events, 'unfindable team', { now: NOW }).length, 0);
});
test('supported navigation targets accept observed vp/vpp but exclude media, secrets and hostile origins', () => {
  assert.equal(isPlaybackTarget(target('yes', { url: 'https://tv.youtube.com/watch?v=synthetic&vp=observed-page-state&vpp=other-page-state' })), true);
  for (const url of ['https://tv.youtube.com.evil.test/watch/yes', 'https://youtube.com/watch?v=abc',
    'https://tv.youtube.com/video.m3u8', 'https://tv.youtube.com/watch?token=secret',
    'https://user:pass@tv.youtube.com/watch/yes', 'http://tv.youtube.com/watch/yes']) {
    assert.equal(isPlaybackTarget(target('yes', { url })), false, url);
  }
  assert.equal(isPlaybackTarget(target('yes', { url: `https://tv.youtube.com/watch?vp=${'a'.repeat(4097)}` })), false);
});
test('preferences validate corrupt/future data, drop secrets and cap deduplicated recents', () => {
  const raw = { schemaVersion: 1, favorites: ['a', 'a', 7], hiddenChannels: ['a'], recentChannels: Array.from({ length: 30 }, (_, i) => `ch-${i}`),
    token: 'never-save-me', password: 'never-save-me', nightMuteLock: true };
  const prefs = sanitizePreferences(raw);
  assert.deepEqual(prefs.favorites, ['a']); assert.equal(prefs.recentChannels.length, RECENTS_LIMIT);
  assert.equal(JSON.stringify(prefs).includes('never-save-me'), false);
  assert.deepEqual(sanitizePreferences({ schemaVersion: 99, favorites: ['x'] }), defaultPreferences());
});
test('Previous and recents change only on confirmed switch and repeated observations are ignored', () => {
  const initial = defaultPreferences();
  assert.equal(recordConfirmedSwitch(initial, 'a', false), initial);
  const a = recordConfirmedSwitch(initial, 'a'); const b = recordConfirmedSwitch(a, 'b');
  assert.equal(a.previousChannel, null); assert.equal(b.previousChannel, 'a');
  assert.deepEqual(b.recentChannels, ['b', 'a']); assert.equal(recordConfirmedSwitch(b, 'b'), b);
  const back = recordConfirmedSwitch(b, b.previousChannel!);
  assert.equal(back.previousChannel, 'b'); assert.deepEqual(back.recentChannels, ['a', 'b']);
});
test('guide respects hidden channels before favorites, stable custom ordering and token search', () => {
  const event = fixtures()[0]!;
  const entries = ['a', 'b', 'c', 'd'].map(id => guide(event, id, { channel: { id, name: `Channel ${id}` } }));
  const prefs = { ...defaultPreferences(), favorites: ['b', 'd'], hiddenChannels: ['b'], channelOrder: ['c', 'd', 'a', 'b'] };
  assert.deepEqual(orderGuide(entries, prefs).map(entry => entry.channel.id), ['d', 'c', 'a']);
  assert.deepEqual(orderGuide(entries, prefs, { query: 'channel c' }).map(entry => entry.channel.id), ['c']);
  assert.equal(orderGuide(entries, prefs, { includeHidden: true }).length, 4);
});
test('persistence serializes concurrent saves and recovers from corrupt JSON/rejected writes', async () => {
  let stored: unknown = '{bad'; const writes: string[] = []; let failOnce = true;
  const store = createPreferencesStore({ async get(key) { assert.equal(key, PREFERENCES_KEY); return stored; },
    async set(_key, value) {
      if (failOnce) { failOnce = false; throw new Error('disk failure'); }
      stored = value; writes.push((value as ReturnType<typeof defaultPreferences>).currentChannel ?? 'none');
    } });
  await assert.rejects(store.load(), /Stored preferences are unreadable/);
  await assert.rejects(store.save(recordConfirmedSwitch(defaultPreferences(), 'failed')), /disk failure/);
  await Promise.all([store.save(recordConfirmedSwitch(defaultPreferences(), 'a')), store.save(recordConfirmedSwitch(defaultPreferences(), 'b'))]);
  assert.deepEqual(writes, ['a', 'b']); assert.equal((await store.load()).currentChannel, 'b');
});
test('keyboard custom bindings cannot trigger multiple actions from one key', () => {
  const prefs = sanitizePreferences({ keyboardMappings: { guide: 'x', sports: 'X', quadbox: '' } });
  assert.equal(prefs.keyboardMappings.guide, 'x'); assert.equal(prefs.keyboardMappings.sports, ''); assert.equal(prefs.keyboardMappings.quadbox, '');
});
test('keyboard import disables invalid/duplicate mappings deterministically and preserves old schema defaults', () => {
  const prefs = sanitizePreferences({ keyboardMappings: { guide: ' X ', sports: 'x', mute: 'Ctrl+m', pane1: 'Tab', pane2: ' ', up: 'arrowup' } });
  assert.equal(prefs.keyboardMappings.guide, 'x'); assert.equal(prefs.keyboardMappings.sports, '');
  assert.equal(prefs.keyboardMappings.mute, ''); assert.equal(prefs.keyboardMappings.pane1, ''); assert.equal(prefs.keyboardMappings.pane2, '');
  assert.equal(prefs.keyboardMappings.up, 'ArrowUp'); assert.equal(prefs.keyboardMappings.watch, 'w');
});
