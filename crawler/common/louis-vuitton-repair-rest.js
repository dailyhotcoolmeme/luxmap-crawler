import {execFileSync} from 'node:child_process';
const isolation=new URL('../../scripts/network-isolate.mjs',import.meta.url).pathname;
function isolatedRest(route,method,body,key){
 const args=[isolation,'["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0','/usr/bin/curl','--silent','--show-error','--max-time','15','--request',method,'--header','@-','--write-out','\n%{http_code}'];
 if(body!==undefined)args.push('--data',JSON.stringify(body));args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+route);
 let text;try{text=execFileSync(process.execPath,args,{encoding:'utf8',input:'apikey: '+key+'\nAuthorization: Bearer '+key+'\nContent-Type: application/json\nPrefer: return=representation\nCache-Control: no-cache\n',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:['pipe','pipe','pipe'],maxBuffer:1048576,timeout:20000});}catch(e){const n=Number.isInteger(e.status)?e.status:0;throw Object.assign(Error('REPAIR_NETWORK_EXIT_'+n+'_FAILED'),{exitCode:n===78?78:1});}
 const at=text.lastIndexOf('\n'),status=Number(text.slice(at+1)),payload=text.slice(0,at);let value;try{value=payload?JSON.parse(payload):null;}catch{throw Error('REPAIR_RESPONSE_JSON_FAILED');}
 if(!(status>=200&&status<300)){const code=/^[A-Z0-9]{5,10}$/.test(value?.code??'')?value.code:'UNKNOWN';throw Error('REPAIR_HTTP_'+status+'_'+code+'_FAILED');}return value;
}
// Reuse per-request fixed-host isolation without an extra outer proxy.
export function createLouisVuittonRepairClient(options,execute=isolatedRest){
 if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER)throw Error('REPAIR_COORDINATOR_REQUIRED');
 const send=async(method,value,settings={})=>{
  const url=new URL(value);if(url.origin!=='https://nxgnbrdxxmlhtcnymqsl.supabase.co'||!url.pathname.startsWith('/rest/v1/')||url.username||url.password)throw Error('REPAIR_DESTINATION');
  const headers={...options.extraHTTPHeaders,...settings.headers};
  if(typeof headers.apikey!=='string'||!headers.apikey||/[\r\n]/.test(headers.apikey))throw Error('REPAIR_HEADER_INVALID');
  const body=execute(url.pathname.slice('/rest/v1/'.length)+url.search,method,settings.data,headers.apikey);
  return {ok:()=>true,json:async()=>body};
 };
 return {get:(u,s)=>send('GET',u,s),patch:(u,s)=>send('PATCH',u,s),post:(u,s)=>send('POST',u,s),dispose:async()=>{}};
}
export const request={newContext:async options=>createLouisVuittonRepairClient(options)};
