#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {storePradaMarkets} from '../crawler/common/prada-market-store.js';
const root=path.resolve(import.meta.dirname,'..'),country=process.env.LUXURY_MARKET_COUNTRY,brand=process.env.LUXURY_INGEST_BRAND;
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||!['van-cleef-arpels','rolex','hermes','louis-vuitton'].includes(brand)||!['jp','fr','it','es','us','sg','hk'].includes(country))throw Error('GUARDED_RUN_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries',country))),records=JSON.parse(fs.readFileSync(process.argv[2])),folder=path.join(path.dirname(process.argv[2]),'verified');fs.mkdirSync(folder,{recursive:true});
const file=path.join(folder,'summary.json'),rows=[];
const save=()=>{fs.writeFileSync(file,JSON.stringify(rows),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_REJECTED');};
const query=async(endpoint,method='GET',body,prefer='return=representation')=>{
 const args=['-fsS','--max-time','30','--header','@-','-X',method,'-H','Content-Type: application/json','-H',`Prefer: ${prefer}`];if(body)args.push('--data',JSON.stringify(body));args.push(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/${endpoint}`);
 try{return JSON.parse(execFileSync('/usr/bin/curl',args,{encoding:'utf8',input:`apikey: ${process.env.SUPABASE_SERVICE_ROLE_KEY}\nAuthorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}\n`,stdio:['pipe','pipe','pipe'],maxBuffer:1048576}));}catch{throw Error('MARKET_DATABASE_FAILED');}
};
try{if(records.length){await storePradaMarkets(records,cfg,query);for(const r of records)rows.push({brand:cfg.brand,country:cfg.country,parentModel:'동일 한국 SKU 해외 저장 검증',variantCode:r.normalizedCode,price:r.price,currency:cfg.currency,status:r.price===null?'UNPUBLISHED_MARKET_VERIFIED':'COUNTRY_MARKET_VERIFIED',officialUrl:r.officialUrl});}save();}
catch(e){rows.push({brand:cfg.brand,country:cfg.country,parentModel:'해외 가격 저장 검증',variantCode:'RUN',price:null,currency:cfg.currency,status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'MARKET_VERIFY_FAILED',officialUrl:cfg.entryUrl});save();process.exitCode=1;}
