'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),factory=require('../lib/faborn-hub');
function env(){
 const storage={},marks={},calls=[],timers=new Map(),history=[],viewed={};let profile='file_view',serial=0;
 const L={Storage:{get:(k,f)=>Object.hasOwn(storage,k)?storage[k]:f,set:(k,v)=>{storage[k]=v;}},Timeline:{filename:()=>profile,view:k=>marks[profile+'|'+k]||{}},Utils:{hash:k=>k},Favorite:{get:()=>history,check:m=>({viewed:!!viewed[m.id]})},Api:{sources:{tmdb:{get:(path,params,ok,fail)=>calls.push({path,params,ok,fail})}}}};
 const root={setTimeout:(fn)=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 const api=factory(root,L,null);
 return {api,L,root,storage,calls,timers,history,viewed,profile:p=>profile=p,put:(k,v)=>marks[profile+'|'+k]=v};
}
const show={id:71728,name:'Юний Шелдон',original_name:'Young Sheldon',first_air_date:'2017-09-25',media_type:'tv',source:'tmdb'};
const film={id:100,title:'Фільм',original_title:'Movie',release_date:'2023-01-01',vote_average:8,runtime:89,source:'tmdb'};
const episodes=[1,2,3,4].map(n=>({season_number:2,episode_number:n,name:'Серія '+n,air_date:n===4?'2099-01-01':'2023-01-01'}));
test('new menu module is ES5 for Tizen',()=>{require('../vendor/acorn').parse(fs.readFileSync(require.resolve('../lib/faborn-hub'),'utf8'),{ecmaVersion:5});});
test('following is explicit, idempotent and persists through module recreation',()=>{
 const e=env();assert.equal(e.api.list().length,0);assert.equal(e.api.follow(show,true).changed,true);assert.equal(e.api.follow(show,true).changed,false);
 assert.equal(factory(e.root,e.L,null).has(show),true);assert.equal(e.api.list().length,1);
});
test('personal lists isolate profiles; removing never writes timeline or native favorites',()=>{
 const e=env();e.api.follow(show,true);e.put('21Young Sheldon',{percent:50,time:600,updated:20});e.profile('file_view_2');assert.equal(e.api.has(show),false);
 e.api.follow({...show,id:2,name:'Інший'},true);e.profile('file_view');e.api.follow(show,false);assert.equal(e.api.road(show,2,1).time,600);assert.equal(e.history.length,0);
 e.profile('file_view_2');assert.equal(e.api.list()[0].id,2);
});
test('list stores public identity only, not source URLs, tokens or credentials',()=>{
 const e=env();e.api.follow({...show,url:'secret-token',password:'secret',episodes:[{url:'secret'}]},true);assert.ok(!JSON.stringify(e.storage).includes('secret'));
 assert.equal(e.api.follow(film,true).ok,false);assert.equal(e.api.follow({...show,source:'other'},true).ok,false);
});
test('history suggestions neither auto-import nor include films, duplicates or already followed shows',()=>{
 const e=env();e.history.push(film,show,show,{...show,id:2});assert.deepEqual(e.api.importCandidates().map(m=>m.id),[71728,2]);assert.equal(e.api.list().length,0);
 e.api.follow(show,true);assert.deepEqual(e.api.importCandidates().map(m=>m.id),[2]);
});
test('a storage failure reports failure instead of claiming the show was followed',()=>{
 const e=env();e.L.Storage.set=()=>{throw Error('full');};assert.equal(e.api.follow(show,true).ok,false);assert.equal(e.api.has(show),false);
});
test('newer reset beats an older watched mark across online and torrent keys',()=>{
 const e=env();e.put('faborn|tmdb-tv-71728|2|1',{percent:100,time:1200,updated:1});e.put('21Young Sheldon',{percent:0,time:0,updated:2});assert.equal(e.api.road(show,2,1).percent,0);
 e.put('21Young Sheldon',{percent:32,time:400,updated:3});assert.equal(e.api.road(show,2,1).time,400);
});
test('latest episode reads native later-season progress and obeys current profile',()=>{
 const e=env(),details={seasons:[{season_number:11,episode_count:2}]};e.put('11:2Young Sheldon',{percent:40,time:300,updated:10});
 assert.equal(e.api.latestEpisode(show,details).season,11);e.profile('other');assert.equal(e.api.latestEpisode(show,details),null);
});
test('series summary counts only actually dated released episodes of this season',()=>{
 const e=env();e.put('21Young Sheldon',{percent:95,updated:1});
 const season={season_number:2,episodes:episodes.concat([{season_number:3,episode_number:1,air_date:'2020-01-01'},{season_number:2,episode_number:8,air_date:'2026-02-30'},episodes[0]])};
 const result=e.api.summary(show,{seasons:[{season_number:2,episode_count:4}]},season,'2026-10-02');
 assert.equal(result.pending,2);assert.equal(result.watched,1);assert.equal(result.next.episode,2);assert.equal(result.upcoming.episode,4);
 assert.ok(!Object.hasOwn(result,'streamAvailable'));
});
test('earlier next-season air date wins; missing release dates do not invent availability',()=>{
 const e=env(),details={next_episode_to_air:{season_number:3,episode_number:1,air_date:'2027-01-01'}};
 const r=e.api.summary(show,details,{season_number:2,episodes},'2026-10-02');assert.equal(r.upcoming.season,3);
 const empty=e.api.summary(show,{status:'Ended'},{season_number:1,episodes:[{season_number:1,episode_number:1,air_date:null}]},'2026-10-02');assert.equal(empty.pending,0);assert.equal(empty.ended,true);
});
test('discovery query uses duration, mood and genuine TMDB rating without treating original language as dubbing',()=>{
 const e=env(),q=e.api.discoveryRequest({mood:'tense',minutes:90,rating:7},1,'2026-10-02');
 assert.equal(q.filter.with_genres,'53|9648');assert.equal(q.filter['with_runtime.lte'],90);assert.equal(q.filter['with_runtime.gte'],1);assert.equal(q.filter['vote_average.gte'],7);assert.equal(q.filter['vote_count.gte'],100);
 assert.ok(!('with_original_language' in q.filter));assert.equal(q.filter.include_adult,'false');
});
test('malformed filters cannot add arbitrary API keys or unbounded pages',()=>{
 const e=env(),q=e.api.discoveryRequest({mood:'x&api_key=bad',minutes:-3,rating:99},900,'2026-10-02');
 assert.equal(q.page,1);assert.equal(q.filter['with_runtime.lte'],120);assert.ok(!JSON.stringify(q).includes('bad'));
});
test('request queue bounds concurrency, ignores cancelled results and does not start obsolete work',()=>{
 const e=env(),s=e.api.scope(),seen=[];for(let i=1;i<=5;i++)e.api.request(s,'movie/'+i,{},(err,data)=>seen.push(data));assert.equal(e.calls.length,2);
 s.cancel();e.calls[0].ok({id:1});e.calls[1].ok({id:2});assert.equal(e.calls.length,2);assert.equal(seen.length,0);assert.equal(e.timers.size,0);
});
test('profile change blocks late results and future requests from the old profile',()=>{
 const e=env(),s=e.api.scope();let painted=0;e.api.request(s,'tv/1',{},()=>painted++);e.profile('new');e.calls[0].ok({id:1});e.api.request(s,'tv/2',{},()=>painted++);assert.equal(painted,0);assert.equal(e.calls.length,1);
});
test('network timeout completes once, frees queue slot, and late success cannot repaint',()=>{
 const e=env(),s=e.api.scope(),events=[];for(let i=0;i<3;i++)e.api.request(s,'tv/'+i,{},(err)=>events.push(err));
 const timeout=[...e.timers.values()][0];timeout();assert.equal(e.calls.length,3);e.calls[0].ok({id:0});assert.equal(events.length,1);assert.match(events[0],/TMDB/);
 e.calls[1].fail();e.calls[2].fail();assert.equal(e.timers.size,0);
});
test('metadata cache is reused, while live profile progress is recomputed independently',()=>{
 const e=env(),s=e.api.scope();let n=0;e.api.request(s,'tv/1',{},()=>n++);e.calls[0].ok({id:1});e.api.request(s,'tv/1',{},()=>n++);assert.equal(n,2);assert.equal(e.calls.length,1);
});
test('series loading validates identity before requesting a season',()=>{
 const e=env();let error;e.api.loadSeries(e.api.scope(),show,(err)=>error=err);e.calls[0].ok({id:999,seasons:[{season_number:1,episode_count:2}]});assert.match(error,/інший/);assert.equal(e.calls.length,1);
});
test('incomplete season metadata does not leave the series page stuck loading',()=>{
 const e=env();let result;
 e.api.loadSeries(e.api.scope(),show,(err,data)=>{assert.equal(err,null);result=data;});
 e.calls[0].ok({id:show.id,seasons:{unavailable:true}});
 e.calls[1].ok({season_number:1,episodes:[null,{season_number:1,episode_number:1,air_date:'2020-01-01'}]});
 assert.equal(result.state.pending,1);assert.equal(e.timers.size,0);
 assert.equal(e.api.latestEpisode(show,{seasons:[null]}),null);
});
test('completed season moves to the next released season, never to an undated or future one',()=>{
 const e=env();e.put('21Young Sheldon',{percent:100,updated:1});let result;
 e.api.loadSeries(e.api.scope(),show,(err,data)=>{assert.equal(err,null);result=data;});e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:1,air_date:'2020-01-01'},{season_number:3,episode_count:1,air_date:'2021-01-01'},{season_number:4,episode_count:1,air_date:'2099-01-01'}]});
 assert.match(e.calls[1].path,/season\/2$/);e.calls[1].ok({season_number:2,episodes:[episodes[0]]});assert.match(e.calls[2].path,/season\/3$/);
 e.calls[2].ok({season_number:3,episodes:[{season_number:3,episode_number:1,air_date:'2021-01-01'}]});assert.equal(result.state.pending,1);assert.equal(result.state.season,3);
});
test('discovery skips history, manual viewed, duplicate suggestions and runtime mismatches',()=>{
 const e=env();e.history.push({...film,id:1});e.viewed[2]=true;let result;
 const movies=[1,2,3,4,5,6,7].map(id=>({...film,id}));
 e.api.recommendations(e.api.scope(),e.api.normalizeFilters({minutes:90,rating:7}),[3],(err,data)=>result=data);
 e.calls[0].ok({results:movies,total_pages:1});let i=1;
 while(i<e.calls.length){const c=e.calls[i++],id=+c.path.split('/')[1];c.ok({...film,id,runtime:id===4?190:89});}
 assert.deepEqual(result.map(m=>m.id).sort(),[5,6,7]);assert.ok(e.calls.every(c=>!/^movie\/[123]$/.test(c.path)));
});
test('cancelled discovery cannot start follow-up metadata queries or return cards',()=>{
 const e=env(),s=e.api.scope();let done=false;e.api.recommendations(s,e.api.normalizeFilters({}),[],()=>done=true);s.cancel();e.calls[0].ok({results:[film],total_pages:1});assert.equal(done,false);assert.equal(e.calls.length,1);
});
test('recommendation failure returns a recoverable error and no invented results',()=>{
 const e=env();let error,cards;e.api.recommendations(e.api.scope(),e.api.normalizeFilters({}),[],(err,data)=>{error=err;cards=data;});e.calls[0].fail();assert.match(error,/TMDB/);assert.deepEqual(cards,[]);
});
test('untrusted titles and descriptions cannot inject UI markup',()=>{
 const e=env();assert.equal(e.api.esc('<img onerror="bad">&'), '&lt;img onerror=&quot;bad&quot;&gt;&amp;');
});
const ep=(n,day,season=2)=>({season_number:season,episode_number:n,air_date:day});
test('release countdown uses calendar days across months, leap days and DST, with Ukrainian labels',()=>{
 const e=env(),info=(day,next)=>e.api.releaseInfo({next_episode_to_air:ep(4,next)},day);
 assert.equal(info('2026-10-24','2026-10-25').label,'Нова серія завтра');
 assert.equal(info('2028-02-28','2028-03-01').label,'Нова серія через 2 дні');
 assert.equal(info('2026-12-31','2027-01-21').label,'Нова серія через 21 день');
 assert.equal(info('2026-10-02','2026-10-13').label,'Нова серія через 11 днів');
 assert.equal(info('2026-10-02','2026-10-02').kind,'today');
 assert.equal(e.api.releaseInfo({last_episode_to_air:ep(3,'2026-10-02'),next_episode_to_air:ep(4,'2026-10-09')},'2026-10-02').episode,3);
 assert.equal(info('2026-10-02','2026-02-30'),null);assert.equal(info('2026-10-02',null),null);
});
test('first release check seeds a baseline, later episodes notify once even after module restart',()=>{
 const e=env(),messages=[];e.L.Noty={show:s=>messages.push(s)};e.api.follow(show,true);
 const details=n=>({id:show.id,last_episode_to_air:ep(n,'2026-10-02')});
 assert.equal(e.api.observeRelease(show,details(1),'2026-10-02'),false);assert.equal(e.api.flushReleases(),false);
 assert.equal(e.api.observeRelease(show,details(2),'2026-10-02'),true);assert.equal(e.api.flushReleases(),true);assert.match(messages[0],/S2E2/);
 const again=factory(e.root,e.L,null);again.observeRelease(show,details(2),'2026-10-02');assert.equal(again.flushReleases(),false);assert.equal(messages.length,1);
});
test('future, mismatched and unfollowed series never produce a release alert',()=>{
 const e=env();e.api.follow(show,true);
 e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(1,'2026-10-01')},'2026-10-02');
 e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(2,'2026-10-03')},'2026-10-02');
 e.api.observeRelease(show,{id:999,last_episode_to_air:ep(3,'2026-10-02')},'2026-10-02');
 e.api.observeRelease({...show,id:999},{id:999,last_episode_to_air:ep(4,'2026-10-02')},'2026-10-02');
 assert.equal(e.api.flushReleases(),false);assert.equal(e.storage.faborn_ukr_series_releases_v1_file_view[show.id].last.episode,1);
});
test('release notifications wait for the player and dialogs to close; marked episodes are skipped',()=>{
 const e=env(),messages=[];let playing=true,dialog=false;e.L.Player={opened:()=>playing};e.L.Select={opened:()=>dialog};e.L.Noty={show:s=>messages.push(s)};e.api.follow(show,true);
 e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(1,'2026-10-01')},'2026-10-02');e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(2,'2026-10-02')},'2026-10-02');
 assert.equal(e.api.flushReleases(),false);playing=false;dialog=true;assert.equal(e.api.flushReleases(),false);dialog=false;assert.equal(e.api.flushReleases(),true);
 e.put('23Young Sheldon',{percent:100});e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(3,'2026-10-02')},'2026-10-02');assert.equal(e.api.flushReleases(),false);assert.equal(messages.length,1);
});
test('notifications honor disabled setting, removal and profile boundaries',()=>{
 const e=env();e.L.Noty={show:()=>{throw Error('unexpected notification');}};e.api.follow(show,true);e.storage.faborn_ukr_episode_notifications='off';
 e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(1,'2026-10-01')},'2026-10-02');e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(2,'2026-10-02')},'2026-10-02');
 e.storage.faborn_ukr_episode_notifications='on';assert.equal(e.api.flushReleases(),false);
 e.profile('other');e.api.follow(show,true);e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(3,'2026-10-02')},'2026-10-02');assert.equal(e.api.flushReleases(),false);
 e.profile('file_view');e.api.follow(show,false);assert.equal(Object.keys(e.storage.faborn_ukr_series_releases_v1_file_view).length,0);
 e.api.follow(show,true);e.api.observeRelease(show,{id:show.id,last_episode_to_air:ep(3,'2026-10-02')},'2026-10-02');assert.equal(e.api.flushReleases(),false);
});
test('background checks are cached for six hours, never run during playback and reject old-profile replies',()=>{
 const e=env();let playing=true;e.L.Player={opened:()=>playing};e.api.follow(show,true);e.api.checkReleases();assert.equal(e.calls.length,0);
 playing=false;e.api.checkReleases();assert.equal(e.calls.length,1);e.calls[0].ok({id:show.id,last_episode_to_air:ep(1,'2026-10-01')});
 e.api.checkReleases();assert.equal(e.calls.length,1);e.profile('other');e.api.follow({...show,id:5},true);e.api.checkReleases();assert.equal(e.calls.length,2);
 e.profile('file_view');e.calls[1].ok({id:5,last_episode_to_air:ep(1,'2026-10-01')});assert.equal(e.storage.faborn_ukr_series_releases_v1_other[5],undefined);
});

