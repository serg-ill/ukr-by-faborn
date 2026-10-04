'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),factory=require('../lib/faborn-ui');

// A browser serializes <path/> as <path></path>; equality against innerHTML
// must not be required to retain an unchanged live overlay.
function setup(){
 const values={},favorites={},timers=new Map(),roots=[];let serial=0,reads=0,profile='file_view';
 function element(){
  let html='';const attrs={},classes=new Set(),node={children:[],style:{},writes:0,reads:0};
  node.classList={add:c=>classes.add(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}};
  Object.defineProperty(node,'className',{get:()=>[...classes].join(' '),set(v){classes.clear();v.split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));}});
  Object.defineProperty(node,'innerHTML',{get(){node.reads++;return html.replace(/<path([^>]*)\/>/g,'<path$1></path>');},set(v){node.writes++;html=v;}});
  node.setAttribute=(k,v)=>attrs[k]=String(v);node.getAttribute=k=>attrs[k];
  node.appendChild=c=>{node.children.push(c);c.parentNode=node;return c;};
  node.querySelector=s=>{for(const c of node.children){if(c.classList.contains(s.slice(1)))return c;const found=c.querySelector(s);if(found)return found;}return null;};
  node.getBoundingClientRect=()=>({width:200,height:300,left:0,top:0,right:200,bottom:300});
  return node;
 }
 const doc={createElement:element,documentElement:{contains:n=>roots.includes(n)}};
 const L={Storage:{get:(k,f)=>values[k]??f,set:(k,v)=>values[k]=v},Utils:{hash:s=>s},Timeline:{filename:()=>profile,view(){reads++;return {}; }},Favorite:{check:m=>favorites[m.id]||{}}};
 const root={document:doc,innerWidth:1280,innerHeight:720,setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
 const ui=factory(root,L,null);
 function card(movie){const node=element(),view=element(),hooks={};view.className='card__view';node.appendChild(view);roots.push(node);ui.decoratePoster({render:()=>node,use:h=>Object.assign(hooks,h)},movie);return {node,hooks,overlay:()=>view.querySelector('.fbr-poster-overlay')};}
 return {ui,values,favorites,timers,card,profile:v=>profile=v,reads:()=>reads};
}
const film={id:872585,title:'Оппенгеймер',original_title:'Oppenheimer',vote_average:8,release_date:'2023-07-19'};
test('repeated focus and visibility retain the same SVG badges without reading serialized DOM',()=>{
 const e=setup(),card=e.card(film),overlay=card.overlay();
 for(let i=0;i<30;i++){card.hooks.onFocus();card.hooks.onVisible();}
 assert.equal(card.overlay(),overlay);assert.equal(overlay.writes,1);assert.equal(overlay.reads,0);assert.equal(e.timers.size,1);
});
test('real quality and watched changes repaint once and remain visible on subsequent focus',()=>{
 const e=setup(),card=e.card(film),overlay=card.overlay();
 e.ui.learn(film,{qualities:['2160p'],languages:['uk']});assert.equal(overlay.writes,2);assert.match(overlay.innerHTML,/4K/);
 e.ui.learn(film,{qualities:['2160p'],languages:['uk']});assert.equal(overlay.writes,2);
 e.favorites[film.id]={viewed:true};card.hooks.onFavorite();assert.equal(overlay.writes,3);assert.match(overlay.innerHTML,/Переглянуто/);
 card.hooks.onFocus();assert.equal(overlay.writes,3);
});
test('updating one favorite retains the progress cache of unrelated posters',()=>{
 const e=setup(),first=e.card(film),other=e.card({...film,id:1,original_title:'Another film'});
 first.hooks.onFavorite();const reads=e.reads();other.hooks.onFocus();assert.equal(e.reads(),reads);
 e.profile('file_view_2');other.hooks.onFocus();assert.ok(e.reads()>reads);
});
test('destroy releases the pending focus handler and unsubscribes a poster from quality paints',()=>{
 const e=setup(),card=e.card(film),overlay=card.overlay();card.hooks.onFocus();assert.equal(e.timers.size,1);
 const writes=overlay.writes;card.hooks.onDestroy();assert.equal(e.timers.size,0);e.ui.learn(film,{qualities:['2160p']});assert.equal(overlay.writes,writes);
});
test('navigation refresh retains cached native episode scans until that series really changes',()=>{
 const e=setup(),show={id:1668,name:'Друзі',original_name:'Friends',first_air_date:'1994-09-22',seasons:Array.from({length:10},(_,i)=>({season_number:i+1,episode_count:24}))};
 const card=e.card(show),other=e.card({...film,id:1}),reads=e.reads();assert.ok(reads>=480);
 for(let i=0;i<30;i++)e.ui.refreshPosters();assert.equal(e.reads(),reads);assert.equal(card.overlay().writes,1);
 e.ui.rememberEpisode('tmdb-tv-1668',{season:10,episode:7});const before=e.reads();other.hooks.onFocus();assert.equal(e.reads(),before);
 card.hooks.onFocus();assert.ok(e.reads()>before);const after=e.reads();e.ui.refreshPosters();assert.equal(e.reads(),after);
});
