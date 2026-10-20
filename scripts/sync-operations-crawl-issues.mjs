import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {crawlEvent,eventHash,guardedSummaryRows} from '../crawler/common/operations-crawl-events.js';
const base=path.resolve(import.meta.dirname,'..');
export async function scanCrawlEvents(root,{since=0,seen=new Set()}={}){
 const configs=new Map();for(const brand of await fs.readdir(root+'/crawler/brands')){const folder=root+'/crawler/brands/'+brand+'/countries';for(const country of await fs.readdir(folder).catch(()=>[])){if(!/^[a-z]{2}$/.test(country))continue;const config=JSON.parse(await fs.readFile(folder+'/'+country,'utf8'));configs.set(brand+':'+config.country,config);}}
 const limits=JSON.parse(await fs.readFile(root+'/crawler/guardrails.json','utf8')).limits;const events=[];let guarded=0,skipped=0,visited=0;const folders=['runs','completeness','progress','bottega-progress','prada-progress','louis-vuitton-progress'].map(name=>root+'/crawler/'+name);
 async function walk(folder,depth=0){if(depth>12)throw Error('ISSUE_SCAN_DEPTH');for(const item of await fs.readdir(folder,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  if(++visited>500000)throw Error('ISSUE_SCAN_LIMIT');const file=path.join(folder,item.name);
  if(item.isDirectory()){if(!['raw','browser-profile','node_modules','images','originals'].includes(item.name))await walk(file,depth+1);continue;}
  if(!item.isFile()||!/^summary(?:-[a-z0-9-]+)?\.json$/.test(item.name))continue;
  const stat=await fs.stat(file);if(stat.mtimeMs<since||stat.size>32768)continue;const bytes=await fs.readFile(file).catch(()=>null);if(!bytes){skipped++;continue;}
  const sourceKey=path.relative(root,file)+':'+eventHash(bytes);if(seen.has(sourceKey))continue;
  let rows;try{rows=guardedSummaryRows(bytes,limits);}catch{skipped++;continue;}
  // The guard validates the current bytes; reject a concurrently replaced file.
  const current=await fs.readFile(file);if(!current.equals(bytes)){skipped++;continue;}guarded++;
  for(const row of rows){const event=crawlEvent(row,{observedAt:stat.mtime.toISOString(),sourceKey,configs});if(event)events.push(event);}seen.add(sourceKey);
 }}for(const folder of folders)await walk(folder);
 events.sort((a,b)=>a.observed_at.localeCompare(b.observed_at)||a.event_key.localeCompare(b.event_key));return {events,guarded,skipped};
}
export async function startIssueReporter({root=base,since=Date.now(),runKey,source='local',transport=fetch,intervalMs=60000}={}){
 if(!runKey||!['local','github','backfill'].includes(source))throw Error('ISSUE_REPORT_SCOPE');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('ISSUE_REPORT_CREDENTIAL');
 const folder=root+'/crawler/runtime/operations-events';await fs.mkdir(folder,{recursive:true});const file=folder+'/'+eventHash(runKey)+'.json';let pending=[],seen=new Set(),chain=Promise.resolve(),fault=false;
 const recovered=[];for(const name of await fs.readdir(folder)){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const old=folder+'/'+name,stat=await fs.lstat(old);if(!stat.isFile()||stat.size>20000000)throw Error('ISSUE_OUTBOX_SCOPE');const rows=JSON.parse(await fs.readFile(old,'utf8'));if(!Array.isArray(rows)||rows.length>100000)throw Error('ISSUE_OUTBOX_SCOPE');pending.push(...rows);if(old!==file&&rows.length)recovered.push(old);}
 const persist=async()=>{const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(pending),{mode:0o600});await fs.rename(tmp,file);};
 async function flush(finished=false){const scan=await scanCrawlEvents(root,{since,seen});const byKey=new Map(pending.map(e=>[e.event_key,e]));for(const event of scan.events)byKey.set(event.event_key,event);pending=[...byKey.values()];if(pending.length>100000)throw Error('ISSUE_OUTBOX_LIMIT');await persist();
  do{const batch=pending.slice(0,100);const response=await transport('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/rpc/operations_record_crawl_events',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_events:batch,p_run_key:runKey,p_source:source,p_finished:finished&&pending.length<=100}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('ISSUE_REPORT_UPLOAD_FAILED');pending.splice(0,batch.length);await persist();if(!batch.length)break;}while(pending.length);
  for(const old of recovered)await fs.writeFile(old,'[]',{mode:0o600});fault=false;return {guarded:scan.guarded,skipped:scan.skipped,pending:pending.length};
 }
 const queue=finished=>{const next=chain.then(()=>flush(finished));chain=next.catch(()=>{fault=true;});return next;};
 const timer=setInterval(()=>{void queue(false).catch(()=>{});},intervalMs);timer.unref();
 return {flush:()=>queue(false),stop:async()=>{clearInterval(timer);try{return await queue(true);}catch{await persist();return {pending:pending.length,failed:true};}},get failed(){return fault;}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv.includes('--backfill')||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('EXPLICIT_BACKFILL_REQUIRED');
 const github=process.env.GITHUB_ACTIONS==='true';const reporter=await startIssueReporter({since:0,runKey:github?`github:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT??1}`:'backfill:guarded-history-v1',source:github?'github':'backfill'});const result=await reporter.stop();
 const out=base+'/crawler/runtime/operations-events/summary.json';await fs.writeFile(out,JSON.stringify([{brand:'louis-vuitton',country:'KR',parentModel:'관리자 실패 기록 동기화',variantCode:'RUN',price:null,currency:'KRW',status:result.failed?'ISSUE_SYNC_UPLOAD_PENDING':'ISSUE_SYNC_COMPLETED',officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'},...['guarded','skipped','pending'].map(k=>({brand:'louis-vuitton',country:'KR',parentModel:'실패 기록 수치',variantCode:'RUN',price:null,currency:'KRW',status:(k+'_'+(result[k]??0)).toUpperCase(),officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}))]));
 if(spawnSync(base+'/scripts/crawl-output-guard.sh',[out],{stdio:'ignore'}).status)throw Error('ISSUE_SUMMARY_GUARD');console.log(result.failed?'ISSUE_SYNC_UPLOAD_PENDING':'ISSUE_SYNC_COMPLETED');process.exitCode=result.failed?1:0;
}
