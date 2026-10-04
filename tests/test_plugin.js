'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const factory = require('../ukr-by-faborn.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/catalog.json')));
const api = factory({});

test('normalizes Ukrainian punctuation and case', () => {
    assert.equal(api.normalize('  ДЖЕК РІЧЕР — 3 сезон '), 'джек річер 3 сезон');
    assert.equal(api.normalize('Зв’язок'), 'звязок');
});
test('matches Ukrainian and original titles, never returns unrelated films', () => {
    assert.equal(api.matchTitles(catalog, {original_title: 'The Beekeeper', release_date: '2024-01-10'})[0].id, 'the-beekeeper-2024');
    assert.equal(api.matchTitles(catalog, {name: 'Річер'})[0].id, 'reacher-2022');
    assert.equal(api.matchTitles(catalog, {title: 'Unknown unrelated title'}).length, 0);
});
test('rejects fake media hosts, credentials and insecure protocols', () => {
    ['http://ashdi.vip/a', 'https://ashdi.vip.evil.test/a', 'https://evil@ashdi.vip/a', 'javascript:alert(1)'].forEach(url => assert.equal(api.mediaURL(url), false));
    assert.equal(api.mediaURL('https://ashdi.vip/video/index.m3u8'), true);
});
test('base URL accepts GitHub Pages and local QA only', () => {
    assert.equal(api.safeBase('https://faborn.github.io/lampa/'), true);
    assert.equal(api.safeBase('http://localhost:8765/release/'), true);
    assert.equal(api.safeBase('https://github.io.evil.test/'), false);
});
test('catalog requires Ukrainian audio evidence and playable entries', () => {
    assert.equal(api.validCatalog(catalog), true);
    const bad = JSON.parse(JSON.stringify(catalog));
    bad.titles[0].releases[0].audioLanguage = 'en';
    assert.equal(api.validCatalog(bad), false);
    bad.titles[0].releases = [];
    assert.equal(Boolean(api.validCatalog(bad)), false);
});
test('sorts actual qualities and handles lower-quality next episodes', () => {
    const ep = catalog.titles[0].releases[0].episodes[0];
    assert.equal(api.qualityNames(ep)[0], '2160p');
    assert.equal(api.pickURL(ep, 'auto'), ep.master);
    assert.equal(api.pickURL(ep, '1080p'), ep.qualities['1080p']);
    const lower = {master: ep.master, qualities: {'720p': ep.qualities['720p']}};
    assert.equal(api.pickURL(lower, '2160p'), lower.qualities['720p']);
});
test('timeline identity does not depend on expiring URL, voice or source', () => {
    const title = catalog.titles[2];
    assert.equal(api.timelineKey(title, {season: 3, episode: 1}), api.timelineKey(title, {season: 3, episode: 1, master: 'changed'}));
    assert.notEqual(api.timelineKey(title, {season: 3, episode: 1}), api.timelineKey(title, {season: 3, episode: 2}));
});
test('autoplay stops at missing or unavailable episodes instead of silently skipping them', () => {
    const episodes = [1, 2, 3, 4, 5].map(n => ({id: String(n), season: 1, episode: n, state: n === 3 ? 'unavailable' : 'verified'}));
    assert.deepEqual(api.availablePlaylist({episodes}, episodes[1]).map(e => e.episode), [1, 2]);
    assert.deepEqual(api.availablePlaylist({episodes}, episodes[3]).map(e => e.episode), [4, 5]);
    assert.deepEqual(api.availablePlaylist({episodes: [episodes[0], episodes[3]]}, episodes[0]).map(e => e.episode), [1]);
});
test('escapes source labels before Lampa templates', () => {
    assert.equal(api.escapeHTML('<img src=x> & "'), '&lt;img src=x&gt; &amp; &quot;');
});

function environment(options = {}) {
    const state = {storage: {}, timelines: {}, timelineEvents: {}, history: [], follows: {}, playerEvents: {}, videoEvents: {}, nativeEvents: {}, pageEvents: {}, timers: {}, timerId: 0, params: [], notices: [], controller: 'full_start', menu: null, played: null, requests: [], catalog: catalog};
    const jq = () => ({length: 0, append() { return this; }});
    function XHR() { state.requests.push(this); }
    XHR.prototype.open = function (method, url) { if (options.openError) throw new Error('Request blocked'); this.url = url; this.method = method; this.headers = {}; };
    XHR.prototype.setRequestHeader = function (name,value) { this.headers[name] = value; };
    XHR.prototype.send = function (body) {
        this.body = body;
        if (options.delayed) return;
        if (options.respond) return options.respond(this,state);
        this.status = options.failure ? 403 : 200;
        this.responseText = this.url.includes('catalog.json') ? JSON.stringify(state.catalog) : '#EXTM3U\n#EXTINF:6,\nvideo.ts';
        this.onload();
    };
    XHR.prototype.abort = function () { this.aborted = true; };
    const root = {jQuery: jq, XMLHttpRequest: XHR, document: {currentScript: {src: 'https://faborn.github.io/lampa/ukr-by-faborn.js'}, getElementsByTagName() { return []; }},
        addEventListener(name,fn) { state.pageEvents[name]=fn; },
        setTimeout(fn, ms) { const id = ++state.timerId; state.timers[id] = {fn, ms}; return id; },
        clearTimeout(id) { delete state.timers[id]; }
    };
    root.Lampa = {
        Storage: {get(k, d) { return Object.hasOwn(state.storage, k) ? state.storage[k] : d; }, set(k, v) { state.storage[k] = v; }, field(k) { return k === 'player' ? (options.player || 'tizen') : undefined; }},
        Platform: {is(name) { return name === (options.platform || 'tizen'); }},
        Noty: {show(s) { state.notices.push(s); }},
        Select: {show(menu) { state.menu = menu; state.controller = 'select'; }, hide() { state.menu = null; }},
        Listener: {follow(k, fn) { state.follows[k] = fn; }},
        Controller: {enabled() { return {name: state.controller}; }, toggle(n) { state.controller = n; }},
        SettingsApi: {addComponent() {}, addParam(p) { state.params.push(p); }},
        Timeline: {listener:{follow(k,fn){state.timelineEvents[k]=fn;}},update({hash,percent,time,duration}){const road={percent,time,duration,updated:Date.now()};state.timelines[hash]=road;if(state.timelineEvents.update)state.timelineEvents.update({data:{hash,road}});},view(hash) { return {hash, time: 0, percent: 0, duration: 0, ...state.timelines[hash], handler(percent,time,duration) { root.Lampa.Timeline.update({hash,percent,time,duration}); }}; }},
        Favorite: {add(folder,card) { state.history.push({folder,card}); }},
        Utils: {hash(s) { return s; }},
        Player: {
            listener: {follow(k, fn) { state.playerEvents[k] = fn; }},
            playlist(p) { state.playlist = p; },
            play(data) { state.playerReturn = state.controller; state.controller = 'player'; state.played = data; state.playerEvents.start(data); if (state.playerEvents.ready) state.playerEvents.ready(data); },
            playdata() { return state.played; },
            callback(fn) { state.playerCallback=fn; },
            close() { state.controller = state.playerReturn; state.closed = true; state.played = null; state.playerEvents.destroy(); if(state.playerCallback)state.playerCallback();state.playerCallback=null; }
        },
        PlayerVideo: {listener: {follow(k, fn) { state.videoEvents[k] = fn; }}, video() { return {addEventListener(k, fn) { state.nativeEvents[k] = fn; }}; }}
    };
    if (options.document) root.document = options.document;
    if (options.jQuery) root.jQuery = options.jQuery;
    if (options.panelEvents) root.Lampa.PlayerPanel = {listener:{follow(k,fn){options.panelEvents[k]=fn;}}};
    if (options.settings) root.Lampa.Settings = options.settings;
    if (options.template) root.Lampa.Template = options.template;
    if (options.head) root.Lampa.Head = options.head;
    if (options.storage) Object.assign(state.storage,options.storage);
    if (options.lampaSettings) root.lampa_settings=options.lampaSettings;
    const instance = factory(root); instance.boot();
    state.choose = function (predicate) {
        const menu = state.menu;
        const item = menu.items.find(predicate);
        assert.ok(item, 'Expected menu item: ' + menu.title);
        menu.onSelect(item);
    };
    state.language = function (value) { state.choose(i=>i.action==='language'); state.choose(i=>i.value===value); };
    state.play = function (quality, predicate = () => true) {
        if (state.menu.items.some(i=>i.action==='quality')) {
            state.choose(i=>i.action==='quality'); state.choose(i=>i.value===quality);
        }
        const row=state.menu.items.find(i=>i.group && i.value===quality && i.group.entries.some(predicate));
        assert.ok(row,'Expected translation and quality');
        state.choose(i=>i===row);
        if(row.action==='sources') state.choose(i=>i.action==='play' && predicate(i));
    };
    state.fireTimer = function (ms) {
        const id = Object.keys(state.timers).find(id => state.timers[id].ms === ms);
        assert.ok(id, 'Expected timer: ' + ms);
        const callback = state.timers[id].fn; delete state.timers[id]; callback();
    };
    state.progress = function (current,duration) {
        Object.assign(state.played.timeline,{time:current,duration,percent:Math.round(current/duration*100)});
        state.videoEvents.timeupdate({current,duration});
    };
    return {state, root, instance};
}

test('app reload requires a deliberate choice, leaves storage intact and ignores stale OK',()=>{
    const e=environment({storage:{faborn_ukr_accent:'mint',account:{id:'profile'},file_view:{film:{time:123}}}});let calls=0;
    e.root.location={reload(){calls++;}};e.state.controller='head';const saved=JSON.stringify(e.state.storage);
    e.instance.reload();const cancelled=e.state.menu;
    assert.equal(calls,0);assert.equal(cancelled.items[0].selected,true);assert.ok(!cancelled.items[0].reload);
    e.instance.reload();assert.equal(e.state.menu,cancelled);cancelled.onBack();assert.equal(e.state.controller,'head');
    cancelled.onSelect({reload:true});assert.equal(calls,0);
    e.instance.reload();e.state.choose(item=>!item.reload);assert.equal(calls,0);assert.equal(e.state.controller,'head');
    e.instance.reload();const confirmed=e.state.menu;cancelled.onSelect({reload:true});cancelled.onBack();assert.equal(e.state.menu,confirmed);assert.equal(calls,0);
    confirmed.onSelect({reload:true});confirmed.onSelect({reload:true});e.instance.reload();
    assert.equal(calls,1);assert.equal(e.state.menu,null);assert.equal(JSON.stringify(e.state.storage),saved);
});
test('app reload cannot interrupt playing, paused or newly started video',()=>{
    const e=environment();let calls=0,opened=true;e.root.location={reload(){calls++;}};e.root.Lampa.Player.opened=()=>opened;
    e.instance.reload();assert.equal(calls,0);assert.equal(e.state.menu,null);assert.match(e.state.notices.pop(),/Заверши перегляд/);
    opened=false;e.root.document.body={classList:{contains:c=>c==='player--viewing'}};
    e.instance.reload();assert.equal(e.state.menu,null);delete e.root.document.body;
    e.instance.reload();const menu=e.state.menu;opened=true;menu.onSelect({reload:true});
    assert.equal(calls,0);assert.equal(e.state.controller,'player');assert.equal(e.state.menu,null);
});
test('failed or unavailable reload recovers its controller and allows another attempt',()=>{
    const e=environment();e.state.controller='head';e.instance.reload();assert.equal(e.state.menu,null);
    e.root.location={reload(){throw Error('unavailable');}};e.instance.reload();e.state.choose(i=>i.reload);
    assert.equal(e.state.controller,'head');assert.match(e.state.notices.pop(),/Не вдалося/);
    let calls=0;e.root.location.reload=()=>calls++;e.instance.reload();e.state.choose(i=>i.reload);assert.equal(calls,1);
});
test('settings open moves the existing Faborn folder first without losing or duplicating other folders',()=>{
    const events={},settings={listener:{follow(name,fn){events[name]=fn;}}},e=environment({settings});
    const a={id:'interface'},b={id:'player'},f={id:'faborn_ukr'},extra={id:'other-plugin'},rows=[a,b,f];
    const wrap=node=>({0:node,length:node?1:0,first(){return this;},before(row){rows.splice(rows.indexOf(row[0]),1);rows.splice(rows.indexOf(node),0,row[0]);}});
    const body={find(selector){return wrap(selector.includes('faborn_ukr')?rows.find(x=>x.id==='faborn_ukr'):rows[0]);}};
    events.open({name:'player',body});assert.deepEqual(rows,[a,b,f]);
    events.open({name:'main',body});events.open({name:'main',body});assert.deepEqual(rows,[f,a,b]);
    rows.unshift(extra);events.open({name:'main',body});assert.deepEqual(rows,[f,extra,a,b]);
    rows.splice(0,1);events.open({name:'main',body});assert.deepEqual(rows,[extra,a,b]);e.instance.boot();
});
test('all four header actions mount once in order through the native API, including delayed app ready',()=>{
    let ready=false;const nodes={},order=['settings'];
    const wrap=name=>({length:name?1:0,first(){return this;},after(button){order.splice(order.indexOf(name)+1,0,button.name);}});
    const head={render(){return ready?{find(selector){const name=selector==='.open--settings'?'settings':selector.replace('.open--faborn-','');return nodes[name] || wrap(name==='settings'?name:null);}}:null;},addIcon(svg,action){
        assert.match(svg,/viewBox="0 0 24 24"/);const node=wrap('');node.length=1;node.action=action;
        node.addClass=classes=>{node.name=classes.split('open--faborn-')[1];nodes[node.name]=node;node.after=wrap(node.name).after;return node;};
        node.attr=attrs=>{node.attrs=attrs;return node;};return node;
    }};
    const e=environment({head});assert.equal(Object.keys(nodes).length,0);ready=true;e.state.follows.app({type:'ready'});e.state.follows.app({type:'ready'});e.instance.boot();
    assert.deepEqual(order,['settings','library','continue','saver','reload']);assert.equal(Object.keys(nodes).length,4);
    assert.deepEqual(Object.values(nodes).map(n=>n.attrs['aria-label']),['Медіатека','Продовжити перегляд','Заставка','Перезавантажити Lampa']);
    nodes.library.action();assert.match(e.state.notices.pop(),/Медіатека ще завантажується/);
    nodes.continue.action();assert.equal(e.state.menu,null);assert.match(e.state.notices.pop(),/Медіатека ще завантажується/);
    nodes.saver.action();assert.match(e.state.notices.pop(),/Заставка ще завантажується/);
    e.root.Lampa.Player.opened=()=>true;nodes.library.action();assert.match(e.state.notices.pop(),/заверши перегляд/);nodes.saver.action();assert.match(e.state.notices.pop(),/Заверши перегляд/);
    e.root.Lampa.Player.opened=()=>false;e.root.location={reload(){throw Error('Must not reload on icon press');}};
    nodes.reload.action();assert.equal(e.state.menu.title,'Перезавантажити Lampa?');
});

test('comment modes default to sources, migrate an explicit opt-out, and preserve a saved choice',()=>{
    for(const [storage,expected] of [[{},'sources'],[{faborn_ukr_source_comments:'off'},'native'],[{faborn_ukr_comments:'off'},'off'],[{faborn_ukr_comments:'all'},'all']]){
        const e=environment({storage}),param=e.state.params.find(p=>p.param.name==='faborn_ukr_comments');
        assert.equal(e.state.storage.faborn_ukr_comments,expected);assert.equal(param.param.default,expected);
        assert.deepEqual(Object.keys(param.param.values),['sources','native','all','off']);
        assert.ok(!e.state.params.some(p=>p.param.name==='faborn_ukr_source_comments'));
    }
});
test('native comments are disabled before requests and restore the original feature flag',()=>{
    const flags={discuss:false,reactions:false},e=environment({lampaSettings:{disable_features:flags}}),param=e.state.params.find(p=>p.param.name==='faborn_ukr_comments');
    assert.equal(flags.discuss,true);
    for(const [value,blocked] of [['native',false],['off',true],['sources',true],['all',false]]){e.state.storage.faborn_ukr_comments=value;param.onChange();assert.equal(flags.discuss,blocked);assert.equal(flags.reactions,false);}
    const restricted={discuss:true},f=environment({lampaSettings:{disable_features:restricted}});f.state.storage.faborn_ukr_comments='all';f.state.params.find(p=>p.param.name==='faborn_ukr_comments').onChange();assert.equal(restricted.discuss,true);
});
test('cached CUB data is omitted while building rows and restored for later mode changes',()=>{
    const e=environment(),discuss={result:[{comment:'Existing'}]},data={discuss},hooks=[],link={use:h=>hooks.push(h)};
    e.state.follows.full({type:'start',data,link});assert.ok(!Object.hasOwn(data,'discuss'));
    e.state.follows.full({type:'complite',data,link});assert.equal(data.discuss,discuss);assert.ok(!link._fabornDiscuss);
    e.state.storage.faborn_ukr_comments='all';e.state.follows.full({type:'start',data,link});assert.equal(data.discuss,discuss);
    e.state.storage.faborn_ukr_comments='off';e.state.follows.full({type:'start',data,link});assert.equal(data.discuss,undefined);hooks.at(-1).onDestroy();assert.equal(data.discuss,discuss);
});

