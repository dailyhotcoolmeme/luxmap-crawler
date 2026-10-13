import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {parseBottegaProduct} from './bottega-product.js';
import {decodeHtml} from './prada-product.js';
export async function collectBottegaMarkets(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];if(args.length!==5||!args.includes('--prices-only')||!args.includes('--targets-file'))throw Error('PRICE_TARGETS_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(arg('--country-config'))),targets=JSON.parse(await fs.readFile(arg('--targets-file'))),run=process.env.CRAWL_RUN_DIR,artifact=path.join(run,'artifacts');
 if(cfg.country==='KR'||!Array.isArray(targets)||!targets.length||targets.length>cfg.maxProductsPerRun||new Set(targets.map(t=>t.normalizedCode)).size!==targets.length)throw Error('INVALID_TARGETS');
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[],summaries=[];await fs.mkdir(artifact,{recursive:true});let calls=0;
 const master=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../../crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json'))),codes=new Set(master.map(r=>r.normalizedCode)),aliases=new Map(),extras=new Map();
 for(const r of master){if(aliases.has(r.sourceProductId))aliases.set(r.sourceProductId,null);else aliases.set(r.sourceProductId,r);}
 const save=async()=>{await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(rows),{mode:0o600});for(let i=0;i<Math.max(1,summaries.length);i+=25)await fs.writeFile(path.join(run,i?`summary-${i/25}.json`:'summary.json'),JSON.stringify(summaries.slice(i,i+25)));};
 try{
  for(const target of targets){
   try{
   const original=new URL(target.officialUrl),code=target.normalizedCode;
   const pathname=decodeURIComponent(original.pathname).toUpperCase(),full=pathname.endsWith(`${code}.HTML`),alias=target.sourceProductId&&/^\d{8,10}$/.test(target.sourceProductId)&&pathname.endsWith(`${target.sourceProductId}.HTML`);
   if(original.protocol!=='https:'||original.username||original.password||original.hostname!=='www.bottegaveneta.com'||!original.pathname.startsWith(cfg.localePrefix)||!(full||alias)||!/^[A-Z0-9]{15}$/.test(code))throw Error('INVALID_TARGET');
   let url=original.href,html;
   for(let hop=0;hop<4;hop++){
    const u=new URL(url);if(u.hostname!=='www.bottegaveneta.com'||u.protocol!=='https:'||!u.pathname.startsWith(cfg.localePrefix))throw Error('UNAUTHORIZED_URL');
    if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const response=await context.get(url,{maxRedirects:0});
    if([403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
    if([301,302,303,307,308].includes(response.status())){url=new URL(response.headers().location,url).href;continue;}
    if(!response.ok())throw Error(`HTTP_${response.status()}`);
    const body=await response.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});html=body.toString('utf8');break;
   }
   if(!html)throw Error('REDIRECT_LIMIT');if(/captcha-delivery|cf-chl|challenge-platform|px-captcha|verify you are human/i.test(html))throw Error('ACCESS_BLOCKED');
   const p=parseBottegaProduct(html,original.href,cfg,{expectedCode:code,expectedProductId:target.sourceProductId,requireImageReference:false});if(p.normalizedCode!==code)throw Error('REFERENCE_MISMATCH');
   rows.push({normalizedCode:code,sourceProductId:p.sourceProductId,verifiedReference:code,productName:p.productName,price:p.price,priceStatus:p.priceStatus,officialUrl:original.href,country:cfg.country,currency:cfg.currency,checkedAt:p.checkedAt});
   for(const m of html.matchAll(/(?:href|data-url|data-href)=["']([^"']+)["']/gi))try{const u=new URL(decodeHtml(m[1]),original.href);if(u.protocol!=='https:'||u.hostname!=='www.bottegaveneta.com'||!u.pathname.startsWith(cfg.localePrefix))continue;const end=decodeURIComponent(u.pathname).replace(/\.html$/i,'').split('-').at(-1).toUpperCase(),reference=codes.has(end)?master.find(r=>r.normalizedCode===end):aliases.get(end);if(reference)extras.set(reference.normalizedCode,{normalizedCode:reference.normalizedCode,parentModel:reference.parentModel,sourceProductId:reference.sourceProductId,officialUrl:u.href});}catch{}
   await fs.writeFile(path.join(artifact,'extra-native-targets.json'),JSON.stringify([...extras.values()]),{mode:0o600});
   summaries.push({brand:cfg.brand,country:cfg.country,parentModel:target.parentModel.slice(0,120),variantCode:code,price:p.price,currency:cfg.currency,status:'confirmed',officialUrl:original.href});await save();
   }catch(error){
    if(['ACCESS_BLOCKED','UNAUTHORIZED_URL','REQUEST_LIMIT','RESPONSE_LIMIT','REDIRECT_LIMIT','INVALID_TARGET'].includes(error.message))throw error;
    const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'COUNTRY_DETAIL_FAILED';
    summaries.push({brand:cfg.brand,country:cfg.country,parentModel:target.parentModel.slice(0,120),variantCode:target.normalizedCode,price:null,currency:cfg.currency,status,officialUrl:target.officialUrl});
    await fs.writeFile(path.join(artifact,'unprocessed.json'),JSON.stringify(summaries.filter(r=>r.status!=='confirmed')),{mode:0o600});await save();
   }
  }
 }catch(error){const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'COUNTRY_SOURCE_FAILED';summaries.push({brand:cfg.brand,country:cfg.country,parentModel:'한국 상품의 국가 가격 검증',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl});await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:status}));process.exitCode=1;
 }finally{await save();await context.dispose();}
}
