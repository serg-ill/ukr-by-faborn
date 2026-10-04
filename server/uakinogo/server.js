'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {createResolver,card}=require('./resolver');
const VERSION='0.1.0-beta.40';
function createService({resolve=createResolver(),keys=[],maxActive=3}={}){
 const cache=new Map(),rates=new Map();let active=0;
 function authorized(key){return !keys.length||keys.some(k=>{const a=Buffer.from(k),b=Buffer.from(String(key||''));return a.length===b.length&&crypto.timingSafeEqual(a,b);});}
 function send(res,status,data){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});return res.end();}
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,version:VERSION,auth:keys.length?'key':'none',videoProxy:false});
  if(req.method!=='POST'||req.url!=='/v1/resolve')return send(res,404,{error:'Маршрут відсутній'});
  const chunks=[];let size=0;
  try{
   for await(const chunk of req){size+=chunk.length;if(size>16384){send(res,413,{error:'Завеликий запит'});return;}chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),movie=card(data.movie);
   if(!authorized((req.headers.authorization||'').replace(/^Bearer /,'')||data.key))return send(res,401,{error:'Потрібен ключ доступу'});
   const ip=req.socket.remoteAddress,now=Date.now();
   for(const [id,r] of rates)if(now-r.start>=60000)rates.delete(id);
   if(!rates.has(ip)){if(rates.size>=512)return send(res,429,{error:'Спробуйте пізніше'});rates.set(ip,{start:now,count:0});}
   if(++rates.get(ip).count>30||active>=maxActive)return send(res,429,{error:'Зачекайте й повторіть запит'});
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
 const server=createService({keys});server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Faborn resolver '+VERSION+' ready; auth='+(keys.length?'key':'none')+'; videoProxy=false'));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
module.exports={createService,VERSION};