test('full film flow hands 4K, quality map, subtitles and stable timeline to Lampa', () => {
    const {instance, state} = environment();
    instance.open({title: 'Профі', original_title: 'A Working Man', release_date: '2025-03-26'});
    state.play('2160p');
    assert.ok(state.played.url.includes('/hls/2160/'));
    assert.equal(Object.keys(state.played.quality).length, 4);
    assert.equal(state.played.timeline.hash, 'faborn|tmdb-movie-a working man|0|0');
    assert.equal(state.played.subtitles[0].label, 'Українські');
    assert.equal(state.playlist.length, 0);
});
test('series uses one episode selector and one source/quality list', () => {
    const {instance,state} = environment();
    instance.open({name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'});
    state.choose(i=>i.action==='episode'); state.choose(i=>i.value===3); state.choose(i=>i.value===2);
    state.play('1080p',i=>i.release.voice==='Uaflix');
    assert.equal(state.played.episode,2); assert.equal(state.played.season,3);
    assert.equal(state.played.voice_name,'Uaflix'); assert.ok(state.playlist.length>1); assert.equal(typeof state.playlist[0].url,'function');
    assert.equal(state.playerReturn,'full_start');
});
test('canceling a pending catalog read does not open a stale modal', () => {
    const {instance, state} = environment({delayed: true});
    instance.open({title: 'Профі'});
    state.menu.onBack();
    const req = state.requests[0]; req.status = 200; req.responseText = JSON.stringify(catalog); req.onload();
    assert.equal(state.menu, null);
    assert.equal(state.controller, 'full_start');
});
test('failed catalog fetch reports error and does not launch video', () => {
    const {instance, state} = environment({failure: true});
    instance.open({title: 'Профі'});
    assert.ok(state.menu.items.some(i=>i.title.includes('Немає озвучення')));
    assert.equal(state.played, null);
});
test('install is idempotent and does not modify another plugin playback', () => {
    const {instance, state} = environment();
    const n = state.params.length; instance.boot();
    assert.equal(state.params.length, n);
    const foreign = {url: 'https://other.example/movie.m3u8'};
    state.playerEvents.start(foreign);
    assert.equal(foreign.url, 'https://other.example/movie.m3u8');
});
test('retired Alloha is absent from settings and its saved flag cannot start discovery', () => {
 const env=environment(),{state,root}=env;let loaded=0;
 root.Faborn4KLab=()=>{loaded++;return {};};state.storage.faborn_ukr_lab4k='on';
 env.instance.open({title:'Оппенгеймер',original_title:'Oppenheimer',release_date:'2023-07-19'});
 assert.equal(loaded,0);
 assert.equal(state.params.some(p=>p.param.name==='faborn_ukr_lab4k'||p.param.name==='faborn_ukr_lab4k_test'),false);
 assert.equal(state.menu.items.some(i=>i.action==='labstatus'),false);
 assert.equal(state.requests.some(r=>/uakinogo|alloha/.test(r.url)),false);
 assert.ok(state.params.find(p=>p.param.name==='faborn_ukr_kino_session'));
});
test('input settings supply the string values required by Lampa Params.bind', () => {
    const {state} = environment();
    const inputs = state.params.filter(p => p.param.type === 'input');
    assert.ok(inputs.length > 0);
    for (const {param} of inputs) {
        assert.equal(typeof param.values, 'string', 'Lampa dereferences undefined values when opening settings: ' + param.name);
        assert.equal(typeof param.default, 'string');
        assert.ok(param.placeholder);
    }
});
test('diagnostics remain in settings rather than the playback menu', () => {
    const {instance, state} = environment();
    instance.open({title: 'Бджоляр'});
    state.params.find(p=>p.param.name==='faborn_ukr_diagnostic').onChange();
    assert.equal(state.menu.title, 'Діагностика');
    assert.ok(state.menu.items.some(i => i.title.includes(instance.version)));
    assert.ok(state.menu.items.some(i => i.title.includes('Плеєр Lampa: tizen')));
    assert.ok(state.menu.items.some(i => i.title === 'AVPlay API: недоступний'));
});
test('browser playback is explicitly blocked after known segment CORS failure', () => {
    const {instance, state} = environment({platform: 'browser'});
    instance.open({title: 'Профі'});
    state.play('2160p');
    assert.equal(state.played, null);
    assert.ok(state.menu.title.includes('Tizen'));
});
test('Tizen browser mode requires AVPlay without altering global player settings', () => {
    const {instance, state} = environment({player: 'inner'});
    instance.open({title: 'Профі'});
    state.play('2160p');
    assert.equal(state.played, null);
    assert.equal(state.menu.title, 'Потрібен плеєр Tizen');
    assert.equal(state.storage.player, undefined);
});

function filmQualityMenu(env) {
    env.instance.open({title: 'Бджоляр', original_title: 'The Beekeeper', release_date: '2024-01-10'});
}
test('settings use short subpages, preserve preferences and release a page before navigation',()=>{
 const calls=[],templates=[],e=environment({template:{add(name){templates.push(name);}},settings:{create(name,options){calls.push({name,options});}},storage:{faborn_ukr_accent:'mint',faborn_ukr_quality:'1080p'}});
 const top=e.state.params.filter(p=>p.component==='faborn_ukr');assert.equal(top.length,8);
 assert.equal(top.at(-1).param.name,'faborn_ukr_diagnostic');assert.equal(templates.length,7);
 assert.equal(e.state.params.find(p=>p.param.name==='faborn_ukr_quality').component,'faborn_ukr_playback');
 assert.equal(e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_password').component,'faborn_ukr_server');
 assert.equal(e.state.storage.faborn_ukr_accent,'mint');assert.equal(e.state.storage.faborn_ukr_quality,'1080p');
 e.root.Lampa.Controller.back=()=>calls.push({name:'release'});
 top.find(p=>p.param.name==='faborn_ukr_group_appearance').onChange();
 assert.deepEqual(calls.map(c=>c.name),['release','faborn_ukr_appearance']);
 calls[1].options.onBack();assert.equal(calls[2].name,'faborn_ukr');assert.equal(calls[2].options.last_index,2);
});
test('credential links are split before settings render and password editing is masked with no keyboard history',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_server:'test1:fixture%3Apass@192.168.88.191:8099'}});
 assert.equal(e.state.storage.faborn_ukr_uakinogo_server,'http://192.168.88.191:8099');
 assert.equal(e.state.storage.faborn_ukr_uakinogo_login,'test1');assert.equal(e.state.storage.faborn_ukr_uakinogo_password,'fixture:pass');
 let input,save;e.root.Lampa.Input={edit(params,done){input=params;save=done;}};
 const p=e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_password');assert.equal(p.param.type,'button');p.onChange();
 assert.equal(input.password,true);assert.equal(input.nosave,true);save('new-fixture');assert.equal(e.state.storage.faborn_ukr_uakinogo_password,'new-fixture');
 const address=e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_server');assert.equal(address.param.type,'button');address.onChange();
 assert.equal(input.nosave,true);assert.equal(input.value,'http://192.168.88.191:8099');save('https://test2:other@resolver.example');
 assert.equal(e.state.storage.faborn_ukr_uakinogo_server,'https://resolver.example');assert.equal(e.state.storage.faborn_ukr_uakinogo_login,'test2');
});

test('empty server login has no test placeholder and can be edited or cleared without input history',()=>{
 const e=environment();let input,done;
 e.root.Lampa.Input={edit(params,callback){input=params;done=callback;}};
 const login=e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_login');
 assert.equal(login.param.type,'button');assert.equal(login.param.placeholder,undefined);
 login.onChange();assert.equal(input.value,'');assert.equal(input.nosave,true);
 done('friend');assert.equal(e.state.storage.faborn_ukr_uakinogo_login,'friend');
 login.onChange();assert.equal(input.value,'friend');done('');
 assert.equal(e.state.storage.faborn_ukr_uakinogo_login,'');
});
test('clearing server credentials removes both fields and preserves local endpoint and other preferences',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_server:'http://192.168.88.191:8789',faborn_ukr_uakinogo_login:'test1',faborn_ukr_uakinogo_password:'fixture',faborn_ukr_accent:'mint'}});
 e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_clear_credentials').onChange();
 assert.equal(e.state.storage.faborn_ukr_uakinogo_login,'');assert.equal(e.state.storage.faborn_ukr_uakinogo_password,'');
 assert.equal(e.state.storage.faborn_ukr_uakinogo_server,'http://192.168.88.191:8789');assert.equal(e.state.storage.faborn_ukr_accent,'mint');
 const connection=require('../lib/4klab/core').resolverConnection(e.state.storage.faborn_ukr_uakinogo_server,e.state.storage.faborn_ukr_uakinogo_login,e.state.storage.faborn_ukr_uakinogo_password);
 assert.equal(connection.authorization,'');assert.equal(connection.base,'http://192.168.88.191:8789');
});

function betaEnvironment(options={}) {
    const e=environment({...options,storage:{...options.storage,faborn_ukr_player:'beta'}});
    let spec,active=false;const choices=[];
    e.root.webapis={avplay:{getState(){return active?'PLAYING':'NONE';}}};
    e.root.FabornPlayer=()=>({available:()=>true,active:()=>active,apply(){},play(value){spec=value;active=true;},close(restore=true){active=false;spec.onClose(restore);},change(action){choices.push(action);spec.request(action,(error,value)=>{if(error)e.state.notices.push(error.message);else spec=value;});}});
    return Object.assign(e,{choices,getSpec:()=>spec,close(){active=false;spec.onClose(true);},active:()=>active});
}
test('online player setting explicitly offers an opt-in beta while Lampa remains default',()=>{
    const e=environment(),p=e.state.params.find(p=>p.param.name==='faborn_ukr_player');
    assert.equal(p.param.default,'lampa');assert.deepEqual(p.param.values,{lampa:'Lampa',beta:'Faborn Player · бета'});
    filmQualityMenu(e);e.state.play('1080p');assert.ok(e.state.played);assert.equal(e.state.requests.some(r=>r.url.includes('faborn-player.js')),false);
});
test('browser engine is separately opt-in, and default Lampa never loads the HLS bundle',()=>{
 const e=environment(),p=e.state.params.find(p=>p.param.name==='faborn_ukr_beta_engine');
 assert.equal(p.param.default,'avplay');assert.equal(p.param.values.mse,'Браузерний HLS · бета');
 filmQualityMenu(e);e.state.play('1080p');assert.equal(e.state.requests.some(r=>/faborn-hls|hls-1/.test(r.url)),false);
});
test('browser dependencies load lazily without starting playback after Back',()=>{
 const e=betaEnvironment({storage:{faborn_ukr_beta_engine:'mse'}}),scripts=[];
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){scripts.push(script);}};
 filmQualityMenu(e);e.state.play('1080p');assert.match(scripts[0].src,/lib\/hls\/hls-1\.7\.3\.js/);assert.equal(e.getSpec(),undefined);
 const loaded=scripts[0].onload;e.state.menu.onBack();const after=e.state.menu;e.root.FabornHls=function(){};loaded();
 assert.equal(e.getSpec(),undefined);assert.equal(e.state.played,null);assert.equal(e.state.menu,after);assert.equal(scripts.length,1);
});
test('browser player errors retain source, exact quality and stage in diagnostics',()=>{
 const e=betaEnvironment({storage:{faborn_ukr_beta_engine:'mse'}});e.root.FabornHls=function(){};e.root.FabornHlsTransport=function(){};
 filmQualityMenu(e);e.state.play('1080p');e.getSpec().onError('HLSNetworkError · MSE IDLE · prepareAsync · HTTP 403');
 assert.match(e.state.storage.faborn_ukr_last_error,/UAKino.*1080p.*MSE.*HTTP 403/);
 assert.match(e.state.storage.faborn_ukr_last_launch,/Браузерний HLS/);e.close();
});
test('selected beta bypasses native Lampa even with another global player and persists shared progress',()=>{
    const e=betaEnvironment({player:'inner'});e.instance.open({id:866398,title:'Бджоляр',original_title:'The Beekeeper',release_date:'2024-01-10'});e.state.play('1080p');
    assert.ok(e.getSpec());assert.equal(e.state.played,null);assert.equal(e.state.storage.player,undefined);
    e.getSpec().onTime({current:300,duration:6000,force:true});
    assert.equal(e.state.timelines['faborn|tmdb-movie-866398|0|0'].time,300);
    assert.equal(e.state.timelines['The Beekeeper'].time,300);assert.equal(e.state.history[0].card.id,866398);
    const before=e.state.requests.length;e.close();assert.equal(e.state.requests.length,before);assert.ok(e.state.menu.items.some(i=>i.group));
    e.state.play('1080p');assert.equal(e.getSpec().time,300);e.close();
});
test('beta without an available Samsung API returns to sources and never silently opens Lampa',()=>{
    const e=environment({storage:{faborn_ukr_player:'beta'}});filmQualityMenu(e);e.state.play('1080p');assert.equal(e.state.played,null);assert.equal(e.state.menu.title,'Faborn Player · бета');e.state.menu.onBack();assert.ok(e.state.menu.items.some(i=>i.group));
});
test('beta change refreshes exact quality, rejects unavailable selection and leaves old progress intact',()=>{
    const e=betaEnvironment();e.state.catalog=JSON.parse(JSON.stringify(catalog));e.state.catalog.titles.forEach(t=>t.releases.forEach(r=>r.episodes.forEach(ep=>{delete ep.embed;})));
    filmQualityMenu(e);e.state.play('1080p');const before=e.getSpec();before.onTime({current:312,duration:6000,force:true});
    let error,next;before.request({type:'quality',quality:'1440p'},(err,value)=>{error=err;next=value;});
    assert.ok(error);assert.equal(next,undefined);
    before.request({type:'quality',quality:'720p'},(err,value)=>{error=err;next=value;});assert.equal(error,null);assert.equal(next.quality,'720p');assert.equal(next.time,312);assert.equal(e.state.played,null);e.close();assert.ok(e.state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: 720p'));assert.equal(e.state.storage.faborn_ukr_quality,'720p');
});
test('profile change prevents beta progress being written into the new account',()=>{
    const e=betaEnvironment();let owner='first';e.root.Lampa.Timeline.filename=()=>owner;filmQualityMenu(e);e.state.play('1080p');
    e.getSpec().onTime({current:100,duration:6000,force:true});const recorded=JSON.stringify(e.state.timelines);owner='second';e.getSpec().onTime({current:200,duration:6000,force:true});
    assert.equal(JSON.stringify(e.state.timelines),recorded);assert.equal(e.active(),false);assert.match(e.state.notices.at(-1),/Профіль/);
});
test('closing beta cancels a quality request and late data cannot start playback',()=>{
    const options={},e=betaEnvironment(options);filmQualityMenu(e);e.state.play('1080p');
    // Use a queued XHR response after the established source discovery.
    const original=e.root.XMLHttpRequest.prototype.send;e.root.XMLHttpRequest.prototype.send=function(){this.pending=true;};let called=false;
    e.getSpec().request({type:'quality',quality:'720p'},()=>{called=true;});const req=e.state.requests.at(-1);e.close();assert.ok(req.aborted);
    req.status=200;req.responseText='#EXTM3U\n#EXTINF:6,\nvideo.ts';req.onload();assert.equal(called,false);assert.equal(e.state.played,null);e.root.XMLHttpRequest.prototype.send=original;
});

test('selected manifest is checked immediately before AVPlay, and a 404 is not played', () => {
    const options = {}; const env = environment(options); filmQualityMenu(env);
    options.failure = true; env.state.play('1080p');
    assert.equal(env.state.played,null); assert.ok(env.state.notices.some(n=>n.includes('404') || n.includes('403')));
});
test('canceling link refresh prevents late replies from starting video', () => {
    const options = {}; const env = environment(options); filmQualityMenu(env);
    options.delayed = true;
    env.state.play('1080p');
    const req = env.state.requests.at(-1);
    env.state.menu.onBack();
    req.status = 200; req.responseText = JSON.stringify(catalog); req.onload();
    assert.equal(req.aborted, true);
    assert.equal(env.state.played, null);
    assert.equal(env.state.menu,null); assert.equal(env.state.controller,'full_start');
});

test('a stuck native startup closes after 45 seconds and exposes a retry menu', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.play('1080p');
    env.state.fireTimer(45000);
    assert.equal(env.state.closed, true);
    assert.equal(env.state.menu.title, 'Відео не запустилося');
    assert.ok(env.state.storage.faborn_ukr_last_error.includes('45 секунд'));
});

test('actual playback progress cancels the startup watchdog', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.play('1080p');
    env.state.videoEvents.timeupdate({current: 1});
    assert.equal(Object.keys(env.state.timers).length, 0);
    assert.equal(env.state.closed, undefined);
});

test('a prepared player awaiting a resume choice is not closed by the startup watchdog', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.play('1080p');
    env.state.videoEvents.loadeddata({duration: 6000, current: 0});
    assert.equal(Object.keys(env.state.timers).length, 0);
    assert.equal(env.state.closed, undefined);
});

test('native AVPlay error is shown and a foreign player is never closed by old timers', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.play('1080p');
    env.state.videoEvents.error({error: {message: 'PLAYER_ERROR_CONNECTION_FAILED'}});
    env.state.fireTimer(0);
    assert.ok(env.state.menu.items[0].subtitle.includes('PLAYER_ERROR_CONNECTION_FAILED'));
    assert.equal(env.state.closed, true);

    const other = environment(); filmQualityMenu(other);
    other.state.play('1080p');
    const oldTimer = Object.values(other.state.timers)[0].fn;
    other.root.Lampa.Player.play({url: 'https://other.example/movie.mp4'});
    oldTimer();
    assert.equal(other.state.closed, undefined);
    assert.equal(other.state.played.url, 'https://other.example/movie.mp4');
});
test('Tizen event.error is captured even when Lampa does not forward it', () => {
    for (const detail of [{code: 'tizen', message: 'PLAYER_ERROR_CONNECTION_FAILED'}, 'code [0] prepare failed']) {
        const env = environment(); filmQualityMenu(env);
        env.state.play('1080p');
        env.state.nativeEvents.error({error: detail});
        env.state.fireTimer(0);
        assert.equal(env.state.closed, true);
        assert.ok(env.state.storage.faborn_ukr_last_error.includes(typeof detail === 'string' ? detail : detail.message));
        assert.ok(env.state.storage.faborn_ukr_last_launch.includes('Бджоляр'));
    }
});
test('a delayed error from a previous native video cannot close another plugin', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.play('1080p');
    const oldNativeError = env.state.nativeEvents.error;
    env.root.Lampa.Player.play({url: 'https://other.example/movie.mp4'});
    oldNativeError({error: 'late native error'});
    assert.equal(env.state.closed, undefined);
    assert.equal(Object.keys(env.state.timers).length, 0);
});

