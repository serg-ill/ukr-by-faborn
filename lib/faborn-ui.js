/* Faborn interface: native Lampa navigation, local ratings, verified source badges. ES5. */
(function (root,factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornInterface = factory;
}(typeof window !== 'undefined' ? window : this,function (root,L,$) {
    'use strict';
    var doc = root.document, records = [], homeCards = [], originalMain, mainWrapper, installed = false;
    var TTL = 24*60*60*1000, MAX = 180;
    function str(v) { return v === undefined || v === null ? '' : String(v); }
    function esc(v) { return str(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function get(key,fallback) { try { return L.Storage.get('faborn_ukr_'+key,fallback); } catch (ignore) { return fallback; } }
    function set(key,value) { try { L.Storage.set('faborn_ukr_'+key,value); } catch (ignore) {} }
    function on(key) { return get('layout','panel') !== 'classic' && get(key,'on') === 'on'; }
    function identity(movie) {
        if (!movie || !/^\d+$/.test(str(movie.id))) return '';
        return (movie.media_type === 'tv' || movie.first_air_date || movie.original_name ? 'tv:' : 'movie:')+movie.id;
    }
    var paths = {
        star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>',
        film:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4"/>',
        tv:'<rect x="3" y="5" width="18" height="13" rx="3"/><path d="M9 21h6M12 18v3"/>',
        quality:'<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M6 10V8h3M15 8h3v2M18 14v2h-3M9 16H6v-2"/>',
        globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
        sparkle:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4"/>',
        sound:'<path d="m10 5-5 4H2v6h3l5 4ZM14 8a6 6 0 0 1 0 8M17 5a10 10 0 0 1 0 14"/>',
        trophy:'<path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21h8M9 18h6"/>',
        clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
        bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
        check:'<path d="m5 12 4 4L19 6"/>',
        fresh:'<path d="M12 3v4M3 12h4M17 12h4M12 17v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>'
    };
    function icon(name) { return '<svg class="fbr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] || paths.film)+'</svg>'; }
    function score(value,max) {
        var n = parseFloat(str(value).replace(',','.'));
        return isFinite(n) && n > 0 && n <= max ? (max === 10 ? n.toFixed(1) : String(Math.round(n))) : '';
    }
    function ratingFacts(movie,extra) {
        extra = extra || {};
        var rows = [], specs = [
            ['tmdb','TMDB',movie.vote_average,10],['imdb','IMDb',movie.imdb_rating,10],
            ['rt','Rotten Tomatoes',movie.rotten_tomatoes_rating || movie.rt_rating,100],
            ['mc','Metacritic',movie.metacritic_rating || movie.metascore,100]
        ];
        specs.forEach(function (s) { var value = score(extra[s[0]] || s[2],s[3]); if (value) rows.push({id:s[0],name:s[1],value:value,scale:s[0] === 'rt' ? '%' : '/'+s[3]}); });
        return rows;
    }
    function awardFacts(movie,extra) {
        var awards=movie.awards || movie.Awards || {}, raw=typeof awards === 'string' ? awards : '', oscars, wins;
        extra=extra || {};
        oscars=extra.oscars || movie.oscar_wins || (typeof movie.oscars === 'number' ? movie.oscars : 0) || (awards.oscars && awards.oscars.wins) || awards.oscar_wins;
        wins=extra.awards || movie.awards_wins || awards.wins;
        var match=raw.match(/\bwon\s+(\d+)\s+Oscars?\b/i);if(!oscars && match) oscars=+match[1];
        match=raw.match(/(\d+)\s+wins?\b/i);if(!wins && match) wins=+match[1];
        var out=[];
        [[oscars,'oscars','Оскари'],[wins,'awards','Перемоги']].forEach(function (item) { var n=Number(item[0]);if(n>0 && n<=100000 && Math.floor(n)===n) out.push({id:item[1],name:item[2],value:String(n),scale:''}); });
        return out;
    }
    function ratingIcon(name) {
        var art={
            imdb:'<path d="m16 2.5 4.1 8.3 9.2 1.3-6.6 6.5 1.5 9.1-8.2-4.3-8.2 4.3 1.6-9.1-6.7-6.5 9.2-1.3Z" fill="#FFD15C"/><path d="m16 2.5 4.1 8.3-4.1 5.6Z" fill="#FFF1B0"/><path d="m16 16.4 8.2 11.3-1.5-9.1 6.6-6.5Z" fill="#E9A527"/>',
            tmdb:'<path d="M2 3h12v4h-4v8H6V7H2Zm14 0h4l3 5 3-5h4v12h-4V9l-3 4-3-4v6h-4Z" fill="#57D4DD"/><path d="M2 18h6c4 0 6 2 6 6s-2 6-6 6H2Zm4 3v6h2c2 0 2-1 2-3s0-3-2-3Zm11-3h7c5 0 6 4 3 6 4 2 2 6-2 6h-8Zm4 3v2h3c1 0 1-2 0-2Zm0 4v2h3c2 0 2-2 0-2Z" fill="#55ACF5"/>',
            rt:'<path d="M15 8C7 3 1 12 4 21c3 11 21 11 24-1 2-9-5-15-13-12Z" fill="#F34843"/><path d="M22 10c6 3 5 13-1 17 8-1 10-14 1-17Z" fill="#C72D35"/><path d="m16 10-7-2 5-2-2-4 5 3 4-3-1 5 7 1-7 3-3 5Z" fill="#52CC82"/><path d="M9 14c-2 2-2 5-1 7" fill="none" stroke="#FFA28F" stroke-width="2" stroke-linecap="round"/>',
            mc:'<circle cx="16" cy="16" r="14" fill="#202B3D" stroke="#F4CE51" stroke-width="2.5"/><path d="M8 22V12h4v2c2-3 6-3 8 0 2-3 6-3 6 2v6h-4v-6c0-2-3-2-3 0v6h-4v-6c0-2-3-2-3 0v6Z" fill="#F5F7FD"/>',
            oscars:'<circle cx="16" cy="5" r="3" fill="#FFE1A0"/><path d="m12 9-2 7 3 3 1 7h4l1-7 3-3-2-7-4 2Z" fill="#EBC76E"/><path d="m12 11 4 6 4-6M13 19h6" fill="none" stroke="#A77B35" stroke-width="1.4"/><path d="M11 26h10v3H11ZM8 29h16v2H8Z" fill="#FFE1A0"/>',
            awards:'<path d="M9 3h14v8c0 9-14 9-14 0Z" fill="#F4CD62"/><path d="M9 6H4v4c0 5 5 6 7 6M23 6h5v4c0 5-5 6-7 6" fill="none" stroke="#DDA94B" stroke-width="2.5"/><path d="M15 18h3v7h-3ZM10 25h13v3H10ZM7 28h19v3H7Z" fill="#F4CD62"/><path d="M12 5h3v7c0 2 1 3 1 3-4-1-4-3-4-10Z" fill="#FFF0B3"/>'
        };
        return art[name] ? '<svg class="fbr-rating-icon" viewBox="0 0 32 32" aria-hidden="true">'+art[name]+'</svg>' : icon('star');
    }
    function ratingMarkup(rows) {
        return rows.map(function (r) { return '<div class="fbr-rating fbr-rating--'+esc(r.id)+'" title="'+esc(r.name)+'"><span class="fbr-rating-logo">'+ratingIcon(r.id)+'</span><span class="fbr-rating-body"><small>'+esc(r.name)+'</small><strong>'+esc(r.value)+(r.scale ? '<em>'+esc(r.scale)+'</em>' : '')+'</strong></span></div>'; }).join('');
    }
    function cachedQuality(movie,now) {
        var key = identity(movie), data = get('quality_cache',{}), record = key && data && data[key];
        if (!record || !record.checkedAt || (now || Date.now())-record.checkedAt > TTL || record.checkedAt > (now || Date.now())+60000) return null;
        return record;
    }
    function qualityFacts(record) {
        if (!record) return [];
        var allowed = ['2160p','1440p','1080p','720p','480p','360p'], result = [], qualities = record.qualities || [];
        var quality = allowed.filter(function (q) { return qualities.indexOf(q) >= 0; })[0];
        if (quality) result.push({icon:'quality',label:quality === '2160p' ? '4K' : quality === '1080p' ? 'Full HD' : quality,kind:'quality'});
        // HDR/Dolby/surround are never guessed from resolution, filename or TMDB.
        if (record.hdr === true) result.push({icon:'sparkle',label:'HDR',kind:'hdr'});
        if (record.dolbyVision === true) result.push({icon:'sparkle',label:'Dolby Vision',kind:'hdr'});
        var langs = ['uk','en','ru'].filter(function (lang) { return (record.languages || []).indexOf(lang) >= 0; });
        if (langs.length) result.push({icon:'globe',label:langs.map(function (v) { return {uk:'UA',en:'EN',ru:'RU'}[v]; }).join(' / '),kind:'language'});
        if (record.season && record.episode) result.push({icon:'tv',label:'S'+record.season+'E'+record.episode,kind:'episode'});
        return result;
    }
    function badgesMarkup(record,unknown) {
        var facts = qualityFacts(record);
        return facts.length ? facts.map(function (b) { return '<span class="fbr-badge fbr-badge--'+b.kind+'">'+icon(b.icon)+esc(b.label)+'</span>'; }).join('') : unknown ? '<span class="fbr-badge fbr-badge--unknown">'+icon('quality')+'Якість після пошуку</span>' : '';
    }
    function learn(movie,evidence) {
        var key = identity(movie); if (!key) return;
        var data = get('quality_cache',{}); if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
        data[key] = {checkedAt:Date.now(),qualities:evidence.qualities || [],languages:evidence.languages || [],season:evidence.season || 0,episode:evidence.episode || 0,hdr:evidence.hdr === true,dolbyVision:evidence.dolbyVision === true};
        Object.keys(data).sort(function (a,b) { return (data[b].checkedAt || 0)-(data[a].checkedAt || 0); }).slice(MAX).forEach(function (k) { delete data[k]; });
        set('quality_cache',data);
        homeCards.forEach(function (card) { if (identity(card.movie) === key) paintHomeBadges(card); });
        records.forEach(function (record) { if (identity(record.movie) === key) refreshDetail(record); });
    }
    function localRating(movie,value) {
        var key = identity(movie), all = get('my_ratings',{}); if (!key) return 0;
        if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
        if (arguments.length > 1) { if (value >= 1 && value <= 10) all[key] = Math.round(value); else delete all[key]; set('my_ratings',all); }
        return +all[key] >= 1 && +all[key] <= 10 ? +all[key] : 0;
    }
    function textOf(node) { return node ? str(node.textContent).replace(/\s+/g,' ').trim() : ''; }
    function sourceRating(node) {
        function classify(hint) {
            if (/nominat|номін|номин/i.test(hint)) return '';
            if (/oscars?|academy.?awards?/i.test(hint)) return 'oscars';
            if (/awards?|troph|нагород|награ|перемог|побед|wins/i.test(hint)) return 'awards';
            if (/imdb/i.test(hint)) return 'imdb';
            if (/tmdb/i.test(hint)) return 'tmdb';
            if (/metacritic|metascore|rate--mc/i.test(hint)) return 'mc';
            if (/rottentomatoes|rotten.?tomatoes|tomato|tomatometer|rate--rt\b/i.test(hint)) return 'rt';
            return '';
        }
        var hint=str(node.className)+' '+str(node.getAttribute('data-source'))+' '+str(node.getAttribute('title'))+' '+str(node.getAttribute('aria-label'));
        var known=classify(hint);if(known) return known;
        var images=node.querySelectorAll('img');
        for(var i=0;i<images.length;i++) hint+=' '+images[i].getAttribute('src')+' '+images[i].getAttribute('alt');
        return classify(hint+' '+textOf(node));
    }
    function readRatings(record) {
        var result={},line=record.node.querySelector('.full-start-new__rate-line,.full-start__rate-line');
        if(!line) return result;
        function visit(node,depth) {
            if(node.classList.contains('hide')) return;
            var id=sourceRating(node),numbers=textOf(node).match(/\d+(?:[.,]\d+)?/g) || [],n=numbers[0];
            if(id && score(n,id==='oscars' || id==='awards' ? 100000 : id==='rt' || id==='mc' ? 100 : 10)) result[id]=n;
            if(depth<3) Array.prototype.forEach.call(node.children,function (child) { if(!/svg|path|use|circle|rect/i.test(child.tagName)) visit(child,depth+1); });
        }
        Array.prototype.forEach.call(line.children,function (node) { visit(node,0); });
        return result;
    }
    function openMyRating(record,button) {
        var controller = L.Controller.enabled().name, previous = localRating(record.movie);
        function back() { L.Select.hide(); L.Controller.toggle(controller); var current=record.node.querySelector('.fbr-my-rating'); if (current && doc.documentElement.contains(current)) L.Controller.collectionFocus(current,$(record.node)); }
        var rows = [];
        for (var n=10;n>=1;n--) rows.push({title:n+' / 10',value:n,selected:n === previous});
        if (previous) rows.push({title:'Прибрати мою оцінку',value:0});
        L.Select.show({title:'Моя оцінка · '+esc(record.movie.title || record.movie.name),items:rows,onSelect:function (row) { localRating(record.movie,row.value); refreshDetail(record); back(); },onBack:back});
    }
    function buttonKey(node) {
        var names={'view--faborn-ukr':'online','view--faborn-torrent':'torrent','view--torrent':'torrent','button--play':'watch','button--book':'bookmark','button--reaction':'reaction','button--subscribe':'subscribe','button--options':'options'};
        var classes=str(node.className).split(/\s+/), key='';
        Object.keys(names).some(function (name) { if (classes.indexOf(name) >= 0) { key=names[name];return true; } });
        if (key) return key;
        var use=node.querySelector('use'), href=use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
        if (classes.indexOf('button--priority') >= 0 && /torrent/.test(href || '')) return 'torrent';
        var custom=classes.filter(function (c) { return /^view--|^button--/.test(c) && c !== 'button--priority'; }).sort();
        if (custom.length) return 'source:'+custom.join(':');
        var label=node.getAttribute('data-title') || node.getAttribute('aria-label') || textOf(node);
        return label ? 'label:'+label.replace(/\s+/g,' ').trim() : '';
    }
    function actionButtons(record) {
        var row=record.node.querySelector('.full-start-new__buttons,.full-start__buttons');
        return row ? Array.prototype.filter.call(row.children,function (node) { return node.classList.contains('full-start__button'); }) : [];
    }
    function orderedKeys(available,saved) {
        var out=[];
        (Array.isArray(saved) ? saved : ['online','torrent']).concat(available).forEach(function (key) { if (available.indexOf(key) >= 0 && out.indexOf(key) < 0) out.push(key); });
        return out;
    }
    function arrangeButtons(record) {
        var buttons=actionButtons(record), used={}, present=buttons.some(function (b) { return b.classList.contains('view--faborn-torrent') && !b.classList.contains('hide'); });
        buttons.forEach(function (node) {
            var key=buttonKey(node), icon=node.querySelector('svg path,svg use,svg circle,svg rect,svg polygon,svg line,svg polyline,img');
            var duplicate=(key === 'torrent' && present && !node.classList.contains('view--faborn-torrent')) || (key && used[key]);
            node.classList.toggle('fbr-empty-button',!icon && !textOf(node));
            node.classList.toggle('fbr-duplicate-button',!!duplicate);
            if (!duplicate && key && !node.classList.contains('hide')) used[key]=true;
        });
        var keys=orderedKeys(buttons.map(buttonKey).filter(Boolean),get('button_order',null));
        var sorted=buttons.slice().sort(function (a,b) { var ka=keys.indexOf(buttonKey(a)),kb=keys.indexOf(buttonKey(b));return (ka<0 ? 999 : ka)-(kb<0 ? 999 : kb) || buttons.indexOf(a)-buttons.indexOf(b); });
        if (sorted.some(function (node,index) { return node !== buttons[index]; })) sorted.forEach(function (node) { node.parentNode.appendChild(node); });
    }
    function editButtons() {
        prune();
        var record=records[records.length-1];
        if (!record) return L.Noty.show('Спочатку відкрий картку фільму або серіалу.');
        var controller=L.Controller.enabled().name;
        var labels={online:'ukr by Faborn',torrent:'Торренти',watch:'Джерела Lampa',bookmark:'Закладки',reaction:'Реакції',subscribe:'Підписка',options:'Додатково'};
        function back() { L.Select.hide();L.Controller.toggle(controller); }
        function rows() {
            arrangeButtons(record);
            return actionButtons(record).filter(function (b) { return !b.classList.contains('hide') && !b.classList.contains('fbr-empty-button') && !b.classList.contains('fbr-duplicate-button'); }).map(function (b,index) { var key=buttonKey(b);return {title:esc(labels[key] || b.getAttribute('aria-label') || textOf(b) || 'Джерело'),subtitle:'Позиція '+(index+1),key:key}; });
        }
        function show() {
            var items=rows();
            items.push({title:'Відновити початковий порядок',reset:true});
            L.Select.show({title:'Порядок кнопок',items:items,onBack:back,onSelect:function (item) {
                if (item.reset) { set('button_order',null);records.forEach(arrangeButtons);return show(); }
                var current=rows(), positions=current.map(function (r,index) { return {title:'Позиція '+(index+1),index:index,selected:r.key === item.key}; });
                L.Select.show({title:item.title,items:positions,onBack:show,onSelect:function (position) {
                    var keys=current.map(function (r) { return r.key; }).filter(function (key) { return key !== item.key; });
                    keys.splice(position.index,0,item.key);
                    var saved=get('button_order',[]);if(Array.isArray(saved)) saved.forEach(function (key) { if(keys.indexOf(key)<0) keys.push(key); });
                    set('button_order',keys);records.forEach(arrangeButtons);show();
                }});
            }});
        }
        show();
    }
    function refreshDetail(record) {
        if (!record.node || !record.node.querySelector) return;
        if (record.observer) record.observer.disconnect();
        arrangeButtons(record);
        var node = record.node, line = node.querySelector('.full-start-new__rate-line,.full-start__rate-line');
        var host = node.querySelector('.full-start-new__right,.full-start__right') || node;
        var panel = node.querySelector('.fbr-detail-meta');
        if (!panel) { panel = doc.createElement('div'); panel.className = 'fbr-detail-meta'; if (line) line.parentNode.insertBefore(panel,line); else host.appendChild(panel); }
        var ratings = on('ratings'), badges = on('badges');
        if (line) line.classList.toggle('fbr-original-ratings',ratings);
        if (!badges) Array.prototype.forEach.call(node.querySelectorAll('.fbr-legacy-quality'),function (n) { n.classList.remove('fbr-legacy-quality'); });
        if (!ratings && !badges) { panel.innerHTML = ''; panel.removeAttribute('data-fbr-signature'); panel.style.display = 'none'; observeDetail(record); return; }
        panel.style.display = '';
        Array.prototype.forEach.call(host.children,function (child) {
            if (child === panel || child === line || /buttons|details|reactions|title|tagline|head/.test(child.className)) return;
            var value=textOf(child), tokens=value.replace(/Dolby\s*Vision|HDR10\+?|HDR|2160p|1080p|720p|480p|4K|5\.1|7\.1|DUB|UA\+?|EN|RU/gi,'').replace(/[^a-zа-яіїєґ0-9]/gi,'');
            if (!tokens && /4K|2160p|1080p|HDR|Dolby/i.test(value)) child.classList.toggle('fbr-legacy-quality',badges);
        });
        var extra=readRatings(record), facts = ratingFacts(record.movie,extra).concat(awardFacts(record.movie,extra)), ownRating = localRating(record.movie);
        var meta = [], age = node.querySelector('.full-start__pg:not(.hide)'), status = node.querySelector('.full-start__status:not(.hide)');
        if (age) meta.push('<span class="fbr-fact">'+esc(textOf(age))+'</span>');
        if (status) meta.push('<span class="fbr-fact">'+esc(textOf(status))+'</span>');
        var html = ratings ? '<div class="fbr-ratings" aria-label="Рейтинги">'+ratingMarkup(facts)+(identity(record.movie) ? '<button type="button" class="fbr-my-rating selector" aria-label="Моя оцінка">'+icon('star')+'<span><small>Моя оцінка</small><strong>'+(ownRating ? ownRating+'<em>/10</em>' : 'Оцінити')+'</strong></span></button>' : '')+'</div>' : '';
        if (ratings && meta.length) html += '<div class="fbr-facts">'+meta.join('')+'</div>';
        if (badges) html += '<div class="fbr-detail-badges" aria-label="Якість доступних джерел">'+badgesMarkup(cachedQuality(record.movie),true)+'</div>';
        // Do not replace a focused rating button when a late provider updates its score.
        if (panel.getAttribute('data-fbr-signature') !== html) {
            var oldButton = panel.querySelector('.fbr-my-rating');
            panel.innerHTML = html; panel.setAttribute('data-fbr-signature',html);
            var button = panel.querySelector('.fbr-my-rating');
            if (button && oldButton) {
                // Keep the same node in Lampa's remote-control collection and preserve focus/events.
                oldButton.innerHTML = button.innerHTML;
                button.parentNode.replaceChild(oldButton,button);
                button = oldButton;
            } else if (button) {
                $(button).on('hover:enter',function () { openMyRating(record,button); }).on('hover:focus',function () { if (record.start) record.start.last = button; });
                if (record.start && L.Controller.own && L.Controller.own(record.start)) L.Controller.collectionAppend([button]);
            } else if (oldButton && record.start && record.start.last === oldButton) record.start.last = node.querySelector('.view--faborn-ukr');
        }
        observeDetail(record);
    }
    function observeDetail(record) {
        if (!root.MutationObserver) return;
        if (!record.observer) record.observer = new root.MutationObserver(function (changes) {
            var external = changes.some(function (change) { var n=change.target.nodeType === 1 ? change.target : change.target.parentNode; return n && !$(n).closest('.fbr-detail-meta').length; });
            if (!external || record.timer) return;
            record.timer = root.setTimeout(function () { record.timer = null; refreshDetail(record); },160);
        });
        record.observer.observe(record.node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    }
    function prune() {
        records = records.filter(function (record) { if (doc.documentElement.contains(record.node)) return true; if (record.observer) record.observer.disconnect(); if (record.timer) root.clearTimeout(record.timer); return false; });
        homeCards = homeCards.filter(function (record) { return doc.documentElement.contains(record.node); });
    }
    function ratingNavigation(record) {
        if (!record.start || !record.start.use || record.navigation) return;
        record.navigation = true;
        record.start.use({onController:function (controller) {
            var up=controller.up, down=controller.down;
            controller.up=function () {
                var rating=record.node.querySelector('.fbr-my-rating'), action=record.node.querySelector('.full-start-new__buttons .focus,.full-start__buttons .focus');
                if (rating && rating.offsetParent && action) { record.lastAction=action;L.Controller.collectionFocus(rating,$(record.node)); }
                else if (up) up.apply(this,arguments);
            };
            controller.down=function () {
                var rating=record.node.querySelector('.fbr-my-rating.focus');
                if (rating) L.Controller.collectionFocus(record.lastAction || record.node.querySelector('.view--faborn-ukr'),$(record.node));
                else if (down) down.apply(this,arguments);
            };
        }});
    }
    function full(event) {
        if (!event || event.type !== 'complite' || !event.data || !event.data.movie || !event.object || !event.object.activity) return;
        var render = event.object.activity.render(), node = render && (render[0] || render);
        if (!node || !node.querySelector) return;
        prune();
        var record = records.filter(function (r) { return r.node === node; })[0];
        if (!record) { record = {node:node,movie:event.data.movie}; records.push(record); }
        record.start = event.link && event.link.items && event.link.items[0] || record.start;
        ratingNavigation(record);
        refreshDetail(record);
        // The added rating action must not steal the initial focus from playback.
        if (record.start && !record.start.last) record.start.last = actionButtons(record).filter(function (button) { return !button.classList.contains('hide') && !button.classList.contains('fbr-empty-button') && !button.classList.contains('fbr-duplicate-button'); })[0];
    }
    function isMovieLine(data) {
        if (!data || !Array.isArray(data.results) || !data.results.length) return false;
        if (/shot|trailer|person|actor|timetable/i.test(str(data.line_type)+' '+str(data.type)+' '+str(data.params && data.params.type))) return false;
        return data.results.every(function (movie) { return movie && movie.id && (movie.title || movie.name) && (movie.poster_path || movie.backdrop_path) && !movie.known_for_department && !movie.video_id && !movie.youtube; });
    }
    function cardMeta(movie) {
        var bits = [], year = str(movie.release_date || movie.first_air_date).slice(0,4);
        if (/^\d{4}$/.test(year)) bits.push(year);
        var genres = movie.genres && movie.genres.map(function (g) { return g.name; }).filter(Boolean);
        if (!genres || !genres.length) try { genres = L.Api.sources.tmdb.getGenresNameFromIds(movie.original_name ? 'tv' : 'movie',movie.genre_ids || []); } catch (ignore) { genres=[]; }
        if (genres && genres.length) bits.push(genres.slice(0,2).join(' · '));
        else bits.push(movie.original_name || movie.first_air_date ? 'Серіал' : 'Фільм');
        return bits.join(' · ');
    }
    function paintHomeBadges(record) {
        var target = record.node.querySelector('.fbr-home-badges');
        if (target) target.innerHTML = on('badges') ? badgesMarkup(cachedQuality(record.movie),true) : '';
    }
    function decorateCard(card,movie) {
        var node = card.render(true); if (!node || !node.querySelector) return;
        if (node.querySelector('.fbr-home-info')) return;
        node.classList.add('fbr-home-card'); node.classList.add('card--wide');
        var view = node.querySelector('.card__view'); if (!view) return;
        var info = doc.createElement('div'); info.className = 'fbr-home-info';
        info.innerHTML = '<div class="fbr-home-meta">'+esc(cardMeta(movie))+'</div><div class="fbr-home-title">'+esc(movie.title || movie.name)+'</div><p class="fbr-home-overview">'+esc(movie.overview || 'Відкрий картку, щоб дізнатися більше.')+'</p><div class="fbr-home-footer"><div class="fbr-home-badges"></div><span class="fbr-home-open">'+icon('arrow')+'</span></div>';
        node.appendChild(info);
        var label = doc.createElement('div'); label.className = 'fbr-home-kind';
        label.innerHTML = icon(movie.original_name || movie.first_air_date ? 'tv' : 'film')+'<span>'+(movie.original_name || movie.first_air_date ? 'СЕРІАЛ' : 'КІНО')+'</span>';
        view.appendChild(label);
        var rating = score(movie.vote_average,10);
        if (rating) { var vote=doc.createElement('div');vote.className='fbr-home-score';vote.innerHTML=icon('star')+rating+'<small>TMDB</small>';view.appendChild(vote); }
        var record = {node:node,movie:movie};homeCards.push(record);paintHomeBadges(record);
    }
    function enhanceLine(line,data) {
        if (!on('home') || !isMovieLine(data) || !line.use) return;
        line.view = 3;
        if (line.params && line.params.items) { line.params.items.view=3;line.params.items.align_left=true; }
        data.results.forEach(function (movie) { movie.params=movie.params || {};movie.params.style=movie.params.style || {};movie.params.style.name='wide'; });
        line.use({onCreate:function () {
            var node=this.render(true);node.classList.add('fbr-home-line');
            var title=node.querySelector('.items-line__title');
            if (title) { var label=textOf(title).replace(/^[\s🔥⭐🎬🏆]+/,''); title.innerHTML=icon(/top|кращ|лучш|топ/i.test(label) ? 'trophy' : /нов|now|смотр|див/i.test(label) ? 'fresh' : 'film')+'<span>'+esc(label)+'</span>'; }
        },onInstance:function (card,movie) {
            if (!card.use) return;
            card.use({onCreate:function () { decorateCard(this,movie); }});
        }});
    }
    function hookHome() {
        if (!L.Component || !L.Component.get || !L.Component.add || mainWrapper) return;
        originalMain = L.Component.get('main'); if (!originalMain) return;
        mainWrapper = function (object) {
            var component = new originalMain(object);
            if (on('home') && component.use) component.use({onInstance:enhanceLine,onDestroy:prune});
            return component;
        };
        L.Component.add('main',mainWrapper);
    }
    function currentHome() {
        try {
            var active=L.Activity.active(), component=active && active.component;
            if (component !== 'main') return;
            // The extension may load after Lampa's first activity. Refresh only that home.
            if (L.Activity.replace && L.Controller.enabled().name !== 'settings_component' && L.Controller.enabled().name !== 'select') L.Activity.replace({component:'main',source:active.source,title:active.title,page:1});
        } catch (ignore) {}
    }
    function styles() {
        var theme=get('layout','panel') === 'classic' ? 'off' : get('theme','on');
        var palettes={blue:['#91bdff','#91bdff','#101827'],amber:['#ffd078','#ffd078','#101827'],mint:['#82dfc1','#82dfc1','#101827'],violet:['#c2a5ff','#c2a5ff','#101827'],aurora:['#0962ed','#b019ed','#ffffff'],lagoon:['#00e8bf','#208aff','#081626']};
        var colors=palettes[get('accent','blue')] || palettes.blue, accent=theme === 'off' ? '#f1f1f1' : colors[0], ink=theme === 'off' ? '#202020' : colors[2];
        var glass={solid:1,low:.7,standard:.46,high:.3,max:.18}[get('glass_transparency','standard')];
        if (glass === undefined) glass=.46;
        function rgba(hex,alpha) { return 'rgba('+[1,3,5].map(function (i) {return parseInt(hex.substr(i,2),16);}).join(',')+','+alpha+')'; }
        var sheen='linear-gradient(130deg,rgba(255,255,255,.16),rgba(255,255,255,.025) 48%,rgba(255,255,255,.07))';
        var surface='linear-gradient(120deg,'+rgba(colors[0],.18)+','+rgba(colors[1],.06)+')';
        var edge='inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(255,255,255,.06)';
        var focus=theme === 'off' ? '#f1f1f1' : 'linear-gradient(120deg,'+colors[0]+','+colors[1]+')';
        if (theme === 'ios') { surface=sheen+',rgba(72,87,110,'+glass+')';focus='linear-gradient(145deg,#ffffff,#d3e6fc)';ink='#132236'; }
        if (theme === 'off') { surface='transparent';edge='none'; }
        return [
            '.fbr-icon{display:inline-block;width:1.2em;height:1.2em;flex-shrink:0;vertical-align:middle}',
            '.fbr-original-ratings,.fbr-legacy-quality,.fbr-empty-button,.fbr-duplicate-button{display:none!important}',
            '.fbr-detail-meta{margin:1.25em 0 1.1em;color:inherit}.fbr-ratings{display:inline-flex;flex-wrap:wrap;align-items:stretch;max-width:100%;padding:.75em .25em;background:'+surface+';border:0;border-radius:1.25em;box-shadow:'+edge+';box-sizing:border-box}',
            '.fbr-rating,.fbr-my-rating{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.15em .85em;margin:0;background:transparent;border:0;border-right:1px solid rgba(255,255,255,.12);border-radius:0;box-sizing:border-box;color:#f7f8fd;min-width:6.1em}.fbr-ratings>:last-child{border-right:0}',
            '.fbr-rating-logo{display:flex;align-items:center;justify-content:center;height:2.25em;margin-bottom:.32em}.fbr-rating-icon{width:2.05em;height:2.05em;display:block;flex-shrink:0}.fbr-rating--oscars .fbr-rating-icon{height:2.3em}',
            '.fbr-rating-body,.fbr-my-rating>span{display:flex;flex-direction:column;align-items:center}.fbr-rating-body small,.fbr-my-rating small{display:block;font-size:.65em;letter-spacing:.02em;line-height:1.25;color:#c0ccdc;margin-bottom:.18em;white-space:nowrap}.fbr-rating-body strong,.fbr-my-rating strong{display:block;font-size:1.5em;font-weight:600;line-height:1.12}.fbr-rating em,.fbr-my-rating em{font-size:.43em;font-style:normal;color:#a7b5c9;margin-left:.22em}',
            '.fbr-rating--oscars strong,.fbr-rating--awards strong{color:#ffe1a0}.fbr-my-rating{font:inherit;cursor:pointer;text-align:center;min-width:6.5em;border-radius:.9em}.fbr-my-rating>.fbr-icon{width:2.05em;height:2.05em;color:inherit;margin:.1em 0 .43em}.fbr-my-rating strong{font-size:1.35em}.fbr-my-rating.focus{background:'+focus+';color:'+ink+';border-color:transparent;outline:0}.fbr-my-rating.focus small,.fbr-my-rating.focus em,.fbr-my-rating.focus>.fbr-icon{color:inherit}',
            '.fbr-facts{display:flex;flex-wrap:wrap;margin-top:.65em}.fbr-fact{padding:.3em .65em;font-size:.75em;border-radius:.5em;background:rgba(255,255,255,.07);color:inherit;margin-right:.45em}.fbr-detail-badges{display:flex;flex-wrap:wrap;margin-top:.65em}.fbr-detail-badges .fbr-badge{font-size:.84em;padding:.45em .65em;background:'+surface+';box-shadow:'+edge+'}',
            '.fbr-badge{display:inline-flex;align-items:center;padding:.35em .6em;margin:.15em .4em .15em 0;border-radius:.55em;background:rgba(255,255,255,.08);font-size:.72em;line-height:1.1;font-weight:600;color:inherit;white-space:nowrap}.fbr-badge .fbr-icon{margin-right:.35em;width:1.05em;height:1.05em}.fbr-badge--unknown{font-weight:400;color:#b4c0d2;background:transparent;padding-left:0}',
            'body.fbr-home-enabled .fbr-home-line{margin-bottom:2.1em}body.fbr-home-enabled .fbr-home-line .items-line__title{display:flex;align-items:center;font-size:1.3em;font-weight:600;letter-spacing:-.015em}body.fbr-home-enabled .fbr-home-line .items-line__title>.fbr-icon{margin-right:.6em;color:'+accent+'}',
            'body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 7em)/3)!important;flex-shrink:0;margin-right:1em;padding:0!important;box-sizing:border-box;background:'+surface+';border:1px solid rgba(255,255,255,.1);border-radius:1.25em;overflow:hidden;transform:none!important;transition:none!important;box-shadow:'+edge+'}',
            'body.fbr-home-enabled .fbr-home-card .card__view{padding-bottom:56.25%!important;margin:0!important;border-radius:0!important;overflow:hidden}body.fbr-home-enabled .fbr-home-card .card__img{border-radius:0!important;object-fit:cover}body.fbr-home-enabled .fbr-home-card .card__view:after{display:none!important}body.fbr-home-enabled .fbr-home-card.focus,body.fbr-home-enabled .fbr-home-card.hover{border-color:'+(theme === 'ios' ? '#e7f2ff' : accent)+';box-shadow:inset 0 -3px 0 '+(theme === 'ios' ? '#e7f2ff' : accent)+';background:'+surface+'}',
            'body.fbr-home-enabled .fbr-home-card>.card__title,body.fbr-home-enabled .fbr-home-card>.card__age,body.fbr-home-enabled .fbr-home-card .card__vote,body.fbr-home-enabled .fbr-home-card .card__quality,body.fbr-home-enabled .fbr-home-card .card__type,body.fbr-home-enabled .fbr-home-card .card__promo{display:none!important}',
            '.fbr-home-info{padding:1em 1.1em .85em;white-space:normal;color:#f4f7fd}.fbr-home-meta{color:#9baec6;font-size:.78em;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fbr-home-title{font-size:1.4em;font-weight:600;letter-spacing:-.025em;line-height:1.2;margin:.42em 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.4em}.fbr-home-overview{font-size:.92em;line-height:1.42;color:#c3cddd;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.84em;margin:0}.fbr-home-footer{display:flex;align-items:center;justify-content:space-between;min-height:2.7em;margin-top:.55em}.fbr-home-badges{display:flex;align-items:center;flex-wrap:wrap}.fbr-home-badges .fbr-badge{font-size:.76em}.fbr-home-open{display:flex;align-items:center;justify-content:center;border-radius:50%;width:1.9em;height:1.9em;color:#8b9bb3;flex-shrink:0;margin-left:.3em}.fbr-home-card.focus .fbr-home-open{background:'+accent+';color:#122035}',
            '.fbr-home-kind,.fbr-home-score{position:absolute;top:.85em;display:flex;align-items:center;border-radius:.6em;padding:.45em .55em;background:rgba(8,14,23,.86);color:#e9eff8;font-size:.72em}.fbr-home-kind{left:.85em;letter-spacing:.07em}.fbr-home-kind .fbr-icon{margin-right:.4em}.fbr-home-score{right:.85em;font-weight:650}.fbr-home-score>.fbr-icon{width:1em;height:1em;color:#edca7c;margin-right:.35em}.fbr-home-score small{font-size:.6em;margin-left:.4em;color:#b4c5da}',
            'body:not(.fbr-home-enabled) .fbr-home-info,body:not(.fbr-home-enabled) .fbr-home-kind,body:not(.fbr-home-enabled) .fbr-home-score{display:none}',
            theme === 'ios' ? '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.fbr-ratings{background:'+sheen+',rgba(87,106,135,'+glass+');-webkit-backdrop-filter:blur(18px) saturate(135%);backdrop-filter:blur(18px) saturate(135%)}}' : '',
            '@media(max-width:700px){body.fbr-home-enabled .card.fbr-home-card{width:calc((100vw - 4em)/2)!important}.fbr-home-overview{font-size:.84em}.fbr-rating,.fbr-my-rating{min-width:5.3em;padding:.3em .6em}}'
        ].join('');
    }
    function apply() {
        if (!doc || !doc.createElement || !doc.querySelector) return;
        var style=doc.getElementById('faborn-premium-ui');if(!style){style=doc.createElement('style');style.id='faborn-premium-ui';doc.head.appendChild(style);}style.textContent=styles();
        doc.body.classList.toggle('fbr-home-enabled',on('home'));
        prune();records.forEach(refreshDetail);homeCards.forEach(paintHomeBadges);
    }
    function install() {
        if (installed || !doc || !doc.querySelector || !L || !$) return;
        installed=true;hookHome();L.Listener.follow('full',full);apply();currentHome();
    }
    return {install:install,apply:apply,learn:learn,full:full,editButtons:editButtons,orderedKeys:orderedKeys,buttonKey:buttonKey,currentHome:currentHome,identity:identity,score:score,ratingFacts:ratingFacts,awardFacts:awardFacts,ratingIcon:ratingIcon,ratingMarkup:ratingMarkup,qualityFacts:qualityFacts,cachedQuality:cachedQuality,badgesMarkup:badgesMarkup,localRating:localRating,isMovieLine:isMovieLine,enhanceLine:enhanceLine,icon:icon};
}));
