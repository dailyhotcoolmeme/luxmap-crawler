import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const isolation=fileURLToPath(new URL('../../scripts/network-isolate.mjs',import.meta.url));
const origin='https://nxgnbrdxxmlhtcnymqsl.supabase.co';
export function guardedRest(endpoint,method='GET',body,key=process.env.SUPABASE_SERVICE_ROLE_KEY){
  if(!key)throw new Error('database credential unavailable');
  const url=new URL(`${origin}/rest/v1/${endpoint}`);
  if(url.origin!==origin||!url.pathname.startsWith('/rest/v1/'))throw new Error('unapproved database destination');
  const args=[isolation,JSON.stringify([new URL(origin).hostname]),'0','/usr/bin/curl','--fail','--silent','--show-error','--max-time','15','--request',method,'--header','@-'];
  if(body!==undefined)args.push('--data',JSON.stringify(body));args.push(url.href);
  const output=execFileSync(process.execPath,args,{encoding:'utf8',input:`apikey: ${key}\nAuthorization: Bearer ${key}\nContent-Type: application/json\nPrefer: return=representation\nCache-Control: no-cache\n`,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:['pipe','pipe','pipe'],maxBuffer:1048576,timeout:20000});
  return JSON.parse(output);
}
