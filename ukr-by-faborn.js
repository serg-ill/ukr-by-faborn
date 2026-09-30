/* ukr by Faborn 0.1.0-beta.4 — GitHub Pages edition. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else if (!root.FabornUkr) {
        root.FabornUkr = factory(root);
        root.FabornUkr.boot();
    }
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var VERSION = '0.1.0-beta.4';
    var NAME = 'ukr by Faborn';
    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h16a6 6 0 0 1 6 6v8H2V8a6 6 0 0 1 6-6z" fill="#168BFF"/><path d="M2 16h28v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#FFD54A"/><path d="M12 8.5 24 16 12 23.5z" fill="#101923"/></svg>';
    var L, $, installed = false, currentCatalog, catalogLoadedAt = 0, requestSerial = 0, lastDiagnostic = '', returnController = 'content';
    var pendingRequest, playbackTimer, watchedPlayback, playbackContext;
    var directTrace = [], directContext;
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
    function xhr(url, callback, timeout, post, ajax) {
        var req = new root.XMLHttpRequest(), finished = false;
        function done(error, body) {
            if (finished) return;
            finished = true;
            callback(error, body, req.status || 0);
        }
        req.open(post ? 'POST' : 'GET', url, true);
        req.timeout = timeout || 18000;
        if (post) req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        if (ajax) req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        req.onload = function () {
            if (req.status >= 200 && req.status < 300) done(null, req.responseText);
            else done(new Error('HTTP ' + req.status));
        };
        req.onerror = function () { done(new Error('Мережа / CORS / TLS: HTTP-статус недоступний')); };
        req.ontimeout = function () { done(new Error('Час очікування вичерпано')); };
        try { req.send(post || null); } catch (error) { done(error); }
        return req;
    }

    // Read public markup as data. Never attach source HTML or execute its scripts.
    function decodeHTML(value) {
        var entities = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—'};
        return text(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, code) {
            if (code.charAt(0) !== '#') return own(entities, code) ? entities[code] : all;
            var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.substr(2), 16) : parseInt(code.substr(1), 10);
            return n > 0 && n <= 65535 ? String.fromCharCode(n) : all;
        });
    }
    function cleanMarkup(html) { return text(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''); }
    function plain(html) { return decodeHTML(cleanMarkup(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
    function attrs(tag) {
        var out = Object.create(null), re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, m;
        while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeHTML(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]);
        return out;
    }
    function uakinoURL(url) { return /^https:\/\/uakino\.best\/[^\s<>"'\\]*$/i.test(text(url)); }
    function sourceURL(url) {
        url = decodeHTML(text(url));
        if (url.indexOf('//') === 0) url = 'https:' + url;
        else if (url.charAt(0) === '/') url = 'https://uakino.best' + url;
        return uakinoURL(url) ? url.split('#')[0] : '';
    }
    function pageID(url) { var m = /\/(\d+)-[^/]+\.html(?:\?|$)/.exec(text(url)); return m ? m[1] : ''; }
    function embedURL(url) {
        url = text(url).replace(/^\/\//, 'https://');
        return /^https:\/\/ashdi\.vip\/(?:vod|serial)\/\d+\/?(?:\?[^\s<>"'\\]*)?$/i.test(url) ? url : '';
    }
    function seasonNumber(value) { var m = /(?:(\d+)\s*(?:сезон|season)|(?:сезон|season)\s*(\d+))/i.exec(value); return m ? parseInt(m[1] || m[2], 10) : 0; }
    function withoutSeason(value) { return text(value).replace(/\s*\d+\s*(?:сезон|season)\s*/i, '').trim(); }
    function fieldValue(html, label) {
        var re = /<div\b([^>]*\bclass\s*=["'][^"']*\bfi-label\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>\s*<div\b([^>]*)>([\s\S]*?)<\/div>/gi, m;
        while ((m = re.exec(html))) {
            if (/(^|\s)fi-label(\s|$)/.test(attrs(m[1])['class'] || '') && label.test(plain(m[2]))) return plain(m[4]);
        }
        return '';
    }
    function challenge(html) { return /<title[^>]*>\s*(?:Just a moment|Attention Required)|id=["']challenge-(?:running|stage)|cf-chl-|Триває перевірка безпеки/i.test(html); }
    function parseSearch(html) {
        if (challenge(html)) throw new Error('UAKino повернув перевірку Cloudflare замість результатів.');
        var clean = cleanMarkup(html), rows = [], seen = Object.create(null);
        if (!/Пошук по сайту|За Вашим запитом|Пошук за фразою/i.test(plain(clean))) throw new Error('Замість результатів отримано іншу сторінку UAKino.');
        var chunks = clean.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bshort-item\b[^"']*["'][^>]*>/i);
        chunks.slice(1).forEach(function (chunk) {
            var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
            while ((m = re.exec(chunk))) {
                var a = attrs(m[1]);
                if (!/(^|\s)movie-title(\s|$)/.test(a['class'] || '')) continue;
                var url = sourceURL(a.href), id = pageID(url), name = plain(m[2]);
                if (!id || !name || seen[id]) break;
                seen[id] = true;
                var year = /\b(?:19|20)\d{2}\b/.exec(fieldValue(chunk, /Рік виходу/i));
                var season = seasonNumber(plain(chunk).slice(0,400)) || seasonNumber(url.replace(/-/g, ' '));
                rows.push({id: id, url: url, title: name, year: year ? +year[0] : 0, season: season});
                break;
            }
        });
        if (!rows.length && !/За Вашим запитом|Пошук по сайту|знайдено\s*0|не знайдено|не дав результат/i.test(clean)) throw new Error('Невідомий формат сторінки пошуку UAKino.');
        return rows.slice(0,60);
    }
    function parseSource(html, url) {
        if (!uakinoURL(url) || !pageID(url)) throw new Error('Некоректна сторінка UAKino.');
        if (challenge(html)) throw new Error('UAKino повернув перевірку Cloudflare замість сторінки.');
        var clean = cleanMarkup(html).split(/<[^>]+id=["']dle-comments/i)[0];
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean), original = /<span\b[^>]*class=["']origintitle["'][^>]*>([\s\S]*?)<\/span>/i.exec(clean);
        if (!h) throw new Error('Не знайдено назву фільму на сторінці UAKino.');
        var name = plain(h[1]), season = seasonNumber(name), year = /\b(?:19|20)\d{2}\b/.exec(fieldValue(clean, /Рік виходу/i));
        var voice = fieldValue(clean, /(?:Мова озвучення|Озвучення)/i);
        var language = /<meta\b[^>]*itemprop=["']inLanguage["'][^>]*content=["']uk["']/i.test(clean) || /<meta\b[^>]*content=["']uk["'][^>]*itemprop=["']inLanguage["']/i.test(clean);
        if (!language && !/україн/i.test(voice)) throw new Error('Сторінка не підтверджує українське озвучення.');
        var title = {id: 'uakino-' + pageID(url), title: withoutSeason(name), originalTitle: original ? withoutSeason(plain(original[1])) : '', year: year ? +year[0] : 0, type: season || /schema.org\/TVSeries/i.test(clean) ? 'tv' : 'movie', sourcePage: url, season: season || 1, audioEvidence: voice || 'inLanguage=uk', voice: voice || 'Українське озвучення', releases: [], embeds: [], seasonPages: []};
        var re = /<(iframe|link|div|li)\b([^>]*)>/gi, m;
        while ((m = re.exec(clean))) {
            var a = attrs(m[2]), embed = embedURL(a.src || a['data-src'] || (a.itemprop === 'video' ? a.value : ''));
            if (embed && title.embeds.indexOf(embed) < 0) title.embeds.push(embed);
            if (/(^|\s)playlists-ajax(\s|$)/.test(a['class'] || '') && a['data-news_id'] === pageID(url) && /^[a-z0-9_]+$/i.test(a['data-xfname'] || '')) {
                title.playlistURL = 'https://uakino.best/engine/ajax/playlists.php?news_id=' + pageID(url) + '&xfield=' + encodeURIComponent(a['data-xfname']);
            }
        }
        var seasons = /<ul\b[^>]*class=["'][^"']*\bseasons\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(clean);
        if (seasons) {
            re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            while ((m = re.exec(seasons[1]))) {
                var next = sourceURL(attrs(m[1]).href);
                if (pageID(next) && next !== url) title.seasonPages.push({title: plain(m[2]), url: next});
            }
        }
        addEpisodeRefs(title, clean);
        return title;
    }
    function addEpisodeRefs(title, html) {
        var re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi, m, seen = Object.create(null), clean = cleanMarkup(html);
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), embed = embedURL(a['data-file']), label = plain(m[2]);
            var n = /(?:серія|серії|episode)\s*(\d+)|(\d+)\s*(?:серія|серії)/i.exec(label);
            var voice = plain(a['data-voice'] || title.voice);
            if (!embed || !n || /росій|русск|english|англій/i.test(voice)) continue;
            var number = parseInt(n[1] || n[2],10), season = +a['data-season'] || title.season, key = voice + '|' + season + '|' + number;
            if (seen[key]) continue;
            seen[key] = true;
            var release = title.releases.filter(function (r) { return r.voice === voice; })[0];
            if (!release) {
                release = {id: title.id + '-voice-' + title.releases.length, source: 'uakino', voice: voice, audioLanguage: 'uk', audioEvidence: title.audioEvidence, episodes: []};
                title.releases.push(release);
            }
            release.episodes.push({id: release.id + '-s' + season + 'e' + number, title: 'Серія ' + number, season: season, episode: number, embed: embed, state: 'pending'});
        }
    }
    function quotedProperty(source, key) {
        var re = new RegExp('(?:^|[,{\\s])(?:["\']?' + key + '["\']?)\\s*:\\s*(["\'])((?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*)\\1'), m = re.exec(source);
        if (!m) return '';
        return decodeHTML(m[2].replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, function (_, c) {
            if (/^u/.test(c) && c.length === 5) return String.fromCharCode(parseInt(c.substr(1),16));
            if (/^x/.test(c) && c.length === 3) return String.fromCharCode(parseInt(c.substr(1),16));
            return c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c;
        }));
    }
    function parseEmbed(html) {
        var start = text(html).search(/new\s+Playerjs\s*\(/), config = text(html).substr(start), file, subtitles = [], m, re;
        if (start < 0) throw new Error('Ashdi: не знайдено відкритий HLS-плеєр.');
        file = quotedProperty(config, 'file');
        if (!mediaURL(file) || !/\.m3u8(?:\?|$)/i.test(file)) throw new Error('Ashdi: цей формат плеєра поки не підтримується.');
        re = /\[([^\]]+)\](https:\/\/[^,\s]+)/g;
        var raw = quotedProperty(config, 'subtitle');
        while ((m = re.exec(raw))) if (mediaURL(m[2])) subtitles.push({label:m[1],url:m[2]});
        return {master:file,subtitles:subtitles};
    }
    function resolveMedia(base, value) {
        if (/^https:\/\//i.test(value)) return mediaURL(value) ? value : '';
        if (/^(?:\/\/|[a-z]+:)/i.test(value)) return '';
        var origin = /^https:\/\/[^/]+/.exec(base)[0], path = value.charAt(0) === '/' ? value : base.replace(origin,'').split('?')[0].replace(/[^/]*$/, '') + value;
        var parts = [];
        path.split('/').forEach(function (part) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); });
        var url = origin + '/' + parts.join('/');
        return mediaURL(url) ? url : '';
    }
    function parseMaster(body, url) {
        if (!/^\s*#EXTM3U/.test(body)) throw new Error('Замість HLS отримано іншу сторінку.');
        var qualities = {}, pending = '', advertised = false;
        text(body).split(/\r?\n/).forEach(function (line) {
            line = line.trim();
            if (line.indexOf('#EXT-X-STREAM-INF:') === 0) { pending = line; advertised = true; }
            else if (pending && line && line.charAt(0) !== '#') {
                var variant = resolveMedia(url,line), resolution = /RESOLUTION=(\d+)x(\d+)/.exec(pending), path = /\/hls\/(2160|1440|1080|720|480|360)\//.exec(variant), label = path ? path[1]+'p' : '';
                if (!variant) throw new Error('HLS містить непідтримуваний відеохост.');
                if (!label && resolution) [[3840,2160],[2560,1440],[1920,1080],[1280,720],[854,480],[640,360]].some(function (size) {
                    if (+resolution[1] >= size[0] || +resolution[2] >= size[1]) { label = size[1]+'p'; return true; } return false;
                });
                if (label) qualities[label] = variant;
                pending = '';
            }
        });
        if (advertised && !Object.keys(qualities).length) throw new Error('У HLS немає підтримуваних варіантів якості.');
        if (!advertised && !/#EXTINF:/.test(body)) throw new Error('Порожній HLS-плейлист.');
        return qualities;
    }
    function trace(stage, outcome) {
        var line = stage + ': ' + text(outcome).substr(0,260);
        if (directTrace[directTrace.length - 1] !== line) directTrace.push(line);
        directTrace = directTrace.slice(-10);
        save('direct_trace', directTrace);
    }
    function directError(stage, error, retry, back) {
        var message = stage + ': ' + text(error.message || error);
        trace(stage, text(error.message || error));
        lastDiagnostic = message;
        select('UAKino · не вдалося завершити', [
            {title: 'Повторити', subtitle: message, action: 'retry'},
            {title: 'Версія та діагностика', subtitle: 'Збережено етап і результат запиту.', action: 'diagnostics'},
            {title: 'Повернутися', action: 'back'}
        ], function (row) {
            if (row.action === 'retry') retry();
            else if (row.action === 'diagnostics') diagnostics();
            else back();
        }, back);
    }
    function directRequest(serial, stage, url, callback, post, ajax) {
        if (serial !== requestSerial) return;
        if (!uakinoURL(url) && !mediaURL(url)) return callback(new Error('Непідтримувана адреса джерела.'));
        trace(stage, 'запит');
        var completed = false;
        var req = xhr(url, function (error, body, status) {
            completed = true;
            if (serial !== requestSerial) return;
            pendingRequest = null;
            trace(stage, error ? error.message : 'HTTP ' + status);
            callback(error, body);
        }, 18000, post, ajax);
        if (!completed) pendingRequest = req;
    }
    function directLoading(stage, back) {
        select('UAKino · ' + stage, [{title: 'Завантаження… · Назад — скасувати', subtitle: 'Запит із телевізора, до 18 секунд на етап.'}], function () { cancelPending(); back(); }, function () { cancelPending(); back(); });
    }
    function directSearch(movie, query, page) {
        query = text(query || movie.title || movie.name || movie.original_title || movie.original_name).trim().substr(0,60);
        var back = function () { open(movie); };
        if (!query) return directEdit(movie, '');
        cancelPending();
        var serial = requestSerial;
        page = page || 1;
        if (page === 1) { directTrace = []; save('direct_trace', []); lastDiagnostic = ''; }
        directLoading('пошук «' + query + '»', back);
        // Same form and fields as UAKino's public quick search; no proxy or credentials.
        directRequest(serial, 'Пошук UAKino', 'https://uakino.best/ua/', function (error, body) {
            if (error) return directError('Пошук UAKino', error, function () { directSearch(movie,query,page); }, back);
            var matches;
            try { matches = parseSearch(body); } catch (e) { return directError('Результати UAKino', e, function () { directSearch(movie,query,page); }, back); }
            trace('Результати UAKino', matches.length + ' назв');
            directContext = {movie:movie, query:query, page:page, matches:matches};
            directResults(directContext);
        }, 'do=search&subaction=search&from_page=' + page + '&story=' + encodeURIComponent(query));
    }
    function directEdit(movie, value) {
        if (!L.Input || !L.Input.edit) return open(movie);
        L.Input.edit({title:'Пошук UAKino',value:value || movie.title || movie.name || '',free:true},function (query) { if (query) directSearch(movie,query); else open(movie); });
    }
    function directResults(context) {
        var rows = context.matches.map(function (item) {
            return {title:item.title + (item.year ? ' ('+item.year+')' : ''), subtitle:'UAKino' + (item.season ? ' · сезон ' + item.season : '') + ' · обери відповідну назву', value:item};
        });
        if (!rows.length) rows.push({title:'За цим запитом нічого не знайдено',subtitle:'Спробуй оригінальну назву або зміни запит.',action:'edit'});
        var original = context.movie.original_title || context.movie.original_name;
        if (original && normalize(original) !== normalize(context.query)) rows.push({title:'Шукати: ' + original,action:'original'});
        rows.push({title:'Змінити назву пошуку',action:'edit'});
        if (context.matches.length >= 10 && context.page < 10) rows.push({title:'Наступна сторінка результатів',action:'next'});
        if (context.page > 1) rows.push({title:'Попередня сторінка результатів',action:'previous'});
        rows.push({title:'Версія та діагностика',action:'diagnostics'});
        select('UAKino · ' + context.query,rows,function (row) {
            if (row.action === 'edit') directEdit(context.movie,context.query);
            else if (row.action === 'original') directSearch(context.movie,original);
            else if (row.action === 'next' || row.action === 'previous') directSearch(context.movie,context.query,context.page + (row.action === 'next' ? 1 : -1));
            else if (row.action === 'diagnostics') diagnostics();
            else directPage(context.movie,row.value.url,context);
        },function () { open(context.movie); });
    }
    function directPage(movie, url, context) {
        cancelPending();
        var serial = requestSerial, stage = 'Сторінка UAKino';
        var back = function () { directResults(context); }, retry = function () { directPage(movie,url,context); };
        directLoading('читання сторінки',back);
        directRequest(serial,stage,url,function (error,body) {
            if (error) return directError(stage,error,retry,back);
            var title;
            try { title = parseSource(body,url); } catch (e) { return directError(stage,e,retry,back); }
            function ready() {
                if (!title.releases.length && title.type === 'movie') title.embeds.forEach(function (embed,index) {
                    title.releases.push({id:title.id+'-player-'+index,source:'uakino',voice:title.voice+(index ? ' · плеєр '+(index+1) : ''),audioLanguage:'uk',audioEvidence:title.audioEvidence,episodes:[{id:title.id+'-video-'+index,season:0,episode:0,embed:embed,state:'pending'}]});
                });
                if (!title.releases.length) return directError('Список відео',new Error('Не знайдено підтримуваний плеєр Ashdi або список серій.'),retry,back);
                trace('Список відео',title.releases.length+' озвучень');
                var catalog = {direct:true,titles:[title],context:context};
                releases(movie,catalog,title);
            }
            if (!title.releases.length && title.playlistURL) {
                stage = 'Список серій UAKino';
                directLoading('список серій',back);
                directRequest(serial,stage,title.playlistURL,function (err,response) {
                    if (err) return directError(stage,err,retry,back);
                    try {
                        var data = JSON.parse(response);
                        if (!data || typeof data.response !== 'string') throw new Error('Невідомий формат списку серій.');
                        addEpisodeRefs(title,data.response);
                    } catch (e) { return directError(stage,new Error('Не вдалося прочитати список серій: '+e.message),retry,back); }
                    ready();
                },null,true);
            } else ready();
        });
    }
    function resolveDirect(movie,catalog,title,release,episode,callback) {
        cancelPending();
        var serial = requestSerial;
        var back = function () { if (title.type === 'tv') episodes(movie,catalog,title,release,episode.season); else releases(movie,catalog,title); };
        var retry = function () { resolveDirect(movie,catalog,title,release,episode,callback); };
        directLoading('отримання потоку Ashdi',back);
        directRequest(serial,'Плеєр Ashdi',episode.embed,function (error,body) {
            if (error) return directError('Плеєр Ashdi',error,retry,back);
            var parsed;
            try { parsed = parseEmbed(body); } catch (e) { return directError('Плеєр Ashdi',e,retry,back); }
            directLoading('перевірка доступної якості',back);
            directRequest(serial,'HLS-маніфест',parsed.master,function (err,manifest) {
                if (err) return directError('HLS-маніфест',err,retry,back);
                try { episode.qualities = parseMaster(manifest,parsed.master); } catch (e) { return directError('HLS-маніфест',e,retry,back); }
                episode.master = parsed.master; episode.subtitles = parsed.subtitles;
                episode.resolvedAt = Date.now(); episode.state = 'resolved';
                trace('Доступна якість',qualityNames(episode).join(' / ') || 'Авто');
                callback();
            });
        });
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
        if (currentCatalog && !force && Date.now() - catalogLoadedAt < 60000) return callback(null, currentCatalog);
        if (!base) return callback(new Error('Не визначено адресу GitHub Pages. Перевірте URL розширення або вкажіть його в налаштуваннях ukr by Faborn.'));
        return xhr(base + 'data/catalog.json?t=' + Date.now(), function (error, body) {
            var parsed;
            if (!error) {
                try {
                    parsed = JSON.parse(body);
                    if (!validCatalog(parsed)) throw new Error('Несумісний індекс');
                } catch (e) { error = new Error('Некоректний data/catalog.json: ' + e.message); }
            }
            if (error) { lastDiagnostic = error.message; return callback(error); }
            currentCatalog = parsed;
            catalogLoadedAt = Date.now();
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
        rows.unshift({title: 'Знайти на UAKino', subtitle: 'Пошук за назвою картки · поза тестовим індексом', action: 'uakino'});
        if (!matches.length) rows.push({title: 'Не знайдено: ' + (query || movie.title || movie.name || movie.original_title || movie.original_name || 'назва картки не передана'), subtitle: 'У тестовому індексі ' + catalog.titles.length + ' назви. Натисни, щоб відкрити їхній список.', action: 'browse'});
        rows.push({title: 'Змінити пошукову назву', action: 'search'});
        rows.push({title: 'Усі назви бета-індексу', action: 'browse'});
        rows.push({title: 'Версія та діагностика', subtitle: VERSION, action: 'diagnostics'});
        select(NAME + ' · ' + VERSION + (query ? ' · ' + query : ''), rows, function (row) {
            if (row.action === 'uakino') directSearch(movie);
            else if (row.action === 'search') search(movie, catalog);
            else if (row.action === 'browse') browse(movie, catalog);
            else if (row.action === 'diagnostics') diagnostics();
            else releases(movie, catalog, row.value);
        });
    }
    function open(movie) {
        cancelPending();
        var serial = requestSerial;
        rememberController();
        movie = movie || {};
        select(NAME + ' · ' + VERSION, [
            {title: 'Знайти на UAKino', subtitle: 'Пошук за назвою картки', action:'uakino'},
            {title: 'Завантаження тестового індексу…', action:'waiting'},
            {title: 'Версія та діагностика', action:'diagnostics'}
        ], function (row) { if (row.action === 'uakino') directSearch(movie); else if (row.action === 'diagnostics') { cancelPending(); diagnostics(); } else open(movie); }, function () { cancelPending(); restore(); });
        var completed = false;
        var req = loadCatalog(false, function (error, catalog) {
            completed = true;
            if (serial !== requestSerial) return;
            pendingRequest = null;
            L.Select.hide();
            if (error) { notify(error.message); catalog = {titles: []}; }
            showMatches(movie, catalog, matchTitles(catalog, movie));
        });
        if (!completed) pendingRequest = req;
    }
    function releases(movie, catalog, title) {
        var preferred = storage('source', 'uakino');
        var list = title.releases.filter(function (r) { return r.audioLanguage === 'uk' && r.episodes.length; }).slice();
        list.sort(function (a, b) { return (b.source === preferred ? 1 : 0) - (a.source === preferred ? 1 : 0); });
        if (!list.length) return notify('В індексі немає доступного українського релізу.');
        var rows = list.map(function (release) {
            return {title: sourceName(release.source) + ' · ' + release.voice, subtitle: 'Українська · ' + release.episodes.length + (title.type === 'tv' ? ' серій' : ' відео'), value: release};
        });
        if (catalog.direct && title.seasonPages.length) rows.push({title:'Інші сезони на UAKino',action:'seasons'});
        select(title.title + ' · джерело й озвучення', rows, function (row) {
            if (row.action === 'seasons') return select('Сезони UAKino',title.seasonPages.map(function (p) { return {title:p.title,value:p}; }),function (p) { directPage(movie,p.value.url,catalog.context); },function () { releases(movie,catalog,title); });
            save('source', row.value.source);
            if (title.type === 'tv') seasons(movie, catalog, title, row.value);
            else quality(movie, catalog, title, row.value, row.value.episodes[0]);
        }, function () { if (catalog.direct) directResults(catalog.context); else showMatches(movie, catalog, matchTitles(catalog, movie)); });
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
            return {title: episode.title || 'Серія ' + episode.episode, subtitle: episode.state === 'unavailable' ? 'Недоступна в цьому озвученні · обери інший реліз' : release.voice + ' · ' + (qualityNames(episode).join(' / ') || 'якість після вибору серії') + (episode.state === 'stale' ? ' · дані не оновлено' : ''), ghost: episode.state === 'unavailable', selected: episode.id === last, value: episode};
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
        if (catalog.direct && (!episode.resolvedAt || Date.now() - episode.resolvedAt > 60000)) return resolveDirect(movie,catalog,title,release,episode,function () { quality(movie,catalog,title,release,episode); });
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
            url: url, faborn_url: url, faborn_episode: episode.id, faborn_title: title.id, faborn_release: release.id, faborn_quality: preference,
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
    function locate(catalog, titleId, releaseId, episodeId) {
        var found;
        catalog.titles.forEach(function (title) {
            if (title.id !== titleId) return;
            title.releases.forEach(function (release) {
                if (release.id !== releaseId) return;
                release.episodes.forEach(function (episode) {
                    if (episode.id === episodeId) found = {title: title, release: release, episode: episode};
                });
            });
        });
        return found;
    }
    function cancelPending() {
        requestSerial++;
        if (pendingRequest && pendingRequest.abort) pendingRequest.abort();
        pendingRequest = null;
    }
    function clearPlaybackWatch() {
        if (playbackTimer) root.clearTimeout(playbackTimer);
        playbackTimer = null;
        watchedPlayback = null;
    }
    function playbackProblem(message, data) {
        if (!data || watchedPlayback !== data) return;
        if (L.Player.playdata && L.Player.playdata() !== data) { clearPlaybackWatch(); return; }
        var context = playbackContext, catalog = context && context.catalog || currentCatalog;
        var found = catalog && locate(catalog, data.faborn_title, data.faborn_release, data.faborn_episode);
        clearPlaybackWatch();
        lastDiagnostic = message;
        save('last_error', message);
        if (L.Player.close) L.Player.close();
        if (!context || !found) { restore(); notify(message); return; }
        select('Відео не запустилося', [
            {title: 'Оновити посилання й повторити', subtitle: message, action: 'retry'},
            {title: 'Обрати іншу якість', subtitle: 'Для перевірки спробуй 1080p або 720p.', action: 'quality'},
            {title: 'Обрати інше озвучення або джерело', action: 'release'}
        ], function (row) {
            if (row.action === 'retry') {
                if (catalog.direct) found.episode.resolvedAt = 0;
                launch(context.movie, catalog, found.title, found.release, found.episode, data.faborn_quality);
            }
            else if (row.action === 'quality') quality(context.movie, catalog, found.title, found.release, found.episode);
            else releases(context.movie, catalog, found.title);
        }, restore);
    }
    function watchPlayback(data) {
        clearPlaybackWatch();
        if (!data || !data.faborn_title || !mediaURL(data.faborn_url)) return;
        watchedPlayback = data;
        playbackTimer = root.setTimeout(function () {
            playbackProblem('Плеєр не почав відтворення за 45 секунд. Посилання могло змінитися або телевізор не зміг відкрити цей потік.', data);
        }, 45000);
    }
    function playbackError(event, data) {
        if (!data || watchedPlayback !== data || !event) return;
        var detail = event.error || event;
        if (typeof detail === 'object') detail = detail.message || detail.code;
        root.setTimeout(function () { playbackProblem('Помилка плеєра: ' + text(detail || 'невідома помилка'), data); }, 0);
    }
    function watchNativeError(data) {
        if (!data || watchedPlayback !== data || !L.PlayerVideo || !L.PlayerVideo.video) return;
        try {
            var video = L.PlayerVideo.video();
            // Lampa's Tizen adapter puts the native error in event.error, not video.error.
            // Its own listener is destroyed together with this video object.
            if (video && video.addEventListener) video.addEventListener('error', function (event) { playbackError(event, data); });
        } catch (ignore) { /* The startup timeout still covers an unavailable adapter. */ }
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
        if (catalog.direct) {
            if (!episode.resolvedAt || Date.now() - episode.resolvedAt > 60000) return resolveDirect(movie,catalog,title,release,episode,function () { launch(movie,catalog,title,release,episode,preference); });
            cancelPending();
            var directSerial = requestSerial, back = function () { quality(movie,catalog,title,release,episode); };
            directLoading('підготовка відео',back);
            return directRequest(directSerial,'Вибрана якість',pickURL(episode,preference),function (err,body) {
                if (err || !/^\s*#EXTM3U/.test(body)) return directError('Вибрана якість',err || new Error('Некоректний HLS'),function () { episode.resolvedAt = 0; launch(movie,catalog,title,release,episode,preference); },back);
                L.Select.hide();
                // Only the selected episode is resolved; never queue unresolved or expired URLs.
                handoff(movie,catalog,title,release,episode,preference,[]);
            });
        }
        cancelPending();
        var serial = requestSerial;
        select('Оновлюю посилання перед переглядом…', [{title: 'Назад — скасувати', subtitle: title.title}], function () { cancelPending(); restore(); }, function () { cancelPending(); quality(movie, catalog, title, release, episode); });
        pendingRequest = loadCatalog(true, function (catalogError, fresh) {
            if (serial !== requestSerial) return;
            var found = !catalogError && locate(fresh, title.id, release.id, episode.id);
            if (catalogError || !found) {
                lastDiagnostic = catalogError ? catalogError.message : 'Цього релізу більше немає в індексі.';
                L.Select.hide(); restore(); notify(lastDiagnostic); return;
            }
            title = found.title; release = found.release; episode = found.episode; catalog = fresh;
            if (episode.state === 'unavailable') { L.Select.hide(); quality(movie, fresh, title, release, episode); return; }
            var url = pickURL(episode, preference);
            pendingRequest = xhr(url, function (error, body) {
                if (serial !== requestSerial) return;
                pendingRequest = null;
                L.Select.hide();
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
                var playlist = title.type === 'tv' ? availablePlaylist(release, episode).map(function (e) {
                    return playData(movie, title, release, e, preference);
                }) : [];
                handoff(movie,catalog,title,release,episode,preference,playlist);
            });
        });
    }
    function handoff(movie,catalog,title,release,episode,preference,playlist) {
        var data = playData(movie,title,release,episode,preference);
        data.playlist = playlist;
        playbackContext = {movie:movie,catalog:catalog};
        save('last_launch',title.title + ' · ' + preference + ' · передано плеєру');
        save('last_' + title.id,episode.id);
        if (catalog.direct) trace('Плеєр Lampa','передано ' + preference);
        if (L.Player.playlist) L.Player.playlist(playlist);
        L.Player.play(data);
    }
    function diagnostics() {
            var catalog = currentCatalog;
            var lines = [NAME + ' ' + VERSION];
            if (L.Storage.field) lines.push('Плеєр Lampa: ' + L.Storage.field('player') + ' · для бети потрібен Tizen / AVPlay');
            lines.push('AVPlay API: ' + (root.webapis && root.webapis.avplay ? 'доступний' : 'недоступний'));
            if (storage('last_error', '')) lines.push('Остання помилка плеєра: ' + storage('last_error', ''));
            if (storage('last_launch', '')) lines.push('Останній запуск: ' + storage('last_launch', ''));
            if (lastDiagnostic) lines.push(lastDiagnostic);
            var sourceTrace = storage('direct_trace', []);
            if (Array.isArray(sourceTrace)) sourceTrace.forEach(function (line) { lines.push('Прямий пошук · ' + line); });
            lines.push('GitHub Pages: ' + (baseURL() || 'не визначено'));
            if (catalog) {
                lines.push('Індекс: ' + catalog.generatedAt + ' · назв: ' + catalog.titles.length);
                (catalog.warnings || []).forEach(function (warning) { lines.push(warning); });
            }
            select('Діагностика', lines.map(function (line) { return {title: line}; }), function () { diagnostics(); }, restore);
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
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_pages', type: 'input', values: '', default: '', placeholder: 'Визначається автоматично'}, field: {name: 'Адреса GitHub Pages', description: 'Зазвичай визначається автоматично. Резерв: https://USERNAME.github.io/REPOSITORY/'}});
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
        if (L.Player.listener) {
            L.Player.listener.follow('start', function (data) {
                // Lampa applies its global quality preference before this event. Preserve the explicit selection only for our streams.
                clearPlaybackWatch();
                if (!data || !data.faborn_title || !mediaURL(data.faborn_url)) return;
                data.url = data.faborn_url;
                save('last_' + data.faborn_title, data.faborn_episode);
                watchPlayback(data);
            });
            L.Player.listener.follow('ready', watchNativeError);
            L.Player.listener.follow('destroy', clearPlaybackWatch);
        }
        if (L.PlayerVideo && L.PlayerVideo.listener) {
            L.PlayerVideo.listener.follow('loadeddata', clearPlaybackWatch);
            L.PlayerVideo.listener.follow('timeupdate', function (event) {
                if (watchedPlayback && event && event.current > 0) clearPlaybackWatch();
            });
            L.PlayerVideo.listener.follow('error', function (event) {
                playbackError(event, watchedPlayback);
            });
        }
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
        pickURL: pickURL, timelineKey: timelineKey, availablePlaylist: availablePlaylist, escapeHTML: escapeHTML,
        parseSearch:parseSearch, parseSource:parseSource, addEpisodeRefs:addEpisodeRefs, parseEmbed:parseEmbed, parseMaster:parseMaster, uakinoURL:uakinoURL, embedURL:embedURL
    };
}));
