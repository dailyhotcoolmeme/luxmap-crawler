import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {decodeHtml} from '../crawler/common/prada-product.js';
import {celineNodes,celineText} from '../crawler/common/celine-html.js';

const root=path.resolve(import.meta.dirname,'..');
const codePattern=/^[A-Z0-9]+_[A-Z0-9]+$/;
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=300&&!/[<>\x00-\x1f]/.test(v)?v.trim():null;
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:typeof v==='string'&&/^\d+(?:\.\d{1,2})?$/.test(v)&&Number(v)>0?Number(v):null;
function productUrl(raw){
 try{const u=new URL(raw);if(u.origin!=='https://www.dior.com'||u.username||u.password||u.search||u.hash)return null;
 const code=u.pathname.match(/^\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)$/)?.[1];return code?{code,url:raw}:null;}catch{return null;}
}
// Exact official sitemap identity only; captions are never product names.
export function diorSitemapImageEvidence(source){
 const out=[];
 for(const match of source.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/gi)){
  const block=match[0],loc=block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
  const ref=productUrl(decodeHtml((loc??'').trim()));if(!ref)continue;
  const images=[];
  for(const image of block.matchAll(/<image:loc\b[^>]*>([\s\S]*?)<\/image:loc>/gi))try{
   const u=new URL(decodeHtml(image[1].trim()));
   const identity=u.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)_E\d{2}(?:-\d+)?$/)?.[1];
   if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='assets.christiandior.com'&&identity===ref.code.replaceAll('_',''))images.push(u.href);
  }catch{}
  if(images.length)out.push({sku:ref.code,url:ref.url,images,block});
 }
 return out;
}
export function diorExactCards(source){
 if(!/<a\b/i.test(source))return [];
 const nodes=celineNodes(source),out=new Map();
 const refOf=value=>{try{return productUrl(new URL(value,'https://www.dior.com').href);}catch{return null;}};
 const children=node=>{const out=[],queue=[node];while(queue.length){const n=queue.pop();if(typeof n==='string')continue;if(out.length>=500)return [];out.push(n);queue.push(...n.children);}return out;};
 for(const anchor of nodes.filter(n=>n.tag==='a'&&refOf(n.attrs.href))){
  let excluded=false;for(let p=anchor;p;p=p.parent)if(['nav','header','footer'].includes(p.tag)||/recommend|recently|related|cross-sell/i.test(p.attrs.class??''))excluded=true;
  if(excluded)continue;
  const ref=refOf(anchor.attrs.href);let card=anchor;
  for(let depth=0;card&&depth<6;depth++,card=card.parent){
   if(['root','body','main','nav','header','footer'].includes(card.tag))break;
   if(/recommend|recently|related|cross-sell/i.test(card.attrs.class??''))break;
   if(!['article','li'].includes(card.tag)&&!/(?:product|card|tile)/i.test(card.attrs.class??''))continue;
   const inside=children(card);if(!inside.length)break;
   const refs=new Set(inside.filter(n=>n.tag==='a').map(n=>refOf(n.attrs.href)?.code).filter(Boolean));
   if(refs.size!==1||!refs.has(ref.code))break;
   const names=[...new Set(inside.filter(n=>n.attrs.itemprop==='name'||/(?:product[-_](?:name|title)|(?:name|title)[-_]product)/i.test(n.attrs.class??'')).map(celineText).map(text).filter(Boolean))];
   const prices=[...new Set([...celineText(card).matchAll(/(?:₩\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*원(?:\s|$))/g)].map(m=>Number((m[1]??m[2]).replaceAll(',',''))).filter(n=>Number.isFinite(n)&&n>0))];
   const images=[];
   for(const n of inside.filter(n=>n.tag==='img'))for(const raw of [n.attrs.src,n.attrs['data-src']])try{
    const u=new URL(raw,'https://www.dior.com');const code=u.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)_E\d{2}(?:-\d+)?$/)?.[1];
    if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='assets.christiandior.com'&&code===ref.code.replaceAll('_',''))images.push(u.href);
   }catch{}
   if(names.length!==1||prices.length!==1||!images.length)continue;
   const record={sku:ref.code,url:ref.url,name:names[0],category:null,price:prices[0],currency:'KRW',images:[...new Set(images)],priceConflict:false,nameConflict:false};
   const old=out.get(ref.code);if(old){record.priceConflict=old.priceConflict||old.price!==record.price;record.nameConflict=old.nameConflict||old.name!==record.name;}
   out.set(ref.code,record);break;
  }
 }
 return [...out.values()];
}
// Offline inspection only. XML image titles are not promoted to product names;
// product paths prove references, not category, availability, or prices.
export function inspectDiorNativeEvidence(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>67108864)throw Error('SOURCE_LIMIT');
 const stats={sources:1,xmlDeclaration:0,sitemapRoots:0,htmlRoots:0,htmlElements:0,scripts:0,jsonLd:0,flight:0,dataAttributes:0,itemprops:0,jsonParsed:0,jsonUnresolved:0,boundHits:0,objects:0,xmlProductLocs:0,xmlImageTitles:0,xmlPrices:0,xmlCategories:0};
 stats.xmlDeclaration=Number(/^\s*<\?xml\b/i.test(source));
 stats.sitemapRoots=[...source.matchAll(/<(?:urlset|sitemapindex)\b/gi)].length;
 stats.htmlRoots=[...source.matchAll(/<(?:html|!doctype\s+html)\b/gi)].length;
 stats.htmlElements=[...source.matchAll(/<(?:head|body|div|main|article|script|meta|img)\b/gi)].length;
 stats.robotsDirectives=Number(/^\s*User-agent\s*:/im.test(source)&&/^\s*(?:Allow|Disallow|Sitemap)\s*:/im.test(source));
 stats.otherSources=Number(!stats.sitemapRoots&&!stats.htmlRoots&&!stats.htmlElements&&!stats.robotsDirectives);
 const published=new Map(),objects=[],records=[],imageTitles=[],seen=new Set();let visits=0,decoded=0;
 const value=(s,tag)=>{const raw=s.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1];return raw===undefined?null:decodeHtml(raw.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/,'$1').trim());};
 for(const match of source.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)){
  const block=match[1],ref=productUrl(value(block,'loc'));if(!ref)continue;
  stats.xmlProductLocs++;published.set(ref.code,ref.url);
  for(const image of block.matchAll(/<image:image\b[^>]*>([\s\S]*?)<\/image:image>/gi)){
   const title=text(value(image[1],'image:title'));if(title){stats.xmlImageTitles++;imageTitles.push({sku:ref.code,title,url:ref.url});}
  }
  stats.xmlPrices+=Number(/<(?:g:)?price\b/i.test(block));
  stats.xmlCategories+=Number(/<(?:g:)?(?:product_type|google_product_category|category)\b/i.test(block));
 }
 function walk(v,depth=0){
  if(++visits>100000||depth>30)throw Error('PARSE_BOUND');
  if(!v||typeof v!=='object')return;
  if(!Array.isArray(v))objects.push(v);
  for(const child of Object.values(v))if(child&&typeof child==='object')walk(child,depth+1);
 }
 function parse(s,depth=0){
  if(depth>3||seen.has(s))return;seen.add(s);decoded+=Buffer.byteLength(s);
  if(s.length>2097152||decoded>33554432)throw Error('PARSE_BOUND');
  try{const v=JSON.parse(s);stats.jsonParsed++;if(typeof v==='string')parse(v,depth+1);else walk(v);return;}catch(e){if(e.message==='PARSE_BOUND')throw e;}
  stats.jsonUnresolved++;
  // Parse strict JSON fragments inside native JS without executing the wrapper.
  let quote=null,escape=false,attempts=0;const stack=[];
  for(let i=0;i<s.length;i++){
   const c=s[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
   if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
   if(c==='{')stack.push(i);
   if(c==='}'&&stack.length){const start=stack.pop();if(++attempts>3000)throw Error('PARSE_BOUND');if(i-start>262144){stats.boundHits++;continue;}
    let v;try{v=JSON.parse(s.slice(start,i+1));}catch{continue;}stats.jsonParsed++;walk(v);
   }
  }
  for(const m of s.matchAll(/"(?:[^"\\]|\\.)*"/g)){let v;try{v=JSON.parse(m[0]);}catch{continue;}if(typeof v==='string'&&v.includes('{'))parse(v,depth+1);}
 }
 const safelyParse=s=>{try{parse(s);}catch(e){if(e.message!=='PARSE_BOUND')throw e;stats.boundHits++;}};
 for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  stats.scripts++;stats.jsonLd+=Number(/application\/ld\+json/i.test(match[1]));stats.flight+=Number(/__next_f\s*\.\s*push/.test(match[2]));safelyParse(match[2]);
 }
 // HTML tag attributes only: never reinterpret arbitrary XML text as attributes.
 for(const tag of source.matchAll(/<(?:html|div|main|article|span|a|meta|img|section|li)\b[^>]*>/gi)){
  const attrs={};for(const m of tag[0].matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[m[1].toLowerCase()]=decodeHtml(m[2]??m[3]);
  const ref=productUrl(attrs.href);if(ref)published.set(ref.code,ref.url);
  if(attrs.itemprop)stats.itemprops++;
  for(const [key,v] of Object.entries(attrs))if(key.startsWith('data-')){stats.dataAttributes++;if(/^[\s]*[\[{]/.test(v))safelyParse(v);}
  // Only explicitly labelled fields on the same element; no surrounding text inference.
  if(attrs['data-sku'])objects.push({sku:attrs['data-sku'],url:attrs['data-product-url']??attrs.href,name:attrs['data-product-name'],category:attrs['data-category'],price:attrs['data-price'],priceCurrency:attrs['data-currency']});
 }
 if(/^\s*[\[{]/.test(source))safelyParse(source);
 stats.objects=objects.length;
 for(const object of objects){
  const ids=[object.sku,object.mpn,object.productCode,object.productId].filter(v=>typeof v==='string'&&v.length<=80&&codePattern.test(v));
  const unique=[...new Set(ids)];if(unique.length!==1)continue;const sku=unique[0];
  const refs=[object.url,object.productUrl,object.offers?.url].map(productUrl).filter(Boolean);
  if(refs.some(r=>r.code!==sku))continue;const url=refs[0]?.url??published.get(sku);if(!url)continue;
  const offers=[object.offers].flat().filter(v=>v&&typeof v==='object');
  const candidates=[...offers.map(v=>[v.price,v.priceCurrency]),[object.price,object.priceCurrency??object.currency],[object.salePriceValue,object.currencyCode]];
  const prices=[...new Set(candidates.filter(([p,c])=>amount(p)!==null&&c==='KRW').map(([p])=>amount(p)))];
  const names=[...new Set([object.name,object.productName].map(text).filter(Boolean))];
  const images=[object.image,object.images,object.assets,object.imageUrl,object.primaryImage,object.mainImage].flat(2).filter(Boolean).map(v=>typeof v==='string'?v:v.contentUrl??v.url).filter(v=>typeof v==='string');
  records.push({sku,url,name:names.length===1?names[0]:null,category:text(object.category??object.productCategory),price:prices.length===1?prices[0]:null,currency:prices.length===1?'KRW':null,images,priceConflict:prices.length>1,nameConflict:names.length>1});
 }
 const sitemapImages=diorSitemapImageEvidence(source);
 let cards=[];try{cards=diorExactCards(source);}catch(e){if(e.message!=='MARKUP_LIMIT')throw e;stats.boundHits++;}stats.exactCards=cards.length;
 for(const card of cards)if(!records.some(r=>r.sku===card.sku&&r.name&&r.price!==null&&r.images.length))records.push(card);
 for(const record of records)if(!record.images.length){
  record.images=sitemapImages.filter(p=>p.sku===record.sku&&p.url===record.url).flatMap(p=>p.images);
 }
 return {stats,records,imageTitles,published:[...published].map(([sku,url])=>({sku,url}))};
}

export function reportDiorNativeEvidence(run){
 const allowed=path.join(root,'crawler/runs/dior/kr');run=fs.realpathSync(run);
 if(!run.startsWith(allowed+path.sep)||spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('SCOPE_PREFLIGHT');
 const raw=path.join(run,'raw');if(fs.realpathSync(raw)!==raw)throw Error('RAW_SCOPE');
 const all={stats:{},records:[],imageTitles:[],published:[]};let total=0;
 for(const name of fs.readdirSync(raw).filter(n=>/^\d+\.source$/.test(n))){
  const file=path.join(raw,name),stat=fs.lstatSync(file);total+=stat.size;
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>67108864||total>134217728)throw Error('SOURCE_LIMIT');
  let source;try{fs.chmodSync(file,0o600);source=fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,stat.mode&0o777);}
  const result=inspectDiorNativeEvidence(source);
  for(const [key,n] of Object.entries(result.stats))all.stats[key]=(all.stats[key]??0)+n;
  for(const key of ['records','imageTitles','published'])all[key].push(...result[key]);
 }
 if(!all.stats.sources)throw Error('NO_SOURCE');
 const row=status=>({brand:'dior',country:'KR',parentModel:'',variantCode:'RUN',price:null,currency:'',status,officialUrl:'https://www.dior.com/ko_kr/fashion'});
 const rows=Object.entries(all.stats).map(([k,n])=>row(`${k.toUpperCase()}_${n}`));
 for(const [key,test] of [['NAMES',r=>r.name],['CATEGORIES',r=>r.category],['PRICES',r=>r.price!==null]])rows.push(row(`EXPLICIT_${key}_${new Set(all.records.filter(test).map(r=>r.sku)).size}`));
 rows.push(row(`UNIQUE_PRODUCT_LOCS_${new Set(all.published.map(r=>r.sku)).size}`),row(all.stats.boundHits?'PARTIAL_PARSE_BOUNDS':'OFFLINE_INSPECTION_COMPLETE'));
 const dir=path.join(run,'native-evidence');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(all),{mode:0o600});
 const output=path.join(dir,'summary.json');fs.writeFileSync(output,JSON.stringify(rows),{mode:0o600});
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[output],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{reportDiorNativeEvidence(process.argv[2]??path.join(root,'crawler/runs/dior/kr/20261014T151730Z-91546'));}
 catch{console.error('DIOR_OFFLINE_REPORT_FAILED');process.exitCode=1;}
}
