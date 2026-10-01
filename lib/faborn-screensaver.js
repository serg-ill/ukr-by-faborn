/* Faborn idle scenes. ES5 / Canvas 2D; no media, WebGL or remote requests.
 * Depth stars and digital rain adapted from MIT sources; see SAVER-WARP-LICENSE / SAVER-MATRIX-LICENSE.
 */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports=factory;
    else root.FabornScreensaver=factory;
}(typeof window !== 'undefined' ? window : this,function (root,L) {
    'use strict';
    var doc=root.document, ss=L.Screensaver, installed=false, scene=null, oldShow, oldReset, previousClass;
    var listeners=[], wakeKey=null, wakeUntil=0, pointerUntil=0, lastMove=0, applied='';
    var TYPE='faborn_ukr', lastSceneStyle='', diagnostic={style:'',frames:0,error:''};
    var STYLES=['aurora','stars','warp','nebula','waves','ribbons','bokeh','fireflies','rain','matrix','orbits','clock'];
    function now() { return Date.now(); }
    function get(key,fallback) { return L.Storage.get('faborn_ukr_screensaver'+(key ? '_'+key : ''),fallback); }
    function mode() { var value=get('','on');return value === 'native' || value === 'off' ? value : 'on'; }
    function style() { var value=get('style','aurora');return STYLES.indexOf(value)>=0 || value==='random' ? value : 'aurora'; }
    function chooseStyle() { var value=style();if(value==='random'){var pool=STYLES.filter(function(s){return s!=='clock' && s!==lastSceneStyle;});value=pool[Math.floor(Math.random()*pool.length)];}lastSceneStyle=value;return value; }
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
        var self=this,element,canvas,context,info,clock,date,hint,frame=null,timer=null,start=now(),last=0,lastText=-1;
        var width=960,height=540,particles=[],columns=[],sprites={},backdrop,atlas,kind=chooseStyle(),ended=false,meteor=null,nextMeteor=4;
        var overlay=get('clock','compact');
        this.stopped=false;
        function random(a,b) { return a+Math.random()*(b-a); }
        function circle(ctx,x,y,r) { ctx.beginPath();ctx.arc(x,y,Math.max(.1,r),0,Math.PI*2);ctx.fill(); }
        function glow(color) {
            if (!sprites[color]) {
                var image=doc.createElement('canvas');image.width=64;image.height=64;
                var ctx=image.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
                g.addColorStop(0,'rgba('+color+',.85)');g.addColorStop(.18,'rgba('+color+',.5)');g.addColorStop(.5,'rgba('+color+',.14)');g.addColorStop(1,'rgba('+color+',0)');
                ctx.fillStyle=g;ctx.fillRect(0,0,64,64);sprites[color]=image;
            }
            return sprites[color];
        }
        function light(ctx,x,y,w,h,color,alpha) { ctx.globalAlpha=alpha;ctx.drawImage(glow(color),x-w/2,y-h/2,w,h);ctx.globalAlpha=1; }
        function resetWarp(p,initial) {
            p.x=random(-width/2,width/2);p.y=random(-height/2,height/2);p.z=initial ? random(.15,1) : 1;
            p.speed=random(.025,.065);p.px=null;p.py=null;
        }
        function prepare() {
            particles=[];columns=[];sprites={};meteor=null;nextMeteor=4;atlas=null;backdrop=null;
            var count=kind === 'warp' ? 220 : kind === 'bokeh' ? 26 : kind === 'fireflies' ? 70 : kind === 'rain' ? 140 : 260;
            for (var i=0;i<count;i++) {
                var p={x:random(0,width),y:random(0,height),r:random(.65,1.8),phase:random(0,Math.PI*2),speed:random(.2,.7),depth:random(.3,1),color:i%3};
                if (kind === 'warp') resetWarp(p,true);
                particles.push(p);
            }
            if (!context) return;
            backdrop=doc.createElement('canvas');backdrop.width=width;backdrop.height=height;
            var bg=backdrop.getContext('2d'),base=bg.createLinearGradient(0,0,width,height);
            base.addColorStop(0,kind === 'fireflies' ? '#02110e' : '#020817');base.addColorStop(1,kind === 'rain' ? '#120b20' : '#080d22');bg.fillStyle=base;bg.fillRect(0,0,width,height);
            if (kind === 'stars') { light(bg,width*.72,height*.35,width*.9,height*.7,'59,94,163',.24);light(bg,width*.25,height*.78,width*.8,height*.5,'30,87,128',.2); }
            if (kind === 'fireflies') {
                light(bg,width*.5,height*.5,width,height,'28,83,45',.28);
                bg.fillStyle='#020c09';for(var b=0;b<20;b++)bg.fillRect(b*width/19,0,random(3,13),height);
            }
            if (kind === 'rain') {
                light(bg,width*.25,height*.65,width*.8,height,'67,73,170',.32);light(bg,width*.78,height*.6,width*.6,height,'157,45,119',.23);
                for(var j=0;j<20;j++) { var bw=width/17,bh=random(height*.12,height*.45),bx=j*bw*.9;bg.fillStyle='#070c17';bg.fillRect(bx,height-bh,bw,bh);bg.fillStyle='rgba(121,152,212,.12)';for(var wy=height-bh+12;wy<height-10;wy+=20)bg.fillRect(bx+bw*.35,wy,3,5); }
            }
            if (kind === 'matrix') {
                var chars='0123456789<>[]+-*/:=',cell=22;
                atlas=doc.createElement('canvas');atlas.width=chars.length*cell;atlas.height=cell*2;
                var ac=atlas.getContext('2d');ac.font='17px monospace';ac.textBaseline='middle';ac.textAlign='center';
                for(var c=0;c<chars.length;c++) { ac.fillStyle='#54e994';ac.fillText(chars.charAt(c),c*cell+11,11);ac.fillStyle='#d1ffe5';ac.fillText(chars.charAt(c),c*cell+11,33); }
                for(var col=0;col<Math.ceil(width/cell);col++) { var glyphs=[];for(var row=0;row<Math.ceil(height/cell);row++)glyphs.push(Math.floor(random(0,chars.length)));columns.push({head:random(-20,height/cell),length:Math.floor(random(8,18)),speed:random(5,10),glyphs:glyphs}); }
            }
        }
        function fallback(error) {
            context=null;if(canvas)canvas.style.display='none';if(info)info.style.display='block';
            if(element)element.className='fbr-saver fbr-saver--clock';
            diagnostic.error=String(error && error.message || error || 'Canvas 2D недоступний').slice(0,120);
        }
        function resize() {
            width=Math.max(1,Math.min(1280,root.innerWidth || 1280));
            height=Math.max(1,Math.round(width*(root.innerHeight || 720)/(root.innerWidth || 1280)));
            if (height > 720) { width=Math.max(1,Math.round(width*720/height));height=720; }
            if (canvas) { canvas.width=width;canvas.height=height; }
            try { prepare(); } catch(error) { fallback(error); }
        }
        function base() { context.globalAlpha=1;context.globalCompositeOperation='source-over';context.drawImage(backdrop,0,0); }
        function paintStars(t,dt,clouds) {
            base();
            if (clouds) {
                light(context,width*(.3+Math.sin(t*.024)*.18),height*(.42+Math.cos(t*.03)*.1),width*.95,height*1.15,'91,55,204',.85);
                light(context,width*(.66+Math.cos(t*.02)*.12),height*.52,width*.8,height,'220,69,137',.6);
                light(context,width*.5,height*(.65+Math.sin(t*.035)*.16),width*.65,height*.65,'34,171,207',.55);
            }
            particles.forEach(function (p,i) {
                p.x=(p.x+dt*p.depth*(clouds ? 3 : 1.8))%width;
                var a=.35+(Math.sin(t*p.speed+p.phase)+1)*.28;
                context.fillStyle=i%9 === 0 ? 'rgba(151,189,255,'+a+')' : 'rgba(223,239,255,'+a+')';circle(context,p.x,p.y,p.r);
                if (p.r>1.65) { context.fillStyle='rgba(159,200,255,'+(a*.15)+')';circle(context,p.x,p.y,p.r*3); }
            });
            if (!clouds && t>=nextMeteor && !meteor) { meteor={x:random(width*.12,width*.75),y:random(height*.05,height*.3),age:0};nextMeteor=t+random(8,15); }
            if (meteor) {
                meteor.age+=dt;var x=meteor.x+meteor.age*width*.32,y=meteor.y+meteor.age*height*.33,a=Math.max(0,Math.sin(Math.min(1,meteor.age/1.3)*Math.PI));
                var g=context.createLinearGradient(x-width*.09,y-height*.09,x,y);g.addColorStop(0,'rgba(170,211,255,0)');g.addColorStop(1,'rgba(226,246,255,'+a+')');context.strokeStyle=g;context.lineWidth=1.5;context.beginPath();context.moveTo(x-width*.09,y-height*.09);context.lineTo(x,y);context.stroke();
                if(meteor.age>1.3)meteor=null;
            }
        }
        // Perspective and depth reset adapted from tdous/star-field-canvas (MIT).
        function paintWarp(dt) {
            base();
            particles.forEach(function (p) {
                p.z-=dt*p.speed;
                if(p.z<.08)resetWarp(p,false);
                var x=width/2+p.x/p.z,y=height/2+p.y/p.z,r=.5+(1-p.z)*1.8;
                if(x<0 || y<0 || x>width || y>height) { resetWarp(p,false);return; }
                context.fillStyle='rgba(200,224,255,'+(.3+(1-p.z)*.65)+')';circle(context,x,y,r);
                if(p.px!==null && Math.abs(x-p.px)+Math.abs(y-p.py)<70) { context.strokeStyle='rgba(130,186,255,.3)';context.lineWidth=r*.65;context.beginPath();context.moveTo(p.px,p.py);context.lineTo(x,y);context.stroke(); }
                p.px=x;p.py=y;
            });
        }
        function paintAurora(t) {
            base();
            var colors=['48,225,193','34,149,245','142,92,248'];
            for(var band=0;band<4;band++) {
                var top=height*(.12+band*.14),gradient=context.createLinearGradient(0,top-height*.2,0,top+height*.55),color=colors[band%3];
                gradient.addColorStop(0,'rgba('+color+',0)');gradient.addColorStop(.38,'rgba('+color+',.34)');gradient.addColorStop(.6,'rgba('+color+',.13)');gradient.addColorStop(1,'rgba('+color+',0)');context.fillStyle=gradient;context.beginPath();
                for(var x=-40;x<=width+40;x+=20) { var y=top+Math.sin(x/width*3.8+t*.12+band*1.9)*height*.13+Math.cos(x/width*7-t*.07)*height*.05;if(x===-40)context.moveTo(x,y);else context.lineTo(x,y); }
                for(var xx=width+40;xx>=-40;xx-=20)context.lineTo(xx,top+height*.5+Math.sin(xx/width*4.2+t*.11+band*1.9)*height*.12);
                context.closePath();context.fill();
            }
        }
        function paintWaves(t,ribbons) {
            base();var colors=ribbons ? ['92,145,255','159,98,255','58,224,205'] : ['22,102,167','22,148,173','24,186,189'];
            for(var i=0;i<(ribbons?15:7);i++) {
                context.beginPath();
                for(var x=-20;x<=width+20;x+=16) { var y=height*(ribbons?.35+i*.018:.4+i*.08)+Math.sin(x/width*(ribbons?5:3.5)+t*(ribbons?.21:.14)+i*.4)*height*.14+Math.cos(x/width*7-t*.16+i*.2)*height*.025;if(x===-20)context.moveTo(x,y);else context.lineTo(x,y); }
                if(ribbons) { context.strokeStyle='rgba('+colors[i%3]+','+(.18+(i%4)*.09)+')';context.lineWidth=1.2+(i%3)*.8;context.stroke(); }
                else { context.lineTo(width+20,height);context.lineTo(-20,height);context.closePath();context.fillStyle='rgba('+colors[i%3]+',.16)';context.fill(); }
            }
        }
        function paintLights(t,dt,flies) {
            base();var colors=flies?['187,231,98','91,218,160','250,208,98']:['84,146,248','194,105,220','82,213,206'];
            particles.forEach(function(p) {
                var x=p.x+Math.sin(t*p.speed*.2+p.phase)*(flies?45:70),y=(p.y-t*(flies?3:5)*p.depth+height*100)%height;
                var r=flies?4+p.depth*5:40+p.depth*90,a=flies?.4+(Math.sin(t*.65+p.phase)+1)*.25:.3+p.depth*.4;
                light(context,x,y,r*2,r*2,colors[p.color],a);
                if(flies) { context.fillStyle='rgba(228,251,156,'+a+')';circle(context,x,y,.8+p.depth); }
            });
        }
        function paintRain(t,dt) {
            base();particles.forEach(function(p) {
                p.y+=dt*(80+p.depth*220);p.x-=dt*(8+p.depth*20);
                if(p.y>height+30){p.y=-30;p.x=random(0,width);}if(p.x<0)p.x=width;
                context.strokeStyle='rgba(168,198,240,'+(.08+p.depth*.25)+')';context.lineWidth=.6+p.depth*.7;context.beginPath();context.moveTo(p.x,p.y);context.lineTo(p.x-2,p.y+10+p.depth*17);context.stroke();
            });
        }
        // Moving drop heads and bounded tails adapted from carlnewton/digital-rain (MIT).
        function paintMatrix(t,dt) {
            context.fillStyle='#010906';context.fillRect(0,0,width,height);
            columns.forEach(function(p,i) {
                p.head+=dt*p.speed;if(p.head-p.length>height/22)p.head=random(-18,-2);
                var head=Math.floor(p.head);
                for(var n=0;n<p.length;n++) { var row=head-n;if(row<0 || row>=p.glyphs.length)continue;var glyph=p.glyphs[row];context.globalAlpha=n===0?.9:Math.max(.08,(1-n/p.length)*.65);context.drawImage(atlas,glyph*22,n===0?22:0,22,22,i*22,row*22,22,22); }
            });context.globalAlpha=1;
        }
        function paintOrbits(t) {
            base();var cx=width*(.5+Math.sin(t*.035)*.06),cy=height*(.5+Math.cos(t*.025)*.05);
            light(context,cx,cy,height*.38,height*.38,'124,158,255',.75);
            for(var i=0;i<7;i++) { var rx=height*(.12+i*.065),ry=rx*.48,angle=t*(.04+i*.006)+i*2;
                context.save();context.translate(cx,cy);context.rotate(-.4+Math.sin(t*.02)*.1);context.scale(1,.48);context.beginPath();context.arc(0,0,rx,0,Math.PI*2);context.strokeStyle='rgba(118,164,223,.14)';context.lineWidth=1;context.stroke();context.restore();
                var px=Math.cos(angle)*rx,py=Math.sin(angle)*ry,turn=-.4+Math.sin(t*.02)*.1,x=cx+px*Math.cos(turn)-py*Math.sin(turn),y=cy+px*Math.sin(turn)+py*Math.cos(turn);
                light(context,x,y,16+i*3,16+i*3,i%2?'160,113,244':'94,210,223',.8);context.fillStyle=i%2?'#bda0ed':'#b0e9f0';circle(context,x,y,1.8+i*.18);
            }
        }
        function updateText(t) {
            var second=Math.floor(t);if(second===lastText)return;lastText=second;
            var d=new Date(),h=d.getHours(),m=d.getMinutes();clock.textContent=(h<10?'0':'')+h+':'+(m<10?'0':'')+m;
            var days=['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'],months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
            date.textContent=days[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()];
            var compact=kind!=='clock' && context && overlay!=='large';
            info.style.left=(compact?22+Math.sin(t/73)*10:42+Math.sin(t/85)*22)+'%';info.style.top=(compact?79+Math.sin(t/69)*6:45+Math.sin(t/69+1)*21)+'%';
            if(hint)hint.style.opacity=t>10?'0':'0.55';
        }
        function tick() {
            frame=null;timer=null;if(ended || self.stopped)return;if(blocked()){stop();return;}
            var stamp=now();
            if(!last || stamp-last>=48) {
                var dt=Math.max(.001,Math.min(.1,(stamp-last || 50)/1000)),t=(stamp-start)/1000;last=stamp;
                if(context)try {
                    if(kind==='stars' || kind==='nebula')paintStars(t,dt,kind==='nebula');
                    else if(kind==='warp')paintWarp(dt);
                    else if(kind==='waves' || kind==='ribbons')paintWaves(t,kind==='ribbons');
                    else if(kind==='bokeh' || kind==='fireflies')paintLights(t,dt,kind==='fireflies');
                    else if(kind==='rain')paintRain(t,dt);
                    else if(kind==='matrix')paintMatrix(t,dt);
                    else if(kind==='orbits')paintOrbits(t);
                    else paintAurora(t);
                    diagnostic.frames++;
                } catch(error) { fallback(error); }
                updateText(t);
            }
            if(kind==='clock' || !context)timer=root.setTimeout(tick,1000);
            else if(root.requestAnimationFrame)frame=root.requestAnimationFrame(tick);
            else timer=root.setTimeout(tick,50);
        }
        this.create=function () {
            scene=self;diagnostic={style:kind,frames:0,error:''};element=doc.createElement('div');element.className='fbr-saver fbr-saver--'+kind+(kind!=='clock' && overlay!=='large'?' fbr-saver--compact':'');element.setAttribute('role','presentation');
            if(kind!=='clock') { canvas=doc.createElement('canvas');canvas.className='fbr-saver__canvas';element.appendChild(canvas);try{context=canvas.getContext('2d');}catch(ignore){context=null;} }
            info=doc.createElement('div');info.className='fbr-saver__info';if(kind!=='clock' && overlay==='off' && context)info.style.display='none';
            clock=doc.createElement('div');clock.className='fbr-saver__clock';date=doc.createElement('div');date.className='fbr-saver__date';
            var brand=doc.createElement('div');brand.className='fbr-saver__brand';brand.textContent='FABORN';info.appendChild(clock);info.appendChild(date);info.appendChild(brand);element.appendChild(info);
            hint=doc.createElement('div');hint.className='fbr-saver__hint';hint.textContent='Натисни будь-яку кнопку';element.appendChild(hint);
            if(kind!=='clock' && !context)fallback('Canvas 2D недоступний');resize();root.addEventListener('resize',resize);updateText(0);tick();
        };
        this.render=function () { return element; };
        this.freeze=function () { self.stopped=true;if(frame!==null && root.cancelAnimationFrame)root.cancelAnimationFrame(frame);root.clearTimeout(timer);frame=null;timer=null; };
        this.destroy=function () {
            if(ended)return;ended=true;self.freeze();root.removeEventListener('resize',resize);if(element && element.parentNode)element.parentNode.removeChild(element);
            particles=[];columns=[];sprites={};backdrop=null;atlas=null;context=null;if(scene===self){scene=null;resetTimer();}
        };
    }
    function apply() {
        if (!installed) return;
        var signature=mode()+':'+style()+':'+delay()+':'+get('clock','compact');
        if (signature !== applied) { applied=signature;stop();resetTimer(); }
    }
    function install() {
        if (installed) return true;
        if (!ss || !ss.class_list || !ss.show || !ss.resetTimer || !ss.stopSlideshow || !doc) return false;
        oldShow=ss.show;oldReset=ss.resetTimer;previousClass=ss.class_list[TYPE];
        applied='';wakeKey=null;pointerUntil=0;
        ss.class_list[TYPE]=Scene;ss.show=show;ss.resetTimer=resetTimer;installed=true;
        var css=doc.createElement('style');css.id='fbr-saver-style';
        css.textContent='.fbr-saver{position:absolute;inset:0;top:0;left:0;right:0;bottom:0;background:#030814;overflow:hidden;color:#e6f0ff;font-family:inherit}.fbr-saver__canvas{position:absolute;width:100%;height:100%;top:0;left:0}.fbr-saver__info{position:absolute;transform:translate(-50%,-50%);text-align:center;white-space:nowrap;transition:left 1s linear,top 1s linear}.fbr-saver__clock{font-size:7.6em;line-height:1.12;font-weight:200;letter-spacing:-.055em;font-variant-numeric:tabular-nums;text-shadow:0 .02em .22em rgba(0,0,0,.2)}.fbr-saver__date{font-size:1.25em;letter-spacing:.04em;opacity:.75;margin-top:.65em}.fbr-saver__brand{font-size:.65em;letter-spacing:.6em;opacity:.33;margin-top:3em;padding-left:.6em}.fbr-saver__hint{position:absolute;bottom:5%;left:0;right:0;text-align:center;font-size:.85em;letter-spacing:.04em;transition:opacity 2s}.fbr-saver--clock .fbr-saver__clock{color:#9eb2ca}.fbr-saver--clock .fbr-saver__date{opacity:.6}.fbr-saver--compact .fbr-saver__clock{font-size:3.5em;letter-spacing:-.045em}.fbr-saver--compact .fbr-saver__date{font-size:.9em;margin-top:.4em}.fbr-saver--compact .fbr-saver__brand{display:none}';
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
    return {install:install,apply:apply,destroy:destroy,styles:function(){return STYLES.slice();},status:function(){return {style:diagnostic.style,frames:diagnostic.frames,error:diagnostic.error};},preview:function () { return installed && show(TYPE); },active:function () { return !!(scene && !scene.stopped); }};
}));
