'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lib/faborn-screensaver'),'utf8');
function setup(initial={},options={catalogURL:'/data/aerial.json'}) {
 let time=1000000,seq=0,playing=false,video=false;
 const jobs=new Map(),frames=new Map(),events={},playerEvents={},native=[],values={...initial},requests=[],media=[];
 const DateMock=class extends Date { constructor(...args){super(...(args.length?args:[time]));} static now(){return time;} };
 const draws=[];function draw(name,args){for(const v of args)if(typeof v==='number'&&!Number.isFinite(v))throw Error('nonfinite '+name);draws.push([name,...args].filter(v=>typeof v!=='object'));}
 const context={};for(const name of ['fillRect','drawImage','beginPath','moveTo','lineTo','stroke','closePath','fill','arc','save','restore','scale','translate','rotate','fillText'])context[name]=function(...a){draw(name,a);};
 context.createLinearGradient=context.createRadialGradient=function(...args){draw('gradient',args);return {addColorStop(){}};};
 function element(tag){const e={tag,style:{},children:[],attrs:{},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];if(k==='src')this.src='';},classList:{contains:c=>c==='player--viewing'&&video},appendChild(child){this.children.push(child);child.parentNode=this;},removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;},getContext(){return context;}};if(tag==='video'){media.push(e);e.play=function(){this.paused=false;this.plays=(this.plays||0)+1;};e.pause=function(){this.paused=true;};e.load=function(){this.unloaded=true;};}return e;}
 function addEventListener(n,f){(events[n] ||= []).push(f);}
 function removeEventListener(n,f){events[n]=(events[n]||[]).filter(x=>x!==f);}
 const doc={head:element('head'),body:element('body'),createElement:element,createElementNS:(_,tag)=>element(tag),querySelector:()=>null,addEventListener,removeEventListener,hidden:false};
 const root={document:doc,innerWidth:3840,innerHeight:2160,addEventListener,removeEventListener,setTimeout(f,delay){jobs.set(++seq,{f,at:time+delay});return seq;},clearTimeout(id){jobs.delete(id);},requestAnimationFrame(f){frames.set(++seq,f);return seq;},cancelAnimationFrame(id){frames.delete(id);}};
 const ss={enabled:true,worked:false,class_list:{},html:element('div'),show(type,params){native.push(['show',type]);if(type==='faborn_ukr'){ss.screensaver=new ss.class_list[type](params);ss.screensaver.create();ss.html.appendChild(ss.screensaver.render());}ss.worked=true;},resetTimer(){native.push(['reset']);},stopSlideshow(){ss.worked=false;root.setTimeout(()=>{if(ss.screensaver){ss.screensaver.destroy();ss.screensaver=false;}},300);ss.resetTimer();}};
 root.XMLHttpRequest=function(){requests.push(this);this.open=(method,url)=>{this.url=url;};this.send=()=>{};this.abort=()=>{this.aborted=true;};this.respond=(data,status=200)=>{this.status=status;this.responseText=JSON.stringify(data);this.readyState=4;if(this.onreadystatechange)this.onreadystatechange();};};
 const originalShow=ss.show,originalReset=ss.resetTimer;
 const L={Screensaver:ss,Storage:{get:(k,f)=>values[k]??f},Player:{opened:()=>playing,listener:{follow(n,f){(playerEvents[n] ||= []).push(f);},remove(n,f){playerEvents[n]=(playerEvents[n]||[]).filter(x=>x!==f);}}}};
 const sandbox={module:{exports:{}},Date:DateMock};vm.runInNewContext(source,sandbox);
 const api=sandbox.module.exports(root,L,options);api.install();
 function advance(ms){const end=time+ms;let count=0;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('timer loop');time=next[1].at;jobs.delete(next[0]);next[1].f();}time=end;}
 function fire(name,keyCode){const e={keyCode,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const f of events[name]||[])f(e);return e;}
 return {api,ss,root,doc,requests,media,values,native,jobs,frames,events,playerEvents,originalShow,originalReset,advance,fire,context,draws,step(ms=50){advance(ms);const batch=[...frames.values()];frames.clear();batch.forEach(f=>f());},playing(v){playing=v;},video(v){video=v;},jump(ms){time+=ms;},emit(n){for(const f of playerEvents[n]||[])f();}};
}
test('screensaver is ES5 for older Tizen engines',()=>{
 const acorn=require('../vendor/acorn');acorn.parse(source,{ecmaVersion:5});
});
test('default Aurora starts after three idle minutes, without changing native preferences',()=>{
 const s=setup({screensaver:false,screensaver_type:'aerial',screensaver_time:10});
 assert.equal(s.jobs.size,1);s.advance(179999);assert.equal(s.api.active(),false);s.advance(1);assert.equal(s.api.active(),true);
 assert.equal(s.ss.screensaver.render().className,'fbr-saver fbr-saver--aurora fbr-saver--compact');assert.equal(s.frames.size,1);
 assert.deepEqual(s.values,{screensaver:false,screensaver_type:'aerial',screensaver_time:10});
 const canvas=s.ss.screensaver.render().children[0];assert.equal(canvas.width,1280);assert.equal(canvas.height,720);
});
test('activity resets the single timer; invalid delay safely defaults to three minutes',()=>{
 const s=setup({faborn_ukr_screensaver_time:'-1'});s.advance(100000);s.ss.resetTimer();assert.equal(s.jobs.size,1);s.advance(179999);assert.equal(s.api.active(),false);s.advance(1);assert.equal(s.api.active(),true);
});
test('first remote press and its release only wake the menu; the next press passes through',()=>{
 const s=setup();s.api.preview();assert.equal(s.fire('keydown',13).prevented,true);assert.equal(s.api.active(),false);assert.equal(s.frames.size,0);
 assert.equal(s.fire('keydown',13).prevented,true);s.advance(500);assert.equal(s.fire('keyup',13).prevented,true);
 assert.equal(s.fire('keydown',13).prevented,undefined);assert.equal(s.fire('keyup',13).prevented,undefined);assert.equal(s.ss.html.children.length,0);assert.equal(s.jobs.size,1);
});
test('holding the wake key does not move focus or create long-press actions',()=>{
 const s=setup();s.api.preview();s.fire('keydown',39);for(let i=0;i<6;i++){s.advance(800);assert.equal(s.fire('keydown',39).prevented,true);}assert.equal(s.fire('keyup',39).prevented,true);
});
test('wake by touch/mouse absorbs its following click',()=>{
 const s=setup();s.api.preview();assert.equal(s.fire('touchstart').prevented,true);s.advance(100);assert.equal(s.fire('click').prevented,true);s.advance(600);assert.equal(s.fire('click').prevented,undefined);
});
test('native Lampa mode delegates automatic show and reset without altering stored options',()=>{
 const s=setup();s.values.faborn_ukr_screensaver='native';s.api.apply();s.ss.show();assert.deepEqual(s.native,[['reset'],['show',undefined]]);
});
test('off cancels the timer but allows a deliberate style preview',()=>{
 const s=setup();s.values.faborn_ukr_screensaver='off';s.api.apply();assert.equal(s.jobs.size,0);s.ss.show();assert.equal(s.api.active(),false);assert.equal(s.api.preview(),true);
 s.fire('keydown',27);s.advance(300);assert.equal(s.jobs.size,0);
});
test('playing, buffering, paused player, body playback state and YouTube all block the saver',()=>{
 const s=setup();s.playing(true);assert.equal(s.api.preview(),false);s.ss.resetTimer();assert.equal(s.jobs.size,0);
 s.playing(false);s.video(true);assert.equal(s.api.preview(),false);s.video(false);s.doc.querySelector=()=>({});assert.equal(s.api.preview(),false);
});
test('opening video closes a visible saver immediately; closing video restarts full delay',()=>{
 const s=setup();s.api.preview();s.playing(true);s.emit('start');assert.equal(s.api.active(),false);assert.equal(s.frames.size,0);s.advance(300);assert.equal(s.jobs.size,0);
 s.playing(false);s.emit('destroy');s.advance(180000);assert.equal(s.api.active(),true);
});
test('hidden page cancels drawing and idle; becoming visible starts a fresh delay',()=>{
 const s=setup();s.api.preview();s.doc.hidden=true;s.fire('visibilitychange');assert.equal(s.frames.size,0);s.advance(300);assert.equal(s.jobs.size,0);assert.equal(s.api.preview(),false);
 s.doc.hidden=false;s.fire('visibilitychange');assert.equal(s.jobs.size,1);s.advance(180000);assert.equal(s.api.active(),true);
});
test('a suspended TV does not open a saver immediately on returning',()=>{
 const s=setup(),pending=[...s.jobs.values()][0];s.jobs.clear();s.jump(900000);pending.f();assert.equal(s.api.active(),false);assert.equal(s.jobs.size,1);
});
test('switching style safely disposes old frames and previews never duplicate layers',()=>{
 const s=setup();s.api.preview();assert.equal(s.api.preview(),false);s.values.faborn_ukr_screensaver_style='stars';s.api.apply();assert.equal(s.frames.size,0);assert.equal(s.api.preview(),false);s.advance(300);assert.equal(s.api.preview(),true);
 assert.equal(s.ss.html.children.length,1);assert.equal(s.ss.html.children[0].className,'fbr-saver fbr-saver--stars fbr-saver--compact');
});
test('minimal clock and no-Canvas fallback use a one-second timer without RAF',()=>{
 for(const fallback of [false,true]){const s=setup({faborn_ukr_screensaver_style:fallback?'stars':'clock'});if(fallback){const old=s.doc.createElement;s.doc.createElement=t=>{const e=old(t);e.getContext=()=>{throw Error('no canvas');};return e;};}
 s.api.preview();assert.equal(s.frames.size,0);s.advance(2000);assert.equal(s.api.active(),true);s.fire('keydown',27);s.advance(300);assert.equal(s.ss.html.children.length,0);}
});
test('dispose restores native methods, unregisters handlers and cancels scene rendering',()=>{
 const s=setup();s.api.install();assert.equal(s.events.keydown.length,1);s.api.preview();s.api.destroy();assert.equal(s.frames.size,0);assert.equal(s.events.keydown.length,0);assert.equal(s.playerEvents.start.length,0);
 assert.equal(s.ss.show,s.originalShow);assert.equal(s.ss.resetTimer,s.originalReset);assert.equal(s.ss.class_list.faborn_ukr,undefined);s.advance(300);assert.equal(s.ss.html.children.length,0);
});
test('disabled core waits for enable, and a player opened just before expiry cancels launch',()=>{
 const s=setup();s.ss.enabled=false;s.ss.resetTimer();assert.equal(s.jobs.size,0);s.ss.enabled=true;s.ss.resetTimer();s.playing(true);s.advance(180000);assert.equal(s.api.active(),false);assert.equal(s.jobs.size,0);
});
test('reinstall after disposal restores the configured idle timer once',()=>{
 const s=setup();s.api.destroy();s.api.install();assert.equal(s.jobs.size,1);assert.equal(s.events.keydown.length,1);s.advance(180000);assert.equal(s.api.active(),true);
});

