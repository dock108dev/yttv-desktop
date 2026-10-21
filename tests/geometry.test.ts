import test from 'node:test';
import assert from 'node:assert/strict';
import { areaIntent, contains, planLayout, readIntent, resolveArea, type Rect } from '../packages/quadbox/src/geometry';
import { mapPoint } from '../apps/chrome-extension/src/display';
import { validCommand } from '../apps/chrome-extension/src/adapter';

const area = { left: -1920, top: -40, width: 1920, height: 1040 };
function overlap(a: Rect, b: Rect) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

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

test('diagram mapping respects negative logical coordinates and clamps outside-pointer positions', () => {
  assert.deepEqual(mapPoint(area, { x: 150, y: 100 }, { left: 50, top: 50, width: 200, height: 100 }), { x: -960, y: 480 });
  assert.deepEqual(mapPoint(area, { x: -50, y: 500 }, { left: 50, top: 50, width: 200, height: 100 }), { x: -1920, y: 1000 });
});

test('fractional area containment and too-small geometry never overflow the available work area', () => {
  for (let n = 1; n <= 4; n++) { const a = { left: -1920.7, top: 29.8, width: 1920.1, height: 1040.1 }; const plan = planLayout(a, n); assert(plan.ok); assert(plan.bounds.every(r => contains(a, r))); }
});

test('explicit Top/bottom never scores sideways, including odd logical bounds and cases where only Auto fits', () => {
  for (const a of [{ left: -1701, top: -47, width: 1401, height: 801 }, { left: 40, top: 60, width: 600, height: 1301 }]) {
    const plan = planLayout(a, 2, 8, 'top-bottom'); assert(plan.ok);
    const [top, bottom] = plan.bounds;
    assert.equal(top.left, bottom.left); assert.equal(top.width, a.width); assert.equal(bottom.width, a.width);
    assert.equal(bottom.top, top.top + top.height + 8); assert(Math.abs(top.height - bottom.height) <= 1);
    assert(contains(a, top)); assert(contains(a, bottom)); assert(!overlap(top, bottom));
    assert.deepEqual(planLayout(a, 1, 8, 'top-bottom'), planLayout(a, 1));
  }
  const wide = { left: 0, top: 0, width: 1920, height: 600 };
  assert(planLayout(wide, 2).ok); assert.equal(planLayout(wide, 2, 8, 'top-bottom').ok, false);
  const tall = { ...area, height: 1800 };
  for (const count of [3, 4]) {
    const explicit = planLayout(tall, count, 8, 'top-bottom'); assert(explicit.ok);
    assert(explicit.bounds.every(r => r.left === tall.left && r.width === tall.width));
    assert.equal(explicit.bounds.length, count);
  }
});
