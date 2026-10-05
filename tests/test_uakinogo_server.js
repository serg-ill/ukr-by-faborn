'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createService} = require('../server/uakinogo/server');
const {createResolver, card, createUafixResolver} = require('../server/uakinogo/resolver');
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
test('large TMDB film and series cards resolve after client compaction with the same 16 KiB server limit',async t=>{
    const calls=[];const s=await service(t,{resolve:async(m,season,episode)=>{calls.push(m);return {...result(),season,episode,episodes:[{season,episode}]};}});
    for(const m of [movie,{name:'Fixture series',original_name:'Fixture series',first_air_date:'2024-02-29',media_type:'tv'}]){
        const full={...m,overview:'Опис '.repeat(2000),credits:{cast:Array.from({length:2},()=>({name:'Actor',biography:'Biography'.repeat(100)}))},user_key:'never-send-fixture'};
        const data={movie:full,season:m.media_type==='tv'?2:0,episode:m.media_type==='tv'?7:0,fresh:true};
        assert.ok(Buffer.byteLength(JSON.stringify(data))>16384);
        const before=calls.length;
        assert.equal((await s.post(data)).status,413);assert.equal(calls.length,before);
        const packed=Core.resolverCard(full);assert.deepEqual(packed,card(full));
        const small={...data,movie:packed};assert.ok(Buffer.byteLength(JSON.stringify(small))<1024);
        const response=await s.post(small);assert.equal(response.status,200);
        assert.equal(Core.resolverResult(await response.json(),data.season,data.episode).tracks.length,1);
        assert.equal(calls.length,before+1);assert.deepEqual(calls.at(-1),packed);
    }
});
test('client metadata bounds also keep escaped Unicode safely below the existing body limit',()=>{
    const fields=['title','original_title','name','original_name','release_date','first_air_date','original_language'];
    const m=Object.fromEntries(fields.map(k=>[k,'\u0001'.repeat(179)+'名']));m.media_type='movie';m.extra=m;
    const packed=Core.resolverCard(m);assert.deepEqual(packed,card(m));assert.ok(Buffer.byteLength(JSON.stringify({movie:packed,season:0,episode:0,fresh:true}))<16384);
    for(const bad of [null,[],{}, {title:123},{title:'x'.repeat(181)},{title:'X',media_type:'person'}])assert.throws(()=>Core.resolverCard(bad),/SERVER/);
});
test('HTTP failures name the actual request problem without misreporting a failed title search',()=>{
    assert.match(Core.resolverError(413,'{}'),/413.*запит завеликий/);
    assert.ok(!Core.resolverError(413,'{}').includes('не знайшов назву'));
    assert.match(Core.resolverError(401,''),/ключ/);assert.match(Core.resolverError(429,''),/зайнятий/);
    assert.match(Core.resolverError(502,JSON.stringify({error:'Назву, рік і тип не знайдено'})),/Назву, рік/);
    assert.ok(!Core.resolverError(502,JSON.stringify({error:'<img>bad https://edge.test/signed-secret'})).includes('signed-secret'));
    assert.match(Core.resolverError(502,'<html>upstream failed</html>'),/обробник повернув помилку/);
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
    assert.equal(Core.resolverBase('https://user:pass@resolver.example/'),'https://resolver.example');
    for(const u of ['http://public.example','file:///etc/passwd','http://192.168.1.1/?url=x','https://example/#x']) assert.equal(Core.resolverBase(u),'');
    assert.equal(Core.resolverResult(result(),0,0).tracks[0].qualities['2160p'][0],media);
    for(const change of [{schema:2},{episode:2},{referer:'https://evil.test/'},{origin:'https://evil.test'},{sourcePage:'https://uakinogo.is.evil.test/42-x.html'},{episodes:[]},{tracks:[{label:'EN',language:'en',qualities:{'2160p':['http://127.0.0.1/a']}}]}]) assert.throws(()=>Core.resolverResult({...result(),...change},0,0),/SERVER/);
});