test('every animated style produces changing finite drawing commands for a full minute',()=>{
 const styles=setup().api.styles();assert.equal(styles.length,20);
 for(const style of styles.filter(v=>!/^clock|^aerial/.test(v))) {
  const s=setup({faborn_ukr_screensaver_style:style});s.api.preview();const first=JSON.stringify(s.draws.slice(-100));s.draws.length=0;
  for(let i=0;i<120;i++){s.step(500);if(i%10===0)s.draws.length=0;}
  assert.equal(s.api.status().error,'',style);assert.ok(s.api.status().frames>=121,style);assert.notEqual(JSON.stringify(s.draws.slice(-100)),first,style);assert.equal(s.frames.size,1,style);
  s.fire('keydown',27);assert.equal(s.frames.size,0,style);
 }
});
test('renderer failures fall back to the moving clock and keep wake handling alive',()=>{
 const s=setup({faborn_ukr_screensaver_style:'stars',faborn_ukr_screensaver_clock:'off'});s.context.arc=()=>{throw Error('canvas lost');};s.api.preview();assert.equal(s.api.status().error,'canvas lost');assert.equal(s.frames.size,0);assert.equal(s.ss.html.children[0].className,'fbr-saver fbr-saver--clock');assert.equal(s.ss.html.children[0].children[1].style.display,'block');assert.equal(s.fire('keydown',13).prevented,true);
});
test('random animation skips clock and never immediately repeats the previous style',()=>{
 const s=setup({faborn_ukr_screensaver_style:'random'});let previous='';for(let i=0;i<25;i++){s.api.preview();const style=s.api.status().style;assert.notEqual(style,previous);assert.ok(!/^clock|^aerial/.test(style));assert.ok(s.api.styles().includes(style));previous=style;s.fire('keydown',27);s.advance(300);s.fire('keyup',27);}
});
test('clock overlay can be disabled while the dedicated clock always remains visible',()=>{
 const s=setup({faborn_ukr_screensaver_style:'stars',faborn_ukr_screensaver_clock:'off'});s.api.preview();assert.equal(s.ss.html.children[0].children[1].style.display,'none');
 const c=setup({faborn_ukr_screensaver_style:'clock',faborn_ukr_screensaver_clock:'off'});c.api.preview();assert.notEqual(c.ss.html.children[0].children[0].style.display,'none');
});
test('all scenes animate on the timer fallback when RAF is unavailable',()=>{
 for(const style of setup().api.styles().filter(v=>!/^clock|^aerial/.test(v))){const s=setup({faborn_ukr_screensaver_style:style});delete s.root.requestAnimationFrame;s.api.preview();s.advance(500);assert.ok(s.api.status().frames>=10,style);assert.equal(s.frames.size,0);s.fire('keydown',27);s.advance(300);assert.equal(s.ss.html.children.length,0);}
});
test('resize rebuilds bounded scenes without duplicating animation loops',()=>{
 for(const style of ['stars','warp','matrix','orbits']){const s=setup({faborn_ukr_screensaver_style:style});s.api.preview();s.root.innerWidth=720;s.root.innerHeight=1280;s.fire('resize');s.step();const c=s.ss.html.children[0].children[0];assert.ok(c.width<=1280&&c.height<=720);assert.equal(s.api.status().error,'');assert.equal(s.frames.size,1);}
});

