import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createDOMAdapter, navigationUrl, parseGuide, stableChannelId } from '../packages/yttv-adapter/src/index';

test('only normal observed YouTube TV navigation is accepted', () => {
  assert.equal(navigationUrl('/watch?v=abc&vp=guide&vpp=page'), 'https://tv.youtube.com/watch?v=abc&vp=guide&vpp=page');
  for (const url of ['https://googlevideo.com/watch?v=abc', 'https://tv.youtube.com.evil.test/watch',
    'https://user:password@tv.youtube.com/watch', '/watch?token=private', '/watch#secret', '/api/video', 'http://tv.youtube.com/watch']) {
    assert.equal(navigationUrl(url), null, url);
  }
  assert.equal(stableChannelId('ESPN 2'), stableChannelId('  ESPN   2 '));
  assert.notEqual(stableChannelId('ESPN'), stableChannelId('ESPN2'));
});

function fixtureWindow() {
  const window = new Window({ url: 'https://tv.youtube.com/live' });
  Object.assign(globalThis, { MutationObserver: window.MutationObserver, HTMLVideoElement: window.HTMLVideoElement,
    getComputedStyle: window.getComputedStyle.bind(window) });
  window.document.body.innerHTML = `<ytu-epg-row><div class="container"><ytu-endpoint class="network"><a href="/browse/shared">CBS 2</a></ytu-endpoint><ytu-endpoint class="tenx-thumb" aria-label="watch CBS 2"><a href="/watch?v=cbs&vp=observed"></a></ytu-endpoint><div class="airings"><a>Current Show</a><a>Next Show</a></div></div></ytu-epg-row><video></video>`;
  return window;
}
test('guide candidate comes from watch link, not shared browse identity', () => {
  const window = fixtureWindow();
  const guide = parseGuide(window.document as unknown as Document, '2026-10-02T04:00:00Z');
  assert.equal(guide.length, 1); assert.equal(guide[0].channel.id, 'yttv:cbs-2');
  assert.equal(guide[0].programTitle, 'Current Show'); assert.equal(guide[0].nextProgramTitle, 'Next Show');
  assert.equal(guide[0].target?.url, 'https://tv.youtube.com/watch?v=cbs&vp=observed');
  assert.equal(guide[0].evidenceClass, 'LIVE');
  window.happyDOM.abort();
});
test('guide polling and hidden SPA rows do not renew volatile targets; normal audio choices are preserved', async () => {
  const window = fixtureWindow();
  const adapter = createDOMAdapter(window.document as unknown as Document);
  const first = adapter.getObservation();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(adapter.getObservation().guide[0].target?.verifiedAt, first.guide[0].target?.verifiedAt);
  window.location.href = 'https://tv.youtube.com/watch?v=cbs';
  window.document.querySelector('ytu-endpoint.tenx-thumb a')!.setAttribute('href', '/watch?v=changed');
  assert.equal(adapter.getObservation().guide[0].target?.url, first.guide[0].target?.url);
  const newVideo = window.document.createElement('video'); window.document.body.append(newVideo);
  newVideo.muted = false; newVideo.dispatchEvent(new window.Event('playing', { bubbles: true }));
  assert.equal(newVideo.muted, false); assert.equal(newVideo.defaultMuted, false);
  adapter.dispose(); window.happyDOM.abort();
});

test('fresh guide uses only its first current-program link when thumbnails have no target', () => {
  const window = fixtureWindow();
  try {
    window.document.querySelector('ytu-endpoint.tenx-thumb')!.innerHTML = '<div></div>';
    const airings = window.document.querySelector('.airings')!;
    airings.innerHTML = '<a href="/watch?v=current">Current Show</a><a href="/watch?v=future">Later Show</a>';
    assert.equal(parseGuide(window.document as unknown as Document)[0].target?.url, 'https://tv.youtube.com/watch?v=current');
    airings.querySelector('a')!.setAttribute('href', '/browse/upcoming');
    assert.equal(parseGuide(window.document as unknown as Document)[0].target, null, 'never select a later watch link');
    airings.querySelector('a')!.setAttribute('href', 'https://googlevideo.com/media');
    assert.equal(parseGuide(window.document as unknown as Document)[0].target, null);
  } finally { window.happyDOM.abort(); }
});
test('unknown channel dispatch fails explicitly without navigation', async () => {
  const window = fixtureWindow(); const adapter = createDOMAdapter(window.document as unknown as Document);
  adapter.getObservation(); const result = await adapter.navigateToChannel('yttv:unknown');
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, 'TARGET_UNAVAILABLE');
  assert.equal(window.location.pathname, '/live'); adapter.dispose(); window.happyDOM.abort();
});