test('series list reuses calculated state across pages without reading Timeline again',()=>{
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();let reads=0,result;
 const view=e.L.Timeline.view;e.L.Timeline.view=k=>{reads++;return view(k);};
 e.put('21Young Sheldon',{percent:40,updated:10});
 cache.load(task,show,(err,data)=>{assert.equal(err,null);result=data;});
 e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:100}]});
 e.calls[1].ok({season_number:2,episodes});
 assert.equal(reads,208,'one full season scan and one current-season summary');
 const before=reads;
 for(let i=0;i<120;i++)cache.load(task,show,(err,data)=>assert.equal(data,result));
 assert.equal(reads,before);assert.equal(e.calls.length,2);assert.equal(cache.get(show).state.last.episode,1);
});
test('Timeline invalidation refreshes progress from retained metadata without network calls',()=>{
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();let result;
 cache.load(task,show,(err,data)=>result=data);
 e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:4}]});e.calls[1].ok({season_number:2,episodes});
 assert.equal(result.state.pending,3);
 e.put('21Young Sheldon',{percent:100,updated:20});cache.invalidate();cache.load(task,show,(err,data)=>result=data);
 assert.equal(e.calls.length,2);assert.equal(result.state.pending,2);assert.equal(result.state.watched,1);
 e.put('21Young Sheldon',{percent:0,updated:30});cache.invalidate();cache.load(task,show,(err,data)=>result=data);
 assert.equal(result.state.pending,3);assert.equal(result.state.last,null);
});
test('cached completed season still loads the next released season after progress changes',()=>{
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();let result;
 cache.load(task,show,(err,data)=>result=data);
 e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:1,air_date:'2020-01-01'},{season_number:3,episode_count:1,air_date:'2021-01-01'}]});
 e.calls[1].ok({season_number:2,episodes:[episodes[0]]});
 e.put('21Young Sheldon',{percent:100,updated:20});cache.invalidate();cache.load(task,show,(err,data)=>result=data);
 assert.equal(e.calls.length,3);assert.equal(e.calls[2].path,'tv/'+show.id+'/season/3');
 e.calls[2].ok({season_number:3,episodes:[{season_number:3,episode_number:1,air_date:'2021-01-01'}]});
 assert.equal(result.state.season,3);assert.equal(result.state.pending,1);
});
test('series cache cannot mix profiles or accept obsolete progress calculations',()=>{
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();let delivered=0;
 cache.load(task,show,()=>delivered++);cache.invalidate();
 e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:4}]});e.calls[1].ok({season_number:2,episodes});
 assert.equal(delivered,0);assert.equal(cache.get(show),undefined);
 cache.load(task,show,()=>delivered++);assert.equal(delivered,1);assert.ok(cache.get(show));
 e.profile('other');assert.equal(cache.get(show),undefined);cache.load(task,show,()=>delivered++);assert.equal(delivered,1);
});
test('failed series metadata is retryable and cache clear releases saved rows',()=>{
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();
 cache.load(task,show,()=>{});e.calls[0].fail();assert.ok(cache.get(show).error);
 cache.load(task,show,()=>{});assert.equal(e.calls.length,2);
 e.calls[1].ok({id:show.id,seasons:[{season_number:2,episode_count:4}]});e.calls[2].ok({season_number:2,episodes});
 assert.ok(cache.get(show).state);cache.clear();assert.equal(cache.get(show),undefined);
});
test('a new calendar day recomputes release counts even within the metadata TTL',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(2026,9,2,23,59).getTime()});
 const e=env(),cache=e.api.seriesCache(),task=e.api.scope();let result;
 cache.load(task,show,(err,data)=>result=data);
 e.calls[0].ok({id:show.id,seasons:[{season_number:2,episode_count:2}]});
 e.calls[1].ok({season_number:2,episodes:[{season_number:2,episode_number:1,air_date:'2026-10-02'},{season_number:2,episode_number:2,air_date:'2026-10-03'}]});
 assert.equal(result.state.pending,1);t.mock.timers.tick(120000);
 cache.load(task,show,(err,data)=>result=data);assert.equal(result.state.pending,2);
});