const aerialFixture={videos:[{id:'ocean-a',name:'Ocean A',category:'underwater',url:'https://sylvan.apple.com/Videos/ocean-a.mov'},{id:'ocean-b',name:'Ocean B',category:'underwater',url:'https://sylvan.apple.com/Videos/ocean-b.mov'},{id:'city',name:'City',category:'cityscape',url:'https://sylvan.apple.com/Videos/city.mov'}]};
test('all four clocks remain visible without Canvas, network or clock overlay',()=>{
 for(const style of ['clock','clock-flip','clock-analog','clock-rings']){
  const s=setup({faborn_ukr_screensaver_style:style,faborn_ukr_screensaver_clock:'off'});s.api.preview();s.advance(65000);
  assert.equal(s.api.status().error,'',style);assert.equal(s.requests.length,0);assert.equal(s.frames.size,0);assert.notEqual(s.ss.html.children[0].children[0].style.display,'none');
  s.fire('keydown',27);s.advance(300);assert.equal(s.ss.html.children.length,0);assert.equal(s.jobs.size,1);
 }
});
test('video categories select only their scenes and advance without immediate repeats',()=>{
 const s=setup({faborn_ukr_screensaver_style:'aerial-ocean'});s.api.preview();assert.equal(s.requests.length,1);s.requests[0].respond(aerialFixture);
 const v=s.media[0],first=v.src;assert.match(first,/ocean/);assert.equal(v.muted,true);assert.equal(v.volume,0);v.onplaying();s.advance(16000);assert.equal(v.src,first);v.onended();assert.match(v.src,/ocean/);assert.notEqual(v.src,first);assert.equal(s.frames.size,0);
 s.fire('keydown',27);assert.equal(v.paused,true);assert.equal(v.src,'');assert.equal(v.onended,null);s.advance(300);assert.equal(s.jobs.size,1);
});
test('video freeze aborts catalog and ignores late network response',()=>{
 const s=setup({faborn_ukr_screensaver_style:'aerial-city'});s.api.preview();const request=s.requests[0];s.fire('keydown',27);assert.equal(request.aborted,true);request.respond(aerialFixture);assert.equal(s.media[0].plays,undefined);s.advance(300);assert.equal(s.ss.html.children.length,0);
});
test('video stalls and repeated failures fall back to a visible movable clock',()=>{
 const s=setup({faborn_ukr_screensaver_style:'aerial-ocean',faborn_ukr_screensaver_clock:'off'});s.api.preview();s.requests[0].respond(aerialFixture);s.advance(46000);
 assert.match(s.api.status().error,/Відеосцена недоступна/);assert.equal(s.ss.html.children[0].className,'fbr-saver fbr-saver--clock');assert.equal(s.ss.html.children[0].children[0].style.display,'block');assert.equal(s.media[0].src,'');assert.equal(s.fire('keydown',13).prevented,true);
});
test('bad catalog, HTTP errors and unsupported origins cannot start remote playback',()=>{
 for(const data of [{videos:[]},{videos:[{id:'x',name:'x',category:'underwater',url:'https://evil.invalid/a.mov'}]},null]){
  const s=setup({faborn_ukr_screensaver_style:'aerial'});s.api.preview();s.requests[0].respond(data,data===null?503:200);assert.ok(s.api.status().error);assert.equal(s.media[0].plays,undefined);assert.equal(s.frames.size,0);
 }
});
test('new player immediately unloads aerial video, including the fade-out period',()=>{
 const s=setup({faborn_ukr_screensaver_style:'aerial'});s.api.preview();s.requests[0].respond(aerialFixture);s.media[0].onplaying();s.playing(true);s.emit('start');assert.equal(s.media[0].paused,true);assert.equal(s.media[0].src,'');s.advance(300);assert.equal(s.jobs.size,0);
});
test('video category changes reuse metadata and leave only the new player active',()=>{
 const s=setup({faborn_ukr_screensaver_style:'aerial-ocean'});s.api.preview();s.requests[0].respond(aerialFixture);s.values.faborn_ukr_screensaver_style='aerial-city';s.api.apply();s.advance(300);s.api.preview();assert.equal(s.requests.length,1);assert.match(s.media[1].src,/city/);assert.equal(s.media[0].src,'');
});
test('bundled Aerial catalog has unique HTTPS H264 scenes in all four categories',()=>{
 const data=JSON.parse(fs.readFileSync(require.resolve('../data/aerial.json'),'utf8'));assert.equal(data.videos.length,114);assert.equal(new Set(data.videos.map(v=>v.id)).size,114);
 for(const category of ['underwater','cityscape','landscape','space'])assert.ok(data.videos.filter(v=>v.category===category).length>=20);
 for(const v of data.videos)assert.match(v.url,/^https:\/\/sylvan\.apple\.com\/.*\.mov$/);
});
