import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {referenceCode,parseReferenceProduct,transientSourceError} from './jewelry-watch-product.js';
import {selectRepairUrls} from './reference-repair.js';
export function localizedReference(html,krUrl,cfg){
 const code=referenceCode(krUrl,cfg.brand)?.toUpperCase(),urls=new Set();
 for(const tag of html.matchAll(/<(?:link|a)\b[^>]*>/gi)){
  const href=tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  let u;try{u=new URL(href.replaceAll('&amp;','&'),krUrl);}catch{continue;}
  if(u.protocol==='https:'&&!u.username&&!u.password&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(`/${cfg.country.toLowerCase()}/`)&&/^\/[a-z]{2}\/[a-z]{2}\//i.test(u.pathname)&&referenceCode(u.href,cfg.brand)?.toUpperCase()===code&&new RegExp(cfg.productPathPattern,'i').test(u.pathname))urls.add(u.href);
 }
 const preferred=[...urls].filter(url=>new URL(url).pathname.startsWith(cfg.localePrefix));
 if(preferred.length===1)return preferred[0];
 if(urls.size!==1)throw Error(urls.size?'COUNTRY_REFERENCE_CONFLICT':'COUNTRY_REFERENCE_UNPUBLISHED');
 return [...urls][0];
}
export async function collectVanCleefPrices(cfg){
 if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 const args=process.argv.slice(2),sample=args.length===6&&args[4]==='--limit'&&args[5]==='1',repair=args[2]==='--reference-codes-file'&&args.length===4;if((args.length!==4&&!sample)||(!repair&&(args[2]!=='--prices-offset'||!/^\d+$/.test(args[3]))))throw Error('BATCH_REQUIRED');
 const offset=repair?0:Number(args[3]),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..');
 let index;try{index=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/van-cleef-arpels/.reference-index.json')));}catch(e){if(!sample||e.code!=='ENOENT')throw e;index=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/van-cleef-arpels/.reference-sample-index.json')));}
 if(Date.now()-Date.parse(index.checkedAt)>86400000)throw Error('REFERENCE_INDEX_STALE');
 let targets=index.urls;
 if(repair){const file=await fs.realpath(args[3]),folder=await fs.realpath(path.join(root,'crawler/onboarding/van-cleef-arpels/foreign',cfg.country.toLowerCase()));if(!file.startsWith(folder+path.sep)||(await fs.stat(file)).size>4096)throw Error('REPAIR_SCOPE_INVALID');const korean=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/van-cleef-arpels/countries/kr')));targets=selectRepairUrls(index,JSON.parse(await fs.readFile(file)),korean);}
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[],records=[];let calls=0;
 const row=(status,code='RUN',url=cfg.entryUrl,price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:'한국 상품 공식 국가 가격',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
 const save=()=>fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});
 let sitemapUrls;
 async function sitemapReference(code){
  if(!sitemapUrls){
   const robots=await get('https://www.vancleefarpels.com/robots.txt'),queue=[...robots.html.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>m[1]),seen=new Set(),found=new Set();
   if(!queue.length)throw Error('SITEMAP_NOT_DECLARED');
   while(queue.length){const address=queue.shift();if(seen.has(address))continue;if(seen.size>=20)throw Error('DISCOVERY_LIMIT');seen.add(address);const xml=(await get(address)).html;
    const children=[...xml.matchAll(/<(?:\w+:)?loc[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)].map(m=>m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim().replaceAll('&amp;','&'));
    if(/<sitemapindex[\s>]/i.test(xml)){const local=children.filter(url=>{try{return new URL(url).pathname.startsWith(`/${cfg.country.toLowerCase()}/`);}catch{return false;}});queue.push(...(local.length?local:children));}
    else if(/<urlset[\s>]/i.test(xml)){for(const url of children){const u=new URL(url);if(u.protocol==='https:'&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(`/${cfg.country.toLowerCase()}/`)&&new RegExp(cfg.productPathPattern,'i').test(u.pathname))found.add(u.href);}}
    else throw Error('SITEMAP_FORMAT');
    if(found.size>10000)throw Error('CANDIDATE_LIMIT');
   }
   sitemapUrls=[...found];rows.push(row(`COUNTRY_SITEMAP_URLS_${found.size}`));await save();
  }
  const matches=sitemapUrls.filter(url=>referenceCode(url,cfg.brand)?.toUpperCase()===code),preferred=matches.filter(url=>new URL(url).pathname.startsWith(cfg.localePrefix));
  if(preferred.length===1)return preferred[0];if(matches.length===1)return matches[0];throw Error(matches.length?'COUNTRY_SITEMAP_CONFLICT':'COUNTRY_SITEMAP_REFERENCE_MISSING');
 }
 async function get(url){
  const original=new URL(url),originalCode=referenceCode(url,cfg.brand)?.toUpperCase();let current=url,r;
  for(let redirect=0;redirect<=2;redirect++){
   const u=new URL(current);if(u.protocol!=='https:'||!cfg.allowedHosts.includes(u.hostname)||u.username||u.password)throw Error('UNAUTHORIZED_URL');
   for(let attempt=0;attempt<=2;attempt++){if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');try{r=await context.get(current,{maxRedirects:0});break;}catch(e){const transient=transientSourceError(e);if(transient&&attempt<2)continue;throw Error(transient??'SOURCE_REQUEST_FAILED');}}
   if(![301,302,303,307,308].includes(r.status()))break;
   const location=r.headers().location;if(!location)throw Error('REDIRECT_LOCATION_MISSING');const target=new URL(location,current);
   if(target.protocol!=='https:'||target.hostname!==original.hostname||target.username||target.password)throw Error('UNAUTHORIZED_REDIRECT');
   if(target.pathname.split('/')[1]!==original.pathname.split('/')[1]||referenceCode(target.href,cfg.brand)?.toUpperCase()!==originalCode)throw Object.assign(Error('REDIRECT_REFERENCE_MISMATCH'),{officialUrl:target.href});
   if(redirect===2)throw Error('REDIRECT_LIMIT');current=target.href;
  }
  if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error(`HTTP_${r.status()}`);
  const bytes=await r.body();if(bytes.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const html=bytes.toString('utf8');
  if(/cf-chl|px-captcha|captcha-delivery|<title[^>]*>\s*(?:just a moment|access denied)/i.test(html))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(path.join(run,'raw',`${calls}.source`),bytes,{mode:0o600});return {html,url:current};
 }
 try{
  if(offset>=targets.length)throw Error('OFFSET_OUT_OF_RANGE');
  const batch=targets.slice(offset,offset+(sample?1:cfg.maxProductsPerRun));let failed=0;if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));if(repair)rows.push(row('TARGETED_REPAIR_NOT_FULL_CATALOG'));
  for(const krUrl of batch){let url=cfg.entryUrl;const code=referenceCode(krUrl,cfg.brand).toUpperCase();
   try{const kr=await get(krUrl);try{url=localizedReference(kr.html,kr.url,cfg);}catch(e){if(e.message!=='COUNTRY_REFERENCE_UNPUBLISHED')throw e;url=await sitemapReference(code);}const foreign=await get(url);url=foreign.url;const p=parseReferenceProduct(foreign.html,url,cfg);delete p.image;records.push(p);rows.push(row(p.price===null?'PRICE_UNPUBLISHED':'COUNTRY_PRICE_READY',code,url,p.price));}
   catch(e){if(/BLOCKED|LIMIT|UNAUTHORIZED|SANDBOX|GUARD/.test(e.message))throw e;failed++;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PRODUCT_REQUEST_FAILED',code,e.officialUrl??url));}
   await save();
  }
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});await fs.writeFile(path.join(run,'artifacts/records.json'),JSON.stringify(records),{mode:0o600});
  rows.push(row(`BATCH_READY_${records.length}`),row(`BATCH_FAILED_${failed}`),row(`NEXT_OFFSET_${offset+batch.length}`),row(`REMAINING_${targets.length-offset-batch.length}`));if(failed)process.exitCode=2;
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'FOREIGN_COLLECTION_FAILED'));process.exitCode=/UNAUTHORIZED|SANDBOX|GUARD/.test(e.message)?78:1;}
 finally{await save();await context.dispose();}
}
