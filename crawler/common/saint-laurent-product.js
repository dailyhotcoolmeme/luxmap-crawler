import {decodeHtml} from './prada-product.js';

const skuPattern=/^[A-Z0-9]{15}$/;
export function saintLaurentProductUrl(raw){
 if(typeof raw!=='string'||raw.length>500)return null;
 try{const u=new URL(decodeHtml(raw),'https://www.ysl.com');
  if(u.origin!=='https://www.ysl.com'||u.username||u.password||u.hash||u.search)return null;
  const sku=u.pathname.match(/^\/ko-kr\/pr\/[^/]+-([A-Z0-9]{15})\.html$/i)?.[1]?.toUpperCase();
  return sku?{url:u.href,sku}:null;
 }catch{return null;}
}
const clean=value=>typeof value==='string'&&!/[<>\x00-\x1f]/.test(value)&&value.trim().length<=300?value.trim():null;
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:typeof value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)>0?Number(value):null;
function taxonomyValue(value,depth=0){
 if(depth>3)return null;
 if(typeof value==='string')return !/[<\x00-\x1f]/.test(value)&&value.trim().length<=300?value.trim()||null:null;
 if(Array.isArray(value)){if(value.length>30)return null;const items=value.map(v=>taxonomyValue(v,depth+1)).filter(Boolean);return items.length?items:null;}
 if(value&&typeof value==='object'){
  const entries=Object.entries(value);if(entries.length>30)return null;
  const kept=entries.filter(([key])=>/^[A-Za-z0-9_-]{1,40}$/.test(key)).map(([key,v])=>[key,taxonomyValue(v,depth+1)]).filter(([,v])=>v!==null);
  return kept.length?Object.fromEntries(kept):null;
 }
 return null;
}
const keys=['sku','mpn','productId','productID','productCode','id','name','productName','displayName','price','prices','offers','currency','priceCurrency','currencyCode','image','images','imageUrl','category','productCategory','url','productUrl','href'];

