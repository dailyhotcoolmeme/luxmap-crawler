import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseOfficialProduct} from './hermes-collection.js';
import {hermesReferenceCode} from './hermes-reference-collection.js';
import {inspectHermesListingEvidence} from './hermes-listing-evidence.js';
import {parseHermesImageProperties} from './hermes-image-properties-probe.js';
import {hermesImagePropertiesUrl} from './hermes-image-url.js';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';

const projectRoot=path.resolve(import.meta.dirname,'../..');
// One end-to-end sample from the already acquired, exact Korean listing source.
// No product-detail retries; image bytes must match the native catalog dimensions.
export async function recoverHermesListingSample(){
 const env=process.env,args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=env.CRAWL_RUN_DIR;
 const batch=args.length===6&&args[4]==='--batch-offset'&&/^\d+$/.test(args[5]??''),offset=batch?Number(args[5]):0;
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='hermes'||(!batch&&args.length!==4)||args[2]!=='--recover-source-run'||cfg.country!=='KR'||!Number.isSafeInteger(offset))throw Error('GUARDED_RUN_REQUIRED');
 const source=path.resolve(args[3]),base=path.join(projectRoot,'crawler/runs/hermes/kr')+path.sep,rows=[],records=[],artifact=path.join(run,'artifacts');let context,product;
 const row=(status)=>({brand:'hermes',country:'KR',parentModel:product?.name??'한국 공식 가방',variantCode:product?.sku??'RUN',price:product?.price??null,currency:'KRW',status,officialUrl:product?.url??cfg.entryUrl});
 const guarded=async address=>{if(!address.startsWith(base)||await fs.realpath(address)!==address||spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[address+'/summary.json'],{stdio:'ignore'}).status!==0)throw Error('SOURCE_PROVENANCE_INVALID');};
 const readPrivate=async file=>{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8388608)throw Error('SOURCE_LIMIT');try{await fs.chmod(file,0o600);return await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}};
 try{
  await guarded(source);await fs.mkdir(artifact,{recursive:true});
  const summary=JSON.parse(await fs.readFile(source+'/summary.json','utf8'));
  if(!summary.some(r=>r.brand==='hermes'&&r.status==='REFERENCE_DISCOVERED_NOT_INGESTED'))throw Error('SOURCE_SCOPE_INVALID');
  const index=JSON.parse(await readPrivate(path.join(projectRoot,'crawler/brands/hermes/.reference-index.json'))),age=Date.now()-Date.parse(index.checkedAt);
  if(!Number.isFinite(age)||age<0||age>86400000)throw Error('SOURCE_STALE');
  const prices=new Map();
  const names=(await fs.readdir(source+'/raw')).filter(n=>/^\d+\.source$/.test(n));if(names.length>20)throw Error('SOURCE_LIMIT');
  for(const name of names)for(const p of inspectHermesListingEvidence(await readPrivate(source+'/raw/'+name),{includeVisiblePrices:true}).records){if(p.price===null||!p.name||!index.products.some(i=>i.code===p.sku&&i.url===p.url))continue;const prior=prices.get(p.sku);if(prior&&prior.price!==p.price)throw Error('PRICE_CONFLICT');prices.set(p.sku,{...p,assets:[...new Map([...(prior?.assets??[]),...p.assets].map(a=>[JSON.stringify([a.url,a.type,a.tag]),a])).values()]});}
  const selected=[...prices.values()].slice(offset,offset+(batch?25:1));if(!selected.length)throw Error('EXACT_LISTING_PRICE_MISSING');
  const stored=new Set();
  for(const id of await fs.readdir(base)){
   const p=path.join(base,id,'artifacts/public-verified/summary.json');
   if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[p],{stdio:'ignore'}).status!==0)continue;
   for(const r of JSON.parse(await fs.readFile(p,'utf8')))if(r.status==='PUBLIC_CATALOG_VERIFIED'&&prices.get(r.variantCode)?.price===r.price&&prices.get(r.variantCode)?.url===r.officialUrl)stored.add(r.variantCode);
  }
  const {request}=await import('playwright-core');context=await request.newContext({proxy:{server:env.LUXURY_NETWORK_PROXY},timeout:30000});let calls=0,failed=0;
  for(product of selected){
  try{
  if(stored.has(product.sku)){rows.push(row('EXISTING_PUBLIC_VERIFIED'));continue;}
  const eligibleImages=product.assets.filter(a=>a.type==='image'&&a.source==='scene7'),preferred=eligibleImages.some(a=>a.tag==='front')?'front':'worn';
  const front=eligibleImages.filter(a=>a.tag===preferred).sort((a,b)=>a.position-b.position);if(!front.length||front.length>1&&front[0].position===front[1].position&&front[0].url!==front[1].url)throw Error('IMAGE_SOURCE_AMBIGUOUS');
  const image=new URL(front[0].url,cfg.entryUrl).href,propertiesUrl=hermesImagePropertiesUrl(image,product.sku,[image]);
  let cached;
  for(const id of (await fs.readdir(base)).sort().reverse()){
   const previous=path.join(base,id);if(previous===run)continue;try{
    await guarded(previous);const sr=JSON.parse(await fs.readFile(previous+'/summary.json','utf8'));
    if(!sr.some(r=>r.status==='REFERENCE_IMAGE_READY'&&r.variantCode===product.sku&&r.price===product.price&&r.officialUrl===product.url))continue;
    const candidates=JSON.parse(await readPrivate(previous+'/artifacts/records.json'));
    const r=candidates.find(r=>r.normalizedCode===product.sku&&r.price===product.price&&r.officialUrl===product.url&&r.sourceImageUrl===image.split('?')[0]);if(!r)continue;
    if(!r.imageProof?.cpuOfflineVerified||!r.imageProof.originalSourceVerified||r.imageProcessingVersion!=='original-cutout-v1')continue;
    if(path.dirname(r.imagePath)!==previous+'/artifacts'||path.dirname(r.originalImagePath)!==previous+'/artifacts')continue;
    const output=await fs.readFile(r.imagePath),input=await fs.readFile(r.originalImagePath);
    if(output.length>4194304||input.length>12582912||createHash('sha256').update(output).digest('hex')!==r.imageSha256||createHash('sha256').update(input).digest('hex')!==r.imageProof.sourceSha256)continue;
    const imagePath=path.join(artifact,path.basename(r.imagePath)),originalImagePath=path.join(artifact,path.basename(r.originalImagePath));await fs.writeFile(imagePath,output,{mode:0o600});await fs.writeFile(originalImagePath,input,{mode:0o600});cached={...r,imagePath,originalImagePath};break;
   }catch(error){if(error.code!=='ENOENT'&&error.code!=='EACCES'&&error.message!=='SOURCE_PROVENANCE_INVALID')throw error;}
  }
  if(cached){records.push(cached);rows.push(row('REFERENCE_IMAGE_READY'));await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});continue;}
  let facts;
  for(const id of (await fs.readdir(base)).sort().reverse()){
   const candidate=path.join(base,id);try{await guarded(candidate);}catch{continue;}
   const sr=JSON.parse(await fs.readFile(candidate+'/summary.json','utf8'));
   if(!sr.some(r=>r.variantCode===product.sku&&r.officialUrl===propertiesUrl&&/^PROPS_IMAGE_SIZE_/.test(r.status)))continue;
   const propertiesFile=candidate+'/raw/image-properties.source';if(Date.now()-(await fs.stat(propertiesFile)).mtimeMs>86400000)continue;
   facts={...parseHermesImageProperties(await readPrivate(propertiesFile)),propertiesUrl};break;
  }
  if(!facts?.dimensionsVerified){
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   const response=await context.get(propertiesUrl,{maxRedirects:0,maxRetries:0,timeout:30000});
   if([401,403,429].includes(response.status()))throw Error('IMAGE_ACCESS_BLOCKED');
   if(!response.ok()||!/^(text\/plain|application\/json)(?:;|$)/i.test(response.headers()['content-type']??''))throw Error('IMAGE_PROPERTIES_FAILED');
   const body=await response.body();if(body.length>65536)throw Error('METADATA_LIMIT');
   await fs.writeFile(path.join(artifact,product.sku+'-properties.source'),body,{mode:0o600});
   facts={...parseHermesImageProperties(body.toString('utf8')),propertiesUrl};
  }
  if(!facts?.dimensionsVerified)throw Error('NATIVE_IMAGE_PROPERTIES_MISSING');
  const optimized=await downloadAndOptimizeImage({request:{get:(url,options)=>{if(url!==image.split('?')[0])throw Error('UNAUTHORIZED_IMAGE_URL');if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');return context.get(url,options);}}},image,artifact,product.sku,facts);
  const code=product.sku,referenceProof={schema:1,exactReferenceVerified:true,classificationEvidenceVerified:true,countryCurrencyVerified:true,brand:'hermes',category:'bag',country:'KR',currency:'KRW',code,officialUrl:product.url};
  records.push({brand:'hermes',category:'bag',country:'KR',currency:'KRW',originalCode:code,normalizedCode:code,sourceProductId:code,styleCode:code,modelKey:`sku-${code.toLowerCase()}`,parentModel:product.name,productName:product.name,materialDisplay:null,materialOriginal:null,colorDisplay:null,colorOriginal:null,sizeDisplay:null,widthMm:null,heightMm:null,depthMm:null,price:product.price,priceStatus:'confirmed',officialUrl:product.url,checkedAt:new Date().toISOString(),imageView:preferred,referenceProof,...optimized});
  if(preferred==='worn')rows.push(row('OFFICIAL_SAME_SKU_WORN_IMAGE'));
  rows.push(row('REFERENCE_IMAGE_READY'));
  }catch(error){
   const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'LISTING_PRODUCT_FAILED';
   if(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD|CONFLICT|SANDBOX|WORKER|RUNTIME|OFFLINE/.test(status))throw error;
   failed++;rows.push(row(status));
  }
  await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});
  }
  rows.push(row('BATCH_FAILED_'+failed),row('NEXT_OFFSET_'+(offset+selected.length)),row(batch?'PARTIAL_LISTING_BATCH_NOT_FULL_CATALOG':'SAMPLE_NOT_FULL_CATALOG'));
  if(failed){process.exitCode=records.length?2:1;await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:'PARTIAL_REFERENCE_BATCH'}));}
 }catch(error){const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'LISTING_RECOVERY_FAILED';rows.push(row(status));await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:status}));process.exitCode=1;}
 finally{await closeImageProcessor();await context?.dispose();await fs.mkdir(artifact,{recursive:true});await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});}
}
const safeCode=error=>/^[A-Z0-9_]{1,40}$/.test(error?.message??'')?error.message:'DETAIL_REQUEST_FAILED';
const fatalCode=code=>/BLOCKED|UNAUTHORIZED|LIMIT|GUARD|PREFLIGHT|INDEX_|SCOPE|CONFIG|OFFSET/.test(code);
async function atomic(file,data){const temp=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temp,JSON.stringify(data),{mode:0o600});await fs.rename(temp,file);}
function officialUrl(value,listing=false){
 let u;try{u=new URL(value);}catch{throw Error('UNAUTHORIZED_URL');}
 if(u.origin!=='https://www.hermes.com'||u.username||u.password||u.search&&!listing||u.hash||u.href!==value||!u.pathname.startsWith('/kr/ko/'))throw Error('UNAUTHORIZED_URL');
 if(listing&&[...u.searchParams].some(([key,v])=>!['page','offset','start'].includes(key)||!/^\d+$/.test(v)))throw Error('UNAUTHORIZED_URL');
 return u.href;
}

