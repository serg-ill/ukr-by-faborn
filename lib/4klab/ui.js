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
    function escape(value) { return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function status(value) {
        try { L.Storage.set('faborn_ukr_lab4k_status',value); } catch (ignore) {}
    }
    function enabled() { return L.Storage.get('faborn_ukr_lab4k','off') === 'on'; }
    function clearTimer() { if (timer !== null) root.clearTimeout(timer); timer = null; }
    function ownsPlayer() {
        try { var data = L.Player.playdata(); return playing && data && data.faborn_4klab === true; }
        catch (ignore) { return false; }
    }
    function stopWorker() {
        serial++; clearTimer(); pendingStart = null; ready = false;
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
    function close() {
        var own = ownsPlayer();
        playing = false; active = false; stopWorker();
        if (own) L.Player.close();
        L.Select.hide();
        if (card && card.callbacks.back) card.callbacks.back();
        else L.Controller.toggle(back);
    }
    function menu(title,items,choose) {
        L.Select.hide();
        L.Select.show({title:title,items:items.map(function (row) {
            return {title:escape(row.title),subtitle:escape(row.subtitle),action:row.action,index:row.index};
        }),onSelect:function (row) { choose(row); },onBack:close});
    }
    function failed(message) {
        if (!active) return;
        var own = ownsPlayer();
        playing = false; stopWorker();
        if (own) L.Player.close();
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
        clearTimer(); L.Select.hide(); L.Controller.toggle(back);
        playing = true; started = false;
        playingQuality = data.quality || '2160p';
        var item = card && card.callbacks.playerData ? card.callbacks.playerData(data) : {title:'4K · Оппенгеймер · '+data.label,voice_name:data.label};
        item.url = data.url; item.faborn_4klab = true; item.quality = {}; item.quality[playingQuality] = data.url; item.playlist = [];
        if (!card && L.Timeline && L.Utils) item.timeline = L.Timeline.view(L.Utils.hash('faborn|4klab|oppenheimer'));
        if (card && card.callbacks.beforePlay) card.callbacks.beforePlay();
        status('Передано AVPlay · '+data.width+'×'+data.height+' · '+data.codecs+' · '+data.language);
        arm(40000,'PLAY: відео не почалося за 40 с. '+playingQuality+' · '+data.codecs+'; перевірте підтримку кодека і доступ AVPlay до локального каналу.');
        try {
            if (L.Player.playlist) L.Player.playlist([]);
            L.Player.play(item);
        } catch (error) { failed('PLAY: '+error.message); }
    }
    function installListeners() {
        if (followInstalled) return;
        followInstalled = true;
        if (L.Player.listener) {
            L.Player.listener.follow('start',function (data) {
                if (active && (!data || !data.faborn_4klab)) { playing = false; active = false; stopWorker(); }
            });
            L.Player.listener.follow('destroy',function () {
                if (playing) { playing = false; active = false; stopWorker(); }
            });
            L.Player.listener.follow('ready',function (data) {
                if (!ownsPlayer() || !L.PlayerVideo || !L.PlayerVideo.video) return;
                try {
                    var video = L.PlayerVideo.video();
                    if (video && video.addEventListener) video.addEventListener('error',function (event) {
                        if (!ownsPlayer() || L.Player.playdata() !== data) return;
                        var detail = event && event.error || '', message = typeof detail === 'object' ? detail.message || detail.code : detail;
                        failed('PLAY: AVPlay · '+String(message || 'невідома помилка').replace(/https?:\/\/\S+/g,'[адреса]').slice(0,180));
                    });
                } catch (ignore) {}
            });
        }
        if (L.PlayerVideo && L.PlayerVideo.listener) {
            L.PlayerVideo.listener.follow('timeupdate',function (event) {
                if (ownsPlayer() && event && event.current > 0 && !started) {
                    started = true; clearTimer(); status('Відтворення почалося · '+playingQuality+' · телевізор отримує відео без зовнішнього проксі');
                }
            });
            L.PlayerVideo.listener.follow('error',function () {
                if (ownsPlayer()) failed('PLAY: AVPlay повідомив помилку '+playingQuality+'. Маніфест і відеосегмент отримано; відтворення телевізором не підтверджене.');
            });
        }
    }
    function open(controller, fromCard) {
        if (!enabled()) return;
        if (ownsPlayer()) return;
        if (!fromCard) { card = null; choice = null; }
        stopWorker(); active = true; playing = false; lastStage = '';
        back = controller || back;
        installListeners();
        if (!root.webapis || !root.webapis.avplay) { failed('AVPLAY: цей тест запускається в застосунку Lampa на Samsung Tizen'); return; }
        if (L.Storage.field && L.Storage.field('player') !== 'tizen') { failed('PLAYER: обери Tizen / AVPlay у налаштуваннях плеєра Lampa'); return; }
        if (!root.Worker || !root.WebAssembly || !root.Blob || !root.crypto || !root.crypto.getRandomValues) {
            failed('COMPAT: у застосунку відсутні WebAssembly, Worker або Web Crypto'); return;
        }
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
                else if (msg.type === 'error') failed(msg.data.message);
            };
            worker.onerror = function () { if (run === serial) failed('WORKER: застосунок заблокував завантаження або виконання адаптера'); };
            var init = {type:'init',base:base,version:version,token:token,job:++job};
            if (card) { init.movie = card.movie; init.season = card.season; init.episode = card.episode; if (choice) init.choice = choice; }
            worker.postMessage(init);
        } catch (error) { failed('WORKER: '+error.message); }
        }
        if (retiring) { progress('Завершення попередньої перевірки…'); pendingStart = start; }
        else start();
    }
    function discover(movie, season, episode, callbacks) {
        card = {movie:movie,season:season,episode:episode,callbacks:callbacks || {}}; choice = null;
        open(null,true);
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
    function cancel(preserveCard) { var own = ownsPlayer(); playing = false; active = false; stopWorker(); if (!preserveCard) card = null; choice = null; if (own) L.Player.close(); }
    function disable() { if (card) cancel(); else if (active || worker) close(); }
    return {open:open,disable:disable,discover:discover,episode:episode,playChoice:playChoice,cancel:cancel};
}));
