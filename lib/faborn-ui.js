/* Faborn interface: native Lampa navigation, local ratings, verified source badges. ES5. */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornInterface = factory;
}(typeof window !== 'undefined' ? window : this,function (root,L,$) {
    'use strict';
    var doc = root.document, records = [], homeCards = [], originalMain, mainWrapper, installed = false;
    var ratingJobs = {}, ratingStatus = '';
    var TTL = 24*60*60*1000, MAX = 180;
    function str(v) { return v === undefined || v === null ? '' : String(v); }
    function esc(v) { return str(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function get(key,fallback) { try { return L.Storage.get('faborn_ukr_'+key,fallback); } catch (ignore) { return fallback; } }
    function set(key,value) { try { L.Storage.set('faborn_ukr_'+key,value); } catch (ignore) {} }
    function on(key) { return get('layout','panel') !== 'classic' && get(key,'on') === 'on'; }
    function identity(movie) {
        if (!movie || !/^\d+$/.test(str(movie.id))) return '';
        return (movie.media_type === 'tv' || movie.first_air_date || movie.original_name ? 'tv:' : 'movie:')+movie.id;
    }
    var paths = {
        star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>',
        film:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4"/>',
        tv:'<rect x="3" y="5" width="18" height="13" rx="3"/><path d="M9 21h6M12 18v3"/>',
        quality:'<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M6 10V8h3M15 8h3v2M18 14v2h-3M9 16H6v-2"/>',
        globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
        sparkle:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4"/>',
        sound:'<path d="m10 5-5 4H2v6h3l5 4ZM14 8a6 6 0 0 1 0 8M17 5a10 10 0 0 1 0 14"/>',
        trophy:'<path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21h8M9 18h6"/>',
        clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
        bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
        check:'<path d="m5 12 4 4L19 6"/>',
        upload:'<path d="M12 17V3M7 8l5-5 5 5M4 16v5h16v-5"/>',
        download:'<path d="M12 3v14M7 12l5 5 5-5M4 16v5h16v-5"/>',
        drive:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18M7 17h.01M11 17h.01"/>',
        gauge:'<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5M6 10l1 1M12 5v2M18 16h2M4 16h2"/><circle cx="12" cy="13" r="1.5"/>',
        subtitles:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M6 11h3m3 0h6M6 15h7m3 0h2"/>',
        pin:'<path d="M16 3H8v5l-3 4v2h14v-2l-3-4ZM12 14v7"/>',
        shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
        fresh:'<path d="M12 3v4M3 12h4M17 12h4M12 17v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>'
    };
    function icon(name) { return '<svg class="fbr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] || paths.film)+'</svg>'; }
    // Original Dolby wordmark geometry: professional.dolby.com/globalassets/logo/dolby_logo_white.svg.
    // The adjacent format label is UI text, not a recreated product logo. See ASSET_NOTICES.md.
    function badgeContent(badge) {
        if (badge.brand === 'dolby') return '<span class="fbr-dolby" role="img" aria-label="'+esc(badge.label)+'">'+'<svg class="fbr-dolby-logo" viewBox="0 0 974.90004 246.60001" fill="currentColor" aria-hidden="true"><g transform="translate(-122.6,-122.49985)"><rect x="776.40002" y="122.6" width="28.700001" height="189.3"/><path d="m 692.3,180.8 c -36.2,0 -65.6,29.4 -65.6,65.6 0,36.2 29.4,65.6 65.6,65.6 36.2,0 65.6,-29.4 65.6,-65.6 0,-36.1 -29.5,-65.6 -65.6,-65.6 z m 0,104.9 c -21.9,0 -39.5,-17.8 -39.5,-39.5 0,-21.9 17.8,-39.5 39.5,-39.5 21.7,0 39.5,17.8 39.5,39.5 0,21.9 -17.8,39.5 -39.5,39.5 z"/><path d="m 269.2,217.2 c 0,52.1 42.5,94.6 94.6,94.6 h 27.9 V 122.6 h -27.9 c -52.1,0 -94.6,42.5 -94.6,94.6 z"/><path d="m 150.5,122.6 h -27.9 v 189.3 h 27.9 c 52.1,0 94.6,-42.5 94.6,-94.6 0,-52.1 -42.5,-94.7 -94.6,-94.7 z"/><path d="m 895.5,180.9 c -13.9,0 -26.9,4.4 -37.5,11.8 V 122.6 H 829.2 V 311.9 H 858 v -11.6 c 10.6,7.4 23.6,11.8 37.5,11.8 36.2,0 65.6,-29.4 65.6,-65.6 0,-36.2 -29.5,-65.6 -65.6,-65.6 z m 0,104.8 c -17.5,0 -32.3,-11.4 -37.5,-27.1 -1.3,-3.9 -2,-8.1 -2,-12.5 0,-4.4 0.7,-8.6 2,-12.5 5.2,-15.8 20.1,-27.1 37.5,-27.1 21.7,0 39.5,17.8 39.5,39.5 0,22.1 -17.8,39.7 -39.5,39.7 z"/><path d="m 517.5,122.5 h -68.4 v 189.3 h 68.4 c 52.2,0 94.6,-42.5 94.6,-94.6 0,-52.2 -42.4,-94.7 -94.6,-94.7 z m 0,160.6 H 477.8 V 151.2 h 39.7 c 36.3,0 65.9,29.6 65.9,65.9 0,36.4 -29.6,66 -65.9,66 z"/><path d="m 1066.2,181 -37.4,84 -37.4,-84 h -31.3 l 53.1,119.2 c 0,0 -13,29.2 -13,29.3 -3.4,7.7 -12.5,11.2 -20.2,7.8 l -4.1,-1.8 -11.6,26 v 0 0 0 l 9.9,4.4 c 18.7,8.3 40.7,-0.1 49,-18.8 0.1,-0.2 67.9,-151.8 74.3,-166.1 z"/></g></svg>'+'<span class="fbr-dolby-format">'+esc(badge.label.replace(/^Dolby /,''))+'</span></span>';
        return (badge.icon ? icon(badge.icon) : '')+esc(badge.label);
    }
    function score(value,max) {
        var n = parseFloat(str(value).replace(',','.'));
        return isFinite(n) && n > 0 && n <= max ? (max === 10 ? n.toFixed(1) : String(Math.round(n))) : '';
    }
    function ratingFacts(movie,extra) {
        extra = extra || {};
        var rows = [], specs = [
            ['tmdb','TMDB',movie.vote_average,10],['imdb','IMDb',movie.imdb_rating,10],
            ['rt','Rotten Tomatoes',movie.rotten_tomatoes_rating || movie.rt_rating,100],
            ['mc','Metacritic',movie.metacritic_rating || movie.metascore,100]
        ];
        specs.forEach(function (s) { var raw=extra[s[0]] !== undefined ? extra[s[0]] : s[2], value=score(raw,s[3]); if (s[3] === 100 && /^0(?:%|\/100)?$/.test(str(raw))) value='0'; if (value) rows.push({id:s[0],name:s[1],value:value,scale:s[0] === 'rt' ? '%' : '/'+s[3]}); });
        return rows;
    }
    function imdbId(movie) {
        var value=movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);
        return /^tt\d{5,12}$/.test(str(value)) ? value : '';
    }
    function parsedRatings(data,id,provider) {
        var result={};
        if (!/^tt\d{5,12}$/.test(str(id))) return result;
        if (provider === 'cinemeta') {
            if (!data || !data.meta || data.meta.id !== id) return result;
            var value=score(data.meta.imdbRating,10);
            if (value) result.imdb=value;
        } else if (provider === 'aggregator' && data && Array.isArray(data.streams)) {
            data.streams.forEach(function (item) {
                // Never accept scores returned for a different film, or any media URL.
                if (!new RegExp('^https://(?:www\\.)?imdb\\.com/title/'+id+'/?(?:[?#].*)?$').test(str(item.externalUrl))) return;
                str(item.description).split(/[\r\n]+/).forEach(function (line) {
                    var match=line.match(/(?:^|[^A-Za-z])(IMDb|MC|RT)\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(10|100)\s*$/);
                    if (!match) return;
                    var key={IMDb:'imdb',MC:'mc',RT:'rt'}[match[1]], max=key === 'imdb' ? 10 : 100, n=Number(match[2]);
                    if (+match[3] === max && isFinite(n) && n >= (max === 10 ? 0.1 : 0) && n <= max) result[key]=max === 10 ? n.toFixed(1) : String(Math.round(n));
                });
            });
        }
        return result;
    }
    function ratingRequest(url,done) {
        var xhr, ended=false;
        function finish(error,data) { if (ended) return;ended=true;done(error,data); }
        try {
            xhr=new root.XMLHttpRequest();xhr.open('GET',url,true);xhr.timeout=8000;
            xhr.onload=function () {
                if (xhr.status < 200 || xhr.status >= 300) return finish('HTTP '+xhr.status);
                try { finish(null,JSON.parse(xhr.responseText)); } catch (ignore) { finish('Некоректна відповідь'); }
            };
            xhr.onerror=function () { finish('Мережа / CORS'); };
            xhr.ontimeout=function () { finish('Час очікування'); };
            xhr.send();
        } catch (ignore) { finish('Запит недоступний'); }
    }
    function loadRatings(movie,done) {
        var key=identity(movie), id=imdbId(movie), kind=key.split(':')[0] === 'tv' ? 'series' : 'movie';
        if (!key || !on('ratings')) return done({});
        var cache=get('external_ratings_cache',{});
        if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache={};
        var saved=cache[key], now=Date.now();
        if (saved && saved.checkedAt <= now+60000 && saved.expiresAt > now && (!id || saved.imdbId === id)) {
            ratingStatus=saved.status;return done(saved.values || {});
        }
        var jobKey=key+'|'+id;
        if (ratingJobs[jobKey]) { ratingJobs[jobKey].push(done);return; }
        ratingJobs[jobKey]=[done];
        var completed=false, timer;
        function finish(values,status,partial) {
            if (completed) return;completed=true;if(timer) root.clearTimeout(timer);
            // Read again: another card may have completed while these requests were running.
            cache=get('external_ratings_cache',{});if(!cache || typeof cache !== 'object' || Array.isArray(cache)) cache={};
            var at=Date.now();ratingStatus=(movie.title || movie.name || key)+' · '+status;
            cache[key]={imdbId:id,checkedAt:at,expiresAt:at+(partial ? 5*60*1000 : TTL),values:values,status:ratingStatus};
            Object.keys(cache).sort(function (a,b) { return (cache[b].checkedAt || 0)-(cache[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete cache[k]; });
            set('external_ratings_cache',cache);
            var callbacks=ratingJobs[jobKey] || [];delete ratingJobs[jobKey];callbacks.forEach(function (cb) { cb(values); });
        }
        function fetchScores() {
            var pending=2, values={}, statuses=[], partial=false;
            [['cinemeta','https://v3-cinemeta.strem.io/meta/'+kind+'/'+id+'.json'],['aggregator','https://rating-aggregator.elfhosted.com/stream/'+kind+'/'+id+'.json']].forEach(function (source) {
                ratingRequest(source[1],function (error,data) {
                    if (completed) return;
                    var scores=parsedRatings(data,id,source[0]);
                    Object.keys(scores).forEach(function (k) { if(k !== 'imdb' || source[0] === 'cinemeta' || !values.imdb) values[k]=scores[k]; });
                    statuses.push((source[0] === 'cinemeta' ? 'IMDb' : 'RT / Metacritic')+': '+(error || (Object.keys(scores).length ? 'отримано' : 'немає оцінок')));
                    if(error) partial=true;
                    if(--pending === 0) finish(values,statuses.join('; '),partial || !Object.keys(values).length);
                });
            });
        }
        if (id) return fetchScores();
        var tmdb=L.Api && L.Api.sources && L.Api.sources.tmdb;
        if (!tmdb || typeof tmdb.get !== 'function' || (movie.source && movie.source !== 'tmdb' && movie.source !== 'cub')) return finish({},'IMDb ID недоступний',true);
        timer=root.setTimeout(function () { finish({},'IMDb ID: час очікування',true); },10000);
        try { tmdb.get((kind === 'series' ? 'tv' : 'movie')+'/'+movie.id+'/external_ids',{},function (data) {
            if (completed) return;
            root.clearTimeout(timer);timer=null;
            if (data && (data.id === undefined || String(data.id) === String(movie.id))) id=imdbId(data);
            if (id) fetchScores();else finish({},'IMDb ID не знайдений',true);
        },function () { finish({},'IMDb ID: помилка TMDB',true); },{life:60*24*7}); } catch (ignore) { finish({},'IMDb ID: запит недоступний',true); }
    }
    function requestDetailRatings(record) {
        if (!on('ratings') || record.ratingsRequested) return;
        record.ratingsRequested=true;
        var key=identity(record.movie);
        loadRatings(record.movie,function (values) {
            if (identity(record.movie) !== key || !doc.documentElement.contains(record.node)) return;
            record.externalRatings=values;refreshDetail(record);
        });
    }
    function awardFacts(movie,extra) {
        var awards=movie.awards || movie.Awards || {}, raw=typeof awards === 'string' ? awards : '', oscars, wins;
        extra=extra || {};
        oscars=extra.oscars || movie.oscar_wins || (typeof movie.oscars === 'number' ? movie.oscars : 0) || (awards.oscars && awards.oscars.wins) || awards.oscar_wins;
        wins=extra.awards || movie.awards_wins || awards.wins;
        var match=raw.match(/\bwon\s+(\d+)\s+Oscars?\b/i);if(!oscars && match) oscars=+match[1];
        match=raw.match(/(\d+)\s+wins?\b/i);if(!wins && match) wins=+match[1];
        var out=[];
        [[oscars,'oscars','Оскари'],[wins,'awards','Перемоги']].forEach(function (item) { var n=Number(item[0]);if(n>0 && n<=100000 && Math.floor(n)===n) out.push({id:item[1],name:item[2],value:String(n),scale:''}); });
        return out;
    }
    function ratingIcon(name) {
        var art={
            imdb:'<path d="m16 2.5 4.1 8.3 9.2 1.3-6.6 6.5 1.5 9.1-8.2-4.3-8.2 4.3 1.6-9.1-6.7-6.5 9.2-1.3Z" fill="#FFD15C"/><path d="m16 2.5 4.1 8.3-4.1 5.6Z" fill="#FFF1B0"/><path d="m16 16.4 8.2 11.3-1.5-9.1 6.6-6.5Z" fill="#E9A527"/>',
            tmdb:'<path d="M2 3h12v4h-4v8H6V7H2Zm14 0h4l3 5 3-5h4v12h-4V9l-3 4-3-4v6h-4Z" fill="#57D4DD"/><path d="M2 18h6c4 0 6 2 6 6s-2 6-6 6H2Zm4 3v6h2c2 0 2-1 2-3s0-3-2-3Zm11-3h7c5 0 6 4 3 6 4 2 2 6-2 6h-8Zm4 3v2h3c1 0 1-2 0-2Zm0 4v2h3c2 0 2-2 0-2Z" fill="#55ACF5"/>',
            rt:'<path d="M15 8C7 3 1 12 4 21c3 11 21 11 24-1 2-9-5-15-13-12Z" fill="#F34843"/><path d="M22 10c6 3 5 13-1 17 8-1 10-14 1-17Z" fill="#C72D35"/><path d="m16 10-7-2 5-2-2-4 5 3 4-3-1 5 7 1-7 3-3 5Z" fill="#52CC82"/><path d="M9 14c-2 2-2 5-1 7" fill="none" stroke="#FFA28F" stroke-width="2" stroke-linecap="round"/>',
            mc:'<circle cx="16" cy="16" r="14" fill="#202B3D" stroke="#F4CE51" stroke-width="2.5"/><path d="M8 22V12h4v2c2-3 6-3 8 0 2-3 6-3 6 2v6h-4v-6c0-2-3-2-3 0v6h-4v-6c0-2-3-2-3 0v6Z" fill="#F5F7FD"/>',
            oscars:'<circle cx="16" cy="5" r="3" fill="#FFE1A0"/><path d="m12 9-2 7 3 3 1 7h4l1-7 3-3-2-7-4 2Z" fill="#EBC76E"/><path d="m12 11 4 6 4-6M13 19h6" fill="none" stroke="#A77B35" stroke-width="1.4"/><path d="M11 26h10v3H11ZM8 29h16v2H8Z" fill="#FFE1A0"/>',
            awards:'<path d="M9 3h14v8c0 9-14 9-14 0Z" fill="#F4CD62"/><path d="M9 6H4v4c0 5 5 6 7 6M23 6h5v4c0 5-5 6-7 6" fill="none" stroke="#DDA94B" stroke-width="2.5"/><path d="M15 18h3v7h-3ZM10 25h13v3H10ZM7 28h19v3H7Z" fill="#F4CD62"/><path d="M12 5h3v7c0 2 1 3 1 3-4-1-4-3-4-10Z" fill="#FFF0B3"/>'
        };
        return art[name] ? '<svg class="fbr-rating-icon" viewBox="0 0 32 32" aria-hidden="true">'+art[name]+'</svg>' : icon('star');
    }
    function ratingMarkup(rows) {
        return rows.map(function (r) { return '<div class="fbr-rating fbr-rating--'+esc(r.id)+'" title="'+esc(r.name)+'"><span class="fbr-rating-logo">'+ratingIcon(r.id)+'</span><span class="fbr-rating-body"><small>'+esc(r.id === 'rt' ? 'Tomatoes' : r.name)+'</small><strong>'+esc(r.value)+(r.scale ? '<em>'+esc(r.scale)+'</em>' : '')+'</strong></span></div>'; }).join('');
    }
    function torrentCount(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (!/^\d+$/.test(str(value).trim())) return null;
        var n=Number(value);return isFinite(n) && n >= 0 && n <= 1000000000 ? n : null;
    }
    function torrentFacts(item) {
        item=item || {};
        var title=str(item.Title || item.title), tracker=str(item.Tracker || item.tracker), general=item.general || {}, info=item.info || {};
        var probe=Array.isArray(item.ffprobe) ? item.ffprobe.filter(function (p) { return p && typeof p === 'object'; }) : [], video=probe.filter(function (p) { return p.codec_type === 'video'; })[0];
        var raw=str(general.resolution || info.quality)+' '+title, badges=[], langs=[];
        function add(iconName,label,kind,brand) { if(label) { var badge={icon:iconName,label:label,kind:kind || 'info'};if(brand) badge.brand=brand;badges.push(badge); } }
        function token(value,pattern) { return new RegExp('(?:^|[^a-zа-яіїєґ0-9])(?:'+pattern+')(?:$|[^a-zа-яіїєґ0-9])','i').test(value); }
        var w=Number(video && video.width), h=Number(video && video.height), measured=w > 0 || h > 0;
        // Cropped widescreen 3840x1600 is still a 4K release; measured SD beats a misleading filename.
        var resolution=w >= 3200 || h >= 1800 ? '4K' : w >= 2300 || h >= 1250 ? '1440p' : w >= 1700 || h >= 900 ? '1080p' : w >= 1100 || h >= 650 ? '720p' : h >= 450 ? '480p' : h >= 300 ? '360p' : '';
        if (!measured) resolution=token(raw,'2160[pр]?|4k|uhd|ultrahd') ? '4K' : token(raw,'1080[pрi]?|fhd|full[ .-]?hd') ? '1080p' : token(raw,'720[pр]?|hd') ? '720p' : '';
        add('',resolution,resolution === '4K' ? '4k' : 'quality');
        var format=token(title,'remux') ? 'REMUX' : token(title,'blu[ .-]?ray|bdrip|brrip') ? 'Blu-ray' : token(title,'web[ .-]?dl|web[ .-]?rip') ? 'WEB' : '';
        add('',format);
        if (general.hdr === true || token(str(general.hdr)+' '+title,'hdr10\\+?|hdr')) add('','HDR','hdr');
        if (token(str(general.hdr)+' '+title,'dolby[ .-]?vision|dv|dovi')) add('','Dolby Vision','vision','dolby');
        var codec=str(video && video.codec_name), codecText=codec || title;
        add('',token(codecText,'hevc|[hx][ .-]?265') ? 'HEVC' : token(codecText,'av1') ? 'AV1' : token(codecText,'avc|[hx][ .-]?264') ? 'H.264' : '');
        var audio=probe.filter(function (p) { return p.codec_type === 'audio'; });
        var audioText=audio.map(function (p) { return [p.codec_name,p.codec_long_name,p.profile,p.tags && p.tags.title].map(str).join(' '); }).join(' ');
        var dolbyPattern='e[ .-]?ac[ .-]?3|ac[ .-]?3|true[ .-]?hd|dolby[ .-]?(?:digital(?:[ .-]?plus)?|audio|atmos)|ddp(?:[ .]?\\d\\.\\d)?|dd\\+(?:[ .]?\\d\\.\\d)?|dd[ .]?\\d\\.\\d';
        var dolbyAudio=token(audioText,dolbyPattern) || token(title,dolbyPattern);
        // Atmos needs an explicit declaration. AC-3, E-AC-3, TrueHD and 7.1 alone do not prove it.
        var atmos=token(audioText,'(?:dolby[ .-]?)?atmos') || token(title,'dolby[ .-]?atmos') || (dolbyAudio && token(title,'atmos'));
        if (atmos) add('','Dolby Atmos','audio','dolby');
        else if (dolbyAudio) add('','Dolby Audio','audio','dolby');
        var languageNames={uk:'UA',ukr:'UA',ua:'UA',ukrainian:'UA',en:'EN',eng:'EN',english:'EN',ru:'RU',rus:'RU',russian:'RU'};
        function lang(value) { var name=languageNames[str(value).toLowerCase()];if(name && langs.indexOf(name)<0) langs.push(name); }
        (Array.isArray(item.languages) ? item.languages : []).forEach(function (v) { lang(typeof v === 'string' ? v : v && (v.code || v.language)); });
        audio.forEach(function (p) { if(p.tags) lang(p.tags.language); });
        if(token(title,'ua|ukr|ukrainian|укр|українська|українською')) lang('uk');
        if(token(title,'en|eng|english|англ')) lang('en');
        if(token(title,'ru|rus|russian|рус')) lang('ru');
        ['UA','EN','RU'].forEach(function (v) { if(langs.indexOf(v)>=0) add('sound',v,v === 'UA' ? 'ua' : 'language'); });
        var channels=probe.some(function (p) { return p.codec_type === 'audio' && +p.channels === 8; }) ? '7.1' : probe.some(function (p) { return p.codec_type === 'audio' && +p.channels === 6; }) ? '5.1' : '';
        add('sound',channels);
        // Tracker identity, never a coincidental word in the release's title.
        var toloka=/(?:^|[^a-zа-яіїєґ0-9])(?:toloka|толока|hurtom|гуртом)(?:$|[^a-zа-яіїєґ0-9])/i.test(tracker);
        var seeds=torrentCount(item.Seeders !== undefined ? item.Seeders : item.seeds), peers=torrentCount(item.Peers !== undefined ? item.Peers : item.grabs);
        return {tracker:tracker || 'Трекер не вказаний',toloka:toloka,seeds:seeds,peers:peers,recommended:seeds !== null && seeds >= 50,badges:badges};
    }
    function torrentMarkup(facts,details) {
        var header='<div class="fbr-torrent-header"><span class="fbr-torrent-tracker'+(facts.toloka ? ' fbr-torrent-tracker--toloka' : '')+'">'+icon('globe')+esc(facts.tracker)+'</span>';
        if (facts.toloka) header+='<span class="fbr-torrent-priority">'+icon('pin')+'Пріоритет</span>';
        if (facts.recommended) header+='<span class="fbr-torrent-recommended" title="Від 50 сідів за даними парсера">'+icon('check')+'Рекомендуємо</span>';
        header+='<span class="fbr-torrent-open">'+icon('arrow')+'</span></div>';
        var badges='<div class="fbr-torrent-badges">'+facts.badges.map(function (b) { return '<span class="fbr-torrent-badge fbr-torrent-badge--'+b.kind+'">'+badgeContent(b)+'</span>'; }).join('')+'</div>';
        function stat(name,label,kind) { return '<span class="fbr-torrent-stat'+(kind ? ' fbr-torrent-stat--'+kind : '')+'">'+icon(name)+esc(label)+'</span>'; }
        function counted(n,words) { var end=n%10, teen=n%100;return n+' '+words[teen >= 11 && teen <= 14 ? 2 : end === 1 ? 0 : end >= 2 && end <= 4 ? 1 : 2]; }
        var stats=stat('upload',facts.seeds === null ? 'Сіди невідомі' : counted(facts.seeds,['сід','сіди','сідів']),facts.seeds === null ? 'unknown' : facts.seeds === 0 ? 'empty' : 'seeds');
        if (facts.peers !== null) stats+=stat('download',counted(facts.peers,['пір','піри','пірів']),'peers');
        if (details.size) stats+=stat('drive',details.size,'size');
        if (details.bitrate) stats+=stat('gauge',details.bitrate.replace(/^(?:Б[иі]трейт|Bitrate)\s*:\s*/i,''),'bitrate');
        if (details.date) stats+=stat('clock',details.date,'date');
        return {header:header,summary:badges+'<div class="fbr-torrent-stats">'+stats+'</div>'};
    }
    function decorateTorrent(event) {
        if (!event || event.type !== 'render' || !event.item) return;
        var node=event.item[0] || event.item;
        if (!node || !node.querySelector || node.querySelector('.fbr-torrent-header')) return;
        var title=node.querySelector('.torrent-item__title');if(!title) return;
        var facts=torrentFacts(event.element), details={size:textOf(node.querySelector('.torrent-item__size')),date:textOf(node.querySelector('.torrent-item__date')),bitrate:textOf(node.querySelector('.torrent-item__bitrate'))};
        var html=torrentMarkup(facts,details), head=doc.createElement('div'), summary=doc.createElement('div');
        node.classList.add('fbr-torrent');node.classList.toggle('fbr-torrent--toloka',facts.toloka);
        head.className='fbr-torrent-decoration';head.innerHTML=html.header;title.parentNode.insertBefore(head,title);
        summary.className='fbr-torrent-decoration';summary.innerHTML=html.summary;title.parentNode.insertBefore(summary,title.nextSibling);
        // Preserve native ffprobe/voice details, hiding only facts already in our badges.
        var labels=facts.badges.map(function (b) { return b.label.toLowerCase(); });
        Array.prototype.forEach.call(node.querySelectorAll('.torrent-item__ffprobe > div'),function (n) {
            var nativeIcon=n.classList.contains('m-audio') || n.classList.contains('m-channels') ? 'sound' : n.classList.contains('m-subtitle') ? 'subtitles' : n.classList.contains('m-video') ? 'tv' : '';
            if(nativeIcon) { var mark=doc.createElement('span');mark.className='fbr-probe-icon';mark.innerHTML=icon(nativeIcon);n.insertBefore(mark,n.firstChild); }
            var value=textOf(n).toLowerCase();
            value=({'2160p':'4k',fhd:'1080p',hd:'720p',ukr:'ua',eng:'en',rus:'ru'})[value] || value;
            // Lampa labels every general.hdr value as HDR, including Dolby Vision-only titles.
            if(value === 'hdr' && labels.indexOf('dolby vision')>=0 && labels.indexOf('hdr')<0) n.classList.add('fbr-torrent-covered');
            if(!n.classList.contains('m-subtitle') && labels.indexOf(value)>=0) n.classList.add('fbr-torrent-covered');
        });
    }
    function existingTorrents() {
        Array.prototype.forEach.call(doc.querySelectorAll('.torrent-item:not(.fbr-torrent)'),function (node) {
            decorateTorrent({type:'render',item:node,element:{Title:textOf(node.querySelector('.torrent-item__title')),Tracker:textOf(node.querySelector('.torrent-item__tracker')),Seeders:textOf(node.querySelector('.torrent-item__seeds > span')),Peers:textOf(node.querySelector('.torrent-item__grabs > span'))}});
        });
    }
    function cachedQuality(movie,now) {
        var key = identity(movie), data = get('quality_cache',{}), record = key && data && data[key];
        if (!record || !record.checkedAt || (now || Date.now())-record.checkedAt > TTL || record.checkedAt > (now || Date.now())+60000) return null;
        return record;
    }
    function qualityFacts(record) {
        if (!record) return [];
        var allowed = ['2160p','1440p','1080p','720p','480p','360p'], result = [], qualities = record.qualities || [];
        var quality = allowed.filter(function (q) { return qualities.indexOf(q) >= 0; })[0];
        if (quality) result.push({icon:'quality',label:quality === '2160p' ? '4K' : quality === '1080p' ? 'Full HD' : quality,kind:'quality'});
        // HDR/Dolby/surround are never guessed from resolution, filename or TMDB.
        if (record.hdr === true) result.push({icon:'',label:'HDR',kind:'hdr'});
        if (record.dolbyVision === true) result.push({icon:'',label:'Dolby Vision',kind:'vision',brand:'dolby'});
        var langs = ['uk','en','ru'].filter(function (lang) { return (record.languages || []).indexOf(lang) >= 0; });
        if (langs.length) result.push({icon:'globe',label:langs.map(function (v) { return {uk:'UA',en:'EN',ru:'RU'}[v]; }).join(' / '),kind:'language'});
        if (record.season && record.episode) result.push({icon:'tv',label:'S'+record.season+'E'+record.episode,kind:'episode'});
        return result;
    }
    function badgesMarkup(record,unknown) {
        var facts = qualityFacts(record);
        return facts.length ? facts.map(function (b) { return '<span class="fbr-badge fbr-badge--'+b.kind+'">'+badgeContent(b)+'</span>'; }).join('') : unknown ? '<span class="fbr-badge fbr-badge--unknown">'+icon('quality')+'Якість після пошуку</span>' : '';
    }
    function learn(movie,evidence) {
        var key = identity(movie); if (!key) return;
        var data = get('quality_cache',{}); if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
        data[key] = {checkedAt:Date.now(),qualities:evidence.qualities || [],languages:evidence.languages || [],season:evidence.season || 0,episode:evidence.episode || 0,hdr:evidence.hdr === true,dolbyVision:evidence.dolbyVision === true};
        Object.keys(data).sort(function (a,b) { return (data[b].checkedAt || 0)-(data[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete data[k]; });
        set('quality_cache',data);
        homeCards.forEach(function (card) { if (identity(card.movie) === key) paintHomeBadges(card); });
        records.forEach(function (record) { if (identity(record.movie) === key) refreshDetail(record); });
    }
    function localRating(movie,value) {
        var key = identity(movie), all = get('my_ratings',{}); if (!key) return 0;
        if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
        if (arguments.length > 1) { if (value >= 1 && value <= 10) all[key] = Math.round(value); else delete all[key]; set('my_ratings',all); }
        return +all[key] >= 1 && +all[key] <= 10 ? +all[key] : 0;
    }
    function textOf(node) { return node ? str(node.textContent).replace(/\s+/g,' ').trim() : ''; }
    function sourceRating(node) {
        function classify(hint) {
            if (/nominat|номін|номин/i.test(hint)) return '';
            if (/oscars?|academy.?awards?/i.test(hint)) return 'oscars';
            if (/awards?|troph|нагород|награ|перемог|побед|wins/i.test(hint)) return 'awards';
            if (/imdb/i.test(hint)) return 'imdb';
            if (/tmdb/i.test(hint)) return 'tmdb';
            if (/metacritic|metascore|rate--mc/i.test(hint)) return 'mc';
            if (/rottentomatoes|rotten.?tomatoes|tomato|tomatometer|rate--rt\b/i.test(hint)) return 'rt';
            return '';
        }
        var hint=str(node.className)+' '+str(node.getAttribute('data-source'))+' '+str(node.getAttribute('title'))+' '+str(node.getAttribute('aria-label'));
        var known=classify(hint);if(known) return known;
        var images=node.querySelectorAll('img');
        for(var i=0;i<images.length;i++) hint+=' '+images[i].getAttribute('src')+' '+images[i].getAttribute('alt');
        return classify(hint+' '+textOf(node));
    }
    function readRatings(record) {
        var result={},line=record.node.querySelector('.full-start-new__rate-line,.full-start__rate-line');
        if(!line) return result;
        function visit(node,depth) {
            if(node.classList.contains('hide')) return;
            var id=sourceRating(node),numbers=textOf(node).match(/\d+(?:[.,]\d+)?/g) || [],n=numbers[0];
            if(id && score(n,id==='oscars' || id==='awards' ? 100000 : id==='rt' || id==='mc' ? 100 : 10)) result[id]=n;
            if(depth<3) Array.prototype.forEach.call(node.children,function (child) { if(!/svg|path|use|circle|rect/i.test(child.tagName)) visit(child,depth+1); });
        }
        Array.prototype.forEach.call(line.children,function (node) { visit(node,0); });
        return result;
    }
    function openMyRating(record,button) {
        var controller = L.Controller.enabled().name, previous = localRating(record.movie);
        function back() { L.Select.hide(); L.Controller.toggle(controller); var current=record.node.querySelector('.fbr-my-rating'); if (current && doc.documentElement.contains(current)) L.Controller.collectionFocus(current,$(record.node)); }
        var rows = [];
        for (var n=10;n>=1;n--) rows.push({title:n+' / 10',value:n,selected:n === previous});
        if (previous) rows.push({title:'Прибрати мою оцінку',value:0});
        L.Select.show({title:'Моя оцінка · '+esc(record.movie.title || record.movie.name),items:rows,onSelect:function (row) { localRating(record.movie,row.value); refreshDetail(record); back(); },onBack:back});
    }
    function buttonKey(node) {
        var names={'view--faborn-ukr':'online','view--faborn-torrent':'torrent','view--torrent':'torrent','button--play':'watch','button--book':'bookmark','button--reaction':'reaction','button--subscribe':'subscribe','button--options':'options'};
        var classes=str(node.className).split(/\s+/), key='';
        Object.keys(names).some(function (name) { if (classes.indexOf(name) >= 0) { key=names[name];return true; } });
        if (key) return key;
        var use=node.querySelector('use'), href=use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
        if (classes.indexOf('button--priority') >= 0 && /torrent/.test(href || '')) return 'torrent';
        var custom=classes.filter(function (c) { return /^view--|^button--/.test(c) && c !== 'button--priority'; }).sort();
        if (custom.length) return 'source:'+custom.join(':');
        var label=node.getAttribute('data-title') || node.getAttribute('aria-label') || textOf(node);
        return label ? 'label:'+label.replace(/\s+/g,' ').trim() : '';
    }
    function actionButtons(record) {
        var row=record.node.querySelector('.full-start-new__buttons,.full-start__buttons');
        return row ? Array.prototype.filter.call(row.children,function (node) { return node.classList.contains('full-start__button'); }) : [];
    }
    function orderedKeys(available,saved) {
        var out=[];
        (Array.isArray(saved) ? saved : ['online','torrent']).concat(available).forEach(function (key) { if (available.indexOf(key) >= 0 && out.indexOf(key) < 0) out.push(key); });
        return out;
    }
    function arrangeButtons(record) {
        var buttons=actionButtons(record), used={}, present=buttons.some(function (b) { return b.classList.contains('view--faborn-torrent') && !b.classList.contains('hide'); });
        buttons.forEach(function (node) {
            var key=buttonKey(node), icon=node.querySelector('svg path,svg use,svg circle,svg rect,svg polygon,svg line,svg polyline,img');
            var duplicate=(key === 'torrent' && present && !node.classList.contains('view--faborn-torrent')) || (key && used[key]);
            node.classList.toggle('fbr-empty-button',!icon && !textOf(node));
            node.classList.toggle('fbr-duplicate-button',!!duplicate);
            if (!duplicate && key && !node.classList.contains('hide')) used[key]=true;
        });
        var keys=orderedKeys(buttons.map(buttonKey).filter(Boolean),get('button_order',null));
        var sorted=buttons.slice().sort(function (a,b) { var ka=keys.indexOf(buttonKey(a)),kb=keys.indexOf(buttonKey(b));return (ka<0 ? 999 : ka)-(kb<0 ? 999 : kb) || buttons.indexOf(a)-buttons.indexOf(b); });
        if (sorted.some(function (node,index) { return node !== buttons[index]; })) sorted.forEach(function (node) { node.parentNode.appendChild(node); });
    }
    function editButtons() {
        prune();
        var record=records[records.length-1];
        if (!record) return L.Noty.show('Спочатку відкрий картку фільму або серіалу.');
        var controller=L.Controller.enabled().name;
        var labels={online:'ukr by Faborn',torrent:'Торренти',watch:'Джерела Lampa',bookmark:'Закладки',reaction:'Реакції',subscribe:'Підписка',options:'Додатково'};
        function back() { L.Select.hide();L.Controller.toggle(controller); }
        function rows() {
            arrangeButtons(record);
            return actionButtons(record).filter(function (b) { return !b.classList.contains('hide') && !b.classList.contains('fbr-empty-button') && !b.classList.contains('fbr-duplicate-button'); }).map(function (b,index) { var key=buttonKey(b);return {title:esc(labels[key] || b.getAttribute('aria-label') || textOf(b) || 'Джерело'),subtitle:'Позиція '+(index+1),key:key}; });
        }
        function show() {
            var items=rows();
            items.push({title:'Відновити початковий порядок',reset:true});
            L.Select.show({title:'Порядок кнопок',items:items,onBack:back,onSelect:function (item) {
                if (item.reset) { set('button_order',null);records.forEach(arrangeButtons);return show(); }
                var current=rows(), positions=current.map(function (r,index) { return {title:'Позиція '+(index+1),index:index,selected:r.key === item.key}; });
                L.Select.show({title:item.title,items:positions,onBack:show,onSelect:function (position) {
                    var keys=current.map(function (r) { return r.key; }).filter(function (key) { return key !== item.key; });
                    keys.splice(position.index,0,item.key);
                    var saved=get('button_order',[]);if(Array.isArray(saved)) saved.forEach(function (key) { if(keys.indexOf(key)<0) keys.push(key); });
                    set('button_order',keys);records.forEach(arrangeButtons);show();
                }});
            }});
        }
        show();
    }
    function refreshDetail(record) {
        if (!record.node || !record.node.querySelector) return;
        if (record.observer) record.observer.disconnect();
        arrangeButtons(record);
        var node = record.node, line = node.querySelector('.full-start-new__rate-line,.full-start__rate-line');
        var host = node.querySelector('.full-start-new__right,.full-start__right') || node;
        var panel = node.querySelector('.fbr-detail-meta');
        if (!panel) { panel = doc.createElement('div'); panel.className = 'fbr-detail-meta'; if (line) line.parentNode.insertBefore(panel,line); else host.appendChild(panel); }
        var ratings = on('ratings'), badges = on('badges');
        if (line) line.classList.toggle('fbr-original-ratings',ratings);
        if (!badges) Array.prototype.forEach.call(node.querySelectorAll('.fbr-legacy-quality'),function (n) { n.classList.remove('fbr-legacy-quality'); });
        if (!ratings && !badges) { panel.innerHTML = ''; panel.removeAttribute('data-fbr-signature'); panel.style.display = 'none'; observeDetail(record); return; }
        panel.style.display = '';
        Array.prototype.forEach.call(host.children,function (child) {
            if (child === panel || child === line || /buttons|details|reactions|title|tagline|head/.test(child.className)) return;
            var value=textOf(child), tokens=value.replace(/Dolby\s*Vision|HDR10\+?|HDR|2160p|1080p|720p|480p|4K|5\.1|7\.1|DUB|UA\+?|EN|RU/gi,'').replace(/[^a-zа-яіїєґ0-9]/gi,'');
            if (!tokens && /4K|2160p|1080p|HDR|Dolby/i.test(value)) child.classList.toggle('fbr-legacy-quality',badges);
        });
        var extra=readRatings(record);
        Object.keys(record.externalRatings || {}).forEach(function (key) { if(extra[key] === undefined) extra[key]=record.externalRatings[key]; });
        var facts = ratingFacts(record.movie,extra).concat(awardFacts(record.movie,extra)), ownRating = localRating(record.movie);
        var meta = [], age = node.querySelector('.full-start__pg:not(.hide)'), status = node.querySelector('.full-start__status:not(.hide)');
        if (age) meta.push('<span class="fbr-fact">'+esc(textOf(age))+'</span>');
        if (status) meta.push('<span class="fbr-fact">'+esc(textOf(status))+'</span>');
        var html = ratings ? '<div class="fbr-ratings" aria-label="Рейтинги">'+ratingMarkup(facts)+(identity(record.movie) ? '<button type="button" class="fbr-my-rating selector" aria-label="Моя оцінка">'+icon('star')+'<span><small>Моя оцінка</small><strong'+(!ownRating ? ' class="fbr-rating-prompt"' : '')+'>'+(ownRating ? ownRating+'<em>/10</em>' : 'Оцінити')+'</strong></span></button>' : '')+'</div>' : '';
        if (ratings && meta.length) html += '<div class="fbr-facts">'+meta.join('')+'</div>';
        if (badges) html += '<div class="fbr-detail-badges" aria-label="Якість доступних джерел">'+badgesMarkup(cachedQuality(record.movie),true)+'</div>';
        // Do not replace a focused rating button when a late provider updates its score.
        if (panel.getAttribute('data-fbr-signature') !== html) {
            var oldButton = panel.querySelector('.fbr-my-rating');
            panel.innerHTML = html; panel.setAttribute('data-fbr-signature',html);
            var button = panel.querySelector('.fbr-my-rating');
            if (button && oldButton) {
                // Keep the same node in Lampa's remote-control collection and preserve focus/events.
                oldButton.innerHTML = button.innerHTML;
                button.parentNode.replaceChild(oldButton,button);
                button = oldButton;
            } else if (button) {
                $(button).on('hover:enter',function () { openMyRating(record,button); }).on('hover:focus',function () { if (record.start) record.start.last = button; });
                if (record.start && L.Controller.own && L.Controller.own(record.start)) L.Controller.collectionAppend([button]);
            } else if (oldButton && record.start && record.start.last === oldButton) record.start.last = node.querySelector('.view--faborn-ukr');
        }
        observeDetail(record);
    }
    function observeDetail(record) {
        if (!root.MutationObserver) return;
        if (!record.observer) record.observer = new root.MutationObserver(function (changes) {
            var external = changes.some(function (change) { var n=change.target.nodeType === 1 ? change.target : change.target.parentNode; return n && !$(n).closest('.fbr-detail-meta').length; });
            if (!external || record.timer) return;
            record.timer = root.setTimeout(function () { record.timer = null; refreshDetail(record); },160);
        });
        record.observer.observe(record.node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    }
    function prune() {
        records = records.filter(function (record) { if (doc.documentElement.contains(record.node)) return true; if (record.observer) record.observer.disconnect(); if (record.timer) root.clearTimeout(record.timer); return false; });
        homeCards = homeCards.filter(function (record) { return doc.documentElement.contains(record.node); });
    }
    function ratingNavigation(record) {
        if (!record.start || !record.start.use || record.navigation) return;
        record.navigation = true;
        record.start.use({onController:function (controller) {
            var up=controller.up, down=controller.down;
            controller.up=function () {
                var rating=record.node.querySelector('.fbr-my-rating'), action=record.node.querySelector('.full-start-new__buttons .focus,.full-start__buttons .focus');
                if (rating && rating.offsetParent && action) { record.lastAction=action;L.Controller.collectionFocus(rating,$(record.node)); }
                else if (up) up.apply(this,arguments);
            };
            controller.down=function () {
                var rating=record.node.querySelector('.fbr-my-rating.focus');
                if (rating) L.Controller.collectionFocus(record.lastAction || record.node.querySelector('.view--faborn-ukr'),$(record.node));
                else if (down) down.apply(this,arguments);
            };
        }});
    }
    function full(event) {
        if (!event || event.type !== 'complite' || !event.data || !event.data.movie || !event.object || !event.object.activity) return;
        var render = event.object.activity.render(), node = render && (render[0] || render);
        if (!node || !node.querySelector) return;
        prune();
        var record = records.filter(function (r) { return r.node === node; })[0];
        if (!record) { record = {node:node,movie:event.data.movie}; records.push(record); }
        record.start = event.link && event.link.items && event.link.items[0] || record.start;
        ratingNavigation(record);
        refreshDetail(record);
        requestDetailRatings(record);
        // The added rating action must not steal the initial focus from playback.
        if (record.start && !record.start.last) record.start.last = actionButtons(record).filter(function (button) { return !button.classList.contains('hide') && !button.classList.contains('fbr-empty-button') && !button.classList.contains('fbr-duplicate-button'); })[0];
    }
    function isMovieLine(data) {
        if (!data || !Array.isArray(data.results) || !data.results.length) return false;
        if (/shot|trailer|person|actor|timetable/i.test(str(data.line_type)+' '+str(data.type)+' '+str(data.params && data.params.type))) return false;
        return data.results.every(function (movie) { return movie && movie.id && (movie.title || movie.name) && (movie.poster_path || movie.backdrop_path) && !movie.known_for_department && !movie.video_id && !movie.youtube; });
    }
    function cardMeta(movie) {
        var bits = [], year = str(movie.release_date || movie.first_air_date).slice(0,4);
        if (/^\d{4}$/.test(year)) bits.push(year);
        var genres = movie.genres && movie.genres.map(function (g) { return g.name; }).filter(Boolean);
        if (!genres || !genres.length) try { genres = L.Api.sources.tmdb.getGenresNameFromIds(movie.original_name ? 'tv' : 'movie',movie.genre_ids || []); } catch (ignore) { genres=[]; }
        if (genres && genres.length) bits.push(genres.slice(0,2).join(' · '));
        else bits.push(movie.original_name || movie.first_air_date ? 'Серіал' : 'Фільм');
        return bits.join(' · ');
    }
    function paintHomeBadges(record) {
        var target = record.node.querySelector('.fbr-home-badges');
        if (target) target.innerHTML = on('badges') ? badgesMarkup(cachedQuality(record.movie),true) : '';
    }
    function decorateCard(card,movie) {
        var node = card.render(true); if (!node || !node.querySelector) return;
        if (node.querySelector('.fbr-home-info')) return;
        node.classList.add('fbr-home-card'); node.classList.add('card--wide');
        var view = node.querySelector('.card__view'); if (!view) return;
        var info = doc.createElement('div'); info.className = 'fbr-home-info';
        info.innerHTML = '<div class="fbr-home-meta">'+esc(cardMeta(movie))+'</div><div class="fbr-home-title">'+esc(movie.title || movie.name)+'</div><p class="fbr-home-overview">'+esc(movie.overview || 'Відкрий картку, щоб дізнатися більше.')+'</p><div class="fbr-home-footer"><div class="fbr-home-badges"></div><span class="fbr-home-open">'+icon('arrow')+'</span></div>';
        node.appendChild(info);
        var label = doc.createElement('div'); label.className = 'fbr-home-kind';
        label.innerHTML = icon(movie.original_name || movie.first_air_date ? 'tv' : 'film')+'<span>'+(movie.original_name || movie.first_air_date ? 'СЕРІАЛ' : 'КІНО')+'</span>';
        view.appendChild(label);
        var rating = score(movie.vote_average,10);
        if (rating) { var vote=doc.createElement('div');vote.className='fbr-home-score';vote.innerHTML=icon('star')+rating+'<small>TMDB</small>';view.appendChild(vote); }
        var record = {node:node,movie:movie};homeCards.push(record);paintHomeBadges(record);
    }
    function enhanceLine(line,data) {
        if (!on('home') || !isMovieLine(data) || !line.use) return;
        line.view = 3;
        if (line.params && line.params.items) { line.params.items.view=3;line.params.items.align_left=true; }
        data.results.forEach(function (movie) { movie.params=movie.params || {};movie.params.style=movie.params.style || {};movie.params.style.name='wide'; });
        line.use({onCreate:function () {
            var node=this.render(true);node.classList.add('fbr-home-line');
            var title=node.querySelector('.items-line__title');
            if (title) { var label=textOf(title).replace(/^[\s🔥⭐🎬🏆]+/,''); title.innerHTML=icon(/top|кращ|лучш|топ/i.test(label) ? 'trophy' : /нов|now|смотр|див/i.test(label) ? 'fresh' : 'film')+'<span>'+esc(label)+'</span>'; }
        },onInstance:function (card,movie) {
            if (!card.use) return;
            card.use({onCreate:function () { decorateCard(this,movie); }});
        }});
    }
    function hookHome() {
        if (!L.Component || !L.Component.get || !L.Component.add || mainWrapper) return;
        originalMain = L.Component.get('main'); if (!originalMain) return;
        mainWrapper = function (object) {
            var component = new originalMain(object);
            if (on('home') && component.use) component.use({onInstance:enhanceLine,onDestroy:prune});
            return component;
        };
        L.Component.add('main',mainWrapper);
    }
    function currentHome() {
        try {
            var active=L.Activity.active(), component=active && active.component;
            if (component !== 'main') return;
            // The extension may load after Lampa's first activity. Refresh only that home.
            if (L.Activity.replace && L.Controller.enabled().name !== 'settings_component' && L.Controller.enabled().name !== 'select') L.Activity.replace({component:'main',source:active.source,title:active.title,page:1});
        } catch (ignore) {}
    }
    function styles() {
        var theme=get('layout','panel') === 'classic' ? 'off' : get('theme','on');
        var palettes={blue:['#91bdff','#91bdff','#101827'],amber:['#ffd078','#ffd078','#101827'],mint:['#82dfc1','#82dfc1','#101827'],violet:['#c2a5ff','#c2a5ff','#101827'],aurora:['#0962ed','#b019ed','#ffffff'],lagoon:['#00e8bf','#208aff','#081626']};
        var colors=palettes[get('accent','blue')] || palettes.blue, accent=theme === 'off' ? '#f1f1f1' : colors[0], ink=theme === 'off' ? '#202020' : colors[2];
        var glass={solid:1,low:.7,standard:.46,high:.3,max:.18}[get('glass_transparency','standard')];
        if (glass === undefined) glass=.46;
        function rgba(hex,alpha) { return 'rgba('+[1,3,5].map(function (i) {return parseInt(hex.substr(i,2),16);}).join(',')+','+alpha+')'; }
        var sheen='linear-gradient(130deg,rgba(255,255,255,.16),rgba(255,255,255,.025) 48%,rgba(255,255,255,.07))';
        var surface='linear-gradient(120deg,'+rgba(colors[0],.18)+','+rgba(colors[1],.06)+')';
        var edge='inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(255,255,255,.06)';
        var focus=theme === 'off' ? '#f1f1f1' : 'linear-gradient(120deg,'+colors[0]+','+colors[1]+')';
        if (theme === 'ios') { surface=sheen+',rgba(72,87,110,'+glass+')';focus='linear-gradient(145deg,#ffffff,#d3e6fc)';ink='#132236'; }
        if (theme === 'off') { surface='transparent';edge='none'; }
        var torrentSurface=theme === 'on' ? 'linear-gradient(130deg,rgba(230,242,255,.1),rgba(207,228,249,.04)),linear-gradient(120deg,'+rgba(colors[0],.16)+','+rgba(colors[1],.08)+'),rgba(70,89,112,.86)' : theme === 'ios' ? sheen+',rgba(133,157,187,'+glass+')' : surface;
        var priority=theme === 'off' ? '#e7edf6' : theme === 'ios' ? '#a9d6ff' : accent;
        return [
            '.fbr-icon{display:inline-block;width:1.2em;height:1.2em;flex-shrink:0;vertical-align:middle}',
            '.fbr-original-ratings,.fbr-legacy-quality,.fbr-empty-button,.fbr-duplicate-button{display:none!important}',
            '.fbr-detail-meta{margin:.8em 0 .8em;color:inherit}.fbr-ratings{display:inline-flex;flex-wrap:wrap;align-items:stretch;max-width:100%;padding:.28em .15em;background:'+surface+';border:0;border-radius:.85em;box-shadow:'+edge+';box-sizing:border-box}',
            '.fbr-rating,.fbr-my-rating{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.1em .48em;margin:0;background:transparent;border:0;border-right:1px solid rgba(255,255,255,.12);border-radius:0;box-sizing:border-box;color:#f7f8fd;min-width:3.85em}.fbr-ratings>:last-child{border-right:0}',
            '.fbr-rating-logo{display:flex;align-items:center;justify-content:center;height:1.45em;margin-bottom:.16em}.fbr-rating-icon{width:1.35em;height:1.35em;display:block;flex-shrink:0}.fbr-rating--oscars .fbr-rating-icon{height:1.5em}',
            '.fbr-rating-body,.fbr-my-rating>span{display:flex;flex-direction:column;align-items:center}.fbr-rating-body small,.fbr-my-rating small{display:block;font-size:.6em;letter-spacing:0;line-height:1.2;color:#c0ccdc;margin-bottom:.15em;white-space:nowrap}.fbr-rating-body strong,.fbr-my-rating strong{display:block;font-size:1.13em;font-weight:600;line-height:1.1}.fbr-rating em,.fbr-my-rating em{font-size:.53em;font-style:normal;color:#a7b5c9;margin-left:.15em}',
            '.fbr-rating--oscars strong,.fbr-rating--awards strong{color:#ffe1a0}.fbr-my-rating{font:inherit;cursor:pointer;text-align:center;min-width:4.15em;border-radius:.6em}.fbr-my-rating>.fbr-icon{width:1.35em;height:1.35em;color:inherit;margin:.05em 0 .22em}.fbr-my-rating strong{font-size:1.03em}.fbr-my-rating.focus{background:'+focus+';color:'+ink+';border-color:transparent;outline:0}.fbr-my-rating.focus small,.fbr-my-rating.focus em,.fbr-my-rating.focus>.fbr-icon{color:inherit}',
            '.fbr-my-rating strong.fbr-rating-prompt{font-size:.9em}',
            '.fbr-torrent-decoration{display:none}body.fbr-torrents-enabled .fbr-torrent-decoration{display:block}body.fbr-torrents-enabled .fbr-torrent .torrent-item__details,body.fbr-torrents-enabled .fbr-torrent-covered{display:none!important}',
            'body.fbr-torrents-enabled .torrent-item.fbr-torrent{padding:1.05em 1.25em;background:'+torrentSurface+';border:1px solid rgba(255,255,255,.22);border-radius:1em;box-shadow:'+edge+';color:#f6f9ff;transform:none!important;transition:none!important}body.fbr-torrents-enabled .fbr-torrent+.fbr-torrent{margin-top:.8em}',
            'body.fbr-torrents-enabled .torrent-item.fbr-torrent--toloka{box-shadow:inset 4px 0 0 '+priority+(edge === 'none' ? '' : ','+edge)+'}body.fbr-torrents-enabled .torrent-item.fbr-torrent.focus:after{top:-.25em;right:-.25em;bottom:-.25em;left:-.25em;border:.16em solid '+(theme === 'ios' ? '#f2f7ff' : accent)+';border-radius:1.16em;z-index:0;pointer-events:none}body.fbr-torrents-enabled .torrent-item.fbr-torrent.focus{background:'+torrentSurface+'}',
            'body.fbr-torrents-enabled .fbr-torrent .torrent-item__title{font-size:1.16em;font-weight:500;line-height:1.35;word-break:normal;overflow-wrap:anywhere}body.fbr-torrents-enabled .fbr-torrent .torrent-item__viewed{top:.2em;left:-.6em;background:#9aedcc;z-index:1}',
            '.fbr-torrent-header{display:flex;align-items:center;margin-bottom:.6em;min-width:0}.fbr-torrent-tracker{display:inline-flex;align-items:center;font-size:.78em;color:#d8e4f4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fbr-torrent-tracker>.fbr-icon{margin-right:.45em}.fbr-torrent-tracker--toloka{color:#f3f8ff;font-weight:600}.fbr-torrent-priority{display:inline-flex;align-items:center;margin-left:.8em;padding:.32em .65em;border-radius:.45em;background:'+rgba(theme === 'off' ? '#c6d1de' : theme === 'ios' ? '#91bdff' : colors[0],.23)+';color:#f4faff;font-size:.76em;font-weight:600;white-space:nowrap}.fbr-torrent-priority>.fbr-icon{width:1.05em;height:1.05em;margin-right:.35em}.fbr-torrent-recommended{display:inline-flex;align-items:center;margin-left:auto;padding:.32em .6em;border-radius:.45em;background:rgba(57,213,146,.16);color:#8ff2c0;font-size:.78em;font-weight:600;white-space:nowrap}.fbr-torrent-recommended>.fbr-icon{margin-right:.35em}.fbr-torrent-open{margin-left:auto;padding-left:.7em;color:#8a9bb2}.fbr-torrent-recommended+.fbr-torrent-open{margin-left:.3em}.fbr-torrent.focus .fbr-torrent-open{color:'+(theme === 'ios' ? '#f2f7ff' : accent)+'}',
            '.fbr-torrent-badges{display:flex;flex-wrap:wrap;margin-top:.5em}.fbr-torrent-badge{display:inline-flex;align-items:center;margin:.2em .4em .2em 0;padding:.35em .5em;border-radius:.45em;background:rgba(226,236,249,.12);color:#e5eefc;font-size:.88em;line-height:1.1;font-weight:600;min-height:1.1em;white-space:nowrap}.fbr-torrent-badge>.fbr-icon{width:1.05em;height:1.05em;margin-right:.35em}.fbr-torrent-badge--4k{background:rgba(162,113,255,.2);color:#dbc4ff}.fbr-torrent-badge--quality{background:rgba(71,154,255,.15);color:#aacfff}.fbr-torrent-badge--hdr{background:rgba(245,186,63,.14);color:#ffda8b}.fbr-torrent-badge--vision,.fbr-torrent-badge--audio{background:rgba(235,243,255,.14);color:#fff}.fbr-dolby{display:inline-flex;align-items:center;white-space:nowrap}.fbr-dolby-logo{display:block;width:4.1em;height:1.037em;flex-shrink:0;overflow:visible}.fbr-dolby-format{margin-left:.45em;padding-left:.45em;border-left:1px solid rgba(255,255,255,.28);font-size:.94em;line-height:1.1;font-weight:600;letter-spacing:.04em;text-transform:uppercase}.fbr-torrent-badge--ua{background:linear-gradient(115deg,rgba(31,125,246,.26),rgba(247,203,71,.2));color:#f4e8b2}',
            '.fbr-torrent-stats{display:flex;flex-wrap:wrap;align-items:center;margin-top:.6em;padding-top:.65em;border-top:1px solid rgba(206,224,248,.1)}.fbr-torrent-stat{display:inline-flex;align-items:center;color:#c8d7eb;font-size:.8em;margin:.15em 1.25em .15em 0;white-space:nowrap}.fbr-torrent-stat>.fbr-icon{margin-right:.4em;width:1.1em;height:1.1em}.fbr-torrent-stat--seeds{color:#8aebba}.fbr-torrent-stat--empty{color:#efb38e}.fbr-torrent-stat--size{color:#e3ecf9;font-weight:600}.fbr-torrent-stat--date{margin-left:auto;margin-right:0;color:#b7c9e1}',
            'body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe{font-size:.76em;padding-top:.15em;color:#b9cbe1}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>div{background:rgba(168,190,217,.07);border-radius:.4em;padding:.35em .5em;box-shadow:none}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-general{font-size:1em;outline:0}body.fbr-torrents-enabled .fbr-torrent .m-general>div{padding:.2em .45em!important;font-size:1em!important}',
            '.fbr-probe-icon{display:none}body.fbr-torrents-enabled .fbr-probe-icon{display:inline-flex;align-items:center;margin-right:.4em;vertical-align:middle}body.fbr-torrents-enabled .fbr-probe-icon>.fbr-icon{width:1.1em;height:1.1em}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-video:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-audio:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-channels:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-subtitle:before{display:none}',
            '.fbr-facts{display:flex;flex-wrap:wrap;margin-top:.65em}.fbr-fact{padding:.3em .65em;font-size:.75em;border-radius:.5em;background:rgba(255,255,255,.07);color:inherit;margin-right:.45em}.fbr-detail-badges{display:flex;flex-wrap:wrap;margin-top:.65em}.fbr-detail-badges .fbr-badge{font-size:.84em;padding:.45em .65em;background:'+surface+';box-shadow:'+edge+'}',
            '.fbr-badge{display:inline-flex;align-items:center;padding:.35em .6em;margin:.15em .4em .15em 0;border-radius:.55em;background:rgba(255,255,255,.08);font-size:.72em;line-height:1.1;font-weight:600;color:inherit;white-space:nowrap}.fbr-badge .fbr-icon{margin-right:.35em;width:1.05em;height:1.05em}.fbr-badge--unknown{font-weight:400;color:#b4c0d2;background:transparent;padding-left:0}',
            'body.fbr-home-enabled .fbr-home-line{margin-bottom:2.1em}body.fbr-home-enabled .fbr-home-line .items-line__title{display:flex;align-items:center;font-size:1.3em;font-weight:600;letter-spacing:-.015em}body.fbr-home-enabled .fbr-home-line .items-line__title>.fbr-icon{margin-right:.6em;color:'+accent+'}',
            'body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 7em)/3)!important;flex-shrink:0;margin-right:1em;padding:0!important;box-sizing:border-box;background:'+surface+';border:1px solid rgba(255,255,255,.1);border-radius:1.25em;overflow:hidden;transform:none!important;transition:none!important;box-shadow:'+edge+'}',
            'body.fbr-home-enabled .fbr-home-card .card__view{padding-bottom:56.25%!important;margin:0!important;border-radius:0!important;overflow:hidden}body.fbr-home-enabled .fbr-home-card .card__img{border-radius:0!important;object-fit:cover}body.fbr-home-enabled .fbr-home-card .card__view:after{display:none!important}body.fbr-home-enabled .fbr-home-card.focus,body.fbr-home-enabled .fbr-home-card.hover{border-color:'+(theme === 'ios' ? '#e7f2ff' : accent)+';box-shadow:inset 0 -3px 0 '+(theme === 'ios' ? '#e7f2ff' : accent)+';background:'+surface+'}',
            'body.fbr-home-enabled .fbr-home-card>.card__title,body.fbr-home-enabled .fbr-home-card>.card__age,body.fbr-home-enabled .fbr-home-card .card__vote,body.fbr-home-enabled .fbr-home-card .card__quality,body.fbr-home-enabled .fbr-home-card .card__type,body.fbr-home-enabled .fbr-home-card .card__promo{display:none!important}',
            '.fbr-home-info{padding:1em 1.1em .85em;white-space:normal;color:#f4f7fd}.fbr-home-meta{color:#9baec6;font-size:.78em;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fbr-home-title{font-size:1.4em;font-weight:600;letter-spacing:-.025em;line-height:1.2;margin:.42em 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.4em}.fbr-home-overview{font-size:.92em;line-height:1.42;color:#c3cddd;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.84em;margin:0}.fbr-home-footer{display:flex;align-items:center;justify-content:space-between;min-height:2.7em;margin-top:.55em}.fbr-home-badges{display:flex;align-items:center;flex-wrap:wrap}.fbr-home-badges .fbr-badge{font-size:.76em}.fbr-home-open{display:flex;align-items:center;justify-content:center;border-radius:50%;width:1.9em;height:1.9em;color:#8b9bb3;flex-shrink:0;margin-left:.3em}.fbr-home-card.focus .fbr-home-open{background:'+accent+';color:#122035}',
            '.fbr-home-kind,.fbr-home-score{position:absolute;top:.85em;display:flex;align-items:center;border-radius:.6em;padding:.45em .55em;background:rgba(8,14,23,.86);color:#e9eff8;font-size:.72em}.fbr-home-kind{left:.85em;letter-spacing:.07em}.fbr-home-kind .fbr-icon{margin-right:.4em}.fbr-home-score{right:.85em;font-weight:650}.fbr-home-score>.fbr-icon{width:1em;height:1em;color:#edca7c;margin-right:.35em}.fbr-home-score small{font-size:.6em;margin-left:.4em;color:#b4c5da}',
            'body:not(.fbr-home-enabled) .fbr-home-info,body:not(.fbr-home-enabled) .fbr-home-kind,body:not(.fbr-home-enabled) .fbr-home-score{display:none}',
            theme === 'ios' ? '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.fbr-ratings{background:'+sheen+',rgba(87,106,135,'+glass+');-webkit-backdrop-filter:blur(18px) saturate(135%);backdrop-filter:blur(18px) saturate(135%)}}' : '',
            '@media(max-width:700px){body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 4em)/2)!important}.fbr-home-overview{font-size:.84em}.fbr-rating,.fbr-my-rating{min-width:3.7em;padding:.1em .4em}.fbr-torrent-stat--date{margin-left:0}.fbr-torrent-recommended{font-size:.7em}}'
        ].join('');
    }
    function apply() {
        if (!doc || !doc.createElement || !doc.querySelector) return;
        var style=doc.getElementById('faborn-premium-ui');if(!style){style=doc.createElement('style');style.id='faborn-premium-ui';doc.head.appendChild(style);}style.textContent=styles();
        doc.body.classList.toggle('fbr-home-enabled',on('home'));
        doc.body.classList.toggle('fbr-torrents-enabled',on('torrent_style'));
        existingTorrents();prune();records.forEach(function (record) { refreshDetail(record);requestDetailRatings(record); });homeCards.forEach(paintHomeBadges);
    }
    function install() {
        if (installed || !doc || !doc.querySelector || !L || !$) return;
        installed=true;hookHome();L.Listener.follow('full',full);L.Listener.follow('torrent',decorateTorrent);apply();currentHome();
    }
    return {install:install,apply:apply,learn:learn,full:full,editButtons:editButtons,orderedKeys:orderedKeys,buttonKey:buttonKey,currentHome:currentHome,identity:identity,score:score,ratingFacts:ratingFacts,awardFacts:awardFacts,ratingIcon:ratingIcon,ratingMarkup:ratingMarkup,parsedRatings:parsedRatings,loadRatings:loadRatings,ratingStatus:function () { return ratingStatus; },torrentFacts:torrentFacts,torrentCount:torrentCount,torrentMarkup:torrentMarkup,decorateTorrent:decorateTorrent,qualityFacts:qualityFacts,cachedQuality:cachedQuality,badgesMarkup:badgesMarkup,localRating:localRating,isMovieLine:isMovieLine,enhanceLine:enhanceLine,icon:icon};
}));
