'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lib/faborn-screensaver'),'utf8');
function setup(initial={}) {
 let time=1000000,seq=0,playing=false,video=false;
 const jobs=new Map(),frames=new Map(),events={},playerEvents={},native=[],values={...initial};
 const DateMock=class extends Date { constructor(...args){super(...(args.length?args:[time]));} static now(){return time;} };
 const context={fillRect(){},createLinearGradient(){return {addColorStop(){}};},beginPath(){},moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){}};
 function element(tag){return {tag,style:{},children:[],setAttribute(){},classList:{contains:c=>c==='player--viewing'&&video},appendChild(child){this.children.push(child);child.parentNode=this;},removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;},getContext(){return context;}};}
 function addEventListener(n,f){(events[n] ||= []).push(f);}
 function removeEventListener(n,f){events[n]=(events[n]||[]).filter(x=>x!==f);}
 const doc={head:element('head'),body:element('body'),createElement:element,querySelector:()=>null,addEventListener,removeEventListener,hidden:false};
 const root={document:doc,innerWidth:3840,innerHeight:2160,addEventListener,removeEventListener,setTimeout(f,delay){jobs.set(++seq,{f,at:time+delay});return seq;},clearTimeout(id){jobs.delete(id);},requestAnimationFrame(f){frames.set(++seq,f);return seq;},cancelAnimationFrame(id){frames.delete(id);}};
 const ss={enabled:true,worked:false,class_list:{},html:element('div'),show(type,params){native.push(['show',type]);if(type==='faborn_ukr'){ss.screensaver=new ss.class_list[type](params);ss.screensaver.create();ss.html.appendChild(ss.screensaver.render());}ss.worked=true;},resetTimer(){native.push(['reset']);},stopSlideshow(){ss.worked=false;root.setTimeout(()=>{if(ss.screensaver){ss.screensaver.destroy();ss.screensaver=false;}},300);ss.resetTimer();}};
 const originalShow=ss.show,originalReset=ss.resetTimer;
 const L={Screensaver:ss,Storage:{get:(k,f)=>values[k]??f},Player:{opened:()=>playing,listener:{follow(n,f){(playerEvents[n] ||= []).push(f);},remove(n,f){playerEvents[n]=(playerEvents[n]||[]).filter(x=>x!==f);}}}};
 const sandbox={module:{exports:{}},Date:DateMock};vm.runInNewContext(source,sandbox);
 const api=sandbox.module.exports(root,L);api.install();
 function advance(ms){const end=time+ms;let count=0;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('timer loop');time=next[1].at;jobs.delete(next[0]);next[1].f();}time=end;}
 function fire(name,keyCode){const e={keyCode,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const f of events[name]||[])f(e);return e;}
 return {api,ss,root,doc,values,native,jobs,frames,events,playerEvents,originalShow,originalReset,advance,fire,context,playing(v){playing=v;},video(v){video=v;},jump(ms){time+=ms;},emit(n){for(const f of playerEvents[n]||[])f();}};
}
test('screensaver is ES5 for older Tizen engines',()=>{
 const acorn=require('../vendor/acorn');acorn.parse(source,{ecmaVersion:5});
});
test('default Aurora starts after three idle minutes, without changing native preferences',()=>{
 const s=setup({screensaver:false,screensaver_type:'aerial',screensaver_time:10});
 assert.equal(s.jobs.size,1);s.advance(179999);assert.equal(s.api.active(),false);s.advance(1);assert.equal(s.api.active(),true);
 assert.equal(s.ss.screensaver.render().className,'fbr-saver fbr-saver--aurora');assert.equal(s.frames.size,1);
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
 assert.equal(s.ss.html.children.length,1);assert.equal(s.ss.html.children[0].className,'fbr-saver fbr-saver--stars');
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
