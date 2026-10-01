/* Metadata-only KinoBase session. No listening socket or video relay. */
'use strict';
var Native, initialized = false, stopped = false;
function fail(error) {
    if (!stopped) postMessage({type:'error',message:String(error && error.message || error).replace(/https?:\/\/\S+/g,'[адреса]').slice(0,300)});
}
function allowed(url) {
    if (typeof url === 'string' && /^https:\/\/api\.introdb\.app\/segments\?imdb_id=tt\d+&(?:season=\d+&episode=\d+|is_movie=true)$/.test(url)) return true;
    return typeof url === 'string' && !/[\s<>"\\#]/.test(url) &&
        /^https:\/\/kinobase\.org\/(?:search|(?:film|serial)\/\d+-[^/?]+|static\/js\/hs\.js|user_data|vod\/\d+)(?:\?[^#]*)?$/.test(url);
}
function request(url) {
    for (var n = 0; n < 5; n++) {
        if (!allowed(url)) throw new Error('HOST: непідтримувана адреса KinoBase');
        var status = Native.ccall('lab_get','number',['string','string','string','string','string','string','number'],[url,'','','','','',8388608]);
        if (status < 0) throw new Error('NETWORK: '+Native.UTF8ToString(Native._lab_error()));
        if ([301,302,303,307,308].indexOf(status) >= 0) {
            var next = Native.UTF8ToString(Native._lab_location());
            url = next.charAt(0) === '/' && next.charAt(1) !== '/' ? /^https:\/\/[^/]+/.exec(url)[0]+next : next;
            continue;
        }
        return {status:status,body:Native._lab_size() ? Native.UTF8ToString(Native._lab_body()) : ''};
    }
    throw new Error('NETWORK: забагато перенаправлень');
}
function init(data) {
    if (initialized) return;
    initialized = true;
    if (!/^(?:https:\/\/[a-z0-9-]+\.github\.io|http:\/\/(?:localhost|127\.0\.0\.1):\d+)\/[^?#]*\/lib\/4klab\/$/.test(data.base)) throw new Error('BOOT: некоректна адреса модуля');
    if (typeof tizentvwasm === 'undefined' || !tizentvwasm.SocketsManager) throw new Error('SOCKETS: цей застосунок не надає мережевий API Samsung для сесії KinoBase');
    importScripts(data.base+'native.js?v='+data.version);
    var xhr = new XMLHttpRequest();
    xhr.open('GET',data.base+'cacert.pem?v='+data.version,false); xhr.send();
    if (xhr.status !== 200 || xhr.responseText.indexOf('BEGIN CERTIFICATE') < 0) throw new Error('TLS: не завантажено сертифікати');
    FabornNative({noInitialRun:true,locateFile:function (file) { return data.base+file+'?v='+data.version; },print:function () {},printErr:function () {},onAbort:function () { fail(new Error('WASM: адаптер Samsung не запустився')); }}).then(function (instance) {
        Native = instance;
        if (stopped) { Native._lab_stop(); return; }
        try {
            Native.FS.writeFile('/cacert.pem',xhr.responseText);
            if (!Native._lab_init()) throw new Error('CURL: не вдалося запустити HTTPS');
            postMessage({type:'ready'});
        } catch (error) { fail(error); }
    });
}
onmessage = function (event) {
    var data = event.data || {};
    try {
        if (data.type === 'stop') {
            stopped = true;
            if (Native) Native._lab_stop();
            postMessage({type:'stopped'}); self.close();
        } else if (!stopped && data.type === 'init') init(data);
        else if (!stopped && Native && data.type === 'request') {
            var result = request(data.url);
            postMessage({type:'response',id:data.id,status:result.status,body:result.body});
        }
    } catch (error) { fail(error); }
};
