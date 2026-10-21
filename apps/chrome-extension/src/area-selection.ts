import { contains, normalizeSlots, planLayout, validRect, type Rect } from '../../../packages/quadbox/src/geometry';
import type { AreaPickerConfig } from './area-picker-session';
export interface ScreenPoint { x: number; y: number }
/** Pointer screen coordinates and Chrome window bounds use logical pixels, without DPR scaling. */
export function screenRectangle(start: ScreenPoint, end: ScreenPoint, work: Rect): Rect {
  const clamp = (n: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, n)));
  const x1 = clamp(start.x, work.left, work.left + work.width), x2 = clamp(end.x, work.left, work.left + work.width);
  const y1 = clamp(start.y, work.top, work.top + work.height), y2 = clamp(end.y, work.top, work.top + work.height);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}
export function prepareSelection(config: AreaPickerConfig, boxes: (Rect | undefined)[]) {
  const count = config.mode === 'custom' ? config.count : 1;
  if (boxes.length !== count || boxes.some(r => !validRect(r))) return { ok: false as const, reason: config.mode === 'custom' ? `Draw a box for each of the ${config.count} shows.` : 'Draw where you want your shows.' };
  const selected = boxes as Rect[];
  if (!selected.every(r => contains(config.workArea, r))) return { ok: false as const, reason: 'Keep each box inside this monitor.' };
  const area = config.mode === 'custom' ? config.workArea : selected[0];
  const customSlots = config.mode === 'custom' ? normalizeSlots(area, selected) : undefined;
  const plan = planLayout(area, config.count, 8, config.mode, customSlots);
  return plan.ok ? { ok: true as const, area, customSlots, bounds: plan.bounds } : plan;
}
