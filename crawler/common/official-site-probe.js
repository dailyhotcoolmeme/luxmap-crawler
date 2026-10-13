import fs from 'node:fs/promises';
import path from 'node:path';
import {request,chromium} from 'playwright-core';
import {listingTiles} from './official-listing-tiles.js';

// Read-only onboarding. It is not a complete catalog or an ingestion adapter.
export async function probeOfficialSite({contextFactory=options=>request.newContext(options)}={}){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);
 if(args.length!==3||args[0]!=='--country-config'||!['--probe-source','--probe-listing-source','--probe-browser-source'].includes(args[2]))throw Error('READ_ONLY_PROBE_REQUIRED');
 const listingOnly=args[2]==='--probe-listing-source';
 const browserMode=args[2]==='--probe-browser-source';
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR;
 let browser,browserPage,browserBlock=null,documentRequests=0;
 let context;
 if(browserMode){
  if(!process.env.CRAWL_CDP_URL)throw Error('MANAGED_BROWSER_REQUIRED');
  browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL);
  context=await browser.newContext({javascriptEnabled:false});browserPage=await context.newPage();
  await context.route('**/*',async route=>{
   const r=route.request();
   // No scripts, images, fonts, XHR, widgets or challenge execution. This is
   // ordinary document navigation, without stealth, cookie import or solving.
   if(r.resourceType()!=='document')return route.abort();
   const u=new URL(r.url());
   if(/(?:__cf_chl|cf-chl|captcha|challenge-platform)/i.test(u.href)){browserBlock='ACCESS_BLOCKED';return route.abort();}
   if(u.protocol!=='https:'||u.username||u.password||!cfg.allowedHosts.includes(u.hostname)){browserBlock='UNAUTHORIZED_URL';return route.abort();}
   let hops=0,parent=r.redirectedFrom();while(parent){hops++;parent=parent.redirectedFrom();}
   if(hops>=4){browserBlock='REDIRECT_LIMIT';return route.abort();}
   if(++documentRequests>30){browserBlock='REQUEST_LIMIT';return route.abort();}
   return route.continue();
  });
 }else context=await contextFactory({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
 const records=[],links=new Set(),listingProducts=[];let calls=0;
 const safe=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!cfg.allowedHosts.includes(u.hostname))throw Error('UNAUTHORIZED_URL');return u.href;};
 async function get(value){
  let url=safe(value);
  if(new URL(url).hostname==='bottega-veneta.dam.kering.com')throw Error('UNAUTHORIZED_URL');
  for(let hop=0;hop<4;hop++){
   if(++calls>30)throw Error('REQUEST_LIMIT');
   let r;
   try{r=browserMode?await browserPage.goto(url,{waitUntil:'domcontentloaded',timeout:30000}):await context.get(url,{maxRedirects:0});}catch(error){if(browserBlock)throw Error(browserBlock);throw error;}
   if(!r)throw Error('SOURCE_RESPONSE_MISSING');
   if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(r.status())){url=safe(new URL(r.headers().location,url).href);continue;}
   if(!r.ok())throw Error(`HTTP_${r.status()}`);
   const body=await r.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');
   await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});
   const text=body.toString('utf8');
   if(browserMode&&(/<title[^>]*>\s*(?:just a moment|access denied|attention required|security check)/i.test(text)||/cf-chl|challenge-platform|px-captcha/i.test(text)))throw Error('ACCESS_BLOCKED');
   return {url:browserMode?r.url():url,text};
  }throw Error('REDIRECT_LIMIT');
 }
 const summary=(status,url=cfg.entryUrl,code='SOURCE',name='공식 수집 경로 점검',price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:String(name).slice(0,120),variantCode:String(code).slice(0,120),price,currency:cfg.currency,status,officialUrl:url});
 try{
  const robots=await get(new URL('/robots.txt',cfg.entryUrl).href);
  let sitemaps=[...robots.text.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>m[1]).filter(u=>{try{return cfg.allowedHosts.includes(new URL(u).hostname);}catch{return false;}});
  const localSitemaps=sitemaps.filter(url=>new URL(url).pathname.startsWith(cfg.localePrefix.replace(/\/$/,'')));
  if(localSitemaps.length)sitemaps=localSitemaps;
  records.push(summary(`DECLARED_SITEMAPS_${sitemaps.length}`));
  const home=await get(cfg.entryUrl);
  for(const match of home.text.matchAll(/href\s*=\s*["']([^"']+)["']/gi))try{
   const u=new URL(match[1].replace(/&amp;/g,'&'),home.url);
   if(u.protocol==='https:'&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix))links.add(u.href);
  }catch{}
  records.push(summary(`LOCALE_LINKS_${links.size}`,home.url));
  // Only explicitly declared, same-host sitemaps; no guessed endpoints.
  // This bounded first-source check cannot assert catalog completeness.
  const queue=listingOnly?[]:[...new Set([...(cfg.probeSitemapUrls??[]),...sitemaps])],seen=new Set();let checked=0;
  while(queue.length&&checked<8){
   const address=queue.shift();if(seen.has(address))continue;seen.add(address);
   const xml=await get(address);checked++;
   const children=[...xml.text.matchAll(/<(?:\w+:)?loc[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)].map(m=>m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim().replace(/&amp;/g,'&'));
   if(/<sitemapindex[\s>]/i.test(xml.text)){
    const local=children.filter(child=>{try{return cfg.allowedHosts.includes(new URL(child).hostname)&&new URL(child).pathname.startsWith(cfg.localePrefix.replace(/\/$/,''));}catch{return false;}});
    if(local.length)queue.unshift(...local.map(safe));
    else for(const child of children)try{const u=new URL(child);if(cfg.allowedHosts.includes(u.hostname)&&(u.pathname.includes('ko')||queue.length<4))queue.push(safe(child));}catch{}
   }else if(/<urlset[\s>]/i.test(xml.text)){
    for(const child of children)try{const u=new URL(child);if(cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix))links.add(safe(child));}catch{}
   }else records.push(summary('UNSUPPORTED_SITEMAP_FORMAT',xml.url));
  }
  records.push(summary(`SITEMAP_DOCS_CHECKED_${checked}`));
  if(queue.length)records.push(summary('SOURCE_PROBE_PARTIAL'));
  const pattern=new RegExp(cfg.productPathPattern??'[A-Z0-9]{8,}(?:\\.[A-Z0-9]+)?(?:\\.html)?/?$','i');
  const candidates=listingOnly?[]:[...new Set([...(cfg.probeProductUrls??[]),...[...links].filter(url=>pattern.test(decodeURIComponent(new URL(url).pathname)))])];
  candidates.sort((a,b)=>Number(/\/(?:가방|핸드백|handbags|bags)\//i.test(decodeURIComponent(new URL(b).pathname)))-Number(/\/(?:가방|핸드백|handbags|bags)\//i.test(decodeURIComponent(new URL(a).pathname))));
  if(cfg.brand==='bottega-veneta')candidates.sort((a,b)=>Number((cfg.probeProductUrls??[]).includes(b))-Number((cfg.probeProductUrls??[]).includes(a))||Number(/조디|jodie/i.test(decodeURIComponent(new URL(b).pathname)))-Number(/조디|jodie/i.test(decodeURIComponent(new URL(a).pathname))));
  records.push(summary(`PRODUCT_CANDIDATES_${candidates.length}`));
  for(const url of candidates.slice(0,3)){
   const page=await get(url);let found=false;
   for(const script of page.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let obj;try{obj=JSON.parse(script[1]);}catch{continue;}
    const visit=value=>{
     if(!value||typeof value!=='object')return;
     if([value['@type']].flat().includes('Product')&&value.sku){
      const normalize=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
      const code=normalize(value.sku),pathCode=normalize(decodeURIComponent(new URL(page.url).pathname).replace(/\.html$/i,''));
      if(!code||!pathCode.endsWith(code))return;
      const offer=[value.offers].flat().find(o=>o&&o.priceCurrency===cfg.currency),price=Number(offer?.price);
      records.push(summary('EXACT_PRODUCT_SCHEMA',page.url,value.sku,value.name,Number.isFinite(price)&&price>0?price:null));found=true;
     }Object.values(value).forEach(visit);
    };visit(obj);
   }
   if(!found)records.push(summary('EXACT_PRODUCT_SCHEMA_MISSING',page.url));
  }
  if(listingOnly)for(const url of (cfg.probeListingUrls??[]).slice(0,2)){
   const page=await get(url);let found=0;
   for(const script of page.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let obj;try{obj=JSON.parse(script[1]);}catch{continue;}
    const visit=value=>{
     if(!value||typeof value!=='object')return;
     if([value['@type']].flat().includes('Product')&&value.sku){
      try{
       const target=new URL(value.url??value['@id']??value.offers?.url,page.url);
       const code=String(value.sku).replace(/[^a-z0-9]/gi,'').toUpperCase(),end=decodeURIComponent(target.pathname).replace(/\.html\/?$/i,'').replace(/\/$/,'').replace(/[^a-z0-9]/gi,'').toUpperCase();
       if(!code||!cfg.allowedHosts.includes(target.hostname)||!target.pathname.startsWith(cfg.localePrefix)||!end.endsWith(code))return;
       const offer=[value.offers].flat().find(o=>o&&o.priceCurrency===cfg.currency),rawPrice=String(offer?.price??''),price=Number(/^\d{1,3}(?:,\d{3})+$/.test(rawPrice)?rawPrice.replaceAll(',',''):rawPrice);
       if(!Number.isFinite(price)||price<=0)return;
       found++;listingProducts.push({sku:value.sku,url:target.href,name:value.name,price,currency:cfg.currency,color:value.color??null,material:value.material??null,description:value.description??null,image:[value.image].flat().map(image=>typeof image==='string'?image:image?.url??image?.contentUrl).filter(v=>typeof v==='string'&&v.startsWith('https://')),width:value.width??null,height:value.height??null,depth:value.depth??null,groupId:value.isVariantOf?.productGroupID??null,groupName:value.isVariantOf?.name??null});
       if(found<=3)records.push(summary('LISTING_EXACT_PRODUCT',target.href,value.sku,value.name,price));
      }catch{}
     }
     Object.values(value).forEach(visit);
    };visit(obj);
   }
   records.push(summary(`LISTING_PRICED_PRODUCTS_${found}`,page.url));
   const tiles=listingTiles(page.text,page.url,cfg);
   for(const tile of tiles){if(!listingProducts.some(p=>p.sku===tile.sku))listingProducts.push(tile);}
   records.push(summary(`LISTING_TILE_PRODUCTS_${tiles.length}`,page.url));
   for(const tile of tiles.slice(0,3))records.push(summary('EXACT_LISTING_TILE',tile.url,tile.sku,tile.name,tile.price));
  }
  for(const script of home.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
   let obj;try{obj=JSON.parse(script[1]);}catch{continue;}
   const visit=value=>{
    if(!value||typeof value!=='object')return;
    if([value['@type']].flat().includes('Product')&&value.sku){
     const offer=[value.offers].flat().find(o=>o&&o.priceCurrency===cfg.currency);
     const price=Number(offer?.price);records.push(summary('PRODUCT_SCHEMA',home.url,value.sku,value.name,Number.isFinite(price)&&price>0?price:null));
    }Object.values(value).forEach(visit);
   };visit(obj);
  }
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});
  await fs.writeFile(path.join(run,'artifacts','source-index.json'),JSON.stringify({sitemaps,links:[...links],entryUrl:home.url}),{mode:0o600});
  if(listingOnly)await fs.writeFile(path.join(run,'artifacts','listing-source-products.json'),JSON.stringify(listingProducts),{mode:0o600});
 }catch(error){
  const status=/^(ACCESS_BLOCKED|UNAUTHORIZED_URL|REQUEST_LIMIT|RESPONSE_LIMIT|REDIRECT_LIMIT|HTTP_\d{3})$/.test(error.message)?error.message:'SOURCE_REQUEST_FAILED';
  records.push(summary(status));
  await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:status}));process.exitCode=1;
 }finally{
  await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(records.slice(0,25)));
  if(browserMode){await context.close();await browser.close();}else await context.dispose();
 }
}
