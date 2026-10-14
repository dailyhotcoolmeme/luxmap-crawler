import {celineNodes} from './celine-html.js';
import {celineJsonLiterals} from './celine-json-literals.js';

const numeric=v=>/^\d{6}$/.test(String(v??''))?String(v):null;
const catalog=v=>/^AN\d{6}$/i.test(String(v??''))?String(v).toUpperCase():null;
const ids=v=>[v?.sku,v?.productId,v?.productID,v?.id].map(numeric).filter(Boolean);
function official(v,base){
 if(typeof v!=='string'||!v.trim())return null;
 try{const u=new URL(v,base);return u.protocol==='https:'&&u.hostname==='www.bulgari.com'&&!u.username&&!u.password&&!u.hash&&u.href.length<=500?u:null;}catch{return null;}
}
function productCode(u){return u&&!u.search&&u.pathname.startsWith('/ko-kr/')?u.pathname.match(/(?:\/|-)(\d{6})\.html$/)?.[1]??null:null;}
function references(v){return [v?.catalogCode,v?.catalogReference,v?.productCatalogCode,v?.productGroupID,v?.masterId,v?.masterID,v?.master?.id,v?.isVariantOf?.productGroupID,v?.isVariantOf?.id,v?.id,v?.sku].map(catalog).filter(Boolean);}
function amount(v){
 if(v==null||v==='')return null;
 if(typeof v!=='number'&&!(typeof v==='string'&&/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v)))throw Error('VARIANT_PRICE_INVALID');
 const n=Number(String(v).replaceAll(',',''));if(!Number.isFinite(n)||n<=0)throw Error('VARIANT_PRICE_INVALID');return n;
}
function priceProof(v,sku){
 const points=[],offers=[v.offers].flat().filter(Boolean);
 if(v.price!=null){if(typeof v.price==='object'){if(v.price.sales)points.push([v.price.sales.value,v.price.sales.currency??v.currency??v.priceCurrency]);else points.push([v.price.value,v.price.currency??v.currency??v.priceCurrency]);}else points.push([v.price,v.currency??v.priceCurrency]);}
 for(const o of offers){if(o.sku!=null&&String(o.sku)!==sku)throw Error('VARIANT_REFERENCE_CONFLICT');points.push([o.price,o.priceCurrency]);}
 const prices=[];let currency='';for(const [value,unit]of points){if(value==null)continue;if(!unit)throw Error('VARIANT_PRICE_CURRENCY_MISSING');if(unit!=='KRW')throw Error('VARIANT_CURRENCY_MISMATCH');const parsed=amount(value);if(parsed!=null)prices.push(parsed);currency=unit;}
 if(new Set(prices).size>1)throw Error('VARIANT_PRICE_CONFLICT');return {price:prices[0]??null,currency};
}

