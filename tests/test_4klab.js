'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../lib/4klab/core.js');
const createUI = require('../lib/4klab/ui.js');
const media = 'https://edge.vkvideo.cloud/film/master.m3u8?sig=example';
const key = '0123456789abcdef0123456789abcdef';

test('4K allowlist rejects credentials, ports, host spoofing, local IPs and insecure URLs', () => {
    for (const bad of ['http://edge.vkvideo.cloud/a','https://vkvideo.cloud.evil.test/a','https://evil@vkvideo.cloud/a','https://127.0.0.1/a','https://edge.vkvideo.cloud:443/a','https://edge.vkvideo.cloud/a\r\nOrigin: x','https://vkvideo.cloud\\@evil.test/a']) assert.equal(Core.allowed(bad,true),false,bad);
    assert.equal(Core.allowed(media,true),true);
    assert.equal(Core.allowed(Core.source,true),false);
    assert.equal(Core.allowed(Core.source),true);
});
test('source parser reads only the known embed and never runs inline scripts', () => {
    assert.equal(Core.player('<script>throw new Error()</script><iframe src="https://Rarity-as.stravers.live/?token_movie=a&amp;token=b"></iframe>'),'https://rarity-as.stravers.live/?token_movie=a&token=b&translation=154');
    assert.throws(()=>Core.player('<iframe src="https://other.stravers.live/?token=a&token_movie=b">'),/PLAYER/);
});
test('session decoding reverses public permutations without eval', () => {
    function bits(n) { return n ? Math.floor(Math.log2(n))+1 : 0; }
    function transform(str,groups,order) { return order.map(g=>str.split('').filter((v,i)=>groups[i]===g).join('')).join(''); }
    function prime(n) { for(let d=2;d*d<=n;d++) if(n%d===0)return false;return n>=2; }
    const original = 'fixture-public-session-for-parser-check';
    let p=original.length+1;while(!prime(p))p++;
    let idx=0,out='',seen=new Set();while(out.length<original.length){idx=(idx+2)%p;if(idx<original.length&&!seen.has(idx)){seen.add(idx);out+=original[idx];}}
    let groups=Array.from(out,(_,i)=>i?bits(i&-i)-1:bits(out.length-1));
    out=transform(out,groups,[...new Set(groups)].sort((a,b)=>a-b));
    groups=Array.from(out,(_,i)=>bits(i));out=transform(out,groups,[...new Set(groups)].sort((a,b)=>b-a));
    assert.equal(Core.decode(out),original);
    const html=`<meta name="viewporti" content="${out}"><script>fileList = JSON.parse('{"all":{"theatrical":{"t154":{"0":{"id":42}}}}}')</script>`;
    assert.deepEqual(Core.session(html),{id:'42',viewport:original});
    assert.throws(()=>Core.session("fileList=JSON.parse('x')"),/SESSION/);
});
test('tracks require a real 2160 entry and preserve Ukrainian, English and Russian labels', () => {
    const data={hlsSource:[{label:'(Russian) DUB',quality:{2160:media}},{label:'(English) Original',quality:{2160:media}},{label:'(Ukrainian) LeDoyen',quality:{2160:media}},{label:'English 1080 only',quality:{1080:media}},{label:'English bad host',quality:{2160:'https://evil.test/a.m3u8'}}]};
    assert.deepEqual(Core.tracks(data).map(t=>t.language),['uk','en','ru']);
});
test('4K must be proven by dimensions, never just a 2160 URL or label', () => {
    assert.throws(()=>Core.resolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n2160.m3u8'),/QUALITY/);
    assert.deepEqual(Core.resolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160,CODECS="av01,aac"\ntrack.m3u8'),{width:3840,height:2160,codecs:'av01,aac',uri:'track.m3u8'});
});
test('loopback rewrites master, map, segments and audio URLs through a private registry', () => {
    const routes=new Core.Routes(12345,key);
    const rewritten=routes.rewrite('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="en.m3u8"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg.m4s?part=1\n',media);
    const urls=[...rewritten.matchAll(/http:\/\/127\.0\.0\.1:12345\/[^"\n]+/g)].map(m=>m[0]);
    assert.equal(urls.length,3);
    assert.equal(routes.get(new URL(urls[0]).pathname),'https://edge.vkvideo.cloud/film/en.m3u8');
    assert.equal(routes.get(new URL(urls[2]).pathname),'https://edge.vkvideo.cloud/film/seg.m4s?part=1');
    assert.equal(routes.get('/wrong/0.m3u8'),'');
    assert.equal(routes.get('/'+key+'/https://evil.test'),'');
    assert.throws(()=>routes.rewrite('#EXTM3U\nhttps://127.0.0.1/secret',media),/HOST/);
    assert.throws(()=>routes.rewrite('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"',media),/зашифрований/);
});
test('HTTP routes only accept GET/HEAD, exact private paths and a single byte range', () => {
    const routes=new Core.Routes(12345,key),path=new URL(routes.add(media)).pathname;
    const request=`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:12345\r\nRange: bytes=1024-2047\r\n\r\n`;
    assert.deepEqual(Core.parseRequest(request,routes),{method:'GET',url:media,range:'1024-2047'});
    assert.throws(()=>Core.parseRequest(request.replace('GET','POST'),routes));
    assert.throws(()=>Core.parseRequest(request.replace('bytes=1024-2047','bytes=1-2,4-5'),routes));
    assert.throws(()=>Core.parseRequest(request.replace('Host: 127.0.0.1:12345','Host: external.test'),routes));
});

function harness() {
    const state={prefs:{faborn_ukr_lab4k:'off'},workers:[],timers:new Map(),menu:null,controller:'settings_component',played:null,closes:0,playerEvents:{},videoEvents:{},nextTimer:0};
    function listener(events) { return {follow(name,fn) { (events[name] ||= []).push(fn); }}; }
    function emit(events,name,data) { for(const fn of events[name] || []) fn(data); }
    function Worker(url) { this.url=url;this.messages=[];state.workers.push(this); }
    Worker.prototype.postMessage=function(data){this.messages.push(data);};
    Worker.prototype.terminate=function(){this.terminated=true;};
    const root={Worker,WebAssembly,Blob,Uint8Array,crypto:require('node:crypto').webcrypto,
        URL:{createObjectURL(){return 'blob:owned';},revokeObjectURL(){}},webapis:{avplay:{}},
        setTimeout(fn,ms){const id=++state.nextTimer;state.timers.set(id,{fn,ms});return id;},clearTimeout(id){state.timers.delete(id);}};
    const L={Storage:{get(k,d){return state.prefs[k] ?? d;},set(k,v){state.prefs[k]=v;},field(){return 'tizen';}},
        Controller:{toggle(name){state.controller=name;}},Select:{show(menu){state.menu=menu;state.controller='select';},hide(){state.menu=null;}},
        Player:{listener:listener(state.playerEvents),playdata(){return state.played;},playlist(){},play(data){state.played=data;state.controller='player';emit(state.playerEvents,'start',data);},close(){state.closes++;state.played=null;emit(state.playerEvents,'destroy');}},
        PlayerVideo:{listener:listener(state.videoEvents)}};
    const ui=createUI(root,L,'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/','0.1.0-beta.12');
    state.enable=()=>{state.prefs.faborn_ukr_lab4k='on';ui.open();};
    state.message=(type,data)=>state.workers.at(-1).onmessage({data:{type,data}});
    state.choose=action=>state.menu.onSelect(state.menu.items.find(r=>r.action===action));
    state.emitVideo=(name,data)=>emit(state.videoEvents,name,data);
    state.emitPlayer=(name,data)=>emit(state.playerEvents,name,data);
    return {ui,state,root,L};
}
test('off means no worker, timers, menu, network or player listener changes', () => {
    const {ui,state}=harness();ui.open();
    assert.equal(state.workers.length,0);assert.equal(state.timers.size,0);assert.equal(state.menu,null);assert.deepEqual(state.playerEvents,{});
});
test('browser without AVPlay reports unsupported and keeps native navigation usable', () => {
    const {ui,state,root}=harness();delete root.webapis;state.enable();
    assert.equal(state.workers.length,0);assert.match(state.menu.items[0].title,/AVPLAY/);
    state.menu.onBack();assert.equal(state.controller,'settings_component');assert.equal(state.menu,null);
});
test('cancel during startup ignores all stale worker replies and releases native worker', () => {
    const {state}=harness();state.enable();const w=state.workers[0],late=w.onmessage;
    state.menu.onBack();assert.equal(state.controller,'settings_component');
    late({data:{type:'tracks',data:[{index:0,label:'EN',language:'en'}]}});
    assert.equal(state.menu,null);assert.equal(w.messages.at(-1).type,'stop');
    w.onmessage({data:{type:'stopped'}});assert.equal(w.terminated,true);assert.equal(state.timers.size,0);
});
test('rapid retry waits for the old native worker to stop instead of allocating parallel engines', () => {
    const {ui,state}=harness();state.enable();const old=state.workers[0];
    state.menu.onBack();ui.open();assert.equal(state.workers.length,1);
    assert.match(state.menu.items[0].title,/Завершення попередньої/);
    old.onmessage({data:{type:'stopped'}});assert.equal(state.workers.length,2);assert.equal(old.terminated,true);
});
test('language selection launches only tokenized loopback and confirms playback only after time advances', () => {
    const {state}=harness();state.enable();
    state.message('tracks',[{index:7,label:'English <Original>',language:'en'}]);
    assert.match(state.menu.items[0].title,/&lt;Original&gt;/);state.choose('play');
    assert.deepEqual(state.workers[0].messages.at(-1),{type:'prepare',index:7});
    state.message('play',{url:'http://127.0.0.1:12345/'+key+'/0.m3u8',label:'English',language:'en',codecs:'av01,aac',width:3840,height:2160});
    assert.equal(state.controller,'player');assert.equal(state.played.faborn_4klab,true);
    assert.match(state.prefs.faborn_ukr_lab4k_status,/Передано AVPlay/);
    state.emitVideo('timeupdate',{current:2});assert.match(state.prefs.faborn_ukr_lab4k_status,/Відтворення почалося/);
    assert.equal(state.timers.size,0);
});
test('disabling closes only the owned test player, preserving ordinary streams and preferences', () => {
    const {ui,state}=harness();state.enable();
    state.played={url:'https://normal.example/movie.m3u8'};
    state.prefs.faborn_ukr_lab4k='off';ui.disable();
    assert.equal(state.closes,0);assert.equal(state.played.url,'https://normal.example/movie.m3u8');
    assert.equal(state.prefs.player,undefined);
});
test('starting an ordinary player while a source test is pending cancels the experiment', () => {
    const {state}=harness();state.enable();const late=state.workers[0].onmessage;
    state.played={url:'https://normal.example/movie.m3u8'};state.emitPlayer('start',state.played);
    late({data:{type:'tracks',data:[{index:0,label:'English',language:'en'}]}});
    assert.equal(state.workers[0].messages.at(-1).type,'stop');assert.equal(state.closes,0);
    assert.equal(state.played.url,'https://normal.example/movie.m3u8');
});
test('test player errors close its channel and restore a retry/close menu without infinite loading', () => {
    const {state}=harness();state.enable();state.message('play',{url:'http://127.0.0.1:12345/'+key+'/0.m3u8',label:'UA',language:'uk',codecs:'av01',width:3840,height:2160});
    state.emitVideo('error');assert.equal(state.closes,1);assert.match(state.menu.items[0].title,/PLAY:/);
    state.choose('close');assert.equal(state.controller,'settings_component');
});
test('malicious or external playback URL is rejected before invoking Lampa', () => {
    const {state}=harness();state.enable();state.message('play',{url:'https://other.test/video.m3u8'});
    assert.equal(state.played,null);assert.match(state.menu.items[0].title,/PLAY:/);
});
test('unsupported worker stops before any imports, WASM download or source request', () => {
    const events=[],ctx={postMessage(m){events.push(m);},clearInterval(){},self:{close(){}}};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../lib/4klab/worker.js'),'utf8'),ctx);
    ctx.onmessage({data:{type:'init',base:'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/',version:'test',token:key}});
    assert.match(events[0].data.message,/SOCKETS:/);
});
test('handwritten loader and parser remain compatible with the plugin ES5 target', () => {
    const acorn=require('../vendor/acorn.js');
    for(const name of ['core.js','ui.js','worker.js']) acorn.parse(fs.readFileSync(require.resolve('../lib/4klab/'+name),'utf8'),{ecmaVersion:5});
});
test('committed Samsung WASM and generated factory actually initialize together', async () => {
    const context={console,WebAssembly,Uint8Array,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,TextDecoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto};
    context.self=context;context.location={href:'https://example.test/native.js'};
    vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../lib/4klab/native.js'),'utf8'),context);
    await new Promise((resolve,reject)=>{
        const module=context.FabornNative({wasmBinary:fs.readFileSync(require.resolve('../lib/4klab/native.wasm')),noInitialRun:true,print(){},printErr(){},onAbort:reject});
        module.then(m=>{try {
            m.FS.writeFile('/cacert.pem',fs.readFileSync(require.resolve('../lib/4klab/cacert.pem')));
            assert.equal(m._lab_init(),1);assert.equal(m._lab_size(),0);assert.equal(typeof m._lab_listen,'function');
            assert.equal(m.ccall('lab_get','number',['string','string','string','string','string','string','number'],['http://invalid.test','','','','','',1024]),-1);
            m._lab_stop();resolve();
        } catch(error) { reject(error); }});
    });
});

test('card matching separates same-name movies and series, and rejects a different year',()=>{
    const movie={name:'Джентльмени',original_name:'The Gentlemen',first_air_date:'2024-03-07'};
    const page='<h1>Джентльмены 1-2 сезон (2024)</h1><span class="pmovie__original-title">The Gentlemen</span>';
    assert.equal(Core.matches(page,movie),true);
    assert.equal(Core.matches(page,{title:'The Gentlemen',release_date:'2019-01-01'}),false);
    assert.equal(Core.matches(page.replace('2024','2021'),movie),false);
    assert.equal(Core.matches(page.replace('The Gentlemen','Different series'),movie),false);
    const search='<div class="card__title"><a href="/84-film.html">Джентльмены (2019)</a></div>Год выпуска: 2019<div class="card__title"><a href="/936-series.html">Джентльмены (1-2 сезон)</a></div>Год выпуска: 2024';
    assert.deepEqual(Core.search(search,'https://uakinogo.is',movie).map(r=>r.url),['https://uakinogo.is/936-series.html']);
});
test('series metadata selects the actual episode and prefers Ukrainian without requiring it',()=>{
    const info={files:{type:'serial',all:{1:{1:{t66:{id:10,id_translation:66},t154:{id:11,id_translation:154}},2:{t93:{id:12,id_translation:93}}},2:{1:{t66:{id:13,id_translation:66}}}}}};
    assert.deepEqual(Core.episodes(info),[{season:1,episode:1},{season:1,episode:2},{season:2,episode:1}]);
    assert.deepEqual(Core.entry(info,1,1),{id:'11',audio:154});
    assert.deepEqual(Core.entry(info,1,2),{id:'12',audio:93});
    assert.throws(()=>Core.entry(info,1,3),/EPISODE/);
});
test('card tracks retain real lower qualities and verify dimensions for the chosen quality',()=>{
    const rows=Core.tracks({hlsSource:[{label:'(English) Original',quality:{1080:media,720:media}}]},true);
    assert.deepEqual(Object.keys(rows[0].qualities),['720p','1080p']);
    assert.equal(Core.tracks({hlsSource:[{label:'English',quality:{1080:media}}]}).length,0);
    assert.equal(Core.resolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\na.m3u8','1080p').height,1080);
    assert.throws(()=>Core.resolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\na.m3u8','1080p'),/QUALITY/);
});
test('background card discovery never steals navigation and sends the current card to the worker',()=>{
    const {ui,state}=harness(),received=[];
    state.prefs.faborn_ukr_lab4k='on';state.controller='faborn_ukr_view';
    const movie={name:'Джентльмени',original_name:'The Gentlemen',first_air_date:'2024-03-07'};
    ui.discover(movie,1,2,{stage:s=>received.push(s),result:r=>received.push(r)});
    assert.equal(state.controller,'faborn_ukr_view');assert.equal(state.menu,null);
    const init=state.workers[0].messages[0];assert.deepEqual(init.movie,movie);assert.equal(init.episode,2);
    state.message('resolved',{tracks:[{label:'English',language:'en',qualities:['2160p']}],episodes:[{season:1,episode:2}],season:1,episode:2});
    assert.equal(received.at(-1).episode,2);assert.equal(state.menu,null);
    ui.episode(2,1);assert.equal(state.workers[0].messages.at(-1).type,'episode');
    ui.cancel();assert.equal(state.menu,null);assert.equal(state.controller,'faborn_ukr_view');
});
test('card incompatibility is returned to source status without replacing the source menu',()=>{
    const {ui,state,root}=harness();delete root.webapis;state.prefs.faborn_ukr_lab4k='on';
    let error;ui.discover({title:'Film'},0,0,{error:e=>error=e});
    assert.match(error,/AVPLAY/);assert.equal(state.menu,null);assert.equal(state.workers.length,0);
});
test('card playback keeps the selected language, quality and per-episode history data',()=>{
    const {ui,state}=harness();state.prefs.faborn_ukr_lab4k='on';let backs=0;
    ui.discover({name:'Friends'},1,2,{playerData(){return {title:'Friends · S1E2',season:1,episode:2,timeline:{time:60}}},back(){backs++}});
    state.message('resolved',{tracks:[],episodes:[],season:1,episode:2});
    ui.playChoice({season:1,episode:2,label:'English',language:'en',quality:'1080p'});
    const command=state.workers[0].messages.at(-1);assert.equal(command.type,'play');assert.equal(command.quality,'1080p');assert.equal(command.language,'en');
    state.message('play',{url:'http://127.0.0.1:12345/'+key+'/0.m3u8',label:'English',quality:'1080p',width:1920,height:1080,codecs:'avc1,aac'});
    assert.equal(state.played.episode,2);assert.equal(state.played.timeline.time,60);assert.deepEqual(Object.keys(state.played.quality),['1080p']);
    state.emitVideo('timeupdate',{current:3});assert.match(state.prefs.faborn_ukr_lab4k_status,/1080p/);assert.equal(backs,0);
});
test('switching to a normal source stops the adapter but permits a later card choice',()=>{
 const {ui,state}=harness();state.prefs.faborn_ukr_lab4k='on';
 ui.discover({title:'Film'},0,0,{});state.message('resolved',{tracks:[],episodes:[],season:0,episode:0});
 const old=state.workers[0];ui.cancel(true);old.onmessage({data:{type:'stopped'}});
 ui.playChoice({season:0,episode:0,label:'English',language:'en',quality:'1080p'});
 assert.equal(state.workers.length,2);assert.equal(state.workers[1].messages[0].choice.quality,'1080p');
 assert.equal(state.workers[1].messages[0].movie.title,'Film');
});
