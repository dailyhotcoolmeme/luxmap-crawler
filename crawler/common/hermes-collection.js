import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';

const BRAND_RULES={
 hermes:{hosts:['www.hermes.com'],bagPath:/\/(?:sacs|bags|handbags|가방|핸드백|bolsos|borse|kaban)(?:\/|_|-|$)/i},
 gucci:{hosts:['www.gucci.com'],bagPath:/\/(?:handbags|bags|핸드백|가방|borse|sacs|bolsos)(?:\/|_|-|$)/i},
 'saint-laurent':{hosts:['www.ysl.com'],bagPath:/\/(?:handbags|bags|핸드백|가방|borse|sacs|bolsos)(?:\/|_|-|$)/i},
 fendi:{hosts:['www.fendi.com'],bagPath:/\/(?:handbags|bags|핸드백|가방|borse|sacs|bolsos)(?:\/|_|-|$)/i,detailPath:/-[0-9][A-Z]{2}[0-9]{3}[A-Z0-9]{9}$/i}
};
const code=value=>String(value??'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
const clean=value=>decodeHtml(String(value??'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const tagged=(value,type)=>[value?.['@type']].flat().includes(type);
function priceMeta(html){
 const result={};for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
  const attrs={};for(const match of tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gi))attrs[match[1].toLowerCase()]=decodeHtml(match[2]);
  const key=attrs.property??attrs.name??attrs.itemprop;if(/^(?:product:price:|price:)(?:amount|currency)$/.test(key??''))result[key.split(':').at(-1)]=attrs.content;
 }return result;
}
function visibleCurrencyProof(html,amount,currency){
 const symbols={KRW:'₩',JPY:'¥',EUR:'€',USD:'$',SGD:'S$',HKD:'HK$'};
 const symbol=symbols[currency];if(!symbol||!Number.isFinite(amount)||amount<=0)return false;
 const visible=clean(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' '));
 const grouped=amount.toLocaleString('en-US'),forms=[String(amount),grouped];
 return forms.some(value=>visible.includes(`${symbol}${value}`)||visible.includes(`${symbol} ${value}`)||visible.includes(`${value} ${symbol}`)||visible.includes(`${value}${symbol}`));
}
function dimensionsMm(product,visible){
 const description=clean(product.description),triplet=(description+' '+visible).match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm/i);
 const mm=value=>Math.round(Number(String(value).replace(',','.'))*10);
 if(triplet)return [mm(triplet[1]),mm(triplet[2]),mm(triplet[3])];
 const labels=[/(?:너비|가로|폭|width|largeur|larghezza|ancho|幅)/i,/(?:높이|세로|height|hauteur|altezza|alto|高さ)/i,/(?:깊이|depth|profondeur|profondità|fondo|奥行き)/i];
 const direct=[product.width,product.height,product.depth];
 const properties=[product.additionalProperty].flat().filter(Boolean),sources=[description,visible];
 const result=labels.map((label,index)=>{
  const values=[];
  const own=String(direct[index]?.value??direct[index]??'').match(/(\d+(?:[.,]\d+)?)\s*cm/i);if(own)values.push(mm(own[1]));
  for(const property of properties)if(label.test(String(property.name??''))){const m=String(property.value??'').match(/(\d+(?:[.,]\d+)?)\s*cm/i);if(m)values.push(mm(m[1]));}
  for(const source of sources){const pattern=new RegExp(`${label.source}\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)\\s*cm`,'gi');for(const m of source.matchAll(pattern))values.push(mm(m[1]));}
  const unique=[...new Set(values.filter(n=>Number.isFinite(n)&&n>=10&&n<=2000))];return unique.length===1?unique[0]:null;
 });
 return result.every(Boolean)?result:null;
}

