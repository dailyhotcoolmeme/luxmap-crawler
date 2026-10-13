import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {referenceCode,parseReferenceProduct,transientSourceError} from './jewelry-watch-product.js';
export function localizedReference(html,krUrl,cfg){
 const code=referenceCode(krUrl,cfg.brand)?.toUpperCase(),urls=new Set();
 for(const tag of html.matchAll(/<(?:link|a)\b[^>]*>/gi)){
  const href=tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  let u;try{u=new URL(href.replaceAll('&amp;','&'),krUrl);}catch{continue;}
  if(u.protocol==='https:'&&!u.username&&!u.password&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix)&&referenceCode(u.href,cfg.brand)?.toUpperCase()===code&&new RegExp(cfg.productPathPattern,'i').test(u.pathname))urls.add(u.href);
 }
 if(urls.size!==1)throw Error(urls.size?'COUNTRY_REFERENCE_CONFLICT':'COUNTRY_REFERENCE_UNPUBLISHED');
 return [...urls][0];
}
export async function collectVanCleefPrices(cfg){
 if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 const args=process.argv.slice(2),sample=args.length===6&&args[4]==='--limit'&&args[5]==='1';if((args.length!==4&&!sample)||args[2]!=='--prices-offset'||!/^\d+$/.test(args[3]))throw Error('BATCH_REQUIRED');
 const offset=Number(args[3]),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..');
 const index=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/van-cleef-arpels/.reference-index.json')));
 if(Date.now()-Date.parse(index.checkedAt)>86400000)throw Error('REFERENCE_INDEX_STALE');
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[],records=[];let calls=0;
 const row=(status,code='RUN',url=cfg.entryUrl,price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:'한국 상품 공식 국가 가격',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
 const save=()=>fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});
 async function get(url){
  const u=new URL(url);if(u.protocol!=='https:'||!cfg.allowedHosts.includes(u.hostname)||u.username||u.password)throw Error('UNAUTHORIZED_URL');
  let r;for(let attempt=0;attempt<=2;attempt++){if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');try{r=await context.get(url,{maxRedirects:0});break;}catch(e){const transient=transientSourceError(e);if(transient&&attempt<2)continue;throw Error(transient??'SOURCE_REQUEST_FAILED');}}
  if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error(`HTTP_${r.status()}`);
  const bytes=await r.body();if(bytes.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const html=bytes.toString('utf8');
  if(/cf-chl|px-captcha|captcha-delivery|<title[^>]*>\s*(?:just a moment|access denied)/i.test(html))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(path.join(run,'raw',`${calls}.source`),bytes,{mode:0o600});return html;
 }
 try{
  if(offset>=index.urls.length)throw Error('OFFSET_OUT_OF_RANGE');
  const batch=index.urls.slice(offset,offset+(sample?1:cfg.maxProductsPerRun));let failed=0;if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));
  for(const krUrl of batch){let url=cfg.entryUrl;const code=referenceCode(krUrl,cfg.brand).toUpperCase();
   try{url=localizedReference(await get(krUrl),krUrl,cfg);const p=parseReferenceProduct(await get(url),url,cfg);delete p.image;records.push(p);rows.push(row(p.price===null?'PRICE_UNPUBLISHED':'COUNTRY_PRICE_READY',code,url,p.price));}
   catch(e){if(/BLOCKED|LIMIT|UNAUTHORIZED|SANDBOX|GUARD/.test(e.message))throw e;failed++;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PRODUCT_REQUEST_FAILED',code,url));}
   await save();
  }
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});await fs.writeFile(path.join(run,'artifacts/records.json'),JSON.stringify(records),{mode:0o600});
  rows.push(row(`BATCH_READY_${records.length}`),row(`BATCH_FAILED_${failed}`),row(`NEXT_OFFSET_${offset+batch.length}`),row(`REMAINING_${index.urls.length-offset-batch.length}`));if(failed)process.exitCode=2;
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'FOREIGN_COLLECTION_FAILED'));process.exitCode=/UNAUTHORIZED|SANDBOX|GUARD/.test(e.message)?78:1;}
 finally{await save();await context.dispose();}
}