const fixture = name => fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
const movieHTML = fixture('uakino-movie.html');
const seriesHTML = fixture('uakino-series.html');
const searchHTML = fixture('uakino-search.html');
const djangoURL = 'https://uakino.best/filmy/genre_drama/10-dzhano-vlniy.html';
const seriesURL = 'https://uakino.best/seriesss/detective_series/26631-dzhek-richer-3-sezon.html';
const masterURL = 'https://ashdi.vip/fixture/hls/index.m3u8';
const embedHTML = `new Playerjs({id:'video',file:'${masterURL}',subtitle:'[Українські]https://ashdi.vip/player/subtitle/test.vtt'});`;
const masterHTML = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x1600\n2160/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x800\n1080/index.m3u8';
const seriesPlaylist = '<div class="playlists-videos"><li data-file="https://ashdi.vip/vod/165929" data-voice="DniproFilm">Серія 1</li><li data-file="https://ashdi.vip/vod/166247" data-voice="DniproFilm">Серія 2</li><li data-file="https://ashdi.vip/vod/165949" data-voice="Uaflix">Серія 1</li></div>';
function directEnvironment(config = {}) {
    return environment({respond(req) {
        if (config.intercept && config.intercept(req)) return;
        req.status = 200;
        if (req.url.includes('catalog.json')) req.responseText = JSON.stringify(catalog);
        else if (req.url === 'https://uakino.best/ua/') req.responseText = config.series ? searchHTML.replace(djangoURL,seriesURL).replace('Джанґо вільний','Джек Річер') : searchHTML;
        else if (req.url === djangoURL) req.responseText = movieHTML;
        else if (req.url === seriesURL) req.responseText = seriesHTML;
        else if (req.url.includes('playlists.php')) req.responseText = JSON.stringify({response:seriesPlaylist});
        else if (req.url === 'https://ashdi.vip/vod/3306' || req.url.includes('ashdi.vip/vod/16')) req.responseText = embedHTML;
        else if (req.url === masterURL) req.responseText = masterHTML;
        else if (req.url.includes('/hls/')) req.responseText = '#EXTM3U\n#EXTINF:6,\nsegment.ts';
        else { req.status=403; req.responseText=''; }
        req.onload();
    }});
}
function chooseDirect(env, series = false) {
    env.instance.open(series ? {name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'} : {id:68718,title:'Джанґо вільний',original_title:'Django Unchained',release_date:'2012-12-25'});

}
test('UAKino results preserve year, ignore recommendations, decode text and reject foreign hosts', () => {
    assert.deepEqual(api.parseSearch(searchHTML).map(r => [r.title,r.year]),[['Джанго',1966],['Джанґо вільний',2012]]);
    assert.equal(api.parseSearch(searchHTML.replace(djangoURL,'https://uakino.best.evil.test/10-a.html')).length,1);
    assert.equal(api.parseSearch(searchHTML.replace('Джанґо вільний','A &amp; B'))[1].title,'A & B');
    assert.throws(() => api.parseSearch(searchHTML.replace(/Пошук по сайту|За Вашим запитом/g,'Новинки')),/іншу сторінку/);
    assert.deepEqual(api.parseSearch('<h1>Пошук по сайту</h1><p>За Вашим запитом нічого не знайдено</p>'),[]);
});
test('UAKino challenge, unknown markup and missing audio evidence fail explicitly', () => {
    assert.throws(() => api.parseSearch('<title>Just a moment...</title>'),/Cloudflare/);
    assert.throws(() => api.parseSource('<title>Just a moment...</title>',djangoURL),/Cloudflare/);
    assert.throws(() => api.parseSource(movieHTML.replace('Український дубляж','Невідомо'),djangoURL),/мову/);
    assert.throws(() => api.parseSearch('<h1>Service error</h1>'),/іншу сторінку/);
});
test('film metadata and season metadata are taken from the page, not nav dates or TMDB', () => {
    const film = api.parseSource(movieHTML,djangoURL);
    assert.equal(film.year,2012); assert.equal(film.originalTitle,'Django Unchained');
    assert.equal(film.voice,'Український дубляж'); assert.ok(film.embeds.includes('https://ashdi.vip/vod/3306'));
    const show = api.parseSource(seriesHTML,seriesURL);
    assert.equal(show.season,3); assert.equal(show.title,'Джек Річер'); assert.equal(show.type,'tv'); assert.equal(show.year,2025);
    assert.equal(show.playlistURL,'https://uakino.best/engine/ajax/playlists.php?news_id=26631&xfield=playlist');
});
test('episode references preserve UA/EN voices and seasons without duplicates or trailers', () => {
    const show = api.parseSource(seriesHTML,seriesURL);
    api.addEpisodeRefs(show,seriesPlaylist + seriesPlaylist + '<li data-file="https://ashdi.vip/vod/123" data-voice="English">Серія 3</li>');
    assert.equal(show.releases.length,3); assert.equal(show.releases[2].audioLanguage,'en'); assert.deepEqual(show.releases[0].episodes.map(e=>e.episode),[1,2]);
    assert.ok(show.releases[0].episodes.every(e=>e.season===3 && !e.master));
});
test('only literal HLS is parsed from the player, source code is not evaluated', () => {
    const embed = api.parseEmbed(embedHTML);
    assert.equal(embed.master,masterURL); assert.equal(embed.subtitles.length,1);
    assert.throws(()=>api.parseEmbed("new Playerjs({file:makeURL()})"),/формат/);
    assert.throws(()=>api.parseEmbed("new Playerjs({file:'https://evil.test/a.m3u8'})"),/формат/);
    assert.equal(api.parseEmbed(embedHTML.replace('https://ashdi','https:\\/\\/ashdi')).master,masterURL);
});
test('direct HLS derives actual cropped 4K and relative variants, never fabricates quality', () => {
    assert.deepEqual(api.parseMaster(masterHTML,masterURL),{'2160p':'https://ashdi.vip/fixture/hls/2160/index.m3u8','1080p':'https://ashdi.vip/fixture/hls/1080/index.m3u8'});
    assert.deepEqual(api.parseMaster('#EXTM3U\n#EXTINF:6,\nsegment.ts',masterURL),{});
    assert.throws(()=>api.parseMaster(masterHTML.replace('2160/index.m3u8','https://evil.test/2160/index.m3u8'),masterURL),/відеохост/);
    assert.throws(()=>api.parseMaster('<h1>Bad gateway</h1>',masterURL),/HLS/);
});
test('new film outside catalog flows through source, embed, HLS and AVPlay without Pages refresh', () => {
    const env = directEnvironment(); chooseDirect(env);
    env.state.play('2160p');
    assert.equal(env.state.played.url,'https://ashdi.vip/fixture/hls/2160/index.m3u8');
    assert.equal(env.state.played.card.id,68718);
    assert.equal(env.state.requests.filter(r=>r.url.includes('catalog.json')).length,1);
    const search = env.state.requests.find(r=>r.url==='https://uakino.best/ua/');
    assert.equal(search.method,'POST'); assert.ok(search.body.includes(encodeURIComponent('Джанґо вільний')));
    assert.ok(env.state.storage.faborn_ukr_direct_trace.some(l=>l.includes('передано 2160p')));
});
test('one unavailable provider and failed Pages index do not block another source', () => {
    const env=directEnvironment({intercept(req) {if(req.url.includes('catalog.json')){req.status=503;req.onload();return true;}}});
    chooseDirect(env); env.state.play('1080p'); assert.ok(env.state.played);
    assert.ok(env.state.requests.some(r=>r.url==='https://uaserials.my/'));
    assert.ok(env.state.requests.some(r=>r.url==='https://uafix.net/search.html'));
});
test('every pending request is aborted and late replies cannot reopen a closed menu', () => {
    const env=environment({delayed:true}); env.instance.open({title:'Test'});
    assert.equal(env.state.requests.length,5); env.state.menu.onBack();
    for (const req of env.state.requests) {assert.equal(req.aborted,true);req.status=200;req.responseText=searchHTML;req.onload();}
    assert.equal(env.state.menu,null); assert.equal(env.state.controller,'full_start');
    assert.equal(Object.keys(env.state.timers).length,0);
});
test('retry from the select controller never overwrites the original card controller', () => {
    const env=environment(); filmQualityMenu(env); assert.equal(env.state.controller,'select');
    env.state.choose(i=>i.action==='retry'); env.state.menu.onBack();
    assert.equal(env.state.controller,'full_start'); assert.equal(env.state.menu,null);
});
test('closing after season and episode navigation restores the card controller', () => {
    const env=environment(); env.instance.open({name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'});
    env.state.choose(i=>i.action==='episode'); env.state.choose(i=>i.value===3); env.state.menu.onBack(); env.state.menu.onBack(); env.state.menu.onBack();
    assert.equal(env.state.controller,'full_start'); assert.equal(env.state.menu,null);
});
test('discovery preview keeps pending providers and finishes without reopening the card', () => {
    let waiting;
    const env=directEnvironment({intercept(req) {if(req.url==='https://uaserials.my/') {waiting=req;return true;}}});
    chooseDirect(env); assert.ok(env.state.menu.title.includes('пошук'));
    env.state.fireTimer(24000); const menu=env.state.menu;
    assert.ok(menu.items.some(i=>i.action==='play')); assert.notEqual(waiting.aborted,true);
    assert.ok(menu.items.some(i=>i.action==='wait'));waiting.status=403;waiting.responseText='';waiting.onload();assert.ok(env.state.menu.items.some(i=>i.action==='play'));assert.ok(!env.state.menu.items.some(i=>i.action==='wait'));
});
test('network errors and timeouts finish without a stuck loading menu', () => {
    for(const event of ['onerror','ontimeout']) {
        const env=directEnvironment({intercept(req) {if(!req.url.includes('catalog.json')) {req[event]();return true;}}});
        env.instance.open({title:'Unknown'}); assert.ok(env.state.menu.items.some(i=>i.action==='retry'));
        assert.equal(Object.keys(env.state.timers).length,0);
    }
});
test('synchronous request rejection also leaves a usable menu and restores navigation', () => {
    const env=environment({openError:true});
    assert.doesNotThrow(()=>env.instance.open({title:'Unknown'}));
    assert.ok(env.state.menu.items.some(i=>i.action==='retry'));
    env.state.menu.onBack(); assert.equal(env.state.controller,'full_start');
    assert.equal(Object.keys(env.state.timers).length,0);
});
test('an unavailable UAKino AJAX playlist does not discard its direct player', () => {
    const env=directEnvironment({intercept(req) {
        if(req.url===djangoURL) {
            req.status=200; req.responseText=movieHTML+'<div class="playlists-ajax" data-news_id="10" data-xfname="playlist"></div>'; req.onload();return true;
        }
        if(req.url.includes('/engine/ajax/playlists.php')) { req.status=503;req.onload();return true; }
    }});
    chooseDirect(env);env.state.play('1080p');assert.ok(env.state.played);
});
test('direct playback watchdog refreshes the player without a static catalog entry', () => {
    const env=directEnvironment();chooseDirect(env);env.state.play('1080p');
    env.state.fireTimer(45000);env.state.choose(i=>i.action==='retry');
    assert.equal(env.state.requests.filter(r=>r.url==='https://ashdi.vip/vod/3306').length,2);
    assert.equal(env.state.requests.filter(r=>r.url.includes('catalog.json')).length,1);assert.ok(env.state.played);
});
test('source and embed URL filters reject credential tricks and arbitrary servers', () => {
    ['http://uakino.best/a','https://uakino.best.evil/a','https://x@uakino.best/a','https://uakino.best\\@evil/a'].forEach(u=>assert.equal(api.uakinoURL(u),false));
    assert.equal(api.embedURL('//ashdi.vip/vod/123'),'https://ashdi.vip/vod/123');
    assert.equal(api.embedURL('https://ashdi.vip/vod/1/../../evil'),'');
});

const fromCard={id:124364,name:'Ззовні',original_name:'From',first_air_date:'2022-02-20'};
const hailCard={id:936075,title:'Проект «Аве Марія»',original_title:'Project Hail Mary',release_date:'2026-03-19'};
const uaserials=api.providers.find(p=>p.id==='uaserials');
const uafix=api.providers.find(p=>p.id==='uafix');
const hailSource='https://uaserials.my/12030-proiekt-ave-mariia-2026-r.html';
const fromSource='https://uaserials.my/6097-zzovni.html';

test('real UASerials search and title markup match both titles reported on the TV',()=>{
    assert.equal(api.providerSearch(fixture('uaserials-search.html'),uaserials)[0].originalTitle,'From');
    const show=api.providerPage(fixture('uaserials-from.html'),fromSource);
    assert.ok(api.sameTitle(fromCard,show,true)); assert.equal(show.year,2022);
    assert.deepEqual(show.embeds,['https://hdvbua.pro/embed/6097/b0c42c552']);
    const film=api.providerPage(fixture('uaserials-hail.html'),hailSource);
    assert.ok(api.sameTitle(hailCard,film,true)); assert.equal(film.type,'movie');
    assert.ok(api.sameTitle(hailCard,api.providerSearch(fixture('uaserials-hail-search.html'),uaserials)[0],false));
});
test('real UAFix markup supports films, season links and separate episode pages',()=>{
    const film=api.providerPage(fixture('uafix-hail-mary.html'),'https://uafix.net/films/prjawmar-nc2/');
    assert.ok(api.sameTitle(hailCard,film,true)); assert.equal(film.embeds[0],'https://zetvideo.net/vod/57356');
    assert.ok(api.sameTitle(hailCard,api.providerSearch(fixture('uafix-search.html'),uafix)[0],false));
    const show=api.providerPage(fixture('uafix-from.html'),'https://uafix.net/serials/szovni/');
    assert.ok(api.sameTitle(fromCard,show,true)); assert.equal(show.seasonPages.length,4);
    assert.equal(show.releases[0].episodes.length,21);
    assert.ok(show.releases[0].episodes.some(e=>e.page.endsWith('/season-01-episode-01/')));
});
test('UAKino movie playlists no longer require a series number',()=>{
    const title=api.parseSource(movieHTML,djangoURL);
    api.addEpisodeRefs(title,'<li data-file="//ashdi.vip/vod/3306" data-voice="Дубляж">1080p</li><li data-file="https://zetvideo.net/vod/1" data-voice="English">HD</li>');
    assert.equal(title.releases.length,2); assert.equal(title.releases[1].audioLanguage,'en'); assert.equal(title.releases[0].episodes[0].episode,0);
    assert.equal(title.releases[0].episodes[0].embed,'https://ashdi.vip/vod/3306');
});
test('real HDVB nested playlists retain all four seasons and distinct Ukrainian voices',()=>{
    const entries=api.playerEntries(fixture('hdvb-from.html'),{type:'tv',season:1,voice:'Українська'});
    assert.equal(entries.length,60);
    assert.deepEqual([...new Set(entries.map(e=>e.season))],[1,2,3,4]);
    assert.deepEqual([...new Set(entries.map(e=>e.voice))],['HDrezka Studio','BaibaKoTV','Двохгол. зак.']);
    assert.equal(entries.filter(e=>e.season===2 && e.episode===1).length,2);
    assert.ok(entries.every(e=>api.mediaURL(e.master)));
});
test('nested player folders retain Ukrainian and English audio in voice-first order',()=>{
    const tree=[{title:'Український дубляж',folder:[{title:'Сезон 2',folder:[{title:'Серія 7',file:masterURL}]}]},{title:'English',folder:[{title:'Season 1',folder:[{title:'Episode 1',file:masterURL}]}]}];
    const entries=api.playerEntries('new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})',{type:'tv'});
    assert.equal(entries.length,2); assert.equal(entries[1].audioLanguage,'en'); assert.equal(entries[1].season,1); assert.equal(entries[0].season,2); assert.equal(entries[0].episode,7);
    assert.equal(entries[0].voice,'Український дубляж');
});
test('matching rejects remakes, other titles and a movie/series mismatch',()=>{
    assert.equal(api.sameTitle(hailCard,{title:'Інша назва',year:2026,type:'movie'},true),false);
    assert.equal(api.sameTitle(hailCard,{title:'Проєкт Аве Марія',year:2005,type:'movie'},true),false);
    assert.equal(api.sameTitle(hailCard,{title:'Проєкт Аве Марія',year:2026,type:'tv'},true),false);
    assert.equal(api.sameTitle(fromCard,{title:'Ззовні 4 сезон',originalTitle:'From 4 season',year:2026,season:4,type:'tv'},true),true);
});
function multiSourceEnvironment(series=false, intercept) {
    return environment({respond(req){
        if(intercept && intercept(req)) return;
        req.status=200;
        if(req.url.includes('catalog.json')) req.responseText=JSON.stringify(catalog);
        else if(req.url===uaserials.origin+'/') req.responseText=fixture(series?'uaserials-search.html':'uaserials-hail-search.html');
        else if(req.url===(series?fromSource:hailSource)) req.responseText=fixture(series?'uaserials-from.html':'uaserials-hail.html');
        else if(req.url.startsWith('https://hdvbua.pro/embed/')) req.responseText=fixture(series?'hdvb-from.html':'hdvb-hail.html');
        else if(req.url.includes('hdvbua.pro/') && req.url.endsWith('index.m3u8')) req.responseText=masterHTML.replace('2160/','720/').replace('3840x1600','1280x720');
        else { req.status=403; req.responseText=''; }
        req.onload();
    }});
}
test('Hail Mary: card to actual UASerials source/quality to player, without intermediate menus',()=>{
    const env=multiSourceEnvironment(); env.instance.open(hailCard);
    const rows=env.state.menu.items.filter(i=>i.action==='play');
    assert.equal(rows.length,1); assert.ok(rows.every(i=>i.subtitle.includes('UASerials')));
    assert.ok(env.state.menu.items.some(i=>i.action==='quality' && i.title.includes('Найкраща')));
    assert.ok(!env.state.menu.items.some(i=>/Знайти|індекс|діагностика/i.test(i.title)));
    env.state.play('1080p'); assert.equal(env.state.played.card.id,hailCard.id);
    assert.ok(env.state.played.url.includes('hdvbua.pro')); assert.equal(env.state.playerReturn,'full_start');
});
test('From: changing season/episode selects the matching stream and voice',()=>{
    const env=multiSourceEnvironment(true);env.instance.open(fromCard);
    env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);env.state.choose(i=>i.value===3);
    env.state.play('1080p',i=>i.release.voice==='BaibaKoTV');
    assert.equal(env.state.played.season,2);assert.equal(env.state.played.episode,3);
    assert.ok(env.state.played.url.includes('from.s02e03.baibako'));assert.equal(env.state.played.voice_name,'BaibaKoTV');
    assert.ok(env.state.playlist.length>1);assert.ok(env.state.playlist.some(item=>typeof item.url==='function'));
});
test('unavailable player status is retained in provider diagnostics',()=>{
    const env=multiSourceEnvironment(false,req=>{
        if(req.url.startsWith('https://hdvbua.pro/embed/')) {req.status=404;req.onload();return true;}
    });
    env.instance.open(hailCard);
    assert.ok(!env.state.menu.items.some(i=>i.action==='play'));
    assert.ok(env.state.storage.faborn_ukr_source_status.includes('UASerials: HTTP 404'));
});
test('refresh keeps the chosen voice when a title offers multiple embedded players',()=>{
    const master=api.playerEntries(fixture('hdvb-hail.html'),{type:'movie',voice:'Українська'})[0].master;
    const tree=[{title:'Дубляж',file:master},{title:'Багатоголосий',file:master}];
    const env=multiSourceEnvironment(false,req=>{
        if(req.url===hailSource) req.responseText=fixture('uaserials-hail.html')+'<iframe data-src="https://hdvbua.pro/embed/1011709/b0c42c552"></iframe>';
        else if(req.url.startsWith('https://hdvbua.pro/embed/')) req.responseText='new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})';
        else return false;
        req.status=200;req.onload();return true;
    });
    env.instance.open(hailCard);env.state.play('1080p',i=>i.release.voice==='Багатоголосий · плеєр 2');
    env.state.fireTimer(45000);env.state.choose(i=>i.action==='retry');
    assert.equal(env.state.played.voice_name,'Багатоголосий · плеєр 2');
    assert.equal(env.state.requests.filter(r=>r.url==='https://hdvbua.pro/embed/1011709/b0c42c552').length,2);
});

function groupedEnvironment() {
    const env=environment(), title=JSON.parse(JSON.stringify(catalog.titles[0])), seed=title.releases[0];
    title.releases=['HDrezka Studio','BaibaKoTV','Український дубляж'].flatMap((voice,index)=>['uakino','kinoukr'].map(source=>{
        const r=JSON.parse(JSON.stringify(seed));r.id=source+'-'+index;r.source=source;r.voice=voice;
        r.episodes.forEach((e,n)=>{e.id=r.id+'-'+n;});return r;
    }));
    env.state.catalog={schema:1,titles:[title]};
    env.instance.open({title:title.title,original_title:title.originalTitle,release_date:title.year+'-01-01'});
    return env;
}
test('24 stream variants become three translations and an independent quality selector',()=>{
    const {state}=groupedEnvironment();
    assert.equal(state.menu.items.length,7);
    assert.equal(state.menu.items.filter(i=>i.action==='kinostatus').length,1);
    assert.equal(state.menu.items.filter(i=>i.action==='sources').length,3);
    state.choose(i=>i.action==='quality');
    assert.deepEqual(state.menu.items.map(i=>i.value),['best','2160p','1080p','720p','480p']);
    state.choose(i=>i.value==='720p');
    assert.equal(state.menu.items.filter(i=>i.group).length,3);
    state.choose(i=>i.title==='UA · BaibaKoTV');
    assert.deepEqual(state.menu.items.map(i=>i.title),['UAKino','KinoUkr']);
    assert.ok(state.menu.items.every(i=>i.value==='720p' && i.release.voice==='BaibaKoTV'));
    state.choose(i=>i.release.source==='kinoukr');
    assert.equal(state.played.voice_name,'BaibaKoTV');assert.ok(state.played.url.includes('/720/'));
});
test('quality and source submenus return to their translation and finally restore the card',()=>{
    const {state}=groupedEnvironment(); const requests=state.requests.length;
    state.choose(i=>i.action==='quality');state.menu.onBack();
    state.choose(i=>i.title==='UA · BaibaKoTV');state.menu.onBack();
    assert.equal(state.menu.items.find(i=>i.selected).title,'UA · BaibaKoTV');
    assert.equal(state.requests.length,requests,'Grouping must not repeat the source search');
    state.menu.onBack();assert.equal(state.controller,'full_start');assert.equal(state.menu,null);
});
test('quality choice persists across cards and single-source translations launch directly',()=>{
    const env=multiSourceEnvironment();env.instance.open(hailCard);
    env.state.choose(i=>i.action==='quality');env.state.choose(i=>i.value==='720p');env.state.menu.onBack();
    env.instance.open(hailCard);
    const row=env.state.menu.items.find(i=>i.group);
    assert.equal(row.action,'play');assert.equal(row.value,'720p');
    env.state.choose(i=>i===row);assert.ok(env.state.played.url.includes('/720/'));
    assert.equal(env.state.playerReturn,'full_start');
});
test('a quality missing from a new title falls back without inventing streams',()=>{
    const env=multiSourceEnvironment();env.state.storage.faborn_ukr_quality='2160p';env.instance.open(hailCard);
    assert.equal(env.state.menu.items.find(i=>i.group).value,'1080p');
    env.state.choose(i=>i.action==='quality');assert.ok(!env.state.menu.items.some(i=>i.value==='2160p'));
    env.state.menu.onBack();env.state.menu.onBack();env.state.storage.faborn_ukr_quality='360p';env.instance.open(hailCard);
    assert.equal(env.state.menu.items.find(i=>i.group).value,'720p');
});

// The presentation preferences must remain separate from Lampa's player/theme settings.
test('appearance settings expose both layouts, fallback, reversible global theme and six accents', () => {
    const {state} = environment();
    const param = key => state.params.find(p => p.param.name === 'faborn_ukr_' + key);
    assert.deepEqual(Object.keys(param('layout').param.values), ['panel', 'cinema', 'classic']);
    assert.equal(param('layout').param.default, 'panel');
    assert.deepEqual(param('studios').param.values, {on:'Показувати',off:'Приховати'});
    assert.equal(param('studios').param.default, 'on');
    assert.equal(typeof param('studios').onChange, 'function');
    assert.deepEqual(Object.keys(param('feed').param.values), ['compact','native','off']);
    assert.equal(param('feed').param.default, 'compact');
    assert.deepEqual(Object.keys(param('screensaver_style').param.values).sort(), require('../lib/faborn-screensaver')({},{}).styles().concat('random').sort());
    assert.deepEqual(Object.keys(param('screensaver_clock').param.values), ['compact','large','off']);
    assert.deepEqual(Object.keys(param('theme').param.values), ['on', 'ios', 'off']);
    assert.equal(Object.keys(param('accent').param.values).length, 6);
    assert.equal(typeof param('theme').onChange, 'function');
    assert.equal(typeof param('accent').onChange, 'function');
    assert.equal(Object.keys(state.storage).filter(k => !k.startsWith('faborn_ukr_')).length, 0);
});

test('player glass opacity is saved independently from iOS menu opacity',()=>{
 const nodes={},env=environment({jQuery:()=>({length:0,append(){return this;},toggleClass(){return this;}}),document:{createElement(){return {};},getElementById(id){return nodes[id];},getElementsByTagName(){return [];},body:{appendChild(n){nodes[n.id]=n;}}}});
 const change=(key,value)=>{env.state.storage['faborn_ukr_'+key]=value;env.state.params.find(p=>p.param.name==='faborn_ukr_'+key).onChange(value);};
 const styles=selector=>nodes['faborn-ukr-theme'].textContent.split('}').filter(rule=>rule.split('{')[0].split(',').includes('body.faborn-glass '+selector)).join('}');
 change('theme','ios');const player=styles('.player-panel__body');change('glass_transparency','max');
 assert.equal(styles('.player-panel__body'),player);const menu=styles('.settings__content');
 change('player_transparency','max');assert.notEqual(styles('.player-panel__body'),player);assert.equal(styles('.settings__content'),menu);
 change('glass_transparency','solid');assert.match(styles('.player-panel__body'),/rgba\(10,18,30,0.56\)/);
 change('player_transparency','solid');assert.match(styles('.player-panel__body'),/rgba\(10,18,30,1\)/);
 assert.equal(env.state.storage.faborn_ukr_glass_transparency,'solid');assert.equal(env.state.storage.faborn_ukr_player_transparency,'solid');
 change('theme','off');assert.equal(nodes['faborn-ukr-theme'].textContent,'');change('theme','ios');assert.match(styles('.player-panel__body'),/rgba\(10,18,30,1\)/);
});
test('iOS activates from classic, persists across layouts, and can be completely removed', () => {
    const nodes = {}, classes = new Set();
    const jq = () => ({length: 0, append() {return this;}, toggleClass(name,enabled) {if(enabled)classes.add(name);else classes.delete(name);return this;}});
    const env = environment({jQuery:jq,document:{
        createElement() {return {};}, getElementById(id) {return nodes[id];},
        getElementsByTagName() {return [];}, body:{appendChild(node) {nodes[node.id]=node;}}
    }});
    const {state} = env;
    const param = key => state.params.find(p=>p.param.name==='faborn_ukr_'+key);
    const change = (key,value) => {state.storage['faborn_ukr_'+key]=value;param(key).onChange(value);};
    let refreshed=0;env.root.Lampa.Settings={update(){refreshed++;}};
    change('accent','lagoon');
    change('layout','classic');
    change('theme','ios');
    assert.equal(state.storage.faborn_ukr_layout,'panel');
    assert.equal(refreshed,1);
    assert.ok(classes.has('faborn-glass'));
    assert.ok(nodes['faborn-ukr-theme'].textContent.length>0);
    const glassStyles=nodes['faborn-ukr-theme'].textContent;
    change('layout','cinema');
    assert.ok(classes.has('faborn-glass'));
    change('layout','classic');
    assert.equal(classes.size,0);
    assert.equal(nodes['faborn-ukr-ui'].textContent,'');
    assert.equal(nodes['faborn-ukr-theme'].textContent,'');
    change('layout','cinema');
    assert.equal(nodes['faborn-ukr-theme'].textContent,glassStyles);
    change('theme','off');
    assert.equal(classes.size,0);
    assert.equal(nodes['faborn-ukr-theme'].textContent,'');
    change('theme','on');
    assert.ok(classes.has('faborn-theme'));
    assert.ok(!classes.has('faborn-glass'));
    assert.ok(!nodes['faborn-ukr-theme'].textContent.includes('faborn-glass'));
    assert.equal(state.storage.faborn_ukr_accent,'lagoon');
    assert.equal(state.controller,'full_start');
    assert.equal(Object.keys(state.storage).filter(k=>!k.startsWith('faborn_ukr_')).length,0);
});

const kinoFixture=require('./fixtures/kinobase-protocol');
const kinoReader=require('../lib/kinobase');
const kinoMovie={id:280,title:'Термінатор 2: Судний день',original_title:'Terminator 2: Judgment Day',original_language:'en',release_date:'1991-07-03'};
const kinoSeries={id:1668,name:'Друзі',original_name:'Friends',original_language:'en',first_air_date:'1994-09-22'};
function kinoEnvironment(options={}) {
    const data=kinoFixture(),stateData={version:1,missingUA:false,pending:null};
    const file=(s=0,e=0)=>['720','1080','2160'].map(q=>'['+q+'p]'+['Paramount (Русский)','1+1 (Украинский)'].concat(options.english?['Оригинал']:[]).filter(v=>!stateData.missingEN||v!=='Оригинал').filter(v=>!stateData.missingUA||!v.includes('1+1')).map((voice,i)=>'{'+voice+'}https://primary.redcdn.org/'+q+'/s'+s+'e'+e+'/v'+stateData.version+'/master-v1-a'+(i+1)+'.m3u8 or https://mirror.threnet.xyz/'+q+'/s'+s+'e'+e+'/v'+stateData.version+'/master-v1-a'+(i+1)+'.m3u8').join(';')).join(',');
    function respond(req){
        req.status=200;
        if(options.failEndpoint && (!req.native || options.native404) && req.url.startsWith('https://kinobase.org'+options.failEndpoint)) {
            req.status=404;req.responseText='';req.onload();return;
        }
        if(req.url.includes('catalog.json')) req.responseText=JSON.stringify({schema:1,titles:[]});
        else if(req.url.startsWith('https://kinobase.org/search?')) req.responseText=fixture('kinobase-search.html')+(options.secondCandidate?'<a href="/film/208162-documentary" title="Терминатор 2: документальний фільм (1991)">Документальний</a>':'');
        else if(req.url.startsWith('https://kinobase.org/film/')) req.responseText=fixture('kinobase-movie.html');
        else if(req.url.startsWith('https://kinobase.org/serial/')) req.responseText=fixture('kinobase-series.html');
        else if(req.url.startsWith('https://kinobase.org/static/')) req.responseText=data.source;
        else if(req.url.startsWith('https://kinobase.org/user_data?')) {
            req.responseText=data.encode(['AnonymousToken12345','1900000000','','','1'],true);
            if(options.delayUser){stateData.pending=req;return;}
        }
        else if(req.url.startsWith('https://kinobase.org/vod/')) {
            const parts=options.playlist ? ['p',JSON.stringify(options.playlist(file,stateData))] : options.series?['p',JSON.stringify([1,2].map(s=>({title:s+' сезон',folder:[1,2].map(e=>({title:e+' серия',file:file(s,e)}))})))]:['f',file()];
            req.responseText=data.encode(parts,false);
            if(options.delayVod){stateData.pending=req;return;}
        } else if(/https:\/\/(?:primary.redcdn.org|mirror.threnet.xyz)\//.test(req.url)) {
            const q=+new URL(req.url).pathname.split('/')[1],width=({'2160':3840,'1080':1920,'720':1280})[q];
            req.responseText='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="track",URI="audio.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION='+width+'x'+q+',AUDIO="track"\nvideo.m3u8';
            if(options.failPrimary&&req.url.includes('primary.redcdn.org'))req.status=404;
            if(options.delayManifest) { (stateData.manifests ||= []).push(req); return; }
        } else {req.status=403;req.responseText='';}
        req.onload();
    }
    const env=environment({respond,panelEvents:options.panelEvents});
    env.root.FabornKinoBase=kinoReader;env.kino=stateData;
    stateData.nativeRequests=[];stateData.clients=0;stateData.cancels=0;
    if(options.native) env.root.FabornKinoSession=()=>{
        stateData.clients++;
        return {request(url,callback){
            const req={url,native:true,onload(){callback(this.status===200?null:new Error('HTTP '+this.status),this.responseText,this.status);},abort(){this.aborted=true;}};
            stateData.nativeRequests.push(req);
            if(options.nativeError) callback(new Error(options.nativeError),'',0);
            else if(!options.delayNative) respond(req);
            return req;
        },cancel(){stateData.cancels++;}};
    };
    stateData.respond=respond;
    return env;
}
test('session 404 reopens the title in a Samsung session then lists and plays English directly',()=>{
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,english:true});env.instance.open(kinoMovie);env.state.language('all');
 assert.match(env.kino.nativeRequests[0].url,/\/film\//);
 assert.equal(env.kino.nativeRequests.filter(r=>r.url.includes('/user_data?')).length,1);
 assert.ok(env.kino.nativeRequests.some(r=>r.url.includes('/vod/')));
 assert.deepEqual(env.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['uk','en','ru']);
 assert.ok(!env.state.menu.items.some(i=>i.action==='kinostatus'));
 env.state.play('2160p',i=>i.release.audioLanguage==='en');
 assert.match(env.state.played.url,/^https:\/\/primary.redcdn.org\/2160\//);
 assert.ok(!env.kino.nativeRequests.some(r=>r.url.includes('.m3u8')));
 assert.match(env.state.storage.faborn_ukr_kino_transport,/Samsung/);
});
test('working direct KinoBase never starts a native session',()=>{
 const env=kinoEnvironment({native:true});env.instance.open(kinoMovie);
 assert.equal(env.kino.clients,0);assert.equal(env.kino.nativeRequests.length,0);
 assert.ok(env.state.menu.items.some(i=>i.group));
});
test('non-session 404 and explicit direct setting never start native fallback',()=>{
 for(const endpoint of ['/film/208161-','/vod/208161?','/user_data?']){
  const env=kinoEnvironment({failEndpoint:endpoint,native:true});
  if(endpoint==='/user_data?')env.state.storage.faborn_ukr_kino_session='direct';
  env.instance.open(kinoMovie);assert.equal(env.kino.clients,0);
  assert.ok(env.state.menu.items.some(i=>i.action==='kinostatus'));
 }
});
test('native session 404 is attempted once and stays visible with working Back navigation',()=>{
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,native404:true});env.instance.open(kinoMovie);
 assert.equal(env.kino.nativeRequests.filter(r=>r.url.includes('/user_data?')).length,1);
 env.state.choose(i=>i.action==='kinostatus');assert.match(env.state.menu.items[0].title,/user_data/);
 env.state.menu.onBack();assert.ok(env.state.menu.items.some(i=>i.action==='kinostatus'));
 env.state.menu.onBack();assert.equal(env.state.controller,'full_start');assert.equal(env.state.menu,null);
});
test('missing Samsung API is explained in the source list',()=>{
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,nativeError:'SOCKETS: мережевий API Samsung недоступний'});env.instance.open(kinoMovie);
 assert.match(env.state.menu.items.find(i=>i.action==='kinostatus').subtitle,/SOCKETS/);
 assert.equal(env.state.played,null);
});
test('Back during fallback cancels the request and a late native reply cannot reopen sources',()=>{
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,delayNative:true});env.instance.open(kinoMovie);
 const req=env.kino.nativeRequests[0];env.state.menu.onBack();
 assert.ok(req.aborted);assert.ok(env.kino.cancels);
 env.kino.respond(req);assert.equal(env.state.menu,null);assert.equal(env.state.controller,'full_start');
 assert.equal(env.kino.nativeRequests.length,1);
});
test('native fallback deadline keeps a visible reason instead of a stale waiting label',()=>{
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,delayNative:true});env.instance.open(kinoMovie);
 env.state.fireTimer(24000);env.state.fireTimer(60000);
 assert.match(env.state.menu.items.find(i=>i.action==='kinostatus').subtitle,/Час очікування/);
 assert.ok(env.kino.nativeRequests[0].aborted);
});
test('expired native series playlist refresh preserves English, season, episode and quality',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const env=kinoEnvironment({failEndpoint:'/user_data?',native:true,series:true,english:true});env.instance.open(kinoSeries);env.state.language('all');
 env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);env.state.choose(i=>i.value===2);
 env.kino.version=2;now+=61000;env.state.play('1080p',i=>i.release.audioLanguage==='en');
 assert.match(env.state.played.url,/\/1080\/s2e2\/v2\/master-v1-a3.m3u8$/);
 assert.equal(env.kino.nativeRequests.filter(r=>r.url.includes('/vod/')).length,2);
});
test('KinoBase is searched permanently by original title and launches selected RU 4K with audio',()=>{
    const env=kinoEnvironment();env.instance.open(kinoMovie);env.state.language('all');
    const rows=env.state.menu.items.filter(i=>i.group);
    assert.equal(rows.length,2);assert.ok(rows[0].title.startsWith('UA · '));assert.ok(rows[1].title.startsWith('🐷 RU · '));
    assert.ok(env.state.requests.some(r=>r.url.includes('/search?query=Terminator%202')));
    assert.ok(env.state.requests.some(r=>r.url.includes('/vod/208161?')));
    assert.ok(!env.state.requests.some(r=>r.url.includes('/vod/20208161')));
    assert.ok(env.state.requests.filter(r=>r.url.startsWith('https://kinobase.org/')).every(r=>r.withCredentials===true));
    env.state.play('2160p',i=>i.release.audioLanguage==='ru');
    assert.ok(env.state.played.url.endsWith('/master-v1-a1.m3u8'));assert.equal(env.state.played.voice_name,'Paramount (Русский)');
    assert.equal(env.state.played.quality['2160p'],env.state.played.url);assert.equal(env.state.playerReturn,'full_start');
});
test('KinoBase completes the first player session before another title can replace its cookie',()=>{
 const env=kinoEnvironment({secondCandidate:true,delayUser:true});env.instance.open(kinoMovie);
 assert.ok(env.kino.pending);assert.equal(env.state.requests.filter(r=>r.url.startsWith('https://kinobase.org/film/')).length,1);
 env.kino.pending.onload();
 assert.equal(env.state.requests.filter(r=>r.url.startsWith('https://kinobase.org/film/')).length,2);
 assert.ok(env.state.requests.some(r=>r.url.includes('/vod/208161?')));
 assert.ok(env.state.menu.items.some(i=>i.group&&i.group.language==='uk'));
});
for(const endpoint of ['/search?', '/film/208161-', '/static/js/hs.js?', '/user_data?', '/vod/208161?']) test('KinoBase 404 diagnostics identify the failed endpoint: '+endpoint,()=>{
 const env=kinoEnvironment({failEndpoint:endpoint});env.instance.open(kinoMovie);
 const status=env.state.storage.faborn_ukr_source_status.find(s=>s.startsWith('KinoBase:'));
 assert.ok(status.includes('HTTP 404'),status);
 assert.ok(status.includes(endpoint.split('?')[0]),status);
 assert.equal(status.includes('можливе блокування cookie'),endpoint==='/user_data?',status);
 assert.ok(!/[?&](cuid|chk|st|identifier)=/.test(status));
 assert.ok(!env.state.menu.items.some(i=>i.group));assert.equal(env.state.played,null);
});
test('a second unrelated KinoBase candidate cannot erase the player-session 404',()=>{
 const env=kinoEnvironment({secondCandidate:true,failEndpoint:'/user_data?'});env.instance.open(kinoMovie);
 const status=env.state.storage.faborn_ukr_source_status.find(s=>s.startsWith('KinoBase:'));
 assert.ok(status.includes('/user_data'),status);assert.ok(status.includes('HTTP 404'),status);
 assert.equal(env.state.requests.filter(r=>r.url.startsWith('https://kinobase.org/search?')).length,1);
});
test('KinoBase seasons, episodes and UA audio survive switching and URL renewal',t=>{
    let now=Date.now();t.mock.method(Date,'now',()=>now);
    const env=kinoEnvironment({series:true});env.instance.open(kinoSeries);
    env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);env.state.choose(i=>i.value===2);
    env.kino.version=2;now+=61000;
    env.state.play('1080p',i=>i.release.audioLanguage==='uk');
    assert.match(env.state.played.url,/\/1080\/s2e2\/v2\/master-v1-a2.m3u8$/);
    assert.equal(env.state.played.episode,2);assert.equal(env.state.played.season,2);
    assert.equal(env.state.requests.filter(r=>r.url.includes('/vod/246004?')).length,2);
});
test('an unavailable mirror retries the same quality, episode and voice',()=>{
    const env=kinoEnvironment({failPrimary:true});env.instance.open(kinoMovie);
    env.state.play('720p',i=>i.release.audioLanguage==='uk');
    assert.match(env.state.played.url,/^https:\/\/mirror.threnet.xyz\/720\/s0e0\/v1\/master-v1-a2.m3u8$/);
});
test('a vanished Ukrainian voice is never silently replaced by Russian on refresh',t=>{
    let now=Date.now();t.mock.method(Date,'now',()=>now);
    const env=kinoEnvironment();env.instance.open(kinoMovie);env.kino.missingUA=true;now+=61000;
    env.state.play('1080p',i=>i.release.audioLanguage==='uk');
    assert.equal(env.state.played,null);assert.match(env.state.notices.join(' '),/Вибране озвучення/);
});
test('closing during the KinoBase playlist request ignores its late response and restores navigation',()=>{
    const env=kinoEnvironment({delayVod:true});env.instance.open(kinoMovie);
    assert.ok(env.kino.pending);env.state.menu.onBack();assert.equal(env.kino.pending.aborted,true);
    env.kino.pending.onload();assert.equal(env.state.menu,null);assert.equal(env.state.controller,'full_start');
});
test('KinoBase original metadata is checked before requesting streams',()=>{
    const env=kinoEnvironment();env.instance.open({...kinoMovie,title:'Чужий фільм',original_title:'Another Film'});
    assert.ok(!env.state.requests.some(r=>r.url.includes('/user_data?')));assert.ok(!env.state.menu.items.some(i=>i.group));
});
test('English-only source metadata is accepted and not relabeled Ukrainian',()=>{
 const title=api.parseSource(movieHTML.replace('Український дубляж','English'),djangoURL);
 assert.equal(title.audioLanguage,'en');assert.equal(title.voice,'English');
 const html=fixture('uaserials-hail.html').replace('content="uk-UA"','content="en-US"');
 assert.equal(api.providerPage(html,hailSource).audioLanguage,'en');
});
test('KinoBase English original is shown between UA/RU and keeps 4K audio on handoff',()=>{
 const env=kinoEnvironment({english:true});env.instance.open(kinoMovie);env.state.language('all');
 assert.deepEqual(env.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['uk','en','ru']);
 assert.ok(env.state.menu.items.some(i=>i.title==='EN · Оригинал'));
 env.state.play('2160p',i=>i.release.audioLanguage==='en');
 assert.match(env.state.played.url,/\/2160\/s0e0\/v1\/master-v1-a3.m3u8$/);assert.equal(env.state.played.voice_name,'Оригинал');
});
test('English original survives season, episode, quality and signed URL renewal',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const env=kinoEnvironment({series:true,english:true});env.instance.open(kinoSeries);env.state.language('all');
 env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);env.state.choose(i=>i.value===2);
 env.kino.version=2;now+=61000;env.state.play('1080p',i=>i.release.audioLanguage==='en');
 assert.match(env.state.played.url,/\/1080\/s2e2\/v2\/master-v1-a3.m3u8$/);assert.equal(env.state.played.season,2);assert.equal(env.state.played.episode,2);
});
test('a removed English original is never replaced with another language',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const env=kinoEnvironment({english:true});env.instance.open(kinoMovie);env.state.language('all');env.kino.missingEN=true;now+=61000;
 env.state.play('1080p',i=>i.release.audioLanguage==='en');assert.equal(env.state.played,null);assert.match(env.state.notices.join(' '),/Вибране озвучення/);
});
test('Playerjs cannot switch an English choice to the sole remaining Russian track',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);let removed=false;
 const env=multiSourceEnvironment(false,req=>{
  if(req.url.startsWith('https://hdvbua.pro/embed/')){
   const tree=[{title:removed?'Русский':'Original (English)',file:masterURL}];
   req.status=200;req.responseText='new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})';req.onload();return true;
  }
  if(req.url===masterURL){req.status=200;req.responseText=masterHTML;req.onload();return true;}
 });
 env.instance.open({...hailCard,original_language:'en'});env.state.language('all');assert.ok(env.state.menu.items.some(i=>i.group&&i.group.language==='en'));
 removed=true;now+=61000;env.state.play('1080p',i=>i.release.audioLanguage==='en');
 assert.equal(env.state.played,null);assert.match(env.state.notices.join(' '),/озвучення не знайдено/);
});

