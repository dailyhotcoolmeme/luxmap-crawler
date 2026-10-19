#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {maintenanceManifest,partitionMaintenanceRecords,storeRegisteredPrices} from '../crawler/common/registered-maintenance.js';
const root=path.resolve(import.meta.dirname,'..'),file=process.argv[2],adapter=process.argv[3],brand=process.env.LUXURY_INGEST_BRAND;
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||!['ingest-chanel-products.sh','ingest-jewelry-watch.mjs','ingest-official-reference.mjs','ingest-chanel-country.sh'].includes(path.basename(adapter))||path.dirname(adapter)!==root+'/scripts')throw Error('MAINTENANCE_STORAGE_GUARD');
const manifest=maintenanceManifest();if(!manifest)throw Error('MAINTENANCE_MANIFEST_REQUIRED');
const {prices,fresh}=partitionMaintenanceRecords(JSON.parse(fs.readFileSync(file)),manifest),folder=path.dirname(file);
const query=async(endpoint,method='GET',body,publicRead=false)=>{
 const key=publicRead?process.env.SUPABASE_ANON_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw Error('MAINTENANCE_CREDENTIAL_REQUIRED');
 const args=['-fsS','--max-time','30','--header','@-','-X',method];if(body!==undefined)args.push('--data',JSON.stringify(body));args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+endpoint);
 try{return JSON.parse(execFileSync('/usr/bin/curl',args,{input:`apikey: ${key}\nAuthorization: Bearer ${key}\nContent-Type: application/json\nPrefer: return=representation\n`,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024}));}catch{throw Error('MAINTENANCE_DATABASE_FAILED');}
};
let counts={new:0,changed:0,unchanged:0},verified=[];
try{
 if(prices.length){const result=await storeRegisteredPrices(prices,brand,query);counts.changed+=result.changed;counts.unchanged+=result.unchanged;verified=result.verified;}
 if(fresh.length){
  // Original contract, CPU image proof, R2 upload and public gates are unchanged
  // for new products. Never relabel a price-only row as full registration.
  const f=folder+'/weekly-new-records.json';fs.writeFileSync(f,JSON.stringify(fresh),{mode:0o600});
  const r=spawnSync(adapter,[f],{env:process.env,stdio:'inherit'});if(r.status!==0)process.exit(r.status??78);counts.new=fresh.length;
 }
 const rows=verified.map(r=>({brand,country:'KR',parentModel:'기존 상품 가격만 공개 대조',variantCode:r.normalizedCode,price:r.status==='REGISTERED_PRICE_UNCONFIRMED'?null:Number(r.publicPrice),currency:'KRW',status:r.status,officialUrl:r.officialUrl}));
 const own=folder+'/registered-price-verified';fs.mkdirSync(own,{recursive:true});fs.writeFileSync(own+'/summary.json',JSON.stringify(rows),{mode:0o600});
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[own+'/summary.json'],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
 // Existing batch coordinators consume this folder; preserve the distinction
 // between old price-only proofs and new full-record proofs.
 for(const name of ['verified','public-verified']){const d=folder+'/'+name;fs.mkdirSync(d,{recursive:true});const f=d+'/summary.json',old=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):[];fs.writeFileSync(f,JSON.stringify([...old,...rows]),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');}
 if(process.env.LUXURY_SERVICE_STATE_DIR)fs.writeFileSync(process.env.LUXURY_SERVICE_STATE_DIR+'/ingest-counts.json',JSON.stringify(counts),{mode:0o600});
}catch(e){
 const status=/^[A-Z_]{1,40}$/.test(e.message)?e.message:'MAINTENANCE_STORAGE_FAILED',dir=folder+'/registered-price-verified';fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(dir+'/summary.json',JSON.stringify([{brand,country:'KR',parentModel:'주간 가격 저장 중단',variantCode:'RUN',price:null,currency:'KRW',status,officialUrl:JSON.parse(fs.readFileSync(root+'/crawler/brands/'+brand+'/countries/kr')).entryUrl??'https://www.chanel.com/kr/'}]),{mode:0o600});
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');process.exitCode=1;
}
