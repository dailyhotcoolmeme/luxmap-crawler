import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {createHash} from 'node:crypto';
import {parseOfficialProduct,isDiorBagName,normalizeOfficialCode} from './dior-official-core.js';
import {inspectDiorNativeEvidence} from '../../scripts/report-dior-native-evidence.mjs';
import {downloadAndOptimizeImage,closeImageProcessor,originalImageUrl,IMAGE_PROCESSING_VERSION} from './image-processor.js';
import {requireDiorIntegratedAttributes} from './dior-image-quality.js';
import {preserveDiorRegisteredFields} from './dior-weekly-routes.js';
export function diorImageInputKey(product){
 const source=originalImageUrl(product.sourceImageUrl,product.normalizedCode);
 return createHash('sha256').update(product.normalizedCode+'\0'+source+'\0'+IMAGE_PROCESSING_VERSION).digest('hex');
}
export const diorOrdinaryImageFailure=code=>['IMAGE_BYTE_LIMIT','MASK_RANGE','EMPTY_MASK','EMPTY_BOUNDS','DIOR_IMAGE_QUALITY_REJECTED','DIOR_SOURCE_FOREGROUND_UNCERTAIN','DIOR_PERSON_IN_PRODUCT_PHOTO'].includes(code);
export function diorUnfailedImages(product,failed){
 const urls=[product.sourceImageUrl,...(product.sourceImageCandidates??[])],unique=new Map();
 for(const url of urls)try{const p={...product,sourceImageUrl:url},key=diorImageInputKey(p);if(!failed.has(key)&&!unique.has(key))unique.set(key,url);}catch{}
 return [...unique.values()].slice(0,3);
}
export function sameDiorRecoveryIdentity(a,b){
 return ['normalizedCode','officialUrl','productName','currency','price'].every(k=>a[k]===b[k]);
}
export function selectDiorPublishedImage(html,product,selection,failedKeys){
 if(selection.code!==product.normalizedCode||selection.sourceSha256!==createHash('sha256').update(html).digest('hex'))throw Error('IMAGE_SELECTION_SOURCE');
 const selected=diorImageInputKey({...product,sourceImageUrl:selection.imageUrl});
 if(failedKeys.has(selected))throw Error('IMAGE_INPUT_ALREADY_FAILED');
 const published=inspectDiorNativeEvidence(html).records.filter(r=>normalizeOfficialCode(r.sku)===product.normalizedCode&&r.url===product.officialUrl&&r.name===product.productName&&r.price===product.price&&!r.priceConflict&&!r.nameConflict).flatMap(r=>r.images);
 for(const url of published)try{if(diorImageInputKey({...product,sourceImageUrl:url})===selected)return url;}catch{}
 throw Error('IMAGE_SELECTION_NOT_PUBLISHED');
}
export function reusableDiorImageMetadata(cached,product){
 let source;try{source=originalImageUrl(product.sourceImageUrl,product.normalizedCode);}catch{return false;}
 return cached.normalizedCode===product.normalizedCode&&cached.sourceImageUrl===source&&cached.imageProcessingVersion==='original-cutout-v1'&&cached.imageWidth===960&&cached.imageHeight===960&&cached.imageProof?.diorQuality?.processingRevision==='dior-catalog-v2'&&cached.imageProof?.diorQuality?.passed===true&&cached.imageProof?.diorQuality?.personCheck?.cpuOffline===true&&cached.imageProof?.diorQuality?.personCheck?.detected===false&&cached.imageProof?.cpuOfflineVerified===true&&cached.imageProof?.outputVerified===true&&cached.imageProof?.originalSourceVerified===true&&cached.imageProof?.sourceUrl===source&&cached.imageProof?.sha256===cached.imageSha256&&/^[a-f0-9]{64}$/.test(cached.imageSha256??'')&&/^[a-f0-9]{64}$/.test(cached.imageProof?.sourceSha256??'');
}
export function diorPreparedImageLimit(key,documentLimit){
 // Match the existing original-image processor, not the HTML response limit.
 if(key==='originalImagePath')return 12*1024*1024;
 if(key==='imagePath')return documentLimit;
 throw Error('IMAGE_CACHE_SCOPE');
}
async function reusePreparedImage(root,run,artifact,product,cfg){
 const base=root+'/crawler/runs/dior/kr';
 for(const name of (await fs.readdir(base)).sort().reverse()){
  const prior=base+'/'+name;if(prior===run)continue;
  const summary=prior+'/summary.json';let rows;try{rows=JSON.parse(await fs.readFile(summary,'utf8'));}catch{continue;}
  if(!Array.isArray(rows)||!rows.some(r=>r.status==='REFERENCE_IMAGE_READY'&&r.variantCode===product.normalizedCode))continue;
  if(spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)continue;
  const publicFile=prior+'/artifacts/public-verified/summary.json';
  if(!spawnSync(root+'/scripts/crawl-output-guard.sh',[publicFile],{stdio:'ignore'}).status&&JSON.parse(await fs.readFile(publicFile,'utf8')).some(r=>r.status==='PUBLIC_CATALOG_VERIFIED'&&r.variantCode===product.normalizedCode))continue;
  const file=prior+'/artifacts/records.json';let candidates;try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)continue;let bytes;try{await fs.chmod(file,0o600);bytes=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}candidates=JSON.parse(bytes);}catch{continue;}
  const cached=candidates.find(r=>reusableDiorImageMetadata(r,product));if(!cached)continue;
  const result={};
  for(const [key,hash] of [['imagePath',cached.imageSha256],['originalImagePath',cached.imageProof.sourceSha256]]){
   const source=cached[key];if(typeof source!=='string'||path.dirname(source)!==prior+'/artifacts'||await fs.realpath(source)!==source)throw Error('IMAGE_CACHE_SCOPE');
   const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>diorPreparedImageLimit(key,cfg.maxResponseBytes))throw Error('IMAGE_CACHE_SCOPE');
   const bytes=await fs.readFile(source);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('IMAGE_CACHE_IDENTITY');
   result[key]=artifact+'/'+path.basename(source);await fs.writeFile(result[key],bytes,{mode:0o600});
  }
  return {...Object.fromEntries(['sourceImageUrl','imageSha256','imageMimeType','imageWidth','imageHeight','imageBytes','imageProcessingVersion','imageProof'].map(k=>[k,cached[k]])),...result};
 }
 return null;
}

