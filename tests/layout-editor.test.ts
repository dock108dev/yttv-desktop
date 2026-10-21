import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_OPTIONS, boundingArea, contains, normalizeSlots, planLayout, type Rect } from '../packages/quadbox/src/geometry';
import { sanitizeWorkspaceLayout } from '../packages/storage/src/index';
import { validCommand } from '../apps/chrome-extension/src/adapter';
import { prepareSelection, screenRectangle } from '../apps/chrome-extension/src/area-selection';
import { createAreaPickerSession, type AreaPickerConfig } from '../apps/chrome-extension/src/area-picker-session';

const work = { left: -4200, top: -80, width: 4000, height: 2400 };
const slots: Rect[] = [
  { left: -4100, top: 20, width: 900, height: 600 },
  { left: -3000, top: 220, width: 700, height: 400 },
  { left: -4100, top: 900, width: 1200, height: 700 },
  { left: -2000, top: 1000, width: 1000, height: 700 },
];

test('every preset supports one to four shows with explicit orientation, ordering and readable nonoverlapping bounds', () => {
  for (const { value: mode } of LAYOUT_OPTIONS.filter(option => option.value !== 'custom')) for (const count of [1, 2, 3, 4]) {
    const plan = planLayout(work, count, 8, mode); assert(plan.ok, `${mode}, ${count}`);
    assert.equal(plan.bounds.length, count);
    plan.bounds.forEach((r, i) => {
      assert(contains(work, r)); assert(r.width >= 480 && r.height >= 320);
      for (const other of plan.bounds.slice(i + 1)) assert(!(r.left < other.left + other.width && r.left + r.width > other.left && r.top < other.top + other.height && r.top + r.height > other.top), `${mode} overlaps`);
    });
    if (mode === 'top-bottom') assert(plan.bounds.every(r => r.left === work.left && r.width === work.width));
    if (mode === 'side-by-side') assert(plan.bounds.every(r => r.top === work.top && r.height === work.height));
    if (mode.startsWith('main-') && count === 2) assert(plan.bounds[0].width * plan.bounds[0].height > plan.bounds[1].width * plan.bounds[1].height, 'the main show is actually larger');
    if (mode === 'main-right' && count > 1) assert(plan.bounds[0].left > plan.bounds[1].left);
    if (mode === 'main-bottom' && count > 1) assert(plan.bounds[0].top > plan.bounds[1].top);
  }
  assert.equal(planLayout({ ...work, height: 700 }, 3, 8, 'top-bottom').ok, false, 'explicit stacked never silently becomes a grid');
  assert.equal(planLayout({ ...work, width: 1000 }, 3, 8, 'side-by-side').ok, false);
});

test('full-size drawing uses actual screen coordinates, reverse drags and negative origins without device-pixel scaling', () => {
  assert.deepEqual(screenRectangle({ x: -3000, y: 700 }, { x: -3900, y: 100 }, work), { left: -3900, top: 100, width: 900, height: 600 });
  assert.deepEqual(screenRectangle({ x: -5000, y: -300 }, { x: 100, y: 3000 }, work), work);
  const config: AreaPickerConfig = { workArea: work, displayId: 'philips', mode: 'custom', count: 4 };
  const selected = prepareSelection(config, slots); assert(selected.ok);
  assert.deepEqual(selected.area, work);
  assert.deepEqual(selected.bounds, slots, 'individual positions survive normalized storage and readback exactly');
  assert.deepEqual(boundingArea(selected.bounds), { left: -4100, top: 20, width: 3100, height: 1680 });
  assert.equal(prepareSelection(config, [slots[0], slots[1], undefined, slots[3]]).ok, false);
  assert.equal(prepareSelection(config, [{ ...slots[0], width: 400 }, ...slots.slice(1)]).ok, false);
  assert.equal(prepareSelection(config, [{ ...slots[0], left: -6000 }, ...slots.slice(1)]).ok, false);
  for (const count of [1, 2, 3, 4]) {
    const custom = prepareSelection({ ...config, count }, slots.slice(0, count)); assert(custom.ok); assert.deepEqual(custom.bounds, slots.slice(0, count));
    const preset = prepareSelection({ ...config, mode: 'grid', count }, [work]); assert(preset.ok); assert.equal(preset.bounds.length, count);
  }
});

test('custom positions are saved independently for each count and malformed modes/slots do not gain command authority', () => {
  const customLayouts = Object.fromEntries([1, 2, 3, 4].map(count => [count, normalizeSlots(work, slots.slice(0, count))]));
  const saved = sanitizeWorkspaceLayout({ version: 1, mode: 'custom', customLayouts, audio: true, url: 'ignored' });
  assert.deepEqual(saved, { version: 1, mode: 'custom', customLayouts });
  assert.deepEqual(sanitizeWorkspaceLayout(JSON.parse(JSON.stringify(saved))), saved);
  const clean = sanitizeWorkspaceLayout({ version: 1, mode: 'grid', customLayouts: { ...customLayouts, '2': [{ left: 0, top: 0, width: 2, height: 1 }], '5': customLayouts['4'] } });
  assert.equal(clean.customLayouts?.['2'], undefined); assert.equal(clean.customLayouts?.['5'], undefined);
  assert.deepEqual(clean.customLayouts?.['1'], customLayouts['1']);
  for (const { value: mode } of LAYOUT_OPTIONS) assert(validCommand({ type: 'SET_TV_AREA', workArea: work, area: work, layout: mode }));
  assert(validCommand({ type: 'OPEN_AREA_PICKER', workArea: work, displayId: 'philips', count: 4, mode: 'custom', slots: customLayouts['4'] }));
  assert(!validCommand({ type: 'OPEN_AREA_PICKER', workArea: work, displayId: 'philips', count: 5, mode: 'custom' }));
  assert(!validCommand({ type: 'OPEN_AREA_PICKER', workArea: work, displayId: 'philips', count: 2, mode: 'custom', slots: customLayouts['4'] }));
  assert(!validCommand({ type: 'SAVE_AREA_PICKER', area: work, customSlots: [{ left: 0, top: 0, width: Infinity, height: 1 }] }));
});

