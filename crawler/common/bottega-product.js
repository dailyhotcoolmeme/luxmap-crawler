import {decodeHtml,pradaOfficialAmount} from './prada-product.js';
import {normalizeProductCode} from './product-normalizer.js';

// Manufacturer reference, not the storefront's unrelated numeric inventory ID.
export function parseBottegaProduct(html,url,config,options={}){
 const target=new URL(url),pathCode=decodeURIComponent(target.pathname).match(/([A-Z0-9]{15})(?:\.html)?\/?$/i)?.[1]?.toUpperCase(),numericAlias=decodeURIComponent(target.pathname).match(/(?:-|\/)(\d{8,10})(?:\.html)?\/?$/)?.[1];
 const expected=pathCode??(numericAlias&&numericAlias===options.expectedProductId&&/^[A-Z0-9]{15}$/.test(options.expectedCode??'')?options.expectedCode:undefined);
 if(options.expectedCode&&pathCode&&pathCode!==options.expectedCode)throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 if(target.protocol!=='https:'||!config.allowedHosts.includes(target.hostname)||!target.pathname.startsWith(config.localePrefix)||!expected)throw Error('EXACT_REFERENCE_REQUIRED');
 const entities={oacute:'ó',aacute:'á',eacute:'é',iacute:'í',uacute:'ú',nbsp:' '};
 const text=decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/&([a-z]+);/g,(all,n)=>entities[n]??all).replace(/\s+/g,' ').trim();
 const references=[...new Set([...text.matchAll(/(?:제품\s*코드|제품\s*번호|상품\s*코드|품번|product\s*code|reference|商品コード|製品コード|商品番号|货号|商品编号|產品編號|产品编号|Código\s+(?:(?:de|del)\s+)?producto|Codice\s+(?:del\s+)?prodotto|Code\s+produit|Référence)\s*[:：]?\s*([A-Z0-9]{6}[\s-]*[A-Z0-9]{5}[\s-]*[A-Z0-9]{4})\b/gi)].map(m=>normalizeProductCode(m[1])))];
 const products=[],trails=[];const visit=v=>{if(!v||typeof v!=='object')return;if([v['@type']].flat().includes('Product'))products.push(v);if([v['@type']].flat().includes('BreadcrumbList'))trails.push(v);Object.values(v).forEach(visit);};
 for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(m[1]));}catch{try{visit(JSON.parse(decodeHtml(m[1])));}catch{}}
 if(products.length!==1)throw Error('PRODUCT_SCOPE_AMBIGUOUS');
 const product=products[0],offer=[product.offers].flat().find(o=>o?.priceCurrency===config.currency);
 const schemaReference=normalizeProductCode(product.mpn??product.sku);
 if((references.length&&!(references.length===1&&references[0]===expected))||(!references.length&&schemaReference!==expected))throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 if(numericAlias&&String(product.sku)!==numericAlias)throw Error('SCHEMA_URL_MISMATCH');
 if(!product.name||!offer)throw Error('COUNTRY_PRODUCT_MISSING');
 const price=pradaOfficialAmount(offer.price,config.locale);
 if(!Number.isFinite(price)||price<=0)throw Error('INVALID_PRICE');
 // A numeric canonical SKU is only accepted after the visible manufacturer
 // reference matches the requested full code, and its own offer URL agrees.
 if(offer.url){const canonical=new URL(decodeHtml(offer.url),url);if(!config.allowedHosts.includes(canonical.hostname)||!canonical.pathname.startsWith(config.localePrefix)||!normalizeProductCode(decodeURIComponent(canonical.pathname).replace(/\.html$/i,'')).endsWith(normalizeProductCode(product.sku)))throw Error('SCHEMA_URL_MISMATCH');}
 const officialCategories=[];
 for(const value of [product.category].flat())if(typeof value==='string'&&/handbags|핸드백|가방/i.test(value))officialCategories.push('Bags');
 for(const trail of trails){
  const items=trail.itemListElement;if(!Array.isArray(items))continue;
  const linked=items.some(i=>{const raw=typeof i.item==='string'?i.item:i.item?.['@id']??i.item?.url??i.url;try{const u=new URL(raw,url),suffix=normalizeProductCode(decodeURIComponent(u.pathname).replace(/\.html$/i,''));return config.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(config.localePrefix)&&(suffix.endsWith(expected)||suffix.endsWith(normalizeProductCode(product.sku)));}catch{return false;}});
  if(!linked)continue;
  for(const i of items){const name=String(i.name??i.item?.name??'');if(/핸드백|가방|handbags/i.test(name))officialCategories.push('Bags');}
 }
 for(const section of html.matchAll(/<(?:nav|ol|ul)\b[^>]*\bbreadcrumb[^>]*>([\s\S]*?)<\/(?:nav|ol|ul)>/gi))for(const m of section[1].matchAll(/href=["']([^"']+)["']/gi))try{
  const u=new URL(decodeHtml(m[1]),url);
  if(config.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(config.localePrefix)&&(/\/핸드백-여성(?:\/|$)/.test(decodeURIComponent(u.pathname))||/\/남성-컬렉션\/백(?:\/|$)/.test(decodeURIComponent(u.pathname))))officialCategories.push('Bags');
  if(config.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(config.localePrefix)&&(/\/(?:지갑-여성|액세서리-여성)(?:\/|$)/.test(decodeURIComponent(u.pathname))||/\/남성-컬렉션\/지갑(?:\/|$)/.test(decodeURIComponent(u.pathname))))officialCategories.push('NonBag');
 }catch{}
 const description=decodeHtml(String(product.description??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
 const dimension=label=>{const m=text.match(new RegExp(`(?:${label})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)\\s*cm`,'i'));return m?Number(m[1].replace(',','.'))*10:null;};
  const materialMatch=text.match(/(?:소재|구성)\s*[:：]\s*(.{1,160}?)(?=색상\s*[:：]|컬러\s*[:：]|안감\s*[:：]|높이\s*[:：]|세로\s*[:：]|가로\s*[:：]|너비\s*[:：]|폭\s*[:：]|깊이\s*[:：]|제품\s*코드|제조국\s*[:：]|하드웨어\s*[:：]|$)/);
 const color=typeof product.color==='string'?decodeHtml(product.color).trim():null;
 const image=[product.image].flat().map(v=>typeof v==='string'?v:v?.url??v?.contentUrl).find(v=>typeof v==='string'&&v.startsWith('https://'))??null;
 if(options.requireImageReference!==false&&image&&!normalizeProductCode(new URL(image).pathname).includes(expected))throw Error('IMAGE_REFERENCE_MISMATCH');
 const productName=decodeHtml(product.name).replace(/\s+에 대한 (?:여성|남성)\s+에\s+.+$/u,'').trim();
 return{originalCode:expected,normalizedCode:expected,sourceProductId:String(product.sku),styleCode:expected.slice(0,6),officialCategories,productName,colorDisplay:color,colorOriginal:color,materialDisplay:materialMatch?.[1]?.trim()??null,materialOriginal:materialMatch?.[1]?.trim()??null,widthMm:dimension('너비|가로'),heightMm:dimension('높이|세로'),depthMm:dimension('깊이|폭'),description,sourceImageUrl:image,price,priceStatus:'confirmed',officialUrl:url,country:config.country,currency:config.currency,checkedAt:new Date().toISOString()};
}
