'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const create=require('../lib/4klab/kinobase-session');
const base='https://serg-ill.github.io/ukr-by-faborn/lib/4klab/';
function client(){
 const state={workers:[],timers:new Map(),next:0,replies:[],revoked:[]};
 function Worker(url){this.url=url;this.messages=[];state.workers.push(this);}
 Worker.prototype.postMessage=function(message){this.messages.push(message);};
 Worker.prototype.terminate=function(){this.terminated=true;};
 const root={Worker,WebAssembly,Blob,URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(v){state.revoked.push(v);}},setTimeout(fn,ms){const id=++state.next;state.timers.set(id,{fn,ms});return id;},clearTimeout(id){state.timers.delete(id);}};
 const api=create(root,base,'test');
 state.request=url=>api.request(url,(err,body,status)=>state.replies.push({error:err&&err.message,body,status}));
 state.send=(w,type,rest={})=>w.onmessage({data:{type,...rest}});
 return {api,state,root};
}
test('Samsung metadata client queues requests until ready and preserves response status',()=>{
 const {state}=client();state.request('https://kinobase.org/film/42-test');state.request('https://kinobase.org/user_data?test=1');
 const w=state.workers[0];assert.equal(w.messages.length,1);state.send(w,'ready');
 assert.equal(w.messages.length,2);state.send(w,'response',{id:1,status:200,body:'title'});
 assert.equal(w.messages.at(-1).id,2);state.send(w,'response',{id:2,status:404,body:'Not found'});
 assert.deepEqual(state.replies,[{error:null,body:'title',status:200},{error:'HTTP 404',body:'Not found',status:404}]);
 assert.equal(state.workers.length,1);assert.equal(state.timers.size,0);assert.equal(state.revoked.length,1);
});
test('cancelled native request ignores its late response and serially continues',()=>{
 const {state}=client();const a=state.request('https://kinobase.org/film/42-test');const w=state.workers[0];state.send(w,'ready');
 a.abort();state.request('https://kinobase.org/film/43-next');assert.equal(w.messages.length,2);
 state.send(w,'response',{id:1,status:200,body:'old'});assert.equal(w.messages.at(-1).id,2);
 state.send(w,'response',{id:2,status:200,body:'new'});assert.equal(state.replies.length,1);assert.equal(state.replies[0].body,'new');
});
test('a failed native request does not discard other queued sources or reuse its timeout',()=>{
 const {state,api}=client();state.request('https://kinobase.org/search?q=a');
 api.request('https://uaserials.my/',(error,body)=>state.replies.push({error:error&&error.message,body}),{metadata:true,post:'do=search&subaction=search&from_page=1&story=Test'});
 const w=state.workers[0];state.send(w,'ready');
 assert.equal([...state.timers.values()].filter(t=>t.ms===24000).length,1);
 assert.equal([...state.timers.values()].filter(t=>t.ms===60000).length,1);
 state.send(w,'requestError',{id:1,message:'NETWORK: connection failed'});
 assert.equal(w.messages.at(-1).id,2);assert.equal(w.terminated,undefined);
 state.send(w,'response',{id:2,status:200,body:'working source'});
 assert.equal(state.replies[1].body,'working source');assert.equal(state.timers.size,0);
});
test('card cancellation releases callbacks and waits for native teardown before reopening',()=>{
 const {state,api}=client();state.request('https://kinobase.org/search?q=a');const old=state.workers[0],late=old.onmessage;
 api.cancel();state.request('https://kinobase.org/search?q=b');assert.equal(state.workers.length,1);
 late({data:{type:'ready'}});assert.equal(old.messages.at(-1).type,'stop');
 state.send(old,'stopped');assert.ok(old.terminated);assert.equal(state.workers.length,2);
 const w=state.workers[1];state.send(w,'ready');state.send(w,'response',{id:2,status:200,body:'new'});
 assert.equal(state.replies.length,1);assert.equal(state.timers.size,0);
});
test('startup error fails all queued callbacks and does not expose signed addresses',()=>{
 const {state}=client();state.request('https://kinobase.org/film/42-test');state.request('https://kinobase.org/user_data?private=1');
 state.send(state.workers[0],'error',{message:'SOCKETS: API unavailable'});
 assert.equal(state.replies.length,2);assert.ok(state.replies.every(r=>r.error==='SOCKETS: API unavailable'));
 assert.equal(state.workers[0].messages.at(-1).type,'stop');state.send(state.workers[0],'stopped');assert.equal(state.timers.size,0);
});
test('an unavailable Samsung sockets API is remembered without repeated worker startup',()=>{
 const {state,api}=client();state.request('https://kinobase.org/search?q=a');const w=state.workers[0];
 state.send(w,'error',{message:'SOCKETS: API unavailable'});state.send(w,'stopped');
 state.request('https://kinobase.org/search?q=b');api.cancel();state.request('https://kinobase.org/search?q=c');
 assert.equal(state.workers.length,1);assert.equal(state.replies.length,3);assert.equal(state.timers.size,0);
});
test('source metadata options preserve the encoded search POST through the worker queue',()=>{
 const {state,api}=client(),post='do=search&subaction=search&from_page=1&story=%D0%A2%D0%B5%D1%81%D1%82';
 api.request('https://uaserials.my/',()=>{},{metadata:true,post});const w=state.workers[0];state.send(w,'ready');
 assert.equal(w.messages.at(-1).metadata,true);assert.equal(w.messages.at(-1).post,post);
 state.send(w,'response',{id:1,status:200,body:'search'});assert.equal(state.timers.size,0);
});
test('stuck native request times out once and worker termination is bounded',()=>{
 const {state}=client();state.request('https://kinobase.org/search?q=a');const w=state.workers[0];state.send(w,'ready');
 [...state.timers.values()].find(t=>t.ms===24000).fn();assert.equal(state.replies.length,1);assert.match(state.replies[0].error,/Час очікування/);
 [...state.timers.values()].find(t=>t.ms===23000).fn();assert.ok(w.terminated);assert.equal(state.timers.size,0);
});
test('aborting a hung in-flight request keeps teardown bounded and never calls its subscriber',()=>{
 const {state}=client();const req=state.request('https://kinobase.org/search?q=a'),w=state.workers[0];state.send(w,'ready');req.abort();
 [...state.timers.values()].find(t=>t.ms===24000).fn();assert.equal(state.replies.length,0);
 [...state.timers.values()].find(t=>t.ms===23000).fn();assert.ok(w.terminated);assert.equal(state.timers.size,0);
});
test('non-KinoBase media or missing worker support fails without any network',()=>{
 const {state,root}=client();state.request('https://primary.redcdn.org/movie.m3u8');assert.equal(state.workers.length,0);
 delete root.Worker;state.request('https://kinobase.org/search?q=a');assert.equal(state.workers.length,0);assert.equal(state.replies.length,2);
});
function worker(sockets=true){
 const state={messages:[],urls:[],stops:0,listens:0,status:200,body:'metadata',redirect:'',imports:[]};
 const Native={FS:{writeFile(){}},_lab_init(){return 1;},_lab_listen(){state.listens++;},_lab_stop(){state.stops++;},_lab_size(){return state.body.length;},_lab_body(){return 'body';},_lab_error(){return 'error';},_lab_location(){return 'location';},UTF8ToString(ptr){return ptr==='body'?state.body:ptr==='location'?state.redirect:'network failed';},ccall(name,type,types,args){state.urls.push(args);return state.status;}};
 function XHR(){this.status=200;this.responseText='BEGIN CERTIFICATE';} XHR.prototype.open=function(){};XHR.prototype.send=function(){};
 const context={postMessage(x){state.messages.push(x);},self:{close(){state.closed=true;}},XMLHttpRequest:XHR,importScripts(...args){state.imports.push(...args);},FabornNative(){return {then(cb){cb(Native);}};}};
 if(sockets)context.tizentvwasm={SocketsManager:{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../lib/4klab/kinobase-worker.js'),'utf8'),context);
 state.send=data=>context.onmessage({data});state.send({type:'init',base,version:'test'});
 return state;
}
test('metadata worker uses one native cookie context and never opens a listener',()=>{
 const s=worker();assert.equal(s.messages[0].type,'ready');
 for(const url of ['https://kinobase.org/serial/42-test','https://kinobase.org/user_data?q=1','https://kinobase.org/vod/42?q=2']) s.send({type:'request',id:1,url});
 assert.equal(s.urls.length,3);assert.ok(s.urls.every(args=>args.slice(1,6).every(v=>v==='')&&args[6]===8388608));
 assert.equal(s.listens,0);s.send({type:'stop'});assert.equal(s.stops,1);assert.ok(s.closed);
});
test('metadata worker rejects unsupported TV before loading WASM',()=>{
 const s=worker(false);assert.match(s.messages[0].message,/SOCKETS/);assert.equal(s.imports.length,0);assert.equal(s.urls.length,0);
});
test('metadata worker does not fetch foreign hosts, credentials, media or bad redirects',()=>{
 for(const url of ['https://kinobase.org.evil.test/user_data','https://evil@kinobase.org/user_data','https://kinobase.org:443/user_data','https://kinobase.org/user_data\r\nX: 1','http://kinobase.org/user_data','https://kinobase.org/private','https://primary.redcdn.org/stream.m3u8']){
  const s=worker();s.send({type:'request',id:1,url});assert.equal(s.urls.length,0,url);assert.equal(s.messages.at(-1).type,'requestError');
 }
 const s=worker();s.status=302;s.redirect='https://evil.test/leak';s.send({type:'request',id:1,url:'https://kinobase.org/film/42-test'});
 assert.equal(s.urls.length,1);assert.match(s.messages.at(-1).message,/HOST/);
});
test('metadata worker forwards a real HTTP 404 without treating it as a ready playlist',()=>{
 const s=worker();s.status=404;s.body='Not found';s.send({type:'request',id:8,url:'https://kinobase.org/user_data?secret=x'});
 assert.equal(s.messages.at(-1).type,'response');assert.equal(s.messages.at(-1).status,404);assert.equal(s.messages.at(-1).id,8);
});
test('source fallback worker supports all search forms, public title pages, known embeds and manifests',()=>{
 const post='do=search&subaction=search&from_page=1&story=Test%20film',s=worker();
 for(const url of ['https://uakino.best/ua/','https://uaserials.my/','https://uafix.net/search.html']){
  s.send({type:'request',id:1,metadata:true,url,post});assert.equal(s.messages.at(-1).type,'response',url);
  assert.equal(s.urls.at(-1)[3],post);
 }
 for(const url of ['https://uakino.best/filmy/genre_comedy/42-film.html','https://uaserials.my/5-film.html','https://uafix.net/serials/show/season-01-episode-01/',
  'https://ashdi.vip/vod/3306','https://zetvideo.net/serial/123','https://hdvbua.pro/embed/123/abc','https://video.ashdi.vip/film/master.m3u8?token=x']){
  s.send({type:'request',id:2,metadata:true,url});assert.equal(s.messages.at(-1).type,'response',url);assert.equal(s.urls.at(-1)[3],'');
 }
 assert.equal(s.listens,0);
});
test('source fallback rejects arbitrary writes, credentials, hosts and video-segment downloads',()=>{
 const post='do=search&subaction=search&from_page=1&story=Test';
 for(const request of [
  {url:'https://uakino.best/ua/',post:'do=login&password=secret'},
  {url:'https://uafix.net/account/',post},
  {url:'https://user:password@uaserials.my/',post},
  {url:'https://uaserials.my.evil.test/',post},
  {url:'http://uaserials.my/',post},
  {url:'https://uafix.net/search.html',post:post+'&extra=x'},
  {url:'https://uaserials.my/',post:post+'\r\nX:1'},
  {url:'https://hdvbua.pro/movie/segment.ts'},
  {url:'https://video.ashdi.vip/movie.mp4'},
  {url:'https://video.ashdi.vip/key.bin'},
  {url:'https://evil.test/master.m3u8'}
 ]){
  const s=worker();s.send({type:'request',id:1,metadata:true,...request});
  assert.equal(s.urls.length,0,request.url);assert.match(s.messages.at(-1).message,/HOST/);
 }
 const s=worker();s.status=307;s.redirect='https://uafix.net/search.html';s.send({type:'request',metadata:true,id:1,url:'https://uaserials.my/',post});
 assert.equal(s.urls.length,1);assert.match(s.messages.at(-1).message,/HOST/);
});
test('native iframe metadata uses only a validated public source Referer',()=>{
 const url='https://zetvideo.net/vod/19767',referer='https://uafix.net/films/oppengejmer/',s=worker();
 s.send({type:'request',id:1,metadata:true,url,referer});assert.equal(s.urls[0][2],referer);assert.equal(s.listens,0);
 for(const bad of ['https://uafix.net.evil.test/page/','https://user:pass@uafix.net/page/','https://uafix.net/page/\r\nCookie: value','https://evil.test/page/']){
  const s=worker();s.send({type:'request',id:1,metadata:true,url,referer:bad});assert.equal(s.urls.length,0);
 }
});

test('IntroDB metadata is allowed but arbitrary API paths, writes and redirects are rejected',()=>{
 const url='https://api.introdb.app/segments?imdb_id=tt0903747&season=1&episode=1',s=worker();s.send({type:'request',id:1,url});assert.equal(s.urls[0][0],url);assert.equal(s.listens,0);
 for(const bad of [url+'&url=https://evil.test',url+'#x','https://api.introdb.app/segments/submit','https://api.introdb.app.evil.test/segments?imdb_id=tt1&is_movie=true','https://api.introdb.app/segments?imdb_id=tt1&is_movie=true\n']){
 const t=worker();t.send({type:'request',id:1,url:bad});assert.equal(t.urls.length,0);
 }
 const c=client();c.state.request(url);assert.equal(c.state.workers.length,1);
});
