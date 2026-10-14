import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {downloadAndOptimizeImage,closeImageProcessor,originalImageUrl} from './image-processor.js';
import {inspectHermesImageUrl,hermesImagePropertiesUrl} from './hermes-image-url.js';
import {parseHermesImageProperties} from './hermes-image-properties-probe.js';

export async function refreshImages(config,file){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||config.country!=='KR')throw Error('IMAGE_REFRESH_GUARD');
 const run=process.env.CRAWL_RUN_DIR,brand=process.env.CRAWL_BRAND;
 const targets=JSON.parse(await fs.readFile(file,'utf8'));
 if(!Array.isArray(targets)||!targets.length||targets.length>25||new Set(targets.map(t=>t.mediaId)).size!==targets.length)throw Error('IMAGE_BATCH_LIMIT');
 for(const row of targets){
  if(row.brand!==brand||row.country!=='KR'||!/^[A-Z0-9]+$/.test(row.normalizedCode)||!/^[-a-z0-9]+$/.test(row.modelKey)||![row.mediaId,row.variantId].every(id=>/^[0-9a-f-]{36}$/.test(id))||!/^[a-f0-9]{64}$/.test(row.priorSha)||!row.priorKey.startsWith(`products/${brand}/`))throw Error('IMAGE_REFERENCE');
  const source=new URL(brand==='hermes'?inspectHermesImageUrl(row.sourceImageUrl,row.normalizedCode).url:originalImageUrl(row.sourceImageUrl)),official=new URL(row.officialUrl);
  if(!config.allowedHosts.includes(source.hostname)||official.hostname!==`www.${brand}.com`||!official.pathname.startsWith(config.referenceDetailPrefix??config.localePrefix+'product/'))throw Error('IMAGE_REFERENCE_URL');
  if(brand==='prada'&&!source.pathname.replace(/[^A-Z0-9]/gi,'').toUpperCase().includes(row.normalizedCode))throw Error('IMAGE_SKU_MISMATCH');
 }
 const artifacts=path.join(run,'artifacts');await fs.mkdir(artifacts,{recursive:true});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY}});
 const records=[],summary=[];
 const status=(row,value)=>({brand,country:'KR',parentModel:row.parentModel,variantCode:row.normalizedCode,price:null,currency:'KRW',status:value,officialUrl:row.officialUrl});
 async function processImage(row){
  let properties;
  if(brand==='hermes'){
   const propertiesUrl=hermesImagePropertiesUrl(row.sourceImageUrl,row.normalizedCode,[row.sourceImageUrl]),response=await context.get(propertiesUrl,{maxRedirects:0,timeout:30000});
   if([401,403,429].includes(response.status()))throw Error('IMAGE_ACCESS_BLOCKED');
   if(!response.ok()||!/(?:text\/plain|application\/json|javascript)/i.test(response.headers()['content-type']??''))throw Error('IMAGE_PROPERTIES_FAILED');
   const body=await response.body();if(body.length>65536)throw Error('METADATA_LIMIT');
   properties={...parseHermesImageProperties(body.toString('utf8')),propertiesUrl};
   await fs.writeFile(path.join(artifacts,row.normalizedCode+'-properties.source'),body,{mode:0o600});
  }
  return downloadAndOptimizeImage({request:context},row.sourceImageUrl,artifacts,row.normalizedCode,properties);
 }
 try{
  for(let offset=0;offset<targets.length;offset+=2){
   const batch=targets.slice(offset,offset+2);
   const results=await Promise.allSettled(batch.map(processImage));
   for(const[index,row]of batch.entries()){
    if(results[index].status!=='fulfilled')throw results[index].reason;
    records.push({...row,...results[index].value,checkedAt:new Date().toISOString()});
    summary.push(status(row,'IMAGE_PROCESSED'));
   }
   await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(summary));
  }
  await fs.writeFile(path.join(artifacts,'records.json'),JSON.stringify(records),{mode:0o600});
 }catch(error){
  summary.push(status(targets[records.length],String(error.message).match(/^[A-Z_]{1,40}$/)?.[0]??'IMAGE_REFRESH_FAILED'));
  for(const row of targets.slice(records.length+1))summary.push(status(row,'UNPROCESSED'));
  await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(summary));
  await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:'IMAGE_REFRESH_FAILED'}));
  throw Error('IMAGE_REFRESH_FAILED');
 }finally{await context.dispose();await closeImageProcessor();}
}
