#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {createHash} from 'node:crypto';
import {officialReferenceReceipt} from '../crawler/common/official-reference-receipt.js';
import {validateOfficialReference} from '../crawler/common/official-reference-validation.js';
import {runIdempotentStorage} from '../crawler/common/storage-recovery.js';
const root=path.resolve(import.meta.dirname,'..'),brand=process.env.LUXURY_INGEST_BRAND,file=process.argv[2];
if(!['hermes','dior','saint-laurent','bulgari'].includes(brand)||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_INGEST_REQUIRED');
const cfg=JSON.parse(await fs.readFile(path.join(root,'crawler/brands',brand,'countries/kr'))),recordBytes=await fs.readFile(file),records=JSON.parse(recordBytes);
if(!Array.isArray(records)||records.length<1||records.length>25)throw Error('BATCH_LIMIT');
// Validate the entire batch before any remote write.
const codes=records.map(r=>validateOfficialReference(r,cfg));if(new Set(codes).size!==codes.length)throw Error('DUPLICATE_REFERENCE');
const folder=path.join(path.dirname(file),'public-verified');await fs.mkdir(folder,{recursive:true});
const rows=[],summary=path.join(folder,'summary.json'),receipts={schema:1,brand,country:'KR',recordFileSha256:createHash('sha256').update(recordBytes).digest('hex'),checkedAt:new Date().toISOString(),entries:{}};let active='RUN';
const save=async()=>{await fs.writeFile(summary,JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');};
const db=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:process.env.SUPABASE_ANON_KEY}});
const get=async(endpoint)=>{const r=await db.get('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+endpoint,{maxRedirects:0});if(!r.ok())throw Error('PUBLIC_QUERY_FAILED');return r.json();};
try{
 for(let i=0;i<records.length;i++){
  const record=records[i],code=codes[i];active=code;
  const one=path.join(folder,code+'.json');await fs.writeFile(one,JSON.stringify([record]),{mode:0o600});
  const result=runIdempotentStorage(()=>spawnSync('/bin/sh',[root+'/scripts/ingest-chanel-products.sh',one],{env:{...process.env,LUXURY_REFERENCE_ADAPTER:'official-reference-v1'},encoding:'utf8',maxBuffer:65536}));
  if(result.status!==0)throw Error('STORAGE_WRITE_FAILED');
  const brands=await get('brands?slug=eq.'+brand+'&select=id');if(brands.length!==1)throw Error('PUBLIC_BRAND_FAILED');
  const variants=await get(`product_variants?brand_id=eq.${brands[0].id}&normalized_code=eq.${code}&select=id,market_products(country_code,currency_code,current_price,official_product_code,official_url),product_media(r2_object_key,is_primary)`);
  const markets=variants[0]?.market_products.filter(m=>m.country_code==='KR')??[],market=markets[0],media=variants[0]?.product_media.filter(m=>m.is_primary)??[];
  const imageKey=`products/${brand}/${record.modelKey}/${code}/cutout-v1/${record.imageSha256}.webp`;
  if(variants.length!==1||markets.length!==1||market.currency_code!=='KRW'||market.official_product_code!==code||market.official_url!==record.officialUrl||(record.price===null?market.current_price!==null:Number(market.current_price)!==record.price)||media.length!==1||media[0].r2_object_key!==imageKey)throw Error('PUBLIC_REFERENCE_FAILED');
  const receipt=officialReferenceReceipt(record,cfg);
  if(receipt)receipts.entries[code]=receipt;
  const receiptFile=path.join(folder,'proof-receipts.json'),temp=receiptFile+'.tmp';
  await fs.writeFile(temp,JSON.stringify(receipts),{mode:0o600});await fs.rename(temp,receiptFile);
  rows.push({brand,country:'KR',parentModel:'공개 한국 상품 검증',variantCode:code,price:record.price,currency:'KRW',status:'PUBLIC_CATALOG_VERIFIED',officialUrl:record.officialUrl});
  rows.push({brand,country:'KR',parentModel:'독립 처리 검증 증거',variantCode:code,price:null,currency:'KRW',status:receipt?'REFERENCE_PROOF_RECEIPT_SAVED':'LEGACY_PROOF_RECEIPT_MISSING',officialUrl:record.officialUrl});await save();
 }
}catch(e){rows.push({brand,country:'KR',parentModel:'한국 상품 적재 검증',variantCode:active,price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'STORAGE_VERIFY_FAILED',officialUrl:cfg.entryUrl});await save();process.exitCode=1;}
finally{await db.dispose();}
