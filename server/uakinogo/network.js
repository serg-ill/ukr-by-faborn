'use strict';
const {BlockList,isIPv4}=require('node:net');

function lanPolicy(value='') {
    if (!value) return () => false;
    const match=/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(value);
    if (!match || !isIPv4(match[1])) throw Error('LAN policy requires a private IPv4 network in CIDR notation');
    const octets=match[1].split('.').map(Number), prefix=Number(match[2]);
    const min=octets[0]===10 ? 8 : octets[0]===172 && octets[1]>=16 && octets[1]<=31 ? 12 : octets[0]===192 && octets[1]===168 ? 16 : 33;
    const numeric=octets.reduce((sum,n)=>sum*256+n,0);
    if (prefix<min || prefix>32 || numeric%Math.pow(2,32-prefix)) throw Error('LAN policy must be an aligned private IPv4 network');
    const list=new BlockList(); list.addSubnet(match[1],prefix,'ipv4');
    return address => { address=String(address||'').replace(/^::ffff:/i,''); return isIPv4(address) && list.check(address,'ipv4'); };
}
function loopback(address) {
    return ['127.0.0.1','::1'].includes(String(address||'').replace(/^::ffff:/i,''));
}
module.exports={lanPolicy,loopback};
