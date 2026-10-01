'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../lib/faborn-ui');
const ids=['netflix','apple','prime','disney','hbo','paramount','hulu'];
const ui=factory({}, {Storage:{get:(k,f)=>f}},null);
test('studio collections open native Lampa catalogs, not external players',()=>{
 for(const id of ids)for(const kind of ['movie','tv']){
  const r=ui.studioRequest(id,kind);assert.equal(r.component,'category_full');assert.equal(r.source,'tmdb');assert.equal(r.url,'discover/'+kind);assert.equal(r.page,1);assert.equal(r.filter.include_adult,'false');assert.equal(r.sort_by,'popularity.desc');
 }
});
test('series match the platform network, while films use an explicitly regional provider catalog',()=>{
 assert.deepEqual(ui.studioRequest('apple','tv').filter,{include_adult:'false',with_networks:'2552'});
 assert.deepEqual(ui.studioRequest('apple','movie').filter,{include_adult:'false',with_watch_providers:'350',watch_region:'US',with_watch_monetization_types:'flatrate'});
 assert.ok(!('with_companies' in ui.studioRequest('netflix','movie').filter));
});
test('renamed networks are combined with OR and Paramount uses current US packages',()=>{
 assert.equal(ui.studioRequest('hbo','tv').filter.with_networks,'49|3186|6783');
 assert.equal(ui.studioRequest('paramount','tv').filter.with_networks,'1709|4330');
 assert.equal(ui.studioRequest('paramount','movie').filter.with_watch_providers,'2303|2616');
});
test('invalid studio and media IDs cannot build an arbitrary discovery request',()=>{
 for(const id of [undefined,null,'','__proto__','https://outside.test','NETFLIX'])assert.equal(ui.studioRequest(id,'tv'),null);
 for(const kind of [null,'person','movie?include_adult=true'])assert.equal(ui.studioRequest('netflix',kind),null);
});
test('pagination cannot contaminate the next opening or another studio',()=>{
 const first=ui.studioRequest('netflix','movie');first.page=3;first.filter.watch_region='GB';
 const next=ui.studioRequest('netflix','movie');assert.equal(next.page,1);assert.equal(next.filter.watch_region,'US');assert.equal(ui.studioRequest('prime','movie').filter.with_watch_providers,'9');
});
function environment(){
 class Node{
  constructor(){this.children=[];this.parentNode=null;this.attrs={};this.events={};this.classes=new Set();this.classList={add:k=>this.classes.add(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};}
  appendChild(n){return this.insertBefore(n,null);}
  insertBefore(n,b){if(n.parentNode)n.parentNode.removeChild(n);const i=b?this.children.indexOf(b):-1;this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this;return n;}
  removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;}
  get nextSibling(){return this.parentNode.children[this.parentNode.children.indexOf(this)+1]||null;}
  setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return {top:0,bottom:400};}
 }
 const values={},controllers={},pushes=[],scrolls=[],menus=[],states=[],parent=new Node();let current=null,hidden=0;
 const root={document:{createElement:()=>new Node()},Navigator:{move:direction=>states.push(direction),canmove:()=>true}};
 function $(node){return {on(events,fn){events.split(' ').forEach(e=>node.events[e]=fn);return this;}};}
 const L={Storage:{get:(k,f)=>values[k]??f},Activity:{push:r=>pushes.push(r)},Select:{show:m=>menus.push(m),hide:()=>hidden++},Scroll:function(){const n=new Node();this.body=()=>n;this.render=()=>n;this.append=c=>n.appendChild(c);this.update=c=>states.push(c);this.destroy=()=>{this.dead=true;};scrolls.push(this);},Controller:{add:(k,v)=>{controllers[k]=v;},toggle:k=>{current=k;controllers[k].toggle();},own:row=>current&&controllers[current].link===row,enabled:()=>({name:current,controller:controllers[current]}),collectionSet:()=>{},collectionFocus:(last,n)=>{const target=last||n.children[0];target.events['hover:focus']();}}};
 const first={render:()=>firstNode,toggle:()=>states.push('first')},second={render:()=>secondNode},firstNode=new Node(),secondNode=new Node();parent.appendChild(firstNode);parent.appendChild(secondNode);
 const component={items:[first,second],active:1,scroll:{update:n=>states.push(n)},emit(event,data){assert.equal(event,'createAndAppend');const row=data.params.createInstance();row.use({onActive(){component.active=component.items.indexOf(row);},onUp:()=>states.push('up'),onDown:()=>states.push('down'),onBack:()=>states.push('back')});row.create();component.items.push(row);parent.appendChild(row.render(true));}};
 const home={component,firstLine:first,node:new Node(),scroll:{clientHeight:700},queue:{pause:()=>states.push('pause')}};
 const api=factory(root,L,$,{studioAssets:'https://pages.test/assets/studios/'});
 return {api,values,component,home,parent,first,second,menus,pushes,scrolls,states,get hidden(){return hidden;},button:i=>home.studioRow.render(true).children[1].children[i],controller:()=>controllers.fbr_studios};
}
test('studio row inserts immediately after the first movie line without losing active item',()=>{
 const e=environment();e.api.syncStudios(e.home);assert.deepEqual(e.component.items,[e.first,e.home.studioRow,e.second]);assert.equal(e.component.active,2);assert.equal(e.parent.children[1],e.home.studioRow.render(true));
 for(let i=0;i<4;i++)e.api.syncStudios(e.home);assert.equal(e.component.items.length,3);assert.equal(e.scrolls.length,1);
});
test('off removes the native navigation item and reenabling creates one clean row',()=>{
 const e=environment();e.api.syncStudios(e.home);e.component.active=1;e.values.faborn_ukr_studios='off';e.api.syncStudios(e.home);
 assert.deepEqual(e.component.items,[e.first,e.second]);assert.equal(e.component.active,0);assert.equal(e.home.studioRow,null);assert.equal(e.scrolls[0].dead,true);assert.equal(e.parent.children.length,2);
 e.values.faborn_ukr_studios='on';e.api.syncStudios(e.home);assert.equal(e.component.items.length,3);
});
test('native home and destroyed components do not gain a studio row',()=>{
 for(const key of ['home','studios']){const e=environment();e.values['faborn_ukr_'+key]='off';e.api.syncStudios(e.home);assert.equal(e.component.items.length,2);}
 const e=environment();e.home.destroyed=true;e.api.syncStudios(e.home);assert.equal(e.component.items.length,2);
});
test('remote focus, up/down/back and menu cancellation preserve the active brand',()=>{
 const e=environment();e.api.syncStudios(e.home);const b=e.button(2);b.events['hover:focus']();e.home.studioRow.toggle();assert.equal(e.home.studio.id,'prime');assert.equal(e.component.active,1);
 e.controller().up();e.controller().down();e.controller().back();assert.ok(['up','down','back'].every(s=>e.states.includes(s)));
 b.events['hover:enter']();assert.equal(e.menus[0].title,'Prime Video');e.menus[0].onBack();assert.equal(e.home.studio.id,'prime');assert.equal(e.pushes.length,0);
});
test('a media choice opens its matching catalog and late callbacks after destroy cannot navigate',()=>{
 const e=environment();e.api.syncStudios(e.home);e.button(1).events['hover:enter']();const menu=e.menus[0];menu.onSelect({kind:'tv'});assert.deepEqual(e.pushes[0],ui.studioRequest('apple','tv'));
 e.button(1).events['hover:enter']();e.home.studioRow.destroy();const calls=e.pushes.length;e.menus[1].onSelect({kind:'movie'});e.menus[1].onBack();assert.equal(e.pushes.length,calls);assert.equal(e.scrolls[0].dead,true);
});
test('brand names remain as fallback until local logo has loaded',()=>{
 const e=environment();e.api.syncStudios(e.home);const b=e.button(0),name=b.children[0],logo=b.children[1];assert.equal(name.textContent,'Netflix');assert.equal(logo.src,'https://pages.test/assets/studios/netflix.png');assert.ok(!b.classes.has('fbr-studio--loaded'));
 logo.onload();assert.ok(b.classes.has('fbr-studio--loaded'));const second=e.button(1);e.home.studioRow.destroy();second.children[1].onload();assert.ok(!second.classes.has('fbr-studio--loaded'));
});

test('classic source menus retain studio collections unless explicitly disabled',()=>{
 const e=environment();e.values.faborn_ukr_layout='classic';e.api.syncStudios(e.home);assert.equal(e.component.items.length,3);
 e.button(0).events['hover:enter']();e.menus[0].onSelect({kind:'tv'});assert.deepEqual(e.pushes[0],ui.studioRequest('netflix','tv'));
 e.values.faborn_ukr_studios='off';e.api.syncStudios(e.home);assert.deepEqual(e.component.items,[e.first,e.second]);assert.equal(e.values.faborn_ukr_layout,'classic');
});
