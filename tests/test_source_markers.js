'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ukr-by-faborn')({});
const url='https://ashdi.vip/fixture/index.m3u8';
const range=(start,end)=>({start_sec:start,end_sec:end});
const player=tree=>'new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'});';

test('literal PlayerJS skip intervals retain exact seconds and ignore unrelated script fields',()=>{
 const html=`new Playerjs({file:'${url}', advertising:{skip:'1-900'}, skip:'50.25-95.5,900-965'}); const other={skip:'0-999'};`;
 assert.deepEqual(api.parseEmbed(html).skipSegments,[range(50.25,95.5),range(900,965)]);
 assert.deepEqual(api.parseEmbed(`new Playerjs({file:'${url}',advertising:{skip:'1-900'}});other({skip:'0-999'})`).skipSegments,[]);
});
test('dynamic and duplicate skip expressions are never evaluated or partially accepted',()=>{
 for(const value of ["'10-90'+evil()","getMarkers()","'10-90',skip:evil()"]){
  assert.deepEqual(api.parseEmbed(`new Playerjs({file:'${url}',skip:${value}})`).skipSegments,[]);
 }
 assert.equal(globalThis.evil,undefined);
});
test('playlist markers are local to a leaf, never inherited across a season or episode',()=>{
 const tree=[{title:'Season 1',skip:'0-900',folder:[
  {title:'Episode 1',file:url,skip:'50-95'},
  {title:'Episode 2',file:url},
  {title:'Episode 3',file:url,skip:'172-236'}
 ]}];
 for(const raw of [JSON.stringify(tree),JSON.stringify(JSON.stringify(tree))]){
  const entries=api.playerEntries(`new Playerjs({skip:'0-800',file:${raw}})`,{type:'tv',voice:'English'});
  assert.deepEqual(entries.map(e=>e.skipSegments),[[range(50,95)],[],[range(172,236)]]);
  assert.deepEqual(entries.map(e=>e.episode),[1,2,3]);
 }
});
test('different translations of the same episode keep their own source markers',()=>{
 const entries=api.playerEntries(player([
  {title:'English',folder:[{title:'Episode 1',file:url,skip:'50-95'}]},
  {title:'Українська',folder:[{title:'Episode 1',file:url,skip:'60-105'}]}
 ]),{type:'tv'});
 assert.deepEqual(entries.map(e=>[e.audioLanguage,e.skipSegments]),[['en',[range(50,95)]],['uk',[range(60,105)]]]);
});
test('malformed and overlapping source intervals fail without inventing timestamps',()=>{
 for(const skip of ['10','10-','-5-10','95-50','50-51','NaN-95','0-900,broken','10-90,50-100','1-172801',Array(34).join('1-10,')]){
  assert.deepEqual(api.parseEmbed(`new Playerjs({file:'${url}',skip:${JSON.stringify(skip)}})`).skipSegments,[]);
 }
 assert.deepEqual(api.parseEmbed(`new Playerjs({file:'${url}',skip:'50-95,50-95'})`).skipSegments,[range(50,95)]);
});
test('KinoBase playlist keeps markers with each quality, including explicit absence',()=>{
 const file=q=>'['+q+'p]{1+1 (Украинский)}https://video.redcdn.org/'+q+'/index.m3u8';
 const entries=api.kinoEntries(['p',JSON.stringify([{title:'1 сезон',skip:'0-900',folder:[
  {title:'1 серия',file:file(720),skip:'50-95'},
  {title:'1 серия',file:file(1080),skip:'60-105'},
  {title:'1 серия',file:file(2160)},
  {title:'2 серия',file:file(1080),skip:'172-236'}
 ]}])],{type:'tv'});
 assert.deepEqual(entries[0].skipByQuality,{'720p':[range(50,95)],'1080p':[range(60,105)],'2160p':[]});
 assert.deepEqual(entries[1].skipByQuality,{'1080p':[range(172,236)]});
});
