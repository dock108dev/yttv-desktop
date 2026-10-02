import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshnessOf, isPlaybackTarget, type GuideEntry, type PlaybackTarget, type SportsEvent, type SportsProvider,
} from '../packages/core/src/index.js';
import {
  defaultPreferences, sanitizePreferences, recordConfirmedSwitch, orderGuide, createPreferencesStore,
  importPreferences, exportPreferences, RECENTS_LIMIT, PREFERENCES_KEY,
} from '../packages/storage/src/index.js';
import {
  createIllustrativeFixtures, createFixtureProvider, eventVisibility, normalizeEvent, searchEvents,
  mergeEventSnapshots, SportsEngine, SportsProviderError, FIXTURE_DISCLOSURE,
} from '../packages/sports-engine/src/index.js';
import { resolveEvent } from '../packages/event-resolver/src/index.js';
import {
  createQuadState, addPane, selectPane, expandPane, restoreLayout, replacePane, replacePaneSession,
  transferAudioFocus, createAudioFocusController, updatePaneEvent, saveQuadLayout, restoreSavedQuadLayout,
  suggestLiveAlternatives, removePane, type QuadPane, type QuadState,
} from '../packages/quadbox/src/index.js';

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
    programStart: event.scheduledStart, programEnd: event.scheduledEnd ?? undefined, league: event.league,
    teamIds: [event.homeTeam.id, event.awayTeam.id], ...overrides };
}
function pane(id: string, event = fixtures()[0]!, session = `session-${id}`): QuadPane {
  const entry = guide(event, `channel-${id}`);
  return { id, eventId: event.id, resolvedChannel: entry.channel, playbackTarget: entry.target, playbackSession: session,
    lastKnownEvent: event, availability: 'READY', muted: true };
}
function twoPanes(nightMuteLock = true): QuadState {
  return addPane(addPane(createQuadState({ nightMuteLock }), pane('one')), pane('two', fixtures()[1]!));
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
test('empty feeds retain tracked games; newer corrected terminal state may return to play', () => {
  const old = { ...fixtures()[0]!, status: 'FINAL' as const };
  assert.deepEqual(mergeEventSnapshots([old], []), [old]);
  const corrected = { ...old, status: 'EXTRA_INNINGS' as const, fetchedAt: iso(1000), sourceUpdatedAt: iso(1000) };
  assert.equal(mergeEventSnapshots([old], [corrected])[0]?.status, 'EXTRA_INNINGS');
  const outOfOrder = { ...old, status: 'LIVE' as const, fetchedAt: iso(2000), sourceUpdatedAt: iso(-1000) };
  assert.equal(mergeEventSnapshots([old], [outOfOrder])[0]?.status, 'FINAL');
  assert.equal(mergeEventSnapshots([old], [{ ...corrected, source: 'different-source' }])[0]?.status, 'FINAL');
  assert.equal(mergeEventSnapshots([old], [{ ...corrected, id: 'fixture:makeup-event' }]).length, 2);
});
test('fixture provider discloses evidence, clones snapshots and validates date including calendar invalidity', async () => {
  const provider = createFixtureProvider(NOW);
  assert.equal(provider.evidenceClass, 'FIXTURE'); assert.equal(provider.disclosure, FIXTURE_DISCLOSURE);
  const events = await provider.getLiveEvents(); events[0]!.homeTeam.name = 'changed externally';
  assert.equal((await provider.getEvent('yankees-extra-innings')).homeTeam.name, 'New York Yankees');
  assert.equal((await provider.getEvents('2026-10-02')).length, 6);
  await assert.rejects(provider.getEvents('2026-02-30'), /valid UTC date/);
  await assert.rejects(provider.getEvent('does-not-exist'), /not found/);
});
test('engine retains prior observations on empty live feeds, outages and 429 without finalizing', async () => {
  const event = fixtures()[0]!; let mode: 'first' | 'empty' | 'error' | 'rate' = 'first';
  const provider: SportsProvider = {
    id: event.source, evidenceClass: 'FIXTURE', disclosure: FIXTURE_DISCLOSURE,
    async getEvents() { return []; }, async getEvent() { return event; },
    async getLiveEvents() {
      if (mode === 'error') throw new Error('Provider unavailable');
      if (mode === 'rate') throw new SportsProviderError('RATE_LIMITED', 'Rate limited');
      return mode === 'first' ? [event] : [];
    },
  };
  let clock = NOW; const engine = new SportsEngine(provider, () => clock);
  assert.equal((await engine.refresh()).events.length, 1);
  mode = 'empty'; clock += 120_000;
  assert.equal((await engine.refresh()).events[0]?.status, 'EXTRA_INNINGS');
  assert.equal(eventVisibility(engine.snapshot().events[0]!, clock).group, 'UNCERTAIN');
  mode = 'error'; assert.equal((await engine.refresh()).error, 'UNAVAILABLE');
  mode = 'rate'; assert.equal((await engine.refresh()).error, 'RATE_LIMITED');
  assert.equal(engine.snapshot().events.length, 1);
});
test('engine rejects a provider silently changing evidence class', async () => {
  const event = fixtures()[0]!;
  const provider: SportsProvider = { id: event.source, evidenceClass: 'FIXTURE', disclosure: FIXTURE_DISCLOSURE,
    async getEvents() { return [{ ...event, evidenceClass: 'LIVE' }]; }, async getEvent() { return event; }, async getLiveEvents() { return []; } };
  const result = await new SportsEngine(provider, () => NOW).refresh();
  assert.equal(result.error, 'UNAVAILABLE'); assert.equal(result.events.length, 0);
});
test('supported navigation targets accept observed vp/vpp but exclude media, secrets and hostile origins', () => {
  assert.equal(isPlaybackTarget(target('yes', { url: 'https://tv.youtube.com/watch?vp=observed-page-state&vpp=other-page-state' })), true);
  for (const url of ['https://tv.youtube.com.evil.test/watch/yes', 'https://youtube.com/watch?v=abc',
    'https://tv.youtube.com/video.m3u8', 'https://tv.youtube.com/watch?token=secret',
    'https://user:pass@tv.youtube.com/watch/yes', 'http://tv.youtube.com/watch/yes']) {
    assert.equal(isPlaybackTarget(target('yes', { url })), false, url);
  }
  assert.equal(isPlaybackTarget(target('yes', { url: `https://tv.youtube.com/watch?vp=${'a'.repeat(4097)}` })), false);
});
test('resolver confirms eligible current corroborated target despite expired guide end', () => {
  const event = fixtures()[0]!; const result = resolveEvent(event, [guide(event)], { now: NOW });
  assert.equal(result.state, 'CONFIRMED'); assert.equal(result.channel?.id, 'fixture:yes');
  assert.equal(result.confidence, 1); assert.ok(result.target);
  assert.equal(result.candidates[0]?.provenance.length, 5);
});
test('network alone is never enough and unavailable channels never gain Watch targets', () => {
  const event = fixtures()[0]!;
  const simple = guide(event, 'yes', { programTitle: 'SportsCenter', teamIds: [], league: undefined, programStart: undefined });
  assert.equal(resolveEvent(event, [simple], { now: NOW }).state, 'AMBIGUOUS');
  const unavailable = resolveEvent(event, [guide(event, 'yes', { available: false })], { now: NOW });
  assert.equal(unavailable.state, 'UNAVAILABLE'); assert.equal(unavailable.target, null);
});
test('multiple available broadcasts require a margin and preserve candidate provenance', () => {
  const event = fixtures()[0]!;
  const result = resolveEvent(event, [guide(event, 'regional'), guide(event, 'alternate')], { now: NOW });
  assert.equal(result.state, 'AMBIGUOUS'); assert.equal(result.target, null); assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every(candidate => candidate.provenance.some(evidence => evidence.kind === 'NETWORK')));
});
test('resolver does not confuse ESPN and ESPN2 or silently match a contradictory matchup', () => {
  const event = fixtures()[2]!;
  const espn = guide(event, 'espn', { channel: { id: 'espn', name: 'ESPN', networkId: 'ESPN' }, programTitle: '', teamIds: [], league: undefined, programStart: undefined });
  assert.equal(resolveEvent(event, [espn], { now: NOW }).state, 'UNAVAILABLE');
  const conflict = guide(event, 'espn2', { teamIds: ['different-home', 'different-away'], programTitle: 'Different matchup', league: 'NBA' });
  assert.equal(resolveEvent(event, [conflict], { now: NOW }).state, 'UNAVAILABLE');
  const titleConflict = guide(event, 'espn2', { teamIds: ['different-home', 'different-away'] });
  assert.equal(resolveEvent(event, [titleConflict], { now: NOW }).state, 'UNAVAILABLE');
});
test('resolver blocks stale guides, stale targets, wrong-channel handles and stale sports', () => {
  const event = fixtures()[0]!;
  assert.equal(resolveEvent(event, [guide(event, 'yes', { observedAt: iso(-120_000) })], { now: NOW }).state, 'STALE');
  assert.equal(resolveEvent(event, [guide(event, 'yes', { target: target('yes', { verifiedAt: iso(-120_000) }) })], { now: NOW }).state, 'STALE');
  assert.equal(resolveEvent(event, [guide(event, 'yes', { target: target('different-channel') })], { now: NOW }).state, 'UNAVAILABLE');
  assert.equal(resolveEvent({ ...event, sourceUpdatedAt: iso(-120_000) }, [guide(event)], { now: NOW }).state, 'STALE');
});
test('fixture games cannot establish a real live target even against an eligible real guide', () => {
  const event = fixtures()[0]!;
  const realGuide = guide(event, 'yes', { evidenceClass: 'LIVE', target: target('yes', { evidenceClass: 'LIVE' }) });
  const result = resolveEvent(event, [realGuide], { now: NOW });
  assert.equal(result.state, 'UNAVAILABLE'); assert.equal(result.target, null);
  assert.ok(result.candidates[0]?.conflicts.some(reason => reason.includes('Fixture/replay')));
});
test('local affiliates need explicit network identity or aliases; duplicates do not fabricate ambiguity', () => {
  const event = fixtures()[1]!;
  const local = guide(event, 'fox-local', { channel: { id: 'fox-local', name: 'FOX 5 New York', networkId: 'FOX' } });
  assert.equal(resolveEvent(event, [local, { ...local }], { now: NOW }).state, 'CONFIRMED');
  assert.equal(resolveEvent(event, [local, { ...local }], { now: NOW }).candidates.length, 1);
});
test('preferences validate corrupt/future data, drop secrets and cap deduplicated recents', () => {
  const raw = { schemaVersion: 1, favorites: ['a', 'a', 7], hiddenChannels: ['a'], recentChannels: Array.from({ length: 30 }, (_, i) => `ch-${i}`),
    token: 'never-save-me', password: 'never-save-me', nightMuteLock: true };
  const prefs = sanitizePreferences(raw);
  assert.deepEqual(prefs.favorites, ['a']); assert.equal(prefs.recentChannels.length, RECENTS_LIMIT);
  assert.equal(exportPreferences(prefs).includes('never-save-me'), false);
  assert.deepEqual(sanitizePreferences({ schemaVersion: 99, favorites: ['x'] }), defaultPreferences());
  assert.throws(() => importPreferences('{bad-json'), /valid JSON/);
  assert.throws(() => importPreferences('{"schemaVersion":99}'), /Unsupported/);
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
  assert.deepEqual(await store.load(), defaultPreferences());
  await assert.rejects(store.save(recordConfirmedSwitch(defaultPreferences(), 'failed')), /disk failure/);
  await Promise.all([store.save(recordConfirmedSwitch(defaultPreferences(), 'a')), store.save(recordConfirmedSwitch(defaultPreferences(), 'b'))]);
  assert.deepEqual(writes, ['a', 'b']); assert.equal((await store.load()).currentChannel, 'b');
});
test('saved layouts exclude sessions and all volatile navigation handles, and restore requires revalidation', () => {
  const state = twoPanes(); const saved = saveQuadLayout(state, 'layout-1');
  assert.equal(JSON.stringify(saved).includes('session-one'), false); assert.ok(saved.panes.every(pane => pane.target === null));
  const prefs = sanitizePreferences({ schemaVersion: 1, lastQuad: { ...saved, panes: saved.panes.map(pane => ({ ...pane, target: target(pane.channelId!), playbackSession: 'secret-session' })) } });
  assert.ok(prefs.lastQuad?.panes.every(pane => pane.target === null));
  const restored = restoreSavedQuadLayout(prefs.lastQuad);
  assert.equal(restored.panes.length, 2); assert.ok(restored.panes.every(pane => !pane.playbackSession && !pane.playbackTarget && pane.availability === 'REVALIDATION_REQUIRED'));
  assert.equal(restored.nightMuteLock, true);
});
test('keyboard custom bindings cannot trigger multiple actions from one key', () => {
  const prefs = sanitizePreferences({ keyboardMappings: { guide: 'x', sports: 'X', quadbox: '' } });
  assert.equal(prefs.keyboardMappings.guide, 'x'); assert.equal(prefs.keyboardMappings.sports, ''); assert.equal(prefs.keyboardMappings.quadbox, '');
});
test('QuadBox selection/expand/restore retain pane identities and sessions', () => {
  const state = twoPanes(); const selected = selectPane(state, 'two');
  assert.equal(selected.audioFocusId, null); assert.ok(selected.panes.every(pane => pane.muted));
  const expanded = expandPane(state, 'two'); assert.equal(expanded.layout, 'EXPANDED');
  const restored = restoreLayout(expanded); assert.equal(restored.layout, 'GRID');
  assert.deepEqual(restored.panes, state.panes); assert.equal(restored.selectedPaneId, state.selectedPaneId);
});
test('independent Replace disposes only replaced session and preserves other pane state', async () => {
  const state = twoPanes(); const other = state.panes[1]; const replacement = pane('replacement', fixtures()[2]!, 'replacement-session');
  const destroyed: string[] = [];
  const result = await replacePaneSession(state, 'one', replacement, { async destroyPlaybackSession(id) { destroyed.push(id); } });
  assert.deepEqual(destroyed, ['session-one']); assert.equal(result.panes[1], other);
  assert.equal(result.panes[0]?.id, 'one'); assert.equal(result.panes[0]?.playbackSession, 'replacement-session');
  assert.throws(() => replacePane(state, 'missing', replacement), /missing/);
  assert.throws(() => replacePane(state, 'one', { ...replacement, playbackSession: 'session-two' }), /another pane/);
});
test('pane limits and unique independent session identity are enforced without claiming stream feasibility', () => {
  const state = twoPanes();
  assert.throws(() => addPane({ ...state, maxPanes: 2 }, pane('three', fixtures()[2]!)), /Pane limit 2/);
  assert.throws(() => addPane(state, pane('one')), /unique/);
  assert.throws(() => addPane(state, pane('three', fixtures()[2]!, 'session-one')), /independent playback sessions/);
  assert.equal(removePane(expandPane(state, 'one'), 'one').layout, 'GRID');
});
test('overnight focus transfer requests only mute and never unmutes any session', async () => {
  const calls: [string, boolean][] = [];
  const result = await transferAudioFocus(twoPanes(), 'two', { async setMuted(id, muted) { calls.push([id, muted]); } });
  assert.deepEqual(calls, [['session-one', true], ['session-two', true]]);
  assert.equal(result.selectedPaneId, 'two'); assert.equal(result.audioFocusId, null);
  assert.ok(result.panes.every(pane => pane.muted && pane.audioState === 'CONFIRMED_MUTED'));
});
test('explicitly unlocked fake handoff mutes all before one unmute; mute failure blocks unmute', async () => {
  const calls: [string, boolean][] = []; const state = twoPanes(false);
  const result = await transferAudioFocus(state, 'two', { async setMuted(id, muted) { calls.push([id, muted]); } });
  assert.deepEqual(calls, [['session-one', true], ['session-two', true], ['session-two', false]]);
  assert.equal(result.audioFocusId, 'two'); assert.equal(result.panes.filter(pane => !pane.muted).length, 1);
  const failedCalls: boolean[] = [];
  const failed = await transferAudioFocus(state, 'two', { async setMuted(id, muted) { failedCalls.push(muted); if (id === 'session-one') throw new Error('mute failed'); } });
  assert.ok(failedCalls.every(Boolean)); assert.equal(failed.audioFocusId, null);
  assert.equal(failed.panes[0]?.audioState, 'UNKNOWN'); assert.match(failed.audioError!, /unknown/);
});
test('failed fake unmute retries mute and serialized rapid handoffs never overlap', async () => {
  const state = twoPanes(false); const calls: [string, boolean][] = [];
  const failed = await transferAudioFocus(state, 'two', { async setMuted(id, muted) { calls.push([id, muted]); if (!muted) throw new Error('unmute failed'); } });
  assert.equal(failed.audioFocusId, null); assert.deepEqual(calls.at(-1), ['session-two', true]);
  const audible = new Set<string>(); let maxAudible = 0;
  const controller = createAudioFocusController({ async setMuted(id, muted) {
    await Promise.resolve(); if (muted) audible.delete(id); else audible.add(id); maxAudible = Math.max(maxAudible, audible.size);
  } });
  const [, final] = await Promise.all([controller.focus(state, 'one'), controller.focus(state, 'two')]);
  assert.equal(maxAudible, 1); assert.equal(final.audioFocusId, 'two'); assert.deepEqual([...audible], ['session-two']);
});
test('fresh FINAL retains pane/session and suggestions require fresh eligible resolved live events', () => {
  const state = twoPanes(); const original = state.panes[0]!;
  const finished = { ...original.lastKnownEvent!, status: 'FINAL' as const, score: { home: 6, away: 5 }, fetchedAt: iso(1000), sourceUpdatedAt: iso(1000) };
  const updated = updatePaneEvent(state, finished, NOW + 1000);
  assert.equal(updated.panes[0]?.lastKnownEvent?.status, 'FINAL'); assert.equal(updated.panes[0]?.playbackSession, original.playbackSession);
  assert.equal(updated.panes.length, 2); assert.equal(updated.panes[1], state.panes[1]);
  const live = fixtures()[2]!; const delayed = fixtures()[3]!; const stale = { ...live, id: 'fixture:stale', fetchedAt: iso(-120_000), sourceUpdatedAt: iso(-120_000) };
  const alternatives = suggestLiveAlternatives(updated, [live, delayed, stale], [guide(live, 'espn2'), guide(delayed, 'espn')], NOW);
  assert.deepEqual(alternatives.map(event => event.id), [live.id]);
  assert.equal(suggestLiveAlternatives(updated, [live], [guide(live, 'espn2', { available: false })], NOW).length, 0);
});
