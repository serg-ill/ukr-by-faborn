'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createUserStore,record,basic}=require('../server/uakinogo/auth');
const {createService}=require('../server/uakinogo/server');
const Core=require('../lib/4klab/core');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faborn-accounts-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'users.json');
 function cli(...args){return spawnSync(process.execPath,[path.resolve(__dirname,'../server/uakinogo/users.js'),'--file',file,...args],{encoding:'utf8'});}
 return {dir,file,cli};
}
function header(name,password){return 'Basic '+Buffer.from(name+':'+password).toString('base64');}
async function service(t,file,options={}){
 let calls=0;const users=createUserStore(file),server=createService({users,resolve:async()=>{calls++;return {ok:true};},...options});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 return {users,get calls(){return calls;},health:()=>fetch(base+'/health'),post:(authorization)=>fetch(base+'/v1/resolve',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify({movie:{title:'Fixture film'}})})};
}
test('two test accounts get distinct private passwords and hashes; rerunning never resets them',async t=>{
 const f=fixture(t),r=f.cli('test-users');assert.equal(r.status,0,r.stderr);
 const accounts=Object.fromEntries(r.stdout.split('\n').filter(s=>/^test[12]:/.test(s)).map(s=>s.split(':')));
 assert.deepEqual(Object.keys(accounts),['test1','test2']);assert.notEqual(accounts.test1,accounts.test2);
 for(const pass of Object.values(accounts))assert.match(pass,/^[a-zA-Z0-9_-]{24}$/);
 const before=fs.readFileSync(f.file,'utf8'),d=JSON.parse(before),users=createUserStore(f.file);
 assert.equal(fs.statSync(f.file).mode&0o777,0o600);assert.equal(d.enabled,true);assert.notEqual(d.users[0].salt,d.users[1].salt);
 for(const [name,pass] of Object.entries(accounts)){
  assert.equal(before.includes(pass),false);assert.equal(await users.verify(header(name,pass),d),true);
  assert.equal(await users.verify(header(name,'incorrect'),d),false);
 }
 const again=f.cli('test-users');assert.equal(again.status,0);assert.equal(fs.readFileSync(f.file,'utf8'),before);
 assert.ok(!Object.values(accounts).some(p=>again.stdout.includes(p)));
});
test('Basic guards cached metadata, and deletion revokes access without a service restart',async t=>{
 const f=fixture(t);assert.equal(f.cli('test-users').status,0);
 const one=f.cli('reset','test1','--generate').stdout.trim().split(':')[1],two=f.cli('reset','test2','--generate').stdout.trim().split(':')[1];
 const s=await service(t,f.file);
 assert.equal((await s.health()).status,200);assert.equal((await (await s.health()).json()).auth,'basic');
 const denied=await s.post();assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/Basic/);
 assert.equal((await s.post(header('test1','wrong'))).status,401);assert.equal(s.calls,0);
 assert.equal((await s.post(header('test1',one))).status,200);assert.equal((await s.post(header('test2',two))).status,200);assert.equal(s.calls,1);
 assert.equal(f.cli('delete','test1').status,0);
 assert.equal((await s.post(header('test1',one))).status,401);assert.equal((await s.post(header('test2',two))).status,200);
 assert.equal(f.cli('delete','test2').status,0);
 assert.equal((await (await s.health()).json()).auth,'basic');assert.equal((await s.post()).status,401);
});
test('password reset changes access, retains other accounts and never writes a plaintext password',async t=>{
 const f=fixture(t),first=f.cli('add','friend','--generate');assert.equal(first.status,0);
 const old=first.stdout.trim().split(':')[1],r=f.cli('reset','friend','--generate'),next=r.stdout.trim().split(':')[1];
 assert.equal(r.status,0);assert.notEqual(next,old);
 const s=await service(t,f.file);assert.equal((await s.post(header('friend',old))).status,401);assert.equal((await s.post(header('friend',next))).status,200);
 assert.ok(!fs.readFileSync(f.file,'utf8').includes(next));assert.equal(f.cli('add','friend','--generate').status,1);
});
test('configured but unreadable, missing or malformed account files fail closed',async t=>{
 const f=fixture(t);f.cli('test-users');const good=fs.readFileSync(f.file),s=await service(t,f.file);
 for(const data of ['not json',JSON.stringify({version:1,enabled:false,users:[{username:'friend'}]})]){
  fs.writeFileSync(f.file,data);assert.equal((await s.post()).status,503);assert.equal((await s.health()).status,503);assert.equal(s.calls,0);
 }
 fs.writeFileSync(f.file,good);fs.unlinkSync(f.file);assert.equal((await s.post()).status,503);
});
test('password derivations are bounded before a provider is called',async t=>{
 let release,start;const started=new Promise(r=>start=r);
 const users={read:async()=>({enabled:true}),verify:async()=>{start();return new Promise(r=>release=r);}};
 const f=fixture(t),s=await service(t,f.file,{users,maxAuth:1});
 const pending=s.post(header('test1','pass'));await started;assert.equal((await s.post(header('test2','pass'))).status,429);
 release(false);assert.equal((await pending).status,401);assert.equal(s.calls,0);
});
test('failed Basic logins consume the request budget, not an unbounded CPU queue',async t=>{
 const f=fixture(t);f.cli('test-users');const s=await service(t,f.file);
 for(let i=0;i<30;i++)assert.equal((await s.post('Basic not-valid')).status,401);
 assert.equal((await s.post('Basic not-valid')).status,429);assert.equal(s.calls,0);
});
test('existing bearer keys coexist with user accounts and public health contains no account data',async t=>{
 const f=fixture(t);f.cli('test-users');const s=await service(t,f.file,{keys:['fixture-key']});
 assert.equal((await s.post('Bearer fixture-key')).status,200);assert.equal((await s.post('Bearer wrong')).status,401);
 const h=await (await s.health()).json();assert.equal(h.auth,'basic+key');assert.equal(h.videoProxy,false);assert.ok(!JSON.stringify(h).includes('test1'));
});
test('UTF-8 and colons in passwords work; malformed or oversized Basic values are rejected',async t=>{
 const d={version:1,enabled:true,users:[await record('friend','пароль:with@colon')]};
 const f=fixture(t);fs.writeFileSync(f.file,JSON.stringify(d));const store=createUserStore(f.file);
 assert.equal(await store.verify(header('friend','пароль:with@colon'),d),true);
 for(const v of [header('bad name','x'),header('friend',''),header('friend','x\n'),header('friend','x'.repeat(257)),'Basic !!!','Basic '+Buffer.from([255,58,255]).toString('base64')])assert.equal(basic(v),null);
});
test('credential URL and separate fields produce a clean endpoint and the same Basic header',()=>{
 const expected=header('test1','пароль:with@colon'),encoded='test1:'+encodeURIComponent('пароль:with@colon')+'@203.0.113.10:8099';
 const a=Core.resolverConnection(encoded),b=Core.resolverConnection('http://203.0.113.10:8099','test1','пароль:with@colon');
 assert.deepEqual(a,b);assert.equal(a.base,'http://203.0.113.10:8099');assert.equal(a.authorization,expected);
 assert.equal(Core.resolverBase('https://test1:fixture@resolver.example/base/'),'https://resolver.example/base');
 for(const url of ['http://public.example','http://user@host:8099','http://user:pass@host:8099/?url=x','file:///secret','http://user:%zz@host:8099'])assert.equal(Core.resolverConnection(url),null);
});
