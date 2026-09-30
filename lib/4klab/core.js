/* Shared data-only parser and loopback routing. No website scripts are executed. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Faborn4KCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    var SOURCE = 'https://uakinogo.is/272-oppengeimer.html';
    var PLAYER = 'https://rarity-as.stravers.live';
    function allowed(value, mediaOnly) {
        if (typeof value !== 'string' || value.length > 8192 || /[\s<>"'\\]/.test(value)) return false;
        var m = /^https:\/\/([a-z0-9.-]+)(\/[^#]*)?$/i.exec(value);
        if (!m) return false;
        var host = m[1].toLowerCase();
        if (/^(?:[a-z0-9-]+\.)*vkvideo\.cloud$/.test(host)) return true;
        return !mediaOnly && ['uakinogo.is','uakinogo.io','rarity-as.stravers.live'].indexOf(host) >= 0;
    }
    function absolute(value, base, mediaOnly) {
        var url = new URL(value, base).href;
        if (!allowed(url, mediaOnly)) throw new Error('HOST: джерело змінило адресу потоку');
        return url;
    }
    function player(html) {
        var matches = html.match(/https?:\/\/[^\s"'<>]+stravers\.live\/[^\s"'<>]*/gi) || [];
        for (var i = 0; i < matches.length; i++) {
            var u = new URL(matches[i].replace(/&amp;/g, '&'));
            if (u.origin !== PLAYER || !u.searchParams.get('token') || !u.searchParams.get('token_movie')) continue;
            u.searchParams.set('translation','154');
            return u.href;
        }
        throw new Error('PLAYER: другий плеєр не знайдено');
    }
    function inverse(str, groups, order) {
        var parts = {}, count = {}, offset = 0;
        groups.forEach(function (g) { count[g] = (count[g] || 0) + 1; });
        order.forEach(function (g) { parts[g] = str.slice(offset, offset + count[g]).split('').reverse(); offset += count[g]; });
        return groups.map(function (g) { return parts[g].pop(); }).join('');
    }
    function bits(n) { return n ? Math.floor(Math.log(n) / Math.LN2) + 1 : 0; }
    function decode(str) {
        if (!str || str.length > 2048) throw new Error('SESSION: некоректні дані плеєра');
        var g = [], i, k = bits(str.length - 1), order = [];
        for (i = 0; i < str.length; i++) g.push(bits(i));
        g.forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
        str = inverse(str,g,order.sort(function (a,b) { return b-a; }));
        g = []; order = [];
        for (i = 0; i < str.length; i++) g.push(i ? bits(i & -i) - 1 : k);
        g.forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
        str = inverse(str,g,order.sort(function (a,b) { return a-b; }));
        function prime(n) { for (var d = 2; d*d <= n; d++) if (n % d === 0) return false; return n >= 2; }
        var mod = Math.max(2,str.length+1), pos = 0, seen = {}, out = [];
        while (!prime(mod)) mod++;
        for (i = 0; i < str.length;) {
            pos = (pos + 2) % mod;
            if (pos < str.length && !seen[pos]) { seen[pos] = true; out[pos] = str.charAt(i++); }
        }
        return out.join('');
    }
    function session(html) {
        var vp = /name=["']viewporti["']\s+content=["']([^"']+)/.exec(html);
        var literal = /fileList\s*=\s*JSON\.parse\('([^']+)'\)/.exec(html);
        if (!vp || !literal) throw new Error('SESSION: формат плеєра змінився');
        var f = JSON.parse(literal[1]), t = f.all && f.all.theatrical && f.all.theatrical.t154;
        var id = t && t[Object.keys(t)[0]] && t[Object.keys(t)[0]].id;
        if (!/^\d+$/.test(String(id))) throw new Error('SESSION: фільм відсутній у плеєрі');
        return {id:String(id), viewport:decode(vp[1])};
    }
    function tracks(data) {
        return (data.hlsSource || []).filter(function (t) { return t.quality && t.quality['2160']; }).map(function (t) {
            var language = /Ukrainian|укр/i.test(t.label) ? 'uk' : /English|англ/i.test(t.label) ? 'en' : /Russian|рус/i.test(t.label) ? 'ru' : '';
            var urls = String(t.quality['2160']).split(' or ').filter(function (u) { return allowed(u,true); });
            return {label:String(t.label || '').slice(0,200), language:language, urls:urls};
        }).filter(function (t) { return t.language && t.urls.length; }).sort(function (a,b) {
            return ['uk','en','ru'].indexOf(a.language) - ['uk','en','ru'].indexOf(b.language);
        });
    }
    function resolution(manifest) {
        var lines = manifest.split(/\r?\n/), found = [];
        for (var i = 0; i < lines.length; i++) {
            var m = /^#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
            if (m && Number(m[1]) >= 3840 && Number(m[2]) >= 2160) {
                var codec = /CODECS="([^"]+)"/.exec(lines[i]);
                found.push({width:Number(m[1]),height:Number(m[2]),codecs:codec ? codec[1] : '',uri:(lines[i+1] || '').trim()});
            }
        }
        if (!found.length || !found[0].uri) throw new Error('QUALITY: потік не підтвердив 3840×2160');
        return found[0];
    }
    function Routes(port, token) {
        if (!(port > 0 && port < 65536) || !/^[a-f0-9]{32}$/.test(token)) throw new Error('LOOPBACK: невірна сесія');
        var list = [], ids = {}, prefix = '/' + token + '/', base = 'http://127.0.0.1:' + port;
        this.add = function (url) {
            if (!allowed(url,true)) throw new Error('HOST: непідтримуваний відеосервер');
            if (ids[url] === undefined) {
                if (list.length >= 20000) throw new Error('LIMIT: завеликий список відео');
                ids[url] = list.length; list.push(url);
            }
            return base + prefix + ids[url] + (/\.m3u8(?:\?|$)/i.test(url) ? '.m3u8' : '.bin');
        };
        this.get = function (path) {
            if (path.indexOf(prefix) !== 0) return '';
            var m = /^(\d+)\.(?:m3u8|bin)$/.exec(path.slice(prefix.length));
            return m && list[Number(m[1])] || '';
        };
        this.rewrite = function (manifest, url) {
            if (!/^#EXTM3U/.test(manifest) || manifest.length > 2097152) throw new Error('HLS: невалідний список');
            if (/#EXT-X-(?:SESSION-)?KEY:(?!METHOD=NONE)/.test(manifest)) throw new Error('HLS: зашифрований потік не підтримується тестом');
            var add = this.add;
            return manifest.split(/\r?\n/).map(function (line) {
                if (!line.trim()) return line;
                if (line.charAt(0) !== '#') return add(absolute(line.trim(),url,true));
                return line.replace(/URI="([^"]+)"/g,function (_,uri) { return 'URI="'+add(absolute(uri,url,true))+'"'; });
            }).join('\n');
        };
    }
    function parseRequest(value, routes) {
        if (value.length > 8192) throw new Error('HTTP: request too large');
        var lines = value.split('\r\n'), m = /^(GET|HEAD) (\/[^\s]+) HTTP\/1\.[01]$/.exec(lines[0]);
        if (!m || !routes.get(m[2])) throw new Error('HTTP: route not found');
        var range = '', host = '';
        lines.slice(1).forEach(function (line) {
            if (/^Host:/i.test(line)) host = line.slice(5).trim();
            if (/^Range:/i.test(line)) {
                var r = /^Range:\s*bytes=(\d*-\d*)\s*$/i.exec(line);
                if (!r || r[1] === '-') throw new Error('HTTP: unsupported range');
                range = r[1];
            }
        });
        if (!/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('HTTP: invalid host');
        return {method:m[1],url:routes.get(m[2]),range:range};
    }
    return {source:SOURCE,origin:PLAYER,allowed:allowed,absolute:absolute,player:player,session:session,decode:decode,tracks:tracks,resolution:resolution,Routes:Routes,parseRequest:parseRequest};
}));
