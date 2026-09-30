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
    const state = {storage: {}, follows: {}, playerEvents: {}, videoEvents: {}, nativeEvents: {}, timers: {}, timerId: 0, params: [], notices: [], controller: 'full_start', menu: null, played: null, requests: [], catalog: catalog};
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
        Timeline: {view(hash) { return {hash, time: 17, percent: 1}; }},
        Utils: {hash(s) { return s; }},
        Player: {
            listener: {follow(k, fn) { state.playerEvents[k] = fn; }},
            playlist(p) { state.playlist = p; },
            play(data) { state.playerReturn = state.controller; state.controller = 'player'; state.playerEvents.start(data); state.played = data; if (state.playerEvents.ready) state.playerEvents.ready(data); },
            playdata() { return state.played; },
            close() { state.controller = state.playerReturn; state.closed = true; state.played = null; state.playerEvents.destroy(); }
        },
        PlayerVideo: {listener: {follow(k, fn) { state.videoEvents[k] = fn; }}, video() { return {addEventListener(k, fn) { state.nativeEvents[k] = fn; }}; }}
    };
    const instance = factory(root); instance.boot();
    state.choose = function (predicate) {
        const menu = state.menu;
        const item = menu.items.find(predicate);
        assert.ok(item, 'Expected menu item: ' + menu.title);
        menu.onSelect(item);
    };
    state.fireTimer = function (ms) {
        const id = Object.keys(state.timers).find(id => state.timers[id].ms === ms);
        assert.ok(id, 'Expected timer: ' + ms);
        const callback = state.timers[id].fn; delete state.timers[id]; callback();
    };
    return {state, root, instance};
}

test('full film flow hands 4K, quality map, subtitles and stable timeline to Lampa', () => {
    const {instance, state} = environment();
    instance.open({title: 'Профі', original_title: 'A Working Man', release_date: '2025-03-26'});
    state.choose(i => i.value === '2160p');
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
    state.choose(i=>i.action==='play' && i.release.voice==='Uaflix' && i.value==='1080p');
    assert.equal(state.played.episode,2); assert.equal(state.played.season,3);
    assert.equal(state.played.voice_name,'Uaflix'); assert.deepEqual(state.playlist,[]);
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
    assert.ok(state.menu.items.some(i=>i.title.includes('немає доступного')));
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
    state.choose(i => i.value === '2160p');
    assert.equal(state.played, null);
    assert.ok(state.menu.title.includes('Tizen'));
});
test('Tizen browser mode requires AVPlay without altering global player settings', () => {
    const {instance, state} = environment({player: 'inner'});
    instance.open({title: 'Профі'});
    state.choose(i => i.value === '2160p');
    assert.equal(state.played, null);
    assert.equal(state.menu.title, 'Потрібен плеєр Tizen');
    assert.equal(state.storage.player, undefined);
});

function filmQualityMenu(env) {
    env.instance.open({title: 'Бджоляр', original_title: 'The Beekeeper', release_date: '2024-01-10'});
}

test('selected manifest is checked immediately before AVPlay, and a 404 is not played', () => {
    const options = {}; const env = environment(options); filmQualityMenu(env);
    options.failure = true; env.state.choose(i=>i.value==='1080p');
    assert.equal(env.state.played,null); assert.ok(env.state.notices.some(n=>n.includes('404') || n.includes('403')));
});
test('canceling link refresh prevents late replies from starting video', () => {
    const options = {}; const env = environment(options); filmQualityMenu(env);
    options.delayed = true;
    env.state.choose(i => i.value === '1080p');
    const req = env.state.requests.at(-1);
    env.state.menu.onBack();
    req.status = 200; req.responseText = JSON.stringify(catalog); req.onload();
    assert.equal(req.aborted, true);
    assert.equal(env.state.played, null);
    assert.equal(env.state.menu,null); assert.equal(env.state.controller,'full_start');
});

