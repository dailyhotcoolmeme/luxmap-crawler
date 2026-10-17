import {execFileSync} from 'node:child_process';
const isolation=new URL('../../scripts/network-isolate.mjs',import.meta.url).pathname;
export function isolatedLouisVuittonRest(route,method,body,key,execute=execFileSync){
 const args=[isolation,'["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0','/usr/bin/curl','--silent','--show-error','--max-time','15','--request',method,'--header','@-','--write-out','\n%{http_code}'];
 if(body!==undefined)args.push('--data',JSON.stringify(body));args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+route);
 let text;const deadline=Date.now()+20000;
 for(let attempt=0;attempt<3;attempt++)try{text=execute(process.execPath,args,{encoding:'utf8',input:'apikey: '+key+'\nAuthorization: Bearer '+key+'\nContent-Type: application/json\nPrefer: return=representation\nCache-Control: no-cache\n',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:['pipe','pipe','pipe'],maxBuffer:1048576,timeout:Math.max(1,deadline-Date.now())});break;}catch(e){const n=Number.isInteger(e.status)?e.status:0,denied=/Operation not permitted|Permission denied|unauthorized network|LOG_LIMIT/i.test(String(e.stderr??''));
  // curl 7 means TCP connection was not established: no HTTP write was sent.
  // Never replay a timeout/reset (write outcome unknown), HTTP response, or
  // sandbox denial. All attempts share the previous 20-second deadline.
  if(n===7&&!denied&&attempt<2&&Date.now()<deadline)continue;
  throw Object.assign(Error(denied?'REPAIR_NETWORK_PERMISSION_FAILED':'REPAIR_NETWORK_EXIT_'+n+'_FAILED'),{exitCode:n===78||denied?78:1});}
 const at=text.lastIndexOf('\n'),status=Number(text.slice(at+1)),payload=text.slice(0,at);let value;try{value=payload?JSON.parse(payload):null;}catch{throw Error('REPAIR_RESPONSE_JSON_FAILED');}
 if(!(status>=200&&status<300)){const code=/^[A-Z0-9]{5,10}$/.test(value?.code??'')?value.code:'UNKNOWN';throw Error('REPAIR_HTTP_'+status+'_'+code+'_FAILED');}return value;
}
// Reuse per-request fixed-host isolation without an extra outer proxy.
export function createLouisVuittonRepairClient(options,execute=isolatedLouisVuittonRest){
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
