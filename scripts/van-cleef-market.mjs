import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!['kr --discover-reference','kr --refresh','kr --refresh --limit 1'].includes(args.join(' ')))throw Error('INVALID_DAILY_MODE');
const smoke=args.includes('--limit'),discover=args.includes('--discover-reference');
const folder=path.join(root,'crawler/onboarding/van-cleef-arpels/daily');fs.mkdirSync(folder,{recursive:true});
function report(status){const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'van-cleef-arpels',country:'KR',parentModel:'한국 공식 일일 수집',variantCode:'RUN',price:null,currency:'KRW',status,officialUrl:'https://www.vancleefarpels.com/kr/ko/'}]),{mode:0o600});guard(file);}
function guard(file){if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_REJECTED');return JSON.parse(fs.readFileSync(file));}
function execute(command,params){const r=spawnSync(command,params,{cwd:root,env:process.env,stdio:'ignore',timeout:900000});if(r.signal||r.error||r.status===78)throw Object.assign(Error('SAFETY_STOP'),{exitCode:78});return r.status;}
try{
 if(execute(path.join(root,'scripts/crawl-preflight.sh'),[])!==0)throw Error('PREFLIGHT_FAILED');
 if(discover||smoke){
  let offset=0,finished=false,failed=false;
  for(let batch=0;batch<400;batch++){
   report(`RUNNING_OFFSET_${offset}`);
   const code=execute(path.join(root,'scripts/run-brand-country-pipeline.sh'),['van-cleef-arpels','kr','--batch-offset',String(offset),...(smoke?['--limit','1']:[])]);
   const base=path.join(root,'crawler/runs/van-cleef-arpels/kr'),run=path.join(base,fs.readdirSync(base).sort().at(-1));
   const rows=guard(path.join(run,'summary.json'));
   if(rows.some(r=>/UNAUTHORIZED|SANDBOX|TOKEN|NETWORK_POLICY/.test(r.status)))throw Object.assign(Error('SAFETY_STOP'),{exitCode:78});
   if(code!==0&&code!==2)throw Error('COLLECTION_OR_STORAGE_FAILED');
   const stored=guard(path.join(run,'artifacts/verified/summary.json')),ready=rows.filter(r=>['REFERENCE_IMAGE_READY','PRICE_UNPUBLISHED'].includes(r.status));
   if(ready.length!==stored.length||ready.some(r=>!stored.some(v=>v.variantCode===r.variantCode.toUpperCase()&&v.status==='PUBLIC_CATALOG_VERIFIED')))throw Error('STORAGE_VERIFICATION_MISMATCH');
   if(code===2)failed=true;
   if(smoke){if(failed)throw Error('SAMPLE_FAILED');report('SAMPLE_VERIFIED_NOT_FULL_CATALOG');finished=true;break;}
   const next=Number(rows.find(r=>r.status.startsWith('NEXT_OFFSET_'))?.status.slice(12)),left=Number(rows.find(r=>r.status.startsWith('REMAINING_'))?.status.slice(10));
   if(!Number.isInteger(next)||next<=offset||!Number.isInteger(left)||left<0)throw Error('PROGRESS_INVALID');
   if(left===0){finished=true;break;}offset=next;
  }
  if(!finished)throw Error('DAILY_BATCH_LIMIT');
  if(failed)throw Error('UNRESOLVED_REFERENCES');
 }
 // Discovery already refreshes every discovered KR price in the same run.
 // The scheduled refresh phase re-verifies storage instead of crawling twice.
 if(!smoke){if(execute(process.execPath,[path.join(root,'scripts/audit-van-cleef-catalog.mjs'),'kr'])!==0)throw Error('PUBLIC_AUDIT_FAILED');report('DAILY_PHASE_VERIFIED');}
}catch(e){report(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'DAILY_FAILED');process.exitCode=e.exitCode??1;}
