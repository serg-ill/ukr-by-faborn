'use strict';
const fs=require('node:fs/promises'), path=require('node:path'), crypto=require('node:crypto');
const {eventDetails,reason}=require('./diagnostics');
const DAY=86400000, RETENTION=30, MAX_EVENTS=300, MAX_AUDIT=100, MAX_IDENTITIES=160, MAX_FILE=4*1024*1024;
const fields=['requests','success','errors','authFailures','cacheHits','inputBytes','outputBytes','durationMs'];
const clean=(value,max=180)=>String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
const number=value=>Number.isFinite(value) && value>=0 ? Math.min(value,Number.MAX_SAFE_INTEGER) : 0;
function empty() { return Object.fromEntries(fields.map(key=>[key,0])); }
function add(target,source) { for (const key of fields) target[key]+=number(source[key]); return target; }
function dayKey(time) { return new Date(time).toISOString().slice(0,10); }
const address=value=>clean(value,64).replace(/^::ffff:/i,'');
function localGroup() { return {total:empty(),clients:[]}; }

// Only allowlisted resolver metadata is persisted. Headers, bodies, passwords,
// source URLs and signed media URLs never enter this store.
function createMetrics({file='',now=Date.now,flushMs=30000}={}) {
    let data={version:1,since:now(),days:[],events:[],audit:[]}, dirty=false, loaded=false, blocked=false, storageError='', writing=null;
    const pending=[];
    function trim() {
        const previous=data.days.length+data.events.length+data.audit.length;
        const cutoff=dayKey(now()-(RETENTION-1)*DAY);
        data.days=data.days.filter(d=>d.date>=cutoff).slice(-RETENTION);
        data.events=data.events.filter(e=>e.time>=now()-RETENTION*DAY).slice(-MAX_EVENTS);
        data.audit=data.audit.filter(e=>e.time>=now()-RETENTION*DAY).slice(-MAX_AUDIT);
        if(previous!==data.days.length+data.events.length+data.audit.length)dirty=true;
    }
    function day() {
        const date=dayKey(now()); let row=data.days.find(d=>d.date===date);
        if (!row) { row={date,total:empty(),people:[],local:localGroup()}; data.days.push(row); }
        return row;
    }
    function record(input) {
        if (!loaded) { if (pending.length<MAX_EVENTS) pending.push(['record',input]); return; }
        const time=now(), kind=['user','lan','key','open','denied'].includes(input.kind)?input.kind:'denied';
        const name=kind==='user' ? clean(input.name,64) : '';
        const status=Math.floor(number(input.status));
        const event={time,kind,name,ip:address(input.ip),local:input.local===true||kind==='lan',title:clean(input.title),season:number(input.season),episode:number(input.episode),
            status,...eventDetails({...input,status}),cacheHit:input.cacheHit===true,inputBytes:number(input.inputBytes),outputBytes:number(input.outputBytes),durationMs:Math.round(number(input.durationMs))};
        const counts={requests:1,success:status>=200&&status<300?1:0,errors:status>=400?1:0,authFailures:status===401||status===403&&input.errorCode==='auth_failed'?1:0,
            cacheHits:event.cacheHit?1:0,inputBytes:event.inputBytes,outputBytes:event.outputBytes,durationMs:event.durationMs};
        trim(); const row=day(); add(row.total,counts);
        let person=row.people.find(p=>p.kind===kind && p.name===name);
        if (!person && row.people.length<MAX_IDENTITIES) { person={kind,name,...empty(),lastSeen:time,lastIp:event.ip}; row.people.push(person); }
        if (person) { add(person,counts); person.lastSeen=time; person.lastIp=event.ip; }
        if (event.local) {
            add(row.local.total,counts);
            let client=row.local.clients.find(c=>c.ip===event.ip);
            if (!client && event.ip && row.local.clients.length<MAX_IDENTITIES) {
                client={ip:event.ip,...empty(),lastSeen:time,lastKind:kind,lastName:name}; row.local.clients.push(client);
            }
            if (client) { add(client,counts); client.lastSeen=time; client.lastKind=kind; client.lastName=name; }
        }
        data.events.push(event); trim(); dirty=true;
    }
    function audit(action,actor,target='',ip='') {
        if (!loaded) { if (pending.length<MAX_EVENTS) pending.push(['audit',[action,actor,target,ip]]); return; }
        data.audit.push({time:now(),action:clean(action,40),actor:clean(actor,64),target:clean(target,64),ip:clean(ip,64)});
        trim(); dirty=true;
    }
    const ready=(async()=>{
        if (file) {
            try {
                const stat=await fs.stat(file);
                if (!stat.isFile() || stat.size>MAX_FILE) throw Error('Invalid metrics file');
                const value=JSON.parse(await fs.readFile(file,'utf8'));
                if (value.version!==1 || !Number.isFinite(value.since) || !Array.isArray(value.days) || value.days.length>RETENTION ||
                    !Array.isArray(value.events) || value.events.length>MAX_EVENTS || !Array.isArray(value.audit) || value.audit.length>MAX_AUDIT) throw Error('Invalid metrics file');
                for (const d of value.days) {
                    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !d.total || !Array.isArray(d.people) || d.people.length>MAX_IDENTITIES) throw Error('Invalid metrics file');
                    for (const row of [d.total,...d.people]) for (const key of fields) if (!row || !Number.isFinite(row[key]) || row[key]<0) throw Error('Invalid metrics file');
                    for (const p of d.people) if (typeof p.kind!=='string' || typeof p.name!=='string' || typeof p.lastIp!=='string' || !Number.isFinite(p.lastSeen)) throw Error('Invalid metrics file');
                    if (d.local!==undefined) {
                        if (!d.local || !d.local.total || !Array.isArray(d.local.clients) || d.local.clients.length>MAX_IDENTITIES) throw Error('Invalid local metrics');
                        for (const row of [d.local.total,...d.local.clients]) for (const key of fields) if (!row || !Number.isFinite(row[key]) || row[key]<0) throw Error('Invalid local metrics');
                        for (const c of d.local.clients) if (!['ip','lastKind','lastName'].every(k=>typeof c[k]==='string') || !Number.isFinite(c.lastSeen)) throw Error('Invalid local metrics');
                    }
                }
                for (const e of value.events) if (!e || typeof e.kind!=='string' || typeof e.name!=='string' || typeof e.ip!=='string' || typeof e.title!=='string' ||
                    !['time','season','episode','status','inputBytes','outputBytes','durationMs'].every(k=>Number.isFinite(e[k])&&e[k]>=0)) throw Error('Invalid metrics file');
                for (const e of value.audit) if (!e || !Number.isFinite(e.time) || !['action','actor','target','ip'].every(k=>typeof e[k]==='string')) throw Error('Invalid metrics file');
                const counts=row=>Object.fromEntries(fields.map(k=>[k,row[k]]));
                const local=d=>d.local?{total:counts(d.local.total),clients:d.local.clients.map(c=>({ip:address(c.ip),lastSeen:c.lastSeen,lastKind:clean(c.lastKind,16),lastName:clean(c.lastName,64),...counts(c)}))}:
                    // Legacy LAN totals are reliable; the last IP cannot tell us
                    // how older requests were distributed across devices.
                    {total:d.people.filter(p=>p.kind==='lan').reduce(add,empty()),clients:[]};
                data={version:1,since:value.since,
                    days:value.days.map(d=>({date:d.date,total:counts(d.total),local:local(d),people:d.people.map(p=>({kind:clean(p.kind,16),name:clean(p.name,64),lastSeen:p.lastSeen,lastIp:address(p.lastIp),...counts(p)}))})),
                    events:value.events.map(e=>({time:e.time,kind:clean(e.kind,16),name:clean(e.name,64),ip:address(e.ip),local:e.local===true||e.kind==='lan',title:clean(e.title),season:e.season,episode:e.episode,status:e.status,
                        ...eventDetails(e),cacheHit:e.cacheHit===true,inputBytes:e.inputBytes,outputBytes:e.outputBytes,durationMs:e.durationMs})),
                    audit:value.audit.map(e=>({time:e.time,action:clean(e.action,40),actor:clean(e.actor,64),target:clean(e.target,64),ip:clean(e.ip,64)}))};
            } catch (error) {
                if (error.code!=='ENOENT') { storageError='Не вдалося прочитати статистику. Попередній файл збережено; нові дані поки лише в пам’яті.'; blocked=true; }
            }
        }
        loaded=true; trim();
        for (const [type,item] of pending.splice(0)) { if (type==='record') record(item); else audit(...item); }
    })();
    function snapshot() {
        trim(); const total=empty(), people=new Map(), localTotal=empty(), clients=new Map();
        for (const d of data.days) {
            add(total,d.total);
            add(localTotal,d.local.total);
            for (const c of d.local.clients) {
                if (!clients.has(c.ip)) clients.set(c.ip,{ip:c.ip,...empty(),lastSeen:0,lastKind:'',lastName:''});
                const row=clients.get(c.ip); add(row,c);
                if (c.lastSeen>=row.lastSeen) { row.lastSeen=c.lastSeen; row.lastKind=c.lastKind; row.lastName=c.lastName; }
            }
            for (const p of d.people) {
                const id=p.kind+':'+p.name;
                if (!people.has(id)) people.set(id,{kind:p.kind,name:p.name,...empty(),lastSeen:0,lastIp:''});
                const row=people.get(id); add(row,p);
                if (p.lastSeen>row.lastSeen) { row.lastSeen=p.lastSeen; row.lastIp=p.lastIp; }
            }
        }
        const days=[];
        for (let i=6;i>=0;i--) { const date=dayKey(now()-i*DAY),d=data.days.find(d=>d.date===date); days.push({date,...(d?d.total:empty())}); }
        const localClients=[...clients.values()].sort((a,b)=>b.lastSeen-a.lastSeen);
        const local={total:localTotal,clients:localClients,unattributedRequests:Math.max(0,localTotal.requests-localClients.reduce((sum,c)=>sum+c.requests,0))};
        return JSON.parse(JSON.stringify({since:data.since,retentionDays:RETENTION,total,local,days,people:[...people.values()],
            events:data.events.slice().reverse().map(e=>({...e,reason:reason(e)})),audit:data.audit.slice().reverse(),persistent:Boolean(file)&&!blocked,storageError}));
    }
    async function flush() {
        await ready;
        trim();
        if (writing) { await writing; if (dirty) return flush(); return; }
        if (!file || !dirty || blocked) return;
        const body=JSON.stringify(data)+'\n'; dirty=false;
        writing=(async()=>{
            const temp=path.join(path.dirname(file),'.metrics-'+crypto.randomBytes(12).toString('hex'));
            try {
                if (Buffer.byteLength(body)>MAX_FILE) throw Error('Metrics capacity reached');
                const handle=await fs.open(temp,'wx',0o600);
                try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
                await fs.rename(temp,file); storageError='';
            } catch (error) { dirty=true; storageError='Статистика тимчасово не записується на диск. Перевірте доступ до каталогу state.'; }
            finally { await fs.unlink(temp).catch(()=>{}); }
        })();
        await writing; writing=null;
    }
    const timer=file?setInterval(()=>{void flush();},flushMs):null; timer?.unref();
    async function close() { if (timer) clearInterval(timer); await flush(); }
    return {ready,record,audit,snapshot,flush,close};
}
module.exports={createMetrics};
