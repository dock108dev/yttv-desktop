import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../packages/quadbox/src/geometry';
import { createWorkspace, AREA_KEY } from '../apps/chrome-extension/src/workspace';
import { chooseMonitors, thisScreen } from '../apps/chrome-extension/src/display';
import { validCommand } from '../apps/chrome-extension/src/adapter';
const area = { left: -1920, top: -40, width: 1920, height: 1040 };

function harness() {
  const local: Record<string, any> = {}, session: Record<string, any> = {};
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 10, index: 1, pinned: true, url: 'https://tv.youtube.com/watch?v=main', mutedInfo: { muted: true } }], [9, { id: 9, windowId: 10, index: 0, url: 'https://owner.example/' }]]);
  const windows = new Map<number, any>([[10, { id: 10, left: 20, top: 40, width: 1000, height: 700, state: 'normal' }]]);
  const extra: { id: string; tabId: number; windowId: number }[] = [];
  const log: any[] = []; let next = 20, failWindow: number | undefined, clamp = false, permission = false;
  let displays: any[] = [{ id: 'monitor', name: 'External', workArea: area }];
  const store = (data: Record<string, any>) => ({ get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key])])), set: async (value: object) => Object.assign(data, structuredClone(value)) });
  const api: any = {
    storage: { local: store(local), session: store(session) }, runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
    permissions: { contains: async () => permission, request: async (r: unknown) => { log.push(['permission', r]); return permission; } },
    system: { display: { getInfo: async () => displays } },
    tabs: {
      get: async (id: number) => { if (!tabs.has(id)) throw Error('closed'); return { ...tabs.get(id) }; },
      query: async (q: any) => [...tabs.values()].filter(t => q.windowId === undefined || t.windowId === q.windowId),
      move: async (id: number, v: any) => { log.push(['move', id, v]); if (!windows.has(v.windowId)) throw Error('closed parent'); Object.assign(tabs.get(id), v); return tabs.get(id); },
      update: async (id: number, v: any) => { log.push(['tab', id, v]); Object.assign(tabs.get(id), v); return tabs.get(id); },
    },
    windows: {
      get: async (id: number) => { if (!windows.has(id)) throw Error('closed'); return { ...windows.get(id) }; },
      create: async (v: any) => { const id = next++; log.push(['create', id, v]); windows.set(id, { id, left: 10, top: 40, width: 960, height: 640, state: 'normal', ...v }); if (v.tabId) tabs.get(v.tabId).windowId = id; else tabs.set(id, { id, windowId: id, index: 0, url: v.url }); return { ...windows.get(id) }; },
      update: async (id: number, v: any) => { log.push(['window', id, v]); if (id === failWindow && v.width) { failWindow = undefined; throw Error('synthetic move'); } Object.assign(windows.get(id), v); if (clamp && v.width) { windows.get(id).width += 20; clamp = false; } return { ...windows.get(id) }; },
    },
  };
  const players = async () => [{ id: 'main', tabId: 1, windowId: tabs.get(1).windowId }, ...extra];
  const make = () => createWorkspace(api, players);
  return { api, make, local, session, tabs, windows, log, extra, add(id: number) { tabs.set(id, { id, windowId: id, index: 0, url: 'https://tv.youtube.com/watch?v=extra' }); windows.set(id, { id, ...area, state: 'normal' }); extra.push({ id: `pane-${id}`, tabId: id, windowId: id }); }, fail(id: number) { failWindow = id; }, clamp() { clamp = true; }, permission(v: boolean) { permission = v; }, displays(v: any[]) { displays = v; } };
}
test('layout planning saves before opening shows and validates the selected count without moving a different current count', async () => {
  const h = harness(); h.permission(true);
  const empty = createWorkspace(h.api, async () => []);
  const saved = await empty.setArea(area, area, 'monitor', 'grid', undefined, 4);
  assert.equal(saved.ok, true); assert.equal(saved.code, 'LAYOUT_SAVED');
  assert.equal(h.log.length, 0); assert.equal(empty.snapshot().layout, 'grid');
  const w = h.make(); h.add(30); h.add(31);
  assert.equal((await w.setArea(area, area, 'monitor', 'top-bottom', undefined, 3)).ok, true);
  assert.equal((await w.enroll()).ok, true);
  const before = structuredClone([...h.windows]), at = h.log.length;
  const smaller = { ...area, height: 700 };
  const planned = await w.setArea(area, smaller, 'monitor', 'top-bottom', undefined, 1);
  assert.equal(planned.ok, true); assert.equal(planned.code, 'LAYOUT_SAVED');
  assert.deepEqual([...h.windows], before); assert.equal(h.log.length, at);
  const intent = structuredClone(w.snapshot().intent);
  assert.equal((await w.setArea(area, smaller, 'monitor', 'top-bottom', undefined, 4)).ok, false);
  assert.deepEqual(w.snapshot().intent, intent);
  assert(validCommand({ namespace: 'yttv-desktop.v1', type: 'SET_TV_AREA', workArea: area, area, displayId: 'monitor', layout: 'grid', plannedCount: 4 }));
  assert(!validCommand({ type: 'SET_TV_AREA', workArea: area, area, plannedCount: 5 }));
});
test('singleton remote survives worker reconnect, close/reopen leaves players intact and emits no audio authority', async () => {
  const h = harness(), w = h.make(); await Promise.all([w.openRemote(), w.openRemote(), w.openRemote()]);
  assert.equal(h.log.filter(x => x[0] === 'create').length, 1);
  const again = h.make(); await again.openRemote(); assert.equal(h.log.filter(x => x[0] === 'create').length, 1);
  const remote = h.log.find(x => x[0] === 'create')[1]; h.tabs.delete(remote); h.windows.delete(remote);
  await again.openRemote(); assert.equal(h.log.filter(x => x[0] === 'create').length, 2); assert.equal(h.tabs.get(1).windowId, 10); assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  assert(!h.log.some(x => x[0] === 'tab' || x[0] === 'move'));
});
test('main same-tab enrollment, actual layout, Add/Close reflow, manual mode, Expand/Restore and return preserve owner tabs/bounds', async () => {
  const h = harness(), w = h.make(); await w.ready;
  const parent = { ...h.windows.get(10) }, owner = { ...h.tabs.get(9) };
  assert.equal((await w.setArea(area, area)).ok, true);
  assert.equal((await w.arrange()).ok, false, 'never resize shared owner window');
  assert.equal((await w.enroll()).ok, true); assert.equal(h.tabs.get(1).windowId, 20); assert.equal(h.tabs.get(1).mutedInfo.muted, true);
  for (const id of [30, 31, 32]) { h.add(id); assert.equal((await w.reflow()).ok, true); }
  assert.equal(w.snapshot().actual.length, 4);
  const saved = h.extra.map(p => ({ ...h.windows.get(p.windowId) }));
  assert.equal((await w.expand('pane-31')).ok, true); assert.deepEqual(Object.fromEntries(Object.keys(area).map(k => [k, h.windows.get(31)[k]])), area);
  const woke = h.make(); await woke.ready; assert.equal(woke.snapshot().expanded, true); assert.equal((await woke.restore()).ok, true); assert.deepEqual(h.extra.map(p => { const { focused: _focus, ...rest } = h.windows.get(p.windowId); return rest; }), saved);
  await w.setAuto(false); const count = h.log.length; await w.reflow(); assert.equal(h.log.length, count);
  h.extra.pop(); h.tabs.delete(32); await w.setAuto(true); assert.equal(w.snapshot().actual.length, 3);
  const restarted = h.make(); await restarted.ready; assert.equal(restarted.snapshot().enrolled, true);
  assert.equal((await restarted.returnMain()).ok, true); assert.equal(h.tabs.get(1).windowId, 10); assert.equal(h.tabs.get(1).index, 1); assert.equal(h.tabs.get(1).pinned, true);
  assert.deepEqual(h.tabs.get(9), owner); assert.deepEqual(h.windows.get(10), parent);
  assert(h.log.filter(x => x[0] === 'tab').every(x => Object.keys(x[2]).every(k => k === 'pinned')));
});
test('partial arrangement failure and OS clamping restore previous complete bounds without audio/nav changes', async () => {
  const h = harness(), w = h.make(); await w.setArea(area, area); await w.enroll(); h.add(30); h.add(31);
  const before = [...h.windows].map(([id, value]) => [id, { ...value }]);
  h.fail(30); assert.equal((await w.arrange()).ok, false); assert.deepEqual([...h.windows], before);
  h.clamp(); assert.equal((await w.arrange()).ok, false); assert.deepEqual([...h.windows], before);
  assert(!h.log.some(x => x[0] === 'tab'));
});
test('vanished parent returns the same original tab to a normal window; manually shared extra is never moved', async () => {
  const h = harness(), w = h.make(); await w.setArea(area, area); await w.enroll(); h.add(30);
  h.tabs.set(40, { id: 40, windowId: 30, url: 'https://owner.example/' }); const old = { ...h.windows.get(30) };
  assert.equal((await w.arrange()).ok, false); assert.deepEqual(h.windows.get(30), old);
  h.windows.delete(10); const result = await w.returnMain(); assert(result.ok); assert.match(result.message!, /no longer exists/); assert.notEqual(h.tabs.get(1).windowId, 20);
});
test('optional monitor access occurs only on explicit selection; denial/unavailable and disconnected topology are truthful', async () => {
  const h = harness(), w = h.make(); await w.ready;
  const fallback = thisScreen({ availWidth: 1440, availHeight: 850, availLeft: -1440, availTop: 25 });
  assert.equal(h.log.length, 0);
  const denied = await chooseMonitors(h.api, fallback); assert.deepEqual(denied.monitors, [fallback]); assert.match(denied.notice, /denied/);
  h.permission(true); const monitors = await chooseMonitors(h.api, fallback); assert.equal(monitors.monitors[0].id, 'monitor');
  assert.equal((await w.setArea(area, area, 'monitor')).ok, true); await w.enroll();
  h.displays([{ id: 'built-in', workArea: { left: 0, top: 30, width: 1440, height: 850 } }]);
  assert.equal((await w.arrange()).ok, true); assert.match(w.snapshot().notice, /disconnected/);
  h.permission(false); assert.equal((await w.arrange()).code, 'AREA_UNAVAILABLE');
  assert.equal((await w.setArea(area, area, 'monitor')).code, 'DISPLAY_PERMISSION');
  assert.equal((await w.setArea(fallback.workArea, fallback.workArea)).ok, true);
  assert.equal(h.local[AREA_KEY].displayId, undefined);
});

