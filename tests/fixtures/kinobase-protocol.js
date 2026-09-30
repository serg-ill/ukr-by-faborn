// Small original fixture for the publicly observable response format, not site code.
const standard='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base91Alphabet=Array.from({length:91},(_,i)=>String.fromCharCode(i+33)).join('');
function base91(input){let bits=0,count=0,out='';for(const n of Buffer.from(input)){bits|=n<<count;count+=8;if(count>13){let value=bits&8191;if(value>88){bits>>>=13;count-=13;}else{value=bits&16383;bits>>>=14;count-=14;}out+=base91Alphabet[value%91]+base91Alphabet[Math.floor(value/91)];}}if(count){out+=base91Alphabet[bits%91];if(count>7||bits>90)out+=base91Alphabet[Math.floor(bits/91)];}return out;}
function fixture(seed=1){
 const rotation=seed%64,alphabet=standard.slice(rotation)+standard.slice(0,rotation);
 const config={userKey:'userParameter'+seed,userValue:'userPublicValue'+seed,checkVar:'_PageCheck'+seed,vodKey:'vodParameter'+seed,vodValue:'vodPublicValue'+seed,alphabet,separator:'BoundaryForFixture'+seed,check:[71+seed,13+seed,1009+seed],xor:seed%32,userOffset:210+seed,vodOffset:250+seed};
 const words=['/user_data',config.userKey,config.userValue,'chk',config.checkVar,'n','/vod/',config.vodKey,config.vodValue,'identifier',standard,alphabet,'split',config.separator];
 while(words.length<130)words.push('unused'+words.length);
 const source=`var alphabet91=${JSON.stringify(base91Alphabet)},words=${JSON.stringify(words.map(base91))};
 function values(){return [100,${110+seed},${250+seed}];}var constants=values();
 function at(n){return constants[n];}
 function responseHandler(response){function values(n){return constants[999];}return response['slice'](at(0));}
 response['slice'](at(1)); response['slice'](at(2));
 var check=((window.${config.checkVar}||0)*${config.check[0]}+${config.check[1]})%${config.check[2]};
 function remap(i){return (i^${config.xor})%64;}
 if(window.mustNeverExecute){throw new Error('Untrusted code executed');}`;
 function encode(parts,user){let s=Buffer.from(parts.join(config.separator)).toString('base64');if(user)s=s.replace(/[A-Za-z0-9+/]/g,c=>alphabet[standard.indexOf(c)^config.xor]);return 'x'.repeat(user?config.userOffset:config.vodOffset)+s;}
 return {source,config,encode};
}
module.exports=fixture;
