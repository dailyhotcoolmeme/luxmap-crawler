import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';

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
   else if(/\/category\/leather-goods\/bags-and-clutches\//.test(url.pathname)){
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
