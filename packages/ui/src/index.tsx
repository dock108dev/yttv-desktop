import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GuideEntry, SportsEvent } from '../../core/src/index';
import { defaultPreferences, orderGuide } from '../../storage/src/index';
import { createIllustrativeFixtures, eventVisibility, searchEvents } from '../../sports-engine/src/index';
import { resolveEvent } from '../../event-resolver/src/index';
import type { ActionResult, ClientBridge, DesktopOptions, DesktopSnapshot, UIManagedPane } from './types';
import './styles.css';

export type { ActionResult, ClientBridge, DesktopOptions, DesktopSnapshot, UIManagedPane } from './types';

type Surface = 'WATCH' | 'GUIDE' | 'SPORTS' | 'QUADBOX';
type GuideFilter = 'all' | 'favorites' | 'recent';
const BUILD_VERSION = typeof __YTTV_VERSION__ === 'undefined' ? 'development' : __YTTV_VERSION__;
type IconName = 'watch' | 'guide' | 'sports' | 'quad' | 'search' | 'star' | 'back' | 'arrow' | 'mute' | 'window' | 'expand' | 'restore' | 'plus' | 'check' | 'close' | 'settings' | 'refresh' | 'up' | 'down' | 'eye' | 'external';

const iconPaths: Record<IconName, React.ReactNode> = {
  watch: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></>,
  guide: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11M12 13h6M12 17h4"/></>,
  sports: <><circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-2 5h-4l-2-5zM12 3v4M4 8l4 2M6 19l4-4M18 19l-4-4M20 8l-4 2"/></>,
  quad: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  star: <path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9z"/>,
  back: <><path d="m10 6-6 6 6 6M4 12h10a6 6 0 0 1 6 6"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  mute: <><path d="M11 4 6 8H3v8h3l5 4zM16 9l5 6M21 9l-5 6"/></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
  expand: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></>,
  restore: <><rect x="3" y="8" width="13" height="13" rx="2"/><path d="M8 8V3h13v13h-5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.2 6.2a8.2 8.2 0 0 1 13 3M17.8 17.8a8.2 8.2 0 0 1-13-3"/></>,
  up: <path d="m6 14 6-6 6 6"/>,
  down: <path d="m6 10 6 6 6-6"/>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  external: <><path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

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

const surfaceItems: { id: Surface; label: string; icon: IconName; shortcut: string }[] = [
  { id: 'WATCH', label: 'Watch', icon: 'watch', shortcut: 'W' },
  { id: 'GUIDE', label: 'Guide', icon: 'guide', shortcut: 'G' },
  { id: 'SPORTS', label: 'Sports', icon: 'sports', shortcut: 'S' },
  { id: 'QUADBOX', label: 'QuadBox', icon: 'quad', shortcut: 'Q' },
];

function editableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], video, audio'));
}

