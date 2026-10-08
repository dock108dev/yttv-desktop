import test from 'node:test';
import assert from 'node:assert/strict';
import { areaIntent, contains, planLayout, readIntent, resolveArea, type Rect } from '../packages/quadbox/src/geometry';
import { createWorkspace, AREA_KEY } from '../apps/chrome-extension/src/workspace';
import { chooseMonitors, mapPoint, thisScreen } from '../apps/chrome-extension/src/display';
import { validCommand } from '../apps/chrome-extension/src/adapter';
const area = { left: -1920, top: -40, width: 1920, height: 1040 };
function overlap(a: Rect, b: Rect) { return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top; }
test('1–4 geometry uses readable contained nonoverlapping outer bounds across landscape, portrait, negative origins and rounding', () => {
  for (const a of [area, { left: -577, top: 31, width: 1201, height: 1801 }, { left: 10, top: -100, width: 1601, height: 901 }]) for (let n = 1; n <= 4; n++) {
    const result = planLayout(a, n); assert(result.ok); assert.equal(result.bounds.length, n);
    for (const [i, r] of result.bounds.entries()) { assert(contains(a, r)); assert(r.width >= 480 && r.height >= 320); assert(Object.values(r).every(Number.isInteger)); assert(!result.bounds.slice(i + 1).some(other => overlap(r, other))); }
  }
  const portrait = planLayout({ left: 0, top: 0, width: 600, height: 1200 }, 2); assert(portrait.ok); assert.equal(portrait.bounds[0].width, 600);
  for (const n of [0, 5, 1.5, NaN]) assert.equal(planLayout(area, n).ok, false);
  assert.equal(planLayout({ ...area, width: 800, height: 600 }, 4).ok, false);
  assert.equal(planLayout({ ...area, left: Infinity }, 2).ok, false);
});
test('normalized area intent survives scale/topology changes and rejects malformed persisted authority', () => {
  const intent = areaIntent(area, { left: -1800, top: 20, width: 1600, height: 900 }, false, 'monitor'); assert(intent);
  const moved = { left: 0, top: 40, width: 1280, height: 720 }; assert(contains(moved, resolveArea(intent, moved)));
  assert.deepEqual(readIntent({ ...intent, url: 'secret', audio: true }), intent);
  assert.equal(readIntent({ ...intent, normalized: { ...intent.normalized, width: 2 } }), null);
  assert.equal(areaIntent(area, { ...area, left: -2000 }), null);
  assert(validCommand({ type: 'SET_TV_AREA', workArea: area, area }));
  assert(!validCommand({ type: 'SET_TV_AREA', workArea: area, area: { ...area, width: Infinity } }));
});
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
test('diagram mapping respects negative logical coordinates and clamps outside-pointer positions', () => {
  assert.deepEqual(mapPoint(area, { x: 150, y: 100 }, { left: 50, top: 50, width: 200, height: 100 }), { x: -960, y: 480 });
  assert.deepEqual(mapPoint(area, { x: -50, y: 500 }, { left: 50, top: 50, width: 200, height: 100 }), { x: -1920, y: 1000 });
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
test('fractional area containment and too-small geometry never overflow the available work area', () => {
  for (let n = 1; n <= 4; n++) { const a = { left: -1920.7, top: 29.8, width: 1920.1, height: 1040.1 }; const plan = planLayout(a, n); assert(plan.ok); assert(plan.bounds.every(r => contains(a, r))); }
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
