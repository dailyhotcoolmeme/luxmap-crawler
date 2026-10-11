import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const queueFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../crawler/service/alert-queue.json');
export async function reportCrawlFailure(summary,{queuePath=queueFile,fetcher=fetch}={}){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error('server credential required');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 const dedupe_key='crawl_failure:'+createHash('sha256').update(`${day}:${summary.brand}:${summary.country}:${summary.status}:${summary.variantCode}`).digest('hex');
 const entry={dedupe_key,kind:'crawl_failure',summary};
 const queued=fs.existsSync(queuePath)?JSON.parse(fs.readFileSync(queuePath)):[];
 if(!queued.some(row=>row.dedupe_key===dedupe_key))queued.push(entry);
 if(queued.length>500||Buffer.byteLength(JSON.stringify(queued))>1048576)throw new Error('administrator alert queue limit');
 let status='ALERT_TRANSPORT_FAILED';
 try{
  const response=await fetcher('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/operations_alerts?on_conflict=dedupe_key',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(queued),signal:AbortSignal.timeout(15000)});
  if(response.ok){fs.mkdirSync(path.dirname(queuePath),{recursive:true});fs.writeFileSync(queuePath,'[]',{mode:0o600});return {stored:true};}
  status=`ALERT_HTTP_${response.status}`;
 }catch{}
 // Alert delivery must never discard the rest of a country's products.
 fs.mkdirSync(path.dirname(queuePath),{recursive:true});
 fs.writeFileSync(queuePath,JSON.stringify(queued),{mode:0o600});
 return {stored:false,status};
}
export async function flushCrawlAlerts(){
 const queued=fs.existsSync(queueFile)?JSON.parse(fs.readFileSync(queueFile)):[];
 if(!queued.length)return {stored:true};
 return reportCrawlFailure(queued[0].summary);
}