export function parseOfficialProduct(html,url,cfg,{expectedCode,listingUrl}={}){
 const target=new URL(url),rules=BRAND_RULES[cfg.brand];
 if(!rules||target.protocol!=='https:'||!rules.hosts.includes(target.hostname)||!target.pathname.startsWith(cfg.localePrefix))throw Error('UNAUTHORIZED_URL');
 const products=[],breadcrumbs=[];
 const visit=(value,depth=0)=>{if(depth>15)throw Error('SCHEMA_DEPTH_LIMIT');if(!value||typeof value!=='object')return;
  if(tagged(value,'Product'))products.push(value);if(tagged(value,'BreadcrumbList'))breadcrumbs.push(value);
  for(const child of Object.values(value))if(child&&typeof child==='object')Array.isArray(child)?child.forEach(v=>visit(v,depth+1)):visit(child,depth+1);
 };
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(decodeHtml(match[1])));}catch(error){if(error.message==='SCHEMA_DEPTH_LIMIT')throw error;}
 const exact=[...new Map(products.filter(p=>code(p.mpn??p.sku)&&(!expectedCode||code(p.mpn??p.sku)===code(expectedCode))).map(p=>[code(p.mpn??p.sku),p])).values()];
 if(exact.length!==1)throw Error('EXACT_SKU_SCHEMA_REQUIRED');
 const product=exact[0],sku=code(product.mpn??product.sku),skuPattern=new RegExp(`^(?:${cfg.skuPattern})$`,'i');
 if(!skuPattern.test(sku)||expectedCode&&sku!==code(expectedCode))throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 const pageEvidence=code(decodeURIComponent(target.pathname)).includes(sku)||[product.url,product['@id'],product.offers?.url].some(raw=>{try{const u=new URL(raw,url);return rules.hosts.includes(u.hostname)&&code(decodeURIComponent(u.pathname)).includes(sku);}catch{return false;}});
 if(!pageEvidence)throw Error('URL_SKU_PROOF_MISSING');
 const offers=[product.offers].flat().filter(Boolean),offer=offers.find(o=>o.priceCurrency===cfg.currency)??(offers.length===1&&!offers[0].priceCurrency?offers[0]:null),amount=Number(String(offer?.price??'').replaceAll(',',''));
 if(!offer||!Number.isFinite(amount)||amount<=0||offer.priceCurrency!==cfg.currency&&!visibleCurrencyProof(html,amount,cfg.currency)||offers.some(o=>o.priceCurrency===cfg.currency&&Number(String(o.price).replaceAll(',',''))!==amount))throw Error('EXACT_CURRENCY_PRICE_REQUIRED');
 const name=clean(product.name);if(!name)throw Error('PRODUCT_NAME_MISSING');
 const breadcrumbBag=breadcrumbs.some(trail=>[trail.itemListElement].flat().flat().some(item=>rules.bagPath.test(String(item?.name??item?.item?.name??''))||(()=>{try{return rules.bagPath.test(new URL(item?.item?.url??item?.item??'',url).pathname);}catch{return false;}})()));
 const categoryBag=rules.bagPath.test(`/${String(product.category??'').trim()}/`),listingBag=listingUrl&&rules.bagPath.test(decodeURIComponent(new URL(listingUrl).pathname));
 if(!breadcrumbBag&&!categoryBag&&!listingBag)throw Error('BAG_CATEGORY_UNVERIFIED');
 if(/wallet|cardholder|card holder|keyring|charm|strap|지갑|카드지갑|키링|참\b|스트랩|portefeuille|cartera|portafoglio/i.test(name))throw Error('ACCESSORY_NOT_HANDBAG');
 const images=[product.image].flat().map(v=>typeof v==='string'?v:v?.url??v?.contentUrl).filter(Boolean);
 const image=images.map(raw=>{try{return new URL(raw,url);}catch{return null;}}).find(u=>u?.protocol==='https:'&&cfg.imageHosts.includes(u.hostname));
 if(!image)throw Error('OFFICIAL_IMAGE_URL_MISSING');
 const imageCode=cfg.brand==='hermes'&&sku.startsWith('H')?sku.slice(1):sku;
 if(!code(decodeURIComponent(image.pathname)).includes(imageCode))throw Error('IMAGE_SKU_MISMATCH');
 const description=clean(product.description),text=clean(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')),size=dimensionsMm(product,text);
 const color=clean(product.color)||null,material=clean(product.material)||null;
 if(cfg.brand!=='hermes'&&(!color||!material||!size))throw Error('PRODUCT_FIELDS_INCOMPLETE');
 const style=sku.match(new RegExp(cfg.stylePattern))?.[1];if(!style)throw Error('STYLE_CODE_MISSING');
 const parent=clean(product.isVariantOf?.name)||name;
 return {originalCode:String(product.mpn??product.sku),normalizedCode:sku,sourceProductId:String(product.sku??sku),styleCode:style,productName:name,parentModel:parent,modelKey:cfg.brand==='hermes'?`sku-${sku.toLowerCase()}`:`style-${style}`,colorDisplay:color,colorOriginal:color,materialDisplay:material,materialOriginal:material,widthMm:size?.[0]??null,heightMm:size?.[1]??null,depthMm:size?.[2]??null,description,sourceImageUrl:image.href,sourceImageOriginalVerified:false,price:amount,priceStatus:'confirmed',officialUrl:url,country:cfg.country,currency:cfg.currency,checkedAt:new Date().toISOString()};
}

