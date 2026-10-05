'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),{promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const MAX_USERS=128,MAX_BYTES=65536;
function username(value){return typeof value==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(value);}
function password(value){return typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=256&&!/[\x00-\x1f\x7f]/.test(value);}
function validate(data){
 if(!data||data.version!==1||typeof data.enabled!=='boolean'||!Array.isArray(data.users)||data.users.length>MAX_USERS)throw Error('Invalid account file');
 const seen=new Set();
 for(const u of data.users){
  if(!u||!username(u.username)||seen.has(u.username)||!/^[a-f0-9]{32}$/.test(u.salt)||!/^[a-f0-9]{64}$/.test(u.hash)||(u.disabled!==undefined&&typeof u.disabled!=='boolean'))throw Error('Invalid account file');
  seen.add(u.username);
 }
 if(!data.enabled&&data.users.length)throw Error('Invalid account file');
 return data;
}
async function readAccounts(file){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Invalid account file');
 const text=await fs.readFile(file,'utf8');if(Buffer.byteLength(text)>MAX_BYTES)throw Error('Invalid account file');
 return validate(JSON.parse(text));
}
async function digest(value,salt){return scrypt(value,salt,32,{N:16384,r:8,p:1,maxmem:33554432});}
async function record(name,value){
 if(!username(name)||!password(value))throw Error('Use a valid username and password (up to 256 bytes)');
 const salt=crypto.randomBytes(16).toString('hex');
 return {username:name,salt,hash:(await digest(value,salt)).toString('hex')};
}
function basic(header){
 if(typeof header!=='string'||header.length>1024||!/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header))return null;
 const encoded=header.slice(6),buf=Buffer.from(encoded,'base64');
 if(buf.toString('base64')!==encoded)return null;
 const value=buf.toString('utf8');if(!Buffer.from(value).equals(buf))return null;
 const index=value.indexOf(':'),name=value.slice(0,index),pass=value.slice(index+1);
 return index>0&&username(name)&&password(pass)?{username:name,password:pass}:null;
}
function createUserStore(file){
 if(typeof file!=='string'||!file)throw Error('Account file is required');
 return {
  file,
  read:()=>readAccounts(file),
  async verify(header,data){
   const credentials=basic(header);if(!credentials)return false;
   const user=data.users.find(u=>u.username===credentials.username);
   // Unknown names still perform the same derivation. No plaintext passwords
   // are stored, cached or logged, and account changes apply on the next request.
   const hash=await digest(credentials.password,user?user.salt:'00000000000000000000000000000000');
   return crypto.timingSafeEqual(hash,Buffer.from(user?user.hash:'0'.repeat(64),'hex'))&&!!user&&!user.disabled;
  }
 };
}
module.exports={username,password,validate,readAccounts,record,basic,createUserStore};
