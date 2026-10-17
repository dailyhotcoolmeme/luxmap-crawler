import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),country=process.argv[2],args=process.argv.slice(3),catalog=root+'/crawler/completeness/louis-vuitton';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER||!['kr','jp','fr','it','es','us','sg','hk'].includes(country)||args.some(a=>!['--discover-reference','--refresh','--limit','1'].includes(a)))throw Error('WEEKLY_LV_SCOPE');
const run=(file,a=[])=>{const r=spawnSync(file,a,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],maxBuffer:1048576,timeout:a.some(v=>String(v).endsWith('/louis-vuitton-market.mjs'))?7200000:1800000});if(r.status){const code=/Error: ([A-Z][A-Z0-9_]{1,35})\b/.exec(String(r.stderr??''))?.[1];if(code)rows.push(row(code));}return r.error||r.signal?78:r.status??1;};
const node=(file,a=[])=>run(process.execPath,[root+'/scripts/'+file,...a]);
const guard=f=>{if(run(root+'/scripts/crawl-output-guard.sh',[f]))throw Error('WEEKLY_SUMMARY_GUARD');return JSON.parse(fs.readFileSync(f));};
const row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'주간 한국 발견 및 등록 상품 갱신',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'});
const seed=()=>{if(node('seed-louis-vuitton-registered.mjs'))throw Error('REGISTERED_SEED_FAILED');};
if(country!=='kr'){const status=node('louis-vuitton-market.mjs',[country,'--api-sku',...args]);if(status===78)process.exit(78);const verified=node('verify-louis-vuitton-markets.mjs');process.exit(verified===0?status:verified);}
let code=2;const rows=[];
try{
 seed();
 if(args.includes('--discover-reference')){
  const base=root+'/crawler/runs/louis-vuitton/kr';fs.mkdirSync(base,{recursive:true});const before=new Set(fs.readdirSync(base));
  const status=run(root+'/scripts/run-brand-country-pipeline.sh',['louis-vuitton','kr','--crawl-only','--probe-sitemap-source']);
  const ids=fs.readdirSync(base).filter(n=>!before.has(n));if(ids.length!==1)throw Error('DISCOVERY_RUN_REQUIRED');const proof=guard(base+'/'+ids[0]+'/summary.json');
  if(status===78)throw Error('DISCOVERY_SAFETY_STOP');
  if(status!==0||!proof.some(r=>r.status==='DISCOVERY_ONLY_NOT_INGESTED')){rows.push(row('DISCOVERY_INCOMPLETE'));}
  else {
   if(node('prepare-louis-vuitton-sources.mjs'))throw Error('OFFLINE_PREPARATION_FAILED');
   const dir=catalog+'/catalog-source';fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(catalog+'/expanded-catalog-source/candidates.json',dir+'/candidates.json');fs.copyFileSync(catalog+'/expanded-catalog-source/summary.json',dir+'/summary.json');
   const p=catalog+'/public-reference';fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/summary.json',JSON.stringify([row('DISCOVERY_AUDIT_REQUIRED')]),{mode:0o600});
   const runtime=root+'/crawler/runtime/louis-vuitton-browser';fs.mkdirSync(runtime,{recursive:true});fs.writeFileSync(runtime+'/workflow.json',JSON.stringify({version:1,ingestHeld:{}}),{mode:0o600});
   // Original-image ingestion stays in the existing KR pipeline. The model
   // collector excludes verified registered references, not new discoveries.
   const newReady=new Set();
   for(let batch=0;batch<400;batch++){
    const old=new Set(fs.readdirSync(base));const s=run(root+'/scripts/run-brand-country-pipeline.sh',['louis-vuitton','kr','--crawl-only','--collect-catalog-model']);const made=fs.readdirSync(base).filter(n=>!old.has(n));if(made.length!==1)throw Error('MODEL_RUN_REQUIRED');const p=guard(base+'/'+made[0]+'/summary.json');if(s===78)throw Error('MODEL_SAFETY_STOP');
    if(node('prepare-louis-vuitton-sources.mjs'))throw Error('OFFLINE_PREPARATION_FAILED');
    const ready=JSON.parse(fs.readFileSync(catalog+'/ready-catalog-source/candidates.json'));guard(catalog+'/ready-catalog-source/summary.json');for(const r of ready)newReady.add(r.code);
    for(let offset=0;offset<ready.length;offset+=offset===0?1:25){const ingested=run(root+'/scripts/run-brand-country-pipeline.sh',['louis-vuitton','kr','--batch-offset',String(offset)]);if(ingested===78)throw Error('IMAGE_INGEST_SAFETY_STOP');if(![0,2].includes(ingested))throw Error('IMAGE_INGEST_FAILED');}
    if(p.some(r=>r.status==='ACCESS_BLOCKED')||!p.some(r=>r.status==='EXACT_MODEL_KRW_VERIFIED'))break;
    if(batch===399)throw Error('DISCOVERY_BATCH_LIMIT');
   }
   fs.copyFileSync(catalog+'/expanded-catalog-source/candidates.json',dir+'/candidates.json');fs.copyFileSync(catalog+'/expanded-catalog-source/summary.json',dir+'/summary.json');
   // New products are repaired here. Registered products receive their fields
   // alongside each fresh price batch; do not block that pass on 493 name-only
   // writes using the anonymous seed from this same run.
   const repairTargets=[...newReady],targetFile=root+'/crawler/louis-vuitton-progress/kr/attribute-targets.json';
   fs.mkdirSync(path.dirname(targetFile),{recursive:true});
   for(let offset=0;offset<repairTargets.length;offset+=25){fs.writeFileSync(targetFile,JSON.stringify(repairTargets.slice(offset,offset+25)),{mode:0o600});if(node('repair-louis-vuitton-metadata.mjs',['--codes-file',targetFile]))throw Error('METADATA_REPAIR_FAILED');}
   if(!repairTargets.length)rows.push(row('REGISTERED_FIELDS_IN_JOINT_REFRESH'));
   rows.push(row('NEW_DISCOVERY_PIPELINE_EXECUTED'));
  }
 }else{
  const s=node('louis-vuitton-market.mjs',['kr','--api-sku',...args]);if(s===78)throw Error('KR_PRICE_SAFETY_STOP');if(![0,2].includes(s))throw Error('KR_PRICE_REFRESH_FAILED');seed();if(node('prepare-louis-vuitton-sources.mjs'))throw Error('OFFLINE_PRICE_FIELDS_FAILED');const repaired=node('repair-louis-vuitton-metadata.mjs');if(repaired!==0)throw Error('PRICE_FIELD_REPAIR_FAILED');rows.push(row('REGISTERED_KR_PRICE_REFRESHED'));
 }
 rows.push(row('DISCOVERY_AUDIT_REQUIRED'));
}catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'WEEKLY_KR_FAILED'));code=/SAFETY|GUARD|LIMIT/.test(e.message)?78:1;}
finally{const out=root+'/crawler/louis-vuitton-progress/kr/weekly';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});guard(out+'/summary.json');}
// Registered prices may continue, but independent discovery remains partial.
process.exitCode=code;
