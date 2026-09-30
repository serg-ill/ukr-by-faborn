/* ukr by Faborn 0.1.0-beta.13.2 — GitHub Pages edition. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else if (!root.FabornUkr) {
        root.FabornUkr = factory(root);
        root.FabornUkr.boot();
    }
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var VERSION = '0.1.0-beta.13.2';
    var NAME = 'ukr by Faborn';
    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h16a6 6 0 0 1 6 6v8H2V8a6 6 0 0 1 6-6z" fill="#168BFF"/><path d="M2 16h28v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#FFD54A"/><path d="M12 8.5 24 16 12 23.5z" fill="#101923"/></svg>';
    var L, $, installed = false, currentCatalog, catalogLoadedAt = 0, requestSerial = 0, lastDiagnostic = '', returnController = 'content';
    var pendingRequest, playbackTimer, watchedPlayback, playbackContext, historyPlayback;
    var seasonMetadata = {}, seasonMetadataOrder = [];
    var directTrace = [], presentation = null;
    var capturedBase = detectBase();
    var lab4k = null, labScript = null, labLoadTimer = null, labLoadSerial = 0, labPlaybackData = null;
    var kinoSession = null, kinoSessionQueue = null, kinoSessionScript = null, kinoSessionTimer = null;

    function text(value) { return value === undefined || value === null ? '' : String(value); }
    function escapeHTML(value) {
        return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function normalize(value) {
        return text(value).toLowerCase().replace(/[’'`ʼ]/g, '').replace(/[^a-zа-яіїєґ0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
    function unique(values) {
        var out = [];
        values.forEach(function (value) { if (value && out.indexOf(value) < 0) out.push(value); });
        return out;
    }
    function mediaURL(value) {
        return /^https:\/\/(?:[a-z0-9-]+\.)*(?:ashdi\.vip|hdvbua\.pro|zetvideo\.net|redcdn\.org|threnet\.xyz|tortuga\.(?:tw|wtf))\//i.test(text(value)) && !/[\s<>"\\]/.test(value);
    }
    function safeBase(value) {
        return /^(https:\/\/[a-z0-9-]+\.github\.io(?:\/[^?#]*)?|http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?)$/i.test(value);
    }
    function fromScript(url) {
        var clean = text(url).split(/[?#]/)[0];
        return /\/ukr-by-faborn\.js$/.test(clean) ? clean.replace(/ukr-by-faborn\.js$/, '') : '';
    }
    function detectBase() {
        var doc = root.document, base = '', scripts, i;
        if (!doc) return '';
        if (doc.currentScript) base = fromScript(doc.currentScript.src);
        if (!base) {
            scripts = doc.getElementsByTagName('script');
            for (i = scripts.length - 1; i >= 0; i--) {
                base = fromScript(scripts[i].src);
                if (base) break;
            }
        }
        return safeBase(base) ? base : '';
    }
    function storage(key, fallback) {
        try { return L.Storage.get('faborn_ukr_' + key, fallback); } catch (ignore) { return fallback; }
    }
    function save(key, value) {
        try { L.Storage.set('faborn_ukr_' + key, value); } catch (ignore) { /* A full TV storage must not block playback. */ }
    }
    function baseURL() {
        var base = capturedBase, plugins;
        if (!base) {
            try {
                plugins = L.Storage.get('plugins', []);
                plugins.forEach(function (p) { if (!base) base = fromScript(typeof p === 'string' ? p : p.url); });
            } catch (ignore) { /* The settings override remains available. */ }
        }
        base = base || text(storage('pages', ''));
        if (base && base.charAt(base.length - 1) !== '/') base += '/';
        return safeBase(base) ? base : '';
    }
    function notify(message) { if (L && L.Noty) L.Noty.show(message); }
    function rememberController() {
        try {
            var name = L.Controller.enabled().name;
            if (name && ['select','keyboard','player','player_panel','faborn_ukr_view'].indexOf(name) < 0) returnController = name;
        } catch (ignore) { returnController = 'content'; }
    }
    function restore() {
        cancelCardLab();
        stopKinoSession();
        cancelPending(); activeSession = null;
        closePresentation();
        if (L && L.Select) L.Select.hide();
        if (L && L.Controller) L.Controller.toggle(returnController);
    }
    function select(title, items, onSelect, onBack) {
        closePresentation();
        L.Select.show({
            title: title,
            items: items.map(function (item) {
                var row = {};
                Object.keys(item).forEach(function (key) { row[key] = item[key]; });
                row.title = escapeHTML(row.title);
                if (row.subtitle) row.subtitle = escapeHTML(row.subtitle);
                return row;
            }),
            onSelect: function (item) { L.Select.hide(); onSelect(item); },
            onBack: function () { L.Select.hide(); (onBack || restore)(); }
        });
    }
    // Presentation owns only its overlay and controller; Lampa still owns the player and timeline.
    function canPresent() {
        return storage('layout','panel') !== 'classic' && root.document && root.document.createElement && L.Controller && L.Controller.add && L.Controller.collectionSet && root.Navigator && root.Navigator.move;
    }
    function closePresentation() {
        if (presentation) { presentation.html.remove(); presentation = null; }
    }
    function palette(value) {
        var colors = {blue:['#91bdff','#1d304b'],amber:['#ffd078','#3b3020'],mint:['#82dfc1','#1d3835'],violet:['#c2a5ff','#302640'],aurora:['#82b4ff','#282050','#b019ed','#0962ed','#ffffff'],lagoon:['#42f5d5','#0c3944','#208aff','#00e8bf','#081626']};
        return colors[value] || colors.blue;
    }
    function putStyle(id, css) {
        var doc = root.document, node = doc.getElementById(id);
        if (!node) { node = doc.createElement('style'); node.id = id; doc.body.appendChild(node); }
        node.textContent = css;
    }
    function applyAppearance() {
        if (!root.document || !root.document.createElement) return;
        var standard = storage('layout','panel') === 'classic';
        var colors = palette(storage('accent','blue')), accent = colors[0], tint = colors[1];
        var fill = colors[2] ? 'linear-gradient(120deg,'+colors[3]+' 0%,'+colors[2]+' 100%)' : 'none', ink = colors[4] || '#101827';
        // Keep the saved Faborn palette so switching back restores the user's choice.
        putStyle('faborn-ukr-ui',standard ? '' : '.full-start__button.view--faborn-ukr{border:0!important;outline:0!important;box-shadow:none!important}'+presentationCSS(accent,tint,fill,ink));
        var enabled = !standard && storage('theme','on') !== 'off';
        var glass = enabled && storage('theme','on') === 'ios';
        $('body').toggleClass('faborn-theme',enabled);
        $('body').toggleClass('faborn-glass',glass);
        // Removing our CSS restores the user's existing theme without changing any Lampa preference.
        putStyle('faborn-ukr-theme',enabled ? (glass ? glassCSS(accent,tint,fill,ink) : themeCSS(accent,tint,fill,ink)) : '');
    }
    function changeTheme(value) {
        // An explicit choice of iOS must also work when the previous layout disabled all theming.
        if (value === 'ios' && storage('layout','panel') === 'classic') {
            save('layout','panel');
            if (L.Settings && L.Settings.update) L.Settings.update();
        }
        applyAppearance();
    }
    function themeCSS(accent,tint,fill,ink) {
        var base = 'body.faborn-theme', css = base+':not(.player--viewing){background:#0e131e!important;color:#f3f5fa}';
        css += base+' .menu__item,'+base+' .head__action,'+base+' .full-start__button,'+base+' .settings-folder,'+base+' .settings-param,'+base+' .selectbox-item,'+base+' .modal__button{border-radius:.75em}';
        css += base+' .settings__content,'+base+' .selectbox__content,'+base+' .modal__content,'+base+' .settings-input__content{background:#171e2c!important;color:#f3f5fa;border:1px solid #354056;box-shadow:0 1em 3em rgba(0,0,0,.42);border-radius:1.1em}';
        css += base+' .settings__content,'+base+' .selectbox__content{border-radius:1.1em 0 0 1.1em}';
        css += base+' .navigation-bar__body{background:#171e2c;border:1px solid #354056}';
        css += base+' .navigation-tabs__button.active{background:'+tint+';color:'+accent+'}';
        css += base+' .settings__layer,'+base+' .selectbox__layer{background:rgba(3,7,15,.6)}';
        css += base+' .modal{background-color:rgba(3,7,15,.72)}';
        css += base+' .settings-param,'+base+' .settings-folder,'+base+' .selectbox-item{margin-bottom:.2em}';
        css += base+' .settings-param__value,'+base+' .settings-param__descr,'+base+' .selectbox-item__subtitle{color:#b7c4d8;opacity:1}';
        css += base+' .settings-param-title > span,'+base+' .selectbox-item.selected:not(.nomark){color:'+accent+'}';
        css += base+' .menu__item.traverse{background:'+tint+';color:#f3f5fa}';
        css += base+' .menu__item.traverse .menu__ico [stroke]{stroke:#f3f5fa}';
        css += base+' .menu__item.traverse .menu__ico path[fill]{fill:#f3f5fa}';
        ['.menu__item.focus','.menu__item.hover','.head__action.focus','.full-start__button.focus','.settings-folder.focus','.settings-param.focus','.selectbox-item.focus','.modal__button.focus','.navigation-tabs__button.focus','.filter__item.focus','.simple-button.focus','.player-panel .button.focus'].forEach(function (s) {
            css += base+' '+s+'{background:'+accent+'!important;background-image:'+fill+'!important;color:'+ink+'!important;border:0!important;outline:0!important;box-shadow:none!important}';
        });
        css += base+' .menu__item.focus .menu__ico [stroke]{stroke:'+ink+'}'+base+' .menu__item.focus .menu__ico path[fill]:not([fill="none"]){fill:'+ink+'}';
        css += base+' .settings-param.focus .settings-param__value,'+base+' .settings-param.focus .settings-param__descr,'+base+' .selectbox-item.focus .selectbox-item__subtitle{color:'+ink+'}';
        css += base+' .selectbox-item.selected:not(.nomark)::after{border-color:'+accent+'}'+base+' .selectbox-item.selected.focus::after{border-color:'+ink+'}';
        css += base+' .card.focus .card__view::after,'+base+' .card-episode.focus .full-episode::after{border-color:'+accent+';box-shadow:0 0 1.1em '+tint+'}';
        css += base+' .full-start__button{border:0!important;outline:0!important;box-shadow:none!important}'+base+' .full-start__button:not(.focus){background:#222d40;color:#f3f5fa}';
        css += base+' .timeline__line,'+base+' .player-panel__position{background:'+accent+';background-image:'+fill+'}';
        return css;
    }
    function glassCSS(accent,tint,fill,ink) {
        var base = 'body.faborn-glass', css = '';
        var levels = {
            solid:{surface:1,chrome:1,button:1,legacy:1,legacyButton:1,player:1,veil:.48},
            low:{surface:.9,chrome:.88,button:.7,legacy:1,legacyButton:.96,player:.97,veil:.4},
            standard:{surface:.74,chrome:.72,button:.46,legacy:1,legacyButton:.9,player:.94,veil:.32},
            high:{surface:.54,chrome:.52,button:.3,legacy:.9,legacyButton:.8,player:.84,veil:.24},
            max:{surface:.34,chrome:.32,button:.18,legacy:.78,legacyButton:.68,player:.74,veil:.16}
        };
        var glass = levels[storage('glass_transparency','standard')] || levels.standard;
        var edge = 'inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(255,255,255,.06),0 1.2em 3em rgba(0,0,0,.32)';
        var sheen = 'linear-gradient(145deg,rgba(255,255,255,.15),rgba(255,255,255,.025) 45%,rgba(255,255,255,.07))';
        var surfaces = '.settings__content,.selectbox__content,.modal__content,.settings-input__content,.fbr-window';
        var chrome = '.head__actions,.navigation-bar__body,.menu,.noty';
        var buttons = '.head__action,.menu__item,.full-start__button,.settings-folder,.settings-param,.selectbox-item,.modal__button,.navigation-tabs__button,.filter__item,.simple-button,.player-panel .button,.search-source,.hg-button,.fbr-btn';
        var focus = '.head__action.focus,.head__action.hover,.menu__item.focus,.menu__item.hover,.full-start__button.focus,.settings-folder.focus,.settings-param.focus,.selectbox-item.focus,.modal__button.focus,.navigation-tabs__button.focus,.filter__item.focus,.simple-button.focus,.player-panel .button.focus,.search-source.focus,.hg-button.focus,.hg-button.hg-selectedButton,.fbr-btn.focus';
        function rule(selectors,style) {
            css += selectors.split(',').map(function (s) { return base+' '+s; }).join(',')+'{'+style+'}';
        }
        // No filter or compositing layer on body, the player root, or the native Tizen video plane.
        css += base+':not(.player--viewing){background:#101522!important;color:#f7f8fc}';
        rule(surfaces,'background-color:rgba(36,43,56,'+glass.legacy+')!important;background-image:'+sheen+'!important;color:#f7f8fc;border:0;border-radius:1.65em;box-shadow:'+edge);
        rule('.settings__content,.selectbox__content','border-radius:1.65em 0 0 1.65em');
        rule(chrome,'background-color:rgba(38,46,59,'+glass.legacy+');background-image:'+sheen+';color:#f7f8fc;box-shadow:'+edge);
        rule('.head__actions','border-radius:3em;padding:.22em .4em');
        rule('.head__action','border-radius:50%;margin-left:.4em');
        rule('.head__action:first-child','margin-left:0');
        rule('.head__time','padding-left:.6em');
        rule('.menu','border-radius:0 1.6em 1.6em 0;padding:.5em 0');
        rule('.menu__list','padding:0 .55em');
        rule('.menu__item','border-radius:1em;padding:.9em 1.1em');
        rule('.menu__item.traverse','background:rgba(255,255,255,.12);color:#fff');
        rule('.menu__item.traverse .menu__ico [stroke]','stroke:#fff');
        rule('.menu__item.traverse .menu__ico [fill]:not([fill="none"])','fill:#fff');
        rule('.navigation-bar__body','border:0;border-radius:1.65em');
        rule('.navigation-tabs','padding:.3em;border-radius:2em;background:rgba(255,255,255,.06)');
        rule('.navigation-tabs__button,.filter__item,.simple-button,.modal__button,.search-source','border-radius:2em');
        rule('.navigation-tabs__button.active,.search-source.active','background:rgba(255,255,255,.16);color:#fff');
        rule('.settings__layer,.selectbox__layer','background:rgba(4,8,16,'+glass.veil+')');
        rule('.modal','background-color:rgba(4,8,16,'+(glass.veil+.08).toFixed(2)+')');
        rule('.settings__title,.selectbox__title,.modal__title','font-weight:600;letter-spacing:-.025em');
        rule('.settings-folder,.settings-param,.selectbox-item','border-radius:1.05em;margin:0 .65em .25em;padding:1em 1.2em');
        rule('.settings-param__value,.settings-param__descr,.selectbox-item__subtitle','color:#c9d3e3;opacity:1');
        rule('.settings-param-title > span,.selectbox-item.selected:not(.nomark)','color:'+accent);
        rule('.selectbox-item.selected:not(.nomark)::after','border-color:'+accent);
        rule('.full-start__button,.modal__button,.simple-button,.filter__item','background-color:rgba(255,255,255,.12);background-image:'+sheen+';color:#f7f8fc;border:0!important;outline:0!important;box-shadow:none!important');
        rule('.full-start__button','border-radius:2em;background-color:rgba(35,44,58,'+glass.legacyButton+')');
        rule('.card__img,.card__view,.full-episode','border-radius:1.1em');
        rule('.card.focus .card__view::after,.card-episode.focus .full-episode::after','border-color:#e7f2ff;border-radius:1.35em;box-shadow:0 0 1.5em '+tint);
        rule('.timeline__line,.player-panel__position,.fbr-progress-track i','background:'+accent+';background-image:'+fill);
        rule('.player-panel__body','background-color:rgba(24,31,43,'+glass.player+');background-image:'+sheen+';border-radius:1.6em 1.6em 0 0;box-shadow:'+edge);
        rule('.player-panel .button','border-radius:1.2em');
        rule('.noty','left:12%;right:12%;bottom:1em;border-radius:1.4em');
        rule('.noty:not(.noty--visible)','visibility:hidden');
        rule('.simple-keyboard.hg-theme-default','background:transparent');
        rule('.hg-button','border:0;border-radius:.8em;background:rgba(255,255,255,.12);color:#fff;box-shadow:none');
        rule('.settings-input__input,.simple-keyboard-input','background:rgba(0,0,0,.18);border:0;border-radius:.8em;color:#fff');
        rule('.fbr-overlay','background:rgba(4,8,16,'+glass.veil+')');
        rule('.fbr-window','border-radius:1.8em');
        rule('.fbr-header','border:0;border-image:none;padding:1.2em 1.55em;box-shadow:0 1px 0 rgba(255,255,255,.09)');
        rule('.fbr-brand','letter-spacing:-.02em');
        rule('.fbr-brand small','color:#cad5e7;letter-spacing:.1em');
        rule('.fbr-close','border-radius:50%;background:rgba(255,255,255,.1)');
        rule('.fbr-title','letter-spacing:-.035em;line-height:1.15');
        rule('.fbr-label','font-size:.74em;letter-spacing:.07em;color:#d7dfed');
        rule('.fbr-meta,.fbr-small,.fbr-hint,.fbr-overview,.fbr-episode-overview,.fbr-progress','color:#c8d3e5');
        rule('.fbr-btn','border:0;border-radius:1.05em;background:rgba(255,255,255,.09);background-image:'+sheen+';color:#f7f8fc');
        rule('.fbr-control,.fbr-source','border-radius:2em');
        rule('.fbr-control','padding:.6em 1em');
        rule('.fbr-btn.chosen','background:'+tint+';background-image:'+sheen+';color:'+accent);
        rule('.fbr-btn.fbr-control.chosen,.fbr-play','background:'+accent+';background-image:'+fill+';color:'+ink);
        rule('.fbr-voice-main','padding:.95em 1.1em');
        rule('.fbr-voice','margin:.75em 0');
        rule('.fbr-footer','border:0;background:rgba(12,18,29,.2);box-shadow:0 -1px 0 rgba(255,255,255,.09)');
        rule('.fbr-play','border-radius:2em;padding:.9em 1.2em');
        rule('.fbr-refresh','background:transparent;color:#cad5e7');
        rule('.fbr-cinema .fbr-story','background:rgba(8,15,28,.28)');
        rule('.fbr-art','opacity:.7');
        rule('.fbr-story:after','background:linear-gradient(180deg,rgba(16,22,35,.03),rgba(16,22,35,.88) 88%)');
        rule('.fbr-progress-track','background:rgba(255,255,255,.13)');
        rule('.fbr-loading i','background:rgba(255,255,255,.13)');
        // White glass marks remote focus; the saved accent marks selection, so they remain distinct.
        if (glass.surface < .6) rule(surfaces+','+chrome,'text-shadow:0 1px 3px rgba(0,0,0,.75)');
        rule(focus,'background:#eff6ff!important;background-image:linear-gradient(145deg,#ffffff,#d3e6fc)!important;color:#132236!important;border:0!important;outline:0!important;box-shadow:0 .35em 1em rgba(0,0,0,.2)!important;text-shadow:none');
        rule('.fbr-btn.focus','filter:none;transform:scale(1.018)');
        rule('.settings-param.focus .settings-param__value,.settings-param.focus .settings-param__descr,.selectbox-item.focus .selectbox-item__subtitle,.fbr-btn.focus .fbr-small,.fbr-btn.focus .fbr-language,.fbr-episode.focus .fbr-episode-overview,.fbr-episode.focus .fbr-episode-status','color:#243d59');
        rule('.selectbox-item.selected.focus::after','border-color:#243d59');
        rule('.menu__item.focus .menu__ico [stroke],.menu__item.hover .menu__ico [stroke]','stroke:#132236');
        rule('.menu__item.focus .menu__ico [fill]:not([fill="none"]),.menu__item.hover .menu__ico [fill]:not([fill="none"])','fill:#132236');
        // Without blur, retain denser glass for readability. Only backgrounds change, never container opacity.
        css += '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){';
        rule(surfaces,'background-color:rgba(29,38,54,'+glass.surface+')!important;-webkit-backdrop-filter:blur(28px) saturate(155%);backdrop-filter:blur(28px) saturate(155%)');
        rule(chrome,'background-color:rgba(29,38,54,'+glass.chrome+');-webkit-backdrop-filter:blur(20px) saturate(145%);backdrop-filter:blur(20px) saturate(145%)');
        rule('.full-start__button','background-color:rgba(29,38,54,'+glass.button+');-webkit-backdrop-filter:blur(14px) saturate(130%);backdrop-filter:blur(14px) saturate(130%)');
        css += '}@media(prefers-reduced-motion:no-preference){';
        rule(buttons,'transition:background-color .16s,color .16s,box-shadow .16s');
        css += '}';
        return css;
    }
    function presentationCSS(accent,tint,fill,ink) {
        return '.fbr-overlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:54;background:rgba(3,7,15,.72);color:#f4f6fb;font-size:1em;line-height:1.4;text-align:left}' +
        '.fbr-overlay *{box-sizing:border-box}.fbr-window{position:absolute;top:3vh;bottom:3vh;right:3vw;width:43vw;min-width:25em;background:#141c2a;border:1px solid #354158;border-radius:1.35em;box-shadow:0 1.5em 4em rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}' +
        '.fbr-header{display:flex;align-items:center;justify-content:space-between;padding:1.15em 1.45em;border-bottom:1px solid #303b50;flex-shrink:0}.fbr-brand{display:flex;align-items:center;font-size:1.05em;font-weight:700;letter-spacing:.015em}.fbr-brand svg{width:1.8em;height:1.8em;margin-right:.65em}.fbr-brand small{font-size:.67em;color:#adbad1;font-weight:400;display:block;letter-spacing:.1em;text-transform:uppercase}' +
        '.fbr-close{width:2.3em;height:2.3em;display:flex;align-items:center;justify-content:center;font-size:1.15em}.fbr-layout{display:flex;flex:1;min-height:0}.fbr-story{display:none}.fbr-content{flex:1;min-width:0;overflow-y:auto;padding:1.45em;scrollbar-width:thin;scrollbar-color:#50617c transparent}.fbr-content::-webkit-scrollbar{width:.3em}.fbr-content::-webkit-scrollbar-thumb{background:#50617c;border-radius:1em}' +
        '.fbr-language{display:inline-flex;align-items:center;margin-right:.5em;font-size:.74em;font-weight:700;white-space:nowrap}.fbr-language svg{width:1.35em;height:1.35em;margin-right:.25em;flex-shrink:0}.fbr-language-uk{color:#82dfc1}.fbr-language-en{color:#91bdff}.fbr-language-original{color:#c3cbd8}.fbr-btn.focus .fbr-language{color:inherit}.fbr-header{border-top:3px solid '+accent+';border-image:'+fill+' 1}.fbr-btn.fbr-control.chosen{background:'+accent+';background-image:'+fill+';color:'+ink+'}' +
        '.fbr-title{font-size:1.85em;font-weight:700;line-height:1.1;margin:0 0 .35em;word-wrap:break-word}.fbr-meta{color:#adbad1;font-size:.86em;margin-bottom:1.35em}.fbr-label{color:#b7c4d8;font-size:.72em;letter-spacing:.12em;text-transform:uppercase;margin:1.4em 0 .7em}.fbr-controls{display:flex;flex-wrap:wrap;margin:-.22em}.fbr-control{padding:.55em .85em;margin:.22em;min-width:3.8em;text-align:center}' +
        '.fbr-btn{background:#222e42;border:0;color:#f4f6fb;border-radius:.65em;cursor:pointer;position:relative}.fbr-btn.chosen{background:'+tint+';color:'+accent+'}.fbr-btn.focus{background:'+accent+'!important;background-image:'+fill+'!important;color:'+ink+'!important;box-shadow:none;filter:brightness(1.15);transform:scale(1.025);z-index:1}.fbr-btn.focus .fbr-small{color:'+ink+'}.fbr-btn:focus{outline:none}' +
        '.fbr-voice{margin:.65em 0}.fbr-voice-main{padding:.8em 1em;display:flex;align-items:center;justify-content:space-between}.fbr-voice-name{font-size:1.02em;font-weight:600;word-wrap:break-word;min-width:0}.fbr-small{display:block;color:#b0bdd2;font-size:.76em;margin-top:.2em;font-weight:400}.fbr-mark{margin-left:.7em;font-size:1.2em;flex-shrink:0}.fbr-sources{display:flex;flex-wrap:wrap;padding:.45em .3em 0;margin:0 -.25em}.fbr-source{font-size:.8em;padding:.65em .85em;margin:.25em}' +
        '.fbr-footer{padding:1.1em 1.45em;border-top:1px solid #303b50;flex-shrink:0}.fbr-play{padding:.85em 1em;background:'+accent+';background-image:'+fill+';color:'+ink+';text-align:center;font-size:1.05em;font-weight:700}.fbr-hint{color:#adbad1;font-size:.72em;margin-top:.8em;text-align:center}.fbr-refresh{font-size:.8em;text-align:center;padding:.65em .8em;margin-top:1.5em;background:transparent}' +
        '.fbr-last{padding:.6em .85em;margin-top:.8em;font-size:.85em}.fbr-episode{display:flex;overflow:hidden;margin:.8em 0;min-height:6.5em}.fbr-episode-image{width:34%;flex-shrink:0;position:relative;background:#30425e;display:flex;align-items:center;justify-content:center;min-height:6.5em}.fbr-episode-image b{font-size:1.4em}.fbr-episode-image img{position:absolute;width:100%;height:100%;object-fit:cover;left:0;top:0}.fbr-episode-body{padding:.7em .9em;min-width:0;flex:1}.fbr-episode-body strong{font-size:1em;display:block}.fbr-episode-status{display:block;font-size:.75em;margin:.4em 0;color:'+accent+'}.fbr-episode.focus .fbr-episode-status{color:inherit}.fbr-episode .fbr-progress-track{display:block;margin:.4em 0}.fbr-episode-overview{display:block;color:#b0bdd2;font-size:.72em;max-height:2.8em;overflow:hidden}.fbr-episode.focus .fbr-episode-overview{display:block;color:inherit}.fbr-episodes .fbr-content{padding-top:.8em}.fbr-episodes.fbr-cinema .fbr-window{left:18vw;right:18vw}.fbr-episodes.fbr-cinema .fbr-footer{padding:1em 2em}.fbr-episodes.fbr-cinema .fbr-episode-image{width:30%}' +
        '.fbr-progress{margin:.9em 0;color:#b7c4d8;font-size:.76em}.fbr-progress-track{height:.28em;background:#354158;border-radius:1em;margin:.65em 0;overflow:hidden}.fbr-progress-track i{display:block;height:100%;background:'+accent+';background-image:'+fill+'}.fbr-empty{padding:2em .5em;color:#b7c4d8}.fbr-empty strong{display:block;color:#f3f5fa;font-size:1.2em;margin-bottom:.6em}.fbr-loading{padding:2em 0}.fbr-loading i{display:block;height:.55em;margin:.85em 0;background:#29374e;border-radius:1em;width:82%}.fbr-loading i:nth-child(2){width:64%}.fbr-loading i:nth-child(3){width:72%}' +
        '.fbr-cinema .fbr-window{left:5vw;right:5vw;top:5vh;bottom:5vh;width:auto;min-width:0}.fbr-cinema .fbr-story{display:flex;flex-direction:column;justify-content:flex-end;width:43%;flex-shrink:0;padding:2.2em;background:#1b2a40;position:relative;overflow:hidden}.fbr-art{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;opacity:.36}.fbr-story:after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(180deg,rgba(14,22,36,.05),#111b2c 88%)}.fbr-story-info{position:relative;z-index:1}.fbr-story .fbr-title{font-size:2.7em}.fbr-overview{color:#b7c4d8;font-size:.9em;line-height:1.65;max-height:8.2em;overflow:hidden}.fbr-cinema .fbr-content{padding:1.8em 2em}.fbr-cinema .fbr-mini-title{display:none}.fbr-cinema .fbr-footer{padding:1em 2em 1em 46%}.fbr-cinema .fbr-controls{margin-bottom:.4em}' +
        '@media(max-width:800px){.fbr-window{width:57vw;min-width:23em}.fbr-cinema .fbr-story{width:38%;padding:1.4em}.fbr-cinema .fbr-story .fbr-title{font-size:2em}.fbr-cinema .fbr-content{padding:1.3em}.fbr-cinema .fbr-footer{padding-left:41%}}' +
        '@media(max-width:560px){.fbr-overlay{font-size:16px}.fbr-window,.fbr-cinema .fbr-window{left:3vw;right:3vw;top:2vh;bottom:2vh;width:auto;min-width:0}.fbr-cinema .fbr-story{display:none}.fbr-cinema .fbr-mini-title{display:block}.fbr-cinema .fbr-footer{padding:1em 1.45em}.fbr-content,.fbr-cinema .fbr-content{padding:1.1em}.fbr-title{font-size:1.5em}}';
    }
    function buttonHTML(key,label,extra,chosen) {
        return '<div role="button" tabindex="0" class="selector fbr-btn '+(extra || '')+(chosen ? ' chosen' : '')+'" data-fbr="'+escapeHTML(key)+'"'+(key === 'close' ? ' aria-label="Закрити"' : '')+(chosen ? ' aria-pressed="true"' : '')+'>'+label+'</div>';
    }
    function posterURL(movie) {
        var path = movie.backdrop_path || movie.poster_path;
        return /^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(text(path)) ? 'https://image.tmdb.org/t/p/w780'+path : '';
    }
    function clockLabel(seconds) {
        var n = Math.max(0,Math.floor(+seconds || 0)), h = Math.floor(n/3600), m = Math.floor(n/60)%60, s = n%60;
        return (h ? h+':'+(m < 10 ? '0' : '') : '')+m+':'+(s < 10 ? '0' : '')+s;
    }
    function progressFor(session) {
        try { return episodeTimeline(session.title,{season:session.season,episode:session.episode}); }
        catch (ignore) { return {}; }
    }
    function progressLabel(progress) {
        if (+progress.percent >= 90) return 'Переглянуто';
        if (+progress.time > 0) return clockLabel(progress.time)+(progress.duration ? ' / '+clockLabel(progress.duration) : '');
        return 'Ще не дивилися';
    }
    function lastPosition(session) {
        var last = storage('position_'+session.title.id,{});
        return last && last.updated && +last.season > 0 && +last.episode > 0 ? last : null;
    }
    function returnToLast(session) {
        var last = lastPosition(session);
        if (!last) return renderSources(session);
        session.season = +last.season; session.episode = +last.episode; session.uiFocus = 'episode';
        prepareSelection(session);
    }
    function showPresentation(session,view,busy) {
        if (activeSession !== session) return;
        session.screen = busy ? 'loading' : 'sources';
        closePresentation(); L.Select.hide();
        var cinema = storage('layout','panel') === 'cinema', title = session.title;
        var selected = view && (view.groups.filter(function (g) { return g.key === session.focusVoice; })[0] || view.groups[0]);
        var actions = {}, progress = progressFor(session), content = '', meta = (title.year ? title.year+' · ' : '')+(title.type === 'tv' ? 'Серіал' : 'Фільм');
        var heading = '<h2 class="fbr-title">'+escapeHTML(title.title)+'</h2><div class="fbr-meta">'+escapeHTML(meta)+'</div>';
        function btn(key,label,extra,chosen,handler) { actions[key] = handler; return buttonHTML(key,label,extra,chosen); }
        var close = btn('close','&#215;','fbr-close',false,restore);
        var track = +progress.percent > 0 ? '<div class="fbr-progress">Збережено '+clockLabel(progress.time)+'<div class="fbr-progress-track"><i style="width:'+Math.max(0,Math.min(100,+progress.percent || 0))+'%"></i></div></div>' : '';
        content += '<div class="fbr-mini-title">'+heading+track+'</div>';
        if (busy) content += '<div class="fbr-loading"><strong>'+escapeHTML(busy.charAt(0).toUpperCase()+busy.slice(1))+'…</strong><i></i><i></i><i></i><div class="fbr-small">UAKino · UASerials · UAFix · KinoBase</div></div>';
        else {
            if (session.labStarted) content += btn('labstatus','UAKinogo / Alloha · експеримент<span class="fbr-small">'+escapeHTML(session.status.uakinogo)+'</span>','fbr-last',false,function () { cardLabDetails(session); });
            if (title.type === 'tv') {
                content += '<div class="fbr-controls">'+btn('season','Сезон '+session.season,'fbr-control',false,function () { session.uiFocus = 'season'; chooseSeason(session); })+btn('episode','Серія '+session.episode,'fbr-control',false,function () { session.uiFocus = 'episode'; chooseEpisode(session,true); })+'</div>';
                var last = lastPosition(session);
                if (last) content += btn('last','Ви дивилися S'+last.season+'E'+last.episode+'<span class="fbr-small">'+escapeHTML(progressLabel(last))+'</span>','fbr-last',false,function () { returnToLast(session); });
            }
            if (view.qualities.length) {
                content += '<div class="fbr-label">Якість</div><div class="fbr-controls">';
                view.qualities.forEach(function (q) { content += btn('q-'+q,escapeHTML(qualityLabel(q)),'fbr-control',q === view.quality,function () { session.uiFocus = 'q-'+q; session.qualityPreference = q; save('quality',q); renderSources(session); }); });
                content += '</div>';
            }
            content += '<div class="fbr-label">Озвучення'+(view.groups.length ? ' · '+view.groups.length : '')+'</div>';
            view.groups.forEach(function (g,index) {
                var names = unique(g.entries.map(function (entry) { return sourceName(entry.release.source); })).join(' · '), expanded = selected === g;
                content += '<div class="fbr-voice">'+btn('voice-'+index,'<span class="fbr-voice-name">'+languageBadge(g.language)+escapeHTML(g.voice)+'<span class="fbr-small">'+escapeHTML(names)+'</span></span><span class="fbr-mark">'+(g.entries.length === 1 ? '&#9654;' : expanded ? '&#8722;' : '+')+'</span>','fbr-voice-main',expanded,function () {
                    session.focusVoice = g.key; session.uiFocus = 'voice-'+index;
                    if (g.entries.length === 1) selectStream(session,g.entries[0]);
                    else { session.uiFocus = 'source-'+index+'-0'; renderSources(session); }
                });
                if (expanded && g.entries.length > 1) {
                    var totals = {}, seen = {};
                    g.entries.forEach(function (e) { totals[e.release.source] = (totals[e.release.source] || 0)+1; });
                    content += '<div class="fbr-sources">';
                    g.entries.forEach(function (entry,n) {
                        var id = entry.release.source; seen[id] = (seen[id] || 0)+1;
                        content += btn('source-'+index+'-'+n,'&#9654; '+escapeHTML(sourceName(id)+(totals[id] > 1 ? ' · '+seen[id] : '')),'fbr-source',false,function () { session.focusVoice = g.key; selectStream(session,entry); });
                    });
                    content += '</div>';
                }
                content += '</div>';
            });
            if (!selected) content += '<div class="fbr-empty"><strong>Потоку поки немає</strong>Спробуй іншу серію або повтори пошук. Стан джерел доступний у діагностиці модуля.</div>';
            var issue = kinoIssue(session,view);
            if (issue) content += btn('kinostatus',escapeHTML(issue.title)+'<span class="fbr-small">'+escapeHTML(issue.message)+'</span>','fbr-last',false,function () { kinoDetails(session); });
            content += btn('refresh','Оновити джерела','fbr-refresh',false,function () { startDiscovery(session.movie); });
        }
        var play = '', resume = +progress.time > 10 && +progress.percent > 0 && +progress.percent < 90 && L.Storage.field && L.Storage.field('player_timecode') === 'continue';
        if (!busy && selected) play = btn('play','&#9654; '+(resume ? 'Продовжити з '+clockLabel(progress.time) : 'Дивитися'),'fbr-play',false,function () { session.focusVoice = selected.key; selectStream(session,selected.entries[0]); });
        var hint = busy ? 'Назад — скасувати' : selected ? selected.voice+' · '+qualityLabel(view.quality)+' · '+sourceName(selected.entries[0].release.source) : 'Назад — повернутися до картки';
        if (!busy && selected) hint += subtitleHint(selected.entries[0].episode);
        var art = posterURL(session.movie), story = '<div class="fbr-story">'+(art ? '<img class="fbr-art" alt="" src="'+escapeHTML(art)+'">' : '')+'<div class="fbr-story-info">'+heading+'<p class="fbr-overview">'+escapeHTML(plain(session.movie.overview || ''))+'</p>'+track+'</div></div>';
        var html = $('<div class="fbr-overlay'+(cinema ? ' fbr-cinema' : ' fbr-panel')+'"><section class="fbr-window" role="dialog" aria-modal="true" aria-label="'+escapeHTML(NAME+' · '+title.title)+'"><div class="fbr-header"><div class="fbr-brand">'+ICON+'<span>'+NAME+'<small>'+(cinema ? 'Кінозал' : 'Панель')+'</small></span></div>'+close+'</div><div class="fbr-layout">'+story+'<div class="fbr-content">'+content+'</div></div><div class="fbr-footer">'+play+'<div class="fbr-hint">'+escapeHTML(hint)+'</div></div></section></div>');
        var focusKey = busy ? 'close' : session.uiFocus || (selected ? 'voice-'+view.groups.indexOf(selected) : 'refresh');
        mountPresentation(session,html,actions,focusKey,restore,!busy);
    }
    function mountPresentation(session,html,actions,focusKey,onBack,rememberFocus) {
        presentation = {html:html,session:session};
        $('body').append(html);
        html.find('.fbr-art').on('error',function () { $(this).remove(); });
        html.find('[data-fbr]').on('hover:enter',function () {
            if (!presentation || presentation.html !== html || activeSession !== session) return;
            var key = $(this).attr('data-fbr'); if (actions[key]) actions[key]();
        }).on('hover:focus',function () {
            if (!presentation || presentation.html !== html) return;
            focusKey = $(this).attr('data-fbr');
            if (rememberFocus) session.uiFocus = focusKey;
            if (session.screen === 'episodes') session.episodeFocus = focusKey;
            var box = html.find('.fbr-content')[0];
            if (!box.contains(this)) return;
            var outer = box.getBoundingClientRect(), inner = this.getBoundingClientRect(), pad = 12;
            if (inner.top < outer.top+pad) box.scrollTop -= outer.top+pad-inner.top;
            else if (inner.bottom > outer.bottom-pad) box.scrollTop += inner.bottom-outer.bottom+pad;
        });
        L.Controller.add('faborn_ukr_view',{
            toggle:function () { if (!presentation || presentation.html !== html) return; var wanted = focusKey; L.Controller.collectionSet(html); var target = html.find('[data-fbr]').filter(function () { return $(this).attr('data-fbr') === wanted; }); L.Controller.collectionFocus(target.length ? target[0] : false,html); },
            up:function () { root.Navigator.move('up'); },down:function () { root.Navigator.move('down'); },left:function () { root.Navigator.move('left'); },right:function () { root.Navigator.move('right'); },back:onBack,
            gone:function () { if (presentation && presentation.html === html) { closePresentation(); cancelCardLab(); stopKinoSession(); cancelPending(); activeSession = null; } }
        });
        L.Controller.toggle('faborn_ukr_view');
    }
    function xhr(url, callback, timeout, post, ajax) {
        var req = new root.XMLHttpRequest(), finished = false;
        function done(error, body) {
            if (finished) return;
            finished = true;
            callback(error, body, req.status || 0);
        }
        req.onload = function () {
            if (req.status >= 200 && req.status < 300) done(null, req.responseText);
            else done(new Error('HTTP ' + req.status));
        };
        req.onerror = function () { done(new Error('Мережа / CORS / TLS: HTTP-статус недоступний')); };
        req.ontimeout = function () { done(new Error('Час очікування вичерпано')); };
        try {
            req.open(post ? 'POST' : 'GET', url, true);
            req.timeout = timeout || 18000;
            // The public KinoBase player uses an anonymous cookie set by its title page.
            if (/^https:\/\/kinobase\.org\//i.test(url)) req.withCredentials = true;
            if (post) req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            if (ajax) req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            req.send(post || null);
        } catch (error) { done(error); }
        return req;
    }

    // Read public markup as data. Never attach source HTML or execute its scripts.
    function decodeHTML(value) {
        var entities = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—'};
        return text(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, code) {
            if (code.charAt(0) !== '#') return own(entities, code) ? entities[code] : all;
            var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.substr(2), 16) : parseInt(code.substr(1), 10);
            return n > 0 && n <= 65535 ? String.fromCharCode(n) : all;
        });
    }
    function cleanMarkup(html) { return text(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''); }
    function plain(html) { return decodeHTML(cleanMarkup(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
    function attrs(tag) {
        var out = Object.create(null), re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, m;
        while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeHTML(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]);
        return out;
    }
    function uakinoURL(url) { return /^https:\/\/uakino\.best\/[^\s<>"'\\]*$/i.test(text(url)); }
    function sourceURL(url) {
        url = decodeHTML(text(url));
        if (url.indexOf('//') === 0) url = 'https:' + url;
        else if (url.charAt(0) === '/') url = 'https://uakino.best' + url;
        return uakinoURL(url) ? url.split('#')[0] : '';
    }
    function pageID(url) { var m = /\/(\d+)-[^/]+\.html(?:\?|$)/.exec(text(url)); return m ? m[1] : ''; }
    function embedURL(url) {
        url = text(url).replace(/^\/\//, 'https://');
        return /^https:\/\/(?:(?:ashdi\.vip|zetvideo\.net|tortuga\.(?:tw|wtf))\/(?:vod|serial)\/\d+\/?|hdvbua\.pro\/embed\/\d+\/[a-z0-9]+)(?:\?[^\s<>"'\\]*)?$/i.test(url) ? url : '';
    }
    function seasonNumber(value) { var m = /(?:(\d+)\s*(?:сезон|season)|(?:сезон|season)\s*(\d+))/i.exec(value); return m ? parseInt(m[1] || m[2], 10) : 0; }
    function withoutSeason(value) { return text(value).replace(/\s*\d+\s*(?:сезон|season)\s*/i, '').trim(); }
    function fieldValue(html, label) {
        var re = /<div\b([^>]*\bclass\s*=["'][^"']*\bfi-label\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>\s*<div\b([^>]*)>([\s\S]*?)<\/div>/gi, m;
        while ((m = re.exec(html))) {
            if (/(^|\s)fi-label(\s|$)/.test(attrs(m[1])['class'] || '') && label.test(plain(m[2]))) return plain(m[4]);
        }
        return '';
    }
    function metaAudioLanguage(html) {
        var re = /<meta\b([^>]*)>/gi, m;
        while ((m = re.exec(html))) {
            var a = attrs(m[1]), code = text(a.content).toLowerCase().split('-')[0];
            if (a.itemprop === 'inLanguage' && /^(uk|en|ru)$/.test(code)) return code;
        }
        return '';
    }
    function challenge(html) { return /<title[^>]*>\s*(?:Just a moment|Attention Required)|id=["']challenge-(?:running|stage)|cf-chl-|Триває перевірка безпеки/i.test(html); }
    function parseSearch(html) {
        if (challenge(html)) throw new Error('UAKino повернув перевірку Cloudflare замість результатів.');
        var clean = cleanMarkup(html), rows = [], seen = Object.create(null);
        if (!/Пошук по сайту|За Вашим запитом|Пошук за фразою/i.test(plain(clean))) throw new Error('Замість результатів отримано іншу сторінку UAKino.');
        var chunks = clean.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bshort-item\b[^"']*["'][^>]*>/i);
        chunks.slice(1).forEach(function (chunk) {
            var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
            while ((m = re.exec(chunk))) {
                var a = attrs(m[1]);
                if (!/(^|\s)movie-title(\s|$)/.test(a['class'] || '')) continue;
                var url = sourceURL(a.href), id = pageID(url), name = plain(m[2]);
                if (!id || !name || seen[id]) break;
                seen[id] = true;
                var year = /\b(?:19|20)\d{2}\b/.exec(fieldValue(chunk, /Рік виходу/i));
                var season = seasonNumber(plain(chunk).slice(0,400)) || seasonNumber(url.replace(/-/g, ' '));
                rows.push({id: id, url: url, title: name, year: year ? +year[0] : 0, season: season});
                break;
            }
        });
        if (!rows.length && !/За Вашим запитом|Пошук по сайту|знайдено\s*0|не знайдено|не дав результат/i.test(clean)) throw new Error('Невідомий формат сторінки пошуку UAKino.');
        return rows.slice(0,60);
    }
    function parseSource(html, url) {
        if (!uakinoURL(url) || !pageID(url)) throw new Error('Некоректна сторінка UAKino.');
        if (challenge(html)) throw new Error('UAKino повернув перевірку Cloudflare замість сторінки.');
        var clean = cleanMarkup(html).split(/<[^>]+id=["']dle-comments/i)[0];
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean), original = /<span\b[^>]*class=["']origintitle["'][^>]*>([\s\S]*?)<\/span>/i.exec(clean);
        if (!h) throw new Error('Не знайдено назву фільму на сторінці UAKino.');
        var name = plain(h[1]), season = seasonNumber(name), year = /\b(?:19|20)\d{2}\b/.exec(fieldValue(clean, /Рік виходу/i));
        var voice = fieldValue(clean, /(?:Мова озвучення|Озвучення)/i);
        var language = metaAudioLanguage(clean) || audioLanguage(voice,'');
        if (!language || language === 'other') throw new Error('Сторінка не підтверджує підтримувану мову озвучення.');
        var title = {id: 'uakino-' + pageID(url), title: withoutSeason(name), originalTitle: original ? withoutSeason(plain(original[1])) : '', year: year ? +year[0] : 0, type: season || /schema.org\/TVSeries/i.test(clean) ? 'tv' : 'movie', source:'uakino', sourcePage: url, season: season || 1, audioLanguage:language,audioEvidence: voice || 'inLanguage='+language, voice: voice || defaultVoice(language), releases: [], embeds: [], seasonPages: []};
        var re = /<(iframe|link|div|li)\b([^>]*)>/gi, m;
        while ((m = re.exec(clean))) {
            var a = attrs(m[2]), embed = embedURL(a.src || a['data-src'] || (a.itemprop === 'video' ? a.value : ''));
            if (embed && title.embeds.indexOf(embed) < 0) title.embeds.push(embed);
            if (/(^|\s)playlists-ajax(\s|$)/.test(a['class'] || '') && a['data-news_id'] === pageID(url) && /^[a-z0-9_]+$/i.test(a['data-xfname'] || '')) {
                title.playlistURL = 'https://uakino.best/engine/ajax/playlists.php?news_id=' + pageID(url) + '&xfield=' + encodeURIComponent(a['data-xfname']);
            }
        }
        var seasons = /<ul\b[^>]*class=["'][^"']*\bseasons\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(clean);
        if (seasons) {
            re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            while ((m = re.exec(seasons[1]))) {
                var next = sourceURL(attrs(m[1]).href);
                if (pageID(next) && next !== url) title.seasonPages.push({title: plain(m[2]), url: next});
            }
        }
        addEpisodeRefs(title, clean);
        return title;
    }
    function addEpisodeRefs(title, html) {
        var re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi, m, clean = cleanMarkup(html);
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), embed = embedURL(a['data-file']), label = plain(m[2]);
            var n = /(?:серія|серії|episode)\s*(\d+)|(\d+)\s*(?:серія|серії)/i.exec(label);
            var voice = plain(a['data-voice'] || (title.type === 'movie' ? label : '') || title.voice);
            if (!embed || foreignVoice(voice,title.originalLanguage) || title.type === 'tv' && !n) continue;
            var number = title.type === 'movie' ? 0 : +(n[1] || n[2]), season = title.type === 'movie' ? 0 : +a['data-season'] || title.season;
            var release = newRelease(title,voice);
            if (!release.episodes.some(function (e) { return e.season === season && e.episode === number; })) release.episodes.push({id:release.id+'-s'+season+'e'+number,title:label,season:season,episode:number,embed:embed,state:'pending'});
        }
    }
    function quotedProperty(source, key) {
        var re = new RegExp('(?:^|[,{\\s])(?:["\']?' + key + '["\']?)\\s*:\\s*(["\'])((?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*)\\1'), m = re.exec(source);
        if (!m) return '';
        return decodeHTML(m[2].replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, function (_, c) {
            if (/^u/.test(c) && c.length === 5) return String.fromCharCode(parseInt(c.substr(1),16));
            if (/^x/.test(c) && c.length === 3) return String.fromCharCode(parseInt(c.substr(1),16));
            return c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c;
        }));
    }
    function parseEmbed(html) {
        var start = text(html).search(/new\s+Playerjs\s*\(/), config = text(html).substr(start), file;
        if (start < 0) throw new Error('Ashdi: не знайдено відкритий HLS-плеєр.');
        file = quotedProperty(config, 'file');
        if (!mediaURL(file) || !/\.m3u8(?:\?|$)/i.test(file)) throw new Error('Ashdi: цей формат плеєра поки не підтримується.');
        return {master:file,subtitles:subtitlesFrom(quotedProperty(config, 'subtitle'))};
    }
    function resolveMedia(base, value) {
        if (/^https:\/\//i.test(value)) return mediaURL(value) ? value : '';
        if (/^(?:\/\/|[a-z]+:)/i.test(value)) return '';
        var origin = /^https:\/\/[^/]+/.exec(base)[0], path = value.charAt(0) === '/' ? value : base.replace(origin,'').split('?')[0].replace(/[^/]*$/, '') + value;
        var parts = [];
        path.split('/').forEach(function (part) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); });
        var url = origin + '/' + parts.join('/');
        return mediaURL(url) ? url : '';
    }
    function parseMaster(body, url) {
        if (!/^\s*#EXTM3U/.test(body)) throw new Error('Замість HLS отримано іншу сторінку.');
        var qualities = {}, pending = '', advertised = false;
        text(body).split(/\r?\n/).forEach(function (line) {
            line = line.trim();
            if (line.indexOf('#EXT-X-STREAM-INF:') === 0) { pending = line; advertised = true; }
            else if (pending && line && line.charAt(0) !== '#') {
                var variant = resolveMedia(url,line), resolution = /RESOLUTION=(\d+)x(\d+)/.exec(pending), path = /\/hls\/(2160|1440|1080|720|480|360)\//.exec(variant), label = path ? path[1]+'p' : '';
                if (!variant) throw new Error('HLS містить непідтримуваний відеохост.');
                if (!label && resolution) [[3840,2160],[2560,1440],[1920,1080],[1280,720],[854,480],[640,360]].some(function (size) {
                    if (+resolution[1] >= size[0] || +resolution[2] >= size[1]) { label = size[1]+'p'; return true; } return false;
                });
                if (label) qualities[label] = variant;
                pending = '';
            }
        });
        if (advertised && !Object.keys(qualities).length) throw new Error('У HLS немає підтримуваних варіантів якості.');
        if (!advertised && !/#EXTINF:/.test(body)) throw new Error('Порожній HLS-плейлист.');
        // An isolated video variant loses EXT-X-MEDIA audio (notably KinoBase 4K).
        if (/#EXT-X-MEDIA:[^\r\n]*TYPE=(?:AUDIO|SUBTITLES)/.test(body)) {
            var names = Object.keys(qualities);
            if (names.length === 1) qualities[names[0]] = url;
            else if (names.length > 1) qualities = {auto:url};
        }
        return qualities;
    }
    function trace(stage, outcome) {
        var line = stage + ': ' + text(outcome).substr(0,260);
        if (directTrace[directTrace.length - 1] !== line) directTrace.push(line);
        directTrace = directTrace.slice(-10);
        save('direct_trace', directTrace);
    }
    var PROVIDERS = [
        {id:'uakino', name:'UAKino', origin:'https://uakino.best', search:'/ua/'},
        {id:'uaserials', name:'UASerials', origin:'https://uaserials.my', search:'/'},
        {id:'uafix', name:'UAFix', origin:'https://uafix.net', search:'/search.html'},
        {id:'kinobase', name:'KinoBase', origin:'https://kinobase.org', search:'/search?query='}
    ];
    function providerFor(url) {
        return PROVIDERS.filter(function (p) { return text(url).indexOf(p.origin + '/') === 0; })[0];
    }
    function publicURL(url, origin) {
        url = decodeHTML(text(url)).replace(/^\/\//, 'https://');
        if (url.charAt(0) === '/') url = origin + url;
        return providerFor(url) && !/[\s<>"'\\]/.test(url) ? url.split('#')[0] : '';
    }
    function classText(html, cls) {
        var re = new RegExp('<(div|span|h[1-6])\\b[^>]*class=["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/\\1>', 'i');
        var m = re.exec(html); return m ? plain(m[2]) : '';
    }
    function labelText(html, label) {
        var re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi, m;
        while ((m = re.exec(html))) {
            var value = plain(m[1]), hit = label.exec(value);
            if (hit) return value.substr(hit.index + hit[0].length).trim();
        }
        return '';
    }
    function cleanTitle(value) {
        return withoutSeason(plain(value).replace(/дивит[иь]с[ья][\s\S]*$/i, '').replace(/^[^a-zа-яіїєґ0-9]+/i, '')).trim();
    }
    function titleKeys(value) {
        return text(value).split(/\s*\/\s*/).map(function (s) { return normalize(cleanTitle(s)).replace(/проєкт/g,'проект'); }).filter(Boolean);
    }
    function sameTitle(movie, candidate, full) {
        var names = unique([movie.title,movie.name,movie.original_title,movie.original_name].reduce(function (a,n) { return a.concat(titleKeys(n)); },[]));
        var aliases = unique([candidate.title,candidate.originalTitle].concat(candidate.aliases || []).reduce(function (a,n) { return a.concat(titleKeys(n)); },[]));
        if (!names.some(function (n) { return aliases.some(function (a) {
            return a === n || !full && n.length >= 4 && (' '+a+' ').indexOf(' '+n+' ') >= 0;
        }); })) return false;
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        if (full && candidate.type !== (tv ? 'tv' : 'movie')) return false;
        var year = parseInt(text(movie.release_date || movie.first_air_date).substr(0,4),10);
        // UAKino dates individual seasons by broadcast year, while TMDB dates the series premiere.
        if (year && candidate.year && !(tv && candidate.season > 1) && Math.abs(year - candidate.year) > 1) return false;
        return true;
    }
    function providerSearch(html, provider) {
        if (provider.id === 'uakino') return parseSearch(html);
        if (provider.id === 'kinobase') return kinoSearch(html);
        if (challenge(html)) throw new Error('Сайт повернув перевірку доступу.');
        var clean = cleanMarkup(html), rows = [], re, m, seen = {};
        if (!/Пошук|За Вашим запитом/i.test(plain(clean))) throw new Error('Не отримано сторінку результатів пошуку.');
        if (provider.id === 'uaserials') {
            clean.split(/<div\b[^>]*class=["'][^"']*\bshort-cols\b[^"']*["'][^>]*>/i).slice(1).forEach(function (chunk) {
                var a = /<a\b([^>]*)>/i.exec(chunk), url = a && publicURL(attrs(a[1]).href,provider.origin);
                if (url && pageID(url)) rows.push({url:url,title:classText(chunk,'th-title'),originalTitle:classText(chunk,'th-title-oname')});
            });
        } else {
            re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            while ((m = re.exec(clean))) {
                var at = attrs(m[1]), h = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(m[2]);
                var url = publicURL(at.href,provider.origin);
                if (url && /\bsres-wrap\b/.test(at['class'] || '') && h) rows.push({url:url,title:plain(h[1])});
            }
        }
        return rows.filter(function (r) { if (seen[r.url] || r.url.indexOf(provider.origin+'/') !== 0) return false; seen[r.url] = true; return Boolean(r.title); }).slice(0,60);
    }
    function playerRefs(html) {
        var clean = cleanMarkup(html), re = /<(?:iframe|link|li|div)\b([^>]*)>/gi, m, out = [];
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), url = embedURL(a.src || a['data-src'] || a['data-file'] || (a.itemprop === 'video' && a.value));
            if (url && !/трейлер|trailer/i.test(a.title || '')) out.push(url);
        }
        return unique(out);
    }
    function providerPage(html, url) {
        var provider = providerFor(url);
        if (!provider) throw new Error('Невідоме джерело.');
        if (provider.id === 'kinobase') return kinoPage(html,url);
        if (provider.id === 'uakino') {
            var ua = parseSource(html,url); ua.source = provider.id; return ua;
        }
        if (challenge(html)) throw new Error('Сайт повернув перевірку доступу.');
        var clean = cleanMarkup(html).split(/<[^>]+(?:id=["']dle-comments|class=["'](?:full-comms|comments)\b)/i)[0];
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean);
        if (!h) throw new Error('На сторінці немає назви.');
        var name = cleanTitle(h[1]), original = classText(clean,'oname') || classText(clean,'forigin') || classText(clean,'eng-rus') || labelText(clean,/Ориг\. назва:\s*/i).split(' / ')[0];
        var year = /\b(?:19|20)\d{2}\b/.exec(labelText(clean,/Рік(?: виходу)?:\s*/i));
        var voice = labelText(clean,/(?:Переклад|Озвучення):\s*/i);
        var heading = (clean.match(/<h[12]\b[^>]*>[\s\S]*?<\/h[12]>/gi) || []).map(plain).join(' ');
        var language = metaAudioLanguage(clean) || audioLanguage(voice,'') || (/українськ/i.test(heading) ? 'uk' : '');
        if (!language || language === 'other') throw new Error('Сторінка не підтверджує підтримувану мову озвучення.');
        var tv = /серіал|сезон/i.test(heading) || /\/serials\//.test(url);
        var id = provider.id + '-' + (pageID(url) || url.split('/').filter(Boolean).pop());
        var title = {id:id,title:name,originalTitle:original,source:provider.id,sourcePage:url,year:year ? +year[0] : 0,type:tv ? 'tv' : 'movie',season:seasonNumber(name) || 1,voice:voice || defaultVoice(language),audioLanguage:language,audioEvidence:voice || 'inLanguage='+language,releases:[],embeds:playerRefs(clean),seasonPages:[]};
        if (provider.id === 'uafix' && tv) addFixEpisodes(title,clean);
        return title;
    }
    function newRelease(title, voice, language) {
        voice = plain(voice || title.voice);
        language = language || audioLanguage(voice,title.audioLanguage || 'uk',title.originalLanguage);
        var release = title.releases.filter(function (r) { return r.voice === voice && r.audioLanguage === language; })[0];
        if (!release) {
            release = {id:title.id+'-voice-'+title.releases.length,source:title.source || 'uakino',sourcePage:title.sourcePage,voice:voice,audioLanguage:language,audioEvidence:title.audioEvidence,episodes:[]};
            title.releases.push(release);
        }
        return release;
    }
    function foreignVoice(voice, original) { return audioLanguage(voice,'',original) === 'other'; }
    function audioLanguage(voice, fallback, original) {
        if (/україн|украин|\bukr?\b/i.test(voice)) return 'uk';
        if (/english|англій|англий|\ben(?:g)?\b/i.test(voice)) return 'en';
        if (/росій|русск|\brus?\b/i.test(voice)) return 'ru';
        if (/fran[cç]ais|french|француз|german|deutsch|німець|немец|japanese|日本語|япон|korean|한국어|корей|spanish|espa[nñ]ol|іспан|испан|italian|італій|итальян|chinese|китай|polish|польськ|польск/i.test(voice)) return 'other';
        if (/оригінал|оригинал|original/i.test(voice)) return original ? /^(uk|en|ru)$/.test(original) ? original : 'other' : 'original';
        return fallback === undefined ? 'uk' : fallback;
    }
    function defaultVoice(language) { return language === 'en' ? 'Англійська доріжка' : language === 'ru' ? 'Російське озвучення' : 'Українське озвучення'; }
    function languageLabel(language) { return language === 'ru' ? '🐷 RU · ' : language === 'en' ? 'EN · ' : language === 'original' ? 'Оригінал · ' : 'UA · '; }
    function languageBadge(language) {
        // Inline vector remains legible on Tizen versions without color emoji fonts.
        var pig = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 3 3l6 3h6l6-3-1 7a9 9 0 1 1-16 0" fill="#ff9cba"/><ellipse cx="12" cy="15" rx="6" ry="4" fill="#ee638e"/><g fill="#54253a"><circle cx="8" cy="10" r="1.2"/><circle cx="16" cy="10" r="1.2"/><ellipse cx="10" cy="15" rx="1" ry="1.5"/><ellipse cx="14" cy="15" rx="1" ry="1.5"/></g></svg>';
        var code = language === 'ru' ? 'ru' : language === 'en' ? 'en' : language === 'original' ? 'original' : 'uk';
        var label = {uk:'Українське озвучення',en:'Англійське озвучення',ru:'Російське озвучення',original:'Оригінальна доріжка; мову не вказано'};
        var badge = {uk:'UA',en:'EN',ru:pig+'RU',original:'ORIG'};
        return '<span class="fbr-language fbr-language-'+code+'" aria-label="'+label[code]+'">'+badge[code]+'</span>';
    }
    function kinoSearch(html) {
        if (challenge(html)) throw new Error('KinoBase повернув перевірку доступу.');
        var clean = cleanMarkup(html), rows = [], seen = {}, re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
        while ((m = re.exec(clean))) {
            var a = attrs(m[1]), url = publicURL(a.href,'https://kinobase.org'), id = /^https:\/\/kinobase\.org\/(film|serial)\/(\d+)-[^/?]+\/?$/.exec(url);
            if (!id || seen[url]) continue;
            var label = plain(a.title || m[2]), year = /\((\d{4})\)/.exec(label);
            if (!label) continue;
            seen[url] = true;
            rows.push({url:url,title:label.replace(/\s*\(\d{4}\).*$/,''),year:year ? +year[1] : 0,type:id[1] === 'serial' ? 'tv' : 'movie'});
        }
        return rows.slice(0,60);
    }
    function kinoCandidate(movie,row) {
        // Search labels are Russian even when queried by the original TMDB name.
        // This only selects pages to inspect; getTitle still requires an exact title match.
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var year = parseInt(text(movie.release_date || movie.first_air_date).substr(0,4),10);
        return row.type === (tv ? 'tv' : 'movie') && (!year || !row.year || Math.abs(year-row.year) <= 1);
    }
    function kinoPage(html,url) {
        var id = /^https:\/\/kinobase\.org\/(film|serial)\/(\d+)-[^/?]+\/?$/.exec(url);
        if (!id || challenge(html)) throw new Error('Не отримано сторінку KinoBase.');
        var clean = cleanMarkup(html), h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean), fields = {}, vars = {}, m;
        var re = /<div\b[^>]*class=["']key["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*>([\s\S]*?)<\/div>/gi;
        while ((m = re.exec(clean))) fields[plain(m[1])] = plain(m[2]);
        re = /\bvar\s+([a-z_][\w]*)\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|(\d+))\s*;/gi;
        while ((m = re.exec(html))) vars[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : +m[4];
        var script = /["'](\/static\/js\/hs\.js\?v=(\d+))["']/i.exec(html);
        if (!h) throw new Error('KinoBase не підтвердив назву.');
        if (!script || text(vars.MOV_ID) !== id[2] || !/^[a-z\d]{16,64}$/i.test(vars.PLAYER_CUID || '') || !/^[a-z\d]{8,80}$/i.test(vars.IDENTIFIER || '')) throw new Error('На цій сторінці KinoBase немає підтримуваного прямого плеєра.');
        return {id:'kinobase-'+id[2],title:plain(h[1]),originalTitle:fields['Название'] || '',year:parseInt(fields['Год'],10) || 0,type:id[1] === 'serial' ? 'tv' : 'movie',source:'kinobase',sourcePage:url,audioLanguage:'ru',voice:fields['Перевод'] || 'Російське озвучення',audioEvidence:'Мова та назва доріжки з плеєра KinoBase',releases:[],embeds:[],seasonPages:[],kino:{vars:vars,script:'https://kinobase.org'+script[1],version:script[2]}};
    }
    function kinoDecode(body,config,user) {
        if (typeof body !== 'string' || body.length > 8000000) throw new Error('Завеликий або порожній список KinoBase.');
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', input = body.substr(user ? config.userOffset : config.vodOffset), bytes = '', bits = 0, count = 0;
        for (var i = 0; i < input.length; i++) {
            var char = input.charAt(i);
            if (/\s/.test(char) || char === '=') continue;
            var n = (user ? config.alphabet : alphabet).indexOf(char);
            if (n < 0) throw new Error('Некоректна відповідь KinoBase.');
            if (user) n = (n ^ config.xor) % 64;
            bits = (bits << 6) | n; count += 6;
            if (count >= 8) { count -= 8; bytes += '%'+('0'+((bits >> count) & 255).toString(16)).slice(-2); }
        }
        try { return decodeURIComponent(bytes).split(config.separator); }
        catch (error) { throw new Error('Не вдалося прочитати відповідь KinoBase.'); }
    }
    function kinoEntries(parts,title) {
        var tree, out = [], byKey = Object.create(null), kind = parts[0];
        if (kind === 'p' || kind === 'pl') {
            try { tree = JSON.parse(parts[1]); } catch (error) { throw new Error('Некоректний список сезонів KinoBase.'); }
        } else if (kind === 'f' || kind === 'file') tree = [{file:parts[1],subtitle:parts[2]}];
        else throw new Error('Цей формат відео KinoBase не підтримується.');
        function fileEntries(file,season,episode,subtitle) {
            var re = /\[(2160|1440|1080|720|480|360)p?\]([\s\S]*?)(?=\[(?:2160|1440|1080|720|480|360)p?\]|$)/g, m;
            while ((m = re.exec(text(file)))) {
                var q = m[1]+'p', voices = /\{([^}]+)\}([^{}]+)/g, v, chunks = [];
                while ((v = voices.exec(m[2]))) chunks.push({voice:plain(v[1]),file:v[2]});
                if (!chunks.length) chunks.push({voice:title.voice,file:m[2]});
                chunks.forEach(function (chunk) {
                    if (foreignVoice(chunk.voice,title.originalLanguage)) return;
                    var urls = unique((chunk.file.match(/https:\/\/[^\s;,{}]+/g) || []).filter(function (u) { return mediaURL(u) && /\.m3u8(?:\?|$)/i.test(u); }));
                    if (!urls.length) return;
                    var language = audioLanguage(chunk.voice,'ru',title.originalLanguage), key = language+':'+chunk.voice+':'+season+':'+episode, entry = byKey[key];
                    if (!entry) {
                        if (out.length >= 10000) throw new Error('Завеликий список серій KinoBase.');
                        entry = {voice:chunk.voice,audioLanguage:language,season:season,episode:episode,qualities:{},mirrors:{},subtitles:subtitlesFrom(subtitle),kino:true,kinoFetched:Date.now(),state:'pending'};
                        byKey[key] = entry; out.push(entry);
                    }
                    entry.qualities[q] = urls[0]; entry.mirrors[q] = urls;
                });
            }
        }
        function walk(items,season,depth) {
            if (!Array.isArray(items) || depth > 5) throw new Error('Невідомий формат сезонів KinoBase.');
            items.forEach(function (item) {
                if (!item || typeof item !== 'object') return;
                var label = plain(item.title), s = seasonNumber(label);
                if (item.folder) return walk(item.folder,s || season,depth+1);
                var n = /(?:серия|серія|episode)\s*(\d+)|(\d+)\s*(?:серия|серія|episode)/i.exec(label);
                if (title.type === 'tv' && (!season || !n)) return;
                fileEntries(item.file,title.type === 'tv' ? season : 0,title.type === 'tv' ? +(n[1] || n[2]) : 0,item.subtitle);
            });
        }
        walk(tree,0,0);
        out.forEach(function (entry) { entry.master = entry.qualities[qualityNames(entry)[0]]; });
        if (!out.length) throw new Error('KinoBase не віддав підтримуваних потоків UA, EN або RU.');
        return out;
    }
    function stopKinoSession() {
        if (kinoSession) kinoSession.cancel();
        root.clearTimeout(kinoSessionTimer); kinoSessionTimer = null;
        if (kinoSessionScript) {
            kinoSessionScript.onload = kinoSessionScript.onerror = null;
            if (kinoSessionScript.parentNode) kinoSessionScript.parentNode.removeChild(kinoSessionScript);
            kinoSessionScript = null;
        }
        kinoSessionQueue = null;
    }
    function ensureKinoSession(done) {
        var base = baseURL();
        if (kinoSession) return done(null,kinoSession);
        if (root.FabornKinoSession && base) {
            kinoSession = root.FabornKinoSession(root,base+'lib/4klab/',VERSION);
            return done(null,kinoSession);
        }
        if (!base || !root.document || !root.document.createElement) return done(new Error('Не завантажено адаптер сесії Samsung з GitHub Pages'));
        if (kinoSessionQueue) { kinoSessionQueue.push(done); return; }
        kinoSessionQueue = [done];
        var node = kinoSessionScript = root.document.createElement('script');
        function finish(error) {
            if (kinoSessionScript !== node) return;
            root.clearTimeout(kinoSessionTimer); kinoSessionTimer = null;
            node.onload = node.onerror = null;
            if (node.parentNode) node.parentNode.removeChild(node);
            kinoSessionScript = null;
            var callbacks = kinoSessionQueue || []; kinoSessionQueue = null;
            callbacks.forEach(function (cb) { if (error) cb(error); else ensureKinoSession(cb); });
        }
        node.src = base+'lib/4klab/kinobase-session.js?v='+VERSION; node.async = true;
        node.onload = function () { finish(root.FabornKinoSession ? null : new Error('Несумісний адаптер сесії Samsung')); };
        node.onerror = function () { finish(new Error('Не вдалося завантажити адаптер сесії Samsung з GitHub Pages')); };
        kinoSessionTimer = root.setTimeout(function () { finish(new Error('Час завантаження адаптера сесії Samsung вичерпано')); },12000);
        (root.document.head || root.document.body).appendChild(node);
    }
    function kinoNativeRequest(url,done) {
        var cancelled = false, req;
        var handle = {abort:function () { cancelled = true; if (req) req.abort(); }};
        ensureKinoSession(function (error,client) {
            if (cancelled) return;
            if (error) return done(error,'',0);
            req = client.request(url,function (err,body,status) { if (!cancelled) done(err,body,status); });
        });
        return handle;
    }
    var kinoReaderQueue = null, kinoProtocolCache, kinoTitleCache = {}, kinoRefreshJobs = {};
    function kinoReader(done) {
        if (root.FabornKinoBase) return done(null,root.FabornKinoBase);
        if (kinoReaderQueue) { kinoReaderQueue.push(done); return; }
        if (!baseURL() || !root.document || !root.document.createElement) return done(new Error('Не завантажено адаптер KinoBase з GitHub Pages.'));
        kinoReaderQueue = [done];
        var node = root.document.createElement('script'), timer;
        function finish(error) {
            if (!kinoReaderQueue) return;
            root.clearTimeout(timer); node.onload = node.onerror = null;
            if (node.parentNode) node.parentNode.removeChild(node);
            var callbacks = kinoReaderQueue; kinoReaderQueue = null;
            callbacks.forEach(function (cb) { cb(error,root.FabornKinoBase); });
        }
        node.src = baseURL()+'lib/kinobase.js?v='+VERSION; node.async = true;
        node.onload = function () { finish(root.FabornKinoBase ? null : new Error('Несумісний адаптер KinoBase.')); };
        node.onerror = function () { finish(new Error('Не вдалося завантажити адаптер KinoBase з GitHub Pages.')); };
        timer = root.setTimeout(function () { finish(new Error('Час завантаження адаптера KinoBase вичерпано.')); },12000);
        (root.document.head || root.document.body).appendChild(node);
    }
    function kinoQuery(values) { return Object.keys(values).map(function (key) { return encodeURIComponent(key)+'='+encodeURIComponent(values[key]); }).join('&'); }
    function kinoStreams(serial,title,done) {
        kinoReader(function (error,reader) {
            if (serial !== requestSerial) return;
            if (error) return done(error);
            function use(config) {
                var vars = title.kino.vars, scalar = +vars[config.checkVar];
                if (!isFinite(scalar)) return done(new Error('Не отримано параметри плеєра KinoBase.'));
                var query = {n:title.kino.version,page:'movie',cuid:vars.PLAYER_CUID,chk:(scalar*config.check[0]+config.check[1])%config.check[2]};
                query[config.userKey] = config.userValue;
                publicRequest(serial,'KinoBase · сесія','https://kinobase.org/user_data?'+kinoQuery(query),function (err,body) {
                    if (err) return done(err);
                    var parts;
                    try {
                        parts = kinoDecode(body,config,true);
                        if (parts[4] === '0') throw new Error('KinoBase обмежив доступ до цього відео.');
                        if (!/^[\w-]{10,100}$/.test(parts[0]) || !/^\d{10,13}$/.test(parts[1])) throw new Error('Не отримано посилання KinoBase.');
                    } catch (e) { return done(e); }
                    var vod = {n:title.kino.version,e:parts[1],identifier:vars.IDENTIFIER,player_type:'new',file_type:'hls',enable_hdr:0,st:parts[0]};
                    vod[config.vodKey] = config.vodValue;
                    publicRequest(serial,'KinoBase · сезони й озвучення','https://kinobase.org/vod/'+vars.MOV_ID+'?'+kinoQuery(vod),function (err,response) {
                        if (err) return done(err);
                        try {
                            kinoEntries(kinoDecode(response,config,false),title).forEach(function (entry) {
                                var release = newRelease(title,entry.voice,entry.audioLanguage);
                                entry.id = release.id+'-s'+entry.season+'e'+entry.episode; release.episodes.push(entry);
                            });
                            // Cache the complete playlist briefly so each voice/episode does not refetch it.
                            kinoTitleCache = {}; kinoTitleCache[title.sourcePage] = {title:title,time:Date.now()};
                            done(null,title);
                        } catch (e) { done(e); }
                    });
                });
            }
            if (kinoProtocolCache && kinoProtocolCache.url === title.kino.script) return use(kinoProtocolCache.config);
            publicRequest(serial,'KinoBase · формат плеєра',title.kino.script,function (err,source) {
                if (err) return done(err);
                var config;
                try { config = reader.protocol(source); } catch (e) { return done(new Error('KinoBase змінив формат плеєра. Потрібне оновлення адаптера.')); }
                kinoProtocolCache = {url:title.kino.script,config:config}; use(config);
            });
        });
    }
    function kinoRefresh(serial,title,release,episode,done) {
        var url = release.sourcePage, cached = kinoTitleCache[url];
        function choose(error,fresh) {
            if (error) return done(error);
            var found, r = fresh.releases.filter(function (r) { return r.voice === release.voice && r.audioLanguage === release.audioLanguage; })[0];
            if (r) found = r.episodes.filter(function (e) { return e.season === episode.season && e.episode === episode.episode; })[0];
            if (!found) return done(new Error('Вибране озвучення або серія вже недоступні на KinoBase.'));
            done(null,found);
        }
        if (cached && Date.now()-cached.time < 60000) return choose(null,cached.title);
        if (kinoRefreshJobs[url]) { kinoRefreshJobs[url].push(choose); return; }
        kinoRefreshJobs[url] = [choose];
        getTitle(serial,PROVIDERS[3],{title:title.title,original_title:title.originalTitle,original_language:title.originalLanguage,media_type:title.type,release_date:title.year+'-01-01'},url,function (error,fresh) {
            var callbacks = kinoRefreshJobs[url] || []; delete kinoRefreshJobs[url];
            callbacks.forEach(function (cb) { cb(error,fresh); });
        });
    }
    function addFixEpisodes(title,html) {
        var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
        while ((m = re.exec(html))) {
            var url = publicURL(attrs(m[1]).href,'https://uafix.net');
            if (!url || url.indexOf(title.sourcePage.replace(/\?.*$/,'')) !== 0) continue;
            var ep = /\/season-(\d+)-episode-(\d+)\/$/.exec(url);
            if (ep) {
                var r = newRelease(title,title.voice), season = +ep[1], number = +ep[2];
                if (!r.episodes.some(function (e) { return e.season === season && e.episode === number; })) r.episodes.push({id:r.id+'-s'+season+'e'+number,season:season,episode:number,page:url,state:'pending'});
            } else if (/\/sezon-\d+\/$/.test(url) && !title.seasonPages.some(function (p) { return p.url === url; })) title.seasonPages.push({url:url,title:plain(m[2])});
        }
    }
    function subtitlesFrom(value) {
        var out = [], re = /\[([^\]]+)\]((?:https:)?\/\/[^,\s]+)/g, m;
        function add(label,url,language) {
            url = text(url); if (url.indexOf('//') === 0) url = 'https:'+url;
            if (!mediaURL(url) || out.some(function (s) { return s.url === url; })) return;
            out.push({label:plain(label) || 'Субтитри',url:url,language:text(language) || audioLanguage(label,'')});
        }
        if (typeof value === 'string' && /^\s*\[\s*\{/.test(value)) {
            try { value = JSON.parse(value); } catch (ignore) { return out; }
        }
        if (Array.isArray(value)) value.forEach(function (s) { if (s && typeof s === 'object') add(s.label || s.title || s.language,s.url || s.file,s.language || s.lang); });
        else while ((m = re.exec(text(value)))) add(m[1],m[2]);
        return out;
    }
    function subtitleHint(episode) {
        var names = unique((episode.subtitles || []).map(function (s) { return s.label; }));
        if (names.length) return ' · CC: '+names.join(', ')+' — вибір у плеєрі';
        return episode.embeddedSubtitles ? ' · CC: субтитри у плеєрі' : '';
    }
    function playerEntries(html, defaults) {
        if (/<title>\s*404 Not Found\s*<\/title>/i.test(text(html))) throw new Error('Відеосервер повернув сторінку 404: відео недоступне.');
        var start = text(html).search(/new\s+Playerjs\s*\(/);
        if (start < 0) throw new Error('Не знайдено відкриту конфігурацію відеоплеєра.');
        var config = text(html).substr(start), raw = quotedProperty(config,'file'), tree, out = [];
        if (!raw) throw new Error('Плеєр не віддав прямого потоку.');
        if (raw.charAt(0) === '[' && /\[\s*\{/.test(raw)) {
            try { tree = JSON.parse(raw); } catch (e) { throw new Error('Не вдалося прочитати список відео.'); }
        } else tree = [{file:raw,subtitle:quotedProperty(config,'subtitle')}];
        function walk(items, season, voice, language, subtitles, depth) {
            if (!Array.isArray(items) || depth > 5 || out.length > 2000) return;
            items.forEach(function (item) {
                if (!item || typeof item !== 'object') return;
                var label = plain(item.title), s = seasonNumber(label), v = voice;
                var isVoice = item.folder ? !s : defaults.type === 'movie';
                if (isVoice && foreignVoice(label,defaults.originalLanguage)) return;
                var lang = isVoice ? audioLanguage(label,language,defaults.originalLanguage) : language;
                var subs = own(item,'subtitle') ? subtitlesFrom(item.subtitle) : subtitles;
                if (item.folder) {
                    if (!s && label) v = label;
                    walk(item.folder,s || season,v,lang,subs,depth+1); return;
                }
                var file = text(item.file), qualities = {}, master = '', m;
                if (mediaURL(file) && /\.m3u8(?:\?|$)/i.test(file)) master = file;
                else {
                    var re = /\[(2160|1440|1080|720|480|360)p?\](https:\/\/[^,\s]+)/g;
                    while ((m = re.exec(file))) if (mediaURL(m[2]) && /\.m3u8(?:\?|$)/i.test(m[2])) { qualities[m[1]+'p'] = m[2]; if (!master) master = m[2]; }
                }
                if (!master) return;
                var n = /(?:серія|episode)\s*(\d+)|(\d+)\s*(?:серія|episode)/i.exec(label);
                if (defaults.type === 'tv' && !n && !defaults.episode) return;
                out.push({master:master,qualities:qualities,subtitles:subs,season:defaults.type === 'tv' ? season || defaults.season || 1 : 0,episode:defaults.type === 'tv' ? n ? +(n[1] || n[2]) : defaults.episode : 0,voice:defaults.type === 'movie' && label ? label : v || defaults.voice,audioLanguage:lang,title:label});
            });
        }
        walk(tree,defaults.season || 0,defaults.voice,audioLanguage(defaults.voice,defaults.audioLanguage,defaults.originalLanguage),subtitlesFrom(quotedProperty(config,'subtitle')),0);
        if (!out.length) throw new Error('Немає підтримуваного HLS-потоку.');
        return out;
    }
    var requests = [], activeSession, discoveryTimer;
    function parallel(items, limit, work, done) {
        var next = 0, running = 0, finished = 0, ended = false;
        if (!items.length) return done();
        function pump() {
            if (ended) return;
            while (running < limit && next < items.length) {
                var item = items[next++]; running++;
                work(item,function () {
                    running--; finished++;
                    if (finished === items.length) { ended = true; done(); }
                    else pump();
                });
            }
        }
        pump();
    }
    function publicRequest(serial, stage, url, callback, post, ajax) {
        if (serial !== requestSerial) return;
        if (!providerFor(url) && !embedURL(url) && !mediaURL(url)) return callback(new Error('Непідтримувана адреса джерела.'));
        var completed = false, req;
        trace(stage,'запит');
        var transport = activeSession && activeSession.kinoNative && /^https:\/\/kinobase\.org\//.test(url) ? kinoNativeRequest : xhr;
        req = transport(url,function (error,body,status) {
            completed = true;
            var i = requests.indexOf(req); if (i >= 0) requests.splice(i,1);
            if (serial !== requestSerial) return;
            if (error && /Час очікування вичерпано/.test(error.message)) error = new Error(stage+': '+error.message);
            if (error && /^https:\/\/kinobase\.org\//i.test(url)) {
                // A 404 can mean a rejected anonymous player session, not a missing title.
                // Keep the exact endpoint, but never include its session query parameters.
                var endpoint = url.replace(/^https:\/\/kinobase\.org/i,'').split(/[?#]/)[0];
                var detail = error.message;
                error = new Error(stage.replace(/^KinoBase\s*·\s*/,'')+' ('+endpoint+'): '+detail);
                error.kinoTransport = true;
                if (status === 404 && endpoint === '/user_data') { error.kinoSession = true; error.message += ' — сесію плеєра не прийнято; можливе блокування cookie.'; }
            }
            trace(stage,error ? error.message : 'HTTP '+status);
            callback(error,body);
        },12000,post,ajax);
        if (!completed) requests.push(req);
    }
    function getTitle(serial, provider, movie, url, done) {
        publicRequest(serial,provider.name+' · сторінка',url,function (err,body) {
            if (err) return done(err);
            var title, playerError;
            try { title = providerPage(body,url); } catch (e) { return done(e); }
            if (!sameTitle(movie,title,true)) return done(new Error('Назва, рік або тип не збігаються з карткою.'));
            title.originalLanguage = /^[a-z]{2}$/.test(text(movie.original_language)) ? movie.original_language : '';
            title.releases = title.releases.filter(function (r) {
                r.audioLanguage = audioLanguage(r.voice,title.audioLanguage,title.originalLanguage);
                return r.audioLanguage !== 'other';
            });
            if (provider.id === 'kinobase') return kinoStreams(serial,title,function (error,resolved) {
                var session = activeSession;
                if (!error || !error.kinoSession || !session || session.kinoNative || storage('kino_session','auto') === 'direct') return done(error,resolved);
                if (!root.FabornKinoSession && (!root.Worker || !root.WebAssembly)) {
                    error.message += ' Адаптер сесії Samsung у цьому застосунку недоступний.';
                    return done(error);
                }
                // Start from a fresh title page in the same cookie jar as /user_data and /vod.
                // Direct sessions remain first; only the exact rejected-session response retries here.
                session.kinoNative = true;
                session.status.kinobase = 'Повторне отримання сесії через Samsung…';
                save('kino_transport','Samsung · повтор після /user_data HTTP 404');
                trace('KinoBase · сесія','Повтор через Samsung');
                getTitle(serial,provider,movie,url,done);
            });
            function expand() {
                parallel(title.embeds,2,function (embed,next) {
                    publicRequest(serial,provider.name+' · сезони й озвучення',embed,function (error,html) {
                        if (error) playerError = error;
                        if (!error) {
                            try {
                                playerEntries(html,title).forEach(function (entry) {
                                    var release = newRelease(title,entry.voice+(title.embeds.length > 1 ? ' · плеєр '+(title.embeds.indexOf(embed)+1) : ''),entry.audioLanguage);
                                    if (release.episodes.some(function (e) { return e.season === entry.season && e.episode === entry.episode; })) return;
                                    entry.id = release.id+'-s'+entry.season+'e'+entry.episode; entry.embed = embed; entry.state = 'pending';
                                    release.episodes.push(entry);
                                });
                            } catch (e) { playerError = e; trace(provider.name+' · список відео',e.message); }
                        }
                        next();
                    });
                },function () { done(!title.releases.length && !title.seasonPages.length ? playerError : null,title); });
            }
            if (title.playlistURL) {
                publicRequest(serial,provider.name+' · список відео',title.playlistURL,function (error,response) {
                    if (error) return title.embeds.length ? expand() : done(error);
                    try {
                        var data = JSON.parse(response);
                        if (!data || typeof data.response !== 'string') throw new Error('Не отримано список відео.');
                        addEpisodeRefs(title,data.response);
                        // Some lists contain one serial player, others one player per episode/voice.
                        if (!title.releases.length) title.embeds = unique(title.embeds.concat(playerRefs(data.response)));
                    } catch (e) { return title.embeds.length ? expand() : done(e); }
                    expand();
                },null,true);
            } else expand();
        });
    }
    function mergeTitle(session, title) {
        title.releases.forEach(function (r) {
            var existing = session.title.releases.filter(function (v) { return v.source === r.source && v.voice === r.voice && v.audioLanguage === r.audioLanguage; })[0];
            if (!existing) { session.title.releases.push(r); existing = r; }
            else r.episodes.forEach(function (e) {
                if (!existing.episodes.some(function (v) { return v.season === e.season && v.episode === e.episode; })) existing.episodes.push(e);
            });
        });
        (title.seasonPages || []).forEach(function (p) {
            var season = seasonNumber(p.title);
            if (season && !session.seasonPages.some(function (v) { return v.url === p.url; })) session.seasonPages.push({url:p.url,season:season,source:title.source || 'uakino'});
        });
    }
    function discoverProvider(serial,session,provider,done) {
        var movie = session.movie;
        var queries = unique([movie.title || movie.name,movie.original_title || movie.original_name].map(function (s) { return text(s).replace(/[«»“”"'’]/g,'').trim().substr(0,100); }));
        if (provider.id === 'kinobase') queries.reverse();
        var index = 0;
        function searchNext() {
            if (index >= queries.length) return done('Назву не знайдено');
            var query = queries[index++];
            publicRequest(serial,provider.name+' · пошук',provider.origin+provider.search+(provider.id === 'kinobase' ? encodeURIComponent(query) : ''),function (err,body) {
                if (err) return done(err.message);
                var results;
                try { results = providerSearch(body,provider).filter(function (r) { return provider.id === 'kinobase' ? kinoCandidate(movie,r) : sameTitle(movie,r,false); }); } catch (e) { return done(e.message); }
                if (!results.length) return searchNext();
                var count = 0, lastError = '', transportError = '';
                // KinoBase replaces its anonymous player cookie on every title page.
                // Parallel candidates can invalidate the first film's /user_data request.
                parallel(results.slice(0,6),provider.id === 'kinobase' ? 1 : 2,function (row,next) {
                    getTitle(serial,provider,movie,row.url,function (error,title) {
                        if (error) {
                            if (error.kinoTransport && !transportError) transportError = error.message;
                            if (!lastError || /не збігаються/.test(lastError)) lastError = error.message;
                        }
                        else { mergeTitle(session,title); count += title.releases.length; }
                        next();
                    });
                },function () {
                    if (!count && !transportError && index < queries.length && /не збігаються/.test(lastError)) return searchNext();
                    done(count ? 'Знайдено' : transportError || lastError || 'Немає підтримуваного плеєра');
                });
            },provider.id === 'kinobase' ? null : 'do=search&subaction=search&from_page=1&story='+encodeURIComponent(query));
        }
        searchNext();
    }
    function loading(session,label) {
        if (session) session.screen = 'loading';
        if (canPresent() && session) return showPresentation(session,null,label);
        select(NAME+' · '+label,[{title:'Шукаю доступне відео…',subtitle:'UAKino · UASerials · UAFix · KinoBase · Назад — скасувати',action:'wait'}],function () { loading(session,label); },restore);
    }
    function open(movie) {
        rememberController();
        startDiscovery(movie || {});
    }
    function startDiscovery(movie) {
        cancelCardLab();
        stopKinoSession();
        cancelPending();
        var serial = requestSerial, tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var title = {id:'tmdb-'+(tv ? 'tv-' : 'movie-')+(movie.id || normalize(movie.original_title || movie.original_name || movie.title || movie.name)),title:movie.title || movie.name || movie.original_title || movie.original_name || NAME,originalTitle:movie.original_title || movie.original_name || '',year:parseInt(text(movie.release_date || movie.first_air_date).substr(0,4),10) || 0,type:tv ? 'tv' : 'movie',releases:[]};
        title.originalLanguage = /^[a-z]{2}$/.test(text(movie.original_language)) ? movie.original_language : '';
        var last = storage('position_'+title.id,{});
        var session = {movie:movie,title:title,season:tv ? +last.season || 1 : 0,episode:tv ? +last.episode || 1 : 0,seasonPages:[],visited:{},status:{},ready:false};
        session.catalog = {direct:true,unified:true,titles:[title],session:session};
        activeSession = session; directTrace = []; save('direct_trace',[]); lastDiagnostic = '';
        save('kino_transport','Звичайний запит');
        loading(session,'пошук');
        var remaining = PROVIDERS.length + 1;
        function finished() {
            remaining--;
            if (serial !== requestSerial || remaining) return;
            prepareSelection(session);
        }
        // A deadline covers the whole discovery, not just each XHR. Late replies are invalidated.
        discoveryTimer = root.setTimeout(function () {
            if (serial !== requestSerial) return;
            if (session.kinoNative && session.status.kinobase === 'Повторне отримання сесії через Samsung…') session.status.kinobase = 'Час очікування сесії Samsung вичерпано. Спробуйте «Оновити джерела».';
            trace('Пошук','Досягнуто ліміт очікування; показуємо отримані результати');
            prepareSelection(session);
        },24000);
        var completed = false, req = loadCatalog(false,function (error,catalog) {
            completed = true;
            if (serial !== requestSerial) return;
            if (!error) catalog.titles.filter(function (t) { return sameTitle(movie,t,true); }).forEach(function (t) {
                // Keep the known working streams as a fallback; resolve fresh links on selection.
                var copy = JSON.parse(JSON.stringify(t)); mergeTitle(session,copy);
            });
            finished();
        });
        if (!completed) requests.push(req);
        PROVIDERS.forEach(function (provider) {
            session.status[provider.id] = 'Очікування відповіді';
            discoverProvider(serial,session,provider,function (status) { session.status[provider.id] = status; finished(); });
        });
        if (storage('lab4k','off') === 'on') startCardLab(session);
    }
    function resolveEpisode(serial,title,release,episode,done,force) {
        if (episode.lab) return done();
        if (!force && episode.resolvedAt && Date.now()-episode.resolvedAt < 60000) return done();
        function verify(entry) {
            episodeRequest(serial,entry,entry.master,sourceName(release.source)+' · якість',function (err,body) {
                if (err) {
                    if (episode.embed && entry === episode && !force) { force = true; return embed(episode.embed); }
                    return done(err);
                }
                try {
                    var qualities = parseMaster(body,entry.master);
                    if (entry.kino) {
                        var top = qualityNames(entry)[0], actual = Object.keys(qualities);
                        if (actual.length && actual.indexOf(top) < 0) throw new Error('KinoBase: маніфест не підтверджує заявлену якість.');
                    } else if (Object.keys(qualities).length) entry.qualities = qualities;
                    episode.master = entry.master; episode.qualities = entry.qualities || {};
                    if (entry.kino) { episode.mirrors = entry.mirrors; episode.kinoFetched = entry.kinoFetched; }
                    episode.subtitles = entry.subtitles || []; episode.embeddedSubtitles = /#EXT-X-MEDIA:[^\r\n]*TYPE=SUBTITLES/.test(body);
                    episode.resolvedAt = Date.now(); episode.state = 'resolved'; episode.error = '';
                    done();
                } catch (e) { done(e); }
            });
        }
        function embed(url,fallback) {
            var fail = fallback || done;
            publicRequest(serial,sourceName(release.source)+' · плеєр',url,function (err,body) {
                if (err) return fail(err);
                try {
                    var entries = playerEntries(body,{type:title.type,season:episode.season,episode:episode.episode,voice:release.voice,audioLanguage:release.audioLanguage,originalLanguage:title.originalLanguage});
                    var candidates = entries.filter(function (e) { return e.season === episode.season && e.episode === episode.episode; });
                    var entry = candidates.filter(function (e) { return e.voice === (episode.voice || release.voice) && e.audioLanguage === release.audioLanguage; })[0] || (candidates.length === 1 && candidates[0].audioLanguage === release.audioLanguage ? candidates[0] : null);
                    if (!entry) throw new Error('Цю серію або озвучення не знайдено в плеєрі.');
                    episode.embed = url; verify(entry);
                } catch (e) { fail(e); }
            });
        }
        if (episode.kino && (force || !episode.kinoFetched || Date.now()-episode.kinoFetched >= 60000)) {
            kinoRefresh(serial,title,release,episode,function (err,entry) { if (err) done(err); else verify(entry); });
        } else if (episode.page) {
            publicRequest(serial,sourceName(release.source)+' · серія',episode.page,function (err,body) {
                if (err) return done(err);
                var refs = playerRefs(text(body).split(/<[^>]+id=["']dle-comments/i)[0]);
                if (!refs.length) return done(new Error('На сторінці серії немає підтримуваного плеєра.'));
                var index = 0;
                function next(error) {
                    if (index >= refs.length) return done(error || new Error('Плеєри серії недоступні.'));
                    embed(refs[index++],next);
                }
                next();
            });
        } else if (episode.embed && (!episode.master || force)) embed(episode.embed);
        else if (episode.master) verify(episode);
        else done(new Error('Джерело не віддало посилання на відео.'));
    }
    function episodeRequest(serial,episode,url,stage,done) {
        var q = Object.keys(episode.qualities || {}).filter(function (key) { return episode.qualities[key] === url; })[0];
        var mirrors = unique([url].concat(episode.kino && episode.mirrors && episode.mirrors[q] || [])), index = 0;
        function attempt() {
            var next = mirrors[index++];
            publicRequest(serial,stage,next,function (err,body) {
                if (!err && !/^\s*#EXTM3U/.test(body)) err = new Error('Замість HLS отримано іншу сторінку.');
                if (err) { if (index < mirrors.length) return attempt(); return done(err); }
                if (next !== url) {
                    if (q) episode.qualities[q] = next;
                    if (episode.master === url) episode.master = next;
                }
                done(null,body);
            });
        }
        attempt();
    }
    function prepareSelection(session) {
        cancelPending();
        var serial = requestSerial;
        activeSession = session; session.ready = false;
        if (session.labStarted && lab4k && session.labSelection !== session.season+':'+session.episode && session.labPending !== session.season+':'+session.episode) {
            session.labPending = session.season+':'+session.episode;
            lab4k.episode(session.season,session.episode);
        }
        loading(session,'перевірка джерел');
        var pages = session.seasonPages.filter(function (p) { return p.season === session.season && !session.visited[p.url]; });
        function resolveRows() {
            var tasks = [];
            session.title.releases.forEach(function (r) {
                r.episodes.filter(function (e) { return e.season === session.season && e.episode === session.episode; }).forEach(function (e) { tasks.push({release:r,episode:e}); });
            });
            parallel(tasks,4,function (task,next) {
                resolveEpisode(serial,session.title,task.release,task.episode,function (err) {
                    if (err) { task.episode.error = err.message; task.episode.resolvedAt = 0; trace(sourceName(task.release.source)+' · потік',err.message); }
                    next();
                });
            },complete);
        }
        function complete() {
            if (serial !== requestSerial) return;
            cancelPending(); session.ready = true;
            if (session.afterPrepare) { session.afterPrepare = false; chooseEpisode(session); }
            else renderSources(session);
        }
        discoveryTimer = root.setTimeout(function () {
            if (serial !== requestSerial) return;
            trace('Джерела','Час перевірки вичерпано'); complete();
        },20000);
        parallel(pages,3,function (p,next) {
            session.visited[p.url] = true;
            var provider = PROVIDERS.filter(function (v) { return v.id === p.source; })[0];
            if (p.source === 'uafix') {
                publicRequest(serial,'UAFix · сезон',p.url,function (error,html) {
                    if (!error) {
                        var t = {id:'uafix-season-'+p.season,source:'uafix',sourcePage:p.url.replace(/sezon-\d+\/$/,''),voice:'Українське озвучення',audioEvidence:'Українські серії на сторінці серіалу',releases:[],seasonPages:[]};
                        addFixEpisodes(t,cleanMarkup(html)); mergeTitle(session,t);
                    }
                    next();
                });
            } else getTitle(serial,provider,session.movie,p.url,function (error,t) { if (!error) mergeTitle(session,t); next(); });
        },resolveRows);
    }
    function sourceName(id) {
        if (id === 'uakinogo') return 'UAKinogo / Alloha';
        var p = PROVIDERS.filter(function (v) { return v.id === id; })[0];
        return p ? p.name : id === 'kinoukr' ? 'KinoUkr' : id;
    }
    function qualityLabel(value) { return value === '2160p' ? '4K · 2160p' : value === 'auto' ? 'Авто' : value; }
    function voiceLabel(release, episode) {
        // The player number distinguishes mirrors, not translations. Keep the original release for playback.
        return plain(episode.voice || release.voice).replace(/\s*·\s*плеєр\s+\d+$/i,'').trim() || 'Українське озвучення';
    }
    function sourceGroups(session) {
        var entries = [], values = [], preferredSource = storage('source','uakino');
        session.title.releases.forEach(function (r) {
            r.episodes.forEach(function (e) {
                if (e.season !== session.season || e.episode !== session.episode || !e.resolvedAt || e.error) return;
                var qualities = qualityNames(e); if (!qualities.length) qualities = ['auto'];
                values = values.concat(qualities);
                entries.push({release:r,episode:e,qualities:qualities});
            });
        });
        values = unique(values).sort(function (a,b) { return (parseInt(b,10) || 0)-(parseInt(a,10) || 0); });
        var preference = session.qualityPreference || storage('quality','best'), selected = values[0], limit = parseInt(preference,10);
        if (values.indexOf(preference) >= 0) selected = preference;
        else if (limit) {
            var lower = values.filter(function (q) { return parseInt(q,10) <= limit; });
            var numeric = values.filter(function (q) { return q !== 'auto'; });
            selected = lower[0] || numeric[numeric.length-1] || selected;
        }
        var groups = [], byVoice = Object.create(null);
        entries.sort(function (a,b) { return (b.release.source === preferredSource ? 1 : 0)-(a.release.source === preferredSource ? 1 : 0); }).forEach(function (entry) {
            if (entry.qualities.indexOf(selected) < 0) return;
            var voice = voiceLabel(entry.release,entry.episode), language = entry.release.audioLanguage || 'uk', key = language+':'+(normalize(voice) || voice);
            var group = byVoice[key];
            if (!group) { group = {key:key,voice:voice,language:language,quality:selected,entries:[]}; byVoice[key] = group; groups.push(group); }
            group.entries.push({release:entry.release,episode:entry.episode,value:selected});
        });
        var languageOrder = {uk:0,en:1,original:2,ru:3};
        groups.sort(function (a,b) { return languageOrder[a.language]-languageOrder[b.language]; });
        return {qualities:values,quality:selected,groups:groups};
    }
    function selectStream(session, row) {
        if (activeSession !== session) return;
        save('source',row.release.source); save('quality',row.value);
        if (row.episode.lab) {
            if (!lab4k || storage('lab4k','off') !== 'on') return startDiscovery(session.movie);
            stopKinoSession();
            session.labChosen = row; session.labLaunching = true; session.screen = 'labplayer';
            closePresentation(); L.Select.hide();
            lab4k.playChoice({season:row.episode.season,episode:row.episode.episode,label:row.release.voice,language:row.release.audioLanguage,quality:row.value});
            return;
        }
        if (lab4k && lab4k.cancel) lab4k.cancel(true);
        launch(session.movie,session.catalog,session.title,row.release,row.episode,row.value);
    }
    function chooseSource(session, group) {
        var totals = {}, seen = {}, preferredSource = storage('source','uakino');
        group.entries.forEach(function (entry) { var id = entry.release.source; totals[id] = (totals[id] || 0)+1; });
        var preferred = group.entries.filter(function (entry) { return entry.release.source === preferredSource; })[0] || group.entries[0];
        select(group.voice+' · '+qualityLabel(group.quality),group.entries.map(function (entry) {
            var id = entry.release.source; seen[id] = (seen[id] || 0)+1;
            return {title:sourceName(id)+(totals[id] > 1 ? ' · варіант '+seen[id] : ''),subtitle:group.voice+' · '+qualityLabel(group.quality),action:'play',release:entry.release,episode:entry.episode,value:entry.value,selected:entry === preferred};
        }),function (row) { selectStream(session,row); },function () { renderSources(session); });
    }
    function chooseQuality(session, view) {
        select('Якість',view.qualities.map(function (q) { return {title:qualityLabel(q),value:q,selected:q === view.quality}; }),function (row) {
            session.qualityPreference = row.value; save('quality',row.value); renderSources(session);
        },function () { renderSources(session); });
    }
    function renderSources(session) {
        if (activeSession !== session) return;
        session.screen = 'sources';
        var rows = [], view = sourceGroups(session);
        var status = Object.keys(session.status).map(function (id) {
            var errors = [];
            session.title.releases.filter(function (r) { return r.source === id; }).forEach(function (r) {
                r.episodes.filter(function (e) { return e.season === session.season && e.episode === session.episode && e.error; }).forEach(function (e) { errors.push(e.error); });
            });
            return sourceName(id)+': '+(unique(errors).join('; ') || session.status[id]);
        });
        save('source_status',status);
        if (canPresent()) return showPresentation(session,view);
        if (session.labStarted) rows.push({title:'UAKinogo / Alloha · експеримент',subtitle:session.status.uakinogo,action:'labstatus'});
        if (view.qualities.length > 1) rows.push({title:'Якість: '+qualityLabel(view.quality),subtitle:'Змінити якість',action:'quality'});
        if (session.title.type === 'tv') rows.push({title:'Сезон '+session.season+' · Серія '+session.episode,subtitle:'Змінити сезон або серію',action:'episode'});
        var last = lastPosition(session);
        if (last) rows.push({title:'Ви дивилися S'+last.season+'E'+last.episode,subtitle:progressLabel(last),action:'last'});
        var focused = view.groups.filter(function (group) { return group.key === session.focusVoice; })[0] || view.groups[0];
        view.groups.forEach(function (group) {
            var entry = group.entries[0], many = group.entries.length > 1;
            var names = unique(group.entries.map(function (item) { return sourceName(item.release.source); }));
            rows.push({title:languageLabel(group.language)+group.voice,subtitle:qualityLabel(view.quality)+' · '+(many ? 'Джерела: ' : '')+names.join(', ')+subtitleHint(entry.episode),action:many ? 'sources' : 'play',group:group,release:entry.release,episode:entry.episode,value:entry.value,selected:group === focused});
        });
        if (!view.groups.length) rows.push({title:'Для цієї назви немає доступного потоку',subtitle:'Можна повторити пошук. Причини: Налаштування → ukr by Faborn → Версія та діагностика.',action:'retry'});
        var issue = kinoIssue(session,view);
        if (issue) rows.push({title:issue.title,subtitle:issue.message,action:'kinostatus'});
        rows.push({title:'Оновити джерела',action:'retry'});
        select(NAME+(session.title.type === 'tv' ? ' · S'+session.season+'E'+session.episode : ' · '+session.title.title),rows,function (row) {
            if (row.action === 'labstatus') return cardLabDetails(session);
            if (row.action === 'kinostatus') return kinoDetails(session);
            if (row.action === 'quality') return chooseQuality(session,view);
            if (row.action === 'episode') return chooseSeason(session);
            if (row.action === 'last') return returnToLast(session);
            if (row.action === 'retry') return startDiscovery(session.movie);
            session.focusVoice = row.group.key;
            if (row.action === 'sources') return chooseSource(session,row.group);
            selectStream(session,row);
        },restore);
    }
    function kinoIssue(session,view) {
        if (view.groups.some(function (g) { return g.entries.some(function (entry) { return entry.release.source === 'kinobase'; }); })) return null;
        if (!session.status.kinobase) return null;
        var errors = [], qualities = [];
        session.title.releases.filter(function (r) { return r.source === 'kinobase'; }).forEach(function (r) {
            r.episodes.filter(function (e) { return e.season === session.season && e.episode === session.episode; }).forEach(function (e) {
                if (e.error) errors.push(e.error);
                else if (e.resolvedAt) qualities = qualities.concat(qualityNames(e));
            });
        });
        if (qualities.length) return {title:'KinoBase · інша якість',message:'Доступно: '+unique(qualities).join(', ')+'. Змініть якість вище.'};
        return {title:'KinoBase · недоступне',message:unique(errors).join('; ') || (session.status.kinobase === 'Знайдено' ? 'Для цієї серії немає перевіреного потоку.' : session.status.kinobase)};
    }
    function kinoDetails(session) {
        session.screen = 'kinostatus';
        var issue = kinoIssue(session,sourceGroups(session));
        select('KinoBase',[{title:issue ? issue.message : 'Джерело доступне',action:'back'},{title:'Оновити джерела',action:'retry'},{title:'До озвучень',action:'back'}],function (row) {
            if (row.action === 'retry') startDiscovery(session.movie);
            else renderSources(session);
        },function () { renderSources(session); });
    }
    function chooseSeason(session) {
        session.screen = 'seasons';
        var values = unique(session.title.releases.reduce(function (all,r) { return all.concat(r.episodes.map(function (e) { return e.season; })); },[]).concat(session.seasonPages.map(function (p) { return p.season; })).concat((session.labEpisodes || []).map(function (e) { return e.season; }))).sort(function (a,b) { return a-b; });
        select('Оберіть сезон',values.map(function (s) { return {title:'Сезон '+s,value:s,selected:s === session.season}; }),function (row) {
            session.season = row.value;
            session.episode = 1; session.afterPrepare = true; prepareSelection(session);
        },function () { renderSources(session); });
    }
    function chooseEpisode(session, direct) {
        var values = unique(session.title.releases.reduce(function (all,r) { return all.concat(r.episodes.filter(function (e) { return e.season === session.season; }).map(function (e) { return e.episode; })); },[]).concat((session.labEpisodes || []).filter(function (e) { return e.season === session.season; }).map(function (e) { return e.episode; }))).sort(function (a,b) { return a-b; });
        if (!values.length) return renderSources(session);
        session.screen = 'episodes'; session.episodeFocus = 'ep-'+session.episode;
        var season = session.season, key = metadataKey(session,season);
        function back() { session.uiFocus = 'episode'; if (direct) renderSources(session); else chooseSeason(session); }
        function choose(number) { session.episode = number; session.uiFocus = 'episode'; prepareSelection(session); }
        function draw() {
            if (activeSession !== session || session.screen !== 'episodes' || session.season !== season) return;
            var metadata = seasonMetadata[key] && seasonMetadata[key].items || [];
            var rows = values.map(function (e) {
                var info = metadata.filter(function (m) { return +m.episode_number === e; })[0] || {};
                var progress = episodeTimeline(session.title,{season:season,episode:e});
                return {title:'Серія '+e+(info.name ? ' · '+info.name : ''),subtitle:progressLabel(progress),value:e,selected:e === session.episode,info:info,progress:progress};
            });
            if (!canPresent()) return select('Сезон '+season,rows,function (row) { choose(row.value); },back);
            closePresentation(); L.Select.hide();
            var actions = {close:back}, content = '<h2 class="fbr-title">Сезон '+season+'</h2><div class="fbr-meta">'+escapeHTML(session.title.title)+'</div>';
            rows.forEach(function (row) {
                var image = episodeImage(row.info.still_path), percent = Math.max(0,Math.min(100,+row.progress.percent || 0)), action = 'ep-'+row.value;
                actions[action] = function () { choose(row.value); };
                var label = '<span class="fbr-episode-image"><b>'+row.value+'</b>'+(image ? '<img alt="" src="'+escapeHTML(image)+'">' : '')+'</span><span class="fbr-episode-body"><strong>'+escapeHTML(row.title)+'</strong><span class="fbr-episode-status">'+(percent >= 90 ? '&#10003; ' : '')+escapeHTML(row.subtitle)+'</span>'+(percent ? '<span class="fbr-progress-track"><i style="width:'+percent+'%"></i></span>' : '')+'<span class="fbr-episode-overview">'+escapeHTML(plain(row.info.overview || ''))+'</span></span>';
                content += buttonHTML(action,label,'fbr-episode',row.selected);
            });
            var html = $('<div class="fbr-overlay fbr-episodes '+(storage('layout','panel') === 'cinema' ? 'fbr-cinema' : 'fbr-panel')+'"><section class="fbr-window" role="dialog" aria-modal="true" aria-label="Серії"><div class="fbr-header"><div class="fbr-brand">'+ICON+'<span>Серії та прогрес</span></div>'+buttonHTML('close','&#215;','fbr-close')+'</div><div class="fbr-content">'+content+'</div><div class="fbr-footer"><div class="fbr-hint">Кадри й назви: TMDB · Назад — до джерел</div></div></section></div>');
            mountPresentation(session,html,actions,session.episodeFocus,back,false);
            html.find('.fbr-episode-image img').on('error',function () { $(this).remove(); });
        }
        draw();
        loadSeasonMetadata(session,season,draw);
    }
    function metadataKey(session,season) { return (session.movie.tmdb_id || session.movie.id || '')+'-'+season; }
    function episodeImage(path) {
        if (!/^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(text(path))) return '';
        return L.TMDB && L.TMDB.image ? L.TMDB.image('t/p/w300'+path) : 'https://image.tmdb.org/t/p/w300'+path;
    }
    function loadSeasonMetadata(session,season,done) {
        var id = session.movie.tmdb_id || session.movie.id, key = metadataKey(session,season), cached = seasonMetadata[key];
        if (!/^\d+$/.test(text(id)) || !L.Api || !L.Api.sources || !L.Api.sources.tmdb || !L.Api.sources.tmdb.get) return;
        if (cached && cached.items && Date.now()-cached.at < (cached.items.length ? 86400000 : 60000)) return;
        if (cached && cached.callbacks) { cached.callbacks.push(done); return; }
        var record = {callbacks:[done]}, timer;
        seasonMetadata[key] = record;
        function finish(data) {
            if (!record.callbacks) return;
            if (timer) root.clearTimeout(timer);
            var callbacks = record.callbacks; record.callbacks = null; record.at = Date.now();
            record.items = data && Array.isArray(data.episodes) ? data.episodes.filter(function (e) { return e && +e.episode_number > 0 && (!e.season_number || +e.season_number === season); }).slice(0,400) : [];
            seasonMetadataOrder.push(key);
            if (seasonMetadataOrder.length > 24) delete seasonMetadata[seasonMetadataOrder.shift()];
            callbacks.forEach(function (callback) { callback(); });
        }
        timer = root.setTimeout(function () { finish(); },6000);
        try { L.Api.sources.tmdb.get('tv/'+id+'/season/'+season,{},finish,function () { finish(); }); }
        catch (ignore) { finish(); }
    }
    function releases(movie,catalog) { if (catalog.session) renderSources(catalog.session); else restore(); }
    function quality(movie,catalog) { if (catalog.session) renderSources(catalog.session); else restore(); }
    function resolveDirect(movie,catalog,title,release,episode,callback) {
        cancelPending(); var serial = requestSerial;
        loading(catalog.session,'оновлення посилання');
        resolveEpisode(serial,title,release,episode,function (err) {
            if (err) { episode.error = err.message; lastDiagnostic = err.message; notify(err.message); renderSources(catalog.session); }
            else callback();
        },true);
    }
    function validCatalog(catalog) {
        if (!catalog || catalog.schema !== 1 || !Array.isArray(catalog.titles)) return false;
        return catalog.titles.every(function (title) {
            return typeof title.id === 'string' && typeof title.title === 'string' && Array.isArray(title.releases) && title.releases.length && title.releases.every(function (release) {
                return ['uakino', 'kinoukr'].indexOf(release.source) >= 0 && release.audioLanguage === 'uk' && release.audioEvidence && Array.isArray(release.episodes) && release.episodes.length && release.episodes.every(function (episode) {
                    return mediaURL(episode.master) && episode.qualities && Object.keys(episode.qualities).length && Object.keys(episode.qualities).every(function (q) { return /^(2160|1440|1080|720|480|360)p$/.test(q) && mediaURL(episode.qualities[q]); });
                });
            });
        });
    }
    function loadCatalog(force, callback) {
        var base = baseURL();
        if (currentCatalog && !force && Date.now() - catalogLoadedAt < 60000) return callback(null, currentCatalog);
        if (!base) return callback(new Error('Не визначено адресу GitHub Pages. Перевірте URL розширення або вкажіть його в налаштуваннях ukr by Faborn.'));
        return xhr(base + 'data/catalog.json?t=' + Date.now(), function (error, body) {
            var parsed;
            if (!error) {
                try {
                    parsed = JSON.parse(body);
                    if (!validCatalog(parsed)) throw new Error('Несумісний індекс');
                } catch (e) { error = new Error('Некоректний data/catalog.json: ' + e.message); }
            }
            if (error) { lastDiagnostic = error.message; return callback(error); }
            currentCatalog = parsed;
            catalogLoadedAt = Date.now();
            lastDiagnostic = '';
            callback(null, parsed);
        });
    }
    function matchTitles(catalog, movie, query) {
        var names = unique([query, movie.title, movie.name, movie.original_title, movie.original_name].map(normalize));
        var tv = Boolean(movie.name || movie.first_air_date || movie.media_type === 'tv');
        var year = parseInt(text(movie.release_date || movie.first_air_date).substr(0, 4), 10);
        return catalog.titles.map(function (item) {
            var aliases = unique([item.title, item.originalTitle].concat(item.aliases || []).map(normalize));
            var score = 0;
            names.forEach(function (name) {
                aliases.forEach(function (alias) {
                    if (name === alias) score = Math.max(score, 100);
                    else if (name.length >= 3 && alias.indexOf(name) >= 0) score = Math.max(score, 70);
                    else if (alias.length >= 3 && name.indexOf(alias) >= 0) score = Math.max(score, 55);
                });
            });
            if (score && year && item.year === year) score += 10;
            if (score && (tv ? item.type === 'tv' : item.type === 'movie')) score += 5;
            return { title: item, score: score };
        }).filter(function (row) { return row.score > 0; }).sort(function (a, b) { return b.score - a.score; }).map(function (row) { return row.title; });
    }
    function qualityNames(episode) {
        if (episode.lab) return (episode.labQualities || []).filter(function (q) { return /^(2160|1440|1080|720|480|360)p$/.test(q); }).sort(function (a,b) { return parseInt(b,10)-parseInt(a,10); });
        return Object.keys(episode.qualities || {}).filter(function (q) { return mediaURL(episode.qualities[q]); }).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    }
    function pickURL(episode, preference) {
        var keys = qualityNames(episode), limit = parseInt(preference, 10), i;
        if (preference === 'auto' || !keys.length) return episode.master;
        if (!limit) return episode.qualities[keys[0]];
        for (i = 0; i < keys.length; i++) if (parseInt(keys[i], 10) <= limit) return episode.qualities[keys[i]];
        return episode.qualities[keys[keys.length - 1]];
    }
    function timelineKey(title, episode) { return 'faborn|' + title.id + '|' + (episode.season || 0) + '|' + (episode.episode || 0); }
    function lampaTimelineKey(title,episode) {
        if (!title.originalTitle) return '';
        return title.type === 'tv' ? [episode.season,episode.season > 10 ? ':' : '',episode.episode,title.originalTitle].join('') : title.originalTitle;
    }
    function episodeTimeline(title,episode) {
        if (!L || !L.Timeline || !L.Utils || !L.Utils.hash) return {};
        var timeline = L.Timeline.view(L.Utils.hash(timelineKey(title,episode))), canonical = lampaTimelineKey(title,episode);
        var shared = canonical && L.Timeline.view(L.Utils.hash(canonical));
        // Preserve beta.9 progress, and use newer standard Lampa marks when available.
        if (shared && (+shared.updated > (+timeline.updated || 0) || (!timeline.updated && !timeline.percent && shared.percent))) {
            ['time','duration','percent','updated'].forEach(function (key) { timeline[key] = shared[key]; });
        }
        var original = timeline.handler;
        timeline.handler = function (percent,time,duration) {
            if (original) original(percent,time,duration);
            if (shared && shared.handler) shared.handler(percent,time,duration);
        };
        return timeline;
    }
    function savePlaybackProgress(force) {
        var data = historyPlayback, progress = data && data.timeline;
        if (!data || !data.faborn_watched || !progress || progress.waiting_for_user || progress.stop_recording || !(progress.time > 0) || !(progress.duration > 0) || !isFinite(progress.time) || !isFinite(progress.duration)) return;
        if (!force && data.faborn_saved && Date.now()-data.faborn_saved < 15000) return;
        data.faborn_saved = Date.now();
        if (progress.handler) progress.handler(progress.percent,progress.time,progress.duration);
        save('position_'+data.faborn_title,{season:data.season,episode:data.episode,time:progress.time,duration:progress.duration,percent:progress.percent,updated:Date.now()});
        if (!data.faborn_in_history && data.card && data.card.id && L.Favorite && L.Favorite.add) {
            data.faborn_in_history = true;
            L.Favorite.add('history',data.card,100);
        }
    }
    function finishHistory() { savePlaybackProgress(true); historyPlayback = null; }
    function availablePlaylist(release, episode) {
        var list = release.episodes.filter(function (e) { return e.season === episode.season; }).sort(function (a, b) { return a.episode - b.episode; });
        var index = -1, left, right;
        list.forEach(function (e, n) { if (e.id === episode.id) index = n; });
        if (index < 0 || list[index].state === 'unavailable') return [];
        left = index; right = index;
        while (left > 0 && list[left - 1].state !== 'unavailable' && list[left - 1].episode === list[left].episode - 1) left--;
        while (right + 1 < list.length && list[right + 1].state !== 'unavailable' && list[right + 1].episode === list[right].episode + 1) right++;
        return list.slice(left, right + 1);
    }
    function playData(movie, title, release, episode, preference) {
        var url = pickURL(episode, preference), result = {
            url: url, faborn_url: url, faborn_episode: episode.id, faborn_title: title.id, faborn_release: release.id, faborn_quality: preference,
            quality: episode.qualities,
            title: title.title + (title.type === 'tv' ? ' · S' + episode.season + 'E' + episode.episode : '') + ' · ' + release.voice,
            season: episode.season, episode: episode.episode, voice_name: release.voice,
            isonline: true
        };
        var subtitles = subtitlesFrom(episode.subtitles || []);
        // An empty customSubs array in Lampa masks the native Tizen textTracks.
        if (subtitles.length) result.subtitles = subtitles.map(function (s,index) { return {index:index,label:s.label,language:s.language,url:s.url}; });
        if (L.Timeline && L.Utils && L.Utils.hash) result.timeline = episodeTimeline(title,episode);
        // A manually selected different title must not be recorded as the original TMDB card.
        var cardNames = unique([movie.title, movie.name, movie.original_title, movie.original_name].map(normalize));
        var indexedNames = unique([title.title, title.originalTitle].concat(title.aliases || []).map(normalize));
        var cardYear = parseInt(text(movie.release_date || movie.first_air_date).substr(0, 4), 10);
        if (cardNames.some(function (n) { return indexedNames.indexOf(n) >= 0; }) && (!cardYear || title.year === cardYear)) result.card = movie;
        return result;
    }
    function locate(catalog, titleId, releaseId, episodeId) {
        var found;
        catalog.titles.forEach(function (title) {
            if (title.id !== titleId) return;
            title.releases.forEach(function (release) {
                if (release.id !== releaseId) return;
                release.episodes.forEach(function (episode) {
                    if (episode.id === episodeId) found = {title: title, release: release, episode: episode};
                });
            });
        });
        return found;
    }
    function cancelPending() {
        requestSerial++;
        kinoRefreshJobs = {};
        if (discoveryTimer) root.clearTimeout(discoveryTimer);
        discoveryTimer = null;
        requests.forEach(function (req) { if (req && req.abort) req.abort(); });
        requests = [];
        if (pendingRequest && pendingRequest.abort) pendingRequest.abort();
        pendingRequest = null;
    }
    function clearPlaybackWatch() {
        if (playbackTimer) root.clearTimeout(playbackTimer);
        playbackTimer = null;
        watchedPlayback = null;
    }
    function playbackProblem(message, data) {
        if (!data || watchedPlayback !== data) return;
        if (L.Player.playdata && L.Player.playdata() !== data) { clearPlaybackWatch(); return; }
        var context = playbackContext, catalog = context && context.catalog || currentCatalog;
        var found = catalog && locate(catalog, data.faborn_title, data.faborn_release, data.faborn_episode);
        clearPlaybackWatch();
        lastDiagnostic = message;
        save('last_error', message);
        if (L.Player.close) L.Player.close();
        if (!context || !found) { restore(); notify(message); return; }
        activeSession = catalog.session;
        select('Відео не запустилося', [
            {title: 'Оновити посилання й повторити', subtitle: message, action: 'retry'},
            {title: 'Обрати іншу якість', subtitle: 'Для перевірки спробуй 1080p або 720p.', action: 'quality'},
            {title: 'Обрати інше озвучення або джерело', action: 'release'}
        ], function (row) {
            if (row.action === 'retry') {
                if (catalog.direct) found.episode.resolvedAt = 0;
                launch(context.movie, catalog, found.title, found.release, found.episode, data.faborn_quality);
            }
            else if (row.action === 'quality') quality(context.movie, catalog, found.title, found.release, found.episode);
            else releases(context.movie, catalog, found.title);
        }, restore);
    }
    function watchPlayback(data) {
        clearPlaybackWatch();
        if (!data || !data.faborn_title || !mediaURL(data.faborn_url)) return;
        watchedPlayback = data;
        playbackTimer = root.setTimeout(function () {
            playbackProblem('Плеєр не почав відтворення за 45 секунд. Посилання могло змінитися або телевізор не зміг відкрити цей потік.', data);
        }, 45000);
    }
    function playbackError(event, data) {
        if (!data || watchedPlayback !== data || !event) return;
        var detail = event.error || event;
        if (typeof detail === 'object') detail = detail.message || detail.code;
        root.setTimeout(function () { playbackProblem('Помилка плеєра: ' + text(detail || 'невідома помилка'), data); }, 0);
    }
    function watchNativeError(data) {
        if (!data || watchedPlayback !== data || !L.PlayerVideo || !L.PlayerVideo.video) return;
        try {
            var video = L.PlayerVideo.video();
            // Lampa's Tizen adapter puts the native error in event.error, not video.error.
            // Its own listener is destroyed together with this video object.
            if (video && video.addEventListener) video.addEventListener('error', function (event) { playbackError(event, data); });
        } catch (ignore) { /* The startup timeout still covers an unavailable adapter. */ }
    }
    function launch(movie,catalog,title,release,episode,preference) {
        var session = catalog.session;
        var isTizen = L.Platform && L.Platform.is && L.Platform.is('tizen');
        if (!isTizen || L.Storage.field && L.Storage.field('player') !== 'tizen') {
            return select('Потрібен плеєр Tizen', [{title:'Lampa → Налаштування → Плеєр → Tizen',subtitle:'Потік відтворюється штатним плеєром телевізора.'}],function () { renderSources(session); },function () { renderSources(session); });
        }
        if (!episode.resolvedAt || Date.now()-episode.resolvedAt > 60000) return resolveDirect(movie,catalog,title,release,episode,function () { launch(movie,catalog,title,release,episode,preference); });
        cancelPending(); var serial = requestSerial;
        loading(session,'запуск відео');
        episodeRequest(serial,episode,pickURL(episode,preference),'Вибрана якість',function (err,body) {
            if (err || !/^\s*#EXTM3U/.test(body)) {
                episode.error = err ? err.message : 'Некоректний HLS'; episode.resolvedAt = 0;
                lastDiagnostic = episode.error; notify(episode.error); renderSources(session); return;
            }
            stopKinoSession();
            closePresentation(); L.Select.hide(); L.Controller.toggle(returnController);
            // Only the selected episode has been checked. Never enqueue unresolved streams.
            handoff(movie,catalog,title,release,episode,preference,[]);
        });
    }
    function handoff(movie,catalog,title,release,episode,preference,playlist) {
        var data = playData(movie,title,release,episode,preference);
        data.playlist = playlist;
        playbackContext = {movie:movie,catalog:catalog};
        save('last_launch',title.title + ' · ' + preference + ' · передано плеєру');
        save('last_' + title.id,episode.id);
        if (catalog.direct) trace('Плеєр Lampa','передано ' + preference);
        if (L.Player.playlist) L.Player.playlist(playlist);
        L.Player.play(data);
    }
    function diagnostics() {
            var catalog = currentCatalog;
            var lines = [NAME + ' ' + VERSION];
            if (L.Storage.field) lines.push('Плеєр Lampa: ' + L.Storage.field('player') + ' · для бети потрібен Tizen / AVPlay');
            lines.push('AVPlay API: ' + (root.webapis && root.webapis.avplay ? 'доступний' : 'недоступний'));
            lines.push('Сесія KinoBase: '+storage('kino_transport','Звичайний запит'));
            lines.push('4K-експеримент: ' + (storage('lab4k','off') === 'on' ? 'увімкнено' : 'вимкнено'));
            if (storage('lab4k_status','')) lines.push('4K · ' + storage('lab4k_status',''));
            if (storage('last_error', '')) lines.push('Остання помилка плеєра: ' + storage('last_error', ''));
            if (storage('last_launch', '')) lines.push('Останній запуск: ' + storage('last_launch', ''));
            if (lastDiagnostic) lines.push(lastDiagnostic);
            storage('source_status',[]).forEach(function (line) { lines.push(line); });
            var sourceTrace = storage('direct_trace', []);
            if (Array.isArray(sourceTrace)) sourceTrace.forEach(function (line) { lines.push('Прямий пошук · ' + line); });
            lines.push('GitHub Pages: ' + (baseURL() || 'не визначено'));
            if (catalog) {
                lines.push('Резервний індекс: '+catalog.titles.length+' назв · '+catalog.generatedAt+'. Основний пошук виконується за відкритою карткою; він не обмежений цим індексом.');
            }
            select('Діагностика', lines.map(function (line) { return {title: line}; }), function () { diagnostics(); }, restore);
    }
    function cancelLabLoad() {
        labLoadSerial++;
        if (labLoadTimer !== null) root.clearTimeout(labLoadTimer);
        labLoadTimer = null;
        if (labScript) { labScript.onload = labScript.onerror = null; if (labScript.parentNode) labScript.parentNode.removeChild(labScript); labScript = null; }
    }
    function cancelCardLab() {
        cancelLabLoad();
        if (lab4k && lab4k.cancel) lab4k.cancel();
    }
    function ensureLab(done) {
        if (lab4k) return done(null,lab4k);
        var base = baseURL();
        if (!base || !root.document || !root.document.createElement) return done(new Error('LOAD: не визначено адресу модуля GitHub Pages'));
        cancelLabLoad();
        var run = labLoadSerial;
        function error() {
            if (run !== labLoadSerial) return;
            cancelLabLoad(); done(new Error('LOAD: не завантажено адаптер із GitHub Pages'));
        }
        labScript = root.document.createElement('script');
        labScript.src = base+'lib/4klab/ui.js?v='+VERSION;
        labScript.onerror = error;
        labScript.onload = function () {
            if (run !== labLoadSerial || storage('lab4k','off') !== 'on') return;
            if (typeof root.Faborn4KLab !== 'function') { error(); return; }
            cancelLabLoad();
            lab4k = root.Faborn4KLab(root,L,base+'lib/4klab/',VERSION);
            done(null,lab4k);
        };
        labLoadTimer = root.setTimeout(error,15000);
        root.document.head.appendChild(labScript);
    }
    function cardLabDetails(session) {
        session.screen = 'labstatus';
        select('UAKinogo / Alloha · експеримент',[
            {title:session.status.uakinogo,subtitle:'Пошук виконується для відкритої картки. Потік перевіряється перед запуском.',action:'info'},
            {title:'Повторити пошук цього джерела',action:'retry'},
            {title:'Повернутися до озвучень',action:'back'}
        ],function (row) {
            if (row.action === 'retry') { startCardLab(session); renderSources(session); }
            else if (row.action === 'back') renderSources(session);
        },function () { renderSources(session); });
    }
    function startCardLab(session) {
        if (activeSession !== session || storage('lab4k','off') !== 'on') return;
        session.labStarted = true; session.labLaunching = false;
        session.labPending = session.season+':'+session.episode;
        session.status.uakinogo = 'Завантаження адаптера…';
        var run = (session.labRun || 0)+1; session.labRun = run;
        function current() { return activeSession === session && session.labRun === run && storage('lab4k','off') === 'on'; }
        function refresh() {
            if (current()) {
                save('source_status',Object.keys(session.status).map(function (id) { return sourceName(id)+': '+session.status[id]; }));
                if (session.ready && session.screen === 'sources' && !session.labLaunching) renderSources(session);
            }
        }
        function failure(message,playbackFailure) {
            if (!current()) return;
            session.status.uakinogo = message; session.labPending = '';
            if (!playbackFailure) session.title.releases = session.title.releases.filter(function (r) { return r.source !== 'uakinogo'; });
            save('lab4k_status',message); refresh();
        }
        refresh();
        ensureLab(function (error,adapter) {
            if (!current()) return;
            if (error) { failure(error.message); return; }
            adapter.discover(session.movie,session.season,session.episode,{
                stage:function (message) { if (current()) { session.status.uakinogo = message; refresh(); } },
                error:failure,
                episodes:function (items) { if (current()) session.labEpisodes = items; },
                result:function (data) {
                    if (!current()) return;
                    session.labEpisodes = data.episodes; session.labSelection = data.season+':'+data.episode; session.labPending = '';
                    session.title.releases.forEach(function (r) {
                        if (r.source === 'uakinogo') r.episodes = r.episodes.filter(function (e) { return e.season !== data.season || e.episode !== data.episode; });
                    });
                    data.tracks.forEach(function (track) {
                        if (['uk','en','ru'].indexOf(track.language) < 0 || !Array.isArray(track.qualities)) return;
                        var r = session.title.releases.filter(function (v) { return v.source === 'uakinogo' && v.voice === track.label && v.audioLanguage === track.language; })[0];
                        if (!r) { r = {id:session.title.id+'-alloha-'+encodeURIComponent(track.language+'|'+track.label),source:'uakinogo',voice:track.label,audioLanguage:track.language,episodes:[]}; session.title.releases.push(r); }
                        r.episodes.push({id:r.id+'-s'+data.season+'e'+data.episode,season:data.season,episode:data.episode,lab:true,labQualities:track.qualities,resolvedAt:Date.now(),qualities:{}});
                    });
                    session.title.releases = session.title.releases.filter(function (r) { return r.episodes.length; });
                    var qualities = unique(data.tracks.reduce(function (all,t) { return all.concat(t.qualities); },[])).sort(function (a,b) { return parseInt(b,10)-parseInt(a,10); });
                    session.status.uakinogo = 'Знайдено · '+qualities.map(qualityLabel).join(', ')+' · озвучень: '+data.tracks.length;
                    if (session.labSelection !== session.season+':'+session.episode) { session.labPending = session.season+':'+session.episode; adapter.episode(session.season,session.episode); }
                    else refresh();
                },
                playerData:function (data) {
                    var chosen = session.labChosen;
                    var item = playData(session.movie,session.title,chosen.release,chosen.episode,chosen.value);
                    item.url = item.faborn_url = data.url; labPlaybackData = item;
                    save('last_launch',session.title.title+' · '+chosen.value+' · UAKinogo / Alloha · передано плеєру');
                    return item;
                },
                beforePlay:function () { closePresentation(); L.Select.hide(); L.Controller.toggle(returnController); },
                back:function () { if (current()) { session.labLaunching = false; renderSources(session); } else L.Controller.toggle(returnController); }
            });
        });
    }
    function labChanged() {
        if (storage('lab4k','off') !== 'on') {
            cancelLabLoad();
            if (lab4k) lab4k.disable();
        }
    }
    function openLab() {
        if (storage('lab4k','off') !== 'on') { notify('Спочатку увімкни «Експериментальне 4K»'); return; }
        rememberController();
        select('4K · Завантаження тесту',[{title:'Скасувати',subtitle:'Завантажується тест із GitHub Pages…',cancel:true}],function (row) {
            if (row.cancel) { cancelLabLoad(); restore(); }
        },function () { cancelLabLoad(); restore(); });
        ensureLab(function (error,adapter) {
            if (error) { save('lab4k_status',error.message); restore(); notify(error.message); return; }
            L.Select.hide(); adapter.open(returnController);
        });
    }
    function settings() {
        var api = L.SettingsApi;
        if (!api || !api.addComponent || !api.addParam) return;
        api.addComponent({component: 'faborn_ukr', name: NAME, icon: ICON});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_layout', type: 'select', values: {panel:'Панель', cinema:'Кінозал', classic:'Стандартне Lampa'}, default: 'panel'}, field: {name: 'Оформлення модуля', description: '«Стандартне Lampa» — штатні вікна та фокус, без кольорових акцентів Faborn у всій системі.'}, onChange: applyAppearance});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_theme', type: 'select', values: {on:'Faborn', ios:'iOS · Liquid Glass', off:'Стандартна Lampa'}, default: 'on'}, field: {name: 'Тема всієї Lampa', description: 'iOS — скляні меню, картки та вікна. Застосовується одразу; зі стандартного оформлення переходить у «Панель».'}, onChange: changeTheme});
        api.addParam({component:'faborn_ukr',param:{name:'faborn_ukr_glass_transparency',type:'select',values:{solid:'Непрозоре',low:'Низька',standard:'Стандартна',high:'Висока',max:'Максимальна'},default:'standard'},field:{name:'Прозорість скла iOS',description:'Для теми iOS · Liquid Glass. Вища прозорість — краще видно фон крізь меню, кнопки й вікна. Застосовується одразу.'},onChange:applyAppearance});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_accent', type: 'select', values: {blue:'Синій', amber:'Бурштиновий', mint:'М’ятний', violet:'Фіолетовий', aurora:'Синій → фіолетовий', lagoon:'Бірюзовий → синій'}, default: 'blue'}, field: {name: 'Колір акценту', description: 'Колір або градієнт для «Панелі» та «Кінозалу». У стандартному оформленні не застосовується.'}, onChange: applyAppearance});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_source', type: 'select', values: {uakino:'UAKino', uaserials:'UASerials', uafix:'UAFix', kinobase:'KinoBase', kinoukr:'KinoUkr', uakinogo:'UAKinogo / Alloha (експеримент)'}, default: 'uakino'}, field: {name: 'Пріоритет джерела', description: 'Вибір джерела також доступний перед переглядом. UAKinogo потребує ввімкненого «Експериментальне 4K».'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_quality', type: 'select', values: {best: 'Найвища доступна', auto: 'Авто', '2160p': '4K', '1080p': '1080p', '720p': '720p', '480p': '480p'}, default: 'best'}, field: {name: 'Бажана якість', description: 'Підсвічує варіант у списку джерел.'}});
        api.addParam({component:'faborn_ukr',param:{name:'faborn_ukr_kino_session',type:'select',values:{auto:'Автоматично',direct:'Лише звичайний запит'},default:'auto'},field:{name:'Сесія KinoBase',description:'Після помилки сесії повторює запит через мережевий API Samsung, якщо він доступний у застосунку. Окремий сервер не потрібен.'}});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_lab4k', type: 'select', values: {off:'Вимкнено',on:'Увімкнено'}, default: 'off'}, field: {name: 'Експериментальне 4K', description: 'Додає UAKinogo / Alloha до пошуку в картці: доступні якості, UA / EN / RU, сезони й серії. Потрібен Tizen Sockets; стан видно у списку джерел.'}, onChange:labChanged});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_lab4k_test', type: 'button'}, field: {name: 'Перевірити 4K', description: '«Оппенгеймер» · UA / EN / RU · 2160p AV1. Потрібен Tizen / AVPlay; сумісність визначить тест.'}, onChange:openLab});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_refresh', type: 'button'}, field: {name: 'Оновити індекс із GitHub'}, onChange: function () {
            loadCatalog(true, function (error, catalog) { notify(error ? error.message : 'Індекс оновлено: ' + catalog.titles.length + ' назв'); });
        }});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_diagnostic', type: 'button'}, field: {name: 'Версія та діагностика', description: VERSION}, onChange: function () { rememberController(); diagnostics(); }});
        api.addParam({component: 'faborn_ukr', param: {name: 'faborn_ukr_pages', type: 'input', values: '', default: '', placeholder: 'Визначається автоматично'}, field: {name: 'Адреса GitHub Pages', description: 'Зазвичай визначається автоматично. Резерв: https://USERNAME.github.io/REPOSITORY/'}});
    }
    function attach(event) {
        if (!event || event.type !== 'complite' || !event.object || !event.object.activity || !event.data || !event.data.movie) return;
        var render = event.object.activity.render(), button, anchor;
        if (!render || render.find('.view--faborn-ukr').length) return;
        button = $('<div class="full-start__button selector view--faborn-ukr" role="button" aria-label="' + NAME + '" data-subtitle="' + NAME + ' · ' + VERSION + '">' + ICON + '</div>');
        button.on('hover:enter', function () { open(event.data.movie); });
        // Modern Lampa keeps .view--torrent inside a hidden source group. The requested icon belongs on the visible card row.
        anchor = render.find('.full-start-new__buttons .button--play').first();
        if (anchor.length) { anchor.after(button); return; }
        anchor = render.find('.view--torrent').first();
        if (anchor.length) anchor.after(button);
        else {
            anchor = render.find('.full-start__buttons').first();
            if (anchor.length) anchor.append(button);
            else {
                anchor = render.find('.full-start__button').last();
                if (anchor.length) anchor.after(button);
            }
        }
    }
    function install() {
        if (installed || !root.Lampa || !root.jQuery) return;
        L = root.Lampa; $ = root.jQuery;
        if (!L.Listener || !L.Select || !L.Player) return;
        installed = true;
        if (!$('#faborn-ukr-style').length) $('body').append('<style id="faborn-ukr-style">.full-start__button.view--faborn-ukr{justify-content:center;min-width:3.7em}.view--faborn-ukr svg{width:1.65em;height:1.65em;flex-shrink:0}</style>');
        L.Listener.follow('full', attach);
        if (L.Player.listener) {
            L.Player.listener.follow('start', function (data) {
                // Lampa applies its global quality preference before this event. Preserve the explicit selection only for our streams.
                clearPlaybackWatch();
                finishHistory();
                var labOwned = data && data === labPlaybackData && data.faborn_4klab === true;
                if (!data || !data.faborn_title || (!labOwned && !mediaURL(data.faborn_url))) return;
                data.url = data.faborn_url;
                historyPlayback = data;
                save('last_' + data.faborn_title, data.faborn_episode);
                if (!labOwned) watchPlayback(data);
            });
            L.Player.listener.follow('ready', watchNativeError);
            L.Player.listener.follow('destroy', function () { clearPlaybackWatch(); finishHistory(); });
        }
        if (L.PlayerVideo && L.PlayerVideo.listener) {
            L.PlayerVideo.listener.follow('loadeddata', clearPlaybackWatch);
            L.PlayerVideo.listener.follow('timeupdate', function (event) {
                if (watchedPlayback && event && event.current > 0) clearPlaybackWatch();
                if (historyPlayback && event && event.current > 0 && event.duration > 0 && historyPlayback.timeline && !historyPlayback.timeline.waiting_for_user) {
                    historyPlayback.faborn_watched = true; savePlaybackProgress(false);
                }
            });
            L.PlayerVideo.listener.follow('ended', function () {
                if (historyPlayback && historyPlayback.timeline && historyPlayback.timeline.duration > 0) {
                    historyPlayback.timeline.percent = 100; historyPlayback.timeline.time = historyPlayback.timeline.duration;
                    savePlaybackProgress(true);
                }
            });
            L.PlayerVideo.listener.follow('error', function (event) {
                playbackError(event, watchedPlayback);
            });
        }
        settings();
        applyAppearance();
    }
    function boot() {
        var tries = 0;
        function attempt() {
            install();
            if (!installed && tries++ < 120) root.setTimeout(attempt, 500);
        }
        attempt();
    }
    return {
        version: VERSION, name: NAME, boot: boot, open: open,
        // Pure helpers are also used by the offline package checks.
        normalize: normalize, matchTitles: matchTitles, mediaURL: mediaURL,
        safeBase: safeBase, validCatalog: validCatalog, qualityNames: qualityNames,
        pickURL: pickURL, timelineKey: timelineKey, availablePlaylist: availablePlaylist, escapeHTML: escapeHTML,
        audioLanguage:audioLanguage, sourceGroups:sourceGroups, kinoPage:kinoPage, kinoEntries:kinoEntries, kinoDecode:kinoDecode, kinoCandidate:kinoCandidate,
        providers:PROVIDERS, providerSearch:providerSearch, providerPage:providerPage, playerEntries:playerEntries, sameTitle:sameTitle, parseSearch:parseSearch, parseSource:parseSource, addEpisodeRefs:addEpisodeRefs, parseEmbed:parseEmbed, parseMaster:parseMaster, uakinoURL:uakinoURL, embedURL:embedURL
    };
}));
