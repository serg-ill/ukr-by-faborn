/* ukr by Faborn 0.1.0-beta.5 — GitHub Pages edition. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else if (!root.FabornUkr) {
        root.FabornUkr = factory(root);
        root.FabornUkr.boot();
    }
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var VERSION = '0.1.0-beta.5';
    var NAME = 'ukr by Faborn';
    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h16a6 6 0 0 1 6 6v8H2V8a6 6 0 0 1 6-6z" fill="#168BFF"/><path d="M2 16h28v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#FFD54A"/><path d="M12 8.5 24 16 12 23.5z" fill="#101923"/></svg>';
    var L, $, installed = false, currentCatalog, catalogLoadedAt = 0, requestSerial = 0, lastDiagnostic = '', returnController = 'content';
    var pendingRequest, playbackTimer, watchedPlayback, playbackContext;
    var directTrace = [];
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
        return /^https:\/\/(?:[a-z0-9-]+\.)*(?:ashdi\.vip|hdvbua\.pro|zetvideo\.net|tortuga\.(?:tw|wtf))\//i.test(text(value)) && !/[\s<>"\\]/.test(value);
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
        try {
            var name = L.Controller.enabled().name;
            if (name && ['select','keyboard','player','player_panel'].indexOf(name) < 0) returnController = name;
        } catch (ignore) { returnController = 'content'; }
    }
    function restore() {
        cancelPending(); activeSession = null;
        if (L && L.Select) L.Select.hide();
        if (L && L.Controller) L.Controller.toggle(returnController);
    }
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
        req.onload = function () {
            if (req.status >= 200 && req.status < 300) done(null, req.responseText);
            else done(new Error('HTTP ' + req.status));
        };
        req.onerror = function () { done(new Error('Мережа / CORS / TLS: HTTP-статус недоступний')); };
        req.ontimeout = function () { done(new Error('Час очікування вичерпано')); };
        try {
            req.open(post ? 'POST' : 'GET', url, true);
            req.timeout = timeout || 18000;
            if (post) req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            if (ajax) req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            req.send(post || null);
        } catch (error) { done(error); }
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
        return /^https:\/\/(?:(?:ashdi\.vip|zetvideo\.net|tortuga\.(?:tw|wtf))\/(?:vod|serial)\/\d+\/?|hdvbua\.pro\/embed\/\d+\/[a-z0-9]+)(?:\?[^\s<>"'\\]*)?$/i.test(url) ? url : '';
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
        var title = {id: 'uakino-' + pageID(url), title: withoutSeason(name), originalTitle: original ? withoutSeason(plain(original[1])) : '', year: year ? +year[0] : 0, type: season || /schema.org\/TVSeries/i.test(clean) ? 'tv' : 'movie', source:'uakino', sourcePage: url, season: season || 1, audioEvidence: voice || 'inLanguage=uk', voice: voice || 'Українське озвучення', releases: [], embeds: [], seasonPages: []};
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
        var re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi, m, clean = cleanMarkup(html);
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), embed = embedURL(a['data-file']), label = plain(m[2]);
            var n = /(?:серія|серії|episode)\s*(\d+)|(\d+)\s*(?:серія|серії)/i.exec(label);
            var voice = plain(a['data-voice'] || (title.type === 'movie' ? label : '') || title.voice);
            if (!embed || foreignVoice(voice) || title.type === 'tv' && !n) continue;
            var number = title.type === 'movie' ? 0 : +(n[1] || n[2]), season = title.type === 'movie' ? 0 : +a['data-season'] || title.season;
            var release = newRelease(title,voice);
            if (!release.episodes.some(function (e) { return e.season === season && e.episode === number; })) release.episodes.push({id:release.id+'-s'+season+'e'+number,title:label,season:season,episode:number,embed:embed,state:'pending'});
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
    var PROVIDERS = [
        {id:'uakino', name:'UAKino', origin:'https://uakino.best', search:'/ua/'},
        {id:'uaserials', name:'UASerials', origin:'https://uaserials.my', search:'/'},
        {id:'uafix', name:'UAFix', origin:'https://uafix.net', search:'/search.html'}
    ];
    function providerFor(url) {
        return PROVIDERS.filter(function (p) { return text(url).indexOf(p.origin + '/') === 0; })[0];
    }
    function publicURL(url, origin) {
        url = decodeHTML(text(url)).replace(/^\/\//, 'https://');
        if (url.charAt(0) === '/') url = origin + url;
        return providerFor(url) && !/[\s<>"'\\]/.test(url) ? url.split('#')[0] : '';
    }
    function classText(html, cls) {
        var re = new RegExp('<(div|span|h[1-6])\\b[^>]*class=["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/\\1>', 'i');
        var m = re.exec(html); return m ? plain(m[2]) : '';
    }
    function labelText(html, label) {
        var re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi, m;
        while ((m = re.exec(html))) {
            var value = plain(m[1]), hit = label.exec(value);
            if (hit) return value.substr(hit.index + hit[0].length).trim();
        }
        return '';
    }
    function cleanTitle(value) {
        return withoutSeason(plain(value).replace(/дивит[иь]с[ья][\s\S]*$/i, '').replace(/^[^a-zа-яіїєґ0-9]+/i, '')).trim();
    }
    function titleKeys(value) {
        return text(value).split(/\s*\/\s*/).map(function (s) { return normalize(cleanTitle(s)).replace(/проєкт/g,'проект'); }).filter(Boolean);
    }
    function sameTitle(movie, candidate, full) {
        var names = unique([movie.title,movie.name,movie.original_title,movie.original_name].reduce(function (a,n) { return a.concat(titleKeys(n)); },[]));
        var aliases = unique([candidate.title,candidate.originalTitle].concat(candidate.aliases || []).reduce(function (a,n) { return a.concat(titleKeys(n)); },[]));
        if (!names.some(function (n) { return aliases.some(function (a) {
            return a === n || !full && n.length >= 4 && (' '+a+' ').indexOf(' '+n+' ') >= 0;
        }); })) return false;
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        if (full && candidate.type !== (tv ? 'tv' : 'movie')) return false;
        var year = parseInt(text(movie.release_date || movie.first_air_date).substr(0,4),10);
        // UAKino dates individual seasons by broadcast year, while TMDB dates the series premiere.
        if (year && candidate.year && !(tv && candidate.season > 1) && Math.abs(year - candidate.year) > 1) return false;
        return true;
    }
    function providerSearch(html, provider) {
        if (provider.id === 'uakino') return parseSearch(html);
        if (challenge(html)) throw new Error('Сайт повернув перевірку доступу.');
        var clean = cleanMarkup(html), rows = [], re, m, seen = {};
        if (!/Пошук|За Вашим запитом/i.test(plain(clean))) throw new Error('Не отримано сторінку результатів пошуку.');
        if (provider.id === 'uaserials') {
            clean.split(/<div\b[^>]*class=["'][^"']*\bshort-cols\b[^"']*["'][^>]*>/i).slice(1).forEach(function (chunk) {
                var a = /<a\b([^>]*)>/i.exec(chunk), url = a && publicURL(attrs(a[1]).href,provider.origin);
                if (url && pageID(url)) rows.push({url:url,title:classText(chunk,'th-title'),originalTitle:classText(chunk,'th-title-oname')});
            });
        } else {
            re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            while ((m = re.exec(clean))) {
                var at = attrs(m[1]), h = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(m[2]);
                var url = publicURL(at.href,provider.origin);
                if (url && /\bsres-wrap\b/.test(at['class'] || '') && h) rows.push({url:url,title:plain(h[1])});
            }
        }
        return rows.filter(function (r) { if (seen[r.url] || r.url.indexOf(provider.origin+'/') !== 0) return false; seen[r.url] = true; return Boolean(r.title); }).slice(0,60);
    }
    function playerRefs(html) {
        var clean = cleanMarkup(html), re = /<(?:iframe|link|li|div)\b([^>]*)>/gi, m, out = [];
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), url = embedURL(a.src || a['data-src'] || a['data-file'] || (a.itemprop === 'video' && a.value));
            if (url && !/трейлер|trailer/i.test(a.title || '')) out.push(url);
        }
        return unique(out);
    }
    function providerPage(html, url) {
        var provider = providerFor(url);
        if (!provider) throw new Error('Невідоме джерело.');
        if (provider.id === 'uakino') {
            var ua = parseSource(html,url); ua.source = provider.id; return ua;
        }
        if (challenge(html)) throw new Error('Сайт повернув перевірку доступу.');
        var clean = cleanMarkup(html).split(/<[^>]+(?:id=["']dle-comments|class=["'](?:full-comms|comments)\b)/i)[0];
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean);
        if (!h) throw new Error('На сторінці немає назви.');
        var name = cleanTitle(h[1]), original = classText(clean,'oname') || classText(clean,'forigin') || classText(clean,'eng-rus') || labelText(clean,/Ориг\. назва:\s*/i).split(' / ')[0];
        var year = /\b(?:19|20)\d{2}\b/.exec(labelText(clean,/Рік(?: виходу)?:\s*/i));
        var voice = labelText(clean,/(?:Переклад|Озвучення):\s*/i);
        var uk = /<meta\b[^>]*itemprop=["']inLanguage["'][^>]*content=["']uk(?:-UA)?["']/i.test(clean);
        var heading = (clean.match(/<h[12]\b[^>]*>[\s\S]*?<\/h[12]>/gi) || []).map(plain).join(' ');
        if (!uk && !/українськ/i.test(heading)) throw new Error('Сторінка не підтверджує українське озвучення.');
        var tv = /серіал|сезон/i.test(heading) || /\/serials\//.test(url);
        var id = provider.id + '-' + (pageID(url) || url.split('/').filter(Boolean).pop());
        var title = {id:id,title:name,originalTitle:original,source:provider.id,sourcePage:url,year:year ? +year[0] : 0,type:tv ? 'tv' : 'movie',season:seasonNumber(name) || 1,voice:voice || 'Українське озвучення',audioEvidence:uk ? 'inLanguage=uk-UA' : heading.substr(0,240),releases:[],embeds:playerRefs(clean),seasonPages:[]};
        if (provider.id === 'uafix' && tv) addFixEpisodes(title,clean);
        return title;
    }
    function newRelease(title, voice) {
        voice = plain(voice || title.voice);
        var release = title.releases.filter(function (r) { return r.voice === voice; })[0];
        if (!release) {
            release = {id:title.id+'-voice-'+title.releases.length,source:title.source || 'uakino',sourcePage:title.sourcePage,voice:voice,audioLanguage:'uk',audioEvidence:title.audioEvidence,episodes:[]};
            title.releases.push(release);
        }
        return release;
    }
    function foreignVoice(voice) { return /росій|русск|english|англій|\b(?:rus|eng)\b/i.test(voice); }
    function addFixEpisodes(title,html) {
        var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
        while ((m = re.exec(html))) {
            var url = publicURL(attrs(m[1]).href,'https://uafix.net');
            if (!url || url.indexOf(title.sourcePage.replace(/\?.*$/,'')) !== 0) continue;
            var ep = /\/season-(\d+)-episode-(\d+)\/$/.exec(url);
            if (ep) {
                var r = newRelease(title,title.voice), season = +ep[1], number = +ep[2];
                if (!r.episodes.some(function (e) { return e.season === season && e.episode === number; })) r.episodes.push({id:r.id+'-s'+season+'e'+number,season:season,episode:number,page:url,state:'pending'});
            } else if (/\/sezon-\d+\/$/.test(url) && !title.seasonPages.some(function (p) { return p.url === url; })) title.seasonPages.push({url:url,title:plain(m[2])});
        }
    }
    function subtitlesFrom(value) {
        var out = [], re = /\[([^\]]+)\](https:\/\/[^,\s]+)/g, m;
        while ((m = re.exec(text(value)))) if (mediaURL(m[2])) out.push({label:m[1],url:m[2]});
        return out;
    }
    function playerEntries(html, defaults) {
        var start = text(html).search(/new\s+Playerjs\s*\(/);
        if (start < 0) throw new Error('Не знайдено відкриту конфігурацію відеоплеєра.');
        var config = text(html).substr(start), raw = quotedProperty(config,'file'), tree, out = [];
        if (!raw) throw new Error('Плеєр не віддав прямого потоку.');
        if (raw.charAt(0) === '[' && /\[\s*\{/.test(raw)) {
            try { tree = JSON.parse(raw); } catch (e) { throw new Error('Не вдалося прочитати список відео.'); }
        } else tree = [{file:raw,subtitle:quotedProperty(config,'subtitle')}];
        function walk(items, season, voice, depth) {
            if (!Array.isArray(items) || depth > 5 || out.length > 2000) return;
            items.forEach(function (item) {
                if (!item || typeof item !== 'object') return;
                var label = plain(item.title), s = seasonNumber(label), v = voice;
                if (foreignVoice(label)) return;
                if (item.folder) {
                    if (!s && label) v = label;
                    walk(item.folder,s || season,v,depth+1); return;
                }
                var file = text(item.file), qualities = {}, master = '', m;
                if (mediaURL(file) && /\.m3u8(?:\?|$)/i.test(file)) master = file;
                else {
                    var re = /\[(2160|1440|1080|720|480|360)p?\](https:\/\/[^,\s]+)/g;
                    while ((m = re.exec(file))) if (mediaURL(m[2]) && /\.m3u8(?:\?|$)/i.test(m[2])) { qualities[m[1]+'p'] = m[2]; if (!master) master = m[2]; }
                }
                if (!master) return;
                var n = /(?:серія|episode)\s*(\d+)|(\d+)\s*(?:серія|episode)/i.exec(label);
                if (defaults.type === 'tv' && !n && !defaults.episode) return;
                out.push({master:master,qualities:qualities,subtitles:subtitlesFrom(item.subtitle),season:defaults.type === 'tv' ? season || defaults.season || 1 : 0,episode:defaults.type === 'tv' ? n ? +(n[1] || n[2]) : defaults.episode : 0,voice:defaults.type === 'movie' && label ? label : v || defaults.voice,title:label});
            });
        }
        walk(tree,defaults.season || 0,defaults.voice,0);
        if (!out.length) throw new Error('Немає підтримуваного українського HLS-потоку.');
        return out;
    }
    var requests = [], activeSession, discoveryTimer;
    function parallel(items, limit, work, done) {
        var next = 0, running = 0, finished = 0, ended = false;
        if (!items.length) return done();
        function pump() {
            if (ended) return;
            while (running < limit && next < items.length) {
                var item = items[next++]; running++;
                work(item,function () {
                    running--; finished++;
                    if (finished === items.length) { ended = true; done(); }
                    else pump();
                });
            }
        }
        pump();
    }
    function publicRequest(serial, stage, url, callback, post, ajax) {
        if (serial !== requestSerial) return;
        if (!providerFor(url) && !embedURL(url) && !mediaURL(url)) return callback(new Error('Непідтримувана адреса джерела.'));
        var completed = false, req;
        trace(stage,'запит');
        req = xhr(url,function (error,body,status) {
            completed = true;
            var i = requests.indexOf(req); if (i >= 0) requests.splice(i,1);
            if (serial !== requestSerial) return;
            trace(stage,error ? error.message : 'HTTP '+status);
            callback(error,body);
        },12000,post,ajax);
        if (!completed) requests.push(req);
    }
    function getTitle(serial, provider, movie, url, done) {
        publicRequest(serial,provider.name+' · сторінка',url,function (err,body) {
            if (err) return done(err);
            var title, playerError;
            try { title = providerPage(body,url); } catch (e) { return done(e); }
            if (!sameTitle(movie,title,true)) return done(new Error('Назва, рік або тип не збігаються з карткою.'));
            function expand() {
                parallel(title.embeds,2,function (embed,next) {
                    publicRequest(serial,provider.name+' · сезони й озвучення',embed,function (error,html) {
                        if (error) playerError = error;
                        if (!error) {
                            try {
                                playerEntries(html,title).forEach(function (entry) {
                                    var release = newRelease(title,entry.voice+(title.embeds.length > 1 ? ' · плеєр '+(title.embeds.indexOf(embed)+1) : ''));
                                    if (release.episodes.some(function (e) { return e.season === entry.season && e.episode === entry.episode; })) return;
                                    entry.id = release.id+'-s'+entry.season+'e'+entry.episode; entry.embed = embed; entry.state = 'pending';
                                    release.episodes.push(entry);
                                });
                            } catch (e) { playerError = e; trace(provider.name+' · список відео',e.message); }
                        }
                        next();
                    });
                },function () { done(!title.releases.length && !title.seasonPages.length ? playerError : null,title); });
            }
            if (title.playlistURL) {
                publicRequest(serial,provider.name+' · список відео',title.playlistURL,function (error,response) {
                    if (error) return title.embeds.length ? expand() : done(error);
                    try {
                        var data = JSON.parse(response);
                        if (!data || typeof data.response !== 'string') throw new Error('Не отримано список відео.');
                        addEpisodeRefs(title,data.response);
                        // Some lists contain one serial player, others one player per episode/voice.
                        if (!title.releases.length) title.embeds = unique(title.embeds.concat(playerRefs(data.response)));
                    } catch (e) { return title.embeds.length ? expand() : done(e); }
                    expand();
                },null,true);
            } else expand();
        });
    }
    function mergeTitle(session, title) {
        title.releases.forEach(function (r) {
            var existing = session.title.releases.filter(function (v) { return v.source === r.source && v.voice === r.voice; })[0];
            if (!existing) { session.title.releases.push(r); existing = r; }
            else r.episodes.forEach(function (e) {
                if (!existing.episodes.some(function (v) { return v.season === e.season && v.episode === e.episode; })) existing.episodes.push(e);
            });
        });
        (title.seasonPages || []).forEach(function (p) {
            var season = seasonNumber(p.title);
            if (season && !session.seasonPages.some(function (v) { return v.url === p.url; })) session.seasonPages.push({url:p.url,season:season,source:title.source || 'uakino'});
        });
    }
    function discoverProvider(serial,session,provider,done) {
        var movie = session.movie;
        var queries = unique([movie.title || movie.name,movie.original_title || movie.original_name].map(function (s) { return text(s).replace(/[«»“”"'’]/g,'').trim().substr(0,100); }));
        var index = 0;
        function searchNext() {
            if (index >= queries.length) return done('Назву не знайдено');
            var query = queries[index++];
            publicRequest(serial,provider.name+' · пошук',provider.origin+provider.search,function (err,body) {
                if (err) return done(err.message);
                var results;
                try { results = providerSearch(body,provider).filter(function (r) { return sameTitle(movie,r,false); }); } catch (e) { return done(e.message); }
                if (!results.length) return searchNext();
                var count = 0, lastError = '';
                parallel(results.slice(0,6),2,function (row,next) {
                    getTitle(serial,provider,movie,row.url,function (error,title) {
                        if (error) lastError = error.message;
                        else { mergeTitle(session,title); count += title.releases.length; }
                        next();
                    });
                },function () {
                    if (!count && index < queries.length && /не збігаються/.test(lastError)) return searchNext();
                    done(count ? 'Знайдено' : lastError || 'Немає підтримуваного плеєра');
                });
            },'do=search&subaction=search&from_page=1&story='+encodeURIComponent(query));
        }
        searchNext();
    }
    function loading(session,label) {
        select(NAME+' · '+label,[{title:'Шукаю доступне відео…',subtitle:'UAKino · UASerials · UAFix · Назад — скасувати',action:'wait'}],function () { loading(session,label); },restore);
    }
    function open(movie) {
        rememberController();
        startDiscovery(movie || {});
    }
    function startDiscovery(movie) {
        cancelPending();
        var serial = requestSerial, tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var title = {id:'tmdb-'+(tv ? 'tv-' : 'movie-')+(movie.id || normalize(movie.original_title || movie.original_name || movie.title || movie.name)),title:movie.title || movie.name || movie.original_title || movie.original_name || NAME,originalTitle:movie.original_title || movie.original_name || '',year:parseInt(text(movie.release_date || movie.first_air_date).substr(0,4),10) || 0,type:tv ? 'tv' : 'movie',releases:[]};
        var last = storage('position_'+title.id,{});
        var session = {movie:movie,title:title,season:tv ? +last.season || 1 : 0,episode:tv ? +last.episode || 1 : 0,seasonPages:[],visited:{},status:{},ready:false};
        session.catalog = {direct:true,unified:true,titles:[title],session:session};
        activeSession = session; directTrace = []; save('direct_trace',[]); lastDiagnostic = '';
        loading(session,'пошук');
        var remaining = PROVIDERS.length + 1;
        function finished() {
            remaining--;
            if (serial !== requestSerial || remaining) return;
            prepareSelection(session);
        }
        // A deadline covers the whole discovery, not just each XHR. Late replies are invalidated.
        discoveryTimer = root.setTimeout(function () {
            if (serial !== requestSerial) return;
            trace('Пошук','Досягнуто ліміт очікування; показуємо отримані результати');
            prepareSelection(session);
        },24000);
        var completed = false, req = loadCatalog(false,function (error,catalog) {
            completed = true;
            if (serial !== requestSerial) return;
            if (!error) catalog.titles.filter(function (t) { return sameTitle(movie,t,true); }).forEach(function (t) {
                // Keep the known working streams as a fallback; resolve fresh links on selection.
                var copy = JSON.parse(JSON.stringify(t)); mergeTitle(session,copy);
            });
            finished();
        });
        if (!completed) requests.push(req);
        PROVIDERS.forEach(function (provider) {
            session.status[provider.id] = 'Очікування відповіді';
            discoverProvider(serial,session,provider,function (status) { session.status[provider.id] = status; finished(); });
        });
    }
    function resolveEpisode(serial,title,release,episode,done,force) {
        if (!force && episode.resolvedAt && Date.now()-episode.resolvedAt < 60000) return done();
        function verify(entry) {
            publicRequest(serial,sourceName(release.source)+' · якість',entry.master,function (err,body) {
                if (err) {
                    if (episode.embed && entry === episode && !force) { force = true; return embed(episode.embed); }
                    return done(err);
                }
                try {
                    var qualities = parseMaster(body,entry.master);
                    if (Object.keys(qualities).length) entry.qualities = qualities;
                    episode.master = entry.master; episode.qualities = entry.qualities || {};
                    episode.subtitles = entry.subtitles || []; episode.resolvedAt = Date.now(); episode.state = 'resolved'; episode.error = '';
                    done();
                } catch (e) { done(e); }
            });
        }
        function embed(url) {
            publicRequest(serial,sourceName(release.source)+' · плеєр',url,function (err,body) {
                if (err) return done(err);
                try {
                    var entries = playerEntries(body,{type:title.type,season:episode.season,episode:episode.episode,voice:release.voice});
                    var candidates = entries.filter(function (e) { return e.season === episode.season && e.episode === episode.episode; });
                    var entry = candidates.filter(function (e) { return e.voice === (episode.voice || release.voice); })[0] || (candidates.length === 1 ? candidates[0] : null);
                    if (!entry) throw new Error('Цю серію або озвучення не знайдено в плеєрі.');
                    episode.embed = url; verify(entry);
                } catch (e) { done(e); }
            });
        }
        if (episode.page) {
            publicRequest(serial,sourceName(release.source)+' · серія',episode.page,function (err,body) {
                if (err) return done(err);
                var refs = playerRefs(text(body).split(/<[^>]+id=["']dle-comments/i)[0]);
                if (!refs.length) return done(new Error('На сторінці серії немає підтримуваного плеєра.'));
                embed(refs[0]);
            });
        } else if (episode.embed && (!episode.master || force)) embed(episode.embed);
        else if (episode.master) verify(episode);
        else done(new Error('Джерело не віддало посилання на відео.'));
    }
    function prepareSelection(session) {
        cancelPending();
        var serial = requestSerial;
        activeSession = session; session.ready = false;
        loading(session,'перевірка джерел');
        var pages = session.seasonPages.filter(function (p) { return p.season === session.season && !session.visited[p.url]; });
        function resolveRows() {
            var tasks = [];
            session.title.releases.forEach(function (r) {
                r.episodes.filter(function (e) { return e.season === session.season && e.episode === session.episode; }).forEach(function (e) { tasks.push({release:r,episode:e}); });
            });
            parallel(tasks,4,function (task,next) {
                resolveEpisode(serial,session.title,task.release,task.episode,function (err) {
                    if (err) { task.episode.error = err.message; task.episode.resolvedAt = 0; trace(sourceName(task.release.source)+' · потік',err.message); }
                    next();
                });
            },complete);
        }
        function complete() {
            if (serial !== requestSerial) return;
            cancelPending(); session.ready = true;
            if (session.afterPrepare) { session.afterPrepare = false; chooseEpisode(session); }
            else renderSources(session);
        }
        discoveryTimer = root.setTimeout(function () {
            if (serial !== requestSerial) return;
            trace('Джерела','Час перевірки вичерпано'); complete();
        },20000);
        parallel(pages,3,function (p,next) {
            session.visited[p.url] = true;
            var provider = PROVIDERS.filter(function (v) { return v.id === p.source; })[0];
            if (p.source === 'uafix') {
                publicRequest(serial,'UAFix · сезон',p.url,function (error,html) {
                    if (!error) {
                        var t = {id:'uafix-season-'+p.season,source:'uafix',sourcePage:p.url.replace(/sezon-\d+\/$/,''),voice:'Українське озвучення',audioEvidence:'Українські серії на сторінці серіалу',releases:[],seasonPages:[]};
                        addFixEpisodes(t,cleanMarkup(html)); mergeTitle(session,t);
                    }
                    next();
                });
            } else getTitle(serial,provider,session.movie,p.url,function (error,t) { if (!error) mergeTitle(session,t); next(); });
        },resolveRows);
    }
    function sourceName(id) {
        var p = PROVIDERS.filter(function (v) { return v.id === id; })[0];
        return p ? p.name : id === 'kinoukr' ? 'KinoUkr' : id;
    }
    function renderSources(session) {
        if (activeSession !== session) return;
        var rows = [], count = 0, preferred = storage('quality','best'), preferredSource = storage('source','uakino');
        var status = Object.keys(session.status).map(function (id) {
            var errors = [];
            session.title.releases.filter(function (r) { return r.source === id; }).forEach(function (r) {
                r.episodes.filter(function (e) { return e.season === session.season && e.episode === session.episode && e.error; }).forEach(function (e) { errors.push(e.error); });
            });
            return sourceName(id)+': '+(unique(errors).join('; ') || session.status[id]);
        });
        save('source_status',status);
        if (session.title.type === 'tv') rows.push({title:'Сезон '+session.season+' · Серія '+session.episode,subtitle:'Змінити сезон або серію',action:'episode'});
        session.title.releases.slice().sort(function (a,b) { return (b.source === preferredSource ? 1 : 0)-(a.source === preferredSource ? 1 : 0); }).forEach(function (r) {
            r.episodes.forEach(function (e) {
                if (e.season !== session.season || e.episode !== session.episode || !e.resolvedAt || e.error) return;
                var qualities = qualityNames(e); if (!qualities.length) qualities = ['auto'];
                qualities.forEach(function (q,i) {
                    rows.push({title:sourceName(r.source)+' · '+(q === '2160p' ? '4K · 2160p' : q === 'auto' ? 'Авто' : q),subtitle:'Українська · '+r.voice,action:'play',release:r,episode:e,value:q,selected:!count && (preferred === q || preferred === 'best' && i === 0)});
                });
                count++;
            });
        });
        if (!count) rows.push({title:'Для цієї назви немає доступного потоку',subtitle:'Можна повторити пошук. Причини: Налаштування → ukr by Faborn → Версія та діагностика.',action:'retry'});
        rows.push({title:'Оновити джерела',action:'retry'});
        select(NAME+(session.title.type === 'tv' ? ' · S'+session.season+'E'+session.episode : ' · '+session.title.title),rows,function (row) {
            if (row.action === 'episode') return chooseSeason(session);
            if (row.action === 'retry') return startDiscovery(session.movie);
            save('source',row.release.source); save('quality',row.value);
            launch(session.movie,session.catalog,session.title,row.release,row.episode,row.value);
        },restore);
    }
    function chooseSeason(session) {
        var values = unique(session.title.releases.reduce(function (all,r) { return all.concat(r.episodes.map(function (e) { return e.season; })); },[]).concat(session.seasonPages.map(function (p) { return p.season; }))).sort(function (a,b) { return a-b; });
        select('Оберіть сезон',values.map(function (s) { return {title:'Сезон '+s,value:s,selected:s === session.season}; }),function (row) {
            session.season = row.value;
            session.episode = 1; session.afterPrepare = true; prepareSelection(session);
        },function () { renderSources(session); });
    }
    function chooseEpisode(session) {
        var values = unique(session.title.releases.reduce(function (all,r) { return all.concat(r.episodes.filter(function (e) { return e.season === session.season; }).map(function (e) { return e.episode; })); },[])).sort(function (a,b) { return a-b; });
        if (!values.length) return renderSources(session);
        select('Сезон '+session.season,values.map(function (e) { return {title:'Серія '+e,value:e,selected:e === session.episode}; }),function (row) { session.episode = row.value; prepareSelection(session); },function () { chooseSeason(session); });
    }
    function releases(movie,catalog) { if (catalog.session) renderSources(catalog.session); else restore(); }
    function quality(movie,catalog) { if (catalog.session) renderSources(catalog.session); else restore(); }
    function resolveDirect(movie,catalog,title,release,episode,callback) {
        cancelPending(); var serial = requestSerial;
        loading(catalog.session,'оновлення посилання');
        resolveEpisode(serial,title,release,episode,function (err) {
            if (err) { episode.error = err.message; lastDiagnostic = err.message; notify(err.message); renderSources(catalog.session); }
            else callback();
        },true);
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
        if (discoveryTimer) root.clearTimeout(discoveryTimer);
        discoveryTimer = null;
        requests.forEach(function (req) { if (req && req.abort) req.abort(); });
        requests = [];
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
        activeSession = catalog.session;
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
    function launch(movie,catalog,title,release,episode,preference) {
        var session = catalog.session;
        var isTizen = L.Platform && L.Platform.is && L.Platform.is('tizen');
        if (!isTizen || L.Storage.field && L.Storage.field('player') !== 'tizen') {
            return select('Потрібен плеєр Tizen', [{title:'Lampa → Налаштування → Плеєр → Tizen',subtitle:'Потік відтворюється штатним плеєром телевізора.'}],function () { renderSources(session); },function () { renderSources(session); });
        }
        if (!episode.resolvedAt || Date.now()-episode.resolvedAt > 60000) return resolveDirect(movie,catalog,title,release,episode,function () { launch(movie,catalog,title,release,episode,preference); });
        cancelPending(); var serial = requestSerial;
        loading(session,'запуск відео');
        publicRequest(serial,'Вибрана якість',pickURL(episode,preference),function (err,body) {
            if (err || !/^\s*#EXTM3U/.test(body)) {
                episode.error = err ? err.message : 'Некоректний HLS'; episode.resolvedAt = 0;
                lastDiagnostic = episode.error; notify(episode.error); renderSources(session); return;
            }
            save('position_'+title.id,{season:episode.season,episode:episode.episode});
            L.Select.hide(); L.Controller.toggle(returnController);
            // Only the selected episode has been checked. Never enqueue unresolved streams.
            handoff(movie,catalog,title,release,episode,preference,[]);
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
            storage('source_status',[]).forEach(function (line) { lines.push(line); });
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
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_source', type: 'select', values: {uakino:'UAKino', uaserials:'UASerials', uafix:'UAFix', kinoukr:'KinoUkr'}, default: 'uakino'}, field: {name: 'Пріоритет джерела', description: 'Вибір джерела також доступний перед переглядом.'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_quality', type: 'select', values: {best: 'Найвища доступна', auto: 'Авто', '2160p': '4K', '1080p': '1080p', '720p': '720p', '480p': '480p'}, default: 'best'}, field: {name: 'Бажана якість', description: 'Підсвічує варіант у списку джерел.'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_refresh', type: 'button'}, field: {name: 'Оновити індекс із GitHub'}, onChange: function () {
            loadCatalog(true, function (error, catalog) { notify(error ? error.message : 'Індекс оновлено: ' + catalog.titles.length + ' назв'); });
        }});
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
        providers:PROVIDERS, providerSearch:providerSearch, providerPage:providerPage, playerEntries:playerEntries, sameTitle:sameTitle, parseSearch:parseSearch, parseSource:parseSource, addEpisodeRefs:addEpisodeRefs, parseEmbed:parseEmbed, parseMaster:parseMaster, uakinoURL:uakinoURL, embedURL:embedURL
    };
}));
