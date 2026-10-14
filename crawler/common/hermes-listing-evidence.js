import {decodeHtml} from './prada-product.js';
const skuPattern=/^H[A-Z0-9]{8,19}$/;
const clean=v=>typeof v==='string'&&v.trim()&&v.length<=300&&!/[<>\x00-\x1f]/.test(v)?v.trim():null;
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:typeof v==='string'&&/^\d+(?:\.\d{1,2})?$/.test(v)&&Number(v)>0?Number(v):null;
function taxonomy(v,depth=0){
 if(depth>3)return null;if(typeof v==='string')return clean(v);
 if(Array.isArray(v)){if(v.length>30)return null;const items=v.map(x=>taxonomy(x,depth+1)).filter(x=>x!==null);return items.length?items:null;}
 if(v&&typeof v==='object'){const entries=Object.entries(v);if(entries.length>30)return null;const items=entries.filter(([k])=>/^[A-Za-z0-9_-]{1,40}$/.test(k)).map(([k,x])=>[k,taxonomy(x,depth+1)]).filter(([,x])=>x!==null);return items.length?Object.fromEntries(items):null;}
 return null;
}
export function hermesEvidenceLink(raw,market={localePrefix:'/kr/ko/'}){
 if(typeof raw!=='string'||raw.length>500)return null;
 try{const u=new URL(decodeHtml(raw),'https://www.hermes.com');if(u.origin!=='https://www.hermes.com'||u.username||u.password||u.search||u.hash)return null;
 const prefix=market.localePrefix;
 if(!/^\/[a-z]{2}\/[a-z]{2}\/$/.test(prefix??'')||!u.pathname.startsWith(prefix))return null;
 const sku=u.pathname.slice(prefix.length).match(/^product\/[^/]+-(H[A-Z0-9]{8,19})\/?$/i)?.[1]?.toUpperCase();return sku?{sku,url:u.href}:null;}catch{return null;}
}
// Bind visible currency to one product card, never to the whole page/another SKU.
export function hermesVisiblePrices(html,market={country:'KR',currency:'KRW',localePrefix:'/kr/ko/'}){
 const formats={KR:['KRW','₩','en'],JP:['JPY','[¥￥]','en'],FR:['EUR','€','fr'],IT:['EUR','€','it'],ES:['EUR','€','it'],US:['USD','(?<![A-Za-z])(?:US\\$|\\$)','en'],SG:['SGD','(?<![A-Za-z])(?:S\\$|\\$)','en'],HK:['HKD','(?<![A-Za-z])(?:HK\\$|\\$)','en']};
 const format=formats[market.country];if(!format||format[0]!==market.currency)throw Error('COUNTRY_CURRENCY_INVALID');
 const digits='[0-9][0-9,. \\u00a0\\u202f]*',money=new RegExp(`${format[1]}\\s*(${digits})|(${digits})\\s*${format[1]}`,'g');
 const number=value=>{let v=value.replace(/[\s\u00a0\u202f]/g,'');if(format[2]==='en')v=v.replaceAll(',','');else if(format[2]==='it')v=v.replaceAll('.','').replace(',','.');else v=v.replace(',','.');return /^\d+(?:\.\d{1,2})?$/.test(v)?Number(v):null;};
 const source=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const root={tag:'root',attrs:{},children:[]},stack=[root];let count=0;
 const voids=new Set(['img','input','link','meta','br','hr','source','wbr','area','track','embed','param','col']);
 for(const m of source.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>|([^<]+)/gi)){
  if(++count>50000)throw Error('MARKUP_LIMIT');
  if(m[2]){stack.at(-1).children.push(decodeHtml(m[2]));continue;}
  const tag=m[1].toLowerCase();
  if(m[0].startsWith('</')){const i=stack.findLastIndex(n=>n.tag===tag);if(i>0)stack.length=i;continue;}
  const attrs={};for(const a of m[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1].toLowerCase()]=decodeHtml(a[2]??a[3]);
  const node={tag,attrs,children:[]};stack.at(-1).children.push(node);if(!voids.has(tag)&&!m[0].endsWith('/>'))stack.push(node);
 }
 const found=new Map();
 function visit(node,depth=0){
  if(depth>200)throw Error('MARKUP_LIMIT');
  if(typeof node==='string')return {text:node,codes:new Set()};
  const parts=node.children.map(c=>visit(c,depth+1)),codes=new Set(parts.flatMap(p=>[...p.codes]));
  const ref=node.tag==='a'?hermesEvidenceLink(node.attrs.href,market):null;if(ref)codes.add(ref.sku);
  const text=parts.map(p=>p.text).join(' '),card=['li','article'].includes(node.tag)||/(?:^|\s)product[-_](?:item|tile|card)(?:\s|$)/i.test(node.attrs.class??'');
  if(card&&codes.size===1){
   const prices=[...text.matchAll(money)].map(m=>number((m[1]??m[2]).trim())).filter(n=>Number.isFinite(n)&&n>0);
   if(prices.length){const sku=[...codes][0],set=found.get(sku)??new Set();for(const p of prices)set.add(p);found.set(sku,set);}
  }
  return {text,codes};
 }
 visit(root);return found;
}
export function inspectHermesListingEvidence(html,{includeVisiblePrices=false,market={country:'KR',currency:'KRW',localePrefix:'/kr/ko/'}}={}){
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_LIMIT');
 const stats={scripts:0,jsonLd:0,dataAttributes:0,parsedJson:0,unresolvedScripts:0,boundHits:0,objects:0,skuObjects:0};
 const objects=[],published=new Map(),seen=new Set(),fields={};let visits=0,bytes=0;
 function walk(v,depth=0){
  if(++visits>100000||depth>30)throw Error('PARSE_BOUND');
  if(!v||typeof v!=='object')return;
  if(!Array.isArray(v))objects.push(v);
  for(const child of Object.values(v))if(child&&typeof child==='object')walk(child,depth+1);
 }
 function parse(s,depth=0){
  if(depth>3||seen.has(s))return;seen.add(s);bytes+=Buffer.byteLength(s);
  if(bytes>33554432||s.length>2097152)throw Error('PARSE_BOUND');
  try{const v=JSON.parse(s);stats.parsedJson++;if(typeof v==='string')parse(v,depth+1);else walk(v);return;}catch(e){if(e.message==='PARSE_BOUND')throw e;}
  stats.unresolvedScripts++;let quote=null,escape=false,attempts=0;const stack=[];
  for(let i=0;i<s.length;i++){
   const c=s[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
   if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
   if(c==='{')stack.push(i);
   if(c==='}'&&stack.length){const start=stack.pop();if(++attempts>3000)throw Error('PARSE_BOUND');if(i-start>262144){stats.boundHits++;continue;}
    let v;try{v=JSON.parse(s.slice(start,i+1));}catch{continue;}stats.parsedJson++;walk(v);
   }
  }
  for(const m of s.matchAll(/"(?:[^"\\]|\\.)*"/g)){let v;try{v=JSON.parse(m[0]);}catch{continue;}if(typeof v==='string'&&v.includes('{'))parse(v,depth+1);}
 }
 const parseSafe=s=>{try{parse(s);}catch(e){if(e.message!=='PARSE_BOUND')throw e;stats.boundHits++;}};
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){stats.scripts++;stats.jsonLd+=Number(/application\/ld\+json/i.test(m[1]));parseSafe(m[2]);}
 for(const tag of html.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi))for(const m of tag[0].matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
  const key=m[1].toLowerCase(),v=decodeHtml(m[2]??m[3]);
  if(key==='href'){const ref=hermesEvidenceLink(v,market);if(ref)published.set(ref.sku,ref.url);}
  if(key.startsWith('data-')){stats.dataAttributes++;if(/^\s*[\[{]/.test(v))parseSafe(v);}
 }
 stats.objects=objects.length;
 stats.krwCurrencyObjects=objects.filter(o=>[o.currency,o.currencyCode,o.priceCurrency].includes('KRW')).length;
 // Collect explicit typed URLs before resolving SKU objects. No constructed paths.
 for(const object of objects)for(const key of ['url','productUrl','href','@id']){const ref=hermesEvidenceLink(object[key],market);if(ref)published.set(ref.sku,ref.url);}
 const records=[],visible=includeVisiblePrices?hermesVisiblePrices(html,market):new Map();
 for(const o of objects){
  const ids=[o.sku,o.mpn,o.productCode,o.productId,o.id,o.reference].filter(v=>typeof v==='string').map(v=>v.toUpperCase()).filter(v=>skuPattern.test(v));
  const unique=[...new Set(ids)];if(unique.length!==1)continue;stats.skuObjects++;
  for(const [key,v] of Object.entries(o))if(/^[A-Za-z][A-Za-z0-9_]{0,17}$/.test(key)){const label=`${key.toUpperCase()}_${v===null?'NULL':Array.isArray(v)?'ARR':typeof v==='object'?'OBJ':typeof v==='number'?'NUM':'STR'}`;fields[label]=(fields[label]??0)+1;}
  const sku=unique[0],refs=[o.url,o.productUrl,o.href,o['@id'],o.offers?.url].map(v=>hermesEvidenceLink(v,market)).filter(Boolean);
  if(refs.some(r=>r.sku!==sku))continue;const url=refs[0]?.url??published.get(sku);if(!url)continue;
  const offers=[o.offers].flat().filter(v=>v&&typeof v==='object');
  const candidates=[...offers.map(v=>[v.price,v.priceCurrency]),[o.price,o.priceCurrency??o.currency],[o.price?.value??o.price?.amount,o.price?.currency??o.price?.currencyCode],[o.salePriceValue,o.currencyCode]];
  const ownPrice=amount(o.price),cardPrices=visible.get(sku);
  if(ownPrice!==null&&!o.priceCurrency&&!o.currency&&!o.currencyCode&&cardPrices?.size===1&&cardPrices.has(ownPrice))candidates.push([ownPrice,market.currency]);
  const prices=[...new Set(candidates.filter(([p,c])=>amount(p)!==null&&c===market.currency).map(([p])=>amount(p)))];
  const names=[...new Set([o.name,o.productName,o.title].map(clean).filter(Boolean))];
  records.push({sku,url,name:names.length===1?names[0]:null,taxonomy:taxonomy(o.category??o.productCategory??o.categories),price:prices.length===1?prices[0]:null,currency:prices.length===1?market.currency:null,priceConflict:prices.length>1,explicitAmountWithoutCurrency:candidates.some(([p,c])=>amount(p)!==null&&!c),assets:Array.isArray(o.assets)?o.assets:[],originalImageVerified:false});
 }
 return {stats,fields,records,published:[...published].map(([sku,url])=>({sku,url}))};
}
