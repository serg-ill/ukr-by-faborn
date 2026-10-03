'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const factory=require('../lib/faborn-comments'),main=require('../ukr-by-faborn')({});
const movie={id:42,name:'Гангстерленд',original_name:'MobLand',first_air_date:'2025-03-30'};
const urls={uafix:'https://uafix.net/serials/gangsterlend/',uaserials:'https://uaserials.my/10382-gangsterlend-2025-n3.html'};
const fixture=id=>fs.readFileSync(__dirname+'/fixtures/'+id+'-comments.html','utf8');
const provider=id=>main.providers.find(p=>p.id===id);
const search=(id,url=urls[id])=>id==='uaserials'?'<h1>Пошук</h1><div class="short-cols"><a href="'+url+'"><div class="th-title">Гангстерленд</div><div class="th-title-oname">MobLand</div></a></div>':'<h1>Пошук</h1><a class="sres-wrap" href="'+url+'"><h2>Гангстерленд / MobLand</h2></a>';
function setup(){
 let time=0,seq=0;const timers=new Map(),requests=[];
 const root={setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:time+ms});return id;},clearTimeout(id){timers.delete(id);}};
 const options={providers:main.providers,providerSearch:main.providerSearch,providerPage:main.providerPage,sameTitle:main.sameTitle,now:()=>time,request(url,cb,timeout,post){const req={url,cb,timeout,post,aborted:false,abort(){this.aborted=true;}};requests.push(req);return req;}};
 const api=factory(root,{},null,options);
 function advance(ms){time+=ms;let runnable;while((runnable=[...timers].find(([,v])=>v.at<=time))){timers.delete(runnable[0]);runnable[1].fn();}}
 function reply(id,body,error){const req=requests.find(r=>!r.replied&&r.url.startsWith(provider(id).origin));assert.ok(req,id+' has a pending request');req.replied=true;req.cb(error||null,body);}
 function source(id){reply(id,search(id));reply(id,fixture(id));}
 return {api,requests,reply,source,advance,timers};
}
test('source comments bundle remains ES5 for Tizen',()=>{require('../vendor/acorn').parse(fs.readFileSync(require.resolve('../lib/faborn-comments'),'utf8'),{ecmaVersion:5});});
test('UAFix comments retain author, date, score, reply context and paragraph breaks',()=>{
 const {api}=setup(),rows=api.parse(fixture('uafix'),provider('uafix'),urls.uafix);
 assert.equal(rows.length,3);assert.equal(rows[0].author,'Глядач & кіноман');assert.equal(rows[0].date,'30 березня 2025 18:01');assert.equal(rows[0].score,61);assert.equal(rows[0].reply,false);assert.equal(rows[1].reply,true);
 assert.match(rows[0].text,/склад\.\nЦікаво/);assert.equal(rows[0].url,urls.uafix+'#comment-id-101');assert.ok(!rows[0].text.includes('Відповісти'));
});
test('UASerials markup and negative ratings are parsed independently from preview text',()=>{
 const {api}=setup(),rows=api.parse(fixture('uaserials'),provider('uaserials'),urls.uaserials);
 assert.equal(rows.length,2);assert.equal(rows[0].score,26);assert.equal(rows[1].score,null);assert.equal(rows[0].sourceName,'UASerials');
 assert.equal(api.parse(fixture('uafix'),provider('uafix'),urls.uafix)[1].score,-2);
});
test('relative source dates retain their wording instead of inventing an absolute date',()=>{
 const {api}=setup();for(const date of ['У понеділок у 08:43','Вчора о 17:52','Сьогодні 09:01'])assert.equal(api.parse(fixture('uaserials').replace('30 березня 2025 18:01',date),provider('uaserials'),urls.uaserials)[0].date,date);
});
test('source HTML cannot supply active markup, media requests or executable handlers',()=>{
 const {api}=setup(),row=api.parse(fixture('uafix'),provider('uafix'),urls.uafix)[1];
 assert.equal(row.text,'Згодна! 🐟 "Клас" посилання');assert.doesNotMatch(row.text,/bad|onerror|<|script|iframe/);
});
test('nested DLE spoilers preserve the entire text but are explicitly marked hidden',()=>{
 const {api}=setup(),row=api.parse(fixture('uafix'),provider('uafix'),urls.uafix)[2];
 assert.equal(row.spoiler,true);assert.match(row.text,/Прихований поворот сюжету/);assert.match(row.text,/Останній рядок відгуку\.$/);
});
test('empty comments differ from blocked or changed source markup',()=>{
 const {api}=setup();assert.deepEqual(api.parse('<div id="dle-comments-list"></div>',provider('uafix'),urls.uafix),[]);
 assert.throws(()=>api.parse('<h1>Just a moment</h1>',provider('uafix'),urls.uafix),/Не розпізнано/);
 assert.throws(()=>api.parse(fixture('uafix'),provider('uafix'),'https://uafix.net.evil/test'),/Непідтримуване/);
});
test('duplicates, missing authors and oversized input are bounded',()=>{
 const {api}=setup(),html=fixture('uafix');assert.equal(api.parse(html+html,provider('uafix'),urls.uafix).length,3);
 assert.throws(()=>api.parse(html.replace(/comm-author/g,'other'),provider('uafix'),urls.uafix),/Не розпізнано текст/);
 assert.throws(()=>api.parse('x'.repeat(2500001),provider('uafix'),urls.uafix),/Завелика/);
});
test('two metadata searches fetch matched pages without player or stream requests',()=>{
 const s=setup();let result;s.api.load(movie,r=>result=r);assert.equal(s.requests.length,2);
 s.source('uafix');s.source('uaserials');assert.equal(s.requests.length,4);assert.equal(result.comments.length,5);
 assert.deepEqual(result.comments.slice(0,4).map(c=>c.source),['uaserials','uafix','uaserials','uafix']);
 assert.deepEqual(result.sources.map(p=>p.status),['ok','ok']);assert.equal(s.timers.size,0);
});
test('mismatched release years and types never yield comments for a different title',()=>{
 const s=setup();let result;s.api.load(movie,r=>result=r);
 s.reply('uafix',search('uafix'));s.reply('uafix',fixture('uafix').replace('2025</li>','1999</li>'));
 s.reply('uafix','<h1>Пошук</h1>');
 s.reply('uaserials',search('uaserials'));s.reply('uaserials',fixture('uaserials').replace('Серіал українською','Фільм українською'));
 s.reply('uaserials','<h1>Пошук</h1>');assert.equal(result.comments.length,0);assert.ok(result.sources.every(x=>x.status==='notfound'));
});
test('search result URLs outside the exact provider are never requested',()=>{
 const s=setup();let result;s.api.load(movie,r=>result=r);
 for(const id of ['uafix','uaserials']){s.reply(id,search(id,'https://other.invalid/1-film.html'));s.reply(id,'<h1>Пошук</h1>');}
 assert.equal(result.comments.length,0);assert.ok(s.requests.every(r=>!r.url.includes('other.invalid')));
});
test('aborting a card cancels both sources and ignores late callbacks',()=>{
 const s=setup();let calls=0;const job=s.api.load(movie,()=>calls++);job.abort();
 assert.ok(s.requests.every(r=>r.aborted));s.requests.forEach(r=>r.cb(null,search('uafix')));s.advance(30000);
 assert.equal(calls,0);assert.equal(s.requests.length,2);assert.equal(s.timers.size,0);
});
test('deadline keeps successful source comments and cancels a stalled second source',()=>{
 const s=setup();let result;s.api.load(movie,r=>result=r);s.source('uafix');s.advance(18000);
 assert.equal(result.comments.length,3);assert.equal(result.sources[0].status,'timeout');assert.equal(result.sources[1].status,'ok');assert.ok(s.requests.every(r=>r.aborted));
 s.requests[0].cb(null,search('uaserials'));assert.equal(s.requests.length,3);
});
test('successful cache is reused, expires, and can be explicitly refreshed',()=>{
 const s=setup();let count=0;s.api.load(movie,()=>count++);s.source('uafix');s.source('uaserials');
 s.api.load(movie,()=>count++);s.advance(0);assert.equal(count,2);assert.equal(s.requests.length,4);
 s.api.load(movie,()=>{},true).abort();assert.equal(s.requests.length,6);
 s.advance(4*3600000+1);s.api.load(movie,()=>{}).abort();assert.equal(s.requests.length,8);
});
test('network failures are not cached as empty success and expire quickly',()=>{
 const s=setup();let result;s.api.load(movie,r=>result=r);s.reply('uafix','',new Error('CORS'));s.reply('uaserials','',new Error('CORS'));
 assert.ok(result.sources.every(r=>r.status==='network'));assert.match(s.api.statusText(result),/немає доступу/);
 s.advance(45001);s.api.load(movie,()=>{}).abort();assert.equal(s.requests.length,4);
});
test('verified HTML from online discovery is reused and rejected for a different series',()=>{
 const s=setup();s.api.remember(movie,urls.uafix,fixture('uafix'));s.api.remember({...movie,name:'Інший серіал',original_name:'Other'},urls.uaserials,fixture('uaserials'));
 let result;s.api.load(movie,r=>result=r);assert.equal(s.requests.length,1);s.source('uaserials');assert.equal(result.comments.length,5);
});
test('movie and series caches with identical IDs remain separate',()=>{
 const s=setup();s.api.load(movie,()=>{});s.source('uafix');s.source('uaserials');s.api.load({id:42,title:'Гангстерленд',release_date:'2025-03-30'},()=>{}).abort();assert.equal(s.requests.length,6);
});
test('a late-loaded bundle does not build a line in an already destroyed full card',()=>{
 const root={document:{documentElement:{contains:()=>false}}},L={Maker:{make(){throw new Error('must not build');}}};
 factory(root,L).full({type:'complite',data:{movie},link:{},object:{activity:{render:()=>[{}]}}});
});
test('the main comment-mode policy stops source rows even when the old switch was on',()=>{
 const root={},L={Storage:{get:()=> 'on'},Maker:{make(){throw Error('must not build');}}};
 factory(root,L,null,{enabled:()=>false}).full({type:'complite',data:{movie},link:{}});
});
