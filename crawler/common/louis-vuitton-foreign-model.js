import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {louisVuittonAccessStops} from './louis-vuitton-access-stops.js';
import {catalogFamilyId} from './louis-vuitton-catalog-model.js';
import {louisVuittonCode} from './louis-vuitton-product.js';
import {louisVuittonForeignUrl} from './louis-vuitton-foreign.js';
import {koreanModelRecord} from './louis-vuitton-korean-record.js';
import {readRegisteredLouisVuitton} from './louis-vuitton-registered.js';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';
import {catalogImageKey,heldCatalogItem,catalogItemFailureKind} from './catalog-workflow.js';
import {validateKoreanCatalogRecord} from './catalog-product-contract.js';
const locales={KR:'kor-kr',JP:'jpn-jp',FR:'fra-fr',IT:'ita-it',ES:'esp-es',US:'eng-us',SG:'eng-sg',HK:'eng-hk'};
export function foreignSkuEndpoint(cfg,code){if(cfg.locale!==locales[cfg.country]||!/^[A-Z0-9]{5,16}$/.test(code))throw Error('SKU_LOOKUP_SCOPE');return 'https://api.louisvuitton.com/api/'+cfg.locale+'/catalog/sku/'+code+'/persodetails';}
export function nativeModelEndpoint(cfg,data){if(cfg.locale!==locales[cfg.country]||!/^nvprod\d+v$|^P\d+$/.test(data?.productId??''))throw Error('NATIVE_PRODUCT_ID_UNAVAILABLE');return 'https://api.louisvuitton.com/api/'+cfg.locale+'/catalog/product/'+data.productId;}
export function foreignModelEndpoint(cfg,koreanUrl,code){
 const u=new URL(koreanUrl),id=catalogFamilyId(koreanUrl);if(cfg.locale!==locales[cfg.country]||u.origin!=='https://kr.louisvuitton.com'||u.search||u.hash||u.username||u.password||louisVuittonCode(u.href)!==code||!id)throw Error('KOREAN_MODEL_SCOPE');
 return 'https://api.louisvuitton.com/api/'+cfg.locale+'/catalog/product/'+id;
}
export function foreignModelRecord(data,cfg,code,checkedAt){
 const models=(Array.isArray(data?.model)?data.model:[]).filter(m=>m.identifier===code);if(models.length!==1)throw Error('EXACT_LOCAL_MODEL_UNAVAILABLE');
 const model=models[0],offer=model.offers?.priceSpecification;if(offer?.priceCurrency!==cfg.currency||!Number.isFinite(Number(offer.price))||Number(offer.price)<=0)throw Error('COUNTRY_PRICE_UNVERIFIED');
 if(typeof model.url!=='string')throw Error('MODEL_URL_UNVERIFIED');let url=new URL(model.url,cfg.entryUrl);const terminal=url.pathname.split('/').filter(Boolean).at(-1);if(!/^[A-Z0-9]{5,16}$/.test(terminal))url=new URL(url.href.replace(/\/$/,'')+'/'+code);const officialUrl=louisVuittonForeignUrl(url.href,cfg,code);
 return {brand:'louis-vuitton',country:cfg.country,currency:cfg.currency,normalizedCode:code,originalCode:code,productName:typeof data.name==='string'?data.name:code,price:Number(offer.price),priceStatus:'confirmed',officialUrl,checkedAt,sourceImageUrl:null};
}
export async function collectLouisVuittonForeignModels(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,country=cfg.country.toLowerCase();
 const domestic=args[2]==='--korean-products',skuMode=domestic||args[2]==='--foreign-sku-prices',label=domestic?'한국 동일 SKU 통합 상품':'한국 동일 SKU 해외 '+(skuMode?'SKU 연결':'공식 모델');
 if(args.length!==5||!['--korean-products','--foreign-api-prices','--foreign-sku-prices'].includes(args[2])||(cfg.country==='KR')!==domestic||args[3]!=='--targets-file'||!locales[cfg.country]||!cfg.allowedHosts.includes('api.louisvuitton.com')||path.resolve(args[4])!==root+'/crawler/louis-vuitton-progress/'+country+'/targets.json')throw Error('FOREIGN_MODEL_SCOPE');
 const targets=JSON.parse(await fs.readFile(args[4]));if(!Array.isArray(targets)||!targets.length||targets.length>Math.min(25,cfg.maxProductsPerRun)||new Set(targets.map(t=>t.code)).size!==targets.length)throw Error('TARGET_LIMIT');
 // This mode refreshes already public Korean bags; it cannot introduce an
 // unclassified new SKU or mint a new independent discovery proof.
 if(domestic){const registered=readRegisteredLouisVuitton(root);if(targets.some(t=>!registered.some(r=>r.code===t.code&&r.url===t.koreanUrl)))throw Error('REGISTERED_REFERENCE_REQUIRED');}
 const stateFile=root+'/crawler/runtime/louis-vuitton-browser/workflow.json';let state={version:1,ingestHeld:{}};
 if(domestic)try{state=JSON.parse(await fs.readFile(stateFile));if(state.version!==1)throw Error('WORKFLOW_STATE_GUARD');state.ingestHeld??={};}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(run+'/artifacts',{recursive:true});
 const rows=[],records=[],cache=new Map(),failedUrls=new Set(louisVuittonAccessStops),base=root+'/crawler/runs/louis-vuitton/'+country;let calls=0,apiCalls=0,failed=0,active=targets[0],url=cfg.entryUrl;
 const guard=async f=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');return JSON.parse(await fs.readFile(f));};
 for(const id of await fs.readdir(base)){if(base+'/'+id===run)continue;let proof;try{proof=await guard(base+'/'+id+'/summary.json');}catch(e){if(e.code==='ENOENT')continue;throw e;}let index=0;
  for(const r of proof)if(/^IMAGE_HTTP_(?:401|403|429)$/.test(r.status))failedUrls.add(r.officialUrl);
  for(const r of proof.filter(r=>['한국 동일 SKU 통합 상품','한국 동일 SKU 해외 공식 모델','한국 동일 SKU 해외 SKU 연결'].includes(r.parentModel)&&/^API_HTTP_\d+$/.test(r.status))){index++;if(r.status!=='API_HTTP_200'){failedUrls.add(r.officialUrl);continue;}const file=base+'/'+id+'/raw/api-'+index+'.source';try{const stat=await fs.stat(file);if(Date.now()-stat.mtimeMs<3600000)cache.set(r.officialUrl,{file,stat});}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 const row=(status,price=null,officialUrl=url)=>({brand:cfg.brand,country:cfg.country,parentModel:label,variantCode:active?.code??'RUN',price,currency:cfg.currency,status,officialUrl});
 const read=async entry=>{if(entry.stat.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let data;try{await fs.chmod(entry.file,0o600);data=JSON.parse(await fs.readFile(entry.file));}finally{await fs.chmod(entry.file,entry.stat.mode&0o777);}return {data,checkedAt:entry.stat.mtime.toISOString()};};
 const localCache=new Map(),client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 const get=async()=>{if(localCache.has(url))return localCache.get(url);if(failedUrls.has(url))throw Error('API_REQUEST_HELD');let result;if(cache.has(url)){result=await read(cache.get(url));rows.push(row('API_SOURCE_CACHE_REUSED'));}else{if(calls>=cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');if(calls)await new Promise(r=>setTimeout(r,2000));calls++;apiCalls++;const response=await client.get(url,{maxRedirects:0});rows.push(row('API_HTTP_'+response.status()));if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('API_SOURCE_UNAVAILABLE');const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');await fs.writeFile(run+'/raw/api-'+apiCalls+'.source',body,{mode:0o600});let data;try{data=JSON.parse(body.toString());}catch{throw Error('API_JSON_UNAVAILABLE');}result={data,checkedAt:new Date().toISOString()};}localCache.set(url,result);return result;};
 try{for(const t of targets){active=t;url=foreignModelEndpoint(cfg,t.koreanUrl,t.code);try{
  if(skuMode){url=foreignSkuEndpoint(cfg,t.code);const lookup=await get();url=nativeModelEndpoint(cfg,lookup.data);const result=await get();let record=foreignModelRecord(result.data,cfg,t.code,result.checkedAt);
   if(domestic){
    record=koreanModelRecord(result.data,cfg,record);
    if(failedUrls.has(record.sourceImageUrl))throw Error('IMAGE_ACCESS_STOP_HELD');
    const source={code:t.code,images:[{url:record.sourceImageUrl}]};
    // Only diagnosed source/image failures hold an unchanged image. Preserve
    // an earlier generic local-preparation journal entry, not a remote refusal.
    const diagnosed=/^IMAGE_(?:DOWNLOAD_FAILED|FORMAT_INVALID|NETWORK_TIMEOUT|NETWORK_RESET|REQUEST_FAILED)$/;
    if(heldCatalogItem(source,state.ingestHeld)&&diagnosed.test(state.ingestHeld[t.code].reason))throw Error('REFERENCE_ITEM_HELD');
    let blockedImage=false;
    try{
     const optimized=await downloadAndOptimizeImage({request:{get:async(value,options)=>{if(value!==record.sourceImageUrl)throw Error('IMAGE_SOURCE_IDENTITY');if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const response=await client.get(value,options);if([401,403,429].includes(response.status())){blockedImage=true;rows.push(row('IMAGE_HTTP_'+response.status(),null,value));}return response;}}},record.sourceImageUrl,run+'/artifacts',t.code);
     record={...record,...optimized};validateKoreanCatalogRecord(record,cfg.brand);
    }catch(e){if(blockedImage)throw Error('IMAGE_ACCESS_BLOCKED');if(diagnosed.test(e.message)){state.ingestHeld[t.code]={imageKey:catalogImageKey(source),reason:e.message};await fs.mkdir(path.dirname(stateFile),{recursive:true});const tmp=stateFile+'.tmp';await fs.writeFile(tmp,JSON.stringify(state),{mode:0o600});await fs.rename(tmp,stateFile);}if(e.code==='ENOENT'||e.code==='EACCES'||e instanceof TypeError)throw Error('IMAGE_LOCAL_RUNTIME_FAILED');throw e;}
   }
   if(domestic){const unresolved=['colorDisplay','materialDisplay','widthMm','heightMm','depthMm'].filter(key=>record[key]===null).length;if(unresolved)rows.push(row('KR_ATTRIBUTES_UNRESOLVED_'+unresolved,null,record.officialUrl));}
   records.push(record);rows.push(row(domestic?'KR_FULL_RECORD_READY':'EXACT_LOCAL_MODEL_PRICE',record.price,record.officialUrl));continue;}
  let result=localCache.get(url);if(!result){if(cache.has(url)){result=await read(cache.get(url));rows.push(row('API_SOURCE_CACHE_REUSED'));}else{if(failedUrls.has(url))throw Error('API_REQUEST_HELD');if(calls>=cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');if(calls)await new Promise(r=>setTimeout(r,2000));calls++;apiCalls++;const response=await client.get(url,{maxRedirects:0});rows.push(row('API_HTTP_'+response.status()));if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('API_SOURCE_UNAVAILABLE');const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');await fs.writeFile(run+'/raw/api-'+apiCalls+'.source',body,{mode:0o600});let data;try{data=JSON.parse(body.toString());}catch{throw Error('API_JSON_UNAVAILABLE');}result={data,checkedAt:new Date().toISOString()};}localCache.set(url,result);}
  const record=foreignModelRecord(result.data,cfg,t.code,result.checkedAt);records.push(record);rows.push(row('EXACT_LOCAL_MODEL_PRICE',record.price,record.officialUrl));
 }catch(e){failed++;const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'MODEL_PRICE_FAILED';rows.push(row(status));if(catalogItemFailureKind(status)!=='ordinary'||/CONFLICT/.test(status)){process.exitCode=catalogItemFailureKind(status)==='access'?2:78;break;}}}}
 finally{await client.dispose();if(domestic)await closeImageProcessor();await fs.mkdir(run+'/artifacts',{recursive:true});await fs.writeFile(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});rows.push(row('BATCH_FAILED_'+failed),row('NEXT_OFFSET_'+calls));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 if(failed&&!process.exitCode)process.exitCode=2;
}
