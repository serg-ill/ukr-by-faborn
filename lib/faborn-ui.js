/* Faborn interface: native Lampa navigation, local ratings, verified source badges. ES5. */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornInterface = factory;
}(typeof window !== 'undefined' ? window : this,function (root,L,$,options) {
    'use strict';
    var doc = root.document, records = [], homeCards = [], homes = [], originalMain, mainWrapper, installed = false;
    var ratingJobs = {}, ratingStatus = '', posterCards=[], posterTimer, posterHooked=false, seasonJobs={}, progressMemo={};
    options=options || {};
    var qualityTimer, qualityBusy=false, parserHooked=false, torrentDecorTimer;
    var TTL = 24*60*60*1000, MAX = 180;
    function str(v) { return v === undefined || v === null ? '' : String(v); }
    function esc(v) { return str(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function get(key,fallback) { try { return L.Storage.get('faborn_ukr_'+key,fallback); } catch (ignore) { return fallback; } }
    function set(key,value) { try { L.Storage.set('faborn_ukr_'+key,value); } catch (ignore) {} }
    // Layout controls presentation only; each feature has its own saved switch.
    function on(key) { return get(key,'on') === 'on'; }
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
        calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
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
    function posterStyle() { var value=get('poster_style','glass');return ['glass','cinema','minimal','off'].indexOf(value)>=0 ? value : 'glass'; }
    function rememberEpisode(title,episode) {
        var match=/^tmdb-tv-(\d+)$/.exec(str(title)), s=Number(episode && episode.season), e=Number(episode && episode.episode);
        if (!match || !(s>=0 && s<=100 && e>0 && e<=1000 && s%1===0 && e%1===0)) return;
        var all=get('poster_episode_index',{});if(!all || Array.isArray(all) || typeof all!=='object') all={};
        var key='tv:'+match[1], row=all[key] || {episodes:[]}, token=s+':'+e;
        row.episodes=[token].concat((row.episodes || []).filter(function (v) { return v!==token; })).slice(0,500);row.updated=Date.now();all[key]=row;
        Object.keys(all).sort(function(a,b){return all[b].updated-all[a].updated;}).slice(MAX).forEach(function(k){delete all[k];});set('poster_episode_index',all);
        progressMemo={};
    }
    function seasonMetadata(movie) {
        var cache=get('poster_seasons',{}), saved=cache && cache[identity(movie)];
        return saved && saved.checkedAt<=Date.now()+60000 && Date.now()-saved.checkedAt<6*60*60*1000 ? saved : null;
    }
    function rememberSeasons(movie) {
        if(identity(movie).indexOf('tv:')!==0 || !Array.isArray(movie.seasons)) return;
        var all=get('poster_seasons',{});if(!all || typeof all!=='object' || Array.isArray(all)) all={};
        all[identity(movie)]={checkedAt:Date.now(),seasons:movie.seasons.map(function(s){return {season_number:+s.season_number,episode_count:Math.min(1000,Math.max(0,+s.episode_count||0)),air_date:/^\d{4}-\d{2}-\d{2}$/.test(str(s.air_date)) ? s.air_date : ''};}).filter(function(s){return s.season_number>=0 && s.season_number<=100;})};
        Object.keys(all).sort(function(a,b){return all[b].checkedAt-all[a].checkedAt;}).slice(MAX).forEach(function(k){delete all[k];});set('poster_seasons',all);
        progressMemo={};
    }
    function releasedSeason(seasons,after,now) {
        var latest=0, today=new Date(now || Date.now()).toISOString().slice(0,10);
        (Array.isArray(seasons)?seasons:[]).forEach(function(s){if(s.season_number>after && s.episode_count>0 && /^\d{4}-\d{2}-\d{2}$/.test(str(s.air_date)) && s.air_date<=today) latest=Math.max(latest,+s.season_number);});
        return latest;
    }
    function posterProgress(movie) {
        var key=identity(movie), serial=key.indexOf('tv:')===0, status={}, candidates=[], seen={}, latest=null;
        try { status=L.Favorite.check(movie) || {}; } catch(ignore) {}
        if(!serial && key){
            var owner='file_view';try { owner=str(L.Timeline.filename()); } catch(ignore) {}
            var films=get('my_movies_v1_'+owner,[]);
            if(Array.isArray(films) && films.slice(0,500).some(function(row){return row && +row.id===+movie.id && row.libraryState==='watched' && !row.first_air_date && !row.original_name && (!row.media_type || row.media_type==='movie') && (!row.source || row.source==='tmdb' || row.source==='cub');}))status={viewed:true};
        }
        function road(s,e) {
            if(!L.Timeline || !L.Utils || !L.Utils.hash) return;
            var token=s+':'+e;if(seen[token])return;seen[token]=true;
            var privateKey='faborn|tmdb-'+key.replace(':','-')+'|'+s+'|'+e;
            var canonical=serial ? [s,s>10?':':'',e,movie.original_name || movie.original_title].join('') : movie.original_title;
            var a=L.Timeline.view(L.Utils.hash(privateKey)), b=canonical ? L.Timeline.view(L.Utils.hash(canonical)) : {};
            var p=(+b.updated||0)>(+a.updated||0) || !a.updated && !a.percent && b.percent ? b : a;
            if(+p.percent>0 && +p.percent<=100) candidates.push({season:s,episode:e,percent:+p.percent,time:+p.time||0,updated:+p.updated||0});
        }
        if(serial) {
            var index=get('poster_episode_index',{}), coords=index && index[key], last=get('position_tmdb-'+key.replace(':','-'),{}), meta=seasonMetadata(movie);
            if(last && +last.episode>0) road(+last.season||1,+last.episode);
            (coords && Array.isArray(coords.episodes) ? coords.episodes : []).forEach(function(v){var parts=v.split(':');road(+parts[0],+parts[1]);});
            // Read native episode marks as well, including progress created by other players.
            var seasons=Array.isArray(movie.seasons) ? movie.seasons : meta && meta.seasons || [], count=0;
            seasons.forEach(function(s){for(var e=1;e<=Math.min(+s.episode_count||0,1000) && count<2500;e++,count++)road(+s.season_number,e);});
            if(!seasons.length && !candidates.length) for(var e=1;e<=24;e++)road(1,e);
        } else road(0,0);
        candidates.sort(function(a,b){return b.updated-a.updated || b.season-a.season || b.episode-a.episode;});latest=candidates[0];
        var done=!!status.viewed || !!(latest && latest.percent>=90 && !serial);
        if(!latest && !done)return {label:'',detail:'',percent:0,newSeason:0};
        var completed=done || latest && latest.percent>=90, label=latest && serial ? 'S'+latest.season+' · E'+latest.episode : '';
        var detail=latest && serial ? (completed?'Переглянуто: ':'Продовжити: ')+'сезон '+latest.season+', серія '+latest.episode : done ? 'Переглянуто' : 'Продовжити перегляд';
        var known=movie.seasons || (seasonMetadata(movie) || {}).seasons, newer=latest && serial ? releasedSeason(known,latest.season) : 0;
        return {label:label,detail:detail,done:completed,percent:done?100:latest.percent,newSeason:newer};
    }
    function posterQualities(movie) {
        if(!on('badges'))return '';
        var online=cachedQuality(movie), torrent=cachedTorrentQuality(movie), rows=[];
        [[online && qualityFacts(online),'Онлайн','online'],[torrent && torrent.badges,'Торрент','torrent']].forEach(function(source){
            var facts=source[0] || [], quality=facts.filter(function(b){return b.kind==='4k' || b.kind==='quality';})[0];
            if(!quality)return;
            var language=facts.filter(function(b){return b.kind==='language' || b.kind==='ua';}).map(function(b){return b.label;}).join(' · ');
            var episode=source[2]==='online' && online.season && online.episode ? ' · S'+online.season+'E'+online.episode : '';
            rows.push('<span class="fbr-p-quality fbr-p-quality--'+source[2]+' fbr-p-quality--'+quality.kind+'" title="'+esc(source[1]+episode+': '+quality.label+(language?' · '+language:''))+'"><small>'+source[1]+'</small><b>'+esc(quality.label==='Full HD'?'1080p':quality.label)+'</b>'+(language?'<em>'+esc(language.replace(/ \/ /g,' · '))+'</em>':'')+'</span>');
        });return rows.join('');
    }
    function displayProgress(movie) {
        var profile=L.Timeline && L.Timeline.filename ? L.Timeline.filename() : '', key=profile+'|'+identity(movie);
        if(!progressMemo[key])progressMemo[key]=posterProgress(movie);
        return progressMemo[key];
    }
    function paintPoster(record) {
        var node=record.node, enabled=posterStyle()!=='off', view=node.querySelector('.card__view');if(!view)return;
        var p=displayProgress(record.movie);
        node.classList.toggle('fbr-poster',enabled);node.classList.toggle('fbr-watched',!!p.done);
        var overlay=view.querySelector('.fbr-poster-overlay');if(!overlay){overlay=doc.createElement('div');overlay.className='fbr-poster-overlay';view.appendChild(overlay);}
        var state=p.detail?'<span class="fbr-p-state'+(p.done?' is-done fbr-watched-icon'+(!p.label?' is-icon-only':''):'')+'" title="'+esc(p.detail)+'" aria-label="'+esc(p.detail)+'">'+icon(p.done?'check':'clock')+esc(p.label)+'</span>':'';
        if(!enabled){var nativeHtml=p.done?'<div class="fbr-p-top">'+state+'</div>':'';if(overlay.innerHTML!==nativeHtml)overlay.innerHTML=nativeHtml;record.progress=p;return;}
        var saved=cachedRatings(record.movie), serial=identity(record.movie).indexOf('tv:')===0;
        var html='<div class="fbr-p-top"><span class="fbr-p-kind">'+icon(serial?'tv':'film')+(serial?'СЕРІАЛ':'ФІЛЬМ')+'</span>'+state+'</div>';
        html+='<div class="fbr-p-bottom">'+(p.newSeason?'<span class="fbr-p-new">'+icon('fresh')+'Вийшов сезон '+p.newSeason+'</span>':'')+'<div class="fbr-p-ratings">'+homeRatingMarkup(record.movie,record.externalRatings || saved && saved.values,false)+'</div><div class="fbr-p-quality-row">'+posterQualities(record.movie)+'</div></div>';
        if(p.percent && !p.done)html+='<div class="fbr-p-progress" role="progressbar" aria-label="'+esc(p.detail)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(p.percent)+'"><i style="width:'+p.percent+'%"></i></div>';
        if(overlay.innerHTML!==html)overlay.innerHTML=html;
        record.progress=p;
    }
    function requestPosterSeasons(record) {
        var movie=record.movie,key=identity(movie), api=L.Api && L.Api.sources && L.Api.sources.tmdb;
        if(key.indexOf('tv:')!==0 || seasonMetadata(movie) || seasonJobs[key] || !api || !api.get)return;
        seasonJobs[key]=true;
        try { api.get('tv/'+movie.id,{},function(data){delete seasonJobs[key];if(!data || String(data.id)!==String(movie.id))return;rememberSeasons(data);refreshPosters();},function(){delete seasonJobs[key];},{life:60*6}); }
        catch(ignore){delete seasonJobs[key];}
    }
    function refreshPosters() {
        if(!doc || !doc.documentElement)return;
        progressMemo={};posterCards=posterCards.filter(function(r){return doc.documentElement.contains(r.node);});posterCards.forEach(paintPoster);
        homes.forEach(paintHomeFeature);
    }
    function queuePosters() { if(posterTimer)root.clearTimeout(posterTimer);posterTimer=root.setTimeout(function(){posterTimer=null;refreshPosters();},180); }
    function decoratePoster(card,movie) {
        var node=card.render(true);if(!node || !node.querySelector || !identity(movie) || movie.known_for_department || !node.querySelector('.card__view'))return;
        if(posterCards.some(function(r){return r.node===node;}))return;
        var record={node:node,movie:movie};posterCards.push(record);paintPoster(record);
        card.use({onFavorite:function(){progressMemo={};paintPoster(record);},onVisible:function(){paintPoster(record);},onFocus:function(){
            paintPoster(record);if(posterStyle()==='off')return;
            if(record.focusTimer)root.clearTimeout(record.focusTimer);
            record.focusTimer=root.setTimeout(function(){record.focusTimer=null;if(!node.classList.contains('focus') || !doc.documentElement.contains(node))return;requestPosterSeasons(record);if(!node.classList.contains('fbr-home-card') && on('ratings'))loadRatings(movie,function(values){if(!doc.documentElement.contains(node))return;record.externalRatings=values;paintPoster(record);});},450);
        },onDestroy:function(){if(record.focusTimer)root.clearTimeout(record.focusTimer);posterCards=posterCards.filter(function(r){return r!==record;});}});
    }
    function hookPosters() {
        if(posterHooked || !L.Maker || !L.Maker.map)return;
        var map=L.Maker.map('Card'), base=map && map.Card;if(!base || !base.onCreate)return;
        posterHooked=true;var create=base.onCreate;
        base.onCreate=function(){var value=create.apply(this,arguments);decoratePoster(this,this.data);return value;};
        L.Listener.follow('state:changed',function(e){if(e.target==='timeline' || e.target==='favorite' || e.target==='faborn-library')queuePosters();});
    }
    // Optical alignment: the logo viewport includes the y descender; CSS offsets the cap-height centre by .12em.
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
    function wikidataRatings(data,id,entityId) {
        var entity=data && data.entities && data.entities[entityId], out={};
        if (!entity || entity.id !== entityId || !entity.claims) return out;
        function value(snak) { return snak && snak.snaktype === 'value' && snak.datavalue && snak.datavalue.value; }
        if (!(entity.claims.P345 || []).some(function (claim) { return claim.rank !== 'deprecated' && value(claim.mainsnak) === id; })) return out;
        var specs={Q150248:{key:'mc',method:'Q106515043',pattern:/^(\d+(?:\.\d+)?)\/100$/,max:100},Q105584:{key:'rt',method:'Q108403393',pattern:/^(\d+(?:\.\d+)?)%$/,max:100},Q37312:{key:'imdb',method:'Q107218751',pattern:/^(\d+(?:\.\d+)?)\/10$/,max:10}}, chosen={};
        (entity.claims.P444 || []).forEach(function (claim) {
            if (claim.rank === 'deprecated') return;
            var q=claim.qualifiers || {};if(q.P518 && q.P518.length) return;
            var reviewer=value((q.P447 || [])[0]), method=value((q.P459 || [])[0]);
            var spec=reviewer && specs[reviewer.id], match=spec && spec.pattern.exec(str(value(claim.mainsnak)));
            // Audience ratings and undocumented scales must not become critic scores.
            if (!match || !method || method.id !== spec.method) return;
            var n=Number(match[1]);if (!isFinite(n) || n < (spec.max === 10 ? .1 : 0) || n > spec.max) return;
            var date=value((q.P585 || [])[0]), stamp=str(date && date.time), rank=claim.rank === 'preferred' ? 1 : 0, prior=chosen[spec.key];
            if (!prior || rank > prior.rank || (rank === prior.rank && stamp > prior.stamp)) {
                chosen[spec.key]={rank:rank,stamp:stamp};out[spec.key]=spec.max === 10 ? n.toFixed(1) : String(Math.round(n));
            }
        });
        return out;
    }
    function loadWikidataRatings(id,done) {
        var query='SELECT ?item WHERE { ?item wdt:P345 "'+id+'". } LIMIT 2';
        ratingRequest('https://query.wikidata.org/sparql?query='+encodeURIComponent(query)+'&format=json',function (error,data) {
            if (error) return done(error,{});
            var rows=data && data.results && data.results.bindings, match=Array.isArray(rows) && rows.length === 1 && /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/.exec(str(rows[0].item && rows[0].item.value));
            if (!match) return done(null,{});
            var entityId=match[1];
            ratingRequest('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+entityId+'&props=claims&format=json&origin=*',function (failure,entity) {
                done(failure,wikidataRatings(entity,id,entityId));
            });
        });
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
    function cachedRatings(movie) {
        var cache=get('external_ratings_cache',{}), id=imdbId(movie), now=Date.now();
        var saved=cache && cache[identity(movie)];
        return saved && saved.schema === 2 && saved.checkedAt <= now+60000 && saved.expiresAt > now && (!id || saved.imdbId === id) ? saved : null;
    }
    function loadRatings(movie,done,progress) {
        var key=identity(movie), id=imdbId(movie), kind=key.split(':')[0] === 'tv' ? 'series' : 'movie';
        if (!key || !on('ratings')) return done({});
        var cache=get('external_ratings_cache',{});
        if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache={};
        var saved=cachedRatings(movie);
        if (saved) {
            ratingStatus=saved.status;return done(saved.values || {});
        }
        var jobKey=key+'|'+id;
        if (ratingJobs[jobKey]) { ratingJobs[jobKey].push({done:done,progress:progress});return; }
        ratingJobs[jobKey]=[{done:done,progress:progress}];
        var completed=false, timer;
        function finish(values,status,partial) {
            if (completed) return;completed=true;if(timer) root.clearTimeout(timer);
            // Read again: another card may have completed while these requests were running.
            cache=get('external_ratings_cache',{});if(!cache || typeof cache !== 'object' || Array.isArray(cache)) cache={};
            var at=Date.now();ratingStatus=(movie.title || movie.name || key)+' · '+status;
            cache[key]={schema:2,imdbId:id,checkedAt:at,expiresAt:at+(partial ? 5*60*1000 : TTL),values:values,status:ratingStatus};
            Object.keys(cache).sort(function (a,b) { return (cache[b].checkedAt || 0)-(cache[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete cache[k]; });
            set('external_ratings_cache',cache);
            var callbacks=ratingJobs[jobKey] || [];delete ratingJobs[jobKey];callbacks.forEach(function (cb) { cb.done(values); });
        }
        function fetchScores() {
            var pending=3, values={}, fallback={}, statuses=[], partial=false;
            function merged() { var out={};Object.keys(fallback).forEach(function (k) { out[k]=fallback[k]; });Object.keys(values).forEach(function (k) { out[k]=values[k]; });return out; }
            function arrived() {
                var current=merged();
                if (--pending === 0) return finish(current,statuses.join('; '),partial || !current.mc || !current.rt || !current.imdb);
                (ratingJobs[jobKey] || []).forEach(function (cb) { if(cb.progress) cb.progress(current); });
            }
            [['cinemeta','https://v3-cinemeta.strem.io/meta/'+kind+'/'+id+'.json'],['aggregator','https://rating-aggregator.elfhosted.com/stream/'+kind+'/'+id+'.json']].forEach(function (source) {
                ratingRequest(source[1],function (error,data) {
                    if (completed) return;
                    var scores=parsedRatings(data,id,source[0]);
                    Object.keys(scores).forEach(function (k) { if(k !== 'imdb' || source[0] === 'cinemeta' || !values.imdb) values[k]=scores[k]; });
                    statuses.push((source[0] === 'cinemeta' ? 'IMDb' : 'Aggregator')+': '+(error || (Object.keys(scores).map(function (k) { return {rt:'RT',mc:'Metacritic',imdb:'IMDb'}[k]; }).join(', ') || 'немає оцінок')));
                    if(error) partial=true;
                    arrived();
                });
            });
            loadWikidataRatings(id,function (error,scores) {
                if (completed) return;
                fallback=scores;statuses.push('Wikidata: '+(error || (Object.keys(scores).map(function (k) { return {rt:'RT',mc:'Metacritic',imdb:'IMDb'}[k]; }).join(', ') || 'немає оцінок')));
                if(error) partial=true;arrived();
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
        function update(values) {
            if (identity(record.movie) !== key || !doc.documentElement.contains(record.node)) return;
            record.externalRatings=values;refreshDetail(record);
        }
        loadRatings(record.movie,update,update);
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
        var header='<div class="fbr-torrent-header"><span class="fbr-torrent-tracker'+(facts.toloka ? ' fbr-torrent-tracker--toloka' : '')+'" title="Джерело: '+esc(facts.tracker)+'">'+icon('globe')+'<strong>'+esc(facts.tracker)+'</strong></span>';
        if (facts.toloka) header+='<span class="fbr-torrent-priority">'+icon('pin')+'Пріоритет</span>';
        if (facts.recommended) header+='<span class="fbr-torrent-recommended" title="Від 50 сідів за даними парсера">'+icon('check')+'Рекомендуємо</span>';
        header+='<span class="fbr-torrent-open">'+icon('arrow')+'</span></div>';
        var badges='<div class="fbr-torrent-features"><div class="fbr-torrent-badges">'+facts.badges.map(function (b) { return '<span class="fbr-torrent-badge fbr-torrent-badge--'+b.kind+'">'+badgeContent(b)+'</span>'; }).join('')+'</div>';
        if (details.size) badges+='<span class="fbr-torrent-size" title="Розмір роздачі">'+icon('drive')+'<strong>'+esc(details.size)+'</strong></span>';
        badges+='</div>';
        function stat(name,label,kind) { return '<span class="fbr-torrent-stat'+(kind ? ' fbr-torrent-stat--'+kind : '')+'">'+icon(name)+esc(label)+'</span>'; }
        function counted(n,words) { var end=n%10, teen=n%100;return n+' '+words[teen >= 11 && teen <= 14 ? 2 : end === 1 ? 0 : end >= 2 && end <= 4 ? 1 : 2]; }
        var stats=stat('upload',facts.seeds === null ? 'Сіди невідомі' : counted(facts.seeds,['сід','сіди','сідів']),facts.seeds === null ? 'unknown' : facts.seeds === 0 ? 'empty' : 'seeds');
        if (facts.peers !== null) stats+=stat('download',counted(facts.peers,['пір','піри','пірів']),'peers');
        if (details.bitrate) stats+=stat('gauge',details.bitrate.replace(/^(?:Б[иі]трейт|Bitrate)\s*:\s*/i,''),'bitrate');
        if (details.date) stats+=stat('clock',details.date,'date');
        return {header:header,summary:badges+'<div class="fbr-torrent-stats">'+stats+'</div>'};
    }
    function decorateTorrent(event) {
        if (!event || event.type !== 'render' || !event.item) return;
        var node=event.item[0] || event.item;
        if (!node || !node.querySelector || node.querySelector('.fbr-torrent-header')) return;
        if (!torrentDecorTimer) torrentDecorTimer=root.setTimeout(function () {
            torrentDecorTimer=null;
            Array.prototype.forEach.call(doc.querySelectorAll('.torrent-list'),function (list) {
                var parent=list;while(parent && parent !== doc.body) { if(parent.classList && parent.classList.contains('explorer')) { parent.classList.add('fbr-torrent-screen');break; }parent=parent.parentNode; }
            });
        },0);
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
        if (quality) result.push({icon:'quality',label:quality === '2160p' ? '4K' : quality === '1080p' ? 'Full HD' : quality,kind:quality === '2160p' ? '4k' : 'quality'});
        // HDR/Dolby/surround are never guessed from resolution, filename or TMDB.
        if (record.hdr === true) result.push({icon:'',label:'HDR',kind:'hdr'});
        if (record.dolbyVision === true) result.push({icon:'',label:'Dolby Vision',kind:'vision',brand:'dolby'});
        var langs = ['uk','en','ru'].filter(function (lang) { return (record.languages || []).indexOf(lang) >= 0; });
        if (langs.length) result.push({icon:'globe',label:langs.map(function (v) { return {uk:'UA',en:'EN',ru:'RU'}[v]; }).join(' / '),kind:'language'});
        if (record.season && record.episode) result.push({icon:'tv',label:'S'+record.season+'E'+record.episode,kind:'episode'});
        return result;
    }
    function badgesMarkup(record) {
        return qualityFacts(record).map(function (b) { return '<span class="fbr-badge fbr-badge--'+b.kind+'">'+badgeContent(b)+'</span>'; }).join('');
    }
    function cachedTorrentQuality(movie,now) {
        var data=get('torrent_quality_cache',{}), record=data && data[identity(movie)], at=now || Date.now();
        return record && record.schema === 1 && record.checkedAt <= at+60000 && record.expiresAt > at ? record : null;
    }
    function matchesTorrent(movie,item) {
        if (!item || typeof item !== 'object') return false;
        var id=imdbId(movie), supplied=str(item.ImdbId || item.imdb_id);
        if (/^\d{5,12}$/.test(supplied)) supplied='tt'+supplied;
        if (/^tt\d+$/.test(supplied) && id) return supplied === id;
        function normalize(v) { return str(v).toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/g,' ').trim(); }
        var title=str(item.Title || item.title), serial=identity(movie).indexOf('tv:') === 0;
        if (/\b(?:soundtrack|OST|making of|trailer)\b|саундтрек|трейлер/i.test(title)) return false;
        var names=[movie.title,movie.name,movie.original_title,movie.original_name].map(normalize).filter(Boolean);
        var year=str(movie.release_date || movie.first_air_date).slice(0,4), years=title.match(/(?:19|20)\d{2}/g) || [];
        if (!serial && /^\d{4}$/.test(year) && years.indexOf(year)<0) return false;
        return title.split(/\/|\||\s=\s/).some(function (part) {
            var normalized=normalize(part);
            return names.some(function (name) {
                if (normalized === name) return true;
                if (normalized.indexOf(name+' ') !== 0) return false;
                var rest=normalized.slice(name.length+1);
                return /^(?:19|20)\d{2}(?: |$)/.test(rest) || (serial && /^(?:s\d{1,2}|season|seasons|сезон|сезони|сезоны|серії|серии|\d+ сезон)(?:\b|\s)/i.test(rest));
            });
        });
    }
    function learnTorrents(movie,data) {
        var key=identity(movie);if (!key || !data || !Array.isArray(data.Results)) return;
        var best=null, priority={'4K':6,'1440p':5,'1080p':4,'720p':3,'480p':2,'360p':1};
        data.Results.forEach(function (item) {
            if (!matchesTorrent(movie,item)) return;
            var facts=torrentFacts(item), quality=facts.badges.filter(function (b) { return priority[b.label]; })[0];
            if (!quality) return;
            var rank=priority[quality.label]*100+facts.badges.filter(function (b) { return b.kind === 'hdr' || b.kind === 'vision'; }).length;
            if (!best || rank > best.rank || (rank === best.rank && (facts.seeds || 0) > best.seeds)) {
                best={rank:rank,seeds:facts.seeds || 0,badges:facts.badges.filter(function (b) { return b.kind !== 'info'; })};
            }
        });
        var cache=get('torrent_quality_cache',{});if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache={};
        var now=Date.now();
        // Keep only display facts from one matching release, never its magnet, URL or credentials.
        cache[key]={schema:1,checkedAt:now,expiresAt:now+(best ? TTL : 15*60*1000),badges:best ? best.badges : []};
        Object.keys(cache).sort(function (a,b) { return (cache[b].checkedAt || 0)-(cache[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete cache[k]; });
        set('torrent_quality_cache',cache);refreshQuality(key);
    }
    function refreshQuality(key) {
        posterCards.forEach(function(card){if(identity(card.movie)===key)paintPoster(card);});
        homeCards.forEach(function (card) { if (identity(card.movie) === key) paintHomeBadges(card); });
        homes.forEach(function (home) { if (home.selected && identity(home.selected.movie) === key) paintHomeFeature(home); });
        records.forEach(function (record) { if (identity(record.movie) === key) refreshDetail(record); });
    }
    function qualityMarkup(movie,compact) {
        var online=badgesMarkup(cachedQuality(movie)), torrent=cachedTorrentQuality(movie), rows=[];
        if (online) rows.push('<div class="fbr-quality-source"><span class="fbr-quality-label">Онлайн</span>'+online+'</div>');
        if (torrent && torrent.badges.length && (!compact || !online)) {
            var badges=torrent.badges.filter(function (b) { return !compact || b.kind === '4k' || b.kind === 'quality' || b.kind === 'hdr'; });
            rows.push('<div class="fbr-quality-source" title="Формат знайденого торрент-релізу"><span class="fbr-quality-label">Торренти</span>'+badges.map(function (b) { return '<span class="fbr-badge fbr-badge--'+b.kind+'">'+badgeContent(b)+'</span>'; }).join('')+'</div>');
        }
        return rows.join('');
    }
    function releaseInfo(movie) {
        movie=movie || {};
        var serial=!!(movie.media_type==='tv' || movie.first_air_date || movie.original_name), raw=str(serial ? movie.first_air_date : movie.release_date), parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw), date='';
        if(parts && +parts[1]>=1000){
            var parsed=new Date(Date.UTC(+parts[1],+parts[2]-1,+parts[3]));
            if(parsed.getUTCFullYear()===+parts[1] && parsed.getUTCMonth()===+parts[2]-1 && parsed.getUTCDate()===+parts[3])date=parts[3]+'.'+parts[2]+'.'+parts[1];
        }
        function studios(rows,kind){
            var seen={};
            return (Array.isArray(rows)?rows:[]).slice(0,50).map(function(row){
                if(!row || typeof row.name!=='string')return null;
                var name=row.name.replace(/\s+/g,' ').trim().slice(0,160), key=name.toLowerCase();
                if(!name || seen[key])return null;seen[key]=true;
                var path=str(row.logo_path), logo='';
                if(/^\/[a-zA-Z0-9_-]+\.(?:png|svg|jpg|webp)$/.test(path) && L.TMDB && typeof L.TMDB.image==='function')logo=L.TMDB.image('t/p/w92'+path);
                return {name:name,logo:logo,kind:kind};
            }).filter(Boolean);
        }
        var brands=serial?studios(movie.networks,'network'):[];
        if(!brands.length)brands=studios(movie.production_companies,'studio');
        return {date:date,iso:date?raw:'',label:serial?'Прем’єра':'Реліз',studios:brands};
    }
    function releaseMarkup(info) {
        var chips=[];
        if(info.date)chips.push('<span class="fbr-release-chip fbr-release-date" title="'+esc(info.label)+'">'+icon('calendar')+'<span class="fbr-release-label">'+esc(info.label)+'</span><time datetime="'+esc(info.iso)+'">'+esc(info.date)+'</time></span>');
        info.studios.slice(0,2).forEach(function(studio,index){
            var label=(studio.kind==='network'?'Канал / сервіс: ':'Студія: ')+studio.name;
            chips.push('<span class="fbr-release-chip fbr-release-studio fbr-release-studio--'+index+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+icon(studio.kind==='network'?'tv':'film')+(studio.logo?'<img class="fbr-release-logo" src="'+esc(studio.logo)+'" alt="" />':'')+'<span class="fbr-release-name">'+esc(studio.name)+'</span></span>');
        });
        if(info.studios.length>2)chips.push('<span class="fbr-release-chip fbr-release-more" title="'+esc(info.studios.slice(2).map(function(row){return row.name;}).join(', '))+'">+'+(info.studios.length-2)+'</span>');
        return chips.length?'<div class="fbr-release-row" aria-label="Реліз і студія">'+chips.join('')+'</div>':'';
    }
    function relocateReleaseDate(record,visible) {
        var label=L.Lang && L.Lang.translate?L.Lang.translate('full_date_of_release'):'';
        Array.prototype.forEach.call(record.node.querySelectorAll('.full-descr__details .full-descr__info'),function(row){
            var name=textOf(row.querySelector('.full-descr__info-name'));
            if(name===label || /^(?:Дата релізу|Дата релиза|Release date)$/i.test(name))row.classList.toggle('fbr-relocated-date',visible);
        });
    }
    function releaseLogos(panel) {
        Array.prototype.forEach.call(panel.querySelectorAll('.fbr-release-logo'),function(img){
            function loaded(){if(img.naturalWidth>0)img.parentNode.classList.add('fbr-release-studio--logo');}
            img.onload=loaded;
            img.onerror=function(){img.parentNode.classList.remove('fbr-release-studio--logo');};
            if(img.complete)loaded();
        });
    }
    function hookParser() {
        if (parserHooked || !L.Parser || typeof L.Parser.get !== 'function') return;
        parserHooked=true;
        var original=L.Parser.get;
        L.Parser.get=function (params,success,failure) {
            var args=Array.prototype.slice.call(arguments), movie=params && params.movie;
            args[1]=function (data) {
                // Explicit free-text refinements may intentionally search for a different title.
                try { if (movie && !params.from_search && !params.clarification) learnTorrents(movie,data); } catch (ignore) {}
                if (success) return success.apply(this,arguments);
            };
            return original.apply(this,args);
        };
    }
    function parserConfigured() {
        if (!L.Storage.field) return false;
        var type=L.Storage.field('parser_torrent_type'), use=L.Storage.field('parser_use_link') || 'one';
        if (type === 'torrserver') return !!L.Storage.field(L.Storage.field('torrserver_use_link') === 'two' ? 'torrserver_url_two' : 'torrserver_url');
        if (type !== 'jackett' && type !== 'prowlarr') return false;
        return (use !== 'two' && !!L.Storage.field(type+'_url')) || (use !== 'one' && !!L.Storage.field(type+'_url_two'));
    }
    function requestTorrentQuality(record) {
        if (!on('badges') || get('torrent_quality','auto') !== 'auto' || !options.torrentRequest || !parserConfigured() || cachedTorrentQuality(record.movie)) return;
        if (qualityTimer) root.clearTimeout(qualityTimer);
        qualityTimer=root.setTimeout(function attempt() {
            var active=L.Activity && L.Activity.active && L.Activity.active();
            if (!on('badges') || get('torrent_quality','auto') !== 'auto' || !doc.documentElement.contains(record.node) || (active && (active.component !== 'full' || String(active.id) !== String(record.movie.id)))) return;
            if (qualityBusy) { qualityTimer=root.setTimeout(attempt,1000);return; }
            if (cachedTorrentQuality(record.movie) || !L.Parser || !L.Parser.get) return;
            qualityBusy=true;
            var finished=false, watchdog=root.setTimeout(finish,30000);
            function finish() { if(finished) return;finished=true;qualityBusy=false;root.clearTimeout(watchdog); }
            var request=options.torrentRequest(record.movie,L.Storage.field('parse_lang'));
            request.movie.genres=request.movie.genres || [];
            try { L.Parser.get(request,finish,finish); } catch (ignore) { finish(); }
        },500);
    }
    function learn(movie,evidence) {
        var key = identity(movie); if (!key) return;
        var data = get('quality_cache',{}); if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
        data[key] = {checkedAt:Date.now(),qualities:evidence.qualities || [],languages:evidence.languages || [],season:evidence.season || 0,episode:evidence.episode || 0,hdr:evidence.hdr === true,dolbyVision:evidence.dolbyVision === true};
        Object.keys(data).sort(function (a,b) { return (data[b].checkedAt || 0)-(data[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete data[k]; });
        set('quality_cache',data);
        refreshQuality(key);
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
        preferFabornFocus(record);
        var node = record.node, line = node.querySelector('.full-start-new__rate-line,.full-start__rate-line');
        var host = node.querySelector('.full-start-new__right,.full-start__right') || node;
        var reactions = node.querySelector('.full-start-new__reactions,.full-start__reactions');
        node.classList.add('fbr-compact-card');
        var panel = node.querySelector('.fbr-detail-meta');
        if (!panel) { panel = doc.createElement('div'); panel.className = 'fbr-detail-meta'; if (line) line.parentNode.insertBefore(panel,line); else host.appendChild(panel); }
        var ratings = on('ratings'), badges = on('badges'), release=releaseInfo(record.movie), releaseHTML=releaseMarkup(release);
        relocateReleaseDate(record,!!release.date);
        if (line) line.classList.toggle('fbr-original-ratings',ratings);
        if (!badges) Array.prototype.forEach.call(node.querySelectorAll('.fbr-legacy-quality'),function (n) { n.classList.remove('fbr-legacy-quality'); });
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
        if (age) age.classList.add('fbr-relocated-fact');
        if (status) status.classList.add('fbr-relocated-fact');
        var html = ratings ? '<div class="fbr-ratings" aria-label="Рейтинги">'+ratingMarkup(facts)+(identity(record.movie) ? '<button type="button" class="fbr-my-rating selector" aria-label="Моя оцінка">'+icon('star')+'<span><small>Моя оцінка</small><strong'+(!ownRating ? ' class="fbr-rating-prompt"' : '')+'>'+(ownRating ? ownRating+'<em>/10</em>' : 'Оцінити')+'</strong></span></button>' : '')+'</div>' : '';
        html = '<div class="fbr-detail-top">'+html+'</div>';
        if (badges) html += '<div class="fbr-detail-badges" aria-label="Якість доступних джерел">'+qualityMarkup(record.movie,false)+'</div>';
        if (meta.length) releaseHTML = releaseHTML ? releaseHTML.replace(/<\/div>$/,meta.join('')+'</div>') : '<div class="fbr-release-row">'+meta.join('')+'</div>';
        html += releaseHTML;
        // Do not replace a focused rating button when a late provider updates its score.
        if (panel.getAttribute('data-fbr-signature') !== html) {
            var oldButton = panel.querySelector('.fbr-my-rating');
            // Reuse Lampa's live nodes: late reactions, votes and native ratings keep
            // their handlers and renderer references when our badges are refreshed.
            if (line && panel.contains(line)) line.parentNode.removeChild(line);
            if (reactions && panel.contains(reactions)) reactions.parentNode.removeChild(reactions);
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
        var top = panel.querySelector('.fbr-detail-top');
        if (line && line.parentNode !== top) top.insertBefore(line,top.firstChild);
        if (reactions && reactions.parentNode !== top) top.appendChild(reactions);
        releaseLogos(panel);
        observeDetail(record);
    }
    function observeDetail(record) {
        if (!root.MutationObserver) return;
        if (!record.observer) record.observer = new root.MutationObserver(function (changes) {
            var external = changes.some(function (change) { var n=change.target.nodeType === 1 ? change.target : change.target.parentNode; return n && (!$(n).closest('.fbr-detail-meta').length || $(n).closest('.full-start-new__rate-line,.full-start__rate-line,.full-start-new__reactions,.full-start__reactions').length); });
            if (!external || record.timer) return;
            record.timer = root.setTimeout(function () { record.timer = null; refreshDetail(record); },160);
        });
        record.observer.observe(record.node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    }
    function prune() {
        records = records.filter(function (record) { if (doc.documentElement.contains(record.node)) return true; if (record.observer) record.observer.disconnect(); if (record.timer) root.clearTimeout(record.timer); endInitialFocus(record); return false; });
        homeCards = homeCards.filter(function (record) { return doc.documentElement.contains(record.node); });
    }
    function ratingNavigation(record) {
        if (!record.start || !record.start.use || record.navigation) return;
        record.navigation = true;
        record.start.use({onController:function (controller) {
            var up=controller.up, down=controller.down, toggle=controller.toggle;
            controller.toggle=function(){preferFabornFocus(record,true);if(toggle)toggle.apply(this,arguments);preferFabornFocus(record);};
            ['right','left','back'].forEach(function(key){var original=controller[key];controller[key]=function(){endInitialFocus(record);if(original)return original.apply(this,arguments);};});
            controller.up=function () {
                endInitialFocus(record);
                var rating=record.node.querySelector('.fbr-my-rating'), action=record.node.querySelector('.full-start-new__buttons .focus,.full-start__buttons .focus');
                if (rating && rating.offsetParent && action) { record.lastAction=action;L.Controller.collectionFocus(rating,$(record.node)); }
                else if (up) up.apply(this,arguments);
            };
            controller.down=function () {
                endInitialFocus(record);
                var rating=record.node.querySelector('.fbr-my-rating.focus');
                if (rating) L.Controller.collectionFocus(record.lastAction || record.node.querySelector('.view--faborn-ukr'),$(record.node));
                else if (down) down.apply(this,arguments);
            };
        }});
    }
    function endInitialFocus(record) {
        record.initialFocus=false;
        if(record.focusTimer)root.clearTimeout(record.focusTimer);
        if(record.stopFocus && doc.removeEventListener) ['keydown','pointerdown','mousedown','touchstart'].forEach(function(name){doc.removeEventListener(name,record.stopFocus,true);});
    }
    function preferFabornFocus(record,prepare) {
        if(!record.initialFocus || !record.start || get('initial_focus','on')!=='on')return;
        var button=record.node.querySelector('.view--faborn-ukr');if(!button || button.classList.contains('hide'))return;
        record.start.last=button;
        if(!prepare && button.offsetParent && L.Controller.own && L.Controller.own(record.start) && !button.classList.contains('focus')) L.Controller.collectionFocus(button,$(record.node));
    }
    function full(event) {
        if (!event || event.type !== 'complite' || !event.data || !event.data.movie || !event.object || !event.object.activity) return;
        var render = event.object.activity.render(), node = render && (render[0] || render);
        if (!node || !node.querySelector) return;
        prune();
        var record = records.filter(function (r) { return r.node === node; })[0];
        if (!record) {
            record = {node:node,movie:event.data.movie,initialFocus:true}; records.push(record);
            record.stopFocus=function(){endInitialFocus(record);};
            if(doc.addEventListener)['keydown','pointerdown','mousedown','touchstart'].forEach(function(name){doc.addEventListener(name,record.stopFocus,true);});
            record.focusTimer=root.setTimeout(function(){endInitialFocus(record);},1800);
        }
        record.start = event.link && event.link.items && event.link.items[0] || record.start;
        rememberSeasons(record.movie);
        ratingNavigation(record);
        refreshDetail(record);
        requestDetailRatings(record);
        requestTorrentQuality(record);
        // The added rating action must not steal the initial focus from playback.
        if (record.start && !record.start.last) record.start.last = actionButtons(record).filter(function (button) { return !button.classList.contains('hide') && !button.classList.contains('fbr-empty-button') && !button.classList.contains('fbr-duplicate-button'); })[0];
    }
    function isMovieLine(data) {
        if (!data || !Array.isArray(data.results) || !data.results.length) return false;
        if (/shot|trailer|person|actor|timetable/i.test(str(data.line_type)+' '+str(data.type)+' '+str(data.params && data.params.type))) return false;
        return data.results.every(function (movie) { return movie && movie.id && (movie.title || movie.name) && (movie.poster_path || movie.backdrop_path) && !movie.known_for_department && !movie.video_id && !movie.youtube; });
    }
    // Verified TMDB network IDs; movie collections use the US streaming catalog, not a guessed production company.
    var STUDIOS=[
        {id:'netflix',name:'Netflix',networks:'213',provider:'8'},
        {id:'apple',name:'Apple TV',networks:'2552',provider:'350'},
        {id:'prime',name:'Prime Video',networks:'1024',provider:'9',logo:'prime-white.png'},
        {id:'disney',name:'Disney+',networks:'2739',provider:'337',logo:'disney-white.png'},
        {id:'hbo',name:'HBO Max',networks:'49|3186|6783',provider:'1899',logo:'hbo.svg'},
        {id:'paramount',name:'Paramount+',networks:'1709|4330',provider:'2303|2616',logo:'paramount-white.png'},
        {id:'hulu',name:'Hulu',networks:'453',provider:'15'}
    ];
    function studioRequest(id,kind) {
        var studio=STUDIOS.filter(function (s) { return s.id === id; })[0];
        if (!studio || kind !== 'tv' && kind !== 'movie') return null;
        var request={component:'category_full',source:'tmdb',url:'discover/'+kind,title:studio.name+' · '+(kind === 'tv' ? 'Серіали' : 'Фільми'),page:1,sort_by:'popularity.desc',filter:{include_adult:'false'}};
        if (kind === 'tv') request.filter.with_networks=studio.networks;
        else { request.filter.with_watch_providers=studio.provider;request.filter.watch_region='US';request.filter.with_watch_monetization_types='flatrate'; }
        return request;
    }
    function StudioLine(home) {
        var self=this,hooks={},html,scroll,last,dead=false,menu=false,navigator=root.Navigator || L.Navigator;
        this.use=function (events) { Object.keys(events).forEach(function (name) { (hooks[name] || (hooks[name]=[])).push(events[name]); }); };
        function emit(name) { (hooks[name] || []).forEach(function (fn) { fn.call(self); }); }
        function keepVisible() {
            if (!home.firstLine || !home.node) return;
            // Keep the posters and the shortcut row together. On a short display, scroll to the row itself.
            var first=home.firstLine.render(true), top=first.getBoundingClientRect(), row=html.getBoundingClientRect();
            home.component.scroll.update(row.bottom-top.top < home.scroll.clientHeight ? first : html);
        }
        function choose(studio) {
            if (dead) return;
            menu=true;
            L.Select.show({title:studio.name,items:[
                {title:'Серіали',subtitle:'Серіали платформи · TMDB',kind:'tv'},
                {title:'Фільми',subtitle:'Каталог сервісу у США · TMDB / JustWatch',kind:'movie'}
            ],onBack:function () { menu=false;L.Select.hide();if (!dead) self.toggle(); },onSelect:function (item) {
                menu=false;L.Select.hide();if (dead) return;
                var request=studioRequest(studio.id,item.kind);if (!request) return self.toggle();
                self.toggle();L.Activity.push(request);
            }});
        }
        this.create=function () {
            html=doc.createElement('div');html.className='fbr-studios-row';
            var title=doc.createElement('div');title.className='fbr-studios-title';title.innerHTML=icon('film')+'<span>Студії та сервіси</span><small>Фільми й серіали</small>';html.appendChild(title);
            scroll=new L.Scroll({horizontal:true,step:180,over:true});scroll.body(true).classList.add('fbr-studios-items');
            STUDIOS.forEach(function (studio) {
                var button=doc.createElement('div');button.className='selector fbr-studio fbr-studio--'+studio.id;
                button.setAttribute('role','button');button.setAttribute('aria-label',studio.name);button.setAttribute('data-studio',studio.id);
                var fallback=doc.createElement('span');fallback.className='fbr-studio-name';fallback.textContent=studio.name;button.appendChild(fallback);
                if (options.studioAssets) {
                    var logo=doc.createElement('img');logo.alt='';logo.className='fbr-studio-logo';
                    logo.onload=function () { if (!dead) button.classList.add('fbr-studio--loaded'); };
                    logo.src=options.studioAssets+(studio.logo || studio.id+'.png');button.appendChild(logo);
                }
                $(button).on('hover:focus hover:touch',function () {
                    last=button;emit('onActive');scroll.update(button,false);
                    home.studio=studio;home.selected=null;home.queue.pause();paintHomeFeature(home);
                }).on('hover:enter',function () { last=button;choose(studio); });
                scroll.append(button);
            });
            html.appendChild(scroll.render(true));
            scroll.onWheel=function (step) { if (!L.Controller.own(self)) self.toggle();L.Controller.enabled().controller[step > 0 ? 'right' : 'left'](); };
        };
        this.toggle=function () {
            if (dead) return;
            emit('onActive');
            L.Controller.add('fbr_studios',{link:self,toggle:function () {
                L.Controller.collectionSet(scroll.render(true));L.Controller.collectionFocus(last || false,scroll.render(true));keepVisible();
            },right:function () { navigator.move('right'); },left:function () { if (navigator.canmove('left')) navigator.move('left');else emit('onLeft'); },up:function () { emit('onUp'); },down:function () { emit('onDown'); },back:function () { emit('onBack'); }});
            L.Controller.toggle('fbr_studios');
        };
        this.render=function (js) { return js ? html : $(html); };
        this.destroy=function () {
            dead=true;if (menu) { menu=false;L.Select.hide(); }
            if (scroll) scroll.destroy();if (html && html.parentNode) html.parentNode.removeChild(html);hooks={};last=null;
        };
    }
    function syncStudios(home) {
        if (!home || home.destroyed || !home.firstLine || !home.component || !L.Scroll || !(root.Navigator || L.Navigator)) return;
        var component=home.component,items=component.items,enabled=on('home') && get('studios','on') === 'on',previous=items[component.active];
        if (enabled && !home.studioRow) {
            component.emit('createAndAppend',{faborn_studios:true,results:[],params:{createInstance:function () { home.studioRow=new StudioLine(home);return home.studioRow; }}});
            var index=items.indexOf(home.studioRow);if(index >= 0) items.splice(index,1);
            items.splice(items.indexOf(home.firstLine)+1,0,home.studioRow);
            var anchor=home.firstLine.render(true),node=home.studioRow.render(true);
            if (anchor.parentNode) anchor.parentNode.insertBefore(node,anchor.nextSibling);
        } else if (!enabled && home.studioRow) {
            var old=items.indexOf(home.studioRow);if (old >= 0) items.splice(old,1);
            if (previous === home.studioRow) previous=home.firstLine;
            home.studioRow.destroy();home.studioRow=null;home.studio=null;
        }
        if (previous) component.active=Math.max(0,items.indexOf(previous));
        if (home.node) home.node.classList.toggle('fbr-home-with-studios',!!home.studioRow);
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
    function homeRatingMarkup(movie,extra,extended) {
        if (!on('ratings')) return '';
        var facts=ratingFacts(movie,extra), order=extended ? ['imdb','tmdb','rt','mc'] : ['imdb','tmdb'];
        return order.map(function (id) {
            var fact=facts.filter(function (r) { return r.id === id; })[0];
            if (!fact) return '';
            var label=id === 'imdb' ? '<span class="fbr-home-rating-brand">IMDb</span>' : id === 'tmdb' ? '<span class="fbr-home-rating-brand">TMDB</span>' : ratingIcon(id);
            return '<span class="fbr-home-rating fbr-home-rating--'+id+'" title="'+esc(fact.name+' '+fact.value+fact.scale)+'">'+label+'<strong>'+esc(fact.value)+(id === 'rt' ? '<small>%</small>' : '')+'</strong></span>';
        }).join('');
    }
    // Replace the waiting list as focus moves. Two titles at a time, shared rating cache,
    // no prefetch of the entire catalogue, and no new requests after pause/destroy.
    function createHomeRatingQueue(fetch,paint) {
        var candidates=[], active=0, running={}, finished={}, partial={}, paused=false, destroyed=false;
        function keyOf(record) { return identity(record.movie)+'|'+imdbId(record.movie); }
        function deliver(key,values) {
            if (paused || destroyed) return;
            candidates.forEach(function (record) { if (keyOf(record) === key) paint(record,values); });
        }
        function start(record,key) {
            running[key]=true;active++;
            var ended=false;
            function finish(values) {
                if (ended) return;ended=true;active--;delete running[key];delete partial[key];
                if (destroyed) return;
                finished[key]=values || {};deliver(key,finished[key]);drain();
            }
            try { fetch(record.movie,finish,function (values) { if (ended || destroyed) return;partial[key]=values;deliver(key,values); }); }
            catch (ignore) { finish({}); }
        }
        function drain() {
            if (paused || destroyed) return;
            var waiting=candidates.slice();
            for (var i=0;i<waiting.length && active<2;i++) {
                var record=waiting[i], key=keyOf(record);
                if (identity(record.movie) && !running[key] && !Object.prototype.hasOwnProperty.call(finished,key)) start(record,key);
            }
        }
        return {
            replace:function (items) {
                if (destroyed) return;
                candidates=items.slice();
                candidates.forEach(function (record) { var key=keyOf(record);if (Object.prototype.hasOwnProperty.call(finished,key)) deliver(key,finished[key]);else if (partial[key]) deliver(key,partial[key]); });
                drain();
            },
            pause:function () { paused=true;candidates=[]; },
            resume:function () { if (!destroyed) { paused=false;drain(); } },
            destroy:function () { destroyed=true;candidates=[];finished={};partial={}; }
        };
    }
    function homeAlive(home) { return home && !home.destroyed && !home.paused && on('home') && doc.documentElement.contains(home.node); }
    function syncHomeBackdrop() {
        if (!doc || !doc.body) return;
        var active, playing=false;
        try { active=L.Activity.active();playing=!!(L.Player && L.Player.opened && L.Player.opened()); } catch (ignore) {}
        doc.body.classList.toggle('fbr-home-active',!!(on('home') && active && active.component === 'main' && !playing));
    }
    function homeVisible(record) {
        if (!homeAlive(record.home)) return false;
        var box=record.node.getBoundingClientRect(), viewport=record.home.scroll.getBoundingClientRect();
        return box.width>0 && box.height>0 && box.right>Math.max(0,viewport.left)+12 && box.left<Math.min(root.innerWidth,viewport.right)-12 && box.bottom>viewport.top+12 && box.top<Math.min(root.innerHeight,viewport.bottom)-12;
    }
    function paintHomeBadges(record) {
        var target=record.node.querySelector('.fbr-home-badges');
        if (target) target.innerHTML=on('badges') ? qualityMarkup(record.movie,true) : '';
        posterCards.filter(function(r){return r.node===record.node;}).forEach(paintPoster);
    }
    function paintHomeRatings(record,values) {
        if (!homeAlive(record.home) || !on('ratings')) return;
        record.externalRatings=values;
        posterCards.filter(function(r){return r.node===record.node;}).forEach(function(r){r.externalRatings=values;paintPoster(r);});
        var target=record.node.querySelector('.fbr-home-ratings');
        if (target) target.innerHTML=homeRatingMarkup(record.movie,values,false);
        if (record.home.selected === record) paintHomeFeature(record.home);
    }
    function paintHomeFeature(home) {
        if (!home.hero || home.destroyed) return;
        var record=home.selected, movie=record && record.movie, studio=home.studio;
        home.hero.classList.toggle('fbr-home-feature--empty',!movie && !studio);
        home.hero.querySelector('.fbr-home-feature-meta').textContent=studio ? 'ДОБІРКИ' : movie ? cardMeta(movie)+(displayProgress(movie).detail ? ' · '+displayProgress(movie).detail : '') : '';
        home.hero.querySelector('.fbr-home-feature-title').textContent=studio ? studio.name : movie ? movie.title || movie.name : '';
        home.hero.querySelector('.fbr-home-feature-overview').textContent=studio ? 'Обери фільми або серіали й відкрий їхні картки у Lampa.' : movie ? movie.overview || '' : '';
        home.hero.querySelector('.fbr-home-feature-ratings').innerHTML=movie ? homeRatingMarkup(movie,record.externalRatings,true) : '';
        home.hero.querySelector('.fbr-home-feature-badges').innerHTML=movie && on('badges') ? qualityMarkup(movie,false) : '';
    }
    function scheduleHomeRatings(home) {
        if (!home || home.destroyed) return;
        if (home.timer) root.clearTimeout(home.timer);
        home.queue.pause();
        home.timer=root.setTimeout(function () {
            home.timer=null;
            if (!homeAlive(home) || !on('ratings')) { home.queue.pause();return; }
            var visible=homeCards.filter(function (record) { return record.home === home && homeVisible(record); });
            // The focused card gets priority even when a horizontal transition is in flight.
            visible.sort(function (a,b) { return a === home.selected ? -1 : b === home.selected ? 1 : 0; });
            home.queue.resume();home.queue.replace(visible.slice(0,6));
        },380);
    }
    function focusHome(record) {
        var home=record && record.home;if (!home || home.destroyed) return;
        home.studio=null;home.selected=record;paintHomeFeature(home);scheduleHomeRatings(home);
    }
    function decorateCard(card,movie,home) {
        var node=card.render(true);if (!node || !node.querySelector || node.querySelector('.fbr-home-info')) return;
        var view=node.querySelector('.card__view');if (!view) return;
        node.classList.add('fbr-home-card');
        var saved=cachedRatings(movie), record={node:node,movie:movie,home:home,externalRatings:saved ? saved.values : {}};
        var info=doc.createElement('div');info.className='fbr-home-info';
        info.innerHTML='<div class="fbr-home-title">'+esc(movie.title || movie.name)+'</div><div class="fbr-home-ratings">'+homeRatingMarkup(movie,record.externalRatings,false)+'</div>';
        node.appendChild(info);
        var label=doc.createElement('div');label.className='fbr-home-kind';
        label.innerHTML=icon(movie.original_name || movie.first_air_date ? 'tv' : 'film')+'<span>'+(movie.original_name || movie.first_air_date ? 'СЕРІАЛ' : 'КІНО')+'</span>';
        view.appendChild(label);
        var badges=doc.createElement('div');badges.className='fbr-home-badges';view.appendChild(badges);
        var open=doc.createElement('span');open.className='fbr-home-open';open.innerHTML=icon('arrow');view.appendChild(open);
        homeCards.push(record);paintHomeBadges(record);
        card.use({onFocus:function () { focusHome(record); },onVisible:function () { scheduleHomeRatings(home); }});
        if (home && !home.selected) { home.selected=record;paintHomeFeature(home); }
    }
    function pageStart(index,start,count) {
        return index>=start+count ? index : index<start ? Math.max(0,index-count+1) : start;
    }
    function pageHomeLine(line) {
        if(!line.scroll || !line.scroll.update || line.fbrPaged)return;
        line.fbrPaged=true;var update=line.scroll.update, start=0;
        line.scroll.update=function(elem,center) {
            var node=elem && (elem[0] || elem), cards=line.items.filter(function(item){return item.render(true).classList.contains('fbr-home-card');});
            var index=cards.map(function(item){return item.render(true);}).indexOf(node);
            if(index<0)return update.call(this,elem,center);
            var count=root.innerWidth<=700 ? 2 : 6;
            start=pageStart(index,start,count);
            return update.call(this,cards[start].render(true),false);
        };
    }
    function enhanceLine(line,data,home) {
        if (!on('home') || !isMovieLine(data) || !line.use) return;
        line.view=6;
        if (line.params && line.params.items) { line.params.items.view=6;line.params.items.align_left=true; }
        data.results.forEach(function (movie) { movie.params=movie.params || {};movie.params.style=movie.params.style || {};movie.params.style.name='default'; });
        line.use({onCreate:function () {
            var node=this.render(true);node.classList.add('fbr-home-line');pageHomeLine(this);
            var title=node.querySelector('.items-line__title');
            if (title) { var label=textOf(title).replace(/^[\s🔥⭐🎬🏆]+/,'');title.innerHTML=icon(/top|кращ|лучш|топ/i.test(label) ? 'trophy' : /нов|now|смотр|див/i.test(label) ? 'fresh' : 'film')+'<span>'+esc(label)+'</span>'; }
        },onInstance:function (card,movie) {
            if (card.use) card.use({onCreate:function () { decorateCard(this,movie,home); }});
        },onScroll:function () { scheduleHomeRatings(home); }});
    }
    function hookHome() {
        if (!L.Component || !L.Component.get || !L.Component.add || mainWrapper) return;
        originalMain=L.Component.get('main');if (!originalMain) return;
        mainWrapper=function (object) {
            var component=new originalMain(object);
            if (on('home') && component.use) {
                var home={paused:false,destroyed:false,component:component};
                home.queue=createHomeRatingQueue(loadRatings,paintHomeRatings);homes.push(home);
                component.use({
                    onCreate:function () {
                        home.node=this.render(true);home.node.classList.add('fbr-home-main');
                        home.hero=doc.createElement('div');home.hero.className='fbr-home-feature fbr-home-feature--empty';
                        home.hero.innerHTML='<div class="fbr-home-feature-copy"><div class="fbr-home-feature-meta"></div><div class="fbr-home-feature-title"></div><p class="fbr-home-feature-overview"></p></div><div class="fbr-home-feature-facts"><div class="fbr-home-feature-ratings"></div><div class="fbr-home-feature-badges"></div></div>';
                        home.node.insertBefore(home.hero,home.node.firstChild);
                        home.scroll=this.scroll.render(true);this.scroll.minus(home.hero);
                        syncStudios(home);
                    },
                    onInstance:function (line,data) {
                        enhanceLine(line,data,home);
                        // Non-film rows keep their native layout and must not retain a different film's description.
                        if (!data.faborn_studios && !isMovieLine(data) && line.use) line.use({onActive:function () { home.studio=null;home.selected=null;paintHomeFeature(home);home.queue.pause(); }});
                    },
                    onAppend:function (line,data) { if (!home.firstLine && isMovieLine(data)) { home.firstLine=line;syncStudios(home); } },
                    onStart:function () { home.paused=false;home.queue.resume();scheduleHomeRatings(home);syncHomeBackdrop(); },
                    onPause:function () { home.paused=true;if(home.timer)root.clearTimeout(home.timer);home.queue.pause();doc.body.classList.remove('fbr-home-active'); },
                    onResize:function () { scheduleHomeRatings(home); },
                    onDestroy:function () { home.destroyed=true;if(home.timer)root.clearTimeout(home.timer);home.queue.destroy();homes=homes.filter(function (item) { return item !== home; });doc.body.classList.remove('fbr-home-active');prune(); }
                });
            }
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
    var feedOriginal,feedWrapper,feedRecords=[];
    function feedMode() {
        var value=get('feed','compact');
        if(value==='off')return 'off';
        return value==='native' ? 'native' : 'compact';
    }
    function feedSummary(element,fallback) {
        var movie=element && element.data || {},type=element && element.card_type,year=str(movie.release_date || movie.first_air_date).slice(0,4);
        return {title:str(movie.title || movie.name || fallback.title),meta:/^\d{4}$/.test(year) ? year+' · '+(type==='tv' || movie.name ? 'Серіал' : 'Фільм') : fallback.meta,movie:movie};
    }
    function decorateFeed(item,element) {
        if(!item)return;
        if(item.querySelector('.fbr-feed-summary')) {
            if(element) { var saved=feedRecords.filter(function(r){return r.node===item;})[0],fresh=feedSummary(element,{title:'',meta:''});if(saved){saved.movie=fresh.movie;item.querySelector('.fbr-feed-title').textContent=fresh.title;item.querySelector('.fbr-feed-meta').textContent=fresh.meta;paintFeed(saved);} }
            return;
        }
        var body=item.querySelector('.feed-item__body'),title=item.querySelector('.feed-item__title'),info=item.querySelector('.feed-item__info');if(!body)return;
        var data=feedSummary(element,{title:title ? textOf(title) : '',meta:info ? textOf(info) : ''});
        var summary=doc.createElement('div');summary.className='fbr-feed-summary';
        summary.innerHTML='<div class="fbr-feed-title">'+esc(data.title)+'</div><div class="fbr-feed-meta">'+esc(data.meta)+'</div><div class="fbr-feed-ratings"></div>';
        body.insertBefore(summary,body.firstChild);
        var kind=doc.createElement('span');kind.className='fbr-feed-kind';kind.innerHTML=icon(element && element.type==='uhd' ? 'quality' : element && element.type==='episode' ? 'tv' : 'fresh');
        var head=item.querySelector('.feed-item__head');if(head)head.insertBefore(kind,head.firstChild);
        var button=item.querySelector('.feed-item__buttons .selector'),record={node:item,movie:data.movie,button:button,label:button ? textOf(button) : ''};feedRecords.push(record);
        if(button)$(button).on('hover:focus',function () {
            var parent=item.parentNode;if(parent)Array.prototype.forEach.call(parent.querySelectorAll('.fbr-feed-focused'),function(n){n.classList.remove('fbr-feed-focused');});
            item.classList.add('fbr-feed-focused');
        });
        paintFeed(record);
    }
    function paintFeed(record) {
        var target=record.node.querySelector('.fbr-feed-ratings');if(target)target.innerHTML=homeRatingMarkup(record.movie,cachedRatings(record.movie) && cachedRatings(record.movie).values,false);
        if(record.button)record.button.textContent=feedMode()==='compact' ? 'Відкрити картку' : record.label;
    }
    function feedHead(node) {
        var head=node.querySelector('.feed-head');if(!head || head.querySelector('.fbr-feed-heading'))return;
        var label=doc.createElement('div');label.className='fbr-feed-heading';label.innerHTML=icon('fresh')+'<div><strong>Стрічка</strong><small>Нові релізи, серії та трейлери</small></div>';head.appendChild(label);
    }
    function syncFeed() {
        if(!doc || !doc.querySelectorAll)return;
        doc.body.classList.toggle('fbr-feed-compact',feedMode()==='compact');doc.body.classList.toggle('fbr-feed-hidden',feedMode()==='off');
        Array.prototype.forEach.call(doc.querySelectorAll('.feed'),function(node){feedHead(node);Array.prototype.forEach.call(node.querySelectorAll('.feed-item'),function(item){decorateFeed(item);});});
        feedRecords=feedRecords.filter(function(r){return doc.documentElement.contains(r.node);});feedRecords.forEach(paintFeed);
    }
    function hookFeed() {
        if(feedWrapper || !L.Component || !L.Component.get || !L.Component.add)return;
        feedOriginal=L.Component.get('feed');if(!feedOriginal)return;
        feedWrapper=function(object) {
            var component=new feedOriginal(object),append=component.append,start=component.start,pending=[];
            function enhance() {
                var node=component.render(),items=node.querySelectorAll('.feed-item');
                // On the first build Scroll has not yet been appended to the component.
                if(items.length>=pending.length) { var offset=items.length-pending.length;pending.forEach(function(element,index){decorateFeed(items[offset+index],element);});pending=[]; }
                feedHead(node);
            }
            if(append)component.append=function(data) { var result=append.apply(component,arguments);pending=pending.concat(data || []);enhance();return result; };
            if(start)component.start=function() { enhance();syncFeed();return start.apply(component,arguments); };
            return component;
        };
        L.Component.add('feed',feedWrapper);
    }
    function styles() {
        var theme=get('layout','panel') === 'classic' ? 'off' : get('theme','on');
        var palettes={blue:['#91bdff','#91bdff','#101827'],amber:['#ffd078','#ffd078','#101827'],mint:['#82dfc1','#82dfc1','#101827'],violet:['#c2a5ff','#c2a5ff','#101827'],aurora:['#0962ed','#b019ed','#ffffff'],lagoon:['#00e8bf','#208aff','#081626']};
        var colors=palettes[get('accent','blue')] || palettes.blue, accent=theme === 'off' ? '#f1f1f1' : colors[0], ink=theme === 'off' ? '#202020' : colors[2];
        var glass={solid:1,low:.7,standard:.46,high:.3,max:.18}[get('glass_transparency','standard')];
        if (glass === undefined) glass=.46;
        function rgba(hex,alpha) { return 'rgba('+[1,3,5].map(function (i) {return parseInt(hex.substr(i,2),16);}).join(',')+','+alpha+')'; }
        var sheen='linear-gradient(130deg,rgba(255,255,255,.16),rgba(255,255,255,.025) 48%,rgba(255,255,255,.07))';
        var surface='linear-gradient(120deg,'+rgba(colors[0],.14)+','+rgba(colors[1],.06)+'),rgba(18,34,56,.9)';
        var edge='inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(255,255,255,.06)';
        var focus=theme === 'off' ? '#f1f1f1' : 'linear-gradient(120deg,'+colors[0]+','+colors[1]+')';
        if (theme === 'ios') { surface='linear-gradient(130deg,rgba(201,231,255,.09),transparent),rgba(24,40,63,'+Math.max(glass,.78)+')';focus='linear-gradient(145deg,#ffffff,#d3e6fc)';ink='#132236'; }
        if (theme === 'off') { surface='transparent';edge='none'; }
        // Text-bearing torrent surfaces stay opaque: bright backdrops and maximum glass cannot wash them out.
        var torrentSurface=theme === 'off' ? '#253040' : 'linear-gradient(115deg,'+rgba(colors[0],.09)+',transparent 65%),#16253e';
        var priority=theme === 'off' ? '#e7edf6' : '#5de3d5';
        var torrentFocus=theme === 'off' ? '#303c4e' : 'linear-gradient(115deg,'+rgba(colors[0],.18)+',transparent 75%),#1a2d4a';
        // Only horizontal previews: the native full-text list and reader keep their own layout and handlers.
        var review='body .full-review:not(.type--vertical):not(.full-review--full-text):not(.full-review-all)';
        var reviewSurface=theme === 'off' ? 'rgba(32,36,43,.96)' : theme === 'ios' ? sheen+',rgba(24,34,49,'+Math.max(glass,.8)+')' : 'linear-gradient(125deg,'+rgba(colors[0],.10)+','+rgba(colors[1],.035)+'),rgba(15,25,41,.96)';
        var reviewFocus=theme === 'off' ? '#353a43' : 'linear-gradient(125deg,'+rgba(colors[0],.21)+','+rgba(colors[1],.08)+'),#142238';
        return [
            'body .fbr-source-comments .fbr-source-review{display:flex;flex-direction:column;align-self:stretch}body .fbr-source-review::after{content:attr(data-hint)!important}.fbr-source-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.65em}.fbr-source-origin{font-size:.7em;line-height:1.2;padding:.4em .6em;border-radius:.4em;letter-spacing:.02em;font-weight:600;background:rgba(160,173,197,.14);color:#e0e8f5}.faborn-theme .fbr-source-origin--uafix{background:rgba(151,114,250,.19);color:#d7c5ff}.faborn-theme .fbr-source-origin--uaserials{background:rgba(69,177,241,.18);color:#afe3ff}.fbr-source-score svg{width:1.1em;height:1.1em;margin-right:.35em}.fbr-source-score{display:flex;align-items:center;font-size:.8em;color:'+(theme === 'off' ? '#dde3eb' : '#91e0bf')+'}.fbr-source-author{font-size:.98em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.fbr-source-date{font-size:.73em;min-height:1.3em;line-height:1.3;margin:.3em 0 .75em;color:#acbbd0}.fbr-source-review .full-review__text{font-weight:400;font-size:1em!important;min-height:5.8em!important}.fbr-source-spoiler .full-review__text{color:#c7d1e1!important}.fbr-source-reader-meta{font-size:.85em;line-height:1.5;color:#c3d0e2;margin-bottom:1em}.fbr-source-reader-text{white-space:pre-wrap;overflow-wrap:break-word;word-wrap:break-word;line-height:1.55}.fbr-source-reader-link{margin-top:1.3em;font-size:.7em;color:#a7b7ce;overflow-wrap:break-word;word-wrap:break-word}',
            review+'{box-sizing:border-box;position:relative;width:24em!important;min-width:0!important;max-width:calc(100vw - 4em)!important;height:auto!important;min-height:0!important;max-height:none;padding:1em 1.15em .85em;border:1px solid rgba(255,255,255,.12);border-radius:1em;background:'+reviewSurface+';color:#f2f5fc;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);transform:none!important;transition:none}',
            review+' .full-review__footer{order:-1;-webkit-order:-1;margin:0 0 .75em;font-size:.95em;min-height:1.8em;color:#d3dce9}',
            review+' .full-review__user{min-width:0;margin-right:.8em}'+review+' .full-review__user-icon{width:1.8em;height:1.8em;margin-right:.55em;border-radius:50%;overflow:hidden}'+review+' .full-review__user-img{width:100%;height:100%;object-fit:cover}'+review+' .full-review__user-email{max-width:17em;font-weight:600}',
            review+' .full-review__user:not(.loaded) .full-review__user-icon{background:rgba(160,190,225,.12) url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23c5d1e1%22 stroke-width=%221.6%22 stroke-linecap=%22round%22%3E%3Ccircle cx=%2212%22 cy=%228%22 r=%223.2%22/%3E%3Cpath d=%22M5 20v-2a7 7 0 0 1 14 0v2%22/%3E%3C/svg%3E") center/75% no-repeat}',
            review+' .full-review__like{flex-shrink:0;font-size:.92em;color:#c5d1e1}'+review+' .full-review__like-icon{margin-right:.35em}',
            review+' .full-review__text{font-size:1.12em;line-height:1.45;margin:0;max-height:5.8em;min-height:0;height:auto;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;line-clamp:4;overflow:hidden;overflow-wrap:break-word;word-wrap:break-word;color:inherit}',
            review+'::after{content:"OK — читати";display:block;margin-top:auto;padding-top:.85em;font-size:.8em;line-height:1.3;letter-spacing:.03em;color:#b8c6d9;align-self:flex-end;-webkit-align-self:flex-end}',
            review+'.focus{background:'+reviewFocus+';color:#fff;border-color:'+accent+';box-shadow:inset 0 0 0 1px '+accent+'}'+review+'.focus::after{color:'+accent+'}'+review+'.bad--comment.focus{opacity:1}',
            'body .mapping--line>.full-review-add{box-sizing:border-box;width:5em;min-height:7em;padding:1em;border-radius:1em;border:1px dashed rgba(255,255,255,.28);background:rgba(22,29,40,.45)}body .mapping--line>.full-review-add.focus{border:1px solid '+accent+';box-shadow:inset 0 0 0 1px '+accent+'}body .mapping--line>.full-review-add::before{width:1.4em;height:1.4em;margin:-.7em 0 0 -.7em;background:linear-gradient(#d3dce9,#d3dce9) center/2px 100% no-repeat,linear-gradient(#d3dce9,#d3dce9) center/100% 2px no-repeat}body .mapping--line>.full-review-add.focus::after{display:none}',
            '@media(max-width:580px){'+review+'{width:25em!important;max-width:calc(100vw - 3em)!important}'+review+' .full-review__user-email{max-width:13em}}',
            '.fbr-icon{display:inline-block;width:1.2em;height:1.2em;flex-shrink:0;vertical-align:middle}',
            '.fbr-original-ratings,.fbr-legacy-quality,.fbr-empty-button,.fbr-duplicate-button{display:none!important}',
            '.fbr-compact-card .full-start-new{padding-bottom:2.15em}.fbr-compact-card .full-start-new__body{align-items:center}.fbr-compact-card .full-start-new__tagline{margin-bottom:.38em}.fbr-compact-card .full-start-new__details{margin-bottom:.7em}.fbr-detail-meta{margin:.55em 0 .65em;color:inherit}.fbr-ratings{display:inline-flex;flex-wrap:wrap;align-items:stretch;max-width:100%;padding:.28em .15em;background:'+surface+';border:0;border-radius:.85em;box-shadow:'+edge+';box-sizing:border-box}',
            '.fbr-detail-top{display:flex;align-items:center;flex-wrap:wrap;max-width:100%}.fbr-detail-top>.fbr-ratings{flex:0 1 auto;min-width:0}.fbr-detail-top>.full-start-new__rate-line,.fbr-detail-top>.full-start__rate-line{margin-bottom:0}.fbr-detail-top>.full-start-new__reactions,.fbr-detail-top>.full-start__reactions{display:flex;align-items:center;flex-wrap:wrap;min-width:0;min-height:0;max-width:100%;margin:.2em 0 .2em 1.1em;padding:.32em .4em;background:'+surface+';border:1px solid rgba(255,255,255,.14);border-radius:.9em;box-sizing:border-box}.fbr-detail-top>.full-start-new__reactions:empty,.fbr-detail-top>.full-start__reactions:empty{display:none}.fbr-detail-top .reaction{padding:.28em .48em;background:none;border-radius:.5em}.fbr-detail-top .reaction--voted{background:rgba(255,255,255,.18)}.fbr-detail-top .reaction__icon{width:1.3em;height:1.3em}.fbr-detail-top .reaction__count{font-size:.92em;padding:0 0 0 .38em}.fbr-detail-top .full-start-new__reactions>div,.fbr-detail-top .full-start__reactions>div{padding:0}.fbr-relocated-fact{display:none!important}.fbr-release-row>.fbr-fact{font-size:.8em;padding:.42em .62em;margin:.2em .45em .2em 0;line-height:1.3;background:rgba(19,29,47,.65);border:1px solid rgba(255,255,255,.12);border-radius:.55em}',
            '.fbr-relocated-date{display:none!important}.fbr-release-row{display:flex;flex-wrap:wrap;align-items:center;margin-top:.5em;max-width:100%}.fbr-release-row:first-child{margin-top:0}.fbr-release-chip{display:inline-flex;align-items:center;box-sizing:border-box;min-width:0;max-width:100%;min-height:2.45em;padding:.46em .8em;margin:.2em .5em .2em 0;border-radius:.7em;border:1px solid rgba(185,219,255,.48);background:linear-gradient(120deg,#1455be,#346ddd);color:#fff;font-size:.86em;line-height:1.3;box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 2px 7px rgba(0,12,35,.14)}.fbr-release-chip>.fbr-icon{width:1.25em;height:1.25em;flex-shrink:0;margin-right:.5em;color:inherit}.fbr-release-date{background:linear-gradient(115deg,#38d8cd,#80ecc3);border-color:#8df2df;color:#073e3b}.fbr-release-label{font-size:.86em;color:#16534b;margin-right:.55em}.fbr-release-date time{white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums}.fbr-release-studio--1{background:linear-gradient(115deg,#6134ba,#8b46ca);border-color:rgba(218,192,255,.55)}.fbr-release-name{font-weight:600;min-width:0;max-width:16em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.fbr-release-logo{display:none;width:auto;height:1.3em;max-width:5.2em;flex-shrink:0;object-fit:contain;filter:brightness(0) invert(1);margin-right:.55em}.fbr-release-studio--logo>.fbr-icon{display:none}.fbr-release-studio--logo>.fbr-release-logo{display:block}.fbr-release-more{font-weight:600;background:linear-gradient(115deg,#465ac7,#6479dc);border-color:rgba(181,195,255,.55);color:#fff}',
            '.fbr-rating,.fbr-my-rating{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.1em .48em;margin:0;background:transparent;border:0;border-right:1px solid rgba(255,255,255,.12);border-radius:0;box-sizing:border-box;color:#f7f8fd;min-width:3.85em}.fbr-ratings>:last-child{border-right:0}',
            '.fbr-rating-logo{display:flex;align-items:center;justify-content:center;height:1.45em;margin-bottom:.16em}.fbr-rating-icon{width:1.35em;height:1.35em;display:block;flex-shrink:0}.fbr-rating--oscars .fbr-rating-icon{height:1.5em}',
            '.fbr-rating-body,.fbr-my-rating>span{display:flex;flex-direction:column;align-items:center}.fbr-rating-body small,.fbr-my-rating small{display:block;font-size:.6em;letter-spacing:0;line-height:1.2;color:#c0ccdc;margin-bottom:.15em;white-space:nowrap}.fbr-rating-body strong,.fbr-my-rating strong{display:block;font-size:1.13em;font-weight:600;line-height:1.1}.fbr-rating em,.fbr-my-rating em{font-size:.53em;font-style:normal;color:#a7b5c9;margin-left:.15em}',
            '.fbr-rating--oscars strong,.fbr-rating--awards strong{color:#ffe1a0}.fbr-my-rating{font:inherit;cursor:pointer;text-align:center;min-width:4.15em;border-radius:.6em}.fbr-my-rating>.fbr-icon{width:1.35em;height:1.35em;color:inherit;margin:.05em 0 .22em}.fbr-my-rating strong{font-size:1.03em}.fbr-my-rating.focus{background:'+focus+';color:'+ink+';border-color:transparent;outline:0}.fbr-my-rating.focus small,.fbr-my-rating.focus em,.fbr-my-rating.focus>.fbr-icon{color:inherit}',
            '.fbr-my-rating strong.fbr-rating-prompt{font-size:.9em}',
            '.fbr-torrent-decoration{display:none}body.fbr-torrents-enabled .fbr-torrent-decoration{display:block}body.fbr-torrents-enabled .fbr-torrent .torrent-item__details,body.fbr-torrents-enabled .fbr-torrent-covered{display:none!important}',
            'body.fbr-torrents-enabled .fbr-torrent-screen{background:rgba(12,23,42,.94);border-radius:1.2em 1.2em 0 0;color:#eef4ff}body.fbr-torrents-enabled .fbr-torrent-screen .explorer__left{padding-top:1.4em}body.fbr-torrents-enabled .fbr-torrent-screen .torrent-filter .simple-button:not(.focus){background:#253852;color:#edf5ff}body.fbr-torrents-enabled .fbr-torrent-screen .explorer-card__descr{color:#d4dfef}',
            'body.fbr-torrents-enabled .torrent-item.fbr-torrent{padding:1.05em 1.25em;background:'+torrentSurface+';border:1px solid rgba(161,193,243,.2);border-radius:1em;box-shadow:0 6px 20px rgba(2,8,21,.18);color:#f6f9ff;transform:none!important;transition:none!important}body.fbr-torrents-enabled .fbr-torrent+.fbr-torrent{margin-top:.8em}',
            'body.fbr-torrents-enabled .torrent-item.fbr-torrent--toloka{box-shadow:inset 4px 0 0 '+priority+(edge === 'none' ? '' : ','+edge)+'}body.fbr-torrents-enabled .torrent-item.fbr-torrent.focus:after{top:-.25em;right:-.25em;bottom:-.25em;left:-.25em;border:.16em solid '+(theme === 'ios' ? '#f2f7ff' : accent)+';border-radius:1.16em;z-index:0;pointer-events:none}body.fbr-torrents-enabled .torrent-item.fbr-torrent.focus{background:'+torrentFocus+'}',
            'body.fbr-torrents-enabled .fbr-torrent .torrent-item__title{font-size:1.18em;font-weight:600;line-height:1.4;color:#f7faff;word-break:normal;overflow-wrap:anywhere}body.fbr-torrents-enabled .fbr-torrent .torrent-item__viewed{top:.2em;left:-.6em;background:#9aedcc;z-index:1}',
            '.fbr-torrent-header{display:flex;align-items:center;margin-bottom:.6em;min-width:0}.fbr-torrent-tracker{display:inline-flex;align-items:center;min-width:0;max-width:60%;box-sizing:border-box;padding:.5em .75em;border:1px solid rgba(151,194,255,.6);border-radius:.6em;background:linear-gradient(120deg,#175ac5,#397aeb);color:#fff;font-size:1.05em;font-weight:700;line-height:1.1;overflow:hidden;white-space:nowrap;box-shadow:0 3px 10px rgba(14,67,156,.18)}.fbr-torrent-tracker>.fbr-icon{width:1.1em;height:1.1em;margin-right:.45em}.fbr-torrent-tracker>strong{font:inherit;min-width:0;overflow:hidden;text-overflow:ellipsis}.fbr-torrent-tracker--toloka{background:linear-gradient(120deg,#ffd04e,#ffe893);border-color:#ffea9d;color:#352509}.fbr-torrent-priority{display:inline-flex;align-items:center;flex-shrink:0;margin-left:.8em;padding:.32em .65em;border-radius:.45em;background:'+rgba(theme === 'off' ? '#c6d1de' : theme === 'ios' ? '#91bdff' : colors[0],.23)+';color:#f4faff;font-size:.76em;font-weight:600;white-space:nowrap}.fbr-torrent-priority>.fbr-icon{width:1.05em;height:1.05em;margin-right:.35em}.fbr-torrent-recommended{display:inline-flex;align-items:center;flex-shrink:0;margin-left:auto;padding:.32em .6em;border-radius:.45em;background:#174b3f;color:#9cffe0;font-size:.78em;font-weight:600;white-space:nowrap}.fbr-torrent-recommended>.fbr-icon{margin-right:.35em}.fbr-torrent-open{margin-left:auto;padding-left:.7em;color:#aec4e4}.fbr-torrent-recommended+.fbr-torrent-open{margin-left:.3em}.fbr-torrent.focus .fbr-torrent-open{color:'+(theme === 'ios' ? '#f2f7ff' : accent)+'}',
            '.fbr-torrent-features{display:flex;align-items:flex-start;margin-top:.5em}.fbr-torrent-badges{display:flex;flex:1;min-width:0;flex-wrap:wrap}.fbr-torrent-badge{display:inline-flex;align-items:center;margin:.2em .4em .2em 0;padding:.4em .65em;border-radius:.5em;background:#283c5b;color:#ecf4ff;font-size:.88em;line-height:1.1;font-weight:600;min-height:1.1em;white-space:nowrap}.fbr-torrent-badge>.fbr-icon{width:1.05em;height:1.05em;margin-right:.35em}.fbr-dolby{display:inline-flex;align-items:center;white-space:nowrap}.fbr-dolby-logo{display:block;position:relative;top:.12em;width:4.1em;height:1.037em;flex-shrink:0;overflow:visible}.fbr-dolby-format{margin-left:.45em;padding-left:.45em;border-left:1px solid rgba(255,255,255,.28);font-size:.94em;line-height:1.1;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
            '.fbr-torrent-size{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:5.6em;box-sizing:border-box;margin:.16em 0 .2em .8em;padding:.6em .8em;border:1px solid rgba(189,255,239,.7);border-radius:.65em;background:linear-gradient(120deg,#51e4d3,#9bf3be);color:#082e32;font-size:1.12em;font-weight:700;line-height:1.1;white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:0 3px 12px rgba(43,211,185,.16)}.fbr-torrent-size>.fbr-icon{width:1.1em;height:1.1em;margin-right:.45em}.fbr-torrent-size>strong{font:inherit}',
            '.fbr-torrent-stats{display:flex;flex-wrap:wrap;align-items:center;margin-top:.6em;padding-top:.65em;border-top:1px solid rgba(206,224,248,.1)}.fbr-torrent-stat{display:inline-flex;align-items:center;color:#c8d7eb;font-size:.85em;margin:.15em 1.25em .15em 0;white-space:nowrap}.fbr-torrent-stat>.fbr-icon{margin-right:.4em;width:1.1em;height:1.1em}.fbr-torrent-stat--seeds{color:#8aebba}.fbr-torrent-stat--empty{color:#efb38e}.fbr-torrent-stat--date{margin-left:auto;margin-right:0;color:#bbcbe2}',
            'body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe{font-size:.76em;padding-top:.15em;color:#b9cbe1}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>div{background:rgba(168,190,217,.07);border-radius:.4em;padding:.35em .5em;box-shadow:none}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-general{font-size:1em;outline:0}body.fbr-torrents-enabled .fbr-torrent .m-general>div{padding:.2em .45em!important;font-size:1em!important}',
            '.fbr-probe-icon{display:none}body.fbr-torrents-enabled .fbr-probe-icon{display:inline-flex;align-items:center;margin-right:.4em;vertical-align:middle}body.fbr-torrents-enabled .fbr-probe-icon>.fbr-icon{width:1.1em;height:1.1em}body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-video:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-audio:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-channels:before,body.fbr-torrents-enabled .fbr-torrent .torrent-item__ffprobe>.m-subtitle:before{display:none}',
            '.fbr-facts{display:flex;flex-wrap:wrap;margin-top:.65em}.fbr-fact{padding:.3em .65em;font-size:.75em;border-radius:.5em;background:rgba(255,255,255,.07);color:inherit;margin-right:.45em}.fbr-detail-badges{margin-top:.6em}.fbr-detail-badges:empty{display:none}.fbr-detail-badges .fbr-badge{font-size:.8em;padding:.45em .65em}.fbr-quality-source{display:flex;flex-wrap:wrap;align-items:center;margin:.1em 0}.fbr-quality-label{font-size:.67em;font-weight:600;color:#d4e2f7;margin-right:.75em;letter-spacing:.035em;min-width:5.2em}.fbr-home-badges .fbr-quality-label{min-width:0}',
            '.fbr-badge{display:inline-flex;align-items:center;padding:.35em .6em;margin:.15em .4em .15em 0;border-radius:.55em;background:#283c5b;font-size:.72em;line-height:1.1;font-weight:600;color:#ecf4ff;white-space:nowrap}.fbr-badge .fbr-icon{margin-right:.35em;width:1.05em;height:1.05em}',
            '.fbr-badge--4k,.fbr-torrent-badge--4k{background:linear-gradient(115deg,#6741de,#a322d4);color:#fff;letter-spacing:.04em}.fbr-badge--quality,.fbr-torrent-badge--quality{background:linear-gradient(115deg,#0768cc,#08738f);color:#fff}.fbr-badge--hdr,.fbr-torrent-badge--hdr{background:linear-gradient(115deg,#ffbf45,#ffe174);color:#35230a}.fbr-badge--vision,.fbr-torrent-badge--vision{background:linear-gradient(115deg,#6b34ce,#414dcc);color:#fff}.fbr-badge--audio,.fbr-torrent-badge--audio{background:#254dab;color:#fff}.fbr-badge--ua,.fbr-torrent-badge--ua{background:#0863aa;color:#ffdf61}.fbr-badge--language,.fbr-torrent-badge--language{background:#294261;color:#e3f0ff}.fbr-badge--episode{background:#294261;color:#f5f8ff}',
            theme === 'off' ? '.fbr-torrent-tracker{background:#d9e1ea;color:#172232;border-color:#ecf1f6;box-shadow:none}.fbr-torrent-tracker--toloka{background:#f6f8fb;border-color:#fff}.fbr-badge,.fbr-torrent-badge{background:#394453;color:#fff}.fbr-torrent-priority{background:#394453}.fbr-torrent-recommended{background:#394453;color:#fff}.fbr-torrent-size{background:#e1e6ed;color:#172232;border-color:#eef1f5;box-shadow:none}' : '',
            '.fbr-feed-summary,.fbr-feed-heading,.fbr-feed-kind{display:none}body.fbr-feed-hidden .menu [data-action="feed"],body.fbr-feed-hidden .head .open--feed{display:none!important}body.fbr-feed-compact .feed{padding:0 1.5em}body.fbr-feed-compact .feed-head{padding:.4em 0 1.1em;margin:0}body.fbr-feed-compact .feed-head__icon,body.fbr-feed-compact .feed-head__body{display:none}body.fbr-feed-compact .fbr-feed-heading{display:flex;align-items:center}body.fbr-feed-compact .fbr-feed-heading>.fbr-icon{width:1.75em;height:1.75em;color:'+accent+';margin-right:.8em}.fbr-feed-heading strong{font-size:1.3em;font-weight:600}.fbr-feed-heading small{display:block;font-size:.8em;color:#b3c5db;margin-top:.25em}',
            'body.fbr-feed-compact .feed-item{box-sizing:border-box;padding:1em;min-height:14.5em;border:1px solid rgba(195,216,245,.14);border-radius:1em;background:'+(theme==='off'?'#1e2631':surface)+';box-shadow:'+edge+';color:#f2f7ff}body.fbr-feed-compact .feed-item+.feed-item{margin-top:1em}body.fbr-feed-compact .feed-item:after{display:none!important}body.fbr-feed-compact .feed-item.fbr-feed-focused{border-color:'+(theme==='ios'?'#e6f2ff':accent)+';box-shadow:inset 0 0 0 .08em '+(theme==='ios'?'#e6f2ff':accent)+'}body.fbr-feed-compact .feed-item__right{left:1em;top:1em;right:auto;width:8.3em}body.fbr-feed-compact .feed-item__poster-img{object-fit:cover}body.fbr-feed-compact .feed-item__image-img{object-fit:cover}body.fbr-feed-compact .feed-item__minicard{position:relative;top:auto;right:auto;margin-top:.7em;justify-content:center}body.fbr-feed-compact .feed-item__minicard>div:first-child{display:none}body.fbr-feed-compact .feed-item__minicard-poster{width:4.3em;margin-left:0}',
            'body.fbr-feed-compact .feed-item__head{padding-left:9.6em;margin-bottom:.45em}body.fbr-feed-compact .feed-item__icon{display:none}body.fbr-feed-compact .fbr-feed-kind{display:inline-flex;color:'+accent+';margin-right:.55em}body.fbr-feed-compact .feed-item__label{font-size:.7em;padding:.25em .55em;line-height:1.4}body.fbr-feed-compact .feed-item__body{padding-left:9.6em;box-sizing:border-box;width:100%!important;min-height:10em}body.fbr-feed-compact .feed-item__title,body.fbr-feed-compact .feed-item__info{display:none}body.fbr-feed-compact .fbr-feed-summary{display:block}.fbr-feed-title{font-size:1.4em;line-height:1.25;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fbr-feed-meta{font-size:.8em;color:#b8cbe0;margin-top:.35em}.fbr-feed-ratings{display:flex;margin-top:.5em}.fbr-feed-ratings:empty{display:none}body.fbr-feed-compact .feed-item__descr{font-size:.92em;line-height:1.45;margin-top:.6em;-webkit-line-clamp:2;min-height:0;max-height:2.9em;color:#d1deed}body.fbr-feed-compact .feed-item__tags{font-size:.75em;margin-top:.5em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#aebfd4}body.fbr-feed-compact .feed-item__tags:before{display:none}body.fbr-feed-compact .feed-item__buttons{margin-top:.7em}body.fbr-feed-compact .feed-item__buttons .simple-button{font-size:.85em;padding:.5em .9em;border-radius:.6em;background:rgba(190,215,246,.12);color:#eaf3ff;box-shadow:none}body.fbr-feed-compact .feed-item__buttons .simple-button.focus{background:'+focus+';color:'+ink+'}',
            '@media(max-width:580px){body.fbr-feed-compact .feed-item__right{width:5.8em;position:absolute;margin:0}body.fbr-feed-compact .feed-item__body,body.fbr-feed-compact .feed-item__head{padding-left:6.8em}body.fbr-feed-compact .feed-item{min-height:11em}.fbr-feed-title{font-size:1.1em}body.fbr-feed-compact .feed-head{align-items:flex-start;text-align:left}}',
            '#fbr-home-backdrop{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;background:'+(theme === 'off' ? '#171c24' : 'radial-gradient(ellipse at 8% 10%,'+rgba(colors[0],.16)+',transparent 58%),radial-gradient(ellipse at 92% 45%,'+rgba(colors[1],.13)+',transparent 58%),linear-gradient(180deg,#091526,#050b18)')+'}body.fbr-home-active:not(.player--viewing) #fbr-home-backdrop{display:block}body.fbr-home-active:not(.player--viewing) .background{opacity:0!important;visibility:hidden}body.fbr-home-active:not(.player--viewing) .head{background:transparent!important;box-shadow:none!important;border:0!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}body.fbr-home-active .head:before,body.fbr-home-active .head:after{display:none!important}body.fbr-home-enabled .fbr-home-main{position:relative;background:transparent}body.fbr-home-enabled .fbr-home-main>.scroll{position:relative;-webkit-mask-image:none;mask-image:none}body.fbr-home-enabled .fbr-home-main>.scroll>.scroll__content{padding:1.1em 0 2em}',
            '.fbr-home-feature{display:flex;align-items:center;position:relative;box-sizing:border-box;height:6.7em;padding:.25em 1.5em .5em;color:#f4f7fd}.fbr-home-feature-copy{min-width:0;flex:1}.fbr-home-feature-meta{font-size:.76em;color:#b0c3db;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fbr-home-feature-title{font-size:1.65em;line-height:1.15;font-weight:600;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:.14em 0 .25em}.fbr-home-feature-overview{font-size:.84em;line-height:1.4;color:#d0dcec;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.8em}.fbr-home-feature-facts{width:24.5em;flex-shrink:0;padding-left:2.2em;box-sizing:border-box}.fbr-home-feature-ratings{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end}.fbr-home-feature-ratings .fbr-home-rating{margin:.25em 0 .25em 1em;font-size:1.05em}.fbr-home-feature-badges{margin-top:.55em;max-height:3.9em;overflow:hidden}.fbr-home-feature-badges .fbr-quality-source{justify-content:flex-end}.fbr-home-feature--empty>*{visibility:hidden}',
            'body.fbr-home-enabled .fbr-home-line{padding-bottom:.35em;margin-bottom:.75em}body.fbr-home-enabled .fbr-home-line .items-line__title{display:flex;align-items:center;font-size:1.15em;font-weight:600;letter-spacing:-.015em}body.fbr-home-enabled .fbr-home-line .items-line__title>.fbr-icon{margin-right:.55em;color:'+accent+'}body.fbr-home-enabled .fbr-home-line .items-line__head{margin-bottom:.7em}',
            'body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 10em)/6)!important;flex-shrink:0;margin:0 1em 0 0!important;padding:0!important;box-sizing:border-box;background:transparent!important;border:0!important;border-radius:0!important;overflow:visible;transform:none!important;transition:none!important;box-shadow:none!important}',
            'body.fbr-home-enabled .fbr-home-card .card__view{padding-bottom:145%!important;margin:0!important;border-radius:.9em!important;overflow:hidden;background:#101b2b;box-shadow:0 .6em 1.5em rgba(0,0,0,.24)}body.fbr-home-enabled .fbr-home-card .card__img{border-radius:.9em!important;object-fit:cover}body.fbr-home-enabled .fbr-home-card .card__view:after{display:none!important}body.fbr-home-enabled .fbr-home-card.focus .card__view,body.fbr-home-enabled .fbr-home-card.hover .card__view{box-shadow:0 0 0 .18em '+(theme === 'ios' ? '#e7f2ff' : accent)+',0 .65em 1.8em '+rgba(theme === 'off' ? '#000000' : colors[0],.24)+'}',
            'body.fbr-home-enabled .fbr-home-card>.card__title,body.fbr-home-enabled .fbr-home-card>.card__age,body.fbr-home-enabled .fbr-home-card .card__vote,body.fbr-home-enabled .fbr-home-card .card__quality,body.fbr-home-enabled .fbr-home-card .card__type,body.fbr-home-enabled .fbr-home-card .card__promo{display:none!important}',
            '.fbr-home-info{padding:.8em .1em .15em;white-space:normal;color:#f4f7fd}.fbr-home-title{font-size:1.13em;font-weight:600;letter-spacing:-.015em;line-height:1.3;margin:0 0 .5em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fbr-home-ratings{display:flex;align-items:center;min-height:1.25em}.fbr-home-rating{display:inline-flex;align-items:center;white-space:nowrap;font-size:.88em;margin-right:1.1em;line-height:1.2;color:#f8faff}.fbr-home-rating-brand{display:inline-block;font-size:.73em;font-weight:800;letter-spacing:-.04em;margin-right:.55em}.fbr-home-rating--imdb .fbr-home-rating-brand{background:#f6cc59;color:#19170e;border-radius:.22em;padding:.22em .33em}.fbr-home-rating--tmdb .fbr-home-rating-brand{color:#63decf;letter-spacing:.01em}.fbr-home-rating>strong{font-size:1.12em;font-weight:600;font-variant-numeric:tabular-nums}.fbr-home-rating strong>small{font-size:.62em;margin-left:.12em}.fbr-home-rating>.fbr-rating-icon{height:1.5em;width:1.5em;margin-right:.45em}',
            '.fbr-home-badges{position:absolute;left:.65em;right:.65em;bottom:.65em;display:flex;align-items:center;flex-wrap:wrap}.fbr-home-badges .fbr-quality-source{background:rgba(6,15,30,.88);border-radius:.6em;padding:.25em .45em;max-width:100%;box-sizing:border-box}.fbr-home-badges .fbr-quality-label{font-size:.62em}.fbr-home-badges .fbr-badge{font-size:.68em}.fbr-home-open{position:absolute;right:.8em;top:.8em;display:none;align-items:center;justify-content:center;border-radius:50%;width:1.65em;height:1.65em;background:'+focus+';color:'+ink+'}.fbr-home-card.focus .fbr-home-open{display:flex}',
            '.fbr-home-kind{position:absolute;top:.85em;left:.85em;display:flex;align-items:center;border-radius:.55em;padding:.4em .5em;background:rgba(8,14,23,.86);color:#e9eff8;font-size:.63em;letter-spacing:.07em}.fbr-home-kind .fbr-icon{margin-right:.4em}',
            'body.fbr-home-enabled .fbr-home-with-studios .fbr-home-feature{height:6.5em}body.fbr-home-enabled .fbr-home-with-studios>.scroll>.scroll__content{padding-top:.55em}body.fbr-home-enabled .fbr-home-with-studios .fbr-home-line{padding-bottom:.25em;margin-bottom:.5em}body.fbr-home-enabled .fbr-home-with-studios .items-line__head{margin-bottom:.55em}body.fbr-home-enabled .fbr-home-with-studios .fbr-home-card .card__view{height:0;width:100%;min-height:0;max-height:none;padding-bottom:145%!important;margin:0!important}body.fbr-home-enabled .fbr-home-with-studios .fbr-home-info{width:100%;box-sizing:border-box;padding-top:.55em}.fbr-home-with-studios .fbr-home-title{font-size:1.05em;margin-bottom:.3em}',
            '.fbr-studios-row{margin:0 0 .75em;color:#f4f7fd}.fbr-studios-title{display:flex;align-items:center;margin:0 1.85em .5em;font-size:.82em;font-weight:600;letter-spacing:.01em}.fbr-studios-title>.fbr-icon{margin-right:.55em;color:'+accent+'}.fbr-studios-title>small{margin-left:auto;font-size:.9em;font-weight:400;color:#b0c3db}.fbr-studios-items{display:flex;align-items:center}.fbr-studio{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;flex-shrink:0;width:calc((100vw - 7.2em)/7);height:3.5em;margin-right:.7em;border:1px solid rgba(203,222,255,.16);border-radius:.8em;background:#000;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);cursor:pointer}.fbr-studio:last-child{margin-right:0}.fbr-studio-logo{display:none;max-width:72%;max-height:2.25em;object-fit:contain;filter:none;-webkit-filter:none}.fbr-studio--apple .fbr-studio-logo{filter:brightness(0) invert(1);-webkit-filter:brightness(0) invert(1)}.fbr-studio--hbo .fbr-studio-logo{max-height:2.8em}.fbr-studio--disney .fbr-studio-logo,.fbr-studio--paramount .fbr-studio-logo{max-height:2.85em}.fbr-studio-name{font-size:1.05em;font-weight:600}.fbr-studio--loaded .fbr-studio-logo{display:block}.fbr-studio--loaded .fbr-studio-name{display:none}.fbr-studio.focus,.fbr-studio.hover{border-color:'+(theme === 'ios' ? '#e7f2ff' : accent)+';box-shadow:0 0 0 .12em '+(theme === 'ios' ? '#e7f2ff' : accent)+';background:#000}',
            'body:not(.fbr-home-enabled) .fbr-home-info,body:not(.fbr-home-enabled) .fbr-home-kind,body:not(.fbr-home-enabled) .fbr-home-badges,body:not(.fbr-home-enabled) .fbr-home-open,body:not(.fbr-home-enabled) .fbr-home-feature{display:none}',
            theme === 'ios' ? '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.fbr-ratings{background:'+surface+';-webkit-backdrop-filter:blur(18px) saturate(135%);backdrop-filter:blur(18px) saturate(135%)}}' : '',
            '@media(max-width:700px){.fbr-studio{width:9em}body.fbr-home-enabled .fbr-home-with-studios .fbr-home-card .card__view{width:100%;height:auto;min-height:0;max-height:none;padding-bottom:145%!important}body.fbr-home-enabled .fbr-home-with-studios .fbr-home-info{width:100%}body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 5em)/2)!important}.fbr-home-feature{padding:.5em 1.5em;height:8.3em}.fbr-home-feature-title{font-size:1.5em}.fbr-home-feature-facts{display:none}.fbr-home-feature-overview{font-size:.82em}.fbr-rating,.fbr-my-rating{min-width:3.7em;padding:.1em .4em}.fbr-torrent-stat--date{margin-left:0}.fbr-torrent-recommended{font-size:.7em}}'
        ].join('');
    }
    function posterStyles() {
        return [
            '.fbr-home-line .scroll__body:after{content:"";display:block;flex:0 0 calc(100vw - 6em)}',
            '.fbr-poster .card__view{position:relative;overflow:hidden;border-radius:.75em}.fbr-poster .card__vote,.fbr-poster .card__quality,.fbr-poster .card__type,.fbr-poster .card__marker--viewed,.fbr-poster .fbr-home-kind,.fbr-poster .fbr-home-open,.fbr-poster .fbr-home-badges,.fbr-poster .fbr-home-ratings{display:none!important}',
            '.card.fbr-poster.focus .card__view,.card.fbr-poster.hover .card__view{box-shadow:0 0 0 .18em #e8f4ff,0 .45em 1.3em rgba(0,0,0,.3)}',
            '.fbr-poster-overlay{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;color:#fff;text-align:left;line-height:1.15;letter-spacing:0}.fbr-poster-overlay .fbr-icon{width:1.05em;height:1.05em;margin-right:.35em;flex-shrink:0}.fbr-p-top{position:absolute;top:.6em;left:.6em;right:.6em;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.3em}.fbr-p-kind,.fbr-p-state,.fbr-p-new{display:inline-flex;align-items:center;white-space:nowrap;font-weight:700;font-size:.72em;padding:.5em .65em;border:1px solid rgba(255,255,255,.23);border-radius:.6em;background:rgba(8,17,32,.88);box-shadow:0 .2em .65em rgba(0,0,0,.22)}.fbr-p-kind{letter-spacing:.045em}.fbr-p-state{color:#f8cd70;background:rgba(32,26,14,.94)}.fbr-p-state.is-done{background:rgba(8,50,44,.94);color:#75f0bd}.fbr-p-state[aria-label="Переглянуто"] .fbr-icon{margin:0}.fbr-p-new{color:#ccbdff;background:rgba(38,25,67,.96);margin-bottom:.45em;font-size:.72em}',
            '.fbr-p-bottom{position:absolute;bottom:0;left:0;right:0;padding:2.8em .6em .7em;background:linear-gradient(transparent,rgba(3,8,17,.84) 55%,rgba(3,8,17,.96));display:flex;flex-direction:column;align-items:flex-start}.fbr-p-ratings{display:flex;flex-wrap:wrap}.fbr-p-ratings .fbr-home-rating{display:inline-flex!important;background:rgba(8,15,27,.85);border:1px solid rgba(255,255,255,.18);border-radius:.55em;padding:.35em .5em;font-size:.88em;margin:0 .35em .25em 0;box-shadow:0 .15em .6em rgba(0,0,0,.18)}.fbr-p-ratings .fbr-home-rating-brand{font-size:.7em;margin-right:.4em}.fbr-p-ratings .fbr-home-rating>strong{font-size:1em}.fbr-p-quality+.fbr-p-quality{margin-top:.3em}.fbr-p-quality-row{display:flex;flex-direction:column;margin-top:.4em;max-width:100%}.fbr-p-quality-row:empty{display:none}.fbr-p-quality{display:flex;align-items:center;font-size:.77em;white-space:nowrap;max-width:100%;border-radius:.5em;overflow:hidden;border:1px solid rgba(106,191,255,.35);background:rgba(11,42,74,.94)}.fbr-p-quality small{font-size:.78em;color:#b8dcff;padding:0 .5em}.fbr-p-quality b{padding:.38em .5em;background:linear-gradient(115deg,#259cff,#55d8fb);color:#021b30;font-size:1.06em}.fbr-p-quality--4k b{background:linear-gradient(115deg,#ae88ff,#f398ec);color:#24113b}.fbr-p-quality--torrent{border-color:rgba(177,144,255,.5);background:rgba(36,23,65,.94)}.fbr-p-quality--torrent small{color:#d6c6ff}.fbr-p-quality em{font-style:normal;color:#d6f6f0;font-weight:600;padding:0 .5em;font-size:.9em}.fbr-p-progress{position:absolute;bottom:0;left:0;right:0;height:.22em;background:rgba(255,255,255,.18)}.fbr-p-progress>i{display:block;height:100%;background:linear-gradient(90deg,#4bafff,#66f0c3)}',
            'body[data-fbr-poster-style="cinema"] .fbr-p-top{top:0;left:0;right:0;gap:0}body[data-fbr-poster-style="cinema"] .fbr-p-kind,body[data-fbr-poster-style="cinema"] .fbr-p-state{border:0;border-radius:0 0 .55em 0;padding:.65em .8em;background:#111c2e}body[data-fbr-poster-style="cinema"] .fbr-p-state{border-radius:0 0 0 .55em;background:#173d34}body[data-fbr-poster-style="cinema"] .fbr-p-kind{box-shadow:inset .22em 0 #75c6ff}body[data-fbr-poster-style="cinema"] .fbr-p-ratings .fbr-home-rating{border-radius:.25em;background:#17283c;border:0}body[data-fbr-poster-style="cinema"] .fbr-p-ratings .fbr-home-rating--imdb{background:#e7bd50;color:#201a08}body[data-fbr-poster-style="cinema"] .fbr-p-ratings .fbr-home-rating--imdb .fbr-home-rating-brand{background:transparent}body[data-fbr-poster-style="cinema"] .fbr-p-quality{border-radius:.25em}',
            'body[data-fbr-poster-style="minimal"] .fbr-p-kind,body[data-fbr-poster-style="minimal"] .fbr-p-state,body[data-fbr-poster-style="minimal"] .fbr-p-new{border:0;background:rgba(7,13,22,.92);box-shadow:none;border-radius:.3em}body[data-fbr-poster-style="minimal"] .fbr-p-ratings .fbr-home-rating{border:0;background:transparent;padding:.1em .15em;box-shadow:none}body[data-fbr-poster-style="minimal"] .fbr-p-quality{border:0;background:transparent;border-radius:0}body[data-fbr-poster-style="minimal"] .fbr-p-quality b{background:none;color:#77d4ff;padding:.2em .3em}body[data-fbr-poster-style="minimal"] .fbr-p-quality--4k b{color:#d9b5ff}body[data-fbr-poster-style="minimal"] .fbr-p-bottom{padding-top:2em}',
            'body[data-fbr-poster-style="off"] .fbr-p-top{justify-content:flex-end}.fbr-watched .card__view{position:relative}.fbr-watched .card__marker--viewed,.fbr-watched .fbr-home-open{display:none!important}.fbr-watched .card__icons{top:3.2em}body.fbr-home-enabled .fbr-home-card .fbr-home-title{font-size:.95em}.fbr-poster .card__marker:not(.card__marker--viewed){top:3.2em;bottom:auto}.fbr-poster .card__icons{z-index:2}',
            '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){body[data-fbr-poster-style="glass"] .fbr-p-kind,body[data-fbr-poster-style="glass"] .fbr-p-state,body[data-fbr-poster-style="glass"] .fbr-p-ratings .fbr-home-rating{background-color:rgba(10,20,36,.68);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px)}}',
            'body[data-fbr-poster-style] .fbr-watched-icon{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:2.25em;min-height:2.25em;padding:.42em .55em;border:1px solid rgba(200,255,228,.8);border-radius:.65em;background:linear-gradient(135deg,#74f0be,#20c997);color:#063e30;box-shadow:0 .15em .65em rgba(0,0,0,.38);-webkit-backdrop-filter:none;backdrop-filter:none}body[data-fbr-poster-style] .fbr-watched-icon svg{width:1.3em;height:1.3em;stroke-width:2.5}body[data-fbr-poster-style] .fbr-watched-icon.is-icon-only svg{margin:0}.fbr-p-state{margin-left:auto;flex-shrink:0}'
        ].join('');
    }
    function apply() {
        if (!doc || !doc.createElement || !doc.querySelector) return;
        var style=doc.getElementById('faborn-premium-ui');if(!style){style=doc.createElement('style');style.id='faborn-premium-ui';doc.head.appendChild(style);}style.textContent=styles()+posterStyles();
        doc.body.setAttribute('data-fbr-poster-style',posterStyle());refreshPosters();
        doc.body.classList.toggle('fbr-home-enabled',on('home'));
        var backdrop=doc.getElementById('fbr-home-backdrop');
        if (!backdrop) { backdrop=doc.createElement('div');backdrop.id='fbr-home-backdrop';backdrop.setAttribute('aria-hidden','true');doc.body.insertBefore(backdrop,doc.body.firstChild); }
        syncHomeBackdrop();syncFeed();
        doc.body.classList.toggle('fbr-torrents-enabled',on('torrent_style'));
        existingTorrents();prune();records.forEach(function (record) { refreshDetail(record);requestDetailRatings(record);requestTorrentQuality(record); });homeCards.forEach(function (record) {
            paintHomeBadges(record);
            var target=record.node.querySelector('.fbr-home-ratings');
            if (target) target.innerHTML=homeRatingMarkup(record.movie,record.externalRatings,false);
        });
        homes.forEach(function (home) { syncStudios(home);paintHomeFeature(home);scheduleHomeRatings(home); });
    }
    function install() {
        if (installed || !doc || !doc.querySelector || !L || !$) return;
        installed=true;hookPosters();hookParser();hookHome();hookFeed();L.Listener.follow('full',full);L.Listener.follow('torrent',decorateTorrent);
        L.Listener.follow('activity',syncHomeBackdrop);L.Listener.follow('activity',syncFeed);
        if (L.Player && L.Player.listener) { L.Player.listener.follow('start',function () { doc.body.classList.remove('fbr-home-active'); });L.Player.listener.follow('destroy',syncHomeBackdrop); }
        apply();currentHome();
    }
    return {releaseInfo:releaseInfo,releaseMarkup:releaseMarkup,posterStyle:posterStyle,posterProgress:posterProgress,releasedSeason:releasedSeason,rememberEpisode:rememberEpisode,rememberSeasons:rememberSeasons,posterQualities:posterQualities,decoratePoster:decoratePoster,pageStart:pageStart,pageHomeLine:pageHomeLine,preferFabornFocus:preferFabornFocus,endInitialFocus:endInitialFocus,install:install,apply:apply,feedMode:feedMode,feedSummary:feedSummary,decorateFeed:decorateFeed,hookFeed:hookFeed,syncFeed:syncFeed,learn:learn,full:full,editButtons:editButtons,orderedKeys:orderedKeys,buttonKey:buttonKey,currentHome:currentHome,identity:identity,score:score,ratingFacts:ratingFacts,awardFacts:awardFacts,ratingIcon:ratingIcon,ratingMarkup:ratingMarkup,parsedRatings:parsedRatings,wikidataRatings:wikidataRatings,loadRatings:loadRatings,ratingStatus:function () { return ratingStatus; },torrentFacts:torrentFacts,torrentCount:torrentCount,torrentMarkup:torrentMarkup,decorateTorrent:decorateTorrent,qualityFacts:qualityFacts,learnTorrents:learnTorrents,matchesTorrent:matchesTorrent,cachedTorrentQuality:cachedTorrentQuality,qualityMarkup:qualityMarkup,hookParser:hookParser,requestTorrentQuality:requestTorrentQuality,cachedQuality:cachedQuality,badgesMarkup:badgesMarkup,localRating:localRating,studioRequest:studioRequest,syncStudios:syncStudios,StudioLine:StudioLine,isMovieLine:isMovieLine,enhanceLine:enhanceLine,homeRatingMarkup:homeRatingMarkup,createHomeRatingQueue:createHomeRatingQueue,cachedRatings:cachedRatings,syncHomeBackdrop:syncHomeBackdrop,icon:icon};
}));
