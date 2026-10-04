'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const factory=require('../lib/faborn-ui');
function environment(){const data={};const L={Storage:{get(k,f){return Object.hasOwn(data,k)?data[k]:f;},set(k,v){data[k]=v;}}};return {data,L,ui:factory({},L,null)};}
test('the new interface remains ES5 for TV browsers',()=>{require('../vendor/acorn').parse(fs.readFileSync(require.resolve('../lib/faborn-ui'),'utf8'),{ecmaVersion:5});});
test('movie and series ratings use different keys even with the same TMDB ID',()=>{const {ui}=environment();assert.equal(ui.identity({id:1,title:'Film'}),'movie:1');assert.equal(ui.identity({id:1,media_type:'tv'}),'tv:1');assert.equal(ui.identity({title:'Film'}),'');});
test('ratings preserve each source scale and reject missing or impossible numbers',()=>{const {ui}=environment();const r=ui.ratingFacts({vote_average:8.8,imdb_rating:8.6,rt_rating:'93%',metascore:90});assert.deepEqual(r.map(x=>[x.value,x.scale]),[['8.8','/10'],['8.6','/10'],['93','%'],['90','/100']]);assert.equal(ui.ratingFacts({vote_average:0,imdb_rating:99,rt_rating:'N/A'}).length,0);});
test('late source scores update existing rows without producing duplicates',()=>{const {ui}=environment();const r=ui.ratingFacts({vote_average:8,imdb_rating:8},{imdb:'8,8'});assert.equal(r.length,2);assert.equal(r[1].value,'8.8');});
test('rating labels are escaped before inserting them into the interface',()=>{const {ui}=environment();assert.ok(!ui.ratingMarkup([{id:'imdb',name:'<img onerror=x>',value:'<script>',scale:'%'}]).includes('<script>'));assert.match(ui.ratingMarkup([{id:'imdb',name:'A&B',value:8,scale:'/10'}]),/A&amp;B/);});
test('quality badges do not guess HDR, Dolby Vision or surround from 4K',()=>{const {ui}=environment();assert.deepEqual(ui.qualityFacts({qualities:['2160p'],languages:['uk','en']}),[{icon:'quality',label:'4K',kind:'4k'},{icon:'globe',label:'UA / EN',kind:'language'}]);assert.deepEqual(ui.qualityFacts(null),[]);});
test('release badges use the film premiere or first TV air date and reject impossible dates',()=>{
 const {ui}=environment();assert.equal(ui.releaseInfo({release_date:'2023-07-19'}).date,'19.07.2023');
 const tv=ui.releaseInfo({media_type:'tv',release_date:'2026-01-01',first_air_date:'2024-02-29'});assert.equal(tv.date,'29.02.2024');assert.equal(tv.label,'Прем’єра');
 for(const release_date of ['2023-02-29','2026-02-30','2026-13-01','2026-00-01','2026-01-00','2026','',null])assert.equal(ui.releaseInfo({release_date}).date,'');
 assert.equal(ui.releaseInfo({release_date:'2027-12-31'}).date,'31.12.2027');assert.equal(ui.releaseMarkup(ui.releaseInfo(null)),'');
});
test('series studio badges use real networks with production fallback and never infer a film streaming provider',()=>{
 const {ui}=environment(),data={networks:[{name:'Apple TV'},{name:' Apple   TV '},null],production_companies:[{name:'Warner Bros.'}]};
 assert.deepEqual(ui.releaseInfo({...data,media_type:'tv'}).studios.map(x=>[x.name,x.kind]),[['Apple TV','network']]);
 assert.deepEqual(ui.releaseInfo(data).studios.map(x=>x.name),['Warner Bros.']);
 assert.equal(ui.releaseInfo({...data,media_type:'tv',networks:[{name:' '}]}).studios[0].kind,'studio');
 assert.equal(ui.releaseInfo({production_companies:'Netflix'}).studios.length,0);
});
test('the first three studio badges escape external names and accept only TMDB logo paths',()=>{
 const {ui,L}=environment(),requests=[];L.TMDB={image:path=>{requests.push(path);return 'https://image.tmdb.org/'+path;}};
 const info=ui.releaseInfo({production_companies:[{name:'A <img onerror=x>',logo_path:'/real-logo_1.png'},{name:'B',logo_path:'https://tracker.test/image.png'},{name:'C',logo_path:'/../secret.png'},{name:'D',logo_path:'/broken.svg?x=y'}]});
 assert.deepEqual(requests,['t/p/w92/real-logo_1.png']);const html=ui.releaseMarkup(info);assert.ok(!html.includes('<img onerror'));assert.match(html,/A &lt;img onerror=x&gt;/);assert.ok(!html.includes('tracker.test'));assert.equal((html.match(/class="fbr-release-chip fbr-release-studio /g)||[]).length,3);for(const name of ['B','C'])assert.ok(html.includes('>'+name+'</span>'));assert.ok(!html.includes('>D</span>'));assert.ok(!html.includes('fbr-release-more'));assert.equal((html.match(/fbr-release-studio--1/g)||[]).length,1);
});
test('TV quality is explicitly limited to the episode that was searched',()=>{const {ui}=environment();assert.ok(ui.qualityFacts({qualities:['1080p'],season:2,episode:1}).some(b=>b.label==='S2E1'));assert.ok(!ui.qualityFacts({qualities:['4K HDR']}).length);});
test('quality cache expires and cannot be supplied by an unrelated title or future timestamp',()=>{const {ui,data}=environment(),m={id:1};ui.learn(m,{qualities:['1080p']});const entry=data.faborn_ukr_quality_cache['movie:1'];assert.equal(ui.cachedQuality({id:2}),null);assert.ok(ui.cachedQuality(m));assert.equal(ui.cachedQuality(m,entry.checkedAt+86400001),null);entry.checkedAt=Date.now()+120000;assert.equal(ui.cachedQuality(m),null);});
test('quality cache stays bounded without storing stream URLs',()=>{const {ui,data}=environment();for(let n=1;n<210;n++)ui.learn({id:n},{qualities:['720p'],url:'https://private.example/token'});assert.equal(Object.keys(data.faborn_ukr_quality_cache).length,180);assert.ok(!JSON.stringify(data).includes('private.example'));});
test('personal rating persists locally, is separate for TV and can be removed',()=>{const {ui}=environment(),m={id:3};assert.equal(ui.localRating(m),0);ui.localRating(m,8);assert.equal(ui.localRating(m),8);assert.equal(ui.localRating({id:3,media_type:'tv'}),0);ui.localRating(m,0);assert.equal(ui.localRating(m),0);assert.equal(ui.localRating({},10),0);});
test('home enhancement ignores actors, trailers and nonmovie utility rows',()=>{const {ui}=environment(),movie={id:1,title:'Film',poster_path:'/p.jpg'};assert.ok(ui.isMovieLine({results:[movie]}));assert.ok(!ui.isMovieLine({type:'shots',results:[movie]}));assert.ok(!ui.isMovieLine({results:[{...movie,known_for_department:'Acting'}]}));assert.ok(!ui.isMovieLine({results:[]}));});
test('native line pagination and callbacks are retained with six posters per batch',()=>{const {ui}=environment(),data={results:[{id:1,title:'Film',poster_path:'/p.jpg'}]},hooks=[];const line={view:7,params:{items:{view:7}},use(h){hooks.push(h);}};ui.enhanceLine(line,data);assert.equal(line.view,6);assert.equal(line.params.items.view,6);assert.equal(data.results[0].params.style.name,'default');assert.equal(hooks.length,1);});
test('the explicit home switch disables transformation without rewriting its input',()=>{const {ui,data}=environment();data.faborn_ukr_home='off';const line={view:7,use(){throw Error('should not alter native line');}};ui.enhanceLine(line,{results:[{id:1,title:'Film',poster_path:'/p.jpg'}]});assert.equal(line.view,7);});
test('button order preserves saved IDs with missing, new or duplicate actions',()=>{
 const {ui}=environment();assert.deepEqual(ui.orderedKeys(['online','torrent','watch','bookmark'],['torrent','missing','online','torrent']),['torrent','online','watch','bookmark']);assert.deepEqual(ui.orderedKeys(['watch','torrent','online'],null),['online','torrent','watch']);
});
test('button identity is independent of translated label, focus and plugin release number',()=>{
 const {ui}=environment();const node=(cls,label)=>({className:cls,querySelector(){return null;},getAttribute(){return label;},textContent:label});
 assert.equal(ui.buttonKey(node('selector view--faborn-ukr focus','ukr by Faborn beta.14')),'online');assert.equal(ui.buttonKey(node('view--faborn-ukr','Інша мова beta.15')),'online');assert.equal(ui.buttonKey(node('full-start__button button--book focus','Закладки')),'bookmark');assert.equal(ui.buttonKey(node('view--faborn-torrent','Торренти')),'torrent');
});
test('award totals stay distinct from review scores and nomination counts',()=>{
 const {ui}=environment();const facts=ui.awardFacts({Awards:'Won 7 Oscars. 370 wins & 394 nominations total.'});
 assert.deepEqual(facts.map(x=>[x.id,x.value,x.scale]),[['oscars','7',''],['awards','370','']]);
 assert.deepEqual(ui.awardFacts({Awards:'Nominated for 1 Oscar. 12 nominations.'}),[]);
 assert.equal(ui.ratingFacts({Awards:'7 Oscars'}).length,0);
});
test('awards require positive integral counts and accept explicit card metadata',()=>{
 const {ui}=environment();assert.deepEqual(ui.awardFacts({awards:{wins:5,oscars:{wins:2}}}).map(x=>x.value),['2','5']);
 assert.deepEqual(ui.awardFacts({oscar_wins:-1,awards_wins:2.5}),[]);
 assert.deepEqual(ui.awardFacts({awards:'N/A'}),[]);
});

const film={id:872585,imdb_id:'tt15398776',title:'Оппенгеймер',original_title:'Oppenheimer',release_date:'2023-07-19'};
test('torrent quality uses a matching title and year, rejecting unrelated films and soundtracks',()=>{
 const {ui}=environment();
 for(const Title of ['Oppenheimer (2023) 2160p HDR','Оппенгеймер / Oppenheimer (2023) 1080p'])assert.equal(ui.matchesTorrent(film,{Title}),true);
 for(const Title of ['Oppenheimer (1980) 2160p','The Real Oppenheimer (2023) 2160p','Oppenheimer: The Real Story (2023) 2160p','Oppenheimer (2023) OST FLAC','The Dark Knight (2008) 2160p'])assert.equal(ui.matchesTorrent(film,{Title}),false);
 assert.equal(ui.matchesTorrent(film,{ImdbId:'tt99999',Title:'Oppenheimer (2023) 2160p'}),false);
});
test('torrent badges describe one best release and cannot join its 4K to another release HDR',()=>{
 const {ui}=environment();ui.learnTorrents(film,{Results:[{Title:'Oppenheimer (2023) 2160p [ENG]'},{Title:'Oppenheimer (2023) 1080p HDR Dolby Atmos [UKR]'}]});
 const labels=ui.cachedTorrentQuality(film).badges.map(b=>b.label);assert.deepEqual(labels,['4K','EN']);
 const html=ui.qualityMarkup(film);assert.match(html,/Торренти/);assert.ok(!html.includes('Онлайн'));assert.ok(!html.includes('HDR'));
});
test('online and torrent quality remain distinct, with no placeholder when data is missing',()=>{
 const {ui}=environment();assert.equal(ui.qualityMarkup(film),'');assert.equal(ui.badgesMarkup(null,true),'');
 ui.learn(film,{qualities:['1080p']});ui.learnTorrents(film,{Results:[{Title:'Oppenheimer (2023) 2160p HDR'}]});
 const html=ui.qualityMarkup(film);assert.match(html,/Онлайн/);assert.match(html,/Торренти/);assert.match(html,/Full HD/);assert.match(html,/4K/);
 assert.deepEqual(ui.cachedQuality(film).qualities,['1080p']);
});
test('torrent cache excludes magnets and credentials, expires and is bounded',()=>{
 const {ui,data}=environment();for(let i=1;i<200;i++)ui.learnTorrents({...film,id:i},{Results:[{Title:'Oppenheimer (2023) 2160p',MagnetUri:'magnet:private',Link:'https://private/?apikey=secret'}]});
 const cache=data.faborn_ukr_torrent_quality_cache;assert.equal(Object.keys(cache).length,180);assert.ok(!JSON.stringify(cache).includes('private'));
 assert.equal(ui.cachedTorrentQuality({...film,id:199},cache['movie:199'].checkedAt+86400001),null);
 cache['movie:199'].checkedAt=Date.now()+120000;assert.equal(ui.cachedTorrentQuality({...film,id:199}),null);
});
test('parser observation retains callbacks, return value and the original movie identity',()=>{
 const {ui,L}=environment();let callback,received,context;L.Parser={get(params,ok){callback=ok;return 'request-handle';}};
 ui.hookParser();const wrapper=L.Parser.get;ui.hookParser();assert.equal(L.Parser.get,wrapper);
 const data={Results:[{Title:'Oppenheimer (2023) 1080p'}]};
 assert.equal(L.Parser.get({movie:film},function(d){received=d;context=this;}),'request-handle');
 callback.call(L.Parser,data);assert.equal(received,data);assert.equal(context,L.Parser);assert.ok(ui.cachedTorrentQuality(film));assert.equal(ui.cachedTorrentQuality({id:2}),null);
});
test('free-text parser refinements cannot overwrite a card quality cache',()=>{
 const {ui,L}=environment();L.Parser={get(params,ok){ok({Results:[{Title:'Oppenheimer (2023) 2160p'}]});}};ui.hookParser();L.Parser.get({movie:film,clarification:true},()=>{});assert.equal(ui.cachedTorrentQuality(film),null);
});

function automaticQuality(){
 const values={},timers=new Map();let serial=0,active={component:'full',id:872585};const calls=[];
 const node={},root={document:{documentElement:{contains:n=>n===node}},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
 const L={Storage:{get(k,f){return values[k]??f;},set(k,v){values[k]=v;},field(k){return {parser_torrent_type:'jackett',parser_use_link:'one',jackett_url:'https://configured.test',parse_lang:'df_year'}[k];}},Activity:{active:()=>active},Parser:{get(p,ok){calls.push(p);ok({Results:[{Title:'Oppenheimer (2023) 2160p'}]});}},Torrent:{start(){throw Error('metadata must not start playback');}}};
 const ui=factory(root,L,null,{torrentRequest(movie,language){return {movie:{...movie},search:movie.original_title,language};}});ui.hookParser();
 return {ui,values,calls,record:{node,movie:film},navigate(){active={component:'main'};},run(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
test('automatic quality asks only the configured native parser, caches results and never starts media',()=>{
 const e=automaticQuality();e.ui.requestTorrentQuality(e.record);e.run();assert.equal(e.calls.length,1);assert.equal(e.calls[0].language,'df_year');assert.deepEqual(e.calls[0].movie.genres,[]);assert.equal(e.calls[0].movie.id,872585);
 assert.ok(e.ui.cachedTorrentQuality(film));e.ui.requestTorrentQuality(e.record);assert.equal(e.calls.length,1);
});
test('leaving the card or choosing manual quality prevents a delayed background search',()=>{
 const e=automaticQuality();e.ui.requestTorrentQuality(e.record);e.navigate();e.run();assert.equal(e.calls.length,0);
 const f=automaticQuality();f.ui.requestTorrentQuality(f.record);f.values.faborn_ukr_torrent_quality='search';f.run();assert.equal(f.calls.length,0);
});

test('feed appearance is reversible and hiding is independent of the global theme',()=>{
 const {ui,data}=environment();assert.equal(ui.feedMode(),'compact');data.faborn_ukr_feed='native';assert.equal(ui.feedMode(),'native');data.faborn_ukr_feed='compact';data.faborn_ukr_layout='classic';assert.equal(ui.feedMode(),'compact');data.faborn_ukr_feed='off';assert.equal(ui.feedMode(),'off');
});
test('feed summaries distinguish episodes from films and preserve missing-data fallback',()=>{
 const {ui}=environment(),fallback={title:'Native title',meta:'IMDb 8.2'};
 assert.deepEqual(ui.feedSummary({card_type:'tv',data:{name:'Series',first_air_date:'2020-03-01'}},fallback),{title:'Series',meta:'2020 · Серіал',movie:{name:'Series',first_air_date:'2020-03-01'}});
 assert.equal(ui.feedSummary({card_type:'movie',data:{title:'Film',release_date:'2023-01-01'}},fallback).meta,'2023 · Фільм');assert.equal(ui.feedSummary(null,fallback).meta,'IMDb 8.2');assert.equal(ui.feedSummary(null,fallback).title,'Native title');
});

for(const layout of ['panel','cinema','classic'])test('layout '+layout+' preserves enabled features and respects their own switches',()=>{
 const {ui,data}=environment();data.faborn_ukr_layout=layout;
 const line={view:7,params:{items:{}},use(){}};
 ui.enhanceLine(line,{results:[{id:1,title:'Film',poster_path:'/p.jpg'}]});assert.equal(line.view,6);
 assert.match(ui.homeRatingMarkup({vote_average:8},null,false),/TMDB/);assert.equal(ui.feedMode(),'compact');
 data.faborn_ukr_ratings='off';assert.equal(ui.homeRatingMarkup({vote_average:8},null,false),'');
 data.faborn_ukr_home='off';const native={view:7,use(){throw Error('disabled home');}};ui.enhanceLine(native,{results:[{id:1,title:'Film',poster_path:'/p.jpg'}]});assert.equal(native.view,7);
 data.faborn_ukr_feed='native';assert.equal(ui.feedMode(),'native');data.faborn_ukr_feed='off';assert.equal(ui.feedMode(),'off');
 assert.equal(data.faborn_ukr_layout,layout);
});
