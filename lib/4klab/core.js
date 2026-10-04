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
        var matches = html.match(/https?:\/\/[^\s"'<>]+stravers\.live[/?][^\s"'<>]*/gi) || [];
        for (var i = 0; i < matches.length; i++) {
            var u = new URL(matches[i].replace(/&amp;/g, '&'));
            if (u.origin !== PLAYER || !u.searchParams.get('token') || !u.searchParams.get('token_movie')) continue;
            u.searchParams.set('translation','154');
            return u.href;
        }
        throw new Error('PLAYER: другий плеєр не знайдено');
    }
    function plain(value) {
        return String(value || '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|039);|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
    }
    function key(value) { return plain(value).toLowerCase().replace(/[’'`]/g,'').replace(/[^a-zа-яіїєґ0-9]+/g,' ').trim(); }
    function search(html, origin, movie) {
        var rows = [], seen = {}, year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0,4),10);
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        html.split(/<div\b[^>]*class=["'][^"']*\bcard__title\b[^"']*["'][^>]*>/i).slice(1).forEach(function (chunk) {
            var m = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
            if (!m) return;
            var url;
            try { url = absolute(m[1],origin); } catch (ignore) { return; }
            if (!/^https:\/\/uakinogo\.(?:is|io)\/\d+-[^/?#]+\.html$/.test(url) || seen[url]) return;
            var title = plain(m[2]), isTV = /сезон/i.test(title), y = /(?:Год выпуска:|Рік:)\s*(\d{4})/.exec(plain(chunk));
            if (isTV !== tv || year && y && Math.abs(year-Number(y[1])) > 1) return;
            seen[url] = true; rows.push({url:url,title:title});
        });
        return rows.slice(0,6);
    }
    function matches(html, movie) {
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        var original = /class=["'][^"']*pmovie__original-title[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(html);
        if (!h) return false;
        var heading = plain(h[1]), tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0,4),10), y = /\((\d{4})\)/.exec(heading);
        if (/сезон/i.test(heading) !== tv || year && y && Math.abs(year-Number(y[1])) > 1) return false;
        var aliases = [heading.replace(/\s*\(?\d+(?:-\d+)?\s*сезон.*$/i,'').replace(/\s*\(\d{4}\).*$/,''),original && original[1]].map(key);
        return [movie.title,movie.name,movie.original_title,movie.original_name].some(function (name) { return key(name) && aliases.indexOf(key(name)) >= 0; });
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
    function fileList(html) {
        var vp = /name=["']viewporti["']\s+content=["']([^"']+)/.exec(html);
        var literal = /fileList\s*=\s*JSON\.parse\('([^']+)'\)/.exec(html);
        if (!vp || !literal) throw new Error('SESSION: формат плеєра змінився');
        return {files:JSON.parse(literal[1]),viewport:decode(vp[1])};
    }
    function episodes(info) {
        var result = [], f = info.files;
        if (f.type !== 'serial') return [{season:0,episode:0}];
        Object.keys(f.all || {}).forEach(function (s) {
            if (!/^\d+$/.test(s)) return;
            Object.keys(f.all[s] || {}).forEach(function (e) { if (/^\d+$/.test(e) && +s > 0 && +e > 0) result.push({season:+s,episode:+e}); });
        });
        return result.slice(0,3000);
    }
    function entry(info, season, episode) {
        var f = info.files, serial = f.type === 'serial';
        var rows = serial ? f.all && f.all[season] && f.all[season][episode] : f.all && (f.all.theatrical || f.all[Object.keys(f.all)[0]]);
        if (!rows) throw new Error('EPISODE: цієї серії немає у другому плеєрі');
        var keys = Object.keys(rows).sort(function (a,b) { return (a === 't154' ? -1 : a === 't93' ? 0 : 1)-(b === 't154' ? -1 : b === 't93' ? 0 : 1); }), selected;
        keys.some(function (k) {
            var r = serial ? rows[k] : rows[k] && rows[k][Object.keys(rows[k])[0]];
            if (r && /^\d+$/.test(String(r.id))) { selected = r; return true; }
        });
        if (!selected) throw new Error('SESSION: немає доступного відео');
        return {id:String(selected.id),audio:Number(selected.id_translation) || Number(keys[0].slice(1)) || 154};
    }
    function session(html) {
        var info = fileList(html), row = entry(info,0,0);
        return {id:row.id,viewport:info.viewport};
    }
    function tracks(data, allQualities) {
        return (data.hlsSource || []).filter(function (t) { return t.quality && (allQualities || t.quality['2160']); }).map(function (t) {
            var language = /Ukrainian|укр/i.test(t.label) ? 'uk' : /English|англ/i.test(t.label) ? 'en' : /Russian|рус/i.test(t.label) ? 'ru' : '';
            var qualities = {};
            Object.keys(t.quality).forEach(function (q) {
                if (!/^(2160|1440|1080|720|480|360)$/.test(q)) return;
                var urls = String(t.quality[q]).split(' or ').filter(function (u) { return allowed(u,true); });
                if (urls.length) qualities[q+'p'] = urls;
            });
            var names = Object.keys(qualities).sort(function (a,b) { return parseInt(b,10)-parseInt(a,10); });
            return {label:String(t.label || '').slice(0,200),language:language,urls:qualities['2160p'] || qualities[names[0]] || [],qualities:qualities};
        }).filter(function (t) { return t.language && t.urls.length; }).sort(function (a,b) {
            return ['uk','en','ru'].indexOf(a.language) - ['uk','en','ru'].indexOf(b.language);
        });
    }
    function resolution(manifest, expected) {
        expected = parseInt(expected,10) || 2160;
        var width = {2160:3840,1440:2560,1080:1920,720:1280,480:854,360:640}[expected];
        var lines = manifest.split(/\r?\n/), found = [];
        for (var i = 0; i < lines.length; i++) {
            var m = /^#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
            if (m && (Number(m[1]) >= width || Number(m[2]) >= expected)) {
                var codec = /CODECS="([^"]+)"/.exec(lines[i]);
                found.push({width:Number(m[1]),height:Number(m[2]),codecs:codec ? codec[1] : '',uri:(lines[i+1] || '').trim()});
            }
        }
        if (!found.length || !found[0].uri) throw new Error('QUALITY: потік не підтвердив '+expected+'p');
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
    function resolverConnection(value,login,password) {
        try {
            value=String(value || '').trim();if(value.length>2048)return null;
            if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(value))value='http://'+value;
            var u = new URL(value), host = u.hostname, ip = host.split('.').map(Number);
            var local = host === 'localhost' || ip.length === 4 && ip.every(function(n){return n>=0 && n<=255 && Math.floor(n)===n;}) && (ip[0]===127 || ip[0]===10 || ip[0]===192 && ip[1]===168 || ip[0]===172 && ip[1]>=16 && ip[1]<=31);
            login=String(login || decodeURIComponent(u.username || ''));password=String(password || decodeURIComponent(u.password || ''));
            if(login || password){
                if(!/^[A-Za-z0-9_.-]{1,64}$/.test(login) || !password || /[\x00-\x1f\x7f]/.test(password) || unescape(encodeURIComponent(password)).length>256)return null;
            }
            if (u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && (local || login && password)))) return null;
            u.username='';u.password='';
            return {base:u.href.replace(/\/$/,''),authorization:login?'Basic '+btoa(unescape(encodeURIComponent(login+':'+password))):''};
        } catch(ignore) { return null; }
    }
    function resolverBase(value) {
        var connection=resolverConnection(value);return connection?connection.base:'';
    }
    function resolverCard(input) {
        if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('SERVER: некоректна картка');
        var card={};
        ['title','original_title','name','original_name','release_date','first_air_date','original_language','media_type'].forEach(function(key) {
            if (input[key]!==undefined) {
                if (typeof input[key]!=='string' || input[key].length>180) throw new Error('SERVER: некоректні дані картки');
                card[key]=input[key].trim();
            }
        });
        if (!card.title && !card.name && !card.original_title && !card.original_name) throw new Error('SERVER: потрібна назва');
        if (card.media_type && ['movie','tv'].indexOf(card.media_type)<0) throw new Error('SERVER: некоректний тип картки');
        return card;
    }
    function resolverError(status,body) {
        var reason={0:'немає з’єднання з обробником; перевір адресу сервера',401:'перевір логін і пароль або ключ доступу',413:'запит завеликий; онови модуль Faborn',429:'обробник зайнятий; повтори пошук трохи пізніше'}[status];
        if (!reason && typeof body==='string' && body.length<=4096) {
            try {
                var data=JSON.parse(body);
                if (data && typeof data.error==='string') reason=data.error.replace(/<[^>]*>/g,'').replace(/https?:\/\/\S+/g,'[адреса]').slice(0,200);
            } catch(ignore) {}
        }
        return 'SERVER: '+(status?'HTTP '+status+' — ':'')+(reason || 'обробник повернув помилку');
    }
    function resolverResult(data,season,episode) {
        if (!data || data.schema!==1 || data.origin!==PLAYER || data.season!==season || data.episode!==episode || !allowed(data.sourcePage) || !/^https:\/\/uakinogo\.(?:is|io)\/\d+-[^/?#]+\.html$/.test(data.sourcePage) || !allowed(data.referer) || new URL(data.referer).origin!==PLAYER) throw new Error('SERVER: некоректна відповідь обробника');
        var tracks = (Array.isArray(data.tracks)?data.tracks:[]).slice(0,100).map(function(t) {
            if (!t || ['uk','en','ru'].indexOf(t.language)<0 || typeof t.label!=='string') return null;
            var qualities={};
            Object.keys(t.qualities || {}).forEach(function(q){
                if (!/^(360|480|720|1080|1440|2160)p$/.test(q) || !Array.isArray(t.qualities[q])) return;
                var urls=t.qualities[q].slice(0,3).filter(function(url){return allowed(url,true);});
                if (urls.length) qualities[q]=urls;
            });
            return Object.keys(qualities).length?{label:t.label.slice(0,200),language:t.language,qualities:qualities}:null;
        }).filter(Boolean);
        var episodes=(Array.isArray(data.episodes)?data.episodes:[]).slice(0,10000).filter(function(e){return e && typeof e.season==='number' && typeof e.episode==='number' && e.season>=0 && e.season<=1000 && e.episode>=0 && e.episode<=10000 && Math.floor(e.season)===e.season && Math.floor(e.episode)===e.episode;}).map(function(e){return {season:e.season,episode:e.episode};});
        if (!tracks.length || !episodes.some(function(e){return e.season===season && e.episode===episode;})) throw new Error('SERVER: немає підтримуваних доріжок цієї серії');
        return {tracks:tracks,episodes:episodes,referer:data.referer,sourcePage:data.sourcePage};
    }
    return {resolverCard:resolverCard,resolverError:resolverError,resolverBase:resolverBase,resolverConnection:resolverConnection,resolverResult:resolverResult,source:SOURCE,origin:PLAYER,allowed:allowed,absolute:absolute,player:player,search:search,matches:matches,fileList:fileList,episodes:episodes,entry:entry,session:session,decode:decode,tracks:tracks,resolution:resolution,Routes:Routes,parseRequest:parseRequest};
}));
