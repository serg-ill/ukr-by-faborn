/* ES5 client for an isolated, cookie-preserving Samsung metadata worker. */
(function (root,factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornKinoSession = factory;
}(typeof window !== 'undefined' ? window : this,function (root,base,version) {
    'use strict';
    var worker = null, retiring = null, ready = false, queue = [], active = null, nextId = 0, startupTimer = null;
    function finish(job,error,body,status) {
        root.clearTimeout(job.timer);
        var callback = job.callback; job.callback = null;
        if (callback) callback(error,body || '',status || 0);
    }
    function stop() {
        root.clearTimeout(startupTimer); startupTimer = null; ready = false;
        var old = worker; worker = null;
        if (!old) return;
        retiring = old;
        var ended = false, timer;
        function end() {
            if (ended) return; ended = true;
            root.clearTimeout(timer); old.onmessage = old.onerror = null; old.terminate();
            if (retiring === old) retiring = null;
            pump();
        }
        old.onmessage = function (event) { if (event.data && event.data.type === 'stopped') end(); };
        old.onerror = end;
        timer = root.setTimeout(end,23000);
        try { old.postMessage({type:'stop'}); } catch (ignore) { end(); }
    }
    function fail(error) {
        var jobs = queue; queue = [];
        if (active) jobs.unshift(active);
        active = null; stop();
        jobs.forEach(function (job) { finish(job,error); });
    }
    function start() {
        if (worker || retiring || !queue.length) return;
        if (!root.Worker || !root.WebAssembly || !root.Blob || !root.URL || !root.URL.createObjectURL) return fail(new Error('SOCKETS: цей застосунок не підтримує адаптер сесії Samsung'));
        var blob, current;
        try {
            blob = root.URL.createObjectURL(new root.Blob(['importScripts('+JSON.stringify(base+'kinobase-worker.js?v='+version)+');'],{type:'application/javascript'}));
            current = worker = new root.Worker(blob);
            root.URL.revokeObjectURL(blob); blob = null;
            current.onmessage = function (event) {
                if (worker !== current) return;
                var data = event.data || {};
                if (data.type === 'ready') { ready = true; root.clearTimeout(startupTimer); startupTimer = null; pump(); }
                else if (data.type === 'error') fail(new Error(data.message || 'Помилка адаптера сесії Samsung'));
                else if (data.type === 'response' && active && data.id === active.id) {
                    var job = active; active = null;
                    finish(job,data.status >= 200 && data.status < 300 ? null : new Error('HTTP '+data.status),data.body,data.status);
                    pump();
                }
            };
            current.onerror = function () { if (worker === current) fail(new Error('WASM: не вдалося завантажити адаптер сесії Samsung')); };
            startupTimer = root.setTimeout(function () { if (worker === current) fail(new Error('Час запуску адаптера сесії Samsung вичерпано')); },15000);
            current.postMessage({type:'init',base:base,version:version});
        } catch (error) { if (blob) root.URL.revokeObjectURL(blob); fail(new Error('WASM: не вдалося створити адаптер сесії Samsung')); }
    }
    function pump() {
        if (active || !queue.length) return;
        if (!worker) { start(); return; }
        if (!ready) return;
        active = queue.shift();
        try { worker.postMessage({type:'request',id:active.id,url:active.url}); }
        catch (error) { fail(new Error('WASM: адаптер сесії Samsung зупинився')); }
    }
    function request(url,callback) {
        var job = {id:++nextId,url:url,callback:callback,timer:null};
        var handle = {abort:function () {
            job.callback = null; root.clearTimeout(job.timer);
            var i = queue.indexOf(job); if (i >= 0) queue.splice(i,1);
        }};
        if (!/^https:\/\/kinobase\.org\//.test(url) && !/^https:\/\/api\.introdb\.app\/segments\?imdb_id=tt\d+&(?:season=\d+&episode=\d+|is_movie=true)$/.test(url)) { finish(job,new Error('HOST: непідтримувана адреса метаданих')); return handle; }
        job.timer = root.setTimeout(function () {
            if (!job.callback) return;
            // A stalled synchronous request must retire before another engine is allocated.
            fail(new Error('Час очікування сесії Samsung вичерпано'));
        },24000);
        queue.push(job); pump();
        return handle;
    }
    function cancel() {
        var jobs = queue; queue = [];
        if (active) jobs.unshift(active);
        active = null;
        jobs.forEach(function (job) { job.callback = null; root.clearTimeout(job.timer); });
        stop();
    }
    return {request:request,cancel:cancel};
}));