export async function recoverDiorReference(){
 const args=process.argv.slice(2),root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR;
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||args.length!==4||args[2]!=='--recover-source-run')throw Error('RECOVERY_GUARD');
 const cfg=JSON.parse(await fs.readFile(args[1])),source=path.resolve(args[3]);
 if(cfg.brand!=='dior'||cfg.country!=='KR'||!source.startsWith(root+'/crawler/runs/dior/kr/')||await fs.realpath(source)!==source||Date.now()-(await fs.stat(source)).mtimeMs>86400000)throw Error('RECOVERY_SCOPE');
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
 const accepted=JSON.parse(await fs.readFile(source+'/summary.json')).filter(r=>r.status==='EXACT_SKU');
 if(!accepted.length||accepted.length>25)throw Error('RECOVERY_BATCH_LIMIT');
 const imageSelections=new Map(),failedKeys=new Set(),selectionFile=source+'/artifacts/selected-original-images.json';
 // Failure history is input-specific and survives a normal collection resume.
 for(const id of await fs.readdir(root+'/crawler/runs/dior/kr')){
  const prior=root+'/crawler/runs/dior/kr/'+id;
  for(const basename of ['image-failed-inputs.json','image-failure-input.json']){const file=prior+'/artifacts/'+basename;let st;
  try{st=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!st.isFile()||st.isSymbolicLink()||st.size>131072||spawnSync(root+'/scripts/crawl-output-guard.sh',[prior+'/summary.json'],{stdio:'ignore'}).status)throw Error('IMAGE_FAILURE_HISTORY');
  const content=JSON.parse(await fs.readFile(file)),items=basename==='image-failure-input.json'?[content]:content;if(!Array.isArray(items)||items.length>75)throw Error('IMAGE_FAILURE_HISTORY');
  for(const item of items){if(!diorOrdinaryImageFailure(item.failureCode)||item.key!==diorImageInputKey({normalizedCode:item.code,sourceImageUrl:item.sourceImageUrl}))throw Error('IMAGE_FAILURE_HISTORY');failedKeys.add(item.key);}
  }
 }
 const selectionStat=await fs.lstat(selectionFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(selectionStat){const stat=selectionStat;if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('IMAGE_SELECTION_SCOPE');const items=JSON.parse(await fs.readFile(selectionFile));if(!Array.isArray(items)||items.length>25)throw Error('IMAGE_SELECTION_SCOPE');
  for(const item of items){if(!accepted.some(r=>r.variantCode===item.code)||imageSelections.has(item.code)||!Array.isArray(item.failedRuns)||!item.failedRuns.length||item.failedRuns.length>8)throw Error('IMAGE_SELECTION_SCOPE');
   for(const prior of item.failedRuns){if(typeof prior!=='string'||!prior.startsWith(root+'/crawler/runs/dior/kr/')||await fs.realpath(prior)!==prior||spawnSync(root+'/scripts/crawl-output-guard.sh',[prior+'/summary.json'],{stdio:'ignore'}).status)throw Error('IMAGE_SELECTION_HISTORY');const previous=JSON.parse(await fs.readFile(prior+'/summary.json'));if(!previous.some(r=>r.variantCode===item.code&&['IMAGE_BYTE_LIMIT','MASK_RANGE'].includes(r.status)))throw Error('IMAGE_SELECTION_HISTORY');const input=JSON.parse(await fs.readFile(prior+'/artifacts/image-failure-input.json'));if(input.code!==item.code||input.key!==diorImageInputKey({normalizedCode:input.code,sourceImageUrl:input.sourceImageUrl}))throw Error('IMAGE_SELECTION_HISTORY');failedKeys.add(input.key);}
   imageSelections.set(item.code,item);
  }
 }
 const inputs=[];let classificationRejected=0,attributesRejected=0;
 for(const name of (await fs.readdir(source+'/raw')).filter(n=>/^\d+\.source$/.test(n))){
  const file=source+'/raw/'+name,stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');
  let html;try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
  for(const row of accepted){
   let product;try{product=parseOfficialProduct(html,row.officialUrl,cfg,row.variantCode,{handbagEvidence:true});}catch{continue;}
   // Category links can include global navigation: independently require an
   // explicit bag type in the official product name before issuing a proof.
   if(!isDiorBagName(product.productName)){classificationRejected++;continue;}
   if(JSON.parse(await fs.readFile(source+'/summary.json')).some(r=>r.status==='SOURCE_BATCH_RECORDED')){
    const refs=JSON.parse(await fs.readFile(root+'/crawler/runtime/dior-weekly/references.json'));
    product=preserveDiorRegisteredFields(product,refs.find(v=>v.normalized_code===product.normalizedCode));
   }
   try{requireDiorIntegratedAttributes(product);}catch{attributesRejected++;continue;}
   if(product.price!==row.price)throw Error('RECOVERY_IDENTITY');
   const selection=imageSelections.get(product.normalizedCode);if(selection){product.sourceImageUrl=selectDiorPublishedImage(html,product,selection,failedKeys);product.sourceImageCandidates=[product.sourceImageUrl];}
   const existing=inputs.find(p=>p.normalizedCode===product.normalizedCode);
   if(existing){if(!sameDiorRecoveryIdentity(existing,product))throw Error('RECOVERY_IDENTITY');continue;}
   // A CPU-only reparse is not a fresh observation of the official price.
   product.checkedAt=stat.mtime.toISOString();
   product.referenceProof={schema:1,exactReferenceVerified:true,classificationEvidenceVerified:true,countryCurrencyVerified:true,brand:'dior',category:'bag',country:'KR',currency:'KRW',code:product.normalizedCode,officialUrl:product.officialUrl};inputs.push(product);
  }
 }
 if(!inputs.length)throw Error(attributesRejected?'DIOR_INTEGRATED_FIELDS_UNRESOLVED':'BAG_CLASSIFICATION_UNRESOLVED');
 const rows=[],records=[],failedInputs=[],artifact=run+'/artifacts';await fs.mkdir(artifact,{recursive:true});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});let active=null,calls=0;
 try{if(classificationRejected)rows.push({brand:'dior',country:'KR',parentModel:'',variantCode:'RUN',price:null,currency:'KRW',status:`CLASSIFICATION_REJECTED_${classificationRejected}`,officialUrl:cfg.entryUrl});for(const product of inputs){active=product;
  const candidates=diorUnfailedImages(product,failedKeys);if(!candidates.length)throw Error('DIOR_NO_NEW_IMAGE_INPUT');
  product.sourceImageUrl=candidates[0];const reused=await reusePreparedImage(root,run,artifact,product,cfg);
  let image=reused,last;
  if(!image)for(const candidate of candidates){
   product.sourceImageUrl=candidate;
   try{image=await downloadAndOptimizeImage({request:{get:async(url,options)=>{if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');return context.get(url,options);}}},candidate,artifact,product.normalizedCode);break;}
   catch(e){if(!diorOrdinaryImageFailure(e.message))throw e;last=e;const item={code:product.normalizedCode,sourceImageUrl:originalImageUrl(candidate,product.normalizedCode),key:diorImageInputKey(product),failureCode:e.message};failedKeys.add(item.key);failedInputs.push(item);await fs.writeFile(artifact+'/image-failed-inputs.json',JSON.stringify(failedInputs),{mode:0o600});}
  }
  if(!image)throw last??Error('DIOR_NO_QUALITY_APPROVED_IMAGES');
  if(reused)rows.push({brand:'dior',country:'KR',parentModel:'검증된 로컬 원본과 누끼 재사용',variantCode:product.normalizedCode,price:product.price,currency:'KRW',status:'IMAGE_PREPARED_CACHE_REUSED',officialUrl:product.officialUrl});
  records.push({...product,...image});rows.push({brand:'dior',country:'KR',parentModel:product.productName,variantCode:product.normalizedCode,price:product.price,currency:'KRW',status:'REFERENCE_IMAGE_READY',officialUrl:product.officialUrl});
  await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
 }}catch(e){if(['IMAGE_BYTE_LIMIT','MASK_RANGE'].includes(e.message)&&active)await fs.writeFile(artifact+'/image-failure-input.json',JSON.stringify({code:active.normalizedCode,sourceImageUrl:originalImageUrl(active.sourceImageUrl,active.normalizedCode),imageProcessingVersion:IMAGE_PROCESSING_VERSION,key:diorImageInputKey(active),failureCode:e.message}),{mode:0o600});rows.push({brand:'dior',country:'KR',parentModel:'',variantCode:active?.normalizedCode??'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'IMAGE_RECOVERY_FAILED',officialUrl:active?.officialUrl??cfg.entryUrl});process.exitCode=1;}
 finally{await fs.writeFile(artifact+'/records.json',JSON.stringify(records),{mode:0o600});await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});await closeImageProcessor();await context.dispose();}
}
