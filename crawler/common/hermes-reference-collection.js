import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectHermesListingEvidence} from './hermes-listing-evidence.js';
import {declaredCountrySitemapUrls} from './van-cleef-foreign.js';
import {parseOfficialProduct} from './hermes-collection.js';

export function publishedHermesSearch(html,cfg){
 const found=new Set();for(const form of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
  const attrs={};for(const a of form[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[a[1].toLowerCase()]=decodeHtml(a[2]);
  if((attrs.method??'GET').toUpperCase()!=='GET'||!attrs.action||!/<input\b[^>]*\bname\s*=\s*["']s["']/i.test(form[2]))continue;
  const u=new URL(attrs.action,cfg.entryUrl);if(u.origin==='https://www.hermes.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith(cfg.localePrefix))found.add(u.href);
 }
 if(found.size!==1)throw Error('PUBLISHED_SEARCH_FORM_REQUIRED');return [...found][0];
}

export async function collectHermesSearchPrices(){
 const args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..');
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_BRAND!=='hermes'||args.length!==4||args[0]!=='--country-config'||args[2]!=='--prices-search-offset'||!/^\d+$/.test(args[3])||!['JP','SG'].includes(cfg.country))throw Error('GUARDED_PRICE_RUN_REQUIRED');
 const kr=await fs.readFile(root+'/crawler/brands/hermes/.reference-index.json'),index=JSON.parse(kr),fingerprint=createHash('sha256').update(kr).digest('hex'),country=cfg.country.toLowerCase(),folder=root+`/crawler/onboarding/hermes/foreign-search/${country}`,cacheFile=folder+'/attempts.json',rows=[],records=[],offset=Number(args[3]);
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});let calls=0,cache;
 const row=(status,p={})=>({brand:'hermes',country:cfg.country,parentModel:'공식 검색 동일 한국 SKU 가격',variantCode:p.normalizedCode??'RUN',price:p.price??null,currency:cfg.currency,status,officialUrl:p.officialUrl??cfg.entryUrl});
 async function get(address){const u=new URL(address);if(u.protocol!=='https:'||u.host!=='www.hermes.com'||u.username||u.password||u.hash||!u.pathname.startsWith(cfg.localePrefix)||[...u.searchParams.keys()].some(k=>k!=='s'))throw Error('UNAUTHORIZED_URL');if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const r=await context.get(u.href,{maxRedirects:0,maxRetries:0});if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error('HTTP_'+r.status());const b=await r.body();if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const html=b.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(html))throw Error('ACCESS_BLOCKED');await fs.writeFile(run+`/raw/${calls}.source`,b,{mode:0o600});return html;}
 try{
  await fs.mkdir(folder,{recursive:true});await fs.mkdir(run+'/artifacts',{recursive:true});
  const prior=JSON.parse(await fs.readFile(root+`/crawler/brands/hermes/.foreign-listing-${country}.json`));if(prior.fingerprint!==fingerprint||!Number.isFinite(Date.parse(prior.checkedAt))||Date.now()-Date.parse(prior.checkedAt)>86400000||!prior.sourceRun?.startsWith(root+`/crawler/runs/hermes/${country}/`)||spawnSync(root+'/scripts/crawl-output-guard.sh',[prior.sourceRun+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
  const home=prior.sourceRun+'/raw/1.source',mode=(await fs.stat(home)).mode&0o777;let html;try{await fs.chmod(home,0o600);html=await fs.readFile(home,'utf8');}finally{await fs.chmod(home,mode);}
  const search=publishedHermesSearch(html,cfg),targets=index.products.filter(p=>!prior.products.some(v=>v.sku===p.code));
  try{cache=JSON.parse(await fs.readFile(cacheFile));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(cache&&(cache.fingerprint!==fingerprint||cache.halted))throw Error('SEARCH_ALREADY_HALTED');cache??={fingerprint,attempted:[]};
  const batch=targets.slice(offset,offset+25);if(!batch.length)throw Error('NO_REMAINING_TARGETS');let failed=0;
  for(const p of batch){
   if(cache.attempted.includes(p.code))throw Error('REFERENCE_ALREADY_ATTEMPTED');cache.attempted.push(p.code);await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});
   const query=new URL(search);query.searchParams.set('s',p.code);const ref={normalizedCode:p.code,officialUrl:query.href};
   try{
    const html=await get(query.href),evidence=inspectHermesListingEvidence(html,{includeVisiblePrices:true,market:cfg}),matches=evidence.records.filter(v=>v.sku===p.code&&v.currency===cfg.currency&&v.price!==null&&!v.priceConflict),prices=[...new Set(matches.map(v=>v.price))];let parsed;
    if(prices.length>1)throw Error('PRICE_CONFLICT');
    if(matches.length)parsed={brand:'hermes',originalCode:p.code,normalizedCode:p.code,productName:matches[0].name,price:matches[0].price,priceStatus:'confirmed',officialUrl:matches[0].url,country:cfg.country,currency:cfg.currency,checkedAt:new Date().toISOString()};
    else{const urls=[...new Set(evidence.published.filter(v=>v.sku===p.code).map(v=>v.url))];if(urls.length!==1)throw Error('SEARCH_EXACT_SKU_NOT_FOUND');parsed=parseOfficialProduct(await get(urls[0]),urls[0],cfg,{expectedCode:p.code,priceOnly:true});}
    records.push(parsed);rows.push(row('COUNTRY_PRICE_READY',parsed));
   }catch(e){if(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD|CONFLICT/.test(e.message))throw e;failed++;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SEARCH_SOURCE_FAILED',ref));}
  }
  rows.push(...['BATCH_READY_'+records.length,'BATCH_FAILED_'+failed,'NEXT_OFFSET_'+(offset+batch.length),'REMAINING_'+Math.max(0,targets.length-offset-batch.length)].map(s=>row(s)));if(failed)process.exitCode=2;
 }catch(e){const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SEARCH_SOURCE_FAILED';rows.push(row(status));if(cache){cache.halted=true;await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});}process.exitCode=/UNAUTHORIZED|LIMIT|GUARD|CONFLICT/.test(status)?78:1;
 }finally{await fs.mkdir(run+'/artifacts',{recursive:true});await fs.writeFile(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});await context.dispose();}
}

export async function collectHermesSitemapPrices(){
 const args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..');
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_BRAND!=='hermes'||args.length!==4||args[0]!=='--country-config'||args[2]!=='--prices-sitemap-offset'||!/^\d+$/.test(args[3])||!['JP','FR','IT','ES','US','SG','HK'].includes(cfg.country))throw Error('GUARDED_PRICE_RUN_REQUIRED');
 const kr=await fs.readFile(root+'/crawler/brands/hermes/.reference-index.json'),index=JSON.parse(kr),fingerprint=createHash('sha256').update(kr).digest('hex'),folder=root+`/crawler/onboarding/hermes/foreign-sitemap/${cfg.country.toLowerCase()}`,cacheFile=folder+'/source-cache.json',offset=Number(args[3]),rows=[],records=[];
 const row=(status,p={})=>({brand:'hermes',country:cfg.country,parentModel:'공식 사이트맵 동일 한국 SKU 가격',variantCode:p.normalizedCode??'RUN',price:p.price??null,currency:cfg.currency,status,officialUrl:p.officialUrl??cfg.entryUrl});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});let calls=0,cache;
 const save=()=>fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
 async function get(address){
  const u=new URL(address);if(u.protocol!=='https:'||u.host!=='www.hermes.com'||u.username||u.password||u.search||u.hash||!(u.pathname==='/robots.txt'||u.pathname.startsWith(cfg.localePrefix)))throw Error('UNAUTHORIZED_URL');
  if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
  const r=await context.get(u.href,{maxRedirects:0,maxRetries:0});if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error('HTTP_'+r.status());
  const b=await r.body();if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const html=b.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(html))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(run+`/raw/${calls}.source`,b,{mode:0o600});return {html,url:u.href};
 }
 try{
  await fs.mkdir(folder,{recursive:true});await fs.mkdir(run+'/artifacts',{recursive:true});
  try{cache=JSON.parse(await fs.readFile(cacheFile));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(cache&&(cache.fingerprint!==fingerprint||Date.now()-Date.parse(cache.checkedAt)>86400000))throw Error('SITEMAP_CACHE_STALE');
  if(cache?.halted)throw Error('SITEMAP_STRATEGY_ALREADY_HALTED');
  if(!cache){
   const urls=await declaredCountrySitemapUrls(get,{...cfg,productPathPattern:'/product/',sitemapLocalePrefix:cfg.localePrefix});
   let listed=[];try{const old=JSON.parse(await fs.readFile(root+`/crawler/brands/hermes/.foreign-listing-${cfg.country.toLowerCase()}.json`));if(old.fingerprint===fingerprint)listed=old.products??[];}catch{}
   const targets=index.products.filter(p=>!listed.some(v=>v.sku===p.code)).map(p=>{const matches=urls.filter(url=>hermesReferenceCode(url)===p.code);return {code:p.code,url:matches.length===1?matches[0]:null};});
   cache={fingerprint,checkedAt:new Date().toISOString(),sourceRun:run,targets,attempted:[]};await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});
   rows.push(row('DECLARED_COUNTRY_URLS_'+urls.length));
  }
  if(offset>=cache.targets.length)throw Error('NO_REMAINING_TARGETS');let failed=0;const batch=cache.targets.slice(offset,offset+25);
  for(const p of batch){
   const ref={normalizedCode:p.code,officialUrl:p.url??cfg.entryUrl};
   if(!p.url){failed++;rows.push(row('COUNTRY_SITEMAP_REFERENCE_MISSING',ref));continue;}
   if(cache.attempted.includes(p.code))throw Error('REFERENCE_ALREADY_ATTEMPTED');
   cache.attempted.push(p.code);await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});
   try{const page=await get(p.url),parsed=parseOfficialProduct(page.html,page.url,cfg,{expectedCode:p.code,priceOnly:true});records.push(parsed);rows.push(row('COUNTRY_PRICE_READY',parsed));}
   catch(e){if(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD/.test(e.message))throw e;failed++;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PRODUCT_SOURCE_FAILED',ref));}
   await save();
  }
  rows.push(...['BATCH_READY_'+records.length,'BATCH_FAILED_'+failed,'NEXT_OFFSET_'+(offset+batch.length),'REMAINING_'+Math.max(0,cache.targets.length-offset-batch.length)].map(s=>row(s)));if(failed)process.exitCode=2;
 }catch(e){const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SITEMAP_SOURCE_FAILED';rows.push(row(status));if(cache){cache.halted=true;await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});}else await fs.writeFile(cacheFile,JSON.stringify({fingerprint,checkedAt:new Date().toISOString(),halted:true}),{mode:0o600});process.exitCode=/UNAUTHORIZED|LIMIT|GUARD/.test(status)?78:1;
 }finally{await fs.mkdir(run+'/artifacts',{recursive:true});await fs.writeFile(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});await save();await context.dispose();}
}

