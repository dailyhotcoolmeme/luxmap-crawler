import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {celineNodes,celineText} from '../crawler/common/celine-html.js';
import {decodeLouisVuitton,louisVuittonCode,louisVuittonUrl,louisVuittonAccess,isLouisVuittonReference} from '../crawler/common/louis-vuitton-product.js';
import {louisVuittonSerializedData} from './louis-vuitton-serialized-data.mjs';
import {mergeLouisVuittonPriceCard} from '../crawler/common/louis-vuitton-metadata.js';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(process.argv[2]??''),country=path.basename(path.dirname(source)),base=root+'/crawler/runs/louis-vuitton/'+country;
if(!['kr','us'].includes(country)||path.dirname(source)!==base||spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_SCOPE');
const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/'+country)),rows=[],cards=new Map(),cardConflicts=new Set();
const sourceRows=JSON.parse(fs.readFileSync(source+'/summary.json'));
if(sourceRows.some(r=>/UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX/.test(r.status)))throw Error('SOURCE_POLICY_GUARD');
const failureIndex=sourceRows.findIndex(r=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status));
const confirmedPrefix=failureIndex<0?null:sourceRows.slice(0,failureIndex).filter(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED').length;
const row=(status,url=cfg.entryUrl,code='SOURCE',price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:'공식 게시 목록 근거 복원',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
const serializationDiagnostics={};
function read(file){const mode=fs.statSync(file).mode&0o777;try{fs.chmodSync(file,0o600);return fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,mode);}}
let nodeCount=0,nativeJson=0,nuxt=0,xmlNames=0,xmlImages=0,flatArrays=0,skuLiterals=0,serializedOutputs=0;const jsonObjects=[],publishedBagLists=new Set();
const seenJson=new WeakSet();let sourceStamp;
function walkJson(value,depth=0){if(depth>60||++nodeCount>500000)throw Error('METADATA_LIMIT');if(isLouisVuittonReference(value))skuLiterals++;if(!value||typeof value!=='object'||seenJson.has(value))return;seenJson.add(value);if(!Array.isArray(value))jsonObjects.push({...value,__sourceTime:sourceStamp,__sourceCountry:cfg.country});for(const v of Object.values(value))walkJson(v,depth+1);}
// Actual public KR catalogue JSON, distinct from a fetched website document.
// Retain every SKU-owned model field; classification is checked separately.
let apiIndex=0;
for(const evidence of sourceRows.filter(r=>['LV 공식 SKU 상품 모델 연결','한국 동일 SKU 해외 SKU 연결'].includes(r.parentModel)&&/^(?:CATALOG|API)_HTTP_\d+$/.test(r.status))){
 apiIndex++;if(!['CATALOG_HTTP_200','API_HTTP_200'].includes(evidence.status)||!/^https:\/\/api\.louisvuitton\.com\/api\/kor-kr\/catalog\/product\/[A-Za-z0-9_-]+$/.test(evidence.officialUrl))continue;
 const file=source+'/raw/'+(path.basename(source)==='20261016T233606Z-69293'?'':'api-')+apiIndex+'.source';if(!fs.existsSync(file))continue;sourceStamp=fs.statSync(file).mtime.toISOString();const text=read(file);if(Buffer.byteLength(text)>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');let data;try{data=JSON.parse(text);}catch{rows.push(row('REJECTED_API_JSON'));continue;}walkJson(data);
}
for(const file of fs.readdirSync(source+'/raw').filter(f=>/^\d+\.source$/.test(f)&& (confirmedPrefix===null||Number(f.split('.')[0])<=confirmedPrefix))){sourceStamp=fs.statSync(source+'/raw/'+file).mtime.toISOString();const html=read(source+'/raw/'+file);if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');
 try{louisVuittonAccess(html);}catch(error){if(confirmedPrefix!==null&&error.message==='ACCESS_BLOCKED'){rows.push(row('REJECTED_SAVED_DOCUMENT'));continue;}throw error;}
 xmlNames+=[...html.matchAll(/<image:title\b/gi)].length;xmlImages+=[...html.matchAll(/<image:loc\b/gi)].length;
 for(const m of html.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)){try{const u=louisVuittonUrl(decodeLouisVuitton(m[1]),cfg);if(new URL(u).pathname.includes('/women/handbags/'))publishedBagLists.add(u);}catch{}}
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){const s=m[2].trim();if(/window\.__NUXT__\s*=/.test(s)){nuxt++;for(const v of louisVuittonSerializedData(s,serializationDiagnostics)){serializedOutputs++;walkJson(v);}}if(s.startsWith('{')||s.startsWith('['))try{const v=JSON.parse(s);if(Array.isArray(v)&&/__NUXT_DATA__/.test(m[1]))flatArrays++;walkJson(v);nativeJson++;}catch(e){if(e.message==='METADATA_LIMIT')throw e;}}
 if(!/<html\b/i.test(html))continue;
 const nodes=celineNodes(html),refs=new Map();for(const node of nodes){if(node.tag!=='a'||!node.attrs.href)continue;try{const u=louisVuittonUrl(node.attrs.href,cfg),code=louisVuittonCode(u);if(code)refs.set(node,{u,code});}catch{}}
 for(const [anchor,{u,code}] of refs){let card=anchor;for(let depth=0;card&&depth<8;depth++,card=card.parent){const within=n=>{let p=n;while(p){if(p===card)return true;p=p.parent;}return false;},codes=new Set([...refs].filter(([n])=>within(n)).map(([,v])=>v.code));if(codes.size!==1)break;const text=celineText(card),amounts=new Set([...text.matchAll(/(?:[₩￦]|KRW)\s*([\d,]+)|([\d,]+)\s*원/g)].map(m=>Number((m[1]??m[2]).replaceAll(',',''))).filter(n=>n>0));if(amounts.size!==1)continue;
   const images=nodes.filter(n=>n.tag==='img'&&within(n)).flatMap(n=>[n.attrs.src,n.attrs['data-src']]).filter(Boolean).filter(v=>{try{return new URL(v,cfg.entryUrl).protocol==='https:';}catch{return false;}});
   const item={code,url:u,price:[...amounts][0],images:[...new Set(images)],text,sourceFile:file};
   mergeLouisVuittonPriceCard(cards,cardConflicts,item);break;
 }}
}
const objectsWithCode=jsonObjects.filter(o=>Object.values(o).some(isLouisVuittonReference)),objectsWithPrice=objectsWithCode.filter(o=>Object.entries(o).some(([k,v])=>/price|amount/i.test(k)&&(typeof v==='number'||typeof v==='string'&&/\d/.test(v))));
rows.push(...[`NATIVE_JSON_SCRIPTS_${nativeJson}`,`NUXT_SERIALIZATIONS_${nuxt}`,`SERIALIZED_OUTPUTS_${serializedOutputs}`,`NUXT_FLAT_ARRAYS_${flatArrays}`,`DATA_SKU_LITERALS_${skuLiterals}`,`OBJECTS_WITH_CODE_${objectsWithCode.length}`,`OBJECTS_WITH_CODE_PRICE_${objectsWithPrice.length}`,`EXACT_CARD_PRICE_${cards.size}`,`CARD_PRICE_CONFLICTS_${cardConflicts.size}`,`XML_IMAGE_TITLES_${xmlNames}`,`XML_IMAGE_URLS_${xmlImages}`].map(s=>row(s)));
for(const url of [...publishedBagLists].sort((a,b)=>a.length-b.length).slice(0,5))rows.push(row('PUBLISHED_KR_HANDBAG_LIST',url));
for(const [key,count] of Object.entries(serializationDiagnostics))rows.push(row(key+'_'+count));
for(const card of [...cards.values()].slice(0,5)){rows.push(row('CARD_PRICE_FOUND_NOT_INGESTED',card.url,card.code,card.price));for(const image of card.images.slice(0,1))rows.push(row('PUBLISHED_IMAGE_SOURCE',new URL(decodeLouisVuitton(image),cfg.entryUrl).href,card.code));}
const out=source+'/artifacts/native-metadata';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/cards.json',JSON.stringify([...cards.values()]),{mode:0o600});fs.writeFileSync(out+'/objects.json',JSON.stringify(jsonObjects),{mode:0o600});fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
