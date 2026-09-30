'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const api=require('../ukr-by-faborn')({}), reader=require('../lib/kinobase');
const fixture=require('./fixtures/kinobase-protocol');
for(const seed of [1,7,18,31]) test('reads rotating public constants without evaluating the player: '+seed,()=>{
 const f=fixture(seed);assert.deepEqual(reader.protocol(f.source),f.config);
 const words=['tokenForAnonymousPlayer','1900000000','','','1','Українська • RU','https://x.redcdn.org/stream%2Fkept.m3u8'];
 assert.deepEqual(api.kinoDecode(f.encode(words,true),f.config,true),words);
 assert.deepEqual(api.kinoDecode(f.encode(words,false),f.config,false),words);
});
test('unsupported or excessive source fails closed',()=>{
 assert.throws(()=>reader.protocol('globalThis.evaluated=true;'));
 assert.throws(()=>reader.protocol('x'.repeat(250001)));
 const f=fixture();assert.throws(()=>reader.protocol(f.source.replace('response[\'slice\'](at(2));','')));
 assert.throws(()=>api.kinoDecode('x'.repeat(8000001),f.config,true));
 assert.equal(globalThis.evaluated,undefined);
});
test('shipped runtime and analyzer remain compatible with ES5 Tizen',()=>{
 const acorn=require('../vendor/acorn');for(const file of ['ukr-by-faborn.js','lib/kinobase.js'])acorn.parse(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),{ecmaVersion:5});
});
test('external audio retains its parent HLS playlist',()=>{
 const url='https://video.redcdn.org/2160/master-v1-a2.m3u8';
 const body='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=10000000,RESOLUTION=3840x2160,AUDIO="audio"\nvideo.m3u8';
 assert.deepEqual(api.parseMaster(body,url),{'2160p':url});
 assert.deepEqual(api.parseMaster(body+'\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,AUDIO="audio"\nlow.m3u8',url),{auto:url});
});
test('nested seasons retain languages, selected tracks and allowed mirrors',()=>{
 const file='[720p]{1+1 (Украинский)}https://a.redcdn.org/720/master-v1-a3.m3u8 or https://b.threnet.xyz/720/master-v1-a3.m3u8;{Paramount (Русский)}https://a.redcdn.org/720/master-v1-a1.m3u8;{English}https://a.redcdn.org/720/master-v1-a4.m3u8;{Підміна}https://redcdn.org.evil.test/master.m3u8';
 const entries=api.kinoEntries(['p',JSON.stringify([{title:'2 сезон',folder:[{title:'7 серия',file}]}])],{type:'tv',voice:'Озвучення'});
 assert.equal(entries.length,3);assert.deepEqual(entries.map(e=>e.audioLanguage),['uk','ru','en']);assert.ok(entries[2].master.endsWith('a4.m3u8'));
 assert.ok(entries.every(e=>e.season===2&&e.episode===7));assert.equal(entries[0].mirrors['720p'].length,2);assert.ok(entries[0].master.endsWith('a3.m3u8'));
});
test('identically named UA, EN and RU releases never merge',()=>{
 const release=lang=>({source:'kinobase',voice:'Studio',audioLanguage:lang,episodes:[{season:0,episode:0,resolvedAt:Date.now(),qualities:{'1080p':'https://a.redcdn.org/master.m3u8'}}]});
 const result=api.sourceGroups({title:{releases:[release('ru'),release('en'),release('uk')]},season:0,episode:0});
 assert.deepEqual(result.groups.map(g=>g.language),['uk','en','ru']);assert.equal(new Set(result.groups.map(g=>g.key)).size,3);
});
test('English labels and original language are distinguished from unknown or other originals',()=>{
 for(const label of ['English','Original (English)','Англійська','Оригинальный (Английский)','EN','ENG'])assert.equal(api.audioLanguage(label,'ru'),'en');
 assert.equal(api.audioLanguage('Оригінал','uk','en'),'en');
 assert.equal(api.audioLanguage('Original','uk','ja'),'other');
 assert.equal(api.audioLanguage('Original (Japanese)','ru','en'),'other');
 assert.equal(api.audioLanguage('Original','uk'),'original');
 assert.equal(api.audioLanguage('Golden Voice','uk'),'uk');
});
test('generic Original follows known English metadata and never assumes English without evidence',()=>{
 const parts=['f','[1080p]{Оригінал}https://a.redcdn.org/1080/master-v1-a3.m3u8'];
 assert.equal(api.kinoEntries(parts,{type:'movie',originalLanguage:'en'})[0].audioLanguage,'en');
 assert.equal(api.kinoEntries(parts,{type:'movie'})[0].audioLanguage,'original');
 assert.throws(()=>api.kinoEntries(parts,{type:'movie',originalLanguage:'ja'}),/підтримуваних/);
});
test('nested EN folders keep language through season and episode names',()=>{
 const tree=[{title:'English',folder:[{title:'Season 2',folder:[{title:'Episode 7: The French Lesson',file:'https://ashdi.vip/english/index.m3u8'}]}]}];
 const entries=api.playerEntries('new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})',{type:'tv'});
 assert.equal(entries.length,1);assert.equal(entries[0].audioLanguage,'en');assert.equal(entries[0].season,2);assert.equal(entries[0].episode,7);
});