test('real playback saves every episode, standard Lampa marks and history; browsing keeps the last watched episode',()=>{
 const env=kinoEnvironment({series:true});env.instance.open(kinoSeries);env.state.language('all');
 env.state.play('1080p',i=>i.release.audioLanguage==='uk');
 assert.equal(env.state.history.length,0);
 env.state.progress(800,2400);env.root.Lampa.Player.close();
 assert.equal(env.state.history.length,1);assert.equal(env.state.history[0].folder,'history');assert.equal(env.state.history[0].card.id,1668);
 assert.equal(env.state.timelines['11Friends'].time,800);
 assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].time,800);
 env.instance.open(kinoSeries);
 assert.ok(env.state.menu.items.some(i=>i.action==='last'&&i.title.includes('S1E1')));
 env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===1);
 assert.match(env.state.menu.items.find(i=>i.value===1).subtitle,/13:20/);
 assert.equal(env.state.menu.items.find(i=>i.value===2).subtitle,'Ще не дивилися');
 env.state.choose(i=>i.value===2);
 assert.equal(env.state.storage['faborn_ukr_position_tmdb-tv-1668'].episode,1);
 env.state.play('1080p',i=>i.release.audioLanguage==='ru');env.state.progress(2300,2400);env.state.videoEvents.ended();env.root.Lampa.Player.close();
 assert.equal(env.state.timelines['12Friends'].percent,100);
 assert.equal(env.state.timelines['11Friends'].time,800);
 env.instance.open(kinoSeries);env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===1);
 assert.equal(env.state.menu.items.find(i=>i.value===2).subtitle,'Переглянуто');
 assert.match(env.state.menu.items.find(i=>i.value===1).subtitle,/13:20/);
});
test('failure or an unanswered resume prompt never records a new watch',()=>{
 const env=kinoEnvironment();env.state.timelines['faborn|tmdb-movie-280|0|0']={time:100,duration:7000,percent:1};env.instance.open(kinoMovie);env.state.play('1080p');env.root.Lampa.Player.close();
 assert.equal(env.state.history.length,0);assert.equal(env.state.storage['faborn_ukr_position_tmdb-movie-280'],undefined);
 env.instance.open(kinoMovie);env.state.play('1080p');env.state.played.timeline.waiting_for_user=true;env.state.progress(100,7000);env.root.Lampa.Player.close();assert.equal(env.state.history.length,0);
});
test('newer standard Lampa progress is read without losing the beta.9 resume point',()=>{
 const env=kinoEnvironment({series:true});
 env.state.timelines['faborn|tmdb-tv-1668|1|1']={time:600,duration:2400,percent:25,updated:100};
 env.state.timelines['11Friends']={time:900,duration:2400,percent:38,updated:200};
 env.instance.open(kinoSeries);env.state.play('1080p');assert.equal(env.state.played.timeline.time,900);
 env.root.Lampa.Player.close();env.state.timelines['11Friends']={time:100,duration:2400,percent:4,updated:50};
 env.instance.open(kinoSeries);env.state.play('1080p');assert.equal(env.state.played.timeline.time,600);
});
test('episode metadata enriches titles but cannot reopen a closed episode window',()=>{
 const env=kinoEnvironment({series:true});let callbacks=[];
 env.root.Lampa.Api={sources:{tmdb:{get(url,params,success,failure){callbacks.push({url,success,failure});}}}};
 env.instance.open(kinoSeries);env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===1);
 assert.equal(callbacks[0].url,'tv/1668/season/1');
 callbacks[0].success({episodes:[{season_number:1,episode_number:1,name:'Пілот',still_path:'/photo.jpg',overview:'Короткий опис'}]});
 assert.match(env.state.menu.items[0].title,/Пілот/);
 env.state.choose(i=>i.value===2);env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);
 assert.equal(callbacks[1].url,'tv/1668/season/2');env.state.menu.onBack();env.state.menu.onBack();env.state.menu.onBack();
 callbacks[1].success({episodes:[{episode_number:1,name:'Запізніла відповідь'}]});
 assert.equal(env.state.menu,null);assert.equal(env.state.controller,'full_start');
});
test('unavailable metadata does not block episode selection or playback',()=>{
 const env=kinoEnvironment({series:true});env.root.Lampa.Api={sources:{tmdb:{get(){}}}};
 env.instance.open(kinoSeries);env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===1);env.state.fireTimer(6000);
 assert.ok(env.state.menu.items.some(i=>i.value===2));env.state.choose(i=>i.value===2);env.state.play('1080p');assert.equal(env.state.played.episode,2);
});
test('empty external subtitles are omitted so Tizen can expose native tracks',()=>{
 const env=kinoEnvironment();env.instance.open(kinoMovie);env.state.play('1080p');assert.ok(!Object.hasOwn(env.state.played,'subtitles'));
});
test('Playerjs subtitle inheritance is per folder and explicit episode tracks override it',()=>{
 const uk='[Українські]//ashdi.vip/sub/uk.vtt',en='[English]https://ashdi.vip/sub/en.srt';
 const tree=[{title:'Season 1',subtitle:uk,folder:[{title:'Episode 1',file:masterURL},{title:'Episode 2',file:masterURL,subtitle:en},{title:'Episode 3',file:masterURL,subtitle:''}]}];
 const entries=api.playerEntries('new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})',{type:'tv',voice:'Українська'});
 assert.equal(entries[0].subtitles[0].url,'https://ashdi.vip/sub/uk.vtt');assert.equal(entries[1].subtitles[0].language,'en');assert.equal(entries[2].subtitles.length,0);
});
test('structured subtitles are normalized and reject unsafe URLs',()=>{
 const tree=[{file:masterURL,subtitle:[{label:'English',url:'https://ashdi.vip/en.srt'},{label:'duplicate',url:'https://ashdi.vip/en.srt'},{label:'bad',url:'javascript:alert(1)'}]}];
 const entries=api.playerEntries('new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})',{type:'movie',voice:'English'});
 assert.equal(entries[0].subtitles.length,1);assert.equal(entries[0].subtitles[0].language,'en');
});
test('HLS subtitle playlists stay attached when selecting a quality',()=>{
 const body='#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="subs.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,SUBTITLES="subs"\nvideo.m3u8';
 assert.deepEqual(api.parseMaster(body,masterURL),{'1080p':masterURL});
});

