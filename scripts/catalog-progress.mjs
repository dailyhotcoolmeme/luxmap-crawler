#!/usr/bin/env node
// Monitoring only: no official-site requests, collector/lease invocation, DB
// writes, service credentials, model calls or raw product output.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {catalogProgress,progressRows,progressMarkdown,collectorState,progressCountries} from '../crawler/common/catalog-progress.js';
const root=path.resolve(import.meta.dirname,'..'),dbOrigin='https://nxgnbrdxxmlhtcnymqsl.supabase.co',apiOrigin='https://api.github.com';
export async function boundedJson(url,options={},request=fetch){
 const u=new URL(url);if(![dbOrigin,apiOrigin].includes(u.origin)||u.username||u.password||u.hash)throw Error('PROGRESS_NETWORK_SCOPE');
 if(u.origin===dbOrigin&&(options.method&&options.method!=='GET'||u.pathname!=='/rest/v1/product_variants'))throw Error('PROGRESS_READ_ONLY_REQUIRED');
 let r;try{r=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('PROGRESS_REQUEST_FAILED');}
 if(!r.ok)throw Error('PROGRESS_HTTP_'+r.status);
 const reader=r.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1048576){await reader.cancel();throw Error('PROGRESS_RESPONSE_LIMIT');}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('PROGRESS_JSON_INVALID');}
}
export async function loadProgress(brand,startedAt,key,query=boundedJson,endedAt){
 if(!/^[a-z0-9-]+$/.test(brand)||!key)throw Error('PROGRESS_BRAND_SCOPE');
 const configs=Object.fromEntries(progressCountries.map(c=>[c,JSON.parse(fs.readFileSync(root+'/crawler/brands/'+brand+'/countries/'+c))]));
 const products=[];
 for(let offset=0;offset<10000;offset+=100){const q=new URLSearchParams({select:'normalized_code,name_ko,material_ko,color_ko,width_mm,height_mm,depth_mm,brands!inner(slug),market_products(country_code,currency_code,current_price,price_status,official_product_code,official_url,price_checked_at),product_media(is_primary,r2_object_key,source_checked_at)',active:'eq.true','brands.slug':'eq.'+brand,order:'id.asc',offset:String(offset),limit:'100'});
  const page=await query(dbOrigin+'/rest/v1/product_variants?'+q,{headers:{apikey:key,'Cache-Control':'no-cache'}});
  if(!Array.isArray(page)||page.length>100)throw Error('PROGRESS_PAGE_SCOPE');products.push(...page);if(page.length<100)break;if(offset===9900)throw Error('PROGRESS_PAGE_LIMIT');
 }
 const progress=catalogProgress(products,configs,{brand,startedAt,endedAt});
 const folder=root+'/crawler/progress/'+brand;fs.mkdirSync(folder,{recursive:true});const file=folder+'/summary.json';
 fs.writeFileSync(file,JSON.stringify(progressRows(progress,configs)),{mode:0o600});
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status!==0)throw Error('PROGRESS_SUMMARY_GUARD');
 return progress;
}
async function main(){
 if(process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('PROGRESS_PUBLIC_KEY_ONLY');
 const args=process.argv.slice(2),arg=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined,watch=args.includes('--watch'),runId=arg('--run-id'),brand=arg('--brands')??'louis-vuitton';
 const repo=process.env.GITHUB_REPOSITORY??'dailyhotcoolmeme/luxmap-crawler';
 if(repo!=='dailyhotcoolmeme/luxmap-crawler'||!/^\d+$/.test(runId??''))throw Error('PROGRESS_RUN_SCOPE');
 const key=process.env.EXPO_PUBLIC_SUPABASE_KEY,token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN;
 if(!token||!key)throw Error('PROGRESS_CREDENTIAL_REQUIRED');
 const allowed=new Set(JSON.parse(fs.readFileSync(root+'/crawler/schedule.json')).jobs.map(j=>j.brand));
 const brands=brand==='all'?[...allowed]:brand.split(',');if(!brands.length||brands.some(b=>!allowed.has(b)))throw Error('PROGRESS_BRAND_SCOPE');
 const gh=(route,method='GET',body)=>{if(!route.startsWith('/repos/'+repo+'/'))throw Error('PROGRESS_GITHUB_SCOPE');return boundedJson(apiOrigin+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});};
 const prefix='/repos/'+repo,run=await gh(prefix+'/actions/runs/'+runId);
 if(run.path!=='.github/workflows/crawler.yml'||!Number.isFinite(Date.parse(run.run_started_at))||!(/^[a-f0-9]{40}$/).test(run.head_sha))throw Error('PROGRESS_TARGET_WORKFLOW');
 const runUrl='https://github.com/'+repo+'/actions/runs/'+runId,name='카탈로그 진행 #'+runId+' · '+run.run_attempt,external='catalog-progress:'+runId+':'+run.run_attempt;
 const existing=await gh(prefix+'/commits/'+run.head_sha+'/check-runs?per_page=100&check_name='+encodeURIComponent(name));
 let check=existing.check_runs?.find(c=>c.external_id===external),lastMarkdown='진행 집계 준비 중';
 const output=summary=>({title:name,summary});
 if(!check||check.status==='completed')check=await gh(prefix+'/check-runs','POST',{name,head_sha:run.head_sha,external_id:external,status:'in_progress',started_at:new Date().toISOString(),details_url:runUrl,output:output(lastMarkdown)});
 fs.mkdirSync(root+'/.progress-report',{recursive:true});fs.writeFileSync(root+'/.progress-report/check.json',JSON.stringify({id:check.id,url:check.html_url,runId}),{mode:0o600});
 console.log('PROGRESS_CHECK '+check.html_url);
 let interrupted=false;const stop=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
 try{for(let poll=0;poll<355;poll++){
  const current=await gh(prefix+'/actions/runs/'+runId),jobs=await gh(prefix+'/actions/runs/'+runId+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
  if(current.run_attempt!==run.run_attempt)throw Error('PROGRESS_RUN_ATTEMPT_CHANGED');
  const state=collectorState(current,jobs.jobs??[]),items=[];for(const b of brands)items.push(await loadProgress(b,run.run_started_at,key,boundedJson,state.endedAt));
  lastMarkdown=progressMarkdown(items,state,runUrl);fs.writeFileSync(root+'/.progress-report/progress.md',lastMarkdown,{mode:0o600});
  const terminal=state.finished||interrupted||poll===354;
  await gh(prefix+'/check-runs/'+check.id,'PATCH',{status:terminal?'completed':'in_progress',...(terminal?{conclusion:state.finished?(state.status==='success'?'neutral':['cancelled','timed_out'].includes(state.status)?state.status:'failure'):'action_required',completed_at:new Date().toISOString()}:{}),output:output(lastMarkdown+(terminal&&!state.finished?'\n\n집계가 중단됐습니다. 위 시각 이후 수치를 최신으로 간주하지 마세요.':''))});
  if(process.env.GITHUB_STEP_SUMMARY)fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY,lastMarkdown);
  console.log('PROGRESS_UPDATED '+items.map(p=>p.brand+': '+p.countries.map(c=>c.country+' '+c.refreshed+'/'+c.total+' (누적 '+c.confirmed+')').join(' · ')).join(' | '));
  if(state.finished||!watch||interrupted||poll===354)break;
  for(let i=0;i<60&&!interrupted;i++)await new Promise(resolve=>setTimeout(resolve,1000));
 }}catch(error){const reason=/^[A-Z0-9_]{1,48}$/.test(error.message)?error.message:'PROGRESS_FAILED';
  await gh(prefix+'/check-runs/'+check.id,'PATCH',{status:'completed',conclusion:'failure',completed_at:new Date().toISOString(),output:output(lastMarkdown+'\n\n진행 집계 중단: '+reason+' (수집 실행은 취소하지 않았습니다.)')}).catch(()=>{});throw Error(reason);
 }finally{for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,stop);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^[A-Z0-9_]{1,48}$/.test(error.message)?error.message:'PROGRESS_FAILED');process.exitCode=1;});
