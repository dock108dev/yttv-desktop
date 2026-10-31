import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createYouTubeAdapter } from '../packages/youtube-adapter/src/index';
import { recognizeContent, type PlayerBinding } from '../packages/core/src/media';
const url = 'https://www.youtube.com/watch?v=abcdefghijk';
const binding = { service: 'youtube', tabId: 1, windowId: 2, documentId: 'doc', slotId: 'slot', generation: 1, workerEpoch: 'epoch' } as const;
function fixture() {
  const w = new Window({ url });
  w.document.body.innerHTML = '<ytd-watch-flexy video-id="abcdefghijk"><div id="movie_player"><video class="html5-main-video"></video><button class="ytp-play-button"></button></div></ytd-watch-flexy>';
  const v = w.document.querySelector('video')!;
  for (const [k, value] of Object.entries({ readyState: 4, duration: 120, currentTime: 10, paused: true, ended: false, seeking: false })) Object.defineProperty(v, k, { value, writable: true, configurable: true });
  v.muted = true; v.volume = .27;
  (w.document.querySelector('button')! as any).onclick = () => { Object.defineProperty(v, 'paused', { value: !v.paused }); };
  v.play = async () => { Object.defineProperty(v, 'paused', { value: false }); }; v.pause = () => { Object.defineProperty(v, 'paused', { value: true }); };
  const a = createYouTubeAdapter(w.document as unknown as Document, binding);
  const observe = () => { const r = a.observe(); assert.equal(r.status, 'ok'); if (r.status !== 'ok') throw Error(); return r.value; };
  return { w, v, a, observe };
}
test('ordinary URLs canonicalize locally; other YouTube forms remain rejected', () => {
  assert.deepEqual(recognizeContent('https://youtu.be/abcdefghijk'), recognizeContent(url));
  for (const u of ['https://m.youtube.com/watch?v=abcdefghijk', 'https://music.youtube.com/watch?v=abcdefghijk', url+'&list=abc', url+'&v=abcdefghijk', url+'x', 'https://www.youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/live/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk']) assert.notEqual(recognizeContent(u).status, 'ok');
});
test('unique matching watch DOM identity required independently of media readiness', () => {
  for (const mutate of [(w: Window) => w.document.querySelector('video')!.remove(), (w: Window) => w.document.querySelector('#movie_player')!.append(w.document.querySelector('video')!.cloneNode()), (w: Window) => w.document.querySelector('ytd-watch-flexy')!.setAttribute('video-id', 'different'), (w: Window) => w.document.body.append(w.document.querySelector('#movie_player')!.cloneNode(true))]) {
    const h = fixture(); mutate(h.w); assert.notEqual(h.a.observe().status, 'ok'); h.w.happyDOM.abort();
  }
});
test('native controls require readback and preserve unrelated audio choices', async () => {
  const h = fixture(), b = h.observe().binding;
  for (const command of [{ type: 'play' }, { type: 'pause' }, { type: 'volume', value: .4 }, { type: 'mute', value: false }] as const) assert.equal((await h.a.execute(command, b)).status, 'ok');
  assert.equal(h.v.volume, .4); assert.equal(h.v.muted, false);
  (h.w.document.querySelector('button')! as any).onclick = () => {}; assert.notEqual((await h.a.execute({ type: 'play' }, b)).status, 'ok');
  h.w.document.querySelector('button')!.remove(); assert.equal(h.observe().capabilities.play.state, 'unsupported'); h.w.happyDOM.abort();
});
test('player replacement, navigation and changed binding during execution revoke success', async () => {
  for (const mutate of [(h: ReturnType<typeof fixture>) => h.v.replaceWith(h.v.cloneNode()), (h: ReturnType<typeof fixture>) => { h.w.location.href = 'https://www.youtube.com/watch?v=lmnopqrstuv'; }]) {
    const h = fixture(), b = h.observe().binding; (h.w.document.querySelector('button')! as any).onclick = () => mutate(h);
    assert.notEqual((await h.a.execute({ type: 'play' }, b)).status, 'ok'); h.w.happyDOM.abort();
  }
  const h = fixture(); assert.notEqual((await h.a.execute({ type: 'mute', value: false }, { ...h.observe().binding, generation: 2 } as PlayerBinding)).status, 'ok'); assert.equal(h.v.muted, true); h.w.happyDOM.abort();
});
test('ads, buffering, live and unknown cannot claim ended VOD or ready ads', () => {
  const h = fixture(); Object.defineProperties(h.v, { ended: { value: true }, currentTime: { value: 120 } }); assert.equal(h.observe().ended, 'confirmed-content-ended');
  h.w.document.querySelector('#movie_player')!.className = 'ad-showing'; assert.equal(h.observe().ended, 'unknown'); assert.notEqual(h.observe().readiness, 'ready');
  h.w.document.querySelector('#movie_player')!.className = 'ytp-live'; assert.equal(h.observe().kind, 'live'); assert.equal(h.observe().ended, 'unknown');
  h.w.document.querySelector('#movie_player')!.className = ''; Object.defineProperty(h.v, 'duration', { value: NaN }); assert.equal(h.observe().kind, 'unknown'); assert.notEqual(h.observe().readiness, 'ready');
  Object.defineProperties(h.v, { duration: { value: 120 }, readyState: { value: 1 } }); assert.notEqual(h.observe().readiness, 'ready'); assert.equal(h.observe().ended, 'unknown'); h.w.happyDOM.abort();
});

test('duplicate native controls disable only playback, leaving independent readback available', async () => {
  const h = fixture(); h.w.document.querySelector('#movie_player')!.append(h.w.document.querySelector('button')!.cloneNode());
  const o = h.observe(); assert.equal(o.capabilities.play.state, 'unsupported'); assert.equal(o.capabilities.readMute.state, 'supported');
  assert.notEqual((await h.a.execute({ type: 'play' }, o.binding)).status, 'ok'); h.w.happyDOM.abort();
});
