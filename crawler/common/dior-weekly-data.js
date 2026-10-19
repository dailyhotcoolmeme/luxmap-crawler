import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {diorForeignDataPrices} from './dior-foreign-page-data.js';
import {parseOfficialProduct} from './dior-official-core.js';
import {hashUrl,validateDiorPublishedRoutes,preserveDiorRegisteredFields,preferredDiorKrRoutes} from './dior-weekly-routes.js';
import {diorPageDataPrice} from './dior-page-data.js';
import {diorListedProduct} from './dior-listed-product.js';
import {requireDiorIntegratedAttributes} from './dior-image-quality.js';
import {deriveDiorWeeklyListing} from './dior-weekly-discovery.js';
// Source-only collection intentionally has no storage credential/manifest.
// Bind its price projection to the seed's independently public-verified KR
// reference instead of assuming the later ingestion environment exists here.
export function diorWeeklyDomesticRecord(body,canonical,cfg,references){
 if(cfg.brand!=='dior'||cfg.country!=='KR'||cfg.currency!=='KRW')throw Error('SCHEDULED_REFERENCE_SCOPE');
 const code=new URL(canonical).pathname.split('/').at(-1),normalized=code.replace(/[^a-z0-9]/gi,'').toUpperCase(),prior=references.get(normalized);
 if(!prior)return parseOfficialProduct(body,canonical,cfg,code,{handbagEvidence:true});
 const market=prior.market_products?.filter(m=>m.country_code==='KR');
 if(prior.normalized_code!==normalized||market?.length!==1||market[0].currency_code!=='KRW'||market[0].official_product_code!==normalized||market[0].official_url!==canonical)throw Error('SCHEDULED_REFERENCE_IDENTITY');
 return diorPageDataPrice(body,canonical,code);
}
export async function collectDiorWeeklyData(){
 const root=path.resolve(import.meta.dirname,'../..'),a=process.argv.slice(2),run=process.env.CRAWL_RUN_DIR;
 const newOnly=a.includes('--new-only'),listingMode=a[2]==='--scheduled-listing-data',tail=a.slice(5).filter(x=>x!=='--new-only'),sample=tail.join(' ')==='--limit 1';
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!['','--limit 1'].includes(tail.join(' '))||a.filter(x=>x==='--new-only').length>1||!['--scheduled-page-data','--scheduled-listing-data'].includes(a[2])||a[3]!=='--offset'||!/^\d+$/.test(a[4])||Number(a[4])%25)throw Error('SCHEDULED_DATA_GUARD');
 const cfg=JSON.parse(fs.readFileSync(a[1])),country=cfg.country,offset=Number(a[4]),dir=root+'/crawler/runtime/dior-weekly';
 const refs=JSON.parse(fs.readFileSync(dir+'/references.json')),byCode=new Map(refs.map(v=>[v.normalized_code,v]));
 if(!refs.length||refs.length>cfg.maxCandidates||byCode.size!==refs.length)throw Error('REGISTERED_REFERENCE_SCOPE');
 if(listingMode&&(country!=='KR'||newOnly||offset!==0||sample))throw Error('SCHEDULED_LISTING_SCOPE');
 const registry=validateDiorPublishedRoutes(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/'+country.toLowerCase()+'.json')),country),control=registry.find(r=>!r.proofKind&&r.canonical.includes('/products/'));
 const dynamic=newOnly&&fs.existsSync(dir+'/discovery-routes.json')?validateDiorPublishedRoutes(JSON.parse(fs.readFileSync(dir+'/discovery-routes.json')),country):[];
 const merged=[...new Map([...registry,...dynamic].map(r=>[r.url,r])).values()];
 const all=listingMode?validateDiorPublishedRoutes(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/kr-listings.json')),'KR'):(country==='KR'?preferredDiorKrRoutes(merged):merged).sort((a,b)=>Number(!a.canonical.includes('/products/'))-Number(!b.canonical.includes('/products/'))||a.url.localeCompare(b.url));
 if(all.length>cfg.maxCandidates)throw Error('DISCOVERY_CANDIDATE_LIMIT');
 const denied=new Set(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/denied.json')));
 if(newOnly&&country!=='KR')throw Error('SCHEDULED_DATA_GUARD');
 const targets=all.filter(r=>listingMode||country!=='KR'||byCode.has(new URL(r.canonical).pathname.split('/').at(-1).replaceAll('_',''))!==newOnly).slice(offset,offset+(sample?1:25));
 if(!targets.length||targets.length>cfg.maxProductsPerRun)throw Error('SCHEDULED_TARGET_LIMIT');
 const rows=[],index=[],discovered=new Map(),prices=new Map(),row=(status,url=cfg.entryUrl,code='RUN',price=null)=>({brand:'dior',country,parentModel:'검증된 공식 데이터 주간 수집',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
 const listingSources=[];if(newOnly&&fs.existsSync(dir+'/discovery-sources.json'))for(const s of JSON.parse(fs.readFileSync(dir+'/discovery-sources.json'))){if(typeof s!=='string'||!s.startsWith(root+'/crawler/runs/dior/kr/')||fs.realpathSync(s)!==s||path.basename(path.dirname(s))!=='raw'||!/^\d+\.source$/.test(path.basename(s)))throw Error('DISCOVERY_SOURCE_SCOPE');const summary=path.dirname(path.dirname(s))+'/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status||!JSON.parse(fs.readFileSync(summary)).some(r=>r.status==='NORMAL_KR_STATIC_LISTING_DATA'))throw Error('DISCOVERY_SOURCE_GUARD');const st=fs.statSync(s);if(st.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let b;try{fs.chmodSync(s,0o600);b=fs.readFileSync(s,'utf8');}finally{fs.chmodSync(s,st.mode&0o777);}listingSources.push({file:s,body:b,sha:hashUrl(b)});}
 const listingProofs=[];
 if(newOnly&&dynamic.length){const bound=new Map();for(const source of listingSources){const run=path.dirname(path.dirname(source.file)),summary=JSON.parse(fs.readFileSync(run+'/summary.json')),index=JSON.parse(fs.readFileSync(run+'/artifacts/source-index.json')),item=index.find(i=>i.rawName===path.basename(source.file));if(!item||!summary.some(r=>r.status==='NORMAL_KR_STATIC_LISTING_DATA'&&r.officialUrl===item.url))throw Error('DISCOVERY_SOURCE_IDENTITY');const controls=new Set(dynamic.filter(r=>r.responseSha256===source.sha).map(r=>r.controlUrl));for(const url of controls){const own=registry.find(r=>r.url===url);if(!own)throw Error('DISCOVERY_CONTROL');for(const r of deriveDiorWeeklyListing(source.body,item.canonical,own,new Date().toISOString()))bound.set(r.url,r);}}for(const r of dynamic){const actual=bound.get(r.url);if(r.proofKind!=='posted-rule-listing-canonical'||!actual||actual.canonical!==r.canonical||actual.responseSha256!==r.responseSha256||actual.controlUrl!==r.controlUrl)throw Error('DISCOVERY_SOURCE_IDENTITY');}}
 let client,calls=0;
 try{
  client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
  for(const t of targets){const hash=hashUrl(t.url),fail=dir+'/failures/'+hash+'.json';
   if(denied.has(hash)||fs.existsSync(fail)){rows.push(row('PRIOR_FAILURE_NOT_RETRIED',t.url));continue;}
   fs.mkdirSync(dir+'/failures',{recursive:true});
   // Persist before I/O: timeout/interruption is not an excuse to repeat it.
   fs.writeFileSync(fail,JSON.stringify({hash,status:'IN_FLIGHT'}),{flag:'wx',mode:0o600});
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   const res=await client.get(t.url,{maxRedirects:0,timeout:cfg.navigationTimeoutMs}),status=res.status();
   if(status!==200){fs.writeFileSync(fail,JSON.stringify({hash,status:'HTTP_'+status}),{mode:0o600});rows.push(row('SOURCE_HTTP_'+status,t.url));if([401,403,429].includes(status))break;continue;}
   const bytes=await res.body();if(bytes.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   const body=bytes.toString('utf8');if(/cf-chl|captcha-delivery|verify you are human|<title[^>]*>\s*access denied/i.test(body))throw Error('ACCESS_BLOCKED');
   if(listingMode){
    const ownControl=registry.find(r=>!r.proofKind&&r.canonical.includes('/products/')&&new URL(r.url).pathname.split('/')[3]===new URL(t.url).pathname.split('/')[3]);if(!ownControl)throw Error('DISCOVERY_CONTROL');for(const route of deriveDiorWeeklyListing(body,t.canonical,ownControl,new Date().toISOString()))discovered.set(route.url,route);rows.push(row('NORMAL_KR_STATIC_LISTING_DATA',t.url));
   }else if(country==='KR'){
    const code=new URL(t.canonical).pathname.split('/').at(-1),known=byCode.has(code.replaceAll('_',''));let p;
    if(known)p=diorWeeklyDomesticRecord(body,t.canonical,cfg,byCode);
    else{try{p=diorListedProduct(body,t.canonical,cfg,code);if(!p.colorOriginal)for(const source of listingSources){const candidate=diorListedProduct(body,t.canonical,cfg,code,source.body);if(candidate.colorOriginal){p=candidate;listingProofs.push({code:p.normalizedCode,source:source.file,sourceSha256:source.sha});break;}}requireDiorIntegratedAttributes(p);}catch(e){if(!['ORIGINAL_IMAGE_SOURCE_MISSING','DIOR_INTEGRATED_FIELDS_UNRESOLVED','NON_BAG_CONFIRMED','CLASSIFICATION_UNRESOLVED'].includes(e.message))throw e;fs.writeFileSync(fail,JSON.stringify({hash,status:e.message}),{mode:0o600});rows.push(row(e.message,t.canonical,code.replaceAll('_','')));continue;}}
    rows.push(row('EXACT_SKU',t.canonical,p.normalizedCode,p.price));
   }else for(const p of diorForeignDataPrices(body,t.canonical,country,new Set(byCode.keys()),new Date().toISOString())){
    const old=prices.get(p.normalizedCode);if(old&&old.price!==p.price)throw Error('FOREIGN_PRICE_CONFLICT');prices.set(p.normalizedCode,p);
   }
   const rawName=calls+'.source';fs.writeFileSync(run+'/raw/'+rawName,bytes,{mode:0o600});index.push({rawName,url:t.url,canonical:t.canonical,checkedAt:new Date().toISOString()});
   rows.push(row('PUBLISHED_DATA_HTTP_200',t.url));fs.unlinkSync(fail);
  }
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SCHEDULED_SOURCE_FAILED'));process.exitCode=/LIMIT|GUARD|MISMATCH|SCOPE/.test(e.message)?78:1;}
 finally{
  await client?.dispose();fs.mkdirSync(run+'/artifacts',{recursive:true});
  fs.writeFileSync(run+'/artifacts/source-index.json',JSON.stringify(index),{mode:0o600});
  if(listingMode)fs.writeFileSync(run+'/artifacts/discovered-routes.json',JSON.stringify({schema:1,country:'KR',routes:[...discovered.values()]}),{mode:0o600});
  if(listingProofs.length)fs.writeFileSync(run+'/artifacts/listing-color-proofs.json',JSON.stringify(listingProofs),{mode:0o600});
  fs.writeFileSync(run+'/artifacts/records.json','[]',{mode:0o600});
  rows.push(row('SOURCE_BATCH_RECORDED'));fs.writeFileSync(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
  if(spawnSync(root+'/scripts/crawl-output-guard.sh',[run+'/summary.json'],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
 }
}
export function recoverDiorWeeklyPrices(){
 const root=path.resolve(import.meta.dirname,'../..'),a=process.argv.slice(2),run=process.env.CRAWL_RUN_DIR;
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||a.length!==5||a[2]!=='--scheduled-price-records'||a[3]!=='--offset'||!/^\d+$/.test(a[4])||Number(a[4])%25)throw Error('SCHEDULED_PRICE_GUARD');
 const cfg=JSON.parse(fs.readFileSync(a[1])),dir=root+'/crawler/runtime/dior-weekly',refs=new Set(JSON.parse(fs.readFileSync(dir+'/references.json')).map(v=>v.normalized_code)),sources=JSON.parse(fs.readFileSync(dir+'/'+cfg.country.toLowerCase()+'-sources.json'));
 if(cfg.country==='KR'||!Array.isArray(sources)||sources.length>400)throw Error('SCHEDULED_SOURCE_SCOPE');
 const all=new Map();let total=0;
 for(const source of sources){
  if(path.dirname(source)!==root+'/crawler/runs/dior/'+cfg.country.toLowerCase()||!/^\d{8}T\d{6}Z-\d+$/.test(path.basename(source))||fs.realpathSync(source)!==source||spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SCHEDULED_SOURCE_SCOPE');
  const rows=JSON.parse(fs.readFileSync(source+'/summary.json'));if(!rows.some(r=>r.status==='SOURCE_BATCH_RECORDED'))throw Error('SCHEDULED_SOURCE_RECEIPT');
  for(const item of JSON.parse(fs.readFileSync(source+'/artifacts/source-index.json'))){
   if(!/^\d+\.source$/.test(item.rawName)||!rows.some(r=>r.status==='PUBLISHED_DATA_HTTP_200'&&r.officialUrl===item.url))throw Error('SCHEDULED_SOURCE_IDENTITY');
   const f=source+'/raw/'+item.rawName,st=fs.lstatSync(f);total+=st.size;if(!st.isFile()||st.isSymbolicLink()||st.size>cfg.maxResponseBytes||total>256*1024*1024||Date.now()-Date.parse(item.checkedAt)>86400000)throw Error('SCHEDULED_SOURCE_LIMIT');
   let body;try{fs.chmodSync(f,0o600);body=fs.readFileSync(f,'utf8');}finally{fs.chmodSync(f,st.mode&0o777);}
   for(const p of diorForeignDataPrices(body,item.canonical,cfg.country,refs,item.checkedAt)){const old=all.get(p.normalizedCode);if(old&&old.price!==p.price)throw Error('FOREIGN_PRICE_CONFLICT');if(!old||Date.parse(p.checkedAt)>Date.parse(old.checkedAt))all.set(p.normalizedCode,p);}
  }
 }
 const records=[...all.values()].sort((a,b)=>a.normalizedCode.localeCompare(b.normalizedCode)).slice(Number(a[4]),Number(a[4])+25);
 if(!records.length)throw Error('SCHEDULED_EMPTY_PRICE_BATCH');fs.mkdirSync(run+'/artifacts',{recursive:true});fs.writeFileSync(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});fs.writeFileSync(run+'/summary.json',JSON.stringify(records.map(p=>({brand:'dior',country:cfg.country,parentModel:'공식 현지 동일코드 가격',variantCode:p.normalizedCode,price:p.price,currency:cfg.currency,status:'EXACT_LOCAL_PRICE_CONFIRMED',officialUrl:p.officialUrl}))),{mode:0o600});
}
