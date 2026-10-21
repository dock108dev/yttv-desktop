import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClientBridge } from './bridge';
import { envelope, type Command } from './adapter';
import { chooseMonitors, grantedMonitors, mapPoint, thisScreen, type Monitor } from './display';
import { contains, LAYOUT_OPTIONS, planLayout, resolveArea, validRect, type LayoutMode, type Rect } from '../../../packages/quadbox/src/geometry';
import { CURRENT_MANAGED_FEED_LIMIT, MANAGED_FEED_COUNTS, canAddManagedFeed } from '../../../packages/quadbox/src/policy';
import { freshLiveTarget } from '../../../packages/yttv-adapter/src/index';
import { sportsListings, listingPlayable } from '../../../packages/sports-engine/src/guide';
import type { ActionResult, DesktopSnapshot, ClientBridge } from '../../../packages/ui/src/types';
import './remote.css';
function SlotPreview({ work, area, mode, count, slots }: { work: Rect; area: Rect; mode: LayoutMode; count: number; slots?: Rect[] }) {
  const plan = planLayout(area, count, 8, mode, slots);
  return plan.ok ? <>{plan.bounds.map((r, i) => <div key={i} className="slot-preview" style={{ left: `${100 * (r.left - work.left) / work.width}%`, top: `${100 * (r.top - work.top) / work.height}%`, width: `${100 * r.width / work.width}%`, height: `${100 * r.height / work.height}%` }}>{`Show ${i + 1}`}</div>)}</> : null;
}
function Remote({ bridge }: { bridge: ClientBridge }) {
  const [state, setState] = useState<DesktopSnapshot | null>(null), [query, setQuery] = useState(''), [sports, setSports] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [layoutSetup, setLayoutSetup] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('auto'), [layoutCount, setLayoutCount] = useState(1);
  const layoutButtonRef = useRef<HTMLButtonElement>(null), areaTrigger = useRef<HTMLButtonElement | null>(null);
  const [candidateTab, setCandidateTab] = useState('');
  const [message, setMessage] = useState(''), [messageError, setMessageError] = useState(false), [busy, setBusy] = useState(false), [areaOpen, setAreaOpen] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]), [monitorIndex, setMonitorIndex] = useState(0), [area, setArea] = useState<Rect | null>(null);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null), addButtonRef = useRef<HTMLButtonElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const pickerWasOpen = useRef(false);
  useEffect(() => {
    if (!picker) return;
    searchRef.current?.focus(); document.getElementById('content-picker')?.scrollIntoView?.({ block: 'start' });
    pickerWasOpen.current = true;
  }, [picker]);
  useEffect(() => {
    if (picker || busy || !pickerWasOpen.current) return;
    (pickerTrigger.current?.isConnected ? pickerTrigger.current : addButtonRef.current)?.focus();
    pickerWasOpen.current = false;
  }, [picker, busy]);
  useEffect(() => {
    if (!message || messageError) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message, messageError]);
  useEffect(() => {
    if (!picker || areaOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPicker(null); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [picker, areaOpen]);
  const areaRef = useRef<HTMLElement>(null), areaButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!areaOpen) return;
    areaRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAreaOpen(false); (areaTrigger.current ?? areaButtonRef.current)?.focus(); }
      if (e.key === 'Tab') {
        const controls = Array.from(areaRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') ?? []).filter(el => {
          let closed = el.closest('details:not([open])');
          while (closed) {
            if (closed.firstElementChild !== el) return false;
            closed = closed.parentElement?.closest('details:not([open])') ?? null;
          }
          return true;
        });
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
    try { const result = await operation(); setMessage(result.reason ?? result.message ?? (result.ok ? 'Done.' : 'Unavailable.')); setMessageError(!result.ok); return result; }
    catch { setMessage('Action unavailable. Check the player before retrying, or use its native controls.'); setMessageError(true); }
    finally { setBusy(false); try { await bridge.refresh?.(); } catch { setMessage('Could not refresh the remote. Reopen it to see the latest state.'); setMessageError(true); } }
  }
  const command = (c: Command) => chrome.runtime.sendMessage(envelope(c)) as Promise<ActionResult>;
  async function openArea(setupLayout = false, mode?: LayoutMode) {
    setLayoutSetup(setupLayout);
    setLayoutMode(mode ?? state?.workspace?.layout ?? 'auto');
    setLayoutCount(Math.max(1, Math.min(CURRENT_MANAGED_FEED_LIMIT, state?.panes.length ?? 1)));
    areaTrigger.current = setupLayout ? layoutButtonRef.current : areaButtonRef.current;
    const fallback = thisScreen(window.screen), saved = state?.workspace?.intent;
    const available = saved?.displayId ? await grantedMonitors(chrome) : [];
    const index = available.findIndex(m => m.id === saved?.displayId);
    if (index >= 0) {
      setMonitors(available); setMonitorIndex(index); setArea(resolveArea(saved!, available[index].workArea));
    } else {
      setMonitors([fallback]); setMonitorIndex(0);
      // Keep the saved preview until the user deliberately chooses a replacement screen.
      const savedMonitor = saved?.displayId ? { id: saved.displayId, name: 'Saved monitor unavailable', workArea: saved.workArea } : null;
      if (savedMonitor) { setMonitors([savedMonitor]); setArea(resolveArea(saved!)); setMessage('Saved monitor unavailable. Choose This screen or another monitor before applying.'); setMessageError(true); }
      else setArea(saved ? resolveArea(saved, fallback.workArea) : setupLayout ? { ...fallback.workArea, width: 0, height: 0 } : fallback.workArea);
    }
    setAreaOpen(true);
  }
  async function monitorsClick() {
    // Permission request occurs before any asynchronous work in this direct gesture handler.
    const result = await chooseMonitors(chrome, thisScreen(window.screen));
    const saved = state?.workspace?.intent;
    const found = result.monitors.findIndex(m => m.id && m.id === saved?.displayId), index = Math.max(0, found);
    setMonitors(result.monitors); setMonitorIndex(index);
    setArea(found >= 0 ? resolveArea(saved!, result.monitors[index].workArea) : layoutSetup ? { ...result.monitors[index].workArea, width: 0, height: 0 } : result.monitors[index].workArea);
    if (layoutSetup && result.monitors[index].id) { setMessage(''); setMessageError(false); }
    else { setMessage(layoutSetup ? 'Allow monitor access to choose your screen, then try again.' : result.notice); setMessageError(true); }
  }
  async function applyArea(start: boolean) {
    if (!work || !area) return { ok: false, reason: 'Choose a TV area first.' };
    const result = await command({ type: 'SET_TV_AREA', workArea: work, area: layoutSetup && layoutMode === 'custom' ? work : area, displayId: monitors[monitorIndex].id, ...(layoutSetup ? { layout: layoutMode, plannedCount: layoutCount } : {}) });
    if (!result.ok) return result;
    setAreaOpen(false); (areaTrigger.current ?? areaButtonRef.current)?.focus();
    if (result.code === 'LAYOUT_SAVED') return result;
    if (state?.openingDefaultShow) return { ok: true, message: 'Layout saved. Wait for the first show to finish opening, then Arrange shows.' };
    if (layoutSetup) {
      const applied = state?.workspace?.enrolled && state.workspace.intent?.autoArrange ? result : await command({ type: 'APPLY_LAYOUT' });
      if (!applied.ok) return applied;
      const missing = layoutCount - (state?.panes.length ?? 0);
      return { ok: true, message: missing > 0 ? `Layout saved. Add or connect ${missing} more ${missing === 1 ? 'show' : 'shows'} when you’re ready.` : 'Layout saved. Use Arrange shows to put them back here.' };
    }
    return start ? command({ type: 'START_WORKSPACE' }) : result;
  }
  const slotLabel = (id: string) => state?.workspace?.layout === 'top-bottom' && state.panes.length <= 2 ? (id === 'main' ? 'Top · ' : 'Bottom · ') : '';
  const feedLabel = (p: NonNullable<DesktopSnapshot['panes'][number]>) => `${slotLabel(p.id)}${p.isMain || p.id === 'main' ? 'Original' : `Window ${p.feedNumber ?? (state?.panes.filter(x => !x.isMain && x.id !== 'main').findIndex(x => x.id === p.id) ?? 0) + 2}`} · ${p.channelName}`;
  async function openPicker(target: string, trigger: HTMLButtonElement) {
    pickerTrigger.current = trigger; setQuery(''); setPicker(target);
    // Reobserve existing owned pages without opening Live or disturbing playback.
    if (busy) return; setBusy(true);
    try { await bridge.refresh?.(); } catch { setMessage('Channels unavailable. Add current content or use native controls.'); setMessageError(true); }
    finally { setBusy(false); }
  }
  const hasMain = state?.panes.some(p => p.id === 'main');
  const targetReason = (e: DesktopSnapshot['guide'][number]) => freshLiveTarget(e) ? '' : e.metadataSource === 'CACHED' ? 'Saved listing. Waiting for current channel data.' : e.programs?.[0]?.context !== undefined && e.programs[0].context !== 'CURRENT' ? 'Upcoming program. Choose a current listing.' : !e.available || !e.target ? 'This listing cannot be opened from the remote.' : 'Listing out of date. Waiting for channels to update.';
  const work = monitors[monitorIndex]?.workArea;
  const editorMode = layoutSetup ? layoutMode : state?.workspace?.layout ?? 'auto';
  const editorCount = layoutSetup ? layoutCount : Math.max(1, state?.panes.length ?? 0);
  const customSlots = state?.workspace?.customLayouts?.[editorCount];
  const preview = area ? planLayout(area, editorCount, 8, editorMode, customSlots) : null;
  const savedArea = state?.workspace?.intent ? resolveArea(state.workspace.intent) : null;
  const currentCount = Math.max(1, state?.panes.length ?? 1);
  const currentMode = state?.workspace?.layout ?? 'auto';
  const layoutLabel = LAYOUT_OPTIONS.find(option => option.value === currentMode)?.label ?? 'Best fit';
  async function arrangeShows() {
    if (state?.pendingFeedCreations) { await run(() => Promise.resolve({ ok: false, reason: 'Wait for the new show to finish opening, then try again.' })); return; }
    if (!hasMain || !state?.workspace?.intent) { await openArea(true); return; }
    await run(async () => { const result = await command({ type: 'APPLY_LAYOUT' }); return result.ok ? { ok: true, message: 'Shows arranged.' } : result; });
  }
  async function drawOnMonitor() {
    const monitor = monitors[monitorIndex]; if (!monitor?.id) return { ok: false, reason: 'Choose monitor first, then draw your layout on it.' };
    const result = await command({ type: 'OPEN_AREA_PICKER', workArea: monitor.workArea, displayId: monitor.id, mode: editorMode, count: editorCount, ...(editorMode === 'custom' ? { area: monitor.workArea } : area && validRect(area) && contains(monitor.workArea, area) ? { area } : {}), ...(customSlots && editorMode === 'custom' ? { slots: customSlots } : {}) });
    if (result.ok) setAreaOpen(false);
    return result;
  }
  const sportsRows = state ? sportsListings(state.guide, query) : [];
  const rows = state?.guide.filter(e => `${e.channel.name} ${e.programTitle ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const unavailableReasons = [...new Set((sports ? sportsRows.map(r => r.entry) : rows).map(targetReason))];
  const sharedTargetReason = unavailableReasons.length === 1 && unavailableReasons[0] ? unavailableReasons[0] : '';
  return <main aria-busy={busy}>
    <header className="remote-header"><h1>TV remote</h1><span className="window-count">{Math.max(state?.panes.length ?? 0, state?.openPlayerWindowCount ?? 0)} / {state?.feedLimit ?? CURRENT_MANAGED_FEED_LIMIT} windows{hasMain && !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0)) && <span className="full-label"> · Full</span>}</span><div className="actions"><button className="primary" disabled={busy || !state || state.openingDefaultShow || !canAddManagedFeed((state.panes.length) + (state.pendingFeedCreations ?? 0))} onClick={() => void run(() => command({ type: 'NEW_SHOW' }))}>{state?.openingDefaultShow ? 'Opening…' : 'New show'}</button>{hasMain && <button ref={addButtonRef} className="quiet" aria-expanded={picker === 'add'} aria-controls="content-picker" title={!canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0)) ? 'Four-window limit reached. Remove a window to add another.' : undefined} disabled={busy || state?.openingDefaultShow || !hasMain || !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0))} onClick={e => void openPicker('add', e.currentTarget)}>Pick a channel</button>}</div></header>
    <section className="pair-shortcut" aria-label="Layout controls"><button ref={layoutButtonRef} className="primary" disabled={busy || !state || state.openingDefaultShow} onClick={() => void arrangeShows()}>Arrange shows</button>
      <small>{!hasMain ? 'Press New show to start watching.' : !savedArea ? 'One to four shows. Choose a layout or draw where each show goes.' : currentMode === 'custom' && !state?.workspace?.customLayouts?.[currentCount] ? `Choose positions for ${currentCount} shows with Change layout. Best fit is used for now.` : `${currentCount} ${currentCount === 1 ? 'show' : 'shows'} · ${layoutLabel}. Put them back in your saved spot.`}</small>
      {savedArea && <div className="area-map saved-preview" aria-label="Saved layout preview" style={{ aspectRatio: `${state!.workspace!.intent!.workArea.width} / ${state!.workspace!.intent!.workArea.height}` }}><SlotPreview work={state!.workspace!.intent!.workArea} area={savedArea} mode={currentMode} count={currentCount} slots={state?.workspace?.customLayouts?.[currentCount]} /></div>}
      {savedArea && <button disabled={busy} className="quiet" onClick={() => void openArea(true)}>Change layout</button>}
    </section>
    {message && <div role={messageError ? 'alert' : 'status'} className={`feedback ${messageError ? 'error' : 'success'}`}><span>{message}</span><button aria-label="Dismiss notification" onClick={() => setMessage('')}>Dismiss</button></div>}
    {state?.audioError && <p role="alert" className="feedback error">{state.audioError}</p>}
    {state?.originalMissing && <section className="recovery" role="alert"><h2>Choose an original player</h2><p>The previous original player was closed. Choose an existing player to start a new workspace.</p>{state.originalCandidates?.length ? <><label>Existing player<select value={candidateTab || String(state.originalCandidates[0].tabId)} onChange={e => setCandidateTab(e.target.value)}>{state.originalCandidates.map(c => <option key={c.tabId} value={c.tabId}>{c.label}</option>)}</select></label><button disabled={busy} onClick={() => void run(() => command({ type: 'CHOOSE_MAIN', tabId: Number(candidateTab || state.originalCandidates![0].tabId) }))}>Use this player</button></> : <p>Press New show above to start again.</p>}</section>}
    {!state && <p role="status">Connecting to your players…</p>}
    {state && !hasMain && !state.originalMissing && <section className="first-use"><h2>Start watching</h2><p>Press New show. We’ll open YouTube TV and start your last channel, or the first available live channel.</p></section>}
    {Boolean(state?.unassignedPlayers?.length) && <section aria-label="Existing windows"><p>{state!.unassignedPlayers!.length} existing player{state!.unassignedPlayers!.length === 1 ? '' : 's'} available to connect.</p>{!hasMain && <small>Choose the original above before connecting other windows.</small>}{state!.unassignedPlayers!.map(p => <button key={p.tabId} disabled={busy || !hasMain || !canAddManagedFeed(state?.panes.length ?? 0)} onClick={() => void run(() => command({ type: 'CONNECT_PANE', tabId: p.tabId }))}>Connect {p.label}</button>)}</section>}
    {picker && <section id="content-picker" aria-label="Content picker" className="content-picker"><div className="picker-heading"><h2>{picker === 'add' ? 'Pick a channel' : `Change ${state?.panes.find(p => p.id === picker)?.channelName ?? 'window'}`}</h2><button className="quiet" onClick={() => setPicker(null)}>Cancel picker</button></div>
      {picker === 'add' && <div className="current-content"><small>Add the same content in a muted window. Its position may differ.</small>{state?.panes.map(p => <button key={p.id} disabled={busy || !bridge.duplicatePane || !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0))} onClick={() => void run(async () => { const result = await bridge.duplicatePane!(p.id); if (result.ok) setPicker(null); return result; })}>Add current {feedLabel(p)}</button>)}</div>}
      <label>Search channels or programs<input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label><input type="checkbox" checked={sports} onChange={e => setSports(e.target.checked)} /> Sports listings</label>
      <p className="guide-status" role="status">{state?.guideSyncStatus === 'loading' ? 'Loading channels automatically…' : state?.guideSyncStatus === 'unavailable' ? 'Channels unavailable. Add current content or open the native guide.' : state?.guideSyncStatus === 'ready' ? 'Channels updated.' : 'Channels will appear when available.'}</p>
      {state?.guideSyncStatus === 'unavailable' && !state?.guide.some(e => freshLiveTarget(e)) && <><button disabled={busy} onClick={() => void run(bridge.recoverGuide!)}>Open native guide for other channels</button><small>Opening Live changes the original view.</small></>}
      {sharedTargetReason && <small className="guide-status">{sharedTargetReason.replace('This listing', 'These listings').replace('Saved listing.', 'Saved listings.').replace('Upcoming program.', 'Upcoming programs.').replace('Listing out of date.', 'Listings out of date.')}</small>}
      <div className="results">{(sports ? sportsRows.map(r => ({ entry: r.entry, title: r.program.title, playable: listingPlayable(r) })) : rows.map(entry => ({ entry, title: entry.programTitle, playable: freshLiveTarget(entry) }))).map((r, i) => <article key={`${r.entry.channel.id}-${i}`}><strong>{r.entry.channel.name}</strong><small>{r.title}</small>{!r.playable && !sharedTargetReason && <small>{targetReason(r.entry) || 'Program unavailable.'}</small>}<button disabled={busy || !hasMain || !r.playable || (picker === 'add' && !canAddManagedFeed((state?.panes.length ?? 0) + (state?.pendingFeedCreations ?? 0)))} onClick={() => void run(async () => {
        const result = sports ? await (picker === 'add' ? bridge.addProgram!(r.entry.channel.id, r.title!, r.entry.observedAt) : command({ type: 'REPLACE_PROGRAM', paneId: picker, channelId: r.entry.channel.id, title: r.title!, observedAt: r.entry.observedAt })) : await (picker === 'add' ? bridge.createPane(r.entry.channel.id) : bridge.replacePane(picker, r.entry.channel.id));
        if (result.ok) setPicker(null); return result;
      })}>Choose {r.entry.channel.name}</button></article>)}{!(sports ? sportsRows.length : rows.length) && <p>No available matches yet. Try another search or wait for channels to update.</p>}</div>
    </section>}
    <section aria-label="Window controls" className="window-cards">{state?.panes.map(p => <article key={p.id} aria-label={feedLabel(p)} className={picker === p.id ? 'selected' : ''}>
      <div className="card-heading"><div><strong>{feedLabel(p)}</strong><small className="player-state">{p.playbackState ? p.playbackState[0].toUpperCase() + p.playbackState.slice(1) : 'Unavailable'} · {p.muted === true ? 'Muted' : p.muted === false ? 'Audio enabled' : 'Audio unknown'}</small></div>
        {p.isMain || p.id === 'main' ? <button className="quiet" disabled={busy || !state?.workspace?.enrolled} onClick={() => void run(() => command({ type: 'RETURN_MAIN' }))}>Return original</button> : <button className="quiet" aria-label={`Remove ${feedLabel(p)}`} disabled={busy} onClick={() => void run(() => bridge.removePane!(p.id))}>Remove</button>}
      </div>
      {p.error && <p className="card-error" role="alert">{p.error}</p>}
      <div className={`control-strip ${p.playbackState !== 'playing' && p.playbackState !== 'paused' ? 'unknown' : ''}`}><div className="actions playback-actions">
        {p.playbackState === 'playing' ? <button aria-label={`Pause ${feedLabel(p)}`} disabled={busy || !bridge.setPlayback} onClick={() => void run(() => bridge.setPlayback!(p.id, false))}>Pause</button> : <button aria-label={`Play ${feedLabel(p)}`} disabled={busy || !bridge.setPlayback} onClick={() => void run(() => bridge.setPlayback!(p.id, true))}>Play</button>}
        {p.playbackState !== 'playing' && p.playbackState !== 'paused' && <button aria-label={`Pause ${feedLabel(p)}`} disabled={busy || !bridge.setPlayback} onClick={() => void run(() => bridge.setPlayback!(p.id, false))}>Pause</button>}
        <button aria-label={`${p.muted === false ? 'Mute' : 'Enable audio for'} ${feedLabel(p)}`} disabled={busy || !bridge.setPaneAudio} onClick={() => void run(() => bridge.setPaneAudio!(p.id, { muted: p.muted === false }))}>{p.muted === false ? 'Mute' : 'Enable audio'}</button>
      </div>
      <label className="card-volume"><span>{p.volume == null ? 'Unknown' : `${Math.round(p.volume * 100)}%`}</span><input aria-label={`Volume ${feedLabel(p)}`} type="range" min="0" max="100" value={Math.round((p.volume ?? 0) * 100)} disabled={busy || !bridge.setPaneAudio || p.volume == null} onChange={e => void run(() => bridge.setPaneAudio!(p.id, { volume: Number(e.target.value) / 100 }))} /></label></div>
      {(!bridge.setPlayback || !bridge.setPaneAudio) && <small>Remote controls unavailable. Use this player's native controls.</small>}
      <div className="actions secondary"><button aria-label={`Change channel for ${feedLabel(p)}`} aria-expanded={picker === p.id} aria-controls="content-picker" disabled={busy} onClick={e => void openPicker(p.id, e.currentTarget)}>Channel</button><button disabled={busy} onClick={() => void run(() => bridge.focusPane!(p.id))}>Focus</button>{state?.expandedPaneId === p.id ? <button disabled={busy} onClick={() => void run(bridge.restoreLayout)}>Restore</button> : <button disabled={busy} onClick={() => void run(() => bridge.expandPane(p.id))}>Expand</button>}{p.id === 'main' && state?.preferences.previousChannel && <button disabled={busy} onClick={() => void run(bridge.previousChannel)}>Previous</button>}</div>
    </article>)}</section>
    <details><summary>Settings &amp; layout</summary><section aria-label="TV workspace"><h2>{state?.workspace?.enrolled ? 'Workspace ready' : 'Set up your TV workspace'}</h2>{!state?.workspace?.enrolled && <small>Add arranges in your saved TV area automatically. Choose TV area here to change placement.</small>}<div className="actions"><button disabled={busy || state?.workspace?.enrolled || !state?.workspace?.intent || !state?.panes.some(p => p.id === 'main')} onClick={() => void run(() => command({ type: 'START_WORKSPACE' }))}>Start TV workspace</button></div>
      <div className="actions"><button ref={areaButtonRef} disabled={busy} onClick={() => void openArea()}>TV area</button><button disabled={busy || !hasMain || !state?.workspace?.enrolled} onClick={() => void run(() => command({ type: 'ARRANGE' }))}>Arrange now</button><button disabled={busy || !state?.workspace?.expanded} onClick={() => void run(bridge.restoreLayout)}>Restore</button></div>
      <label>Layout<select aria-label="Layout" disabled={busy} value={currentMode} onChange={e => void openArea(true, e.target.value as LayoutMode)}>{LAYOUT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><input type="checkbox" disabled={busy || !state?.workspace?.intent} checked={state?.workspace?.intent?.autoArrange ?? false} onChange={e => void run(() => command({ type: 'AUTO_ARRANGE', enabled: e.target.checked }))} /> Auto arrange on Add/Close</label>
      <small>{state?.workspace?.notice}</small>
    </section>
    <details><summary>Controls help</summary><p>Enable audio mutes the other windows. Changing volume keeps the current mute setting.</p><p>Return original restores its tab to the previous window when available, or to a normal window if it closed. The player stays in the remote.</p></details>
    <details><summary>Connection</summary><small>Version {typeof __YTTV_VERSION__ === 'string' ? __YTTV_VERSION__ : 'source'} · Build {typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source'}</small><p>Reconnect controls to the existing original tab without refreshing playback. Requests optional script-injection access on this action only.</p><button disabled={busy} onClick={() => void run(async () => { if (!await chrome.permissions.request({ permissions: ['scripting'] })) return { ok: false, reason: 'Reconnect access denied. Use native player controls.' }; return command({ type: 'RECONNECT_MAIN' }); })}>Reconnect original player</button></details>
</details>
    {areaOpen && work && area && <div className="area-backdrop"><section ref={areaRef} role="dialog" aria-modal="true" aria-label="TV area editor"><div className="area-heading"><h2>{layoutSetup ? 'Set up your shows' : 'Choose your TV area'}</h2><button className="quiet" onClick={() => { setAreaOpen(false); (areaTrigger.current ?? areaButtonRef.current)?.focus(); }}>Cancel</button></div>{layoutSetup ? <><h3 className="setup-step">1. Choose your layout</h3><div className="numeric"><label>Shows<select aria-label="Number of shows" value={layoutCount} onChange={e => setLayoutCount(Number(e.target.value))}>{MANAGED_FEED_COUNTS.map(count => <option key={count} value={count}>{count}</option>)}</select></label><label>Layout<select aria-label="Show layout" value={layoutMode} onChange={e => setLayoutMode(e.target.value as LayoutMode)}>{LAYOUT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><small>This plans their positions. Use New show to add shows.</small><h3 className="setup-step">2. Choose your monitor</h3></> : <p>Choose a screen or draw a smaller area. Apply saves it; Apply and start also arranges your windows.</p>}<div className="actions">{!layoutSetup && <button onClick={() => { const fallback = thisScreen(window.screen); setMonitors([fallback]); setMonitorIndex(0); setArea(fallback.workArea); }}>This screen</button>}<button onClick={() => void monitorsClick()}>Choose monitor</button></div>{(!layoutSetup || !monitors[monitorIndex].id) && <small>{layoutSetup ? 'Allow access when Chrome asks, then pick your monitor below.' : 'Choose monitor lets Chrome show your connected screens.'}</small>}
      <label>Monitor<select value={monitorIndex} onChange={e => { const index = Number(e.target.value); setMonitorIndex(index); setArea(layoutSetup ? { ...monitors[index].workArea, width: 0, height: 0 } : monitors[index].workArea); }}>{monitors.map((m, i) => <option key={m.id ?? i} value={i}>{m.name}</option>)}</select></label>
      {monitors.length > 1 && <div className="monitor-map" aria-label="Proportional monitor map">{monitors.map((m, i) => {
        const left = Math.min(...monitors.map(d => d.workArea.left)), top = Math.min(...monitors.map(d => d.workArea.top));
        const width = Math.max(...monitors.map(d => d.workArea.left + d.workArea.width)) - left, height = Math.max(...monitors.map(d => d.workArea.top + d.workArea.height)) - top;
        return <button key={i} className="monitor" style={{ left: `${100 * (m.workArea.left - left) / width}%`, top: `${100 * (m.workArea.top - top) / height}%`, width: `${100 * m.workArea.width / width}%`, height: `${100 * m.workArea.height / height}%` }} onClick={() => { setMonitorIndex(i); setArea(layoutSetup ? { ...m.workArea, width: 0, height: 0 } : m.workArea); }}>{m.name}</button>;
      })}</div>}
      {layoutSetup && <><h3 className="setup-step">3. Draw and save</h3><button className="primary" disabled={busy || !monitors[monitorIndex].id} onClick={() => void run(drawOnMonitor)}>Draw on monitor</button><p id="pair-area-help">Draw at full size on that monitor. Choose a preset area or a separate box for each show.</p></>}
      {(!layoutSetup || editorMode !== 'custom') && <details className="mini-area-editor" open={layoutSetup ? undefined : true}><summary>Use small preview instead</summary>
      <div className="area-map" style={{ aspectRatio: `${work.width} / ${work.height}` }} aria-label="Draw TV rectangle" aria-describedby={layoutSetup ? 'pair-area-help' : undefined} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); if (editorMode === 'custom') return; setDrag(mapPoint(work, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect())); }} onPointerMove={e => { if (!drag || editorMode === 'custom') return; const end = mapPoint(work, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect()); setArea({ left: Math.min(drag.x, end.x), top: Math.min(drag.y, end.y), width: Math.abs(end.x - drag.x), height: Math.abs(end.y - drag.y) }); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <div className="area-selection" style={{ left: `${100 * (area.left - work.left) / work.width}%`, top: `${100 * (area.top - work.top) / work.height}%`, width: `${100 * area.width / work.width}%`, height: `${100 * area.height / work.height}%` }} />
        <SlotPreview work={work} area={area} mode={editorMode} count={editorCount} slots={customSlots} />
      </div>
      {editorMode !== 'custom' && <details><summary>Fine-tune position</summary><div className="numeric">{(['left', 'top', 'width', 'height'] as const).map(key => <label key={key}>{key}<input type="number" step="1" value={area[key]} onChange={e => setArea({ ...area, [key]: Number(e.target.value) })} /></label>)}</div></details>}
      {layoutSetup ? <small role="status">{!validRect(area) ? 'Draw a spot to see the preview.' : !contains(work, area) ? 'Keep the spot inside the selected monitor.' : editorMode === 'custom' && !customSlots ? 'Use Draw on monitor to place each show.' : !preview?.ok ? 'Make the spot bigger or choose another layout.' : 'Your shows will fit like this.'}</small> : <small>{preview?.ok ? `${preview.description}; ${preview.bounds.map(r => `${r.width} × ${r.height}`).join(', ')}` : preview?.reason}</small>}
      <div className="actions area-footer"><button disabled={busy} onClick={() => setArea(work)}>Use whole screen</button><button className={layoutSetup ? 'primary' : undefined} disabled={busy || (layoutSetup && editorMode !== 'auto' && !monitors[monitorIndex].id) || (layoutSetup && editorMode === 'custom' && !customSlots) || !preview?.ok || !validRect(area) || !contains(work, area)} onClick={() => void run(() => applyArea(false))}>{layoutSetup ? 'Save layout' : 'Apply'}</button>{!layoutSetup && !state?.workspace?.enrolled && <button className="primary" disabled={busy || !hasMain || !preview?.ok || !validRect(area) || !contains(work, area)} onClick={() => void run(() => applyArea(true))}>Apply and start workspace</button>}</div>
      </details>}
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
