import test from 'node:test';
import assert from 'node:assert/strict';
import { autoConnectPlayers } from '../apps/chrome-extension/src/auto-connect';
function harness(count: number) {
  const connected: number[] = [], calls: any[] = [];
  const host = { detect: async () => Array.from({length:count}, (_,i)=>({id:i+1,label:`Player ${i+1}`})), controlled:()=>connected, capacity:()=>connected.length, hasOriginal:async()=>connected.length>0, blocked:()=>false,
    connect:async(id:number,original:boolean)=>{calls.push({id,original});connected.push(id);return{ok:true};} };
  return {host,calls,connected};
}
test('one to four detected players connect automatically, preserve existing ownership and repeated passes do not duplicate', async()=>{
  for(const n of [1,2,3,4]){const h=harness(n);assert.equal((await autoConnectPlayers(h.host)).ok,true);assert.equal(h.calls.length,n);assert.equal(h.calls[0].original,true);assert(h.calls.slice(1).every(c=>!c.original));await autoConnectPlayers(h.host);assert.equal(h.calls.length,n);}
});
test('five or more are a visible choice, never an arbitrary automatic subset',async()=>{
  for(const n of [5,6]){const h=harness(n);assert.equal((await autoConnectPlayers(h.host)).code,'TOO_MANY_PLAYERS');assert.equal(h.calls.length,0);}
  const h=harness(4);h.host.capacity=()=>2;assert.equal((await autoConnectPlayers(h.host)).code,'TOO_MANY_PLAYERS');assert.equal(h.calls.length,0);
});
test('failed detection and pending recovery are distinct from no open players',async()=>{
  const h=harness(2);h.host.detect=async()=>{throw Error('query failure')};assert.equal((await autoConnectPlayers(h.host)).code,'DETECTION_FAILED');assert.equal(h.calls.length,0);
  const pending=harness(2);pending.host.blocked=()=>true;assert.equal((await autoConnectPlayers(pending.host)).code,'RECOVERY_REQUIRED');assert.equal(pending.calls.length,0);
  assert.equal((await autoConnectPlayers(harness(0).host)).ok,true);
});
test('one failed adapter reports the player and still connects the others; explicit retry can recover',async()=>{
  const h=harness(3);const connect=h.host.connect;let fail=true;
  h.host.connect=async(id,original)=>{if(id===1&&fail)throw Error('stale');return connect(id,original)};
  const result=await autoConnectPlayers(h.host);assert.equal(result.ok,false);assert.match(result.reason!,/Player 1/);assert.deepEqual(h.connected,[2,3]);assert.equal(h.calls[0].original,true);
  fail=false;assert.equal((await autoConnectPlayers(h.host)).ok,true);assert.deepEqual(h.connected,[2,3,1]);
});
