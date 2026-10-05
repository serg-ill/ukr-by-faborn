'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../lib/4klab/core');
function harness(withSession=false){
    const events=[],http=[],media=[],memory={},intervals=new Map(),timeouts=new Map(),sockets=[],failures=[],operations=[];let nextPtr=1,lastUrl='',bodyPtr=0,nextTimer=1;
    function alloc(s){const ptr=nextPtr++;memory[ptr]=s;return ptr;}
    const source='https://edge.vkvideo.cloud/film/master.m3u8';
    const answer={schema:1,sourcePage:'https://uakinogo.is/42-fixture.html',referer:Core.origin+'/?token=public&token_movie=42',origin:Core.origin,season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'English',language:'en',qualities:{'2160p':[source]}}]};
    function XHR() {this.headers={};}
    XHR.prototype.open=function(method,url){this.method=method;this.url=url;};
    XHR.prototype.setRequestHeader=function(k,v){this.headers[k]=v;};
    XHR.prototype.send=function(body){http.push({url:this.url,method:this.method,body,headers:this.headers});this.status=body&&Buffer.byteLength(body)>16384?413:200;this.responseText=this.status===413?'{}':this.url.includes('cacert.pem')?'BEGIN CERTIFICATE':JSON.stringify(answer);};
    function Socket(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
    Socket.prototype.send=function(text){this.sent.push(JSON.parse(text));};
    Socket.prototype.close=function(){this.closed=true;this.readyState=3;};
    Socket.prototype.open=function(){this.readyState=1;this.onopen();};
    Socket.prototype.token=function(value){if(this.onmessage)this.onmessage({data:JSON.stringify({type:'config_update',edge_hash:value})});};
    const native={FS:{writeFile(){}},_lab_init:()=>1,_lab_listen:()=>12345,_lab_accept:()=>0,_lab_stop(){},_lab_close_client(){operations.push('client:close');},_lab_send:(ptr,amount)=>amount,_free(){},
        UTF8ToString:p=>memory[p]||'',lengthBytesUTF8:s=>Buffer.byteLength(s),_malloc:()=>nextPtr++,stringToUTF8:(s,p)=>memory[p]=s,
        _lab_range:()=>alloc(''),_lab_body:()=>bodyPtr,_lab_size:()=>Buffer.byteLength(memory[bodyPtr]||''),
        ccall(name,type,types,args){if(name==='lab_set_agent'){native.agent=args[0];return 1;}assert.ok(['lab_get','lab_get_media'].includes(name));const [url,origin,referer]=args,range=name==='lab_get_media'?args[3]:args[5],controls=name==='lab_get_media'?args[4]:'';media.push({url,origin,referer,range,controls});lastUrl=url;
            const raw={hlsSource:[{label:'English',audioId:'7',quality:{2160:source}}],...(withSession?{pnr:'wss://rarity-as.stravers.live/ws/',pnk:'public-session-fixture-1234'}:{})};
            const content=url.startsWith(Core.origin+'/?')?'<meta name="viewporti" content="fixture"><script>fileList=JSON.parse(\'{"type":"movie","all":{"theatrical":{"t154":{"0":{"id":42}}}}}\')</script>':url.includes('/bnsi/movies/')?JSON.stringify(raw):url.includes('/master.m3u8')?'#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160,CODECS="av01,aac"\nvideo.m3u8':url.includes('/video.m3u8')?'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg.m4s\n#EXT-X-ENDLIST':'fixture media bytes';
            bodyPtr=alloc(content);return range?206:200;
        }};
    const ctx={self:{Faborn4KCore:Core,WebSocket:Socket,close(){}},navigator:{userAgent:'Mozilla/5.0 (SMART-TV; Tizen 6.5)'},postMessage:m=>events.push(m),importScripts(){},XMLHttpRequest:XHR,
        tizentvwasm:{SocketsManager:{}},FabornNative:()=>({then:fn=>fn(native)}),URL,setTimeout(fn,ms){const id=nextTimer++;timeouts.set(id,{fn,ms});return id;},clearTimeout:id=>timeouts.delete(id),setInterval(fn,ms){const id=nextTimer++;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id)};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../lib/4klab/worker'),'utf8'),ctx);
    const get=native.ccall;native.ccall=function(name,type,types,args){if(failures.some(part=>args[0].includes(part)))return 403;return get(name,type,types,args);};
    return {ctx,events,http,media,intervals,timeouts,sockets,native,failures,operations,answer};
}
test('worker asks Ubuntu only for metadata, renews on play and supplies Origin to every CDN request',()=>{
    const {ctx,events,http,media,intervals,answer}=harness();
    const fullMovie={id:872585,title:'Оппенгеймер',original_title:'Oppenheimer',release_date:'2023-07-19',original_language:'en',media_type:'movie',overview:'Опис фільму '.repeat(5000),credits:{cast:[{name:'Fixture actor',biography:'Bio'.repeat(5000)}]},progress:{time:100},url:'https://unused.test/private',user_key:'never-send-fixture'};
    assert.ok(Buffer.byteLength(JSON.stringify({movie:fullMovie}))>16384);
    ctx.onmessage({data:{type:'init',base:'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/',version:'test',token:'0123456789abcdef0123456789abcdef',server:'http://192.168.88.191:8787',movie:fullMovie,season:0,episode:0}});
    assert.equal(events.at(-1).type,'resolved');assert.equal(media.length,0);assert.equal(intervals.size,0);
    assert.equal(JSON.parse(http.at(-1).body).fresh,false);
    ctx.onmessage({data:{type:'play',season:0,episode:0,label:'English',language:'en',quality:'2160p'}});
    assert.equal(JSON.parse(http.at(-1).body).fresh,true);assert.equal(http.filter(r=>r.method==='POST').length,2);
    assert.ok(http.filter(r=>r.method==='POST').every(r=>r.url==='http://192.168.88.191:8787/v1/resolve'));
    http.filter(r=>r.method==='POST').forEach(r=>{
        assert.ok(Buffer.byteLength(r.body)<1024);
        assert.deepEqual(JSON.parse(r.body).movie,Core.resolverCard(fullMovie));
        assert.ok(!r.body.includes('never-send-fixture'));
        assert.equal(JSON.parse(r.body).season,0);assert.equal(JSON.parse(r.body).episode,0);
    });
    assert.equal(events.at(-1).type,'play');assert.equal(events.at(-1).data.width,3840);assert.equal(intervals.size,1);
    assert.ok(media.filter(r=>Core.allowed(r.url,true)).every(r=>r.origin===Core.origin&&r.referer===answer.referer));
    assert.ok(media.some(r=>r.url.startsWith(Core.origin+'/bnsi/movies/')));
    assert.equal(media.at(-1).range,'0-1023');
    assert.ok(media.some(r=>r.url.endsWith('/init.mp4')&&r.range==='0-1023'));
    assert.equal([...intervals.values()][0].ms,40);
    // Simulate AVPlay requesting the initialization object through the TV loopback.
    const initURL=ctx.routes.add('https://edge.vkvideo.cloud/film/init.mp4');
    ctx.connection={request:'GET '+new URL(initURL).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};ctx.processRequest();
    assert.equal(media.at(-1).url,'https://edge.vkvideo.cloud/film/init.mp4');assert.equal(media.at(-1).origin,Core.origin);
    assert.equal(http.filter(r=>r.method==='POST').length,2);
    ctx.onmessage({data:{type:'stop'}});assert.equal(intervals.size,0);assert.equal(events.at(-1).type,'stopped');
});
function prepare(e){
    e.ctx.onmessage({data:{type:'init',base:'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/',version:'test',token:'0123456789abcdef0123456789abcdef',server:'http://192.168.88.191:8787',movie:{title:'Film'}}});
    e.ctx.onmessage({data:{type:'play',season:0,episode:0,label:'English',language:'en',quality:'2160p'}});
}
test('Basic is sent only to the clean metadata endpoint, never to CDN or local media URLs',()=>{
 const e=harness(),password='пароль:fixture';
 e.ctx.onmessage({data:{type:'init',base:'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/',version:'test',token:'0123456789abcdef0123456789abcdef',server:'test1:'+encodeURIComponent(password)+'@203.0.113.10:8099',movie:{title:'Film'}}});
 assert.equal(e.events.at(-1).type,'resolved');
 e.ctx.onmessage({data:{type:'play',season:0,episode:0,label:'English',language:'en',quality:'2160p'}});
 const posts=e.http.filter(r=>r.method==='POST');
 assert.equal(posts.length,2);
 for(const r of posts){assert.equal(r.url,'http://203.0.113.10:8099/v1/resolve');assert.equal(r.headers.Authorization,'Basic '+Buffer.from('test1:'+password).toString('base64'));assert.ok(!r.body.includes(password));}
 assert.equal(e.events.at(-1).type,'play');
 assert.ok(e.media.every(r=>!JSON.stringify(r).includes('Basic')&&!JSON.stringify(r).includes('test1')));
 assert.ok(!JSON.stringify(e.events).includes(password));
});
test('blocked initialization file is reported before AVPlay or its loopback polling starts',()=>{
    const e=harness();e.failures.push('/init.mp4');prepare(e);
    assert.equal(e.events.some(m=>m.type==='play'),false);assert.equal(e.intervals.size,0);
    assert.match(e.events.at(-1).data.message,/HTTP 403/);
});
test('an upstream failure finishes its HTTP response before asking the UI to close AVPlay',()=>{
    const e=harness();prepare(e);e.failures.push('/seg.m4s');
    const url=e.ctx.routes.add('https://edge.vkvideo.cloud/film/seg.m4s');
    e.ctx.connection={request:'GET '+new URL(url).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};
    e.ctx.processRequest();assert.equal(e.events.at(-1).type,'play');assert.ok(e.ctx.connection.error);
    e.ctx.tick();assert.equal(e.ctx.connection,null);assert.equal(e.operations.at(-1),'client:close');
    assert.equal(e.events.at(-1).type,'error');assert.match(e.events.at(-1).data.message,/HTTP 403/);
});
test('Back while a failed response is pending stops polling without reporting a stale error',()=>{
    const e=harness();prepare(e);e.ctx.connection={parts:[],error:new Error('HTTP 403')};
    e.ctx.onmessage({data:{type:'stop'}});assert.equal(e.ctx.connection,null);assert.equal(e.intervals.size,0);
    assert.equal(e.events.at(-1).type,'stopped');assert.equal(e.events.some(m=>m.type==='error'),false);
});
test('the local manifest probe gets CORS headers, valid rewritten HLS and no extra upstream request',()=>{
    const e=harness();prepare(e);const requests=e.media.length,url=e.events.at(-1).data.url;
    e.ctx.connection={request:'GET '+new URL(url).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};
    e.ctx.processRequest();const [header,data]=e.ctx.connection.parts;
    assert.match(e.native.UTF8ToString(header.ptr),/HTTP\/1.1 200 OK/);assert.match(e.native.UTF8ToString(header.ptr),/Access-Control-Allow-Origin: \*/);
    const body=e.native.UTF8ToString(data.ptr);assert.match(body,/^#EXTM3U\n/);assert.match(body,/http:\/\/127\.0\.0\.1:12345\/[a-f0-9]{32}\/\d+\.m3u8/);assert.ok(!body.includes('vkvideo.cloud'));
    assert.equal(e.media.length,requests);e.ctx.tick();assert.equal(e.ctx.connection,null);
    assert.ok(e.events.some(m=>m.type==='traffic'&&m.data.sentBytes>0));
});
test('an invalid route is diagnosed and closed without killing the valid stream worker',()=>{
    const e=harness();prepare(e);e.ctx.connection={request:'GET /wrong/0.m3u8 HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};
    e.ctx.processRequest();assert.equal(e.ctx.connection.status,404);assert.equal(e.events.at(-1).data.rejected,1);e.ctx.tick();
    assert.equal(e.ctx.connection,null);assert.equal(e.events.some(m=>m.type==='error'),false);
    const url=e.ctx.routes.add('https://edge.vkvideo.cloud/film/master.m3u8');
    e.ctx.connection={request:'HEAD '+new URL(url).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};e.ctx.processRequest();assert.equal(e.ctx.connection.status,200);assert.equal(e.ctx.connection.head,true);e.ctx.tick();assert.equal(e.ctx.connection,null);
});
test('Alloha media waits for the TV control session and uses its current token on every CDN request',()=>{
    const e=harness(true);prepare(e);
    assert.equal(e.events.some(m=>m.type==='play'),false);
    assert.equal(e.media.filter(r=>Core.allowed(r.url,true)).length,0);
    assert.equal(e.native.agent,e.ctx.navigator.userAgent);
    assert.equal(e.sockets.length,1);const ws=e.sockets[0];ws.open();
    assert.equal(ws.sent[0].type,'playback_start');assert.equal(ws.sent[0].resolution,'2160');assert.equal(ws.sent[0].track_id,'7');
    ws.token('a'.repeat(32));
    assert.equal(e.events.at(-1).type,'play');assert.equal(e.timeouts.size,0);
    assert.ok(e.media.filter(r=>Core.allowed(r.url,true)).every(r=>r.controls==='a'.repeat(32)));
    assert.ok(e.media.filter(r=>!Core.allowed(r.url,true)).every(r=>!r.controls));
    const url=e.ctx.routes.add('https://edge.vkvideo.cloud/film/seg.m4s');
    ws.token('b'.repeat(32));e.ctx.connection={request:'GET '+new URL(url).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};e.ctx.processRequest();
    assert.equal(e.media.at(-1).controls,'b'.repeat(32));
    e.ctx.onmessage({data:{type:'progress',current:90}});
    [...e.intervals.values()].find(t=>t.ms===30000).fn();assert.equal(ws.sent.at(-1).current_time,90);
    e.ctx.onmessage({data:{type:'stop'}});assert.ok(ws.closed);assert.equal(e.timeouts.size,0);assert.equal(e.intervals.size,0);
    assert.ok(!JSON.stringify(e.events).includes('a'.repeat(32)));
});
test('Back and a new episode invalidate pending WebSocket callbacks before they can start a player',()=>{
    const e=harness(true);prepare(e);const ws=e.sockets[0],late=ws.onmessage;
    e.ctx.onmessage({data:{type:'stop'}});
    late({data:JSON.stringify({type:'config_update',edge_hash:'a'.repeat(32)})});
    assert.ok(ws.closed);assert.equal(e.events.some(m=>m.type==='play'),false);assert.equal(e.timeouts.size,0);assert.equal(e.intervals.size,0);
    const second=harness(true);prepare(second);const old=second.sockets[0],callback=old.onmessage;
    second.ctx.onmessage({data:{type:'play',season:0,episode:0,label:'English',language:'en',quality:'2160p',job:2}});
    callback({data:JSON.stringify({type:'config_update',edge_hash:'a'.repeat(32)})});
    assert.ok(old.closed);assert.equal(second.events.some(m=>m.type==='play'),false);
    second.sockets[1].open();second.sockets[1].token('b'.repeat(32));assert.equal(second.events.at(-1).job,2);
});
test('an absent Alloha control token times out before video begins and releases its socket',()=>{
    const e=harness(true);prepare(e);e.sockets[0].open();
    e.sockets[0].token('invalid\r\nHeader: x');
    [...e.timeouts.values()][0].fn();
    assert.equal(e.events.at(-1).type,'error');assert.match(e.events.at(-1).data.message,/SESSION/);
    assert.equal(e.events.some(m=>m.type==='play'),false);assert.ok(e.sockets[0].closed);assert.equal(e.timeouts.size,0);assert.equal(e.intervals.size,0);
});
test('CDN 403 identifies the failing resource and closes the new control session',()=>{
    const e=harness(true);e.failures.push('/init.mp4');prepare(e);e.sockets[0].open();e.sockets[0].token('a'.repeat(32));
    assert.match(e.events.at(-1).data.message,/HTTP 403: Alloha CDN · ініціалізація відео/);
    assert.ok(e.sockets[0].closed);assert.equal(e.intervals.size,0);assert.equal(e.timeouts.size,0);
});
