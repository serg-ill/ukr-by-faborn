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
        serial++; clearTimer(); pendingStart = null;
        var old = worker;
        worker = null;
        if (blob) { root.URL.revokeObjectURL(blob); blob = ''; }
        if (old) {
            retiring = old;
            // Give a bounded cURL request time to return so native descriptors can close.
            function finished() {
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
        L.Select.hide(); L.Controller.toggle(back);
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
        menu('4K · Результат перевірки',[
            {title:message,subtitle:'Код і деталі збережені у «Версія та діагностика».',action:'info'},
            {title:'Повторити перевірку',action:'retry'},
            {title:'Закрити',action:'close'}
        ],function (row) { if (row.action === 'retry') open(back); else if (row.action === 'close') close(); });
    }
    function arm(ms,message) { clearTimer(); timer = root.setTimeout(function () { failed(message); },ms); }
    function progress(message) {
        if (!active) return;
        lastStage = message;
        status(message);
        menu('4K · Тест «Оппенгеймер»',[
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
        var item = {url:data.url,title:'4K · Оппенгеймер · '+data.label,voice_name:data.label,
            faborn_4klab:true,quality:{'2160p':data.url},playlist:[]};
        if (L.Timeline && L.Utils) item.timeline = L.Timeline.view(L.Utils.hash('faborn|4klab|oppenheimer'));
        status('Передано AVPlay · '+data.width+'×'+data.height+' · '+data.codecs+' · '+data.language);
        arm(40000,'PLAY: відео не почалося за 40 с. Потік 2160p отримано; потрібні підтримка AV1 і доступ AVPlay до локального каналу.');
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
        }
        if (L.PlayerVideo && L.PlayerVideo.listener) {
            L.PlayerVideo.listener.follow('timeupdate',function (event) {
                if (ownsPlayer() && event && event.current > 0 && !started) {
                    started = true; clearTimer(); status('Відтворення почалося · 2160p · телевізор отримує відео без зовнішнього проксі');
                }
            });
            L.PlayerVideo.listener.follow('error',function () {
                if (ownsPlayer()) failed('PLAY: AVPlay повідомив помилку. Для цього потоку потрібен AV1; мережеві етапи пройдено.');
            });
        }
    }
    function open(controller) {
        if (!enabled()) return;
        if (ownsPlayer()) return;
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
                if (msg.type === 'stage') progress(msg.data.message);
                else if (msg.type === 'tracks') showTracks(msg.data);
                else if (msg.type === 'play') play(msg.data);
                else if (msg.type === 'error') failed(msg.data.message);
            };
            worker.onerror = function () { if (run === serial) failed('WORKER: застосунок заблокував завантаження або виконання адаптера'); };
            worker.postMessage({type:'init',base:base,version:version,token:token});
        } catch (error) { failed('WORKER: '+error.message); }
        }
        if (retiring) { progress('Завершення попередньої перевірки…'); pendingStart = start; }
        else start();
    }
    function disable() { if (active || worker) close(); }
    return {open:open,disable:disable};
}));
