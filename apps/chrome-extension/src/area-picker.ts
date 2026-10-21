import { envelope } from './adapter';
import { prepareSelection, screenRectangle, type ScreenPoint } from './area-selection';
import { planLayout, type Rect } from '../../../packages/quadbox/src/geometry';
import type { AreaPickerReply } from './area-picker-session';
import type { ActionResult } from '../../../packages/ui/src/types';

export async function mountAreaPicker(root: HTMLElement) {
  const reply: AreaPickerReply = await chrome.runtime.sendMessage(envelope({ type: 'GET_AREA_PICKER' })).catch(() => ({ ok: false, reason: 'The remote disconnected. Open a new drawing window.' }));
  if (!reply.ok || !reply.picker) { root.textContent = reply.reason ?? 'Open a new drawing window from the remote.'; return; }
  const config = reply.picker, custom = config.mode === 'custom';
  const initial = config.area && planLayout(config.area, config.count, 8, config.mode, config.slots);
  let boxes: (Rect | undefined)[] = custom
    ? config.slots && initial?.ok ? initial.bounds : Array.from({ length: config.count }, () => undefined)
    : [config.area];
  let selected = 0, start: ScreenPoint | undefined, oldBox: Rect | undefined;
  // Recalibrate from each real pointer event to account for the window's frame and monitor origin.
  let origin = { x: window.screenX + (window.outerWidth - window.innerWidth) / 2, y: window.screenY + window.outerHeight - window.innerHeight };
  let saving = false;
  root.innerHTML = '<div class="drawing-board" aria-label="Draw show positions"><div class="selections"></div></div><section class="drawing-toolbar" aria-label="Layout drawing controls"><div class="toolbar-heading"><h1></h1><button class="move-controls">Move controls to bottom</button></div><p class="instructions"></p><small>This is a full-size monitor canvas. Drag outside this panel.</small><div class="slots actions"></div><p class="selection-status" role="status"></p><details><summary>Fine-tune position</summary><div class="numeric"></div></details><details><summary>Coordinates</summary><textarea readonly aria-label="Selected coordinates"></textarea><button class="copy">Copy coordinates</button></details><div class="actions"><button class="whole"></button><button class="reset">Clear</button><button class="cancel">Cancel</button><button class="save primary">Save layout</button></div><p class="error" role="alert"></p></section>';
  const query = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const board = query<HTMLDivElement>('.drawing-board'), save = query<HTMLButtonElement>('.save'), error = query<HTMLParagraphElement>('.error');
  const toolbar = query<HTMLElement>('.drawing-toolbar');
  const moveControls = query<HTMLButtonElement>('.move-controls');
  moveControls.addEventListener('click', () => {
    const bottom = toolbar.classList.toggle('at-bottom');
    moveControls.textContent = bottom ? 'Move controls to top' : 'Move controls to bottom';
  });
  query('h1').textContent = custom ? `Place ${config.count} ${config.count === 1 ? 'show' : 'shows'}` : 'Draw your TV area';
  query('.instructions').textContent = custom ? 'Choose a show number, then draw its box on this monitor.' : `Draw one box. We’ll arrange ${config.count === 1 ? 'your show' : `all ${config.count} shows`} inside it.`;
  const whole = query<HTMLButtonElement>('.whole'); whole.textContent = custom ? 'Start with a grid' : 'Use whole monitor';
  const slotButtons: HTMLButtonElement[] = [];
  if (custom) for (let i = 0; i < config.count; i++) {
    const button = document.createElement('button'); button.addEventListener('click', () => { selected = i; draw(); });
    query('.slots').append(button); slotButtons.push(button);
  }
  const inputs = new Map<keyof Rect, HTMLInputElement>();
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    const label = document.createElement('label'); label.textContent = key[0].toUpperCase() + key.slice(1);
    const input = document.createElement('input'); input.type = 'number'; input.step = '1'; label.append(input); query('.numeric').append(label); inputs.set(key, input);
    input.addEventListener('input', () => { boxes[selected] = { ...(boxes[selected] ?? { ...config.workArea, width: 0, height: 0 }), [key]: Number(input.value) }; draw(); });
  }
  function draw() {
    const selection = prepareSelection(config, boxes);
    const shown = selection.ok ? selection.bounds : boxes;
    const fragment = document.createDocumentFragment();
    shown.forEach((r, i) => {
      if (!r) return;
      const div = document.createElement('div'); div.className = `selection-box${custom && selected === i ? ' active' : ''}`;
      Object.assign(div.style, { left: `${r.left - origin.x}px`, top: `${r.top - origin.y}px`, width: `${r.width}px`, height: `${r.height}px` });
      const label = document.createElement('span'); label.textContent = `Show ${i + 1}`;
      const coordinates = document.createElement('small'); coordinates.textContent = `${r.left}, ${r.top} · ${r.width} × ${r.height}`; label.append(coordinates); div.append(label); fragment.append(div);
    });
    query('.selections').replaceChildren(fragment);
    slotButtons.forEach((button, i) => { button.textContent = `Show ${i + 1}${boxes[i] ? ' ✓' : ''}`; button.setAttribute('aria-pressed', String(i === selected)); });
    for (const [key, input] of inputs) if (document.activeElement !== input) input.value = String(boxes[selected]?.[key] ?? '');
    query('.selection-status').textContent = selection.ok ? 'Ready to save. Draw again to adjust a box.' : selection.reason;
    query<HTMLTextAreaElement>('textarea').value = selection.ok ? JSON.stringify(selection.bounds, null, 2) : '';
    toolbar.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(control => { control.disabled = saving; });
    query<HTMLButtonElement>('.copy').disabled = saving || !selection.ok;
    save.disabled = saving || !selection.ok;
  }
  board.addEventListener('pointerdown', event => {
    if (saving || event.button !== 0) return;
    origin = { x: event.screenX - event.clientX, y: event.screenY - event.clientY };
    toolbar.classList.add('drawing');
    start = { x: event.screenX, y: event.screenY }; oldBox = boxes[selected] && { ...boxes[selected]! };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointermove', event => {
    if (!start) return;
    boxes[selected] = screenRectangle(start, { x: event.screenX, y: event.screenY }, config.workArea); draw();
  });
  board.addEventListener('pointerup', event => {
    if (!start) return;
    const rect = screenRectangle(start, { x: event.screenX, y: event.screenY }, config.workArea);
    boxes[selected] = rect.width && rect.height ? rect : oldBox; start = undefined; toolbar.classList.remove('drawing');
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    if (custom) { const missing = boxes.findIndex(r => !r); if (missing >= 0) selected = missing; }
    draw();
  });
  board.addEventListener('pointercancel', () => { if (start) boxes[selected] = oldBox; start = undefined; toolbar.classList.remove('drawing'); draw(); });
  whole.addEventListener('click', () => {
    if (custom) { const plan = planLayout(config.workArea, config.count, 8, 'grid'); if (plan.ok) boxes = plan.bounds; else error.textContent = plan.reason; }
    else boxes = [{ ...config.workArea }];
    draw();
  });
  query('.reset').addEventListener('click', () => { boxes = Array.from({ length: custom ? config.count : 1 }, () => undefined); selected = 0; draw(); });
  const cancel = async () => {
    if (saving) return;
    try {
      const result: ActionResult = await chrome.runtime.sendMessage(envelope({ type: 'CANCEL_AREA_PICKER' }));
      if (!result.ok) error.textContent = result.reason ?? 'Close this drawing window and reopen it from the remote.';
    } catch { error.textContent = 'The remote disconnected. Close this drawing window and reopen it from the remote.'; }
  };
  query('.cancel').addEventListener('click', () => void cancel());
  const commit = async () => {
    const selection = prepareSelection(config, boxes); if (!selection.ok || saving) return;
    saving = true; error.textContent = ''; draw();
    try {
      const result: ActionResult = await chrome.runtime.sendMessage(envelope({ type: 'SAVE_AREA_PICKER', area: selection.area, ...(selection.customSlots ? { customSlots: selection.customSlots } : {}) }));
      if (!result.ok) error.textContent = result.reason ?? 'Could not save. Try again.';
    } catch { error.textContent = 'The remote disconnected. Open a new drawing window and try again.'; }
    finally { saving = false; draw(); }
  };
  save.addEventListener('click', () => void commit());
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); void cancel(); } });
  query('.copy').addEventListener('click', async () => {
    const textarea = query<HTMLTextAreaElement>('textarea');
    try { await navigator.clipboard.writeText(textarea.value); error.textContent = ''; query('.selection-status').textContent = 'Coordinates copied.'; }
    catch { textarea.focus(); textarea.select(); error.textContent = 'Press your usual Copy shortcut to copy the selected coordinates.'; }
  });
  draw(); query<HTMLButtonElement>('.cancel').focus();
}
const root = document.getElementById('picker-root'); if (root) void mountAreaPicker(root);
