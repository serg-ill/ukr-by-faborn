/* ukr by Faborn 0.1.0-beta.1 — GitHub Pages edition. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else if (!root.FabornUkr) {
        root.FabornUkr = factory(root);
        root.FabornUkr.boot();
    }
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var VERSION = '0.1.0-beta.1';
    var NAME = 'ukr by Faborn';
    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h16a6 6 0 0 1 6 6v8H2V8a6 6 0 0 1 6-6z" fill="#168BFF"/><path d="M2 16h28v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#FFD54A"/><path d="M12 8.5 24 16 12 23.5z" fill="#101923"/></svg>';
    var L, $, installed = false, currentCatalog, requestSerial = 0, lastDiagnostic = '', returnController = 'content';
    var capturedBase = detectBase();

    function text(value) { return value === undefined || value === null ? '' : String(value); }
    function escapeHTML(value) {
        return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function normalize(value) {
        return text(value).toLowerCase().replace(/[’'`ʼ]/g, '').replace(/[^a-zа-яіїєґ0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
    function unique(values) {
        var out = [];
        values.forEach(function (value) { if (value && out.indexOf(value) < 0) out.push(value); });
        return out;
    }
    function mediaURL(value) {
        return /^https:\/\/(?:[a-z0-9-]+\.)*ashdi\.vip\//i.test(text(value)) && !/[\s<>"\\]/.test(value);
    }
    function safeBase(value) {
        return /^(https:\/\/[a-z0-9-]+\.github\.io(?:\/[^?#]*)?|http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?)$/i.test(value);
    }
    function fromScript(url) {
        var clean = text(url).split(/[?#]/)[0];
        return /\/ukr-by-faborn\.js$/.test(clean) ? clean.replace(/ukr-by-faborn\.js$/, '') : '';
    }
    function detectBase() {
        var doc = root.document, base = '', scripts, i;
        if (!doc) return '';
        if (doc.currentScript) base = fromScript(doc.currentScript.src);
        if (!base) {
            scripts = doc.getElementsByTagName('script');
            for (i = scripts.length - 1; i >= 0; i--) {
                base = fromScript(scripts[i].src);
                if (base) break;
            }
        }
        return safeBase(base) ? base : '';
    }
    function storage(key, fallback) {
        try { return L.Storage.get('faborn_ukr_' + key, fallback); } catch (ignore) { return fallback; }
    }
    function save(key, value) {
        try { L.Storage.set('faborn_ukr_' + key, value); } catch (ignore) { /* A full TV storage must not block playback. */ }
    }
    function baseURL() {
        var base = capturedBase, plugins;
        if (!base) {
            try {
                plugins = L.Storage.get('plugins', []);
                plugins.forEach(function (p) { if (!base) base = fromScript(typeof p === 'string' ? p : p.url); });
            } catch (ignore) { /* The settings override remains available. */ }
        }
        base = base || text(storage('pages', ''));
        if (base && base.charAt(base.length - 1) !== '/') base += '/';
        return safeBase(base) ? base : '';
    }
    function notify(message) { if (L && L.Noty) L.Noty.show(message); }
    function rememberController() {
        try { returnController = L.Controller.enabled().name || 'content'; } catch (ignore) { returnController = 'content'; }
    }
    function restore() { if (L && L.Controller) L.Controller.toggle(returnController); }
    function select(title, items, onSelect, onBack) {
        L.Select.show({
            title: title,
            items: items.map(function (item) {
                var row = {};
                Object.keys(item).forEach(function (key) { row[key] = item[key]; });
                row.title = escapeHTML(row.title);
                if (row.subtitle) row.subtitle = escapeHTML(row.subtitle);
                return row;
            }),
            onSelect: function (item) { L.Select.hide(); onSelect(item); },
            onBack: function () { L.Select.hide(); (onBack || restore)(); }
        });
    }
    function xhr(url, callback, timeout) {
        var req = new root.XMLHttpRequest(), finished = false;
        function done(error, body) {
            if (finished) return;
            finished = true;
            callback(error, body);
        }
        req.open('GET', url, true);
        req.timeout = timeout || 18000;
        req.onload = function () {
            if (req.status >= 200 && req.status < 300) done(null, req.responseText);
            else done(new Error('HTTP ' + req.status));
        };
        req.onerror = function () { done(new Error('Мережа або CORS')); };
        req.ontimeout = function () { done(new Error('Час очікування вичерпано')); };
        req.send();
        return req;
    }
    function validCatalog(catalog) {
        if (!catalog || catalog.schema !== 1 || !Array.isArray(catalog.titles)) return false;
        return catalog.titles.every(function (title) {
            return typeof title.id === 'string' && typeof title.title === 'string' && Array.isArray(title.releases) && title.releases.length && title.releases.every(function (release) {
                return ['uakino', 'kinoukr'].indexOf(release.source) >= 0 && release.audioLanguage === 'uk' && release.audioEvidence && Array.isArray(release.episodes) && release.episodes.length && release.episodes.every(function (episode) {
                    return mediaURL(episode.master) && episode.qualities && Object.keys(episode.qualities).length && Object.keys(episode.qualities).every(function (q) { return /^(2160|1440|1080|720|480|360)p$/.test(q) && mediaURL(episode.qualities[q]); });
                });
            });
        });
    }
    function loadCatalog(force, callback) {
        var base = baseURL();
        if (currentCatalog && !force) return callback(null, currentCatalog);
        if (!base) return callback(new Error('Не визначено адресу GitHub Pages. Перевірте URL розширення або вкажіть його в налаштуваннях ukr by Faborn.'));
        xhr(base + 'data/catalog.json?t=' + Math.floor(Date.now() / 60000), function (error, body) {
            var parsed;
            if (!error) {
                try {
                    parsed = JSON.parse(body);
                    if (!validCatalog(parsed)) throw new Error('Несумісний індекс');
                } catch (e) { error = new Error('Некоректний data/catalog.json: ' + e.message); }
            }
            if (error) { lastDiagnostic = error.message; return callback(error); }
            currentCatalog = parsed;
            lastDiagnostic = '';
            callback(null, parsed);
        });
    }
    function matchTitles(catalog, movie, query) {
        var names = unique([query, movie.title, movie.name, movie.original_title, movie.original_name].map(normalize));
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var year = parseInt(text(movie.release_date || movie.first_air_date).substr(0, 4), 10);
        return catalog.titles.map(function (item) {
            var aliases = unique([item.title, item.originalTitle].concat(item.aliases || []).map(normalize));
            var score = 0;
            names.forEach(function (name) {
                aliases.forEach(function (alias) {
                    if (name === alias) score = Math.max(score, 100);
                    else if (name.length >= 3 && alias.indexOf(name) >= 0) score = Math.max(score, 70);
                    else if (alias.length >= 3 && name.indexOf(alias) >= 0) score = Math.max(score, 55);
                });
            });
            if (score && year && item.year === year) score += 10;
            if (score && (tv ? item.type === 'tv' : item.type === 'movie')) score += 5;
            return { title: item, score: score };
        }).filter(function (row) { return row.score > 0; }).sort(function (a, b) { return b.score - a.score; }).map(function (row) { return row.title; });
    }
    function sourceName(id) { return id === 'uakino' ? 'UAKino' : 'KinoUkr'; }
    function titleRows(titles) {
        return titles.map(function (item) {
            return { title: item.title + (item.year ? ' (' + item.year + ')' : ''), subtitle: (item.type === 'tv' ? 'Серіал' : 'Фільм') + ' · ' + unique(item.releases.map(function (r) { return sourceName(r.source); })).join(' / '), value: item };
        });
    }
    function search(movie, catalog) {
        if (!L.Input || !L.Input.edit) return browse(movie, catalog);
        L.Input.edit({title: 'Пошук у бета-індексі', value: movie.title || movie.name || '', free: true}, function (value) {
            var matches = matchTitles(catalog, {}, value);
            showMatches(movie, catalog, matches, value);
        });
    }
    function browse(movie, catalog) {
        select('Бета-індекс · ' + catalog.titles.length + ' назв', titleRows(catalog.titles), function (item) { releases(movie, catalog, item.value); });
    }
    function showMatches(movie, catalog, matches, query) {
        var rows = titleRows(matches);
        if (!matches.length) rows.push({title: 'У бета-індексі немає цієї назви', subtitle: 'Це обмежений індекс, а не весь каталог сайтів.', action: 'browse'});
        rows.push({title: 'Змінити пошукову назву', action: 'search'});
        rows.push({title: 'Усі назви бета-індексу', action: 'browse'});
        select(NAME + (query ? ' · ' + query : ''), rows, function (row) {
            if (row.action === 'search') search(movie, catalog);
            else if (row.action === 'browse') browse(movie, catalog);
            else releases(movie, catalog, row.value);
        });
    }
    function open(movie) {
        var serial = ++requestSerial;
        rememberController();
        movie = movie || {};
        select(NAME, [{title: 'Завантаження індексу…', subtitle: 'Назад — скасувати'}], function () {}, function () { requestSerial++; restore(); });
        loadCatalog(false, function (error, catalog) {
            if (serial !== requestSerial) return;
            L.Select.hide();
            if (error) { restore(); return notify(error.message); }
            showMatches(movie, catalog, matchTitles(catalog, movie));
        });
    }
    function releases(movie, catalog, title) {
        var preferred = storage('source', 'uakino');
        var list = title.releases.filter(function (r) { return r.audioLanguage === 'uk' && r.episodes.length; }).slice();
        list.sort(function (a, b) { return (b.source === preferred ? 1 : 0) - (a.source === preferred ? 1 : 0); });
        if (!list.length) return notify('В індексі немає доступного українського релізу.');
        select(title.title + ' · джерело й озвучення', list.map(function (release) {
            return {title: sourceName(release.source) + ' · ' + release.voice, subtitle: 'Українська · ' + release.episodes.length + (title.type === 'tv' ? ' серій' : ' відео'), value: release};
        }), function (row) {
            save('source', row.value.source);
            if (title.type === 'tv') seasons(movie, catalog, title, row.value);
            else quality(movie, catalog, title, row.value, row.value.episodes[0]);
        }, function () { showMatches(movie, catalog, matchTitles(catalog, movie)); });
    }
    function seasons(movie, catalog, title, release) {
        var values = unique(release.episodes.map(function (e) { return e.season; })).sort(function (a, b) { return a - b; });
        select(title.title + ' · сезони', values.map(function (n) { return {title: 'Сезон ' + n, value: n}; }), function (row) {
            episodes(movie, catalog, title, release, row.value);
        }, function () { releases(movie, catalog, title); });
    }
    function episodes(movie, catalog, title, release, season) {
        var list = release.episodes.filter(function (e) { return e.season === season; }).sort(function (a, b) { return a.episode - b.episode; });
        var last = storage('last_' + title.id, '');
        select(title.title + ' · сезон ' + season, list.map(function (episode) {
            return {title: episode.title || 'Серія ' + episode.episode, subtitle: episode.state === 'unavailable' ? 'Недоступна в цьому озвученні · обери інший реліз' : release.voice + ' · ' + qualityNames(episode).join(' / ') + (episode.state === 'stale' ? ' · дані не оновлено' : ''), ghost: episode.state === 'unavailable', selected: episode.id === last, value: episode};
        }), function (row) { quality(movie, catalog, title, release, row.value); }, function () { seasons(movie, catalog, title, release); });
    }
    function qualityNames(episode) {
        return Object.keys(episode.qualities || {}).filter(function (q) { return mediaURL(episode.qualities[q]); }).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    }
    function pickURL(episode, preference) {
        var keys = qualityNames(episode), limit = parseInt(preference, 10), i;
        if (preference === 'auto' || !keys.length) return episode.master;
        if (!limit) return episode.qualities[keys[0]];
        for (i = 0; i < keys.length; i++) if (parseInt(keys[i], 10) <= limit) return episode.qualities[keys[i]];
        return episode.qualities[keys[keys.length - 1]];
    }
    function quality(movie, catalog, title, release, episode) {
        if (episode.state === 'unavailable') {
            return select('Ця версія зараз недоступна', [{title: 'Обрати інше озвучення або джерело', subtitle: 'Джерело повернуло HTTP 404 під час перевірки.'}], function () {
                releases(movie, catalog, title);
            }, function () { releases(movie, catalog, title); });
        }
        var selected = storage('quality', 'best');
        var rows = qualityNames(episode).map(function (q, index) {
            return {title: q === '2160p' ? '4K · 2160p' : q, value: q, selected: selected === q || (selected === 'best' && index === 0)};
        });
        rows.push({title: 'Авто · адаптивна якість', value: 'auto', selected: selected === 'auto'});
        select('Якість · ' + title.title, rows, function (row) {
            save('quality', row.value);
            launch(movie, catalog, title, release, episode, row.value);
        }, function () {
            if (title.type === 'tv') episodes(movie, catalog, title, release, episode.season);
            else releases(movie, catalog, title);
        });
    }
    function timelineKey(title, episode) { return 'faborn|' + title.id + '|' + (episode.season || 0) + '|' + (episode.episode || 0); }
    function availablePlaylist(release, episode) {
        var list = release.episodes.filter(function (e) { return e.season === episode.season; }).sort(function (a, b) { return a.episode - b.episode; });
        var index = -1, left, right;
        list.forEach(function (e, n) { if (e.id === episode.id) index = n; });
        if (index < 0 || list[index].state === 'unavailable') return [];
        left = index; right = index;
        while (left > 0 && list[left - 1].state !== 'unavailable' && list[left - 1].episode === list[left].episode - 1) left--;
        while (right + 1 < list.length && list[right + 1].state !== 'unavailable' && list[right + 1].episode === list[right].episode + 1) right++;
        return list.slice(left, right + 1);
    }
    function playData(movie, title, release, episode, preference) {
        var url = pickURL(episode, preference), result = {
            url: url, faborn_url: url, faborn_episode: episode.id, faborn_title: title.id,
            quality: episode.qualities,
            title: title.title + (title.type === 'tv' ? ' · S' + episode.season + 'E' + episode.episode : '') + ' · ' + release.voice,
            subtitles: (episode.subtitles || []).filter(function (s) { return mediaURL(s.url); }),
            season: episode.season, episode: episode.episode, voice_name: release.voice,
            isonline: true
        };
        if (L.Timeline && L.Utils && L.Utils.hash) result.timeline = L.Timeline.view(L.Utils.hash(timelineKey(title, episode)));
        // A manually selected different title must not be recorded as the original TMDB card.
        var cardNames = unique([movie.title, movie.name, movie.original_title, movie.original_name].map(normalize));
        var indexedNames = unique([title.title, title.originalTitle].concat(title.aliases || []).map(normalize));
        var cardYear = parseInt(text(movie.release_date || movie.first_air_date).substr(0, 4), 10);
        if (cardNames.some(function (n) { return indexedNames.indexOf(n) >= 0; }) && (!cardYear || title.year === cardYear)) result.card = movie;
        return result;
    }
    function launch(movie, catalog, title, release, episode, preference) {
        var isTizen = L.Platform && L.Platform.is && L.Platform.is('tizen');
        if (L.Platform && !isTizen) {
            return select('Тестова бета для Samsung Tizen', [{title: 'Потрібен телевізор із плеєром Tizen / AVPlay', subtitle: 'Ashdi обмежує CORS відеосегментів. У браузерному плеєрі Lampa цей потік не працює.'}], function () {
                quality(movie, catalog, title, release, episode);
            }, function () { quality(movie, catalog, title, release, episode); });
        }
        if (isTizen && L.Storage.field && L.Storage.field('player') !== 'tizen') {
            return select('Обери штатний плеєр Tizen', [{title: 'Lampa → Налаштування → Плеєр → Tizen', subtitle: 'Після зміни налаштування повтори запуск. Сумісність AVPlay перевіряється цією бетою на телевізорі.'}], function () { restore(); }, restore);
        }
        var url = pickURL(episode, preference);
        notify('Перевіряю доступність потоку…');
        xhr(url, function (error, body) {
            if (error || text(body).indexOf('#EXTM3U') < 0) {
                lastDiagnostic = 'Потік: ' + (error ? error.message : 'Некоректний HLS');
                return select('Потік зараз недоступний', [
                    {title: 'Оновити індекс із GitHub', action: 'refresh'},
                    {title: 'Обрати інший реліз', action: 'release'}
                ], function (row) {
                    if (row.action === 'release') releases(movie, catalog, title);
                    else loadCatalog(true, function (err, fresh) {
                        if (err) notify(err.message);
                        else showMatches(movie, fresh, matchTitles(fresh, movie));
                    });
                }, function () { quality(movie, catalog, title, release, episode); });
            }
            var data = playData(movie, title, release, episode, preference);
            var playlist = title.type === 'tv' ? availablePlaylist(release, episode).map(function (e) {
                return playData(movie, title, release, e, preference);
            }) : [];
            data.playlist = playlist;
            save('last_' + title.id, episode.id);
            if (L.Player.playlist) L.Player.playlist(playlist);
            L.Player.play(data);
        });
    }
    function diagnostics() {
        loadCatalog(false, function (error, catalog) {
            var lines = [NAME + ' ' + VERSION, 'GitHub Pages: ' + (baseURL() || 'не визначено')];
            if (catalog) {
                lines.push('Індекс: ' + catalog.generatedAt + ' · назв: ' + catalog.titles.length);
                (catalog.warnings || []).forEach(function (warning) { lines.push(warning); });
            }
            if (error || lastDiagnostic) lines.push(error ? error.message : lastDiagnostic);
            if (L.Storage.field) lines.push('Плеєр Lampa: ' + L.Storage.field('player') + ' · для бети потрібен Tizen / AVPlay');
            select('Діагностика', lines.map(function (line) { return {title: line}; }), function () { diagnostics(); }, restore);
        });
    }
    function settings() {
        var api = L.SettingsApi;
        if (!api || !api.addComponent || !api.addParam) return;
        api.addComponent({component: 'faborn_ukr', name: NAME, icon: ICON});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_source', type: 'select', values: {uakino: 'UAKino', kinoukr: 'KinoUkr'}, default: 'uakino'}, field: {name: 'Пріоритет джерела', description: 'Вибір джерела також доступний перед переглядом.'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_quality', type: 'select', values: {best: 'Найвища доступна', auto: 'Авто', '2160p': '4K', '1080p': '1080p', '720p': '720p', '480p': '480p'}, default: 'best'}, field: {name: 'Бажана якість', description: 'Підсвічує варіант у меню перед запуском.'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_refresh', type: 'button'}, field: {name: 'Оновити індекс із GitHub'}, onChange: function () {
            loadCatalog(true, function (error, catalog) { notify(error ? error.message : 'Індекс оновлено: ' + catalog.titles.length + ' назв'); });
        }});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_browse', type: 'button'}, field: {name: 'Відкрити бета-індекс'}, onChange: function () { rememberController(); loadCatalog(false, function (error, catalog) { if (error) notify(error.message); else browse({}, catalog); }); }});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_diagnostic', type: 'button'}, field: {name: 'Версія та діагностика', description: VERSION}, onChange: function () { rememberController(); diagnostics(); }});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_pages', type: 'input', default: ''}, field: {name: 'Адреса GitHub Pages', description: 'Зазвичай визначається автоматично. Резерв: https://USERNAME.github.io/REPOSITORY/'}});
    }
    function attach(event) {
        if (!event || event.type !== 'complite' || !event.object || !event.object.activity || !event.data || !event.data.movie) return;
        var render = event.object.activity.render(), button, anchor;
        if (!render || render.find('.view--faborn-ukr').length) return;
        button = $('<div class="full-start__button selector view--faborn-ukr" data-subtitle="' + NAME + ' · ' + VERSION + '">' + ICON + '<span>' + NAME + '</span></div>');
        button.on('hover:enter', function () { open(event.data.movie); });
        // Modern Lampa keeps .view--torrent inside a hidden source group. The requested icon belongs on the visible card row.
        anchor = render.find('.full-start-new__buttons .button--play').first();
        if (anchor.length) { anchor.after(button); return; }
        anchor = render.find('.view--torrent').first();
        if (anchor.length) anchor.after(button);
        else {
            anchor = render.find('.full-start__buttons').first();
            if (anchor.length) anchor.append(button);
            else {
                anchor = render.find('.full-start__button').last();
                if (anchor.length) anchor.after(button);
            }
        }
    }
    function install() {
        if (installed || !root.Lampa || !root.jQuery) return;
        L = root.Lampa; $ = root.jQuery;
        if (!L.Listener || !L.Select || !L.Player) return;
        installed = true;
        if (!$('#faborn-ukr-style').length) $('body').append('<style id="faborn-ukr-style">.view--faborn-ukr svg{width:1.65em;height:1.65em;flex-shrink:0}.full-start-new__buttons .full-start__button.view--faborn-ukr span{display:inline-block}.view--faborn-ukr.focus{box-shadow:0 0 0 .12em #FFD54A}</style>');
        L.Listener.follow('full', attach);
        if (L.Player.listener) L.Player.listener.follow('start', function (data) {
            // Lampa applies its global quality preference before this event. Preserve the explicit selection only for our streams.
            if (!data || !data.faborn_title || !mediaURL(data.faborn_url)) return;
            data.url = data.faborn_url;
            save('last_' + data.faborn_title, data.faborn_episode);
        });
        settings();
    }
    function boot() {
        var tries = 0;
        function attempt() {
            install();
            if (!installed && tries++ < 120) root.setTimeout(attempt, 500);
        }
        attempt();
    }
    return {
        version: VERSION, name: NAME, boot: boot, open: open,
        // Pure helpers are also used by the offline package checks.
        normalize: normalize, matchTitles: matchTitles, mediaURL: mediaURL,
        safeBase: safeBase, validCatalog: validCatalog, qualityNames: qualityNames,
        pickURL: pickURL, timelineKey: timelineKey, availablePlaylist: availablePlaylist, escapeHTML: escapeHTML
    };
}));
