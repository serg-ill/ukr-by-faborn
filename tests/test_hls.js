'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const create=require('../lib/faborn-hls');
function environment() {
 const jobs=new Map(),instances=[],events={},calls=[];let serial=0,supported=true;
 const video={style:{},currentTime:0,duration:7200,videoWidth:3840,videoHeight:2160,textTracks:[],
  setAttribute(){},removeAttribute(name){calls.push(['remove',name]);},load(){calls.push(['load']);},
  play(){calls.push(['play']);return video.promise;},pause(){calls.push(['pause']);},
  addEventListener(name,fn){(events[name] ||= new Set()).add(fn);},removeEventListener(name,fn){events[name]?.delete(fn);}};
 function Hls(config){this.config=config;this.handlers={};this.sources=[];instances.push(this);}
 Hls.isSupported=()=>supported;Hls.Events={ERROR:'error',MEDIA_ATTACHED:'attached'};Hls.ErrorDetails={BUFFER_APPEND_ERROR:'bufferAppendError',FRAG_PARSING_ERROR:'fragParsingError'};
 Hls.prototype.on=function(n,fn){this.handlers[n]=fn;};Hls.prototype.attachMedia=function(v){this.video=v;};
 Hls.prototype.loadSource=function(url){this.sources.push(url);};Hls.prototype.destroy=function(){this.destroyed=true;};
 const root={document:{createElement(name){assert.equal(name,'video');return video;}},setTimeout(fn){jobs.set(++serial,fn);return serial;},clearTimeout(id){jobs.delete(id);}};
 const api=create(root,Hls);function event(name){for(const fn of [...events[name]||[]])fn();}
 function ready(){instances.at(-1).handlers.attached();event('loadedmetadata');}
 return {api,root,Hls,video,events,calls,instances,jobs,event,ready,unsupported(){supported=false;}};
}
test('browser transport and its isolated licensed HLS dependency remain ES5',()=>{
 const acorn=require('../vendor/acorn');
 for(const path of ['../lib/faborn-hls','../lib/hls/hls-1.7.3.js'])acorn.parse(fs.readFileSync(require.resolve(path),'utf8'),{ecmaVersion:5});
 const context=vm.createContext({window:{Hls:'existing Lampa version'}});
 vm.runInContext(fs.readFileSync(require.resolve('../lib/hls/hls-1.7.3.js'),'utf8'),context);
 assert.equal(context.window.Hls,'existing Lampa version');assert.equal(typeof context.window.FabornHls,'function');
 assert.equal(context.window.FabornHls.version,'1.7.3');assert.match(fs.readFileSync(require.resolve('../lib/hls/LICENSE'),'utf8'),/Apache License/);
});
test('browser transport keeps the requested 4K URL, reports actual time and allocates only during playback',()=>{
 const e=environment();assert.equal(e.instances.length,0);assert.equal(e.jobs.size,0);assert.equal(e.calls.length,0);
 let prepared=0,time=0,ended=0;e.api.open('http://127.0.0.1:12345/0123456789abcdef0123456789abcdef/0.m3u8');
 e.api.setListener({oncurrentplaytime(v){time=v;},onstreamcompleted(){ended++;}});e.api.prepareAsync(()=>prepared++);e.ready();
 assert.equal(prepared,1);assert.equal(e.api.getState(),'READY');assert.equal(e.api.getDuration(),7200000);
 assert.deepEqual(e.instances[0].sources,['http://127.0.0.1:12345/0123456789abcdef0123456789abcdef/0.m3u8']);
 assert.equal(e.instances[0].config.enableWorker,false);assert.equal(e.instances[0].config.maxBufferSize,41943040);
 e.api.play();e.video.currentTime=12.5;e.event('timeupdate');assert.equal(time,12500);assert.equal(e.api.getCurrentTime(),12500);
 e.event('ended');assert.equal(ended,1);e.api.close();assert.equal(e.instances[0].destroyed,true);assert.equal(e.api.getState(),'NONE');
 assert.equal([...Object.values(e.events)].reduce((n,set)=>n+set.size,0),0);assert.equal(e.jobs.size,0);
});
test('close during preparation invalidates old HLS and video callbacks before another playback',()=>{
 const e=environment();let oldReady=0,newReady=0,failed=0;
 e.api.open('https://example.org/old.m3u8');e.api.prepareAsync(()=>oldReady++,()=>failed++);
 const oldHls=e.instances[0],oldMetadata=[...e.events.loadedmetadata][0];e.api.close();
 e.api.open('https://example.org/new.m3u8');e.api.prepareAsync(()=>newReady++,()=>failed++);
 oldHls.handlers.attached();oldHls.handlers.error('error',{fatal:true,type:'networkError'});oldMetadata();
 assert.equal(oldReady,0);assert.equal(newReady,0);assert.equal(failed,0);assert.deepEqual(e.instances[1].sources,[]);
 e.ready();assert.equal(newReady,1);e.api.close();
});
test('fatal HTTP errors expose code and stage without copying signed URLs or response text',()=>{
 const e=environment(),events=[];let error;e.api.open('https://example.org/stream.m3u8');
 e.api.setListener({onevent(...args){events.push(args);},onerrormsg(...args){events.push(args);}});e.api.prepareAsync(()=>{},value=>error=value);
 e.instances[0].handlers.error('error',{fatal:true,type:'networkError',response:{code:403,url:'https://secret/token',text:'private'}});
 assert.equal(error.name,'HLSNetworkError');assert.deepEqual(events[0],['PLAYER_MSG_HTTP_ERROR_CODE','403']);assert.doesNotMatch(JSON.stringify(events),/secret|private/);
 e.api.close();
});
test('seeking keeps pause and releases both completion and timeout handlers',()=>{
 const e=environment();e.api.open('https://example.org/stream.m3u8');e.api.prepareAsync(()=>{});e.ready();e.api.play();e.api.pause();let done=0,failed=0;
 e.api.seekTo(240000,()=>done++,()=>failed++);assert.equal(e.video.currentTime,240);e.event('seeked');
 assert.equal(done,1);assert.equal(failed,0);assert.equal(e.api.getState(),'PAUSED');assert.equal(e.jobs.size,0);
 e.api.seekTo(250000,()=>done++,()=>failed++);const timeout=[...e.jobs.values()][0];e.api.close();timeout();e.event('seeked');
 assert.equal(done,1);assert.equal(failed,0);assert.equal(e.jobs.size,0);
});
test('late play promise rejection cannot affect a closed or replacement video',async()=>{
 const e=environment();let reject,errors=0;e.video.promise=new Promise((ok,fail)=>{reject=fail;});
 e.api.open('https://example.org/stream.m3u8');e.api.setListener({onerror(){errors++;}});e.api.prepareAsync(()=>{});e.ready();e.api.play();e.api.close();
 reject(Error('private'));await Promise.resolve();assert.equal(errors,0);assert.equal(e.api.getState(),'NONE');
});
test('unsupported MediaSource refuses playback and cannot silently fall back to native AVPlay',()=>{
 const e=environment();e.unsupported();assert.equal(e.api.available(),false);e.api.open('https://example.org/stream.m3u8');
 assert.throws(()=>e.api.prepareAsync(()=>{}),error=>error.name==='MSEUnavailableError');assert.equal(e.instances.length,0);e.api.close();
});

test('fatal HLS details distinguish append and parsing failures even without an HTTP or video code',()=>{
 for(const details of ['bufferAppendError','fragParsingError','https://secret/token']){
  const e=environment();let received,errors=0;e.api.open('https://example.org/stream.m3u8');
  e.api.setListener({onerror(){errors++;},onerrormsg(name,text){received=JSON.parse(text);}});e.api.prepareAsync(()=>{});e.ready();e.api.play();
  e.instances[0].handlers.error('error',{fatal:true,type:'mediaError',details,error:new Error('https://secret/token')});
  assert.equal(received.error_code,0);assert.equal(received.demux,'MSE');assert.equal(received.resolution,'3840x2160');assert.equal(errors,1);
  assert.equal(received.hls_detail,details.startsWith('https')?undefined:details);assert.doesNotMatch(JSON.stringify(received),/secret|token/);e.api.close();
 }
});
