#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readAccounts,record,username}=require('./auth');
const DEFAULT_FILE='/opt/faborn-resolver/auth/users.json';
async function change(file,operation){
 const dir=path.dirname(file),lock=await fs.open(file+'.lock','wx',0o600);
 let temp='';
 try{
  let data;
  try{data=await readAccounts(file);}catch(e){if(e.code!=='ENOENT')throw e;data={version:1,enabled:false,users:[]};}
  const output=await operation(data),owner=await fs.stat(dir);
  temp=path.join(dir,'.users-'+crypto.randomBytes(12).toString('hex'));
  const handle=await fs.open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  if(process.getuid&&process.getuid()===0)await fs.chown(temp,owner.uid,owner.gid);
  await fs.rename(temp,file);temp='';return output;
 }finally{
  if(temp)await fs.unlink(temp).catch(()=>{});
  await lock.close();await fs.unlink(file+'.lock');
 }
}
function generated(){return crypto.randomBytes(18).toString('base64url');}
async function stdinPassword(){
 const chunks=[];let bytes=0;
 for await(const c of process.stdin){bytes+=c.length;if(bytes>258)throw Error('Password is too long');chunks.push(c);}
 return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
}
async function main(args){
 let file=process.env.FABORN_USERS_FILE||DEFAULT_FILE;
 const i=args.indexOf('--file');
 if(i>=0){if(!args[i+1])throw Error('--file requires a path');file=path.resolve(args[i+1]);args=args.slice(0,i).concat(args.slice(i+2));}
 const [command,name,...flags]=args;
 if(!command||command==='--help'){
  console.log('Faborn accounts: test-users | list | add USER --generate | reset USER --generate | add/reset USER --password-stdin | delete USER\nOptional: --file PATH. Default: '+DEFAULT_FILE);return;
 }
 if(command==='list'){
  if(name)throw Error('Unexpected argument');
  const d=await readAccounts(file);console.log('Authentication: '+(d.enabled?'basic':'none'));
  d.users.forEach(u=>console.log(u.username));return;
 }
 if(command==='test-users'){
  if(name)throw Error('Unexpected argument');
  const out=await change(file,async d=>{
   const lines=[];
   for(const id of ['test1','test2']){
    if(d.users.some(u=>u.username===id)){lines.push(id+': already exists; password unchanged');continue;}
    if(d.users.length>=128)throw Error('Account limit reached');
    const pass=generated();d.users.push(await record(id,pass));lines.push(id+':'+pass);
   }
   d.enabled=true;return lines;
  });
  console.log('Credentials (shown only when created; save privately):');out.forEach(v=>console.log(v));return;
 }
 if(!['add','reset','delete'].includes(command)||!username(name))throw Error('Use --help for valid commands');
 if(command==='delete'){
  if(flags.length)throw Error('Unexpected argument');
  await change(file,async d=>{const i=d.users.findIndex(u=>u.username===name);if(i<0)throw Error('User does not exist');d.users.splice(i,1);d.enabled=true;});
  console.log('Removed '+name+'. Authentication stays enabled, including when no users remain.');return;
 }
 if(flags.length!==1||!['--generate','--password-stdin'].includes(flags[0]))throw Error('Use --generate or --password-stdin; do not put passwords in command arguments');
 const pass=flags[0]==='--generate'?generated():await stdinPassword();
 await change(file,async d=>{
  const i=d.users.findIndex(u=>u.username===name);
  if(command==='add'&&i>=0)throw Error('User exists; use reset to change the password');
  if(command==='reset'&&i<0)throw Error('User does not exist');
  if(i<0&&d.users.length>=128)throw Error('Account limit reached');
  const u=await record(name,pass);if(i<0)d.users.push(u);else d.users[i]=u;d.enabled=true;
 });
 console.log(flags[0]==='--generate'?name+':'+pass:'Saved '+name);
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error('Accounts: '+(['EEXIST','ENOENT','EACCES'].includes(e.code)?e.code:String(e.message||'operation failed').slice(0,180)));process.exitCode=1;});
module.exports={main,change,DEFAULT_FILE};