test('paused-program continuity rejects replacement, position/mute/volume drift and missing capture before enrollment', async () => {
  const { captureUsable, continuity } = await import('../apps/chrome-extension/src/continuity');
  const before: any = { route: 'watch', playerKey: 'same-player', currentProgram: 'Paused program', currentChannelId: 'channel', playback: { playing: false, muted: true, volume: .43, currentTime: 276 } };
  assert(captureUsable(before)); assert(continuity(before, structuredClone(before)));
  for (const after of [{ ...before, playerKey: 'new-player' }, { ...before, currentProgram: 'Another program' }, { ...before, playback: { ...before.playback, currentTime: 0 } }, { ...before, playback: { ...before.playback, playing: true } }, { ...before, playback: { ...before.playback, muted: false } }, { ...before, playback: { ...before.playback, volume: 1 } }, { ...before, playback: { ...before.playback, currentTime: null } }]) assert.equal(continuity(before, after), false);
  assert.equal(captureUsable({ ...before, playerKey: undefined }), false);
});
test('four-source serialized audio handoff isolates every source and failure never enables another feed', async () => {
  const { createAudioState, createAudioFocusController } = await import('../packages/quadbox/src/index');
  const audible = new Set<string>(); let peak = 0, failMute = false;
  const controller = createAudioFocusController({ async setMuted(id, muted) {
    if (failMute && muted && id === '3') throw Error('synthetic mute failure');
    if (muted) audible.delete(id); else audible.add(id); peak = Math.max(peak, audible.size);
  } });
  const state = { ...createAudioState(), panes: ['1', '2', '3', '4'].map(id => ({ id, playbackSession: id, availability: 'READY' as const, muted: true })) };
  const results = await Promise.all(state.panes.map(p => controller.focus(state, p.id)));
  assert.equal(peak, 1); assert.deepEqual([...audible], ['4']); assert.equal(results.at(-1)!.audioFocusId, '4');
  failMute = true; const failed = await controller.focus(state, '2'); assert.equal(failed.audioFocusId, null); assert.equal(audible.size, 0);
});

