'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {createResolver,card}=require('./resolver');
const {createUserStore}=require('./auth');
const {BlockList,isIPv4}=require('node:net');
const VERSION='0.1.0-beta.45.1';
function lanPolicy(value=''){
 if(!value)return ()=>false;
 const match=/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(value);
 if(!match||!isIPv4(match[1]))throw new Error('FABORN_ALLOW_LAN requires a private IPv4 network in CIDR notation');
 const octets=match[1].split('.').map(Number),prefix=Number(match[2]);
 const min=octets[0]===10?8:octets[0]===172&&octets[1]>=16&&octets[1]<=31?12:octets[0]===192&&octets[1]===168?16:33;
 const numeric=octets.reduce((sum,n)=>sum*256+n,0);
 if(prefix<min||prefix>32||numeric%Math.pow(2,32-prefix))throw new Error('FABORN_ALLOW_LAN must be an aligned private IPv4 network');
 const list=new BlockList();list.addSubnet(match[1],prefix,'ipv4');
 return address=>{address=String(address||'').replace(/^::ffff:/i,'');return isIPv4(address)&&list.check(address,'ipv4');};
}
function createService({resolve=createResolver(),keys=[],users=null,allowLan='',maxActive=3,maxAuth=3}={}){
 const fromTrustedLan=lanPolicy(allowLan);
 const cache=new Map(),rates=new Map();let active=0,authenticating=0;
 function authorized(key){return keys.some(k=>{const a=Buffer.from(k),b=Buffer.from(String(key||''));return a.length===b.length&&crypto.timingSafeEqual(a,b);});}
 function send(res,status,data){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store',...(status===401?{'WWW-Authenticate':'Basic realm="Faborn", charset="UTF-8"'}:{})});res.end(JSON.stringify(data));}
 function mode(data){return data&&data.enabled?(keys.length?'basic+key':'basic'):keys.length?'key':'none';}
 const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});return res.end();}
  if(req.method==='GET'&&req.url==='/health'){
   try{return send(res,200,{ok:true,version:VERSION,auth:mode(users?await users.read():null),localAccess:allowLan?'allowed':'authenticated',videoProxy:false});}
   catch(ignore){return send(res,503,{ok:false,error:'Файл облікових записів недоступний',videoProxy:false});}
  }
  if(req.method!=='POST'||req.url!=='/v1/resolve')return send(res,404,{error:'Маршрут відсутній'});
  const chunks=[];let size=0;
  try{
   const ip=req.socket.remoteAddress,now=Date.now();
   for(const [id,r] of rates)if(now-r.start>=60000)rates.delete(id);
   if(!rates.has(ip)){if(rates.size>=512)return send(res,429,{error:'Спробуйте пізніше'});rates.set(ip,{start:now,count:0});}
   // Failed logins count too; limit expensive password derivations separately.
   if(++rates.get(ip).count>30||active>=maxActive||authenticating>=maxAuth)return send(res,429,{error:'Зачекайте й повторіть запит'});
   for await(const chunk of req){size+=chunk.length;if(size>16384){send(res,413,{error:'Завеликий запит'});return;}chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),movie=card(data.movie);
   let accounts=null;try{if(users)accounts=await users.read();}catch(ignore){return send(res,503,{error:'Файл облікових записів недоступний'});}
   const header=req.headers.authorization||'',bearer=/^Bearer (.+)$/i.exec(header);
   // Only the TCP peer is trusted. Forwarded headers never grant LAN access.
   let access=mode(accounts)==='none'||(!header&&!data.key&&fromTrustedLan(ip))||authorized(bearer?bearer[1]:data.key);
   if(!access&&accounts&&accounts.enabled){
    if(authenticating>=maxAuth)return send(res,429,{error:'Зачекайте й повторіть запит'});
    authenticating++;try{access=await users.verify(header,accounts);}finally{authenticating--;}
   }
   if(!access)return send(res,401,{error:'Потрібен правильний логін і пароль або ключ доступу'});
   if(res.destroyed)return;
   if(active>=maxActive)return send(res,429,{error:'Зачекайте й повторіть запит'});
   const season=data.season===undefined?0:data.season,episode=data.episode===undefined?0:data.episode;
   if(!Number.isInteger(season)||!Number.isInteger(episode)||season<0||season>1000||episode<0||episode>10000)return send(res,400,{error:'Некоректна серія'});
   const id=JSON.stringify([movie,season,episode]);
   const cached=cache.get(id);if(data.fresh!==true&&cached&&now-cached.time<45000)return send(res,200,cached.data);
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
 return server;
}
if(require.main===module){
 const keys=(process.env.FABORN_ACCESS_KEYS||'').split(',').map(k=>k.trim()).filter(Boolean);
 const users=process.env.FABORN_USERS_FILE?createUserStore(process.env.FABORN_USERS_FILE):null;
 const server=createService({keys,users,allowLan:process.env.FABORN_ALLOW_LAN||''});server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Faborn resolver '+VERSION+' ready; accountFile='+(users?'configured':'none')+'; videoProxy=false'));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
module.exports={createService,lanPolicy,VERSION};
