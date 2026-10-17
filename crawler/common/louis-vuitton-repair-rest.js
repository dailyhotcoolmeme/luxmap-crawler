import {guardedRest} from './guarded-rest.js';
// Reuse per-request fixed-host isolation without an extra outer proxy.
export function createLouisVuittonRepairClient(options,execute=guardedRest){
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
