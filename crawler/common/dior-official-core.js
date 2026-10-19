import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {request,chromium} from 'playwright-core';
import {parseLouisVuittonProduct,louisVuittonCode} from './louis-vuitton-product.js';
import {inspectDiorNativeEvidence} from '../../scripts/report-dior-native-evidence.mjs';
import {diorDetailAttributes} from './dior-detail-attributes.js';
import {diorPageDataProduct,diorPageDataPrice} from './dior-page-data.js';
import {verifiedDiorOwnImage} from './dior-own-image.js';
import {registeredPriceOnly} from './registered-maintenance.js';
import {diorPageDataRoutes,diorPageDataRouteForReceipt,diorStaticColorListingRoute} from './dior-page-data-routing.js';
import {diorForeignDataRoute,diorForeignDataPrices} from './dior-foreign-page-data.js';

const bagWords=/(?:handbags?|shoulder bags?|tote bags?|crossbody bags?|clutches?|가방|핸드백|숄더백|토트백|크로스백|バッグ|sacs?|borse|bolsos?)/i;
const blocked=/(?:<title[^>]*>\s*(?:just a moment|access denied|attention required|security check)|cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human)/i;
export const normalizeOfficialCode=value=>String(value??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
// A normal retained page already published this exact request in its resource
// metadata. Never synthesize build IDs, SKU paths, query parameters or hosts.
export function diorObservedProductDataUrl(raw,rows){
 try{const u=new URL(raw),m=u.pathname.match(/^\/_next\/data\/[A-Za-z0-9_-]{1,100}\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)\.json$/);
  if(u.origin!=='https://www.dior.com'||u.username||u.password||u.search||u.hash||!m)return false;
  const canonical='https://www.dior.com/ko_kr/fashion/products/'+m[1],code=normalizeOfficialCode(m[1]);
  return rows.some(r=>r.brand==='dior'&&r.country==='KR'&&r.status==='OBSERVED_PUBLIC_CATALOG_ROUTE'&&r.officialUrl===raw)&&rows.some(r=>r.brand==='dior'&&r.country==='KR'&&r.status==='EXACT_SKU'&&r.variantCode===code&&r.officialUrl===canonical);
 }catch{return false;}
}
export function indexedDiorListingAllowed(target,cfg,proof){
 try{const locales={KR:'ko_kr',JP:'ja_jp',FR:'fr_fr',IT:'it_it',ES:'es_es',US:'en_us',SG:'en_sg',HK:'en_hk'},locale=locales[cfg.country],u=new URL(target);if(cfg.brand!=='dior'||!locale||u.origin!=='https://www.dior.com'||!u.pathname.startsWith('/'+locale+'/fashion/')||u.hash||u.username||u.password)return false;
  if(!u.search)return proof.some(r=>r.brand==='dior'&&r.country===cfg.country&&r.status==='INDEXED_ROUTE_CANDIDATE'&&r.officialUrl===target);
  return cfg.country==='KR'&&target==='https://www.dior.com/ko_kr/fashion/products/search?query='+encodeURIComponent('가방')&&proof.some(r=>r.brand==='dior'&&r.country==='KR'&&r.status==='PUBLISHED_PUBLIC_DATA_ROUTE'&&r.officialUrl==='https://www.dior.com/ko_kr/fashion/products/search?query=[value]');
 }catch{return false;}
}
export function diorPublicProofCodes(rows){
 const codes=new Set();for(const r of rows){const match=typeof r.officialUrl==='string'&&r.officialUrl.match(/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)\/?$/);if(r.brand!=='dior'||r.country!=='KR'||r.currency!=='KRW'||r.status!=='PUBLIC_CATALOG_VERIFIED'||!match||normalizeOfficialCode(match[1])!==r.variantCode)throw Error('DIOR_PUBLIC_PROOF_IDENTITY');codes.add(r.variantCode);}return codes;
}
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
export const isDiorBagName=name=>/(?:\s백(?:\s|$)|토트|숄더|핸드백|탑\s핸들백|지퍼\s슬링백|크로스백|백팩|벨트백|스트랩백|보스턴|호보|클러치|파우치|브리프케이스|메신저|tote|handbag|shoulder bag|backpack|clutch|pouch|briefcase|messenger|^DIOR AND RIMOWA 기내용 캐리어$)/i.test(name)&&!/(?:스트랩|참|strap|charm)\s*$/i.test(name);
const typeIs=(node,type)=>[node?.['@type']].flat().includes(type);

