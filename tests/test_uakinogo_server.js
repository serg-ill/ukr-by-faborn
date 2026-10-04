'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createService} = require('../server/uakinogo/server');
const {createResolver, card} = require('../server/uakinogo/resolver');
const Core = require('../lib/4klab/core');

const movie = {title:'Fixture film', original_title:'Fixture film', release_date:'2023-01-01', media_type:'movie'};
const media = 'https://edge.vkvideo.cloud/film/master.m3u8?sig=fixture';
function result() {
    return {schema:1, origin:Core.origin, sourcePage:'https://uakinogo.is/42-fixture.html',
        referer:Core.origin+'/?token=public&token_movie=42', season:0, episode:0, episodes:[{season:0,episode:0}],
        tracks:[{label:'English', language:'en', qualities:{'2160p':[media]}}]};
}
async function service(t, options) {
    const server = createService(options);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = 'http://127.0.0.1:'+server.address().port;
    return {server, base, post(data={movie}, headers={}) {
        return fetch(base+'/v1/resolve', {method:'POST', headers:{'Content-Type':'application/json',...headers}, body:JSON.stringify(data)});
    }};
}
test('Ubuntu health declares no keys and no video proxy; media routes do not exist', async t => {
    let calls=0; const s=await service(t,{resolve:async()=>{calls++;return result();}});
    const health=await (await fetch(s.base+'/health')).json();
    assert.equal(health.auth,'none');assert.equal(health.videoProxy,false);assert.equal(health.ok,true);
    assert.equal((await fetch(s.base+'/proxy?url='+encodeURIComponent(media))).status,404);
    const preflight=await fetch(s.base+'/v1/resolve',{method:'OPTIONS'});
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
    assert.equal(calls,0);
});
test('metadata is cached briefly and fresh playback explicitly renews the source session',async t=>{
    let calls=0;const s=await service(t,{resolve:async()=>{calls++;return result();}});
    assert.equal((await s.post()).status,200);assert.equal((await s.post()).status,200);assert.equal(calls,1);
    assert.equal((await s.post({movie,fresh:true})).status,200);assert.equal(calls,2);
});
test('optional future keys reject missing and wrong keys but do not change the public beta default',async t=>{
    const s=await service(t,{keys:['fixture-key'],resolve:async()=>result()});
    assert.equal((await s.post()).status,401);
    assert.equal((await s.post({movie},{Authorization:'Bearer wrong'})).status,401);
    assert.equal((await s.post({movie},{Authorization:'Bearer fixture-key'})).status,200);
    assert.equal((await (await fetch(s.base+'/health')).json()).auth,'key');
});
test('bad and oversized requests cannot reach the provider',async t=>{
    let calls=0;const s=await service(t,{resolve:async()=>{calls++;return result();}});
    for(const data of [{movie:{}},{movie,season:-1},{movie,episode:'1'},{movie,season:1001},{movie:{title:'x'.repeat(181)}},{movie:{title:'X',media_type:'other'}}]) assert.equal((await s.post(data)).status,400);
    const r=await fetch(s.base+'/v1/resolve',{method:'POST',body:'x'.repeat(17000)});
    assert.equal(r.status,413);assert.equal(calls,0);
});
test('concurrency is bounded and source failures cannot expose signed URLs',async t=>{
    let release,started;const begun=new Promise(r=>started=r);
    const s=await service(t,{maxActive:1,resolve:()=>new Promise((r,reject)=>{release=()=>reject(Error('bad https://edge.vkvideo.cloud/token/secret'));started();})});
    const first=s.post();await begun;assert.equal((await s.post()).status,429);release();
    const r=await first;assert.equal(r.status,502);assert.equal((await r.json()).error,'bad [адреса]');
});
test('requests per client are bounded even when the metadata is cached',async t=>{
    const s=await service(t,{resolve:async()=>result()});
    for(let i=0;i<30;i++) assert.equal((await s.post()).status,200);
    assert.equal((await s.post()).status,429);
});
test('disconnect aborts the metadata request',async t=>{
    let signal,started;const begun=new Promise(r=>started=r);
    const s=await service(t,{resolve:(m,s,e,sig)=>new Promise((r,reject)=>{signal=sig;sig.addEventListener('abort',()=>reject(Error('cancelled')));started();})});
    const controller=new AbortController();
    const req=fetch(s.base+'/v1/resolve',{method:'POST',body:JSON.stringify({movie}),signal:controller.signal}).catch(()=>{});
    await begun;const aborted=new Promise(resolve=>signal.addEventListener('abort',resolve));controller.abort();await req;await aborted;
    assert.equal(signal.aborted,true);
});
test('resolver visits only title metadata and the player API, never a CDN or media resource',async()=>{
    const calls=[];
    const resolver=createResolver(async(url,options)=>{
        calls.push({url,options});
        let body;
        if(url==='https://uakinogo.is/') body='<div class="card__title"><a href="/42-fixture.html">Fixture film (2023)</a></div>Год выпуска: 2023';
        else if(url==='https://uakinogo.is/42-fixture.html') body='<h1>Fixture film (2023)</h1><span class="pmovie__original-title">Fixture film</span><iframe src="https://rarity-as.stravers.live?token=public&token_movie=42"></iframe>';
        else if(url.startsWith(Core.origin+'/?')) body='<meta name="viewporti" content="a"><script>fileList=JSON.parse(\'{"type":"movie","all":{"theatrical":{"t154":{"0":{"id":42,"id_translation":154}}}}}\')</script>';
        else if(url===Core.origin+'/bnsi/movies/42') body=JSON.stringify({hlsSource:[{label:'(Ukrainian) UA',quality:{2160:media}},{label:'(English) Original',quality:{1080:media}}]});
        else throw Error('Unexpected network '+url);
        return new Response(body);
    });
    const data=await resolver(movie);assert.equal(calls.length,4);assert.equal(data.tracks.length,2);
    assert.deepEqual(Core.resolverResult(data,0,0).tracks.map(t=>t.language),['uk','en']);
    assert.equal(calls.at(-1).options.headers.Origin,Core.origin);
    assert.equal(calls.some(c=>c.url.includes('vkvideo.cloud')),false);
    assert.equal(calls.every(c=>c.options.redirect==='manual'),true);
});
test('source redirects to a CDN, LAN, insecure URL or lookalike host stop before fetching them',async()=>{
    for(const url of [media,'http://uakinogo.is/','https://127.0.0.1/','https://uakinogo.is.evil.test/','https://uakinogo.is@evil.test/']) {
        const seen=[];const resolver=createResolver(async(u)=>{seen.push(u);return new Response(null,{status:302,headers:{location:url}});});
        await assert.rejects(resolver(movie),/Адреса поза джерелом/);
        assert.ok(seen.length);assert.ok(seen.every(u=>/^https:\/\/uakinogo\.(is|io)\/$/.test(u)));
    }
});
test('card input carries title metadata only and TV requests require a real episode',async()=>{
    assert.equal(card({...movie,url:'http://private/',key:'secret'}).url,undefined);
    let fetched=0;const resolver=createResolver(async()=>{fetched++;throw Error('unused');});
    await assert.rejects(resolver({name:'Friends',media_type:'tv'},0,0),/серія/);
    assert.equal(fetched,0);
});
test('TV accepts only a LAN HTTP or HTTPS resolver and validates the returned episode and media hosts',()=>{
    assert.equal(Core.resolverBase(' http://192.168.88.191:8787/ '),'http://192.168.88.191:8787');
    assert.equal(Core.resolverBase('https://resolver.example/base/'),'https://resolver.example/base');
    for(const u of ['http://public.example','https://user:pass@resolver.example/','file:///etc/passwd','http://192.168.1.1/?url=x','https://example/#x']) assert.equal(Core.resolverBase(u),'');
    assert.equal(Core.resolverResult(result(),0,0).tracks[0].qualities['2160p'][0],media);
    for(const change of [{schema:2},{episode:2},{referer:'https://evil.test/'},{origin:'https://evil.test'},{sourcePage:'https://uakinogo.is.evil.test/42-x.html'},{episodes:[]},{tracks:[{label:'EN',language:'en',qualities:{'2160p':['http://127.0.0.1/a']}}]}]) assert.throws(()=>Core.resolverResult({...result(),...change},0,0),/SERVER/);
});
