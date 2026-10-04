'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../lib/4klab/core');
test('worker asks Ubuntu only for metadata, renews on play and supplies Origin to every CDN request',()=>{
    const events=[],http=[],media=[],memory={},intervals=new Map();let nextPtr=1,lastUrl='',bodyPtr=0;
    function alloc(s){const ptr=nextPtr++;memory[ptr]=s;return ptr;}
    const source='https://edge.vkvideo.cloud/film/master.m3u8';
    const answer={schema:1,sourcePage:'https://uakinogo.is/42-fixture.html',referer:Core.origin+'/?token=public&token_movie=42',origin:Core.origin,season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'English',language:'en',qualities:{'2160p':[source]}}]};
    function XHR() {this.headers={};}
    XHR.prototype.open=function(method,url){this.method=method;this.url=url;};
    XHR.prototype.setRequestHeader=function(k,v){this.headers[k]=v;};
    XHR.prototype.send=function(body){http.push({url:this.url,method:this.method,body,headers:this.headers});this.status=200;this.responseText=this.url.includes('cacert.pem')?'BEGIN CERTIFICATE':JSON.stringify(answer);};
    const native={FS:{writeFile(){}},_lab_init:()=>1,_lab_listen:()=>12345,_lab_accept:()=>0,_lab_stop(){},_lab_close_client(){},_free(){},
        UTF8ToString:p=>memory[p]||'',lengthBytesUTF8:s=>Buffer.byteLength(s),_malloc:()=>nextPtr++,stringToUTF8:(s,p)=>memory[p]=s,
        _lab_range:()=>alloc(''),_lab_body:()=>bodyPtr,_lab_size:()=>Buffer.byteLength(memory[bodyPtr]||''),
        ccall(name,type,types,args){assert.equal(name,'lab_get');const [url,origin,referer,post,borth,range]=args;media.push({url,origin,referer,range});lastUrl=url;
            const content=url.includes('/master.m3u8')?'#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160,CODECS="av01,aac"\nvideo.m3u8':url.includes('/video.m3u8')?'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg.m4s\n#EXT-X-ENDLIST':'fixture media bytes';
            bodyPtr=alloc(content);return range?206:200;
        }};
    const ctx={self:{Faborn4KCore:Core,close(){}},postMessage:m=>events.push(m),importScripts(){},XMLHttpRequest:XHR,
        tizentvwasm:{SocketsManager:{}},FabornNative:()=>({then:fn=>fn(native)}),URL,setInterval(fn,ms){intervals.set(1,{fn,ms});return 1;},clearInterval:id=>intervals.delete(id)};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../lib/4klab/worker'),'utf8'),ctx);
    ctx.onmessage({data:{type:'init',base:'https://serg-ill.github.io/ukr-by-faborn/lib/4klab/',version:'test',token:'0123456789abcdef0123456789abcdef',server:'http://192.168.88.191:8787',movie:{title:'Fixture'},season:0,episode:0}});
    assert.equal(events.at(-1).type,'resolved');assert.equal(media.length,0);assert.equal(intervals.size,0);
    assert.equal(JSON.parse(http.at(-1).body).fresh,false);
    ctx.onmessage({data:{type:'play',season:0,episode:0,label:'English',language:'en',quality:'2160p'}});
    assert.equal(JSON.parse(http.at(-1).body).fresh,true);assert.equal(http.filter(r=>r.method==='POST').length,2);
    assert.ok(http.filter(r=>r.method==='POST').every(r=>r.url==='http://192.168.88.191:8787/v1/resolve'));
    assert.equal(events.at(-1).type,'play');assert.equal(events.at(-1).data.width,3840);assert.equal(intervals.size,1);
    assert.ok(media.every(r=>r.url.startsWith('https://edge.vkvideo.cloud/')&&r.origin===Core.origin&&r.referer===answer.referer));
    assert.equal(media.at(-1).range,'0-1023');
    // Simulate AVPlay requesting the initialization object through the TV loopback.
    const initURL=ctx.routes.add('https://edge.vkvideo.cloud/film/init.mp4');
    ctx.connection={request:'GET '+new URL(initURL).pathname+' HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n',parts:null};ctx.processRequest();
    assert.equal(media.at(-1).url,'https://edge.vkvideo.cloud/film/init.mp4');assert.equal(media.at(-1).origin,Core.origin);
    assert.equal(http.filter(r=>r.method==='POST').length,2);
    ctx.onmessage({data:{type:'stop'}});assert.equal(intervals.size,0);assert.equal(events.at(-1).type,'stopped');
});