export async function collectHermesForeignPrices(){
 const args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..');
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_BRAND!=='hermes'||!['JP','FR','IT','ES','US','SG','HK'].includes(cfg.country)||args[0]!=='--country-config'||args[2]!=='--prices-offset'||!/^\d+$/.test(args[3]??'')||![4,6].includes(args.length)||args.length===6&&(args[4]!=='--limit'||args[5]!=='1'))throw Error('GUARDED_PRICE_RUN_REQUIRED');
 const offset=Number(args[3]),sample=args.length===6,rows=[],records=[],artifact=path.join(run,'artifacts'),cacheFile=path.join(root,`crawler/brands/hermes/.foreign-listing-${cfg.country.toLowerCase()}.json`);
 const krBytes=await fs.readFile(path.join(root,'crawler/brands/hermes/.reference-index.json')),index=JSON.parse(krBytes),fingerprint=createHash('sha256').update(krBytes).digest('hex');
 const targets=[...new Set(index.products.map(p=>p.code))].sort();if(!targets.length||targets.length>cfg.maxCandidates)throw Error('REFERENCE_SCOPE_INVALID');
 const row=(status,p={})=>({brand:'hermes',country:cfg.country,parentModel:'한국 SKU 해외 가격',variantCode:p.sku??'RUN',price:p.price??null,currency:cfg.currency,status,officialUrl:p.url??cfg.entryUrl});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});let calls=0,cache;
 async function get(address){
  const u=new URL(address);if(u.protocol!=='https:'||u.host!=='www.hermes.com'||u.username||u.password||!u.pathname.startsWith(cfg.localePrefix)||cfg.localePrefix.split('/')[1]!==cfg.country.toLowerCase())throw Error('UNAUTHORIZED_URL');
  if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
  const r=await context.get(u.href,{maxRedirects:0,maxRetries:0});if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error('HTTP_'+r.status());
  if(!/text\/html/i.test(r.headers()['content-type']??''))throw Error('SOURCE_NOT_HTML');const b=await r.body();if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  const text=b.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(text))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(path.join(run,'raw',calls+'.source'),b,{mode:0o600});return text;
 }
 try{
  await fs.mkdir(artifact,{recursive:true});try{cache=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(cache?.blocked)throw Error('PREVIOUS_COUNTRY_BLOCKED');
  if(cache&&!(cache.fingerprint===fingerprint&&Date.now()-Date.parse(cache.checkedAt)<86400000&&cache.country===cfg.country&&cache.currency===cfg.currency&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[cache.sourceRun+'/summary.json'],{stdio:'ignore'}).status===0))cache=null;
  if(!cache){
   const home=await get(cfg.entryUrl),queue=[...hermesReferenceLinks(home,cfg.entryUrl,cfg).listings],seen=new Set(),found=new Map();if(!queue.length)throw Error('COUNTRY_LISTING_MISSING');
   while(queue.length){const url=queue.shift();if(seen.has(url))continue;if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_PAGE_LIMIT');seen.add(url);const html=await get(url);
    for(const p of inspectHermesListingEvidence(html,{includeVisiblePrices:true,market:cfg}).records){if(!targets.includes(p.sku)||p.price===null||p.currency!==cfg.currency)continue;const old=found.get(p.sku);if(old&&old.price!==p.price)throw Error('PRICE_CONFLICT');found.set(p.sku,{sku:p.sku,url:p.url,price:p.price,name:p.name});}
    for(const next of hermesReferenceLinks(html,url,cfg).listings)if(!seen.has(next)&&!queue.includes(next))queue.push(next);
   }
   cache={country:cfg.country,currency:cfg.currency,fingerprint,checkedAt:new Date().toISOString(),sourceRun:run,products:[...found.values()]};await fs.writeFile(cacheFile,JSON.stringify(cache),{mode:0o600});rows.push(row('COUNTRY_LISTING_CAPTURED'));
  }
  rows.push(row('KOREAN_REFERENCES_'+targets.length),row('LISTING_PRICE_MATCHES_'+cache.products.length));
  const selected=sample?targets.filter(c=>cache.products.some(p=>p.sku===c)).slice(0,1):targets.slice(offset,offset+25);if(!selected.length)throw Error('NO_COUNTRY_PRICE_MATCH');let failed=0;
  for(const code of selected){const p=cache.products.find(p=>p.sku===code);if(!p){failed++;rows.push(row('UNPROCESSED_COUNTRY_LISTING',{sku:code}));continue;}
   records.push({brand:'hermes',country:cfg.country,currency:cfg.currency,originalCode:code,normalizedCode:code,price:p.price,priceStatus:'confirmed',productName:p.name,officialUrl:p.url,checkedAt:new Date().toISOString()});rows.push(row('COUNTRY_PRICE_READY',p));}
  rows.push(row('BATCH_READY_'+records.length),row('BATCH_FAILED_'+failed),row('NEXT_OFFSET_'+(offset+selected.length)),row('REMAINING_'+Math.max(0,targets.length-offset-selected.length)));if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));if(failed)process.exitCode=2;
 }catch(e){const code=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'COUNTRY_SOURCE_FAILED';rows.push(row(code));if(code==='ACCESS_BLOCKED')await fs.writeFile(cacheFile,JSON.stringify({blocked:true,country:cfg.country}),{mode:0o600});process.exitCode=/UNAUTHORIZED|LIMIT|GUARD|CONFLICT/.test(code)?78:1;}
 finally{await fs.mkdir(artifact,{recursive:true});await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});await context.dispose();}
}

