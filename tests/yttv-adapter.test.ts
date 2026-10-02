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
test('guide polling and hidden SPA rows do not renew volatile targets; new videos are muted', async () => {
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
  assert.equal(newVideo.muted, true); assert.equal(newVideo.defaultMuted, true);
  adapter.dispose(); window.happyDOM.abort();
});
test('unknown channel dispatch fails explicitly without navigation', async () => {
  const window = fixtureWindow(); const adapter = createDOMAdapter(window.document as unknown as Document);
  adapter.getObservation(); const result = await adapter.navigateToChannel('yttv:unknown');
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, 'TARGET_UNAVAILABLE');
  assert.equal(window.location.pathname, '/live'); adapter.dispose(); window.happyDOM.abort();
});