test('adapter rejects disposed, fixture, malformed and stale targets; no-player mute is unavailable', async () => {
  const window = fixtureWindow(); const adapter = createDOMAdapter(window.document as unknown as Document);
  const entry = parseGuide(window.document as unknown as Document)[0];
  window.document.body.innerHTML = '';
  const mute = await adapter.mute(); assert.equal(mute.ok, false);
  adapter.seedGuide([{ ...entry, evidenceClass: 'FIXTURE' }]); assert.equal(adapter.getObservation().guide.length, 0);
  adapter.seedGuide([entry]); assert.equal(adapter.getObservation().guide.length, 1);
  adapter.dispose(); assert.equal((await adapter.navigateToChannel(entry.channel.id)).ok, false);
  await window.happyDOM.abort();
});

test('document replacement retains unavailable guide rows and order without enabling invalid navigation', async () => {
  const window = fixtureWindow();
  const entry = parseGuide(window.document as unknown as Document)[0];
  window.location.href = 'https://tv.youtube.com/watch?v=cbs';
  window.document.body.innerHTML = '';
  const adapter = createDOMAdapter(window.document as unknown as Document);
  const unavailable = { ...entry, channel: { id: 'yttv:upcoming', name: 'Upcoming' }, available: false, target: null };
  const malformed = { ...entry, channel: { id: 'yttv:malformed', name: 'Malformed' }, target: { ...entry.target!, channelId: 'yttv:malformed', verifiedAt: 'invalid' } };
  const stale = { ...entry, channel: { id: 'yttv:stale', name: 'Stale' }, target: { ...entry.target!, channelId: 'yttv:stale', verifiedAt: new Date(Date.now() - 31 * 60_000).toISOString() } };
  try {
    adapter.seedGuide([entry, unavailable, malformed, stale, { ...entry, evidenceClass: 'FIXTURE' }]);
    const guide = adapter.getObservation().guide;
    assert.deepEqual(guide.map(item => item.channel.id), [entry.channel.id, 'yttv:upcoming', 'yttv:malformed', 'yttv:stale']);
    assert.equal(guide[0].target?.url, entry.target?.url);
    for (const item of guide.slice(1)) {
      assert.equal(item.available, false); assert.equal(item.target, null);
      const result = await adapter.navigateToChannel(item.channel.id);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, 'TARGET_UNAVAILABLE');
    }
    assert.equal(window.location.search, '?v=cbs');
  } finally { adapter.dispose(); await window.happyDOM.abort(); }
});

test('restart metadata seed keeps observation age and cannot navigate; native Live alone reacquires targets', async () => {
  const window = fixtureWindow();
  const native = parseGuide(window.document as unknown as Document, new Date(Date.now() - 1000).toISOString())[0];
  window.location.href = 'https://tv.youtube.com/watch?v=synthetic-test-only';
  const adapter = createDOMAdapter(window.document as unknown as Document);
  try {
    // Deliberately inject an apparently fresh target beside the cached marker: still disabled.
    adapter.seedGuide([{ ...native, metadataSource: 'CACHED' }]);
    const cached = adapter.getObservation();
    assert.equal(cached.guide[0].target, null); assert.equal(cached.guide[0].available, false);
    assert.equal(cached.guide[0].observedAt, native.observedAt);
    assert.equal((await adapter.navigateToChannel(native.channel.id)).ok, false);
    assert.equal(window.location.search, '?v=synthetic-test-only');
    window.location.href = 'https://tv.youtube.com/live';
    const reacquired = adapter.getObservation();
    assert(reacquired.guide[0].target); assert.equal(reacquired.guide[0].metadataSource, undefined);
    assert.notEqual(reacquired.guide[0].observedAt, native.observedAt);
  } finally { adapter.dispose(); await window.happyDOM.abort(); }
});


test('audio controls read back mute and volume, polling preserves choices and disposal blocks changes', async () => {
  const window = fixtureWindow(); const video = window.document.querySelector('video')!;
  video.volume = .37; video.muted = false;
  const adapter = createDOMAdapter(window.document as unknown as Document);
  try {
    assert.equal(adapter.getObservation().playback.muted, false);
    assert.equal(adapter.getObservation().playback.volume, .37);
    assert.equal((await adapter.setAudio({ muted: true })).ok, true);
    assert.equal(video.volume, .37);
    const enabled = await adapter.setAudio({ muted: false });
    assert.equal(enabled.ok, true); if (enabled.ok) assert.equal(enabled.value.muted, false);
    assert.equal(adapter.getObservation().playback.muted, false);
    assert.equal((await adapter.setAudio({ volume: .2 })).ok, true);
    assert.equal(video.volume, .2); assert.equal(video.muted, false);
    assert.equal((await adapter.setAudio({ volume: 2 })).ok, false);
    assert.equal(video.volume, .2);
    adapter.dispose(); assert.equal((await adapter.setAudio({ muted: true })).ok, false);
    assert.equal(video.muted, false);
  } finally { adapter.dispose(); await window.happyDOM.abort(); }
});
