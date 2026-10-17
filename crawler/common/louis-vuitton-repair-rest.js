import {execFileSync} from 'node:child_process';
// Reuse the established curl transport inside the caller's fixed-host sandbox.
// Credentials enter curl through stdin only; no retries or new destinations.
export function createLouisVuittonRepairClient(options,execute=execFileSync){
 const proxy=options.proxy?.server;
 if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(proxy??''))throw Error('REPAIR_PROXY_REQUIRED');
 const send=async(method,value,settings={})=>{
  const url=new URL(value);if(url.origin!=='https://nxgnbrdxxmlhtcnymqsl.supabase.co'||!url.pathname.startsWith('/rest/v1/')||url.username||url.password)throw Error('REPAIR_DESTINATION');
  const headers={...options.extraHTTPHeaders,...settings.headers,'Content-Type':'application/json'};
  if(Object.entries(headers).some(([k,v])=>!/^[-A-Za-z0-9]+$/.test(k)||typeof v!=='string'||/[\r\n]/.test(v)))throw Error('REPAIR_HEADER_INVALID');
  const args=['--proxy',proxy,'--noproxy','','--silent','--show-error','--max-time','30','--max-redirs','0','--request',method,'--header','@-','--write-out','\n%{http_code}'];
  if(settings.data!==undefined)args.push('--data',JSON.stringify(settings.data));args.push(url.href);
  let output;try{output=execute('/usr/bin/curl',args,{encoding:'utf8',input:Object.entries(headers).map(([k,v])=>k+': '+v+'\n').join(''),stdio:['pipe','pipe','pipe'],maxBuffer:1048576,timeout:35000});}catch(e){throw Error('REPAIR_CURL_'+(Number.isInteger(e.status)?e.status:'IO')+'_FAILED');}
  const at=output.lastIndexOf('\n'),status=Number(output.slice(at+1)),body=output.slice(0,at);
  if(!Number.isInteger(status)||status<100||status>599)throw Error('REPAIR_HTTP_STATUS_FAILED');
  return {ok:()=>status>=200&&status<300,json:async()=>JSON.parse(body)};
 };
 return {get:(u,s)=>send('GET',u,s),patch:(u,s)=>send('PATCH',u,s),post:(u,s)=>send('POST',u,s),dispose:async()=>{}};
}
export const request={newContext:async options=>createLouisVuittonRepairClient(options)};
