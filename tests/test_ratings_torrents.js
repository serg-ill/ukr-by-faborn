'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../lib/faborn-ui');
const movie={id:872585,imdb_id:'tt15398776',title:'Oppenheimer'};
function environment(){
 const data={},requests=[];
 const L={Storage:{get(k,f){return Object.hasOwn(data,k)?data[k]:f;},set(k,v){data[k]=v;}}};
 class XHR {open(method,url){this.url=url;requests.push(this);}send(){}reply(data,status=200){this.status=status;this.responseText=JSON.stringify(data);this.onload();}}
 const root={XMLHttpRequest:XHR,setTimeout,clearTimeout};
 return {ui:factory(root,L,null),data,L,requests};
}
function aggregate(id,text){return {streams:[{externalUrl:'https://www.imdb.com/title/'+id+'/',description:text}]};}
test('ratings are keyed to the exact IMDb ID, ignoring other movies and lookalike domains',()=>{
 const {ui}=environment();
 assert.deepEqual(ui.parsedRatings({meta:{id:'tt12345',imdbRating:9}},movie.imdb_id,'cinemeta'),{});
 assert.deepEqual(ui.parsedRatings(aggregate('tt12345','RT: 93/100'),movie.imdb_id,'aggregator'),{});
 const fake=aggregate(movie.imdb_id,'RT: 93/100');fake.streams[0].externalUrl='https://imdb.com.evil.test/title/'+movie.imdb_id+'/';
 assert.deepEqual(ui.parsedRatings(fake,movie.imdb_id,'aggregator'),{});
});
test('aggregator keeps critics distinct from audience ratings and preserves valid zero scores',()=>{
 const {ui}=environment();
 const d=aggregate(movie.imdb_id,'IMDb : 8.2/10\n🍅 RT : 93/100\nRT Users: 95/100\nMC: 0/100\nMC Users: 8.2/10\nTMDb: 8/10');
 assert.deepEqual(ui.parsedRatings(d,movie.imdb_id,'aggregator'),{imdb:'8.2',rt:'93',mc:'0'});
 assert.equal(ui.ratingFacts({}, {rt:'0'})[0].value,'0');
 assert.deepEqual(ui.parsedRatings(aggregate(movie.imdb_id,'MC: 8/10\nRT: 103/100\nIMDb: 12/10'),movie.imdb_id,'aggregator'),{});
});
test('deduplicated live requests cache exact-title results and need no API key',()=>{
 const {ui,requests}=environment(),outputs=[];
 ui.loadRatings(movie,v=>outputs.push(v));ui.loadRatings(movie,v=>outputs.push(v));assert.equal(requests.length,2);
 requests[0].reply({meta:{id:movie.imdb_id,imdbRating:'8.2'}});
 requests[1].reply(aggregate(movie.imdb_id,'RT: 93/100'));
 assert.deepEqual(outputs,[{imdb:'8.2',rt:'93'},{imdb:'8.2',rt:'93'}]);
 ui.loadRatings(movie,v=>outputs.push(v));assert.equal(requests.length,2);assert.equal(outputs.length,3);
 assert.ok(!requests.some(r=>r.url.includes('apikey')));
});
test('missing IMDb IDs use the appropriate TMDB external IDs endpoint for series',()=>{
 const {ui,L,requests}=environment();let path;
 L.Api={sources:{tmdb:{get(p,args,success){path=p;success({id:136311,imdb_id:'tt15677150'});}}}};
 ui.loadRatings({id:136311,original_name:'Shrinking'},()=>{});
 assert.equal(path,'tv/136311/external_ids');assert.equal(requests.length,2);assert.ok(requests.every(r=>r.url.includes('/series/tt15677150.json')));
 requests.forEach(r=>r.reply({}));
});
test('a mismatched TMDB response never triggers ratings for another movie',()=>{
 const {ui,L,requests}=environment();let result;
 L.Api={sources:{tmdb:{get(p,args,success){success({id:7,imdb_id:'tt1234567'});}}}};
 ui.loadRatings({id:1},v=>result=v);assert.deepEqual(result,{});assert.equal(requests.length,0);
});
test('network failures retain successful scores and retry after the short failure cache expires',()=>{
 const {ui,data,requests}=environment();let value;
 ui.loadRatings(movie,v=>value=v);
 requests[0].reply({meta:{id:movie.imdb_id,imdbRating:'8.2'}});requests[1].onerror();
 assert.deepEqual(value,{imdb:'8.2'});
 const cached=data.faborn_ukr_external_ratings_cache['movie:872585'];assert.ok(cached.expiresAt-cached.checkedAt<=300000);
 cached.expiresAt=Date.now()-1;ui.loadRatings(movie,()=>{});assert.equal(requests.length,4);requests.slice(2).forEach(r=>r.ontimeout());
});
test('changed IMDb ID, expired and future-dated cache entries cannot poison a card',()=>{
 const {ui,data,requests}=environment();
 data.faborn_ukr_external_ratings_cache={'movie:872585':{imdbId:'tt12345',checkedAt:Date.now(),expiresAt:Date.now()+86400000,values:{imdb:'9.9'}}};
 ui.loadRatings(movie,()=>{});assert.equal(requests.length,2);requests.forEach(r=>r.reply({}));
 data.faborn_ukr_external_ratings_cache['movie:872585'].checkedAt=Date.now()+120000;
 ui.loadRatings(movie,()=>{});assert.equal(requests.length,4);requests.slice(2).forEach(r=>r.reply({}));
});
test('concurrent cards preserve both cache entries and correct callbacks',()=>{
 const {ui,data,requests}=environment(),seen={};
 ui.loadRatings(movie,v=>seen.movie=v);ui.loadRatings({id:136311,media_type:'tv',imdb_id:'tt15677150'},v=>seen.tv=v);
 requests[2].reply({meta:{id:'tt15677150',imdbRating:'8.1'}});requests[3].reply(aggregate('tt15677150','RT: 94/100'));
 requests[0].reply({meta:{id:movie.imdb_id,imdbRating:'8.2'}});requests[1].reply(aggregate(movie.imdb_id,'RT: 93/100'));
 assert.equal(seen.movie.rt,'93');assert.equal(seen.tv.rt,'94');assert.equal(Object.keys(data.faborn_ukr_external_ratings_cache).length,2);
});
test('disabling Faborn ratings makes no network requests',()=>{
 const {ui,data,requests}=environment();data.faborn_ukr_ratings='off';let value;
 ui.loadRatings(movie,v=>value=v);assert.deepEqual(value,{});assert.equal(requests.length,0);
});
test('torrent recommendations require 50 real seeds, not unknown or malformed numbers',()=>{
 const {ui}=environment();
 for(const seeds of [undefined,null,'',-1,'many','50k',49])assert.equal(ui.torrentFacts({Seeders:seeds}).recommended,false);
 for(const seeds of [50,'50',128])assert.equal(ui.torrentFacts({Seeders:seeds}).recommended,true);
 assert.equal(ui.torrentFacts({Seeders:0}).seeds,0);assert.equal(ui.torrentFacts({}).seeds,null);
});
test('Toloka highlight uses tracker identity only',()=>{
 const {ui}=environment();
 for(const Tracker of ['Toloka','toloka.to','Toloka (hurtom)','Толока','Hurtom'])assert.ok(ui.torrentFacts({Tracker}).toloka);
 for(const Tracker of ['RuTracker','notoloka','tolokaholic'])assert.ok(!ui.torrentFacts({Tracker,Title:'Toloka movie'}).toloka);
});
test('torrent metadata provides quality, declared HDR and audio languages without guessing',()=>{
 const {ui}=environment(),labels=x=>ui.torrentFacts(x).badges.map(b=>b.label);
 assert.deepEqual(labels({Title:'Movie (2023) UHD BluRay REMUX 2160p HDR10 HEVC [UKR/ENG/RUS]'}),['4K','REMUX','HDR','HEVC','UA','EN','RU']);
 assert.deepEqual(labels({Title:'Film 2160p'}),['4K']);
 assert.deepEqual(labels({Title:'Film ENCODED RUSH 1080p'}),['1080p']);
 assert.ok(!labels({Title:'Film DVDRip'}).includes('Dolby Vision'));
});
test('ffprobe resolution wins over filename guesses and preserves surround metadata',()=>{
 const {ui}=environment();
 const f=ui.torrentFacts({Title:'Film 2160p',ffprobe:[{codec_type:'video',height:1080,codec_name:'h264'},{codec_type:'audio',channels:6,tags:{language:'ukr'}}]});
 assert.deepEqual(f.badges.map(b=>b.label),['1080p','H.264','UA','5.1']);
});
test('untrusted tracker names and file details cannot inject HTML or introduce focusable controls',()=>{
 const {ui}=environment(),m=ui.torrentMarkup(ui.torrentFacts({Tracker:'<img onerror=x>',Seeders:100}),{size:'<script>x</script>'});
 assert.ok(!m.header.includes('<img'));assert.ok(!m.summary.includes('<script>'));assert.ok(m.header.includes('&lt;img'));
 assert.ok(!/class="[^"]*selector/.test(m.header+m.summary));
});
test('cropped 4K is recognized while measured SD cannot inherit a false 4K filename',()=>{
 const {ui}=environment();
 assert.equal(ui.torrentFacts({Title:'Film',ffprobe:[{codec_type:'video',width:3840,height:1600}]}).badges[0].label,'4K');
 assert.equal(ui.torrentFacts({Title:'Film 2160p',ffprobe:[{codec_type:'video',width:720,height:480}]}).badges[0].label,'480p');
});
test('a synchronous TMDB failure cannot break card rendering',()=>{
 const {ui,L,requests}=environment();let value;
 L.Api={sources:{tmdb:{get(){throw new Error('Offline');}}}};
 ui.loadRatings({id:42},v=>value=v);assert.deepEqual(value,{});assert.equal(requests.length,0);
});