test('a stuck native startup closes after 45 seconds and exposes a retry menu', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.choose(i => i.value === '1080p');
    env.state.fireTimer(45000);
    assert.equal(env.state.closed, true);
    assert.equal(env.state.menu.title, 'Відео не запустилося');
    assert.ok(env.state.storage.faborn_ukr_last_error.includes('45 секунд'));
});

test('actual playback progress cancels the startup watchdog', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.choose(i => i.value === '1080p');
    env.state.videoEvents.timeupdate({current: 1});
    assert.equal(Object.keys(env.state.timers).length, 0);
    assert.equal(env.state.closed, undefined);
});

test('a prepared player awaiting a resume choice is not closed by the startup watchdog', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.choose(i => i.value === '1080p');
    env.state.videoEvents.loadeddata({duration: 6000, current: 0});
    assert.equal(Object.keys(env.state.timers).length, 0);
    assert.equal(env.state.closed, undefined);
});

test('native AVPlay error is shown and a foreign player is never closed by old timers', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.choose(i => i.value === '1080p');
    env.state.videoEvents.error({error: {message: 'PLAYER_ERROR_CONNECTION_FAILED'}});
    env.state.fireTimer(0);
    assert.ok(env.state.menu.items[0].subtitle.includes('PLAYER_ERROR_CONNECTION_FAILED'));
    assert.equal(env.state.closed, true);

    const other = environment(); filmQualityMenu(other);
    other.state.choose(i => i.value === '1080p');
    const oldTimer = Object.values(other.state.timers)[0].fn;
    other.root.Lampa.Player.play({url: 'https://other.example/movie.mp4'});
    oldTimer();
    assert.equal(other.state.closed, undefined);
    assert.equal(other.state.played.url, 'https://other.example/movie.mp4');
});
test('Tizen event.error is captured even when Lampa does not forward it', () => {
    for (const detail of [{code: 'tizen', message: 'PLAYER_ERROR_CONNECTION_FAILED'}, 'code [0] prepare failed']) {
        const env = environment(); filmQualityMenu(env);
        env.state.choose(i => i.value === '1080p');
        env.state.nativeEvents.error({error: detail});
        env.state.fireTimer(0);
        assert.equal(env.state.closed, true);
        assert.ok(env.state.storage.faborn_ukr_last_error.includes(typeof detail === 'string' ? detail : detail.message));
        assert.ok(env.state.storage.faborn_ukr_last_launch.includes('Бджоляр'));
    }
});
test('a delayed error from a previous native video cannot close another plugin', () => {
    const env = environment(); filmQualityMenu(env);
    env.state.choose(i => i.value === '1080p');
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
test('UAKino challenge, unknown markup and missing Ukrainian evidence fail explicitly', () => {
    assert.throws(() => api.parseSearch('<title>Just a moment...</title>'),/Cloudflare/);
    assert.throws(() => api.parseSource('<title>Just a moment...</title>',djangoURL),/Cloudflare/);
    assert.throws(() => api.parseSource(movieHTML.replace('Український дубляж','English'),djangoURL),/українське/);
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
test('episode references preserve voice and season, ignore trailers, duplicate and foreign audio', () => {
    const show = api.parseSource(seriesHTML,seriesURL);
    api.addEpisodeRefs(show,seriesPlaylist + seriesPlaylist + '<li data-file="https://ashdi.vip/vod/123" data-voice="English">Серія 3</li>');
    assert.equal(show.releases.length,2); assert.deepEqual(show.releases[0].episodes.map(e=>e.episode),[1,2]);
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
    env.state.choose(i=>i.value==='2160p');
    assert.equal(env.state.played.url,'https://ashdi.vip/fixture/hls/2160/index.m3u8');
    assert.equal(env.state.played.card.id,68718);
    assert.equal(env.state.requests.filter(r=>r.url.includes('catalog.json')).length,1);
    const search = env.state.requests.find(r=>r.url==='https://uakino.best/ua/');
    assert.equal(search.method,'POST'); assert.ok(search.body.includes(encodeURIComponent('Джанґо вільний')));
    assert.ok(env.state.storage.faborn_ukr_direct_trace.some(l=>l.includes('передано 2160p')));
});
test('one unavailable provider and failed Pages index do not block another source', () => {
    const env=directEnvironment({intercept(req) {if(req.url.includes('catalog.json')){req.status=503;req.onload();return true;}}});
    chooseDirect(env); env.state.choose(i=>i.value==='1080p'); assert.ok(env.state.played);
    assert.ok(env.state.requests.some(r=>r.url==='https://uaserials.my/'));
    assert.ok(env.state.requests.some(r=>r.url==='https://uafix.net/search.html'));
});
test('every pending request is aborted and late replies cannot reopen a closed menu', () => {
    const env=environment({delayed:true}); env.instance.open({title:'Test'});
    assert.equal(env.state.requests.length,4); env.state.menu.onBack();
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
test('discovery deadline displays partial results and ignores late providers', () => {
    let waiting;
    const env=directEnvironment({intercept(req) {if(req.url==='https://uaserials.my/') {waiting=req;return true;}}});
    chooseDirect(env); assert.ok(env.state.menu.title.includes('пошук'));
    env.state.fireTimer(24000); const menu=env.state.menu;
    assert.ok(menu.items.some(i=>i.action==='play')); assert.equal(waiting.aborted,true);
    waiting.status=200;waiting.responseText='';waiting.onload();assert.equal(env.state.menu,menu);
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
    chooseDirect(env);env.state.choose(i=>i.value==='1080p');assert.ok(env.state.played);
});
test('direct playback watchdog refreshes the player without a static catalog entry', () => {
    const env=directEnvironment();chooseDirect(env);env.state.choose(i=>i.value==='1080p');
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
    assert.equal(title.releases.length,1); assert.equal(title.releases[0].episodes[0].episode,0);
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
test('nested player folders work in voice-first order and exclude foreign audio',()=>{
    const tree=[{title:'Український дубляж',folder:[{title:'Сезон 2',folder:[{title:'Серія 7',file:masterURL}]}]},{title:'English',folder:[{title:'Season 1',folder:[{title:'Episode 1',file:masterURL}]}]}];
    const entries=api.playerEntries('new Playerjs({file:'+JSON.stringify(JSON.stringify(tree))+'})',{type:'tv'});
    assert.equal(entries.length,1); assert.equal(entries[0].season,2); assert.equal(entries[0].episode,7);
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
    assert.equal(rows.length,2); assert.ok(rows.every(i=>i.title.includes('UASerials')));
    assert.ok(!env.state.menu.items.some(i=>/Знайти|індекс|діагностика/i.test(i.title)));
    env.state.choose(i=>i.value==='1080p'); assert.equal(env.state.played.card.id,hailCard.id);
    assert.ok(env.state.played.url.includes('hdvbua.pro')); assert.equal(env.state.playerReturn,'full_start');
});
test('From: changing season/episode selects the matching stream and voice',()=>{
    const env=multiSourceEnvironment(true);env.instance.open(fromCard);
    env.state.choose(i=>i.action==='episode');env.state.choose(i=>i.value===2);env.state.choose(i=>i.value===3);
    env.state.choose(i=>i.action==='play' && i.release.voice==='BaibaKoTV' && i.value==='1080p');
    assert.equal(env.state.played.season,2);assert.equal(env.state.played.episode,3);
    assert.ok(env.state.played.url.includes('from.s02e03.baibako'));assert.equal(env.state.played.voice_name,'BaibaKoTV');
    assert.deepEqual(env.state.playlist,[]);
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
    env.instance.open(hailCard);env.state.choose(i=>i.action==='play' && i.release.voice==='Багатоголосий · плеєр 2' && i.value==='1080p');
    env.state.fireTimer(45000);env.state.choose(i=>i.action==='retry');
    assert.equal(env.state.played.voice_name,'Багатоголосий · плеєр 2');
    assert.equal(env.state.requests.filter(r=>r.url==='https://hdvbua.pro/embed/1011709/b0c42c552').length,2);
});
