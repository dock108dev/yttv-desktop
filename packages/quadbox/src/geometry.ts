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
  const left = Math.round(workArea.left + n.left * workArea.width), top = Math.round(workArea.top + n.top * workArea.height);
  return { left, top, width: Math.floor(workArea.left + (n.left + n.width) * workArea.width) - left, height: Math.floor(workArea.top + (n.top + n.height) * workArea.height) - top };
}
export type LayoutResult = { ok: true; bounds: Rect[]; description: string } | { ok: false; reason: string };
export function planLayout(area: Rect, count: number, gap = 8): LayoutResult {
  if (!validRect(area) || !Number.isInteger(count) || count < 1 || count > 4 || !Number.isFinite(gap) || gap < 0 || gap > 100) return { ok: false, reason: 'TV area or feed count is unavailable.' };
  const a = { left: Math.ceil(area.left), top: Math.ceil(area.top), width: Math.floor(area.left + area.width) - Math.ceil(area.left), height: Math.floor(area.top + area.height) - Math.ceil(area.top) };
  const split = (r: Rect, vertical: boolean): Rect[] => {
    const first = Math.floor(((vertical ? r.width : r.height) - gap) / 2);
    return vertical ? [{ ...r, width: first }, { ...r, left: r.left + first + gap, width: r.width - first - gap }]
      : [{ ...r, height: first }, { ...r, top: r.top + first + gap, height: r.height - first - gap }];
  };
  const candidates: Rect[][] = count === 1 ? [[a]] : count === 2 ? [split(a, true), split(a, false)] : count === 3
    ? [true, false].map(v => { const [main, side] = split(a, v); return [main, ...split(side, !v)]; })
    : [[...split(a, false).flatMap(row => split(row, true))]];
  const readable = candidates.filter(rows => rows.every(r => r.width >= MIN_PLAYER.width && r.height >= MIN_PLAYER.height && contains(area, r)));
  if (!readable.length) return { ok: false, reason: `TV area is too small for ${count} feeds. Enlarge the area or close a feed (minimum outer player ${MIN_PLAYER.width} × ${MIN_PLAYER.height}).` };
  // Maximize useful 16:9 video area after a conservative native-frame allowance.
  readable.sort((x, y) => score(y) - score(x));
  return { ok: true, bounds: readable[0], description: count === 3 ? 'Main/first feed with two balanced companions' : count === 4 ? '2 × 2 grid' : count === 2 ? 'Balanced pair' : 'Fill TV area' };
}
function score(rows: Rect[]) { return rows.reduce((total, r) => total + Math.min(r.width, (r.height - 48) * 16 / 9) ** 2 * 9 / 16, 0); }