test('a video server soft 404 is diagnosed as unavailable, not as a Playerjs parsing error',()=>{
 assert.throws(()=>api.playerEntries('<html><title>404 Not Found</title><h1>404 Not Found</h1></html>',{}),/404: відео недоступне/);
});

function voicePlayer(env) {
 const {state,root}=env;
 state.nativeVideo={currentTime:510,duration:1440,paused:false,audioTracks:[],addEventListener(k,fn){state.nativeEvents[k]=fn;}};
 Object.assign(root.Lampa.PlayerVideo,{
  video(){return state.nativeVideo;},pause(){state.nativeVideo.paused=true;state.pauses=(state.pauses||0)+1;},
  play(){state.nativeVideo.paused=false;},destroy(){state.videoDestroyed=(state.videoDestroyed||0)+1;},
  url(url,change){state.changedURL=url;state.changeFlag=change;state.nativeVideo.currentTime=0;state.nativeVideo.paused=false;},
  to(time){state.seeked=time;state.nativeVideo.currentTime=time;},clearParamas(){}
 });
 root.Lampa.PlayerPanel={setTracks(rows){state.panelTracks=rows;},quality(q,url){state.panelQuality=q;},setTranslate(){}};
 return env;
}
function kinoConnectionError(state) {
 state.nativeEvents.error({error:'code [15] PLAYER_ERROR_CONNECTION_FAILED'});state.fireTimer(0);
}
test('a new movie launch clears a previous error and series diagnostic without S0E0',()=>{
 const env=kinoEnvironment({series:true}),{state}=env;
 env.instance.open(kinoSeries);state.play('1080p');state.nativeEvents.error({error:'PLAYER_ERROR_NOT_SUPPORTED_FORMAT'});state.fireTimer(0);
 assert.match(state.storage.faborn_ukr_autoplay_status,/S1E1/);
 assert.match(state.storage.faborn_ukr_last_error,/NOT_SUPPORTED/);
 env.instance.open(kinoMovie);state.play('2160p');
 assert.equal(state.storage.faborn_ukr_last_error,'');assert.equal(state.storage.faborn_ukr_autoplay_status,'');
 assert.match(state.storage.faborn_ukr_last_launch,/Термінатор.*2160p.*KinoBase/);
 assert.doesNotMatch(state.storage.faborn_ukr_last_launch,/S0E0/);
 assert.match(state.storage.faborn_ukr_stream_format,/3840x2160.*окреме аудіо/);
 state.params.find(p=>p.param.name==='faborn_ukr_diagnostic').onChange();
 assert.ok(!state.menu.items.some(row=>/NOT_SUPPORTED|S1E1/.test(row.title)));
});
test('KinoBase format diagnostics follow the selected quality and remove old startup errors',()=>{
 const panelEvents={},env=voicePlayer(kinoEnvironment({panelEvents})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p');state.videoEvents.loadeddata();
 const data=state.played;state.storage.faborn_ukr_last_error='previous failure';
 data.quality_switched='1080p';data.url=data.quality['1080p'];panelEvents.quality({name:'1080p',url:data.url});
 assert.equal(state.storage.faborn_ukr_last_error,'');assert.match(state.storage.faborn_ukr_last_launch,/1080p/);
 // A native quality switch has not fetched this manifest; do not label it using the old 4K metadata.
 assert.doesNotMatch(state.storage.faborn_ukr_stream_format,/3840x2160/);
 state.videoEvents.loadeddata();assert.match(state.storage.faborn_ukr_kino_playback,/1080p.*відтворення почалося/);env.root.Lampa.Player.close();assert.ok(state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: 1080p'));assert.equal(state.storage.faborn_ukr_quality,'1080p');
});
test('failed KinoBase startup does not retain a connecting status or override known mirror exhaustion',()=>{
 const env=kinoEnvironment(),{state}=env;env.root.webapis={avplay:{getState(){return 'IDLE';}}};env.instance.open(kinoMovie);state.play('2160p');state.fireTimer(45000);
 assert.match(state.storage.faborn_ukr_kino_playback,/не запустилося/);
 assert.match(state.storage.faborn_ukr_last_error,/45 секунд/);
 assert.equal(state.storage.faborn_ukr_avplay_state,'IDLE');
});
test('a different Faborn provider clears KinoBase format and host diagnostics',()=>{
 const env=environment(),{state}=env;
 Object.assign(state.storage,{faborn_ukr_kino_playback:'2160p · previous.redcdn.org',faborn_ukr_stream_format:'3840x2160',faborn_ukr_last_error:'old error'});
 filmQualityMenu(env);state.play('1080p');
 assert.equal(state.storage.faborn_ukr_kino_playback,'');assert.equal(state.storage.faborn_ukr_stream_format,'');assert.equal(state.storage.faborn_ukr_last_error,'');
});
test('device diagnostics use the model and Tizen version and tolerate unavailable platform APIs',()=>{
 const env=environment(),{state,root}=env;root.navigator={userAgent:'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5)'};
 root.webapis={avplay:{},productinfo:{getModel(){return 'QA-SAMSUNG-UHD';},isUdPanelSupported(){return true;}}};
 const diagnostic=()=>state.params.find(p=>p.param.name==='faborn_ukr_diagnostic').onChange();
 diagnostic();assert.ok(state.menu.items.some(row=>row.title==='Телевізор: QA-SAMSUNG-UHD · Tizen 6.5'));
 assert.ok(state.menu.items.some(row=>row.title==='Панель UHD: підтримується'));
 root.webapis.productinfo.getModel=()=>{throw new Error('SecurityError');};diagnostic();
 assert.ok(state.menu.items.some(row=>row.title==='Телевізор: Tizen 6.5'));
});
function legacyNative(env,options={}){
 const events=[],player={state:'IDLE',getState(){return this.state;},setStreamingProperty(name,value){
  assert.equal(this,player);events.push({name,value,state:this.state});if(options.propertyError)throw Object.assign(new Error('private URL must not be logged'),{name:'NotSupportedError'});
 },prepareAsync(ok,fail){assert.equal(this,player);events.push({prepare:true,ok,fail});return 'native-result';}};
 const original=player.prepareAsync;
 if(options.readOnly)Object.defineProperty(player,'prepareAsync',{value:original,writable:false});
 env.root.navigator={userAgent:'Mozilla/5.0 (SMART-TV; Tizen '+(options.version||'3.0')+')'};
 env.root.webapis={avplay:player,productinfo:{isUdPanelSupported(){return options.uhd!==false;}}};
 env.state.storage.faborn_ukr_legacy4k=options.enabled===false?'off':'on';
 return {player,original,events};
}
test('legacy UHD opts in only on old Tizen and configures IDLE before native preparation',()=>{
 for(const version of ['2.4','3.0','4.0']){
  const e=kinoEnvironment(),n=legacyNative(e,{version});e.instance.open(kinoMovie);e.state.play('2160p');
  const ok=()=>{},fail=()=>{};assert.notEqual(n.player.prepareAsync,n.original);
  assert.equal(n.player.prepareAsync(ok,fail),'native-result');assert.deepEqual(n.events,[{name:'SET_MODE_4K',value:'TRUE',state:'IDLE'},{prepare:true,ok,fail}]);
  assert.match(e.state.storage.faborn_ukr_legacy4k_status,/UHD-декодер увімкнено/);assert.equal(e.state.played.faborn_quality,'2160p');
  e.root.Lampa.Player.close();assert.equal(n.player.prepareAsync,n.original);
 }
});
test('legacy UHD leaves default, modern Tizen, unknown version and FHD panels unchanged',()=>{
 for(const options of [{enabled:false},{version:'5.0'},{version:'6.5'},{version:'unknown'},{uhd:false}]){
  const e=kinoEnvironment(),n=legacyNative(e,options);e.instance.open(kinoMovie);e.state.play('2160p');n.player.prepareAsync();
  assert.equal(n.player.prepareAsync,n.original);assert.equal(n.events.length,1);assert.equal(n.events[0].prepare,true);
 }
 const e=environment();assert.equal(e.state.params.find(p=>p.param.name==='faborn_ukr_legacy4k').param.default,'off');
});
test('legacy UHD observes native quality changes before plugin listeners without changing 1080p',()=>{
 const panelEvents={},e=voicePlayer(kinoEnvironment({panelEvents})),n=legacyNative(e);e.instance.open(kinoMovie);e.state.play('1080p');n.player.prepareAsync();assert.equal(n.events.length,1);
 const data=e.state.played;data.quality_switched='2160p';data.url=data.quality['2160p'];n.player.prepareAsync();
 assert.equal(n.events[1].name,'SET_MODE_4K');panelEvents.quality({name:'2160p',url:data.url});
 assert.match(e.state.storage.faborn_ukr_legacy4k_status,/UHD-декодер увімкнено/);
 data.quality_switched='1080p';data.url=data.quality['1080p'];n.player.prepareAsync();assert.equal(n.events.filter(r=>r.name).length,1);
 assert.match(e.state.storage.faborn_ukr_legacy4k_status,/Звичайний запуск · 1080p/);
});
test('legacy UHD property failures and read-only adapters retain ordinary native playback',()=>{
 for(const options of [{propertyError:true},{readOnly:true}]){
  const e=kinoEnvironment(),n=legacyNative(e,options);e.instance.open(kinoMovie);e.state.play('2160p');const ok=()=>{},fail=()=>{};
  assert.equal(n.player.prepareAsync(ok,fail),'native-result');assert.deepEqual(n.events.at(-1),{prepare:true,ok,fail});assert.equal(e.state.closed,undefined);
  assert.doesNotMatch(e.state.storage.faborn_ukr_legacy4k_status,/private URL/);
 }
 const e=kinoEnvironment(),n=legacyNative(e);n.player.state='PLAYING';e.instance.open(kinoMovie);e.state.play('2160p');n.player.prepareAsync();
 assert.equal(n.events.length,1);assert.match(e.state.storage.faborn_ukr_legacy4k_status,/не в IDLE/);
});
test('legacy UHD cannot affect a foreign player or remove a later extension wrapper',()=>{
 const e=kinoEnvironment(),n=legacyNative(e);e.instance.open(kinoMovie);e.state.play('2160p');const old=n.player.prepareAsync;
 const other=function(){return old.apply(this,arguments);};n.player.prepareAsync=other;e.root.Lampa.Player.play({url:'https://other.example/test.m3u8'});
 assert.equal(n.player.prepareAsync,other);n.player.prepareAsync();assert.equal(n.events.length,1);assert.equal(n.events[0].prepare,true);
});
test('legacy UHD is applied again for the same 4K mirror while keeping quality and playback position',()=>{
 const e=voicePlayer(kinoEnvironment({mirrors:true})),n=legacyNative(e);e.instance.open(kinoMovie);e.state.play('2160p');n.player.prepareAsync();
 kinoConnectionError(e.state);n.player.prepareAsync();assert.equal(n.events.filter(r=>r.name==='SET_MODE_4K').length,2);
 assert.equal(e.state.played.faborn_quality,'2160p');e.state.videoEvents.loadeddata();assert.equal(e.state.seeked,510);
});
test('KinoBase AVPlay failure retries the exact-quality alternate master inside the same player',()=>{
 const env=voicePlayer(kinoEnvironment({series:true,english:true})),{state}=env;
 state.timelines['faborn|tmdb-tv-1668|1|1']={time:510,duration:1440,percent:35};
 env.instance.open(kinoSeries);env.state.language('all');state.play('1080p',r=>r.release.audioLanguage==='en');
 const data=state.played,timeline=data.timeline,playlist=state.playlist;state.nativeVideo.currentTime=0;state.nativeVideo.paused=true;
 kinoConnectionError(state);
 assert.equal(state.played,data);assert.equal(data.timeline,timeline);assert.equal(state.playlist,playlist);
 assert.equal(state.closed,undefined);assert.equal(state.controller,'player');assert.equal(data.voice_name,'Оригинал');
 assert.match(state.changedURL,/^https:\/\/mirror.threnet.xyz\/1080\/s1e1\/v1\/master-v1-a3.m3u8$/);
 assert.equal(data.faborn_quality,'1080p');assert.equal(data.season,1);assert.equal(data.episode,1);assert.equal(timeline.stop_recording,true);
 state.videoEvents.loadeddata();assert.equal(state.seeked,510);assert.equal(state.nativeVideo.paused,true);assert.equal(timeline.stop_recording,undefined);
 assert.match(state.storage.faborn_ukr_kino_playback,/primary.redcdn.org → mirror.threnet.xyz.*відтворення почалося/);
 assert.ok(!state.storage.faborn_ukr_kino_playback.includes('/s1e1'));
});
test('duplicate Tizen errors and old-video handlers cannot exhaust the next mirror',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('2160p');
 const old=state.nativeEvents.error;old({error:15});state.videoEvents.error({error:15});state.fireTimer(0);state.fireTimer(0);
 old({error:15});assert.equal(state.videoDestroyed,1);assert.equal(state.closed,undefined);assert.match(state.changedURL,/mirror/);
});
test('KinoBase retry restores the quality map removed by Lampa for a single resolution',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('1080p');
 delete state.played.quality;kinoConnectionError(state);
 assert.equal(state.closed,undefined);assert.match(state.changedURL,/mirror/);assert.equal(state.played.quality['1080p'],state.changedURL);
});
test('KinoBase exhausts mirrors once then restores the normal retry and quality menu',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('1080p');
 kinoConnectionError(state);kinoConnectionError(state);
 assert.equal(state.videoDestroyed,1);assert.equal(state.closed,true);assert.equal(state.menu.title,'Відео не запустилося');
 assert.deepEqual(state.menu.items.map(r=>r.action),['retry','quality','release']);
 assert.match(state.storage.faborn_ukr_kino_playback,/адреси не відкрилися/);
});
test('closing the player before a queued connection error prevents any retry',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('1080p');
 state.nativeEvents.error({error:15});env.root.Lampa.Player.close();state.fireTimer(0);
 assert.equal(state.videoDestroyed,undefined);assert.equal(state.played,null);assert.notEqual(state.controller,'player');
});
test('KinoBase startup timeout tries its alternate without changing selected quality',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('720p');state.fireTimer(45000);
 assert.match(state.changedURL,/mirror.threnet.xyz\/720\//);assert.equal(state.played.faborn_quality,'720p');
 state.fireTimer(45000);assert.equal(state.closed,true);assert.equal(state.videoDestroyed,1);
});
test('unsupported media errors never trigger a KinoBase mirror loop',()=>{
 const env=voicePlayer(kinoEnvironment()),{state}=env;env.instance.open(kinoMovie);state.play('2160p');
 state.nativeEvents.error({error:'PLAYER_ERROR_NOT_SUPPORTED_FORMAT'});state.fireTimer(0);
 assert.equal(state.videoDestroyed,undefined);assert.equal(state.closed,true);
});
test('explicit quality changes reset the mirror attempt list and preserve the new quality',()=>{
 const panelEvents={},env=voicePlayer(kinoEnvironment({panelEvents})),{state}=env;
 env.instance.open(kinoMovie);state.play('1080p');kinoConnectionError(state);state.videoEvents.loadeddata();
 const data=state.played;data.url=data.quality['720p'];data.quality_switched='720p';panelEvents.quality({name:'720p',url:data.url});
 kinoConnectionError(state);assert.match(state.changedURL,/mirror.threnet.xyz\/720\//);assert.equal(state.closed,undefined);
});
test('KinoBase connection retry remains compatible with next-episode lazy resolution',()=>{
 const env=voicePlayer(kinoEnvironment({series:true})),{state}=env;
 env.instance.open(kinoSeries);state.play('1080p');kinoConnectionError(state);state.videoEvents.loadeddata();
 advanceFixture(env);state.fireTimer(0);
 assert.equal(state.played.episode,2);assert.equal(state.played.faborn_quality,'1080p');kinoConnectionError(state);
 assert.match(state.changedURL,/mirror.threnet.xyz\/1080\/s1e2\//);assert.equal(state.closed,undefined);
});
test('player translations contain only the same source, episode and exact quality, with mirrors grouped',()=>{
 const make=(id,source,language,q,ep=2)=>({id,source,voice:id,audioLanguage:language,episodes:[{id,season:1,episode:ep,resolvedAt:1,qualities:{[q]:'https://ashdi.vip/'+id+'.m3u8'}}]});
 const ua=make('UA','uaserials','uk','1080p');
 const title={releases:[ua,make('EN','uaserials','en','1080p'),make('Other source','kinobase','ru','1080p'),make('Lower','uaserials','ru','720p'),make('Other episode','uaserials','uk','1080p',3),{...ua,id:'mirror'}]};
 assert.deepEqual(api.playerVoiceRows(title,ua,ua.episodes[0],'1080p').map(r=>r.release.id),['UA','EN']);
 const mirror=title.releases[title.releases.length-1];
 assert.deepEqual(api.playerVoiceRows(title,mirror,mirror.episodes[0],'1080p').map(r=>r.release.id),['mirror','EN']);
});
test('switching UA to EN in the player retains series, quality, history identity, timestamp and pause',()=>{
 const env=voicePlayer(kinoEnvironment({series:true,english:true})),{state}=env;
 env.instance.open(kinoSeries);state.play('1080p',r=>r.release.audioLanguage==='uk');
 const data=state.played,hash=data.timeline.hash;state.progress(510,1440);state.nativeVideo.paused=true;
 assert.equal(data.voiceovers.length,3);
 data.voiceovers.find(v=>v.language==='EN').onSelect();
 assert.equal(state.played,data);assert.equal(state.controller,'player');assert.equal(state.closed,undefined);
 assert.match(state.changedURL,/1080\/s1e1\/v1\/master-v1-a3/);assert.equal(data.season,1);assert.equal(data.episode,1);
 assert.equal(data.faborn_quality,'1080p');assert.equal(data.timeline.hash,hash);assert.equal(data.timeline.stop_recording,true);
 state.videoEvents.loadeddata();assert.equal(state.seeked,510);assert.equal(state.nativeVideo.paused,true);
 assert.equal(data.timeline.stop_recording,undefined);assert.equal(data.voice_name,'Оригинал');
 assert.equal(state.panelTracks.filter(t=>t.selected).length,1);assert.equal(state.panelTracks.find(t=>t.selected).language,'EN');
});
test('failed translation fetch keeps the original stream, selection and playback running',()=>{
 const env=voicePlayer(kinoEnvironment({english:true})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p',r=>r.release.audioLanguage==='uk');
 const data=state.played,url=data.url;
 env.root.XMLHttpRequest.prototype.send=function(){this.status=404;this.responseText='Not found';this.onload();};
 data.voiceovers.find(v=>v.language==='EN').onSelect();
 assert.equal(data.url,url);assert.equal(state.changedURL,undefined);assert.equal(state.nativeVideo.paused,false);
 assert.match(state.notices.at(-1),/Не вдалося змінити/);assert.equal(state.panelTracks.find(t=>t.selected).language,'UA');
 assert.equal(data.timeline.stop_recording,undefined);
});
test('a delayed translation response or stale native error cannot change or close a different player',()=>{
 const env=voicePlayer(kinoEnvironment({english:true})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p',r=>r.release.audioLanguage==='uk');
 const oldError=state.nativeEvents.error;let request;
 env.root.XMLHttpRequest.prototype.send=function(){request=this;};
 state.played.voiceovers.find(v=>v.language==='EN').onSelect();
 env.root.Lampa.Player.play({url:'https://other.test/film.m3u8'});
 request.status=200;request.responseText='#EXTM3U\n#EXTINF:6,\na.ts';request.onload();oldError({error:'old error'});
 assert.ok(request.aborted);assert.equal(state.changedURL,undefined);assert.equal(state.closed,undefined);
 assert.equal(state.played.url,'https://other.test/film.m3u8');
});
test('old native video errors are ignored after an in-player voice switch',()=>{
 const env=voicePlayer(kinoEnvironment({english:true})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p',r=>r.release.audioLanguage==='uk');
 const oldError=state.nativeEvents.error;
 state.played.voiceovers.find(v=>v.language==='EN').onSelect();
 oldError({error:'old video failed'});assert.ok(!Object.values(state.timers).some(t=>t.ms===0));
 state.nativeEvents.error({error:'new video failed'});state.fireTimer(0);
 assert.match(state.menu.title,/Відео не запустилося/);
});
test('an already queued old error cannot close the new voice using the same play data',()=>{
 const env=voicePlayer(kinoEnvironment({english:true})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p',r=>r.release.audioLanguage==='uk');
 state.nativeEvents.error({error:'queued old error'});
 state.played.voiceovers.find(v=>v.language==='EN').onSelect();state.fireTimer(0);
 assert.equal(state.closed,undefined);assert.equal(state.played.voice_name,'Оригинал');
});
test('repeated audio clicks during a pending switch do not invalidate the pending result',()=>{
 const env=voicePlayer(kinoEnvironment({english:true})),{state}=env;
 env.instance.open(kinoMovie);state.play('2160p',r=>r.release.audioLanguage==='uk');
 let request;env.root.XMLHttpRequest.prototype.send=function(){request=this;};
 const voices=state.played.voiceovers;voices.find(v=>v.language==='EN').onSelect();voices.find(v=>v.language==='UA').onSelect();
 request.status=200;request.responseText='#EXTM3U\n#EXTINF:6,\na.ts';request.onload();
 assert.equal(state.played.voice_name,'Оригинал');assert.ok(state.changedURL);state.videoEvents.loadeddata();
 assert.equal(state.seeked,510);assert.equal(state.played.timeline.stop_recording,undefined);
});
test('a soft 404 in the first episode iframe falls through to its second supported player',()=>{
 const page='https://uafix.net/serials/dzhentlmeni/',ep=page+'season-01-episode-01/';
 const env=environment({respond(req){req.status=200;
  if(req.url.includes('catalog.json'))req.responseText=JSON.stringify(catalog);
  else if(req.url==='https://uafix.net/search.html')req.responseText='<h1>Пошук</h1><a class="sres-wrap" href="'+page+'"><h2>Джентльмени / The Gentlemen</h2></a>';
  else if(req.url===page)req.responseText='<h1>Джентльмени</h1><span class="forigin">The Gentlemen</span><li>Рік: 2024</li><li>Переклад: Українська</li><a href="'+ep+'">1 серія</a>';
  else if(req.url===ep)req.responseText='<iframe src="https://zetvideo.net/vod/65473"></iframe><iframe src="https://ashdi.vip/vod/99001"></iframe>';
  else if(req.url==='https://zetvideo.net/vod/65473')req.responseText='<title>404 Not Found</title>';
  else if(req.url==='https://ashdi.vip/vod/99001')req.responseText='new Playerjs({file:"https://ashdi.vip/hls/master.m3u8"})';
  else if(req.url==='https://ashdi.vip/hls/master.m3u8')req.responseText='#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n1080.m3u8';
  else {req.status=404;req.responseText='';}req.onload();
 }});
 env.instance.open({name:'Джентльмени',original_name:'The Gentlemen',first_air_date:'2024-03-07'});
 assert.ok(env.state.menu.items.some(r=>r.group && r.subtitle.includes('UAFix')));
 assert.ok(env.state.requests.some(r=>r.url==='https://ashdi.vip/vod/99001'));
});

test('torrent shortcut routes TV metadata and selected search language to native Lampa',()=>{
 const movie={id:1668,name:'Друзі',original_name:'Friends',first_air_date:'1994-09-22',imdb_id:'tt0108778'};
 const r=api.torrentRequest(movie,'df_lg_year');
 assert.equal(r.component,'torrents');assert.equal(r.search,'Friends Друзі 1994');assert.equal(r.search_one,'Друзі');assert.equal(r.search_two,'Friends');assert.equal(r.movie.name,'Друзі');assert.equal(r.movie.imdb_id,'tt0108778');assert.equal(movie.title,undefined);
});
test('torrent shortcut keeps the existing parser and server configuration untouched',()=>{
 const {instance,root,state}=environment();const calls=[];
 root.Lampa.Activity={push:r=>calls.push(r)};root.Lampa.Component={get:()=>function(){}};
 Object.assign(state.storage,{torrserver_url:'http://192.168.1.3:8090',parser_url:'https://parser.example',parser_use:false});
 const before=JSON.stringify(state.storage);instance.openTorrents({id:1,title:'Film',original_title:'Original',release_date:'2020-01-01'});
 assert.equal(calls.length,1);assert.equal(calls[0].component,'torrents');assert.equal(JSON.stringify(state.storage),before);assert.equal(state.requests.length,0);assert.equal(state.played,null);
});
test('torrent shortcut explains when its native component is unavailable',()=>{
 const {instance,root,state}=environment();root.Lampa.Activity={push(){throw Error('should not navigate');}};root.Lampa.Component={get:()=>undefined};
 instance.openTorrents({title:'Film'});assert.match(state.notices.pop(),/немає компонента торрентів/);
});
test('card button identity excludes release version and retains a nonvisual name for editors',()=>{
 for(const kind of ['online','torrent']){const html=api.buttonMarkup(kind);assert.ok(!html.includes(api.version));assert.match(html,/data-faborn-action=/);assert.match(html,/<span[^>]+display:none!important/);assert.match(html,/font-size:0!important/);assert.match(html,/<svg/);}
});

test('classic episode menus keep safe thumbnails, titles, synopsis and progress',()=>{
 const env=kinoEnvironment({series:true});env.state.storage.faborn_ukr_layout='classic';let loaded;
 env.root.Lampa.Api={sources:{tmdb:{get(url,params,success){loaded=success;}}}};
 env.state.timelines['faborn|tmdb-tv-1668|1|1']={time:510,duration:1440,percent:35};
 env.instance.open(kinoSeries);env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===1);
 loaded({episodes:[{episode_number:1,name:'Пілот',still_path:'/photo.jpg',overview:'Короткий <b>опис</b>'},{episode_number:2,name:'Друга',still_path:'javascript:bad',overview:''}]});
 const rows=env.state.menu.items;assert.equal(rows[0].thumbnail,'https://image.tmdb.org/t/p/w300/photo.jpg');assert.match(rows[0].title,/Пілот/);assert.match(rows[0].subtitle,/8:30/);assert.match(rows[0].subtitle,/Короткий опис/);assert.equal(rows[1].thumbnail,'');
 let rendered,appended;env.root.Lampa.Timeline.render=p=>{rendered=p;return 'native-timeline';};
 env.state.menu.onDraw({find:()=>({parent:()=>({append:v=>{appended=v;}})})},rows[0]);assert.equal(rendered.percent,35);assert.equal(appended,'native-timeline');
 env.state.choose(i=>i.value===2);env.state.play('1080p');assert.equal(env.state.played.episode,2);
});
test('classic source menus expose the same continue action and preserve the player timecode',()=>{
 const env=kinoEnvironment();env.state.storage.faborn_ukr_layout='classic';env.state.storage.player_timecode='continue';const field=env.root.Lampa.Storage.field;env.root.Lampa.Storage.field=k=>k==='player_timecode'?env.state.storage.player_timecode:field(k);env.state.timelines['faborn|tmdb-movie-280|0|0']={time:510,duration:7000,percent:7};
 env.instance.open(kinoMovie);env.state.choose(i=>/^Продовжити з 8:30/.test(i.title));assert.equal(env.state.played.timeline.time,510);assert.equal(env.state.storage.faborn_ukr_layout,'classic');
 env.root.Lampa.Player.close();env.state.storage.player_timecode='ask';env.instance.open(kinoMovie);assert.ok(!env.state.menu.items.some(i=>/^Продовжити з/.test(i.title)));
});

const torrentHash='a'.repeat(40);
function torrentEpisode(env,episode=1,season=1){
 return {id:episode,torrent_hash:torrentHash,path:'Friends/Season '+season+'/Friends.S'+String(season).padStart(2,'0')+'E'+String(episode).padStart(2,'0')+'.mkv',card:{...kinoSeries,number_of_seasons:10},season,episode,url:'http://127.0.0.1:8090/stream/test',timeline:env.root.Lampa.Timeline.view(''+season+episode+'Friends')};
}
function registerFiles(env,files,viewed=[]){
 env.state.follows.torrent({type:'onenter',element:{hash:123}});
 env.state.follows.torrent_file({type:'list_open',items:files,params:{movie:files[0].card}});
 files.forEach(element=>env.state.follows.torrent_file({type:'render',element,items:files,params:{movie:element.card,viewed}}));
}
test('restart seeks straight to zero, ignores stale seek frames, and synchronizes only this episode',()=>{
 const env=kinoEnvironment({series:true}),{state,root,instance}=env;voicePlayer(env);
 instance.open(kinoSeries);state.play('1080p');state.progress(510,1440);
 state.timelines['12Friends']={time:400,duration:1440,percent:28,updated:1};
 state.played.timeline.waiting_for_user=true;
 assert.equal(instance.restart(),true);assert.equal(state.seeked,0);assert.equal(state.played.timeline.stop_recording,true);
 state.progress(511,1440);assert.equal(state.timelines['11Friends'].time,510);
 state.progress(0,1440);assert.equal(state.timelines['11Friends'].time,0);assert.equal(state.timelines['faborn|tmdb-tv-1668|1|1'].percent,0);
 assert.equal(state.storage['faborn_ukr_position_tmdb-tv-1668'].time,0);assert.equal(state.timelines['12Friends'].time,400);
 assert.equal(state.played.timeline.waiting_for_user,false);assert.equal(state.played.timeline.continued,true);
 assert.equal(root.Lampa.Storage.field('player_timecode'),undefined);
});
test('failed or cancelled restart preserves the previous saved position',()=>{
 const env=kinoEnvironment(),{state,root,instance}=env;voicePlayer(env);instance.open(kinoMovie);state.play('1080p');state.progress(500,7000);
 assert.equal(instance.restart(),true);assert.equal(instance.restart(),false);state.fireTimer(8000);
 assert.equal(state.played.timeline.time,500);assert.equal(state.timelines['faborn|tmdb-movie-280|0|0'].time,500);
 assert.match(state.notices.at(-1),/Не вдалося/);instance.restart();root.Lampa.Player.close();
 assert.equal(state.timelines['faborn|tmdb-movie-280|0|0'].time,500);
});
test('source window starts a completed film from zero without changing the global resume setting',()=>{
 const env=kinoEnvironment(),{state,root,instance}=env;
 const hash='faborn|tmdb-movie-280|0|0';state.timelines[hash]={time:7000,duration:7000,percent:100,updated:1};
 state.storage.player_timecode='ask';const field=root.Lampa.Storage.field;root.Lampa.Storage.field=k=>k==='player_timecode'?'ask':field(k);
 instance.open(kinoMovie);state.choose(i=>i.action==='restart');
 assert.equal(state.played.timeline.time,0);assert.equal(state.played.timeline.percent,0);assert.equal(state.timelines[hash].percent,100);
 state.progress(0,7000);assert.equal(state.timelines[hash].percent,0);assert.equal(state.storage.player_timecode,'ask');
 assert.equal(state.played.faborn_from_start,undefined);root.Lampa.Player.close();
 instance.open(kinoMovie);assert.ok(!state.menu.items.some(i=>i.action==='restart'));
});
test('source restart does not clear progress when the new stream fails before it starts',()=>{
 const env=kinoEnvironment(),{state,root,instance}=env;const hash='faborn|tmdb-movie-280|0|0';
 state.timelines[hash]={time:800,duration:7000,percent:11,updated:1};instance.open(kinoMovie);state.choose(i=>i.action==='restart');
 root.Lampa.Player.close();assert.equal(state.timelines[hash].time,800);
});
test('torrent restart resets the shared online key and keeps other torrent files intact',()=>{
 const env=kinoEnvironment({series:true}),{state,root,instance}=env;voicePlayer(env);
 const file=torrentEpisode(env),second=torrentEpisode(env,2);registerFiles(env,[file,second]);root.Lampa.Player.play(file);state.progress(1440,1440);
 state.timelines['12Friends']={time:500,duration:1440,percent:35,updated:1};instance.restart();state.progress(1,1440);
 assert.equal(state.timelines['faborn-torrent|'+torrentHash+'|1'].time,0);assert.equal(state.timelines['faborn|tmdb-tv-1668|1|1'].time,0);assert.equal(state.timelines['12Friends'].time,500);
});
test('restart is unavailable for live TV and an unready player',()=>{
 const env=kinoEnvironment();assert.equal(env.instance.restart(),false);voicePlayer(env);
 env.instance.open(kinoMovie);env.state.play('1080p');env.state.played.iptv=true;assert.equal(env.instance.restart(),false);
 env.state.played.iptv=false;env.state.nativeVideo.duration=Infinity;assert.equal(env.instance.restart(),false);
});
test('online to torrent to online retains exact seconds and the latest episode',()=>{
 const env=kinoEnvironment({series:true}),{state,root}=env;
 env.instance.open(kinoSeries);state.play('1080p');state.progress(510,1440);root.Lampa.Player.close();
 const first=torrentEpisode(env),second=torrentEpisode(env,2);registerFiles(env,[first,second]);
 assert.equal(first.timeline.time,510);assert.equal(second.timeline.time,0);
 assert.equal(state.storage['faborn_ukr_position_tmdb-tv-1668'].episode,1);
 root.Lampa.Player.play(first);assert.equal(state.played.timeline.time,510);state.progress(700,1440);root.Lampa.Player.close();
 assert.equal(state.timelines['faborn|tmdb-tv-1668|1|1'].time,700);
 root.Lampa.Player.play(second);state.progress(300,1440);root.Lampa.Player.close();
 assert.equal(state.storage['faborn_ukr_position_tmdb-tv-1668'].episode,2);
 env.instance.open(kinoSeries);state.play('1080p');assert.equal(state.played.episode,2);assert.equal(state.played.timeline.time,300);
 assert.equal(first.url,'http://127.0.0.1:8090/stream/test');
});
test('pause saves torrent progress before the normal recording interval',()=>{
 const env=kinoEnvironment({series:true}),file=torrentEpisode(env);registerFiles(env,[file]);env.root.Lampa.Player.play(file);
 env.state.progress(100,1440);Object.assign(file.timeline,{time:123,duration:1440,percent:9});env.state.videoEvents.pause();
 assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].time,123);
 assert.equal(env.state.timelines['faborn-torrent|'+torrentHash+'|1'].time,123);
});
test('opening or failing a torrent never records a watched episode',()=>{
 const env=kinoEnvironment({series:true}),file=torrentEpisode(env);registerFiles(env,[file]);
 assert.equal(env.instance.torrentProgressState(env.state.storage.faborn_ukr_torrent_index['r:123']).label,'');
 env.root.Lampa.Player.play(file);env.root.Lampa.Player.close();assert.equal(env.state.storage['faborn_ukr_position_tmdb-tv-1668'],undefined);
 assert.equal(env.state.history.length,0);
 env.root.Lampa.Player.play(file);file.timeline.waiting_for_user=true;env.state.progress(100,1440);env.root.Lampa.Player.close();assert.equal(env.state.history.length,0);
});
test('a season pack shows partial progress until every known episode is watched',()=>{
 const env=kinoEnvironment({series:true}),first=torrentEpisode(env),second=torrentEpisode(env,2);registerFiles(env,[first,second]);
 env.root.Lampa.Player.play(first);env.state.progress(1300,1440);env.state.videoEvents.ended();env.root.Lampa.Player.close();
 const record=env.state.storage.faborn_ukr_torrent_index['r:123'];
 assert.deepEqual(env.instance.torrentProgressState(record),{label:'Переглянуто 1 / 2',complete:false,watched:1,total:2,percent:50});
 env.root.Lampa.Player.play(second);env.state.progress(510,1440);env.root.Lampa.Player.close();assert.match(env.instance.torrentProgressState(record).label,/S1E2 · 8:30.*1 \/ 2/);
 env.root.Lampa.Player.play(second);env.state.progress(1400,1440);env.state.videoEvents.ended();env.root.Lampa.Player.close();assert.equal(env.instance.torrentProgressState(record).complete,true);
});
test('ended progress is saved even when the native timeline locks continuation at end',()=>{
 const env=kinoEnvironment({series:true}),file=torrentEpisode(env);registerFiles(env,[file]);env.root.Lampa.Player.play(file);env.state.progress(1400,1440);file.timeline.waiting_for_user=true;env.state.videoEvents.ended();
 assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].percent,100);
});
test('an untimestamped old TorrServer timecode cannot replace a newer local stop',()=>{
 const env=kinoEnvironment({series:true});env.state.timelines['faborn|tmdb-tv-1668|1|1']={time:510,duration:1440,percent:35,updated:100};
 env.state.timelines['11Friends']={time:50,duration:1440,percent:3,updated:200};
 const file=torrentEpisode(env);registerFiles(env,[file],[{file_index:1,timecode:50}]);assert.equal(file.timeline.time,510);
});
test('unknown episodes, season guesses, extras and multi-episode files are not linked to shared progress',()=>{
 const env=kinoEnvironment({series:true}),normal=torrentEpisode(env);
 for(const change of [{episode:0},{season:null},{path:'Friends/Episode 03.mkv'},{path:'Friends/Sample.S01E01.mkv'},{path:'Friends.S01E01E02.mkv'},{path:'Friends.S01E01-02.mkv'},{card:{...normal.card,source:'cub'}}]){
  assert.equal(env.instance.torrentIdentity({...normal,...change}),null,JSON.stringify(change));
 }
 assert.equal(env.instance.torrentIdentity({...normal,season:11,path:'Friends.S11E01.mkv'}).season,11);
 const unknown={...normal,episode:0,timeline:env.root.Lampa.Timeline.view('unrecognized')};registerFiles(env,[unknown]);env.root.Lampa.Player.play(unknown);env.state.progress(120,1440);env.root.Lampa.Player.close();assert.equal(unknown.faborn_title,undefined);assert.equal(env.state.storage['faborn_ukr_position_tmdb-tv-1668'],undefined);
});
test('film progress crosses sources but multipart releases and extras stay separate',()=>{
 const env=kinoEnvironment();env.instance.open(kinoMovie);env.state.play('1080p');env.state.progress(900,7000);env.root.Lampa.Player.close();
 const file={id:1,torrent_hash:torrentHash,path:'Terminator.2.mkv',card:kinoMovie,url:'http://127.0.0.1:8090/stream/film',timeline:env.root.Lampa.Timeline.view('Terminator 2: Judgment Day')};
 registerFiles(env,[file]);assert.equal(file.timeline.time,900);env.root.Lampa.Player.play(file);env.state.progress(1200,7000);env.root.Lampa.Player.close();env.instance.open(kinoMovie);env.state.play('1080p');assert.equal(env.state.played.timeline.time,1200);
 assert.equal(env.instance.torrentIdentity({...file,path:'Terminator.CD1.mkv'}),null);
 assert.equal(env.instance.torrentIdentity(file,[file,{path:'Another.Movie.mkv'}]),null);
 assert.ok(env.instance.torrentIdentity(file,[file,{path:'Sample.mkv'}]));
});
test('latest local reset wins over older completed progress',()=>{
 const env=kinoEnvironment({series:true});env.state.timelines.shared={time:1440,duration:1440,percent:100,updated:100};env.state.timelines.native={time:0,duration:0,percent:0,updated:200};
 assert.equal(env.instance.torrentProgressState({files:[{shared:'shared',native:'native',file:'file'}]}).label,'');
});
test('native watched and reset actions update the shared and per-torrent marks without recursion',()=>{
 const env=kinoEnvironment({series:true}),file=torrentEpisode(env);registerFiles(env,[file]);
 env.state.follows.torrent_file({type:'render',element:file,item:{},items:[file],params:{}});
 env.root.Lampa.Timeline.update({hash:'11Friends',percent:100,time:1440,duration:1440});
 assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].percent,100);assert.equal(env.state.timelines['faborn-torrent|'+torrentHash+'|1'].percent,100);
 env.root.Lampa.Timeline.update({hash:'11Friends',percent:0,time:0,duration:0});assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].percent,0);assert.equal(env.state.timelines['faborn-torrent|'+torrentHash+'|1'].percent,0);
});
test('a later episode and another series cannot inherit the stop from the current episode',()=>{
 const env=kinoEnvironment({series:true});env.state.timelines['faborn|tmdb-tv-1668|1|1']={time:510,duration:1440,percent:35,updated:100};
 const second=torrentEpisode(env,2);env.instance.prepareTorrentProgress(second);assert.equal(second.timeline.time,0);
 const other=torrentEpisode(env);other.card={...other.card,id:42,original_name:'Another',original_title:'Another'};other.timeline=env.root.Lampa.Timeline.view('11Another');env.instance.prepareTorrentProgress(other);assert.equal(other.timeline.time,0);
});
test('page exit flushes the last torrent seconds before the fifteen-second interval',()=>{
 const env=kinoEnvironment({series:true}),file=torrentEpisode(env);registerFiles(env,[file]);env.root.Lampa.Player.play(file);
 env.state.progress(100,1440);Object.assign(file.timeline,{time:107,duration:1440,percent:7});env.state.pageEvents.pagehide();
 assert.equal(env.state.timelines['faborn|tmdb-tv-1668|1|1'].time,107);assert.equal(env.state.storage['faborn_ukr_position_tmdb-tv-1668'].time,107);
});

