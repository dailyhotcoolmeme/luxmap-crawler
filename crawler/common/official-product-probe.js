import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
export async function probeOfficialProduct(){
 const args=process.argv.slice(2);
 if(args.length!==5||args[0]!=='--country-config'||args[2]!=='--probe-product-source'||args[3]!=='--product-url'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.CRAWL_MODE!=='deterministic-only')throw Error('GUARDED_PRODUCT_PROBE_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,rows=[];
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 let active=new URL(args[4]);
 const normalize=value=>String(value??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 const row=(status,code='SOURCE',price=null,url=active.href,currency=cfg.currency)=>({brand:cfg.brand,country:cfg.country,parentModel:'공식 한국 상품 상세 근거',variantCode:code,price,currency,status,officialUrl:url});
 try{
  let html;
  for(let hop=0;hop<4;hop++){
   if(active.protocol!=='https:'||active.username||active.password||!cfg.siteHosts.includes(active.hostname)||!active.pathname.startsWith(cfg.localePrefix))throw Error('UNAUTHORIZED_URL');
   const r=await context.get(active.href,{maxRedirects:0});
   if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(r.status())){active=new URL(r.headers().location,active);continue;}
   if(!r.ok())throw Error(`HTTP_${r.status()}`);
   const body=await r.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   html=body.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|<title[^>]*>\s*access denied/i.test(html))throw Error('ACCESS_BLOCKED');
   await fs.writeFile(path.join(run,'raw','1.source'),body,{mode:0o600});break;
  }
  if(!html)throw Error('REDIRECT_LIMIT');
  const products=[],trails=[];let nodes=0;
  const walk=value=>{
   if(++nodes>50000)throw Error('METADATA_LIMIT');if(!value||typeof value!=='object')return;
   if([value['@type']].flat().includes('Product'))products.push(value);
   if([value['@type']].flat().includes('BreadcrumbList'))trails.push(value);
   Object.values(value).forEach(walk);
  };
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
   try{walk(JSON.parse(decodeHtml(match[1])));}catch(e){if(e.message==='METADATA_LIMIT')throw e;}
  }
  rows.push(row(`SCHEMA_PRODUCTS_${products.length}`));
  for(const product of products.slice(0,3)){
   const code=normalize(product.sku??product.mpn??product.productID)||'SOURCE';
   const canonical=normalize(decodeURIComponent(active.pathname).replace(/\.html\/?$/i,''));
   rows.push(row(code!=='SOURCE'&&canonical.endsWith(code)?'EXACT_SKU_URL':'SKU_URL_UNVERIFIED',code));
   const category=String(product.category??'');
   rows.push(row(/bag|handbag|가방|핸드백|sac|バッグ/i.test(category)?'SCHEMA_CATEGORY_BAG':/jewel|necklace|bracelet|ring|earring|주얼리|쥬얼리|목걸이|반지|팔찌|귀걸이/i.test(category)?'SCHEMA_CATEGORY_JEWELRY':'SCHEMA_CATEGORY_UNRESOLVED',code));
   for(const offer of [product.offers].flat().filter(Boolean).slice(0,3)){
    const price=Number(String(offer.price??'').replaceAll(',',''));
    rows.push(row(offer.priceCurrency===cfg.currency?'EXACT_COUNTRY_OFFER':'OFFER_CURRENCY_UNVERIFIED',code,Number.isFinite(price)&&price>0?price:null,active.href,String(offer.priceCurrency??cfg.currency)));
   }
   for(const image of [product.image].flat().filter(Boolean).slice(0,2)){
    try{const url=new URL(typeof image==='string'?image:image.url??image.contentUrl,active);if(url.protocol==='https:'&&url.href.length<=500)rows.push(row('PUBLISHED_IMAGE_URL',code,null,url.href));}catch{}
   }
  }
  await fs.mkdir(path.join(run,'artifacts'),{recursive:true});await fs.writeFile(path.join(run,'artifacts','product-schema.json'),JSON.stringify({url:active.href,products,trails}),{mode:0o600});
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SOURCE_REQUEST_FAILED'));process.exitCode=/UNAUTHORIZED|LIMIT/.test(e.message)?78:1;}
 finally{await context.dispose();await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});}
}