// Extract only explicit catalog ownership plus typed variants and published URLs.
// This is mapping evidence; it never declares catalog completeness or fetches.
export function extractBulgariCatalogReferences(html,sourceUrl,expectedCatalog){
 const wanted=catalog(expectedCatalog),source=official(sourceUrl,sourceUrl);
 if(!wanted||!source||!source.pathname.startsWith('/ko-kr/')||source.search)throw Error('CATALOG_SOURCE_INVALID');
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_LIMIT');
 const nodes=celineNodes(html),canonicals=nodes.filter(n=>n.tag==='link'&&(n.attrs.rel??'').toLowerCase()==='canonical').map(n=>official(n.attrs.href,source.href));
 if(canonicals.length!==1||!canonicals[0]||!canonicals[0].pathname.startsWith('/ko-kr/')||canonicals[0].search)throw Error('CATALOG_CANONICAL_INVALID');
 const canonical=canonicals[0],canonicalCatalog=catalog(canonical.pathname.match(/(?:\/|-)(AN\d{6})\.html$/i)?.[1]);
 const ownerNodes=nodes.filter(n=>catalog(n.attrs['data-product-catalog-code'])===wanted&&numeric(n.attrs['data-product-id']));
 const ownerSkus=new Set(ownerNodes.map(n=>n.attrs['data-product-id']));
 if(canonicalCatalog!==wanted&&(!productCode(canonical)||!ownerSkus.has(productCode(canonical))))throw Error('CATALOG_CANONICAL_MISMATCH');
 const records=new Map(),issues=new Map(),roots=[],seen=new WeakSet(),declaredSkus=new Set();let visits=0,typedCount=0;
 const issue=(status,sku='SOURCE',url=source.href,price=null,currency='')=>{issues.set(status+'|'+sku+'|'+url,{brand:'bulgari',country:'KR',parentModel:wanted,variantCode:sku,price,currency,status,officialUrl:url});};
 const consume=(value,depth=0)=>{
  if(++visits>150000||depth>80)throw Error('METADATA_LIMIT');
  if(!value||typeof value!=='object')return;
  const ref=references(value),own=ids(value),typed=['variants','hasVariant','variationAttributes'].some(k=>Array.isArray(value[k]));
  const native=Array.isArray(value.imageGroups)||[value['@type']].flat().some(t=>t==='Product'||t==='ProductGroup')||typed;
  if(native&&(ref.includes(wanted)||own.some(id=>ownerSkus.has(id)))){
   if(ref.some(r=>r!==wanted))issue('CATALOG_REFERENCE_CONFLICT',own[0]??'SOURCE');
   else if(!seen.has(value)){seen.add(value);roots.push(value);}
  }
  Object.values(value).forEach(v=>consume(v,depth+1));
 };
 const json=text=>{let v;try{v=JSON.parse(text);}catch{}return v;};
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  const v=json(m[2]);if(v!==undefined)consume(v);else if(!/application\/(?:ld\+)?json/i.test(m[1]))for(const value of celineJsonLiterals(m[2]))consume(value);
 }
 for(const n of nodes)for(const [key,text]of Object.entries(n.attrs))if(key.startsWith('data-')&&/^[\[{]/.test(text.trim())){const v=json(text);if(v!==undefined)consume(v);}
 for(const n of ownerNodes)for(const key of ['data-product-variants','data-variants','data-product-variation-attributes','data-variation-attributes'])if(n.attrs[key]){
  const value=json(n.attrs[key]);
  if(Array.isArray(value))consume({id:n.attrs['data-product-id'],catalogCode:wanted,[key.includes('attributes')?'variationAttributes':'variants']:value});
  else issue('TYPED_VARIATION_SHAPE_UNSUPPORTED',n.attrs['data-product-id']);
 }
 const add=(v,url,status)=>{
  const u=official(url,source.href);if(!u){issue('VARIANT_OFFICIAL_URL_MISSING',ids(v)[0]??'SOURCE');return;}
  const sku=productCode(u),own=ids(v),refs=references(v);
  if(!sku){issue('VARIANT_PRODUCT_ROUTE_UNPROVEN',own[0]??'SOURCE',u.href);return;}
  if((own.length&&own.some(id=>id!==sku))||(v.sku!=null&&!numeric(v.sku))||refs.some(r=>r!==wanted)){issue('VARIANT_REFERENCE_CONFLICT',sku,u.href);return;}
  let price=null,currency='',bad=false;
  try{({price,currency}=priceProof(v,sku));}catch(e){issue(e.message,sku,u.href);bad=true;}
  if(bad){issue('VARIANT_PRICE_UNVERIFIED',sku,u.href);return;}
  const existing=records.get(sku);
  if(existing&&existing.price!=null&&price!=null&&existing.price!==price){records.delete(sku);issue('VARIANT_PRICE_CONFLICT',sku,u.href);return;}
  if([...issues.values()].some(r=>r.variantCode===sku&&/CONFLICT/.test(r.status)))return;
  const record={brand:'bulgari',country:'KR',parentModel:wanted,variantCode:sku,price,currency,status,officialUrl:u.href};
  if(!existing||existing.price==null&&price!=null)records.set(sku,record);
  if(records.size>500)throw Error('VARIANT_LIMIT');
 };
 for(const root of roots){
  const own=ids(root),links=[root.url,root.slugUrl,root.productUrl];
  for(const n of ownerNodes)if(own.includes(n.attrs['data-product-id']))links.push(n.attrs['data-product-slug-url'],n.attrs['data-product-storefront-path']);
  if(own.includes(productCode(canonical)))links.push(canonical.href);
  for(const url of links.filter(Boolean))add(root,url,'EXPLICIT_CATALOG_OWNER_SKU');
  const variant=(v,level=0)=>{
   if(level>10)throw Error('VARIATION_DEPTH_LIMIT');if(!v||typeof v!=='object')return;
   if(++typedCount>3000)throw Error('VARIANT_LIMIT');
   ids(v).forEach(sku=>declaredSkus.add(sku));
   const urls=[v.url,v.productUrl,v.slugUrl,v.href].filter(x=>typeof x==='string');
   if(urls.length)for(const url of urls)add(v,url,'TYPED_VARIATION_SKU_LINK');
   else if(ids(v).length){const sku=ids(v)[0];issue('VARIANT_OFFICIAL_URL_MISSING',sku);try{const proof=priceProof(v,sku);if(proof.price!=null)issue('VARIANT_URL_MISSING_PRICE_DECLARED',sku,source.href,proof.price,proof.currency);}catch(e){issue(e.message,sku);}}
   // Only recognized typed containers; recommendations are never traversed.
   for(const key of ['values','variants','hasVariant'])if(Array.isArray(v[key]))v[key].forEach(child=>variant(child,level+1));
  };
  for(const key of ['variants','hasVariant'])if(Array.isArray(root[key]))root[key].forEach(v=>variant(v));
  if(Array.isArray(root.variationAttributes))for(const attr of root.variationAttributes)if(Array.isArray(attr.values))attr.values.forEach(v=>variant(v));
 }
 if(!roots.length)issue('CATALOG_TYPED_OWNER_MISSING');
 if(!typedCount)issue('NO_TYPED_VARIATION_ROWS');
 return {catalogReference:wanted,complete:false,typedCount,declaredSkus:[...declaredSkus].sort(),ownerCount:roots.length,records:[...records.values()].sort((a,b)=>a.variantCode.localeCompare(b.variantCode)),issues:[...issues.values()]};
}
