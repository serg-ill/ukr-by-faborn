'use strict';
(() => {
    const $=id=>document.getElementById(id);
    let csrf='', sessionName='', overview=null, accounts=null, loading=false, generation=0, view='overview';
    const numeric=value=>Number(value||0).toLocaleString('uk-UA');
    function bytes(value) {
        if (!value) return '0 Б';
        const unit=Math.min(3,Math.floor(Math.log(value)/Math.log(1024)));
        return (value/Math.pow(1024,unit)).toLocaleString('uk-UA',{maximumFractionDigits:unit?1:0})+' '+['Б','КіБ','МіБ','ГіБ'][unit];
    }
    function date(time,full=false) {
        if (!time) return 'Ще не звертався';
        return new Date(time).toLocaleString('uk-UA',full?{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    function element(tag,text,className) { const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node; }
    function cell(text,sub='',className='') { const node=element('td',text,className);if(sub)node.append(element('small',sub));return node; }
    function badge(text,type='') { return element('span',text,'pill '+type); }
    function table(target,heads,rows) {
        const wrap=$(target);wrap.replaceChildren();
        if (!rows.length) { wrap.append(element('p','Поки немає даних','empty'));return; }
        const t=element('table'),thead=element('thead'),tr=element('tr'),tbody=element('tbody');
        for(const h of heads)tr.append(element('th',h));thead.append(tr);t.append(thead,tbody);
        for(const cells of rows){const row=element('tr');row.append(...cells);tbody.append(row);}wrap.append(t);
    }
    function showNotice(message='') { $('notice').textContent=message;$('notice').hidden=!message; }
    function clearCredentials() {
        for(const id of ['new-username','new-password','share-link','share-host'])$(id).value='';
        $('copy-status').textContent='';
    }
    function showLogin() {
        generation++;csrf='';sessionName='';overview=null;accounts=null;$('app').hidden=true;$('login-view').hidden=false;
        for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();clearCredentials();
        $('login-form').elements.password.value='';
    }
    async function api(route,method='GET',body) {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
        try {
            const response=await fetch('/admin/api/'+route,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
                headers:method==='POST'?{'Content-Type':'application/json','X-Faborn-CSRF':csrf}:{},body:body===undefined?undefined:JSON.stringify(body)});
            const data=await response.json();
            if(!response.ok){const error=Error(data.error||'Сервер недоступний');error.status=response.status;throw error;}
            return data;
        } catch(error){if(error.name==='AbortError')throw Error('Сервер не відповів за 12 секунд');throw error;}
        finally{clearTimeout(timer);}
    }
    function nameFor(event) { return event.kind==='user'?event.name:({lan:'Локальний доступ',key:'Ключ доступу',open:'Без авторизації',denied:'Відмовлено'})[event.kind]||'Невідомо'; }
    function eventRows(events) {
        return events.map(e=>{
            const status=cell(''), good=e.status>=200&&e.status<300;
            status.append(badge(good?(e.cacheHit?'Із кешу':'Успішно'):'HTTP '+e.status,good?(e.cacheHit?'neutral':''):'error'));
            const episode=e.season&&e.episode?'S'+e.season+' · E'+e.episode:'';
            return [cell(date(e.time,true),'','nowrap'),cell(nameFor(e),e.ip),cell(e.title||'Без даних картки',episode,'title'),status,cell(numeric(e.durationMs)+' мс','','nowrap'),cell(bytes(e.inputBytes+e.outputBytes),'','nowrap')];
        });
    }
    function renderEvents() {
        if(!overview)return;
        const m=overview.metrics,heads=['Час','Користувач','Назва','Результат','Час відповіді','API-трафік'];
        if(view==='overview')table('recent-table',heads,eventRows(m.events.slice(0,5)));
        if(view!=='activity')return;
        table('activity-table',heads,eventRows(m.events.filter(e=>!$('errors-only').checked||e.status>=400)));
        const actions={login:'Вхід у панель',login_failed:'Невдалий вхід',add:'Створено користувача',reset:'Змінено пароль',block:'Доступ заблоковано',unblock:'Доступ відновлено',delete:'Користувача видалено'};
        table('audit-table',['Час','Дія','Адміністратор','Користувач','IP'],m.audit.map(e=>[cell(date(e.time,true),'','nowrap'),cell(actions[e.action]||e.action),cell(e.actor||'—'),cell(e.target||'—'),cell(e.ip)]));
    }
    function renderUsers() {
        if(!accounts)return;
        const filter=$('user-search').value.toLowerCase();
        $('nav-user-count').textContent=accounts.users.length;
        if(view!=='users')return;
        table('users-table',['Логін','Статус','Останній запит','Запити · 30 днів','API-трафік','Керування'],accounts.users.filter(u=>u.username.toLowerCase().includes(filter)).map(u=>{
            const s=u.stats||{},status=cell(''),actions=cell(''),buttons=element('div',undefined,'table-actions');
            status.append(badge(u.disabled?'Заблоковано':'Доступний',u.disabled?'warn':''));
            for(const [action,label] of [[u.disabled?'unblock':'block',u.disabled?'Увімкнути':'Блокувати'],['reset','Новий пароль'],['delete','Видалити']]){
                const b=element('button',label,action==='delete'?'danger':'');b.type='button';
                b.setAttribute('aria-label',label+' · '+u.username);b.addEventListener('click',()=>editUser(action,u.username,b));buttons.append(b);
            }
            actions.append(buttons);
            return [cell(u.username),status,cell(date(s.lastSeen,true),s.lastIp||''),cell(numeric(s.requests),s.errors?numeric(s.errors)+' помилок':''),cell(bytes((s.inputBytes||0)+(s.outputBytes||0))),actions];
        }));
        const lan=overview?.runtime.anonymousLan;
        $('access-note').textContent=!accounts.enabled?'Авторизація ще не ввімкнена. Створення першого користувача ввімкне перевірку логіна й пароля.':
            'Запити з логіном перевіряються за обліковими записами.'+(lan?' Локальна мережа '+lan+' також має окремий доступ без пароля.':'')+(overview?.runtime.keysConfigured?' Ключі доступу також увімкнені.':'');
    }
    function render() {
        const {runtime:r,metrics:m}=overview,t=m.total;
        $('server-version').textContent='Версія '+r.version;$('admin-name').textContent=sessionName;
        $('stat-requests').textContent=numeric(t.requests);$('stat-traffic').textContent=bytes(t.inputBytes+t.outputBytes);
        $('stat-traffic-detail').textContent='↓ '+bytes(t.inputBytes)+' отримано · ↑ '+bytes(t.outputBytes)+' віддано';
        $('stat-success').textContent=t.requests?(100*t.success/t.requests).toLocaleString('uk-UA',{maximumFractionDigits:1})+'%':'—';
        $('stat-errors').textContent=t.requests?numeric(t.errors)+' помилок · '+numeric(t.authFailures)+' відмов доступу':'Немає запитів';
        $('stat-active').textContent=r.activeRequests;
        const hours=Math.floor(r.uptimeSeconds/3600),mins=Math.floor(r.uptimeSeconds%3600/60);
        $('server-uptime').textContent='Працює '+(hours?hours+' год ':'')+mins+' хв';
        $('runtime-memory').textContent=bytes(r.rssBytes);$('runtime-cpu').textContent=r.cpuPercent.toLocaleString('uk-UA')+'%';
        $('runtime-latency').textContent=t.requests?numeric(Math.round(t.durationMs/t.requests))+' мс':'—';
        $('runtime-cache').textContent=numeric(t.cacheHits);$('runtime-storage').textContent=m.storageError?'Помилка запису':m.persistent?'На диску · 30 днів':'Лише в пам’яті';
        $('updated').textContent='Оновлено '+date(Date.now());$('collection-start').textContent='Збір даних із '+date(m.since,true);
        const chart=$('chart'),max=Math.max(1,...m.days.map(d=>d.requests));chart.replaceChildren();
        for(const d of m.days){const row=element('div',undefined,'chart-row'),bar=element('progress');bar.max=max;bar.value=d.requests;bar.setAttribute('aria-label',d.date+': '+d.requests+' запитів');row.append(element('span',d.date.slice(8)+'.'+d.date.slice(5,7)),bar,element('strong',numeric(d.requests)));chart.append(row);}
        $('service-status').classList.remove('failed');$('service-status').replaceChildren(element('span',undefined,'dot'),document.createTextNode('Сервер відповідає'));
        showNotice(m.demo?'Демонстраційні дані · локальний стенд. Це не статистика вашого Ubuntu.':m.storageError);renderEvents();renderUsers();
    }
    async function refresh() {
        if(loading||!csrf)return;loading=true;const current=generation;$('refresh').disabled=true;
        try {
            const result=await Promise.all([api('overview'),api('users')]);
            if(current!==generation)return;[overview,accounts]=result;render();
        } catch(error) {
            if(current!==generation)return;
            if(error.status===401){showLogin();return;}
            showNotice(error.message);$('service-status').classList.add('failed');$('service-status').textContent='Дані не оновлено';
        } finally {loading=false;$('refresh').disabled=false;}
    }
    function switchView(next) {
        view=next;
        for(const name of ['overview','users','activity'])$('view-'+name).hidden=name!==view;
        $('page-title').textContent={overview:'Огляд сервера',users:'Користувачі',activity:'Журнал активності'}[view];
        for(const b of document.querySelectorAll('nav [data-view]')){const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
        renderEvents();renderUsers();
    }
    function loggedIn(data) {csrf=data.csrf;sessionName=data.username;$('login-form').elements.password.value='';$('login-view').hidden=true;$('app').hidden=false;void refresh();}
    function credentials(data) {
        clearCredentials();$('new-username').value=data.username;$('new-password').value=data.password;$('share-host').value=location.host;shareLink();$('credentials-dialog').showModal();
    }
    function shareLink() {
        try {
            const input=$('share-host').value.trim(),url=new URL(/^https?:\/\//i.test(input)?input:'http://'+input);
            if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid address');
            url.username=$('new-username').value;url.password=$('new-password').value;$('share-link').value=url.href.replace(/\/$/,'');
        } catch(error){$('share-link').value='';}
    }
    async function editUser(action,name,button) {
        const prompt={reset:'Створити новий пароль для '+name+'? Старий перестане працювати.',delete:'Видалити доступ для '+name+'?',block:'Заблокувати нові запити з логіном '+name+'?'}[action];
        if(prompt&&!confirm(prompt))return;button.disabled=true;
        try {const data=await api('users','POST',{action,username:name});if(data.password)credentials(data);await refresh();}
        catch(error){if(error.status===401)showLogin();else showNotice(error.message);}
        finally{button.disabled=false;}
    }
    $('login-form').addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;$('login-error').textContent='';
        try{loggedIn(await api('login','POST',{username:form.elements.username.value,password:form.elements.password.value}));}
        catch(error){$('login-error').textContent=error.message;form.elements.password.value='';}
        finally{button.disabled=false;}
    });
    $('logout').addEventListener('click',async()=>{try{await api('logout','POST',{});showLogin();}catch(error){showNotice(error.message);}});
    $('refresh').addEventListener('click',refresh);
    for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>switchView(button.dataset.view));
    $('user-search').addEventListener('input',renderUsers);$('errors-only').addEventListener('change',renderEvents);
    $('add-user').addEventListener('click',()=>{$('user-form').reset();$('user-error').textContent='';$('user-dialog').showModal();});
    for(const button of document.querySelectorAll('.close-dialog'))button.addEventListener('click',()=>button.closest('dialog').close());
    $('credentials-dialog').addEventListener('close',clearCredentials);
    $('user-form').addEventListener('submit',async event=>{
        event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;$('user-error').textContent='';
        try{const data=await api('users','POST',{action:'add',username:event.currentTarget.elements.username.value});$('user-dialog').close();credentials(data);await refresh();}
        catch(error){if(error.status===401)showLogin();else $('user-error').textContent=error.message;}finally{button.disabled=false;}
    });
    $('share-host').addEventListener('input',shareLink);
    $('copy-link').addEventListener('click',async()=>{
        const input=$('share-link');if(!input.value){$('copy-status').textContent='Вкажіть коректну адресу сервера';return;}
        try{
            if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(input.value);
            else{input.focus();input.select();if(!document.execCommand('copy'))throw Error('Copy');}
            $('copy-status').textContent='Скопійовано. Передайте посилання приватно.';
        }catch(error){input.focus();input.select();$('copy-status').textContent='Посилання виділено. Скопіюйте його вручну.';}
    });
    function canRefresh(){return csrf&&!document.hidden&&$('auto-refresh').checked&&!document.querySelector('dialog[open]')&&!document.activeElement?.closest('#users-table');}
    setInterval(()=>{if(canRefresh())void refresh();},15000);
    document.addEventListener('visibilitychange',()=>{if(canRefresh())void refresh();});
    api('session').then(loggedIn).catch(error=>{if(error.status!==401)$('login-error').textContent=error.message;});
})();
