import test from 'node:test';
import assert from 'node:assert/strict';
import { createNBAProvider, normalizeNBAGame } from '../packages/sports-engine/src/balldontlie';
import { SportsEngine, eventVisibility, searchEvents } from '../packages/sports-engine/src/index';
import { SportsPoller } from '../packages/sports-engine/src/live';
import { resolveEvent } from '../packages/event-resolver/src/index';
import { createSportsClient } from '../apps/chrome-extension/src/sports';
import type { GuideEntry } from '../packages/core/src/index';

// Synthetic official-shaped inputs. These tests do not establish real acquisition or playback.
const NOW = Date.parse('2026-10-03T00:00:00Z');
export const nbaRow = { id: 9001, datetime: '2026-10-02T23:00:00Z', date: '2026-10-02', status_state: 'in_progress', status: '4th Qtr',
  period: 4, time: '3:44', home_team_score: 90, visitor_team_score: 88,
  home_team: { id: 20, full_name: 'New York Knicks', name: 'Knicks', abbreviation: 'NYK' },
  visitor_team: { id: 2, full_name: 'Boston Celtics', name: 'Celtics', abbreviation: 'BOS' } };
const event = () => normalizeNBAGame(nbaRow, new Date(NOW).toISOString());
const reply = (data: unknown) => new Response(JSON.stringify({ data, meta: { next_cursor: null } }));
const guide = (): GuideEntry => ({ channel: { id: 'yttv:test', name: 'Test Sports' }, programTitle: 'NBA: Boston Celtics at New York Knicks', league: 'NBA',
  available: true, evidenceClass: 'LIVE', observedAt: new Date(NOW).toISOString(), target: { kind: 'navigation', channelId: 'yttv:test',
    url: 'https://tv.youtube.com/watch?v=synthetic-test-only', verifiedAt: new Date(NOW).toISOString(), evidenceClass: 'LIVE' } });

test('NBA lifecycle is explicit; no missing schedule/score/network/update time is fabricated', () => {
  const expected = { scheduled: 'SCHEDULED', in_progress: 'LIVE', final: 'FINAL', postponed: 'POSTPONED', canceled: 'CANCELLED', delayed: 'DELAYED', suspended: 'SUSPENDED', abandoned: 'UNKNOWN', unknown: 'UNKNOWN', new_state: 'UNKNOWN' };
  for (const [state, status] of Object.entries(expected)) assert.equal(normalizeNBAGame({ ...nbaRow, status_state: state }, new Date(NOW).toISOString()).status, status);
  assert.equal(normalizeNBAGame({ ...nbaRow, period: 5 }, new Date(NOW).toISOString()).status, 'OVERTIME');
  assert.equal(normalizeNBAGame({ ...nbaRow, status: 'Halftime' }, new Date(NOW).toISOString()).status, 'HALFTIME');
  const absent = normalizeNBAGame({ ...nbaRow, datetime: null, home_team_score: null, time: null }, new Date(NOW).toISOString());
  assert.equal(absent.scheduledStart, null); assert.equal(absent.scheduledEnd, null); assert.equal(absent.score?.home, null);
  assert.equal(absent.sourceUpdatedAt, null); assert.equal(absent.clock, null); assert.deepEqual(absent.broadcastNetworks, []);
  assert.equal(normalizeNBAGame({ ...nbaRow, status_state: 'scheduled', home_team_score: 0 }, new Date(NOW).toISOString()).score, null);
  assert.equal(searchEvents([event()], 'Knicks', { now: NOW })[0].id, event().id);
  assert.equal(eventVisibility({ ...event(), scheduledEnd: new Date(NOW - 3_600_000).toISOString() }, NOW).group, 'LIVE');
  assert.equal(eventVisibility({ ...event(), status: 'SUSPENDED' }, NOW).activePlay, false);
});

test('NBA schedule includes explicit preseason, follows cursors, preserves detail identity and caps all attempts', async () => {
  const calls: URL[] = []; let now = NOW;
  const provider = createNBAProvider({ clock: () => now, request: async url => { calls.push(new URL(url)); return calls.length === 1 ? new Response(JSON.stringify({ data: [nbaRow], meta: { next_cursor: 7 } })) : url.includes('/games/') ? reply(nbaRow) : reply([]); } });
  const events = await provider.getEvents('2026-10-03');
  assert.equal(events.length, 1); assert.equal(calls.length, 3); assert.equal(calls[1].searchParams.get('cursor'), '7');
  assert.equal(calls[2].searchParams.get('season_type'), 'preseason'); assert.equal(calls[0].searchParams.get('start_date'), '2026-10-02');
  await provider.getLiveEvents(); assert.equal(calls.length, 3, 'live method reuses the same batch');
  await provider.getEvent(events[0].id); assert.equal(calls.length, 4);
  await assert.rejects(provider.getEvent(events[0].id), error => (error as any).code === 'RATE_LIMITED');
  assert.equal(calls.length, 4); now += 60_001; await provider.getEvent(events[0].id);
  await assert.rejects(provider.getEvents('2026-02-30'));
});

