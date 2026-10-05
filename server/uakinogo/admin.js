'use strict';
const crypto=require('node:crypto'), fs=require('node:fs'), path=require('node:path');
const {createUserStore,record,username,password}=require('./auth');
const {change}=require('./users');
const {lanPolicy,loopback}=require('./network');
const COOKIE='faborn_admin', IDLE_MS=30*60000, MAX_AGE=8*3600000;
const token=()=>crypto.randomBytes(32).toString('hex');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
class AdminError extends Error { constructor(status,message) { super(message); this.status=status; } }

function createAdmin({file,allowLan,users,metrics,state,version,now=Date.now}) {
    if (!file || !allowLan) throw Error('Admin account file and LAN policy are required');
    if (users?.file && path.resolve(file)===path.resolve(users.file)) throw Error('Admin and viewer accounts must use different files');
    const permitted=lanPolicy(allowLan), accounts=createUserStore(file), sessions=new Map(), rates=new Map();
    let authenticating=0, changing=false, lastCpu=process.cpuUsage(), lastTime=process.hrtime.bigint();
    const assets=new Map([
        ['/admin/',{type:'text/html; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'admin/index.html'))}],
        ['/admin/app.js',{type:'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'admin/app.js'))}],
        ['/admin/style.css',{type:'text/css; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'admin/style.css'))}]
    ]);
    function send(res,status,body,extra={}) {
        if (res.destroyed) return;
        res.writeHead(status,{
            'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
            'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
            'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
            ...extra
        });
        res.end(Buffer.isBuffer(body)?body:JSON.stringify(body));
    }
    function origin(req) {
        try {
            const base=new URL((req.socket.encrypted?'https':'http')+'://'+req.headers.host);
            const host=base.hostname.replace(/^\[|\]$/g,'');
            // Reject DNS rebinding hostnames. Admin v1 is reached by the LAN IP
            // or localhost only; forwarded address/protocol headers are ignored.
            if (!(host==='localhost'||loopback(host)||permitted(host)) || base.username || base.password || base.pathname!=='/' || base.search || base.hash) return '';
            return base.origin;
        } catch (error) { return ''; }
    }
    function sameOrigin(req,base) {
        return Boolean(base) && req.headers.origin===base && !['cross-site'].includes(req.headers['sec-fetch-site']);
    }
    async function body(req) {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')) throw new AdminError(415,'Очікується JSON');
        let size=0; const chunks=[];
        for await (const chunk of req) { size+=chunk.length; if(size>4096) throw new AdminError(413,'Завеликий запит'); chunks.push(chunk); }
        let value; try { value=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (error) { throw new AdminError(400,'Некоректний запит'); }
        if (!value || typeof value!=='object' || Array.isArray(value)) throw new AdminError(400,'Некоректний запит');
        return value;
    }
    function cookie(req,value,maxAge) {
        return COOKIE+'='+value+'; Path=/admin; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(req.socket.encrypted?'; Secure':'');
    }
    function sessionId(req) {
        const match=new RegExp('(?:^|;\\s*)'+COOKIE+'=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie||'');
        return match?digest(match[1]):'';
    }
    function prune() {
        const time=now();
        for (const [id,s] of sessions) if(time-s.seen>=IDLE_MS || time-s.created>=MAX_AGE) sessions.delete(id);
        for (const [ip,r] of rates) if(time-r.start>=15*60000) rates.delete(ip);
    }
    async function adminData() {
        try { const d=await accounts.read(); if (!d.enabled) throw Error('Disabled'); return d; }
        catch (error) { throw new AdminError(503,'Обліковий запис адміністратора недоступний'); }
    }
    async function session(req) {
        prune(); const id=sessionId(req), s=sessions.get(id);
        if (!s) throw new AdminError(401,'Увійдіть в адмінпанель');
        const d=await adminData(), u=d.users.find(u=>u.username===s.name && !u.disabled);
        if (!u || !equal(s.fingerprint,digest(u.salt+u.hash))) { sessions.delete(id); throw new AdminError(401,'Увійдіть повторно'); }
        s.seen=now(); return {...s,id};
    }
    function checkCsrf(req,s) { if (!equal(req.headers['x-faborn-csrf'],s.csrf)) throw new AdminError(403,'Оновіть сторінку й повторіть дію'); }
    async function login(req,res) {
        prune(); const ip=req.socket.remoteAddress;
        if (!rates.has(ip)) { if(rates.size>=128) throw new AdminError(429,'Зачекайте перед наступною спробою'); rates.set(ip,{start:now(),count:0}); }
        if (++rates.get(ip).count>10 || authenticating>=2) throw new AdminError(429,'Забагато спроб. Спробуйте через 15 хвилин');
        const input=await body(req);
        if (!username(input.username)||!password(input.password)) throw new AdminError(401,'Неправильний логін або пароль');
        if (authenticating>=2) throw new AdminError(429,'Зачекайте перед наступною спробою');
        authenticating++;
        try {
            const d=await adminData(), header='Basic '+Buffer.from(input.username+':'+input.password).toString('base64');
            if (!await accounts.verify(header,d)) {
                metrics.audit('login_failed','', '',ip);
                throw new AdminError(401,'Неправильний логін або пароль');
            }
            const u=d.users.find(u=>u.username===input.username), value=token();
            // Login always rotates this browser's session; bounded sessions also
            // disappear immediately after an administrator password reset.
            sessions.delete(sessionId(req));
            while(sessions.size>=16) sessions.delete(sessions.keys().next().value);
            const s={name:u.username,csrf:token(),created:now(),seen:now(),fingerprint:digest(u.salt+u.hash)};
            sessions.set(digest(value),s); metrics.audit('login',s.name,'',ip);
            send(res,200,{ok:true,username:s.name,csrf:s.csrf},{'Set-Cookie':cookie(req,value,MAX_AGE/1000)});
        } finally { authenticating--; }
    }
    async function viewerAccounts() {
        if (!users?.file) throw new AdminError(503,'Файл користувачів сервера не налаштований');
        try { return await users.read(); } catch (error) { throw new AdminError(503,'Файл користувачів недоступний'); }
    }
    function runtime() {
        const current=process.hrtime.bigint(), cpu=process.cpuUsage(), elapsed=Number(current-lastTime)/1000;
        const cpuPercent=elapsed>0 ? Math.round((cpu.user-lastCpu.user+cpu.system-lastCpu.system)/elapsed*1000)/10 : 0;
        lastCpu=cpu;lastTime=current;
        return {version,uptimeSeconds:Math.floor(process.uptime()),rssBytes:process.memoryUsage().rss,cpuPercent,...state()};
    }
    async function editUser(req,res,s) {
        await viewerAccounts(); const input=await body(req);
        if (!username(input.username) || !['add','reset','block','unblock','delete'].includes(input.action)) throw new AdminError(400,'Оберіть дію та коректний логін');
        if (changing) throw new AdminError(409,'Інша зміна ще виконується. Повторіть за мить');
        changing=true;
        try {
            const pass=['add','reset'].includes(input.action)?crypto.randomBytes(18).toString('base64url'):'';
            await change(users.file,async d=>{
                const index=d.users.findIndex(u=>u.username===input.username),old=d.users[index];
                if(input.action==='add' && old) throw new AdminError(409,'Такий користувач уже існує');
                if(input.action!=='add' && !old) throw new AdminError(404,'Користувача не знайдено');
                if(input.action==='add' && d.users.length>=128) throw new AdminError(409,'Досягнуто ліміт 128 користувачів');
                if(pass) {
                    const u=await record(input.username,pass); if(old?.disabled) u.disabled=true;
                    if(old) d.users[index]=u; else d.users.push(u);
                } else if(input.action==='delete') d.users.splice(index,1);
                else old.disabled=input.action==='block';
                d.enabled=true;
            });
            metrics.audit(input.action,s.name,input.username,req.socket.remoteAddress);
            send(res,200,{ok:true,username:input.username,...(pass?{password:pass}:{})});
        } catch (error) {
            if(error.code==='EEXIST') throw new AdminError(409,'Файл користувачів зараз змінюється. Повторіть за мить');
            throw error;
        } finally { changing=false; }
    }
    return async function handle(req,res) {
        // This handler is deliberately separate from the resolver's wildcard
        // CORS and optional anonymous LAN access. Both checks are mandatory.
        const ip=req.socket.remoteAddress, base=origin(req);
        if (!(loopback(ip)||permitted(ip)) || !base) return send(res,403,{error:'Адмінпанель доступна лише з дозволеної локальної мережі за IP-адресою сервера'});
        try {
            if (req.method==='POST' && !sameOrigin(req,base)) throw new AdminError(403,'Запит з іншого сайту заборонено');
            if (req.method==='GET' && req.url==='/admin') return send(res,302,{}, {Location:'/admin/'});
            if (req.method==='GET' && assets.has(req.url)) { const a=assets.get(req.url);return send(res,200,a.body,{'Content-Type':a.type}); }
            if (req.method==='POST' && req.url==='/admin/api/login') return await login(req,res);
            const s=await session(req);
            if(req.method==='GET' && req.url==='/admin/api/session') return send(res,200,{username:s.name,csrf:s.csrf});
            if(req.method==='POST') checkCsrf(req,s);
            if(req.method==='POST' && req.url==='/admin/api/logout') {
                sessions.delete(s.id);return send(res,200,{ok:true},{'Set-Cookie':cookie(req,'',0)});
            }
            if(req.method==='GET' && req.url==='/admin/api/overview') {
                await metrics.ready;
                return send(res,200,{runtime:runtime(),metrics:metrics.snapshot(),videoProxy:false,trafficScope:'resolver-json-payload',adminLan:allowLan});
            }
            if(req.method==='GET' && req.url==='/admin/api/users') {
                const d=await viewerAccounts(), people=metrics.snapshot().people;
                return send(res,200,{enabled:d.enabled,users:d.users.map(u=>({username:u.username,disabled:u.disabled===true,stats:people.find(p=>p.kind==='user'&&p.name===u.username)||null}))});
            }
            if(req.method==='POST' && req.url==='/admin/api/users') return await editUser(req,res,s);
            throw new AdminError(404,'Маршрут відсутній');
        } catch (error) { send(res,error.status||500,{error:error.status?error.message:'Не вдалося виконати дію. Перевірте доступ сервісу до файлів admin, users і state.'}); }
    };
}
module.exports={createAdmin};
