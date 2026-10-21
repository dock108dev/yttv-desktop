import { useEffect, useRef, useState } from 'react';
import { DEFAULT_KEYBOARD_MAPPINGS, KEYBOARD_LABELS, validateKeyboardMappings, type KeyboardAction } from '../../storage/src/index';
import { Icon } from './components';
import type { DesktopSnapshot } from './types';

type Mappings = DesktopSnapshot['preferences']['keyboardMappings'];
interface Props {
  mappings: Mappings;
  pending: boolean;
  onSave: (mappings: Mappings) => void;
  onClose: () => void;
  snapshot: DesktopSnapshot;
  version: string;
  build: string;
  extensionId?: string;
}

/** Drafts and focus belong to the dialog; persisted choices still go through the bridge. */
export function ShortcutsDialog({ mappings, pending, onSave, onClose, snapshot, version, build, extensionId }: Props) {
  const [draft, setDraft] = useState({ ...mappings });
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const modal = dialogRef.current;
    if (!modal) return;
    const root = modal.getRootNode();
    const previousFocus = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    const focusable = () => Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'));
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
    return () => {
      modal.removeEventListener('keydown', trapFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function save() {
    const invalid = validateKeyboardMappings(draft);
    setError(invalid);
    if (!invalid) onSave(draft);
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <section ref={dialogRef} className="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={event => event.stopPropagation()}>
      <div className="section-title">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close keyboard shortcuts"><Icon name="close"/></button>
      </div>
      <p>Focus the workspace or a guide row to use shortcuts. Typing, buttons, player controls and browser chords keep their own keys. Tab reaches row controls; arrows move between rows. Blank disables a binding. Escape always closes this dialog.</p>
      <div className="shortcut-grid">
        {(Object.keys(KEYBOARD_LABELS) as KeyboardAction[]).map(action => <label key={action}>
          <span>{KEYBOARD_LABELS[action]} <kbd>{mappings[action] || 'Off'}</kbd></span>
          <input aria-label={`${KEYBOARD_LABELS[action]} key`} value={draft[action]} maxLength={24}
            onChange={event => setDraft(previous => ({ ...previous, [action]: event.target.value }))}/>
        </label>)}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="shortcut-night"><Icon name="mute"/> Mute all affects only the main and added feed. Selecting a feed transfers audio and focus.</div>
      <div className="shortcut-actions">
        <button className="button" onClick={() => { setDraft({ ...DEFAULT_KEYBOARD_MAPPINGS }); setError(null); }}>Use defaults</button>
        <button className="button primary" disabled={pending} onClick={save}>Save shortcuts</button>
      </div>
      <PlayerDiagnostics snapshot={snapshot}/>
      <details className="secondary-details">
        <summary>Build details</summary>
        <p className="runtime-identity">Runtime v{version} · build {build}{extensionId ? ` · extension ${extensionId}` : ''}</p>
      </details>
    </section>
  </div>;
}

function PlayerDiagnostics({ snapshot }: { snapshot: DesktopSnapshot }) {
  if (!snapshot.audioDiagnostics) return null;
  const recovery = snapshot.volumeRecovery;
  return <details>
    <summary>Recent tab audio commands</summary>
    <p>Last 16 extension requests only; player and site mute are separate. No playback URLs or account data.</p>
    {recovery && <p>
      Main volume recovery: {recovery.savedVolume === null ? 'no saved choice' : `${Math.round(recovery.savedVolume * 100)}% saved`}
      {' · '}player tracked {recovery.playerTracked ? 'yes' : 'no'}
      {' · '}document binding {recovery.documentBound ? 'supported' : 'unavailable; player guard active'}
      {' · '}{recovery.status} · attempts {recovery.attempts ?? 0}{recovery.failure ? ` · ${recovery.failure}` : ''}
    </p>}
    {snapshot.volumeDiagnostics?.map((row, index) => <p key={`volume-${index}`}>
      {row.at} · {row.source} volume {Math.round(row.volume * 100)}% · {row.route} ready {row.readyState ?? 'unknown'}
      {' · '}{row.result}{row.failure ? ` · ${row.failure}` : ''}
    </p>)}
    {snapshot.audioDiagnostics.map((row, index) => <p key={index}>
      {row.at} · {row.source} · {row.cause} · {row.muted ? 'mute' : 'enable'} · {row.result}
      {' · '}{row.feeds} feeds · authority {row.authority} · worker {row.workerStartedAt}
    </p>)}
  </details>;
}
