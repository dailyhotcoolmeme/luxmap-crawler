import {celineNodes} from './celine-html.js';
import {celineJsonLiterals} from './celine-json-literals.js';
import {bulgariOriginalImageUrl} from './bulgari-image-url.js';

const currencies={KR:'KRW',JP:'JPY',US:'USD',GB:'GBP',FR:'EUR',IT:'EUR',DE:'EUR',ES:'EUR',HK:'HKD',SG:'SGD',TW:'TWD',AU:'AUD',CA:'CAD',CH:'CHF',AE:'AED'};
const text=v=>typeof v==='string'?v.replace(/\s+/g,' ').trim()||null:null;
const code=v=>/^\d{6}$/.test(String(v??''))?String(v):null;
const taxonomy=v=>text(v)?.toLowerCase().replace(/[ _]+/g,'-');
const jewelry=new Set(['jewelry','jewellery','fine-jewelry','fine-jewellery','high-jewelry','high-jewellery','주얼리','파인-주얼리']);
const excluded=/(?:^|[^a-z])(?:watch(?:es)?|bags?|handbags?|fragrance|perfumes?)(?:$|[^a-z])|시계|가방|향수/i;
function amount(v){
 if(v==null||v==='')return null;
 if(typeof v!=='number'&&!(typeof v==='string'&&/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v.trim())))throw Error('INVALID_PRICE');
 const n=Number(String(v).replaceAll(',',''));if(!Number.isFinite(n)||n<=0)throw Error('INVALID_PRICE');return n;
}
function only(values,error){const unique=[...new Set(values.filter(v=>v!=null))];if(unique.length>1)throw Error(error);return unique[0]??null;}
export function bulgariReferenceCode(value,localePrefix='/ko-kr/'){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.bulgari.com'||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(localePrefix)||/%|\\/.test(u.pathname))return null;
 const rest=u.pathname.slice(localePrefix.length);
 return rest.match(/^(\d{6})\.html$/)?.[1]??rest.match(/^jewellery\/(?:[a-z0-9-]+\/)*[a-z0-9-]+-(\d{6})\.html$/i)?.[1]??null;
 }catch{return null;}
}