test('429 Retry-After and denied authorization stop acquisition; raw error bodies never escape', async () => {
  let calls = 0; let now = NOW;
  const provider = createNBAProvider({ clock: () => now, request: async () => { calls++; return new Response('secret-provider-body', { status: 429, headers: { 'Retry-After': '600' } }); } });
  await assert.rejects(provider.getEvent('9001'), error => !String(error).includes('secret-provider-body'));
  now += 120_001; await assert.rejects(provider.getEvent('9001')); assert.equal(calls, 1);
  const denied = createNBAProvider({ clock: () => now, request: async () => { calls++; return new Response('secret', { status: 401 }); } });
  await assert.rejects(denied.getEvent('9001')); await assert.rejects(denied.getEvent('9001')); assert.equal(calls, 2);
});

test('poller coalesces demands, retains missing IDs, crosses dates, backs off and never infers final', async () => {
  let now = NOW; let phase = 0; let scheduleCalls = 0; let detailCalls = 0;
  const provider = { id: 'balldontlie-nba', evidenceClass: 'LIVE' as const, disclosure: 'Synthetic test',
    async getEvents() { scheduleCalls++; if (phase === 2) throw new Error('outage'); return phase === 0 ? [event()] : []; },
    async getLiveEvents() { return []; }, async getEvent() { detailCalls++; return { ...event(), fetchedAt: new Date(now).toISOString(), status: 'SUSPENDED' as const }; } };
  const poller = new SportsPoller(new SportsEngine(provider, () => now), () => now);
  await Promise.all([poller.refresh(), poller.refresh()]); assert.equal(scheduleCalls, 1);
  phase = 1; now += 60_001; const retained = await poller.refresh(); assert.equal(detailCalls, 1); assert.equal(retained.events[0].status, 'SUSPENDED');
  phase = 2; now += 60_001; const failed = await poller.refresh(); assert.equal(failed.state, 'UNAVAILABLE'); assert.equal(failed.events[0].status, 'SUSPENDED'); assert.equal(failed.events[0].freshness, 'STALE');
  now += 60_001; await poller.refresh(); assert.equal(scheduleCalls, 3, 'backoff blocks repeat acquisition');
});

test('network-free mapping needs active provider matchup, native league, both teams, fresh eligible unique target', () => {
  const e = event(); const g = guide(); const resolve = (rows: GuideEntry[], value = e) => resolveEvent(value, rows, { now: NOW });
  assert.equal(resolve([g]).state, 'CONFIRMED');
  for (const bad of [{ ...g, league: undefined }, { ...g, programTitle: 'NBA: Boston Celtics' }, { ...g, metadataSource: 'CACHED' as const }, { ...g, available: false }, { ...g, observedAt: new Date(NOW - 90_001).toISOString() }]) assert.notEqual(resolve([bad]).state, 'CONFIRMED');
  assert.notEqual(resolve([g], { ...e, status: 'SCHEDULED' }).state, 'CONFIRMED');
  assert.equal(resolve([g, { ...g, channel: { id: 'yttv:other', name: 'Other' }, target: { ...g.target!, channelId: 'yttv:other' } }]).state, 'AMBIGUOUS');
  assert.notEqual(resolve([g], { ...e, evidenceClass: 'FIXTURE' }).state, 'CONFIRMED');
  assert.notEqual(resolve([g], { ...e, fetchedAt: new Date(NOW - 90_001).toISOString() }).state, 'CONFIRMED');
});

test('extension makes zero requests without permission; relay failure preserves games and ages their authority', async () => {
  let permitted = false; let now = NOW; let calls = 0; let fail = false;
  const client = createSportsClient({ permitted: () => permitted, clock: () => now, request: async () => { calls++; if (fail) throw new Error('relay outage'); return new Response(JSON.stringify({ provider: 'balldontlie-nba', state: 'READY', events: [event()] })); } });
  assert.equal((await client.refresh()).state, 'PERMISSION_REQUIRED'); assert.equal(calls, 0);
  permitted = true; await client.refresh(); assert.equal(calls, 1);
  fail = true; now += 60_001; await client.refresh(); assert.equal(client.snapshot().events[0].id, event().id); assert.equal(client.snapshot().events[0].freshness, 'STALE');
  await client.refresh(); assert.equal(calls, 2);
});