function channelMark(name: string) {
  const text = name.replace(/\b(channel|network|television)\b/gi, '').trim();
  return text.length <= 8 ? text.toUpperCase() : text.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function entryPlayable(entry: GuideEntry, snapshot: DesktopSnapshot) {
  return snapshot.capabilities.navigation && entry.available && Boolean(entry.target) && entry.evidenceClass !== 'FIXTURE';
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
  const [sportsLeague, setSportsLeague] = useState('ALL');
  const [selectedFixtures, setSelectedFixtures] = useState<string[]>([]);
  const [clock, setClock] = useState(Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLElement>(null);
  const initializedSurface = useRef(false);
  const demo = options.demo || snapshot.mode === 'demo';
  const [fixtures, setFixtures] = useState(() => createIllustrativeFixtures(Date.now()));
  const currentEntry = snapshot.guide.find(entry => entry.channel.id === snapshot.currentChannelId);
  const previousEntry = snapshot.guide.find(entry => entry.channel.id === snapshot.preferences.previousChannel);

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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const path = event.composedPath();
      const app = appRef.current;
      // Keep shortcuts inside this workspace, including when mounted in a Shadow DOM.
      // Hidden drawers and the original YouTube TV player never receive these bindings.
      const standaloneBody = app?.getRootNode() instanceof Document && (event.target === document.body || event.target === document.documentElement);
      if (!app || (!path.includes(app) && !standaloneBody)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || path.some(editableTarget)) return;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        else if (replacePaneId) setReplacePaneId(null);
        else if (snapshot.expandedPaneId) void run('Restore windows', () => bridge.restoreLayout());
        else if (query) setQuery('');
        return;
      }
      if (key === '/' && (surface === 'GUIDE' || surface === 'SPORTS')) { event.preventDefault(); searchRef.current?.focus(); return; }
      if (key === '?') { event.preventDefault(); setShowShortcuts(value => !value); return; }
      const requested = surfaceItems.find(item => item.shortcut.toLowerCase() === key);
      if (requested) { event.preventDefault(); goSurface(requested.id); return; }
      if (key === 'p' && snapshot.preferences.previousChannel && snapshot.capabilities.navigation) { event.preventDefault(); void run('Previous channel', () => bridge.previousChannel()); }
      if (key === 'm' && bridge.mute) { event.preventDefault(); void run('Mute all playback', () => bridge.mute!()); }
      if (surface === 'QUADBOX' && /^[1-4]$/.test(key)) {
        const pane = snapshot.panes[Number(key) - 1];
        if (pane) { event.preventDefault(); void run('Focus window', () => bridge.selectPane(pane.id)); }
      }
      const interactiveTarget = path.some(target => target instanceof Element && Boolean(target.closest('button, a')));
      if (surface === 'QUADBOX' && event.key === 'Enter' && snapshot.activePaneId && !interactiveTarget) { event.preventDefault(); void run('Expand window', () => bridge.expandPane(snapshot.activePaneId!)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bridge, goSurface, query, replacePaneId, run, showShortcuts, snapshot, surface]);

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

  const visibleSports = searchEvents(fixtures, query, { now: clock }).filter(event => sportsLeague === 'ALL' || event.league === sportsLeague);
  const leagues = ['ALL', 'MLB', 'NFL', 'NCAA_FOOTBALL', 'NBA', 'NHL'];
  const favorites = orderGuide(snapshot.guide, snapshot.preferences).filter(entry => snapshot.preferences.favorites.includes(entry.channel.id));
  const recents = snapshot.preferences.recentChannels.map(id => snapshot.guide.find(entry => entry.channel.id === id)).filter((entry): entry is GuideEntry => Boolean(entry));

  const headerTitles: Record<Surface, string> = { WATCH: 'Your television, at a glance.', GUIDE: 'Less scrolling. More watching.', SPORTS: 'Follow the game. Not the schedule.', QUADBOX: 'More games. One control surface.' };

  return <div className="desktop-app" ref={appRef}>
    <aside className="rail" aria-label="Main navigation">
      <button className="brand" onClick={() => goSurface('WATCH')} aria-label="Desktop TV home"><span className="brand-mark">dtv<span>.</span></span><span className="brand-caption">DESKTOP TV</span></button>
      <nav>{surfaceItems.map(item => <button key={item.id} className={`nav-item ${surface === item.id ? 'selected' : ''}`} onClick={() => goSurface(item.id)} aria-current={surface === item.id ? 'page' : undefined} title={`${item.label} (${item.shortcut})`}><Icon name={item.icon} size={21}/><span>{item.label}</span></button>)}</nav>
      <div className="rail-bottom"><button className="nav-item" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)"><span className="keycap">?</span><span>Shortcuts</span></button><span className="rail-version">LOCAL BETA · v{BUILD_VERSION}</span></div>
    </aside>

    <div className="workspace">
      {demo && <div className="preview-banner"><span className="fixture-badge">LOCAL PREVIEW</span><span>Fixture channels and sample sports. No authentication, live scores or video playback in this preview.</span></div>}
      <header className="topbar"><div className={`connection ${snapshot.connection}`}><span className="status-dot"/><span>{demo ? 'Preview workspace' : snapshot.connection === 'connected' ? 'YouTube TV connected' : snapshot.connection === 'waiting' ? 'Waiting for YouTube TV' : 'Player bridge unavailable'}</span></div><div className="topbar-actions"><span className="night-lock"><Icon name="mute" size={15}/><span>Night mode · All playback muted</span></span><a href="https://tv.youtube.com/" target="_blank" rel="noreferrer" className="open-yttv">YouTube TV <Icon name="external" size={14}/></a></div></header>
      <main className={`main-content surface-${surface.toLowerCase()}`}>
        <div className="page-heading"><div><div className="eyebrow">{surface === 'QUADBOX' ? 'MANAGED WINDOW WORKSPACE' : surface === 'SPORTS' ? 'INDEPENDENT SPORTS ENGINE' : 'YOUR DESKTOP EXPERIENCE'}</div><h1>{surfaceItems.find(item => item.id === surface)?.label}</h1><p>{headerTitles[surface]}</p></div><div className="heading-actions">{surface === 'SPORTS' && <button className="button subtle" onClick={() => { const now = Date.now(); setFixtures(createIllustrativeFixtures(now)); setClock(now); }}><Icon name="refresh"/> Refresh fixtures</button>}{surface === 'GUIDE' && <button className={`button subtle ${manageGuide ? 'active' : ''}`} onClick={toggleGuideManagement} aria-pressed={manageGuide}><Icon name="settings"/> {manageGuide ? 'Done editing' : 'Customize'}</button>}{surface === 'QUADBOX' && snapshot.expandedPaneId && <button className="button" onClick={() => void run('Restore windows', () => bridge.restoreLayout())}><Icon name="restore"/> Restore layout <kbd>Esc</kbd></button>}{surface === 'QUADBOX' && <button className="button primary" onClick={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} disabled={!snapshot.capabilities.managedWindows}><Icon name="plus"/> Add channel</button>}</div></div>

        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><Icon name={notice.kind === 'error' ? 'window' : 'check'}/><span>{notice.text}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={15}/></button></div>}
        {pending && <div className="operation-status" role="status"><span className="loading-dot"/>{pending}…</div>}
        {!demo && snapshot.connection !== 'connected' && <div className="connection-help"><Icon name="window" size={20}/><div><strong>{snapshot.statusMessage || 'Open YouTube TV in Chrome to connect the guide.'}</strong><p>Keep its original player open. Channel observations and controls appear when the supported adapter is available.</p></div><button className="button subtle" onClick={() => void run('Refresh connection', bridge.refresh ? () => bridge.refresh!() : async () => { await refresh(); return { ok: true }; })}><Icon name="refresh"/> Refresh</button></div>}

        {surface === 'WATCH' && <>
          <section className="watch-context"><div className="watch-gradient"/><div className="watch-context-copy"><span className="section-kicker"><span className="status-dot"/>{snapshot.playback.playing === true ? 'PLAYBACK OBSERVED' : 'CURRENT PLAYER'}</span><h2>{snapshot.currentProgram || currentEntry?.programTitle || 'Your original player stays in YouTube TV.'}</h2><div className="watch-channel"><span className="channel-logo large">{currentEntry ? channelMark(currentEntry.channel.name) : 'TV'}</span><div><strong>{currentEntry?.channel.name || 'Authorized YouTube TV playback'}</strong><span>{demo ? 'Local preview · no video playback' : snapshot.playback.playing === true ? 'Playing in the original supported browser tab' : 'Playback state is not yet confirmed'}</span></div><span className="muted-tag"><Icon name="mute" size={15}/> {snapshot.playback.muted === true ? 'MUTED' : snapshot.playback.muted === false ? 'MUTE REQUIRED' : 'MUTE LOCK'}</span></div><div className="watch-actions"><button className="button primary" onClick={() => goSurface('GUIDE')}><Icon name="guide"/> Open compact guide <kbd>G</kbd></button><button className="button" disabled={!snapshot.preferences.previousChannel || !snapshot.capabilities.navigation || Boolean(pending)} onClick={() => void run('Previous channel', () => bridge.previousChannel())}><Icon name="back"/> Previous <kbd>P</kbd></button></div></div><div className="player-preserved"><Icon name="window" size={32}/><strong>Video stays in YouTube TV</strong><p>This workspace controls navigation. Google handles your account and protected playback.</p><a href="https://tv.youtube.com/" target="_blank" rel="noreferrer">Open original player <Icon name="external" size={14}/></a></div></section>
          <div className="watch-columns"><section className="content-card"><div className="section-title"><h2>Favorites <span>{favorites.length}</span></h2><button className="text-button" onClick={() => { goSurface('GUIDE'); setFilter('favorites'); }}>View guide <Icon name="arrow" size={15}/></button></div>{favorites.length ? <div className="quick-channels">{favorites.slice(0, 8).map(entry => <QuickChannel key={entry.channel.id} entry={entry} snapshot={snapshot} onWatch={watchEntry}/>)}</div> : <EmptyInline icon="star" title="Keep your channels close" text="Star a channel in the guide to pin it here." action={() => goSurface('GUIDE')} actionLabel="Choose favorites"/>}</section><section className="content-card"><div className="section-title"><h2>Recently watched</h2><span className="quiet-label">CONFIRMED SWITCHES</span></div>{recents.length ? <div className="recent-list">{recents.slice(0, 5).map(entry => <QuickChannel key={entry.channel.id} entry={entry} snapshot={snapshot} onWatch={watchEntry}/>)}</div> : <EmptyInline icon="back" title="Pick up where you left off" text="Confirmed channel switches populate your local history."/>}</section></div>
          {previousEntry && <div className="previous-strip"><Icon name="back"/><span>Previous channel</span><strong>{previousEntry.channel.name}</strong><span>{previousEntry.programTitle}</span><button className="text-button" disabled={!snapshot.capabilities.navigation} onClick={() => void run('Previous channel', () => bridge.previousChannel())}>Go back <kbd>P</kbd></button></div>}
        </>}

        {surface === 'GUIDE' && <>
          {replacePaneId && <div className="replace-banner"><Icon name="refresh"/><span>Choose a channel to replace window {snapshot.panes.findIndex(pane => pane.id === replacePaneId) + 1}. Other windows stay in place.</span><button className="text-button" onClick={() => setReplacePaneId(null)}>Cancel</button></div>}
          <div className="guide-toolbar"><div className="segmented" aria-label="Channel filter">{(['all', 'favorites', 'recent'] as const).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{value === 'all' ? 'All channels' : value === 'favorites' ? 'Favorites' : 'Recents'}{value === 'favorites' && <span>{snapshot.preferences.favorites.length}</span>}</button>)}</div><SearchBox value={query} setValue={setQuery} inputRef={searchRef} placeholder="Find channel or program"/></div>
          {manageGuide && <div className="customize-help"><span>Star favorites. Move channels with the arrows. Hide channels from your everyday guide.</span><label><input type="checkbox" checked={includeHidden} onChange={event => setIncludeHidden(event.target.checked)}/> Show hidden channels</label></div>}
          <section className="guide-table" aria-label="Compact live guide"><div className="guide-table-head"><span>CHANNEL</span><span>CURRENT PROGRAM</span><span className="guide-time-heading">SCHEDULE</span><span>CONTROLS</span></div>{guideEntries.length ? guideEntries.map((entry, index) => {
            const favorite = snapshot.preferences.favorites.includes(entry.channel.id);
            const current = snapshot.currentChannelId === entry.channel.id;
            const hidden = snapshot.preferences.hiddenChannels.includes(entry.channel.id);
            const playable = entryPlayable(entry, snapshot);
            return <div key={entry.channel.id} className={`guide-row ${current ? 'current' : ''} ${hidden ? 'hidden-channel' : ''}`}>
              <div className="guide-channel-cell"><button className={`favorite-toggle icon-button ${favorite ? 'is-favorite' : ''}`} onClick={() => setList('favorites', entry.channel.id)} title={favorite ? `Remove ${entry.channel.name} from favorites` : `Favorite ${entry.channel.name}`} aria-label={favorite ? `Remove ${entry.channel.name} from favorites` : `Favorite ${entry.channel.name}`} aria-pressed={favorite}><Icon name="star" size={16}/></button><span className="channel-logo">{channelMark(entry.channel.name)}</span><div className="channel-name"><strong>{entry.channel.name}</strong>{current ? <span className="current-label">● CURRENT</span> : hidden ? <span>Hidden</span> : <span>{String(index + 1).padStart(2, '0')}</span>}</div></div>
              <div className="guide-program-cell"><strong>{entry.programTitle || 'Program information unavailable'}</strong><span>{entry.nextProgramTitle ? `Next · ${entry.nextProgramTitle}` : entry.evidenceClass === 'FIXTURE' ? 'Illustrative fixture · no playback target' : entry.available ? entry.target ? 'Observed navigation target' : 'Target not verified' : 'Availability not confirmed'}</span></div>
              <div className="guide-schedule-cell">{entry.programStart || entry.programEnd ? <><span>{formatTime(entry.programStart)}{entry.programStart && entry.programEnd ? ' – ' : ''}{formatTime(entry.programEnd)}</span><div className="schedule-track"><span style={{ width: `${scheduleProgress(entry)}%` }}/></div></> : <span className="schedule-unknown">Schedule unknown</span>}</div>
              <div className="guide-row-actions">{manageGuide ? <><button className="icon-button" aria-label={`Move ${entry.channel.name} up`} title="Move up" disabled={!canMoveChannel(index, -1)} onClick={() => moveChannel(entry.channel.id, -1)}><Icon name="up" size={16}/></button><button className="icon-button" aria-label={`Move ${entry.channel.name} down`} title="Move down" disabled={!canMoveChannel(index, 1)} onClick={() => moveChannel(entry.channel.id, 1)}><Icon name="down" size={16}/></button><button className={`icon-button ${hidden ? 'is-hidden' : ''}`} aria-label={`${hidden ? 'Show' : 'Hide'} ${entry.channel.name}`} title={hidden ? 'Show channel' : 'Hide channel'} onClick={() => setList('hiddenChannels', entry.channel.id)}><Icon name="eye" size={16}/></button></> : <><button className={`button compact ${current ? 'currently-watching' : ''}`} disabled={!playable || Boolean(pending)} onClick={() => watchEntry(entry)} title={!playable ? 'Requires a verified, available YouTube TV channel target' : `Watch ${entry.channel.name}`}>{replacePaneId ? 'Replace' : current ? 'Watching' : 'Watch'}{!current && <Icon name="arrow" size={13}/>}</button><button className="icon-button add-window" disabled={!playable || !snapshot.capabilities.managedWindows || Boolean(pending)} onClick={() => addEntry(entry)} title="Add to managed windows" aria-label={`Add ${entry.channel.name} to managed windows`}><Icon name="plus" size={17}/></button></>}</div>
            </div>;
          }) : <EmptyState icon="guide" title={query ? 'No matching channels' : filter === 'favorites' ? 'Your favorites start here' : filter === 'recent' ? 'No confirmed channel history yet' : 'Waiting for an observed guide'} text={query ? 'Try a channel name or a word from its current program.' : filter === 'favorites' ? 'Choose All channels, then star the ones you watch most.' : filter === 'recent' ? 'Channel history updates after a confirmed successful switch.' : 'Open the Live guide in your supported YouTube TV tab. This workspace will only show channels the adapter can observe.'}/>}</section>
          <div className="guide-footer"><span>{guideEntries.length} channels shown · {demo ? 'fixture data' : snapshot.observedAt ? `observed ${formatTime(snapshot.observedAt)}` : 'awaiting observation'}</span><span>Favorites and settings are saved on this Mac.</span></div>
        </>}

        {surface === 'SPORTS' && <>
          <div className="sports-disclosure"><div className="fixture-badge">FIXTURE LAB</div><div><strong>Sports state is ready to preview. Live coverage is not connected.</strong><p>All scores, teams, times and broadcast networks below are illustrative. Fixture selections never open a real stream. A licensed live provider and verified channel mapping are release gates.</p></div></div>
          <div className="sports-toolbar"><div className="league-tabs" aria-label="League filter">{leagues.map(league => <button key={league} className={league === sportsLeague ? 'selected' : ''} onClick={() => setSportsLeague(league)} aria-pressed={league === sportsLeague}>{league === 'ALL' ? 'All sports' : league === 'NCAA_FOOTBALL' ? 'College football' : league}</button>)}</div><SearchBox value={query} setValue={setQuery} inputRef={searchRef} placeholder="Search team or league"/></div>
          <div className="section-title sports-section-title"><h2>Illustrative game states <span>{visibleSports.length}</span></h2><span className="quiet-label">SCHEDULE WINDOWS DO NOT DETERMINE FINALITY</span></div>
          {visibleSports.length ? <div className="sports-grid">{visibleSports.map(event => <SportsCard key={event.id} event={event} guide={snapshot.guide} now={clock} selected={selectedFixtures.includes(event.id)} onSelect={() => setSelectedFixtures(previous => previous.includes(event.id) ? previous.filter(id => id !== event.id) : [...previous, event.id])}/>)}</div> : <EmptyState icon="sports" title="No matching fixtures" text="Try Yankees, Rutgers, Georgia or a league name. This search operates on the sample Sports Engine, independent of the television guide."/>}
          {selectedFixtures.length > 0 && <div className="fixture-selection"><span><Icon name="check"/> {selectedFixtures.length} fixture {selectedFixtures.length === 1 ? 'scenario selected' : 'scenarios selected'}</span><p>Selection exercises event identity only. No playable target or live provider has been proven.</p><button className="text-button" onClick={() => setSelectedFixtures([])}>Clear</button></div>}
        </>}

        {surface === 'QUADBOX' && <>
          <div className="quad-disclosure"><Icon name="window" size={23}/><div><strong>Supported browser windows, controlled together</strong><p>Each feed stays in its original YouTube TV window. This is a managed-window fallback; it does not compose protected video into this page. Simultaneous playback remains subject to your account, browser and channel availability.</p></div><span className="capability-pill">WINDOW ROUTE</span></div>
          <div className="quad-toolbar"><span><strong>{snapshot.panes.length}</strong> managed {snapshot.panes.length === 1 ? 'window' : 'windows'} <span className="divider">/</span> <Icon name="mute" size={15}/> All muted</span><div><span className="quiet-label">1–4 FOCUS · ENTER EXPAND · ESC RESTORE</span></div></div>
          {snapshot.panes.length ? <div className={`quad-grid ${snapshot.panes.length === 1 ? 'single' : ''}`}>{snapshot.panes.map((pane, index) => <ManagedPane key={pane.id} pane={pane} index={index} selected={pane.id === snapshot.activePaneId} expanded={pane.id === snapshot.expandedPaneId} pending={Boolean(pending)} onFocus={() => void run('Focus window', () => bridge.selectPane(pane.id))} onExpand={() => void run('Expand window', () => bridge.expandPane(pane.id))} onReplace={() => { setReplacePaneId(pane.id); setSurface('GUIDE'); setQuery(''); setFilter('all'); }} onRemove={bridge.removePane ? () => void run('Close managed window', () => bridge.removePane!(pane.id)) : undefined}/>)}{snapshot.panes.length < 4 && <button className="add-pane" onClick={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} disabled={!snapshot.capabilities.managedWindows}><span className="add-pane-icon"><Icon name="plus" size={25}/></span><strong>Add another channel</strong><span>Only within your verified simultaneous-stream allowance</span></button>}</div> : <EmptyState icon="quad" title="Build your viewing workspace" text="Start from a verified channel in the Guide, then Add to managed windows. Every window opens muted. Two, three or four feeds require separate account and playback feasibility evidence." action={() => { setSurface('GUIDE'); setQuery(''); setFilter('all'); }} actionLabel="Choose channels"/>}
          <div className="quad-footer"><span>Night mode is locked. Selecting a window changes focus while audio stays muted.</span><span>No playback, entitlement or 4-stream guarantee.</span></div>
        </>}
      </main>
      <footer className="app-footer"><span>YouTube TV provides the streams. We provide the desktop experience.</span><span>LOCAL · PRIVATE · NO VIDEO PROXY</span></footer>
    </div>

    {showShortcuts && <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}><section ref={shortcutsRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={event => event.stopPropagation()}><div className="section-title"><h2 id="shortcuts-title">Move at your own pace.</h2><button className="icon-button" onClick={() => setShowShortcuts(false)} aria-label="Close keyboard shortcuts"><Icon name="close"/></button></div><p>Shortcuts work inside this workspace, outside editable fields and interactive controls.</p><div className="shortcut-grid">{[...surfaceItems.map(item => [item.label, item.shortcut]), ['Previous channel', 'P'], ['Mute all', 'M'], ['Search', '/'], ['Focus managed window', '1–4'], ['Expand focused window', 'Enter'], ['Restore layout', 'Esc'], ['Show shortcuts', '?']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="shortcut-night"><Icon name="mute"/> Overnight audio is locked to muted. No shortcut unmutes playback.</div><button className="button primary" onClick={() => setShowShortcuts(false)} autoFocus>Got it</button></section></div>}
  </div>;
}

function scheduleProgress(entry: GuideEntry) {
  if (!entry.programStart || !entry.programEnd) return 0;
  const start = Date.parse(entry.programStart), end = Date.parse(entry.programEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, (Date.now() - start) / (end - start) * 100));
}

