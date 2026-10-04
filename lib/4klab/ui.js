/* Default-off 4K laboratory. Own worker, timers, menu and playback marker. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.Faborn4KLab = factory;
}(typeof window !== 'undefined' ? window : this, function (root,L,base,version) {
    'use strict';
    var worker = null, blob = '', timer = null, serial = 0, back = 'settings_component', playing = false, started = false;
    var retiring = null, pendingStart = null;
    var lastStage = '';
    var active = false, followInstalled = false;
    var card = null, choice = null, job = 0, ready = false, playingQuality = '2160p';
    var switching = null, playbackData = null, videoSerial = 0;
    var failureTimer = null, pendingFailure = '', watchedVideo = null, videoError = null;
    var playingCodecs = '', traffic = 0, preparedSwitch = false;
    var loopbackProbe = null, probeTimer = null;
    var closingPlayer = false, betaPlayer = null;
    function clearProbe() {
        if (probeTimer !== null) root.clearTimeout(probeTimer);
        probeTimer = null;
        var request = loopbackProbe; loopbackProbe = null;
        if (request) {
            request.onload = request.onerror = request.ontimeout = null;
            try { request.abort(); } catch (ignore) {}
        }
    }
    function escape(value) { return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function status(value) {
        try { L.Storage.set('faborn_ukr_lab4k_status',value); } catch (ignore) {}
    }
    function enabled() { return L.Storage.get('faborn_ukr_uakinogo_beta','off') === 'on'; }
    function clearTimer() { if (timer !== null) root.clearTimeout(timer); timer = null; }
    function unwatchVideo() {
        videoSerial++;
        if (watchedVideo && videoError && watchedVideo.removeEventListener) {
            try { watchedVideo.removeEventListener('error',videoError); } catch (ignore) {}
        }
        watchedVideo = null; videoError = null;
    }
    function clearFailure() {
        if (failureTimer !== null) root.clearTimeout(failureTimer);
        failureTimer = null; pendingFailure = '';
    }
    function playerFailure(message,specific) {
        if (betaPlayer || !ownsPlayer()) return;
        // AVPlay callbacks must return before closing the same native player.
        if (!pendingFailure || specific) pendingFailure = message;
        if (failureTimer !== null) return;
        var run = serial;
        failureTimer = root.setTimeout(function () {
            failureTimer = null;
            var reason = pendingFailure; pendingFailure = '';
            if (run === serial && ownsPlayer()) failed(reason);
        },0);
    }
    function ownsPlayer() {
        if (betaPlayer) return playing && betaPlayer.active() && playbackData && playbackData.faborn_4klab === true;
        try { var data = L.Player.playdata(); return playing && data && data === playbackData && data.faborn_4klab === true; }
        catch (ignore) { return false; }
    }
    function stopWorker() {
        serial++; clearProbe(); unwatchVideo(); clearFailure(); clearTimer(); pendingStart = null; ready = false; switching = null; preparedSwitch = false;
        var old = worker;
        worker = null;
        if (blob) { root.URL.revokeObjectURL(blob); blob = ''; }
        if (old) {
            retiring = old;
            var ended = false;
            // Give a bounded cURL request time to return so native descriptors can close.
            function finished() {
                if (ended) return;
                ended = true;
                root.clearTimeout(kill); old.terminate();
                if (retiring === old) retiring = null;
                if (pendingStart) { var next = pendingStart; pendingStart = null; next(); }
            }
            var kill = root.setTimeout(finished,23000);
            old.onmessage = function (e) { if (e.data && e.data.type === 'stopped') finished(); };
            old.onerror = finished;
            try { old.postMessage({type:'stop'}); } catch (ignore) { finished(); }
        }
    }
    function endPlayback() {
        if (closingPlayer) return;
        var own = ownsPlayer();
        playing = false; unwatchVideo(); clearFailure();
        // Keep the loopback alive until AVPlay releases its pending HTTP reads.
        // Cancel/destroy listeners cannot close the native channel a second time.
        // Programmatic shutdown must not reopen the source overlay underneath
        // our error dialog. Its controller's gone() would cancel the saved card.
        // The close action below is the single place that restores that card.
        try {
            if (own) {
                closingPlayer = true;
                if (betaPlayer) betaPlayer.close(false);
                else {
                    if (L.Player.callback) L.Player.callback(function () {});
                    L.Player.close();
                }
            }
        }
        catch (error) { status('CLOSE: '+String(error.message || error).slice(0,180)); }
        finally { closingPlayer = false; betaPlayer = null; playbackData = null; stopWorker(); }
    }
    function close() {
        active = false; endPlayback();
        L.Select.hide();
        if (card && card.callbacks.back) card.callbacks.back();
        else L.Controller.toggle(back);
    }
    function menu(title,items,choose) {
        L.Select.hide();
        L.Select.show({title:title,nohide:true,items:items.map(function (row) {
            return {title:escape(row.title),subtitle:escape(row.subtitle),action:row.action,index:row.index};
        }),onSelect:function (row) { choose(row); },onBack:close});
    }
    function failed(message) {
        if (!active) return;
        if (switching) {
            var pending = switching; switching = null; job++; clearTimer();
            status('Не змінено озвучення · '+message);
            pending.done(new Error(message));
            return;
        }
        endPlayback(); active = false;
        status('Помилка · '+(lastStage ? lastStage+' · ' : '')+message);
        if (card && card.callbacks.error) card.callbacks.error(message,Boolean(choice));
        if (card && !choice) { active = false; return; }
        menu('4K · Результат перевірки',[
            {title:message,subtitle:'Код і деталі збережені у «Версія та діагностика».',action:'info'},
            {title:'Повторити перевірку',action:'retry'},
            {title:'Закрити',action:'close'}
        ],function (row) { if (row.action === 'retry') { if (card) playChoice(choice); else open(back); } else if (row.action === 'close') close(); });
    }
    function arm(ms,message) { clearTimer(); timer = root.setTimeout(function () { failed(message); },ms); }
    function progress(message) {
        if (!active) return;
        lastStage = message;
        status(message);
        if (switching) { arm(40000,'TIMEOUT: не вдалося змінити озвучення за 40 с'); return; }
        if (card && !choice) {
            if (card.callbacks.stage) card.callbacks.stage(message);
            arm(40000,'TIMEOUT: джерело не завершило етап за 40 с');
            return;
        }
        menu(card ? 'UAKinogo / Alloha · запуск' : '4K · Тест «Оппенгеймер»',[
            {title:message,subtitle:'Потік надходить на телевізор. Зачекай…',action:'info'},
            {title:'Скасувати перевірку',action:'close'}
        ],function (row) { if (row.action === 'close') close(); });
        arm(40000,'TIMEOUT: етап перевірки не завершився за 40 с');
    }
    function showTracks(rows) {
        clearTimer();
        status('Джерело знайдено · доріжок 2160p: '+rows.length+' · відтворення ще не перевірене');
        var names = {uk:'UA',en:'EN',ru:'RU'};
        menu('4K · Обери озвучення',rows.map(function (row) {
            return {title:names[row.language]+' · '+row.label,subtitle:'2160p · перевірити й запустити',action:'play',index:row.index};
        }).concat([{title:'Закрити тест',action:'close'}]),function (row) {
            if (row.action === 'close') { close(); return; }
            if (row.action !== 'play' || !worker || !enabled()) return;
            progress('Підготовка вибраної доріжки…');
            worker.postMessage({type:'prepare',index:row.index});
        });
        arm(180000,'SESSION: час вибору минув — запусти нову перевірку');
    }
    function play(data) {
        if (!enabled() || !/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}\/\d+\.m3u8$/.test(data.url)) {
            failed('PLAY: некоректний локальний потік'); return;
        }
        clearProbe();
        if (!root.XMLHttpRequest) { failed('LOOPBACK: немає API перевірки локального каналу'); return; }
        var request = new root.XMLHttpRequest(), run = serial, checked = false;
        loopbackProbe = request;
        progress('Перевірка локального каналу телевізора…');
        function finish(timeout) {
            if (checked || request !== loopbackProbe || run !== serial || !active || !enabled()) return;
            checked = true;
            var code = request.status || 0, body = request.responseText || '';
            var ok = !timeout && code === 200 && body.length <= 2097152 && /^#EXTM3U(?:\r?\n|$)/.test(body);
            clearProbe();
            try { L.Storage.set('faborn_ukr_lab4k_probe',ok ? 'HTTP 200 · маніфест отримано' : 'HTTP '+code+(timeout ? ' · тайм-аут' : ' · маніфест не отримано')); } catch (ignore) {}
            if (!ok) {
                failed('LOOPBACK: локальний канал недоступний (HTTP '+code+(timeout ? ', тайм-аут' : '')+'). AVPlay не запущено.');
                return;
            }
            startPlay(data);
        }
        request.onload = function () { finish(false); };
        request.onerror = function () { finish(false); };
        request.ontimeout = function () { finish(true); };
        probeTimer = root.setTimeout(function () { finish(true); },4500);
        try {
            request.open('GET',data.url,true); request.timeout = 4500; request.send();
        } catch (error) { finish(false); }
    }
    function startPlay(data) {
        if (switching) {
            var pending = switching; switching = null;
            if (!ownsPlayer()) return;
            clearTimer(); choice = pending.choice; playingQuality = data.quality || choice.quality; started = false;
            preparedSwitch = true; playingCodecs = String(data.codecs || playingCodecs).slice(0,100);
            videoSerial++;
            arm(40000,'PLAY: нове озвучення не почало відтворення за 40 с');
            status('Зміна озвучення · '+data.label+' · '+playingQuality);
            pending.done(null,data);
            if (!betaPlayer) watchVideo(playbackData);
            return;
        }
        clearTimer(); L.Select.hide(); L.Controller.toggle(back);
        playing = true; started = false; preparedSwitch = false;
        playingQuality = data.quality || '2160p';
        playingCodecs = String(data.codecs || 'кодек не вказаний').slice(0,100);
        var item = card && card.callbacks.playerData ? card.callbacks.playerData(data) : {title:'4K · Оппенгеймер · '+data.label,voice_name:data.label};
        item.url = data.url; item.faborn_4klab = true; item.quality = {}; item.quality[playingQuality] = data.url; item.playlist = [];
        playbackData = item;
        if (!card && L.Timeline && L.Utils) item.timeline = L.Timeline.view(L.Utils.hash('faborn|4klab|oppenheimer'));
        if (card && card.callbacks.beforePlay) card.callbacks.beforePlay();
        if (L.Storage.get('faborn_ukr_player','lampa') === 'beta') {
            if (!card || !card.callbacks.betaPlayer || !card.callbacks.betaSpec) {
                failed('PLAYER: запуск Faborn Player доступний зі списку джерел картки'); return;
            }
            var run = serial;
            progress('Завантаження Faborn Player…');
            card.callbacks.betaPlayer(function (error,player) {
                if (run !== serial || !active || !enabled()) return;
                if (error || !player || !player.available()) { failed('PLAYER: '+(error && error.message || 'Faborn Player недоступний')); return; }
                try {
                    var spec = betaSpec(card.callbacks.betaSpec(data,item));
                    L.Select.hide(); L.Controller.toggle(back);
                    betaPlayer = player; player.play(spec);
                } catch (launchError) { failed('PLAY: '+launchError.message); }
            });
            return;
        }
        status('Передано AVPlay · '+data.width+'×'+data.height+' · '+data.codecs+' · '+data.language);
        arm(40000,'PLAY: відео не почалося за 40 с. '+playingQuality+' · '+data.codecs+'; перевірте підтримку кодека і доступ AVPlay до локального каналу.');
        try {
            if (L.Player.playlist) L.Player.playlist([]);
            L.Player.play(item);
        } catch (error) { failed('PLAY: '+error.message); }
    }
    function betaSpec(spec) {
        var onClose = spec.onClose, onError = spec.onError, onStarted = spec.onStarted, request = spec.request;
        spec.onStarted = function () {
            started = true; clearTimer(); status('Відтворення почалося · '+playingQuality+' · Faborn Player');
            if (onStarted) onStarted();
        };
        spec.onError = function (code) {
            clearTimer(); status('PLAY: Faborn Player · '+code+' · '+playingQuality+' · '+playingCodecs+' · запитів: '+traffic);
            if (onError) onError(code);
        };
        spec.onClose = function (restore) {
            playing = false; active = false; betaPlayer = null; playbackData = null; stopWorker();
            if (onClose) onClose(restore);
        };
        if (request) spec.request = function (action,done) {
            request(action,function (error,next) { done(error,next ? betaSpec(next) : next); });
        };
        return spec;
    }
    function watchVideo(data) {
        if (betaPlayer || !ownsPlayer() || !L.PlayerVideo || !L.PlayerVideo.video) return;
        unwatchVideo(); var run = videoSerial;
        try {
            var video = L.PlayerVideo.video();
            if (video && video.addEventListener) {
                watchedVideo = video;
                videoError = function (event) {
                if (run !== videoSerial || !ownsPlayer() || L.Player.playdata() !== data) return;
                var detail = event && event.error || '', message = typeof detail === 'object' ? detail.message || detail.code : detail;
                    playerFailure('PLAY: AVPlay · '+String(message || 'невідома помилка').replace(/https?:\/\/\S+/g,'[адреса]').slice(0,180)+' · '+playingQuality+' · '+playingCodecs+' · запитів: '+traffic,true);
                };
                video.addEventListener('error',videoError);
            }
        } catch (ignore) {}
    }
    function installListeners() {
        if (followInstalled) return;
        followInstalled = true;
        if (L.Player.listener) {
            L.Player.listener.follow('start',function (data) {
                if (!betaPlayer && active && (!data || !data.faborn_4klab)) { playing = false; active = false; stopWorker(); }
            });
            L.Player.listener.follow('destroy',function () {
                if (!betaPlayer && playing) { playing = false; active = false; stopWorker(); }
            });
            L.Player.listener.follow('ready',watchVideo);
        }
        if (L.PlayerVideo && L.PlayerVideo.listener) {
            L.PlayerVideo.listener.follow('loadeddata',function () { if (ownsPlayer() && preparedSwitch && !switching) clearTimer(); });
            L.PlayerVideo.listener.follow('timeupdate',function (event) {
                if (ownsPlayer() && event && event.current > 0 && !started) {
                    started = true; clearTimer(); status('Відтворення почалося · '+playingQuality+' · телевізор отримує відео без зовнішнього проксі');
                }
            });
            L.PlayerVideo.listener.follow('error',function () {
                playerFailure('PLAY: AVPlay повідомив помилку · '+playingQuality+' · '+playingCodecs+' · запитів до локального каналу: '+traffic+'.');
            });
        }
    }
    function open(controller, fromCard) {
        if (!enabled()) return;
        if (ownsPlayer()) return;
        if (!fromCard) { card = null; choice = null; }
        stopWorker(); active = true; playing = false; lastStage = ''; traffic = 0;
        try { L.Storage.set('faborn_ukr_lab4k_probe','Ще не перевірено'); L.Storage.set('faborn_ukr_lab4k_bridge','Запитів ще немає'); } catch (ignore) {}
        back = controller || back;
        installListeners();
        if (!root.webapis || !root.webapis.avplay) { failed('AVPLAY: це джерело потребує застосунку Lampa на Samsung Tizen'); return; }
        if (L.Storage.get('faborn_ukr_player','lampa') !== 'beta' && L.Storage.field && L.Storage.field('player') !== 'tizen') { failed('PLAYER: обери Tizen / AVPlay у налаштуваннях плеєра Lampa'); return; }
        if (!root.Worker || !root.WebAssembly || !root.Blob || !root.crypto || !root.crypto.getRandomValues) {
            failed('COMPAT: у застосунку відсутні WebAssembly, Worker або Web Crypto'); return;
        }
        if (!L.Storage.get('faborn_ukr_uakinogo_server','')) { failed('SERVER: вкажи адресу бета-обробника в налаштуваннях Faborn'); return; }
        var run = serial;
        function start() {
        if (run !== serial || !active || !enabled()) return;
        progress('Перевірка сумісності Samsung…');
        var token = '', bytes = new Uint8Array(16);
        root.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) token += ('0'+bytes[i].toString(16)).slice(-2);
        try {
            blob = root.URL.createObjectURL(new root.Blob(['importScripts('+JSON.stringify(base+'worker.js?v='+version)+');'],{type:'application/javascript'}));
            worker = new root.Worker(blob);
            worker.onmessage = function (event) {
                if (run !== serial || !active || !enabled()) return;
                var msg = event.data || {};
                if (msg.job !== undefined && msg.job !== job) return;
                if (msg.type === 'stage') progress(msg.data.message);
                else if (msg.type === 'episodes' && card && card.callbacks.episodes) card.callbacks.episodes(msg.data.episodes);
                else if (msg.type === 'resolved' && card) {
                    ready = true; clearTimer();
                    status('UAKinogo / Alloha · озвучень: '+msg.data.tracks.length+' · вибери якість у картці');
                    if (card.callbacks.result) card.callbacks.result(msg.data);
                }
                else if (msg.type === 'tracks') showTracks(msg.data);
                else if (msg.type === 'play') play(msg.data);
                else if (msg.type === 'traffic') {
                    traffic = Number(msg.data.requests) || traffic;
                    var detail = 'З’єднань: '+(Number(msg.data.accepted)||0)+' · відповідей: '+traffic+' · відхилено: '+(Number(msg.data.rejected)||0)+' · передано: '+Math.round((Number(msg.data.sentBytes)||0)/1024)+' KiB';
                    if (msg.data.status) detail += ' · HTTP '+Number(msg.data.status)+' · '+(msg.data.kind === 'manifest' ? 'маніфест' : msg.data.kind === 'media' ? 'відео' : 'запит');
                    try { L.Storage.set('faborn_ukr_lab4k_bridge',detail); } catch (ignore) {}
                }
                else if (msg.type === 'error') failed(msg.data.message);
            };
            worker.onerror = function () { if (run === serial) failed('WORKER: застосунок заблокував завантаження або виконання адаптера'); };
            var init = {type:'init',base:base,version:version,token:token,job:++job,server:L.Storage.get('faborn_ukr_uakinogo_server',''),key:L.Storage.get('faborn_ukr_uakinogo_key','')};
            if (!init.server) { failed('SERVER: вкажи адресу бета-обробника в налаштуваннях Faborn'); return; }
            if (card) { init.movie = card.movie; init.season = card.season; init.episode = card.episode; if (choice) init.choice = choice; }
            worker.postMessage(init);
        } catch (error) { failed('WORKER: '+error.message); }
        }
        if (retiring) { progress('Завершення попередньої перевірки…'); pendingStart = start; }
        else start();
    }
    function discover(movie, season, episode, callbacks) {
        card = {movie:movie,season:season,episode:episode,callbacks:callbacks || {}}; choice = null;
        open(card.callbacks.controller || null,true);
    }
    function episode(season, number) {
        if (!card || !enabled()) return;
        card.season = season; card.episode = number; choice = null;
        if (!worker || !ready) { open(null,true); return; }
        progress('UAKinogo · S'+season+'E'+number+'…');
        worker.postMessage({type:'episode',season:season,episode:number,job:++job});
    }
    function playChoice(selected) {
        if (!card || !enabled()) return;
        choice = selected;
        if (!worker || !ready) { open(null,true); return; }
        active = true; progress('Оновлення вибраного потоку…');
        worker.postMessage({type:'play',season:selected.season,episode:selected.episode,label:selected.label,language:selected.language,quality:selected.quality,job:++job});
    }
    function switchChoice(selected,done) {
        if (!ownsPlayer() || !enabled() || !worker || !ready || switching) return done(new Error('Сесія Alloha вже закрита.'));
        switching = {choice:selected,done:done};
        progress('Оновлення озвучення '+selected.label+'…');
        worker.postMessage({type:'play',season:selected.season,episode:selected.episode,label:selected.label,language:selected.language,quality:selected.quality,job:++job});
    }
    function cancel(preserveCard) { active = false; if (!preserveCard) card = null; choice = null; endPlayback(); }
    function disable() { if (card) cancel(); else if (active || worker) close(); }
    return {open:open,disable:disable,discover:discover,episode:episode,playChoice:playChoice,switchChoice:switchChoice,cancel:cancel};
}));
