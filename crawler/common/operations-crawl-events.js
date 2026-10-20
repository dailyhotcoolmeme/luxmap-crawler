import {createHash} from 'node:crypto';
const reserved=new Set(['RUN','TOTAL','BATCH','FAILED','LISTING','DISCOVERY','UNKNOWN','SUMMARY','COUNT','TARGET','CONTROL','PENDING','BASELINE','SNAPSHOT','AUDIT','REFERENCE','SOURCE']);
const codePatterns={'chanel':/^[A-Z]{1,4}\d[A-Z0-9]{3,45}$/,'prada':/^\d[A-Z0-9_]{8,40}$/,'bottega-veneta':/^[A-Z0-9]{15}$/,'van-cleef-arpels':/^VC[A-Z0-9]{6,18}$/,'rolex':/^M?\d[A-Z0-9-]{4,30}$/,'louis-vuitton':/^[A-Z]\d{5}$/,'dior':/^(?:M|S|D|\d)[A-Z0-9_]{6,60}$/,'bulgari':/^\d{6}$/,'hermes':/^H[A-Z0-9]{6,30}$/,'saint-laurent':/^\d[A-Z0-9]{7,40}$/,'celine':/^[A-Z0-9]{10,25}$/};
export const eventHash=text=>createHash('sha256').update(text).digest('hex');
// Same bounded, eight-field contract as crawl-output-guard.sh; no subprocess per artifact.
export function guardedSummaryRows(bytes,limits){
 if(bytes.length>limits.maxSummaryBytesPerRun)throw Error('SUMMARY_GUARD');const text=bytes.toString('utf8');if(/<html|<!doctype|<script|data:[^;]+;base64|base64,|stack trace|traceback|"html"\s*:/i.test(text))throw Error('SUMMARY_GUARD');
 const rows=JSON.parse(text),bounds={brand:40,country:3,parentModel:120,variantCode:120,currency:3,status:40,officialUrl:500};if(!Array.isArray(rows)||rows.length>limits.maxSummaryRecordsPerRun)throw Error('SUMMARY_GUARD');
 for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==8||!Object.hasOwn(row,'price')||row.price!==null&&(!Number.isFinite(row.price)||typeof row.price!=='number'))throw Error('SUMMARY_GUARD');for(const [key,max]of Object.entries(bounds))if(typeof row[key]!=='string'||[...row[key]].length>max)throw Error('SUMMARY_GUARD');if(!row.officialUrl.startsWith('https://'))throw Error('SUMMARY_GUARD');}return rows;
}
export function crawlEvent(row,{observedAt,sourceKey,configs}){
 if(!row||typeof row.variantCode!=='string'||!configs.has(row.brand+':'+row.country))return null;
 const cfg=configs.get(row.brand+':'+row.country),sku=row.variantCode.trim().toUpperCase();
 if(reserved.has(sku)||!codePatterns[row.brand]?.test(sku))return null;
 let u;try{u=new URL(row.officialUrl);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.href.length>500||!(cfg.siteHosts??cfg.allowedHosts??[]).includes(u.hostname))return null;
 const status=String(row.status??'').toUpperCase();let outcome,stage;
 if(['PUBLIC_CATALOG_VERIFIED','KR_FULL_RECORD_PUBLIC_VERIFIED','PUBLIC_PRICE_VERIFIED','PRICE_STORED_AND_VERIFIED','STORED_AND_VERIFIED','FOREIGN_PRICE_PUBLIC_VERIFIED'].includes(status)){outcome='verified';stage='publication';}
 else if(['PRICE_UNAVAILABLE','COUNTRY_PRODUCT_MISSING','PRODUCT_NOT_FOUND','NO_SEARCH_RESULT','PRICE_NOT_RETURNED'].includes(status)){outcome='price_unavailable';stage='price';}
 else if(/FAILED|FAILURE|ERROR|BLOCKED|DENIED|REJECTED|MISMATCH|MISSING|INVALID|UNPROVEN|UNVERIFIED|HTTP_[45]\d\d|MASK_RANGE|IMAGE_BYTE_LIMIT|REFERENCE_IDENTITY/.test(status)){
  outcome='failure';stage=/IMAGE|CUTOUT|MASK/.test(status)?'image':/STORAGE|DATABASE|WRITE|R2_/.test(status)?'storage':/PUBLIC|READBACK/.test(status)?'publication':/MISMATCH|INVALID|UNPROVEN|UNVERIFIED|REJECTED|MISSING|REFERENCE_IDENTITY/.test(status)?'validation':'collection';
 }else return null;
 if(!/^[A-Z0-9_]{1,80}$/.test(status)||!Number.isFinite(Date.parse(observedAt)))return null;
 return {event_key:eventHash(JSON.stringify([sourceKey,row])),brand_slug:row.brand,country_code:row.country,sku,stage,outcome,reason_code:status,official_url:u.href,observed_at:observedAt};
}