export async function runBrandCollection(brand){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_BRAND!==brand)throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2),configIndex=args.indexOf('--country-config');
 if(configIndex!==0||!args[1]||args.length<3)throw Error('INVALID_MODE');
 const mode=args[2],allowed=['--inspect-navigation','--inspect-listing','--inspect-detail','--inspect-detail-evidence','--discover-catalog','--match-reference'];if(!allowed.includes(mode)||args.length!==(mode==='--match-reference'||mode==='--inspect-listing'||mode==='--inspect-detail'||mode==='--inspect-detail-evidence'?5:3)||mode==='--match-reference'&&args[3]!=='--reference-file'||mode==='--inspect-listing'&&args[3]!=='--listing-url'||(mode==='--inspect-detail'||mode==='--inspect-detail-evidence')&&args[3]!=='--detail-url')throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(args[1])),rules=BRAND_RULES[brand],run=process.env.CRAWL_RUN_DIR,artifact=path.join(run,'artifacts');
 if(cfg.brand!==brand||!rules||!rules.hosts.includes(new URL(cfg.entryUrl).hostname)||mode==='--discover-catalog'&&cfg.country!=='KR')throw Error('INVALID_COUNTRY_CONFIG');
 await fs.mkdir(artifact,{recursive:true});
 const summary=[],records=[],candidates=new Map(),pages=new Set(),queue=[cfg.entryUrl];let calls=0,activeUrl=cfg.entryUrl;
 const status=(state,row={})=>({brand,country:cfg.country,parentModel:String(row.parentModel??'공식 가방 목록').slice(0,120),variantCode:String(row.normalizedCode??'SOURCE').slice(0,120),price:row.price??null,currency:cfg.currency,status:state,officialUrl:row.officialUrl??activeUrl});
 const safe=raw=>{const u=new URL(raw),root=cfg.localePrefix.replace(/\/$/,'');if(u.protocol!=='https:'||u.username||u.password||!rules.hosts.includes(u.hostname)||u.pathname!==root&&!u.pathname.startsWith(cfg.localePrefix))throw Error('UNAUTHORIZED_URL');u.hash='';return u.href;};
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs??30000});
 async function get(raw){let target=safe(raw);for(let hop=0;hop<4;hop++){
  if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');activeUrl=target;
  const response=await context.get(target,{maxRedirects:0});if([403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
  if([301,302,303,307,308].includes(response.status())){target=safe(new URL(response.headers().location,target).href);continue;}
  if(!response.ok())throw Error(`HTTP_${response.status()}`);
  const body=await response.body();if(body.length>(cfg.maxResponseBytes??8388608))throw Error('RESPONSE_LIMIT');
  await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});const html=body.toString('utf8');
  if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(html))throw Error('ACCESS_BLOCKED');
  return {html,url:target};
 }throw Error('REDIRECT_LIMIT');}
 const links=(html,base)=>[...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(m=>{try{const u=new URL(decodeHtml(m[1]),base);if(/\.(?:css|js|json|png|jpe?g|gif|svg|ico|webp|woff2?|ttf)(?:$|\?)/i.test(u.href)||/\/assets\//i.test(u.pathname))return null;return safe(u.href);}catch{return null;}}).filter(Boolean);
 let reference=null;
 try{
  if(mode==='--inspect-navigation'){
   const page=await get(cfg.entryUrl),bagLinks=[...new Set(links(page.html,page.url).filter(link=>rules.bagPath.test(decodeURIComponent(new URL(link).pathname))))];
   for(const link of bagLinks.slice(0,15))summary.push(status('PUBLISHED_BAG_LINK',{officialUrl:link}));
   summary.push(status(`BAG_LINKS_${bagLinks.length}`,{officialUrl:page.url}));
   if(!bagLinks.length)process.exitCode=2;
   return;
  }
  if(mode==='--inspect-listing'){
   const listing=safe(args[4]);if(!rules.bagPath.test(decodeURIComponent(new URL(listing).pathname)))throw Error('BAG_LISTING_REQUIRED');
   const page=await get(listing),all=[...new Set(links(page.html,page.url))],bagLinks=all.filter(link=>rules.bagPath.test(decodeURIComponent(new URL(link).pathname)));
   for(const link of bagLinks.slice(0,15))summary.push(status('PUBLISHED_BAG_LINK',{officialUrl:link}));
   const detail=all.filter(link=>!new URL(link).pathname.startsWith(new URL(listing).pathname)&&!/(?:\/category\/|\/ca\/|\/search\/)/i.test(new URL(link).pathname)&&/[A-Z0-9]{8,}/i.test(decodeURIComponent(new URL(link).pathname).replace(/\/$/,'').split('/').at(-1)));
   detail.sort((a,b)=>Number(/\/(?:pr|products?)\//.test(new URL(b).pathname))-Number(/\/(?:pr|products?)\//.test(new URL(a).pathname)));
   for(const link of detail.slice(0,12))summary.push(status('POSSIBLE_DETAIL_LINK',{officialUrl:link}));
   summary.push(status(`LISTING_LINKS_${all.length}`,{officialUrl:page.url}),status(`BAG_LINKS_${bagLinks.length}`,{officialUrl:page.url}));
   return;
  }
  if(mode==='--inspect-detail'){
   const detail=safe(args[4]),page=await get(detail),row=parseOfficialProduct(page.html,page.url,cfg);
   await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify([row]),{mode:0o600});
   summary.push(status('EXACT_METADATA_IMAGE_PENDING',row));process.exitCode=2;
   return;
  }
  if(mode==='--inspect-detail-evidence'){
   const detail=safe(args[4]),page=await get(detail);let count=0;
   for(const match of page.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{
    const visit=value=>{if(!value||typeof value!=='object')return;if(tagged(value,'Product')){count++;const sku=code(value.mpn??value.sku),offers=[value.offers].flat().filter(Boolean);
     if(!offers.length)summary.push(status('SCHEMA_PRODUCT_NO_OFFER',{normalizedCode:sku,officialUrl:page.url}));
     summary.push(status(value.color?'SCHEMA_COLOR_PRESENT':'SCHEMA_COLOR_MISSING',{normalizedCode:sku,officialUrl:page.url}));
     summary.push(status(value.material?'SCHEMA_MATERIAL_PRESENT':'SCHEMA_MATERIAL_MISSING',{normalizedCode:sku,officialUrl:page.url}));
     summary.push(status(/\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*cm/i.test(String(value.description??''))?'SCHEMA_DIMENSIONS_PRESENT':'SCHEMA_DIMENSIONS_MISSING',{normalizedCode:sku,officialUrl:page.url}));
     for(const offer of offers.slice(0,4)){const price=Number(String(offer.price??'').replaceAll(',',''));summary.push({brand,country:cfg.country,parentModel:'공식 상세 근거',variantCode:sku||'SOURCE',price:Number.isFinite(price)&&price>0?price:null,currency:String(offer.priceCurrency??cfg.currency),status:offer.priceCurrency?'SCHEMA_OFFER':'SCHEMA_OFFER_CURRENCY_MISSING',officialUrl:page.url});}
     for(const image of [value.image].flat().slice(0,3)){const raw=typeof image==='string'?image:image?.url??image?.contentUrl;try{const u=new URL(raw,page.url);if(u.protocol==='https:'&&u.href.length<=500)summary.push(status('SCHEMA_IMAGE_URL',{normalizedCode:sku,officialUrl:u.href}));}catch{}}
    }for(const child of Object.values(value))if(child&&typeof child==='object')Array.isArray(child)?child.forEach(visit):visit(child);};visit(JSON.parse(decodeHtml(match[1])));
   }catch{}
   const meta=priceMeta(page.html),metaAmount=Number(String(meta.amount??'').replaceAll(',',''));
   summary.push({brand,country:cfg.country,parentModel:'공식 상세 근거',variantCode:'SOURCE',price:Number.isFinite(metaAmount)&&metaAmount>0?metaAmount:null,currency:String(meta.currency??cfg.currency),status:meta.currency?'META_PRICE_CURRENCY':'META_PRICE_CURRENCY_MISSING',officialUrl:page.url});
   const offerAmount=summary.find(r=>r.status==='SCHEMA_OFFER_CURRENCY_MISSING')?.price;
   if(offerAmount)summary.push(status(visibleCurrencyProof(page.html,offerAmount,cfg.currency)?'VISIBLE_PRICE_SYMBOL_CONFIRMED':'VISIBLE_PRICE_SYMBOL_MISSING',{price:offerAmount,officialUrl:page.url}));
   summary.push(status(`SCHEMA_PRODUCTS_${count}`,{officialUrl:page.url}));
   return;
  }
  if(mode==='--match-reference'){
   reference=JSON.parse(await fs.readFile(args[4]));if(!Array.isArray(reference)||!reference.length||reference.length>10000||reference.some(r=>!r.normalizedCode))throw Error('INVALID_REFERENCE_FILE');
   reference=new Set(reference.map(r=>code(r.normalizedCode)));
  }
  while(queue.length){
   if(pages.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_PAGE_LIMIT');
   const current=queue.shift();if(pages.has(current))continue;const page=await get(current);pages.add(current);
   for(const link of links(page.html,page.url)){
    const u=new URL(link),pathname=decodeURIComponent(u.pathname),isBag=rules.bagPath.test(pathname);
    const isDetail=Boolean(rules.detailPath?.test(pathname));
    if(isDetail&&isBag){candidates.set(link,{url:link,listingUrl:page.url});continue;}
    const category=isBag&&(brand==='hermes'?pathname.includes('/category/'):brand==='gucci'?pathname.includes('/ca/'):true);
    if(category&&!pages.has(link)&&!queue.includes(link))queue.push(link);
   }
   if(queue.length+candidates.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');
  }
  if(!candidates.size)throw Error('NO_PUBLISHED_BAG_CANDIDATES');
  if(candidates.size>cfg.maxProductsPerRun)throw Error('PRODUCT_BATCH_LIMIT');
  const unresolved=[];
  for(const target of candidates.values()){
   try{const page=await get(target.url),row=parseOfficialProduct(page.html,page.url,cfg,{listingUrl:target.listingUrl});
    if(reference&&!reference.has(row.normalizedCode))continue;
    if(records.some(r=>r.normalizedCode===row.normalizedCode&&r.officialUrl!==row.officialUrl))throw Error('DUPLICATE_SKU_URL');
    records.push(row);summary.push(status('EXACT_METADATA_IMAGE_PENDING',row));
   }catch(error){if(['ACCESS_BLOCKED','UNAUTHORIZED_URL','REQUEST_LIMIT','RESPONSE_LIMIT','REDIRECT_LIMIT'].includes(error.message))throw error;
    unresolved.push({url:target.url,status:/^[A-Z0-9_]{1,60}$/.test(error.message)?error.message:'DETAIL_UNRESOLVED'});
   }
  }
  await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});
  await fs.writeFile(path.join(artifact,'coverage.json'),JSON.stringify({pages:[...pages],candidates:candidates.size,unresolved,matched:records.length,referenceCount:reference?.size??null}),{mode:0o600});
  summary.push(status(`LISTING_PAGES_${pages.size}`),status(`CANDIDATES_${candidates.size}`),status(`UNRESOLVED_${unresolved.length}`));
  if(reference){const found=new Set(records.map(r=>r.normalizedCode)),missing=[...reference].filter(c=>!found.has(c));summary.push(status(`REFERENCE_MISSING_${missing.length}`));if(missing.length)process.exitCode=2;}
  if(unresolved.length||!records.length||records.some(row=>!row.sourceImageOriginalVerified))process.exitCode=2;
 }catch(error){const label=/^[A-Z0-9_]{1,60}$/.test(error.message)?error.message:'SOURCE_REQUEST_FAILED';summary.push(status(label));await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:label}),{mode:0o600});process.exitCode=1;}
 finally{await context.dispose();await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(summary.slice(0,100)));}
}
