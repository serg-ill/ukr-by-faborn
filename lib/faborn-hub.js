/* Faborn's personal menu pages. Uses Lampa's TMDB client and profile-aware timeline. ES5. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornHub = factory;
}(typeof window !== 'undefined' ? window : this, function (root, L, $) {
    'use strict';
    var doc = root.document, installed = false, pages = [], buttons = [], queue = [], running = 0, cache = {}, cacheOrder = [];
    var MAX_SERIES = 120, PAGE_SIZE = 6, TTL = 6 * 60 * 60 * 1000;
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
            notify((pending.length===1?'Вийшла нова серія: ':'Вийшли нові серії: ')+lines.join('; ')+(pending.length>3?' · та ще '+(pending.length-3):'')+'. Деталі — у «Моїх серіалах».');
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
        if (!movie || !integer(movie.id,1,999999999) || movie.source && ['tmdb','cub'].indexOf(movie.source) < 0 || tv && !isSeries(movie)) return null;
        var out = {id:Number(movie.id), media_type:tv ? 'tv' : 'movie', source:'tmdb'};
        ['name','title','original_name','original_title','overview','poster_path','backdrop_path','first_air_date','release_date'].forEach(function (key) {
            if (typeof movie[key] === 'string') out[key] = movie[key].slice(0, key === 'overview' ? 900 : 250);
        });
        if (!(out.title || out.name)) return null;
        if (tv && !out.original_name) out.original_name = out.original_title || out.name;
        if (isFinite(+movie.vote_average) && +movie.vote_average > 0 && +movie.vote_average <= 10) out.vote_average = +movie.vote_average;
        return out;
    }
    function list() {
        var saved = get('my_series_v1_'+profile(), []), seen = {};
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
    function summary(movie, details, season, day) {
        var result = {last:latestEpisode(movie,details), episodes:[], pending:0, watched:0, next:null, upcoming:null, season:season && +season.season_number || 0, ended:details && (details.status==='Ended' || details.status==='Canceled')};
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
    function loadSeries(task, movie, callback) {
        request(task,'tv/'+movie.id,{langs:'uk-UA'},function (error,details) {
            if (error || !details || Number(details.id)!==movie.id) return callback(error || 'TMDB повернув інший серіал.');
            observeRelease(movie,details,today());
            var seasons=(Array.isArray(details.seasons)?details.seasons:[]).filter(function (s) { return s && integer(s.season_number,1,100) && +s.episode_count>0; }).sort(function (a,b) { return a.season_number-b.season_number; });
            var latest=latestEpisode(movie,details), current=latest ? latest.season : seasons.length ? seasons[0].season_number : 1, attempts=0;
            function load(number) {
                request(task,'tv/'+movie.id+'/season/'+number,{langs:'uk-UA'},function (fail,season) {
                    if (fail || !season || +season.season_number!==number || !Array.isArray(season.episodes)) return callback(fail || 'Дані сезону недоступні.');
                    var state=summary(movie,details,season,today()), next=seasons.filter(function (s) { return s.season_number>number && date(s.air_date) && s.air_date<=today(); })[0];
                    if (!state.pending && state.watched && next && attempts++<2) return load(next.season_number);
                    callback(null,{details:details,season:season,state:state});
                });
            }
            load(current);
        });
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
    function paintButtons() {
        buttons=buttons.filter(function (record) { return doc.documentElement.contains(record.node); });
        buttons.forEach(function (record) {
            var added=has(record.movie), label=added?'У моїх серіалах':'Стежити за серіалом';
            record.node.innerHTML=icon(added?'check':'plus');
            record.node.classList.toggle('fbr-follow--added',added);
            ['title','aria-label','data-title','data-subtitle'].forEach(function (attr) { record.node.setAttribute(attr,label); });
            record.node.setAttribute('aria-pressed',added?'true':'false');
        });
    }
    function attach(event) {
        if (!event || event.type!=='complite' || !event.data || !event.object || !event.object.activity) return;
        var movie=cleanMovie(event.data.movie,true);if (!movie) return;
        var render=event.object.activity.render(), node=render && (render[0] || render), row=node && node.querySelector('.full-start-new__buttons,.full-start__buttons');
        attachRelease(movie,node,event.data.movie);
        if (!row || row.querySelector('.view--faborn-follow')) return;
        var button=doc.createElement('div');button.className='full-start__button selector view--faborn-follow';button.setAttribute('role','button');button.setAttribute('data-faborn-action','follow');
        $(button).on('hover:enter',function () {
            var enabled=L.Controller.enabled().name, who=profile();
            function back() { if (doc.documentElement.contains(button)) L.Controller.toggle(enabled); }
            if (!has(movie)) { var result=follow(movie,true);notify(result.ok?'Серіал додано до «Моїх серіалів»':result.reason);return; }
            menuSelect(movie.name || movie.title,[{title:'Відкрити «Мої серіали»',action:'open'},{title:'Прибрати з моїх серіалів',subtitle:'Історія й прогрес перегляду збережуться.',action:'remove'}],function (item) {
                if (who!==profile()) return back();
                if (item.action==='open') open('series');
                else { var result=follow(movie,false);if (!result.ok) notify(result.reason);back(); }
            },back);
        }).on('hover:focus',function () { if(event.link && event.link.items && event.link.items[0]) event.link.items[0].last=button; });
        row.appendChild(button);buttons.push({movie:movie,node:button});paintButtons();
    }
    function open(kind) { L.Activity.push({component:kind==='series'?'faborn_series':'faborn_discover',title:kind==='series'?'Мої серіали':'Що подивитися',page:1}); }
    function HubPage(kind) {
        var self=this, html, scroll, body, alive=true, active=false, created=false, selected='', owner=profile(), task=scope(), loadId=0;
        var filters=normalizeFilters(get('discovery_'+owner,{})), picks=[], shown=[], busy=false, message='', state={}, rows=[], page=0, mode='all', searchRows=[], searchTitle='', searchPage=1, searchTotal=1;
        function own() { return active && L.Controller.own && L.Controller.own(self); }
        function usable() { return alive && owner===profile(); }
        function resetTask() { task.cancel();task=scope();loadId++;return loadId; }
        function control(key,label,action,classes) { return '<div class="selector fbr-hub-control '+(classes||'')+'" role="button" data-hub-key="'+esc(key)+'" data-action="'+esc(action)+'">'+label+'</div>'; }
        function focus() {
            if (!html || !active) return;
            var last=body.querySelector('[data-hub-key="'+selected.replace(/[^a-zA-Z0-9:_-]/g,'')+'"]');
            L.Controller.collectionSet(html);L.Controller.collectionFocus(last || false,html);
        }
        function vertical(direction) {
            var navigator=root.Navigator || L.Navigator;
            if(navigator.canmove(direction))return navigator.move(direction);
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
            else if(direction==='up')L.Controller.toggle('head');
        }
        function footer() { return '<div class="fbr-hub-note">'+(kind==='series'?'Дати виходу — TMDB. Доступність озвучення перевіряється при відкритті джерел.':'Добірка за метаданими TMDB. Якість і озвучення перевіряються в картці фільму.')+'</div>'; }
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
        function seriesCard(movie, searching) {
            var data=state[movie.id], view=data && data.season ? summary(movie,data.details,data.season,today()) : null, label='Оновлюємо дані серіалу…';
            if (searching) label=has(movie)?'У моїх серіалах':'Додати до моїх серіалів';
            else if (data && data.error) label=data.error;
            else if (view && view.last) label=(view.last.progress.percent>=90?'Переглянуто ':'Продовжити ')+'S'+view.last.season+' · E'+view.last.episode;
            else if (view) label='Ще не розпочато';
            var text='<article class="selector fbr-series-card" role="button" data-hub-key="series:'+movie.id+'" data-action="series:'+movie.id+'">'+poster(movie)+'<div class="fbr-hub-card-copy"><div class="fbr-hub-facts"><span>'+esc(str(movie.first_air_date).slice(0,4))+'</span>'+(movie.vote_average?'<span>'+icon('star')+movie.vote_average.toFixed(1)+'</span>':'')+'</div><h2>'+esc(movie.name||movie.title)+'</h2><div class="fbr-series-state">'+icon(searching?(has(movie)?'check':'plus'):'clock')+esc(label)+'</div>';
            if (view) {
                if (view.last && view.last.progress.percent<90) text+='<div class="fbr-hub-progress"><i style="width:'+view.last.progress.percent+'%"></i></div>';
                if (view.pending) text+='<div class="fbr-series-badge">Сезон '+view.season+' · непроглянутих: '+view.pending+'</div>';
                else if (view.watched) text+='<div class="fbr-series-badge fbr-series-badge--done">Сезон '+view.season+' переглянуто</div>';
                var badge=releaseMarkup(data.details);
                if (badge) text+='<div class="fbr-series-next">'+badge+'</div>';
                else if (view.upcoming) text+='<div class="fbr-series-next">'+icon('calendar')+'S'+view.upcoming.season+'E'+view.upcoming.episode+' · '+esc(view.upcoming.air_date.split('-').reverse().join('.'))+'</div>';
                else if (view.ended) text+='<div class="fbr-series-next">Серіал завершено</div>';
                var tail=view.episodes.slice(0,24);
                if(tail.length) text+='<div class="fbr-episode-strip" aria-label="Прогрес сезону '+view.season+'">'+tail.map(function(e){return '<i class="'+(e.progress.percent>=90?'is-done':e.progress.percent>0?'is-started':e.released?'is-released':'')+'" title="Серія '+e.episode+'"></i>';}).join('')+'</div>';
            }
            return text+'<div class="fbr-hub-card-action">'+(searching?'Керувати серіалом':'Відкрити серіал')+icon('arrow')+'</div></div></article>';
        }
        function series() {
            var text='<div class="fbr-hub-intro"><span class="fbr-hub-eyebrow">FABORN · ТВОЇ ІСТОРІЇ</span><h1>Мої серіали</h1><p>Продовжуй перегляд і стеж за новими епізодами.</p></div><div class="fbr-hub-toolbar">';
            text+=control('add',icon('plus')+'Додати серіал','search','fbr-hub-primary');
            text+=control('import',icon('clock')+'Додати з історії','import');
            text+=control('refresh',icon('calendar')+'Оновити','refresh')+'</div>';
            if (searchTitle) text+='<div class="fbr-hub-toolbar">'+control('back',icon('arrow')+'До моїх серіалів','home')+'<strong>'+esc(searchTitle)+'</strong></div>';
            else text+='<div class="fbr-hub-toolbar fbr-hub-tabs">'+[['all','Усі'],['continue','Продовжити'],['new','Є непроглянуті'],['upcoming','Очікуються']].map(function(pair){return control('filter:'+pair[0],pair[1],'filter:'+pair[0],mode===pair[0]?'is-selected':'');}).join('')+'</div>';
            var source=searchTitle?searchRows:rows, visible=source.filter(function(movie){
                if(searchTitle || mode==='all') return true;
                var data=state[movie.id], s=data && data.season ? summary(movie,data.details,data.season,today()) : null;
                return s && (mode==='continue'?s.last && s.last.progress.percent<90:mode==='new'?s.pending>0:!!s.upcoming);
            });
            text+='<div class="fbr-hub-status" role="status">'+esc(message || (busy?'Оновлюємо дані…':searchTitle?'Знайдено: '+source.length:rows.length+' у твоєму списку'))+'</div>';
            if(!visible.length && !busy) text+='<div class="fbr-hub-empty">'+icon('tv')+'<h2>'+(rows.length || searchTitle?'Тут поки немає серіалів':'Твій центр серіалів починається тут')+'</h2><p>'+(rows.length || searchTitle?'Зміни фільтр або пошуковий запит.':'Натисни «Додати серіал» або «Стежити» в його картці. Уже розпочаті можна вибрати з історії.')+'</p></div>';
            var total=visible.length;
            if(!searchTitle)visible=visible.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
            text+='<div class="fbr-series-grid">'+visible.map(function(movie){return seriesCard(movie,!!searchTitle);}).join('')+'</div><div class="fbr-hub-toolbar">';
            if(searchTitle && searchTitle.indexOf('Пошук:')===0) {
                if(searchPage>1) text+=control('prev','Попередні','searchprev');
                if(searchPage<searchTotal) text+=control('next','Наступні','searchnext');
            } else if(!searchTitle) {
                if(page>0) text+=control('prev','Попередні','prev');
                if((page+1)*PAGE_SIZE<total) text+=control('next','Наступні','next');
                if(total>PAGE_SIZE) text+='<span class="fbr-hub-page">Сторінка '+(page+1)+' / '+Math.ceil(total/PAGE_SIZE)+'</span>';
            }
            return text+'</div>'+footer();
        }
        function render() {
            if(!usable() || !body) return;
            var hadFocus=own();$(body).empty();body.innerHTML=kind==='series'?series():discovery();
            // Lampa dispatches non-bubbling hover events to the focused element.
            $(body).find('.selector').on('hover:focus',function(){selected=this.getAttribute('data-hub-key');scroll.update(this,true);}).on('hover:enter',function(){selected=this.getAttribute('data-hub-key');action(this.getAttribute('data-action'));});
            $(body).find('.fbr-series-card').on('hover:long',function(){var id=+this.getAttribute('data-action').split(':')[1],movie=(searchTitle?searchRows:rows).filter(function(m){return m.id===id;})[0];if(movie)manage(movie);});
            if(L.Layer && L.Layer.update) L.Layer.update(html);
            if(hadFocus) focus();
        }
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
            var token=resetTask();message='';searchTitle='';rows=list();
            var work=mode==='all'?rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE):rows;
            busy=work.length>0;render();
            var remaining=work.length;
            work.forEach(function(movie){loadSeries(task,movie,function(error,data){if(!usable() || token!==loadId)return;state[movie.id]=error?{error:error}:data;if(--remaining===0)busy=false;render();});});
        }
        function search(query, number) {
            var token=resetTask();searchTitle='Пошук: '+query;searchPage=number||1;searchRows=[];busy=true;message='';render();
            request(task,'search/tv',{query:encodeURIComponent(query),langs:'uk-UA',page:searchPage,filter:{include_adult:'false'}},function(error,data){
                if(!usable() || token!==loadId)return;busy=false;message=error||'';searchTotal=Math.min(20,data && +data.total_pages||1);
                searchRows=(data && Array.isArray(data.results)?data.results:[]).filter(function(m){return !m.adult;}).map(function(m){return cleanMovie(m,true);}).filter(Boolean);render();
            });
        }
        function manage(movie) {
            var included=has(movie), items=[{title:'Відкрити картку серіалу',action:'open'},{title:included?'Прибрати з моїх серіалів':'Стежити за серіалом',subtitle:included?'Історія й прогрес залишаться.':'Серіал з’явиться в окремій вкладці меню.',action:'follow'}];
            menuSelect(movie.name||movie.title,items,function(item){
                if(!usable())return;
                if(item.action==='open') return full(movie);
                var result=follow(movie,!included);if(!result.ok)notify(result.reason);
                if(!searchTitle) { if(page && page*PAGE_SIZE>=list().length)page--;loadList(); } else render();
                self.start();
            },self.start);
        }
        function action(name) {
            if(!usable())return;
            if(name==='more' && busy)return;
            if(name==='mood' || name==='minutes' || name==='rating') return choose(name);
            if(name==='unseen'){filters.unseen=!filters.unseen;return clearPicks();}
            if(name==='pick' || name==='more')return pick(name==='more');
            if(name.indexOf('movie:')===0){var movie=picks.filter(function(m){return m.id===+name.split(':')[1];})[0];if(movie)full(movie);return;}
            if(name.indexOf('series:')===0){var tv=(searchTitle?searchRows:rows).filter(function(m){return m.id===+name.split(':')[1];})[0];if(tv){if(searchTitle)manage(tv);else full(tv);}return;}
            if(name==='search')return L.Input.edit({title:'Назва серіалу',value:'',free:true,nosave:true,nomic:true},function(value){if(!usable())return;value=str(value).trim().slice(0,120);if(value)search(value,1);self.start();});
            if(name==='import'){resetTask();busy=false;message='Обери серіал, який хочеш додати.';searchTitle='Серіали з історії';searchRows=importCandidates();return render();}
            if(name==='home'){return loadList();}
            if(name==='refresh'){cache={};cacheOrder=[];return loadList();}
            if(name==='next' || name==='prev'){page=Math.max(0,page+(name==='next'?1:-1));selected='add';return loadList();}
            if(name==='searchnext' || name==='searchprev')return search(searchTitle.slice(7),searchPage+(name==='searchnext'?1:-1));
            if(name.indexOf('filter:')===0){mode=name.split(':')[1];page=0;loadList();}
        }
        this.create=function(){
            created=true;html=doc.createElement('div');html.className='fbr-hub fbr-hub--'+kind;
            scroll=new L.Scroll({mask:true,over:true,step:250});body=doc.createElement('div');body.className='fbr-hub-body';scroll.append(body);html.appendChild(scroll.render(true));
            if(kind==='series')loadList();else render();
            self.activity.loader(false);
        };
        this.start=function(){
            if(!alive || !created)return;
            active=true;
            if(owner!==profile()){owner=profile();selected='';state={};picks=[];shown=[];page=0;mode='all';filters=normalizeFilters(get('discovery_'+owner,{}));if(kind==='series')loadList();else clearPicks();}
            else if(kind==='series' && !searchTitle){
                var current=list();
                if(current.map(function(m){return m.id;}).join(',')!==rows.map(function(m){return m.id;}).join(','))loadList();
                else render();
            }
            var navigator=root.Navigator || L.Navigator;
            L.Controller.add('content',{link:self,toggle:focus,update:function(){},left:function(){if(navigator.canmove('left'))navigator.move('left');else L.Controller.toggle('menu');},right:function(){navigator.move('right');},up:function(){vertical('up');},down:function(){vertical('down');},back:function(){if(searchTitle){loadList();self.start();}else L.Activity.backward();}});
            L.Controller.toggle('content');
        };
        this.pause=function(){active=false;};this.stop=this.pause;
        this.refresh=function(){if(kind==='series')loadList();else render();};
        this.paint=render;
        this.render=function(js){return js?html:$(html);};
        this.destroy=function(){alive=false;active=false;task.cancel();if(scroll)scroll.destroy();if(html)$(html).remove();pages=pages.filter(function(p){return p!==self;});};
        pages.push(self);
    }
    function styles() {
        var neutral=get('layout','panel')==='classic' || get('theme','on')==='off', ios=!neutral && get('theme','on')==='ios';
        var palette={blue:['#69adff','#487bff'],amber:['#ffd06a','#ffa43a'],mint:['#69e5c3','#39bdbd'],violet:['#c6a0ff','#9462ff'],aurora:['#4989ff','#ca46ff'],lagoon:['#00e8bf','#208aff']};
        var colors=neutral?['#ededed','#ededed']:palette[get('accent','blue')]||palette.blue, glass={solid:1,low:.8,standard:.62,high:.45,max:.32}[get('glass_transparency','standard')]||.62;
        return '.fbr-hub{height:100%;color:inherit}.fbr-hub>.scroll{height:100%}.fbr-hub-body{padding:1.6em 2em 3em}.fbr-hub svg{width:1.15em;height:1.15em;flex-shrink:0;vertical-align:middle}.fbr-hub-intro{margin-bottom:1.4em}.fbr-hub-eyebrow{font-size:.68em;letter-spacing:.2em;font-weight:600;color:'+colors[0]+'}.fbr-hub h1{font-size:2.2em;line-height:1.15;font-weight:600;margin:.3em 0}.fbr-hub-intro p{font-size:1em;opacity:.72;margin:0}.fbr-hub-toolbar{display:flex;align-items:center;flex-wrap:wrap;margin:0 -.3em .5em}.fbr-hub-control{display:flex;align-items:center;margin:.3em;padding:.8em 1em;border-radius:.8em;background:rgba(160,181,214,.13);font-size:.86em;line-height:1.15;cursor:pointer}.fbr-hub-control svg{margin-right:.55em}.fbr-hub-primary{background:linear-gradient(115deg,'+colors[0]+','+colors[1]+');color:#091526;font-weight:600}.fbr-hub .selector.focus{outline:.15em solid '+colors[0]+';outline-offset:.14em}.fbr-hub-pagination .fbr-hub-control{flex:1;justify-content:center}.fbr-hub-tabs .is-selected{box-shadow:inset 0 -.18em '+colors[0]+'}.fbr-hub-status{font-size:.82em;min-height:1.6em;margin:.8em 0;opacity:.72}.fbr-discovery-grid{display:flex;align-items:stretch;margin:0 -.55em}.fbr-discovery-card{width:calc(33.333% - 1.1em);margin:.25em .55em 1em;position:relative;overflow:hidden;border-radius:1em;background:'+(neutral?'rgba(120,130,150,.12)':ios?'rgba(29,43,66,'+glass+')':'#17243a')+';cursor:pointer;box-shadow:0 .6em 2em rgba(0,0,0,.15)}.fbr-discovery-card .fbr-hub-poster{height:11em;background:#111b2b}.fbr-hub-poster img{width:100%;height:100%;object-fit:cover;display:block}.fbr-discovery-card .fbr-hub-poster img{object-position:center}.fbr-hub-card-copy{padding:1em;min-width:0;flex:1}.fbr-hub-facts{display:flex;flex-wrap:wrap;align-items:center;font-size:.72em;color:'+colors[0]+'}.fbr-hub-facts span{display:flex;align-items:center;margin-right:1.1em}.fbr-hub-facts svg{margin-right:.35em}.fbr-hub h2{font-size:1.2em;line-height:1.25;margin:.45em 0;font-weight:600}.fbr-discovery-card p{font-size:.78em;line-height:1.45;opacity:.8;margin:.65em 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:4.35em}.fbr-hub-card-action{display:flex;justify-content:space-between;align-items:center;font-size:.72em;margin-top:.9em;color:'+colors[0]+'}.fbr-series-grid{display:flex;flex-wrap:wrap;margin:0 -.5em}.fbr-series-card{display:flex;align-items:stretch;width:calc(50% - 1em);box-sizing:border-box;margin:.5em;min-height:12.5em;border-radius:1em;overflow:hidden;background:'+(neutral?'rgba(120,130,150,.12)':ios?'rgba(29,43,66,'+glass+')':'#17243a')+';cursor:pointer}.fbr-series-card .fbr-hub-poster{width:8.3em;flex-shrink:0;align-self:stretch;background:#111b2b}.fbr-series-state{display:flex;align-items:center;font-size:.78em;line-height:1.4;opacity:.92}.fbr-series-state svg{margin-right:.5em}.fbr-series-badge{display:table;font-size:.7em;margin-top:.8em;padding:.45em .65em;background:rgba(81,166,255,.2);border-radius:.5em;color:#b9dfff}.fbr-series-badge--done{background:rgba(63,214,154,.12);color:#abecd1}.fbr-series-next{font-size:.72em;margin-top:.7em;opacity:.8}.fbr-series-next svg{margin-right:.45em}.fbr-hub-progress{height:.2em;background:rgba(180,196,220,.2);margin:.65em 0;border-radius:.2em;overflow:hidden}.fbr-hub-progress i{display:block;height:100%;background:'+colors[0]+'}.fbr-episode-strip{display:flex;margin-top:.8em}.fbr-episode-strip i{display:block;flex:1;height:.3em;background:rgba(150,168,190,.12);margin-right:.15em;border-radius:.2em}.fbr-episode-strip .is-released{background:rgba(150,168,190,.45)}.fbr-episode-strip .is-started{background:#69adff}.fbr-episode-strip .is-done{background:#69e5c3}.fbr-hub-note{font-size:.65em;opacity:.5;margin:1.5em 0;line-height:1.5}.fbr-hub-page{font-size:.8em;margin-left:1em;opacity:.7}.fbr-hub-empty{text-align:center;padding:3em 1em;background:rgba(145,172,207,.06);border-radius:1.2em}.fbr-hub-empty>svg{width:3em;height:3em;color:'+colors[0]+';margin-bottom:.8em}.fbr-hub-empty p{opacity:.65;font-size:.9em;max-width:35em;margin:.8em auto;line-height:1.5}.view--faborn-follow>svg{margin:0!important}.view--faborn-follow.fbr-follow--added:not(.focus){color:'+colors[0]+'}@media(max-width:700px){.fbr-hub-body{padding:1em}.fbr-discovery-grid{flex-wrap:wrap}.fbr-discovery-card,.fbr-series-card{width:calc(100% - 1em)}.fbr-discovery-card{display:flex}.fbr-discovery-card .fbr-hub-poster{width:9em;height:14em;flex-shrink:0}.fbr-series-card .fbr-hub-poster{width:7em}}';
    }
    function apply() {
        if(!doc || !doc.head)return;
        var style=doc.getElementById('faborn-hub-style');if(!style){style=doc.createElement('style');style.id='faborn-hub-style';doc.head.appendChild(style);}style.textContent=styles()+
            '.fbr-full-release{margin:.5em 0 .8em}.fbr-release-badge{display:inline-flex;align-items:center;max-width:100%;padding:.55em .8em;border-radius:.75em;background:rgba(79,178,203,.16);color:#b2e8ee;font-size:.8em;line-height:1.3;box-sizing:border-box}.fbr-release-badge>svg{width:1.5em;height:1.5em;flex-shrink:0;margin-right:.65em}.fbr-release-badge strong{font-weight:600}.fbr-release-badge small{display:block;font-size:.8em;margin-top:.2em;opacity:.8}.fbr-release-badge--today,.fbr-release-badge--released{background:rgba(66,210,152,.17);color:#abefd1}.fbr-series-next .fbr-release-badge{font-size:1em}body:not(.faborn-theme) .fbr-release-badge{background:rgba(150,160,178,.18);color:inherit}';
        [['faborn_discover','Що подивитися','spark','discover','discover_tab'],['faborn_series','Мої серіали','tv','series','series_tab']].forEach(function(item){
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
        L.Component.add('faborn_series',function(){return new HubPage('series');});
        L.Listener.follow('full',attach);
        L.Listener.follow('app',function(event){if(event.type==='ready')apply();});
        L.Listener.follow('state:changed',function(event){if(event.target==='timeline' || event.target==='favorite')paintButtons();});
        if(doc.addEventListener)doc.addEventListener('visibilitychange',function(){if(!doc.hidden)scheduleReleases(1500);});
        if(L.Player && L.Player.listener)L.Player.listener.follow('destroy',function(){scheduleReleases(1500);});
        apply();
        var tries=0;
        function menuReady(){if(doc.querySelector('.menu__list'))apply();else if(++tries<30)root.setTimeout(menuReady,400);}
        if(!doc.querySelector('.menu__list'))menuReady();
        return true;
    }
    return {install:install,apply:apply,full:attach,open:open,list:list,has:has,follow:follow,importCandidates:importCandidates,profile:profile,road:road,latestEpisode:latestEpisode,summary:summary,normalizeFilters:normalizeFilters,discoveryRequest:discoveryRequest,recommendations:recommendations,scope:scope,request:request,loadSeries:loadSeries,today:today,cleanMovie:cleanMovie,esc:esc,releaseInfo:releaseInfo,observeRelease:observeRelease,flushReleases:flushReleases,checkReleases:tickReleases};
}));
