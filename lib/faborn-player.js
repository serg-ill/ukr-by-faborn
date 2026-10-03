/* Faborn Player beta: an opt-in, direct Samsung AVPlay client. ES5. */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports=factory;
    else root.FabornPlayer=factory;
}(typeof window !== 'undefined' ? window : this,function (root,L) {
    'use strict';
    var doc=root.document, av=root.webapis && root.webapis.avplay, view=null, spec=null, run=0, changing=false;
    var current=0,duration=0,paused=false,ready=false,ended=false,started=false,seeking=false,phase='';
    var startTimer=null,pollTimer=null,hideTimer=null,seekTimer=null,seekTimeout=null,subtitleTimer=null,request=null;
    var resume=0,resumePaused=false,startFloor=0,seekTarget=null,visible=true,menu=null,focus=0,mirror=0;
    var nodes={},buttons=[],tracks=[],cues=[],subtitleChoice='off',subtitleSerial=0,oldController='content',oldSaver,addedBody=false;
    var ownedKeys={},installed=false,closedCallback=null,closing=false;
    var icons={play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',back:'<path d="m10 5-7 7 7 7M3 12h18"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
        rewind:'<path d="m11 5-8 7 8 7V5Zm10 0-8 7 8 7V5Z"/>',forward:'<path d="m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z"/>',next:'<path d="m5 5 10 7-10 7V5ZM19 5v14"/>',
        quality:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9v6m4-6v6m-4-3h4m4-3v6h2"/>',voice:'<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
        subs:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M6 10h4m4 0h4M6 14h7m3 0h2"/>',restart:'<path d="M4 9a8 8 0 1 1 .5 7M4 4v5h5"/>'};
    function str(v) { return v===undefined || v===null ? '' : String(v); }
    function get(k,f) { return L.Storage.get('faborn_ukr_'+k,f); }
    function clock(value) { var s=Math.max(0,Math.floor(+value || 0)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return (h ? h+':' : '')+(h && m<10 ? '0' : '')+m+':'+('0'+s%60).slice(-2); }
    function svg(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name] || icons.play)+'</svg>'; }
    function node(tag,cls,text,parent) { var el=doc.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;if(parent)parent.appendChild(el);return el; }
    function safeError(e) {
        var raw=str(e && (e.name || e.message || e.code) || e),match=/PLAYER_ERROR_[A-Z_]+|[A-Za-z]+(?:Error|Timeout)/.exec(raw);
        return match ? match[0] : /^\d{1,3}$/.test(raw) ? 'AVPlay code '+raw : 'AVPlay error';
    }
    function state() { try { return av.getState(); } catch(ignore) { return 'NONE'; } }
    function valid(n) { return !!view && n===run; }
    function emit(name,arg) { if(spec && typeof spec[name]==='function') spec[name](arg); }
    function status(value) {
        phase=value;
        if(nodes.status)nodes.status.textContent=value;
        emit('onStatus',value+' · AVPlay '+state());
    }
    function available() { return !!(av && typeof av.open==='function' && typeof av.prepareAsync==='function' && typeof av.setListener==='function' && typeof av.play==='function' && typeof av.stop==='function' && typeof av.close==='function'); }
    function clear(name) {
        if(name==='start'){root.clearTimeout(startTimer);startTimer=null;}
        if(name==='hide'){root.clearTimeout(hideTimer);hideTimer=null;}
        if(name==='seek'){root.clearTimeout(seekTimer);seekTimer=null;root.clearTimeout(seekTimeout);seekTimeout=null;seekTarget=null;seeking=false;}
        if(name==='sub'){root.clearTimeout(subtitleTimer);subtitleTimer=null;}
    }
    function stopNative() {
        clear('start');clear('seek');clear('sub');
        ready=false;started=false;
        try { av.setListener({}); } catch(ignore) {}
        try { if(['READY','PLAYING','PAUSED'].indexOf(state())>=0)av.stop(); } catch(ignore) {}
        try { if(state()!=='NONE')av.close(); } catch(ignore) {}
    }
    function checkpoint(force) {
        if(!spec || !started || seeking || !(duration>0) || !(current>0) || current>duration+2)return;
        emit('onTime',{current:Math.min(current,duration),duration:duration,force:!!force});
    }
    function notice(text) { if(L.Noty)L.Noty.show(text); }
    function paint() {
        if(!view)return;
        nodes.time.textContent=clock(seekTarget===null ? current : seekTarget)+' / '+clock(duration);
        nodes.fill.style.width=(duration>0 ? Math.max(0,Math.min(100,(seekTarget===null ? current : seekTarget)/duration*100)) : 0)+'%';
        nodes.seek.setAttribute('aria-valuenow',Math.floor(seekTarget===null ? current : seekTarget));nodes.seek.setAttribute('aria-valuemax',Math.floor(duration));
        if(buttons[0]){buttons[0].icon.innerHTML=svg(ended ? 'restart' : paused ? 'play' : 'pause');buttons[0].label.textContent=ended ? 'З початку' : paused ? 'Продовжити' : 'Пауза';buttons[0].node.setAttribute('aria-label',buttons[0].label.textContent);}
        view.setAttribute('data-state',ended ? 'ended' : phase==='Помилка відтворення' ? 'error' : ready ? paused ? 'paused' : 'playing' : 'loading');
    }
    function apply() {
        if(!view)return;
        var theme=get('layout','panel')==='classic' ? 'off' : get('theme','on');
        var colors={blue:['#91bdff','#91bdff'],mint:['#82dfc1','#82dfc1'],amber:['#ffd078','#ffd078'],violet:['#c2a5ff','#c2a5ff'],aurora:['#168bff','#bd39f3'],lagoon:['#20f2bc','#2588ff']};
        var color=theme==='off' ? ['#ffffff','#ffffff'] : colors[get('accent','blue')] || colors.blue;
        var alpha=theme==='ios' ? {solid:1,low:.9,standard:.8,high:.68,max:.56}[get('player_transparency','standard')] : .94;
        if(alpha===undefined)alpha=.8;
        nodes.panel.style.background='rgba(18,26,40,'+alpha+')';
        nodes.panel.style.borderRadius=theme==='ios' ? '1.6em' : '1em';
        nodes.fill.style.background='linear-gradient(110deg,'+color[0]+','+color[1]+')';
        nodes.badge.style.color=color[0];
        nodes.dialog.style.background='rgba(18,26,40,'+Math.max(.9,alpha)+')';
        view.setAttribute('data-theme',theme);
        view._accent=color;
        paintFocus();
    }
    function paintFocus() {
        if(!view)return;
        var list=menu ? menu.nodes : [nodes.seek].concat(buttons.map(function(b){return b.node;})),at=menu ? menu.focus : focus;
        list.forEach(function(el,index){
            var selected=index===at;
            el.classList.toggle('fbp-focused',selected);
            el.style.boxShadow=selected ? 'inset 0 0 0 2px '+view._accent[0] : '';
        });
        if(menu && list[at]) {
            var el=list[at],box=nodes.menuList;
            if(el.offsetTop<box.scrollTop)box.scrollTop=el.offsetTop;
            if(el.offsetTop+el.offsetHeight>box.scrollTop+box.clientHeight)box.scrollTop=el.offsetTop+el.offsetHeight-box.clientHeight;
        }
    }
    function showControls() {
        if(!view)return;
        visible=true;nodes.chrome.style.visibility='visible';nodes.subtitle.style.bottom='38vh';clear('hide');
        if(ready && !paused && !ended && !menu && !changing)hideTimer=root.setTimeout(hideControls,5000);
    }
    function hideControls() {
        if(!view || menu || paused || ended || !ready || changing)return;
        visible=false;nodes.chrome.style.visibility='hidden';nodes.subtitle.style.bottom='9vh';clear('hide');
    }
    function closeMenu() { menu=null;nodes.dialog.style.display='none';showControls();paintFocus(); }
    function openMenu(title,items) {
        if(!view || changing)return;
        showControls();clear('hide');nodes.menuTitle.textContent=title;nodes.menuList.textContent='';
        menu={items:items,nodes:[],focus:Math.max(0,items.map(function(i){return !!i.selected;}).indexOf(true))};
        var saved=menu;
        items.forEach(function(item,index){
            var el=node('button','fbp-choice',undefined,nodes.menuList);el.type='button';
            node('span','fbp-choice__title',item.title,el);if(item.detail)node('small','fbp-choice__detail',item.detail,el);
            if(item.selected)node('span','fbp-choice__check','✓',el);
            el.onclick=function(){if(menu!==saved)return;var action=item.action;closeMenu();if(action)action();};
            saved.nodes.push(el);
        });
        nodes.dialog.style.display='block';paintFocus();
    }
    function chooseQuality() {
        var items=(spec.qualities || []).map(function(q){return {title:q==='2160p'?'4K · 2160p':q,selected:q===spec.quality,action:function(){if(q!==spec.quality)change({type:'quality',quality:q});}};});
        openMenu('Якість відео',items.length ? items : [{title:'Інша якість недоступна'}]);
    }
    function nativeTrack(type,index) {
        if(!ready || seeking)return;
        var wasPaused=paused;
        try {
            if(wasPaused)av.play();
            av.setSelectTrack(type,index);
            if(type==='TEXT')av.setSilentSubtitle(true);
            if(wasPaused)av.pause();
        } catch(error) { try { if(wasPaused)av.pause(); } catch(ignore) {} notice('Доріжка недоступна · '+safeError(error)); }
    }
    function chooseVoice() {
        var items=(spec.voices || []).map(function(v){return {title:v.title,detail:v.detail,selected:v.id===spec.voice,action:function(){if(v.id!==spec.voice)change({type:'voice',id:v.id});}};});
        var nativeAudio=tracks.filter(function(t){return t.type==='AUDIO';});
        if(nativeAudio.length>1)nativeAudio.forEach(function(t,i){items.push({title:'Доріжка '+(i+1)+' · '+trackName(t),detail:'У поточному відеопотоці',action:function(){nativeTrack('AUDIO',t.index);}});});
        openMenu('Озвучення',items.length ? items : [{title:'У цьому потоці одне озвучення'}]);
    }
    function trackName(t) { var info={};try{info=JSON.parse(t.extra_info || '{}');}catch(ignore){}return str(info.language || info.track_lang || info.Language || 'без назви').slice(0,80); }
    function resetSubtitles() {
        subtitleSerial++;if(request && request.abort)request.abort();request=null;clear('sub');cues=[];subtitleChoice='off';
        if(nodes.subtitle)nodes.subtitle.textContent='';
    }
    function parseSubtitles(body) {
        if(typeof body!=='string' || body.length>2097152)return [];
        var result=[],pattern=/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g,m;
        body=body.replace(/\r/g,'');
        while((m=pattern.exec(body)) && result.length<10000){
            var a=(+m[1] || 0)*3600+(+m[2])*60+(+m[3])+(+m[4])/1000,b=(+m[5] || 0)*3600+(+m[6])*60+(+m[7])+(+m[8])/1000;
            if(b>a)result.push({start:a,end:b,text:m[9].replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').slice(0,2000)});
        }
        return result.sort(function(a,b){return a.start-b.start;});
    }
    function externalSubtitle(s,index) {
        resetSubtitles();var token=subtitleSerial,generation=run;
        if(!/^https:\/\//i.test(str(s.url)))return notice('Посилання на субтитри недоступне.');
        subtitleChoice='external:'+index;
        var xhr=new root.XMLHttpRequest();request=xhr;
        function finish(error){
            if(!valid(generation) || token!==subtitleSerial)return;request=null;
            if(error){subtitleChoice='off';notice('Не вдалося завантажити субтитри.');return;}
            cues=parseSubtitles(xhr.responseText);
            if(!cues.length){subtitleChoice='off';notice('Ця бета підтримує зовнішні субтитри SRT та WebVTT.');}
        }
        try { xhr.open('GET',s.url,true);xhr.timeout=10000;xhr.onload=function(){finish(xhr.status<200 || xhr.status>=300);};xhr.onerror=xhr.ontimeout=function(){finish(true);};xhr.send(); }
        catch(ignore){finish(true);}
    }
    function chooseSubtitles() {
        var items=[{title:'Вимкнено',selected:subtitleChoice==='off',action:resetSubtitles}];
        tracks.filter(function(t){return t.type==='TEXT';}).forEach(function(t,i){items.push({title:trackName(t)+' · '+(i+1),detail:'Вбудовані субтитри',selected:subtitleChoice==='native:'+t.index,action:function(){resetSubtitles();subtitleChoice='native:'+t.index;nativeTrack('TEXT',t.index);}});});
        (spec.subtitles || []).forEach(function(s,i){items.push({title:s.label || s.language || 'Субтитри '+(i+1),detail:'SRT / WebVTT',selected:subtitleChoice==='external:'+i,action:function(){externalSubtitle(s,i);}});});
        openMenu('Субтитри',items);
    }
    function paintSubtitle() {
        if(subtitleChoice.indexOf('external:')!==0)return;
        var line=cues.filter(function(c){return current>=c.start && current<c.end;}).map(function(c){return c.text;}).join('\n');
        if(nodes.subtitle.textContent!==line)nodes.subtitle.textContent=line;
    }
    function durationRead() { try { var value=av.getDuration()/1000;if(value>0 && isFinite(value) && value<=604800)duration=value; } catch(ignore){} }
    function watchStart() { clear('start');var token=run;startTimer=root.setTimeout(function(){if(!paused)fail('StartupTimeout',token);},45000); }
    function tick(value) {
        if(!view || !ready || ended || changing || seeking)return;
        if(typeof value!=='number' || !isFinite(value) || value<0)return;
        durationRead();current=value/1000;
        if(current>startFloor && !started){started=true;clear('start');status(paused?'Пауза':'Відтворення');emit('onStarted');}
        checkpoint(false);if(!view)return;paint();paintSubtitle();
        if(L.Screensaver && L.Screensaver.resetTimer)L.Screensaver.resetTimer();
    }
    function seek(seconds,after) {
        if(!view || !ready || seeking || !(duration>0))return;
        clear('seek');var token=run,old=current,target=Math.max(1,Math.min(duration-1,seconds));
        seeking=true;nodes.subtitle.textContent='';status('Перемотування');showControls();
        function done(error) {
            if(!valid(token) || !seeking)return;
            seeking=false;root.clearTimeout(seekTimeout);seekTimeout=null;
            current=error ? old : target;
            if(error)notice('Не вдалося перемотати · '+safeError(error));
            else {if(!started)startFloor=target;checkpoint(true);}
            if(!valid(token))return;
            status(paused ? 'Пауза' : 'Відтворення');paint();if(after)after(error);
        }
        seekTimeout=root.setTimeout(function(){done('SeekTimeout');},8000);
        try { av.seekTo(Math.floor(target*1000),function(){done();},function(e){done(e || 'SeekError');}); }
        catch(error){done(error);}
    }
    function nudge(seconds) {
        if(!ready || seeking || ended || changing)return;
        seekTarget=Math.max(1,Math.min(duration-1,(seekTarget===null ? current : seekTarget)+seconds));
        root.clearTimeout(seekTimer);showControls();paint();
        seekTimer=root.setTimeout(function(){var target=seekTarget;seekTarget=null;seekTimer=null;seek(target);},350);
    }
    function togglePause() {
        if(ended)return change({type:'restart'});
        if(!ready || changing || seeking)return;
        try { if(paused){av.play();paused=false;if(!started)watchStart();}else{checkpoint(true);if(!view)return;av.pause();paused=true;}status(paused?'Пауза':'Відтворення');showControls();paint(); }
        catch(error){notice('Не вдалося змінити стан · '+safeError(error));}
    }
    function fail(error,token) {
        if(!valid(token))return;
        var code=safeError(error),network=/CONNECTION|NETWORK|Timeout|code (?:2|15)$/.test(code),urls=spec.urls || [spec.url];
        // Only supplied mirrors of this exact voice and quality may be tried.
        if(network && mirror+1<Math.min(3,urls.length)){
            checkpoint(true);if(!valid(token))return;resume=current || resume;resumePaused=paused;mirror++;
            status('Запасна адреса '+(mirror+1));attempt();return;
        }
        var failedState=state(),failedStage=ready ? 'відтворення' : 'підготовка';
        checkpoint(true);if(!valid(token))return;run++;stopNative();changing=false;ended=false;status('Помилка відтворення');
        emit('onError',code+' · '+failedStage+' · AVPlay '+failedState);showControls();paint();
        openMenu('Відео не запустилося',[{title:'Повторити запуск',detail:code,action:function(){change({type:'retry'});}},{title:'Обрати іншу якість',action:chooseQuality},{title:'Повернутися до джерел',action:function(){close();}}]);
    }
    function attempt() {
        var token=++run;stopNative();resetSubtitles();ready=false;paused=false;ended=false;started=false;current=0;duration=0;startFloor=0;tracks=[];
        var url=(spec.urls || [spec.url])[mirror];
        if(!/^https:\/\//i.test(str(url)))return fail('InvalidURL',token);
        status('Підключення'+(mirror ? ' · адреса '+(mirror+1) : ''));showControls();paint();
        watchStart();
        try {
            av.open(url);
            av.setListener({
                onbufferingstart:function(){if(valid(token)){status('Буферизація');showControls();}},
                onbufferingprogress:function(p){if(valid(token) && isFinite(+p))nodes.status.textContent='Буферизація · '+Math.max(0,Math.min(100,+p))+'%';},
                onbufferingcomplete:function(){if(valid(token)){status(paused?'Пауза':'Відтворення');showControls();}},
                oncurrentplaytime:function(ms){if(valid(token))tick(ms);},
                onerror:function(e){root.setTimeout(function(){fail(e,token);},0);},
                onstreamcompleted:function(){
                    if(!valid(token) || ended || !started || seeking || changing)return;
                    clear('start');ended=true;paused=true;current=duration;checkpoint(true);if(!valid(token))return;status('Перегляд завершено');showControls();paint();
                    root.setTimeout(function(){if(valid(token) && ended)emit('onEnded');},0);
                },
                onsubtitlechange:function(ms,text){
                    if(!valid(token) || subtitleChoice.indexOf('native:')!==0)return;
                    clear('sub');nodes.subtitle.textContent=str(text).replace(/<[^>]*>/g,'');
                    subtitleTimer=root.setTimeout(function(){if(valid(token))nodes.subtitle.textContent='';},Math.max(100,Math.min(60000,+ms || 3000)));
                }
            });
            // AVPlay display coordinates are always 1920x1080, including a 720p app UI.
            av.setDisplayRect(0,0,1920,1080);av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            try { av.setSilentSubtitle(true); } catch(ignore) {}
            if(spec.legacy4k){try{av.setStreamingProperty('SET_MODE_4K','TRUE');emit('onLegacy','UHD-декодер увімкнено · Faborn Player');}catch(error){emit('onLegacy','UHD-режим недоступний · '+safeError(error));}}
            av.prepareAsync(function(){
                if(!valid(token))return;
                try {
                    durationRead();av.play();ready=true;paused=false;
                    try{tracks=av.getTotalTrackInfo() || [];}catch(ignore){}
                    status('Відтворення');paint();showControls();
                    if(resume>0 && duration>1){var at=resume;resume=0;seek(at,function(){if(valid(token) && resumePaused){av.pause();paused=true;status('Пауза');paint();showControls();}});}
                    else if(resumePaused){av.pause();paused=true;status('Пауза');showControls();paint();}
                } catch(error){fail(error,token);}
            },function(error){root.setTimeout(function(){fail(error || 'PrepareError',token);},0);});
        } catch(error){root.setTimeout(function(){fail(error,token);},0);}
    }
    function change(action) {
        if(!view || changing || !spec.request)return;
        checkpoint(true);if(!view)return;changing=true;clear('start');clear('hide');
        var token=run,keepTime=current,keepPause=paused,old=spec;
        if(ready && !paused){try{av.pause();}catch(ignore){}}
        status(action.type==='next' ? 'Завантаження наступної серії' : 'Оновлення потоку');showControls();
        old.request(action,function(error,next){
            if(!valid(token) || spec!==old)return;
            changing=false;
            if(error || !next){
                if(ready && !keepPause && !ended){try{av.play();}catch(ignore){}}
                status(ended?'Перегляд завершено':ready?'Відтворення':'Помилка відтворення');notice(error && error.message || 'Потік недоступний.');showControls();paint();return;
            }
            spec=next;mirror=0;
            resume=action.type==='next' ? +next.time || 0 : action.type==='restart' ? 0 : keepTime || +next.time || 0;
            resumePaused=action.type==='next' || action.type==='restart' ? false : keepPause;
            nodes.title.textContent=next.title;nodes.detail.textContent=next.detail;updateButtons();attempt();
        });
    }
    function updateButtons() { if(buttons[7])buttons[7].node.style.display=spec.next ? '' : 'none'; }
    function move(direction) {
        if(!view)return;
        if(menu){menu.focus=Math.max(0,Math.min(menu.items.length-1,menu.focus+(direction==='up' || direction==='left' ? -1 : 1)));paintFocus();return;}
        if(!visible){showControls();focus=0;paintFocus();if(direction==='left' || direction==='right')nudge(direction==='left'?-10:10);return;}
        showControls();
        if(direction==='up')focus=0;
        else if(direction==='down')focus=1;
        else if(focus===0)nudge(direction==='left'?-10:10);
        else {
            var step=direction==='left'?-1:1;focus=Math.max(1,Math.min(buttons.length,focus+step));
            if(buttons[focus-1].node.style.display==='none')focus=Math.max(1,Math.min(buttons.length,focus+step));
        }
        paintFocus();
    }
    function enter() {
        if(!view)return;
        if(menu){var row=menu.items[menu.focus];closeMenu();if(row && row.action)row.action();return;}
        if(!visible){showControls();focus=1;paintFocus();return;}
        if(focus===0)togglePause();else if(buttons[focus-1])buttons[focus-1].action();
    }
    function back() { if(!view)return;if(menu){closeMenu();return;}close(); }
    function keydown(event) {
        var code=event.keyCode || event.which;
        if(!view){if(ownedKeys[code]){event.preventDefault();event.stopImmediatePropagation();}return;}
        if([8,27,461,10009,13,37,38,39,40,415,19,10252,413,412,417].indexOf(code)<0)return;
        var held=ownedKeys[code];event.preventDefault();event.stopImmediatePropagation();ownedKeys[code]=true;
        if((held || event.repeat) && [8,27,461,10009,13,10252].indexOf(code)>=0)return;
        if([8,27,461,10009].indexOf(code)>=0)back();
        else if(code===13)enter();
        else if(code>=37 && code<=40)move({37:'left',38:'up',39:'right',40:'down'}[code]);
        else if(code===413)close();
        else if(code===412 || code===417)nudge(code===412?-30:30);
        else if(code===10252 || code===415 && paused || code===19 && !paused)togglePause();
    }
    function keyup(event) { var code=event.keyCode || event.which;if(ownedKeys[code]){delete ownedKeys[code];event.preventDefault();event.stopImmediatePropagation();} }
    function install() {
        if(installed)return;installed=true;
        var style=node('style','',undefined,doc.head);style.id='faborn-beta-player-style';
        style.textContent='body.faborn-beta-viewing{background:transparent!important}body.faborn-beta-viewing .background{visibility:hidden!important}.fbp{position:fixed;inset:0;top:0;right:0;bottom:0;left:0;z-index:1000;color:#f5f8ff;font-size:1em;font-family:inherit}.fbp-video{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none}.fbp-chrome{position:absolute;left:0;right:0;bottom:0;padding:5em 3.5vw 3vh;background:linear-gradient(transparent,rgba(0,0,0,.6))}.fbp-panel{padding:1.2em 1.5em;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 .5em 2em rgba(0,0,0,.3)}.fbp-heading{display:flex;align-items:center}.fbp-title{font-size:1.4em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}.fbp-badge{margin-left:1em;white-space:nowrap;font-size:.8em;letter-spacing:.06em;font-weight:600}.fbp-detail{font-size:.88em;opacity:.75;margin-top:.4em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fbp-progress{display:flex;align-items:center;margin:.85em 0}.fbp-seek{position:relative;flex:1;height:1.8em;border-radius:.55em;padding:.75em .65em;cursor:pointer}.fbp-track{height:.3em;background:rgba(255,255,255,.2);border-radius:1em;overflow:hidden}.fbp-fill{height:100%;width:0;border-radius:1em}.fbp-time{margin-left:1em;min-width:8em;text-align:right;font-size:.92em;font-variant-numeric:tabular-nums}.fbp-actions{display:flex;align-items:stretch}.fbp-button{font:inherit;color:inherit;border:0;outline:0;border-radius:.85em;background:rgba(255,255,255,.065);display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;flex:1;margin-right:.45em;padding:.65em .25em;cursor:pointer}.fbp-button:last-child{margin-right:0}.fbp-button svg{display:block;width:1.45em;height:1.45em}.fbp-button-label{font-size:.72em;margin-top:.45em;white-space:nowrap}.fbp-focused{background-color:rgba(255,255,255,.15)!important}.fbp-bottom{display:flex;justify-content:space-between;margin-top:.8em;font-size:.73em;opacity:.7}.fbp-dialog{position:absolute;right:3.5vw;bottom:3vh;width:31em;max-width:80vw;border-radius:1.4em;padding:1.4em;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 .5em 3em rgba(0,0,0,.55)}.fbp-menu-title{font-size:1.3em;font-weight:600;margin-bottom:.8em}.fbp-menu-list{max-height:55vh;overflow-y:auto;position:relative}.fbp-choice{font:inherit;text-align:left;color:inherit;position:relative;display:block;width:100%;border:0;outline:0;border-radius:.8em;background:rgba(255,255,255,.06);padding:.8em 2.4em .8em .9em;margin-bottom:.35em;cursor:pointer}.fbp-choice__title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fbp-choice__detail{display:block;font-size:.78em;opacity:.65;margin-top:.3em}.fbp-choice__check{position:absolute;right:.8em;top:.9em}.fbp-subtitle{position:absolute;bottom:9vh;left:10%;width:80%;text-align:center;white-space:pre-line;font-size:1.7em;line-height:1.25;color:#fff;text-shadow:0 2px 4px #000,1px 0 2px #000,-1px 0 2px #000;pointer-events:none}';
        // No blur, transforms or animated focus on the native video plane (older Tizen).
        doc.addEventListener('keydown',keydown,true);doc.addEventListener('keyup',keyup,true);
        doc.addEventListener('visibilitychange',function(){if(!view)return;if(doc.hidden){checkpoint(true);if(ready && !paused && !ended)togglePause();}});
        if(root.addEventListener)root.addEventListener('pagehide',function(){if(view)close(false);});
        L.Controller.add('faborn_player_beta',{toggle:showControls,enter:enter,back:back,left:function(){move('left');},right:function(){move('right');},up:function(){move('up');},down:function(){move('down');}});
    }
    function mount() {
        view=node('div','fbp',undefined,doc.body);view.setAttribute('role','region');view.setAttribute('aria-label','Faborn Player · бета');
        nodes.video=node('object','fbp-video');nodes.video.type='application/avplayer';view.appendChild(nodes.video);
        nodes.subtitle=node('div','fbp-subtitle','',view);
        nodes.chrome=node('div','fbp-chrome',undefined,view);nodes.panel=node('div','fbp-panel',undefined,nodes.chrome);
        var heading=node('div','fbp-heading',undefined,nodes.panel);nodes.title=node('div','fbp-title',spec.title,heading);nodes.badge=node('div','fbp-badge','FABORN PLAYER · BETA',heading);
        nodes.detail=node('div','fbp-detail',spec.detail,nodes.panel);
        var progress=node('div','fbp-progress',undefined,nodes.panel);nodes.seek=node('div','fbp-seek',undefined,progress);nodes.seek.setAttribute('role','slider');nodes.seek.setAttribute('aria-label','Позиція відео');nodes.seek.setAttribute('aria-valuemin','0');
        nodes.fill=node('div','fbp-fill',undefined,node('div','fbp-track',undefined,nodes.seek));nodes.time=node('div','fbp-time','0:00 / 0:00',progress);
        nodes.seek.onclick=function(event){var rect=nodes.seek.getBoundingClientRect();if(duration>0)seek(Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*duration);};
        var actions=node('div','fbp-actions',undefined,nodes.panel);buttons=[];
        [['pause','Пауза',togglePause],['rewind','−10 с',function(){nudge(-10);}],['forward','+30 с',function(){nudge(30);}],['quality','Якість',chooseQuality],['voice','Озвучення',chooseVoice],['subs','Субтитри',chooseSubtitles],['restart','З початку',function(){change({type:'restart'});}],['next','Наступна',function(){if(spec.next)change({type:'next'});}],['close','До джерел',function(){close();}]].forEach(function(item,index){
            var el=node('button','fbp-button',undefined,actions);el.type='button';el.setAttribute('aria-label',item[1]);var icon=node('span','fbp-icon',undefined,el);icon.innerHTML=svg(item[0]);
            var label=node('span','fbp-button-label',item[1],el);el.onclick=function(){focus=index+1;paintFocus();item[2]();};
            buttons.push({node:el,icon:icon,label:label,action:item[2]});
        });
        var bottom=node('div','fbp-bottom',undefined,nodes.panel);nodes.status=node('span','fbp-status','Підключення',bottom);node('span','','↑ Перемотування · Назад — до джерел',bottom);
        nodes.dialog=node('div','fbp-dialog',undefined,view);nodes.dialog.style.display='none';nodes.menuTitle=node('div','fbp-menu-title','',nodes.dialog);nodes.menuList=node('div','fbp-menu-list',undefined,nodes.dialog);
        view.onmousemove=showControls;focus=1;apply();updateButtons();
    }
    function play(value) {
        if(!available())throw new Error('Samsung AVPlay недоступний у цьому застосунку.');
        if(L.Player && L.Player.opened && L.Player.opened())throw new Error('Спочатку закрий поточний плеєр Lampa.');
        if(view)close(false);
        install();spec=value;closedCallback=value.onClose;mirror=0;resume=+value.time || 0;resumePaused=false;
        oldController=L.Controller.enabled().name || 'content';addedBody=!doc.body.classList.contains('player--viewing');
        doc.body.classList.add('player--viewing');doc.body.classList.add('faborn-beta-viewing');
        if(L.Screensaver){oldSaver=L.Screensaver.enabled;if(L.Screensaver.stop)L.Screensaver.stop();if(L.Screensaver.disable)L.Screensaver.disable();}
        mount();L.Controller.toggle('faborn_player_beta');attempt();
        pollTimer=root.setInterval(function(){if(!view || !ready || seeking || ended || changing)return;try{tick(av.getCurrentTime());}catch(ignore){}},1000);
    }
    function close(restore) {
        if(!view || closing)return;
        closing=true;
        try{checkpoint(true);}finally{
            run++;changing=false;stopNative();resetSubtitles();clear('hide');root.clearInterval(pollTimer);pollTimer=null;
            view.parentNode.removeChild(view);view=null;spec=null;menu=null;nodes={};buttons=[];
            doc.body.classList.remove('faborn-beta-viewing');if(addedBody)doc.body.classList.remove('player--viewing');
            if(L.Screensaver && oldSaver && L.Screensaver.enable)L.Screensaver.enable();oldSaver=undefined;
            var callback=closedCallback;closedCallback=null;closing=false;
            if(restore!==false)L.Controller.toggle(oldController);
            if(callback)callback(restore!==false);
        }
    }
    return {play:play,close:close,active:function(){return !!view;},available:available,apply:apply,change:change,parseSubtitles:parseSubtitles};
}));
