import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { navigationUrl, parseGuide, stableChannelId } from '../packages/yttv-adapter/src/index';
import { readFileSync } from 'node:fs';

test('ordinary observed watch navigation allows vp/vpp but rejects foreign and credential/media handles', () => {
  assert.equal(navigationUrl('/watch/ordinaryProgram?vp=guide-state&vpp=page-context'), 'https://tv.youtube.com/watch/ordinaryProgram?vp=guide-state&vpp=page-context');
  for (const input of ['https://evil.example/watch/a','https://tv.youtube.com.evil.example/watch/a','https://name:secret@tv.youtube.com/watch/a','/watch/a?token=signed','/videoplayback','/watch/a#credential','javascript:alert(1)','/live']) assert.equal(navigationUrl(input), null, input);
});
test('guide identity is channel-specific even when networks share a browse endpoint; unsupported rows stay explicit', () => {
  const window = new Window({url:'https://tv.youtube.com/live'});
  window.document.body.innerHTML = `<ytu-epg-row><ytu-endpoint class="network"><a href="/browse/shared">ESPN</a></ytu-endpoint><ytu-endpoint class="tenx-thumb" aria-label="watch ESPN"><a href="/watch/first?vp=nav"></a></ytu-endpoint><div class="airings"><a>Current ESPN</a><a>Next ESPN</a></div></ytu-epg-row><ytu-epg-row><ytu-endpoint class="network"><a href="/browse/shared">ESPN 2</a></ytu-endpoint><ytu-endpoint class="tenx-thumb" aria-label="watch ESPN 2"><a href="/live"></a></ytu-endpoint><div class="airings"><a>Delayed game</a></div></ytu-epg-row>`;
  const guide = parseGuide(window.document as unknown as Document, '2026-10-02T03:50:00Z');
  assert.equal(guide.length, 2); assert.notEqual(guide[0].channel.id,guide[1].channel.id);
  assert.equal(guide[0].target?.channelId, stableChannelId('ESPN'));
  assert.equal(guide[0].nextProgramTitle,'Next ESPN');
  assert.equal(guide[1].available,false); assert.equal(guide[1].target,null);
  assert.equal(guide[1].evidenceClass,'LIVE'); window.happyDOM.abort();
});
test('extension permission boundary is narrow and content runs only on the supported TV origin', () => {
  const manifest=JSON.parse(readFileSync(new URL('../apps/chrome-extension/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,['storage']);
  assert.deepEqual(manifest.host_permissions,['https://tv.youtube.com/*']);
  assert.deepEqual(manifest.content_scripts.flatMap((script:any)=>script.matches),['https://tv.youtube.com/*']);
  assert.equal(manifest.web_accessible_resources,undefined);
});
