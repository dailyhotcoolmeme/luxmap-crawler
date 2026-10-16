import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {request,chromium} from 'playwright-core';
import {parseLouisVuittonProduct} from './louis-vuitton-product.js';
import {inspectDiorNativeEvidence} from '../../scripts/report-dior-native-evidence.mjs';
import {diorDetailAttributes} from './dior-detail-attributes.js';

const bagWords=/(?:handbags?|shoulder bags?|tote bags?|crossbody bags?|clutches?|가방|핸드백|숄더백|토트백|크로스백|バッグ|sacs?|borse|bolsos?)/i;
const blocked=/(?:<title[^>]*>\s*(?:just a moment|access denied|attention required|security check)|cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human)/i;
export const normalizeOfficialCode=value=>String(value??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
export const isDiorBagName=name=>/(?:\s백(?:\s|$)|토트|숄더|핸드백|크로스백|백팩|벨트백|스트랩백|보스턴|호보|클러치|파우치|브리프케이스|메신저|tote|handbag|shoulder bag|backpack|clutch|pouch|briefcase|messenger)/i.test(name)&&!/(?:스트랩|참|strap|charm)\s*$/i.test(name);
const typeIs=(node,type)=>[node?.['@type']].flat().includes(type);

export function officialUrl(value,cfg,base=cfg.entryUrl){
 const u=new URL(value,base),origin=new URL(cfg.entryUrl);
 if(u.protocol!=='https:'||u.username||u.password||u.hostname!==origin.hostname||!u.pathname.toLowerCase().startsWith(cfg.localePrefix.toLowerCase()))throw Error('COUNTRY_URL_MISMATCH');
 if(cfg.brand==='the-row'&&cfg.country==='US'&&/^\/[a-z]{2}-[a-z]{2}\//i.test(u.pathname))throw Error('COUNTRY_URL_MISMATCH');
 u.hash='';return u.href;
}
function nodes(html){
 const out=[];let count=0;
 function walk(x){if(++count>50000)throw Error('METADATA_LIMIT');if(!x||typeof x!=='object')return;out.push(x);for(const value of Object.values(x))walk(value);}
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{walk(JSON.parse(m[1]));}catch(error){if(error.message==='METADATA_LIMIT')throw error;}
 }
 return out;
}
export function parseOfficialProduct(html,url,cfg,expectedCode=null,{handbagEvidence=false}={}){
 if(blocked.test(html))throw Error('ACCESS_BLOCKED');
 url=officialUrl(url,cfg);
 if(cfg.brand==='louis-vuitton')return parseLouisVuittonProduct(html,url,cfg,expectedCode,{handbagEvidence});
 const products=nodes(html).filter(p=>typeIs(p,'Product')&&normalizeOfficialCode(p.sku||p.mpn));
 if(cfg.brand==='dior'&&!products.some(p=>normalizeOfficialCode(p.sku||p.mpn)===normalizeOfficialCode(expectedCode??new URL(url).pathname.split('/').filter(Boolean).at(-1)))){
  const native=inspectDiorNativeEvidence(html);
  for(const p of native.records){
   // Missing nested image must still reach the existing exact-canonical,
   // exact-SKU official og:image fallback below. Image validation is mandatory.
   if(p.url!==url||!p.name||p.price===null||p.currency!==cfg.currency||p.priceConflict||p.nameConflict)continue;
   // Field mapping stays on one explicit SKU object. No page-wide price or
   // neighboring product image is borrowed when JSON-LD is missing.
   products.push({'@type':'Product',sku:p.sku,name:p.name,url:p.url,category:p.category,image:p.images,offers:{price:p.price,priceCurrency:p.currency,url:p.url}});
  }
 }
 const terminal=decodeURIComponent(new URL(url).pathname).split('/').at(-1).replace(/\.html?$/i,'');
 const pathReference=terminal.match(/(?:^|[-_])([A-Z0-9]{8,})$/i)?.[1]??null;
 const matches=products.filter(p=>{
  const code=normalizeOfficialCode(p.sku||p.mpn),pathCode=normalizeOfficialCode(decodeURIComponent(new URL(url).pathname));
  let canonical=false;try{canonical=!!p.url&&officialUrl(p.url,cfg,url)===url;}catch{}
  return (!expectedCode||code===normalizeOfficialCode(expectedCode))&&(!pathReference||normalizeOfficialCode(pathReference)===code)&&(pathCode.includes(code)||canonical);
 });
 if(matches.length!==1)throw Error('EXACT_SKU_MISSING');
 const p=matches[0],code=normalizeOfficialCode(p.sku||p.mpn);
 if(p.mpn&&normalizeOfficialCode(p.mpn)!==code)throw Error('SKU_CONFLICT');
 if(p.url&&officialUrl(p.url,cfg,url)!==url)throw Error('PRODUCT_URL_MISMATCH');
 if(cfg.brand==='dior'&&!isDiorBagName(clean(p.name))){
  // Global category navigation also exposes clothing. Classify only from the
  // exact Product object, before unrelated clothing-size offers are examined.
  if(/(?:스커트|재킷|자켓|코트|셔츠|티셔츠|드레스|팬츠|스웨터|가디건|풀오버|스카프|트윌리|스니커즈|로퍼|펌프스|샌들|부츠|벨트|반지|귀걸이|목걸이|브레이슬릿)(?:\s|$)/i.test(clean(p.name)))throw Error('NON_BAG_CONFIRMED');
  throw Error('CLASSIFICATION_UNRESOLVED');
 }
 const brand=typeof p.brand==='string'?p.brand:p.brand?.name;
 const names={dior:/\bdior\b/i,'miu-miu':/miu\s*miu/i,'the-row':/the\s*row/i};
 if(brand&&!names[cfg.brand]?.test(brand))throw Error('BRAND_MISMATCH');
 if(!handbagEvidence&&!bagWords.test(String(p.category??'')))throw Error('CLASSIFICATION_UNRESOLVED');
 const offers=[p.offers].flat().filter(Boolean);
 if(offers.some(o=>o.priceCurrency&&o.priceCurrency!==cfg.currency))throw Error('CURRENCY_MISMATCH');
 for(const offer of offers)if(offer.url){
  const offered=new URL(officialUrl(offer.url,cfg,url)),canonical=new URL(url);
  const variantOnly=[...offered.searchParams.keys()].every(k=>k==='variant')&&/^\d+$/.test(offered.searchParams.get('variant')??'');
  const diorOneSize=cfg.brand==='dior'&&offered.pathname===canonical.pathname+'_TU'&&!offered.search&&!offered.hash&&offers.length===1&&(!offer.sku||normalizeOfficialCode(offer.sku)===code||normalizeOfficialCode(offer.sku)===code+'TU');
  if(offered.origin!==canonical.origin||(!diorOneSize&&offered.pathname!==canonical.pathname)||(offered.search&&!variantOnly)||offers.length>1&&offered.href!==url)throw Error('OFFER_URL_MISMATCH');
 }
 const amounts=[...new Set(offers.filter(o=>o.priceCurrency===cfg.currency&&o.price!==undefined).map(o=>Number(String(o.price).replaceAll(',',''))))];
 if(amounts.length>1||amounts.some(n=>!Number.isFinite(n)||n<=0))throw Error('PRICE_CONFLICT');
 if(cfg.brand==='miu-miu'&&!amounts.length){
  const currencyPattern={KRW:/₩\s*([0-9][0-9,]{4,})/g,JPY:/¥\s*([0-9][0-9,]{3,})/g}[cfg.currency];
  const asNumber=value=>Number(String(value).replaceAll(',',''));
  const visible=currencyPattern?[...new Set([...html.matchAll(currencyPattern)].map(m=>asNumber(m[1])).filter(n=>Number.isFinite(n)&&n>0))]:[];
  const embedded=[...new Set([...html.matchAll(/["'](?:price|salePrice|listPrice)["']\s*:\s*["']?([0-9][0-9,.]{3,})/gi)].map(m=>asNumber(m[1])).filter(n=>Number.isFinite(n)&&n>0))];
  if(visible.length===1&&embedded.length===1&&visible[0]===embedded[0])amounts.push(visible[0]);
 }
 const name=clean(p.name);if(!name||name.length>500)throw Error('PRODUCT_NAME_MISSING');
 const group=p.isVariantOf,groupId=typeof group==='object'?clean(group.productGroupID):'';
 const parentModel=cfg.brand==='dior'?name:typeof group==='object'?clean(group.name)||name:name;
 const dimension=value=>{if(!value||typeof value!=='object')return null;const n=Number(value.value),unit=String(value.unitCode??value.unitText??'').toUpperCase();return Number.isFinite(n)&&n>0&&['MMT','MM','CMT','CM'].includes(unit)?n*(['CMT','CM'].includes(unit)?10:1):null;};
 let sourceImageUrl=null;
 for(const image of [p.image].flat().filter(Boolean))try{
  const asset=new URL(typeof image==='string'?image:image.contentUrl??image.url,url);
  if(asset.protocol==='https:'&&!asset.username&&!asset.password&&cfg.imageHosts.includes(asset.hostname)){sourceImageUrl=asset.href;break;}
 }catch{}
 if(cfg.brand==='dior'&&cfg.country==='KR'&&!sourceImageUrl){
  const tags=[...html.matchAll(/<(?:link|meta)\b[^>]*>/gi)].map(m=>{
   const attrs={};for(const a of m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[a[1].toLowerCase()]=a[2].replaceAll('&amp;','&');return attrs;
  });
  const canonicals=tags.filter(t=>t.rel==='canonical').map(t=>{try{return officialUrl(t.href,cfg,url);}catch{return null;}});
  if(canonicals.length===1&&canonicals[0]===url){
   for(const t of tags.filter(t=>t.property==='og:image'))try{
    const asset=new URL(t.content,url),identity=asset.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)_E\d{2}(?:-\d+)?$/)?.[1];
    if(asset.protocol==='https:'&&!asset.username&&!asset.password&&asset.hostname==='assets.christiandior.com'&&identity===code){sourceImageUrl=asset.href;break;}
   }catch{}
  }
 }
 if(cfg.country==='KR'&&!sourceImageUrl)throw Error('ORIGINAL_IMAGE_SOURCE_MISSING');
 if(cfg.brand==='dior'&&cfg.country==='KR'){
  const labeled=diorDetailAttributes(html,url,code);
  if(!p.material&&labeled.material)p.material=labeled.material;
  for(const [field,key] of [['width','widthMm'],['height','heightMm'],['depth','depthMm']])if(!p[field]&&labeled[key])p[field]={value:labeled[key],unitCode:'MMT'};
 }
 return {brand:cfg.brand,...(cfg.brand==='dior'?{category:'bag'}:{}),country:cfg.country,currency:cfg.currency,originalCode:String(p.sku??p.mpn),normalizedCode:code,sourceProductId:String(p.productID??code),styleCode:cfg.brand==='dior'?code:groupId||code,productName:name,parentModel,modelKey:cfg.brand==='dior'?`sku-${code.toLowerCase()}`:crypto.createHash('sha256').update(`${cfg.brand}:${groupId||code}`).digest('hex').slice(0,20),colorOriginal:typeof p.color==='string'?clean(p.color):null,colorDisplay:typeof p.color==='string'?clean(p.color):null,materialOriginal:typeof p.material==='string'?clean(p.material):null,materialDisplay:typeof p.material==='string'?clean(p.material):null,widthMm:dimension(p.width),heightMm:dimension(p.height),depthMm:dimension(p.depth),description:typeof p.description==='string'?clean(p.description):null,sourceImageUrl:cfg.country==='KR'?sourceImageUrl:null,price:amounts[0]??null,priceStatus:amounts.length?'confirmed':'price_unavailable',officialUrl:url,checkedAt:new Date().toISOString()};
}
function links(html,base,cfg){
 const result=new Map();
 for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))try{
  const u=officialUrl(m[1].replaceAll('&amp;','&'),cfg,base),label=clean(m[2].replace(/<[^>]*>/g,' '));result.set(u,{url:u,label});
 }catch{}
 return [...result.values()];
}
function safeStatus(error){return /^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SOURCE_FAILED';}
export async function runOfficialBrand(expectedBrand){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2),mode=args[2];
 if(args[0]!=='--country-config'||!['--probe-source','--discover-catalog','--discover-candidates','--match-kr','--collect-candidates'].includes(mode)||!(args.length===3||(mode==='--match-kr'&&args.length===5&&args[3]==='--reference-codes-file')||(mode==='--collect-candidates'&&(args.length===7||args.length===9)&&args[3]==='--candidates-file'&&args[5]==='--offset'&&(args.length===7||args[7]==='--reference-codes-file'))))throw Error('SUPPORTED_MODE_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(args[1]));if(cfg.brand!==expectedBrand||cfg.country!==process.env.CRAWL_COUNTRY?.toUpperCase())throw Error('COUNTRY_CONFIG_MISMATCH');
 if(mode==='--discover-catalog'&&cfg.country!=='KR')throw Error('KOREAN_DISCOVERY_ONLY');
 if(mode==='--collect-candidates'&&cfg.country!=='KR'&&args.length!==9)throw Error('KOREAN_REFERENCE_REQUIRED');
 let references=null;
 if(mode==='--match-kr'||args.length===9){
  const input=JSON.parse(await fs.readFile(mode==='--match-kr'?args[4]:args[8],'utf8'));
  if(!Array.isArray(input)||!input.length||input.length>10000||input.some(x=>typeof x!=='string'||!normalizeOfficialCode(x)))throw Error('REFERENCE_CODES_INVALID');
  references=new Set(input.map(normalizeOfficialCode));
 }
 const run=process.env.CRAWL_RUN_DIR;let context,browser,page,browserBlock,calls=0,documentCalls=0,current=cfg.entryUrl;
 let batch=null;
 if(mode==='--collect-candidates'){
  const source=path.resolve(args[4]),root=path.resolve(path.dirname(run),'..');
  if(!source.startsWith(`${root}${path.sep}`)||!source.endsWith(`${path.sep}artifacts${path.sep}discovery-candidates.json`))throw Error('DISCOVERY_SOURCE_REQUIRED');
  const list=JSON.parse(await fs.readFile(source,'utf8')),offset=Number(args[6]);
  if(!Array.isArray(list)||!list.length||list.length>cfg.maxCandidates||list.some(x=>typeof x!=='string')||!Number.isInteger(offset)||offset<0||offset>=list.length||offset%cfg.maxProductsPerRun)throw Error('CANDIDATE_BATCH_INVALID');
  batch=list.slice(offset,offset+cfg.maxProductsPerRun).map(x=>officialUrl(x,cfg));
 }
 const rows=[],records=[];
 const report=(status,url=current,code='SOURCE',price=null)=>rows.push({brand:cfg.brand,country:cfg.country,parentModel:'공식 가방 목록',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
 async function get(value){
  let url=officialUrl(value,cfg);
  for(let redirect=0;redirect<4;redirect++){
   current=url;if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   let response;
   try{response=page?await page.goto(url,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs}):await context.get(url,{maxRedirects:0,timeout:cfg.navigationTimeoutMs});}catch(error){if(browserBlock)throw Error(browserBlock);throw error;}
   if(!response)throw Error('SOURCE_RESPONSE_MISSING');
   if(page)current=officialUrl(response.url(),cfg);
   if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(response.status())){
    const next=new URL(response.headers().location,url);
    if(next.protocol==='https:')current=next.href;
    url=officialUrl(next.href,cfg,url);continue;
   }
   if(!response.ok())throw Error(`HTTP_${response.status()}`);
   const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});
   const html=body.toString('utf8');if(blocked.test(html))throw Error('ACCESS_BLOCKED');return html;
  }throw Error('REDIRECT_LIMIT');
 }
 try{
  if(cfg.browserMode==='headed-cdp'){
   if(!process.env.CRAWL_CDP_URL)throw Error('MANAGED_BROWSER_REQUIRED');
   browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL);
   context=await browser.newContext({javascriptEnabled:false});page=await context.newPage();
   await context.route('**/*',async route=>{
    const r=route.request();if(r.resourceType()!=='document')return route.abort();
    try{officialUrl(r.url(),cfg);}catch{browserBlock='COUNTRY_URL_MISMATCH';return route.abort();}
    if(/__cf_chl|cf-chl|captcha|challenge-platform/i.test(r.url())){browserBlock='ACCESS_BLOCKED';return route.abort();}
    let hops=0,parent=r.redirectedFrom();while(parent){hops++;parent=parent.redirectedFrom();}
    if(hops>=4){browserBlock='REDIRECT_LIMIT';return route.abort();}
    if(++documentCalls>cfg.maxRequestsPerRun){browserBlock='REQUEST_LIMIT';return route.abort();}
    return route.continue();
   });
  }else context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
  const home=batch?null:await get(cfg.entryUrl),homeLinks=home?links(home,cfg.entryUrl,cfg):[],categories=homeLinks.filter(x=>bagWords.test(x.label));
  if(categories.length>cfg.maxDiscoveryPages)throw Error('CATEGORY_LIMIT');
  if(!batch)report(`CATEGORY_LINKS_${categories.length}`);
  if(mode==='--probe-source'){
   if(!categories.length)throw Error('CATEGORY_SOURCE_MISSING');
   const html=await get(categories[0].url),candidates=links(html,categories[0].url,cfg).filter(x=>bagWords.test(x.url)||bagWords.test(x.label));
   report(`LISTING_LINKS_${candidates.length}`);
   if(!candidates.length)throw Error('PRODUCT_SOURCE_MISSING');
  }else{
   if(!batch&&!categories.length)throw Error('CATEGORY_SOURCE_MISSING');
   const queue=categories.map(x=>x.url),seen=new Set(),candidates=new Map();
   while(!batch&&queue.length){
    if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_LIMIT');
    const url=queue.shift();if(seen.has(url))continue;seen.add(url);
    const html=await get(url);
    for(const link of links(html,url,cfg)){
     const pathname=decodeURIComponent(new URL(link.url).pathname);
     const product=cfg.productPathPattern?new RegExp(cfg.productPathPattern,'i').test(pathname):cfg.brand==='the-row'?pathname.includes('/products/'):cfg.brand==='miu-miu'?pathname.includes('/p/'):cfg.brand==='louis-vuitton'?/-[A-Z]{1,2}\d{4,6}(?:\.html)?\/?$/i.test(pathname):/\/products?\//i.test(pathname)&&/[A-Z0-9]{8,}(?:\.html)?\/?$/i.test(pathname);
     if(product){candidates.set(link.url,true);if(candidates.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');}
     else if(bagWords.test(link.label)&&!seen.has(link.url)&&!queue.includes(link.url)){
      if(queue.length+seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_LIMIT');
      queue.push(link.url);
     }
    }
   }
   const targets=batch??[...candidates.keys()];
   report(`CANDIDATES_${targets.length}`);
   if(!targets.length)throw Error('PRODUCT_SOURCE_MISSING');
   if(!batch){
    await fs.mkdir(path.join(run,'artifacts'),{recursive:true});
    await fs.writeFile(path.join(run,'artifacts','discovery-candidates.json'),JSON.stringify(targets),{mode:0o600});
   }
   if(mode==='--discover-candidates'){report('CANDIDATES_DISCOVERED');return;}
   if(targets.length>cfg.maxProductsPerRun)throw Error('PRODUCT_LIMIT');
   for(const url of targets){
    const html=await get(url),product=parseOfficialProduct(html,url,cfg,null,{handbagEvidence:true});
    if(!references||references.has(product.normalizedCode)){
     records.push(product);report(product.price===null?'PRICE_UNAVAILABLE':'EXACT_SKU',url,product.normalizedCode,product.price);
    }
   }
   if(mode==='--match-kr'&&references){const found=new Set(records.map(x=>x.normalizedCode));if([...references].some(x=>!found.has(x)))throw Error('UNMATCHED_KR_VARIANTS');}
  }
 }catch(error){report(safeStatus(error));process.exitCode=/LIMIT|MISMATCH|UNAUTHORIZED/.test(error.message)?78:1;
  await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:safeStatus(error)}),{mode:0o600});
 }finally{
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});
  await fs.writeFile(path.join(run,'artifacts','records.json'),JSON.stringify(records),{mode:0o600});
  await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows.slice(0,50)));
  if(browser){await context?.close();await browser.close();}else await context?.dispose();
 }
}
