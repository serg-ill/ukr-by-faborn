'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const factory=require('../lib/faborn-player');

function environment(options={}) {
 const jobs=new Map(),events={},calls=[],controllers={},notices=[],progress=[],statuses=[],errors=[];
 let now=0,serial=0,controller='full_start';
 function element(tag){
  const e={tagName:tag,children:[],style:{},attrs:{},className:'',textContent:'',scrollTop:0,clientHeight:400,offsetTop:0,offsetHeight:45,
   appendChild(child){child.parentNode=this;this.children.push(child);return child;},removeChild(child){this.children=this.children.filter(x=>x!==child);child.parentNode=null;},
   insertBefore(child,before){child.parentNode=this;const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,child);return child;},
   setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k];},getBoundingClientRect(){return {left:0,width:100};}};
  let content='';Object.defineProperty(e,'textContent',{get:()=>content,set(value){content=value;this.children=[];}});
  e.classList={contains:c=>e.className.split(' ').includes(c),add(c){if(!this.contains(c))e.className+=' '+c;},remove(c){e.className=e.className.split(' ').filter(x=>x!==c).join(' ');},toggle(c,on){if(on)this.add(c);else this.remove(c);}};
  return e;
 }
 const doc={head:element('head'),body:element('body'),createElement:element,addEventListener(n,fn){(events[n] ||= []).push(fn);}};
 const avState={state:'NONE',time:0,duration:1000000,listeners:{},prepared:[],url:'',subtitle:false};
 const av={
  getState(){return avState.state;},getCurrentTime(){return avState.time;},getDuration(){return avState.duration;},
  open(url,options){assert.equal(avState.state,'NONE');calls.push(['open',url]);avState.openOptions=options;avState.url=url;avState.time=0;avState.state='IDLE';},
  setListener(l){avState.listeners=l;},setDisplayRect(...r){assert.equal(avState.state,'IDLE');calls.push(['rect',...r]);},setDisplayMethod(v){calls.push(['display',v]);},
  setSilentSubtitle(v){avState.subtitle=v;},setStreamingProperty(k,v){assert.equal(avState.state,'IDLE');calls.push(['property',k,v]);if(options.propertyError)throw {name:'NotSupportedError'};},
  prepareAsync(ok,fail){assert.equal(avState.state,'IDLE');calls.push(['prepare']);avState.prepared.push({ok,fail});},
  play(){assert.ok(['READY','PAUSED','PLAYING'].includes(avState.state));avState.state='PLAYING';calls.push(['play']);},
  pause(){assert.equal(avState.state,'PLAYING');avState.state='PAUSED';calls.push(['pause']);},
  stop(){assert.ok(['READY','PLAYING','PAUSED'].includes(avState.state));avState.state='IDLE';calls.push(['stop']);},close(){avState.state='NONE';calls.push(['close']);},
  seekTo(ms,ok,fail){calls.push(['seek',ms]);if(options.seekPending){avState.seek={ok,fail};return;}if(options.seekError)return fail({name:'InvalidValuesError'});avState.time=ms;ok();},
  getTotalTrackInfo(){return options.tracks || [{type:'AUDIO',index:0,extra_info:'{"language":"uk"}'},{type:'TEXT',index:2,extra_info:'{"track_lang":"en"}'}];},
  setSelectTrack(type,index){assert.equal(avState.state,'PLAYING');calls.push(['track',type,index]);}
 };
 const requests=[];
 const root={document:doc,webapis:{avplay:av},addEventListener(n,fn){(events[n] ||= []).push(fn);},
  setTimeout(fn,ms){jobs.set(++serial,{fn,at:now+ms});return serial;},clearTimeout(id){jobs.delete(id);},
  setInterval(fn,ms){jobs.set(++serial,{fn,at:now+ms,interval:ms});return serial;},clearInterval(id){jobs.delete(id);},
  XMLHttpRequest:function(){requests.push(this);this.open=(_,url)=>{this.url=url;};this.send=()=>{};this.abort=()=>{this.aborted=true;};}
 };
 const store={...options.storage},L={Storage:{get(k,f){return Object.hasOwn(store,k)?store[k]:f;}},Noty:{show(t){notices.push(t);}},
  Player:{opened:()=>!!options.nativeOpened},Controller:{add(k,v){controllers[k]=v;},enabled(){return {name:controller};},toggle(k){controller=k;if(controllers[k]?.toggle)controllers[k].toggle();}},
  Screensaver:{enabled:true,stop(){},disable(){this.enabled=false;},enable(){this.enabled=true;},resetTimer(){}}
 };
 const api=factory(root,L);let closed=0;
 function spec(extra={}){return {url:'https://primary.redcdn.org/2160/main.m3u8',quality:'2160p',qualities:['2160p','1080p'],title:'Фільм',detail:'KinoBase · Українська · 2160p',onTime:e=>progress.push(e),onStatus:s=>statuses.push(s),onError:e=>errors.push(e),onClose:()=>closed++,...extra};}
 function advance(ms){const end=now+ms;let count=0;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('timer loop');const [id,j]=next;now=j.at;jobs.delete(id);if(j.interval)jobs.set(id,{...j,at:now+j.interval});j.fn();}now=end;}
 function all(){const out=[];function visit(e){out.push(e);e.children.forEach(visit);}visit(doc.body);return out;}
 function click(label){const el=all().find(e=>e.attrs['aria-label']===label || e.tagName==='button'&&e.children.some(c=>c.textContent===label));assert.ok(el,'Missing '+label);el.onclick({clientX:50});}
 function prepare(){const p=avState.prepared.at(-1);avState.state='READY';p.ok();}
 function at(seconds){avState.time=seconds*1000;avState.listeners.oncurrentplaytime?.(avState.time);}
 function key(type,code,repeat=false){const ev={keyCode:code,repeat,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};(events[type]||[]).forEach(fn=>fn(ev));return ev;}
 return {api,root,L,doc,store,spec,advance,prepare,at,key,all,click,calls,jobs,events,avState,controllers,progress,statuses,errors,requests,notices,get closed(){return closed;},get controller(){return controller;}};
}