export function officialUrl(value,cfg,base=cfg.entryUrl){
 const u=new URL(value,base),origin=new URL(cfg.entryUrl);
 const diorLocaleRoot=cfg.brand==='dior'&&u.pathname.toLowerCase()===cfg.localePrefix.replace(/\/$/,'').toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.hostname!==origin.hostname||!diorLocaleRoot&&!u.pathname.toLowerCase().startsWith(cfg.localePrefix.toLowerCase()))throw Error('COUNTRY_URL_MISMATCH');
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
 if(cfg.brand==='dior'&&cfg.country==='KR'&&registeredPriceOnly(normalizeOfficialCode(expectedCode??new URL(url).pathname.split('/').at(-1))))return diorPageDataPrice(html,url,expectedCode??new URL(url).pathname.split('/').at(-1));
 if(cfg.brand==='louis-vuitton')return parseLouisVuittonProduct(html,url,cfg,expectedCode,{handbagEvidence:false});
 const products=nodes(html).filter(p=>typeIs(p,'Product')&&normalizeOfficialCode(p.sku||p.mpn));
 if(cfg.brand==='dior'&&cfg.country==='KR'){
  const own=diorPageDataProduct(html,url,expectedCode??new URL(url).pathname.split('/').at(-1));
  if(own){
   const existing=products.filter(p=>normalizeOfficialCode(p.sku||p.mpn)===normalizeOfficialCode(own.sku));
   if(!existing.length)products.push(own);
   else if(existing.length===1){
    const p=existing[0];if(clean(p.name)!==clean(own.name))throw Error('PAGE_DATA_NAME_CONFLICT');
    const prices=[p.offers].flat().filter(Boolean);if(prices.some(o=>o.priceCurrency!=='KRW'||Number(o.price)!==own.offers.price))throw Error('PAGE_DATA_PRICE_CONFLICT');
    for(const key of ['color','material','width','height','depth','description'])if(!p[key]&&own[key])p[key]=own[key];
    p.ownImageProof=own.ownImageProof;if(!p.image||![p.image].flat().some(Boolean))p.image=own.image;
   }
  }
 }
 if(cfg.brand==='dior'&&!products.some(p=>normalizeOfficialCode(p.sku||p.mpn)===normalizeOfficialCode(expectedCode??new URL(url).pathname.split('/').filter(Boolean).at(-1)))){
  const native=inspectDiorNativeEvidence(html);
  for(const p of native.records){
   // Missing nested image must still reach the existing exact-canonical,
   // exact-SKU official og:image fallback below. Image validation is mandatory.
   if(p.url!==url||!p.name||p.price===null||p.currency!==cfg.currency||p.priceConflict||p.nameConflict)continue;
   // Field mapping stays on one explicit SKU object. No page-wide price or
   // neighboring product image is borrowed when JSON-LD is missing.
   products.push({'@type':'Product',sku:p.sku,name:p.name,url:p.url,category:p.category,image:p.images,color:p.color??null,material:p.material??null,width:p.width??null,height:p.height??null,depth:p.depth??null,description:p.description??null,offers:{price:p.price,priceCurrency:p.currency,url:p.url}});
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
 let sourceImageUrl=null;const sourceImageCandidates=[];
 for(const image of [p.image].flat().filter(Boolean))try{
  const asset=new URL(typeof image==='string'?image:image.contentUrl??image.url,url);
  if(asset.protocol==='https:'&&!asset.username&&!asset.password&&cfg.imageHosts.includes(asset.hostname)){
   if(cfg.brand==='dior'&&cfg.country==='KR'){
    const identity=asset.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)(?:_SBG)?_E\d{2}(?:-\d+)?$/)?.[1];
    if(asset.hostname!=='assets.christiandior.com'||identity!==code&&!(p.ownImageProof?.sourceSha256===crypto.createHash('sha256').update(html).digest('hex')&&verifiedDiorOwnImage(asset.href,code,p.ownImageProof)))continue;
    if(sourceImageCandidates.length<8&&!sourceImageCandidates.includes(asset.href))sourceImageCandidates.push(asset.href);
    sourceImageUrl??=asset.href;
   }else{sourceImageUrl=asset.href;break;}
  }
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
  const labeled=diorDetailAttributes(html,url,code,name);
  if(!p.color&&labeled.color)p.color=labeled.color;
  if(!p.material&&labeled.material)p.material=labeled.material;
  for(const [field,key] of [['width','widthMm'],['height','heightMm'],['depth','depthMm']])if(!p[field]&&labeled[key])p[field]={value:labeled[key],unitCode:'MMT'};
 }
 return {brand:cfg.brand,...(cfg.brand==='dior'?{category:'bag',...(cfg.country==='KR'?{sourceImageCandidates:sourceImageCandidates.length?sourceImageCandidates:[sourceImageUrl]}:{})}:{}),country:cfg.country,currency:cfg.currency,originalCode:String(p.sku??p.mpn),normalizedCode:code,sourceProductId:String(p.productID??code),styleCode:cfg.brand==='dior'?code:groupId||code,productName:name,parentModel,modelKey:cfg.brand==='dior'?`sku-${code.toLowerCase()}`:crypto.createHash('sha256').update(`${cfg.brand}:${groupId||code}`).digest('hex').slice(0,20),colorOriginal:typeof p.color==='string'?clean(p.color):null,colorDisplay:typeof p.color==='string'?clean(p.color):null,materialOriginal:typeof p.material==='string'?clean(p.material):null,materialDisplay:typeof p.material==='string'?clean(p.material):null,widthMm:dimension(p.width),heightMm:dimension(p.height),depthMm:dimension(p.depth),description:typeof p.description==='string'?clean(p.description):null,sourceImageUrl:cfg.country==='KR'?sourceImageUrl:null,price:amounts[0]??null,priceStatus:amounts.length?'confirmed':'price_unavailable',officialUrl:url,checkedAt:new Date().toISOString()};
}
function links(html,base,cfg){
 const result=new Map();
 for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))try{
  const u=officialUrl(m[1].replaceAll('&amp;','&'),cfg,base),label=clean(m[2].replace(/<[^>]*>/g,' '));result.set(u,{url:u,label});
 }catch{}
 return [...result.values()];
}
function safeStatus(error){
 if(/ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/.test(error.message))return 'LOCAL_BROWSER_RELAY_FAILED';
 if(/connectOverCDP|ECONNREFUSED/.test(error.message))return 'LOCAL_CDP_UNAVAILABLE';
 if(/Target.*closed|context.*closed|browser.*closed/i.test(error.message))return 'LOCAL_BROWSER_CLOSED';
 if(/Timeout.*exceeded/.test(error.message))return 'SOURCE_TIMEOUT';
 return /^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SOURCE_FAILED';
}
export async function runOfficialBrand(expectedBrand){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2),mode=args[2];
 if(args[0]!=='--country-config'||!['--inspect-listing','--probe-source','--discover-catalog','--discover-candidates','--discover-storefront','--match-kr','--collect-candidates','--collect-candidates-http'].includes(mode)||!(args.length===3||(mode==='--inspect-listing'&&['louis-vuitton','dior'].includes(expectedBrand)&&args.length===5&&args[3]==='--listing-url')||(mode==='--match-kr'&&args.length===5&&args[3]==='--reference-codes-file')||(['--collect-candidates','--collect-candidates-http'].includes(mode)&&(args.length===7||args.length===9)&&args[3]==='--candidates-file'&&args[5]==='--offset'&&(args.length===7||args[7]==='--reference-codes-file'))))throw Error('SUPPORTED_MODE_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(args[1]));if(cfg.brand!==expectedBrand||cfg.country!==process.env.CRAWL_COUNTRY?.toUpperCase())throw Error('COUNTRY_CONFIG_MISMATCH');
 if(mode==='--discover-catalog'&&cfg.country!=='KR')throw Error('KOREAN_DISCOVERY_ONLY');
 if(['--collect-candidates','--collect-candidates-http'].includes(mode)&&cfg.country!=='KR'&&args.length!==9)throw Error('KOREAN_REFERENCE_REQUIRED');
 let references=null;
 if(mode==='--match-kr'||args.length===9){
  const input=JSON.parse(await fs.readFile(mode==='--match-kr'?args[4]:args[8],'utf8'));
  if(!Array.isArray(input)||!input.length||input.length>10000||input.some(x=>typeof x!=='string'||!normalizeOfficialCode(x)))throw Error('REFERENCE_CODES_INVALID');
  references=new Set(input.map(normalizeOfficialCode));
 }
 const run=process.env.CRAWL_RUN_DIR;let context,browser,page,browserBlock,calls=0,documentCalls=0,current=cfg.entryUrl,observedProductDataTarget=null;
 let batch=null;
 if(['--collect-candidates','--collect-candidates-http'].includes(mode)){
  const source=path.resolve(args[4]),root=path.resolve(path.dirname(run),'..');
  if(!source.startsWith(`${root}${path.sep}`)||!source.endsWith(`${path.sep}artifacts${path.sep}discovery-candidates.json`))throw Error('DISCOVERY_SOURCE_REQUIRED');
  const list=JSON.parse(await fs.readFile(source,'utf8')),offset=Number(args[6]);
  if(!Array.isArray(list)||!list.length||list.length>cfg.maxCandidates||list.some(x=>typeof x!=='string')||!Number.isInteger(offset)||offset<0||offset>=list.length||offset%cfg.maxProductsPerRun)throw Error('CANDIDATE_BATCH_INVALID');
  batch=list.slice(offset,offset+cfg.maxProductsPerRun).map(x=>officialUrl(x,cfg));
 }
 const rows=[],records=[];
 const report=(status,url=current,code='SOURCE',price=null)=>rows.push({brand:cfg.brand,country:cfg.country,parentModel:'공식 가방 목록',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
 async function get(value){
  let url=value===observedProductDataTarget?value:officialUrl(value,cfg);
  for(let redirect=0;redirect<4;redirect++){
   current=url;if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   let response;
   try{response=page?await page.goto(url,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs}):await context.get(url,{maxRedirects:0,timeout:cfg.navigationTimeoutMs});}catch(error){if(browserBlock)throw Error(browserBlock);throw error;}
   if(!response)throw Error('SOURCE_RESPONSE_MISSING');
   if(page)current=officialUrl(response.url(),cfg);
   if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(response.status())){
    if(observedProductDataTarget===url)throw Error('PUBLISHED_DATA_REDIRECT');
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
  const explicitDiorFallback=cfg.brand==='dior'&&mode==='--collect-candidates';
  if((explicitDiorFallback||cfg.brand!=='dior'&&cfg.browserMode==='headed-cdp')&&mode!=='--collect-candidates-http'){
   if(!process.env.CRAWL_CDP_URL)throw Error('MANAGED_BROWSER_REQUIRED');
   // Resolve CDP locally, without Playwright's HTTP discovery proxy handling.
   // The existing browser and the kernel's single allowed CDP port stay intact.
   const cdp=new URL(process.env.CRAWL_CDP_URL);
   if(cdp.protocol!=='http:'||cdp.hostname!=='127.0.0.1'||!cdp.port)throw Error('LOCAL_CDP_ENDPOINT_INVALID');
   const localVersion=await fetch(new URL('/json/version',cdp),{signal:AbortSignal.timeout(5000)});
   if(!localVersion.ok)throw Error('LOCAL_CDP_DISCOVERY_FAILED');
   const websocket=new URL((await localVersion.json()).webSocketDebuggerUrl);
   if(websocket.protocol!=='ws:'||websocket.hostname!==cdp.hostname||websocket.port!==cdp.port||!websocket.pathname.startsWith('/devtools/browser/'))throw Error('LOCAL_CDP_ENDPOINT_INVALID');
   browser=await chromium.connectOverCDP(websocket.href);
   const reusable=process.env.LUXURY_REUSE_CDP==='1';
   context=reusable?(browser.contexts()[0]??await browser.newContext({javascriptEnabled:false})):await browser.newContext({javascriptEnabled:false});
   page=reusable?(context.pages()[0]??await context.newPage()):await context.newPage();
   if(reusable)await context.unrouteAll({behavior:'ignoreErrors'});
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
  if(mode==='--inspect-listing'){
   if(cfg.brand==='dior'&&cfg.country!=='KR'&&args[4].startsWith('https://www.dior.com/_next/data/')){
    const root=path.resolve(import.meta.dirname,'../..'),manifest=JSON.parse(await fs.readFile(root+'/crawler/completeness/dior/foreign-page-data/targets.json'));
    if(!Array.isArray(manifest)||manifest.length>cfg.maxCandidates)throw Error('FOREIGN_TARGET_SCOPE');
    const targets=manifest.filter(t=>t.url===args[4]&&t.country===cfg.country);if(targets.length!==1)throw Error('FOREIGN_TARGET_SCOPE');const t=targets[0],f=t.source;
    if(typeof f!=='string'||!new RegExp('^'+root+'/crawler/runs/dior/(?:kr|'+cfg.country.toLowerCase()+')/\\d{8}T\\d{6}Z-\\d+(?:-cached-\\d+)?/raw/\\d+\\.source$').test(f)||await fs.realpath(f)!==f)throw Error('FOREIGN_SOURCE_SCOPE');
    const summary=path.dirname(path.dirname(f))+'/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)throw Error('FOREIGN_SOURCE_GUARD');
    if(JSON.parse(await fs.readFile(summary)).some(r=>/BLOCKED|UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX|SECURITY_VERIFICATION/.test(r.status)))throw Error('FOREIGN_SOURCE_NOT_NORMAL');
    const st=await fs.stat(f);if(st.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let bytes;try{await fs.chmod(f,0o600);bytes=await fs.readFile(f);}finally{await fs.chmod(f,st.mode&0o777);}
    const route=diorForeignDataRoute(bytes.toString('utf8'),t.canonical,cfg.country);if(crypto.createHash('sha256').update(bytes).digest('hex')!==t.sourceSha256||!route||route.url!==t.url)throw Error('FOREIGN_ROUTE_BINDING');
    const markerDir=root+'/crawler/runtime/dior-indexed-listing';await fs.mkdir(markerDir,{recursive:true});const marker=await fs.open(markerDir+'/'+crypto.createHash('sha256').update(t.url).digest('hex')+'.json','wx');await marker.writeFile(JSON.stringify({target:t.url,run}));await marker.close();
    observedProductDataTarget=t.url;const body=await get(t.url);report('PUBLISHED_FOREIGN_DATA_HTTP_200',t.url);report('PUBLISHED_FRAMEWORK_ROUTING_BOUND',t.url);
    // Collection artifacts remain private; only this bounded summary reaches
    // the model. The recovery/store pass independently checks KR references.
    const refs=new Set(t.referenceCodes);if(!Array.isArray(t.referenceCodes)||refs.size>cfg.maxCandidates||[...refs].some(c=>typeof c!=='string'||!/^[A-Z0-9]+$/.test(c)))throw Error('FOREIGN_REFERENCE_SCOPE');
    const prices=diorForeignDataPrices(body,t.canonical,cfg.country,refs,new Date().toISOString());records.push(...prices);report('EXACT_LOCAL_PRICES_'+prices.length,t.canonical);return;
   }
   let observedRows=[];
   if(cfg.brand==='dior'&&cfg.country==='KR'&&args[4].startsWith('https://www.dior.com/_next/data/')){
    const root=path.resolve(import.meta.dirname,'../..'),proof=root+'/crawler/completeness/dior/public-data-links/observed-proof.json';
    if(await fs.stat(proof).catch(()=>null)){
     const meta=JSON.parse(await fs.readFile(proof));
     if(typeof meta.sourceRun!=='string'||!/^\d{8}T\d{6}Z-\d+$/.test(path.basename(meta.sourceRun))||path.dirname(meta.sourceRun)!==root+'/crawler/runs/dior/kr'||await fs.realpath(meta.sourceRun)!==meta.sourceRun)throw Error('OBSERVED_SOURCE_SCOPE');
     const summary=meta.sourceRun+'/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)throw Error('OBSERVED_SOURCE_GUARD');
     const bytes=await fs.readFile(summary);if(crypto.createHash('sha256').update(bytes).digest('hex')!==meta.sourceSha256)throw Error('OBSERVED_SOURCE_HASH');
     observedRows=JSON.parse(bytes);if(!observedRows.some(r=>r.status==='NO_NAVIGATION_OR_REQUEST')||observedRows.some(r=>/BLOCKED|SECURITY_VERIFICATION|LIMIT|UNAUTHORIZED|GUARD/.test(r.status)))throw Error('OBSERVED_SOURCE_NOT_NORMAL');
    }
   }
   let isRoutedData=false;
   if(cfg.brand==='dior'&&cfg.country==='KR'&&args[4].startsWith('https://www.dior.com/_next/data/')){
    const root=path.resolve(import.meta.dirname,'../..'),file=root+'/crawler/completeness/dior/public-data-links/routed-targets.json';
    if(await fs.stat(file).catch(()=>null)){
     const meta=JSON.parse(await fs.readFile(file));if(!Array.isArray(meta.targets)||meta.targets.length>cfg.maxCandidates)throw Error('ROUTED_TARGET_SCOPE');
     const target=meta.targets.find(t=>t.url===args[4]);
     if(target){
      if(typeof meta.controlRun!=='string'||path.dirname(meta.controlRun)!==root+'/crawler/runs/dior/kr'||!/^\d{8}T\d{6}Z-\d+$/.test(path.basename(meta.controlRun))||await fs.realpath(meta.controlRun)!==meta.controlRun||spawnSync(root+'/scripts/crawl-output-guard.sh',[meta.controlRun+'/summary.json'],{stdio:'ignore'}).status)throw Error('ROUTED_CONTROL_SCOPE');
      const control=JSON.parse(await fs.readFile(meta.controlRun+'/summary.json'));if(!control.some(r=>r.status==='PUBLISHED_PRODUCT_DATA_HTTP_200'&&r.officialUrl===meta.controlUrl)||control.some(r=>/ACCESS_BLOCKED|SECURITY_VERIFICATION|HTTP_40[13]|HTTP_429/.test(r.status)))throw Error('ROUTED_CONTROL_NOT_NORMAL');
      if(typeof target.source!=='string'||!target.source.startsWith(root+'/crawler/runs/dior/kr/')||!/^\d+\.source$/.test(path.basename(target.source))||path.basename(path.dirname(target.source))!=='raw'||await fs.realpath(target.source)!==target.source)throw Error('ROUTED_SOURCE_SCOPE');
      const sourceRun=path.dirname(path.dirname(target.source));if(spawnSync(root+'/scripts/crawl-output-guard.sh',[sourceRun+'/summary.json'],{stdio:'ignore'}).status)throw Error('ROUTED_SOURCE_GUARD');
      const ss=JSON.parse(await fs.readFile(sourceRun+'/summary.json'));if(ss.some(r=>/BLOCKED|UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX|SECURITY_VERIFICATION/.test(r.status)))throw Error('ROUTED_SOURCE_NOT_NORMAL');
      const st=await fs.stat(target.source);if(st.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let bytes;try{await fs.chmod(target.source,0o600);bytes=await fs.readFile(target.source);}finally{await fs.chmod(target.source,st.mode&0o777);}
      let routingHtml=bytes.toString('utf8');
      if(meta.routingSource){
       const f=meta.routingSource;if(typeof f!=='string'||!f.startsWith(root+'/crawler/runs/dior/kr/')||!/^\d+\.source$/.test(path.basename(f))||path.basename(path.dirname(f))!=='raw'||await fs.realpath(f)!==f||spawnSync(root+'/scripts/crawl-output-guard.sh',[path.dirname(path.dirname(f))+'/summary.json'],{stdio:'ignore'}).status)throw Error('ROUTING_SOURCE_SCOPE');
       const ss=JSON.parse(await fs.readFile(path.dirname(path.dirname(f))+'/summary.json'));if(ss.some(r=>/BLOCKED|UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX|SECURITY_VERIFICATION/.test(r.status)))throw Error('ROUTING_SOURCE_NOT_NORMAL');
       const st=await fs.stat(f);if(st.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let b;try{await fs.chmod(f,0o600);b=await fs.readFile(f);}finally{await fs.chmod(f,st.mode&0o777);}if(crypto.createHash('sha256').update(b).digest('hex')!==meta.routingSourceSha256)throw Error('ROUTING_SOURCE_HASH');routingHtml=b.toString('utf8');
      }
      let bound=false;
      if(target.receipt){
       const f=target.receipt;if(typeof f!=='string'||!f.startsWith(root+'/crawler/runs/dior/kr/')||!f.endsWith('/artifacts/public-verified/summary.json')||await fs.realpath(f)!==f||spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('PUBLIC_RECEIPT_SCOPE');
       const b=await fs.readFile(f);if(crypto.createHash('sha256').update(b).digest('hex')!==target.receiptSha256)throw Error('PUBLIC_RECEIPT_HASH');
       if(!JSON.parse(b).some(r=>r.brand==='dior'&&r.country==='KR'&&r.status==='PUBLIC_CATALOG_VERIFIED'&&r.officialUrl===target.canonical&&r.variantCode===normalizeOfficialCode(new URL(target.canonical).pathname.split('/').at(-1))))throw Error('PUBLIC_RECEIPT_IDENTITY');
       const t=diorPageDataRouteForReceipt(target.canonical,meta.controlUrl,routingHtml);bound=!!t&&t.url===target.url;
      }else if(target.kind==='static-color-listing'){const t=diorStaticColorListingRoute(bytes.toString('utf8'),meta.controlUrl,target.canonical);bound=!!t&&t.url===target.url&&t.canonical===target.canonical;}
      else bound=diorPageDataRoutes(bytes.toString('utf8'),meta.controlUrl,routingHtml).some(t=>t.url===target.url&&t.canonical===target.canonical);
      if(crypto.createHash('sha256').update(bytes).digest('hex')!==target.sourceSha256||!bound)throw Error('ROUTED_BINDING_MISMATCH');
      isRoutedData=true;
     }
    }
   }
   const isObservedData=cfg.brand==='dior'&&cfg.country==='KR'&&(diorObservedProductDataUrl(args[4],observedRows)||isRoutedData);
   const target=isObservedData?args[4]:officialUrl(args[4],cfg);
   if(isObservedData)observedProductDataTarget=target;
   if(cfg.brand==='dior'){
    const root=path.resolve(import.meta.dirname,'../..'),proof=root+'/crawler/completeness/dior/indexed-listings/summary.json';
    if(spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status)throw Error('LISTING_SCOPE');
    const sourceProof=JSON.parse(await fs.readFile(proof));
    const followup=root+'/crawler/completeness/dior/indexed-listings/foreign-published-followup-summary.json';
    if(cfg.country!=='KR'&&await fs.stat(followup).catch(()=>null)){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[followup],{stdio:'ignore'}).status)throw Error('LISTING_SCOPE');sourceProof.push(...JSON.parse(await fs.readFile(followup)));}
    if(!isObservedData&&!indexedDiorListingAllowed(target,cfg,sourceProof))throw Error('LISTING_SCOPE');
    const dir=root+'/crawler/runtime/dior-indexed-listing';await fs.mkdir(dir,{recursive:true});
    const marker=await fs.open(dir+'/'+crypto.createHash('sha256').update(target).digest('hex')+'.json','wx');await marker.writeFile(JSON.stringify({target,run}));await marker.close();
   }else if(!new URL(target).pathname.startsWith(cfg.localePrefix+'women/handbags/'))throw Error('LISTING_SCOPE');
   const html=await get(target);
   if(isObservedData){
    if(isRoutedData)report('PUBLISHED_FRAMEWORK_ROUTING_BOUND',target);
    let data;try{data=JSON.parse(html);}catch{throw Error('EXPECTED_PRODUCT_DATA_JSON');}if(!data||typeof data!=='object'||Array.isArray(data))throw Error('EXPECTED_PRODUCT_DATA_JSON');
    if(isRoutedData&&/\/(?:womens-fashion|mens-fashion)\/bags(?:\/[a-z0-9-]+)?\.json$/.test(new URL(target).pathname)){
     report('PUBLISHED_LISTING_DATA_HTTP_200',target);if(data.pageProps?.locale!=='ko_kr')throw Error('STATIC_DATA_LOCALE_UNRESOLVED');report('NORMAL_KR_STATIC_LISTING_DATA',target);return;
    }
    report('PUBLISHED_PRODUCT_DATA_HTTP_200',target);
    const code=target.match(/\/([A-Z0-9]+_[A-Z0-9]+)\.json$/)[1],canonical='https://www.dior.com/ko_kr/fashion/products/'+code;
    const native=inspectDiorNativeEvidence(html).records.filter(r=>normalizeOfficialCode(r.sku)===normalizeOfficialCode(code)&&r.url===canonical);
    report('SELF_SKU_DATA_RECORDS_'+native.length,target);
    try{const p=parseOfficialProduct(html,canonical,cfg,code,{handbagEvidence:true});records.push(p);report('EXACT_SKU',canonical,p.normalizedCode,p.price);}catch(e){report('DATA_PARSE_'+(/^[A-Z0-9_]{1,25}$/.test(e.message)?e.message:'UNRESOLVED'),target);}
    return;
   }
   const candidates=links(html,target,cfg).map(x=>x.url).filter(u=>cfg.brand==='dior'?new RegExp('^'+cfg.localePrefix+'fashion/products/[A-Z0-9]+_[A-Z0-9]+/?$','i').test(new URL(u).pathname):!!louisVuittonCode(u));
   await fs.mkdir(path.join(run,'artifacts'),{recursive:true});await fs.writeFile(path.join(run,'artifacts','discovery-candidates.json'),JSON.stringify([...new Set(candidates)]),{mode:0o600});
   report('LISTING_DOCUMENT_VALIDATED');report('CANDIDATES_'+new Set(candidates).size);return;
  }
  const entry=mode==='--discover-storefront'?new URL(cfg.localePrefix,cfg.entryUrl).href:cfg.entryUrl;
  const home=batch&&!page?null:await get(entry),homeLinks=home?links(home,current,cfg):[],categories=homeLinks.filter(x=>bagWords.test(x.label));
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
     const product=cfg.productPathPattern?new RegExp(cfg.productPathPattern,'i').test(pathname):cfg.brand==='the-row'?pathname.includes('/products/'):cfg.brand==='miu-miu'?pathname.includes('/p/'):cfg.brand==='louis-vuitton'?!!louisVuittonCode(link.url):/\/products?\//i.test(pathname)&&/[A-Z0-9]{8,}(?:\.html)?\/?$/i.test(pathname);
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
   if(mode==='--discover-candidates'||mode==='--discover-storefront'){report('CANDIDATES_DISCOVERED');return;}
   if(targets.length>cfg.maxProductsPerRun)throw Error('PRODUCT_LIMIT');
   let rejected=0;
   for(const url of targets){
    try{
     if(page)await page.waitForTimeout(1000);
     const html=await get(url),product=parseOfficialProduct(html,url,cfg,null,{handbagEvidence:true});
     if(!references||references.has(product.normalizedCode)){
      records.push(product);report(product.price===null?'PRICE_UNAVAILABLE':'EXACT_SKU',url,product.normalizedCode,product.price);
     }
    }catch(error){
     if(!['--collect-candidates','--collect-candidates-http'].includes(mode))throw error;
     rejected++;report(`REJECTED_${safeStatus(error)}`.slice(0,40),url);
     if(/ACCESS_BLOCKED|UNAUTHORIZED|LIMIT|MISMATCH|SANDBOX|GUARD/.test(error.message))throw error;
    }
   }
   if(['--collect-candidates','--collect-candidates-http'].includes(mode))report(`CANDIDATE_ACCEPTED_${records.length}_REJECTED_${rejected}`);
   if(mode==='--match-kr'&&references){const found=new Set(records.map(x=>x.normalizedCode));if([...references].some(x=>!found.has(x)))throw Error('UNMATCHED_KR_VARIANTS');}
  }
 }catch(error){report(safeStatus(error));process.exitCode=/LIMIT|MISMATCH|UNAUTHORIZED/.test(error.message)?78:1;
  await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:safeStatus(error)}),{mode:0o600});
 }finally{
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});
  await fs.writeFile(path.join(run,'artifacts','records.json'),JSON.stringify(records),{mode:0o600});
  await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows.slice(0,50)));
  // Reused final-fallback sessions retain their context, cookies and page.
  // The owning session manager alone is allowed to close the browser.
  if(browser&&process.env.LUXURY_REUSE_CDP!=='1'){await context?.close();await browser.close();}
  else if(!browser)await context?.dispose();
 }
}
