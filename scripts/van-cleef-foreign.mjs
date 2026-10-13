import path from 'node:path';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw Error('COORDINATED_RUN_REQUIRED');
const sample=process.argv.includes('--smoke'),countryArg=process.argv.indexOf('--country');
const countries=countryArg>=0?[process.argv[countryArg+1]]:sample?['jp']:['jp','fr','it','es','us','sg','hk'];
if(countries.some(c=>!['jp','fr','it','es','us','sg','hk'].includes(c)))throw Error('COUNTRY_SCOPE_INVALID');
let failed=false,safety=false;
const guard=file=>{if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_REJECTED');return JSON.parse(fs.readFileSync(file));};
function audit(){const r=spawnSync(process.execPath,[path.join(root,'scripts/network-isolate.mjs'),'["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0',process.execPath,path.join(root,'scripts/verify-van-cleef-foreign.mjs')],{cwd:root,env:process.env,stdio:'ignore',timeout:180000});if(r.status!==0||r.signal||r.error)throw Error('PUBLIC_AUDIT_FAILED');guard(path.join(root,'crawler/onboarding/van-cleef-arpels/foreign/public-summary/summary.json'));}
if(process.argv.includes('--remaining'))audit();
for(const country of countries){
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/van-cleef-arpels/countries',country))),folder=path.join(root,'crawler/onboarding/van-cleef-arpels/foreign',country);fs.mkdirSync(folder,{recursive:true});
 const report=status=>{const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:cfg.brand,country:cfg.country,parentModel:'한국 SKU 해외 가격 진행',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}]),{mode:0o600});guard(file);};
 const checkpoint=path.join(folder,'checkpoint.json');let offset=0,unresolved=false;
 try{
  if(process.argv.includes('--remaining')){
   const old=JSON.parse(fs.readFileSync(checkpoint));if(!old.complete)throw Error('MAIN_COLLECTION_INCOMPLETE');
   const missing=JSON.parse(fs.readFileSync(path.join(folder,'remaining-codes.json')));
   if(!Array.isArray(missing)||missing.some(c=>typeof c!=='string'||!/^VC[A-Z0-9]{8}$/.test(c))||new Set(missing).size!==missing.length)throw Error('REPAIR_CODES_INVALID');
   if(!missing.length){report('ALL_PUBLIC_REFERENCES_VERIFIED');continue;}
   // Bounded one attempt per missing code. Repeated heartbeats do not re-fetch failures.
   const attemptFile=path.join(folder,'repair-attempts-sitemap.json');let attempted=[];try{attempted=JSON.parse(fs.readFileSync(attemptFile));}catch{}
   if(missing.some(c=>attempted.includes(c)))throw Error('REPAIR_ALREADY_ATTEMPTED');
   for(let i=0;i<missing.length;i+=25){
    const codes=missing.slice(i,i+25),file=path.join(folder,'repair-codes.json');fs.writeFileSync(file,JSON.stringify(codes),{mode:0o600});attempted.push(...codes);fs.writeFileSync(attemptFile,JSON.stringify(attempted),{mode:0o600});report('TARGETED_REPAIR_RUNNING');
    const r=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),[cfg.brand,country,'--reference-codes-file',file],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});
    const base=path.join(root,'crawler/runs',cfg.brand,country),run=path.join(base,fs.readdirSync(base).sort().at(-1)),source=guard(path.join(run,'summary.json'));
    if(r.status===78||r.signal||r.error||source.some(v=>/UNAUTHORIZED|SANDBOX|TOKEN|NETWORK_POLICY/.test(v.status)))throw Object.assign(Error('SAFETY_STOP'),{safety:true});
    if(r.status!==0)throw Error('TARGETED_REPAIR_UNRESOLVED');
    const stored=guard(path.join(run,'artifacts/verified/summary.json'));if(stored.length!==codes.length||codes.some(c=>!stored.some(v=>v.variantCode===c&&['COUNTRY_MARKET_VERIFIED','UNPUBLISHED_MARKET_VERIFIED'].includes(v.status))))throw Error('REPAIR_VERIFY_MISMATCH');
   }
   audit();if(JSON.parse(fs.readFileSync(path.join(folder,'remaining-codes.json'))).length)throw Error('PUBLIC_REFERENCES_UNRESOLVED');
   fs.writeFileSync(checkpoint,JSON.stringify({...old,failed:false}),{mode:0o600});report('ALL_PUBLIC_REFERENCES_VERIFIED');continue;
  }
  if(!sample&&!process.argv.includes('--refresh')&&fs.existsSync(checkpoint)){const old=JSON.parse(fs.readFileSync(checkpoint));if(Date.now()-Date.parse(old.startedAt)<86400000){offset=old.nextOffset;if(old.complete){report(old.failed?'FINISHED_WITH_UNRESOLVED':'ALL_BATCHES_STORED');failed||=old.failed;continue;}unresolved=old.failed;}}
  const startedAt=new Date().toISOString();
  for(let n=0;n<400;n++){
   report(`RUNNING_OFFSET_${offset}`);
   const result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),[cfg.brand,country,'--prices-offset',String(offset),...(sample?['--limit','1']:[])],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});
   const base=path.join(root,'crawler/runs',cfg.brand,country),run=path.join(base,fs.readdirSync(base).sort().at(-1)),rows=guard(path.join(run,'summary.json'));
   if(result.status===78||result.signal||result.error||rows.some(r=>/UNAUTHORIZED|SANDBOX|TOKEN|NETWORK_POLICY/.test(r.status)))throw Object.assign(Error('SAFETY_STOP'),{safety:true});
   if(![0,2].includes(result.status))throw Error('COLLECTION_OR_STORAGE_FAILED');
   const stored=guard(path.join(run,'artifacts/verified/summary.json')),ready=rows.filter(r=>['COUNTRY_PRICE_READY','PRICE_UNPUBLISHED'].includes(r.status));
   if(stored.length!==ready.length||ready.some(r=>!stored.some(v=>v.variantCode===r.variantCode&&['COUNTRY_MARKET_VERIFIED','UNPUBLISHED_MARKET_VERIFIED'].includes(v.status))))throw Error('STORAGE_VERIFICATION_MISMATCH');
   unresolved||=result.status===2;
   const next=Number(rows.find(r=>r.status.startsWith('NEXT_OFFSET_'))?.status.slice(12)),left=Number(rows.find(r=>r.status.startsWith('REMAINING_'))?.status.slice(10));
   if(!Number.isInteger(next)||next<=offset||!Number.isInteger(left)||left<0)throw Error('PROGRESS_INVALID');
   if(sample){report(unresolved?'SAMPLE_UNRESOLVED':'SAMPLE_VERIFIED_NOT_FULL_CATALOG');failed||=unresolved;break;}
   fs.writeFileSync(checkpoint,JSON.stringify({startedAt,nextOffset:next,complete:left===0,failed:unresolved,lastRun:run}),{mode:0o600});
   if(left===0){report(unresolved?'FINISHED_WITH_UNRESOLVED':'ALL_BATCHES_STORED');failed||=unresolved;break;}offset=next;
   if(n===399)throw Error('BATCH_LIMIT');
  }
 }catch(e){report(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'FOREIGN_WORKER_FAILED');failed=true;if(e.safety){safety=true;break;}}
}
process.exitCode=safety?78:failed?1:0;
