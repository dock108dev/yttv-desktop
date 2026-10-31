import { useRef, useState } from 'react';
import { recognizeContent, type ContentRef, type QueueIntent } from '../../core/src/media';
import type { ActionResult, DesktopSnapshot } from './types';

/** Snapshot-only UI: only worker intents may change the durable envelope. */
export function MixedQueue({ state, send, enableYouTube, connectYouTube, enablePrimeVideo, connectPrimeVideo, enableNetflix, connectNetflix }: { state: DesktopSnapshot; send(intent: QueueIntent): Promise<ActionResult>; enableNetflix?(): Promise<ActionResult>; connectNetflix?(tabId: number): Promise<ActionResult>; enablePrimeVideo?(): Promise<ActionResult>; connectPrimeVideo?(tabId: number): Promise<ActionResult>; enableYouTube?(): Promise<ActionResult>; connectYouTube?(tabId: number): Promise<ActionResult> }) {
  const mixed = state.mixed, record = mixed?.record;
  const [service, setService] = useState('yttv'), [link, setLink] = useState(''), [channel, setChannel] = useState('');
  const [label, setLabel] = useState(''), [editing, setEditing] = useState<string>(), [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), addInput = useRef<HTMLInputElement>(null);
  if (!mixed) return null;
  const disabled = busy || !mixed.writable;
  async function run(intent: QueueIntent) {
    setBusy(true); setError('');
    try { const result = await send(intent); if (!result.ok) setError(result.reason ?? 'Action unavailable.'); return result.ok; }
    catch { setError('Queue unavailable. Refresh and try again.'); return false; }
    finally { setBusy(false); }
  }
  const base = () => ({ requestId: crypto.randomUUID(), revision: record!.revision });
  const emptySlot = record?.slots.find(s => !record.ownership.some(o => o.slotId === s.id) && !record.claims.some(c => c.slotId === s.id));
  const selected = record?.slots.find(s => s.id === destination) ?? emptySlot;
  async function add() {
    let content: ContentRef;
    if (service === 'yttv') {
      const chosen = state.guide.find(g => g.channel.id === (channel || state.guide[0]?.channel.id));
      if (!chosen) { setError('Open the native guide to load channels.'); return; }
      content = { service: 'yttv', kind: 'live-channel', channelId: chosen.channel.id };
    } else {
      const parsed = recognizeContent(link);
      if (parsed.status !== 'ok' || parsed.value.service !== service) { setError('Paste a supported plain link for the selected service.'); return; }
      content = parsed.value;
    }
    if (await run({ ...base(), ...(editing ? { action: 'edit', itemId: editing } : { action: 'enqueue' }), content, label: label || (content.service === 'yttv' ? state.guide.find(g => g.channel.id === content.channelId)?.channel.name ?? 'YouTube TV' : service) })) {
      setEditing(undefined); setLink(''); setLabel(''); addInput.current?.focus();
    }
  }
  return <section className="mixed-queue" aria-label="Video queue">
    <div><strong>YouTube</strong> {state.youtubeEnabled ? <small>Enabled · native watch videos</small> : <button disabled={busy || !enableYouTube} onClick={() => { const request = enableYouTube!(); void request.then(r => setError(r.ok ? '' : r.reason ?? 'Access denied. Use native YouTube.')); }}>Enable YouTube</button>}
      {state.youtubeEnabled && state.youtubeCandidates?.map(p => <button key={p.tabId} disabled={busy || !connectYouTube} onClick={() => void connectYouTube!(p.tabId).then(r => setError(r.ok ? '' : r.reason ?? 'Use native controls.'))}>Connect {p.label}</button>)}
    </div>
    <div><strong>Prime Video</strong> {state.primeVideoEnabled ? <small>Enabled · native attention only</small> : <button disabled={busy || !enablePrimeVideo} onClick={() => { const request = enablePrimeVideo!(); void request.then(r => setError(r.ok ? '' : r.reason ?? 'Access denied. Use native Prime Video.')); }}>Enable Prime Video</button>}
      {state.primeVideoEnabled && state.primeVideoCandidates?.map(p => <button key={p.tabId} disabled={busy || !connectPrimeVideo} onClick={() => void connectPrimeVideo!(p.tabId).then(r => setError(r.ok ? '' : r.reason ?? 'Use native controls.'))}>Connect {p.label}</button>)}
    </div>
    <div><strong>Netflix</strong> {state.netflixEnabled ? <small>Enabled · native attention only</small> : <button disabled={busy || !enableNetflix} onClick={() => { const request = enableNetflix!(); void request.then(r => setError(r.ok ? '' : r.reason ?? 'Access denied. Use native Netflix.')); }}>Enable Netflix</button>}
      {state.netflixEnabled && state.netflixCandidates?.map(p => <button key={p.tabId} disabled={busy || !connectNetflix} onClick={() => void connectNetflix!(p.tabId).then(r => setError(r.ok ? '' : r.reason ?? 'Use native controls.'))}>Connect {p.label}</button>)}
    </div>
    <details><summary>{editing ? 'Edit video' : 'Add video'}</summary>
      <label>Service<select disabled={disabled} value={service} onChange={e => setService(e.target.value)}><option value="yttv">YouTube TV</option><option value="youtube">YouTube</option><option value="prime-video">Prime Video</option><option value="netflix">Netflix</option></select></label>
      {service === 'yttv' ? <label>Channel<select disabled={disabled} value={channel || state.guide[0]?.channel.id || ''} onChange={e => setChannel(e.target.value)}>{state.guide.map(g => <option key={g.channel.id} value={g.channel.id}>{g.channel.name}</option>)}</select></label> : <><label>Video link<input ref={addInput} disabled={disabled} type="url" maxLength={2048} value={link} onChange={e => setLink(e.target.value)} /></label><small>{service === 'youtube' ? state.youtubeEnabled ? 'Ordinary watch links and youtu.be links. Advancement is manual.' : 'Enable YouTube to launch. You can save links now.' : service === 'prime-video' ? 'Canonical primevideo.com/detail links only. Finish selection in Prime Video; remote playback is unverified.' : 'Netflix title/watch links only. Finish selection in Netflix; remote playback is unverified.'}</small></>}
      <label>Name<input disabled={disabled} maxLength={200} value={label} onChange={e => setLabel(e.target.value)} /></label>
      <button disabled={disabled || !record || !editing && record.items.length >= 100} onClick={() => void add()}>{editing ? 'Save video' : 'Add to queue'}</button>
      {editing && <button onClick={() => { setEditing(undefined); setLabel(''); setLink(''); }}>Cancel edit</button>}
    </details>
    <h2 ref={heading} tabIndex={-1}>Queue {record ? `(${record.items.length}/100)` : ''}</h2>
    {(error || mixed.error) && <p role="alert">{error || mixed.error}</p>}
    {!mixed.writable && <button disabled={busy} onClick={() => void run({ action: 'retry-storage', requestId: crypto.randomUUID(), revision: record?.revision ?? 0 })}>Retry storage</button>}
    {record && !record.items.length && <p>No videos queued.</p>}
    {record?.items.length === 100 && <p>The queue is full. Remove a video to add another.</p>}
    {record && <>
      <label>Play next in<select aria-label="Queue destination" disabled={disabled} value={selected?.id ?? ''} onChange={e => setDestination(e.target.value)}>
        {!selected && <option value="">Choose a replacement</option>}
        {record.slots.map(s => <option key={s.id} value={s.id}>{`Slot ${s.order + 1} · ${record.ownership.some(o => o.slotId === s.id) ? 'Replace current video' : record.claims.some(c => c.slotId === s.id) ? 'Opening interrupted or pending' : 'Empty'}`}</option>)}
      </select></label>
      <ol>{record.items.map((item, index) => {
        const claim = record.claims.find(c => c.itemId === item.id);
        return <li key={item.id}><strong>{item.label}</strong><small>{item.content.service} · {claim ? mixed.states[claim.slotId] ?? 'Interrupted — retry explicitly' : item.content.service === 'netflix' ? state.netflixEnabled ? 'Native attention required' : 'Enable Netflix' : item.content.service === 'prime-video' ? state.primeVideoEnabled ? 'Native attention required' : 'Enable Prime Video' : item.content.service === 'yttv' || item.content.service === 'youtube' && state.youtubeEnabled ? 'Waiting' : 'Unsupported playback'}</small><div className="actions">
          <button disabled={disabled || !selected} onClick={() => { const target = claim ? record.slots.find(s => s.id === claim.slotId) : selected; if (target) void run({ ...base(), action: 'play', itemId: item.id, slotId: target.id, generation: target.generation }); }}>{claim ? 'Retry' : 'Play next'}</button>
          <button disabled={disabled || Boolean(claim) || index === 0} aria-label={`Move ${item.label} up`} onClick={() => void run({ ...base(), action: 'move', itemId: item.id, offset: -1 })}>Up</button>
          <button disabled={disabled || Boolean(claim) || index === record.items.length - 1} aria-label={`Move ${item.label} down`} onClick={() => void run({ ...base(), action: 'move', itemId: item.id, offset: 1 })}>Down</button>
          <button disabled={disabled || Boolean(claim)} onClick={e => { setEditing(item.id); setService(item.content.service); setLabel(item.label); if (item.content.service === 'yttv') setChannel(item.content.channelId); else setLink(item.content.url); const details = e.currentTarget.closest('section')!.querySelector('details')!; details.open = true; details.querySelector('select')?.focus(); }}>Edit</button>
          {claim && <button disabled={disabled} onClick={() => void run({ ...base(), action: 'cancel', itemId: item.id })}>Cancel launch</button>}
          <button disabled={disabled} aria-label={`Remove queued ${item.label}`} onClick={() => void run({ ...base(), action: 'remove', itemId: item.id }).then(ok => { if (ok) heading.current?.focus(); })}>Remove</button>
        </div></li>;
      })}</ol>
      <h2>Now playing slots</h2>
      {record.slots.map(s => {
        const owner = record.ownership.find(o => o.slotId === s.id), claim = record.claims.find(c => c.slotId === s.id);
        return <div key={s.id}><strong>Slot {s.order + 1}{owner ? ` · ${owner.service} · ${state.panes.find(p => p.tabId === owner.tabId)?.channelName ?? 'Native player'}` : ''}</strong><small>{mixed.states[s.id] ?? (owner ? owner.service === 'prime-video' || owner.service === 'netflix' ? 'Identity unverified · use native controls' : 'Connected · use controls below' : 'Empty')}</small>
          {owner && <button disabled={disabled} onClick={() => void run({ ...base(), action: 'focus', slotId: s.id, generation: s.generation })}>Focus slot {s.order + 1}</button>}
          {(claim || owner && mixed.states[s.id]?.includes('unavailable')) && <button disabled={disabled} onClick={() => void run({ ...base(), action: 'confirm-closed', slotId: s.id, generation: s.generation })}>I closed the interrupted window</button>}
        </div>;
      })}
    </>}
  </section>;
}