// Central runner only. This module never discovers/guesses URLs, downloads images,
// modifies the reference index, ingests DB rows or claims full collection success.
// Main wires: --country-config <kr> --batch-offset <n> [--limit 1].
// Private outputs: .reference-detail-ledger.json plus per-run artifacts.
export async function collectHermesReferenceBatch(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2),root=options.root??projectRoot;
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='hermes'||!env.LUXURY_NETWORK_PROXY)throw Error('GUARDED_RUN_REQUIRED');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('PREFLIGHT_FAILED');
 if(![4,6].includes(args.length)||args[0]!=='--country-config'||args[2]!=='--batch-offset'||!/^\d+$/.test(args[3]??'')||args.length===6&&(args[4]!=='--limit'||args[5]!=='1'))throw Error('INVALID_BATCH_ARGS');
 const cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8'));
 if(cfg.brand!=='hermes'||cfg.country!=='KR'||cfg.currency!=='KRW'||cfg.localePrefix!=='/kr/ko/'||cfg.entryUrl!=='https://www.hermes.com/kr/ko/'||!Array.isArray(cfg.allowedHosts)||!cfg.allowedHosts.includes('www.hermes.com')||cfg.allowedHosts.some(h=>!['www.hermes.com','assets.hermes.com'].includes(h)))throw Error('CONFIG_INVALID');
 for(const [key,cap] of Object.entries({maxProductsPerRun:25,maxRequestsPerRun:80,maxResponseBytes:8388608,maxCandidates:10000}))if(!Number.isSafeInteger(cfg[key])||cfg[key]<1||cfg[key]>cap)throw Error('CONFIG_LIMIT_INVALID');
 const offset=Number(args[3]),sample=args.length===6;
 if(!Number.isSafeInteger(offset))throw Error('OFFSET_INVALID');
 const run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(!run.startsWith(path.join(root,'crawler/runs/hermes/kr')+path.sep)||await fs.realpath(run)!==run)throw Error('RUN_SCOPE_INVALID');
 const brand=path.join(root,'crawler/brands/hermes'),artifacts=path.join(run,'artifacts'),raw=path.join(run,'raw');
 await fs.mkdir(artifacts,{recursive:true,mode:0o700});await fs.mkdir(raw,{recursive:true,mode:0o700});
 const indexFile=path.join(brand,'.reference-index.json'),ledgerFile=path.join(brand,sample?'.reference-sample-detail-ledger.json':'.reference-detail-ledger.json');
 const rows=[],records=[];let context,ledger,index,fingerprint,calls=0,nextOffset=offset,failure=null;
 const row=(status,item={},price=null)=>({brand:'hermes',country:'KR',parentModel:'',variantCode:item.code??'RUN',price,currency:'KRW',status,officialUrl:item.url??cfg.entryUrl});
 const save=async()=>{
  await atomic(path.join(artifacts,'records.json'),records);
  if(ledger)await atomic(ledgerFile,ledger);
  const file=path.join(run,'summary.json');await atomic(file,rows);
  if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
 };
 async function get(item){
  let address=officialUrl(item.url);
  for(let hop=0;hop<4;hop++){
   if(hermesReferenceCode(address)!==item.code)throw Error('UNAUTHORIZED_SKU_REDIRECT');
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   let response;try{response=await context.get(address,{maxRedirects:0,timeout:Math.min(cfg.navigationTimeoutMs??30000,30000)});}catch{throw Error('DETAIL_REQUEST_FAILED');}
   if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(response.status())){address=officialUrl(new URL(response.headers().location,address).href);continue;}
   if(!response.ok())throw Error(`HTTP_${response.status()}`);
   if(!/text\/html/i.test(response.headers()['content-type']??''))throw Error('SOURCE_NOT_HTML');
   const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   await fs.writeFile(path.join(raw,`${calls}.source`),body,{mode:0o600});
   const html=body.toString('utf8');
   if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human|datadome/i.test(html))throw Error('ACCESS_BLOCKED');
   return {html,url:address};
  }throw Error('REDIRECT_LIMIT');
 }
 try{
  const stat=await fs.lstat(indexFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('INDEX_LIMIT');
  const content=await fs.readFile(indexFile,'utf8');index=JSON.parse(content);fingerprint=createHash('sha256').update(content).digest('hex');
  const age=(options.now?.()??Date.now())-Date.parse(index.checkedAt);
  if(!Number.isFinite(age)||age<0||age>86400000)throw Error('INDEX_STALE');
  if(index.scope!=='published-korean-bag-lists'||!Array.isArray(index.pages)||!index.pages.length||!Array.isArray(index.products)||!index.products.length||index.products.length>cfg.maxCandidates)throw Error('INDEX_INVALID');
  for(const url of index.pages)if(!/^\/kr\/ko\/category\/leather-goods\/bags-and-clutches\//.test(new URL(officialUrl(url,true)).pathname))throw Error('INDEX_LISTING_INVALID');
  const seen=new Set();
  for(const item of index.products){
   if(!item||!/^H[A-Z0-9]{8,19}$/.test(item.code??'')||hermesReferenceCode(officialUrl(item.url))!==item.code||!index.pages.includes(item.listingUrl)||seen.has(item.code))throw Error('INDEX_SKU_INVALID');
   seen.add(item.code);
  }
  if(offset>=index.products.length)throw Error('OFFSET_INVALID');
  try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('INDEX_LEDGER_INVALID');}
  if(ledger&&(!ledger.entries||typeof ledger.entries!=='object'||Array.isArray(ledger.entries)))throw Error('INDEX_LEDGER_INVALID');
  if(ledger&&ledger.indexSha256!==fingerprint){if(offset!==0)throw Error('INDEX_CHANGED');ledger=null;}
  ledger??={indexSha256:fingerprint,entries:{},detailComplete:false,complete:false};
  if(ledger.blocked)throw Error('PREVIOUS_RUN_BLOCKED');
  const factory=options.contextFactory??(async config=>(await import('playwright-core')).request.newContext(config));
  context=await factory({proxy:{server:env.LUXURY_NETWORK_PROXY},timeout:30000});
  rows.push(row(`DISCOVERED_${index.products.length}`),row(`BATCH_OFFSET_${offset}`));if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));
  for(const item of index.products.slice(offset,offset+(sample?1:cfg.maxProductsPerRun))){
   try{
    const page=await get(item),product=parseOfficialProduct(page.html,page.url,cfg,{expectedCode:item.code,listingUrl:item.listingUrl});
    // Keep authoritative parser metadata; never turn schema rendition into master proof.
    records.push({...product,sourceImageOriginalVerified:false});
    ledger.entries[item.code]={state:'metadata_ready_image_pending',officialUrl:product.officialUrl,run,checkedAt:new Date().toISOString()};
    rows.push(row('EXACT_METADATA_IMAGE_PENDING',item,product.price));
   }catch(error){
    const status=safeCode(error);ledger.entries[item.code]={state:'unresolved',status,officialUrl:item.url,run};rows.push(row(status,item));
    if(fatalCode(status)){ledger.blocked=status;throw error;}
   }
   nextOffset++;await save();
  }
 }catch(error){failure=safeCode(error);rows.push(row(failure));}
 finally{
  const products=Array.isArray(index?.products)?index.products:[];
  const unresolved=products.filter(item=>ledger?.entries?.[item?.code]?.state!=='metadata_ready_image_pending').length;
  const detailComplete=!sample&&!failure&&products.length>0&&unresolved===0;
  if(ledger){ledger.detailComplete=detailComplete;ledger.complete=false;}
  const result={complete:false,detailComplete,nextOffset,remaining:Math.max(0,products.length-nextOffset),unresolved,metadataReady:records.length,imagePending:products.length-unresolved,requests:calls,failureCode:failure??'ORIGINAL_IMAGE_PENDING'};
  rows.push(row(`METADATA_READY_${records.length}`),row(`NEXT_OFFSET_${nextOffset}`),row(`UNRESOLVED_${unresolved}`),row(detailComplete?'DETAIL_COMPLETE_IMAGE_PENDING':'DETAIL_BATCH_INCOMPLETE'));
  try{await save();await atomic(path.join(artifacts,'batch-state.json'),result);await atomic(path.join(run,'failure.json'),{failureCode:result.failureCode});}
  finally{await context?.dispose();}
  if(!options.env)process.exitCode=failure?(fatalCode(failure)?78:1):2;
  return result;
 }
}
