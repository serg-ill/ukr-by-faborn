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
    if(peer)server.prependListener('connection',socket=>Object.defineProperty(socket,'remoteAddress',{value:peer}));
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