function SearchBox({ value, setValue, inputRef, placeholder }: { value: string; setValue: (value: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; placeholder: string }) {
  return <div className="search-box"><Icon name="search" size={17}/><input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value ? <button className="icon-button" onClick={() => setValue('')} aria-label="Clear search"><Icon name="close" size={14}/></button> : <kbd>/</kbd>}</div>;
}

function QuickChannel({ entry, snapshot, onWatch }: { entry: GuideEntry; snapshot: DesktopSnapshot; onWatch: (entry: GuideEntry) => void }) {
  return <button className={`quick-channel ${snapshot.currentChannelId === entry.channel.id ? 'selected' : ''}`} onClick={() => onWatch(entry)} disabled={!entryPlayable(entry, snapshot)}><span className="channel-logo">{channelMark(entry.channel.name)}</span><span><strong>{entry.channel.name}</strong><small>{entry.programTitle || 'Program unknown'}</small></span><Icon name="arrow" size={15}/></button>;
}

function EmptyInline({ icon, title, text, action, actionLabel }: { icon: IconName; title: string; text: string; action?: () => void; actionLabel?: string }) {
  return <div className="empty-inline"><Icon name={icon} size={23}/><strong>{title}</strong><p>{text}</p>{action && <button className="text-button" onClick={action}>{actionLabel} <Icon name="arrow" size={14}/></button>}</div>;
}

