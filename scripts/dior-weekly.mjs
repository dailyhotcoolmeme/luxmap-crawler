import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {validateDiorPublishedRoutes} from '../crawler/common/dior-weekly-routes.js';
import {diorForeignDataPrices} from '../crawler/common/dior-foreign-page-data.js';
import {domesticPhaseResult} from '../crawler/common/weekly-phase-result.js';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2),country=args[0],smoke=args.includes('--limit'),dir=root+'/crawler/runtime/dior-weekly';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER||!['kr','jp','fr','it','es','us','sg','hk'].includes(country)||!['--discover-reference','--refresh','--refresh --limit 1'].includes(args.slice(1).join(' ')))throw Error('SCHEDULED_DIOR_SCOPE');
fs.mkdirSync(dir,{recursive:true});
const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/countries/'+country)),folder=root+'/crawler/completeness/dior/weekly/'+country;
fs.mkdirSync(folder,{recursive:true});
const guard=file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};
const report=(...statuses)=>{const f=folder+'/summary.json';fs.writeFileSync(f,JSON.stringify(statuses.map(status=>({brand:'dior',country:cfg.country,parentModel:'디올 주간 통합 경로',variantCode:'TOTAL',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}))),{mode:0o600});guard(f);};
const execute=params=>{const r=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['dior',country,...params],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});if(r.signal||r.error||r.status===78)throw Error('SAFETY_STOP');const base=root+'/crawler/runs/dior/'+country,run=base+'/'+fs.readdirSync(base).filter(x=>/^\d{8}T\d{6}Z-\d+$/.test(x)).sort().at(-1);return {code:r.status,run,rows:guard(run+'/summary.json')};};
function seed(){
 const columns='id,normalized_code,color_ko,color_original,material_ko,material_original,width_mm,height_mm,depth_mm,brands!inner(slug),market_products(country_code,currency_code,official_product_code,official_url,current_price,price_checked_at),product_media(is_primary,source_url,r2_object_key)';
 const all=[];for(let offset=0;offset<10000;offset+=50){const route='product_variants?brands.slug=eq.dior&select='+columns+'&order=normalized_code.asc&limit=50&offset='+offset,server=guardedRest(route),published=guardedRest(route,'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);if(JSON.stringify(server)!==JSON.stringify(published))throw Error('PUBLIC_REFERENCE_MISMATCH');all.push(...server);if(server.length<50)break;}
 if(!all.length||all.some(v=>v.brands?.slug!=='dior'||v.market_products.filter(m=>m.country_code==='KR'&&m.currency_code==='KRW'&&m.official_product_code===v.normalized_code&&m.current_price>0).length!==1||v.product_media.filter(m=>m.is_primary&&m.r2_object_key?.includes('/cutout-v1/')).length!==1))throw Error('REGISTERED_KR_UNVERIFIED');
 fs.writeFileSync(dir+'/references.json',JSON.stringify(all),{mode:0o600});return all;
}
try{
 let refs;
 if(country==='kr')refs=seed();else {if(!fs.existsSync(dir+'/references.json'))throw Error('KOREAN_PUBLIC_VERIFICATION_REQUIRED');refs=JSON.parse(fs.readFileSync(dir+'/references.json'));}
 const newOnly=country==='kr'&&args[1]==='--discover-reference',ids=new Set(refs.map(v=>v.normalized_code)),routes=validateDiorPublishedRoutes(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/'+country+'.json')),cfg.country).filter(r=>country!=='kr'||ids.has(new URL(r.canonical).pathname.split('/').at(-1).replaceAll('_',''))!==newOnly).sort((a,b)=>Number(!a.canonical.includes('/products/'))-Number(!b.canonical.includes('/products/'))||a.url.localeCompare(b.url));
 let verified=new Set(),attempted=0,failed=false;const sources=[];
 for(let offset=0;offset<routes.length;offset+=25){
  report('REGISTERED_KR_'+refs.length,'DATA_TARGETS_'+routes.length,'DATA_ATTEMPTED_'+attempted,'PUBLIC_CODES_VERIFIED_'+verified.size,'RUNNING_OFFSET_'+offset);
  const r=execute(['--crawl-only','--scheduled-page-data','--offset',String(offset),...(newOnly?['--new-only']:[]),...(smoke?['--limit','1']:[])]);sources.push(r.run);attempted+=r.rows.filter(x=>x.status==='PUBLISHED_DATA_HTTP_200').length;
  if(country==='kr'&&r.rows.some(x=>x.status==='EXACT_SKU')){
   const stored=execute(['--recover-source-run',r.run]);
   if(stored.code!==0)failed=true;
   const proof=stored.run+'/artifacts/public-verified/summary.json';if(fs.existsSync(proof))for(const row of guard(proof))if(['PUBLIC_CATALOG_VERIFIED','REGISTERED_PRICE_PUBLIC_VERIFIED','REGISTERED_NEWER_PRICE_PRESERVED'].includes(row.status))verified.add(row.variantCode);
  }
  // Store this successful source prefix before asking for another batch. A
  // later failed page must not discard already verified official prices.
  if(country!=='kr'){
   fs.writeFileSync(dir+'/'+country+'-sources.json',JSON.stringify([r.run]),{mode:0o600});
   const records=new Map();for(const item of JSON.parse(fs.readFileSync(r.run+'/artifacts/source-index.json'))){const f=r.run+'/raw/'+item.rawName,st=fs.statSync(f);let body;try{fs.chmodSync(f,0o600);body=fs.readFileSync(f,'utf8');}finally{fs.chmodSync(f,st.mode&0o777);}for(const p of diorForeignDataPrices(body,item.canonical,cfg.country,ids,item.checkedAt)){const old=records.get(p.normalizedCode);if(old&&old.price!==p.price)throw Error('FOREIGN_PRICE_CONFLICT');records.set(p.normalizedCode,p);}}
   for(let start=0;start<records.size;start+=25){const stored=execute(['--scheduled-price-records','--offset',String(start)]);if(stored.code)throw Error('CENTRAL_PRICE_STORAGE_FAILED');for(const row of guard(stored.run+'/artifacts/verified/summary.json'))if(row.status==='PUBLIC_COUNTRY_PRICE_VERIFIED'&&row.country===cfg.country&&ids.has(row.variantCode))verified.add(row.variantCode);}
  }
  if(r.code){const reason=r.rows.findLast(x=>!['SOURCE_BATCH_RECORDED','EXACT_SKU','PUBLISHED_DATA_HTTP_200','PRIOR_FAILURE_NOT_RETRIED'].includes(x.status))?.status;throw Error(reason??'SCHEDULED_COLLECTION_FAILED');}
  if(r.rows.some(x=>/ACCESS_BLOCKED|SOURCE_HTTP_(401|403|429)/.test(x.status))){failed=true;break;}
  if(smoke)break;
 }
 fs.writeFileSync(dir+'/'+country+'-sources.json',JSON.stringify(sources),{mode:0o600});
 if(country==='hk'&&!smoke){const r=spawnSync(process.execPath,[root+'/scripts/network-isolate.mjs','["nxgnbrdxxmlhtcnymqsl.supabase.co","api.cloudflare.com","luxury-assets.dailyhotcoolmeme.workers.dev"]','0',process.execPath,root+'/scripts/refresh-dior-snapshot.mjs'],{cwd:root,env:{...process.env,NODE_USE_ENV_PROXY:'1'},stdio:'ignore',timeout:180000});if(r.status)throw Error('PUBLIC_SNAPSHOT_UPDATE_FAILED');}
 const targetCodes=newOnly?routes.map(r=>new URL(r.canonical).pathname.split('/').at(-1).replaceAll('_','')):refs.map(r=>r.normalized_code);
 const phase=domesticPhaseResult({targetCodes,verifiedCodes:verified,failed,sample:smoke});
 const unresolved=country==='kr'?phase.missing:refs.length-verified.size;
 report('REGISTERED_KR_'+refs.length,'DATA_TARGETS_'+routes.length,'DATA_ATTEMPTED_'+attempted,'PUBLIC_CODES_VERIFIED_'+verified.size,'UNCONFIRMED_PAIRS_'+Math.max(0,unresolved),country==='kr'?phase.status:smoke?'SAMPLE_NOT_FULL_CATALOG':failed?'PARTIAL_VERIFIED_WITH_FAILURES':'REGISTERED_SCOPE_VERIFIED',newOnly?'INDEPENDENT_DISCOVERY_AUDIT_NEEDED':'PRICE_PHASE_NOT_DISCOVERY_AUDIT');
 // Smoke verifies only its explicitly attempted record, never all registered
 // references. Full domestic refresh must verify every registered SKU.
 process.exitCode=country==='kr'?(smoke?(failed||verified.size!==1?2:0):phase.exitCode):failed?2:0;
}catch(e){const prior=folder+'/summary.json',statuses=fs.existsSync(prior)?guard(prior).map(r=>r.status):[];report(...statuses.filter(s=>!/^RUNNING_|STORING_/.test(s)),/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SCHEDULED_DIOR_FAILED');process.exitCode=e.message==='SAFETY_STOP'?78:country==='kr'&&fs.existsSync(dir+'/references.json')?2:1;}
