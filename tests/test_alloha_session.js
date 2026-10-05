'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../lib/4klab/core');
const descriptor={url:'wss://rarity-as.stravers.live/ws/',key:'fixture-public-session-1234'};
function harness(){
    let id=0,ready=0;const timers=new Map(),intervals=new Map(),sockets=[],errors=[];
    function WS(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
    WS.prototype.close=function(){this.closed=true;};
    WS.prototype.send=function(data){this.sent.push(JSON.parse(data));};
    WS.prototype.open=function(){this.readyState=1;this.onopen();};
    WS.prototype.token=function(value){this.onmessage({data:JSON.stringify({type:'config_update',edge_hash:value})});};
    const env={WebSocket:WS,setTimeout(fn,ms){const n=++id;timers.set(n,{fn,ms});return n;},clearTimeout(n){timers.delete(n);},setInterval(fn,ms){const n=++id;intervals.set(n,{fn,ms});return n;},clearInterval(n){intervals.delete(n);}};
    const session=new Core.StreamSession(env,descriptor,'7','2160p',()=>ready++,e=>errors.push(e.message));
    return {session,env,timers,intervals,sockets,errors,ready:()=>ready,runDelay(ms){const [n,t]=[...timers].find(([,t])=>t.ms===ms);timers.delete(n);t.fn();}};
}
test('Alloha control descriptors reject other hosts, credential URLs, oversized keys and insecure sockets',()=>{
    assert.equal(Core.playbackSession({}),null);
    assert.deepEqual(Core.playbackSession({pnr:descriptor.url,pnk:descriptor.key}),descriptor);
    for(const url of ['ws://rarity-as.stravers.live/ws/','wss://rarity-as.stravers.live.evil.test/ws/','wss://u:p@rarity-as.stravers.live/ws/','wss://192.168.88.191/ws/','wss://rarity-as.stravers.live/ws/?redirect=1','wss://rarity-as.stravers.live:443/ws/'])assert.throws(()=>Core.playbackSession({pnr:url,pnk:descriptor.key}),/SESSION/);
    for(const key of ['x\r\nHeader: bad','a'.repeat(4097),''])assert.throws(()=>Core.playbackSession({pnr:descriptor.url,pnk:key}),/SESSION/);
});
test('tokens rotate without additional ready events, repeated starts or duplicate heartbeat timers',()=>{
    const h=harness();h.session.start();h.session.start();assert.equal(h.sockets.length,1);
    h.sockets[0].open();h.sockets[0].token('a'.repeat(32));h.sockets[0].token('b'.repeat(32));
    assert.equal(h.ready(),1);assert.equal(h.session.token(),'b'.repeat(32));assert.equal(h.intervals.size,1);assert.equal(h.timers.size,0);
    h.session.stop();assert.equal(h.session.token(),'');assert.equal(h.intervals.size,0);assert.equal(h.sockets[0].onmessage,null);
});
test('control reconnect is bounded and never exposes session keys in errors',()=>{
    const h=harness();h.session.start();
    h.sockets[0].onclose({code:4005});h.runDelay(1000);
    h.sockets[1].onerror();h.runDelay(2000);
    h.sockets[2].onclose({code:4005});
    assert.equal(h.errors.length,1);assert.match(h.errors[0],/4005/);assert.ok(!h.errors[0].includes(descriptor.key));
    assert.equal(h.timers.size,0);assert.equal(h.intervals.size,0);assert.ok(h.sockets.every(s=>s.closed));
});
test('a reconnect renews the token without restarting video and stale sockets cannot rotate it',()=>{
    const h=harness();h.session.start();const old=h.sockets[0];old.open();old.token('a'.repeat(32));const stale=old.onmessage;
    old.onclose({code:1006});h.runDelay(1000);h.sockets[1].open();h.sockets[1].token('b'.repeat(32));
    stale({data:JSON.stringify({type:'config_update',edge_hash:'c'.repeat(32)})});
    assert.equal(h.session.token(),'b'.repeat(32));assert.equal(h.ready(),1);assert.equal(h.timers.size,0);assert.equal(h.intervals.size,1);h.session.stop();
});
test('control payloads must be bounded strings with a valid token; cancellation clears a pending retry',()=>{
    const h=harness();h.session.start();const ws=h.sockets[0];ws.open();
    for(const data of ['x', 'a'.repeat(4097), JSON.stringify({type:'config_update',edge_hash:'x\r\nBad: a'}), JSON.stringify({type:'config_update',edge_hash:{value:'a'.repeat(32)}}),{type:'config_update'}])ws.onmessage({data});
    assert.equal(h.ready(),0);assert.equal(h.session.token(),'');
    ws.onclose({code:1006});assert.equal(h.timers.size,2);h.session.stop();assert.equal(h.timers.size,0);assert.equal(h.errors.length,0);
});
