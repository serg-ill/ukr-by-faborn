'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const DNS=require('../lib/4klab/dns'),Core=require('../lib/4klab/core');
const host='edge.vkvideo.cloud',url='https://'+host+'/film/master.m3u8?private=stream-token';
function harness(){
 const state={time:0,status:200,ttl:60,queries:[],overrides:[],events:[],answer:null,setOK:1};let body='';
 const native={_lab_body:()=>1,_lab_size:()=>Buffer.byteLength(body),UTF8ToString:()=>body,ccall(name,type,types,args){
  if(name==='lab_dns_query'){
   state.queries.push(args);
   body=state.answer===null?JSON.stringify({Status:0,Question:[{name:args[0],type:1}],Answer:[{name:args[0],type:1,TTL:state.ttl,data:'93.184.216.34'}]}):state.answer;
   return state.status;
  }
  assert.equal(name,'lab_set_resolve');state.overrides.push(args);return state.setOK;
 }};
 return {state,apply:DNS(native,Core,event=>state.events.push(event),()=>state.time)};
}
test('Alloha DNS shares a bounded hostname cache across signed URLs without sending tokens',()=>{
 const {state,apply}=harness();apply(url);apply('https://'+host+'/another/segment.m4s?secret=other');
 assert.deepEqual(state.queries,[[host]]);assert.deepEqual(state.overrides,[[host,'93.184.216.34'],[host,'93.184.216.34']]);
 assert.deepEqual(state.events.map(e=>e.state),['query','resolved']);assert.ok(!JSON.stringify(state).includes('stream-token'));
 state.time=60000;apply(url);assert.equal(state.queries.length,2);
});
test('CNAME chains use only related addresses and the shortest TTL',()=>{
 const {state,apply}=harness();state.answer=JSON.stringify({Status:0,Question:[{name:host+'.',type:1}],Answer:[
  {name:host+'.',type:5,TTL:10,data:'cdn.example.net.'},{name:'cdn.example.net.',type:1,TTL:300,data:'93.184.216.34'},
  {name:'unrelated.example',type:1,TTL:1,data:'8.8.8.8'}]});
 apply(url);assert.equal(state.overrides[0][1],'93.184.216.34');state.time=9999;apply(url);assert.equal(state.queries.length,1);
 state.time=10000;apply(url);assert.equal(state.queries.length,2);
});
test('zero TTL is not extended and very long TTL is capped at five minutes',()=>{
 const e=harness();e.state.ttl=0;e.apply(url);e.apply(url);assert.equal(e.state.queries.length,2);
 const long=harness();long.state.ttl=86400;long.apply(url);long.state.time=300000;long.apply(url);assert.equal(long.state.queries.length,2);
});
test('the DNS cache evicts inactive hosts instead of growing for every CDN name',()=>{
 const {state,apply}=harness();for(let n=0;n<33;n++)apply('https://edge'+n+'.vkvideo.cloud/file');
 apply('https://edge0.vkvideo.cloud/file');assert.equal(state.queries.length,34);
});
test('DoH failures do not silently downgrade and a later launch can retry',()=>{
 for(const status of [-28,-7,503,302]){
  const {state,apply}=harness();state.status=status;assert.throws(()=>apply(url),/DNS: Cloudflare/);assert.equal(state.overrides.length,0);
  assert.equal(state.events.at(-1).state,'error');state.status=200;apply(url);assert.equal(state.overrides.length,1);
 }
});
test('malformed, mismatched, truncated and unrelated DNS answers never become connection addresses',()=>{
 const valid={Status:0,Question:[{name:host,type:1}],Answer:[{name:host,type:1,TTL:60,data:'93.184.216.34'}]};
 for(const answer of ['<html>proxy error</html>',null,{...valid,Status:3},{...valid,TC:true},{...valid,Question:[null]},{...valid,Question:[{name:'other.example',type:1}]},
  {...valid,Question:[{name:host,type:28}]},{...valid,Answer:[{name:'unrelated.example',type:1,TTL:60,data:'93.184.216.34'}]},
  {...valid,Answer:[{name:host,type:5,TTL:60,data:host}]}]){
  const e=harness();e.state.answer=typeof answer==='string'?answer:JSON.stringify(answer);assert.throws(()=>e.apply(url),/DNS:/);assert.equal(e.state.overrides.length,0);
 }
});
test('private, malformed and non-public addresses and invalid TTLs are rejected',()=>{
 for(const ip of ['0.0.0.0','127.0.0.1','192.168.88.191','10.0.0.1','172.16.0.1','100.64.0.1','169.254.1.1','224.1.1.1','203.0.113.1','198.18.0.1','999.1.1.1','01.2.3.4','8.8.8.8\r\nInjected:yes','::1']){
  const e=harness();e.state.answer=JSON.stringify({Status:0,Question:[{name:host,type:1}],Answer:[{name:host,type:1,TTL:60,data:ip}]});
  assert.throws(()=>e.apply(url),/DNS:/);assert.equal(e.state.overrides.length,0);
 }
 for(const ttl of [-1,'60',null]){
  const e=harness();e.state.ttl=ttl;assert.throws(()=>e.apply(url),/DNS:/);
 }
});
test('DoH stays within the Alloha allowlist and rejects credentials or other providers',()=>{
 for(const target of ['https://kinobase.example/','http://edge.vkvideo.cloud/a','https://user:password@edge.vkvideo.cloud/a','https://127.0.0.1/a','https://edge.vkvideo.cloud.evil.test/a']){
  const e=harness();assert.throws(()=>e.apply(target),/DNS:/);assert.equal(e.state.queries.length,0);
 }
});
test('a rejected native address override cannot proceed as if DoH succeeded',()=>{
 const e=harness();e.state.setOK=0;assert.throws(()=>e.apply(url),/не вдалося застосувати/);
});
