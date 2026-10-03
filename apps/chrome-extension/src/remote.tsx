import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClientBridge } from './bridge';
import { envelope, type Command } from './adapter';
import { chooseMonitors, mapPoint, thisScreen, type Monitor } from './display';
import { contains, planLayout, resolveArea, validRect, type Rect } from '../../../packages/quadbox/src/geometry';
import { CURRENT_MANAGED_FEED_LIMIT, canAddManagedFeed } from '../../../packages/quadbox/src/policy';
import { freshLiveTarget } from '../../../packages/yttv-adapter/src/index';
import { sportsListings, listingPlayable } from '../../../packages/sports-engine/src/guide';
import type { ActionResult, DesktopSnapshot, ClientBridge } from '../../../packages/ui/src/types';
import './remote.css';
function Remote({ bridge }: { bridge: ClientBridge }) {
  const [state, setState] = useState<DesktopSnapshot | null>(null), [query, setQuery] = useState(''), [sports, setSports] = useState(false);
  const [candidateTab, setCandidateTab] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [areaOpen, setAreaOpen] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]), [monitorIndex, setMonitorIndex] = useState(0), [area, setArea] = useState<Rect | null>(null);
  const areaRef = useRef<HTMLElement>(null), areaButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!areaOpen) return;
    areaRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAreaOpen(false); areaButtonRef.current?.focus(); }
      if (e.key === 'Tab') {
        const controls = Array.from(areaRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') ?? []).filter(el => !el.closest('details:not([open])') || el.tagName === 'SUMMARY');
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [areaOpen]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const refresh = () => { void Promise.resolve(bridge.getSnapshot()).then(setState); };
    const unsubscribe = bridge.subscribe(refresh); refresh(); return unsubscribe;
  }, []);
  async function run(operation: () => Promise<ActionResult>) {
    if (busy) return; setBusy(true);
    try { const result = await operation(); setMessage(result.reason ?? result.message ?? (result.ok ? 'Done.' : 'Unavailable.')); return result; }
    catch { setMessage('Operation unavailable. Inspect current player state before retrying; native controls remain available.'); }
    finally { setBusy(false); await bridge.refresh?.(); }
  }
  const command = (c: Command) => chrome.runtime.sendMessage(envelope(c)) as Promise<ActionResult>;
  function openArea() {
    const fallback = thisScreen(window.screen); setMonitors([fallback]); setMonitorIndex(0);
    const saved = state?.workspace?.intent;
    setArea(saved && !saved.displayId ? resolveArea(saved, fallback.workArea) : fallback.workArea); setAreaOpen(true);
  }
  async function monitorsClick() {
    // Permission request occurs before any asynchronous work in this direct gesture handler.
    const result = await chooseMonitors(chrome, thisScreen(window.screen));
    setMonitors(result.monitors); setMonitorIndex(0); setArea(result.monitors[0].workArea); setMessage(result.notice);
  }
  async function applyArea(start: boolean) {
    if (!work || !area) return { ok: false, reason: 'Choose a TV area first.' };
    const result = await command({ type: 'SET_TV_AREA', workArea: work, area, displayId: monitors[monitorIndex].id });
    if (!result.ok) return result;
    setAreaOpen(false); areaButtonRef.current?.focus();
    return start ? command({ type: 'START_WORKSPACE' }) : result;
  }
  const selected = state?.panes.find(p => p.id === state.activePaneId) ?? state?.panes[0];
  const feedLabel = (p: NonNullable<DesktopSnapshot['panes'][number]>) => `${p.isMain || p.id === 'main' ? 'Original' : `Feed ${p.feedNumber ?? (state?.panes.filter(x => !x.isMain && x.id !== 'main').findIndex(x => x.id === p.id) ?? 0) + 2}`} · ${p.channelName}`;
  const hasMain = state?.panes.some(p => p.id === 'main');
  const targetReason = (e: DesktopSnapshot['guide'][number]) => freshLiveTarget(e) ? '' : e.metadataSource === 'CACHED' ? 'Saved listing — refresh the native guide.' : e.programs?.[0]?.context !== undefined && e.programs[0].context !== 'CURRENT' ? 'Upcoming program — not available to Add now.' : !e.available || !e.target ? 'No direct playback link available in the current guide.' : 'Listing expired — refresh the native guide.';
  const work = monitors[monitorIndex]?.workArea;
  const preview = area && state ? planLayout(area, Math.max(1, state.panes.length)) : null;
  const sportsRows = state ? sportsListings(state.guide, query) : [];
  const rows = state?.guide.filter(e => `${e.channel.name} ${e.programTitle ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <main>
    <header><strong>TV remote</strong><span>{state?.panes.length ?? 0} / {state?.feedLimit ?? CURRENT_MANAGED_FEED_LIMIT} feeds</span></header>
    <p className="current">{selected ? feedLabel(selected) : 'Open the original YouTube TV player'}<small>{selected?.status ?? 'Waiting for player'}{selected?.id === 'main' && state?.currentProgram ? ` · ${state.currentProgram}` : ''}</small></p>
    <p role="status" className="feedback">{message || state?.audioError || state?.workspace?.notice || 'Choose a TV area to begin. Audio stays as you set it.'}</p>
    <section aria-label="TV workspace">{state?.originalMissing && <div role="alert"><p>The previous original player was closed. Choose an existing player to start a new workspace.</p>{state.originalCandidates?.length ? <><label>Existing player<select value={candidateTab || String(state.originalCandidates[0].tabId)} onChange={e => setCandidateTab(e.target.value)}>{state.originalCandidates.map(c => <option key={c.tabId} value={c.tabId}>{c.label}</option>)}</select></label><button disabled={busy} onClick={() => void run(() => command({ type: 'CHOOSE_MAIN', tabId: Number(candidateTab || state.originalCandidates![0].tabId) }))}>Use this player</button></> : <p>Open a YouTube TV watch player normally, then return here.</p>}</div>}<h2>{state?.workspace?.enrolled ? 'Workspace ready' : 'Set up your TV workspace'}</h2>{!state?.workspace?.enrolled && <small>1. Choose a screen or area. 2. Start. 3. Add channels below.</small>}<div className="actions"><button disabled={busy || state?.workspace?.enrolled || !state?.workspace?.intent || !state?.panes.some(p => p.id === 'main')} onClick={() => void run(() => command({ type: 'START_WORKSPACE' }))}>Start TV workspace</button><button disabled={busy || !hasMain || !state?.workspace?.enrolled} onClick={() => void run(() => command({ type: 'RETURN_MAIN' }))}>Return original player</button></div>
      <div className="actions"><button ref={areaButtonRef} disabled={busy} onClick={openArea}>TV area</button><button disabled={busy || !hasMain || !state?.workspace?.enrolled} onClick={() => void run(() => command({ type: 'ARRANGE' }))}>Arrange now</button><button disabled={busy || !state?.workspace?.expanded} onClick={() => void run(bridge.restoreLayout)}>Restore</button></div>
      <label><input type="checkbox" disabled={busy || !state?.workspace?.intent} checked={state?.workspace?.intent?.autoArrange ?? false} onChange={e => void run(() => command({ type: 'AUTO_ARRANGE', enabled: e.target.checked }))} /> Auto arrange on Add/Close</label>
      <small>{state?.workspace?.notice}</small>
    </section>
    <details><summary>Connection</summary><small>Version {typeof __YTTV_VERSION__ === 'string' ? __YTTV_VERSION__ : 'source'} · Build {typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source'}</small><p>Reconnect controls to the existing original tab without refreshing playback. Requests optional script-injection access on this action only.</p><button disabled={busy} onClick={() => void run(async () => { if (!await chrome.permissions.request({ permissions: ['scripting'] })) return { ok: false, reason: 'Reconnect access denied. Use native player controls.' }; return command({ type: 'RECONNECT_MAIN' }); })}>Reconnect original player</button></details>
    <div className="actions"><button disabled={busy || !state?.preferences.previousChannel} onClick={() => void run(bridge.previousChannel)}>Previous on original</button><button disabled={busy} onClick={() => void run(bridge.mute!)}>Mute all</button></div>
    <label>Search channels or programs<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <details open={query ? true : undefined}><summary>Guide / Sports</summary>
      <small>Watch and Previous change the original player. Replace changes only the selected feed. Add opens a muted extra.</small>
      <small>{state?.guide.some(e => freshLiveTarget(e)) ? 'Choose available content below.' : state?.guide.length ? 'Saved listings. Refresh native guide to choose content; this may change the original player.' : 'Open the native Live guide to find content.'}</small>
      <label><input type="checkbox" checked={sports} onChange={e => setSports(e.target.checked)} /> Sports listings</label>
      <button disabled={busy} onClick={() => void run(bridge.recoverGuide!)}>Refresh native guide</button>
      <div className="results">{sports ? sportsRows.map((r, i) => <article key={`${r.entry.channel.id}-${i}`}><strong>{r.program.title}</strong><small>{r.entry.channel.name} · {r.kind} · {r.program.context}</small>{!listingPlayable(r) && <small>{targetReason(r.entry) || 'This program is not currently playable.'}</small>}<div className="actions"><button disabled={busy || !hasMain || !listingPlayable(r)} onClick={() => void run(() => bridge.watchProgram!(r.entry.channel.id, r.program.title, r.entry.observedAt))}>Watch original</button><button disabled={busy || !hasMain || !listingPlayable(r) || !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0))} onClick={() => void run(() => bridge.addProgram!(r.entry.channel.id, r.program.title, r.entry.observedAt))}>Add</button>{selected && <button disabled={busy || !hasMain || !listingPlayable(r)} onClick={() => void run(() => command({ type: 'REPLACE_PROGRAM', paneId: selected.id, channelId: r.entry.channel.id, title: r.program.title, observedAt: r.entry.observedAt }))}>Replace selected</button>}</div></article>) : rows.map(e => <article key={e.channel.id}><strong>{e.channel.name}</strong><small>{e.programTitle ?? 'Observed channel'}</small>{targetReason(e) && <small>{targetReason(e)}</small>}<div className="actions">
        <button disabled={busy || !hasMain || !freshLiveTarget(e)} onClick={() => void run(() => bridge.navigateChannel(e.channel.id))}>Watch original</button>
        <button disabled={busy || !hasMain || !freshLiveTarget(e) || !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0))} onClick={() => void run(() => bridge.createPane(e.channel.id))}>Add</button>
        {selected && <button disabled={busy || !hasMain || !freshLiveTarget(e)} onClick={() => void run(() => bridge.replacePane(selected.id, e.channel.id))}>Replace selected</button>}
      </div></article>)}{!(sports ? sportsRows.length : rows.length) && <p>No observed matches. Use the native Live guide.</p>}</div>
    </details>
    <label>Selected feed<select disabled={busy || !selected} value={selected?.id ?? ''} onChange={e => void run(() => command({ type: 'ACTIVE_PANE', paneId: e.target.value }))}>{state?.panes.map(p => <option key={p.id} value={p.id}>{feedLabel(p)}</option>)}</select></label>
    <div className="actions"><button disabled={busy || !selected} onClick={() => void run(() => bridge.focusPane!(selected!.id))}>Focus feed</button><button disabled={busy || !selected} onClick={() => void run(() => bridge.selectPane(selected!.id))}>Select audio</button><button disabled={busy || !selected} onClick={() => void run(() => bridge.expandPane(selected!.id))}>Expand</button>{selected && !selected.isMain && selected.id !== 'main' && <button disabled={busy} onClick={() => void run(() => bridge.removePane!(selected.id))}>Close selected</button>}</div>
    <details><summary>Audio controls</summary><div className="actions"><button disabled={busy || !selected} onClick={() => void run(() => bridge.setAudio!({ muted: true }))}>Mute selected</button><label>Volume {selected?.volume == null ? 'unknown' : `${Math.round(selected.volume * 100)}%`}<input aria-label="Selected feed volume" type="range" min="0" max="100" value={Math.round((selected?.volume ?? 0) * 100)} disabled={busy || !selected} onChange={e => void run(() => bridge.setAudio!({ volume: Number(e.target.value) / 100 }))} /></label></div></details>
    <details aria-label="Feed controls"><summary>All feed controls</summary>{state?.panes.map(p => <article key={p.id} className={p.id === selected?.id ? 'selected' : ''}>
      <strong>{feedLabel(p)}</strong><small>{p.tabMuted === true ? 'Tab muted' : p.tabMuted === false ? 'Tab enabled' : 'Tab mute unknown'} · {p.status}</small>
      <div className="actions"><button disabled={busy} onClick={() => void run(() => bridge.focusPane!(p.id))}>Focus feed</button>
        <button disabled={busy} onClick={() => void run(() => bridge.selectPane(p.id))}>Select audio</button>
        <button disabled={busy} onClick={() => void run(() => bridge.expandPane(p.id))}>Expand</button>
        {!p.isMain && <button disabled={busy} onClick={() => void run(() => bridge.removePane!(p.id))}>Close</button>}</div>
    </article>)}</details>
    {areaOpen && work && area && <div className="area-backdrop"><section ref={areaRef} role="dialog" aria-modal="true" aria-label="TV area editor"><h2>Choose your TV area</h2><p>Use this whole screen, choose another monitor, or draw a smaller area. Selecting here previews the area. Apply saves it; Apply and start arranges the players.</p><div className="actions"><button onClick={() => { const fallback = thisScreen(window.screen); setMonitors([fallback]); setMonitorIndex(0); setArea(fallback.workArea); }}>This screen</button><button onClick={() => void monitorsClick()}>Choose monitor</button></div><small>Choose monitor asks for optional access to monitor names and placement. Denial keeps This screen available.</small>
      <label>Monitor<select value={monitorIndex} onChange={e => { const index = Number(e.target.value); setMonitorIndex(index); setArea(monitors[index].workArea); }}>{monitors.map((m, i) => <option key={m.id ?? i} value={i}>{m.name}</option>)}</select></label>
      {monitors.length > 1 && <div className="monitor-map" aria-label="Proportional monitor map">{monitors.map((m, i) => {
        const left = Math.min(...monitors.map(d => d.workArea.left)), top = Math.min(...monitors.map(d => d.workArea.top));
        const width = Math.max(...monitors.map(d => d.workArea.left + d.workArea.width)) - left, height = Math.max(...monitors.map(d => d.workArea.top + d.workArea.height)) - top;
        return <button key={i} className="monitor" style={{ left: `${100 * (m.workArea.left - left) / width}%`, top: `${100 * (m.workArea.top - top) / height}%`, width: `${100 * m.workArea.width / width}%`, height: `${100 * m.workArea.height / height}%` }} onClick={() => { setMonitorIndex(i); setArea(m.workArea); }}>{m.name}</button>;
      })}</div>}
      <div className="area-map" style={{ aspectRatio: `${work.width} / ${work.height}` }} aria-label="Draw TV rectangle" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(mapPoint(work, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect())); }} onPointerMove={e => { if (!drag) return; const end = mapPoint(work, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect()); setArea({ left: Math.min(drag.x, end.x), top: Math.min(drag.y, end.y), width: Math.abs(end.x - drag.x), height: Math.abs(end.y - drag.y) }); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <div className="area-selection" style={{ left: `${100 * (area.left - work.left) / work.width}%`, top: `${100 * (area.top - work.top) / work.height}%`, width: `${100 * area.width / work.width}%`, height: `${100 * area.height / work.height}%` }} />
      </div>
      <details><summary>Adjust area precisely</summary><div className="numeric">{(['left', 'top', 'width', 'height'] as const).map(key => <label key={key}>{key}<input type="number" step="1" value={area[key]} onChange={e => setArea({ ...area, [key]: Number(e.target.value) })} /></label>)}</div></details>
      <small>{preview?.ok ? `${preview.description}; ${preview.bounds.map(r => `${r.width} × ${r.height}`).join(', ')}` : preview?.reason}</small>
      <div className="actions area-footer"><button disabled={busy} onClick={() => setArea(work)}>Full monitor reset</button><button disabled={busy} onClick={() => { setAreaOpen(false); areaButtonRef.current?.focus(); }}>Cancel</button><button disabled={busy || !preview?.ok || !validRect(area) || !contains(work, area)} onClick={() => void run(() => applyArea(false))}>Apply</button>{!state?.workspace?.enrolled && <button className="primary" disabled={busy || !hasMain || !preview?.ok || !validRect(area) || !contains(work, area)} onClick={() => void run(() => applyArea(true))}>Apply and start workspace</button>}</div>
      <p role="status">{message}</p>
    </section></div>}
  </main>;
}
export function mountRemote(element: HTMLElement, bridge: ClientBridge & { dispose?: () => void } = createClientBridge()) {
  const root = createRoot(element); root.render(<Remote bridge={bridge} />);
  const dispose = () => { root.unmount(); bridge.dispose?.(); };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
const element = document.getElementById('root'); if (element) mountRemote(element);
