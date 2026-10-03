/* Public source comments. ES5; source markup is data, never attached to the DOM. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornComments = factory;
}(typeof window !== 'undefined' ? window : this, function (root, L, $, options) {
    'use strict';
    options = options || {};
    var records = [], installed = false, cache = [], pageCache = [], jobs = [];
    var supported = {uafix:'UAFix', uaserials:'UASerials'};
    var providers = (options.providers || []).filter(function (p) { return supported[p.id]; });
    var LIMIT = 24, TTL = 4 * 60 * 60 * 1000;
    function str(s) { return s === undefined || s === null ? '' : String(s); }
    function now() { return options.now ? options.now() : Date.now(); }
    function decode(s) {
        var entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ndash:'–',mdash:'—',hellip:'…',laquo:'«',raquo:'»'};
        return str(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,function (all, code) {
            if (code.charAt(0) !== '#') return Object.prototype.hasOwnProperty.call(entities,code.toLowerCase()) ? entities[code.toLowerCase()] : all;
            var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10);
            if (n <= 0 || n > 1114111 || n >= 55296 && n <= 57343) return '';
            if (n <= 65535) return String.fromCharCode(n);
            n -= 65536; return String.fromCharCode(55296 + (n >> 10),56320 + (n & 1023));
        });
    }
    function clean(s) { return str(s).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,''); }
    function plain(s) { return decode(clean(s).replace(/<br\b[^>]*>|<\/(?:p|div|blockquote)>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/[\t \r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim(); }
    function attrs(s) {
        var out = Object.create(null), re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, m;
        while ((m = re.exec(s))) out[m[1].toLowerCase()] = decode(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]);
        return out;
    }
    // Balanced same-tag extraction retains nested spoiler / formatting blocks without a live HTML parser.
    function element(html, match) {
        var re = /<([a-z][\w:-]*)\b([^>]*)>/gi, m;
        while ((m = re.exec(html))) {
            var at = attrs(m[2]);
            if (!match(at,m[1].toLowerCase())) continue;
            var tags = new RegExp('<(/?)'+m[1]+'\\b[^>]*>','gi'), depth = 1, end;
            tags.lastIndex = re.lastIndex;
            while ((end = tags.exec(html))) {
                depth += end[1] ? -1 : 1;
                if (!depth) return {html:html.slice(re.lastIndex,end.index),attrs:at};
            }
            return {html:'',attrs:at};
        }
        return {html:'',attrs:{}};
    }
    function byClass(html, cls) { return element(html,function (a) { return (' '+(a['class'] || '')+' ').indexOf(' '+cls+' ') >= 0; }); }
    function sourceFor(url) { return providers.filter(function (p) { return str(url).indexOf(p.origin+'/') === 0 && !/[\s<>"'\\]/.test(url); })[0]; }
    function parse(html, provider, url) {
        if (!provider || !supported[provider.id] || str(url).indexOf(provider.origin+'/') !== 0) throw new Error('Непідтримуване джерело коментарів');
        if (str(html).length > 2500000) throw new Error('Завелика сторінка джерела');
        html = clean(html);
        var re = /<div\b[^>]*\bid=["']comment-id-(\d+)["'][^>]*>/gi, m, positions = [], seen = {}, comments = [];
        while ((m = re.exec(html)) && positions.length < 160) positions.push({id:m[1],start:re.lastIndex});
        if (!positions.length && !/id=["']dle-comments(?:-list|-form)?["']|class=["'][^"']*full-comms\b/i.test(html)) throw new Error('Не розпізнано блок коментарів');
        positions.forEach(function (p,i) {
            if (seen[p.id] || comments.length >= LIMIT) return;
            var chunk = html.slice(p.start,positions[i+1] ? positions[i+1].start : html.length);
            var body = element(chunk,function (a) { return a.id === 'comm-id-'+p.id; }).html;
            var text = plain(body), author = plain(byClass(chunk,'comm-author').html);
            if (!text || !author) return;
            seen[p.id] = true;
            var header = byClass(chunk,'comm-one').html, date = plain(header).match(/\b\d{1,2}\s+[а-яіїєґa-z]+\s+\d{4}(?:\s+\d{1,2}:\d{2})?|\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?|(?:сьогодні|вчора|позавчора|[ув] (?:понеділок|вівторок|середу|четвер|п['’ʼ]ятницю|суботу|неділю))\s+(?:[уов]\s+)?\d{1,2}:\d{2}/i);
            var rating = element(chunk,function (a) { return /\bratingtypeplus(?:minus)?\b/.test(a['class'] || ''); });
            var score = plain(rating.html), parent = /dle_reply\('\d+',\s*'(\d+)'/.exec(chunk);
            comments.push({id:provider.id+':'+p.id,source:provider.id,sourceName:supported[provider.id],url:url+'#comment-id-'+p.id,author:author.slice(0,100),date:date ? date[0] : '',text:text.slice(0,12000),truncated:text.length > 12000,spoiler:/\b(?:title_spoiler|text_spoiler|spoiler|spoiler-content|dle_spoiler)\b|\[spoiler\]|^\s*(?:спойлер|spoiler)\b/i.test(body),score:/^[+-]?\d{1,6}$/.test(score) ? +score : null,reply:!!(parent && +parent[1])});
        });
        if (positions.length && !comments.length) throw new Error('Не розпізнано текст коментарів');
        return comments;
    }
    function key(movie) {
        var tv = movie.name || movie.first_air_date || movie.media_type === 'tv';
        return str(movie.source || 'tmdb')+':'+(tv ? 'tv:' : 'movie:')+str(movie.id || movie.original_title || movie.original_name || movie.title || movie.name)+':'+str(movie.release_date || movie.first_air_date).slice(0,4);
    }
    function cached(list, id) { return list.filter(function (p) { return p.key === id && p.until > now(); })[0]; }
    function put(list, id, value, ttl) {
        for (var i = list.length-1; i >= 0; i--) if (list[i].key === id || list[i].until <= now()) list.splice(i,1);
        list.push({key:id,value:value,until:now()+ttl});
        if (list.length > 20) list.shift();
    }
    function remember(movie,url,html) {
        var provider = sourceFor(url);
        if (!provider) return;
        try {
            if (!options.sameTitle(movie,options.providerPage(html,url),true)) return;
            put(pageCache,key(movie)+':'+provider.id,{comments:parse(html,provider,url),status:'ok'},TTL);
        } catch (ignore) { /* Optional comments must never break playback discovery. */ }
    }
    function load(movie,done,force) {
        var id = key(movie), hit = !force && cached(cache,id), dead = false, handles = [], result = {comments:[],sources:[]}, timeout;
        var job = {abort:function () { if(dead)return;dead=true;root.clearTimeout(timeout);handles.forEach(function (h) { if(h && h.abort)h.abort(); });var i=jobs.indexOf(job);if(i>=0)jobs.splice(i,1); }};
        if (hit) { timeout=root.setTimeout(function(){if(!dead)done(hit.value);job.abort();},0);return job; }
        jobs.push(job);
        var pending = providers.length, buckets = {}, statuses = {};
        function finish() {
            if (dead) return;
            // Alternate origins so one site's long first page cannot bury the other source.
            for (var i=0; i<LIMIT; i++) providers.forEach(function(p){if(buckets[p.id] && buckets[p.id][i] && result.comments.length<LIMIT)result.comments.push(buckets[p.id][i]);});
            result.sources=providers.map(function(p){return {id:p.id,name:p.name,status:statuses[p.id] || 'timeout',count:(buckets[p.id] || []).length};});
            var errors=result.sources.some(function(s){return !/^(ok|empty|notfound)$/.test(s.status);});
            put(cache,id,result,errors ? 45000 : result.comments.length ? TTL : 900000);
            job.abort();done(result);
        }
        function complete(provider,status,comments) {
            if (dead || statuses[provider.id]) return;
            statuses[provider.id]=status;buckets[provider.id]=comments || [];
            if (--pending === 0) finish();
        }
        function request(url,post,cb) {
            if(dead)return;
            if(!sourceFor(url))return cb(new Error('Невідоме джерело'));
            var handle=options.request(url,function(error,body){if(!dead)cb(error,body);},6500,post);
            if(dead && handle && handle.abort)handle.abort();else handles.push(handle);
        }
        timeout=root.setTimeout(finish,18000);
        if(!pending){finish();return job;}
        providers.forEach(function(provider){
            var pageHit=!force && cached(pageCache,id+':'+provider.id);
            if(pageHit)return complete(provider,pageHit.value.comments.length ? 'ok' : 'empty',pageHit.value.comments);
            var queries=[],names=[movie.title || movie.name,movie.original_title || movie.original_name],qi=0,visited={};
            names.forEach(function(n){var q=str(n).trim().slice(0,100);if(q && queries.indexOf(q)<0)queries.push(q);});
            function search() {
                if(dead)return;
                if(qi>=queries.length)return complete(provider,'notfound');
                request(provider.origin+provider.search,'do=search&subaction=search&from_page=1&story='+encodeURIComponent(queries[qi++]),function(error,html){
                    if(error)return complete(provider,'network');
                    var candidates;
                    try { candidates=options.providerSearch(html,provider).filter(function(r){return sourceFor(r.url) === provider && !visited[r.url] && options.sameTitle(movie,r,false);}).slice(0,2); }
                    catch(ignore){return complete(provider,'format');}
                    function page() {
                        if(dead)return;
                        var candidate=candidates.shift();
                        if(!candidate)return search();
                        visited[candidate.url]=true;
                        request(candidate.url,null,function(error,body){
                            if(error)return complete(provider,'network');
                            try {
                                if(!options.sameTitle(movie,options.providerPage(body,candidate.url),true))return page();
                                var comments=parse(body,provider,candidate.url);
                                put(pageCache,id+':'+provider.id,{comments:comments},TTL);
                                complete(provider,comments.length ? 'ok' : 'empty',comments);
                            } catch(ignore){complete(provider,'format');}
                        });
                    }
                    page();
                });
            }
            search();
        });
        return job;
    }
    function enabled() {
        if (typeof options.enabled === 'function') return options.enabled();
        return !L.Storage || L.Storage.get('faborn_ukr_source_comments','on') !== 'off';
    }
    function textNode(tag,cls,text) { var n=root.document.createElement(tag);n.className=cls;n.textContent=text;return n; }
    function statusText(result) {
        var labels={ok:'є відгуки',empty:'немає відгуків',notfound:'назву не знайдено',network:'немає доступу до сайту',format:'не розпізнано сторінку',timeout:'час очікування вичерпано'};
        return result.sources.map(function(s){return s.name+' · '+(labels[s.status] || 'недоступно');}).join('\n');
    }
    function reader(record,data,reveal) {
        var html=$('<div class="fbr-source-reader"></div>');
        html.append(textNode('div','fbr-source-reader-meta',data.sourceName+' · '+data.author+(data.date ? ' · '+data.date : '')));
        html.append(textNode('div','fbr-source-reader-text',data.spoiler && !reveal ? 'Автор позначив цей коментар як спойлер. Відкрити його?' : data.text+(data.truncated ? '\n\nДуже довгий відгук скорочено. Повна версія — на сайті джерела.' : '')));
        html.append(textNode('div','fbr-source-reader-link',data.truncated ? data.url : '↑ ↓ — прокрутити · Назад — до коментарів'));
        function back(){L.Modal.close();if(!record.dead)record.line.toggle();}
        var params={title:'Коментар · '+data.sourceName,html:html,size:'medium',onBack:back};
        if(data.spoiler && !reveal)params.buttons=[{name:'Показати спойлер',onSelect:function(){L.Modal.close();reader(record,data,true);}}];
        L.Modal.open(params);
    }
    function card(record,data) {
        var node, current=data;
        function paint(next) {
            current=next;
            while(node.firstChild)node.removeChild(node.firstChild);
            node.setAttribute('data-hint',next.status ? next.hint || 'OK — повторити' : next.spoiler ? 'OK — відкрити спойлер' : 'OK — читати');
            var header=textNode('div','fbr-source-head','');
            header.appendChild(textNode('span','fbr-source-origin fbr-source-origin--'+(next.source || 'all'),next.sourceName || 'Faborn'));
            if(next.score !== null && next.score !== undefined){
                var score=textNode('span','fbr-source-score','');
                // This icon is local static markup; all source-supplied values remain text nodes.
                score.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10h-4v11h4M7 10l5-8c3 0 3 3 1 7h5a3 3 0 0 1 3 3l-2 7c0 1-1 2-3 2H7z"/></svg>';
                score.appendChild(textNode('span','',(next.score>0 ? '+' : '')+next.score));score.setAttribute('title','Оцінка відгуку');header.appendChild(score);
            }
            node.appendChild(header);
            node.appendChild(textNode('div','fbr-source-author',next.author || 'Відгуки глядачів'));
            node.appendChild(textNode('div','fbr-source-date',(next.reply ? 'Відповідь · ' : '')+(next.date || (next.status ? 'UAFix · UASerials' : ''))));
            node.appendChild(textNode('div','full-review__text',next.spoiler ? 'Коментар містить спойлер. Натисни OK, щоб вирішити, чи показувати текст.' : next.text));
            node.classList.toggle('fbr-source-spoiler',!!next.spoiler);
        }
        return {create:function(){
            node=root.document.createElement('div');node.className='full-review fbr-source-review selector layer--visible';paint(current);
            $(node).on('hover:enter',function(){if(current.status)start(record,!!record.result);else reader(record,current,false);});
        },render:function(js){return js ? node : $(node);},paint:paint,destroy:function(){if(node)$(node).remove();}};
    }
    function placeholder(text,hint) { return {status:true,text:text,hint:hint,sourceName:'Відгуки з джерел'}; }
    function appendItem(record,data) {
        var element={params:{createInstance:function(){return card(record,data);}}};
        record.line.data.results.push(element);record.line.emit('createAndAppend',element);
    }
    function paintResult(record,result) {
        if(record.dead)return;
        record.result=result;
        var line=record.line, owned=L.Controller.own(line);
        // Reuse the focused first node; no replacement of the line or its controller.
        while(line.items.length>1)line.items.pop().destroy();
        line.data.results=line.data.results.slice(0,1);line.active=0;
        var first=result.comments[0] || placeholder(statusText(result),'OK — повторити пошук');
        line.items[0].paint(first);line.last=line.items[0].render(true);
        result.comments.slice(1).forEach(function(c){appendItem(record,c);});
        if(result.comments.length)appendItem(record,placeholder('Показані відгуки з першої сторінки кожного сайту.\n'+statusText(result),'OK — оновити відгуки'));
        if(owned){L.Controller.collectionSet(line.scroll.render(true));L.Controller.collectionFocus(line.last,line.scroll.render(true));}
        if(L.Layer)L.Layer.visible(line.scroll.render(true));
    }
    function start(record,force) {
        if(record.dead || record.loading || !enabled() || record.result && !force)return;
        record.seen=true;record.loading=true;
        record.line.items[0].paint(placeholder('Шукаємо відгуки до цього фільму або серіалу…','Завантаження…'));
        record.job=load(record.movie,function(result){record.loading=false;record.job=null;paintResult(record,result);},force);
    }
    function cancel(record) { if(record.job)record.job.abort();record.job=null;record.loading=false; }
    function full(event) {
        if(!enabled() || !event || event.type!=='complite' || !event.data || !event.data.movie || !event.link || !L.Maker || !L.Maker.make)return;
        var render=event.object && event.object.activity && event.object.activity.render(), node=render && (render[0] || render);
        // The optional bundle may finish loading after the user has left and destroyed this card.
        if(!node || !root.document.documentElement.contains(node))return;
        var main=event.link;
        if(!main.rows || !main.items || !main.scroll || typeof main.use!=='function' || main._fabornComments)return;
        var record={movie:event.data.movie,main:main,dead:false,result:null,loading:false};
        main._fabornComments=record;records.push(record);
        var line=L.Maker.make('Line',{title:'Коментарі з джерел',results:[],params:{items:{view:LIMIT+1,align_left:true}}},function(mask){return mask.only('Items','Create');});
        record.line=line;
        line.use({onToggle:function(){start(record,false);},onDestroy:function(){record.dead=true;cancel(record);var i=records.indexOf(record);if(i>=0)records.splice(i,1);}});
        line.create();line.render(true).classList.add('fbr-source-comments');
        appendItem(record,placeholder('Коментарі глядачів із сайтів UAFix та UASerials.','OK — завантажити'));
        // Append through the native full component to inherit all TV navigation handlers,
        // then move the already-built row after the description. Native lazy rows retain their indices.
        var position=Math.min(2,main.items.length), anchor=main.items[position];
        main.fragment=root.document.createDocumentFragment();main.emit('append',line);main.scroll.append(main.fragment);
        main.items.pop();main.items.splice(position,0,line);main.rows.splice(position,0,['faborn_comments',{}]);
        if(anchor && anchor.render(true).parentNode)anchor.render(true).parentNode.insertBefore(line.render(true),anchor.render(true));
        if(main.active>=position)main.active++;
        main.use({onPause:function(){cancel(record);},onStart:function(){if(record.seen && !record.result)start(record,false);},onDestroy:function(){record.dead=true;cancel(record);}});
    }
    function changed() {
        if(enabled())return;
        // A live native row cannot be removed without invalidating its parent's navigation indices.
        // Stop work immediately; the setting takes effect on the next full card.
        records.forEach(function(r){cancel(r);if(!r.result)r.line.items[0].paint(placeholder('Коментарі вимкнено. Повторно відкрий картку, щоб приховати цей ряд.','Вимкнено'));});
    }
    function install() {
        if(installed || !L || !L.Listener)return;
        installed=true;L.Listener.follow('full',full);
    }
    return {install:install,full:full,changed:changed,parse:parse,load:load,remember:remember,statusText:statusText};
}));
