/* Samsung source metadata. No listening socket or video-segment relay. */
'use strict';
var Native, initialized = false, stopped = false;
function errorMessage(error) { return String(error && error.message || error).replace(/https?:\/\/\S+/g,'[адреса]').slice(0,300); }
function fail(error) {
    if (!stopped) postMessage({type:'error',message:errorMessage(error)});
}
function allowed(url) {
    if (typeof url === 'string' && /^https:\/\/api\.introdb\.app\/segments\?imdb_id=tt\d+&(?:season=\d+&episode=\d+|is_movie=true)$/.test(url)) return true;
    return typeof url === 'string' && !/[\s<>"\\#]/.test(url) &&
        /^https:\/\/kinobase\.org\/(?:search|(?:film|serial)\/\d+-[^/?]+|static\/js\/hs\.js|user_data|vod\/\d+)(?:\?[^#]*)?$/.test(url);
}
function allowedMetadata(url,post) {
    if (typeof url !== 'string' || url.length > 8192 || /[\s<>"'\\#]/.test(url)) return false;
    if (post) return /^https:\/\/(?:uakino\.best\/ua\/|uaserials\.my\/|uafix\.net\/search\.html)$/.test(url) &&
        typeof post === 'string' && post.length <= 2048 && /^do=search&subaction=search&from_page=1&story=[a-zA-Z0-9%_.!~*()+-]+$/.test(post);
    if (allowed(url)) return true;
    // Public source pages and player configuration only; never account forms,
    // arbitrary POST bodies, media segments, keys or binary video files.
    if (/^https:\/\/(?:uakino\.best|uaserials\.my|uafix\.net)\/(?:[a-zA-Z0-9_%.-]+\/)*(?:[a-zA-Z0-9_%.-]+\.html)?(?:\?[^#]*)?$/.test(url)) return true;
    if (/^https:\/\/(?:(?:ashdi\.vip|zetvideo\.net|tortuga\.(?:tw|wtf))\/(?:vod|serial)\/\d+\/?|hdvbua\.pro\/embed\/\d+\/[a-z0-9]+)(?:\?[^#]*)?$/.test(url)) return true;
    return /^https:\/\/(?:[a-z0-9-]+\.)*(?:ashdi\.vip|hdvbua\.pro|zetvideo\.net|redcdn\.org|threnet\.xyz|tortuga\.(?:tw|wtf))\/[^?#]+\.m3u8(?:\?[^#]*)?$/.test(url);
}
function request(url,metadata,post,referer) {
    post = post || '';
    referer = referer || '';
    if (referer && (!metadata || typeof referer !== 'string' || referer.length > 2048 || !/^https:\/\/(?:uakino\.best|uaserials\.my|uafix\.net)\//.test(referer) || !allowedMetadata(referer,''))) throw new Error('HOST: некоректна сторінка джерела');
    for (var n = 0; n < 5; n++) {
        if (metadata ? !allowedMetadata(url,post) : post || !allowed(url)) throw new Error('HOST: непідтримувана адреса метаданих');
        var status = Native.ccall('lab_get','number',['string','string','string','string','string','string','number'],[url,'',referer,post,'','',8388608]);
        if (status < 0) throw new Error('NETWORK: '+Native.UTF8ToString(Native._lab_error()));
        if ([301,302,303,307,308].indexOf(status) >= 0) {
            var next = Native.UTF8ToString(Native._lab_location());
            next = next.charAt(0) === '/' && next.charAt(1) !== '/' ? /^https:\/\/[^/]+/.exec(url)[0]+next : next;
            if (post && [301,302,303].indexOf(status) >= 0) post = '';
            if (post && /^https:\/\/[^/]+/.exec(url)[0] !== (/^https:\/\/[^/]+/.exec(next) || [''])[0]) throw new Error('HOST: перенаправлення пошуку на інший сервер');
            url = next;
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
    if (typeof tizentvwasm === 'undefined' || !tizentvwasm.SocketsManager) throw new Error('SOCKETS: цей застосунок не надає мережевий API Samsung для пошуку джерел');
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
            var result = request(data.url,data.metadata === true,data.post,data.referer);
            postMessage({type:'response',id:data.id,status:result.status,body:result.body});
        }
    } catch (error) {
        if (!stopped && Native && data.type === 'request') postMessage({type:'requestError',id:data.id,message:errorMessage(error)});
        else fail(error);
    }
};
