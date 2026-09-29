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
    const state = {storage: {}, follows: {}, playerEvents: {}, videoEvents: {}, nativeEvents: {}, timers: {}, timerId: 0, params: [], notices: [], menu: null, played: null, requests: [], catalog: catalog};
    const jq = () => ({length: 0, append() { return this; }});
    function XHR() { state.requests.push(this); }
    XHR.prototype.open = function (_, url) { this.url = url; };
    XHR.prototype.send = function () {
        if (options.delayed) return;
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
        Select: {show(menu) { state.menu = menu; }, hide() { state.menu = null; }},
        Listener: {follow(k, fn) { state.follows[k] = fn; }},
        Controller: {enabled() { return {name: 'content'}; }, toggle(n) { state.controller = n; }},
        SettingsApi: {addComponent() {}, addParam(p) { state.params.push(p); }},
        Timeline: {view(hash) { return {hash, time: 17, percent: 1}; }},
        Utils: {hash(s) { return s; }},
        Player: {
            listener: {follow(k, fn) { state.playerEvents[k] = fn; }},
            playlist(p) { state.playlist = p; },
            play(data) { state.playerEvents.start(data); state.played = data; if (state.playerEvents.ready) state.playerEvents.ready(data); },
            playdata() { return state.played; },
            close() { state.closed = true; state.played = null; state.playerEvents.destroy(); }
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
    state.choose(i => i.value && i.value.id === 'a-working-man-2025');
    state.choose(i => i.value && i.value.source === 'kinoukr');
    state.choose(i => i.value === '2160p');
    assert.ok(state.played.url.includes('/hls/2160/'));
    assert.equal(Object.keys(state.played.quality).length, 4);
    assert.equal(state.played.timeline.hash, 'faborn|a-working-man-2025|0|0');
    assert.equal(state.played.subtitles[0].label, 'Українські');
    assert.equal(state.playlist.length, 0);
});
test('series flow creates an ordered eight-episode playlist in selected voice', () => {
    const {instance, state} = environment();
    instance.open({name: 'Річер', original_name: 'Reacher', first_air_date: '2022-02-03'});
    state.choose(i => i.value && i.value.id === 'reacher-2022');
    state.choose(i => i.value && i.value.voice === 'Uaflix');
    state.choose(i => i.value === 3);
    state.choose(i => i.value && i.value.episode === 2);
    state.choose(i => i.value === '1080p');
    assert.equal(state.playlist.length, 8);
    assert.equal(state.played.episode, 2);
    assert.ok(state.playlist.every((e, n) => e.episode === n + 1 && e.voice_name === 'Uaflix'));
    assert.equal(state.storage['faborn_ukr_last_reacher-2022'], 'reacher-s03e02-uaflix');
    state.playerEvents.start(state.playlist[2]);
    assert.equal(state.storage['faborn_ukr_last_reacher-2022'], 'reacher-s03e03-uaflix');
});
test('canceling a pending catalog read does not open a stale modal', () => {
    const {instance, state} = environment({delayed: true});
    instance.open({title: 'Профі'});
    state.menu.onBack();
    const req = state.requests[0]; req.status = 200; req.responseText = JSON.stringify(catalog); req.onload();
    assert.equal(state.menu, null);
    assert.equal(state.controller, 'content');
});
test('failed catalog fetch reports error and does not launch video', () => {
    const {instance, state} = environment({failure: true});
    instance.open({title: 'Профі'});
    assert.ok(state.notices.some(s => s.includes('403')));
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
test('diagnostics can be opened directly from the movie menu', () => {
    const {instance, state} = environment();
    instance.open({title: 'Бджоляр'});
    state.choose(i => i.action === 'diagnostics');
    assert.equal(state.menu.title, 'Діагностика');
    assert.ok(state.menu.items.some(i => i.title.includes(instance.version)));
    assert.ok(state.menu.items.some(i => i.title.includes('Плеєр Lampa: tizen')));
    assert.ok(state.menu.items.some(i => i.title === 'AVPlay API: недоступний'));
});
test('browser playback is explicitly blocked after known segment CORS failure', () => {
    const {instance, state} = environment({platform: 'browser'});
    instance.open({title: 'Профі'});
    state.choose(i => i.value && i.value.id === 'a-working-man-2025');
    state.choose(i => i.value && i.value.source === 'kinoukr');
    state.choose(i => i.value === '2160p');
    assert.equal(state.played, null);
    assert.ok(state.menu.title.includes('Samsung Tizen'));
});
test('Tizen browser mode requires AVPlay without altering global player settings', () => {
    const {instance, state} = environment({player: 'inner'});
    instance.open({title: 'Профі'});
    state.choose(i => i.value && i.value.id === 'a-working-man-2025');
    state.choose(i => i.value && i.value.source === 'kinoukr');
    state.choose(i => i.value === '2160p');
    assert.equal(state.played, null);
    assert.equal(state.menu.title, 'Обери штатний плеєр Tizen');
    assert.equal(state.storage.player, undefined);
});

function filmQualityMenu(env) {
    env.instance.open({title: 'Бджоляр', original_title: 'The Beekeeper', release_date: '2024-01-10'});
    env.state.choose(i => i.value && i.value.id === 'the-beekeeper-2024');
    env.state.choose(i => i.value && i.value.source === 'uakino');
}

test('launch replaces a cached URL with the latest Pages entry before opening AVPlay', () => {
    const env = environment(); filmQualityMenu(env);
    const updated = JSON.parse(JSON.stringify(catalog));
    const ep = updated.titles[0].releases[0].episodes[0];
    ep.qualities['1080p'] = 'https://ashdi.vip/new-location/hls/1080/fresh/index.m3u8';
    env.state.catalog = updated;
    env.state.choose(i => i.value === '1080p');
    assert.equal(env.state.played.url, ep.qualities['1080p']);
    assert.equal(env.state.requests.filter(r => r.url.includes('catalog.json')).length, 2);
});

test('a newly unavailable entry never opens the stale cached stream', () => {
    const env = environment(); filmQualityMenu(env);
    const updated = JSON.parse(JSON.stringify(catalog));
    updated.titles[0].releases[0].episodes[0].state = 'unavailable';
    env.state.catalog = updated;
    env.state.choose(i => i.value === '1080p');
    assert.equal(env.state.played, null);
    assert.equal(env.state.menu.title, 'Ця версія зараз недоступна');
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
    assert.ok(env.state.menu.title.includes('Якість'));
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
