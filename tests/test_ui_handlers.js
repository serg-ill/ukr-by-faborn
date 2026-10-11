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

// Exercise the public full-card lifecycle with only the DOM needed for badges.
function detailSetup(){
 const values={faborn_ukr_ratings:'off',faborn_ukr_torrent_quality:'search'},timers=new Map(),hooks={};let serial=0;
 function element(){
  const attrs={},classes=new Set(),node={children:[],parentNode:null,style:{},textContent:''};
  node.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}};
  Object.defineProperty(node,'className',{get:()=>[...classes].join(' '),set(v){classes.clear();v.split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));}});
  node.setAttribute=(k,v)=>attrs[k]=String(v);node.getAttribute=k=>attrs[k]??null;
  node.removeChild=c=>{node.children.splice(node.children.indexOf(c),1);c.parentNode=null;return c;};
  node.appendChild=c=>{if(c.parentNode)c.parentNode.removeChild(c);node.children.push(c);c.parentNode=node;return c;};
  node.contains=c=>node===c||node.children.some(child=>child.contains(c));
  node.querySelectorAll=selector=>{
   const names=selector.split(',').filter(s=>/^\.[\w-]+$/.test(s)).map(s=>s.slice(1)),found=[];
   function visit(n){n.children.forEach(c=>{if(names.some(name=>c.classList.contains(name)))found.push(c);visit(c);});}
   visit(node);return found;
  };
  node.querySelector=s=>node.querySelectorAll(s)[0]||null;
  Object.defineProperty(node,'innerHTML',{set(html){
   node.children.slice().forEach(c=>node.removeChild(c));
   if(html.includes('fbr-detail-top')){const top=element();top.className='fbr-detail-top';node.appendChild(top);}
   for(const _ of html.matchAll(/<img class="fbr-release-logo"[^>]*>/g)){
    const badge=element(),img=element();badge.className='fbr-release-studio';img.className='fbr-release-logo';
    img.complete=false;img.naturalWidth=0;node.appendChild(badge);badge.appendChild(img);
   }
  }});
  return node;
 }
 const container=element(),node=element();container.appendChild(node);
 const root={document:{createElement:element,documentElement:container},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
 const L={Storage:{get:(k,f)=>values[k]??f,set:(k,v)=>values[k]=v},TMDB:{image:p=>'https://image.test/'+p}};
 const ui=factory(root,L,null),movie={...film,production_companies:[{name:'Studio',logo_path:'/studio.png'}]};
 const event={type:'complite',data:{movie},object:{activity:{render:()=>node}},link:{use:h=>Object.assign(hooks,h)}};
 ui.full(event);
 return {ui,movie,node,hooks,timers,logo:()=>node.querySelector('.fbr-release-logo')};
}
test('a queued studio logo load after removal and card destruction cannot throw',()=>{
 const e=detailSetup(),img=e.logo(),loaded=img.onload;img.naturalWidth=92;
 img.parentNode.removeChild(img);e.hooks.onDestroy();
 assert.doesNotThrow(()=>loaded());assert.equal(img.onload,null);assert.equal(img.onerror,null);assert.equal(e.timers.size,0);
});
test('a queued studio logo error after removal and card destruction cannot throw',()=>{
 const e=detailSetup(),img=e.logo(),failed=img.onerror;
 img.parentNode.removeChild(img);e.hooks.onDestroy();
 assert.doesNotThrow(()=>failed());assert.equal(img.onload,null);assert.equal(img.onerror,null);
});
test('detached studio images are safe before Lampa delivers its delayed destroy event',()=>{
 const e=detailSetup(),img=e.logo(),badge=img.parentNode;
 img.naturalWidth=92;badge.removeChild(img);
 assert.doesNotThrow(()=>img.onload());assert.doesNotThrow(()=>img.onerror());
 assert.equal(badge.classList.contains('fbr-release-studio--logo'),false);e.hooks.onDestroy();
});
test('pausing detaches logo handlers and resuming displays a cached successful logo',()=>{
 const e=detailSetup(),img=e.logo(),badge=img.parentNode,loaded=img.onload;
 e.hooks.onPause();img.complete=true;img.naturalWidth=92;loaded();
 assert.equal(img.onload,null);assert.equal(img.onerror,null);assert.equal(badge.classList.contains('fbr-release-studio--logo'),false);
 e.hooks.onStart();assert.equal(e.logo(),img);assert.equal(badge.classList.contains('fbr-release-studio--logo'),true);
 img.onerror();assert.equal(badge.classList.contains('fbr-release-studio--logo'),false);e.hooks.onDestroy();
});
test('refreshing card badges cancels old logo events without affecting replacement logos',()=>{
 const e=detailSetup(),old=e.logo(),badge=old.parentNode,loaded=old.onload,failed=old.onerror;
 e.ui.learn(e.movie,{qualities:['2160p'],languages:['uk']});const current=e.logo();assert.notEqual(current,old);
 old.naturalWidth=92;loaded();failed();assert.equal(badge.classList.contains('fbr-release-studio--logo'),false);
 assert.equal(old.onload,null);assert.equal(old.onerror,null);assert.equal(current.parentNode.classList.contains('fbr-release-studio--logo'),false);
 current.naturalWidth=92;current.onload();assert.equal(current.parentNode.classList.contains('fbr-release-studio--logo'),true);e.hooks.onDestroy();
});
