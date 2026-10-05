/* Optional HTML5/MSE transport for Faborn Player. No server or decoder. ES5. */
(function (root,factory) {
    if (typeof module==='object' && module.exports) module.exports=factory;
    else root.FabornHlsTransport=factory;
}(typeof window!=='undefined'?window:this,function (root,Hls) {
    'use strict';
    var video=null,hls=null,listeners={},bindings=[],phase='NONE',url='',serial=0,prepared=false;
    var prepareFail=null,seekWait=null,fastRecovery=false,played=false;
    function available() { try { return !!(root.document && Hls && Hls.isSupported()); } catch(ignore) { return false; } }
    function surface() {
        if (!video) {
            video=root.document.createElement('video');video.className='fbp-video';video.preload='auto';
            video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
            video.style.background='#000';video.style.objectFit='contain';
        }
        return video;
    }
    function send(name,a,b) { if (typeof listeners[name]==='function') listeners[name](a,b); }
    function bind(name,fn) { video.addEventListener(name,fn);bindings.push({name:name,fn:fn}); }
    function cancelSeek() {
        if (!seekWait) return;
        video.removeEventListener('seeked',seekWait.fn);root.clearTimeout(seekWait.timer);seekWait=null;
    }
    function reset() {
        serial++;prepared=false;played=false;prepareFail=null;cancelSeek();
        if (video) bindings.forEach(function (entry) { video.removeEventListener(entry.name,entry.fn); });
        bindings=[];
        var old=hls;hls=null;if(old){try{old.destroy();}catch(ignore){}}
        if (video) {
            try { video.pause();video.removeAttribute('src');video.load(); } catch(ignore) {}
        }
    }
    function failure(name,code,token,hlsDetail) {
        if (token!==serial || phase==='NONE') return;
        var error={name:name},detail={error_code:code || 0,demux:'MSE'};
        if(hlsDetail)detail.hls_detail=hlsDetail;
        if(video && video.videoWidth)detail.resolution=video.videoWidth+'x'+video.videoHeight;
        if(video && fastRecovery){
            detail.ready_state=+video.readyState || 0;detail.network_state=+video.networkState || 0;detail.buffer_seconds=0;
            try{for(var i=0;i<video.buffered.length;i++)if(video.currentTime>=video.buffered.start(i) && video.currentTime<=video.buffered.end(i)){detail.buffer_seconds=Math.round((video.buffered.end(i)-video.currentTime)*10)/10;break;}}catch(ignore){}
        }
        send('onerrormsg',name,JSON.stringify(detail));
        if(!prepared && prepareFail){var callback=prepareFail;prepareFail=null;callback(error);}
        else send('onerror',name);
    }
    function open(value,options) {
        if(phase!=='NONE')throw {name:'InvalidStateError'};
        surface();url=value;phase='IDLE';played=false;fastRecovery=!!(options && options.recoverInterrupted);
    }
    function prepareAsync(ok,fail) {
        if(phase!=='IDLE')throw {name:'InvalidStateError'};
        if(!available())throw {name:'MSEUnavailableError'};
        var token=++serial;prepareFail=fail;prepared=false;
        bind('loadedmetadata',function () {
            if(token!==serial || prepared)return;
            prepared=true;prepareFail=null;phase='READY';if(ok)ok();
        });
        bind('timeupdate',function () { if(token===serial)send('oncurrentplaytime',video.currentTime*1000); });
        bind('waiting',function () { if(token===serial)send('onbufferingstart'); });
        bind('playing',function () { if(token===serial){phase='PLAYING';played=true;send('onbufferingcomplete');} });
        bind('ended',function () { if(token===serial)send('onstreamcompleted'); });
        bind('error',function () { failure(video.error && video.error.code===4?'NotSupportedError':'HLSMediaError',video.error && video.error.code,token); });
        // Only the opted-in player loads HLS.js. Keep buffers bounded on TVs.
        hls=new Hls({enableWorker:false,progressive:false,lowLatencyMode:false,
            maxBufferLength:12,maxMaxBufferLength:30,backBufferLength:10,maxBufferSize:41943040});
        hls.on(Hls.Events.ERROR,function (event,data) {
            if(token!==serial || !data)return;
            var code=Number(data.response && data.response.code) || 0;
            // UAFix can reject a signed media URL before HLS.js exhausts its
            // retries. Refresh immediately only for explicit media access errors.
            var mediaRequest=/^(?:frag|key|level|audioTrack|manifest)LoadError$/.test(data.details || '');
            var denied=fastRecovery && prepared && played && phase==='PLAYING' && data.type==='networkError' && mediaRequest && (code===401 || code===403 || code===410);
            if(!data.fatal && !denied)return;
            if(code>=100 && code<=599)send('onevent','PLAYER_MSG_HTTP_ERROR_CODE',String(code));
            var known=Hls.ErrorDetails || {},reason='';
            Object.keys(known).some(function(key){if(known[key]===data.details){reason=known[key];return true;}return false;});
            failure(data.type==='networkError'?'HLSNetworkError':'HLSMediaError',code,token,reason);
        });
        hls.on(Hls.Events.MEDIA_ATTACHED,function () { if(token===serial && hls)hls.loadSource(url); });
        hls.attachMedia(video);
    }
    function play() {
        if(['READY','PAUSED','PLAYING'].indexOf(phase)<0)throw {name:'InvalidStateError'};
        var token=serial,result=video.play();phase='PLAYING';
        if(result && typeof result.then==='function')result.then(null,function () { failure('HTMLPlayError',0,token); });
    }
    function pause() { if(phase!=='PLAYING')throw {name:'InvalidStateError'};video.pause();phase='PAUSED'; }
    function seekTo(ms,ok,fail) {
        cancelSeek();var token=serial;
        if(!prepared || !isFinite(ms) || ms<0) { if(fail)fail({name:'InvalidValuesError'});return; }
        function finish(error) {
            if(token!==serial || !seekWait)return;
            cancelSeek();if(error){if(fail)fail({name:'SeekTimeout'});}else if(ok)ok();
        }
        seekWait={fn:function(){finish(false);},timer:root.setTimeout(function(){finish(true);},6000)};
        video.addEventListener('seeked',seekWait.fn);
        try {
            if(Math.abs(video.currentTime-ms/1000)<.05){finish(false);return;}
            video.currentTime=ms/1000;
        } catch(ignore) { finish(true); }
    }
    function silent() {
        if(video && video.textTracks)for(var i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='hidden';
    }
    return {available:available,surface:surface,open:open,prepareAsync:prepareAsync,play:play,pause:pause,seekTo:seekTo,
        getState:function(){return phase;},getCurrentTime:function(){return video ? video.currentTime*1000 : 0;},
        getDuration:function(){return video && isFinite(video.duration) ? video.duration*1000 : 0;},
        setListener:function(value){listeners=value || {};},setDisplayRect:function(){},
        setDisplayMethod:function(value){surface().style.objectFit=value==='PLAYER_DISPLAY_MODE_FULL_SCREEN'?'cover':'contain';},
        setSilentSubtitle:silent,getTotalTrackInfo:function(){return [];},
        setSelectTrack:function(){throw {name:'NotSupportedError'};},
        stop:function(){reset();phase='IDLE';},close:function(){reset();phase='NONE';listeners={};}
    };
}));
