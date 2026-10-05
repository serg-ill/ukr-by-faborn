'use strict';
// Real release WASM/cURL, with controlled Tizen host calls and a virtual clock.
// This verifies socket creation and timeout behavior, not physical TV playback.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=process.env.FABORN_NATIVE_TEST_ROOT || path.resolve(__dirname,'..');

async function transport(mode, enabled=true) {
 let api,clock=0,next=100;const debug=message=>{if(process.env.FABORN_SOCKET_DEBUG)console.error(message);};debug('fixture start');const sockets=new Map(),calls=[],closed=[];
 const bindings={
  create(family,type,protocol){debug('create '+family+' '+type);const fd=next++;sockets.set(fd,{family,type,protocol});return fd;},
  close(fd){closed.push(fd);sockets.delete(fd);return 0;},
  connect(fd){
   debug('connect');const socket=sockets.get(fd);calls.push({...socket});
   if(!(socket.type&2048)){clock+=31000;return -73;}
   return mode==='refused' ? -14 : -26; // WASI CONNREFUSED / INPROGRESS
  },
  poll(_fds,_count,timeout){clock+=Math.max(1,timeout);if(clock>100000)throw new Error('fixture clock budget');return 0;},
  setSockOpt(){return 0;},
  getSockOpt(_fd,_level,_option,value,length){api.HEAP32[value>>2]=0;api.HEAP32[length>>2]=4;return 0;}
 };
 for(const name of ['accept','bind','getPeerName','getSockName','listen','recv','recvFrom','recvMsg','select','send','sendMsg','sendTo','shutdown'])
  if(!bindings[name])bindings[name]=()=>-6;
 function HostResolverSync(){}
 HostResolverSync.prototype.getAddrInfo2=function(){debug('DNS');
  const bytes=new Uint8Array(16);bytes.set([2,0,1,187,192,0,2,1]);
  return [{flags:0,family:'af_inet',sockType:'sock_stream',protocol:'ipproto_tcp',addr:{bytes},canonName:new Uint8Array()}];
 };
 class VirtualDate extends Date {static now(){return Date.now()+clock;}}
 const context={WebAssembly,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,
  Date:VirtualDate,performance:{now:()=>performance.now()+clock},location:{href:'https://qa.invalid/native.js'},importScripts(){},
  tizentvwasm:{SocketsHostBindings:bindings,SocketsManager:{},HostResolverSync,AddressInfo:function(){}}
 };
 context.self=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'lib/4klab/native.js'),'utf8'),context);
 await new Promise((resolve,reject)=>{
  context.FabornNative({wasmBinary:fs.readFileSync(path.join(ROOT,'lib/4klab/native.wasm')),
   noInitialRun:true,print(){},printErr(){},onAbort:reject}).then(instance=>{api=instance;resolve();});
 });
 debug('WASM ready');api._set_host_bindings_impl();
 api.FS.writeFile('/cacert.pem',fs.readFileSync(path.join(ROOT,'lib/4klab/cacert.pem')));
 debug('before curl init');assert.equal(api._lab_init(),1);debug('before request');
 if(enabled && api._lab_set_nonblocking)api._lab_set_nonblocking(1);
 const code=api.ccall('lab_get_media','number',['string','string','string','string','string','number'],
  ['https://qa.invalid/master.m3u8','https://qa.invalid','https://qa.invalid/embed','','controlled_token_123456789',1024]);
 debug('request returned');const error=api.UTF8ToString(api._lab_error());api._lab_stop();
 return {code,error,clock,calls,closed,remaining:sockets.size};
}

test('compiled Alloha transport times out a silent TCP connection without a blocking socket',async()=>{
 const result=await transport('silent');
 assert.ok(result.calls.length>0,'The release WASM must reach the Tizen socket API');
 assert.ok(result.calls.every(call=>(call.type&2048)!==0),'Every outbound connection needs SOCK_NONBLOCK at creation');
 assert.equal(result.code,-28);assert.match(result.error,/timed out|Timeout/i);
 assert.ok(result.clock>=7500 && result.clock<9000,JSON.stringify(result));
 assert.equal(result.remaining,0);
});

test('compiled shared transport keeps its existing socket strategy without the Alloha opt-in',async()=>{
 const result=await transport('silent',false);
 assert.ok(result.calls.length>0);
 assert.ok(result.calls.every(call=>(call.type&2048)===0));
 assert.equal(result.remaining,0);
});

test('compiled Alloha transport reports a refused TCP connection and releases sockets',async()=>{
 const result=await transport('refused');
 assert.equal(result.code,-7);assert.ok(result.clock<8000);
 assert.ok(result.calls.every(call=>(call.type&2048)!==0));assert.equal(result.remaining,0);
});