test('workspace storage failure preserves records and cannot create a duplicate remote or move owner windows', async () => {
  const h = harness(); h.session['yttv-desktop.remote.v1'] = 20;
  h.api.storage.session.get = async () => { throw Error('synthetic unavailable storage'); };
  const w = h.make(); await w.ready; assert.equal(w.snapshot().available, false);
  assert.equal((await w.openRemote()).code, 'STORAGE_UNAVAILABLE');
  assert.equal((await w.enroll()).code, 'STORAGE_UNAVAILABLE'); assert.equal(h.log.length, 0);
  assert.equal(h.session['yttv-desktop.remote.v1'], 20);
});
test('incomplete layout rollback names the affected player and preserves recovery capability', async () => {
  const h = harness(), w = h.make(); await w.setArea(area, area); await w.enroll(); h.add(30);
  const update = h.api.windows.update; h.api.windows.update = async (id: number, value: any) => { if (id === 30 && value.width) throw Error('synthetic persistent failure'); return update(id, value); };
  const result = await w.arrange(); assert.equal(result.ok, false); assert.match(result.reason!, /Restoration incomplete for pane-30/);
  assert.equal(h.tabs.get(1).mutedInfo.muted, true); assert.equal((await w.returnMain()).ok, true);
});

test('manual drag survives Add/Close and worker restart; explicit Arrange can resume placement', async () => {
  const h = harness(), w = h.make(); await w.setArea(area, area); await w.enroll(); h.add(30); await w.reflow();
  h.windows.get(30).left += 70; const manual = { ...h.windows.get(30) };
  const woke = h.make(); await woke.ready; h.add(31);
  const boundary = h.log.length; const result = await woke.reflow();
  assert(result.ok); assert.match(result.message!, /Manual window positions preserved/);
  assert.equal(h.log.length, boundary); assert.equal(woke.snapshot().intent?.autoArrange, false);
  assert.deepEqual(h.windows.get(30), manual);
  h.extra.pop(); h.tabs.delete(31); await woke.reflow(); assert.deepEqual(h.windows.get(30), manual);
  await woke.arrange(); assert.notEqual(h.windows.get(30).left, manual.left);
  assert.equal(woke.snapshot().intent?.autoArrange, false, 'Arrange now does not silently enable automatic mode');
});

