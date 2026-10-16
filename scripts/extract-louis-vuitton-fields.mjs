import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {louisVuittonDescriptionFields,louisVuittonBoundFields,louisVuittonDimensions} from '../crawler/common/louis-vuitton-metadata.js';
import {isLouisVuittonReference,louisVuittonCode} from '../crawler/common/louis-vuitton-product.js';
import {louisVuittonNestedKrw} from '../crawler/common/louis-vuitton-price-value.js';
const root=path.resolve(import.meta.dirname,'..'),out=root+'/crawler/completeness/louis-vuitton/field-source';
const runBase=root+'/crawler/runs/louis-vuitton/kr';
const runIds=new Set();
for(const id of fs.readdirSync(runBase)){const summary=runBase+'/'+id+'/summary.json';if(!fs.existsSync(summary)||!fs.existsSync(runBase+'/'+id+'/artifacts/native-metadata/summary.json')||spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)continue;const rows=JSON.parse(fs.readFileSync(summary));if(rows.some(r=>['NORMAL_RENDERED_DOCUMENT_SAVED','NORMAL_HTTP_DOCUMENT_SAVED'].includes(r.status)||/^CATEGORY_LINKS_\d+$|^LISTING_LINKS_\d+$/.test(r.status))&&!rows.some(r=>/UNAUTHORIZED|POLICY|LIMIT|GUARD/.test(r.status)))runIds.add(id);}
const dirs=[...runIds].map(id=>runBase+'/'+id+'/artifacts/native-metadata');
const usBase=root+'/crawler/runs/louis-vuitton/us';for(const id of fs.existsSync(usBase)?fs.readdirSync(usBase):[]){const dir=usBase+'/'+id;if(!fs.existsSync(dir+'/artifacts/native-metadata/summary.json')||spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)continue;const rows=JSON.parse(fs.readFileSync(dir+'/summary.json'));if(rows.some(r=>['EXACT_SKU_URL','OFFICIAL_ATTRIBUTE_SOURCE_SAVED','NORMAL_COUNTRY_DOCUMENT_SAVED'].includes(r.status)))dirs.push(dir+'/artifacts/native-metadata');}
const objects=[];for(const dir of dirs){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');objects.push(...JSON.parse(fs.readFileSync(dir+'/objects.json')));}
const records=[],counts={bound:0,name:0,url:0,offers:0,price:0,color:0,size:0,material:0,description:0,properties:0,nestedPriceObjects:0,formattedPriceFields:0};
const scalar=v=>typeof v==='string'&&v.trim()&&!/[<>]/.test(v)?v.trim():null;
const named=v=>scalar(v)||(v&&typeof v==='object'?scalar(v.name)??scalar(v.value):null);
function references(o,depth=0){if(!o||typeof o!=='object'||depth>2)return [];return Object.entries(o).flatMap(([k,v])=>/sku|mpn|product.*id|identifier|^id$|code/i.test(k)?isLouisVuittonReference(v)?[v]:v&&typeof v==='object'?references(v,depth+1):[]:[]);}
for(const o of objects){const refs=[...new Set(references(o))];if(refs.length!==1)continue;counts.bound++;const code=refs[0],record={code};
 record.sourceCheckedAt=o.__sourceTime;record.sourceCountry=o.__sourceCountry??'KR';
 for(const key of ['name','color','size','material']){const value=named(o[key]??(key==='material'?o.mainMaterial:undefined));if(value){record[key]=value;if(key==='material')record.materialEvidence='direct';counts[key]++;}}
 for(const holder of [o.attributes,o.sku].flat().filter(v=>v&&typeof v==='object'))for(const key of ['color','material','size']){const v=named(holder[key]);if(v&&!record[key]){record[key]=v;counts[key]++;}}
 const properties=[o.additionalProperty,o.attributes].flat().filter(v=>v&&typeof v==='object');counts.properties+=properties.length;
 for(const prop of properties){const label=String(prop.name??prop.propertyID??'').trim().toLowerCase(),value=named(prop.value);if(!value)continue;for(const [key,pattern] of [['color',/^(?:color|colour|색상|컬러)$/],['material',/^(?:material|소재)$/],['size',/^(?:size|dimensions|크기|사이즈)$/]])if(pattern.test(label)&&!record[key]){record[key]=value;counts[key]++;}}
 if(typeof o.description==='string'&&o.description.trim())counts.description++;
 const described=louisVuittonDescriptionFields(o.detailedDescription??o.description);for(const key of ['color','material','widthMm','heightMm','depthMm'])if(!record[key]&&described[key]!==undefined){record[key]=described[key];if(key==='color'||key==='material')counts[key]++;}
 const bound=louisVuittonBoundFields(o,code);for(const [key,v] of Object.entries(bound))if(record[key]===undefined){record[key]=v;if(key==='color'||key==='material')counts[key]++;}
 const metric=louisVuittonDimensions(o.dimensions);for(const [key,v] of Object.entries(metric))record[key]=v;
 const dimension=v=>{const n=Number(v?.value),unit=String(v?.unitCode??v?.unitText??'').toLowerCase();return Number.isFinite(n)&&n>0&&['mm','mmt','cm','cmt'].includes(unit)?n*(unit.startsWith('c')?10:1):null;};
 for(const axis of ['width','height','depth']){const n=dimension(o[axis]);if(n)record[axis+'Mm']=n;}
 if(record.widthMm&&!record.size)counts.size++;
 for(const key of ['url','productUrl'])if(scalar(o[key])&&/^(?:\/|https:\/\/)/.test(o[key]))try{const u=new URL(o[key],'https://kr.louisvuitton.com');if(u.origin==='https://kr.louisvuitton.com'&&u.pathname.startsWith('/kor-kr/products/')&&u.pathname.endsWith('/'+code)){record.url=u.href;counts.url++;break;}}catch{}
 const offerNodes=[o,...[o.offers].flat().filter(v=>v&&typeof v==='object')];for(const offer of [...offerNodes])for(const spec of [offer.priceSpecification].flat().filter(v=>v&&typeof v==='object'))offerNodes.push(spec);
 if(o.offers)counts.offers++;
 const prices=[];for(const offer of offerNodes){if(offer.price&&typeof offer.price==='object')counts.nestedPriceObjects++;if(typeof offer.formattedPrice==='string'||typeof offer.displayPrice==='string')counts.formattedPriceFields++;const raw=offer.price??offer.value,currency=offer.priceCurrency??offer.currency??offer.currencyCode;if(typeof raw==='string'&&/^(?:₩|￦|KRW)\s*[\d,]+$/.test(raw.trim())){const n=Number(raw.replace(/[^\d]/g,''));if(n>0)prices.push(n);}if(currency!=='KRW'||!['number','string'].includes(typeof raw))continue;const n=Number(String(raw).replaceAll(',',''));if(Number.isFinite(n)&&n>0)prices.push(n);}
 for(const offer of offerNodes){const nested=louisVuittonNestedKrw(offer,code);if(nested!==null)prices.push(nested);}
 if(record.sourceCountry==='KR'&&new Set(prices).size===1&&Number.isFinite(Date.parse(o.__sourceTime))){record.price=prices[0];record.currency='KRW';record.checkedAt=o.__sourceTime;counts.price++;}
 records.push(record);
}
// The restoration also verifies visible KR card prices independently of JSON.
// Preserve their exact SKU and observation time in the same price selection.
counts.cardPrice=0;
for(const dir of dirs){
 if(!dir.startsWith(runBase+'/')||!fs.existsSync(dir+'/cards.json'))continue;
 for(const card of JSON.parse(fs.readFileSync(dir+'/cards.json'))){
  let url;try{url=new URL(card.url);}catch{continue;}
  if(url.origin!=='https://kr.louisvuitton.com'||!url.pathname.startsWith('/kor-kr/products/')||louisVuittonCode(url.href)!==card.code||!isLouisVuittonReference(card.code)||!Number.isFinite(card.price)||card.price<=0||!/^\d+\.source$/.test(card.sourceFile))continue;
  const raw=path.resolve(dir,'../../raw',card.sourceFile);if(!fs.existsSync(raw))continue;
  const checkedAt=fs.statSync(raw).mtime.toISOString();
  records.push({code:card.code,url:url.href,price:card.price,currency:'KRW',checkedAt,sourceCheckedAt:checkedAt,sourceCountry:'KR'});counts.cardPrice++;
 }
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/fields.json',JSON.stringify(records),{mode:0o600});const rows=Object.entries(counts).map(([key,count])=>({brand:'louis-vuitton',country:'KR',parentModel:'동일 SKU 공식 속성 근거',variantCode:'SOURCE',price:null,currency:'KRW',status:'NATIVE_'+key.toUpperCase()+'_'+count,officialUrl:'https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'}));
fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
