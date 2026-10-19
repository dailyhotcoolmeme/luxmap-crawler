import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {schedulePlan} from '../crawler/common/schedule-plan.js';
import {executeBrandPool,runBrandChild} from '../crawler/common/brand-execution-pool.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw new Error('scheduled service required');
if(spawnSync(process.execPath,[path.join(root,'scripts/crawler-schedule-check.mjs')],{stdio:'ignore'}).status!==0)throw new Error('invalid schedule');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
const referenceSmoke=process.argv.includes('--reference-smoke');
if(referenceSmoke&&(process.argv.includes('--smoke')||process.argv.includes('--countries')))throw Error('conflicting sample scope');
let plan=schedulePlan(schedule,{smoke:process.argv.includes('--smoke')||referenceSmoke,respectAutomationHolds:process.env.GITHUB_ACTIONS==='true'||!process.argv.includes('--brands')});
if(referenceSmoke)plan=plan.filter(job=>job.country==='kr');
const brandSelection=process.argv.indexOf('--brands');
if(brandSelection>=0){const brands=String(process.argv[brandSelection+1]??'').split(',');if(!brands.length||brands.some(brand=>!schedule.jobs.some(job=>job.brand===brand)))throw Error('invalid targeted brands');plan=plan.filter(job=>brands.includes(job.brand));}
const selection=process.argv.indexOf('--countries');
if(selection>=0){
 const countries=String(process.argv[selection+1]??'').split(',');
 if(!countries.length||countries.some(country=>country==='kr'||!schedule.jobs.some(job=>job.country===country)))throw new Error('invalid targeted countries');
 plan=plan.filter(job=>job.phase==='refresh'&&countries.includes(job.country));
 if(process.argv.includes('--remaining'))plan=plan.map(job=>({...job,args:job.args.filter(arg=>arg!=='--refresh')}));
}
// The same registry and plan apply on GitHub and locally. The shared lease
// stays outside this runner in coordinated-crawler.mjs; no pool lease bypass.
const concurrencyIndex=process.argv.indexOf('--brand-concurrency');
const concurrency=concurrencyIndex<0?2:Number(process.argv[concurrencyIndex+1]);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3||process.argv.filter(arg=>arg==='--brand-concurrency').length>1)throw new Error('brand concurrency must be 1..3');
for(const job of plan){
 if(!/^scripts\/[a-z0-9-]+\.mjs$/.test(job.adapter)||!/^[a-z0-9-]+$/.test(job.brand)||!/^[a-z]{2}$/.test(job.country))throw new Error('invalid scheduled job');
}
const cancellation=new AbortController();
const evidence=plan.map(job=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
 return {brand:job.brand,country:cfg.country,parentModel:job.phase,variantCode:'TOTAL',price:null,currency:cfg.currency,status:'JOB_PENDING',officialUrl:cfg.entryUrl??cfg.listingUrls[0]};
});
const executionFile=path.join(root,'crawler/service/execution-summary.json');
const save=()=>{fs.mkdirSync(path.dirname(executionFile),{recursive:true});fs.writeFileSync(executionFile,JSON.stringify(evidence),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[executionFile],{stdio:'ignore'}).status)throw Error('EXECUTION_SUMMARY_GUARD');};
save();
const stop=()=>cancellation.abort();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,stop);
try{
 process.exitCode=await executeBrandPool(plan,async(job,{signal,abortAll})=>{
 const row=evidence[plan.indexOf(job)];row.status='JOB_RUNNING';save();
 const result=await runBrandChild(
  path.join(root,'scripts/with-supabase-env.sh'),
  [process.execPath,path.join(root,job.adapter),job.country,...job.args],
  {cwd:root,env:{...process.env,LUXURY_WEEKLY_MAINTENANCE:'enabled'},signal,abortAll}
 );
 row.status=result.status===0?'JOB_SUCCEEDED':Number.isInteger(result.status)?'JOB_EXIT_'+result.status:result.signal?'JOB_SIGNAL_STOP':'JOB_EXECUTOR_FAILED';save();return result;
 },{concurrency,signal:cancellation.signal});
 if(referenceSmoke&&brandSelection<0&&process.exitCode===0){const result=spawnSync(process.execPath,[path.join(root,'scripts/verify-reference-smoke.mjs')],{cwd:root,env:process.env,stdio:'ignore',timeout:180000});process.exitCode=result.signal||result.error?78:result.status??1;}
}finally{for(const row of evidence)if(row.status==='JOB_PENDING')row.status='JOB_NOT_EXECUTED';else if(row.status==='JOB_RUNNING')row.status='JOB_INTERRUPTED';save();for(const signal of ['SIGTERM','SIGINT'])process.removeListener(signal,stop);}