// Pure offline parser. No requests, evaluation of scripts, or model-based mapping.
export function parseBulgariProduct(html,url,cfg){
 if(typeof html!=='string'||Buffer.byteLength(html)>8*1024*1024)throw Error('RESPONSE_LIMIT');
 const u=new URL(url),expected=bulgariReferenceCode(url,cfg.localePrefix);
 if(!expected||!cfg.localePrefix||!cfg.localePrefix.toLowerCase().endsWith(`-${String(cfg.country).toLowerCase()}/`)||!Object.hasOwn(currencies,cfg.country)||currencies[cfg.country]!==cfg.currency)throw Error('EXACT_REFERENCE_REQUIRED');
 const nodes=celineNodes(html);
 const canonicals=nodes.filter(n=>n.tag==='link'&&(n.attrs.rel??'').toLowerCase().split(/\s+/).includes('canonical')).map(n=>{try{return new URL(n.attrs.href,url).href;}catch{return null;}});
 if(canonicals.length!==1||bulgariReferenceCode(canonicals[0],cfg.localePrefix)!==expected)throw Error('CANONICAL_REFERENCE_MISMATCH');
 const canonical=canonicals[0];
 const owners=nodes.filter(n=>n.attrs['data-product-id']===expected);
 const objects=[];let visits=0;
 const walk=(v,depth=0)=>{
  if(++visits>100000||depth>80)throw Error('METADATA_LIMIT');
  if(!v||typeof v!=='object')return;
  const ids=[v.sku,v.id,v.productID,v.productId].map(code).filter(Boolean);
  if(ids.includes(expected)){
   if(ids.some(id=>id!==expected)||(v.sku!=null&&code(v.sku)!==expected))throw Error('PRODUCT_REFERENCE_CONFLICT');
   if(typeof v.url==='string'&&bulgariReferenceCode(new URL(v.url,url).href,cfg.localePrefix)!==expected)throw Error('PRODUCT_REFERENCE_CONFLICT');
   // Analytics records alone cannot establish product metadata or images.
   if([v['@type']].flat().includes('Product')||Array.isArray(v.imageGroups))objects.push(v);
  }
  Object.values(v).forEach(child=>walk(child,depth+1));
 };
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  let parsed;try{parsed=JSON.parse(m[2]);}catch{}
  if(parsed!==undefined)walk(parsed);
  else if(!/application\/(?:ld\+)?json/i.test(m[1]))for(const v of celineJsonLiterals(m[2]))walk(v);
 }
 for(const n of nodes)for(const [k,v]of Object.entries(n.attrs))if(k.startsWith('data-')&&/^[\[{]/.test(v.trim())){let parsed;try{parsed=JSON.parse(v);}catch{}if(parsed!==undefined)walk(parsed);}
 if(!objects.length)throw Error('EXACT_PRODUCT_METADATA_MISSING');
 const categories=[...owners.flatMap(n=>['data-product-business','data-product-marketing-sbu','data-product-classification','data-category-storefront-path'].map(k=>n.attrs[k])),...objects.flatMap(v=>[v.category,v.productCategory,v.primaryCategoryId])].map(text).filter(Boolean);
 const isJewelry=categories.some(v=>jewelry.has(taxonomy(v))),isExcluded=categories.some(v=>excluded.test(v));
 if(isExcluded&&isJewelry)throw Error('PRODUCT_CATEGORY_CONFLICT');
 if(isExcluded)throw Error('NON_JEWELLERY_CATEGORY');
 if(!isJewelry)throw Error('JEWELLERY_CATEGORY_UNVERIFIED');
 const prices=[],currencyEvidence=[];
 const offer=(v,currency)=>{
  if(currency!=null&&currency!==''){if(currency!==cfg.currency)throw Error('COUNTRY_CURRENCY_MISMATCH');currencyEvidence.push(currency);}
  if(v!=null&&v!==''){if(!currency)throw Error('PRICE_CURRENCY_MISSING');prices.push(amount(v));}
 };
 for(const v of objects){
  if(v.price!=null)offer(v.price,v.currency??v.priceCurrency);
  else if(v.currency)offer(null,v.currency);
  for(const o of [v.offers].flat().filter(Boolean)){
   if((o.sku!=null&&code(o.sku)!==expected)||(typeof o.url==='string'&&bulgariReferenceCode(new URL(o.url,url).href,cfg.localePrefix)!==expected))throw Error('PRODUCT_REFERENCE_CONFLICT');
   offer(o.price,o.priceCurrency);
  }
 }
 for(const n of owners)if(n.attrs['data-product-price']!=null||n.attrs['data-currency'])offer(n.attrs['data-product-price'],n.attrs['data-currency']);
 if(!currencyEvidence.length)throw Error('PRICE_CURRENCY_MISSING');
 const price=only(prices,'PRICE_CONFLICT');
 const name=only(objects.map(v=>text(v.name)),'PRODUCT_NAME_CONFLICT');if(!name)throw Error('PRODUCT_NAME_MISSING');
 const images=[];
 for(const v of objects){
  for(const group of v.imageGroups??[])if(group.viewType==='large')for(const image of group.images??[])try{images.push(bulgariOriginalImageUrl(image));}catch(e){if(e.message==='IMAGE_SOURCE_CONFLICT')throw e;}
  if([v['@type']].flat().includes('Product'))for(const image of [v.image].flat())try{images.push(bulgariOriginalImageUrl(image));}catch(e){if(e.message==='IMAGE_SOURCE_CONFLICT')throw e;}
 }
 if(!images.length&&cfg.country==='KR')throw Error('OFFICIAL_IMAGE_MISSING');
 const field=(schema,attr)=>only([...objects.map(v=>text(v[schema])),...owners.map(n=>text(n.attrs[attr]))],`PRODUCT_${schema.toUpperCase()}_CONFLICT`);
 const material=field('material','data-product-material'),stone=field('stone','data-product-main-stone'),size=field('size','data-product-size'),color=field('color','data-product-color');
 // Keep each exact SKU independent until an official family mapping is supplied.
 const referenceProof={schema:1,exactReferenceVerified:true,classificationEvidenceVerified:true,countryCurrencyVerified:true,brand:'bulgari',category:'jewelry',country:cfg.country,currency:cfg.currency,code:expected,officialUrl:canonical};
 return {brand:'bulgari',category:'jewelry',country:cfg.country,currency:cfg.currency,originalCode:expected,normalizedCode:expected,sourceProductId:expected,styleCode:expected,modelKey:`sku-${expected}`,parentModel:name,productName:name,materialDisplay:material,materialOriginal:material,stoneDisplay:stone,stoneOriginal:stone,sizeDisplay:size,colorDisplay:color,colorOriginal:color,widthMm:null,heightMm:null,depthMm:null,price,priceStatus:price===null?'price_unavailable':'confirmed',officialUrl:canonical,sourceImageUrl:images[0]??null,image:images[0]??null,checkedAt:new Date().toISOString(),referenceProof};
}
