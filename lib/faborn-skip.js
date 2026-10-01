/* Optional, timestamp-driven intro/credits controls. ES5, no video proxy. */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports=factory;
    else root.FabornSkip=factory;
}(typeof window !== 'undefined' ? window : this,function (root,L,options) {
    'use strict';
    options=options || {};
    var doc=root.document,data=null,markers=[],dismissed={},active=null,button=null,timer=null,request=null;
    var generation=0,current=0,duration=0,lastUpdate=0,lastTick=0,remaining=7000,paused=false,loading=false,requested=false;
    var blockedKey=null,blockedUntil=0,diagnostic='Вимкнено',installed=false;
    function now() { return options.now ? options.now() : Date.now(); }
    function enabled(kind) { return L.Storage.get('faborn_ukr_skip_'+kind,'off') === 'on'; }
    function controller() { var c=L.Controller.enabled();return c && c.name; }
    function choosing() { return Boolean(data && data.timeline && data.timeline.waiting_for_user || L.Select && L.Select.opened && L.Select.opened()); }
    function same(run) { return run===generation && data && L.Player.playdata()===data; }
    function usable() { return data && !data.tv && !data.youtube && data.card && data.faborn_title && (data.faborn_url || data.faborn_torrent && data.timeline && data.timeline.faborn_identity); }
    function hide(restore) {
        active=null;root.clearInterval(timer);timer=null;
        if(button && button.parentNode) button.parentNode.removeChild(button);button=null;
        if(restore && controller()==='faborn_skip') L.Controller.toggle('player');
    }
    function stop() {
        generation++;if(request && request.abort) request.abort();request=null;
        hide(false);data=null;markers=[];requested=false;
    }
    function cancel() { if(active) dismissed[active.key]=true;hide(true); }
    function number(v) { return typeof v==='number' && isFinite(v) ? v : null; }
    function normalize(raw,seconds) {
        var result=[];
        if(!raw || !(seconds>0)) return result;
        if(raw.duration_ms && Math.abs(raw.duration_ms/1000-seconds)>Math.max(2,seconds*.01)) return result;
        ['intro','credits'].forEach(function(kind) {
            var list=raw[kind] || (kind==='credits' ? raw.outro : null);
            if(!Array.isArray(list)) list=list ? [list] : [];
            list.forEach(function(item) {
                var start=number(item.start_sec),end=number(item.end_sec);
                if(start===null && number(item.start_ms)!==null) start=item.start_ms/1000;
                if(end===null && number(item.end_ms)!==null) end=item.end_ms/1000;
                if(start===null || end===null || start<0 || end<=start+1 || end>seconds+2 || start>=seconds) return;
                end=Math.min(end,seconds);
                // An explicitly reported post-credits scene is never skipped with the outro.
                var post=raw.post_credits,postStart=post && number(post.start_sec);
                if(post && postStart===null && number(post.start_ms)!==null)postStart=post.start_ms/1000;
                if(kind==='credits' && post && postStart!==null && postStart>=start && postStart<end) end=postStart;
                if(end<=start+1) return;
                result.push({kind:kind,start:start,end:end,terminal:kind==='credits' && end>=seconds-.5,key:kind+':'+start+':'+end});
            });
        });
        return result.sort(function(a,b){return a.start-b.start;});
    }
    function store(key,value) {
        var cache=L.Storage.get('faborn_ukr_marker_cache',[]);
        if(!Array.isArray(cache)) cache=[];
        cache=cache.filter(function(row){return row && row.key!==key && now()-row.at<86400000;}).slice(-79);
        cache.push({key:key,at:now(),value:value});L.Storage.set('faborn_ukr_marker_cache',cache);
    }
    function identity() {
        var movie=data.card,tv=Boolean(movie.original_name || movie.first_air_date || movie.media_type==='tv' || movie.number_of_seasons);
        if(tv && !(data.season>=0 && data.episode>0)) return null;
        return {movie:movie,tv:tv,season:+data.season,episode:+data.episode};
    }
    function lookup() {
        if(requested || !usable() || !(duration>0)) return;
        requested=true;var run=generation,id=identity();
        if(!id) { diagnostic='Немає точного номера серії';return; }
        if(data.faborn_segments) { markers=normalize(data.faborn_segments,duration);diagnostic=markers.length ? 'Мітки джерела: '+markers.length : 'Мітки не відповідають відео';return; }
        // Let another segment plugin keep ownership of its native Lampa controls.
        if(data.segments) { diagnostic='Мітками керує інше розширення Lampa';return; }
        function fetch(imdb) {
            if(!same(run)) return;
            if(!/^tt\d+$/.test(imdb || '')) { diagnostic='IMDb ID недоступний';return; }
            var key=imdb+(id.tv ? ':'+id.season+':'+id.episode : ':movie');
            var cache=L.Storage.get('faborn_ukr_marker_cache',[]),hit=Array.isArray(cache) && cache.filter(function(row){return row.key===key && now()-row.at<86400000;})[0];
            function accept(raw) {
                if(!same(run)) return;
                if(!raw || raw.imdb_id!==imdb || Boolean(raw.is_movie)!==!id.tv || id.tv && (+raw.season!==id.season || +raw.episode!==id.episode)) { diagnostic='Мітки іншого відео відхилено';return; }
                markers=normalize(raw,duration);diagnostic=markers.length ? 'IntroDB · міток: '+markers.length : 'Для цього відео немає відповідних міток';
            }
            if(hit) return accept(hit.value);
            diagnostic='Завантаження міток IntroDB';
            var url='https://api.introdb.app/segments?imdb_id='+imdb+(id.tv ? '&season='+id.season+'&episode='+id.episode : '&is_movie=true');
            request=options.request(url,function(error,body) {
                if(!same(run)) return;request=null;
                if(error) { diagnostic='IntroDB недоступний · пропуск вимкнено для цього відео';return; }
                try {
                    var raw=JSON.parse(body);accept(raw);
                    if(raw.imdb_id===imdb) store(key,{imdb_id:raw.imdb_id,is_movie:raw.is_movie,season:raw.season,episode:raw.episode,intro:raw.intro,outro:raw.outro,post_credits:raw.post_credits});
                } catch(ignore) { diagnostic='Некоректна відповідь IntroDB'; }
            });
        }
        var imdb=id.movie.imdb_id || id.movie.external_ids && id.movie.external_ids.imdb_id;
        if(imdb) return fetch(imdb);
        if(!/^\d+$/.test(String(id.movie.id)) || id.movie.source && id.movie.source!=='tmdb' || !L.Api || !L.Api.sources || !L.Api.sources.tmdb) { diagnostic='IMDb ID недоступний';return; }
        diagnostic='Пошук IMDb ID';
        try { L.Api.sources.tmdb.get((id.tv ? 'tv/' : 'movie/')+id.movie.id+'/external_ids',{},function(value){fetch(value && value.imdb_id);},function(){if(same(run)) diagnostic='IMDb ID недоступний';}); }
        catch(ignore) { diagnostic='IMDb ID недоступний'; }
    }
    function canNext() { return Boolean(L.PlayerPlaylist && L.PlayerPlaylist.canNext && L.PlayerPlaylist.canNext()); }
    function execute() {
        if(!active || !data || L.Player.playdata()!==data || current<active.start || current>=active.end) return cancel();
        var marker=active;dismissed[marker.key]=true;hide(true);
        if(marker.terminal && canNext()) {
            if(options.complete) options.complete(data);
            L.PlayerPlaylist.next();
        } else {
            if(marker.terminal && options.complete) options.complete(data);
            L.PlayerVideo.to(marker.end);
        }
    }
    function paint() {
        if(!button) return;
        button.querySelector('.faborn-skip__count').textContent=String(Math.max(1,Math.ceil(remaining/1000)));
        button.querySelector('.faborn-skip__bar').style.width=(remaining/70)+'%';
    }
    function ticking() {
        var stamp=now(),delta=Math.min(500,Math.max(0,stamp-lastTick));lastTick=stamp;
        if(!active) return;
        if(!enabled(active.kind) || !data || L.Player.playdata()!==data || current<active.start || current>=active.end) return hide(true);
        if(choosing() || controller()!=='faborn_skip' && controller()!=='player') { hide(true);return; }
        var video=L.PlayerVideo.video && L.PlayerVideo.video();
        if(!paused && !loading && !doc.hidden && !(video && video.paused) && stamp-lastUpdate<1500) remaining-=delta;
        paint();if(remaining<=0) execute();
    }
    function show(marker) {
        active=marker;remaining=7000;lastTick=now();
        button=doc.createElement('div');button.className='faborn-skip';button.setAttribute('role','button');button.setAttribute('tabindex','0');
        button.innerHTML='<div class="faborn-skip__row"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 10 7-10 7V5Zm13 0v14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><strong class="faborn-skip__title"></strong><b class="faborn-skip__count">7</b></div><small>OK — зараз · Назад — скасувати</small><i class="faborn-skip__bar"></i>';
        button.querySelector('.faborn-skip__title').textContent=marker.kind==='intro' ? 'Пропустити вступ' : marker.terminal && canNext() ? 'Наступна серія' : 'Пропустити титри';
        button.onclick=execute;doc.body.appendChild(button);L.Controller.toggle('faborn_skip');
        timer=root.setInterval(ticking,200);
    }
    function update(event) {
        if(!data || L.Player.playdata()!==data || !event) return;
        var moved=+event.current!==current;
        current=+event.current;duration=+event.duration;if(moved || !lastUpdate)lastUpdate=now();paused=false;
        if(!isFinite(current) || !(duration>0)) return;
        lookup();
        if(active) { if(current<active.start || current>=active.end) hide(true);return; }
        if(doc.hidden || choosing() || controller()!=='player') return;
        var marker=markers.filter(function(m){return enabled(m.kind) && !dismissed[m.key] && current>=m.start && current<m.end;})[0];
        if(marker) show(marker);
    }
    function start(value) {
        hide(true);stop();data=value;dismissed={};current=0;duration=0;lastUpdate=0;paused=false;loading=false;
        diagnostic=enabled('intro') || enabled('credits') ? 'Очікування міток конкретного відео' : 'Вимкнено';
        if(!enabled('intro') && !enabled('credits')) data=null;
    }
    function consume(event) { event.preventDefault();event.stopImmediatePropagation(); }
    function keydown(event) {
        var code=event.keyCode || event.which;
        if(blockedKey===code && now()<blockedUntil) { blockedUntil=now()+2000;consume(event);return; }
        if(!active || controller()!=='faborn_skip') return;
        if([8,27,461,10009,88,13,29443,117,65385].indexOf(code)<0) return;
        blockedKey=code;blockedUntil=now()+2000;consume(event);
        if([13,29443,117,65385].indexOf(code)>=0) execute();else cancel();
    }
    function keyup(event) { if(blockedKey===(event.keyCode || event.which)) {blockedKey=null;consume(event);} }
    function install() {
        if(installed) return;installed=true;
        var style=doc.createElement('style');
        style.textContent='.faborn-skip{position:fixed;right:4vw;bottom:9vh;z-index:1001;min-width:16em;padding:1em 1.15em 1.1em;border-radius:.9em;background:rgba(16,25,40,.96);color:#fff;box-shadow:0 .3em 2em #0008,inset 0 0 0 .1em rgba(255,255,255,.8);overflow:hidden;font-size:1.2em}.faborn-skip__row{display:flex;align-items:center;gap:.7em}.faborn-skip svg{width:1.35em;height:1.35em}.faborn-skip__title{flex:1}.faborn-skip__count{display:inline-flex;align-items:center;justify-content:center;width:1.9em;height:1.9em;border-radius:50%;background:var(--faborn-accent,#5de1c5);color:#071928}.faborn-skip small{display:block;margin-top:.7em;opacity:.7;font-size:.7em}.faborn-skip__bar{position:absolute;left:0;bottom:0;height:.2em;width:100%;background:var(--faborn-accent,#5de1c5)}';
        doc.head.appendChild(style);
        L.Controller.add('faborn_skip',{toggle:function(){},enter:execute,back:cancel,up:function(){cancel();if(L.PlayerPanel)L.PlayerPanel.toggle();},down:function(){cancel();if(L.PlayerPanel)L.PlayerPanel.toggle();},left:cancel,right:cancel});
        doc.addEventListener('keydown',keydown,true);doc.addEventListener('keyup',keyup,true);
        L.Player.listener.follow('start',start);L.Player.listener.follow('destroy',stop);
        L.PlayerVideo.listener.follow('timeupdate',update);
        L.PlayerVideo.listener.follow('pause',function(){paused=true;});
        L.PlayerVideo.listener.follow('ended',function(){hide(true);});
        L.Player.listener.follow('ready',function(){
            var run=generation,video=L.PlayerVideo.video && L.PlayerVideo.video();
            if(video && video.addEventListener) {
                video.addEventListener('waiting',function(){if(same(run))loading=true;});
                video.addEventListener('playing',function(){if(same(run)){loading=false;paused=false;}});
            }
        });
        if(L.PlayerPanel && L.PlayerPanel.listener) L.PlayerPanel.listener.follow('quality',function(){start(L.Player.playdata());});
        var existing=L.Player.playdata();if(existing)start(existing);
    }
    return {install:install,start:start,stop:stop,status:function(){return diagnostic;},normalize:normalize};
}));
