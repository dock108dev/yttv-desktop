import { Icon, SearchBox, QuickChannel, EmptyInline, EmptyState, SportsCard, ManagedPane, channelMark, entryPlayable, audioLayers, type IconName } from './components';
import { canAddManagedFeed } from '../../quadbox/src/policy';
import { freshGuideObservation } from '../../yttv-adapter/src/index';
import { sportsListings, listingPlayable } from '../../sports-engine/src/guide';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GuideEntry } from '../../core/src/index';
import { defaultPreferences, orderGuide, DEFAULT_KEYBOARD_MAPPINGS, KEYBOARD_LABELS, normalizeKeyboardKey, validateKeyboardMappings, type KeyboardAction } from '../../storage/src/index';
import { createIllustrativeFixtures, searchEvents } from '../../sports-engine/src/index';
import type { ActionResult, ClientBridge, DesktopOptions, DesktopSnapshot } from './types';
import './styles.css';

export type { ActionResult, ClientBridge, DesktopOptions, DesktopSnapshot, UIManagedPane } from './types';

type Surface = 'WATCH' | 'GUIDE' | 'SPORTS' | 'QUADBOX';
type GuideFilter = 'all' | 'favorites' | 'recent';
const BUILD_ID = typeof __YTTV_BUILD__ === 'undefined' ? 'development' : __YTTV_BUILD__;
const BUILD_VERSION = typeof __YTTV_VERSION__ === 'undefined' ? 'development' : __YTTV_VERSION__;
function initialSnapshot(): DesktopSnapshot {
  return { mode: 'extension', connection: 'waiting', playback: { playing: null, muted: null }, guide: [], preferences: defaultPreferences(), panes: [], capabilities: { navigation: false, guide: false, managedWindows: false, audio: false } };
}

function useDesktopSnapshot(bridge: ClientBridge) {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>(initialSnapshot);
  const live = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await bridge.getSnapshot();
      if (live.current) setSnapshot(next);
    } catch {
      if (live.current) setSnapshot(previous => ({ ...previous, connection: 'unavailable', statusMessage: 'The browser bridge is unavailable. Your YouTube TV player remains separate.' }));
    }
  }, [bridge]);
  useEffect(() => {
    live.current = true;
    void refresh();
    const unsubscribe = bridge.subscribe(() => { void refresh(); });
    return () => { live.current = false; unsubscribe(); };
  }, [bridge, refresh]);
  return [snapshot, refresh] as const;
}

const surfaceItems: { id: Surface; label: string; icon: IconName; action: KeyboardAction }[] = [
  { id: 'WATCH', label: 'Watch', icon: 'watch', action: 'watch' },
  { id: 'GUIDE', label: 'Guide', icon: 'guide', action: 'guide' },
  { id: 'SPORTS', label: 'Sports', icon: 'sports', action: 'sports' },
  { id: 'QUADBOX', label: 'QuadBox', icon: 'quad', action: 'quadbox' },
];

function editableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], video, audio'));
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function DesktopApp({ bridge, options = {} }: { bridge: ClientBridge; options?: DesktopOptions }) {
  const [snapshot, refresh] = useDesktopSnapshot(bridge);
  const [surface, setSurface] = useState<Surface>('GUIDE');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuideFilter>('all');
  const [manageGuide, setManageGuide] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [replacePaneId, setReplacePaneId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutDraft, setShortcutDraft] = useState({ ...DEFAULT_KEYBOARD_MAPPINGS });
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [focusedChannel, setFocusedChannel] = useState<string | null>(null);
  const mappings = snapshot.preferences.keyboardMappings;
  const keyLabel = (action: KeyboardAction) => mappings[action] || 'Off';
  const openShortcuts = () => { setShortcutDraft({ ...mappings }); setShortcutError(null); setShowShortcuts(true); };
  const [sportsLeague, setSportsLeague] = useState('ALL');
  const [selectedFixtures, setSelectedFixtures] = useState<string[]>([]);
  const [clock, setClock] = useState(Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLElement>(null);
  const initializedSurface = useRef(false);
  const demo = options.demo || snapshot.mode === 'demo';
  const [fixtureLab, setFixtureLab] = useState(false);
  const usingFixtures = Boolean(demo || fixtureLab);
  const [fixtures, setFixtures] = useState(() => demo ? createIllustrativeFixtures(Date.now()) : []);
  const savedEntry = (id: string): GuideEntry => snapshot.guide.find(entry => entry.channel.id === id) ?? { channel: { id, name: `Saved channel (${id.replace(/^yttv:/, '')})` }, available: false, target: null, observedAt: '', evidenceClass: 'LIVE', metadataSource: 'CACHED' };
  const currentEntry = snapshot.currentChannelId ? savedEntry(snapshot.currentChannelId) : undefined;
  const audioSource = snapshot.panes.find(p => p.id === (snapshot.activePaneId ?? 'main'));
  const audio = audioSource ?? snapshot.playback;
  const previousEntry = snapshot.preferences.previousChannel ? savedEntry(snapshot.preferences.previousChannel) : undefined;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initializedSurface.current || snapshot.connection === 'waiting') return;
    initializedSurface.current = true;
    setSurface(snapshot.preferences.ui.lastSurface || 'GUIDE');
  }, [snapshot.connection, snapshot.preferences.ui.lastSurface]);

  const run = useCallback(async (label: string, action: (() => Promise<ActionResult>) | undefined) => {
    if (!action || pending) return;
    setPending(label);
    try {
      const result = await action();
      if (!result.ok) setNotice({ kind: 'error', text: result.reason || result.message || `${label} is unavailable in the current browser session.` });
      else if (result.message) setNotice({ kind: 'success', text: result.message });
      await refresh();
    } catch {
      setNotice({ kind: 'error', text: `${label} could not be completed. The original YouTube TV player remains available.` });
    } finally { setPending(''); }
  }, [pending, refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!showShortcuts || !shortcutsRef.current) return;
    const modal = shortcutsRef.current;
    const root = modal.getRootNode();
    const previousFocus = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    const focusable = () => Array.from(modal.querySelectorAll<HTMLButtonElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    modal.addEventListener('keydown', trapFocus);
    return () => { modal.removeEventListener('keydown', trapFocus); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [showShortcuts]);

  const goSurface = useCallback((next: Surface) => {
    // A deliberate user navigation takes precedence over a late initial preference load.
    initializedSurface.current = true;
    setSurface(next);
    setQuery('');
    if (next !== 'GUIDE') setReplacePaneId(null);
    void run('Save view', () => bridge.setPreference({ ui: { ...snapshot.preferences.ui, lastSurface: next } }));
  }, [bridge, run, snapshot.preferences.ui]);


  const guideEntries = useMemo(() => {
    let entries = orderGuide(snapshot.guide, snapshot.preferences, { query, includeHidden });
    if (filter === 'favorites') entries = entries.filter(entry => snapshot.preferences.favorites.includes(entry.channel.id));
    if (filter === 'recent') {
      entries = entries.filter(entry => snapshot.preferences.recentChannels.includes(entry.channel.id));
      entries.sort((a, b) => snapshot.preferences.recentChannels.indexOf(a.channel.id) - snapshot.preferences.recentChannels.indexOf(b.channel.id));
    }
    return entries;
  }, [snapshot.guide, snapshot.preferences, query, includeHidden, filter]);

  const setList = (key: 'favorites' | 'hiddenChannels', channelId: string) => {
    const previous = snapshot.preferences[key];
    const next = previous.includes(channelId) ? previous.filter(id => id !== channelId) : [...previous, channelId];
    void run('Save channel preferences', () => bridge.setPreference({ [key]: next }));
  };

  const moveChannel = (channelId: string, direction: -1 | 1) => {
    const ids = guideEntries.map(entry => entry.channel.id);
    const index = ids.indexOf(channelId);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= ids.length) return;
    // Favorites remain pinned above the rest of the guide; order within either group is custom.
    if (snapshot.preferences.favorites.includes(ids[index]) !== snapshot.preferences.favorites.includes(ids[other])) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    const remaining = snapshot.guide.map(entry => entry.channel.id).filter(id => !ids.includes(id));
    void run('Save channel order', () => bridge.setPreference({ channelOrder: [...ids, ...remaining] }));
  };

  const canMoveChannel = (index: number, direction: -1 | 1) => {
    const current = guideEntries[index];
    const neighbor = guideEntries[index + direction];
    return Boolean(current && neighbor && snapshot.preferences.favorites.includes(current.channel.id) === snapshot.preferences.favorites.includes(neighbor.channel.id));
  };

  const toggleGuideManagement = () => {
    setManageGuide(value => !value);
    setIncludeHidden(false);
    setFilter('all');
    setQuery('');
  };

  const watchEntry = (entry: GuideEntry) => {
    if (!entryPlayable(entry, snapshot)) return;
    if (replacePaneId) {
      const paneId = replacePaneId;
      setReplacePaneId(null);
      setSurface('QUADBOX');
      void run('Replace window', () => bridge.replacePane(paneId, entry.channel.id));
    } else void run(`Watch ${entry.channel.name}`, () => bridge.navigateChannel(entry.channel.id));
  };

  const addEntry = (entry: GuideEntry) => {
    if (!entryPlayable(entry, snapshot) || !snapshot.capabilities.managedWindows) return;
    setSurface('QUADBOX');
    void run('Add managed window', () => bridge.createPane(entry.channel.id));
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const path = event.composedPath();
      const app = appRef.current;
      if (!app || !path.includes(app) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      // Modal dismissal stays reachable even when the saved restore binding is disabled.
      if (showShortcuts) {
        if (event.key === 'Escape') { event.preventDefault(); setShowShortcuts(false); }
        return;
      }
      if (event.repeat || path.some(editableTarget) || path.some(target => target instanceof Element && Boolean(target.closest('button, a, summary, [role="button"], [role="slider"], [role="checkbox"], [role="combobox"], [role="menuitem"]')))) return;
      const key = normalizeKeyboardKey(event.key);
      const action = (Object.keys(mappings) as KeyboardAction[]).find(item => key && mappings[item] === key);
      if (!action) return;
      const handled = () => { event.preventDefault(); event.stopPropagation(); };
      if (action === 'restore') {
        if (replacePaneId) setReplacePaneId(null);
        else if (snapshot.expandedPaneId) void run('Restore windows', () => bridge.restoreLayout());
        else if (query) setQuery('');
        else return;
        handled(); return;
      }
      if (action === 'search' && (surface === 'GUIDE' || surface === 'SPORTS')) { handled(); searchRef.current?.focus(); return; }
      if (action === 'help') { handled(); openShortcuts(); return; }
      const requested = surfaceItems.find(item => item.action === action);
      if (requested) { handled(); goSurface(requested.id); return; }
      if (action === 'previous' && previousEntry && entryPlayable(previousEntry, snapshot)) { handled(); void run('Previous channel', () => bridge.previousChannel()); }
      if (action === 'mute' && bridge.mute) { handled(); void run('Mute all playback', () => bridge.mute!()); }
      if (surface === 'QUADBOX' && /^pane[1-4]$/.test(action)) {
        const pane = snapshot.panes[Number(action.slice(-1)) - 1];
        if (pane) { handled(); void run('Focus window', () => (bridge.focusPane ?? bridge.selectPane)(pane.id)); }
      }
      if (surface === 'QUADBOX' && action === 'expand' && snapshot.activePaneId) { handled(); void run('Expand window', () => bridge.expandPane(snapshot.activePaneId!)); }
      if (surface !== 'GUIDE') return;
      const rows = Array.from(app.querySelectorAll<HTMLElement>('.guide-row'));
      const row = path.find(target => target instanceof HTMLElement && target.classList.contains('guide-row')) as HTMLElement | undefined;
      const index = row ? rows.indexOf(row) : -1;
      if ((action === 'up' || action === 'down') && rows.length) {
        handled();
        const next = rows[index < 0 ? (action === 'up' ? rows.length - 1 : 0) : Math.max(0, Math.min(rows.length - 1, index + (action === 'up' ? -1 : 1)))];
        next.focus(); next.scrollIntoView?.({ block: 'nearest' });
      }
      if (row && (action === 'left' || action === 'right')) {
        const controls = Array.from(row.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
        const control = action === 'left' ? controls[0] : controls.at(-1);
        if (control) { handled(); control.focus(); }
      }
      if (row && action === 'expand' && !manageGuide) {
        const entry = guideEntries[index];
        if (entry && entryPlayable(entry, snapshot) && !pending) { handled(); watchEntry(entry); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bridge, goSurface, query, replacePaneId, run, showShortcuts, snapshot, surface, guideEntries, manageGuide, pending]);

  const saveShortcuts = async () => {
    const error = validateKeyboardMappings(shortcutDraft);
    if (error) { setShortcutError(error); return; }
    setShortcutError(null);
    await run('Save keyboard shortcuts', () => bridge.setPreference({ keyboardMappings: shortcutDraft }));
  };

  const visibleSports = searchEvents(fixtures, query, { now: clock }).filter(event => sportsLeague === 'ALL' || event.league === sportsLeague);
  const guideSports = sportsListings(orderGuide(snapshot.guide, snapshot.preferences));
  const visibleGuideSports = sportsListings(orderGuide(snapshot.guide, snapshot.preferences), query, sportsLeague);
  const competitions = ['ALL', ...new Set(guideSports.map(item => item.competition))];
  const leagues = ['ALL', 'MLB', 'NFL', 'NCAA_FOOTBALL', 'NBA', 'NHL'];
  const presentationEntry = savedEntry;
  const favorites = orderGuide([...snapshot.guide, ...snapshot.preferences.favorites.filter(id => !snapshot.guide.some(entry => entry.channel.id === id)).map(presentationEntry)], snapshot.preferences).filter(entry => snapshot.preferences.favorites.includes(entry.channel.id));
  const recents = snapshot.preferences.recentChannels.map(presentationEntry);



  return <div className="desktop-app" ref={appRef} tabIndex={0} aria-label="Desktop workspace">
    <aside className="rail" aria-label="Main navigation">
      <button className="brand" onClick={() => goSurface('WATCH')} aria-label="Desktop TV home"><span className="brand-mark">dtv<span>.</span></span><span className="brand-caption">DESKTOP TV</span></button>
      <nav>{surfaceItems.map(item => <button key={item.id} className={`nav-item ${surface === item.id ? 'selected' : ''}`} onClick={() => goSurface(item.id)} aria-current={surface === item.id ? 'page' : undefined} title={`${item.label} (${keyLabel(item.action)})`}><Icon name={item.icon} size={21}/><span>{item.label}</span></button>)}</nav>
      <div className="rail-bottom"><button className="nav-item" aria-label="Keyboard shortcuts" onClick={openShortcuts} title={`Keyboard shortcuts (${keyLabel('help')})`}><span className="keycap">{keyLabel('help')}</span><span>Shortcuts</span></button><span className="rail-version">LOCAL BETA · v{BUILD_VERSION}</span></div>
    </aside>

    <div className="workspace">
      {demo && <div className="preview-banner"><span className="fixture-badge">LOCAL PREVIEW</span><span>Fixture channels and sample sports. No authentication, live scores or video playback in this preview.</span></div>}
      <header className="topbar"><div className={`connection ${snapshot.connection}`}><span className="status-dot"/><span>{demo ? 'Preview workspace' : snapshot.connection === 'connected' ? 'YouTube TV connected' : snapshot.connection === 'waiting' ? 'Waiting for YouTube TV' : 'YouTube TV connection unavailable'}</span></div><div className="topbar-actions">{bridge.openRemote && <button className="button compact" onClick={() => void run('Open remote', () => bridge.openRemote!())}>Open remote</button>}<button className="button compact" disabled={!bridge.mute || Boolean(pending)} onClick={() => void run('Mute all', () => bridge.mute!())}><Icon name="mute"/> Mute all</button><button className="button compact" disabled={!bridge.focusOriginal || Boolean(pending)} onClick={() => void run('Original player', () => bridge.focusOriginal!())}>Original player <Icon name="external" size={14}/></button></div></header>
      <main className={`main-content surface-${surface.toLowerCase()}`}>
        <div className="page-heading"><div><h1>{surfaceItems.find(item => item.id === surface)?.label}</h1></div><div className="heading-actions">{surface === 'SPORTS' && <button className="button subtle" onClick={() => { if (usingFixtures) { const now = Date.now(); setFixtures(createIllustrativeFixtures(now)); setClock(now); } else void run('Refresh guide', bridge.recoverGuide); }}><Icon name="refresh"/> {usingFixtures ? 'Refresh fixtures' : 'Refresh guide'}</button>}{surface === 'GUIDE' && <button className={`button subtle ${manageGuide ? 'active' : ''}`} onClick={toggleGuideManagement} aria-pressed={manageGuide}><Icon name="settings"/> {manageGuide ? 'Done editing' : 'Customize'}</button>}{surface === 'QUADBOX' && snapshot.expandedPaneId && <button className="button" onClick={() => void run('Restore windows', () => bridge.restoreLayout())}><Icon name="restore"/> Restore layout <kbd>{keyLabel('restore')}</kbd></button>}{surface === 'QUADBOX' && <button className="button primary" onClick={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} disabled={!snapshot.capabilities.managedWindows || !canAddManagedFeed(snapshot.panes.length + (snapshot.pendingFeedCreations ?? 0))}><Icon name="plus"/> Add channel</button>}</div></div>
        <section className="audio-controls" aria-label="Playback audio">
          <div className="audio-summary"><strong>{audioSource?.channelName ?? 'Original player'}</strong><span>{audio.muted === true ? 'Muted' : audio.muted === false ? 'Audio enabled' : 'Audio status unknown'} · {audio.volume === null || audio.volume === undefined ? 'Volume unknown' : `Volume ${Math.round(audio.volume * 100)}%`}</span></div>
          <div><button className="button compact" disabled={!bridge.setAudio || !snapshot.capabilities.audio || Boolean(pending)} onClick={() => void run('Player audio', () => bridge.setAudio!({ muted: audio.muted === false }))}>{audio.muted === false ? 'Mute selected' : 'Enable selected audio'}</button>
          <label>Volume <input aria-label="Selected player volume" type="range" min="0" max="100" value={Math.round((audio.volume ?? 0) * 100)} disabled={!bridge.setAudio || audio.volume === null || audio.volume === undefined || Boolean(pending)} onChange={event => void run('Player volume', () => bridge.setAudio!({ volume: Number(event.target.value) / 100 }))}/></label></div>
          <details className="secondary-details"><summary>Audio details</summary><p>No sound? Check the original player and your speakers.</p><p>{audioLayers(audio)} · {audio.volume === null || audio.volume === undefined ? 'Volume unknown' : `Volume ${Math.round(audio.volume * 100)}%`}</p><p>Player and tab settings are shown here; audible sound requires listening. Site mute and system output may differ.</p></details>
          {snapshot.audioError && <p role="alert">{snapshot.audioError}</p>}
        </section>

        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><Icon name={notice.kind === 'error' ? 'window' : 'check'}/><span>{notice.text}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={15}/></button></div>}
        {pending && <div className="operation-status" role="status"><span className="loading-dot"/>{pending}…</div>}
        {!demo && !snapshot.capabilities.navigation && <div className="connection-help" role="status"><div><strong>Refresh the guide to watch or add a channel.</strong><p>Saved listings are not current. Opening Live may replace the paused program in this tab.</p></div>{bridge.recoverGuide && <button className="button subtle" onClick={() => void run('Open YouTube TV Live', () => bridge.recoverGuide!())}>Open YouTube TV Live</button>}</div>}
        {snapshot.preferencePersistence === 'unavailable' && <p role="alert">Local settings could not be saved or read. Existing stored values are preserved; retry settings when storage is available.</p>}
        {!demo && snapshot.connection !== 'connected' && <div className="connection-help"><Icon name="window" size={20}/><div><strong>{snapshot.statusMessage || 'Open YouTube TV in Chrome to connect the guide.'}</strong><p>Keep its original player open. Channel observations and controls appear when the supported adapter is available.</p></div><button className="button subtle" onClick={() => void run('Refresh connection', bridge.refresh ? () => bridge.refresh!() : async () => { await refresh(); return { ok: true }; })}><Icon name="refresh"/> Refresh</button></div>}

        {surface === 'WATCH' && <>
          <section className="watch-context"><div className="watch-gradient"/><div className="watch-context-copy"><span className="section-kicker"><span className="status-dot"/>{snapshot.currentConfirmed ? 'Playback confirmed' : snapshot.currentChannelId ? 'Last confirmed channel · saved' : 'Current player'}</span><h2>{(snapshot.currentConfirmed ? snapshot.currentProgram : undefined) || (currentEntry?.programTitle ? `Last observed · ${currentEntry.programTitle}` : undefined) || 'Choose a channel to watch.'}</h2><div className="watch-channel"><span className="channel-logo large">{currentEntry ? channelMark(currentEntry.channel.name) : 'TV'}</span><div><strong>{currentEntry?.channel.name || 'Authorized YouTube TV playback'}</strong><span>{demo ? 'Local preview · no video playback' : snapshot.currentConfirmed ? 'Playing in your YouTube TV tab' : 'Saved history · current channel not confirmed'}</span></div><span className="muted-tag"><Icon name="mute" size={15}/> {audioLayers(snapshot.playback)}</span></div><div className="watch-actions"><button className="button primary" onClick={() => goSurface('GUIDE')}><Icon name="guide"/> Open guide <kbd>{keyLabel('guide')}</kbd></button><button className="button" disabled={!snapshot.preferences.previousChannel || !snapshot.guide.some(entry => entry.channel.id === snapshot.preferences.previousChannel && entryPlayable(entry, snapshot)) || Boolean(pending)} onClick={() => void run('Previous channel', () => bridge.previousChannel())}><Icon name="back"/> Previous <kbd>{keyLabel('previous')}</kbd></button></div></div><div className="player-preserved"><Icon name="window" size={32}/><strong>Video stays in YouTube TV</strong><p>Use the original player for video and account controls.</p><button className="text-button" disabled={!bridge.focusOriginal} onClick={() => void run('Original player', () => bridge.focusOriginal!())}>Open original player <Icon name="external" size={14}/></button></div></section>
          <div className="watch-columns"><section className="content-card"><div className="section-title"><h2>Favorites <span>{favorites.length}</span></h2><button className="text-button" onClick={() => { goSurface('GUIDE'); setFilter('favorites'); }}>View guide <Icon name="arrow" size={15}/></button></div>{favorites.length ? <div className="quick-channels">{favorites.slice(0, 8).map(entry => <QuickChannel key={entry.channel.id} entry={entry} snapshot={snapshot} onWatch={watchEntry}/>)}</div> : <EmptyInline icon="star" title="Keep your channels close" text="Star a channel in the guide to pin it here." action={() => goSurface('GUIDE')} actionLabel="Choose favorites"/>}</section><section className="content-card"><div className="section-title"><h2>Recently watched</h2><span className="quiet-label">After successful switches</span></div>{recents.length ? <div className="recent-list">{recents.slice(0, 5).map(entry => <QuickChannel key={entry.channel.id} entry={entry} snapshot={snapshot} onWatch={watchEntry}/>)}</div> : <EmptyInline icon="back" title="Pick up where you left off" text="Channels appear here after a successful switch."/>}</section></div>
          {previousEntry && <div className="previous-strip"><Icon name="back"/><span>Previous channel</span><strong>{previousEntry.channel.name}</strong><span>{previousEntry.programTitle ? `Last observed · ${previousEntry.programTitle}` : 'Saved history'}</span><button className="text-button" disabled={!previousEntry || !entryPlayable(previousEntry, snapshot)} onClick={() => void run('Previous channel', () => bridge.previousChannel())}>Go back <kbd>{keyLabel('previous')}</kbd></button></div>}
        </>}

        {surface === 'GUIDE' && <>
          {replacePaneId && <div className="replace-banner"><Icon name="refresh"/><span>Choose a channel to replace window {snapshot.panes.findIndex(pane => pane.id === replacePaneId) + 1}. Other windows stay in place.</span><button className="text-button" onClick={() => setReplacePaneId(null)}>Cancel</button></div>}
          <div className="guide-toolbar"><div className="segmented" aria-label="Channel filter">{(['all', 'favorites', 'recent'] as const).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{value === 'all' ? 'All channels' : value === 'favorites' ? 'Favorites' : 'Recents'}{value === 'favorites' && <span>{snapshot.preferences.favorites.length}</span>}</button>)}</div><SearchBox value={query} setValue={setQuery} inputRef={searchRef} placeholder="Find channel or program"/></div>
          {manageGuide && <div className="customize-help"><span>Star favorites. Move channels with the arrows. Hide channels from your everyday guide.</span><label><input type="checkbox" checked={includeHidden} onChange={event => setIncludeHidden(event.target.checked)}/> Show hidden channels</label><button className="button subtle" disabled={Boolean(pending)} onClick={() => void run('Restore native channel order', () => bridge.setPreference({ channelOrder: [] }))}>Use native order</button></div>}
          <section className="guide-table" aria-label="Compact live guide"><div className="guide-table-head"><span>Channel</span><span>{snapshot.guide.some(entry => entry.metadataSource === 'CACHED') ? 'Last observed program' : 'Program'}</span><span className="guide-time-heading">Schedule</span><span>Watch</span></div>{guideEntries.length ? guideEntries.map((entry, index) => {
            const favorite = snapshot.preferences.favorites.includes(entry.channel.id);
            const current = snapshot.currentConfirmed && snapshot.currentChannelId === entry.channel.id;
            const hidden = snapshot.preferences.hiddenChannels.includes(entry.channel.id);
            const playable = entryPlayable(entry, snapshot);
            return <div key={entry.channel.id} role="group" aria-label={`${entry.channel.name}: ${entry.programTitle || 'Program unavailable'}`} tabIndex={focusedChannel === entry.channel.id || (!guideEntries.some(item => item.channel.id === focusedChannel) && index === 0) ? 0 : -1} onFocus={() => setFocusedChannel(entry.channel.id)} className={`guide-row ${current ? 'current' : ''} ${hidden ? 'hidden-channel' : ''}`}>
              <div className="guide-channel-cell"><button className={`favorite-toggle icon-button ${favorite ? 'is-favorite' : ''}`} onClick={() => setList('favorites', entry.channel.id)} title={favorite ? `Remove ${entry.channel.name} from favorites` : `Favorite ${entry.channel.name}`} aria-label={favorite ? `Remove ${entry.channel.name} from favorites` : `Favorite ${entry.channel.name}`} aria-pressed={favorite}><Icon name="star" size={16}/></button><span className="channel-logo">{channelMark(entry.channel.name)}</span><div className="channel-name"><strong>{entry.channel.name}</strong>{current ? <span className="current-label">● CURRENT</span> : hidden ? <span>Hidden</span> : <span>{String(index + 1).padStart(2, '0')}</span>}</div></div>
              <div className="guide-program-cell"><strong>{entry.programTitle ? entry.programTitle : 'Program information unavailable'}</strong><span>{entry.metadataSource === 'CACHED' ? `Saved listing · ${formatTime(entry.observedAt) || 'time unknown'} · refresh to watch` : entry.nextProgramTitle ? `Next · ${entry.nextProgramTitle}` : entry.evidenceClass === 'FIXTURE' ? 'Sample channel · playback unavailable' : entry.available ? entry.target ? 'Ready to watch' : 'Refresh to watch' : 'Playback unavailable'}</span></div>
              <div className="guide-schedule-cell">{entry.programStart || entry.programEnd ? <><span>{formatTime(entry.programStart)}{entry.programStart && entry.programEnd ? ' – ' : ''}{formatTime(entry.programEnd)}</span><div className="schedule-track"><span style={{ width: `${scheduleProgress(entry)}%` }}/></div></> : <span className="schedule-unknown">Schedule unknown</span>}</div>
              <div className="guide-row-actions">{manageGuide ? <><button className="icon-button" aria-label={`Move ${entry.channel.name} up`} title="Move up" disabled={!canMoveChannel(index, -1)} onClick={() => moveChannel(entry.channel.id, -1)}><Icon name="up" size={16}/></button><button className="icon-button" aria-label={`Move ${entry.channel.name} down`} title="Move down" disabled={!canMoveChannel(index, 1)} onClick={() => moveChannel(entry.channel.id, 1)}><Icon name="down" size={16}/></button><button className={`icon-button ${hidden ? 'is-hidden' : ''}`} aria-label={`${hidden ? 'Show' : 'Hide'} ${entry.channel.name}`} title={hidden ? 'Show channel' : 'Hide channel'} onClick={() => setList('hiddenChannels', entry.channel.id)}><Icon name="eye" size={16}/></button></> : <><button className={`button compact ${current ? 'currently-watching' : ''}`} disabled={!playable || Boolean(pending)} onClick={() => watchEntry(entry)} title={!playable ? 'Refresh the guide to confirm this channel is available' : `Watch ${entry.channel.name}`}>{replacePaneId ? 'Replace' : current && snapshot.currentConfirmed ? 'Watching' : 'Watch'}{!current && <Icon name="arrow" size={13}/>}</button><button className="icon-button add-window" disabled={!playable || !snapshot.capabilities.managedWindows || !canAddManagedFeed(snapshot.panes.length + (snapshot.pendingFeedCreations ?? 0)) || Boolean(pending)} onClick={() => addEntry(entry)} title="Add to managed windows" aria-label={`Add ${entry.channel.name} to managed windows`}><Icon name="plus" size={17}/></button></>}</div>
            </div>;
          }) : <EmptyState icon="guide" title={query ? 'No matching channels' : filter === 'favorites' ? 'Your favorites start here' : filter === 'recent' ? 'No confirmed channel history yet' : 'Guide not loaded'} text={query ? 'Try a channel name or a word from its current program.' : filter === 'favorites' ? 'Choose All channels, then star the ones you watch most.' : filter === 'recent' ? 'Channel history updates after a confirmed successful switch.' : 'Open YouTube TV Live to load your channels.'}/>}</section>
          <div className="guide-footer"><span>{guideEntries.length} channels shown · {demo ? 'fixture data' : snapshot.guideObservedAt ? `guide observed ${new Date(snapshot.guideObservedAt).toLocaleString()}` : 'awaiting observation'}</span><span>Favorites and settings are saved on this Mac.</span></div>
        </>}

        {surface === 'SPORTS' && <>
          <div className="sports-disclosure"><div className="fixture-badge">{usingFixtures ? 'FIXTURE LAB' : 'YOUTUBE TV GUIDE'}</div><div><strong>{usingFixtures ? 'Illustrative states · separate from current coverage' : 'Find sports programs'}</strong><p>{usingFixtures ? 'All scores, teams, times and networks here are illustrative. Fixtures never open a real stream.' : 'From your guide, not live scores. A current listing does not confirm a game is in progress.'}</p></div></div>
          {!usingFixtures && <>
            <div className="sports-toolbar"><div className="league-tabs" aria-label="Competition filter">{competitions.map(value => <button key={value} className={value === sportsLeague ? 'selected' : ''} aria-pressed={value === sportsLeague} onClick={() => setSportsLeague(value)}>{value === 'ALL' ? 'All sports' : value === 'Competition unspecified' ? 'Competition unknown' : value}</button>)}</div><SearchBox value={query} setValue={setQuery} inputRef={searchRef} placeholder="Search program, team or competition"/></div>
            <div className="section-title sports-section-title"><h2>Guide programs <span>{visibleGuideSports.length}</span></h2><span className="quiet-label">Current and upcoming</span></div>
            {visibleGuideSports.length ? <div className="sports-grid">{visibleGuideSports.map(item => {
              const playable = snapshot.connection === 'connected' && snapshot.capabilities.navigation && listingPlayable(item, clock);
              const age = Math.max(0, Math.floor((clock - Date.parse(item.entry.observedAt)) / 60000));
              const stale = !freshGuideObservation(item.entry, clock);
              return <article className="sports-card" key={`${item.entry.channel.id}:${item.index}`}>
                <div className="sports-card-top"><span className="league-badge">{item.competition === 'Competition unspecified' ? 'Sports' : item.competition}</span><span>{item.program.context === 'CURRENT' ? 'Current listing' : item.program.context === 'NEXT' ? 'Next listing' : 'Upcoming listing'}</span></div>
                <h3>{item.program.title}</h3><p>{item.entry.channel.name} · {item.kind}</p>
                {item.program.detail && <p>{item.program.detail}</p>}
                <p>{item.program.scheduleText ? `Guide schedule: ${item.program.scheduleText}` : 'Guide schedule: unknown'}</p>
                <p className="listing-age">{stale ? 'Saved listing' : 'Guide updated'} {age} min ago</p><details className="secondary-details listing-details"><summary>Listing details</summary><time>{new Date(item.entry.observedAt).toLocaleString()}</time></details>
                <div className="sports-card-actions"><button className="button primary" disabled={!playable || !bridge.watchProgram || Boolean(pending)} onClick={() => void run('Watch program', () => bridge.watchProgram!(item.entry.channel.id, item.program.title, item.entry.observedAt))}>Watch</button><button className="button" disabled={!playable || !bridge.addProgram || !snapshot.capabilities.managedWindows || !canAddManagedFeed(snapshot.panes.length + (snapshot.pendingFeedCreations ?? 0)) || Boolean(pending)} onClick={() => { setSurface('QUADBOX'); void run('Add program', () => bridge.addProgram!(item.entry.channel.id, item.program.title, item.entry.observedAt)); }}>Add</button></div>
                {!playable && <p className="mapping-unavailable">{item.program.context !== 'CURRENT' ? 'Available later. Watch the current program from Guide.' : 'Refresh the guide to watch or add this program.'}</p>}
              </article>;
            })}</div> : <EmptyState icon="sports" title={!snapshot.guide.length ? 'Guide not loaded' : query || sportsLeague !== 'ALL' ? 'No matching programs' : 'No sports programs found'} text={!snapshot.guide.length ? 'Open YouTube TV Live to load your listings.' : 'Try another search or refresh the guide. Other programs are in Guide.'}/>}
            <p className="guide-footer">Guide observed: {snapshot.guideObservedAt ? new Date(snapshot.guideObservedAt).toLocaleString() : 'not loaded'}. Saved listings need a refresh before playback.</p>
          </>}
          {!demo && <details open={fixtureLab} className="secondary-details demo-tools"><summary>Demo tools</summary><button className="button subtle" aria-pressed={fixtureLab} onClick={() => { setFixtureLab(!fixtureLab); setSportsLeague('ALL'); setQuery(''); if (!fixtureLab) setFixtures(createIllustrativeFixtures(Date.now())); setSelectedFixtures([]); }}>{fixtureLab ? 'Return to guide sports' : 'Open Fixture Lab'}</button><p>Sample game states; no real playback.</p></details>}
          {usingFixtures && <>
          <div className="sports-toolbar"><div className="league-tabs" aria-label="League filter">{leagues.map(league => <button key={league} className={league === sportsLeague ? 'selected' : ''} onClick={() => setSportsLeague(league)} aria-pressed={league === sportsLeague}>{league === 'ALL' ? 'All sports' : league === 'NCAA_FOOTBALL' ? 'College football' : league}</button>)}</div><SearchBox value={query} setValue={setQuery} inputRef={searchRef} placeholder="Search team or league"/></div>
          <div className="section-title sports-section-title"><h2>Illustrative game states <span>{visibleSports.length}</span></h2><span className="quiet-label">SCHEDULE WINDOWS DO NOT DETERMINE FINALITY</span></div>
          {visibleSports.length ? <div className="sports-grid">{visibleSports.map(event => <SportsCard key={event.id} event={event} now={clock} selected={selectedFixtures.includes(event.id)} onSelect={() => setSelectedFixtures(previous => previous.includes(event.id) ? previous.filter(id => id !== event.id) : [...previous, event.id])}/>)}</div> : <EmptyState icon="sports" title="No matching fixtures" text="Search the illustrative scenarios in Fixture Lab."/>}
          </>}
          {usingFixtures && selectedFixtures.length > 0 && <div className="fixture-selection"><span><Icon name="check"/> {selectedFixtures.length} fixture scenarios selected</span><p>Fixture selection exercises identity only.</p><button className="text-button" onClick={() => setSelectedFixtures([])}>Clear</button></div>}
        </>}

        {surface === 'QUADBOX' && <>
          <div className="quad-disclosure"><Icon name="window" size={23}/><div><strong>Supported browser windows, controlled together</strong><p>Video stays in separate YouTube TV windows. Playback depends on your account and channel availability.</p></div></div>
          <div className="quad-toolbar"><span><strong>{snapshot.panes.length}</strong> controlled {snapshot.panes.length === 1 ? 'feed' : 'feeds'} <span className="divider">/</span> <Icon name="mute" size={15}/> {snapshot.audioFocusId ? 'Selected feed' : 'Check each feed’s audio'}</span><div><span className="quiet-label">{(['pane1', 'pane2', 'pane3', 'pane4'] as const).map(keyLabel).join(' / ')} Select audio · {keyLabel('expand')} Expand · {keyLabel('restore')} Restore</span></div></div>
          {snapshot.panes.length ? <div className={`quad-grid ${snapshot.panes.length === 1 ? 'single' : ''}`}>{snapshot.panes.map((pane, index) => <ManagedPane key={pane.id} pane={pane} index={index} selected={pane.id === snapshot.activePaneId} expanded={pane.id === snapshot.expandedPaneId} pending={Boolean(pending)} focusKey={keyLabel(`pane${index + 1}` as KeyboardAction)} onFocus={() => void run('Focus window', () => (bridge.focusPane ?? bridge.selectPane)(pane.id))} onExpand={() => void run('Expand window', () => bridge.expandPane(pane.id))} onReplace={() => { setReplacePaneId(pane.id); setSurface('GUIDE'); setQuery(''); setFilter('all'); }} onRemove={!pane.isMain && bridge.removePane ? () => void run('Close managed window', () => bridge.removePane!(pane.id)) : undefined}/>)}{canAddManagedFeed(snapshot.panes.length + (snapshot.pendingFeedCreations ?? 0)) && <button className="add-pane" onClick={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} disabled={!snapshot.capabilities.managedWindows || !canAddManagedFeed(snapshot.panes.length + (snapshot.pendingFeedCreations ?? 0))}><span className="add-pane-icon"><Icon name="plus" size={25}/></span><strong>Add another channel</strong><span>Only within your verified simultaneous-stream allowance</span></button>}</div> : <EmptyState icon="quad" title="Build your viewing workspace" text="Choose a channel in Guide and select Add. New windows start muted. You can control the main player and up to three added windows." action={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} actionLabel="Choose channels"/>}
          <div className="quad-footer"><span>Select audio also brings that window forward. New windows start muted.</span><span>Main player plus one added window.</span></div>
        </>}
      </main>
      <footer className="app-footer"><span>Video and account controls stay in YouTube TV.</span></footer>
    </div>

    {showShortcuts && <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}><section ref={shortcutsRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={event => event.stopPropagation()}><div className="section-title"><h2 id="shortcuts-title">Keyboard shortcuts</h2><button className="icon-button" onClick={() => setShowShortcuts(false)} aria-label="Close keyboard shortcuts"><Icon name="close"/></button></div><p>Focus the workspace or a guide row to use shortcuts. Typing, buttons, player controls and browser chords keep their own keys. Tab reaches row controls; arrows move between rows. Blank disables a binding. Escape always closes this dialog.</p><div className="shortcut-grid">{(Object.keys(KEYBOARD_LABELS) as KeyboardAction[]).map(action => <label key={action}><span>{KEYBOARD_LABELS[action]} <kbd>{keyLabel(action)}</kbd></span><input aria-label={`${KEYBOARD_LABELS[action]} key`} value={shortcutDraft[action]} maxLength={24} onChange={event => setShortcutDraft(previous => ({ ...previous, [action]: event.target.value }))}/></label>)}</div>{shortcutError && <p role="alert">{shortcutError}</p>}<div className="shortcut-night"><Icon name="mute"/> Mute all affects only the main and added feed. Selecting a feed transfers audio and focus.</div><div className="shortcut-actions"><button className="button" onClick={() => { setShortcutDraft({ ...DEFAULT_KEYBOARD_MAPPINGS }); setShortcutError(null); }}>Use defaults</button><button className="button primary" disabled={Boolean(pending)} onClick={() => void saveShortcuts()}>Save shortcuts</button></div>{snapshot.audioDiagnostics && <details><summary>Recent tab audio commands</summary><p>Last 16 extension requests only; player and site mute are separate. No playback URLs or account data.</p>{snapshot.volumeRecovery && <p>Main volume recovery: {snapshot.volumeRecovery.savedVolume === null ? 'no saved choice' : `${Math.round(snapshot.volumeRecovery.savedVolume * 100)}% saved`} · player tracked {snapshot.volumeRecovery.playerTracked ? 'yes' : 'no'} · document binding {snapshot.volumeRecovery.documentBound ? 'supported' : 'unavailable; player guard active'} · {snapshot.volumeRecovery.status} · attempts {snapshot.volumeRecovery.attempts ?? 0}{snapshot.volumeRecovery.failure ? ` · ${snapshot.volumeRecovery.failure}` : ''}</p>}{snapshot.volumeDiagnostics?.map((row, index) => <p key={`volume-${index}`}>{row.at} · {row.source} volume {Math.round(row.volume * 100)}% · {row.route} ready {row.readyState ?? 'unknown'} · {row.result}{row.failure ? ` · ${row.failure}` : ''}</p>)}{snapshot.audioDiagnostics.map((row, index) => <p key={index}>{row.at} · {row.source} · {row.cause} · {row.muted ? 'mute' : 'enable'} · {row.result} · {row.feeds} feeds · authority {row.authority} · worker {row.workerStartedAt}</p>)}</details>}<details className="secondary-details"><summary>Build details</summary><p className="runtime-identity">Runtime v{BUILD_VERSION} · build {BUILD_ID}{options.extensionId ? ` · extension ${options.extensionId}` : ''}</p></details></section></div>}

  </div>;
}

function scheduleProgress(entry: GuideEntry) {
  if (!entry.programStart || !entry.programEnd) return 0;
  const start = Date.parse(entry.programStart), end = Date.parse(entry.programEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, (Date.now() - start) / (end - start) * 100));
}

export function mountDesktop(element: HTMLElement, bridge: ClientBridge, options?: DesktopOptions) {
  // A content drawer can be narrow while the browser viewport is wide. Query the
  // mounting surface itself so its layout is also correct inside isolated Shadow DOM.
  element.style.containerType = 'inline-size';
  const root = createRoot(element);
  root.render(<DesktopApp bridge={bridge} options={options}/>);
  return () => root.unmount();
}
