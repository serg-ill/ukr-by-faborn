'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ukr-by-faborn')({});
function release(language,voice,qualities,source='kinobase',season=0,episode=0){
 return {source,voice,audioLanguage:language,episodes:[{season,episode,resolvedAt:Date.now(),qualities:Object.fromEntries(qualities.map(q=>[q,'https://a.redcdn.org/'+voice+'/'+q+'/index.m3u8']))}]};
}
function view(releases,extra={}){return api.sourceGroups({title:{releases},season:0,episode:0,...extra});}
test('Best ranks within Ukrainian before quality, retaining lower-quality translations',()=>{
 const result=view([release('en','Original',['2160p']),release('uk','Дубляж',['1080p','720p']),release('uk','Студія',['720p'])]);
 assert.equal(result.language,'uk');assert.equal(result.quality,'best');
 assert.deepEqual(result.qualities,['1080p','720p']);
 assert.deepEqual(result.groups.map(g=>[g.voice,g.quality]),[['Дубляж','1080p'],['Студія','720p']]);
});
test('each source shows its actual maximum and a preferred 1080p source cannot outrank 4K',()=>{
 const result=view([release('uk','Дубляж',['1080p'],'uakino'),release('uk','Дубляж',['2160p','1080p']),release('uk','Студія',['1080p'])]);
 assert.equal(result.groups.length,2);assert.equal(result.groups[0].quality,'2160p');
 assert.deepEqual(result.groups[0].entries.map(e=>[e.release.source,e.value]),[['kinobase','2160p'],['uakino','1080p']]);
});
test('manual quality filters voices without importing another language or inventing quality',()=>{
 const releases=[release('en','Original',['2160p']),release('uk','Дубляж',['1080p','720p']),release('uk','Студія',['720p'])];
 const result=view(releases,{qualityPreference:'2160p'});
 assert.equal(result.quality,'1080p');assert.deepEqual(result.groups.map(g=>g.voice),['Дубляж']);
 const lower=view(releases,{qualityPreference:'720p'});assert.equal(lower.groups.length,2);assert.ok(lower.groups.every(g=>g.quality==='720p'));
});
test('English excludes unknown originals and other languages; All retains separate groups',()=>{
 const releases=['uk','en','ru','original','other'].map(lang=>release(lang,'Studio',['1080p']));
 assert.deepEqual(view(releases,{languagePreference:'en'}).groups.map(g=>g.language),['en']);
 const all=view(releases,{languagePreference:'all'});assert.deepEqual(all.groups.map(g=>g.language),['uk','en','original','ru','other']);
 assert.equal(new Set(all.groups.map(g=>g.key)).size,5);
});
test('empty or unresolved language is never replaced with an English or failed 4K stream',()=>{
 const pending=release('uk','Чекаємо',['2160p']);delete pending.episodes[0].resolvedAt;
 const error=release('uk','Збій',['2160p']);error.episodes[0].error='HTTP 404';
 const result=view([pending,error,release('en','Original',['2160p'])]);
 assert.equal(result.groups.length,0);assert.deepEqual(result.qualities,[]);assert.equal(result.language,'uk');
});
test('series filtering remains bound to the selected season and episode',()=>{
 const releases=[release('uk','Дубляж',['2160p'],'kinobase',1,1),release('uk','Дубляж',['720p'],'kinobase',1,2),release('en','Original',['2160p'],'kinobase',1,2)];
 const result=view(releases,{season:1,episode:2});assert.equal(result.groups.length,1);assert.equal(result.groups[0].quality,'720p');
 assert.equal(result.groups[0].entries[0].episode.episode,2);
});
test('adaptive-only streams remain Auto and invalid stored languages fall back to Ukrainian',()=>{
 const adaptive=release('uk','Дубляж',[]);adaptive.episodes[0].master='https://a.redcdn.org/master.m3u8';
 const result=view([adaptive],{languagePreference:'__proto__'});assert.equal(result.language,'uk');assert.equal(result.groups[0].quality,'auto');
});
