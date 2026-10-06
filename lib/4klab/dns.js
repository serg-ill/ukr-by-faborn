/* Optional DNS-over-HTTPS for Alloha's native HTTPS transport only. */
(function (root,factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.FabornAllohaDNS = factory;
}(typeof self !== 'undefined' ? self : this,function (Native,Core,report,now) {
    'use strict';
    var cache = {}, order = [];
    now = now || Date.now;
    function hostname(value) {
        value = typeof value === 'string' ? value.toLowerCase().replace(/\.$/,'') : '';
        if (!value || value.length > 253 || !value.split('.').every(function (label) { return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label); })) return '';
        return value;
    }
    function publicIPv4(value) {
        if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return false;
        var p = value.split('.').map(Number);
        if (p.some(function (n) { return n > 255; })) return false;
        return p[0] > 0 && p[0] !== 10 && p[0] !== 127 && p[0] < 224 &&
            !(p[0] === 100 && p[1] >= 64 && p[1] <= 127) && !(p[0] === 169 && p[1] === 254) &&
            !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) && !(p[0] === 192 && (p[1] === 168 || p[1] === 0 && (p[2] === 0 || p[2] === 2))) &&
            !(p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51 && p[2] === 100)) && !(p[0] === 203 && p[1] === 0 && p[2] === 113);
    }
    function parse(text,host) {
        var data;
        try { data = JSON.parse(text); } catch (ignore) { throw new Error('DNS: некоректна відповідь Cloudflare'); }
        if (!data || data.Status !== 0 || data.TC || !Array.isArray(data.Question) || data.Question.length !== 1 || !data.Question[0] ||
            hostname(data.Question[0].name) !== host || data.Question[0].type !== 1 || !Array.isArray(data.Answer) || data.Answer.length > 64) throw new Error('DNS: Cloudflare не повернув адресу');
        var names = [host], ttl = 300, addresses = [];
        for (var depth = 0; depth < 8; depth++) {
            var link = data.Answer.filter(function (row) { return row && row.type === 5 && hostname(row.name) === names[names.length-1]; })[0];
            if (!link) break;
            var alias = hostname(link.data);
            if (!alias || names.indexOf(alias) >= 0 || typeof link.TTL !== 'number' || !isFinite(link.TTL) || link.TTL < 0) throw new Error('DNS: некоректний запис адреси');
            ttl = Math.min(ttl,link.TTL); names.push(alias);
        }
        data.Answer.forEach(function (row) {
            if (!row || row.type !== 1 || names.indexOf(hostname(row.name)) < 0) return;
            if (!publicIPv4(row.data) || typeof row.TTL !== 'number' || !isFinite(row.TTL) || row.TTL < 0) throw new Error('DNS: непідтримувана адреса');
            ttl = Math.min(ttl,row.TTL);
            if (addresses.length < 4 && addresses.indexOf(row.data) < 0) addresses.push(row.data);
        });
        if (!addresses.length) throw new Error('DNS: немає публічної IPv4-адреси');
        return {addresses:addresses.join(','),count:addresses.length,expires:now()+Math.floor(ttl)*1000};
    }
    return function apply(url) {
        if (!Core.allowed(url,false)) throw new Error('DNS: непідтримуваний сервер');
        var host = hostname(new URL(url).hostname), entry = cache[host];
        if (!host) throw new Error('DNS: некоректне ім’я сервера');
        if (!entry || entry.expires <= now()) {
            report({state:'query',host:host});
            try {
                var code = Native.ccall('lab_dns_query','number',['string'],[host]);
                if (code !== 200) throw new Error(code === -28 ? 'DNS: Cloudflare не відповів за 4 с' : 'DNS: Cloudflare '+(code > 0 ? 'HTTP '+code : 'мережева помилка '+code));
                if (Native._lab_size() > 32768) throw new Error('DNS: завелика відповідь');
                entry = parse(Native.UTF8ToString(Native._lab_body()),host);
                if (!cache[host]) order.push(host);
                cache[host] = entry;
                while (order.length > 32) delete cache[order.shift()];
                report({state:'resolved',host:host,count:entry.count});
            } catch (error) {
                delete cache[host]; order = order.filter(function (name) { return name !== host; });
                report({state:'error',host:host});
                throw error;
            }
        }
        if (!Native.ccall('lab_set_resolve','number',['string','string'],[host,entry.addresses])) throw new Error('DNS: не вдалося застосувати адресу');
    };
}));
