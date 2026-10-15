import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {parseReferenceProduct,referenceCode,transientSourceError} from './jewelry-watch-product.js';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';
import {selectRepairUrls} from './reference-repair.js';
import {recordAvailability} from './catalog-availability.js';
export async function collectReference(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 const args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR;
 const direct=args[2]==='--reference-urls-file',repair=direct||args[2]==='--reference-codes-file';
 const sample=args.length===6&&args[4]==='--limit'&&args[5]==='1'&&!repair;
 if(args[0]!=='--country-config'||(!sample&&args.length!==4)||(!repair&&(args[2]!=='--batch-offset'||!/^\d+$/.test(args[3]))))throw Error('BATCH_REQUIRED');
 const offset=repair?0:Number(args[3]),root=path.resolve(import.meta.dirname,'../..'),indexFile=path.join(root,'crawler/brands',cfg.brand,'.reference-index.json');
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[],records=[];let calls=0;
 const row=(status,url=cfg.entryUrl,code='RUN',price=null)=>({brand:cfg.brand,country:'KR',parentModel:'한국 공식 상품 수집',variantCode:code,price,currency:'KRW',status,officialUrl:url});
 const save=()=>fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});
 async function get(url){
  const u=new URL(url);if(u.protocol!=='https:'||!cfg.allowedHosts.includes(u.hostname)||u.username||u.password)throw Error('UNAUTHORIZED_URL');
  let r;
  // Retry only connection interruption, within the existing global limit.
  // Denials and other HTTP errors never enter this retry branch.
  for(let attempt=0;attempt<=2;attempt++){
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   try{r=await context.get(u.href,{maxRedirects:0});break;}
   catch(e){const transient=transientSourceError(e);if(transient&&attempt<2)continue;throw Error(transient??'SOURCE_REQUEST_FAILED');}
  }
  if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');
  if(!r.ok()){recordAvailability(run,cfg,u.href,r.status());throw Error(`HTTP_${r.status()}`);}
  const b=await r.body();if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  const html=b.toString('utf8');if(/<title[^>]*>\s*(?:just a moment|access denied)|cf-chl|px-captcha|captcha-delivery/i.test(html))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(path.join(run,'raw',`${calls}.source`),b,{mode:0o600});return html;
 }
 try{
  let urls;
  if(repair){
   const allowed=await fs.realpath(path.join(root,'crawler/onboarding',cfg.brand));
   const file=await fs.realpath(args[3]);
   if(!file.startsWith(allowed+path.sep)||(await fs.stat(file)).size>32768)throw Error('REPAIR_SCOPE_INVALID');
   if(direct){
    urls=JSON.parse(await fs.readFile(file));
    if(!Array.isArray(urls)||!urls.length||urls.length>cfg.maxProductsPerRun||new Set(urls).size!==urls.length||urls.some(url=>{const u=new URL(url);return u.protocol!=='https:'||!cfg.allowedHosts.includes(u.hostname)||!u.pathname.startsWith(cfg.localePrefix)||!new RegExp(cfg.productPathPattern,'i').test(u.pathname)||u.username||u.password||!referenceCode(url,cfg.brand);}))throw Error('REPAIR_SCOPE_INVALID');
   }else urls=selectRepairUrls(JSON.parse(await fs.readFile(indexFile)),JSON.parse(await fs.readFile(file)),cfg);
   rows.push(row('TARGETED_REPAIR_NOT_FULL_CATALOG'));
  }else if(offset===0){
   const robots=await get(new URL('/robots.txt',cfg.entryUrl).href),queue=[...robots.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>m[1]),seen=new Set(),found=new Set();
   if(!queue.length)throw Error('SITEMAP_NOT_DECLARED');
   while(queue.length){
    const address=queue.shift();if(seen.has(address))continue;if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_LIMIT');seen.add(address);
    const xml=await get(address),children=[...xml.matchAll(/<(?:\w+:)?loc[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)].map(m=>m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim().replace(/&amp;/g,'&'));
    if(/<sitemapindex[\s>]/i.test(xml)){
     const local=children.filter(url=>{try{return new URL(url).pathname.startsWith(cfg.sitemapLocalePrefix??cfg.localePrefix.replace(/\/$/,''));}catch{return false;}});
     for(const child of local.length?local:children)queue.push(child);
    }else if(/<urlset[\s>]/i.test(xml)){
     for(const child of children){const u=new URL(child);if(cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix)&&new RegExp(cfg.productPathPattern,'i').test(u.pathname)&&referenceCode(child,cfg.brand))found.add(u.href);}
    }else throw Error('SITEMAP_FORMAT');
    if(found.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');
   }
   urls=[...found].sort();if(!urls.length)throw Error('REFERENCE_EMPTY');
   await fs.writeFile(sample?path.join(root,'crawler/brands',cfg.brand,'.reference-sample-index.json'):indexFile,JSON.stringify({checkedAt:new Date().toISOString(),urls}),{mode:0o600});
  }else{const index=JSON.parse(await fs.readFile(indexFile));if(Date.now()-Date.parse(index.checkedAt)>86400000)throw Error('REFERENCE_INDEX_STALE');urls=index.urls;}
  if(offset>=urls.length)throw Error('OFFSET_OUT_OF_RANGE');
  rows.push(row(`DISCOVERED_${urls.length}`),row(`BATCH_OFFSET_${offset}`));await save();
  const artifact=path.join(run,'artifacts');await fs.mkdir(artifact,{recursive:true});
  const batch=urls.slice(offset,offset+(sample?1:cfg.maxProductsPerRun));let failed=0;
  if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));
  for(const url of batch){
   try{
    const product=parseReferenceProduct(await get(url),url,cfg);
    recordAvailability(run,cfg,url,200,true);
    const image=await downloadAndOptimizeImage({request:{get:(url,options)=>{
     if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
     const target=new URL(url);if(target.protocol!=='https:'||!cfg.allowedHosts.includes(target.hostname))throw Error('UNAUTHORIZED_URL');
     return context.get(url,options);
    }}},product.image,artifact,product.normalizedCode);
    delete product.image;records.push({...product,...image});
    rows.push(row(product.price===null?'PRICE_UNPUBLISHED':'REFERENCE_IMAGE_READY',url,product.normalizedCode,product.price));
   }catch(e){
    if(/BLOCKED|LIMIT|UNAUTHORIZED|SANDBOX|GUARD|WORKER|RUNTIME|OFFLINE/.test(e.message))throw e;
    failed++;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PRODUCT_REQUEST_FAILED',url,referenceCode(url,cfg.brand)));
   }
   await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await save();
  }
  await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});
  rows.push(row(`BATCH_READY_${records.length}`),row(`BATCH_FAILED_${failed}`),row(`NEXT_OFFSET_${offset+batch.length}`),row(`REMAINING_${Math.max(0,urls.length-offset-batch.length)}`));await save();
  if(failed){await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:'PARTIAL_REFERENCE_BATCH'}));process.exitCode=2;}
 }catch(e){const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'REFERENCE_REQUEST_FAILED';rows.push(row(status));await save();await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:status}));process.exitCode=/UNAUTHORIZED|SANDBOX|GUARD/.test(status)?78:1;}
 finally{await closeImageProcessor();await context.dispose();}
}
