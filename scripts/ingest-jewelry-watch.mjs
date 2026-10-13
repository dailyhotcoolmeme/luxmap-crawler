#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {referenceCode} from '../crawler/common/jewelry-watch-product.js';
import {runIdempotentStorage} from '../crawler/common/storage-recovery.js';
const root=path.resolve(import.meta.dirname,'..'),file=process.argv[2],brand=process.env.LUXURY_INGEST_BRAND;
if(!['van-cleef-arpels','rolex'].includes(brand)||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_INGEST_REQUIRED');
const records=JSON.parse(await fs.readFile(file)),cfg=JSON.parse(await fs.readFile(path.join(root,'crawler/brands',brand,'countries/kr'))),folder=path.join(path.dirname(file),'verified');await fs.mkdir(folder,{recursive:true});
const rows=[],summary=path.join(folder,'summary.json');
let activeCode='RUN';
const save=async()=>{await fs.writeFile(summary,JSON.stringify(rows),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');};
const db=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}});
const anonymous=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:process.env.SUPABASE_ANON_KEY}});
const get=async(c,endpoint)=>{const r=await c.get(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/${endpoint}`,{maxRedirects:0});if(!r.ok())throw Error('DB_READ_FAILED');return r.json();};
try{
 if(!Array.isArray(records)||records.length>25)throw Error('BATCH_LIMIT');
 await save();
 for(const r of records){
  const u=new URL(r.officialUrl),code=referenceCode(u.href,brand)?.replace(/[^a-z0-9]/gi,'').toUpperCase();
  activeCode=code??'RUN';
  if(r.brand!==brand||r.category!==cfg.category||r.country!=='KR'||r.currency!=='KRW'||u.hostname!==new URL(cfg.entryUrl).hostname||!u.pathname.startsWith(cfg.localePrefix)||!new RegExp(cfg.productPathPattern,'i').test(u.pathname)||!code||code!==r.normalizedCode||r.imageProcessingVersion!=='original-cutout-v1'||r.imageWidth!==960||r.imageHeight!==960||!(r.price===null||Number.isFinite(r.price)&&r.price>0))throw Error('REFERENCE_VALIDATION_FAILED');
  const one=path.join(folder,`${code}.json`);await fs.writeFile(one,JSON.stringify([r]),{mode:0o600});
  const result=runIdempotentStorage(()=>spawnSync('/bin/sh',[path.join(root,'scripts/ingest-chanel-products.sh'),one],{env:{...process.env,LUXURY_REFERENCE_ADAPTER:'jewelry-watch-v1'},encoding:'utf8',maxBuffer:65536}));
  if(result.status!==0){
   const message=String(result.stderr??'')+String(result.stdout??'');
   const fixed=message.match(/(?:FAILED|BLOCKED): ([A-Z][A-Z0-9_]{1,35})\b/)?.[1];
   const dbCode=message.match(/database HTTP (\d{3}) \(([A-Z0-9_]{1,12})\)/);
   throw Error(fixed??(dbCode?`DB_${dbCode[1]}_${dbCode[2]}`:`STORAGE_EXIT_${result.status??'SIGNAL'}`));
  }
  const brands=await get(db,`brands?slug=eq.${brand}&select=id`);if(brands.length!==1)throw Error('BRAND_VERIFY_FAILED');
  const variants=await get(anonymous,`product_variants?brand_id=eq.${brands[0].id}&normalized_code=eq.${code}&select=id,market_products(country_code,currency_code,current_price,official_product_code,official_url),product_media(r2_object_key,is_primary)`);
  const v=variants[0],m=v?.market_products.find(m=>m.country_code==='KR');
  if(variants.length!==1||!m||m.currency_code!=='KRW'||m.official_product_code!==code||m.official_url!==r.officialUrl||(r.price!==null&&Number(m.current_price)!==r.price)||!v.product_media.some(m=>m.is_primary&&m.r2_object_key===`products/${brand}/${r.modelKey}/${code}/cutout-v1/${r.imageSha256}.webp`))throw Error('PUBLIC_CATALOG_VERIFY_FAILED');
  rows.push({brand,country:'KR',parentModel:'공개 한국 상품 검증',variantCode:code,price:r.price,currency:'KRW',status:'PUBLIC_CATALOG_VERIFIED',officialUrl:r.officialUrl});await save();
 }
}catch(e){rows.push({brand,country:'KR',parentModel:'한국 상품 적재 검증',variantCode:activeCode,price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'STORAGE_VERIFY_FAILED',officialUrl:cfg.entryUrl});await save();process.exitCode=1;}
finally{await db.dispose();await anonymous.dispose();}