test('drawing-window lifecycle opens only on selected monitor and cancellation closes only its own extension window', async () => {
  const log: unknown[] = [], tabs = new Map<number, any>(); let allowed = true, displays = [{ id: 'philips', workArea: work }];
  const api: any = {
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}` },
    permissions: { contains: async () => allowed }, system: { display: { getInfo: async () => displays } },
    tabs: {
      query: async (q: any) => [...tabs.values()].filter(t => t.windowId === q.windowId),
      remove: async (id: number) => { log.push(['remove', id]); tabs.delete(id); },
    },
    windows: {
      create: async (data: any) => { log.push(data); const tab = { id: 51, windowId: 50, url: data.url }; tabs.set(51, tab); return { id: 50, tabs: [tab] }; },
      remove: async (id: number) => { log.push(['remove', id]); tabs.clear(); },
    },
  };
  const picker = createAreaPickerSession(api), config: AreaPickerConfig = { workArea: work, displayId: 'philips', count: 3, mode: 'custom' };
  allowed = false; assert.equal((await picker.open(config)).ok, false); assert.equal(log.length, 0);
  allowed = true; displays = [{ id: 'other', workArea: work }]; assert.equal((await picker.open(config)).ok, false); assert.equal(log.length, 0);
  displays = [{ id: 'philips', workArea: work }]; assert.equal((await picker.open(config)).ok, true);
  assert.deepEqual(log[0], { url: 'chrome-extension://test/area-picker.html', type: 'popup', focused: true, ...work });
  const sender: any = { id: 'test', url: 'chrome-extension://test/area-picker.html', tab: tabs.get(51) };
  assert.deepEqual((await picker.read(sender)).picker, config);
  assert.equal((await picker.read({ ...sender, url: 'https://tv.youtube.com/watch?v=unrelated' })).ok, false);
  tabs.set(52, { id: 52, windowId: 50, url: 'https://owner.example/' });
  assert.equal((await picker.read(sender)).ok, false); await picker.close(); assert.equal(log.length, 1, 'a shared or repurposed window is left alone');
  tabs.clear(); await picker.open(config); const before = log.length; await picker.close(); assert.deepEqual(log.slice(before), [['remove', 51]]);
  assert.equal((await picker.read(sender)).ok, false);
});

test('full-size drawing page saves separate boxes from pointer screen coordinates and Escape cancels without saving', async () => {
  const { build } = await import('esbuild');
  const { Window } = await import('happy-dom');
  const source = await build({ entryPoints: ['apps/chrome-extension/src/area-picker.ts'], bundle: true, write: false, format: 'iife', globalName: 'PickerUI', platform: 'browser' });
  const window = new Window({ url: 'http://127.0.0.1/' });
  const config: AreaPickerConfig = { workArea: work, displayId: 'philips', count: 4, mode: 'custom' };
  const commands: any[] = [];
  (window as any).chrome = { runtime: { sendMessage: async (command: any) => { commands.push(command); return command.type === 'GET_AREA_PICKER' ? { ok: true, picker: config } : { ok: true }; } } };
  window.document.body.innerHTML = '<div id="test-root"></div>';
  window.eval(`${source.outputFiles[0].text}\nwindow.PickerUI = PickerUI;`);
  await (window as any).PickerUI.mountAreaPicker(window.document.getElementById('test-root'));
  const board = window.document.querySelector('.drawing-board')!;
  (board as any).setPointerCapture = () => {}; (board as any).hasPointerCapture = () => false;
  const save = window.document.querySelector('.save')! as import('happy-dom').HTMLButtonElement;
  assert.equal(save.disabled, true);
  for (const [i, rect] of slots.entries()) {
    const event = (type: string, x: number, y: number) => new window.PointerEvent(type, { pointerId: 1, button: 0, bubbles: true, screenX: x, screenY: y, clientX: x - work.left, clientY: y - work.top });
    board.dispatchEvent(event('pointerdown', rect.left, rect.top));
    board.dispatchEvent(event('pointermove', rect.left + rect.width, rect.top + rect.height));
    board.dispatchEvent(event('pointerup', rect.left + rect.width, rect.top + rect.height));
    assert.equal(save.disabled, i < 3);
  }
  assert.deepEqual(JSON.parse((window.document.querySelector('textarea')! as import('happy-dom').HTMLTextAreaElement).value), slots);
  save.click(); await new Promise(resolve => setTimeout(resolve, 0));
  const command = commands.find(c => c.type === 'SAVE_AREA_PICKER'); assert(command);
  const plan = planLayout(command.area, 4, 8, 'custom', command.customSlots); assert(plan.ok); assert.deepEqual(JSON.parse(JSON.stringify(plan.bounds)), slots);
  const saved = commands.filter(c => c.type === 'SAVE_AREA_PICKER').length;
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commands.at(-1).type, 'CANCEL_AREA_PICKER'); assert.equal(commands.filter(c => c.type === 'SAVE_AREA_PICKER').length, saved);
  await window.happyDOM.abort();
});
