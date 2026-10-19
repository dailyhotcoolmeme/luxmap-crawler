#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {storePradaMarkets} from '../crawler/common/prada-market-store.js';
const root=path.resolve(import.meta.dirname,'..'),country=process.env.LUXURY_MARKET_COUNTRY,brand=process.env.LUXURY_INGEST_BRAND;
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||!['van-cleef-arpels','rolex','hermes','louis-vuitton','dior'].includes(brand)||!['jp','fr','it','es','us','sg','hk'].includes(country))throw Error('GUARDED_RUN_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries',country))),records=JSON.parse(fs.readFileSync(process.argv[2])),folder=path.join(path.dirname(process.argv[2]),'verified');fs.mkdirSync(folder,{recursive:true});
const file=path.join(folder,'summary.json'),rows=[];
const save=()=>{fs.writeFileSync(file,JSON.stringify(rows),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_REJECTED');};
const query=async(endpoint,method='GET',body,prefer='return=representation',publicRead=false)=>{
 const args=['-fsS','--max-time','30','--header','@-','-X',method,'-H','Content-Type: application/json','-H',`Prefer: ${prefer}`];if(body)args.push('--data',JSON.stringify(body));args.push(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/${endpoint}`);
 const key=publicRead?process.env.SUPABASE_ANON_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('MARKET_CREDENTIAL_MISSING');
 try{return JSON.parse(execFileSync('/usr/bin/curl',args,{encoding:'utf8',input:`apikey: ${key}\nAuthorization: Bearer ${key}\n`,stdio:['pipe','pipe','pipe'],maxBuffer:1048576}));}catch{throw Error('MARKET_DATABASE_FAILED');}
};
try{if(records.length){await storePradaMarkets(records,cfg,query);
 if(brand==='dior'){
  const endpoint=`product_variants?normalized_code=in.(${records.map(r=>r.normalizedCode).join(',')})&brands.slug=eq.dior&select=normalized_code,brands!inner(slug),market_products(id,country_code,currency_code,current_price,official_product_code,official_url,price_checked_at)&limit=25`;
  const expected=await query(endpoint),published=await query(endpoint,'GET',undefined,'return=representation',true),ids=[];
  if(expected.length!==records.length||published.length!==records.length)throw Error('PUBLIC_COUNTRY_PRICE_UNVERIFIED');
  for(const r of records){const a=expected.filter(v=>v.normalized_code===r.normalizedCode),p=published.filter(v=>v.normalized_code===r.normalizedCode);if(a.length!==1||p.length!==1||p[0].brands?.slug!=='dior')throw Error('PUBLIC_COUNTRY_PRICE_UNVERIFIED');const x=a[0].market_products.filter(m=>m.country_code===cfg.country),y=p[0].market_products.filter(m=>m.country_code===cfg.country);if(x.length!==1||y.length!==1||['id','currency_code','current_price','official_product_code','official_url','price_checked_at'].some(k=>x[0][k]!==y[0][k])||y[0].official_product_code!==r.normalizedCode||y[0].official_url!==r.officialUrl||y[0].currency_code!==cfg.currency)throw Error('PUBLIC_COUNTRY_PRICE_UNVERIFIED');ids.push(y[0].id);rows.push({brand:'dior',country:cfg.country,parentModel:'익명 공개 동일한국SKU 해외가격 대조',variantCode:r.normalizedCode,price:Number(y[0].current_price),currency:cfg.currency,status:'PUBLIC_COUNTRY_PRICE_VERIFIED',officialUrl:r.officialUrl});}
  const histories=await query(`market_products?id=in.(${ids.join(',')})&select=id,current_price,price_history(amount,currency_code)&price_history.order=observed_at.desc&price_history.limit=1&limit=25`,'GET',undefined,'return=representation',true);
  if(histories.length!==ids.length||histories.some(m=>!ids.includes(m.id)||m.price_history?.[0]?.currency_code!==cfg.currency||Number(m.price_history[0].amount)!==Number(m.current_price)))throw Error('PUBLIC_PRICE_HISTORY_UNVERIFIED');
 }else for(const r of records)rows.push({brand:cfg.brand,country:cfg.country,parentModel:'동일 한국 SKU 해외 저장 검증',variantCode:r.normalizedCode,price:r.price,currency:cfg.currency,status:r.price===null?'UNPUBLISHED_MARKET_VERIFIED':'COUNTRY_MARKET_VERIFIED',officialUrl:r.officialUrl});}save();}
catch(e){rows.push({brand:cfg.brand,country:cfg.country,parentModel:'해외 가격 저장 검증',variantCode:'RUN',price:null,currency:cfg.currency,status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'MARKET_VERIFY_FAILED',officialUrl:cfg.entryUrl});save();process.exitCode=1;}
