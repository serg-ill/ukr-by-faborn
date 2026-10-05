'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {createResolver,card}=require('./resolver');
const {createUserStore,basic}=require('./auth');
const {lanPolicy,loopback}=require('./network');
const {createMetrics}=require('./metrics');
const {createAdmin}=require('./admin');
const VERSION='0.1.0-beta.48';
function createService({resolve=createResolver(),keys=[],users=null,allowLan='',maxActive=3,maxAuth=3,metrics=createMetrics(),admin=null}={}){
 const fromTrustedLan=lanPolicy(allowLan);
 const fromAdminLan=lanPolicy(admin?.allowLan||'');
 const cache=new Map(),rates=new Map(),contexts=new WeakMap();let active=0,authenticating=0;
 const adminHandler=admin?createAdmin({...admin,users,metrics,version:VERSION,state:()=>({activeRequests:active,cacheEntries:cache.size,authenticating,anonymousLan:allowLan,keysConfigured:keys.length>0})}):null;
 function authorized(key){return keys.some(k=>{const a=Buffer.from(k),b=Buffer.from(String(key||''));return a.length===b.length&&crypto.timingSafeEqual(a,b);});}
 function send(res,status,data){if(res.destroyed)return;const body=JSON.stringify(data),context=contexts.get(res);if(context)context.outputBytes=Buffer.byteLength(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store',...(status===401?{'WWW-Authenticate':'Basic realm="Faborn", charset="UTF-8"'}:{})});res.end(body);}
 function mode(data){return data&&data.enabled?(keys.length?'basic+key':'basic'):keys.length?'key':'none';}
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/admin'||req.url.startsWith('/admin/')){
   if(adminHandler)return adminHandler(req,res);
   res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"Маршрут відсутній"}');
  }
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});return res.end();}
  if(req.method==='GET'&&req.url==='/health'){
   try{return send(res,200,{ok:true,version:VERSION,auth:mode(users?await users.read():null),localAccess:allowLan?'allowed':'authenticated',videoProxy:false});}
   catch(ignore){return send(res,503,{ok:false,error:'Файл облікових записів недоступний',videoProxy:false});}
  }
  if(req.method!=='POST'||req.url!=='/v1/resolve')return send(res,404,{error:'Маршрут відсутній'});
  const peer=req.socket.remoteAddress;
  // Classify traffic independently of authentication. An authenticated home
  // viewer is still local, but this marker never grants access to the API.
  const started=Date.now(),context={kind:'denied',ip:peer,local:loopback(peer)||fromTrustedLan(peer)||fromAdminLan(peer),inputBytes:0,outputBytes:0};contexts.set(res,context);
  let recorded=false;
  const finish=()=>{if(recorded)return;recorded=true;metrics.record({...context,status:res.writableFinished?res.statusCode:499,durationMs:Date.now()-started});};
  res.once('finish',finish);res.once('close',finish);
  const chunks=[];let size=0;
  try{
   const ip=req.socket.remoteAddress,now=Date.now();
   for(const [id,r] of rates)if(now-r.start>=60000)rates.delete(id);
   if(!rates.has(ip)){if(rates.size>=512)return send(res,429,{error:'Спробуйте пізніше'});rates.set(ip,{start:now,count:0});}
   // Failed logins count too; limit expensive password derivations separately.
   if(++rates.get(ip).count>30||active>=maxActive||authenticating>=maxAuth)return send(res,429,{error:'Зачекайте й повторіть запит'});
   for await(const chunk of req){size+=chunk.length;context.inputBytes=size;if(size>16384){send(res,413,{error:'Завеликий запит'});return;}chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),movie=card(data.movie);
   let accounts=null;try{if(users)accounts=await users.read();}catch(ignore){return send(res,503,{error:'Файл облікових записів недоступний'});}
   const header=req.headers.authorization||'',bearer=/^Bearer (.+)$/i.exec(header);
   // Only the TCP peer is trusted. Forwarded headers never grant LAN access.
   const open=mode(accounts)==='none',lan=!header&&!data.key&&fromTrustedLan(ip),key=authorized(bearer?bearer[1]:data.key);
   let access=open||lan||key;context.kind=open?'open':lan?'lan':key?'key':'denied';
   if(!access&&accounts&&accounts.enabled){
    if(authenticating>=maxAuth)return send(res,429,{error:'Зачекайте й повторіть запит'});
    authenticating++;try{access=await users.verify(header,accounts);if(access){context.kind='user';context.name=basic(header)?.username||'';}}finally{authenticating--;}
   }
   if(!access)return send(res,401,{error:'Потрібен правильний логін і пароль або ключ доступу'});
   if(res.destroyed)return;
   if(active>=maxActive)return send(res,429,{error:'Зачекайте й повторіть запит'});
   const season=data.season===undefined?0:data.season,episode=data.episode===undefined?0:data.episode;
   if(!Number.isInteger(season)||!Number.isInteger(episode)||season<0||season>1000||episode<0||episode>10000)return send(res,400,{error:'Некоректна серія'});
   context.title=movie.title||movie.name||movie.original_title||movie.original_name;context.season=season;context.episode=episode;
   const id=JSON.stringify([movie,season,episode]);
   const cached=cache.get(id);if(data.fresh!==true&&cached&&now-cached.time<45000){context.cacheHit=true;return send(res,200,cached.data);}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
   res.on('close',()=>{if(!res.writableEnded)controller.abort();});active++;
   try{
    const result=await resolve(movie,season,episode,controller.signal);
    if(JSON.stringify(result).length>4*1024*1024)throw new Error('Завелика відповідь');
    for(const [k,v] of cache)if(now-v.time>45000)cache.delete(k);
    while(cache.size>=64)cache.delete(cache.keys().next().value);
    cache.set(id,{time:Date.now(),data:result});send(res,200,result);
   }catch(error){send(res,502,{error:String(error.message||error).replace(/https?:\/\/\S+/g,'[адреса]').slice(0,200)});}
   finally{active--;clearTimeout(timer);}
  }catch(error){send(res,400,{error:'Некоректний запит'});}
 });
 server.requestTimeout=65000;server.headersTimeout=10000;
 server.metrics=metrics;server.on('close',()=>{void metrics.close();});
 return server;
}
if(require.main===module){
 const keys=(process.env.FABORN_ACCESS_KEYS||'').split(',').map(k=>k.trim()).filter(Boolean);
 const users=process.env.FABORN_USERS_FILE?createUserStore(process.env.FABORN_USERS_FILE):null;
 const metrics=createMetrics({file:process.env.FABORN_STATS_FILE||''});
 const adminLan=process.env.FABORN_ADMIN_LAN||'',adminFile=process.env.FABORN_ADMIN_FILE||'';
 if(adminLan&&!adminFile)throw Error('FABORN_ADMIN_FILE is required when admin access is enabled');
 const server=createService({keys,users,metrics,admin:adminLan?{file:adminFile,allowLan:adminLan}:null,allowLan:process.env.FABORN_ALLOW_LAN||''});
 metrics.ready.then(()=>server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Faborn resolver '+VERSION+' ready; accountFile='+(users?'configured':'none')+'; admin='+(adminLan?'lan':'disabled')+'; videoProxy=false')));
 process.on('SIGTERM',()=>server.close(async()=>{await metrics.close();process.exit(0);}));
}
module.exports={createService,lanPolicy,VERSION};