export const hermesReferenceCode=url=>new URL(url).pathname.match(/\/product\/[^/]+-(H[A-Z0-9]{8,19})\/?$/i)?.[1]?.toUpperCase()??null;
export function hermesReferenceLinks(html,base,cfg){
 const product=new Map(),listings=new Set();
 for(const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)){
  try{
   const url=new URL(decodeHtml(match[1]),base);
   if(url.protocol!=='https:'||url.hostname!=='www.hermes.com'||url.username||url.password||!url.pathname.startsWith(cfg.localePrefix))continue;
   if(/\/assets\/|\.(?:png|jpe?g|webp|svg|gif|ico|js|css|woff2?|ttf)$/i.test(url.pathname))continue;
   url.hash='';
   const code=hermesReferenceCode(url.href);
   if(code){url.search='';product.set(code,url.href);}
   else if(/\/category\/.*(?:bags|clutches|sacs|borse|bolsos)(?:[-/]|$)/i.test(url.pathname)){
    // Facets are alternate views, not independent discovery pages. Follow only
    // pagination actually published by the official list.
    if([...url.searchParams.keys()].some(key=>!['page','offset','start'].includes(key)))continue;
    listings.add(url.href);
   }
  }catch{}
 }
 return {product,listings};
}
export async function discoverHermesReference(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_BRAND!=='hermes')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);
 if(args.length!==3||args[0]!=='--country-config'||args[2]!=='--discover-reference')throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,rows=[];
 if(cfg.brand!=='hermes'||cfg.country!=='KR')throw Error('KOREAN_REFERENCE_REQUIRED');
 let calls=0,activeUrl=cfg.entryUrl;const seen=new Set(),products=new Map();
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 const row=(status,url=activeUrl)=>({brand:'hermes',country:'KR',parentModel:'한국 공식 가방 전체 발견',variantCode:'RUN',price:null,currency:'KRW',status,officialUrl:url});
 async function get(raw){
  let url=new URL(raw);
  for(let hop=0;hop<4;hop++){
   if(url.protocol!=='https:'||url.username||url.password||url.hostname!=='www.hermes.com'||!url.pathname.startsWith(cfg.localePrefix))throw Error('UNAUTHORIZED_URL');
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');activeUrl=url.href;
   const response=await context.get(url.href,{maxRedirects:0});
   if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(response.status())){url=new URL(response.headers().location,url);rows.push(row('OFFICIAL_REDIRECT',url.href));continue;}
   if(!response.ok())throw Error(`HTTP_${response.status()}`);
   if(!/text\/html/i.test(response.headers()['content-type']??''))throw Error('SOURCE_NOT_HTML');
   const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   const html=body.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(html))throw Error('ACCESS_BLOCKED');
   await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});return html;
  }throw Error('REDIRECT_LIMIT');
 }
 try{
  const homepage=await get(cfg.entryUrl),published=hermesReferenceLinks(homepage,cfg.entryUrl,cfg),queue=[...published.listings];
  if(!queue.length)throw Error('CATEGORY_SOURCE_MISSING');
  while(queue.length){
   const url=queue.shift();if(seen.has(url))continue;if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_PAGE_LIMIT');seen.add(url);
   rows.push(row('PUBLISHED_BAG_LIST_VISITED',url));
   const links=hermesReferenceLinks(await get(url),url,cfg);
   for(const[code,target]of links.product){
    const previous=products.get(code);
    if(previous&&previous.url!==target)throw Error('DUPLICATE_SKU_URL');
    products.set(code,{code,url:target,listingUrl:url});
   }
   if(products.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');
   for(const target of links.listings)if(!seen.has(target)&&!queue.includes(target))queue.push(target);
  }
  if(!products.size)throw Error('REFERENCE_EMPTY');
  const index={checkedAt:new Date().toISOString(),scope:'published-korean-bag-lists',pages:[...seen],products:[...products.values()].sort((a,b)=>a.code.localeCompare(b.code))};
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});
  await fs.writeFile(path.join(run,'artifacts','reference-index.json'),JSON.stringify(index),{mode:0o600});
  await fs.writeFile(path.resolve(import.meta.dirname,'../brands/hermes/.reference-index.json'),JSON.stringify(index),{mode:0o600});
  rows.push(row(`LISTING_PAGES_${seen.size}`),row(`DISCOVERED_${products.size}`),row('REFERENCE_DISCOVERED_NOT_INGESTED'));
 }catch(error){const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SOURCE_REQUEST_FAILED';rows.push(row(`LISTING_PAGES_${seen.size}`),row(`UNVERIFIED_CANDIDATES_${products.size}`),row(status));process.exitCode=/UNAUTHORIZED|LIMIT/.test(status)?78:1;}
 finally{await context.dispose();await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});}
}