const fixPage='https://uafix.net/films/oppengejmer/',fixEmbed='https://zetvideo.net/vod/19767';
const fixHtml='new Playerjs({file:"https://zetvideo.net/vid/fixture/hls/index.m3u8"})';
test('UAFix fallback fetches only its confirmed page and iframe with Referer, never the HLS or video',async()=>{
 const calls=[],resolver=createUafixResolver(async(url,options)=>{calls.push({url,options});return new Response(url===fixPage?'<iframe src="'+fixEmbed+'"></iframe>':fixHtml);});
 const controller=new AbortController(),data=await resolver({sourcePage:fixPage,embed:fixEmbed},controller.signal);
 assert.deepEqual(calls.map(c=>c.url),[fixPage,fixEmbed]);assert.equal(calls[1].options.headers.Referer,fixPage);
 assert.ok(calls.every(c=>c.options.redirect==='manual' && c.options.signal===controller.signal));
 assert.equal(data.playerHtml,fixHtml);assert.equal(data.provider,'uafix');assert.equal(data.schema,1);
});
test('UAFix metadata cannot request arbitrary hosts, media routes, redirects, or an unlisted player',async()=>{
 for(const patch of [{sourcePage:'http://uafix.net/films/a/'},{sourcePage:'https://uafix.net@127.0.0.1/films/a/'},{sourcePage:fixPage+'?url=secret'},{sourcePage:'https://uafix.net/films/a/../'},{embed:'https://zetvideo.net/vid/1/hls/index.m3u8'},{embed:'https://zetvideo.net.evil.test/vod/1'},{embed:'https://127.0.0.1/vod/1'}]){
  let calls=0;const resolve=createUafixResolver(async()=>{calls++;throw Error('unexpected');});
  await assert.rejects(resolve({sourcePage:fixPage,embed:fixEmbed,...patch}),/Некоректна сторінка/);assert.equal(calls,0);
 }
 for(const body of ['<iframe src="https://zetvideo.net/vod/999"></iframe>','<!-- <iframe src="'+fixEmbed+'"></iframe> -->','<script>var x=\'<iframe src="'+fixEmbed+'"></iframe>\';</script>','<div id="dle-comments"><iframe src="'+fixEmbed+'"></iframe>']){
  let calls=0;const resolve=createUafixResolver(async()=>{calls++;return new Response(body);});
  await assert.rejects(resolve({sourcePage:fixPage,embed:fixEmbed}),/не належить/);assert.equal(calls,1);
 }
 let calls=0;const redirect=createUafixResolver(async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});});
 await assert.rejects(redirect({sourcePage:fixPage,embed:fixEmbed}),/HTTP 302/);assert.equal(calls,1);
});
test('UAFix metadata applies response bounds and rejects an upstream soft 404 even with the right Referer',async()=>{
 for(const body of ['<title>404 Not Found</title>','x'.repeat(1024*1024+1)]){
  const resolve=createUafixResolver(async url=>new Response(url===fixPage?'<iframe src="'+fixEmbed+'"></iframe>':body));
  await assert.rejects(resolve({sourcePage:fixPage,embed:fixEmbed}),/не віддав|Завелика/);
 }
});
test('UAFix route shares authentication, cache revocation, metrics and cancellation with the resolver',async t=>{
 let calls=0,valid=true,signal,started;
 const begun=new Promise(r=>started=r),users={read:async()=>({enabled:true}),verify:async header=>valid&&header==='Basic Zml4dHVyZTpwYXNz'};
 const s=await service(t,{users,resolveUafix:async(input,sig)=>{calls++;if(input.embed.endsWith('/2')){signal=sig;started();await new Promise((r,j)=>sig.addEventListener('abort',()=>j(Error('cancelled'))));}return {schema:1,provider:'uafix',...input,playerHtml:fixHtml};}});
 const body={movie,sourcePage:fixPage,embed:fixEmbed};
 const post=(data=body,authorization='Basic Zml4dHVyZTpwYXNz',abort)=>fetch(s.base+'/v1/uafix/player',{method:'POST',headers:{Authorization:authorization},body:JSON.stringify(data),signal:abort});
 assert.equal((await post(body,'')).status,401);assert.equal(calls,0);
 assert.equal((await post()).status,200);assert.equal((await post()).status,200);assert.equal(calls,1);
 valid=false;assert.equal((await post()).status,401);assert.equal(calls,1);valid=true;
 assert.equal((await post({...body,embed:'https://127.0.0.1/vod/1'})).status,400);assert.equal(calls,1);
 const controller=new AbortController(),pending=post({...body,embed:'https://zetvideo.net/vod/2'},undefined,controller.signal).catch(()=>{});
 await begun;const aborted=new Promise(r=>signal.addEventListener('abort',r));controller.abort();await pending;await aborted;assert.equal(signal.aborted,true);
 const history=s.server.metrics.snapshot();assert.ok(history.total.requests>=5);
 assert.ok(history.events.some(e=>e.status===200&&e.cacheHit&&e.title===movie.title));assert.ok(history.events.some(e=>e.status===401));
 assert.equal((await (await fetch(s.base+'/health')).json()).videoProxy,false);
});