test('closed original recovery retains return evidence and never releases an existing original', async () => {
  const h = harness(), w = h.make(); await w.ready; await w.setArea(area, area); await w.enroll();
  const boundary = h.log.length;
  assert.equal((await w.releaseClosedOriginal()).code, 'ORIGINAL_EXISTS');
  assert.equal(w.snapshot().enrolled, true); assert.equal(h.log.length, boundary);
  h.tabs.delete(1);
  assert.equal((await w.releaseClosedOriginal()).ok, true);
  assert.equal(w.snapshot().enrolled, false); assert.equal(h.session['yttv-desktop.closed-original.v1'].origin.tabId, 1);
  assert.equal(h.log.length, boundary, 'no adoption, moving, closing or audio commands');
});

test('geometry restores the initiating remote focus but explicit Expand still focuses its player', async () => {
  const h = harness(), w = h.make(); await w.openRemote();
  const remoteId = h.log.find(x => x[0] === 'create')[1];
  h.windows.get(remoteId).focused = false; await w.focusRemote();
  assert.equal(h.windows.get(remoteId).focused, true, 'completion can restore remote after popup creation steals focus');
  await w.setArea(area, area); await w.enroll();
  let at = h.log.length; await w.arrange();
  assert.deepEqual(h.log.slice(at).at(-1), ['window', remoteId, { focused: true }]);
  at = h.log.length; await w.expand('main');
  assert.deepEqual(h.log.slice(at).at(-1), ['window', h.tabs.get(1).windowId, { focused: true }]);
  await w.restore();
  h.tabs.delete(remoteId); h.windows.delete(remoteId);
  const creates = h.log.filter(x => x[0] === 'create').length; await w.arrange();
  assert.equal(h.log.filter(x => x[0] === 'create').length, creates, 'closed remote is never recreated by geometry');
});

