'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const create=require('../lib/faborn-skip');
function setup(settings={}) {
 let time=100000,id=0,played=null,control='player';const timers=new Map(),events={},pe={},ve={},controllers={},requests=[],seeks=[],done=[];
 const values={faborn_ukr_skip_intro:'on',faborn_ukr_skip_credits:'on',...settings};
 function element(){return {style:{},children:[],subs:{},setAttribute(){},appendChild(c){this.children.push(c);c.parentNode=this;},removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},querySelector(s){return this.subs[s] ||= {style:{},textContent:''};}};}
 const doc={body:element(),head:element(),hidden:false,createElement:element,addEventListener(k,f){events[k]=f;}};
 const root={document:doc,setInterval(f){timers.set(++id,f);return id;},clearInterval(i){timers.delete(i);}};
 const video={paused:false,addEventListener(){}};
 const L={Storage:{get:(k,f)=>values[k]??f,set(k,v){values[k]=v;}},Controller:{enabled:()=>({name:control}),toggle(n){control=n;},add(n,c){controllers[n]=c;}},
 Player:{playdata:()=>played,listener:{follow(k,f){pe[k]=f;}}},PlayerVideo:{video:()=>video,to(s){seeks.push(s);},listener:{follow(k,f){ve[k]=f;}}},
 PlayerPlaylist:{canNext:()=>Boolean(played.next),next(){done.push('next');}}};
 const api=create(root,L,{now:()=>time,complete:d=>done.push(d),request(url,cb){const r={url,cb,abort(){this.aborted=true;}};requests.push(r);return r;}});api.install();
 function start(markers,extra={}){played={card:{id:1396,imdb_id:'tt0903747',media_type:'tv'},faborn_title:'tmdb-tv-1396',faborn_url:'https://test/video.m3u8',season:1,episode:1,...extra};if(markers)played.faborn_segments=markers;pe.start(played);return played;}
 function at(t,d=1000){ve.timeupdate({current:t,duration:d});}
 function step(ms,from){for(let n=0;n<ms;n+=200){time+=200;if(from!==undefined)at(from+n/1000);for(const f of [...timers.values()])f();}}
 function key(type,code){let consumed=false;events[type]({keyCode:code,preventDefault(){consumed=true;},stopImmediatePropagation(){}});return consumed;}
 return {api,L,doc,values,requests,seeks,done,pe,ve,timers,video,start,at,step,key,control:()=>control,cancel:()=>controllers.faborn_skip.back(),button:()=>doc.body.children[0]};
}
const intro={intro:{start_sec:50,end_sec:95}};
test('skip bundle stays ES5 compatible',()=>{const acorn=require('../vendor/acorn');acorn.parse(fs.readFileSync(require.resolve('../lib/faborn-skip'),'utf8'),{ecmaVersion:5});});
test('seven seconds is a countdown at the actual marker, not a video offset',()=>{
 const s=setup();s.start(intro);s.at(0);s.step(8000,0);assert.equal(s.button(),undefined);s.at(50);assert.ok(s.button());s.step(6800,50);assert.deepEqual(s.seeks,[]);s.step(400,57);assert.deepEqual(s.seeks,[95]);
});
test('another episode uses its own different intro boundaries',()=>{const s=setup();s.start({intro:{start_sec:172,end_sec:236}});s.at(50);assert.ok(!s.button());s.at(172);s.step(7200,172);assert.deepEqual(s.seeks,[236]);});
test('Back consumes both keyboard events and cancels this marker without leaving the player',()=>{
 const s=setup();s.start(intro);s.at(50);assert.equal(s.key('keydown',10009),true);assert.equal(s.control(),'player');assert.equal(s.key('keydown',10009),true);assert.equal(s.key('keyup',10009),true);s.step(9000,51);assert.deepEqual(s.seeks,[]);assert.ok(!s.button());
});
test('OK skips immediately and its release cannot toggle the next player',()=>{const s=setup();s.start(intro);s.at(50);assert.ok(s.key('keydown',13));assert.deepEqual(s.seeks,[95]);assert.ok(s.key('keyup',13));});
test('countdown freezes on pause, buffering without progress and hidden documents',()=>{
 const s=setup();s.start(intro);s.at(50);s.video.paused=true;s.step(9000,50);assert.deepEqual(s.seeks,[]);s.video.paused=false;s.doc.hidden=true;s.step(9000,51);assert.deepEqual(s.seeks,[]);s.doc.hidden=false;s.step(9000);assert.deepEqual(s.seeks,[]);
});
test('seeking outside the marker removes the control and does not seek later',()=>{const s=setup();s.start(intro);s.at(50);s.at(200);s.step(9000,200);assert.ok(!s.button());assert.deepEqual(s.seeks,[]);});
test('terminal credits advance and complete the old episode',()=>{const s=setup();const old=s.start({outro:{start_sec:900,end_sec:1000}},{next:true});s.at(900);s.step(7200,900);assert.deepEqual(s.done,[old,'next']);assert.deepEqual(s.seeks,[]);});
test('post-credits scene is preserved even when another episode is available',()=>{const s=setup();s.start({outro:{start_sec:900,end_sec:1000},post_credits:{start_sec:965,end_sec:990}},{next:true});s.at(900);s.step(7200,900);assert.deepEqual(s.seeks,[965]);assert.deepEqual(s.done,[]);});
test('no settings enabled means no requests and no skip UI',()=>{const s=setup({faborn_ukr_skip_intro:'off',faborn_ukr_skip_credits:'off'});s.start();s.at(60);assert.equal(s.requests.length,0);assert.ok(!s.button());});
test('empty, malformed, mismatched duration and out-of-bounds markers never cause a guessed skip',()=>{
 const s=setup();for(const raw of [{},{intro:{start_sec:0,end_sec:1200}},{intro:{start_sec:50,end_sec:30}},{intro:{start_sec:'50',end_sec:95}}, {...intro,duration_ms:1200000}]){s.start(raw);s.at(50);assert.ok(!s.button());}assert.deepEqual(s.seeks,[]);
});
test('marker lookup is exact by IMDb, season and episode; metadata cache avoids a repeat request',()=>{
 const s=setup();s.start();s.at(50);assert.match(s.requests[0].url,/imdb_id=tt0903747&season=1&episode=1$/);
 s.requests[0].cb(null,JSON.stringify({imdb_id:'tt0903747',is_movie:false,season:1,episode:1,...intro}));s.at(51);assert.ok(s.button());
 s.start();s.at(50);assert.equal(s.requests.length,1);assert.ok(s.button());
});
test('old request cannot attach markers after changing an episode or closing playback',()=>{
 const s=setup();s.start();s.at(50);const old=s.requests[0];s.start(null,{episode:2});assert.ok(old.aborted);old.cb(null,JSON.stringify({imdb_id:'tt0903747',is_movie:false,season:1,episode:1,...intro}));s.at(50);assert.ok(!s.button());
 s.pe.destroy();assert.ok(s.requests.at(-1).aborted);assert.equal(s.timers.size,0);
});
test('failed API and mismatched episode return no button',()=>{const s=setup();s.start();s.at(50);s.requests[0].cb(Error('unreachable'));s.at(50);assert.ok(!s.button());s.start();s.at(50);s.requests[1].cb(null,JSON.stringify({imdb_id:'tt0903747',is_movie:false,season:2,episode:1,...intro}));s.at(50);assert.ok(!s.button());});
test('native segments owned by another plugin are not auto-skipped a second time',()=>{const s=setup();s.start(null,{segments:{skip:[[50,95]]}});s.at(50);assert.equal(s.requests.length,0);assert.ok(!s.button());});
test('unanswered resume choice blocks both the control and countdown',()=>{const s=setup();s.start(intro,{timeline:{waiting_for_user:true}});s.at(50);s.step(9000,50);assert.ok(!s.button());assert.deepEqual(s.seeks,[]);});
