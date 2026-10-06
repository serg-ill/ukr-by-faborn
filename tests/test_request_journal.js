'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createService}=require('../server/uakinogo/server');
const {createMetrics}=require('../server/uakinogo/metrics');
const {failure}=require('../server/uakinogo/diagnostics');

async function fixture(t,options={}) {
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'faborn-journal-')),file=path.join(dir,'metrics.json');
    const metrics=createMetrics({file});await metrics.ready;
    const server=createService({metrics,keys:['private-key-fixture'],resolve:async()=>({tracks:[]}),resolveUafix:async()=>({playerHtml:'fixture'}),...options});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});await metrics.close();await fs.rm(dir,{recursive:true,force:true});});
    const base='http://127.0.0.1:'+server.address().port;
    async function post(data={},route='/v1/resolve',key='private-key-fixture') {
        const r=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({movie:{title:'Fixture film'},...data})});
        await r.text();return r.status;
    }
    return {metrics,file,post};
}

test('journal identifies the actual endpoint for metadata, cached replies and failed authorization',async t=>{
    const s=await fixture(t);
    assert.equal(await s.post({provider:'uafix',errorCode:'title_not_found'}),200);
    assert.equal(await s.post(),200);
    assert.equal(await s.post({sourcePage:'https://uafix.net/films/fixture/',embed:'https://zetvideo.net/vod/42/',provider:'uakinogo'},'/v1/uafix/player'),200);
    assert.equal(await s.post({},'/v1/uafix/player','wrong-key-fixture'),403);
    const events=s.metrics.snapshot().events;
    assert.deepEqual(events.map(e=>e.provider),['uafix','uafix','uakinogo','uakinogo']);
    assert.equal(events[0].errorCode,'auth_failed');assert.match(events[0].reason,/логін, пароль/);
    assert.equal(events[2].cacheHit,true);assert.equal(events[3].errorCode,'');assert.equal(events[3].reason,'');
});

test('same HTTP 502 carries distinct title, player and upstream error reasons, retained across restart',async t=>{
    let index=0;
    const messages=['Назву, рік і тип не знайдено','PLAYER: другий плеєр не знайдено','Джерело: HTTP 403'];
    const s=await fixture(t,{resolve:async()=>{throw Error(messages[index++]);}});
    for(const message of messages)assert.equal(await s.post({fresh:true}),502);
    const events=s.metrics.snapshot().events;
    assert.deepEqual(events.map(e=>e.errorCode),['upstream_http','player_not_found','title_not_found']);
    assert.equal(events[0].upstreamStatus,403);assert.match(events[0].reason,/HTTP 403$/);
    assert.match(events[1].reason,/Другий плеєр Alloha/);assert.match(events[2].reason,/Назву, рік і тип/);
    await s.metrics.flush();const restored=createMetrics({file:s.file});await restored.ready;
    assert.deepEqual(restored.snapshot().events,events);await restored.close();
});

test('journal stores neither arbitrary exceptions nor source URLs, authentication material or supplied error text',async t=>{
    const s=await fixture(t,{resolve:async()=>{throw Error('private-upstream-value https://user:private-password@edge.example/secret-signed-path?token=private-token');}});
    assert.equal(await s.post({fresh:true}),502);
    const first=s.metrics.snapshot().events[0];assert.equal(first.errorCode,'resolver_error');assert.match(first.reason,/обробки відповіді/);
    s.metrics.record({status:502,provider:'private-provider',errorCode:'private-error',upstreamStatus:'private-status',reason:'private-reason',error:'private-stack',authorization:'private-auth'});
    s.metrics.record({status:200,provider:'uafix',errorCode:'auth_failed',upstreamStatus:401});
    await s.metrics.flush();
    for(const text of [await fs.readFile(s.file,'utf8'),JSON.stringify(s.metrics.snapshot())]){
        assert.equal(text.includes('private-'),false);assert.equal(text.includes('secret-signed-path'),false);
        assert.equal(text.includes('https://'),false);
    }
    assert.equal(s.metrics.snapshot().events[0].errorCode,'','successful metadata cannot retain an earlier failure');
});

test('old journal rows remain readable without inventing a provider or reconstructing missing error reasons',async t=>{
    const s=await fixture(t);await s.post();
    s.metrics.record({status:502,provider:'uakinogo',errorCode:'title_not_found'});await s.metrics.flush();
    const data=JSON.parse(await fs.readFile(s.file,'utf8'));
    for(const event of data.events){delete event.provider;delete event.errorCode;delete event.upstreamStatus;event.reason='private-forged-reason';}
    await fs.writeFile(s.file,JSON.stringify(data));
    const restored=createMetrics({file:s.file});await restored.ready;
    const snapshot=restored.snapshot();assert.equal(snapshot.total.requests,2);assert.equal(snapshot.total.errors,1);
    assert.equal(snapshot.events[0].provider,'');assert.equal(snapshot.events[0].reason,'Причину не записано');
    assert.equal(JSON.stringify(snapshot).includes('private-forged-reason'),false);await restored.close();
});

test('bounded diagnostic codes distinguish provider, transport, parsing and actual timeout failures',()=>{
    const cases=[
        [Error('UAFix: HTTP 404'),{},'upstream_http',404],
        [Error('UAFix не віддав конфігурацію плеєра'),{},'uafix_config'],
        [Error('Плеєр не належить сторінці UAFix'),{},'uafix_mismatch'],
        [Error('EPISODE: цієї серії немає у другому плеєрі'),{},'episode_not_found'],
        [Error('SESSION: формат плеєра змінився'),{},'player_format'],
        [new SyntaxError('private-json-snippet'),{},'player_format'],
        [Error('fetch failed',{cause:{code:'ENOTFOUND'}}),{},'upstream_dns'],
        [Error('fetch failed',{cause:{code:'CERT_HAS_EXPIRED'}}),{},'upstream_tls'],
        [Error('fetch failed'),{},'upstream_network'],
        [Error('private-abort-message'),{timedOut:true},'timeout'],
        [Error('Джерело: HTTP 403 password=private'),{},'resolver_error']
    ];
    for(const [error,options,code,status] of cases)assert.deepEqual(failure(error,options),status?{errorCode:code,upstreamStatus:status}:{errorCode:code});
});
