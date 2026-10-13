import {normalizeProductCode} from './product-normalizer.js';
export function transientSourceError(error){
 const message=String(error?.message??'');
 if(/timeout/i.test(message))return 'SOURCE_TIMEOUT';
 if(/ECONNRESET|socket hang up|connection reset|socket disconnected/i.test(message))return 'SOURCE_CONNECTION_RESET';
 return null;
}
export function referenceCode(url,brand){
 const p=new URL(url).pathname;
 return brand==='van-cleef-arpels'?p.match(/\/(VC[A-Z0-9]{8})-[^/]+\.html$/i)?.[1]:p.match(/\/(m[0-9][a-z0-9]+-[0-9]+)$/i)?.[1];
}
export function parseReferenceProduct(html,url,cfg){
 const expected=normalizeProductCode(referenceCode(url,cfg.brand));
 if(!expected||!new RegExp(cfg.productPathPattern,'i').test(new URL(url).pathname))throw Error('REFERENCE_URL_INVALID');
 const products=[];
 function visit(v){if(!v||typeof v!=='object')return;if([v['@type']].flat().includes('Product')&&normalizeProductCode(v.sku)===expected)products.push(v);Object.values(v).forEach(visit);}
 for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(m[1]));}catch{}}
 if(!products.length)throw Error('EXACT_SCHEMA_MISSING');
 const p=products[0],offers=products.flatMap(p=>[p.offers].flat()).filter(o=>o?.priceCurrency===cfg.currency),prices=[...new Set(offers.map(o=>Number(String(o.price).replaceAll(',',''))).filter(n=>Number.isFinite(n)&&n>0))];
 if(prices.length>1)throw Error('PRICE_CONFLICT');
 const image=[p.image].flat().map(v=>typeof v==='string'?v:v?.url??v?.contentUrl).find(u=>{try{return cfg.allowedHosts.includes(new URL(u).hostname);}catch{return false;}});
 if(!image)throw Error('OFFICIAL_IMAGE_MISSING');
 if(typeof p.name!=='string'||!p.name.trim())throw Error('NAME_MISSING');
 const text=v=>typeof v==='string'?v.trim()||null:null;
 return {brand:cfg.brand,category:cfg.category,country:'KR',currency:'KRW',originalCode:String(p.sku),normalizedCode:expected,styleCode:expected,modelKey:`sku-${expected.toLowerCase()}`,parentModel:p.name,productName:p.name,materialDisplay:text(p.material),materialOriginal:text(p.material),colorDisplay:text(p.color),colorOriginal:text(p.color),widthMm:null,heightMm:null,depthMm:null,price:prices[0]??null,priceStatus:prices.length?'confirmed':'price_unavailable',officialUrl:url,checkedAt:new Date().toISOString(),image};
}
