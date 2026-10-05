/* Runs only in a dedicated worker after explicit user opt-in. */
'use strict';
var Native, Core, routes, selectedTracks = [], embed = '', nativeTimer, stopped = false, initialized = false;
var connection = null, cache = {}, served = 0, accepted = 0, rejected = 0, sentBytes = 0;
var resolverBase = '', resolverKey = '', resolverAuth = '';
var sourcePage = '', movie = null, info = null, selection = {season:0,episode:0}, job = 0;
var streamDescriptor=null, mediaSession=null, mediaError=null, sessionRun=0, localSession=false;
var preparationRun=0, preparationTimer=null, preparationAsync=false;
function cancelPreparation() {
    preparationRun++;
    if (preparationTimer!==null) clearTimeout(preparationTimer);
    preparationTimer=null;
}
function preparationStep(run, action, reject) {
    if (stopped || run!==preparationRun) return;
    function perform() {
        if (stopped || run!==preparationRun) return;
        preparationTimer=null;
        try { action(); } catch(error) { if (reject) reject(error);else fail(error); }
    }
    // cURL is synchronous. Yield between startup requests so queued control
    // tokens and Stop can run before another native request begins. Keep the
    // existing in-player switch path atomic with the active loopback response.
    if (preparationAsync) preparationTimer=setTimeout(perform,0);
    else perform();
}
function stopSession() { sessionRun++;if (mediaSession) mediaSession.stop();mediaSession=null;mediaError=null; }
function emit(type, data) { if (!stopped) postMessage({type:type,data:data || {},job:job}); }
function fail(error) {
    cancelPreparation();
    stopSession();clearInterval(nativeTimer);nativeTimer=null;
    emit('error',{message:String(error && error.message || error).replace(/https?:\/\/\S+/g,'[адреса]').slice(0,350)});
}
function stage(message, phase) { emit('stage',{message:message,phase:phase || ''}); }
function reportTraffic(force) {
    if (!force && accepted > 8 && accepted % 25 !== 0) return;
    emit('traffic',{requests:served,accepted:accepted,rejected:rejected,sentBytes:sentBytes,status:connection && connection.status || 0,kind:connection && connection.kind || ''});
}
function cstring(name) { return Native.UTF8ToString(Native['_' + name]()); }
function request(url, options) {
    options = options || {};
    for (var redirects = 0; redirects < 5; redirects++) {
        if (!Core.allowed(url,options.media)) throw new Error('HOST: непідтримуваний сервер');
        var status = options.controls ? Native.ccall('lab_get_media','number',['string','string','string','string','string','number'],
            [url,options.origin || '',options.referer || '',options.range || '',options.controls,options.limit || 2097152]) :
            Native.ccall('lab_get','number',['string','string','string','string','string','string','number'],
            [url,options.origin || '',options.referer || '',options.post || '',options.borth || '',options.range || '',options.limit || 2097152]);
        if (status < 0) throw new Error('NETWORK: ' + cstring('lab_error'));
        if ([301,302,303,307,308].indexOf(status) >= 0) {
            url = Core.absolute(cstring('lab_location'),url,options.media);
            if (status === 303) options.post = '';
            continue;
        }
        if (status !== 200 && status !== 206) throw new Error('HTTP ' + status + ': '+(options.media?'Alloha CDN · '+(options.kind || (/\.m3u8(?:\?|$)/i.test(url)?'маніфест':'відеосегмент'))+' · ':'')+'джерело не віддало дані');
        return {url:url,status:status,size:Native._lab_size(),ptr:Native._lab_body(),range:cstring('lab_range')};
    }
    throw new Error('NETWORK: забагато перенаправлень');
}
function textRequest(url, options) {
    var r = request(url,options);
    r.text = Native.UTF8ToString(r.ptr);
    return r;
}
function mediaOptions(range,kind) {
    if (mediaError) throw mediaError;
    var token=mediaSession ? mediaSession.token() : '';
    if (streamDescriptor && !token) throw new Error('SESSION: службова сесія Alloha не готова');
    return {origin:Core.origin,referer:embed,media:true,controls:token,kind:kind || '',range:range || '',limit:16777216};
}
function findSource(card) {
    var queries = [card.original_title || card.original_name,card.title || card.name].filter(function (q,i,a) { return q && a.indexOf(q) === i; });
    var origins = ['https://uakinogo.is','https://uakinogo.io'], lastError;
    for (var o = 0; o < origins.length; o++) {
        for (var q = 0; q < queries.length; q++) {
            try {
                stage('UAKinogo · пошук «'+String(queries[q]).slice(0,90)+'»…');
                var html = textRequest(origins[o]+'/',{post:'do=search&subaction=search&from_page=1&story='+encodeURIComponent(String(queries[q]).slice(0,100))}).text;
                var candidates = Core.search(html,origins[o],card);
                for (var i = 0; i < candidates.length; i++) {
                    var page = textRequest(candidates[i].url).text;
                    if (Core.matches(page,card)) { embed = Core.player(page); return candidates[i].url; }
                }
            } catch (error) { lastError = error; }
        }
    }
    throw lastError || new Error('SEARCH: назву, рік і тип картки не знайдено на UAKinogo');
}
function resolve(season, episode, publish, complete) {
    cancelPreparation();
    var run=preparationRun;
    preparationAsync=!publish && !nativeTimer;
    stopSession();streamDescriptor=null;localSession=false;
    if (resolverBase) {
        stage('UAKinogo · запит до бета-обробника…','network');
        var xhr = new XMLHttpRequest();
        xhr.open('POST',resolverBase+'/v1/resolve',false); xhr.timeout=20000;
        xhr.setRequestHeader('Content-Type','application/json');
        if (resolverAuth) xhr.setRequestHeader('Authorization',resolverAuth);
        else if (resolverKey) xhr.setRequestHeader('Authorization','Bearer '+resolverKey);
        xhr.send(JSON.stringify({movie:Core.resolverCard(movie),season:Number(season)||0,episode:Number(episode)||0,fresh:!publish}));
        if (xhr.status!==200) throw new Error(Core.resolverError(xhr.status,xhr.responseText));
        if (xhr.responseText.length>4194304) throw new Error('SERVER: завелика відповідь');
        var result=Core.resolverResult(JSON.parse(xhr.responseText),Number(season)||0,Number(episode)||0);
        selectedTracks=result.tracks;embed=result.referer;sourcePage=result.sourcePage;selection={season:Number(season)||0,episode:Number(episode)||0};
        if (publish) {
            emit('episodes',{episodes:result.episodes});
            emit('resolved',{tracks:selectedTracks.map(function(t,i){return {index:i,label:t.label,language:t.language,qualities:Object.keys(t.qualities)};}),episodes:result.episodes,season:selection.season,episode:selection.episode});
        }
        // Lists may come from Ubuntu, but a media session belongs to the TV's
        // actual IP and browser. Renew it locally before any playback request.
        if (publish) return;
    }
    stage('Отримання сесії другого плеєра…','network');
    preparationStep(run,function () {
        info = Core.fileList(textRequest(embed,{referer:sourcePage}).text);
        if (movie && (info.files.type === 'serial') !== Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv')) throw new Error('MATCH: тип відео не збігається з карткою');
        selection = {season:Number(season) || 0,episode:Number(episode) || 0};
        // Send episode numbers even if the selected episode has not reached this host yet.
        if (publish && movie) emit('episodes',{episodes:Core.episodes(info)});
        var row = Core.entry(info,selection.season,selection.episode);
        var token = new URL(embed).searchParams.get('token');
        var body = 'token='+encodeURIComponent(token)+'&av1=true&autoplay=0&audio='+row.audio;
        var borth = '91ede163547d0d0112d23a4c99329f5ce32db756dcf3f7ab40396bd1b24dd639|' + info.viewport;
        stage('Отримання озвучень і якості…','network');
        preparationStep(run,function () {
            var data = JSON.parse(textRequest(Core.origin + '/bnsi/movies/' + row.id,{origin:Core.origin,referer:embed,post:body,borth:borth}).text);
            streamDescriptor=Core.playbackSession(data);
            localSession=true;
            selectedTracks = Core.tracks(data,Boolean(movie));
            if (!selectedTracks.length) throw new Error('QUALITY: джерело не віддало підтримуваних доріжок');
            var rows = selectedTracks.map(function (t,i) { return {index:i,label:t.label,language:t.language,qualities:Object.keys(t.qualities)}; });
            if (publish) {
                if (movie) emit('resolved',{tracks:rows,episodes:Core.episodes(info),season:selection.season,episode:selection.episode});
                else emit('tracks',rows);
            }
            if (complete) complete();
        });
    });
}
function prepare(index, requestedQuality) {
    if (!localSession) {
        var previous=selectedTracks[index];
        if (!previous) throw new Error('TRACK: обери доступну доріжку');
        playChoice({season:selection.season,episode:selection.episode,label:previous.label,language:previous.language,quality:requestedQuality || '2160p'});return;
    }
    stopSession();
    if (!streamDescriptor) { prepareStream(index,requestedQuality);return; }
    var track=selectedTracks[index], run=sessionRun;
    if (!track) throw new Error('TRACK: обери доступну доріжку');
    stage('Alloha · підтвердження доступу до вибраного потоку…','session');
    // Native worker timers require WorkerGlobalScope as their receiver.
    mediaSession=new Core.StreamSession(self,streamDescriptor,track.audioId,requestedQuality || '2160p',function(){
        if (stopped || run!==sessionRun) return;
        try { prepareStream(index,requestedQuality); } catch(error) { fail(error); }
    },function(error){
        if (stopped || run!==sessionRun) return;
        mediaError=error;
        // As with CDN errors, finish a pending native read before closing AVPlay.
        if (connection) connection.error=error;else fail(error);
    });
    mediaSession.start();
}
function prepareStream(index, requestedQuality) {
    var track = selectedTracks[index];
    if (!track) throw new Error('TRACK: обери доступну доріжку');
    var qualityName = requestedQuality || '2160p', urls = track.qualities[qualityName];
    if (!urls || !urls.length) throw new Error('QUALITY: вибрана якість більше не доступна');
    var master, quality, variant, variantURL, mirror=-1, run=preparationRun;
    cache = {};
    function nextMirror(error) {
        if (++mirror>=urls.length) { fail(error);return; }
        var suffix=urls.length>1 ? ' · сервер '+(mirror+1)+'/'+urls.length : '';
        stage('Перевірка маніфесту '+qualityName+suffix+'…','network');
        preparationStep(run,function () {
            master = textRequest(urls[mirror],mediaOptions('','маніфест '+qualityName));
            quality = Core.resolution(master.text,qualityName);
            variantURL = Core.absolute(quality.uri,master.url,true);
            stage('Отримання списку сегментів '+qualityName+suffix+'…','network');
            preparationStep(run,loadVariant,nextMirror);
        },nextMirror);
    }
    function loadVariant() {
        variant = textRequest(variantURL,mediaOptions('','список сегментів'));
        // Validate and register every URI before passing this stream to AVPlay.
        routes.rewrite(variant.text,variant.url);
        var initFile = /^#EXT-X-MAP:.*?URI="([^"]+)"/m.exec(variant.text);
        if (initFile) {
            stage('Перевірка ініціалізації відео…','network');
            preparationStep(run,function () {
                request(Core.absolute(initFile[1],variant.url,true),mediaOptions('0-1023','ініціалізація відео'));
                loadSegment();
            },nextMirror);
        } else loadSegment();
    }
    function loadSegment() {
        var segment = variant.text.split(/\r?\n/).filter(function (line) { return line && line.charAt(0) !== '#'; })[0];
        if (!segment) throw new Error('HLS: немає сегментів відео');
        stage('Перевірка відеосегмента…','network');
        preparationStep(run,function () {
            request(Core.absolute(segment,variant.url,true),mediaOptions('0-1023','відеосегмент'));
            cache[urls[mirror]] = {text:master.text,url:master.url};
            cache[variantURL] = {text:variant.text,url:variant.url};
            if (!nativeTimer) nativeTimer = setInterval(tick,40);
            emit('play',{url:routes.add(urls[mirror]),label:track.label,language:track.language,quality:qualityName,codecs:quality.codecs,width:quality.width,height:quality.height});
        },nextMirror);
    }
    nextMirror();
}
function playChoice(data) {
    resolve(data.season,data.episode,false,function () {
        var index = -1;
        selectedTracks.some(function (t,i) { if (t.label === data.label && t.language === data.language) { index = i; return true; } });
        if (index < 0) throw new Error('TRACK: вибране озвучення більше не доступне');
        prepare(index,data.quality);
    });
}
function allocated(value) {
    var len = Native.lengthBytesUTF8(value), ptr = Native._malloc(len+1);
    if (!ptr) throw new Error('MEMORY: недостатньо пам’яті');
    Native.stringToUTF8(value,ptr,len+1);
    return {ptr:ptr,length:len,free:true,offset:0};
}
function closeConnection() {
    var error = connection && connection.error;
    if (connection) reportTraffic(Boolean(error));
    if (connection && connection.parts) connection.parts.forEach(function (part) { if (part.free) Native._free(part.ptr); });
    connection = null;
    Native._lab_close_client();
    // Let AVPlay consume the HTTP error and release this connection first.
    // Closing the player from the earlier error event could interrupt its read.
    if (error) fail(error);
}
function respond(status, mime, data, range, head) {
    var header = 'HTTP/1.1 '+status+' '+(status === 206 ? 'Partial Content' : status === 200 ? 'OK' : 'Error')+'\r\n';
    header += 'Content-Type: '+mime+'\r\nContent-Length: '+data.length+'\r\nConnection: close\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n';
    if (range && /^bytes \d+-\d+\/(?:\d+|\*)$/.test(range)) header += 'Content-Range: '+range+'\r\n';
    header += 'Accept-Ranges: bytes\r\n\r\n';
    connection.parts = [allocated(header),data];
    connection.head = head; connection.status = status;
}
function processRequest() {
    var req;
    try { req = Core.parseRequest(connection.request,routes); }
    catch (error) { rejected++; connection.kind = 'rejected'; respond(404,'text/plain',allocated('Not found'),'',false); reportTraffic(true); return; }
    try {
        var result, manifest = /\.m3u8(?:\?|$)/i.test(req.url), stored = cache[req.url];
        connection.kind = manifest ? 'manifest' : 'media';
        if (manifest && stored) result = {status:200,text:stored.text,url:stored.url,range:''};
        else {
            result = request(req.url,mediaOptions(manifest ? '' : req.range));
            if (manifest) result.text = Native.UTF8ToString(result.ptr);
        }
        var data = manifest ? allocated(routes.rewrite(result.text,result.url)) : {ptr:result.ptr,length:result.size,free:false,offset:0};
        respond(result.status,manifest ? 'application/vnd.apple.mpegurl' : /\.ts(?:\?|$)/i.test(req.url) ? 'video/mp2t' : 'video/mp4',data,result.range,req.method === 'HEAD');
        served++;
        reportTraffic(false);
    } catch (error) {
        respond(502,'text/plain',allocated('Upstream unavailable'),'',false);
        connection.error = error;
    }
}
function tick() {
    if (stopped) return;
    try {
        if (!connection && Native._lab_accept() > 0) { accepted++; connection = {request:'',started:Date.now(),parts:null}; reportTraffic(false); }
        if (!connection) return;
        if (Date.now() - connection.started > 30000) { closeConnection(); return; }
        if (!connection.parts) {
            var count = Native._lab_read();
            if (count < 0) { closeConnection(); return; }
            if (count) connection.request += cstring('lab_request');
            if (connection.request.length > 8192) { closeConnection(); return; }
            if (connection.request.indexOf('\r\n\r\n') >= 0) processRequest();
        }
        if (connection && connection.parts) {
            for (var budget = 0; connection.parts.length && budget < 1048576;) {
                var part = connection.parts[0], amount = Math.min(65536,part.length - part.offset);
                if (!amount) {
                    if (part.free) Native._free(part.ptr);
                    connection.parts.shift();
                    if (connection.head) { closeConnection(); return; }
                    continue;
                }
                var sent = Native._lab_send(part.ptr + part.offset,amount);
                if (sent < 0) { closeConnection(); return; }
                if (!sent) break;
                part.offset += sent; budget += sent; sentBytes += sent;
            }
            if (connection && !connection.parts.length) closeConnection();
        }
    } catch (error) { closeConnection(); fail(error); }
}
function init(data) {
    if (initialized) return;
    initialized = true;
    if (!/^https:\/\/[a-z0-9-]+\.github\.io\/[^?#]*\/lib\/4klab\/$/i.test(data.base) &&
        !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/[^?#]*\/lib\/4klab\/$/.test(data.base)) throw new Error('BOOT: некоректна адреса модуля');
    if (typeof tizentvwasm === 'undefined' || !tizentvwasm.SocketsManager) {
        throw new Error('SOCKETS: мережевий API Samsung недоступний у цьому застосунку. Потрібен Tizen 5.5+ із підтримкою Tizen Sockets.');
    }
    stage('Завантаження адаптера Samsung…');
    importScripts(data.base+'core.js?v='+data.version,data.base+'native.js?v='+data.version);
    Core = self.Faborn4KCore;
    if (data.server) {
        var serverConnection=Core.resolverConnection(data.server,data.login,data.password);
        if(!serverConnection)throw new Error('SERVER: перевір адресу, логін і пароль обробника');
        resolverBase=serverConnection.base;resolverAuth=serverConnection.authorization;resolverKey=String(data.key||'');
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET',data.base+'cacert.pem?v='+data.version,false);
    xhr.send();
    if (xhr.status !== 200 || xhr.responseText.indexOf('BEGIN CERTIFICATE') < 0) throw new Error('TLS: не завантажено сертифікати');
    FabornNative({noInitialRun:true,locateFile:function (file) { return data.base+file+'?v='+data.version; },print:function () {},printErr:function () {},onAbort:function () { fail(new Error('WASM: адаптер Samsung не запустився')); }}).then(function (instance) {
        if (stopped) return;
        Native = instance;
        try {
            Native.FS.writeFile('/cacert.pem',xhr.responseText);
            if (!Native._lab_init()) throw new Error('CURL: не вдалося запустити HTTPS');
            var agent=typeof navigator!=='undefined' && navigator.userAgent || 'Mozilla/5.0';
            if (!Native.ccall('lab_set_agent','number',['string'],[agent])) throw new Error('SESSION: не вдалося налаштувати сесію телевізора');
            var port = Native._lab_listen();
            if (port <= 0) throw new Error('LOOPBACK: телевізор не дозволив локальний канал ('+port+')');
            routes = new Core.Routes(port,data.token);
            stage('Мережевий адаптер і локальний канал готові');
            movie = data.movie || null;
            if (resolverBase && !movie) throw new Error('SERVER: відкрий картку фільму чи серіалу');
            if (movie && !resolverBase) sourcePage = findSource(movie);
            else if (!resolverBase) { sourcePage = Core.source; embed = Core.player(textRequest(sourcePage).text); }
            if (data.choice) playChoice(data.choice);
            else resolve(data.season,data.episode,true);
        } catch (error) { fail(error); }
    }); // Samsung 1.39.4.7 returns a thenable Module, not a Promise with catch().
}
onmessage = function (event) {
    var data = event.data || {};
    if (data.job !== undefined) job = data.job;
    try {
        if (data.type === 'stop') {
            cancelPreparation();
            stopped = true; clearInterval(nativeTimer);stopSession();
            if (Native) { closeConnection(); Native._lab_stop(); }
            postMessage({type:'stopped'}); self.close();
        } else if (!stopped && data.type === 'init') init(data);
        else if (!stopped && Native && data.type === 'prepare') prepare(data.index,data.quality);
        else if (!stopped && Native && data.type === 'episode') resolve(data.season,data.episode,true);
        else if (!stopped && Native && data.type === 'play') playChoice(data);
        else if (!stopped && mediaSession && data.type === 'progress') mediaSession.progress(data.current);
    } catch (error) { fail(error); }
};
