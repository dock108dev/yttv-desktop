import { isManagedFeedCount } from './policy';
/** Chrome outer-window logical coordinates. No devicePixelRatio conversion. */
export interface Rect { left: number; top: number; width: number; height: number }
export interface AreaIntent { version: 1; displayId?: string; workArea: Rect; normalized: Rect; autoArrange: boolean }
export const MIN_PLAYER = { width: 480, height: 320 }; // Includes native frame/control allowance; readback is mandatory.
export function validRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Rect;
  return [r.left, r.top, r.width, r.height].every(n => Number.isFinite(n) && Math.abs(n) <= 100000) && r.width > 0 && r.height > 0;
}
export function contains(area: Rect, r: Rect, tolerance = 0) {
  return r.left >= area.left - tolerance && r.top >= area.top - tolerance && r.left + r.width <= area.left + area.width + tolerance && r.top + r.height <= area.top + area.height + tolerance;
}
export function areaIntent(workArea: Rect, area: Rect, autoArrange = true, displayId?: string): AreaIntent | null {
  if (!validRect(workArea) || !validRect(area) || !contains(workArea, area)) return null;
  return { version: 1, displayId, workArea: { ...workArea }, autoArrange,
    normalized: { left: (area.left - workArea.left) / workArea.width, top: (area.top - workArea.top) / workArea.height, width: area.width / workArea.width, height: area.height / workArea.height } };
}
export function readIntent(raw: unknown): AreaIntent | null {
  const v = raw as AreaIntent;
  if (!v || v.version !== 1 || !validRect(v.workArea) || !validRect(v.normalized) || !contains({ left: 0, top: 0, width: 1, height: 1 }, v.normalized, 1e-9) || typeof v.autoArrange !== 'boolean' || (v.displayId !== undefined && (typeof v.displayId !== 'string' || v.displayId.length > 200))) return null;
  return { version: 1, displayId: v.displayId, workArea: { ...v.workArea }, normalized: { ...v.normalized }, autoArrange: v.autoArrange };
}
export function resolveArea(intent: AreaIntent, workArea = intent.workArea): Rect {
  const n = intent.normalized;
  // Normalization can round an integer edge just below itself (e.g. -20.000000000000114).
  // Snap only floating-point noise before containing the outer logical bounds.
  const edge = (v: number) => Math.abs(v - Math.round(v)) <= Number.EPSILON * Math.max(1, Math.abs(v), workArea.width, workArea.height) * 8 ? Math.round(v) : Math.floor(v);
  const left = Math.round(workArea.left + n.left * workArea.width), top = Math.round(workArea.top + n.top * workArea.height);
  return { left, top, width: edge(workArea.left + (n.left + n.width) * workArea.width) - left, height: edge(workArea.top + (n.top + n.height) * workArea.height) - top };
}
export const LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Best fit' },
  { value: 'top-bottom', label: 'Stacked' },
  { value: 'side-by-side', label: 'Side by side' },
  { value: 'grid', label: 'Grid' },
  { value: 'main-left', label: 'Large show on left' },
  { value: 'main-right', label: 'Large show on right' },
  { value: 'main-top', label: 'Large show on top' },
  { value: 'main-bottom', label: 'Large show on bottom' },
  { value: 'custom', label: 'Place each show myself' },
] as const;
export type LayoutMode = typeof LAYOUT_OPTIONS[number]['value'];
export function isLayoutMode(value: unknown): value is LayoutMode { return LAYOUT_OPTIONS.some(option => option.value === value); }
export function validCustomSlots(value: unknown, count?: number): value is Rect[] {
  return Array.isArray(value) && isManagedFeedCount(value.length) && (count === undefined || value.length === count) && value.every(r => validRect(r) && contains({ left: 0, top: 0, width: 1, height: 1 }, r, 1e-9));
}
export function normalizeSlots(area: Rect, slots: Rect[]): Rect[] {
  return slots.map(r => ({ left: (r.left - area.left) / area.width, top: (r.top - area.top) / area.height, width: r.width / area.width, height: r.height / area.height }));
}
export function boundingArea(slots: Rect[]): Rect {
  const left = Math.min(...slots.map(r => r.left)), top = Math.min(...slots.map(r => r.top));
  return { left, top, width: Math.max(...slots.map(r => r.left + r.width)) - left, height: Math.max(...slots.map(r => r.top + r.height)) - top };
}
export type LayoutResult = { ok: true; bounds: Rect[]; description: string } | { ok: false; reason: string };
export function planLayout(area: Rect, count: number, gap = 8, mode: LayoutMode = 'auto', customSlots?: Rect[]): LayoutResult {
  if (!validRect(area) || !isManagedFeedCount(count) || !Number.isFinite(gap) || gap < 0 || gap > 100 || !isLayoutMode(mode)) return { ok: false, reason: 'Choose an area and one to four shows.' };
  const a = { left: Math.ceil(area.left), top: Math.ceil(area.top), width: Math.floor(area.left + area.width) - Math.ceil(area.left), height: Math.floor(area.top + area.height) - Math.ceil(area.top) };
  const divide = (r: Rect, n: number, columns: boolean): Rect[] => {
    const available = (columns ? r.width : r.height) - gap * (n - 1);
    return Array.from({ length: n }, (_, i) => {
      const start = Math.floor(available * i / n), end = Math.floor(available * (i + 1) / n);
      return columns ? { ...r, left: r.left + start + gap * i, width: end - start } : { ...r, top: r.top + start + gap * i, height: end - start };
    });
  };
  let candidates: Rect[][];
  let description: string = LAYOUT_OPTIONS.find(option => option.value === mode)!.label;
  if (mode === 'custom' && customSlots) {
    if (!validCustomSlots(customSlots, count)) return { ok: false, reason: 'Draw one position for each show.' };
    candidates = [customSlots.map(normalized => resolveArea({ version: 1, workArea: a, normalized, autoArrange: true }))];
    description = 'Your saved show positions';
  } else if (count === 1) candidates = [[a]];
  else if (mode === 'top-bottom') candidates = [divide(a, count, false)];
  else if (mode === 'side-by-side') candidates = [divide(a, count, true)];
  else if (mode === 'grid') {
    const rows = divide(a, count <= 2 ? 1 : 2, false);
    candidates = [count <= 2 ? divide(a, count, true) : [...divide(rows[0], 2, true), ...divide(rows[1], count - 2, true)]];
  } else if (mode.startsWith('main-')) {
    const horizontal = mode === 'main-left' || mode === 'main-right';
    let halves = divide(a, 2, horizontal);
    const mainIndex = mode === 'main-right' || mode === 'main-bottom' ? 1 : 0;
    if (count === 2) {
      const available = (horizontal ? a.width : a.height) - gap, minimum = horizontal ? MIN_PLAYER.width : MIN_PLAYER.height;
      const mainSize = Math.max(minimum, Math.min(available - minimum, Math.floor(available * 2 / 3)));
      const firstSize = mainIndex === 0 ? mainSize : available - mainSize;
      halves = horizontal ? [{ ...a, width: firstSize }, { ...a, left: a.left + firstSize + gap, width: available - firstSize }]
        : [{ ...a, height: firstSize }, { ...a, top: a.top + firstSize + gap, height: available - firstSize }];
    }
    candidates = [[halves[mainIndex], ...divide(halves[1 - mainIndex], count - 1, !horizontal)]];
  } else {
    candidates = count === 2 ? [divide(a, 2, true), divide(a, 2, false)] : count === 3
      ? [true, false].map(columns => { const [main, side] = divide(a, 2, columns); return [main, ...divide(side, 2, !columns)]; })
      : [[...divide(a, 2, false).flatMap(row => divide(row, 2, true))]];
    description = mode === 'custom' ? `Best fit for ${count} shows; draw custom positions for this count to replace it` : 'Best fit';
  }
  const readable = candidates.filter(rows => rows.every(r => r.width >= MIN_PLAYER.width && r.height >= MIN_PLAYER.height && contains(area, r, 1e-7)));
  if (!readable.length) return { ok: false, reason: `This area is too small for ${count} shows in this layout. Make it larger or choose another layout.` };
  readable.sort((x, y) => score(y) - score(x));
  return { ok: true, bounds: readable[0], description: count === 1 && mode !== 'custom' ? 'One show fills the area' : description };
}
function score(rows: Rect[]) { return rows.reduce((total, r) => total + Math.min(r.width, (r.height - 48) * 16 / 9) ** 2 * 9 / 16, 0); }