function EmptyState({ icon, title, text, action, actionLabel }: { icon: IconName; title: string; text: string; action?: () => void; actionLabel?: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={29}/></span><h2>{title}</h2><p>{text}</p>{action && <button className="button primary" onClick={action}>{actionLabel}<Icon name="arrow" size={15}/></button>}</div>;
}

function SportsCard({ event, guide, now, selected, onSelect }: { event: SportsEvent; guide: GuideEntry[]; now: number; selected: boolean; onSelect: () => void }) {
  const visibility = eventVisibility(event, now);
  const resolution = resolveEvent(event, guide, { now });
  const isFinal = event.status === 'FINAL';
  const isHeld = event.status === 'DELAYED' || event.status === 'SUSPENDED';
  const beyondSchedule = Boolean(event.scheduledEnd && Date.parse(event.scheduledEnd) < now && !isFinal);
  const compactLabel = !visibility.isFresh ? 'STATUS UNAVAILABLE' : visibility.group === 'UNCERTAIN' ? 'STATUS UNKNOWN' : event.status.replace(/_/g, ' ');
  return <article className={`sports-card ${selected ? 'selected' : ''}`}><div className="sports-card-top"><span className="league-label">{event.league.replace(/_/g, ' ')}</span><span className={`game-status ${!visibility.isFresh || visibility.group === 'UPCOMING' || visibility.group === 'UNCERTAIN' || isFinal ? 'final' : isHeld ? 'held' : 'live'}`}><span className="status-dot"/>{compactLabel}</span></div><div className="team-score"><span className="team-mark">{(event.awayTeam.shortName || event.awayTeam.name).slice(0, 3).toUpperCase()}</span><strong>{event.awayTeam.name}</strong><span className="score">{event.score?.away ?? '—'}</span></div><div className="team-score"><span className="team-mark home">{(event.homeTeam.shortName || event.homeTeam.name).slice(0, 3).toUpperCase()}</span><strong>{event.homeTeam.name}</strong><span className="score">{event.score?.home ?? '—'}</span></div><div className="game-detail"><span>{visibility.isFresh ? event.period || visibility.label : 'Last known state'}{visibility.isFresh && event.clock ? ` · ${event.clock}` : ''}</span><span>{event.broadcastNetworks.map(network => network.name).join(' / ') || 'Network unknown'}</span></div><p className="game-status-detail">{visibility.isFresh ? event.statusDetail || visibility.reason : visibility.reason}</p>{beyondSchedule && visibility.isFresh && <div className="overrun-note"><Icon name="check" size={13}/> Discoverable beyond scheduled end</div>}{!visibility.isFresh && <div className="overrun-note uncertain"><Icon name="refresh" size={13}/> Snapshot {formatTime(event.fetchedAt)} · refresh required</div>}<div className="resolution-line"><span className="fixture-badge tiny">FIXTURE</span><span>{resolution.state === 'CONFIRMED' ? 'Fixture mapping only · not playable' : 'No verified live playback target'}</span></div><div className="sports-card-actions"><button className={`button compact ${selected ? 'active' : ''}`} onClick={onSelect}><Icon name={selected ? 'check' : 'plus'} size={14}/>{selected ? 'Selected fixture' : 'Select fixture'}</button><button className="button compact" disabled title="A fixture is not an eligible live playback target">Watch</button><button className="icon-button" disabled aria-label="Add to QuadBox unavailable for fixture" title="Live provider and verified target required"><Icon name="quad" size={16}/></button></div></article>;
}

function ManagedPane({ pane, index, selected, expanded, pending, onFocus, onExpand, onReplace, onRemove }: { pane: UIManagedPane; index: number; selected: boolean; expanded: boolean; pending: boolean; onFocus: () => void; onExpand: () => void; onReplace: () => void; onRemove?: () => void }) {
  return <article className={`managed-pane ${selected ? 'selected' : ''}`}><div className="pane-header"><span className="pane-number">{index + 1}</span><div><strong>{pane.channelName}</strong><span>{expanded ? 'Window expanded' : selected ? 'Focused window' : 'Managed browser window'}</span></div><span className="muted-tag"><Icon name="mute" size={14}/> {pane.muted ? 'MUTED' : 'MUTE REQUIRED'}</span>{onRemove && <button className="icon-button" onClick={onRemove} disabled={pending} aria-label={`Close ${pane.channelName} managed window`}><Icon name="close" size={15}/></button>}</div><button className="pane-window-surface" onClick={onFocus} disabled={pending} title={`Focus ${pane.channelName} window; audio remains muted`}><span className="window-diagram"><span/><span/><span/><Icon name="watch" size={32}/></span><strong>Open its YouTube TV window</strong><span>{pane.status || 'Window requested · advancing playback not yet verified'}</span></button>{pane.error && <div className="pane-error" role="status">{pane.error}</div>}<div className="pane-actions"><button className="button compact" onClick={onFocus} disabled={pending}><Icon name="window" size={14}/> Focus <kbd>{index + 1}</kbd></button><button className="icon-button" onClick={onExpand} disabled={pending} aria-label={`Expand ${pane.channelName} window`} title="Expand window"><Icon name="expand" size={17}/></button><button className="text-button" onClick={onReplace} disabled={pending}><Icon name="refresh" size={14}/> Replace</button></div></article>;
}

export function mountDesktop(element: HTMLElement, bridge: ClientBridge, options?: DesktopOptions) {
  // A content drawer can be narrow while the browser viewport is wide. Query the
  // mounting surface itself so its layout is also correct inside isolated Shadow DOM.
  element.style.containerType = 'inline-size';
  const root = createRoot(element);
  root.render(<DesktopApp bridge={bridge} options={options}/>);
  return () => root.unmount();
}
