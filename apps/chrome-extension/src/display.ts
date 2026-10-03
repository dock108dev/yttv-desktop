import { validRect, type Rect } from '../../../packages/quadbox/src/geometry';
export interface Monitor { id?: string; name: string; workArea: Rect }
export function thisScreen(s: Pick<Screen, 'availWidth' | 'availHeight'> & { availLeft?: number; availTop?: number }): Monitor {
  const workArea = { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight };
  if (!validRect(workArea)) throw new Error('Current screen area unavailable.');
  return { name: 'This screen', workArea };
}
/** Called directly by the monitor button; no request during mount or reconnect. */
export async function chooseMonitors(api: typeof chrome, fallback: Monitor): Promise<{ monitors: Monitor[]; notice: string }> {
  try {
    if (!await api.permissions.request({ permissions: ['system.display'] })) return { monitors: [fallback], notice: 'Monitor access denied. This screen remains available.' };
    const rows = await api.system.display.getInfo();
    const monitors = rows.filter(d => validRect(d.workArea)).map(d => ({ id: d.id, name: d.name || 'Monitor', workArea: { ...d.workArea } }));
    if (monitors.length) return { monitors, notice: 'Monitor work areas loaded in logical coordinates.' };
  } catch { /* denied/unavailable fallback */ }
  return { monitors: [fallback], notice: 'Monitor information unavailable. Use This screen.' };
}
export function mapPoint(work: Rect, point: { x: number; y: number }, diagram: { left: number; top: number; width: number; height: number }) {
  return { x: Math.round(work.left + Math.max(0, Math.min(1, (point.x - diagram.left) / diagram.width)) * work.width),
    y: Math.round(work.top + Math.max(0, Math.min(1, (point.y - diagram.top) / diagram.height)) * work.height) };
}