test('Back returns to the existing episode list without another source search',()=>{
 const {instance,state,root}=environment();instance.open({name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'});
 state.choose(i=>i.action==='episode');state.choose(i=>i.value===3);state.choose(i=>i.value===1);state.play('1080p');const before=state.requests.length,voice=state.played.voice_name;
 root.Lampa.Player.close();assert.equal(state.requests.length,before);assert.equal(state.controller,'select');
 assert.ok(state.menu.items.find(i=>i.action==='episode'&&i.selected));
 state.play('1080p');assert.equal(state.played.voice_name,voice);
});
function advanceFixture(env){
 const {state,root}=env,current=state.played,next=state.playlist[state.playlist.indexOf(current)+1];assert.ok(next);
 const done=()=>{state.playerEvents.destroy();root.Lampa.Player.play(next);};next.url(done);return next;
}
test('next episode resolves lazily, retains quality and voice, and marks only the old episode watched',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const env=kinoEnvironment({series:true}),{instance,state}=env;instance.open(kinoSeries);state.play('1080p');env.kino.version=2;now+=61000;
 const old=state.played;state.progress(100,100);const next=advanceFixture(env);
 state.videoEvents.ended();assert.equal(state.played,old);assert.equal(old.timeline.percent,100);
 state.fireTimer(0);assert.equal(state.played,next);assert.equal(next.episode,old.episode+1);assert.equal(next.voice_name,old.voice_name);assert.equal(next.faborn_quality,'1080p');
 assert.match(next.url,/\/v2\//);assert.equal(next.timeline.percent,0);assert.equal(typeof old.url,'function');
});
test('closing during next-episode resolution ignores delayed responses and restores sources',()=>{
 const options={},env=environment(options),{instance,state,root}=env;instance.open({name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'});state.choose(i=>i.action==='episode');state.choose(i=>i.value===3);state.choose(i=>i.value===1);state.play('1080p');
 options.delayed=true;advanceFixture(env);const req=state.requests.at(-1);root.Lampa.Player.close();
 req.status=200;req.responseText='#EXTM3U\n#EXTINF:6,\nvideo.ts';req.onload();assert.equal(state.played,null);assert.equal(state.controller,'select');assert.ok(req.aborted);
});
test('failed next episode releases player loading and returns to the cached selector',()=>{
 const options={},env=environment(options),{instance,state}=env;instance.open({name:'Річер',original_name:'Reacher',first_air_date:'2022-02-03'});state.choose(i=>i.action==='episode');state.choose(i=>i.value===3);state.choose(i=>i.value===1);state.play('1080p');
 options.failure=true;advanceFixture(env);assert.equal(state.played,null);assert.equal(state.controller,'select');assert.ok(state.notices.some(x=>x.includes('Наступна серія')));
});
test('another plugin taking over playback does not reopen the old Faborn sources on Back',()=>{
 const env=kinoEnvironment({series:true});env.instance.open(kinoSeries);env.state.play('720p');env.root.Lampa.Player.play({url:'https://other.example/movie.m3u8'});env.root.Lampa.Player.close();assert.equal(env.state.controller,'content');assert.equal(env.state.menu,null);
});
test('an old ended event cannot mark a newly started resumed episode watched',()=>{
 const env=kinoEnvironment({series:true}),one=torrentEpisode(env),two=torrentEpisode(env,2);registerFiles(env,[one,two]);env.root.Lampa.Player.play(one);env.state.progress(1400,1440);
 env.root.Lampa.Player.play(two);Object.assign(two.timeline,{time:200,duration:1440,percent:14});env.state.videoEvents.ended();assert.equal(two.timeline.percent,14);
});

test('source markers reach the actual Player handoff from a parsed and checked UAKino stream',()=>{
 const env=directEnvironment({intercept(req){
  if(req.url==='https://ashdi.vip/vod/3306') {req.status=200;req.responseText=embedHTML.replace("id:'video'","id:'video',skip:'50-95,500-550'");req.onload();return true;}
 }});
 chooseDirect(env);env.state.play('1080p');
 assert.deepEqual(env.state.played.faborn_segments,{source:[{start_sec:50,end_sec:95},{start_sec:500,end_sec:550}],sourceName:'UAKino'});
});

function markerPlaylist(file,state){
 function row(episode,quality,voice,skip){return {title:episode+' серия',file:'['+quality+'p]{'+voice+'}https://primary.redcdn.org/'+quality+'/s1e'+episode+'/v'+state.version+'/master-v1-a1.m3u8',skip};}
 return [{title:'1 сезон',folder:[
  row(1,720,'1+1 (Украинский)',state.version===1?'50-95':undefined),
  row(1,1080,'1+1 (Украинский)',undefined),
  row(1,720,'Оригинал','60-105'),
  row(2,720,'1+1 (Украинский)','172-236')
 ]}];
}
test('quality, translation and next-episode handoffs never reuse another stream marker',()=>{
 const panelEvents={},env=voicePlayer(kinoEnvironment({series:true,english:true,playlist:markerPlaylist,panelEvents})),{state}=env;
 env.instance.open(kinoSeries);state.play('720p',r=>r.release.audioLanguage==='uk');const data=state.played;
 assert.deepEqual(data.faborn_segments.source,[{start_sec:50,end_sec:95}]);
 panelEvents.quality({name:'1080p',url:data.quality['1080p']});assert.equal(data.faborn_segments,null);
 panelEvents.quality({name:'720p',url:data.quality['720p']});assert.deepEqual(data.faborn_segments.source,[{start_sec:50,end_sec:95}]);
 data.voiceovers.find(v=>v.language==='EN').onSelect();assert.deepEqual(data.faborn_segments.source,[{start_sec:60,end_sec:105}]);
 state.videoEvents.loadeddata();data.voiceovers.find(v=>v.language==='UA').onSelect();state.videoEvents.loadeddata();
 const next=advanceFixture(env);state.fireTimer(0);assert.equal(state.played,next);assert.deepEqual(next.faborn_segments.source,[{start_sec:172,end_sec:236}]);
});
test('a refreshed provider response without markers clears previously available markers',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const env=kinoEnvironment({series:true,playlist:markerPlaylist});env.instance.open(kinoSeries);env.state.play('720p',r=>r.release.audioLanguage==='uk');assert.ok(env.state.played.faborn_segments);
 env.root.Lampa.Player.close();env.kino.version=2;now+=61000;env.state.play('720p',r=>r.release.audioLanguage==='uk');
 assert.match(env.state.played.url,/\/v2\//);assert.equal(env.state.played.faborn_segments,null);
});

function nativeQueueFixture(env) {
 const {state,root}=env,field=root.Lampa.Storage.field;
 state.autonext=true;state.nativeNext=0;state.selectOpened=false;
 root.Lampa.Storage.field=k=>k==='playlist_next'?state.autonext:field(k);
 root.Lampa.Select.opened=()=>state.selectOpened;
 root.Lampa.PlayerPlaylist={next(){
  state.nativeNext++;
  const list=state.playlist,current=state.played,next=list[list.indexOf(current)+1];
  if(!next)return;
  const play=()=>{state.playerEvents.destroy();state.playlist=[];root.Lampa.Player.play(next);};
  if(typeof next.url==='function')next.url(play);else play();
 }};
 return env;
}
function playingUASerials() {
 const env=nativeQueueFixture(multiSourceEnvironment(true));env.instance.open(fromCard);env.state.play('1080p',i=>i.release.voice==='HDrezka Studio');return env;
}
test('UASerials ended fallback restores a lost native playlist and starts the checked next stream',()=>{
 const env=playingUASerials(),{state}=env,first=state.played,voice=first.voice_name;
 assert.ok(!Object.hasOwn(first,'playlist'),'do not pass an empty competing playlist');
 state.playlist=[];state.progress(1440,1440);state.videoEvents.ended();state.fireTimer(300);
 assert.equal(state.played,first);state.fireTimer(0);
 assert.equal(state.nativeNext,1);assert.equal(state.played.episode,2);assert.equal(state.played.voice_name,voice);
 assert.equal(state.played.faborn_quality,'1080p');assert.ok(state.playlist.length>1);assert.equal(first.timeline.percent,100);
 assert.ok(state.storage.faborn_ukr_autoplay_status.includes('S1E2 → S1E3'));
});
test('native autoplay and duplicate ended callbacks cannot start an episode twice',()=>{
 const env=playingUASerials(),{state,root}=env;
 state.progress(1440,1440);root.Lampa.PlayerPlaylist.next();state.videoEvents.ended();state.videoEvents.ended();
 state.fireTimer(0);state.fireTimer(300);
 assert.equal(state.nativeNext,1);assert.equal(state.played.episode,2);assert.equal(state.played.timeline.percent,0);
});
test('autoplay recovery respects disabled auto-next, open menus and the end of a season',()=>{
 for(const mode of ['off','menu','last']){
  const env=playingUASerials(),{state,root}=env;
  if(mode==='off')state.autonext=false;
  if(mode==='menu')state.selectOpened=true;
  if(mode==='last'){
   const last=state.playlist.at(-1);last.url(()=>{state.playerEvents.destroy();root.Lampa.Player.play(last);});state.fireTimer(0);
  }
  const current=state.played;state.progress(1440,1440);state.videoEvents.ended();state.fireTimer(300);
  assert.equal(state.played,current);assert.equal(state.nativeNext,0);
  assert.ok(state.storage.faborn_ukr_autoplay_status.includes(mode==='off'?'вимкнено':mode==='menu'?'меню':'немає'));
 }
});
test('Back and another plugin taking over cancel a queued autoplay recovery',()=>{
 for(const takeover of [false,true]){
  const env=playingUASerials(),{state,root}=env;state.progress(1440,1440);state.videoEvents.ended();
  if(takeover)root.Lampa.Player.play({url:'https://other.example/movie.m3u8'});else root.Lampa.Player.close();
  const before=state.requests.length;state.fireTimer(300);assert.equal(state.nativeNext,0);assert.equal(state.requests.length,before);
 }
});
test('Back cancels an in-flight recovery and a failure returns to cached UASerials sources',()=>{
 for(const fail of [false,true]){
  let pending;
  const env=nativeQueueFixture(multiSourceEnvironment(true,req=>{if(pending===true){pending=req;return true;}})),{state,root}=env;
  env.instance.open(fromCard);state.play('1080p',i=>i.release.voice==='HDrezka Studio');state.progress(1440,1440);state.videoEvents.ended();pending=true;state.fireTimer(300);
  const req=pending;assert.equal(req.url,'https://hdvbua.pro/embed/6097/b0c42c552');
  if(fail){req.status=503;req.onload();assert.ok(state.storage.faborn_ukr_autoplay_status.includes('Помилка'));}
  else{root.Lampa.Player.close();req.status=200;req.responseText=fixture('hdvb-from.html');req.onload();assert.ok(req.aborted);}
  assert.equal(state.played,null);assert.equal(state.controller,'select');assert.equal(state.nativeNext,0);
 }
});

test('a completed empty KinoBase search is distinguished from a transport outage',()=>{
 const e=kinoEnvironment();e.instance.open({...kinoSeries,first_air_date:'2026-01-01'});
 const issue=e.state.menu.items.find(i=>i.action==='kinostatus');assert.ok(issue);assert.equal(issue.title,'KinoBase · немає збігу');assert.match(issue.subtitle,/Пошук відповів/);
 assert.ok(!e.state.requests.some(r=>r.url.includes('/vod/')));
});

// The same slow playlist used to be aborted at 24s and only appeared after reopening.
test('late KinoBase playlist adds 4K to the existing discovery session',()=>{
 const env=kinoEnvironment({delayVod:true});env.instance.open(kinoMovie);const req=env.kino.pending;
 env.state.fireTimer(24000);assert.notEqual(req.aborted,true);assert.ok(env.state.menu.items.some(i=>i.action==='wait'));
 req.onload();assert.ok(env.state.menu.items.some(i=>i.value==='2160p'&&i.release.source==='kinobase'));assert.ok(!env.state.menu.items.some(i=>i.action==='wait'));
 assert.equal(Object.keys(env.state.timers).length,0);assert.equal(env.state.requests.filter(r=>r.url.includes('/search?')).length,1);
});
test('Back after the discovery preview cancels late KinoBase and every timer',()=>{
 const env=kinoEnvironment({delayVod:true});env.instance.open(kinoMovie);env.state.fireTimer(24000);const req=env.kino.pending;
 env.state.menu.onBack();req.onload();assert.equal(env.state.menu,null);assert.equal(env.state.controller,'full_start');assert.ok(req.aborted);assert.equal(Object.keys(env.state.timers).length,0);
});
test('late KinoBase cannot steal an open source-details menu',()=>{
 const env=kinoEnvironment({delayVod:true});env.instance.open(kinoMovie);env.state.fireTimer(24000);env.state.choose(i=>i.action==='kinostatus');const menu=env.state.menu;
 env.kino.pending.onload();assert.equal(env.state.menu,menu);env.state.menu.onBack();assert.ok(env.state.menu.items.some(i=>i.value==='2160p'));
});


test('slow verified KinoBase media survives the 20s preview and appears without reopening',()=>{
 const e=kinoEnvironment({delayManifest:true});e.instance.open(kinoMovie);
 e.state.fireTimer(20000);assert.ok(e.kino.manifests.length);assert.ok(e.kino.manifests.every(r=>!r.aborted));
 const initial=e.kino.manifests.slice();for(const r of initial)r.onload();
 assert.ok(e.state.menu.items.some(i=>i.value==='2160p'));assert.equal(Object.keys(e.state.timers).length,0);
});
test('UAKinogo server beta is explicitly off, needs an address and does not load the old experiment flag',()=>{
 const e=environment();let loaded=0;e.root.Faborn4KLab=()=>{loaded++;return {};};
 assert.equal(e.state.params.find(p=>p.param.name==='faborn_ukr_uakinogo_beta').param.default,'off');
 e.state.storage.faborn_ukr_uakinogo_beta='on';e.instance.open(kinoMovie);
 assert.equal(loaded,0);assert.match(e.state.menu.items.find(r=>r.action==='labstatus').subtitle,/адресу/);
});
test('server beta results update the current source menu and Back invalidates every late reply',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_beta:'on',faborn_ukr_uakinogo_server:'http://192.168.88.191:8787'}});let callbacks,cancels=0;
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){script.onload();}};
 e.root.Faborn4KLab=()=>({discover(movie,s,n,cb){callbacks=cb;},cancel(){cancels++;},playChoice(){}});
 e.instance.open(kinoMovie);e.state.language('all');assert.ok(callbacks);const result={season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'English',language:'en',qualities:['2160p']}]};
 callbacks.result(result);assert.ok(e.state.menu.items.some(r=>r.release?.source==='uakinogo'&&r.value==='2160p'));
 e.state.menu.onBack();callbacks.result(result);assert.equal(e.state.menu,null);assert.ok(cancels);
});
test('late KinoBase from a different card cannot inject its streams or restore its dialog',()=>{
 const e=kinoEnvironment({delayVod:true});e.instance.open(kinoMovie);e.state.fireTimer(24000);const stale=e.kino.pending;
 e.instance.open({title:'Other movie',original_title:'Other movie',release_date:'2026-01-01'});const menu=e.state.menu;stale.onload();
 assert.equal(e.state.menu,menu);assert.ok(stale.aborted);assert.ok(!e.state.menu.items.some(r=>r.release?.source==='kinobase'));
});