test('extension session loss restores saved placement and original Return from durable workspace backup without moving on open', async () => {
  const h = harness(), w = h.make(); await w.setArea(area, area); await w.enroll(); h.add(30); h.add(31);
  await w.setAuto(false); await w.expand('pane-30');
  for (const key of Object.keys(h.session)) delete h.session[key];
  const before = h.log.length; const recovered = h.make(); await recovered.ready;
  assert.equal(recovered.snapshot().enrolled, true); assert.equal(recovered.snapshot().expanded, true);
  assert.equal(recovered.snapshot().intent?.autoArrange, false); assert.equal(h.log.length, before);
  assert.equal((await recovered.restore()).ok, true);
  assert.equal((await recovered.returnMain()).ok, true); assert.equal(h.tabs.get(1).windowId, 10); assert.equal(h.tabs.get(1).index, 1);
  assert(h.tabs.has(9)); assert(h.tabs.has(30)); assert(h.tabs.has(31));
});

test('saved pair order, manual positions, repeated Expand/Restore and session-loss recovery preserve exact stacked bounds and Return', async () => {
  const h = harness(), w = h.make(); h.permission(true);
  const chosen = { left: -1000, top: 100, width: 980, height: 800 };
  assert.equal((await w.setArea(area, chosen, 'monitor', 'top-bottom')).ok, true);
  assert.equal((await w.enroll()).ok, true); assert.deepEqual(w.snapshot().actual[0].bounds, chosen, 'one fills without erasing pair intent');
  h.add(30); assert.equal((await w.reflow()).ok, true);
  const plan = planLayout(chosen, 2, 8, 'top-bottom'); assert(plan.ok);
  assert.deepEqual(w.snapshot().actual, [{ id: 'main', bounds: plan.bounds[0] }, { id: 'pane-30', bounds: plan.bounds[1] }]);
  await w.setAuto(false);
  for (const id of ['main', 'pane-30', 'main', 'pane-30']) {
    assert.equal((await w.expand(id)).ok, true); assert.deepEqual(w.snapshot().actual[0].bounds, chosen);
    for (const key of Object.keys(h.session)) delete h.session[key];
    const at = h.log.length, recovered = h.make(); await recovered.ready;
    assert.equal(h.log.length, at); assert.equal(recovered.snapshot().layout, 'top-bottom'); assert(recovered.snapshot().expanded);
    assert.equal((await recovered.restore()).ok, true); assert.deepEqual(recovered.snapshot().actual.map(r => r.bounds), plan.bounds);
    // Restore the original instance's expansion record as well before the next cycle.
    assert.equal((await w.restore()).ok, true);
  }
  h.windows.get(30).left += 35; const manual = { ...h.windows.get(30) }, at = h.log.length;
  await w.reflow(); assert.equal(h.log.length, at); assert.deepEqual(h.windows.get(30), manual);
  assert.equal((await w.arrange()).ok, true); assert.deepEqual(w.snapshot().actual.map(r => r.bounds), plan.bounds);
  assert.equal(w.snapshot().intent?.autoArrange, false);
  const returnAt = h.log.length; assert.equal((await w.returnMain()).ok, true); assert.equal(h.tabs.get(1).windowId, 10); assert(h.tabs.has(9));
  assert(h.log.slice(0, returnAt).filter(x => x[0] === 'tab').every(x => Object.keys(x[2]).every(k => k === 'pinned')));
});

test('fixed pair rejects monitor loss, denied access and changed logical work area before any mutation, even while expanded', async () => {
  for (const unavailable of ['missing', 'denied', 'changed'] as const) {
    const h = harness(), w = h.make(); h.permission(true); await w.setArea(area, area, 'monitor', 'top-bottom'); await w.enroll(); h.add(30); await w.arrange(); await w.expand('pane-30');
    const saved = structuredClone(h.local), at = h.log.length;
    if (unavailable === 'missing') h.displays([{ id: 'other', workArea: area }]);
    if (unavailable === 'denied') h.permission(false);
    if (unavailable === 'changed') h.displays([{ id: 'monitor', workArea: { ...area, width: 1800 } }]);
    for (const operation of [() => w.validatePlayers(), () => w.arrange(), () => w.expand('main'), () => w.restore(), () => w.enroll(), () => w.reflow(), () => w.setAuto(true)]) assert.equal((await operation()).ok, false);
    assert.equal(h.log.length, at, unavailable); assert.deepEqual(h.local, saved, 'failure preserves saved intent and expansion');
    h.permission(true); h.displays([{ id: 'monitor', workArea: area }]); assert.equal((await w.restore()).ok, true);
  }
});