// Local data only. Parse strict JSON, escaped JSON strings and React Flight text
// chunks without evaluating JS or resolving $ references into guessed values.
export function inspectSaintLaurentSource(html){
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_LIMIT');
 const diagnostics={scripts:0,flight:0,objects:0,keys:{},nativeAttributes:0,unresolvedScripts:0,productFields:{}};
 const objects=[],published=new Map(),seen=new Set(),observations=new Map();let visits=0,decodedBytes=0;
 function observe(text,field,parent={}){
  if(typeof text!=='string'||text.length>262144)return;
  for(const match of text.matchAll(/https:\/\/[^\s"'<>\\]+/g)){
   const raw=match[0].replace(/,$/,'');let u;
   try{u=new URL(raw);}catch{continue;}
   if(u.href!==raw||raw.length>500||u.username||u.password||u.port||u.hash||!['www.ysl.com','saint-laurent.dam.kering.com'].includes(u.hostname)||! /\.(?:jpe?g|png|webp|avif)$/i.test(u.pathname))continue;
   let pathname;try{pathname=decodeURIComponent(u.pathname);}catch{continue;}
   const sku=pathname.match(/(?:^|[^A-Z0-9])([A-Z0-9]{15})(?=[^A-Z0-9]|$)/i)?.[1]?.toUpperCase();if(!sku)continue;
   const item=observations.get(raw)??{sku,url:raw,kinds:[],declaredDimensions:[],srcsetWidths:[],originalVerified:false};
   const kind=/(?:original|fullsize|full_size)/i.test(field)?'ORIGINAL_FIELD':/zoom/i.test(field)?'ZOOM_FIELD':/large/i.test(field)?'LARGE_FIELD':/srcset/i.test(field)?'SRCSET':'IMAGE_VALUE';
   if(!item.kinds.includes(kind))item.kinds.push(kind);
   const width=parent.width??parent.naturalWidth,height=parent.height??parent.naturalHeight;
   if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=100000&&height<=100000){const size=`${width}X${height}`;if(!item.declaredDimensions.includes(size))item.declaredDimensions.push(size);}
   const descriptor=/srcset/i.test(field)?text.slice(match.index+match[0].length).match(/^\s+(\d{1,6})w(?:\s|,|$)/)?.[1]:null;
   if(descriptor&&!item.srcsetWidths.includes(Number(descriptor)))item.srcsetWidths.push(Number(descriptor));
   observations.set(raw,item);if(observations.size>2000)throw Error('METADATA_LIMIT');
  }
 }
 function walk(value,depth=0,trail=''){
  if(++visits>100000||depth>30)throw Error('METADATA_LIMIT');
  if(!value||typeof value!=='object')return;
  if(!Array.isArray(value)){objects.push(value);for(const key of keys)if(Object.hasOwn(value,key))diagnostics.keys[key]=(diagnostics.keys[key]??0)+1;}
  for(const [key,child] of Object.entries(value)){const field=`${trail}.${key}`;if(typeof child==='string')observe(child,field,value);else if(child&&typeof child==='object')walk(child,depth+1,field);}
 }
 function decode(source,depth=0){
  if(depth>3||seen.has(source))return;seen.add(source);decodedBytes+=Buffer.byteLength(source);
  if(decodedBytes>33554432||source.length>2097152)throw Error('METADATA_LIMIT');
  let parsed=false;
  try{const value=JSON.parse(source);parsed=true;if(typeof value==='string')decode(value,depth+1);else walk(value);}catch(e){if(e.message==='METADATA_LIMIT')throw e;}
  if(!parsed){
   // Nested strict-JSON objects may sit inside a JS wrapper. Oversized enclosing
   // wrappers are unresolved, not permission to increase the object byte cap.
   const stack=[];let quote=null,escape=false,attempts=0;
   for(let i=0;i<source.length;i++){
    const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')stack.push(i);
    if(c==='}'&&stack.length){const start=stack.pop();if(++attempts>2000)throw Error('METADATA_LIMIT');
     if(i-start+1>262144){diagnostics.unresolvedScripts++;continue;}
     let value;try{value=JSON.parse(source.slice(start,i+1));}catch{continue;}walk(value);
    }
   }
  }
  for(const m of source.matchAll(/"(?:[^"\\]|\\.)*"/g)){
   let value;try{value=JSON.parse(m[0]);}catch{continue;}
   if(typeof value==='string'&&value.includes('{')&&value!==source)decode(value,depth+1);
  }
 }
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  diagnostics.scripts++;if(/__next_f\s*\.\s*push/.test(m[1]))diagnostics.flight++;
  try{decode(decodeHtml(m[1]));}catch(e){if(e.message!=='METADATA_LIMIT')throw e;diagnostics.unresolvedScripts++;}
 }
 for(const m of html.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
  const key=m[1].toLowerCase(),value=decodeHtml(m[2]??m[3]);
  if(key==='href'){const item=saintLaurentProductUrl(value);if(item)published.set(item.sku,item.url);}
  if(/src|image|zoom|original|large|fullsize/.test(key))observe(value,key);
  if(key.startsWith('data-')){diagnostics.nativeAttributes++;if(value.trim().startsWith('{')||value.trim().startsWith('['))decode(value);}
 }
 diagnostics.objects=objects.length;
 const records=new Map();
 for(const object of objects){
  const references=[object.url,object.productUrl,object.href,object.offers?.url].map(saintLaurentProductUrl).filter(Boolean);
  const ids=[object.sku,object.mpn,object.productId,object.productID,object.productCode,object.id].filter(v=>typeof v==='string'&&skuPattern.test(v));
  const uniqueIds=[...new Set(ids)];if(uniqueIds.length!==1)continue;
  const sku=uniqueIds[0],reference=references.find(r=>r.sku===sku);
  if(references.some(r=>r.sku!==sku))continue;
  // Association may use an independently published exact-SKU link, never URL guessing.
  const url=reference?.url??published.get(sku);if(!url)continue;
  for(const [key,value] of Object.entries(object))if(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(key)){
   const kind=Array.isArray(value)?'ARR':value===null?'NULL':typeof value==='object'?'OBJ':typeof value==='number'?'NUM':'STR';
   const label=`SKUKEY_${key.toUpperCase()}_${kind}`;diagnostics.productFields[label]=(diagnostics.productFields[label]??0)+1;
  }
  for(const field of ['price','currency','currencyCode','images','image','categories','category','primaryCategory','priceValue','formattedPrice']){
   if(!Object.hasOwn(object,field))continue;
   const value=object[field],kind=Array.isArray(value)?'ARRAY':value===null?'NULL':typeof value==='object'?'OBJECT':typeof value==='number'?'NUMBER':'STRING';
   const label=`P_${field.toUpperCase()}_${kind}`;diagnostics.productFields[label]=(diagnostics.productFields[label]??0)+1;
   if(value&&typeof value==='object'&&!Array.isArray(value))for(const key of ['value','amount','formatted','sales','list','currency','currencyCode','centAmount','src','url','large','small','primary','name','id'])if(Object.hasOwn(value,key)){
    const label=`P_${field.toUpperCase()}_${key.toUpperCase()}`;diagnostics.productFields[label]=(diagnostics.productFields[label]??0)+1;
   }
  }
  const offers=[object.offers].flat().filter(v=>v&&typeof v==='object');
  const prices=[...offers.map(v=>({value:v.price,currency:v.priceCurrency})),
   {value:object.price,currency:object.currency??object.priceCurrency??object.currencyCode},
   {value:object.price?.value??object.price?.amount,currency:object.price?.currency??object.price?.currencyCode},
   {value:object.price?.sales?.value,currency:object.price?.sales?.currency}];
  // Explicit commerce fields observed in native source; never use list price as
  // a substitute, scale units, or derive a price from surrounding page text.
  prices.push({value:object.salePriceValue,currency:object.currencyCode});
  const confirmed=prices.filter(v=>amount(v.value)!==null&&v.currency==='KRW').map(v=>amount(v.value));
  const priceValues=[...new Set(confirmed)];
  const names=[object.name,object.productName,object.displayName].map(clean).filter(Boolean);
  const imageCandidates=[object.image,object.images,object.imageUrl].flat().flat().map(v=>typeof v==='string'?v:v?.url??v?.contentUrl??v?.src);
  const images=imageCandidates.filter(raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&['www.ysl.com','saint-laurent.dam.kering.com'].includes(u.hostname)&&u.href.length<=500;}catch{return false;}});
  const exactImages=[...new Set(images)].filter(raw=>{try{return new RegExp(`(?:^|[^A-Z0-9])${sku}(?=[^A-Z0-9]|$)`,'i').test(decodeURIComponent(new URL(raw).pathname));}catch{return false;}});
  const record={sku,url,name:names.length?names[0]:null,nameConflict:false,taxonomy:taxonomyValue(object.category??object.productCategory??object.categories),price:priceValues.length===1?priceValues[0]:null,currency:priceValues.length===1?'KRW':null,images:exactImages,associatedImages:[...new Set(images)],originalImageVerified:false,priceConflict:priceValues.length>1};
  const prior=records.get(sku);
  if(!prior)records.set(sku,record);
  else{
   if(prior.price!==null&&record.price!==null&&prior.price!==record.price){prior.price=null;prior.currency=null;prior.priceConflict=true;}
   else if(!prior.priceConflict&&record.price!==null){prior.price=record.price;prior.currency=record.currency;}
   prior.priceConflict ||=record.priceConflict;
   if(prior.priceConflict){prior.price=null;prior.currency=null;}
   if(prior.name&&record.name&&prior.name!==record.name){prior.nameConflict=true;prior.name=null;}
   if(!prior.name&&!prior.nameConflict)prior.name=record.name;
   if(!prior.taxonomy)prior.taxonomy=record.taxonomy;
   prior.images=[...new Set([...prior.images,...record.images])];
   prior.associatedImages=[...new Set([...prior.associatedImages,...record.associatedImages])];
  }
 }
 const known=new Set([...records.keys(),...published.keys()]);
 return {records:[...records.values()],published:[...published].map(([sku,url])=>({sku,url})),imageEvidence:[...observations.values()].filter(item=>known.has(item.sku)),diagnostics};
}
