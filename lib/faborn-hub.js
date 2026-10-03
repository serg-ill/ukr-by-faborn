/* Faborn's personal menu pages. Uses Lampa's TMDB client and profile-aware timeline. ES5. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornHub = factory;
}(typeof window !== 'undefined' ? window : this, function (root, L, $) {
    'use strict';
    var doc = root.document, installed = false, pages = [], buttons = [], queue = [], running = 0, cache = {}, cacheOrder = [];
    var MAX_SERIES = 120, MAX_MOVIES = 500, PAGE_SIZE = 6, TTL = 6 * 60 * 60 * 1000, moviePlayback = null;
    var releaseCards = [], releaseTask = null, releaseTimer = null, releaseOwner = '', releaseDay = '', releaseBusy = false, releaseRetry = {};
    var MOODS = [
        {id:'any', title:'Будь-який настрій', genres:'', icon:'spark'},
        {id:'light', title:'Посміятися', genres:'35', icon:'smile'},
        {id:'tense', title:'Відчути напругу', genres:'53|9648', icon:'pulse'},
        {id:'adventure', title:'Поринути в пригоди', genres:'12|28', icon:'compass'},
        {id:'scifi', title:'Інший світ', genres:'878|14', icon:'orbit'},
        {id:'drama', title:'Щось зворушливе', genres:'18', icon:'heart'}
    ];
    var PATHS = {
        spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4"/>',
        tv:'<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 21h8M12 18v3"/>',
        film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
        library:'<rect x="3" y="4" width="5" height="16" rx="1"/><path d="M11 4v16M15 5l4-1 3 15-4 1z"/>',
        bookmark:'<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/>',
        plus:'<path d="M12 5v14M5 12h14"/>',
        check:'<path d="m5 12 4 4L19 6"/>',
        clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
        search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
        smile:'<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M16 9h.01M8 14a4 4 0 0 0 8 0"/>',
        pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
        compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
        orbit:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/>',
        heart:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 4 12 8 15 4-3 13-10 8-15Z"/>',
        calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/>',
        star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>'
    };
    function str(value) { return value === undefined || value === null ? '' : String(value); }
    function esc(value) { return str(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(PATHS[name] || PATHS.tv)+'</svg>'; }
    function get(name, fallback) { try { return L.Storage.get('faborn_ukr_'+name, fallback); } catch (ignore) { return fallback; } }
    function set(name, value) { try { L.Storage.set('faborn_ukr_'+name, value); return true; } catch (ignore) { return false; } }
    function profile() { try { return str(L.Timeline.filename()); } catch (ignore) { return 'file_view'; } }
    function today(now) { var d = new Date(now === undefined ? Date.now() : now); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
    function date(value) {
        if(!/^\d{4}-\d{2}-\d{2}$/.test(str(value)))return '';
        var parts=value.split('-'), stamp=new Date(Date.UTC(+parts[0],+parts[1]-1,+parts[2]));
        return stamp.getUTCFullYear()===+parts[0] && stamp.getUTCMonth()===+parts[1]-1 && stamp.getUTCDate()===+parts[2] ? value : '';
    }
    function integer(value, min, max) { value = Number(value); return isFinite(value) && value % 1 === 0 && value >= min && value <= max; }
    function episodeDate(value) {
        if (!value || !integer(value.season_number,1,100) || !integer(value.episode_number,1,1000) || !date(value.air_date)) return null;
        return {season:+value.season_number,episode:+value.episode_number,air_date:value.air_date};
    }
    function dayDistance(from, to) {
        if (!date(from) || !date(to)) return null;
        var a=from.split('-'), b=to.split('-');
        return Math.round((Date.UTC(+b[0],+b[1]-1,+b[2])-Date.UTC(+a[0],+a[1]-1,+a[2]))/86400000);
    }
    function releaseInfo(details, day) {
        if (!details || !date(day)) return null;
        var next=episodeDate(details.next_episode_to_air), last=episodeDate(details.last_episode_to_air), row, kind, label, days;
        if (last && last.air_date===day) { row=last;kind='today';label='Нова серія сьогодні'; }
        else if (next && next.air_date>=day) {
            row=next;days=dayDistance(day,next.air_date);kind=days===0?'today':'upcoming';
            var word=days%10===1 && days%100!==11?'день':days%10>=2 && days%10<=4 && (days%100<12 || days%100>14)?'дні':'днів';
            label=days===0?'Нова серія сьогодні':days===1?'Нова серія завтра':'Нова серія через '+days+' '+word;
        } else if (last && dayDistance(last.air_date,day)>=0 && dayDistance(last.air_date,day)<=7) { row=last;kind='released';label='Вийшла нова серія'; }
        else return null;
        return {kind:kind,label:label,days:days===undefined?dayDistance(day,row.air_date):days,season:row.season,episode:row.episode,air_date:row.air_date};
    }
    function releaseMarkup(details) {
        var info=releaseInfo(details,today());
        if (!info || get('episode_countdown','on')!=='on') return '';
        return '<span class="fbr-release-badge fbr-release-badge--'+info.kind+'" title="Дата виходу за TMDB; наявність озвучення перевіряється в джерелах">'+icon('calendar')+'<span><strong>'+esc(info.label)+'</strong><small>S'+info.season+' · E'+info.episode+' · '+info.air_date.split('-').reverse().join('.')+'</small></span></span>';
    }
    function releaseState() {
        var saved=get('series_releases_v1_'+profile(),{}), clean={};
        list().forEach(function(movie){var row=saved && saved[movie.id];if(row && typeof row==='object')clean[movie.id]=row;});
        return clean;
    }
    function rank(episode) { return episode ? episode.season*10000+episode.episode : 0; }
    function observeRelease(movie, details, day) {
        if (!has(movie) || !details || +details.id!==+movie.id || !Object.prototype.hasOwnProperty.call(details,'last_episode_to_air')) return false;
        var all=releaseState(), previous=all[movie.id], last=episodeDate(details.last_episode_to_air);
        if (last && last.air_date>day) return false;
        var next={checked:Date.now(),last:previous && previous.last || null,pending:previous && previous.pending || null};
        if (!previous) next.last=last;
        else if (last && rank(last)>rank(previous.last)) {
            next.last=last;
            next.pending=get('episode_notifications','on')==='on' && road(movie,last.season,last.episode).percent<90 ? last : null;
        }
        if(get('episode_notifications','on')!=='on') next.pending=null;
        all[movie.id]=next;set('series_releases_v1_'+profile(),all);
        return !!next.pending;
    }
    function menuIdle() {
        return !(doc && doc.hidden) && !(L.Player && L.Player.opened && L.Player.opened()) && !(L.Select && L.Select.opened && L.Select.opened());
    }
    function flushReleases() {
        if (get('episode_notifications','on')!=='on' || !menuIdle() || !L.Noty || !L.Noty.show) return false;
        var all=releaseState(), pending=[], changed=false;
        list().forEach(function(movie){
            var row=all[movie.id], episode=row && row.pending;
            if (!episode) return;
            changed=true;row.pending=null;
            if(road(movie,episode.season,episode.episode).percent<90)pending.push({movie:movie,episode:episode});
        });
        if(pending.length){
            var lines=pending.slice(0,3).map(function(row){return esc(row.movie.name||row.movie.title)+' · S'+row.episode.season+'E'+row.episode.episode;});
            notify((pending.length===1?'Вийшла нова серія: ':'Вийшли нові серії: ')+lines.join('; ')+(pending.length>3?' · та ще '+(pending.length-3):'')+'. Деталі — у «Моя медіатека → Серіали».');
        }
        if(changed)set('series_releases_v1_'+profile(),all);
        return pending.length>0;
    }
    function paintReleaseCards() {
        releaseCards=releaseCards.filter(function(record){if(doc.documentElement.contains(record.node))return true;record.task.cancel();return false;});
        releaseCards.forEach(function(record){record.badge.innerHTML=releaseMarkup(record.details);record.badge.style.display=record.badge.innerHTML?'':'none';});
    }
    function attachRelease(movie, node, details) {
        if (!node || releaseCards.some(function(record){return record.node===node;})) return;
        var anchor=node.querySelector('.full-start-new__details,.full-start__rate-line'), badge=doc.createElement('div');
        if (!anchor || !anchor.parentNode) return;
        badge.className='fbr-full-release';badge.setAttribute('role','status');anchor.parentNode.insertBefore(badge,anchor.nextSibling);
        var record={node:node,movie:movie,badge:badge,details:details,task:scope()};releaseCards.push(record);paintReleaseCards();loadReleaseCard(record);
    }
    function loadReleaseCard(record) {
        if(record.loaded || get('episode_countdown','on')!=='on')return;
        record.loaded=true;
        request(record.task,'tv/'+record.movie.id,{langs:'uk-UA'},function(error,data){
            if(error || !data || +data.id!==record.movie.id || !doc.documentElement.contains(record.node))return;
            record.details=data;paintReleaseCards();
        });
    }
    function scheduleReleases(delay) {
        if(!installed)return;
        root.clearTimeout(releaseTimer);releaseTimer=root.setTimeout(tickReleases,delay);
    }
    function tickReleases() {
        releaseTimer=null;
        if(releaseOwner!==profile()){
            if(releaseTask)releaseTask.cancel();releaseBusy=false;releaseOwner=profile();
            releaseCards.forEach(function(record){record.task.cancel();record.task=scope();record.loaded=false;loadReleaseCard(record);});releaseRetry={};
        }
        var day=today();
        if(releaseDay!==day){releaseDay=day;pages.forEach(function(page){page.paint();});}
        paintReleaseCards();flushReleases();
        if(releaseBusy || get('episode_notifications','on')!=='on' || !menuIdle()){scheduleReleases(60000);return;}
        var all=releaseState(), rows=list().filter(function(movie){var row=all[movie.id];return !(releaseRetry[movie.id]>Date.now()) && (!row || !row.checked || row.checked>Date.now() || Date.now()-row.checked>=TTL);}).slice(0,12);
        if(!rows.length){scheduleReleases(60000);return;}
        releaseBusy=true;releaseTask=scope();var task=releaseTask;
        function next(){
            if(!valid(task))return;
            if(!rows.length || !menuIdle() || get('episode_notifications','on')!=='on'){releaseBusy=false;flushReleases();scheduleReleases(60000);return;}
            var movie=rows.shift();
            request(task,'tv/'+movie.id,{langs:'uk-UA'},function(error,data){
                if(!error && data && +data.id===movie.id && Object.prototype.hasOwnProperty.call(data,'last_episode_to_air')) { observeRelease(movie,data,today());delete releaseRetry[movie.id]; }
                else releaseRetry[movie.id]=Date.now()+10*60*1000;
                next();
            });
        }
        next();scheduleReleases(60000);
    }
    function isSeries(movie) { return !!(movie && (movie.media_type === 'tv' || movie.original_name || movie.first_air_date)); }
    function cleanMovie(movie, tv) {
        if (!movie || !integer(movie.id,1,999999999) || movie.source && ['tmdb','cub'].indexOf(movie.source) < 0 || tv && !isSeries(movie) || !tv && (isSeries(movie) || movie.media_type && movie.media_type !== 'movie' || movie.known_for_department)) return null;
        var out = {id:Number(movie.id), media_type:tv ? 'tv' : 'movie', source:'tmdb'};
        ['name','title','original_name','original_title','overview','poster_path','backdrop_path','first_air_date','release_date'].forEach(function (key) {
            if (typeof movie[key] === 'string') out[key] = movie[key].slice(0, key === 'overview' ? 900 : 250);
        });
        if (!(out.title || out.name)) return null;
        if (tv && !out.original_name) out.original_name = out.original_title || out.name;
        if (isFinite(+movie.vote_average) && +movie.vote_average > 0 && +movie.vote_average <= 10) out.vote_average = +movie.vote_average;
        return out;
    }
    function list(owner) {
        var saved = get('my_series_v1_'+(owner || profile()), []), seen = {};
        return (Array.isArray(saved) ? saved : []).map(function (row) {
            var movie = cleanMovie(row, true);
            if (!movie || seen[movie.id]) return null;
            seen[movie.id] = true; movie.addedAt = +row.addedAt || 0; return movie;
        }).filter(Boolean).slice(0,MAX_SERIES);
    }
    function has(movie) { return list().some(function (row) { return row.id === Number(movie.id); }); }
    function follow(movie, enabled) {
        var clean = cleanMovie(movie,true); if (!clean) return {ok:false, reason:'Цей розділ підтримує серіали TMDB.'};
        var rows = list(), existing = rows.some(function (row) { return row.id === clean.id; });
        if (enabled && existing || !enabled && !existing) return {ok:true, changed:false};
        if (enabled && rows.length >= MAX_SERIES) return {ok:false, reason:'У центрі вже '+MAX_SERIES+' серіалів. Прибери завершені, щоб додати нові.'};
        rows = rows.filter(function (row) { return row.id !== clean.id; });
        if (enabled) { clean.addedAt = Date.now(); rows.unshift(clean); }
        if (!set('my_series_v1_'+profile(), rows)) return {ok:false, reason:'Не вдалося зберегти список на пристрої.'};
        set('series_releases_v1_'+profile(),releaseState());
        scheduleReleases(1500);
        paintButtons();
        return {ok:true, changed:true};
    }
    function history() {
        try { return L.Favorite.get({type:'history'}) || []; } catch (ignore) { return []; }
    }
    function movieList(owner) {
        var saved=get('my_movies_v1_'+(owner || profile()),[]), seen={};
        return (Array.isArray(saved)?saved:[]).map(function(row){
            var movie=cleanMovie(row,false);
            if(!movie || seen[movie.id] || ['wanted','watched'].indexOf(row.libraryState)<0)return null;
            seen[movie.id]=true;movie.libraryState=row.libraryState;movie.addedAt=+row.addedAt||0;movie.updatedAt=+row.updatedAt||movie.addedAt;
            return movie;
        }).filter(Boolean).slice(0,MAX_MOVIES).sort(function(a,b){
            return (a.libraryState==='wanted'?0:1)-(b.libraryState==='wanted'?0:1) || b.updatedAt-a.updatedAt || b.addedAt-a.addedAt || a.id-b.id;
        });
    }
    function savedMovie(movie) { return movieList().filter(function(row){return row.id===Number(movie.id);})[0] || null; }
    function saveMovie(movie,state) {
        var clean=cleanMovie(movie,false);
        if(!clean || ['wanted','watched','remove'].indexOf(state)<0)return {ok:false,reason:'Не вдалося визначити фільм TMDB.'};
        var rows=movieList(), previous=rows.filter(function(row){return row.id===clean.id;})[0];
        if(state==='remove' && !previous || previous && previous.libraryState===state)return {ok:true,changed:false};
        if(state!=='remove' && !previous && rows.length>=MAX_MOVIES)return {ok:false,reason:'У медіатеці вже '+MAX_MOVIES+' фільмів. Прибери непотрібні, щоб додати нові.'};
        rows=rows.filter(function(row){return row.id!==clean.id;});
        if(state!=='remove'){
            var merged={};Object.keys(previous || {}).forEach(function(key){merged[key]=previous[key];});Object.keys(clean).forEach(function(key){merged[key]=clean[key];});
            merged.libraryState=state;merged.addedAt=previous?previous.addedAt:Date.now();merged.updatedAt=Date.now();rows.unshift(merged);
        }
        if(!set('my_movies_v1_'+profile(),rows))return {ok:false,reason:'Не вдалося зберегти медіатеку на пристрої.'};
        paintButtons();pages.forEach(function(page){page.libraryChanged();});
        return {ok:true,changed:true};
    }
    function importMovies() {
        var seen={}, included={};movieList().forEach(function(movie){included[movie.id]=true;});
        return history().map(function(movie){return cleanMovie(movie,false);}).filter(function(movie){
            if(!movie || seen[movie.id] || included[movie.id])return false;seen[movie.id]=true;return true;
        }).slice(0,100);
    }
    function startMoviePlayback(data) {
        moviePlayback=null;
        if(!data || data.iptv || data.tv || data.trailer || data.youtube || +data.season>0 || +data.episode>0 || !data.timeline)return;
        // Player.card is shared by Lampa's torrent player and Faborn online. Never infer
        // identity from the last opened card: a manual source search may play another film.
        var movie=cleanMovie(data.card || data.movie,false);
        if(movie)moviePlayback={movie:movie,data:data,owner:profile(),done:false};
    }
    function updateMoviePlayback(event) {
        var playback=moviePlayback, current=event && +event.current, duration=event && +event.duration;
        if(!playback || playback.done || playback.owner!==profile() || L.Player && L.Player.playdata && L.Player.playdata()!==playback.data)return;
        if(!isFinite(current) || !isFinite(duration) || current<=0 || duration<=0 || duration>604800 || current>duration+2 || current/duration<.8)return;
        if(playback.data.timeline.waiting_for_user || playback.data.timeline.stop_recording)return;
        playback.done=true;
        var result=saveMovie(playback.movie,'watched');
        if(!result.ok)playback.error=result.reason;
    }
    function movieTimelineUpdated(event) {
        var data=event && event.data, playback=moviePlayback;
        if(!playback || !data || !data.road || data.hash===undefined || playback.data.timeline.hash===undefined || str(data.hash)!==str(playback.data.timeline.hash))return;
        updateMoviePlayback({current:data.road.time,duration:data.road.duration});
    }
    function finishMoviePlayback() {
        if(moviePlayback && moviePlayback.error)notify(moviePlayback.error);
        moviePlayback=null;
    }
    function importCandidates() {
        var seen = {};
        return history().map(function (movie) { return cleanMovie(movie,true); }).filter(function (movie) {
            if (!movie || seen[movie.id] || has(movie)) return false;
            seen[movie.id] = true; return true;
        }).slice(0,100);
    }
    function road(movie, season, episode) {
        if (!L.Timeline || !L.Utils) return {percent:0,time:0,updated:0};
        var privateKey = 'faborn|tmdb-'+(isSeries(movie) ? 'tv' : 'movie')+'-'+movie.id+'|'+season+'|'+episode;
        var title = movie.original_name || movie.original_title;
        var canonical = isSeries(movie) ? [season,season>10?':':'',episode,title].join('') : title;
        try {
            var a = L.Timeline.view(L.Utils.hash(privateKey)) || {}, b = title ? L.Timeline.view(L.Utils.hash(canonical)) || {} : {};
            var chosen = (+b.updated||0) > (+a.updated||0) || !a.updated && !a.percent && b.percent ? b : a;
            return {percent:Math.max(0,Math.min(100,+chosen.percent||0)), time:Math.max(0,+chosen.time||0), updated:+chosen.updated||0};
        } catch (ignore) { return {percent:0,time:0,updated:0}; }
    }
    function latestEpisode(movie, details) {
        var index = get('poster_episode_index',{}), tokens = index && index['tv:'+movie.id], known = {}, candidates = [], count = 0;
        function add(s,e) {
            if (!integer(s,1,100) || !integer(e,1,1000) || known[s+':'+e] || count >= 3000) return;
            known[s+':'+e] = true; count++;
            var p = road(movie,+s,+e); if (p.percent > 0) candidates.push({season:+s,episode:+e,progress:p});
        }
        (tokens && Array.isArray(tokens.episodes) ? tokens.episodes : []).forEach(function (token) { var p = str(token).split(':'); add(+p[0],+p[1]); });
        (details && Array.isArray(details.seasons) ? details.seasons : []).forEach(function (season) { if(season)for (var e=1;e<=Math.min(1000,+season.episode_count||0);e++) add(+season.season_number,e); });
        candidates.sort(function (a,b) { return b.progress.updated-a.progress.updated || b.season-a.season || b.episode-a.episode; });
        return candidates[0] || null;
    }
    function summary(movie, details, season, day, latest) {
        var result = {last:arguments.length>4?latest:latestEpisode(movie,details), episodes:[], pending:0, watched:0, next:null, upcoming:null, season:season && +season.season_number || 0, ended:details && (details.status==='Ended' || details.status==='Canceled')};
        var seen = {};
        (season && Array.isArray(season.episodes) ? season.episodes : []).forEach(function (episode) {
            if(!episode)return;
            var s = +episode.season_number, e = +episode.episode_number;
            if (s !== result.season || !integer(s,1,100) || !integer(e,1,1000) || seen[e]) return;
            seen[e] = true;
            var p = road(movie,s,e), aired = date(episode.air_date) && episode.air_date <= day;
            var row = {season:s,episode:e,name:str(episode.name),air_date:date(episode.air_date),released:!!aired,progress:p};
            result.episodes.push(row);
            if (aired) { if (p.percent>=90) result.watched++; else result.pending++; }
        });
        result.episodes.sort(function (a,b) { return a.episode-b.episode; });
        result.next = result.episodes.filter(function (e) { return e.released && e.progress.percent<90; })[0] || null;
        var upcoming = result.episodes.filter(function (e) { return e.air_date>day; })[0];
        var next = details && details.next_episode_to_air;
        if (next && date(next.air_date)>day && integer(next.season_number,1,100) && integer(next.episode_number,1,1000)) {
            if (!upcoming || next.air_date < upcoming.air_date) upcoming = {season:+next.season_number,episode:+next.episode_number,air_date:next.air_date};
        }
        result.upcoming = upcoming || null;
        var lastAired=episodeDate(details && details.last_episode_to_air);
        result.waiting=!!(!result.ended && !result.pending && result.watched && lastAired && lastAired.air_date<=day && road(movie,lastAired.season,lastAired.episode).percent>=90);
        return result;
    }
    function normalizeFilters(input) {
        input = input || {};
        return {mood:MOODS.some(function (m) { return m.id===input.mood; }) ? input.mood : 'any', minutes:[0,90,120,180].indexOf(+input.minutes)>=0 ? +input.minutes : 120, rating:[0,6,7,8].indexOf(+input.rating)>=0 ? +input.rating : 7, unseen:input.unseen!==false};
    }
    function discoveryRequest(filters, page, day) {
        var f = normalizeFilters(filters), mood = MOODS.filter(function (m) { return m.id===f.mood; })[0];
        var params = {page:integer(page,1,4) ? page : 1, langs:'uk-UA', sort_by:'popularity.desc', filter:{include_adult:'false',include_video:'false','vote_count.gte':100,'vote_average.gte':f.rating,'primary_release_date.lte':day}};
        if (f.minutes) { params.filter['with_runtime.gte']=1; params.filter['with_runtime.lte']=f.minutes; }
        if (mood.genres) params.filter.with_genres=mood.genres;
        return params;
    }
    function seenMovie(movie) {
        var saved=savedMovie(movie);if(saved && saved.libraryState==='watched')return true;
        try { if (L.Favorite.check(movie).viewed) return true; } catch (ignore) {}
        return road(movie,0,0).percent>0 || history().some(function (item) { return !isSeries(item) && Number(item.id)===Number(movie.id) && (!item.source || item.source==='tmdb' || item.source==='cub'); });
    }
    function scope() { return {alive:true,profile:profile(), cancel:function () { this.alive=false; drain(); }}; }
    function valid(task) { return task.alive && task.profile===profile(); }
    function request(task, path, params, callback) {
        var key = path+'|'+JSON.stringify(params), saved = cache[key];
        if (!valid(task)) return;
        if (saved && saved.time<=Date.now() && Date.now()-saved.time<TTL) return callback(null,saved.data);
        queue.push({scope:task,path:path,params:params,callback:callback,key:key}); drain();
    }
    function drain() {
        queue = queue.filter(function (job) { return valid(job.scope); });
        while (running<2 && queue.length) send(queue.shift());
    }
    function send(job) {
        running++;
        var done=false, timer=root.setTimeout(function () { finish('Не вдалося отримати дані TMDB. Спробуй ще раз.'); },12000);
        function finish(error,data) {
            if (done) return; done=true; root.clearTimeout(timer); running--;
            if (!error && data && typeof data==='object') {
                cache[job.key]={time:Date.now(),data:data};cacheOrder=cacheOrder.filter(function (key) { return key!==job.key; });cacheOrder.push(job.key);
                while(cacheOrder.length>90) delete cache[cacheOrder.shift()];
            }
            try { if (valid(job.scope)) job.callback(error,data); } finally { drain(); }
        }
        try {
            var api=L.Api && L.Api.sources && L.Api.sources.tmdb;
            if (!api || !api.get) return finish('Клієнт TMDB недоступний у цій збірці Lampa.');
            api.get(job.path,job.params,function (data) { finish(null,data); },function () { finish('Не вдалося отримати дані TMDB. Спробуй ще раз.'); },{life:360});
        } catch (ignore) { finish('Не вдалося отримати дані TMDB. Спробуй ще раз.'); }
    }
    function loadSeries(task, movie, callback, previous) {
        function detailsReady(error,details) {
            if (error || !details || Number(details.id)!==movie.id) return callback(error || 'TMDB повернув інший серіал.');
            if(!previous)observeRelease(movie,details,today());
            var seasons=(Array.isArray(details.seasons)?details.seasons:[]).filter(function (s) { return s && integer(s.season_number,1,100) && +s.episode_count>0; }).sort(function (a,b) { return a.season_number-b.season_number; });
            var latest=latestEpisode(movie,details), current=latest ? latest.season : seasons.length ? seasons[0].season_number : 1, attempts=0;
            function load(number) {
                function seasonReady(fail,season) {
                    if (fail || !season || +season.season_number!==number || !Array.isArray(season.episodes)) return callback(fail || 'Дані сезону недоступні.');
                    var state=summary(movie,details,season,today(),latest), next=seasons.filter(function (s) { return s.season_number>number && date(s.air_date) && s.air_date<=today(); })[0];
                    if (!state.pending && state.watched && next && attempts++<2) return load(next.season_number);
                    callback(null,{details:details,season:season,state:state});
                }
                if(previous && previous.season && +previous.season.season_number===+number)seasonReady(null,previous.season);
                else request(task,'tv/'+movie.id+'/season/'+number,{langs:'uk-UA'},seasonReady);
            }
            load(current);
        }
        if(previous && previous.details)detailsReady(null,previous.details);
        else request(task,'tv/'+movie.id,{langs:'uk-UA'},detailsReady);
    }
    // Page-local metadata survives pagination. Progress is invalidated by Timeline events.
    function seriesCache() {
        var saved={}, revision=0, owner=profile();
        function current(){if(owner!==profile()){saved={};owner=profile();revision++;}}
        function fresh(row){return row && row.checked<=Date.now() && Date.now()-row.checked<TTL && row.day===today();}
        return {
            get:function(movie){current();return saved[movie.id] && saved[movie.id].data;},
            invalidate:function(){revision++;},
            clear:function(){saved={};revision++;owner=profile();},
            retain:function(movies){var ids={};movies.forEach(function(movie){ids[movie.id]=true;});Object.keys(saved).forEach(function(id){if(!ids[id])delete saved[id];});},
            load:function(task,movie,callback){
                current();if(!valid(task))return;
                var row=saved[movie.id], stamp=revision, reuse=fresh(row) && !row.data.error;
                if(reuse && row.revision===stamp)return callback(null,row.data);
                loadSeries(task,movie,function(error,data){
                    if(!valid(task) || stamp!==revision)return;
                    saved[movie.id]={data:error?{error:error}:data,checked:reuse?row.checked:Date.now(),day:today(),revision:stamp};
                    callback(error,data);
                },reuse?row.data:null);
            }
        };
    }
    function progressValue(value) {
        if (typeof value==='number') value={percent:value};
        value=value && typeof value==='object'?value:{};
        function number(key,max){var n=Number(value[key]);return isFinite(n) && n>0?Math.min(max,n):0;}
        return {percent:number('percent',100),time:number('time',604800),duration:number('duration',604800),updated:number('updated',Date.now()+60000)};
    }
    function timelineValue(hash) { return progressValue(L.Timeline.view(hash)); }
    function timelineReady() { try { return !!(L.Timeline && L.Timeline.view && L.Timeline.view(1)); } catch(ignore){return false;} }
    function validHash(value) { return /^-?[1-9]\d{0,15}$/.test(str(value)); }
    function sameProgress(a,b) { return ['percent','time','duration','updated'].every(function(key){return a[key]===b[key];}); }
    function episodeKeys(movie,s,e) {
        var keys=[L.Utils.hash('faborn|tmdb-tv-'+movie.id+'|'+s+'|'+e)], title=movie.original_name || movie.original_title;
        if(title){var key=L.Utils.hash([s,s>10?':':'',e,title].join(''));if(keys.indexOf(key)<0)keys.push(key);}
        return keys;
    }
    function releasedEpisodes(season,day) {
        var seen={};
        return (season && Array.isArray(season.episodes)?season.episodes:[]).filter(function(row){
            if(!row || +row.season_number!==+season.season_number || !integer(row.season_number,1,100) || !integer(row.episode_number,1,1000) || !date(row.air_date) || row.air_date>day || seen[row.episode_number])return false;
            seen[row.episode_number]=true;return true;
        }).sort(function(a,b){return a.episode_number-b.episode_number;});
    }
    function prepareWatched(task,movie,choice,callback) {
        if(!timelineReady())return callback('Історія Lampa ще завантажується. Спробуй за мить.');
        movie=cleanMovie(movie,true);choice=choice || {};
        if(!movie || ['all','season','through'].indexOf(choice.mode)<0 || choice.mode!=='all' && !integer(choice.season,1,100) || choice.mode==='through' && !integer(choice.episode,1,1000))return callback('Некоректний вибір серій.');
        request(task,'tv/'+movie.id,{langs:'uk-UA'},function(error,details){
            if(error || !details || +details.id!==movie.id || !Array.isArray(details.seasons))return callback(error || 'Не вдалося перевірити сезони серіалу.');
            var seen={}, rows=[], day=today(), seasons=details.seasons.filter(function(s){
                if(!s || !integer(s.season_number,1,100) || !integer(s.episode_count,1,1000) || seen[s.season_number])return false;
                seen[s.season_number]=true;
                return (choice.mode==='all' || choice.mode==='season' && +s.season_number===+choice.season || choice.mode==='through' && +s.season_number<=+choice.season) && !(date(s.air_date) && s.air_date>day);
            }).sort(function(a,b){return a.season_number-b.season_number;});
            function next(){
                if(!valid(task))return;
                var season=seasons.shift();
                if(!season){
                    if(choice.mode==='through' && !rows.some(function(row){return row.season===+choice.season && row.episode===+choice.episode;}))return callback('Обрана серія ще не вийшла або її дату не підтверджено.');
                    var entries=[];
                    rows.forEach(function(row){episodeKeys(movie,row.season,row.episode).forEach(function(hash){var before=timelineValue(hash);entries.push({hash:hash,group:row.season+':'+row.episode,before:before,value:{percent:100,time:before.duration || 0,duration:before.duration,updated:0}});});});
                    return callback(null,{kind:'watched',owner:profile(),movie:movie,rows:rows,entries:entries,count:rows.length,positionBefore:get('position_tmdb-tv-'+movie.id,{})});
                }
                request(task,'tv/'+movie.id+'/season/'+season.season_number,{langs:'uk-UA'},function(fail,data){
                    if(fail || !data || +data.season_number!==+season.season_number || !Array.isArray(data.episodes))return callback(fail || 'Дані сезону неповні. Відмітки ще не змінені.');
                    releasedEpisodes(data,day).forEach(function(e){if(choice.mode!=='through' || +e.season_number<+choice.season || +e.episode_number<=+choice.episode)rows.push({season:+e.season_number,episode:+e.episode_number});});
                    if(rows.length>3000)return callback('Для одного кроку забагато серій. Позначай окремі сезони.');
                    next();
                });
            }
            next();
        });
    }
    function nativeStore(name) {
        var value;
        try { value=L.Storage.get(name,{});for(var i=0;i<2 && typeof value==='string';i++)value=JSON.parse(value); }
        catch(ignore){return {};}
        return value && typeof value==='object' && !Array.isArray(value)?value:{};
    }
    function profileSources() {
        var names={}, result=[];
        try {
            var storage=root.localStorage;
            for(var i=0;i<Math.min(storage.length,10000);i++){
                var key=storage.key(i), match=/^(?:faborn_ukr_my_(?:series|movies)_v1_)?(file_view(?:_[a-zA-Z0-9_-]{1,80})?)$/.exec(key);
                if(match && match[1]!==profile())names[match[1]]=true;
            }
        } catch(ignore){}
        Object.keys(names).sort().forEach(function(name){
            var data=nativeStore(name), count=Object.keys(data).filter(function(key){var p=progressValue(data[key]);return validHash(key) && (p.percent>0 || p.time>0);}).length, shows=list(name), movies=movieList(name);
            if(count || shows.length || movies.length)result.push({id:name,label:name==='file_view'?'Без акаунту':'Профіль '+name.slice(10),count:count,series:shows.length,movies:movies.length});
        });
        return result;
    }
    function prepareTransfer(source) {
        if(!timelineReady())return {error:'Історія Lampa ще завантажується. Спробуй за мить.'};
        if(!profileSources().some(function(row){return row.id===source;}))return {error:'Дані цього профілю на пристрої не знайдені.'};
        var from=nativeStore(source), current=nativeStore(profile()), entries=[], saved=list(), ids={}, protectedKeys={}, keyGroups={}, index=get('poster_episode_index',{}), metadata=get('poster_seasons',{});
        saved.concat(list(source)).forEach(function(movie){
            var key='tv:'+movie.id, tokens=index[key] && index[key].episodes || [], seasons=metadata[key] && metadata[key].seasons || [], seen={}, count=0;
            function pair(s,e){
                if(!integer(s,1,100) || !integer(e,1,1000) || seen[s+':'+e] || count++>=3000)return;seen[s+':'+e]=true;
                var keys=episodeKeys(movie,+s,+e);
                keys.forEach(function(hash){keyGroups[hash]=movie.id+':'+s+':'+e;});
                if(keys.some(function(hash){var p=timelineValue(hash);return Object.prototype.hasOwnProperty.call(current,hash) || p.percent || p.time || p.updated;}))keys.forEach(function(hash){protectedKeys[hash]=true;});
            }
            if(Array.isArray(tokens))tokens.forEach(function(token){var p=str(token).split(':');pair(+p[0],+p[1]);});
            if(Array.isArray(seasons))seasons.forEach(function(s){if(s)for(var e=1;e<=Math.min(1000,+s.episode_count||0);e++)pair(+s.season_number,e);});
        });
        saved.forEach(function(m){ids[m.id]=true;});
        var films=movieList(), filmIds={};films.forEach(function(movie){filmIds[movie.id]=true;});
        films.concat(movieList(source)).forEach(function(movie){
            var keys=[str(L.Utils.hash('faborn|tmdb-movie-'+movie.id+'|0|0'))];
            if(movie.original_title)keys.push(str(L.Utils.hash(movie.original_title)));
            keys.forEach(function(hash){keyGroups[hash]='movie:'+movie.id;});
            if(keys.some(function(hash){var p=timelineValue(hash);return Object.prototype.hasOwnProperty.call(current,hash) || p.percent || p.time || p.updated;}))keys.forEach(function(hash){protectedKeys[hash]=true;});
        });
        Object.keys(from).slice(0,10000).forEach(function(hash){
            if(!validHash(hash) || Object.prototype.hasOwnProperty.call(current,hash) || protectedKeys[hash])return;
            var value=progressValue(from[hash]), before=timelineValue(hash);
            if((value.percent>0 || value.time>0) && !before.percent && !before.time && !before.updated)entries.push({hash:hash,group:keyGroups[hash],before:before,value:value});
        });
        var incoming=list(source).filter(function(m){return !ids[m.id];}).slice(0,Math.max(0,MAX_SERIES-saved.length));
        return {kind:'transfer',owner:profile(),entries:entries,series:incoming,movies:movieList(source).filter(function(movie){return !filmIds[movie.id];}).slice(0,Math.max(0,MAX_MOVIES-films.length)),count:entries.length,source:source};
    }
    function rememberMarks(plan) {
        if(plan.kind!=='watched' || !plan.rows.length)return;
        var all=get('poster_episode_index',{}), key='tv:'+plan.movie.id, row=all[key] || {episodes:[]}, last=plan.rows[plan.rows.length-1];
        var tokens=plan.rows.slice().reverse().map(function(e){return e.season+':'+e.episode;});
        row.episodes=tokens.concat((row.episodes || []).filter(function(token){return tokens.indexOf(token)<0;})).slice(0,500);row.updated=Date.now();all[key]=row;set('poster_episode_index',all);
        set('position_tmdb-tv-'+plan.movie.id,{season:last.season,episode:last.episode,time:0,duration:0,percent:100,updated:Date.now()});
    }
    function undoPlan() {
        if(!timelineReady())return null;
        var saved=get('watched_undo_v1_'+profile(),{});
        if(!saved || !Array.isArray(saved.entries))return null;
        var rows=saved.entries.slice(0,10000).filter(function(row){return row && validHash(row.hash) && row.before && row.after;}), blocked={};
        rows.forEach(function(row){if(row.group && !sameProgress(timelineValue(row.hash),progressValue(row.after)))blocked[row.group]=true;});
        var entries=rows.filter(function(row){return !blocked[row.group] && sameProgress(timelineValue(row.hash),progressValue(row.after));}).map(function(row){return {hash:row.hash,group:row.group,before:timelineValue(row.hash),value:progressValue(row.before)};});
        return entries.length?{kind:'undo',owner:profile(),entries:entries,count:entries.length,position:saved.position}:null;
    }
    function applyProgress(task,plan,callback) {
        if(!timelineReady())return callback({ok:false,reason:'Історія Lampa ще завантажується. Спробуй за мить.',changed:0});
        if(!plan || plan.owner!==profile() || !valid(task) || L.Player && L.Player.opened && L.Player.opened())return callback({ok:false,reason:'Заверши перегляд і повтори дію у потрібному профілі.',changed:0});
        var at=0, changes=[], skipped=0, blocked={}, previousUndo=get('watched_undo_v1_'+plan.owner,{});
        plan.entries.forEach(function(item){if(item.group && !sameProgress(timelineValue(item.hash),item.before))blocked[item.group]=true;});
        function finish(reason){
            var position;
            if(plan.owner===profile())changes.forEach(function(row){row.after=timelineValue(row.hash);});
            if(plan.owner===profile() && changes.length && !reason){
                if(plan.kind==='watched'){
                    rememberMarks(plan);position={key:'position_tmdb-tv-'+plan.movie.id,before:plan.positionBefore,after:get('position_tmdb-tv-'+plan.movie.id,{})};
                } else if(plan.kind==='undo' && plan.position && JSON.stringify(get(plan.position.key,{}))===JSON.stringify(plan.position.after))set(plan.position.key,plan.position.before);
            }
            if(changes.length){
                var remaining=plan.kind==='undo' && previousUndo.entries?previousUndo.entries.filter(function(row){return !changes.some(function(done){return done.hash===row.hash;});}):[];
                set('watched_undo_v1_'+plan.owner,plan.kind==='undo'?{entries:remaining,position:previousUndo.position}:{entries:changes,at:Date.now(),position:position});
            }
            if(!reason && plan.kind==='transfer' && plan.series.length){
                var rows=list(), ids={};rows.forEach(function(m){ids[m.id]=true;});
                rows=rows.concat(plan.series.filter(function(m){return !ids[m.id];})).slice(0,MAX_SERIES);
                if(!set('my_series_v1_'+plan.owner,rows))reason='Прогрес перенесено, але список серіалів не вдалося зберегти.';
            }
            if(!reason && plan.kind==='transfer' && plan.movies && plan.movies.length){
                var films=movieList(), filmIds={};films.forEach(function(movie){filmIds[movie.id]=true;});
                films=films.concat(plan.movies.filter(function(movie){return !filmIds[movie.id];})).slice(0,MAX_MOVIES);
                if(!set('my_movies_v1_'+plan.owner,films))reason='Не вдалося зберегти список фільмів у поточному профілі.';
            }
            if(plan.owner===profile()){paintButtons();pages.forEach(function(page){page.refresh();});scheduleReleases(1500);}
            callback({ok:!reason,reason:reason || '',changed:changes.length,skipped:skipped});
        }
        function next(){
            if(!valid(task) || plan.owner!==profile())return finish('Дію зупинено. Уже внесені відмітки можна скасувати в попередньому профілі.');
            var stop=Math.min(at+8,plan.entries.length);
            try {
                for(;at<stop;at++){
                    var item=plan.entries[at], before=timelineValue(item.hash);
                    if(blocked[item.group] || !sameProgress(before,item.before)){skipped++;continue;}
                    var view=L.Timeline.view(item.hash);
                    if(typeof view.handler!=='function')throw new Error('Ця збірка Lampa не підтримує запис відміток.');
                    view.handler(item.value.percent,item.value.time,item.value.duration);
                    var after=timelineValue(item.hash);
                    changes.push({hash:item.hash,group:item.group,before:before,after:after});
                    if(after.percent!==item.value.percent || Math.abs(after.time-item.value.time)>1)throw new Error('Не вдалося зберегти відмітку. Перевір вільне місце на пристрої.');
                }
            } catch(error){return finish(error.message || 'Не вдалося зберегти всі відмітки.');}
            if(at<plan.entries.length)root.setTimeout(next,0);else finish();
        }
        next();
    }
    function recommendations(task, filters, shown, callback) {
        var found=[], page=0, candidates=[], checked={}, lastError='';
        function nextPage() {
            if (!valid(task)) return;
            if (++page>4) return callback(found.length ? null : lastError,found);
            request(task,'discover/movie',discoveryRequest(filters,page,today()),function (error,data) {
                if (error) return callback(error,found);
                candidates=(data && Array.isArray(data.results) ? data.results : []).filter(function (movie) {
                    return cleanMovie(movie,false) && !isSeries(movie) && !movie.adult && !checked[movie.id] && shown.indexOf(Number(movie.id))<0 && (!filters.unseen || !seenMovie(movie));
                });
                for (var i=candidates.length-1;i>0;i--) { var j=Math.floor(Math.random()*(i+1)), v=candidates[i];candidates[i]=candidates[j];candidates[j]=v; }
                checkNext(data && +data.total_pages<=page);
            });
        }
        function checkNext(lastPage) {
            if (!valid(task)) return;
            if (found.length===3) return callback(null,found);
            var movie=candidates.shift();
            if (!movie) return lastPage ? callback(null,found) : nextPage();
            checked[movie.id]=true;
            if (Object.keys(checked).length>18) return callback(lastError,found);
            request(task,'movie/'+movie.id,{langs:'uk-UA'},function (error,details) {
                if (error) lastError=error;
                if (!error && details && Number(details.id)===Number(movie.id) && !details.adult && +details.vote_average>=filters.rating && date(details.release_date) && details.release_date<=today() && (!filters.minutes || +details.runtime>0 && +details.runtime<=filters.minutes)) {
                    var clean=cleanMovie(details,false);
                    if (clean) { clean.runtime=+details.runtime||0;found.push(clean); }
                }
                checkNext(lastPage);
            });
        }
        nextPage();
    }
    function image(path, width) {
        if (!/^\/[a-zA-Z0-9_.-]+$/.test(str(path))) return '';
        return L.TMDB && L.TMDB.image ? L.TMDB.image('t/p/w'+width+path) : 'https://image.tmdb.org/t/p/w'+width+path;
    }
    function full(movie) { L.Activity.push({component:'full',id:movie.id,method:isSeries(movie)?'tv':'movie',source:'tmdb',card:movie,title:movie.title||movie.name}); }
    function notify(message) { if (L.Noty) L.Noty.show(message); }
    function menuSelect(title, items, onSelect, back) { L.Select.show({title:title,items:items,onSelect:function (item) { L.Select.hide();onSelect(item); },onBack:function () { L.Select.hide();back(); }}); }
    function progressJob(title,task,back) {
        menuSelect(title,[{title:'Скасувати',subtitle:'Назад — зупинити дію.'}],function(){task.cancel();back();},function(){task.cancel();back();});
    }
    function confirmProgress(plan,back) {
        var transfer=plan.kind==='transfer', undo=plan.kind==='undo';
        if(!plan.count && !(transfer && (plan.series.length || plan.movies && plan.movies.length))){notify('Немає нових відміток для цієї дії.');return back();}
        var title=transfer?'Перенести до поточного профілю?':undo?'Скасувати останні відмітки?':plan.movie.name || plan.movie.title;
        var label=transfer?'Скопіювати · записів: '+plan.count+' · серіалів: '+plan.series.length+' · фільмів: '+(plan.movies || []).length:undo?'Відновити записи · '+plan.count:'Позначити переглянутими · '+plan.count;
        var subtitle=transfer?'Лише відсутні записи. Прогрес поточного й старого профілів не стирається.':undo?'Записи, змінені після цієї дії, залишаться без змін.':'Тільки епізоди з датою виходу до сьогодні включно. Майбутні та спецвипуски залишаться без змін.';
        menuSelect(title,[{title:label,subtitle:subtitle,apply:true},{title:'Скасувати'}],function(item){
            if(!item.apply || plan.owner!==profile())return back();
            var task=scope(), closed=false;
            progressJob('Зберігаємо відмітки…',task,function(){closed=true;back();});
            applyProgress(task,plan,function(result){
                if(closed){if(result.changed && plan.owner===profile())notify('Дію зупинено. Внесені відмітки можна скасувати в «Переглянуте».');return;}L.Select.hide();
                notify(result.ok?(transfer?'Прогрес перенесено.':undo?'Попередні відмітки відновлено.':'Серії позначено переглянутими.')+(result.skipped?' Новіші зміни збережено.':''):result.reason);
                back();
            });
        },back);
    }
    function watchedMenu(movie,back) {
        var who=profile();
        function main(){watchedMenu(movie,back);}
        function prepare(choice){
            var task=scope();progressJob('Перевіряємо дати серій…',task,main);
            prepareWatched(task,movie,choice,function(error,plan){if(!valid(task))return;L.Select.hide();if(error){notify(error);return main();}confirmProgress(plan,back);});
        }
        function seasons(mode){
            var task=scope();progressJob('Отримуємо сезони…',task,main);
            request(task,'tv/'+movie.id,{langs:'uk-UA'},function(error,details){
                if(!valid(task))return;L.Select.hide();
                if(error || !details || +details.id!==+movie.id){notify(error || 'Дані серіалу недоступні.');return main();}
                var rows=(Array.isArray(details.seasons)?details.seasons:[]).filter(function(s){return s && integer(s.season_number,1,100) && +s.episode_count>0 && !(date(s.air_date) && s.air_date>today());}).map(function(s){return {title:'Сезон '+s.season_number,season:+s.season_number};});
                if(!rows.length){notify('Немає сезонів для позначення.');return main();}
                menuSelect('Обери сезон',rows,function(row){
                    if(who!==profile())return back();
                    if(mode==='season')return prepare({mode:mode,season:row.season});
                    var token=scope();progressJob('Отримуємо серії…',token,function(){seasons(mode);});
                    request(token,'tv/'+movie.id+'/season/'+row.season,{langs:'uk-UA'},function(fail,data){
                        if(!valid(token))return;L.Select.hide();
                        var episodes=!fail && data && +data.season_number===row.season?releasedEpisodes(data,today()):[];
                        if(!episodes.length){notify(fail || 'Немає серій із підтвердженою датою виходу.');return seasons(mode);}
                        menuSelect('Переглянуто включно до…',episodes.map(function(e){return {title:'S'+row.season+' · E'+e.episode_number+(e.name?' · '+e.name:''),episode:+e.episode_number};}),function(e){if(who===profile())prepare({mode:'through',season:row.season,episode:e.episode});else back();},function(){seasons(mode);});
                    });
                },main);
            });
        }
        menuSelect(movie.name || movie.title,[{title:'Усе, що вже вийшло',subtitle:'Усі сезони до сьогодні. Нові серії згодом залишаться непроглянутими.',mode:'all'},{title:'Окремий сезон',mode:'season'},{title:'До певної серії включно',subtitle:'Попередні сезони та серії до обраної.',mode:'through'}],function(item){if(who!==profile())return back();if(item.mode==='all')prepare({mode:'all'});else seasons(item.mode);},back);
    }
    function transferMenu(back) {
        var owner=profile(), sources=profileSources();
        if(!sources.length){notify('На цьому пристрої немає збереженого прогресу іншого профілю. Можна позначити переглянуті сезони вручну.');return back();}
        menuSelect('З якого профілю скопіювати?',sources.map(function(row){return {title:row.label,subtitle:'Записів прогресу: '+row.count+' · серіалів: '+row.series+' · фільмів: '+row.movies,id:row.id};}),function(item){
            if(owner!==profile())return back();
            var plan=prepareTransfer(item.id);if(plan.error){notify(plan.error);return back();}confirmProgress(plan,back);
        },back);
    }
    function progressTools(back) {
        var enabled=L.Controller.enabled().name, who=profile();back=back || function(){L.Controller.toggle(enabled);};
        var items=[{title:'Позначити серіал переглянутим',subtitle:'Усі серії, сезон або до певного епізоду.',action:'watched'},{title:'Перенести з іншого профілю',subtitle:'Копія збереженого прогресу на цьому пристрої.',action:'transfer'}];
        if(undoPlan())items.push({title:'Скасувати останні відмітки',subtitle:'Подальший перегляд і новіші зміни збережуться.',action:'undo'});
        menuSelect('Переглянуте та прогрес',items,function(item){
            if(who!==profile())return back();
            if(item.action==='transfer')return transferMenu(back);
            if(item.action==='undo'){var plan=undoPlan();if(plan)confirmProgress(plan,back);else back();return;}
            var rows=list();if(!rows.length){notify('Додай серіал через «+» у картці. Для позначення також можна утримувати цю іконку.');return back();}
            menuSelect('Обери серіал',rows.map(function(movie){return {title:movie.name || movie.title,movie:movie};}),function(row){if(who===profile())watchedMenu(row.movie,back);else back();},back);
        },back);
    }
    function paintButtons() {
        buttons=buttons.filter(function (record) { return doc.documentElement.contains(record.node); });
        buttons.forEach(function (record) {
            var tv=isSeries(record.movie), saved=tv?null:savedMovie(record.movie), added=tv?has(record.movie):!!saved;
            var label=tv?(added?'Серіал у медіатеці':'Стежити за серіалом'):saved?(saved.libraryState==='watched'?'Переглянуто · медіатека':'Хочу подивитися · медіатека'):'Додати фільм до медіатеки';
            record.node.innerHTML=icon(added?(saved && saved.libraryState==='wanted'?'bookmark':'check'):'plus');
            record.node.classList.toggle('fbr-follow--added',added);
            ['title','aria-label','data-title','data-subtitle'].forEach(function (attr) { record.node.setAttribute(attr,label); });
            record.node.setAttribute('aria-pressed',added?'true':'false');
        });
    }
    function movieMenu(movie,back,allowOpen) {
        var who=profile(), saved=savedMovie(movie), items=[];
        if(allowOpen)items.push({title:'Відкрити картку фільму',action:'card'});
        items.push({title:'Хочу подивитися',selected:!!saved && saved.libraryState==='wanted',action:'wanted'});
        items.push({title:'Переглянуто',selected:!!saved && saved.libraryState==='watched',action:'watched'});
        items.push({title:'Відкрити «Моя медіатека → Фільми»',action:'library'});
        if(saved)items.push({title:'Прибрати з медіатеки',subtitle:'Історія та час зупинки збережуться.',action:'remove'});
        menuSelect(movie.title || movie.name,items,function(item){
            if(who!==profile())return back();
            if(item.action==='card')return full(movie);
            if(item.action==='library')return open('films');
            var result=saveMovie(movie,item.action);
            if(!result.ok)notify(result.reason);
            else if(result.changed)notify(item.action==='wanted'?'Додано до «Хочу подивитися»':item.action==='watched'?'Фільм у «Переглянуто»':'Фільм прибрано з медіатеки');
            back();
        },back);
    }
    function attach(event) {
        if (!event || event.type!=='complite' || !event.data || !event.object || !event.object.activity) return;
        var tv=isSeries(event.data.movie), movie=cleanMovie(event.data.movie,tv);if (!movie) return;
        var render=event.object.activity.render(), node=render && (render[0] || render), row=node && node.querySelector('.full-start-new__buttons,.full-start__buttons');
        if(tv)attachRelease(movie,node,event.data.movie);
        if (!row || row.querySelector('.view--faborn-follow')) return;
        var button=doc.createElement('div');button.className='full-start__button selector view--faborn-follow';button.setAttribute('role','button');button.setAttribute('data-faborn-action','follow');
        $(button).on('hover:enter',function () {
            var enabled=L.Controller.enabled().name, who=profile();
            function back() { if (doc.documentElement.contains(button)) L.Controller.toggle(enabled); }
            if(!tv)return movieMenu(movie,back,false);
            if (!has(movie)) { var result=follow(movie,true);notify(result.ok?'Серіал додано до медіатеки':result.reason);return; }
            menuSelect(movie.name || movie.title,[{title:'Відкрити «Моя медіатека → Серіали»',action:'open'},{title:'Позначити переглянуте',action:'watched'},{title:'Прибрати з медіатеки',subtitle:'Історія й прогрес перегляду збережуться.',action:'remove'}],function (item) {
                if (who!==profile()) return back();
                if (item.action==='watched') return watchedMenu(movie,back);
                if (item.action==='open') open('series');
                else { var result=follow(movie,false);if (!result.ok) notify(result.reason);back(); }
            },back);
        }).on('hover:long',function(){var enabled=L.Controller.enabled().name,back=function(){if(doc.documentElement.contains(button))L.Controller.toggle(enabled);};if(tv)watchedMenu(movie,back);else movieMenu(movie,back,false);}).on('hover:focus',function () { if(event.link && event.link.items && event.link.items[0]) event.link.items[0].last=button; });
        row.appendChild(button);buttons.push({movie:movie,node:button});paintButtons();
    }
    function open(kind) {
        var library=kind!=='discover', section=kind==='films' || kind==='series'?kind:get('library_section_'+profile(),'series');
        L.Activity.push({component:library?'faborn_library':'faborn_discover',title:library?'Моя медіатека':'Що подивитися',section:section,page:1});
    }
    function HubPage(kind) {
        var library=kind!=='discover', sections={};
        var self=this, html, scroll, body, alive=true, active=false, created=false, selected='', owner=profile(), task=scope(), loadId=0;
        var filters=normalizeFilters(get('discovery_'+owner,{})), picks=[], shown=[], busy=false, message='', dataCache=seriesCache(), rows=[], page=0, mode='all', searchRows=[], searchTitle='', searchPage=1, searchTotal=1;
        var paintTimer=null, reloadTimer=null, layoutKey='', progressDirty=false, loadedDay=today(), remaining=0;
        function own() { return active && L.Controller.own && L.Controller.own(self); }
        function usable() { return alive && owner===profile(); }
        function resetTask() { task.cancel();task=scope();loadId++;root.clearTimeout(paintTimer);paintTimer=null;return loadId; }
        function control(key,label,action,classes) { return '<div class="selector fbr-hub-control '+(classes||'')+'" role="button" data-hub-key="'+esc(key)+'" data-action="'+esc(action)+'">'+label+'</div>'; }
        function sectionTabs() {
            return '<div class="fbr-hub-toolbar fbr-library-tabs">'+[['films','Фільми','film'],['series','Серіали','tv']].map(function(tab){return control('tab:'+tab[0],icon(tab[2])+tab[1],'tab:'+tab[0],kind===tab[0]?'is-selected':'');}).join('')+'</div>';
        }
        function changeSection(next) {
            if(next===kind || ['films','series'].indexOf(next)<0)return;
            sections[kind]={page:page,mode:mode};kind=next;
            var state=sections[kind] || {page:0,mode:'all'};page=state.page;mode=state.mode;selected='tab:'+kind;layoutKey='';searchRows=[];
            html.className='fbr-hub fbr-hub--'+kind;set('library_section_'+owner,kind);loadList();
            var current=L.Activity.active && L.Activity.active();
            if(current && current.activity===self.activity){
                current.section=kind;
                if(L.Activity.pushState)L.Activity.pushState(current,true);
                if(L.Activity.extractObject)L.Storage.set('activity',L.Activity.extractObject(current));
            }
        }
        function focus() {
            if (!html || !active) return;
            var last=selected==='first-series'?body.querySelector('.fbr-series-card'):body.querySelector('[data-hub-key="'+selected.replace(/[^a-zA-Z0-9:_-]/g,'')+'"]');
            L.Controller.collectionSet(html);L.Controller.collectionFocus(last || false,html);
        }
        function vertical(direction) {
            var navigator=root.Navigator || L.Navigator;
            var current=body.querySelector('.selector.focus'), next=null, best=Infinity;
            if(current){
                var a=current.getBoundingClientRect();
                Array.prototype.forEach.call(body.querySelectorAll('.selector'),function(node){
                    var b=node.getBoundingClientRect(), gap=direction==='up'?a.top-b.bottom:b.top-a.bottom;
                    if(node===current || !b.width || !b.height || gap<-.5)return;
                    var score=gap*10000+Math.abs((a.left+a.right-b.left-b.right)/2);
                    if(score<best){best=score;next=node;}
                });
            }
            if(next)L.Controller.collectionFocus(next,html);
            else if(navigator.canmove(direction))navigator.move(direction);
            else if(direction==='up')L.Controller.toggle('head');
        }
        function footer() { return '<div class="fbr-hub-note">'+(kind==='films'?'Після 80% перегляду фільм автоматично потрапляє до «Переглянуто». Утримуй OK на постері, щоб змінити групу.':kind==='series'?'Дати виходу — TMDB. Доступність озвучення перевіряється при відкритті джерел.':'Добірка за метаданими TMDB. Якість і озвучення перевіряються в картці фільму.')+'</div>'; }
        function poster(movie, wide) { var url=image(wide && movie.backdrop_path || movie.poster_path,wide?780:300);return '<div class="fbr-hub-poster">'+(url?'<img src="'+esc(url)+'" alt="" loading="lazy">':icon('tv'))+'</div>'; }
        function movieCard(movie) {
            return '<article class="selector fbr-discovery-card" role="button" data-hub-key="movie:'+movie.id+'" data-action="movie:'+movie.id+'">'+poster(movie,true)+'<div class="fbr-hub-card-copy"><div class="fbr-hub-facts">'+(movie.vote_average?'<span>'+icon('star')+'TMDB '+movie.vote_average.toFixed(1)+'</span>':'')+(movie.runtime?'<span>'+icon('clock')+movie.runtime+' хв</span>':'')+'</div><h2>'+esc(movie.title||movie.name)+'</h2><p>'+esc(movie.overview || 'Відкрий картку, щоб переглянути подробиці.')+'</p><div class="fbr-hub-card-action">Відкрити фільм '+icon('arrow')+'</div></div></article>';
        }
        function discovery() {
            var mood=MOODS.filter(function (m) { return m.id===filters.mood; })[0];
            var text='<div class="fbr-hub-intro"><span class="fbr-hub-eyebrow">FABORN · ТВІЙ КІНОВЕЧІР</span><h1>Що подивитися?</h1><p>Настрій, вільний час — і три фільми на вибір.</p></div><div class="fbr-hub-toolbar">';
            text+=control('mood',icon(mood.icon)+esc(mood.title),'mood');
            text+=control('minutes',icon('clock')+(filters.minutes?'До '+filters.minutes+' хв':'Будь-яка тривалість'),'minutes');
            text+=control('rating',icon('star')+(filters.rating?'TMDB від '+filters.rating:'Будь-яка оцінка'),'rating');
            text+=control('unseen',icon(filters.unseen?'check':'plus')+(filters.unseen?'Ще не дивився':'Разом із переглянутими'),'unseen');
            text+=control('pick',icon('spark')+(busy?'Змінити добірку':'Підібрати три фільми'),'pick','fbr-hub-primary');
            text+='</div><div class="fbr-hub-status" role="status">'+esc(busy?'Підбираємо фільми…':message || (picks.length?'Обери фільм або спробуй іншу трійку.':'Обери фільтри й натисни «Підібрати три фільми».'))+'</div>';
            text+='<div class="fbr-discovery-grid">'+picks.map(movieCard).join('')+'</div>';
            if (picks.length) text+='<div class="fbr-hub-toolbar fbr-hub-pagination">'+control('more',icon('spark')+(busy?'Підбираємо інші…':'Ще три варіанти'),'more')+'</div>';
            return text+footer();
        }
        function seriesCopy(movie, searching) {
            if(kind==='films')return filmCopy(movie,searching);
            var data=dataCache.get(movie), view=data && data.state, label='Оновлюємо дані серіалу…';
            if (searching) label=has(movie)?'У медіатеці':'Додати до медіатеки';
            else if (data && data.error) label=data.error;
            else if (view && view.last) label=(view.last.progress.percent>=90?'Переглянуто ':'Продовжити ')+'S'+view.last.season+' · E'+view.last.episode;
            else if (view) label='Ще не розпочато';
            var text='<div class="fbr-hub-facts"><span>'+esc(str(movie.first_air_date).slice(0,4))+'</span>'+(movie.vote_average?'<span>'+icon('star')+movie.vote_average.toFixed(1)+'</span>':'')+'</div><h2>'+esc(movie.name||movie.title)+'</h2><div class="fbr-series-state">'+icon(searching?(has(movie)?'check':'plus'):'clock')+esc(label)+'</div>';
            if (view) {
                if (view.last && view.last.progress.percent<90) text+='<div class="fbr-hub-progress"><i style="width:'+view.last.progress.percent+'%"></i></div>';
                if (view.pending) text+='<div class="fbr-series-badge">Сезон '+view.season+' · непроглянутих: '+view.pending+'</div>';
                else if (view.watched) text+='<div class="fbr-series-badge fbr-series-badge--done">'+(view.waiting?'Очікуємо нових серій':'Сезон '+view.season+' переглянуто')+'</div>';
                var badge=releaseMarkup(data.details);
                if (badge) text+='<div class="fbr-series-next">'+badge+'</div>';
                else if (view.upcoming) text+='<div class="fbr-series-next">'+icon('calendar')+'S'+view.upcoming.season+'E'+view.upcoming.episode+' · '+esc(view.upcoming.air_date.split('-').reverse().join('.'))+'</div>';
                else if (view.ended) text+='<div class="fbr-series-next">Серіал завершено</div>';
                var tail=view.episodes.slice(0,24);
                if(tail.length) text+='<div class="fbr-episode-strip" aria-label="Прогрес сезону '+view.season+'">'+tail.map(function(e){return '<i class="'+(e.progress.percent>=90?'is-done':e.progress.percent>0?'is-started':e.released?'is-released':'')+'" title="Серія '+e.episode+'"></i>';}).join('')+'</div>';
            }
            return text+'<div class="fbr-hub-card-action">'+(searching?'Керувати серіалом':'Відкрити серіал')+icon('arrow')+'</div>';
        }
        function filmCopy(movie,searching) {
            var saved=searching?savedMovie(movie):movie, state=saved && saved.libraryState, progress=road(movie,0,0);
            var text='<div class="fbr-hub-facts"><span>'+esc(str(movie.release_date).slice(0,4))+'</span>'+(movie.vote_average?'<span>'+icon('star')+'TMDB '+movie.vote_average.toFixed(1)+'</span>':'')+'</div><h2>'+esc(movie.title||movie.name)+'</h2>';
            text+='<div class="fbr-movie-state '+(state==='watched'?'is-watched':'is-wanted')+'">'+icon(state==='watched'?'check':state==='wanted'?'bookmark':'plus')+(state==='watched'?'Переглянуто':state==='wanted'?'Хочу подивитися':'Додати до медіатеки')+'</div>';
            if(movie.overview)text+='<p class="fbr-movie-description">'+esc(movie.overview)+'</p>';
            if(progress.percent>0 && progress.percent<80)text+='<div class="fbr-series-state">'+icon('clock')+'Продовжити · '+Math.floor(progress.time/60)+' хв</div><div class="fbr-hub-progress"><i style="width:'+progress.percent+'%"></i></div>';
            return text+'<div class="fbr-hub-card-action">'+(searching?'Вибрати групу':'Відкрити фільм')+icon('arrow')+'</div>';
        }
        function seriesCard(movie, searching) {
            return '<article class="selector fbr-series-card" role="button" data-hub-key="series:'+movie.id+'" data-action="series:'+movie.id+'">'+poster(movie)+'<div class="fbr-hub-card-copy">'+seriesCopy(movie,searching)+'</div></article>';
        }
        function seriesView() {
            var source=searchTitle?searchRows:rows, visible=source.filter(function(movie){
                if(searchTitle || mode==='all')return true;
                if(kind==='films')return movie.libraryState===mode;
                var data=dataCache.get(movie), s=data && data.state;
                return s && (mode==='continue'?s.last && s.last.progress.percent<90:mode==='new'?s.pending>0:!!s.upcoming || s.waiting);
            }), total=visible.length;
            if(!searchTitle){page=Math.min(page,Math.max(0,Math.ceil(total/PAGE_SIZE)-1));visible=visible.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);}
            return {visible:visible,total:total,status:message || (busy?'Оновлюємо дані · залишилося: '+remaining:searchTitle?'Знайдено: '+source.length:kind==='films' && mode!=='all'?total+' у групі · '+rows.length+' фільмів у медіатеці':rows.length+' у твоєму списку')};
        }
        function pagination(view, placement) {
            var searching=searchTitle.indexOf('Пошук:')===0, count=searching?searchTotal:Math.ceil(view.total/PAGE_SIZE), number=searching?searchPage:page+1;
            if(searchTitle && !searching || count<2)return '';
            function button(direction, label, enabled){
                var content=(direction==='prev'?'<span class="fbr-page-back">'+icon('arrow')+'</span>':'')+'<span>'+label+'</span>'+(direction==='next'?icon('arrow'):'');
                return enabled?control(direction+':'+placement,content,(searching?'search':'')+direction,'fbr-page-button'+(direction==='next'?' fbr-hub-primary':'')):'<div class="fbr-page-button is-disabled" aria-disabled="true">'+content+'</div>';
            }
            return button('prev','Попередня сторінка',number>1)+'<span class="fbr-hub-page"><strong>Сторінка '+number+' / '+count+'</strong><small>'+(searching?'Результати пошуку':(page*PAGE_SIZE+1)+'–'+Math.min((page+1)*PAGE_SIZE,view.total)+' із '+view.total+(kind==='films'?' фільмів':' серіалів'))+'</small></span>'+button('next','Наступна сторінка',number<count);
        }
        function series(view) {
            var films=kind==='films', text='<div class="fbr-hub-intro"><span class="fbr-hub-eyebrow">FABORN · ТВОЇ ІСТОРІЇ</span><h1>Моя медіатека</h1><p>'+(films?'Збережи наступний кіновечір. Переглянуте завжди поруч.':'Продовжуй перегляд і стеж за новими епізодами.')+'</p></div>'+sectionTabs()+'<div class="fbr-hub-toolbar">';
            text+=control('add',icon('plus')+(films?'Додати фільм':'Додати серіал'),'search','fbr-hub-primary');
            text+=control('import',icon('clock')+'Додати з історії','import');
            if(!films)text+=control('progress',icon('check')+'Переглянуте','progress');
            text+=control('refresh',icon('calendar')+'Оновити','refresh')+'</div>';
            if (searchTitle) text+='<div class="fbr-hub-toolbar">'+control('back',icon('arrow')+'До медіатеки','home')+'<strong>'+esc(searchTitle)+'</strong></div>';
            else text+='<div class="fbr-hub-toolbar fbr-hub-tabs">'+(films?[['all','Усі'],['wanted','Хочу подивитися'],['watched','Переглянуто']]:[['all','Усі'],['continue','Продовжити'],['new','Є непроглянуті'],['upcoming','Очікуються']]).map(function(pair){return control('filter:'+pair[0],pair[1],'filter:'+pair[0],mode===pair[0]?'is-selected':'');}).join('')+'</div>';
            text+='<div class="fbr-hub-status" role="status">'+esc(view.status)+'</div>';
            if(!view.visible.length && !busy) text+='<div class="fbr-hub-empty">'+icon(films?'film':'tv')+'<h2>'+(rows.length || searchTitle?'У цій групі поки порожньо':films?'Збережи свій перший фільм':'Додай свої серіали')+'</h2><p>'+(rows.length || searchTitle?'Зміни групу або пошуковий запит.':films?'Натисни «Додати фільм» або «+» у його картці. Після 80% перегляду фільм додасться автоматично.':'Натисни «Додати серіал» або «Стежити» в його картці. Уже розпочаті можна вибрати з історії.')+'</p></div>';
            text+='<div class="fbr-hub-pager" data-placement="top">'+pagination(view,'top')+'</div><div class="fbr-series-grid">'+view.visible.map(function(movie){return seriesCard(movie,!!searchTitle);}).join('')+'</div><div class="fbr-hub-pager" data-placement="bottom">'+pagination(view,'bottom')+'</div>';
            return text+footer();
        }
        function bindControls(container) {
            // Lampa dispatches non-bubbling hover events to the focused element.
            $(container).find('.selector').on('hover:focus',function(){selected=this.getAttribute('data-hub-key');scroll.update(this,true);}).on('hover:enter',function(){selected=this.getAttribute('data-hub-key');action(this.getAttribute('data-action'));});
        }
        function render() {
            if(!usable() || !body)return;
            root.clearTimeout(paintTimer);paintTimer=null;
            var hadFocus=own(), view=library?seriesView():null, key=view?[kind,mode,page,searchTitle,searchPage,!view.visible.length && !busy,view.visible.map(function(m){return m.id;}).join(',')].join('|'):'';
            if(view && key===layoutKey && body.querySelector('.fbr-series-grid')){
                var status=body.querySelector('.fbr-hub-status'), changed=false, navigation=false;
                if(status.textContent!==view.status)status.textContent=view.status;
                view.visible.forEach(function(movie){
                    var node=body.querySelector('[data-hub-key="series:'+movie.id+'"]'), copy=seriesCopy(movie,!!searchTitle);
                    if(node && node.fbrCopy!==copy){node.querySelector('.fbr-hub-card-copy').innerHTML=copy;node.fbrCopy=copy;changed=true;}
                });
                Array.prototype.forEach.call(body.querySelectorAll('.fbr-hub-pager'),function(node){
                    var markup=pagination(view,node.getAttribute('data-placement'));
                    if(node.fbrMarkup!==markup){$(node).empty();node.innerHTML=markup;node.fbrMarkup=markup;bindControls(node);navigation=true;}
                });
                if((changed || navigation) && L.Layer && L.Layer.update)L.Layer.update(html);
                if(navigation && hadFocus)focus();
                return;
            }
            layoutKey=key;$(body).empty();body.innerHTML=view?series(view):discovery();bindControls(body);
            if(view){
                view.visible.forEach(function(movie){var node=body.querySelector('[data-hub-key="series:'+movie.id+'"]');node.fbrCopy=seriesCopy(movie,!!searchTitle);});
                Array.prototype.forEach.call(body.querySelectorAll('.fbr-hub-pager'),function(node){node.fbrMarkup=pagination(view,node.getAttribute('data-placement'));});
            }
            $(body).find('.fbr-series-card').on('hover:long',function(){var id=+this.getAttribute('data-action').split(':')[1],movie=(searchTitle?searchRows:rows).filter(function(m){return m.id===id;})[0];if(movie)manage(movie);});
            if(L.Layer && L.Layer.update) L.Layer.update(html);
            if(hadFocus) focus();
        }
        function schedulePaint() { if(!paintTimer && active)paintTimer=root.setTimeout(function(){paintTimer=null;if(active)render();},120); }
        function choose(field) {
            var items=field==='mood'?MOODS.map(function(m){return {title:m.title,value:m.id};}):field==='minutes'?[90,120,180,0].map(function(v){return {title:v?'До '+v+' хвилин':'Без обмеження',value:v};}):[7,8,6,0].map(function(v){return {title:v?'TMDB від '+v:'Будь-яка оцінка',value:v};});
            items.forEach(function(item){item.selected=item.value===filters[field];});
            menuSelect(field==='mood'?'Який настрій?':field==='minutes'?'Скільки маєш часу?':'Мінімальна оцінка TMDB',items,function(item){if(!usable())return;filters[field]=item.value;clearPicks();self.start();},self.start);
        }
        function clearPicks() { resetTask();busy=false;picks=[];shown=[];message='';set('discovery_'+owner,filters);render(); }
        function pick(more) {
            var token=resetTask();if(!more)shown=[];
            busy=true;message='';render();
            recommendations(task,filters,shown,function(error,data){if(!usable() || token!==loadId)return;busy=false;picks=data;shown=shown.concat(data.map(function(m){return m.id;}));message=error || (!data.length?'Більше збігів немає. Зміни умови або почни нову добірку.':data.length<3?'Знайдено '+data.length+' фільми за твоїми умовами.':'');render();});
        }
        function loadList() {
            root.clearTimeout(reloadTimer);reloadTimer=null;
            var token=resetTask();message='';searchTitle='';rows=kind==='films'?movieList():list();progressDirty=false;loadedDay=today();
            if(kind==='films'){remaining=0;busy=false;render();return;}
            dataCache.retain(rows);
            page=Math.min(page,Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1));
            var work=mode==='all'?rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE):rows;
            remaining=work.length;busy=remaining>0;render();
            work.forEach(function(movie){dataCache.load(task,movie,function(){if(!usable() || token!==loadId)return;if(--remaining===0)busy=false;schedulePaint();});});
        }
        function search(query, number) {
            var token=resetTask();searchTitle='Пошук: '+query;searchPage=number||1;searchRows=[];busy=true;message='';render();
            request(task,'search/'+(kind==='films'?'movie':'tv'),{query:encodeURIComponent(query),langs:'uk-UA',page:searchPage,filter:{include_adult:'false'}},function(error,data){
                if(!usable() || token!==loadId)return;busy=false;message=error||'';searchTotal=Math.min(20,data && +data.total_pages||1);
                searchRows=(data && Array.isArray(data.results)?data.results:[]).filter(function(m){return m && !m.adult;}).map(function(m){return cleanMovie(m,kind!=='films');}).filter(Boolean);render();
            });
        }
        function manage(movie) {
            if(kind==='films')return movieMenu(movie,function(){if(usable()){if(!searchTitle)loadList();else render();self.start();}},true);
            var included=has(movie), items=[{title:'Відкрити картку серіалу',action:'open'},{title:'Позначити переглянуте',action:'watched'},{title:included?'Прибрати з медіатеки':'Стежити за серіалом',subtitle:included?'Історія й прогрес залишаться.':'Серіал з’явиться в медіатеці.',action:'follow'}];
            menuSelect(movie.name||movie.title,items,function(item){
                if(!usable())return;
                if(item.action==='open') return full(movie);
                if(item.action==='watched') return watchedMenu(movie,self.start);
                var result=follow(movie,!included);if(!result.ok)notify(result.reason);
                if(!searchTitle) { if(page && page*PAGE_SIZE>=list().length)page--;loadList(); } else render();
                self.start();
            },self.start);
        }
        function action(name) {
            if(!usable())return;
            if(library && name.indexOf('tab:')===0)return changeSection(name.split(':')[1]);
            if(name==='more' && busy)return;
            if(name==='mood' || name==='minutes' || name==='rating') return choose(name);
            if(name==='unseen'){filters.unseen=!filters.unseen;return clearPicks();}
            if(name==='pick' || name==='more')return pick(name==='more');
            if(name.indexOf('movie:')===0){var movie=picks.filter(function(m){return m.id===+name.split(':')[1];})[0];if(movie)full(movie);return;}
            if(name.indexOf('series:')===0){var tv=(searchTitle?searchRows:rows).filter(function(m){return m.id===+name.split(':')[1];})[0];if(tv){if(searchTitle)manage(tv);else full(tv);}return;}
            if(name==='search')return L.Input.edit({title:kind==='films'?'Назва фільму':'Назва серіалу',value:'',free:true,nosave:true,nomic:true},function(value){if(!usable())return;value=str(value).trim().slice(0,120);if(value)search(value,1);self.start();});
            if(name==='import'){resetTask();busy=false;message=kind==='films'?'Обери фільм і групу, до якої його додати.':'Обери серіал, який хочеш додати.';searchTitle=kind==='films'?'Фільми з історії':'Серіали з історії';searchRows=kind==='films'?importMovies():importCandidates();return render();}
            if(name==='progress')return progressTools(self.start);
            if(name==='home'){return loadList();}
            if(name==='refresh'){cache={};cacheOrder=[];dataCache.clear();return loadList();}
            if(name==='next' || name==='prev'){page=Math.max(0,page+(name==='next'?1:-1));selected='first-series';return loadList();}
            if(name==='searchnext' || name==='searchprev'){selected='first-series';return search(searchTitle.slice(7),searchPage+(name==='searchnext'?1:-1));}
            if(name.indexOf('filter:')===0){mode=name.split(':')[1];page=0;loadList();}
        }
        this.create=function(){
            created=true;html=doc.createElement('div');html.className='fbr-hub fbr-hub--'+kind;
            scroll=new L.Scroll({mask:true,over:true,step:250});body=doc.createElement('div');body.className='fbr-hub-body';scroll.append(body);html.appendChild(scroll.render(true));
            if(library)loadList();else render();
            self.activity.loader(false);
        };
        this.start=function(){
            if(!alive || !created)return;
            active=true;
            if(owner!==profile()){owner=profile();selected='';dataCache.clear();layoutKey='';sections={};picks=[];shown=[];page=0;mode='all';filters=normalizeFilters(get('discovery_'+owner,{}));if(library)loadList();else clearPicks();}
            else if(library && !searchTitle){
                var current=kind==='films'?movieList():list();
                if(progressDirty || loadedDay!==today() || current.map(function(m){return m.id+':'+(m.libraryState||'');}).join(',')!==rows.map(function(m){return m.id+':'+(m.libraryState||'');}).join(','))loadList();
                else render();
            }
            var navigator=root.Navigator || L.Navigator;
            L.Controller.add('content',{link:self,toggle:focus,update:function(){},left:function(){if(navigator.canmove('left'))navigator.move('left');else L.Controller.toggle('menu');},right:function(){navigator.move('right');},up:function(){vertical('up');},down:function(){vertical('down');},back:function(){if(searchTitle){loadList();self.start();}else L.Activity.backward();}});
            L.Controller.toggle('content');
        };
        this.pause=function(){active=false;root.clearTimeout(paintTimer);paintTimer=null;root.clearTimeout(reloadTimer);reloadTimer=null;};this.stop=this.pause;
        this.progressChanged=function(){
            dataCache.invalidate();progressDirty=true;
            root.clearTimeout(reloadTimer);reloadTimer=null;
            if(library && active && own() && menuIdle() && !searchTitle)reloadTimer=root.setTimeout(function(){reloadTimer=null;if(active && own() && menuIdle())loadList();},200);
        };
        this.libraryChanged=function(){if(kind==='films')self.progressChanged();};
        this.refresh=function(){dataCache.invalidate();progressDirty=true;if(active){if(library)loadList();else render();}};
        this.paint=function(){if(!active)return;if(library && !searchTitle && loadedDay!==today())loadList();else render();};
        this.render=function(js){return js?html:$(html);};
        this.destroy=function(){alive=false;self.pause();task.cancel();dataCache.clear();if(scroll)scroll.destroy();if(html)$(html).remove();pages=pages.filter(function(p){return p!==self;});};
        pages.push(self);
    }
    function styles() {
        var neutral=get('layout','panel')==='classic' || get('theme','on')==='off', ios=!neutral && get('theme','on')==='ios';
        var palette={blue:['#69adff','#487bff'],amber:['#ffd06a','#ffa43a'],mint:['#69e5c3','#39bdbd'],violet:['#c6a0ff','#9462ff'],aurora:['#4989ff','#ca46ff'],lagoon:['#00e8bf','#208aff']};
        var colors=neutral?['#ededed','#ededed']:palette[get('accent','blue')]||palette.blue, glass={solid:1,low:.8,standard:.62,high:.45,max:.32}[get('glass_transparency','standard')]||.62;
        return '.fbr-hub{height:100%;color:inherit}.fbr-hub>.scroll{height:100%}.fbr-hub-body{padding:1.6em 2em 3em}.fbr-hub svg{width:1.15em;height:1.15em;flex-shrink:0;vertical-align:middle}.fbr-hub-intro{margin-bottom:1.4em}.fbr-hub-eyebrow{font-size:.68em;letter-spacing:.2em;font-weight:600;color:'+colors[0]+'}.fbr-hub h1{font-size:2.2em;line-height:1.15;font-weight:600;margin:.3em 0}.fbr-hub-intro p{font-size:1em;opacity:.72;margin:0}.fbr-hub-toolbar{display:flex;align-items:center;flex-wrap:wrap;margin:0 -.3em .5em}.fbr-hub-control{display:flex;align-items:center;margin:.3em;padding:.8em 1em;border-radius:.8em;background:rgba(160,181,214,.13);font-size:.86em;line-height:1.15;cursor:pointer}.fbr-hub-control svg{margin-right:.55em}.fbr-hub-primary{background:linear-gradient(115deg,'+colors[0]+','+colors[1]+');color:#091526;font-weight:600}.fbr-hub .selector.focus{outline:.15em solid '+colors[0]+';outline-offset:.14em}.fbr-hub-pagination .fbr-hub-control{flex:1;justify-content:center}.fbr-hub-tabs .is-selected{box-shadow:inset 0 -.18em '+colors[0]+'}.fbr-hub-status{font-size:.82em;min-height:1.6em;margin:.8em 0;opacity:.72}.fbr-discovery-grid{display:flex;align-items:stretch;margin:0 -.55em}.fbr-discovery-card{width:calc(33.333% - 1.1em);margin:.25em .55em 1em;position:relative;overflow:hidden;border-radius:1em;background:'+(neutral?'rgba(120,130,150,.12)':ios?'rgba(29,43,66,'+glass+')':'#17243a')+';cursor:pointer;box-shadow:0 .6em 2em rgba(0,0,0,.15)}.fbr-discovery-card .fbr-hub-poster{height:11em;background:#111b2b}.fbr-hub-poster img{width:100%;height:100%;object-fit:cover;display:block}.fbr-discovery-card .fbr-hub-poster img{object-position:center}.fbr-hub-card-copy{padding:1em;min-width:0;flex:1}.fbr-hub-facts{display:flex;flex-wrap:wrap;align-items:center;font-size:.72em;color:'+colors[0]+'}.fbr-hub-facts span{display:flex;align-items:center;margin-right:1.1em}.fbr-hub-facts svg{margin-right:.35em}.fbr-hub h2{font-size:1.2em;line-height:1.25;margin:.45em 0;font-weight:600}.fbr-discovery-card p{font-size:.78em;line-height:1.45;opacity:.8;margin:.65em 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:4.35em}.fbr-hub-card-action{display:flex;justify-content:space-between;align-items:center;font-size:.72em;margin-top:.9em;color:'+colors[0]+'}.fbr-series-grid{display:flex;flex-wrap:wrap;margin:0 -.5em}.fbr-series-card{display:flex;align-items:stretch;width:calc(50% - 1em);box-sizing:border-box;margin:.5em;min-height:12.5em;border-radius:1em;overflow:hidden;background:'+(neutral?'rgba(120,130,150,.12)':ios?'rgba(29,43,66,'+glass+')':'#17243a')+';cursor:pointer}.fbr-series-card .fbr-hub-poster{width:8.3em;flex-shrink:0;align-self:stretch;background:#111b2b}.fbr-series-state{display:flex;align-items:center;font-size:.78em;line-height:1.4;opacity:.92}.fbr-series-state svg{margin-right:.5em}.fbr-series-badge{display:table;font-size:.7em;margin-top:.8em;padding:.45em .65em;background:rgba(81,166,255,.2);border-radius:.5em;color:#b9dfff}.fbr-series-badge--done{background:rgba(63,214,154,.12);color:#abecd1}.fbr-series-next{font-size:.72em;margin-top:.7em;opacity:.8}.fbr-series-next svg{margin-right:.45em}.fbr-hub-progress{height:.2em;background:rgba(180,196,220,.2);margin:.65em 0;border-radius:.2em;overflow:hidden}.fbr-hub-progress i{display:block;height:100%;background:'+colors[0]+'}.fbr-episode-strip{display:flex;margin-top:.8em}.fbr-episode-strip i{display:block;flex:1;height:.3em;background:rgba(150,168,190,.12);margin-right:.15em;border-radius:.2em}.fbr-episode-strip .is-released{background:rgba(150,168,190,.45)}.fbr-episode-strip .is-started{background:#69adff}.fbr-episode-strip .is-done{background:#69e5c3}.fbr-hub-note{font-size:.65em;opacity:.5;margin:1.5em 0;line-height:1.5}.fbr-hub-page{font-size:.8em;margin-left:1em;opacity:.7}.fbr-hub-empty{text-align:center;padding:3em 1em;background:rgba(145,172,207,.06);border-radius:1.2em}.fbr-hub-empty>svg{width:3em;height:3em;color:'+colors[0]+';margin-bottom:.8em}.fbr-hub-empty p{opacity:.65;font-size:.9em;max-width:35em;margin:.8em auto;line-height:1.5}.view--faborn-follow>svg{margin:0!important}.view--faborn-follow.fbr-follow--added:not(.focus){color:'+colors[0]+'}@media(max-width:700px){.fbr-hub-body{padding:1em}.fbr-discovery-grid{flex-wrap:wrap}.fbr-discovery-card,.fbr-series-card{width:calc(100% - 1em)}.fbr-discovery-card{display:flex}.fbr-discovery-card .fbr-hub-poster{width:9em;height:14em;flex-shrink:0}.fbr-series-card .fbr-hub-poster{width:7em}}'+
            '.fbr-hub-pager{display:flex;align-items:center;justify-content:space-between;margin:.9em 0 1.1em;padding:.65em;border-radius:1em;background:rgba(138,160,190,.1);border:1px solid rgba(158,185,211,.2)}.fbr-hub-pager:empty{display:none}.fbr-hub-pager .fbr-page-button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;flex:0 1 34%;min-height:3.3em;margin:0;padding:.85em 1em;border-radius:.75em;font-size:.9em;font-weight:600;line-height:1.2}.fbr-page-button svg{width:1.2em;height:1.2em;margin:0 0 0 .8em}.fbr-page-back{display:flex;margin-right:.8em;transform:rotate(180deg)}.fbr-page-back svg{margin:0}.fbr-page-button.is-disabled{opacity:.3}.fbr-hub-pager .fbr-hub-page{flex:1;text-align:center;margin:0 .7em;font-size:.88em;opacity:1}.fbr-hub-page strong{display:block;font-weight:600}.fbr-hub-page small{display:block;margin-top:.35em;opacity:.65;font-size:.78em}.fbr-hub-pager .selector.focus{outline-width:.2em;outline-offset:.16em;box-shadow:0 0 0 .3em rgba(0,0,0,.25)}@media(max-width:700px){.fbr-hub-pager{padding:.55em}.fbr-hub-pager .fbr-page-button{padding:.8em .6em;font-size:.8em}.fbr-page-button svg{margin-left:.3em}.fbr-page-back{margin-right:.3em}.fbr-hub-pager .fbr-hub-page{font-size:.78em;margin:0 .4em}}';
    }
    function apply() {
        if(!doc || !doc.head)return;
        var style=doc.getElementById('faborn-hub-style');if(!style){style=doc.createElement('style');style.id='faborn-hub-style';doc.head.appendChild(style);}style.textContent=styles()+
            '.fbr-full-release{margin:.5em 0 .8em}.fbr-release-badge{display:inline-flex;align-items:center;max-width:100%;padding:.55em .8em;border-radius:.75em;background:rgba(79,178,203,.16);color:#b2e8ee;font-size:.8em;line-height:1.3;box-sizing:border-box}.fbr-release-badge>svg{width:1.5em;height:1.5em;flex-shrink:0;margin-right:.65em}.fbr-release-badge strong{font-weight:600}.fbr-release-badge small{display:block;font-size:.8em;margin-top:.2em;opacity:.8}.fbr-release-badge--today,.fbr-release-badge--released{background:rgba(66,210,152,.17);color:#abefd1}.fbr-series-next .fbr-release-badge{font-size:1em}body:not(.faborn-theme) .fbr-release-badge{background:rgba(150,160,178,.18);color:inherit}';
        style.textContent+='.fbr-library-tabs{margin:.5em 0 1em;gap:.55em}.fbr-library-tabs .fbr-hub-control{font-size:1.08em;min-width:9em;justify-content:center;padding:.8em 1.2em;margin:0}.fbr-library-tabs .is-selected{background:rgba(113,179,225,.2);box-shadow:inset 0 -.18em currentColor;font-weight:600}.fbr-movie-state{display:inline-flex;align-items:center;font-size:.75em;line-height:1.3;padding:.45em .65em;border-radius:.55em;margin:.3em 0}.fbr-movie-state svg{margin-right:.45em}.fbr-movie-state.is-wanted{background:rgba(88,158,244,.18);color:#b9d9ff}.fbr-movie-state.is-watched{background:rgba(57,204,153,.16);color:#a7edcd}.fbr-movie-description{font-size:.74em;line-height:1.45;opacity:.76;margin:.5em 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}body:not(.faborn-theme) .fbr-library-tabs .is-selected{background:rgba(200,205,213,.18)}body:not(.faborn-theme) .fbr-movie-state{background:rgba(160,170,190,.16);color:inherit}';
        [['faborn_discover','Що подивитися','spark','discover','discover_tab'],['faborn_series','Моя медіатека','library','library','series_tab']].forEach(function(item){
            var button=doc.querySelector('[data-action="'+item[0]+'"]');
            if(!button && doc.querySelector('.menu__list') && L.Menu && L.Menu.addButton){var added=L.Menu.addButton(icon(item[2]),item[1],function(){open(item[3]);});button=added[0] || added;button.setAttribute('data-action',item[0]);}
            if(button)button.classList.toggle('hide',get(item[4],'on')!=='on');
        });
        paintButtons();
        paintReleaseCards();releaseCards.forEach(loadReleaseCard);pages.forEach(function(page){page.paint();});
        if(get('episode_notifications','on')!=='on'){
            if(releaseTask)releaseTask.cancel();releaseBusy=false;
            var saved=releaseState();Object.keys(saved).forEach(function(id){saved[id].pending=null;});set('series_releases_v1_'+profile(),saved);
        }
        scheduleReleases(1500);
    }
    function install() {
        if(installed)return true;
        if(!doc || !$ || !L.Component || !L.Component.add || !L.Controller || !L.Scroll)return false;
        installed=true;
        L.Component.add('faborn_discover',function(){return new HubPage('discover');});
        L.Component.add('faborn_library',function(object){var section=object && object.section || get('library_section_'+profile(),'series');return new HubPage(section==='films'?'films':'series');});
        // Keep the old component and storage key for saved activities and existing series.
        L.Component.add('faborn_series',function(){return new HubPage('series');});
        L.Listener.follow('full',attach);
        L.Listener.follow('app',function(event){if(event.type==='ready')apply();});
        var timelineOwner=profile();
        L.Listener.follow('state:changed',function(event){
            if(event.target==='timeline'){
                pages.forEach(function(page){page.progressChanged();});
                if(timelineOwner!==profile() || event.reason==='read'){timelineOwner=profile();paintButtons();}
            }
            if(event.target==='favorite')paintButtons();
        });
        if(doc.addEventListener)doc.addEventListener('visibilitychange',function(){if(!doc.hidden)scheduleReleases(1500);});
        if(L.Player && L.Player.listener){
            L.Player.listener.follow('start',startMoviePlayback);
            L.Player.listener.follow('destroy',function(){finishMoviePlayback();scheduleReleases(1500);});
            if(L.Player.opened && L.Player.opened() && L.Player.playdata)startMoviePlayback(L.Player.playdata());
        }
        if(L.PlayerVideo && L.PlayerVideo.listener)L.PlayerVideo.listener.follow('timeupdate',updateMoviePlayback);
        if(L.Timeline && L.Timeline.listener)L.Timeline.listener.follow('update',movieTimelineUpdated);
        apply();
        var tries=0;
        function menuReady(){if(doc.querySelector('.menu__list'))apply();else if(++tries<30)root.setTimeout(menuReady,400);}
        if(!doc.querySelector('.menu__list'))menuReady();
        return true;
    }
    return {install:install,apply:apply,full:attach,open:open,list:list,has:has,follow:follow,importCandidates:importCandidates,profile:profile,road:road,latestEpisode:latestEpisode,summary:summary,normalizeFilters:normalizeFilters,discoveryRequest:discoveryRequest,recommendations:recommendations,scope:scope,request:request,loadSeries:loadSeries,seriesCache:seriesCache,today:today,cleanMovie:cleanMovie,esc:esc,releaseInfo:releaseInfo,observeRelease:observeRelease,flushReleases:flushReleases,checkReleases:tickReleases,prepareWatched:prepareWatched,applyProgress:applyProgress,undoPlan:undoPlan,profileSources:profileSources,prepareTransfer:prepareTransfer,progressTools:progressTools,watchedMenu:watchedMenu,movieList:movieList,saveMovie:saveMovie,importMovies:importMovies,startMoviePlayback:startMoviePlayback,updateMoviePlayback:updateMoviePlayback,movieTimelineUpdated:movieTimelineUpdated,finishMoviePlayback:finishMoviePlayback};
}));
