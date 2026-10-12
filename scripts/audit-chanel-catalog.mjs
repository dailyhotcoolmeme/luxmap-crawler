import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {completenessReport} from '../crawler/common/catalog-completeness.js';
import {reportAuditFailure} from '../crawler/common/catalog-audit-alert.js';
const root=path.resolve(import.meta.dirname,'..'),state=path.join(root,'crawler/completeness/chanel');fs.mkdirSync(state,{recursive:true});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('server credential required');
function run(script,args=[]){const r=spawnSync(path.join(root,script),args,{cwd:root,env:{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_USE_ASIDE:'0'},stdio:'ignore',timeout:2*60*60000});if(r.status!==0)throw Object.assign(Error('guarded audit stopped'),{exitCode:r.status===78?78:1});}
const listing='https://www.chanel.com/kr/fashion/handbags/c/1x1x1/';
function summary(status){const file=path.join(state,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'chanel',country:'KR',parentModel:'한국 공식 목록 누락 대조',variantCode:'AUDIT',price:null,currency:'KRW',status,officialUrl:listing}]));run('scripts/crawl-output-guard.sh',[file]);}
try{
 run('scripts/crawl-preflight.sh');summary('DISCOVERING_OFFICIAL_LISTING');
 run('scripts/run-brand-country-pipeline.sh',['chanel','kr','--crawl-only','--audit-variants']);
 const folder=path.join(root,'crawler/runs/chanel/kr'),dir=path.join(folder,fs.readdirSync(folder).sort().at(-1));run('scripts/crawl-output-guard.sh',[path.join(dir,'summary.json')]);
 const urls=JSON.parse(fs.readFileSync(path.join(dir,'artifacts/discovered-urls.json'))),codes=urls.map(url=>new URL(url).pathname.match(/\/fashion\/p\/([^/]+)/)?.[1]?.replace(/[^a-z0-9]/gi,'').toUpperCase());
 if(!codes.length||codes.some(code=>!code))throw Error('invalid discovered codes');
 const stored=new Set();for(let offset=0;;offset+=500){const page=await guardedRest(`rpc/crawler_korean_references?limit=500&offset=${offset}`,'POST',{p_brand:'chanel'},key);for(const row of page)stored.add(row.normalized_code);if(page.length<500)break;}
 const report=completenessReport({discovered:codes,stored,decisions:new Map(codes.map(code=>[code,'bag'])),discoveryVerified:true});
 fs.writeFileSync(path.join(state,'missing-urls.json'),JSON.stringify(urls.filter((url,i)=>report.missing.includes(codes[i]))),{mode:0o600});
 summary(report.complete?`LISTED_${codes.length}_MISSING_0`:`INCOMPLETE_MISSING_${report.missing.length}`);if(!report.complete)process.exitCode=1;
}catch(error){summary(error.exitCode===78?'SAFETY_POLICY_BLOCKED':'AUDIT_FAILED');process.exitCode=error.exitCode??1;}
if(process.exitCode){const file=path.join(state,'summary.json');run('scripts/crawl-output-guard.sh',[file]);await reportAuditFailure(JSON.parse(fs.readFileSync(file))[0],{queuePath:path.join(state,'alert-queue.json'),safetyBlocked:process.exitCode===78});}
