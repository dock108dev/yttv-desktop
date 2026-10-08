import React from 'react';
import type { GuideEntry, SportsEvent } from '../../core/src/index';
import { freshLiveTarget } from '../../yttv-adapter/src/index';
import { eventVisibility } from '../../sports-engine/src/index';
import type { DesktopSnapshot, UIManagedPane } from './types';

export type IconName = 'watch' | 'guide' | 'sports' | 'quad' | 'search' | 'star' | 'back' | 'arrow' | 'mute' | 'window' | 'expand' | 'restore' | 'plus' | 'check' | 'close' | 'settings' | 'refresh' | 'up' | 'down' | 'eye' | 'external';

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

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export function channelMark(name: string) {
  const text = name.replace(/\b(channel|network|television)\b/gi, '').trim();
  return text.length <= 8 ? text.toUpperCase() : text.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

export function entryPlayable(entry: GuideEntry, snapshot: DesktopSnapshot) {
  return snapshot.connection === 'connected' && snapshot.capabilities.navigation && freshLiveTarget(entry);
}

function audioLabel(value: boolean | null | undefined) { return value === true ? 'muted' : value === false ? 'enabled' : 'unknown'; }
export function audioLayers(value: Pick<DesktopSnapshot['playback'], 'playerMuted' | 'tabMuted' | 'tabMuteReason' | 'siteMuted'>) {
  return `Player ${audioLabel(value.playerMuted)} · Tab ${audioLabel(value.tabMuted)}${value.tabMuteReason ? ` (${value.tabMuteReason})` : ''} · Site ${audioLabel(value.siteMuted)}`;
}

export function SearchBox({ value, setValue, inputRef, placeholder }: { value: string; setValue: (value: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; placeholder: string }) {
  return <div className="search-box"><Icon name="search" size={17}/><input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value ? <button className="icon-button" onClick={() => setValue('')} aria-label="Clear search"><Icon name="close" size={14}/></button> : <span className="search-hint">Search</span>}</div>;
}

export function QuickChannel({ entry, snapshot, onWatch }: { entry: GuideEntry; snapshot: DesktopSnapshot; onWatch: (entry: GuideEntry) => void }) {
  return <button className={`quick-channel ${snapshot.currentChannelId === entry.channel.id ? 'selected' : ''}`} onClick={() => onWatch(entry)} disabled={!entryPlayable(entry, snapshot)}><span className="channel-logo">{channelMark(entry.channel.name)}</span><span><strong>{entry.channel.name}</strong><small>{entry.metadataSource === 'CACHED' ? `Saved · ${entry.programTitle || 'program unknown'} · navigation unavailable` : entry.programTitle || 'Program unknown'}</small></span><Icon name="arrow" size={15}/></button>;
}

export function EmptyInline({ icon, title, text, action, actionLabel }: { icon: IconName; title: string; text: string; action?: () => void; actionLabel?: string }) {
  return <div className="empty-inline"><Icon name={icon} size={23}/><strong>{title}</strong><p>{text}</p>{action && <button className="text-button" onClick={action}>{actionLabel} <Icon name="arrow" size={14}/></button>}</div>;
}

export function EmptyState({ icon, title, text, action, actionLabel }: { icon: IconName; title: string; text: string; action?: () => void; actionLabel?: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={29}/></span><h2>{title}</h2><p>{text}</p>{action && <button className="button primary" onClick={action}>{actionLabel}<Icon name="arrow" size={15}/></button>}</div>;
}

export function SportsCard({ event, now, selected, onSelect }: {
  event: SportsEvent; now: number; selected: boolean; onSelect: () => void;
}) {
  const visibility = eventVisibility(event, now);
  const compactLabel = !visibility.isFresh ? 'STATUS UNAVAILABLE' : event.status.replace(/_/g, ' ');
  return <article className={`sports-card ${selected ? 'selected' : ''}`} data-event-id={event.id}>
    <div className="sports-card-top"><span className="league-label">{event.league.replace(/_/g, ' ')}</span><span className={`game-status ${visibility.group === 'LIVE' ? 'live' : visibility.group === 'HELD' ? 'held' : 'final'}`}><span className="status-dot"/>{compactLabel}</span></div>
    <div className="team-score"><span className="team-mark">{(event.awayTeam.shortName || event.awayTeam.name).slice(0, 3).toUpperCase()}</span><strong>{event.awayTeam.name}</strong><span className="score">{event.score?.away ?? '—'}</span></div>
    <div className="team-score"><span className="team-mark home">{(event.homeTeam.shortName || event.homeTeam.name).slice(0, 3).toUpperCase()}</span><strong>{event.homeTeam.name}</strong><span className="score">{event.score?.home ?? '—'}</span></div>
    <div className="game-detail"><span>{visibility.isFresh ? event.period || visibility.label : 'Last known state'}{visibility.isFresh && event.clock ? ` · ${event.clock}` : ''}</span><span>{event.broadcastNetworks.map(network => network.name).join(' / ') || 'Network unknown'}</span></div>
    <p className="game-status-detail">{visibility.isFresh ? event.statusDetail || visibility.reason : visibility.reason}</p>
    <p className="game-status-detail">Scheduled: {event.scheduledStart ? new Date(event.scheduledStart).toLocaleString() : 'unknown'}</p>
    <p className="game-status-detail">Retrieved: {event.fetchedAt} · {visibility.isFresh ? 'recent retrieval' : 'refresh required'}<br/>Source updated: {event.sourceUpdatedAt ?? 'unknown'}</p>
    {event.scheduledEnd && Date.parse(event.scheduledEnd) < now && visibility.isFresh && visibility.group === 'LIVE' && <div className="overrun-note">Discoverable beyond scheduled end</div>}
    <div className="resolution-line"><span className="fixture-badge tiny">{event.evidenceClass}</span><span>Fixture only · not playable</span></div>
    <div className="sports-card-actions"><button className={`button compact ${selected ? 'active' : ''}`} onClick={onSelect}>{selected ? 'Selected fixture' : 'Select fixture'}</button><button className="button compact" disabled>Watch</button><button className="button compact" disabled>Add</button></div>
  </article>;
}

export function ManagedPane({ pane, index, selected, expanded, pending, onFocus, onExpand, onReplace, onRemove, focusKey }: { focusKey: string; pane: UIManagedPane; index: number; selected: boolean; expanded: boolean; pending: boolean; onFocus: () => void; onExpand: () => void; onReplace: () => void; onRemove?: () => void }) {
  return <article className={`managed-pane ${selected ? 'selected' : ''}`}><div className="pane-header"><span className="pane-number">{index + 1}</span><div><strong>{pane.channelName}</strong><span>{expanded ? 'Window expanded' : selected ? 'Selected feed' : 'Managed browser window'}</span></div><span className="muted-tag">{pane.muted === true ? 'Muted' : pane.muted === false ? 'Audio enabled' : 'Audio unknown'}</span>{onRemove && <button className="icon-button" onClick={onRemove} disabled={pending} aria-label={`Close ${pane.channelName} managed window`}><Icon name="close" size={15}/></button>}</div><details className="secondary-details pane-audio-details"><summary>Audio details</summary><p>{audioLayers(pane)}</p></details><button className="pane-window-surface" onClick={onFocus} disabled={pending} title={`Select ${pane.channelName} audio and focus`}><strong>Select audio and open window</strong><span>{pane.status === 'Player observed advancing' ? 'Playback confirmed' : pane.status === 'Navigation requested; playback not confirmed' ? 'Opening channel · playback not confirmed' : pane.status || 'Opening window · playback not confirmed'}</span></button>{pane.error && <div className="pane-error" role="status">{pane.error}</div>}<div className="pane-actions"><button className="button compact" onClick={onFocus} disabled={pending}><Icon name="window" size={14}/> Select audio <kbd>{focusKey}</kbd></button><button className="icon-button" onClick={onExpand} disabled={pending} aria-label={`Expand ${pane.channelName} window`} title="Expand window"><Icon name="expand" size={17}/></button><button className="text-button" onClick={onReplace} disabled={pending}><Icon name="refresh" size={14}/> Replace</button></div></article>;
}

