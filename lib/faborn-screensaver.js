/* Faborn idle scenes. ES5 / Canvas 2D; no media, WebGL or remote requests.
 * Radial star motion adapted from AnnikaV9/starfield.js (MIT, see STARFIELD-LICENSE).
 */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports=factory;
    else root.FabornScreensaver=factory;
}(typeof window !== 'undefined' ? window : this,function (root,L) {
    'use strict';
    var doc=root.document, ss=L.Screensaver, installed=false, scene=null, oldShow, oldReset, previousClass;
    var listeners=[], wakeKey=null, wakeUntil=0, pointerUntil=0, lastMove=0, applied='';
    var TYPE='faborn_ukr';
    function now() { return Date.now(); }
    function get(key,fallback) { return L.Storage.get('faborn_ukr_screensaver'+(key ? '_'+key : ''),fallback); }
    function mode() { var value=get('','on');return value === 'native' || value === 'off' ? value : 'on'; }
    function style() { var value=get('style','aurora');return value === 'stars' || value === 'clock' ? value : 'aurora'; }
    function delay() { var value=Number(get('time','3'));return ([1,3,5,10].indexOf(value) >= 0 ? value : 3)*60000; }
    function blocked() {
        return !!(doc.hidden || L.Player && L.Player.opened && L.Player.opened() ||
            doc.body && doc.body.classList.contains('player--viewing') || doc.querySelector('.youtube-player'));
    }
    function cancelIdle() { root.clearTimeout(ss.timer);ss.timer=null; }
    function listen(target,name,handler,capture) {
        target.addEventListener(name,handler,!!capture);
        listeners.push(function () { target.removeEventListener(name,handler,!!capture); });
    }
    function consume(event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        else if (event.stopPropagation) event.stopPropagation();
    }
    function stop() {
        if (!scene) return;
        scene.freeze(); // Cancel rendering immediately, including during the native fade-out.
        if (ss.worked) ss.stopSlideshow();
    }
    function resetTimer() {
        if (!installed) return;
        if (mode() === 'native') return oldReset.apply(ss,arguments);
        cancelIdle();ss.time_reset=now();
        if (mode() === 'off' || !ss.enabled || ss.worked || scene || blocked()) return;
        var stamp=now(), timeout=delay();
        ss.timer=root.setTimeout(function () {
            ss.timer=null;
            if (!installed) return;
            // A sleeping TV must receive a fresh idle period when it wakes.
            if (mode() !== 'on' || !ss.enabled || blocked() || now()-stamp < timeout || now()-stamp > timeout+5000) return resetTimer();
            show();
        },timeout);
    }
    function show(type,params) {
        if (!installed) return;
        if (typeof type === 'string' && type !== TYPE) return oldShow.apply(ss,arguments);
        if (type !== TYPE && mode() === 'native') return oldShow.apply(ss,arguments);
        if (type !== TYPE && mode() === 'off' || blocked() || ss.worked || scene || !ss.html) return false;
        oldShow.call(ss,TYPE,params || {});
        return true;
    }
    function keydown(event) {
        var code=event.keyCode || event.which || event.key;
        if (wakeKey !== null && now() < wakeUntil && code === wakeKey) { wakeUntil=now()+2000;return consume(event); }
        wakeKey=null;
        if (scene && !scene.stopped) {
            wakeKey=code;wakeUntil=now()+2000;stop();consume(event);
        }
    }
    function keyup(event) {
        var code=event.keyCode || event.which || event.key;
        if (code === wakeKey) { wakeKey=null;consume(event); }
    }
    function pointer(event) {
        if (scene && !scene.stopped) { pointerUntil=now()+600;stop();consume(event); }
        else if (now() < pointerUntil) consume(event);
        else resetTimer();
    }
    function move(event) {
        if (now()-lastMove < 750) return;
        lastMove=now();pointer(event);
    }
    function visibility() { if (doc.hidden) { stop();cancelIdle(); } else resetTimer(); }
    function playerStart() { if (installed) { stop();cancelIdle(); } }
    function playerEnd() { if (installed) resetTimer(); }

    function Scene() {
        var self=this, element, canvas, context, info, clock, date, hint, frame, timer, start=now(), last=0, lastText=-1;
        var width=960,height=540, stars=[], kind=style(), ended=false;
        this.stopped=false;
        function resize() {
            width=Math.min(1280,root.innerWidth || 1280);
            height=Math.round(width*(root.innerHeight || 720)/(root.innerWidth || 1280));
            if (height > 720) { width=Math.round(width*720/height);height=720; }
            if (canvas) { canvas.width=width;canvas.height=height; }
            stars=[];
        }
        function star(initial) {
            var angle=Math.random()*Math.PI*2, radius=initial ? Math.random()*width*.55 : 5+Math.random()*40;
            return {x:width/2+Math.cos(angle)*radius,y:height/2+Math.sin(angle)*radius,angle:angle,speed:.12+Math.random()*.25,velocity:initial ? Math.random()*1.2 : 0};
        }
        function paintStars(dt) {
            context.fillStyle='rgba(3,8,20,0.38)';context.fillRect(0,0,width,height);
            if (!stars.length) { for (var n=0;n<150;n++) stars.push(star(true)); }
            stars.forEach(function (s,i) {
                var x=s.x,y=s.y;
                s.velocity+=.018*s.speed*dt;s.x+=Math.cos(s.angle)*s.velocity*dt;s.y+=Math.sin(s.angle)*s.velocity*dt;
                context.strokeStyle=i%5 === 0 ? 'rgba(115,165,255,.8)' : 'rgba(205,237,255,.75)';
                context.lineWidth=Math.min(1.8,.55+s.velocity*.12);context.beginPath();context.moveTo(x,y);context.lineTo(s.x+.25,s.y+.25);context.stroke();
                if (s.x < 0 || s.y < 0 || s.x > width || s.y > height) stars[i]=star(false);
            });
        }
        function paintAurora(t) {
            var base=context.createLinearGradient(0,0,width,height);
            base.addColorStop(0,'#040c23');base.addColorStop(.6,'#081632');base.addColorStop(1,'#100b2a');
            context.fillStyle=base;context.fillRect(0,0,width,height);
            var colors=['48,225,193','34,149,245','142,92,248'];
            for (var band=0;band<3;band++) {
                var top=height*(.22+band*.16), gradient=context.createLinearGradient(0,top-height*.17,0,top+height*.5);
                gradient.addColorStop(0,'rgba('+colors[band]+',0)');gradient.addColorStop(.45,'rgba('+colors[band]+',.24)');gradient.addColorStop(.65,'rgba('+colors[band]+',.11)');gradient.addColorStop(1,'rgba('+colors[band]+',0)');
                context.fillStyle=gradient;context.beginPath();
                for (var x=-40;x<=width+40;x+=20) {
                    var y=top+Math.sin(x/width*3.8+t*.12+band*1.9)*height*.13+Math.cos(x/width*7-t*.07)*height*.05;
                    if (x === -40) context.moveTo(x,y);else context.lineTo(x,y);
                }
                for (var xx=width+40;xx>=-40;xx-=20) context.lineTo(xx,top+height*.4+Math.sin(xx/width*4.2+t*.11+band*1.9)*height*.12);
                context.closePath();context.fill();
            }
        }
        function updateText(t) {
            var second=Math.floor(t);if (second === lastText) return;lastText=second;
            var d=new Date(), h=d.getHours(), m=d.getMinutes();
            clock.textContent=(h<10 ? '0' : '')+h+':'+(m<10 ? '0' : '')+m;
            var days=['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'];
            var months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
            date.textContent=days[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()];
            info.style.left=(32+Math.sin(t/85)*20)+'%';info.style.top=(38+Math.sin(t/69+1)*20)+'%';
            if (hint) hint.style.opacity=t > 10 ? '0' : '0.55';
        }
        function tick() {
            frame=null;timer=null;
            if (ended || self.stopped) return;
            if (blocked()) { stop();return; }
            var stamp=now();
            if (!last || stamp-last >= 48) {
                var dt=Math.min(3,(stamp-last || 50)/16.667), t=(now()-start)/1000;last=stamp;
                if (context) { if (kind === 'stars') paintStars(dt);else paintAurora(t); }
                updateText(t);
            }
            if (kind === 'clock' || !context) timer=root.setTimeout(tick,1000);
            else if (root.requestAnimationFrame) frame=root.requestAnimationFrame(tick);
            else timer=root.setTimeout(tick,50);
        }
        this.create=function () {
            scene=self;element=doc.createElement('div');element.className='fbr-saver fbr-saver--'+kind;
            element.setAttribute('role','presentation');
            if (kind !== 'clock') {
                canvas=doc.createElement('canvas');canvas.className='fbr-saver__canvas';element.appendChild(canvas);
                try { context=canvas.getContext('2d'); } catch (ignore) { context=null; }
            }
            info=doc.createElement('div');info.className='fbr-saver__info';
            clock=doc.createElement('div');clock.className='fbr-saver__clock';
            date=doc.createElement('div');date.className='fbr-saver__date';
            var brand=doc.createElement('div');brand.className='fbr-saver__brand';brand.textContent='FABORN';
            info.appendChild(clock);info.appendChild(date);info.appendChild(brand);element.appendChild(info);
            hint=doc.createElement('div');hint.className='fbr-saver__hint';hint.textContent='Натисни будь-яку кнопку';element.appendChild(hint);
            resize();root.addEventListener('resize',resize);updateText(0);tick();
        };
        this.render=function () { return element; };
        this.freeze=function () {
            self.stopped=true;
            if (frame !== null && root.cancelAnimationFrame) root.cancelAnimationFrame(frame);
            root.clearTimeout(timer);frame=null;timer=null;
        };
        this.destroy=function () {
            if (ended) return;ended=true;self.freeze();root.removeEventListener('resize',resize);
            if (element && element.parentNode) element.parentNode.removeChild(element);
            stars=[];context=null;
            if (scene === self) { scene=null;resetTimer(); }
        };
    }
    function apply() {
        if (!installed) return;
        var signature=mode()+':'+style()+':'+delay();
        if (signature !== applied) { applied=signature;stop();resetTimer(); }
    }
    function install() {
        if (installed) return true;
        if (!ss || !ss.class_list || !ss.show || !ss.resetTimer || !ss.stopSlideshow || !doc) return false;
        oldShow=ss.show;oldReset=ss.resetTimer;previousClass=ss.class_list[TYPE];
        applied='';wakeKey=null;pointerUntil=0;
        ss.class_list[TYPE]=Scene;ss.show=show;ss.resetTimer=resetTimer;installed=true;
        var css=doc.createElement('style');css.id='fbr-saver-style';
        css.textContent='.fbr-saver{position:absolute;inset:0;top:0;left:0;right:0;bottom:0;background:#030814;overflow:hidden;color:#e6f0ff;font-family:inherit}.fbr-saver__canvas{position:absolute;width:100%;height:100%;top:0;left:0}.fbr-saver__info{position:absolute;transform:translate(-50%,-50%);text-align:center;white-space:nowrap;transition:left 1s linear,top 1s linear}.fbr-saver__clock{font-size:7.6em;line-height:1.12;font-weight:200;letter-spacing:-.055em;font-variant-numeric:tabular-nums;text-shadow:0 .02em .22em rgba(0,0,0,.2)}.fbr-saver__date{font-size:1.25em;letter-spacing:.04em;opacity:.75;margin-top:.65em}.fbr-saver__brand{font-size:.65em;letter-spacing:.6em;opacity:.33;margin-top:3em;padding-left:.6em}.fbr-saver__hint{position:absolute;bottom:5%;left:0;right:0;text-align:center;font-size:.85em;letter-spacing:.04em;transition:opacity 2s}.fbr-saver--clock .fbr-saver__clock{color:#9eb2ca}.fbr-saver--clock .fbr-saver__date{opacity:.6}';
        doc.head.appendChild(css);listeners.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });
        listen(root,'keydown',keydown,true);listen(root,'keyup',keyup,true);
        ['mousedown','touchstart','click'].forEach(function (name) { listen(root,name,pointer,true); });
        listen(root,'mousemove',move,true);listen(doc,'visibilitychange',visibility);listen(root,'focus',resetTimer);
        if (L.Player && L.Player.listener) {
            L.Player.listener.follow('start',playerStart);L.Player.listener.follow('destroy',playerEnd);
            listeners.push(function () {
                if (L.Player.listener.remove) { L.Player.listener.remove('start',playerStart);L.Player.listener.remove('destroy',playerEnd); }
            });
        }
        apply();return true;
    }
    function destroy() {
        if (!installed) return;
        installed=false;cancelIdle();stop();if (scene) scene.destroy();
        listeners.forEach(function (remove) { remove(); });listeners=[];
        if (ss.show === show) ss.show=oldShow;
        if (ss.resetTimer === resetTimer) ss.resetTimer=oldReset;
        if (ss.class_list[TYPE] === Scene) { if (previousClass) ss.class_list[TYPE]=previousClass;else delete ss.class_list[TYPE]; }
        ss.resetTimer();
    }
    return {install:install,apply:apply,destroy:destroy,preview:function () { return installed && show(TYPE); },active:function () { return !!(scene && !scene.stopped); }};
}));
