import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySports, listingPlayable, sportsListings } from '../packages/sports-engine/src/guide';
import { readGuideCache } from '../packages/storage/src/guide-cache';
import type { GuideEntry } from '../packages/core/src/index';
const now = Date.now(); const stamp = new Date(now).toISOString();
const entry: GuideEntry = {channel:{id:'yttv:synthetic',name:'Sports Network'}, programTitle:'SportsCenter',
  programs:[{title:'Boston vs. New York · NHL',context:'CURRENT'}, {title:'WNBA Countdown',context:'NEXT'}],
  available:true, evidenceClass:'LIVE', observedAt:stamp, target:{kind:'navigation',channelId:'yttv:synthetic',url:'https://tv.youtube.com/watch?v=synthetic',verifiedAt:stamp,evidenceClass:'LIVE'}};
test('program evidence discovers competitions, searchable teams, truthful kinds and no network inference', () => {
  assert.equal(sportsListings([{...entry,programs:[{title:'A Movie',context:'CURRENT'}]}]).length,0);
  assert.equal(sportsListings([entry],'new york','NHL').length,1);
  assert.equal(sportsListings([entry],'countdown','WNBA')[0].kind,'Studio / analysis');
  assert.equal(classifySports({title:'MLB Replay: Boston at New York',context:'CURRENT'})?.kind,'Replay');
  assert.equal(classifySports({title:'Tennis Today',context:'CURRENT'})?.competition,'Competition unspecified');
  assert.equal(classifySports({title:'Watch live sports, studio shows and originals on ESPN',context:'CURRENT'}),null);
});
test('next, explicit upcoming, stale, cached, missing and mismatched targets cannot grant actions', () => {
  const listings=sportsListings([entry]); assert.equal(listingPlayable(listings[0],now),true); assert.equal(listingPlayable(listings[1],now),false);
  for (const row of [{...entry,metadataSource:'CACHED' as const}, {...entry,observedAt:new Date(now-31*60000).toISOString()}, {...entry,target:null}, {...entry,target:{...entry.target!,channelId:'wrong'}}, {...entry,programs:[{title:'Upcoming: NHL',context:'UPCOMING' as const}]}]) assert.equal(listingPlayable(sportsListings([row])[0],now),false);
});
test('sports cache retains sanitized program metadata and original age but never targets', () => {
  const cache=readGuideCache({schemaVersion:1,observedAt:stamp,rows:[{...entry,programs:[...entry.programs!,{title:'NFL',context:'CURRENT',detail:'https://secret.test/token=private'}]}]},now)!;
  assert.equal(cache.rows[0].programs?.length,3); assert.equal(cache.rows[0].programs?.[2].detail,undefined);
  assert.equal(cache.rows[0].observedAt,stamp); assert.equal(sportsListings(cache.rows).length,3);
  assert.equal(cache.rows[0].target,null); assert.equal(listingPlayable(sportsListings(cache.rows)[0],now),false);
});

test('legacy cached guide text keeps embedded Upcoming context and rejects episodic at-text as a matchup', () => {
  const legacy = {...entry,programs:undefined,programTitle:'SUN, OCT 4, 1:00 PM Upcoming: New York Jets at Chicago Bears',nextProgramTitle:"9:00 PM TV-14 • S7 E3 • Weekend at Brandy's Below Deck"};
  const rows=sportsListings([legacy]);
  assert.equal(rows.length,1); assert.equal(rows[0].program.context,'UPCOMING');
  assert.equal(listingPlayable(rows[0],now),false);
  assert.equal(classifySports({title:"Weekend at Brandy's",detail:'TV-14 • S7 E3',context:'NEXT'}),null);
  assert.equal(classifySports({title:'Boston vs. Winnipeg · NHL',detail:'TV-PG',context:'CURRENT'})?.competition,'NHL');
});
