'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../lib/faborn-ui');
function setup(){
 const values={},requests=[],paints=[];
 const L={Storage:{get:(k,f)=>values[k]??f,set:(k,v)=>{values[k]=v;}}};
 const ui=factory({},L,null);
 const queue=ui.createHomeRatingQueue((movie,done,progress)=>requests.push({movie,done,progress}),(record,ratings)=>paints.push({record,ratings}));
 const cards=Array.from({length:12},(_,i)=>({movie:{id:i+1,title:'Movie '+(i+1)}}));
 return {values,requests,paints,ui,queue,cards};
}
test('home ratings show real available scores, without invented placeholders',()=>{
 const {ui,values}=setup();
 assert.equal(ui.homeRatingMarkup({id:1},{},false),'');
 const html=ui.homeRatingMarkup({id:1,vote_average:8},{imdb:'8.2',rt:93,mc:90},false);
 assert.match(html,/IMDb/);assert.match(html,/8\.2/);assert.match(html,/TMDB/);assert.match(html,/8\.0/);
 assert.ok(!html.includes('Rotten Tomatoes'));assert.ok(!html.includes('Metacritic'));
 const hero=ui.homeRatingMarkup({id:1,vote_average:8},{rt:0,mc:90},true);
 assert.match(hero,/Rotten Tomatoes 0%/);assert.match(hero,/Metacritic 90\/100/);
 values.faborn_ukr_ratings='off';assert.equal(ui.homeRatingMarkup({vote_average:8},{imdb:8.2},true),'');
});
test('home and full card share the validated external rating cache',()=>{
 const {ui,values}=setup(),movie={id:1,imdb_id:'tt1234567'},now=Date.now();
 const saved={schema:2,checkedAt:now,expiresAt:now+10000,imdbId:movie.imdb_id,values:{imdb:8.2}};
 values.faborn_ukr_external_ratings_cache={'movie:1':saved};
 assert.equal(ui.cachedRatings(movie),saved);assert.equal(ui.cachedRatings({id:2}),null);
 assert.equal(ui.cachedRatings({id:1,imdb_id:'tt9999999'}),null);
 saved.expiresAt=now-1;assert.equal(ui.cachedRatings(movie),null);
 saved.expiresAt=now+10000;saved.checkedAt=now+120000;assert.equal(ui.cachedRatings(movie),null);
});
test('visible home queue limits concurrency to two titles and delivers partial ratings',()=>{
 const {queue,cards,requests,paints}=setup();queue.replace(cards.slice(0,4));
 assert.deepEqual(requests.map(r=>r.movie.id),[1,2]);
 requests[0].progress({imdb:8.2});assert.equal(paints[0].ratings.imdb,8.2);assert.equal(requests.length,2);
 requests[0].done({imdb:8.2,rt:93});assert.deepEqual(requests.map(r=>r.movie.id),[1,2,3]);
 requests[1].done({});assert.deepEqual(requests.map(r=>r.movie.id),[1,2,3,4]);
});
test('moving focus replaces pending titles; late replies never paint a different row',()=>{
 const {queue,cards,requests,paints}=setup();queue.replace(cards.slice(0,4));queue.replace(cards.slice(7,11));
 requests[0].progress({imdb:8});requests[0].done({imdb:8});
 assert.deepEqual(requests.map(r=>r.movie.id),[1,2,8]);assert.equal(paints.length,0);
 requests[1].done({});assert.deepEqual(requests.map(r=>r.movie.id),[1,2,8,9]);
 requests[2].done({imdb:7});assert.equal(paints[0].record,cards[7]);
 assert.ok(!requests.some(r=>r.movie.id===3 || r.movie.id===4));
});
test('pause cancels the waiting list; resume reuses completed replies without refetch',()=>{
 const {queue,cards,requests,paints}=setup();queue.replace(cards.slice(0,4));queue.pause();
 requests[0].done({imdb:8});requests[1].done({imdb:7});assert.equal(requests.length,2);assert.equal(paints.length,0);
 queue.resume();queue.replace(cards.slice(0,2));assert.equal(requests.length,2);assert.equal(paints.length,2);
});
test('destroy prevents queued requests and all late DOM paints',()=>{
 const {queue,cards,requests,paints}=setup();queue.replace(cards.slice(0,4));queue.destroy();
 requests[0].progress({imdb:8});requests[0].done({imdb:8});requests[1].done({});
 queue.resume();queue.replace(cards.slice(4,8));assert.equal(requests.length,2);assert.equal(paints.length,0);
});
test('repeated visible cards share a request, while movies and series remain separate',()=>{
 const {queue,requests,paints}=setup();
 const movie={movie:{id:1}},duplicate={movie:{id:1}},series={movie:{id:1,media_type:'tv'}};
 queue.replace([movie,duplicate,series]);assert.equal(requests.length,2);
 requests[0].done({imdb:8});assert.deepEqual(paints.map(p=>p.record),[movie,duplicate]);
 requests[1].done({imdb:7});assert.equal(paints[2].record,series);
});
test('synchronous cache hits and failed providers cannot deadlock the visible queue',()=>{
 const {ui,cards}=setup(),seen=[],painted=[];
 const queue=ui.createHomeRatingQueue((movie,done)=>{seen.push(movie.id);if(movie.id===2)throw Error('offline');done({imdb:8});},(record)=>painted.push(record.movie.id));
 queue.replace(cards.slice(0,4));assert.deepEqual(seen,[1,2,3,4]);assert.deepEqual(painted,[1,2,3,4]);
});

test('home backdrop includes navigation only on enhanced main, never on full cards or video',()=>{
 const classes=new Set(),values={},state={component:'main'},player={opened:false};
 const doc={body:{classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}}};
 const L={Storage:{get:(k,f)=>values[k]??f},Activity:{active:()=>state},Player:{opened:()=>player.opened}};
 const ui=factory({document:doc},L,null),active=()=>classes.has('fbr-home-active');
 ui.syncHomeBackdrop();assert.equal(active(),true);
 state.component='full';ui.syncHomeBackdrop();assert.equal(active(),false);
 state.component='main';player.opened=true;ui.syncHomeBackdrop();assert.equal(active(),false);
 player.opened=false;values.faborn_ukr_home='off';ui.syncHomeBackdrop();assert.equal(active(),false);
 values.faborn_ukr_home='on';values.faborn_ukr_layout='classic';ui.syncHomeBackdrop();assert.equal(active(),true);
});
