'use strict';
const Core=require('../../lib/4klab/core');
const hosts=new Set(['uakinogo.is','uakinogo.io','rarity-as.stravers.live']);
function card(input){
 if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Некоректна картка');
 const result={};
 for(const key of ['title','original_title','name','original_name','release_date','first_air_date','original_language','media_type']){
  if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>180)throw new Error('Некоректна картка');result[key]=input[key].trim();}
 }
 if(!result.title&&!result.name&&!result.original_title&&!result.original_name)throw new Error('Потрібна назва');
 if(result.media_type && !['movie','tv'].includes(result.media_type))throw new Error('Некоректний тип');
 return result;
}
function createResolver(fetcher=fetch){
 async function text(url,options={},signal){
  for(let i=0;i<4;i++){
   const parsed=new URL(url);
   if(parsed.protocol!=='https:'||!hosts.has(parsed.hostname)||parsed.username||parsed.password||parsed.port)throw new Error('Адреса поза джерелом');
   const headers={'User-Agent':'Mozilla/5.0','Accept':'*/*',...(options.headers||{})};
   const response=await fetcher(url,{...options,headers,redirect:'manual',signal});
   if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url).href;if(response.status===303)options={};continue;}
   if(!response.ok){await response.body?.cancel();throw new Error('Джерело: HTTP '+response.status);}
   let size=0;const chunks=[];
   for await(const chunk of response.body){size+=chunk.length;if(size>4*1024*1024)throw new Error('Завелика відповідь джерела');chunks.push(chunk);}
   return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Забагато перенаправлень');
 }
 return async function resolve(input,season=0,episode=0,signal){
  const movie=card(input),tv=Boolean(movie.name||movie.first_air_date||movie.media_type==='tv');
  if(!Number.isInteger(season)||!Number.isInteger(episode)||season<0||season>1000||episode<0||episode>10000||tv&&(!season||!episode))throw new Error('Некоректний сезон або серія');
  const queries=[...new Set([movie.original_title||movie.original_name,movie.title||movie.name].filter(Boolean))];
  let sourcePage,embed,lastError;
  outer:for(const origin of ['https://uakinogo.is','https://uakinogo.io']){
   for(const query of queries){
    try{
     const html=await text(origin+'/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'do=search&subaction=search&from_page=1&story='+encodeURIComponent(query)},signal);
     for(const row of Core.search(html,origin,movie)){
      const page=await text(row.url,{},signal);
      if(Core.matches(page,movie)){embed=Core.player(page);sourcePage=row.url;break outer;}
     }
    }catch(e){if(signal?.aborted)throw e;lastError=e;}
   }
  }
  if(!embed)throw lastError||new Error('Назву, рік і тип не знайдено');
  const info=Core.fileList(await text(embed,{headers:{Referer:sourcePage}},signal));
  if((info.files.type==='serial')!==tv)throw new Error('Тип плеєра не збігається з карткою');
  const row=Core.entry(info,season,episode);
  const body=new URLSearchParams({token:new URL(embed).searchParams.get('token'),av1:'true',autoplay:'0',audio:String(row.audio)}).toString();
  const data=JSON.parse(await text(Core.origin+'/bnsi/movies/'+row.id,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:Core.origin,Referer:embed,Borth:'91ede163547d0d0112d23a4c99329f5ce32db756dcf3f7ab40396bd1b24dd639|'+info.viewport},body},signal));
  const tracks=Core.tracks(data,true);
  if(!tracks.length)throw new Error('Немає підтримуваних озвучень');
  // This service never fetches a media playlist, initialization file or video segment.
  return {schema:1,sourcePage,referer:embed,origin:Core.origin,season,episode,episodes:Core.episodes(info),tracks:tracks.map(t=>({label:t.label,language:t.language,qualities:t.qualities}))};
 };
}
module.exports={createResolver,card};
