import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {diorForeignDataPrices} from './dior-foreign-page-data.js';
import {parseOfficialProduct} from './dior-official-core.js';
import {hashUrl,validateDiorPublishedRoutes,preserveDiorRegisteredFields} from './dior-weekly-routes.js';
import {diorPageDataPrice} from './dior-page-data.js';
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
 const newOnly=a.includes('--new-only'),tail=a.slice(5).filter(x=>x!=='--new-only'),sample=tail.join(' ')==='--limit 1';
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!['','--limit 1'].includes(tail.join(' '))||a.filter(x=>x==='--new-only').length>1||a[2]!=='--scheduled-page-data'||a[3]!=='--offset'||!/^\d+$/.test(a[4])||Number(a[4])%25)throw Error('SCHEDULED_DATA_GUARD');
 const cfg=JSON.parse(fs.readFileSync(a[1])),country=cfg.country,offset=Number(a[4]),dir=root+'/crawler/runtime/dior-weekly';
 const refs=JSON.parse(fs.readFileSync(dir+'/references.json')),byCode=new Map(refs.map(v=>[v.normalized_code,v]));
 if(!refs.length||refs.length>cfg.maxCandidates||byCode.size!==refs.length)throw Error('REGISTERED_REFERENCE_SCOPE');
 const all=validateDiorPublishedRoutes(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/'+country.toLowerCase()+'.json')),country).sort((a,b)=>Number(!a.canonical.includes('/products/'))-Number(!b.canonical.includes('/products/'))||a.url.localeCompare(b.url));
 const denied=new Set(JSON.parse(fs.readFileSync(root+'/crawler/brands/dior/published-routes/denied.json')));
 if(newOnly&&country!=='KR')throw Error('SCHEDULED_DATA_GUARD');
 const targets=all.filter(r=>country!=='KR'||byCode.has(new URL(r.canonical).pathname.split('/').at(-1).replaceAll('_',''))!==newOnly).slice(offset,offset+(sample?1:25));
 if(!targets.length||targets.length>cfg.maxProductsPerRun)throw Error('SCHEDULED_TARGET_LIMIT');
 const rows=[],index=[],prices=new Map(),row=(status,url=cfg.entryUrl,code='RUN',price=null)=>({brand:'dior',country,parentModel:'검증된 공식 데이터 주간 수집',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
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
   if(country==='KR'){
    const p=diorWeeklyDomesticRecord(body,t.canonical,cfg,byCode);
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