test('beta player is ES5 and uses no eval, native executable or video proxy',()=>{
 const source=fs.readFileSync(require.resolve('../lib/faborn-player'),'utf8');require('../vendor/acorn').parse(source,{ecmaVersion:5});
 assert.doesNotMatch(source,/eval\(|new Function|\.wasm|localhost|:has\(/);
});
test('constructing the optional player has no side effects, and unavailable AVPlay is rejected',()=>{
 const e=environment();assert.equal(e.doc.head.children.length,0);assert.equal(e.jobs.size,0);assert.equal(e.calls.length,0);
 const bad=factory({...e.root,webapis:{}},e.L);assert.equal(bad.available(),false);assert.throws(()=>bad.play(e.spec()),/AVPlay/);assert.equal(e.doc.body.children.length,0);
});
test('direct launch uses fixed AVPlay coordinates, idle UHD setup and prepare before play',()=>{
 const e=environment();e.api.play(e.spec({legacy4k:true}));
 assert.deepEqual(e.calls.map(c=>c[0]),['open','rect','display','property','prepare']);assert.deepEqual(e.calls[1],['rect',0,0,1920,1080]);
 assert.equal(e.controller,'faborn_player_beta');assert.equal(e.L.Screensaver.enabled,false);e.prepare();e.at(1);
 assert.equal(e.avState.state,'PLAYING');assert.ok(e.progress.length);e.advance(45000);assert.equal(e.errors.length,0);
 e.api.close();assert.equal(e.controller,'full_start');assert.equal(e.closed,1);assert.equal(e.jobs.size,0);assert.equal(e.L.Screensaver.enabled,true);assert.equal(e.doc.body.children.length,0);assert.equal(e.doc.body.classList.contains('player--viewing'),false);
});
test('unsupported optional UHD property does not prevent ordinary launch',()=>{
 const e=environment({propertyError:true}),legacy=[];e.api.play(e.spec({legacy4k:true,onLegacy:x=>legacy.push(x)}));e.prepare();e.at(1);
 assert.equal(e.avState.state,'PLAYING');assert.match(legacy[0],/недоступний/);e.api.close();
});
test('Back during prepare invalidates late callbacks, consumes key release and frees AVPlay',()=>{
 const e=environment();e.api.play(e.spec());const old=e.avState.prepared[0],listener=e.avState.listeners;
 assert.ok(e.key('keydown',10009).prevented);assert.ok(e.key('keyup',10009).prevented);assert.equal(e.controller,'full_start');assert.equal(e.closed,1);
 old.ok();old.fail('PLAYER_ERROR_CONNECTION_FAILED');listener.oncurrentplaytime(10000);listener.onstreamcompleted();e.advance(50000);
 assert.equal(e.progress.length,0);assert.equal(e.calls.filter(c=>c[0]==='play').length,0);assert.equal(e.jobs.size,0);
});
test('an open Lampa player is never stopped or replaced',()=>{
 const e=environment({nativeOpened:true});assert.throws(()=>e.api.play(e.spec()),/закрий/);assert.equal(e.calls.length,0);assert.equal(e.doc.body.children.length,0);
});
test('progress callback can close the player without recursion or stale subtitle access',()=>{
 const e=environment();let stop=false,count=0;
 e.api.play(e.spec({onTime(){count++;if(stop)e.api.close();}}));e.prepare();e.at(20);stop=true;
 assert.doesNotThrow(()=>e.at(21));assert.equal(e.closed,1);assert.equal(e.api.active(),false);assert.equal(e.jobs.size,0);assert.ok(count<4);
});
test('holding Back through close cannot leak into the restored source menu',()=>{
 const e=environment();e.api.play(e.spec());e.prepare();e.at(1);
 assert.ok(e.key('keydown',10009).prevented);assert.ok(e.key('keydown',10009).prevented);assert.ok(e.key('keyup',10009).prevented);
 assert.equal(e.closed,1);assert.equal(e.key('keydown',10009).prevented,undefined);
});
test('startup timeout tries at most three supplied mirrors of the selected quality then stops',()=>{
 const e=environment(),urls=['a','b','c','d'].map(h=>'https://'+h+'.redcdn.org/2160/main.m3u8');e.api.play(e.spec({urls}));e.advance(135000);
 assert.deepEqual(e.calls.filter(c=>c[0]==='open').map(c=>c[1]),urls.slice(0,3));assert.equal(e.errors.length,1);assert.match(e.errors[0],/StartupTimeout/);
 assert.ok(e.all().some(el=>el.textContent==='Відео не запустилося'));e.api.close();assert.equal(e.jobs.size,0);
});
test('unsupported format never silently falls back to another quality and reports a safe error',()=>{
 const e=environment();e.api.play(e.spec());e.avState.prepared[0].fail({message:'PLAYER_ERROR_NOT_SUPPORTED_FORMAT https://secret/token?a=private'});e.advance(0);
 assert.equal(e.calls.filter(c=>c[0]==='open').length,1);assert.match(e.errors[0],/NOT_SUPPORTED_FORMAT/);assert.doesNotMatch(e.errors.join(''),/secret|private/);
 e.api.close();
});
test('only an explicitly owned tokenized loopback can use HTTP in the beta player',()=>{
 const url='http://127.0.0.1:12345/0123456789abcdef0123456789abcdef/0.m3u8';
 const e=environment();e.api.play(e.spec({url,loopback:url}));assert.equal(e.avState.url,url);e.prepare();e.at(1);e.api.close();
 for(const bad of ['http://192.168.88.191/video.m3u8','http://localhost:12345/video.m3u8','http://127.0.0.1:12345/short/0.m3u8']){
  const denied=environment();denied.api.play(denied.spec({url:bad,loopback:bad}));assert.equal(denied.calls.some(c=>c[0]==='open'),false);denied.api.close();
 }
 const unowned=environment();unowned.api.play(unowned.spec({url}));assert.equal(unowned.calls.some(c=>c[0]==='open'),false);unowned.api.close();
});
test('Alloha failure captures bounded codec details and Back closes the failed player in one action',()=>{
 const e=environment();e.api.play(e.spec({allohaDiagnostics:true}));const listener=e.avState.listeners;
 listener.onerror('PLAYER_ERROR_INVALID_OPERATION');
 listener.onerrormsg('PLAYER_ERROR_INVALID_OPERATION',JSON.stringify({error_code:42,codec:'AV1',demux:'HLS',resolution:'3840x2160',fps:24,hls_detail:'bufferAppendError',detail_info:'secret',url:'https://secret/token',headers:{Cookie:'private'}}));
 e.advance(0);assert.match(e.errors[0],/IDLE.*codec=AV1.*3840x2160/);assert.match(e.errors[0],/hls_detail=bufferAppendError/);assert.doesNotMatch(e.errors[0],/secret|private|https|Cookie/);
 const visibleError=e.all().find(el=>el.textContent===e.errors[0]);
 assert.ok(visibleError,'The retry dialog must expose the same safe cause as diagnostics');
 assert.doesNotMatch(e.all().map(el=>el.textContent).join(' '),/secret|private|https|Cookie/);
 e.key('keydown',10009);assert.equal(e.closed,1);assert.equal(e.controller,'full_start');assert.equal(e.avState.state,'NONE');assert.equal(e.jobs.size,0);
 listener.onerrormsg('error','not JSON');listener.onerror('PLAYER_ERROR_INVALID_OPERATION');e.advance(0);assert.equal(e.errors.length,1);
});
test('ordinary player failures keep the existing compact error dialog',()=>{
 const e=environment();e.api.play(e.spec());const listener=e.avState.listeners;
 listener.onerrormsg('HLSMediaError',JSON.stringify({error_code:3,demux:'MSE',hls_detail:'bufferAppendError'}));
 listener.onerror('HLSMediaError');e.advance(0);
 assert.match(e.errors[0],/hls_detail=bufferAppendError/);
 assert.ok(e.all().some(el=>el.textContent==='HLSMediaError'));
 assert.equal(e.all().some(el=>el.textContent===e.errors[0]),false);e.api.close();
});
test('native InvalidAccessError identifies preparation and safe HTTP status',()=>{
 const e=environment();e.api.play(e.spec());e.avState.listeners.onevent('PLAYER_MSG_HTTP_ERROR_CODE','403');
 e.avState.prepared[0].fail({name:'InvalidAccessError',message:'https://secret/token'});e.advance(0);
 assert.match(e.errors[0],/InvalidAccessError.*AVPlay IDLE.*prepareAsync.*HTTP 403/);assert.doesNotMatch(e.errors[0],/secret|https/);e.api.close();
});
test('selected browser transport mounts a video and never calls Samsung AVPlay',()=>{
 const e=environment({storage:{faborn_ukr_beta_engine:'mse'}}),transport={...e.root.webapis.avplay};
 transport.surface=()=>e.doc.createElement('video');transport.available=()=>true;
 Object.keys(e.root.webapis.avplay).forEach(key=>{e.root.webapis.avplay[key]=()=>{throw Error('Native AVPlay must not run');};});
 e.root.FabornHlsTransport=()=>transport;e.root.FabornHls=function(){};const api=factory(e.root,e.L);
 api.play(e.spec());e.prepare();e.at(1);assert.ok(e.all().some(el=>el.tagName==='video'));assert.match(e.statuses.at(-1),/MSE/);
 e.key('keydown',10009);assert.equal(api.active(),false);assert.equal(e.controller,'full_start');assert.equal(e.jobs.size,0);
});
test('browser network failures try only a supplied mirror of the selected stream',()=>{
 const e=environment({storage:{faborn_ukr_beta_engine:'mse'}}),transport={...e.root.webapis.avplay};
 transport.surface=()=>e.doc.createElement('video');transport.available=()=>true;
 e.root.FabornHlsTransport=()=>transport;e.root.FabornHls=function(){};const api=factory(e.root,e.L);
 const urls=['https://primary.redcdn.org/2160/main.m3u8','https://mirror.threnet.xyz/2160/main.m3u8'];
 api.play(e.spec({urls}));e.avState.prepared[0].fail({name:'HLSNetworkError'});e.advance(0);
 assert.deepEqual(e.calls.filter(c=>c[0]==='open').map(c=>c[1]),urls);assert.equal(e.errors.length,0);
 e.avState.prepared[1].fail({name:'NotSupportedError'});e.advance(0);assert.match(e.errors[0],/MSE IDLE.*prepareAsync/);api.close();assert.equal(e.jobs.size,0);
});
test('per-stream AVPlay compatibility preserves the browser preference and does not need MSE support',()=>{
 const e=environment({storage:{faborn_ukr_beta_engine:'mse'}});
 e.root.FabornHlsTransport=()=>{throw new Error('MSE must not be initialized for this stream');};
 assert.equal(e.api.available({engine:'avplay'}),true);
 e.api.play(e.spec({engine:'avplay',legacy4k:true,time:498}));e.prepare();e.at(499);
 assert.ok(e.all().some(el=>el.tagName==='object'));assert.ok(!e.all().some(el=>el.tagName==='video'));
 assert.deepEqual(e.calls.filter(c=>c[0]==='seek'),[['seek',498000]]);
 assert.match(e.statuses.at(-1),/AVPlay/);assert.equal(e.store.faborn_ukr_beta_engine,'mse');
 e.key('keydown',10009);assert.equal(e.closed,1);assert.equal(e.jobs.size,0);
});
test('quality changes can switch decoders and preserve progress, pause and Back ownership',()=>{
 const e=environment({storage:{faborn_ukr_beta_engine:'mse'}}),transport={...e.root.webapis.avplay};
 let browserOpens=0,nativeOpens=0;
 const open=transport.open;
 transport.open=url=>{browserOpens++;open(url);};
 e.root.webapis.avplay.open=url=>{nativeOpens++;open(url);};
 transport.surface=()=>e.doc.createElement('video');transport.available=()=>true;
 e.root.FabornHlsTransport=()=>transport;e.root.FabornHls=function(){};
 const api=factory(e.root,e.L);
 function request(action,done){done(null,e.spec({engine:action.quality==='2160p'?'avplay':'mse',quality:action.quality,request}));}
 api.play(e.spec({engine:'mse',quality:'1080p',request}));e.prepare();e.at(498);e.click('Пауза');
 const old=e.avState.listeners;
 api.change({type:'quality',quality:'2160p'});e.prepare();
 assert.equal(e.avState.state,'PAUSED');assert.equal(e.avState.time,498000);
 assert.equal(browserOpens,1);assert.equal(nativeOpens,1);
 assert.equal(e.all().filter(el=>el.tagName==='object').length,1);assert.ok(!e.all().some(el=>el.tagName==='video'));
 old.onerror('HLSMediaError');e.advance(0);assert.equal(e.errors.length,0);
 api.change({type:'quality',quality:'1080p'});e.prepare();
 assert.equal(e.avState.state,'PAUSED');assert.equal(e.avState.time,498000);assert.equal(browserOpens,2);
 assert.equal(e.all().filter(el=>el.tagName==='video').length,1);assert.ok(!e.all().some(el=>el.tagName==='object'));
 assert.equal(e.store.faborn_ukr_beta_engine,'mse');e.key('keydown',10009);
 assert.equal(e.closed,1);assert.equal(e.controller,'full_start');assert.equal(e.jobs.size,0);
});
test('decoder errors keep the failing state instead of the state after cleanup',()=>{
 const e=environment();e.api.play(e.spec());e.prepare();e.at(20);
 e.avState.listeners.onerror('PLAYER_ERROR_NOT_SUPPORTED_FORMAT');e.advance(0);
 assert.match(e.statuses.at(-1),/Помилка відтворення.*AVPlay PLAYING/);
 assert.equal(e.avState.state,'NONE');e.api.close();
});
function browserPlayer(e) {
 const transport={...e.root.webapis.avplay};
 transport.surface=()=>e.doc.createElement('video');transport.available=()=>true;
 e.root.FabornHlsTransport=()=>transport;e.root.FabornHls=function(){};
 return factory(e.root,e.L);
}
test('UAFix late HLSMediaError refreshes automatically, resumes at 25 minutes and bounds repeated failures',()=>{
 const e=environment(),api=browserPlayer(e),requests=[];e.avState.duration=3600000;
 const fresh='https://video.test/new-session/1080.m3u8';
 function spec(){return e.spec({engine:'mse',recoverInterrupted:true,quality:'1080p',voice:'uk-dub',request(action,done){requests.push(action);done(null,spec());},url:requests.length?fresh:'https://video.test/old-session/1080.m3u8'});}
 api.play(spec());e.prepare();e.at(1500);
 const old=e.avState.listeners;old.onerrormsg('HLSMediaError',JSON.stringify({error_code:3,demux:'MSE'}));old.onerror('HLSMediaError');e.advance(0);
 assert.deepEqual(requests,[{type:'recover'}]);assert.equal(e.avState.url,fresh);
 assert.equal(e.progress.at(-1).current,1500);assert.equal(e.progress.at(-1).force,true);
 e.prepare();assert.equal(e.avState.time,1500000);e.at(1501);
 old.onerror('HLSMediaError');e.advance(0);assert.equal(requests.length,1);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);
 assert.equal(requests.length,1);assert.ok(!e.all().some(n=>n.textContent==='Повторити запуск'));
 e.advance(1500);assert.equal(requests.length,2);e.prepare();assert.equal(e.avState.time,1501000);e.at(1502);
 e.avState.listeners.onerror('HLSMediaError');e.advance(4000);assert.equal(requests.length,3);e.prepare();e.at(1503);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);assert.equal(requests.length,3);assert.ok(e.all().some(n=>n.textContent==='Відтворення перервано'));
 e.click('Повторити запуск');assert.equal(requests.at(-1).type,'retry');e.prepare();assert.equal(e.avState.time,1503000);
 api.close();assert.equal(e.jobs.size,0);
});
test('UAFix network recovery preserves the current native engine and pause',()=>{
 const e=environment();let calls=0;
 const spec=()=>e.spec({recoverInterrupted:true,request(action,done){calls++;assert.equal(action.type,'recover');done(null,spec());}});
 e.api.play(spec());e.prepare();e.at(125);e.click('Пауза');e.avState.listeners.onerror('PLAYER_ERROR_CONNECTION_FAILED');e.advance(0);
 assert.equal(calls,1);e.prepare();assert.equal(e.avState.state,'PAUSED');assert.equal(e.avState.time,125000);
 e.api.close();assert.equal(e.jobs.size,0);
});
test('automatic recovery never retries initial media failures, unsupported codecs or other sources',()=>{
 for(const entry of [{initial:true,error:'HLSMediaError',opt:true},{initial:false,error:'NotSupportedError',opt:true},{initial:false,error:'HLSMediaError',opt:false},{initial:false,error:'HLSNetworkError',opt:false}]){
  const e=environment(),api=browserPlayer(e);let calls=0;
  api.play(e.spec({engine:'mse',recoverInterrupted:entry.opt,request(){calls++;}}));
  if(!entry.initial){e.prepare();e.at(125);}
  e.avState.listeners.onerror(entry.error);e.advance(0);
  assert.equal(calls,0,JSON.stringify(entry));assert.ok(e.all().some(n=>n.textContent==='Повторити запуск'));
  api.close();assert.equal(e.jobs.size,0);
 }
});
test('Back during UAFix recovery rejects a late fresh URL and frees the recovery timer',()=>{
 const e=environment(),api=browserPlayer(e);let reply;
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request(action,done){reply=done;}}));e.prepare();e.at(125);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);assert.ok(reply);
 e.key('keydown',10009);assert.equal(e.closed,1);assert.equal(e.jobs.size,0);
 reply(null,e.spec({engine:'mse',url:'https://video.test/new.m3u8'}));e.advance(45000);
 assert.equal(e.calls.filter(c=>c[0]==='open').length,1);assert.equal(e.controller,'full_start');assert.equal(e.avState.state,'NONE');
});
test('stalled UAFix refreshes retry without an error menu, then cancel and reject all late callbacks',()=>{
 const e=environment(),api=browserPlayer(e),replies=[];let cancelled=0;
 api.play(e.spec({engine:'mse',recoverInterrupted:true,cancelRequest(){cancelled++;},request(action,done){replies.push(done);}}));e.prepare();e.at(125);
 e.avState.listeners.onerror('HLSMediaError');e.advance(15000);
 assert.equal(cancelled,1);assert.ok(!e.all().some(n=>n.textContent==='Повторити запуск'));
 e.advance(1500);assert.equal(replies.length,2);replies[0](null,e.spec({engine:'mse'}));assert.equal(e.calls.filter(c=>c[0]==='open').length,1);
 e.advance(40000);assert.equal(replies.length,3);assert.ok(cancelled>=3);assert.match(e.errors.at(-1),/Три спроби/);assert.match(e.statuses.at(-1),/MSE PLAYING/);
 replies.forEach(reply=>{reply(null,e.spec({engine:'mse',url:'https://video.test/late.m3u8'}));reply(Error('late'));});
 assert.equal(e.calls.filter(c=>c[0]==='open').length,1);e.key('keydown',10009);assert.equal(e.jobs.size,0);
});
test('transient UAFix refresh errors retry up to three times while retaining progress and safe diagnostics',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request(action,done){calls++;done(Error('HTTP 403 https://secret/token'));done(null,e.spec({engine:'mse'}));}}));e.prepare();e.at(125);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);e.advance(30000);
 assert.equal(calls,3);assert.equal(e.progress.at(-1).current,125);assert.equal(e.calls.filter(c=>c[0]==='open').length,1);
 assert.match(e.errors.at(-1),/HTTP 403/);assert.doesNotMatch(e.errors.at(-1),/secret|token/);
 e.key('keydown',10009);assert.equal(e.jobs.size,0);
});
test('a failed refresh followed by success recovers without ever opening an error menu',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 function request(action,done){calls++;if(calls===1)return done(Error('HTTP 503'));done(null,e.spec({engine:'mse',recoverInterrupted:true,request}));}
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request}));e.prepare();e.at(125);e.avState.listeners.onerror('HLSMediaError');e.advance(1500);
 assert.equal(calls,2);e.prepare();assert.equal(e.avState.time,125000);e.at(126);
 assert.ok(!e.all().some(n=>n.textContent==='Повторити запуск'));api.close();assert.equal(e.jobs.size,0);
});
test('a refresh that prepares but cannot play retries automatically and shares one total deadline',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 function request(action,done){calls++;done(null,e.spec({engine:'mse',recoverInterrupted:true,request}));}
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request}));e.prepare();e.at(125);e.avState.listeners.onerror('HLSMediaError');e.advance(0);
 e.advance(15000);assert.ok(!e.all().some(n=>n.textContent==='Повторити запуск'));
 e.advance(1500);assert.equal(calls,2);e.advance(19000);assert.equal(calls,3);e.advance(15000);
 assert.ok(e.all().some(n=>n.textContent==='Повторити запуск'));assert.equal(e.progress.at(-1).current,125);api.close();assert.equal(e.jobs.size,0);
});
test('sixty seconds of advancing playback restores the automatic retry budget',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 function request(action,done){calls++;done(null,e.spec({engine:'mse',recoverInterrupted:true,request}));}
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request}));e.prepare();e.at(125);e.avState.listeners.onerror('HLSMediaError');e.advance(0);e.prepare();
 for(let s=126;s<=186;s++)e.at(s);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);assert.equal(calls,2,'A later outage gets an immediate first retry');
 e.prepare();assert.equal(e.avState.time,186000);api.close();assert.equal(e.jobs.size,0);
});
test('slow refreshes and stalled preparation cannot extend recovery beyond sixty seconds',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 function request(action,done){calls++;e.root.setTimeout(()=>done(null,e.spec({engine:'mse',recoverInterrupted:true,request})),14000);}
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request}));e.prepare();e.at(125);
 e.avState.listeners.onerror('HLSMediaError');e.advance(60000);
 assert.equal(calls,2);assert.match(e.errors.at(-1),/60 с/);assert.ok(e.all().some(n=>n.textContent==='Повторити запуск'));
 e.advance(20000);assert.equal(calls,2);api.close();assert.equal(e.jobs.size,0);
});
test('Back also cancels an automatic retry delay before its next network request',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request(action,done){calls++;done(Error('HTTP 503'));}}));e.prepare();e.at(125);
 e.avState.listeners.onerror('HLSMediaError');e.advance(0);assert.equal(calls,1);e.key('keydown',10009);e.advance(60000);
 assert.equal(calls,1);assert.equal(e.jobs.size,0);assert.equal(e.controller,'full_start');
});
test('UAFix AVPlay silently stuck in PLAYING starts refreshing after six seconds without progress',()=>{
 const e=environment();e.avState.duration=3600000;let calls=0;
 function request(action,done){calls++;assert.equal(action.type,'recover');done(null,e.spec({recoverInterrupted:true,request,url:'https://video.test/new-session.m3u8'}));}
 e.api.play(e.spec({recoverInterrupted:true,request}));e.prepare();e.at(1500);
 e.advance(5999);assert.equal(calls,0);assert.equal(e.avState.state,'PLAYING');
 e.advance(1);assert.equal(calls,1);assert.match(e.errors[0],/PlaybackStallTimeout.*AVPlay PLAYING/);
 assert.ok(!e.all().some(n=>n.textContent==='Повторити запуск'));e.prepare();assert.equal(e.avState.time,1500000);e.at(1501);
 e.api.close();assert.equal(e.jobs.size,0);
});
test('UAFix HLS buffering callbacks cannot hide a frozen playback clock',()=>{
 const e=environment(),api=browserPlayer(e);let calls=0;
 api.play(e.spec({engine:'mse',recoverInterrupted:true,request(){calls++;}}));e.prepare();e.at(125);
 for(let i=0;i<3;i++){e.avState.listeners.onbufferingstart();e.avState.listeners.onbufferingcomplete();e.advance(2000);}
 assert.equal(calls,1);assert.match(e.errors[0],/PlaybackStallTimeout.*MSE PLAYING/);api.close();assert.equal(e.jobs.size,0);
});
test('pause, a pending seek, completion and other sources never trigger the UAFix stall watchdog',()=>{
 for(const mode of ['pause','seek','completed','other-source']){
  const e=environment({seekPending:mode==='seek'});let calls=0;
  e.api.play(e.spec({recoverInterrupted:mode!=='other-source',request(){calls++;}}));e.prepare();e.at(125);
  if(mode==='pause')e.click('Пауза');
  if(mode==='seek'){e.click('+30 с');e.advance(350);}
  if(mode==='completed'){e.at(999);e.avState.listeners.onstreamcompleted();}
  e.advance(mode==='seek'?8000:25000);assert.equal(calls,0,mode);e.api.close();assert.equal(e.jobs.size,0);
 }
});
test('current-time polling without native time events is sufficient to prevent a false stall',()=>{
 const e=environment();let calls=0;e.api.play(e.spec({recoverInterrupted:true,request(){calls++;}}));e.prepare();e.at(125);
 for(let i=0;i<30;i++){e.avState.time+=1000;e.advance(1000);}
 assert.equal(calls,0);assert.equal(e.avState.state,'PLAYING');e.api.close();assert.equal(e.jobs.size,0);
});
test('an increasing buffer gets one four-second grace period, never an unbounded stall',()=>{
 const e=environment();let calls=0;e.api.play(e.spec({recoverInterrupted:true,request(){calls++;}}));e.prepare();e.at(125);
 e.advance(5000);e.avState.listeners.onbufferingprogress(25);e.advance(1000);assert.equal(calls,0);
 e.advance(3000);e.avState.listeners.onbufferingprogress(75);e.advance(999);assert.equal(calls,0);
 e.advance(1);assert.equal(calls,1);e.api.close();assert.equal(e.jobs.size,0);
});
test('normal buffering which resumes during its grace period does not reopen the stream',()=>{
 const e=environment();let calls=0;e.api.play(e.spec({recoverInterrupted:true,request(){calls++;}}));e.prepare();e.at(125);
 e.advance(5000);e.avState.listeners.onbufferingprogress(25);e.advance(3500);e.at(126);
 for(let i=127;i<=145;i++){e.advance(1000);e.at(i);}
 assert.equal(calls,0);assert.equal(e.calls.filter(c=>c[0]==='open').length,1);e.api.close();assert.equal(e.jobs.size,0);
});
test('recovery diagnostics preserve the cause and compare URLs without storing either address',()=>{
 for(const changed of [false,true]){
  const e=environment(),notes=[];let url='https://video.test/private-old/stream.m3u8';
  function spec(){return e.spec({url,recoverInterrupted:true,onRecovery:message=>notes.push(message),request(action,done){if(changed)url='https://video.test/private-new/stream.m3u8';done(null,spec());}});}
  e.api.play(spec());e.prepare();e.at(125);e.advance(6000);e.prepare();e.at(126);
  assert.match(notes.at(-1),/Відновлено.*2:05.*PlaybackStallTimeout/);assert.match(notes.at(-1),changed?/URL змінено/:/URL той самий/);
  assert.doesNotMatch(notes.join(' '),/https|private|m3u8/);e.api.close();assert.equal(e.jobs.size,0);
 }
});
test('the early HLS access-error option is passed only to an opted-in browser transport',()=>{
 for(const engine of ['mse','avplay'])for(const opted of [false,true]){
  const e=environment(),api=engine==='mse'?browserPlayer(e):e.api;
  api.play(e.spec({engine,recoverInterrupted:opted}));
  assert.deepEqual(e.avState.openOptions,engine==='mse'?{recoverInterrupted:opted}:undefined);
  api.close();assert.equal(e.jobs.size,0);
 }
});
test('an accepted resume seek without an advancing playback clock still times out',()=>{
 const e=environment();e.api.play(e.spec({time:210}));e.prepare();e.advance(45000);
 assert.equal(e.progress.length,0);assert.match(e.errors[0],/StartupTimeout/);e.api.close();
});
test('paused preparation does not fail; resuming restarts the playback watchdog',()=>{
 const e=environment();e.api.play(e.spec());e.prepare();e.click('Пауза');e.advance(45000);assert.equal(e.errors.length,0);
 e.click('Продовжити');e.advance(45000);assert.match(e.errors[0],/StartupTimeout/);e.api.close();
});
test('resume, pause, coalesced seeking and visibility preserve the current position',()=>{
 const e=environment();e.api.play(e.spec({time:210}));e.prepare();assert.deepEqual(e.calls.filter(c=>c[0]==='seek'),[['seek',210000]]);
 e.at(211);e.click('Пауза');assert.equal(e.avState.state,'PAUSED');assert.equal(e.progress.at(-1).force,true);
 e.click('+30 с');e.click('+30 с');e.advance(350);assert.deepEqual(e.calls.filter(c=>c[0]==='seek').at(-1),['seek',271000]);assert.equal(e.avState.state,'PAUSED');
 e.key('keydown',415);e.key('keyup',415);assert.equal(e.avState.state,'PLAYING');e.doc.hidden=true;e.events.visibilitychange[0]();assert.equal(e.avState.state,'PAUSED');e.api.close();
});
test('seek failure keeps the old position; closing a pending seek cannot restart playback',()=>{
 const e=environment({seekError:true});e.api.play(e.spec());e.prepare();e.at(55);e.click('+30 с');e.advance(350);assert.equal(e.progress.at(-1).current,55);assert.match(e.notices.at(-1),/перемотати/);e.api.close();
 const pending=environment({seekPending:true});pending.api.play(pending.spec({time:120}));pending.prepare();const seek=pending.avState.seek;pending.api.close();seek.ok();pending.advance(9000);assert.equal(pending.avState.state,'NONE');assert.equal(pending.progress.length,0);
});
test('quality switch preserves position and pause without opening the native Lampa player',()=>{
 const e=environment();let request;e.api.play(e.spec({request:(a,done)=>{request={a,done};}}));e.prepare();e.at(230);e.click('Пауза');e.click('Якість');e.click('1080p');
 assert.equal(request.a.type,'quality');request.done(null,e.spec({url:'https://primary.redcdn.org/1080/main.m3u8',quality:'1080p'}));e.prepare();
 assert.equal(e.avState.url,'https://primary.redcdn.org/1080/main.m3u8');assert.equal(e.avState.time,230000);assert.equal(e.avState.state,'PAUSED');e.api.close();
});
test('failed voice resolution resumes the old stream and Back cancels late resolution',()=>{
 const e=environment();let done;e.api.play(e.spec({request:(a,cb)=>{done=cb;}}));e.prepare();e.at(30);e.api.change({type:'voice',id:'en'});done(Error('Недоступно'));assert.equal(e.avState.state,'PLAYING');
 e.api.change({type:'next'});e.api.close();done(null,e.spec({url:'https://primary.redcdn.org/next.m3u8'}));assert.equal(e.calls.filter(c=>c[0]==='open').length,1);assert.equal(e.avState.state,'NONE');
});
test('real completion runs once, keeps visible controls and can advance at position zero',()=>{
 const e=environment();let completed=0,requests=0;
 const next=e.spec({title:'Серія 2'});e.api.play(e.spec({next:true,onEnded(){completed++;e.api.change({type:'next'});},request(a,done){requests++;assert.equal(a.type,'next');done(null,next);}}));e.prepare();
 const listener=e.avState.listeners;listener.onstreamcompleted();e.advance(0);assert.equal(completed,0);
 e.at(999);listener.onstreamcompleted();listener.onstreamcompleted();e.advance(0);assert.equal(completed,1);assert.equal(requests,1);e.prepare();assert.equal(e.avState.time,0);e.api.close();
});
test('last episode remains on an ended panel, and restart opens the same stream from zero',()=>{
 const e=environment();let action;e.api.play(e.spec({request(a,done){action=a;done(null,e.spec());}}));e.prepare();e.at(999);e.avState.listeners.onstreamcompleted();e.advance(0);
 assert.equal(e.all().find(n=>n.className==='fbp').attrs['data-state'],'ended');e.click('З початку');assert.equal(action.type,'restart');e.prepare();assert.equal(e.avState.time,0);e.api.close();
});
test('subtitles are text only and native selection restores pause',()=>{
 const e=environment();e.api.play(e.spec());e.prepare();e.at(1);e.click('Пауза');e.click('Субтитри');e.click('en · 1');
 assert.equal(e.avState.state,'PAUSED');assert.deepEqual(e.calls.filter(c=>c[0]==='track'),[['track','TEXT',2]]);e.avState.listeners.onsubtitlechange(1000,'<b>Hello</b><img src=x>');
 assert.equal(e.all().find(n=>n.className==='fbp-subtitle').textContent,'Hello');e.advance(1000);assert.equal(e.all().find(n=>n.className==='fbp-subtitle').textContent,'');e.api.close();
});
test('external SRT/WebVTT cues are bounded, timed and cancelled when closing',()=>{
 const e=environment();assert.deepEqual(e.api.parseSubtitles('WEBVTT\n\n00:01.000 --> 00:03.500\n<b>Привіт</b> &amp; hello\n\n').map(c=>[c.start,c.end,c.text]),[[1,3.5,'Привіт & hello']]);
 e.api.play(e.spec({subtitles:[{url:'https://cdn.test/a.vtt',label:'Українські'}]}));e.prepare();e.click('Субтитри');e.click('Українські');const r=e.requests[0];
 r.status=200;r.responseText='1\n00:00:01,000 --> 00:00:03,000\nHello\n\n';r.onload();e.at(2);assert.equal(e.all().find(n=>n.className==='fbp-subtitle').textContent,'Hello');e.at(4);assert.equal(e.all().find(n=>n.className==='fbp-subtitle').textContent,'');
 e.click('Субтитри');e.click('Українські');const pending=e.requests.at(-1);e.api.close();assert.ok(pending.aborted);pending.status=200;pending.responseText='bad';pending.onload();assert.equal(e.doc.body.children.length,0);
});
test('all themes use separate player transparency and no native focus scaling or blur',()=>{
 const e=environment({storage:{faborn_ukr_theme:'ios',faborn_ukr_player_transparency:'max'}});e.api.play(e.spec());assert.equal(e.all().find(n=>n.className==='fbp-panel').style.background,'rgba(18,26,40,0.56)');
 e.store.faborn_ukr_theme='off';e.api.apply();assert.equal(e.all().find(n=>n.className==='fbp-panel').style.background,'transparent');e.api.close();
 assert.doesNotMatch(e.doc.head.children[0].textContent,/backdrop-filter|transform:|transition:/);
});
test('TV arrows follow the visible control row and return from the timeline to pause',()=>{
 const e=environment();e.api.play(e.spec());e.prepare();e.at(12);
 const focused=()=>e.all().find(n=>n.classList.contains('fbp-focused'));
 assert.equal(focused().attrs['aria-label'],'Пауза');
 e.controllers.faborn_player_beta.right();assert.equal(focused().attrs['aria-label'],'Якість');
 e.controllers.faborn_player_beta.left();e.controllers.faborn_player_beta.left();assert.equal(focused().attrs['aria-label'],'+30 с');
 e.controllers.faborn_player_beta.up();assert.equal(focused().attrs.role,'slider');
 e.controllers.faborn_player_beta.down();assert.equal(focused().attrs['aria-label'],'Пауза');
 e.controllers.faborn_player_beta.enter();assert.equal(e.avState.state,'PAUSED');
 e.api.close();assert.equal(e.jobs.size,0);
});
test('focus stays on quality when the next-episode shortcut disappears, and a removed shortcut returns to pause',()=>{
 for(const action of ['quality','next']){
  const e=environment();e.api.play(e.spec({next:true,request(a,done){done(null,e.spec({next:false,quality:a.quality||'2160p'}));}}));e.prepare();e.at(12);
  if(action==='quality'){e.click('Якість');e.click('1080p');}else e.click('Наступна');
  e.prepare();
  assert.equal(e.all().find(n=>n.classList.contains('fbp-focused')).attrs['aria-label'],action==='quality'?'Якість':'Пауза');
  e.api.close();assert.equal(e.jobs.size,0);
 }
});
