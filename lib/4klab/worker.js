/* Runs only in a dedicated worker after explicit user opt-in. */
'use strict';
var Native, Core, routes, selectedTracks = [], embed = '', nativeTimer, stopped = false, initialized = false;
var connection = null, cache = {}, served = 0;
function emit(type, data) { if (!stopped) postMessage({type:type,data:data || {}}); }
function fail(error) {
    emit('error',{message:String(error && error.message || error).replace(/https?:\/\/\S+/g,'[адреса]').slice(0,350)});
}
function stage(message) { emit('stage',{message:message}); }
function cstring(name) { return Native.UTF8ToString(Native['_' + name]()); }
function request(url, options) {
    options = options || {};
    for (var redirects = 0; redirects < 5; redirects++) {
        if (!Core.allowed(url,options.media)) throw new Error('HOST: непідтримуваний сервер');
        var status = Native.ccall('lab_get','number',['string','string','string','string','string','string','number'],
            [url,options.origin || '',options.referer || '',options.post || '',options.borth || '',options.range || '',options.limit || 2097152]);
        if (status < 0) throw new Error('NETWORK: ' + cstring('lab_error'));
        if ([301,302,303,307,308].indexOf(status) >= 0) {
            url = Core.absolute(cstring('lab_location'),url,options.media);
            if (status === 303) options.post = '';
            continue;
        }
        if (status !== 200 && status !== 206) throw new Error('HTTP ' + status + ': джерело не віддало дані');
        return {url:url,status:status,size:Native._lab_size(),ptr:Native._lab_body(),range:cstring('lab_range')};
    }
    throw new Error('NETWORK: забагато перенаправлень');
}
function textRequest(url, options) {
    var r = request(url,options);
    r.text = Native.UTF8ToString(r.ptr);
    return r;
}
function mediaOptions(range) {
    return {origin:Core.origin,referer:embed,media:true,range:range || '',limit:16777216};
}
function resolve() {
    stage('Доступ до UAKinogo…');
    embed = Core.player(textRequest(Core.source).text);
    stage('Отримання сесії другого плеєра…');
    var info = Core.session(textRequest(embed,{referer:Core.source}).text);
    var token = new URL(embed).searchParams.get('token');
    var body = 'token='+encodeURIComponent(token)+'&av1=true&autoplay=0&audio=154';
    var borth = '91ede163547d0d0112d23a4c99329f5ce32db756dcf3f7ab40396bd1b24dd639|' + info.viewport;
    stage('Перевірка доріжок 2160p…');
    var data = JSON.parse(textRequest(Core.origin + '/bnsi/movies/' + info.id,{origin:Core.origin,referer:embed,post:body,borth:borth}).text);
    selectedTracks = Core.tracks(data);
    if (!selectedTracks.length) throw new Error('QUALITY: джерело не віддало доріжок 2160p');
    emit('tracks',selectedTracks.map(function (t,i) { return {index:i,label:t.label,language:t.language}; }));
}
function prepare(index) {
    var track = selectedTracks[index];
    if (!track) throw new Error('TRACK: обери доступну доріжку');
    var master, quality, lastError;
    cache = {};
    for (var i = 0; i < track.urls.length; i++) {
        try {
            stage('Перевірка маніфесту 3840×2160…');
            master = textRequest(track.urls[i],mediaOptions());
            quality = Core.resolution(master.text);
            var variantURL = Core.absolute(quality.uri,master.url,true);
            var variant = textRequest(variantURL,mediaOptions());
            // Validate and register every URI before passing this stream to AVPlay.
            routes.rewrite(variant.text,variant.url);
            var segment = variant.text.split(/\r?\n/).filter(function (line) { return line && line.charAt(0) !== '#'; })[0];
            if (!segment) throw new Error('HLS: немає сегментів відео');
            stage('Перевірка відеосегмента…');
            request(Core.absolute(segment,variant.url,true),mediaOptions('0-1023'));
            cache[track.urls[i]] = {text:master.text,url:master.url};
            cache[variantURL] = {text:variant.text,url:variant.url};
            emit('play',{url:routes.add(track.urls[i]),label:track.label,language:track.language,codecs:quality.codecs,width:quality.width,height:quality.height});
            return;
        } catch (error) { lastError = error; }
    }
    throw lastError;
}
function allocated(value) {
    var len = Native.lengthBytesUTF8(value), ptr = Native._malloc(len+1);
    if (!ptr) throw new Error('MEMORY: недостатньо пам’яті');
    Native.stringToUTF8(value,ptr,len+1);
    return {ptr:ptr,length:len,free:true,offset:0};
}
function closeConnection() {
    if (connection && connection.parts) connection.parts.forEach(function (part) { if (part.free) Native._free(part.ptr); });
    connection = null;
    Native._lab_close_client();
}
function respond(status, mime, data, range, head) {
    var header = 'HTTP/1.1 '+status+' '+(status === 206 ? 'Partial Content' : status === 200 ? 'OK' : 'Error')+'\r\n';
    header += 'Content-Type: '+mime+'\r\nContent-Length: '+data.length+'\r\nConnection: close\r\nCache-Control: no-store\r\n';
    if (range && /^bytes \d+-\d+\/(?:\d+|\*)$/.test(range)) header += 'Content-Range: '+range+'\r\n';
    header += 'Accept-Ranges: bytes\r\n\r\n';
    connection.parts = [allocated(header),data];
    connection.head = head;
}
function processRequest() {
    var req;
    try { req = Core.parseRequest(connection.request,routes); }
    catch (error) { respond(404,'text/plain',allocated('Not found'),'',false); return; }
    try {
        var result, manifest = /\.m3u8(?:\?|$)/i.test(req.url), stored = cache[req.url];
        if (manifest && stored) result = {status:200,text:stored.text,url:stored.url,range:''};
        else {
            result = request(req.url,mediaOptions(manifest ? '' : req.range));
            if (manifest) result.text = Native.UTF8ToString(result.ptr);
        }
        var data = manifest ? allocated(routes.rewrite(result.text,result.url)) : {ptr:result.ptr,length:result.size,free:false,offset:0};
        respond(result.status,manifest ? 'application/vnd.apple.mpegurl' : /\.ts(?:\?|$)/i.test(req.url) ? 'video/mp2t' : 'video/mp4',data,result.range,req.method === 'HEAD');
        served++;
        if (served === 1 || served === 3 || served % 25 === 0) emit('traffic',{requests:served});
    } catch (error) {
        respond(502,'text/plain',allocated('Upstream unavailable'),'',false);
        fail(error);
    }
}
function tick() {
    if (stopped) return;
    try {
        if (!connection && Native._lab_accept() > 0) connection = {request:'',started:Date.now(),parts:null};
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
                part.offset += sent; budget += sent;
            }
            if (connection && !connection.parts.length) closeConnection();
        }
    } catch (error) { fail(error); closeConnection(); }
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
            var port = Native._lab_listen();
            if (port <= 0) throw new Error('LOOPBACK: телевізор не дозволив локальний канал ('+port+')');
            routes = new Core.Routes(port,data.token);
            nativeTimer = setInterval(tick,10);
            stage('Мережевий адаптер і локальний канал готові');
            resolve();
        } catch (error) { fail(error); }
    }); // Samsung 1.39.4.7 returns a thenable Module, not a Promise with catch().
}
onmessage = function (event) {
    var data = event.data || {};
    try {
        if (data.type === 'stop') {
            stopped = true; clearInterval(nativeTimer);
            if (Native) { closeConnection(); Native._lab_stop(); }
            postMessage({type:'stopped'}); self.close();
        } else if (!stopped && data.type === 'init') init(data);
        else if (!stopped && Native && data.type === 'prepare') prepare(data.index);
    } catch (error) { fail(error); }
};