test('UAKinogo playback keeps voice choices, restart intent, progress and a return to cached sources',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_beta:'on',faborn_ukr_uakinogo_server:'http://192.168.88.191:8787'}});let cb;
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){script.onload();}};
 e.root.Faborn4KLab=()=>({discover(m,s,n,c){cb=c;},cancel(){},playChoice(){
  const data=cb.playerData({url:'http://127.0.0.1:12345/0123456789abcdef0123456789abcdef/0.m3u8'});data.faborn_4klab=true;e.root.Lampa.Player.play(data);
 }});
 e.instance.open(kinoMovie);
 cb.result({season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'UA',language:'uk',qualities:['2160p']},{label:'English',language:'en',qualities:['2160p']}]});
 e.state.play('2160p');assert.equal(e.state.played.voiceovers.length,2);assert.equal(e.state.played.card.id,kinoMovie.id);
 e.state.progress(120,600);e.root.Lampa.Player.close();assert.ok(e.state.menu.items.some(i=>i.release?.source==='uakinogo'));assert.equal(e.state.controller,'select');
 e.state.choose(i=>i.action==='restart');assert.equal(e.state.played.faborn_from_start,undefined);assert.equal(e.state.played.timeline.time,0);
});
test('Alloha preflight failure replaces stale playback diagnostics and Back keeps cached voices',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_beta:'on',faborn_ukr_uakinogo_server:'http://192.168.88.191:8787',faborn_ukr_last_launch:'KinoBase',faborn_ukr_last_error:'old failure'}});let cb;
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){script.onload();}};
 e.root.Faborn4KLab=()=>({discover(m,s,n,c){cb=c;},cancel(){},playChoice(){cb.error('LOOPBACK: локальний канал недоступний (HTTP 403). AVPlay не запущено.',true);}});
 e.instance.open(kinoMovie);cb.result({season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'UA',language:'uk',qualities:['2160p']}]});
 e.state.play('2160p');assert.equal(e.state.played,null);
 assert.match(e.state.storage.faborn_ukr_last_launch,/2160p.*UAKinogo \/ Alloha.*підготовка потоку/);
 assert.match(e.state.storage.faborn_ukr_last_error,/UAKinogo \/ Alloha.*2160p.*HTTP 403/);
 cb.back();assert.ok(e.state.menu.items.some(i=>i.group&&i.group.entries.some(r=>r.release.source==='uakinogo')));
});
test('UAKinogo beta uses the selected custom player, refreshes quality and voice, and preserves shared progress',()=>{
 const e=betaEnvironment({storage:{faborn_ukr_uakinogo_beta:'on',faborn_ukr_uakinogo_server:'http://192.168.88.191:8787'}});let cb;const changes=[];
 const url='http://127.0.0.1:12345/0123456789abcdef0123456789abcdef/0.m3u8';
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){script.onload();}};
 e.root.Faborn4KLab=()=>({discover(m,s,n,c){cb=c;},cancel(){},playChoice(){
  const stream={url,quality:'2160p'},item=cb.playerData(stream);item.faborn_4klab=true;cb.beforePlay();
  cb.betaPlayer((error,player)=>{assert.equal(error,null);player.play(cb.betaSpec(stream,item));});
 },switchChoice(selected,done){changes.push(selected);done(null,{url,quality:selected.quality});}});
 e.instance.open(kinoMovie);assert.equal(cb.controller,'full_start');
 cb.result({season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'UA',language:'uk',qualities:['2160p','1080p']},{label:'English',language:'en',qualities:['2160p','1080p']}]});
 e.state.play('2160p');const spec=e.getSpec();assert.equal(e.state.played,null);assert.equal(spec.loopback,url);assert.deepEqual(spec.urls,[url]);assert.equal(spec.voices.length,2);assert.equal(e.state.playerCallback,undefined);
 spec.onTime({current:312,duration:6000,force:true});assert.equal(e.state.timelines['faborn|tmdb-movie-'+kinoMovie.id+'|0|0'].time,312);
 let next;spec.request({type:'quality',quality:'1080p'},(err,value)=>{assert.equal(err,null);next=value;});assert.equal(next.quality,'1080p');assert.equal(next.time,312);
 const english=next.voices.find(v=>v.title==='English');next.request({type:'voice',id:english.id},(err,value)=>{assert.equal(err,null);next=value;});assert.equal(changes.at(-1).language,'en');assert.equal(changes.at(-1).quality,'1080p');
 const before=e.state.requests.length;e.close();assert.equal(e.state.requests.length,before);assert.ok(e.state.menu.items.some(i=>i.group && i.group.entries.some(r=>r.release.source==='uakinogo')));
});


