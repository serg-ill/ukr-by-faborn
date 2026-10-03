'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),factory=require('../lib/faborn-hub');
const show={id:71728,name:'Юний Шелдон',original_name:'Young Sheldon',media_type:'tv',source:'tmdb'};
const hash=s=>String(Array.from(String(s)).reduce((n,c)=>(n*31+c.charCodeAt(0))|0,0));
const episode=(s,e,day='2020-01-01')=>({season_number:s,episode_number:e,air_date:day,name:'Episode '+e});
function env(){
 const store={},timers=new Map(),calls=[],writes=[];let owner='file_view_1',serial=0,stamp=Date.now();
 const L={Storage:{get:(k,f)=>Object.hasOwn(store,k)?store[k]:f,set:(k,v)=>{store[k]=v;}},Utils:{hash},Timeline:{filename:()=>owner,view(key){let raw=store[owner]||{};if(typeof raw==='string')raw=JSON.parse(raw);const p=raw[key]||{};return {hash:key,percent:p.percent||0,time:p.time||0,duration:p.duration||0,updated:p.updated||0,handler(percent,time,duration){const bucket=store[owner]||(store[owner]={});bucket[key]={percent,time,duration,updated:++stamp};writes.push({owner,key,...bucket[key]});}};}},Api:{sources:{tmdb:{get:(path,params,ok,fail)=>calls.push({path,ok,fail})}}},Noty:{show:()=>{}}};
 const root={setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),localStorage:{get length(){return Object.keys(store).length;},key:i=>Object.keys(store)[i]}};
 const api=factory(root,L,null);
 const run=()=>{let n=0;while(timers.size){if(++n>5000)throw Error('timer loop');const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
 return {api,L,root,store,calls,writes,run,profile:p=>{owner=p;},put:(key,value)=>{(store[owner]||(store[owner]={}))[hash(key)]=value;},road:(s,e)=>api.road(show,s,e)};
}
function prepare(e,choice={mode:'all'},count=3){
 let result,error;const task=e.api.scope();e.api.prepareWatched(task,show,choice,(err,plan)=>{error=err;result=plan;});
 e.calls[0].ok({id:show.id,seasons:[{season_number:0,episode_count:1},{season_number:1,episode_count:count,air_date:'2020-01-01'},{season_number:2,episode_count:count,air_date:'2020-01-01'},{season_number:3,episode_count:1,air_date:'2099-01-01'}]});
 for(let i=1;i<e.calls.length;i++){const c=e.calls[i],s=+c.path.split('/').pop();c.ok({season_number:s,episodes:Array.from({length:count},(_,j)=>episode(s,j+1)).concat([episode(s,99,'2099-01-01'),episode(s,98,null),episode(s,97,'2026-02-30')])});}
 assert.equal(error,null);return result;
}
function apply(e,plan){let result;e.api.applyProgress(e.api.scope(),plan,r=>result=r);e.run();return result;}
test('all aired plan validates every season before writing and excludes future, undated and special episodes',()=>{
 const e=env(),plan=prepare(e);assert.equal(e.writes.length,0);assert.equal(plan.count,6);assert.equal(plan.entries.length,12);assert.ok(e.calls.every(c=>!c.path.endsWith('/0')&&!c.path.endsWith('/3')));
 assert.equal(apply(e,plan).ok,true);assert.equal(e.road(2,3).percent,100);assert.equal(e.road(2,99).percent,0);assert.equal(e.road(2,98).percent,0);assert.equal(e.road(0,1).percent,0);
 assert.equal(e.api.latestEpisode(show,{}).episode,3);assert.equal(e.api.latestEpisode(show,{}).season,2);
});
test('season and through selections have exact boundaries',()=>{
 const e=env(),plan=prepare(e,{mode:'season',season:2});assert.equal(plan.count,3);apply(e,plan);assert.equal(e.road(1,1).percent,0);assert.equal(e.road(2,3).percent,100);
 const f=env(),through=prepare(f,{mode:'through',season:2,episode:2});assert.equal(through.count,5);apply(f,through);assert.equal(f.road(1,3).percent,100);assert.equal(f.road(2,2).percent,100);assert.equal(f.road(2,3).percent,0);
});
test('a later newly released episode stays unwatched and clears the waiting state',()=>{
 const e=env();apply(e,prepare(e));
 const details={status:'Returning Series',last_episode_to_air:episode(2,3),seasons:[{season_number:2,episode_count:4}]};
 const data={season_number:2,episodes:[episode(2,1),episode(2,2),episode(2,3),episode(2,4,'2099-01-01')]};
 assert.equal(e.api.summary(show,details,data,'2026-10-02').waiting,true);
 data.episodes[3].air_date='2026-10-02';details.last_episode_to_air=data.episodes[3];const state=e.api.summary(show,details,data,'2026-10-02');
 assert.equal(state.pending,1);assert.equal(state.waiting,false);assert.equal(state.next.episode,4);
});
test('manual marks share canonical and Faborn keys without fabricating a runtime or touching another title',()=>{
 const e=env();e.put('11Young Sheldon',{time:300,duration:1200,percent:25,updated:1});e.put('Some Other Movie',{time:99,percent:50,updated:1});
 apply(e,prepare(e));assert.equal(e.L.Timeline.view(hash('11Young Sheldon')).percent,100);assert.equal(e.road(1,1).percent,100);assert.equal(e.road(2,1).time,0);assert.equal(e.L.Timeline.view(hash('Some Other Movie')).time,99);
});
test('undo survives recreation, restores previous partial progress and leaves later playback intact',()=>{
 const e=env();e.put('11Young Sheldon',{percent:25,time:300,duration:1200,updated:1});e.store.faborn_ukr_position_tmdb_tv='unused';
 e.store['faborn_ukr_position_tmdb-tv-'+show.id]={season:1,episode:1,time:300};apply(e,prepare(e));
 e.L.Timeline.view(hash('faborn|tmdb-tv-71728|2|3')).handler(42,500,1200);
 const again=factory(e.root,e.L,null),undo=again.undoPlan();assert.ok(undo);assert.equal(apply(e,undo).ok,true);
 assert.equal(e.road(1,1).percent,25);assert.equal(e.road(1,1).time,300);assert.equal(e.road(2,3).percent,42);assert.equal(e.road(2,2).percent,0);
 assert.deepEqual(e.store['faborn_ukr_position_tmdb-tv-'+show.id],{season:1,episode:1,time:300});
});
test('failed metadata and cancelled preparation never make partial marks',()=>{
 const e=env();let error;e.api.prepareWatched(e.api.scope(),show,{mode:'all'},err=>error=err);e.calls[0].ok({id:show.id,seasons:[{season_number:1,episode_count:1},{season_number:2,episode_count:1}]});e.calls[1].ok({season_number:1,episodes:[episode(1,1)]});e.calls[2].fail();assert.match(error,/TMDB/);assert.equal(e.writes.length,0);
 const f=env(),task=f.api.scope();let called=false;f.api.prepareWatched(task,show,{mode:'all'},()=>called=true);task.cancel();f.calls[0].ok({id:show.id,seasons:[]});assert.equal(called,false);assert.equal(f.writes.length,0);
});
test('incorrect metadata identity and a future selected endpoint are rejected',()=>{
 const e=env();let error;e.api.prepareWatched(e.api.scope(),show,{mode:'all'},err=>error=err);e.calls[0].ok({id:123,seasons:[]});assert.ok(error);assert.equal(e.calls.length,1);
 const f=env();f.api.prepareWatched(f.api.scope(),show,{mode:'through',season:1,episode:2},err=>error=err);f.calls[0].ok({id:show.id,seasons:[{season_number:1,episode_count:2}]});f.calls[1].ok({season_number:1,episodes:[episode(1,1),episode(1,2,'2099-01-01')]});assert.match(error,/ще не вийшла/);assert.equal(f.writes.length,0);
});
test('profile change or cancel stops a chunked operation and leaves an undo in its original profile',()=>{
 const e=env(),plan=prepare(e,undefined,8),task=e.api.scope();let result;e.api.applyProgress(task,plan,r=>result=r);assert.equal(e.writes.length,8);e.profile('file_view_2');e.run();assert.equal(result.ok,false);assert.equal(e.writes.length,8);assert.equal(e.store.file_view_2,undefined);e.profile('file_view_1');assert.ok(e.api.undoPlan());
 const f=env(),p=prepare(f,undefined,8),t=f.api.scope();f.api.applyProgress(t,p,r=>result=r);t.cancel();f.run();assert.equal(f.writes.length,8);assert.equal(result.ok,false);assert.ok(f.api.undoPlan());
});
test('progress updates that arrive while confirmation is open are not overwritten',()=>{
 const e=env(),plan=prepare(e);e.L.Timeline.view(hash('11Young Sheldon')).handler(50,600,1200);const result=apply(e,plan);assert.equal(result.skipped,2);assert.equal(e.road(1,1).percent,50);
});
test('only locally retained timeline profiles are offered, without unrelated account fields',()=>{
 const e=env();e.store.file_view_2={'101':{percent:100},'102':{percent:0}};e.store.file_view=JSON.stringify({'103':100});e.store.account={token:'secret'};e.store.file_view_bad={bad:{percent:100}};
 assert.deepEqual(e.api.profileSources().map(p=>p.id),['file_view','file_view_2']);assert.ok(!JSON.stringify(e.api.profileSources()).includes('secret'));assert.ok(e.api.prepareTransfer('account').error);
});
test('transfer fills missing progress and series, preserves resets and current progress, and leaves its source unchanged',()=>{
 const e=env();e.store.file_view_2={'101':{percent:100,profile:2},'102':{percent:70,time:500},'103':100,'104':{percent:50,time:60}};
 e.store.file_view_1={'102':{percent:30,time:100,updated:4},'103':{percent:0,updated:6}};
 e.store.faborn_ukr_my_series_v1_file_view_2=[show];const original=JSON.stringify(e.store.file_view_2),plan=e.api.prepareTransfer('file_view_2');
 assert.equal(plan.count,2);assert.equal(plan.series.length,1);assert.equal(apply(e,plan).ok,true);assert.equal(e.store.file_view_1['101'].percent,100);assert.equal(e.store.file_view_1['102'].time,100);assert.equal(e.store.file_view_1['103'].percent,0);assert.equal(JSON.stringify(e.store.file_view_2),original);assert.equal(e.api.has(show),true);assert.ok(e.writes.every(w=>w.owner==='file_view_1'));
 assert.equal(e.api.prepareTransfer('file_view_2').count,0);assert.equal(e.api.prepareTransfer('file_view_2').series.length,0);
});
test('marking is rejected during playback, with no saved progress or undo changes',()=>{
 const e=env(),plan=prepare(e);e.L.Player={opened:()=>true};const result=apply(e,plan);assert.equal(result.ok,false);assert.equal(e.writes.length,0);assert.equal(e.api.undoPlan(),null);
});
test('transfer never imports an alternate episode key over existing current-profile progress',()=>{
 const e=env(),privateKey=hash('faborn|tmdb-tv-71728|1|1'),canonical=hash('11Young Sheldon');e.store.file_view_2={[privateKey]:{percent:100},[canonical]:{percent:100}};e.store.file_view_1={[canonical]:{percent:35,time:300,updated:1}};
 e.store.faborn_ukr_my_series_v1_file_view_2=[show];e.store.faborn_ukr_poster_episode_index={'tv:71728':{episodes:['1:1']}};
 const plan=e.api.prepareTransfer('file_view_2');assert.equal(plan.count,0);apply(e,plan);assert.equal(e.road(1,1).percent,35);
});
test('early startup cannot treat an uninitialized native timeline as empty history',()=>{
 const e=env(),plan=prepare(e);e.L.Timeline.view=()=>{throw new Error('not initialized');};
 assert.equal(e.api.undoPlan(),null);assert.ok(e.api.prepareTransfer('file_view_2').error);assert.equal(apply(e,plan).ok,false);assert.equal(e.writes.length,0);
});

test('library transfer includes films-only profiles and preserves current film groups and alternate progress',()=>{
 const e=env(),film={id:100,title:'Фільм',original_title:'Movie',media_type:'movie',source:'tmdb'},second={...film,id:101,original_title:'Other Film'};
 e.profile('file_view_2');e.api.saveMovie(film,'watched');e.api.saveMovie(second,'watched');e.put('faborn|tmdb-movie-100|0|0',{percent:100,time:1000,updated:1});e.put('Movie',{percent:100,time:1000,updated:1});
 const saved=JSON.stringify(e.store.faborn_ukr_my_movies_v1_file_view_2);
 e.profile('file_view_1');e.api.saveMovie(film,'wanted');e.put('Movie',{percent:0,updated:3});
 assert.equal(e.api.profileSources().find(p=>p.id==='file_view_2').movies,2);
 const plan=e.api.prepareTransfer('file_view_2');assert.equal(plan.movies.length,1);assert.equal(plan.entries.length,0);
 assert.equal(apply(e,plan).ok,true);assert.equal(e.api.movieList().find(m=>m.id===100).libraryState,'wanted');assert.equal(e.api.movieList().find(m=>m.id===101).libraryState,'watched');assert.equal(e.api.road(film,0,0).percent,0);assert.equal(JSON.stringify(e.store.faborn_ukr_my_movies_v1_file_view_2),saved);
 assert.equal(e.api.prepareTransfer('file_view_2').movies.length,0);
});
test('a profile containing only film groups can be transferred without timeline writes',()=>{
 const e=env();e.profile('file_view_2');e.api.saveMovie({id:100,title:'Фільм',media_type:'movie'},'wanted');e.profile('file_view_1');const plan=e.api.prepareTransfer('file_view_2');assert.equal(plan.movies.length,1);assert.equal(plan.count,0);assert.equal(apply(e,plan).ok,true);assert.equal(e.api.movieList()[0].libraryState,'wanted');assert.equal(e.writes.length,0);
});
