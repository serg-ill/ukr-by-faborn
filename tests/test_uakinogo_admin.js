'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {record,createUserStore}=require('../server/uakinogo/auth');
const {change}=require('../server/uakinogo/users');
const {createService}=require('../server/uakinogo/server');
const {createMetrics}=require('../server/uakinogo/metrics');
const basic=(name,pass)=>'Basic '+Buffer.from(name+':'+pass).toString('base64');
async function fixture(t,{peer,clock,resolve,allowLan='',enabled=true}={}) {
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'faborn-admin-')),file=path.join(dir,'users.json'),adminFile=path.join(dir,'admin.json');
    await fs.writeFile(file,JSON.stringify({version:1,enabled:true,users:[await record('friend','viewer-fixture')]}));
    await fs.writeFile(adminFile,JSON.stringify({version:1,enabled:true,users:[await record('admin','admin-fixture')]}));
    const metrics=createMetrics({file:path.join(dir,'metrics.json'),now:clock||Date.now});await metrics.ready;
    const users=createUserStore(file),server=createService({users,metrics,allowLan,
        resolve:resolve|| (async()=>({ok:true,tracks:[],url:'https://media.example/signed-private-value'})),
        admin:enabled?{file:adminFile,allowLan:'192.168.88.0/24',now:clock||Date.now}:null});
    if(peer)server.prependListener('connection',socket=>Object.defineProperty(socket,'remoteAddress',{get:()=>typeof peer==='function'?peer():peer}));
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});await metrics.close();await fs.rm(dir,{recursive:true,force:true});});
    const base='http://127.0.0.1:'+server.address().port;
    let cookie='',csrf='';
    async function api(route,{method='GET',body,headers={}}={}){
        return fetch(base+'/admin/'+route,{method,redirect:'manual',headers:{Cookie:cookie,...(method==='POST'?{Origin:base,'Content-Type':'application/json','X-Faborn-CSRF':csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    }
    async function login(name='admin',pass='admin-fixture'){
        const r=await api('api/login',{method:'POST',body:{username:name,password:pass}});
        if(r.status===200){cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.clone().json()).csrf;}return r;
    }
    async function post(authorization=basic('friend','viewer-fixture'),extra={}){
        return fetch(base+'/v1/resolve',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify({movie:{title:'Fixture title'},...extra})});
    }
    return {dir,file,adminFile,metrics,server,base,api,login,post,get cookie(){return cookie;}};
}

test('panel requires its separate administrator login even on an anonymous trusted LAN',async t=>{
    const s=await fixture(t,{peer:'192.168.88.20',allowLan:'192.168.88.0/24'});
    assert.equal((await s.post('')).status,200);
    assert.equal((await s.api('')).status,200);assert.equal((await s.api('api/overview')).status,401);
    assert.equal((await s.api('api/users',{headers:{Authorization:basic('friend','viewer-fixture')}})).status,401);
    assert.equal((await s.login('friend','viewer-fixture')).status,401);
    const r=await s.login();assert.equal(r.status,200);
    assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await s.api('api/overview')).status,200);
    const u=await (await s.api('api/users')).json();assert.deepEqual(u.users.map(u=>u.username),['friend']);
    assert.equal(JSON.stringify(u).includes('hash'),false);assert.equal(JSON.stringify(u).includes('salt'),false);
});
test('WAN requests and forged forwarded LAN addresses cannot reach any admin endpoint',async t=>{
    const s=await fixture(t,{peer:'203.0.113.50'});
    for(const route of ['', 'app.js','api/overview','api/users']){
        const r=await s.api(route,{headers:{'X-Forwarded-For':'192.168.88.20','X-Real-IP':'127.0.0.1'}});
        assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
    }
    assert.equal((await s.login()).status,403);
    assert.equal((await s.post()).status,200);
});
test('admin is opt-in and cannot use the same account file as viewer authentication',async t=>{
    const s=await fixture(t,{enabled:false});assert.equal((await s.api('')).status,404);
    assert.equal((await s.post()).status,200);
    assert.throws(()=>createService({users:createUserStore(s.file),admin:{file:s.file,allowLan:'192.168.88.0/24'}}),/different files/);
});
test('mutations require same-origin JSON plus the session CSRF token; CORS stays isolated',async t=>{
    const s=await fixture(t);await s.login();
    const body={action:'add',username:'new_friend'};
    for(const headers of [{Origin:'https://foreign.example'},{Origin:''},{'X-Faborn-CSRF':'wrong'},{'X-Faborn-CSRF':''},{'Sec-Fetch-Site':'cross-site'}]){
        assert.equal((await s.api('api/users',{method:'POST',body,headers})).status,403);
    }
    assert.equal((await s.api('api/users',{method:'POST',body,headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal((await s.api('api/login',{method:'POST',body:{username:'admin',password:'admin-fixture'},headers:{Origin:'https://foreign.example'}})).status,403);
    const r=await s.api('api/overview');assert.equal(r.headers.get('access-control-allow-origin'),null);
    assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const cors=await fetch(s.base+'/v1/resolve',{method:'OPTIONS'});assert.equal(cors.headers.get('access-control-allow-origin'),'*');
    assert.deepEqual((await createUserStore(s.file).read()).users.map(u=>u.username),['friend']);
});
test('DNS rebinding hostname is denied before serving admin assets or data',async t=>{
    const s=await fixture(t);
    const r=await new Promise((resolve,reject)=>{const req=http.get(s.base+'/admin/',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
    assert.equal(r,403);
});
test('create, block, reset, unblock and delete take effect without restarting or exposing password hashes',async t=>{
    const s=await fixture(t);await s.login();
    async function edit(action,name='new_friend') { return s.api('api/users',{method:'POST',body:{action,username:name}}); }
    const created=await (await edit('add')).json();assert.match(created.password,/^[\w-]{24}$/);
    const first=created.password;assert.equal((await s.post(basic('new_friend',first))).status,200);
    assert.equal((await edit('block')).status,200);assert.equal((await s.post(basic('new_friend',first))).status,401);
    const reset=await (await edit('reset')).json();assert.notEqual(reset.password,first);
    assert.equal((await s.post(basic('new_friend',reset.password))).status,401,'reset must not unblock an account');
    assert.equal((await edit('unblock')).status,200);
    assert.equal((await s.post(basic('new_friend',first))).status,401);assert.equal((await s.post(basic('new_friend',reset.password))).status,200);
    assert.equal((await edit('delete')).status,200);assert.equal((await s.post(basic('new_friend',reset.password))).status,401);
    const viewers=await createUserStore(s.file).read();assert.equal(viewers.enabled,true);assert.deepEqual(viewers.users.map(u=>u.username),['friend']);
    const raw=await fs.readFile(s.file,'utf8');assert.equal(raw.includes(first),false);assert.equal(raw.includes(reset.password),false);
    const metrics=JSON.stringify((await (await s.api('api/overview')).json()).metrics);
    for(const secret of [first,reset.password,'signed-private-value','admin-fixture','viewer-fixture'])assert.equal(metrics.includes(secret),false);
    assert.equal((await fs.stat(s.file)).mode&0o777,0o600);
});
test('deleting the last viewer leaves authentication enabled; administrative account is unchanged',async t=>{
    const s=await fixture(t);const before=await fs.readFile(s.adminFile,'utf8');await s.login();
    assert.equal((await s.api('api/users',{method:'POST',body:{action:'delete',username:'friend'}})).status,200);
    assert.equal((await s.post('')).status,401);assert.equal((await fs.readFile(s.adminFile,'utf8')),before);
});
test('logout, administrator password change, expiry and a missing file revoke sessions',async t=>{
    let time=Date.now();const s=await fixture(t,{clock:()=>time});await s.login();
    assert.equal((await s.api('api/logout',{method:'POST',body:{}})).status,200);assert.equal((await s.api('api/users')).status,401);
    await s.login();await change(s.adminFile,async d=>{d.users[0]=await record('admin','changed-admin');});
    assert.equal((await s.api('api/overview')).status,401);
    assert.equal((await s.login('admin','changed-admin')).status,200);time+=31*60000;
    assert.equal((await s.api('api/overview')).status,401);await s.login('admin','changed-admin');
    await fs.unlink(s.adminFile);assert.equal((await s.api('api/overview')).status,503);
});
test('failed admin attempts have their own bounded budget and do not block a viewer',async t=>{
    const s=await fixture(t);
    for(let i=0;i<10;i++)assert.equal((await s.login('admin','wrong')).status,401);
    assert.equal((await s.login()).status,429);assert.equal((await s.post()).status,200);
    assert.equal(s.metrics.snapshot().audit.length,10);
});
test('metrics count UTF-8 JSON bytes, cache hits, auth failures and actual identities without recording credentials',async t=>{
    const s=await fixture(t);const first=await s.post(),body=await first.text();
    assert.equal(first.status,200);assert.equal((await s.post()).status,200);assert.equal((await s.post(basic('friend','wrong'))).status,401);
    await s.metrics.flush();const m=s.metrics.snapshot();
    assert.equal(m.total.requests,3);assert.equal(m.total.success,2);assert.equal(m.total.authFailures,1);assert.equal(m.total.cacheHits,1);
    const p=m.people.find(p=>p.name==='friend');assert.equal(p.requests,2);assert.equal(p.outputBytes,Buffer.byteLength(body)*2);
    assert.equal(m.people.find(p=>p.kind==='denied').name,'');
    const raw=await fs.readFile(path.join(s.dir,'metrics.json'),'utf8');
    for(const secret of ['signed-private-value','viewer-fixture','admin-fixture','Authorization'])assert.equal(raw.includes(secret),false);
    const restored=createMetrics({file:path.join(s.dir,'metrics.json')});await restored.ready;
    assert.equal(restored.snapshot().total.requests,3);await restored.close();
});
test('metrics retain 30 daily totals and bounded activity, and preserve a malformed disk file',async t=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'faborn-metrics-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    let time=Date.UTC(2026,8,1);const file=path.join(dir,'stats.json'),m=createMetrics({file,now:()=>time});await m.ready;
    for(let day=0;day<35;day++) { for(let i=0;i<15;i++)m.record({kind:'user',name:'friend',status:200,inputBytes:4,outputBytes:12,durationMs:2,ip:'127.0.0.1'});if(day<34)time+=86400000; }
    const snapshot=m.snapshot();assert.equal(snapshot.total.requests,450);assert.equal(snapshot.events.length,300);assert.equal(snapshot.days.length,7);
    for(let i=0;i<120;i++)m.audit('login','admin');assert.equal(m.snapshot().audit.length,100);
    await m.close();assert.ok((await fs.stat(file)).size<4*1024*1024);assert.equal((await fs.stat(file)).mode&0o777,0o600);
    await fs.writeFile(file,'broken');const bad=createMetrics({file,now:()=>time});await bad.ready;
    bad.record({status:200});await bad.close();assert.equal(await fs.readFile(file,'utf8'),'broken');assert.ok(bad.snapshot().storageError);
});
test('admin assets are local and no traversal path can read server or account files',async t=>{
    const s=await fixture(t);await s.login();
    const html=await (await s.api('')).text();assert.match(html,/\/admin\/app.js/);assert.equal(html.includes('https://'),false);
    for(const route of ['app.js','style.css'])assert.equal((await s.api(route)).status,200);
    for(const route of ['server.js','users.json','..%2fauth.js','api/users.json'])assert.equal((await s.api(route)).status,404);
});
test('idle statistics expire on disk and malformed rows never crash the running resolver',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'faborn-metrics-expire-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'stats.json');let time=Date.UTC(2026,8,1);
 const m=createMetrics({file,now:()=>time});await m.ready;m.record({status:200});await m.flush();
 time+=31*86400000;await m.close();assert.equal(JSON.parse(await fs.readFile(file,'utf8')).events.length,0);
 await fs.writeFile(file,JSON.stringify({version:1,since:time,days:[],events:[null],audit:[]}));
 const broken=createMetrics({file,now:()=>time});await broken.ready;assert.ok(broken.snapshot().storageError);
 broken.record({status:200});assert.equal(broken.snapshot().total.requests,1);await broken.close();
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).events[0],null);
});

test('local traffic is counted by TCP peer, including authenticated requests, without double counting totals',async t=>{
    let peer='192.168.88.20';
    const s=await fixture(t,{peer:()=>peer,allowLan:'192.168.88.0/24'});
    assert.equal((await s.post('')).status,200);
    assert.equal((await s.post()).status,200);
    peer='::ffff:192.168.88.21';assert.equal((await s.post('')).status,200);
    assert.equal((await s.post(basic('friend','wrong'))).status,401);
    peer='203.0.113.50';
    assert.equal((await fetch(s.base+'/v1/resolve',{method:'POST',headers:{Authorization:basic('friend','viewer-fixture'),'X-Forwarded-For':'192.168.88.20'},body:JSON.stringify({movie:{title:'Fixture title'}})})).status,200);
    const m=s.metrics.snapshot();
    assert.equal(m.total.requests,5);assert.equal(m.local.total.requests,4);assert.equal(m.local.total.authFailures,1);
    assert.equal(m.local.clients.length,2);assert.equal(m.local.unattributedRequests,0);
    assert.equal(m.local.clients.find(c=>c.ip==='192.168.88.20').requests,2);
    assert.equal(m.local.clients.find(c=>c.ip==='192.168.88.21').requests,2);
    assert.equal(m.people.find(p=>p.name==='friend').requests,2);
    assert.equal(m.events.find(e=>e.ip==='203.0.113.50').local,false);
    assert.equal(m.events.filter(e=>e.local).length,4);
    peer='192.168.88.20';await s.login();await s.api('api/overview');await fetch(s.base+'/health');
    assert.equal(s.metrics.snapshot().total.requests,5,'admin polling and health probes do not inflate playback request counts');
    await s.metrics.flush();const restored=createMetrics({file:path.join(s.dir,'metrics.json')});await restored.ready;
    assert.deepEqual(restored.snapshot().local,m.local);await restored.close();
});
test('local classification never grants access and also works when the resolver is in open mode',async t=>{
    const s=await fixture(t,{peer:'192.168.88.20'});
    assert.equal((await s.post('')).status,401);
    assert.equal((await s.post()).status,200);
    await change(s.file,d=>{d.users=[];d.enabled=false;});
    assert.equal((await s.post('')).status,200);
    const m=s.metrics.snapshot();assert.equal(m.local.total.requests,3);
    assert.equal(m.events[0].kind,'open');assert.equal(m.events[0].local,true);
});
test('legacy local totals survive without assigning all past traffic to the last IP',async t=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'faborn-metrics-legacy-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const file=path.join(dir,'metrics.json'),m=createMetrics({file});await m.ready;
    m.record({kind:'lan',ip:'192.168.88.20',status:200,inputBytes:10,outputBytes:100});
    m.record({kind:'lan',ip:'192.168.88.21',status:200,inputBytes:20,outputBytes:200});await m.close();
    const old=JSON.parse(await fs.readFile(file,'utf8'));for(const d of old.days)delete d.local;for(const e of old.events)delete e.local;
    await fs.writeFile(file,JSON.stringify(old));const restored=createMetrics({file});await restored.ready;
    assert.equal(restored.snapshot().total.requests,2);assert.equal(restored.snapshot().local.total.requests,2);
    assert.equal(restored.snapshot().local.clients.length,0);assert.equal(restored.snapshot().local.unattributedRequests,2);
    assert.ok(restored.snapshot().events.every(e=>e.local));
    restored.record({kind:'lan',ip:'192.168.88.20',status:200});
    assert.equal(restored.snapshot().local.clients[0].requests,1);assert.equal(restored.snapshot().local.unattributedRequests,2);
    await restored.close();
});
test('local IP storage is bounded while total counters and normal account statistics remain complete',async()=>{
    const m=createMetrics();await m.ready;
    for(let i=0;i<200;i++)m.record({kind:'user',name:'friend',local:true,ip:'192.168.88.'+i,status:200});
    const s=m.snapshot();assert.equal(s.local.clients.length,160);assert.equal(s.local.total.requests,200);
    assert.equal(s.local.unattributedRequests,40);assert.equal(s.people[0].requests,200);await m.close();
});
test('administrator can set a password after verifying the old one; all of their sessions are revoked',async t=>{
    const s=await fixture(t);await s.login();
    const otherBrowser=await s.api('api/login',{method:'POST',headers:{Cookie:''},body:{username:'admin',password:'admin-fixture'}});
    assert.equal(otherBrowser.status,200);const earlierCookie=otherBrowser.headers.get('set-cookie').split(';')[0];
    assert.equal((await s.api('api/overview',{headers:{Cookie:earlierCookie}})).status,200);
    const next='new-admin:пароль@2026';
    const r=await s.api('api/password',{method:'POST',body:{currentPassword:'admin-fixture',password:next,passwordConfirmation:next}});
    assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
    assert.deepEqual(await r.json(),{ok:true,relogin:true});
    assert.equal((await s.api('api/overview')).status,401);
    assert.equal((await s.api('api/overview',{headers:{Cookie:earlierCookie}})).status,401);
    assert.equal((await s.login()).status,401);assert.equal((await s.login('admin',next)).status,200);
    assert.equal((await s.post()).status,200,'viewer credentials are unchanged');
    const raw=await fs.readFile(s.adminFile,'utf8');assert.ok(!raw.includes(next));assert.equal((await fs.stat(s.adminFile)).mode&0o777,0o600);
    const m=s.metrics.snapshot();assert.equal(m.audit.filter(e=>e.action==='admin_password').length,1);
    for(const secret of [next,'admin-fixture'])assert.equal(JSON.stringify(m).includes(secret),false);
});
test('administrator password mutation validates current password, confirmation, origin and CSRF without changing the file',async t=>{
    const s=await fixture(t);await s.login();const before=await fs.readFile(s.adminFile,'utf8');
    const good={currentPassword:'admin-fixture',password:'changed-admin',passwordConfirmation:'changed-admin'};
    for(const headers of [{'X-Faborn-CSRF':''},{Origin:'https://attacker.example'}])assert.equal((await s.api('api/password',{method:'POST',body:good,headers})).status,403);
    for(const patch of [{password:'short',passwordConfirmation:'short'},{password:'different'}, {password:'x'.repeat(257)},{password:'1234567\n'},{currentPassword:''}]){
        assert.equal((await s.api('api/password',{method:'POST',body:{...good,...patch}})).status,400);
    }
    assert.equal((await s.api('api/password',{method:'POST',body:{...good,currentPassword:'wrong-password'}})).status,403);
    assert.equal((await s.api('api/overview')).status,200,'wrong current password keeps the session usable');
    assert.equal(await fs.readFile(s.adminFile,'utf8'),before);
    assert.equal(s.metrics.snapshot().audit.filter(e=>e.action==='admin_password_failed').length,1);
});
test('repeated attempts at changing the admin password are limited separately from viewer requests',async t=>{
    const s=await fixture(t);await s.login();const body={currentPassword:'wrong-password',password:'next-admin-password',passwordConfirmation:'next-admin-password'};
    for(let i=0;i<10;i++)assert.equal((await s.api('api/password',{method:'POST',body})).status,403);
    assert.equal((await s.api('api/password',{method:'POST',body:{...body,currentPassword:'admin-fixture'}})).status,429);
    assert.equal((await s.post()).status,200);assert.equal((await s.api('api/overview')).status,200);
});
test('a locked admin file is not overwritten and password changes leave other administrators signed in',async t=>{
    const s=await fixture(t);await change(s.adminFile,async d=>{d.users.push(await record('second','second-fixture'));});
    await s.login();const otherBrowser=await s.api('api/login',{method:'POST',headers:{Cookie:''},body:{username:'second',password:'second-fixture'}});
    assert.equal(otherBrowser.status,200);const secondCookie=otherBrowser.headers.get('set-cookie').split(';')[0];
    const body={currentPassword:'admin-fixture',password:'next-admin-password',passwordConfirmation:'next-admin-password'};
    const original=await fs.readFile(s.adminFile,'utf8');await fs.writeFile(s.adminFile+'.lock','fixture');
    assert.equal((await s.api('api/password',{method:'POST',body})).status,409);
    assert.equal(await fs.readFile(s.adminFile,'utf8'),original);await fs.unlink(s.adminFile+'.lock');
    assert.equal((await s.api('api/password',{method:'POST',body})).status,200);
    assert.equal((await s.api('api/overview',{headers:{Cookie:secondCookie}})).status,200);
});
test('viewer accounts accept chosen passwords; reset preserves a block and old credentials immediately stop working',async t=>{
    const s=await fixture(t);await s.login();const first='друг:перевірка@2026',next='new-friend-password';
    const edit=(action,extra={})=>s.api('api/users',{method:'POST',body:{action,username:'chosen',...extra}});
    const r=await edit('add',{password:first,passwordConfirmation:first});assert.equal(r.status,200);assert.equal((await r.json()).password,first);
    assert.equal((await s.post(basic('chosen',first))).status,200);
    await edit('block');assert.equal((await edit('reset',{password:next,passwordConfirmation:next})).status,200);
    assert.equal((await s.post(basic('chosen',next))).status,401);await edit('unblock');
    assert.equal((await s.post(basic('chosen',first))).status,401);assert.equal((await s.post(basic('chosen',next))).status,200);
    const raw=await fs.readFile(s.file,'utf8'),metrics=JSON.stringify(s.metrics.snapshot());
    for(const secret of [first,next]){assert.equal(raw.includes(secret),false);assert.equal(metrics.includes(secret),false);}
});
test('invalid chosen viewer passwords are rejected rather than replaced silently with generated credentials',async t=>{
    const s=await fixture(t);await s.login();const before=await fs.readFile(s.file,'utf8');
    for(const pass of ['',null,123,'short','x'.repeat(257),'1234567\n']){
        assert.equal((await s.api('api/users',{method:'POST',body:{action:'add',username:'chosen',password:pass,passwordConfirmation:pass}})).status,400);
    }
    assert.equal((await s.api('api/users',{method:'POST',body:{action:'reset',username:'friend',password:'new-password',passwordConfirmation:'wrong'}})).status,400);
    assert.equal(await fs.readFile(s.file,'utf8'),before);
    assert.equal((await s.post()).status,200);
});