test('language defaults to Ukrainian; changing it resets quality without any network search',()=>{
 const e=kinoEnvironment({english:true});e.instance.open(kinoMovie);
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['uk']);
 assert.equal(e.state.params.find(p=>p.param.name==='faborn_ukr_audio_language').param.default,'uk');
 e.state.choose(i=>i.action==='quality');e.state.choose(i=>i.value==='720p');
 const count=e.state.requests.length;e.state.language('en');
 assert.equal(e.state.requests.length,count);assert.equal(e.state.storage.faborn_ukr_quality,'best');
 assert.equal(e.state.storage.faborn_ukr_audio_language,'en');
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>[i.group.language,i.value]),[['en','2160p']]);
 e.state.menu.onBack();e.instance.open(kinoMovie);
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['en']);
});
test('missing Ukrainian never silently chooses another language; All is an explicit cached filter',()=>{
 const e=kinoEnvironment({english:true});e.kino.missingUA=true;e.instance.open(kinoMovie);
 assert.ok(!e.state.menu.items.some(i=>i.group));assert.equal(e.state.played,null);
 assert.ok(e.state.menu.items.some(i=>i.title==='Немає озвучення: Українська'));
 assert.ok(!e.state.menu.items.some(i=>i.action==='kinostatus'),'An excluded language is not a broken KinoBase');
 const count=e.state.requests.length;e.state.choose(i=>i.action==='all-languages');
 assert.equal(e.state.requests.length,count);assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['en','ru']);
});
test('Best remains Best after playback, auto-next, Back and opening another card',()=>{
 const e=kinoEnvironment({series:true,english:true});e.instance.open(kinoSeries);e.state.language('en');
 const row=e.state.menu.items.find(i=>i.group);e.state.choose(i=>i===row);
 assert.equal(e.state.played.faborn_quality,'2160p');assert.equal(e.state.storage.faborn_ukr_quality,'best');
 advanceFixture(e);e.state.fireTimer(0);e.root.Lampa.Player.close();
 assert.ok(e.state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: Найкраща'));
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>i.group.language),['en']);
 assert.ok(e.state.menu.items.some(i=>i.action==='episode'&&i.title==='Сезон 1 · Серія 2'));
 e.state.menu.onBack();e.instance.open(kinoMovie);
 assert.ok(e.state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: Найкраща'));
});
test('late server results respect the selected language and update Best without another search',()=>{
 const e=environment({storage:{faborn_ukr_uakinogo_beta:'on',faborn_ukr_uakinogo_server:'http://192.168.88.191:8789'}});let callbacks;
 e.root.document.createElement=()=>({});e.root.document.head={appendChild(script){script.onload();}};
 e.root.Faborn4KLab=()=>({discover(movie,s,n,cb){callbacks=cb;},cancel(){},playChoice(){}});
 e.instance.open(kinoMovie);const count=e.state.requests.length;
 callbacks.result({season:0,episode:0,episodes:[{season:0,episode:0}],tracks:[{label:'English',language:'en',qualities:['2160p']},{label:'Дубляж',language:'uk',qualities:['1080p']}]});
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>[i.group.language,i.value]),[['uk','1080p']]);
 e.state.language('en');assert.equal(e.state.requests.length,count);
 assert.deepEqual(e.state.menu.items.filter(i=>i.group).map(i=>[i.group.language,i.value]),[['en','2160p']]);
});
test('language submenu Back keeps the manual quality and selected translation',()=>{
 const e=kinoEnvironment({english:true});e.instance.open(kinoMovie);e.state.play('1080p');e.root.Lampa.Player.close();
 const count=e.state.requests.length;e.state.choose(i=>i.action==='language');e.state.menu.onBack();
 assert.equal(e.state.requests.length,count);assert.equal(e.state.menu.items.find(i=>i.group).value,'1080p');
 assert.equal(e.state.menu.items.find(i=>i.selected).group.language,'uk');
});
test('beta playback and Back preserve Best while handing a real resolution to the engine',()=>{
 const e=betaEnvironment();filmQualityMenu(e);e.state.choose(i=>i.group);
 if(e.state.menu&&e.state.menu.items.some(i=>i.action==='play'))e.state.choose(i=>i.action==='play');
 assert.equal(e.getSpec().quality,'2160p');e.close();
 assert.ok(e.state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: Найкраща'));
});
test('changing language inside the native player returns to that voice without overwriting Best',()=>{
 const e=voicePlayer(kinoEnvironment({english:true,series:true}));e.instance.open(kinoSeries);e.state.choose(i=>i.group);
 e.state.played.voiceovers.find(v=>v.language==='EN').onSelect();e.state.videoEvents.loadeddata();e.root.Lampa.Player.close();
 assert.ok(e.state.menu.items.some(i=>i.action==='language'&&i.title==='Мова: English'));
 assert.ok(e.state.menu.items.some(i=>i.action==='quality'&&i.title==='Якість: Найкраща'));
 assert.equal(e.state.menu.items.find(i=>i.group).group.language,'en');
});