test('fixed pair setup refuses unbound, tiny or stale areas; clamping/partial failure preserves intent and mismatch leaves players intact', async () => {
  const h = harness(), w = h.make(); h.permission(true);
  assert.equal((await w.setArea(area, area, undefined, 'top-bottom')).code, 'DISPLAY_REQUIRED');
  assert.equal((await w.setArea(area, { ...area, height: 319 }, 'monitor', 'top-bottom')).code, 'AREA_TOO_SMALL');
  assert.equal((await w.setArea({ ...area, width: 1800 }, { ...area, width: 1800 }, 'monitor', 'top-bottom')).code, 'DISPLAY_CHANGED');
  assert.equal(h.log.length, 0); assert.equal(w.snapshot().intent, null);
  await w.setArea(area, area, 'monitor', 'top-bottom'); await w.enroll(); h.add(30); await w.arrange();
  const saved = structuredClone(h.local), before = structuredClone([...h.windows]);
  for (const fail of [() => h.clamp(), () => h.fail(30)]) { fail(); assert.equal((await w.arrange()).ok, false); assert.deepEqual([...h.windows], before); assert.deepEqual(h.local, saved); }
  const update = h.api.windows.update; let changeDuringMove = true;
  h.api.windows.update = async (id: number, value: any) => { const result = await update(id, value); if (changeDuringMove && value.width) { changeDuringMove = false; h.displays([{ id: 'other', workArea: area }]); } return result; };
  const changed = await w.arrange(); assert.equal(changed.ok, false); assert.match(changed.reason!, /changed during placement.*Previous bounds restored/); assert.deepEqual([...h.windows], before); assert.deepEqual(h.local, saved);
  h.displays([{ id: 'monitor', workArea: area }]);
  h.add(31); const at = h.log.length; assert.equal((await w.validatePlayers()).ok, true, 'stacked layout supports three connected shows through the shared path'); assert.equal(h.log.length, at);
  assert.equal((await w.reflow()).ok, true); assert.equal(w.snapshot().layout, 'top-bottom'); assert.match(w.snapshot().notice, /Stacked/);
  h.extra.pop(); h.tabs.delete(31); assert.equal((await w.reflow()).ok, true); assert.equal(w.snapshot().actual[1].bounds.left, area.left);
});

test('custom layouts for all four counts survive reopening and retain precise positions through Expand/Restore', async () => {
  const large = { left: -2600, top: -100, width: 2600, height: 1800 };
  const slots = [
    { left: -2500, top: 0, width: 800, height: 450 },
    { left: -1500, top: 100, width: 900, height: 500 },
    { left: -2400, top: 800, width: 700, height: 600 },
    { left: -1300, top: 950, width: 800, height: 500 },
  ];
  const { normalizeSlots, boundingArea } = await import('../packages/quadbox/src/geometry');
  for (const count of [1, 2, 3, 4]) {
    const h = harness(), w = h.make(); h.permission(true); h.displays([{ id: 'monitor', workArea: large }]);
    for (let i = 1; i < count; i++) h.add(30 + i);
    assert.equal((await w.setArea(large, large, 'monitor', 'custom', normalizeSlots(large, slots.slice(0, count)))).ok, true);
    assert.equal((await w.enroll()).ok, true); assert.equal((await w.validatePlayers()).ok, true);
    assert.deepEqual(w.snapshot().actual.map(row => row.bounds), slots.slice(0, count));
    for (const pane of w.snapshot().actual) {
      const before = w.snapshot().actual.map(row => row.bounds);
      assert.equal((await w.expand(pane.id)).ok, true); assert.deepEqual(w.snapshot().actual[0].bounds, boundingArea(slots.slice(0, count)));
      assert.equal((await w.restore()).ok, true); assert.deepEqual(w.snapshot().actual.map(row => row.bounds), before);
    }
    const at = h.log.length; const reopened = h.make(); await reopened.ready; assert.equal(h.log.length, at);
    assert.equal((await reopened.arrange()).ok, true); assert.deepEqual(reopened.snapshot().actual.map(row => row.bounds), slots.slice(0, count));
    const preserved = structuredClone(reopened.snapshot().customLayouts);
    assert.equal((await reopened.setArea(large, large, 'monitor', 'grid')).ok, true); assert.equal((await reopened.setArea(large, large, 'monitor', 'custom')).ok, true);
    assert.deepEqual(reopened.snapshot().customLayouts, preserved);
  }
});
