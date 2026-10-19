import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream,createWriteStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {finished} from 'node:stream/promises';
import sharp from 'sharp';
import {celineOriginalImageUrl} from './celine-image-url.js';
import {bulgariOriginalImageUrl} from './bulgari-image-url.js';
import {hermesOriginalImageUrl} from './hermes-image-url.js';
import {diorCutoutQuality} from './dior-image-quality.js';
import {verifiedDiorOwnImage} from './dior-own-image.js';
import {registeredPriceOnly} from './registered-maintenance.js';

const root=path.resolve(import.meta.dirname,'../..');
export const IMAGE_PROCESSING_VERSION='original-cutout-v1';
let inputStream,outputStream,lines,waiting,ready,closed=false;
let jobQueue=Promise.resolve();
export function originalImageUrl(imageUrl,expectedCode,sourceProperties){
 const url=new URL(imageUrl);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('IMAGE_URL');
 if(['www.prada.com','wsp-cdn.pradagroup.net'].includes(url.hostname)){
  if(url.hostname==='www.prada.com'&&!url.pathname.startsWith('/content/dam/'))throw Error('IMAGE_SOURCE_PATH');
  if(url.hostname==='wsp-cdn.pradagroup.net'&&!/\.(jpg|jpeg|png|webp)$/i.test(url.pathname))throw Error('IMAGE_SOURCE_PATH');
  url.pathname=url.pathname.replace(/\/(?:_jcr_content|jcr:content)\/renditions\/.*$/,'');
  url.search='';
 }else if(url.hostname==='bottega-veneta.dam.kering.com'){
  if(!/^\/asset\/[a-f0-9-]{36}\/eCom\/[A-Z0-9]{15}_[A-Z0-9_]+\.(?:jpg|jpeg|png)$/i.test(url.pathname)&&!/^\/m\/[a-f0-9]{12,32}\/eCom-[A-Z0-9]{15}_[A-Z0-9_]+\.(?:jpg|jpeg|png)$/i.test(url.pathname))throw Error('IMAGE_SOURCE_PATH');
  // Retain only the official asset revision; remove transformation parameters.
  const revision=url.searchParams.get('v');url.search='';
  if(revision&&/^\d{1,6}$/.test(revision))url.searchParams.set('v',revision);
 }else if(url.hostname==='www.vancleefarpels.com'){
  if(!/^\/content\/dam\/rcq\/vca\/.+\.(png|jpg|jpeg)$/i.test(url.pathname))throw Error('IMAGE_SOURCE_PATH');
  url.search='';
 }else if(url.hostname==='media.rolex.com'){
  const match=url.pathname.match(/^\/image\/upload\/(?:[^/]+\/)*?(v\d+\/[a-f0-9]+\/catalogue\/\d{4}\/upright-c\/m[0-9a-z]+-\d+)$/i);
  if(!match||!expectedCode||match[1].split('/').at(-1).replace(/[^a-z0-9]/gi,'').toUpperCase()!==expectedCode)throw Error('IMAGE_SOURCE_PATH');
  url.pathname=`/image/upload/${match[1]}`;url.search='';
 }else if(url.hostname==='assets.christiandior.com'){
  const asset=url.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)(?:_SBG)?_E\d{2}(?:-\d+)?$/);
  if((!asset||!expectedCode||asset[1]!==expectedCode)&&!verifiedDiorOwnImage(imageUrl,expectedCode,sourceProperties?.diorOwnImageProof))throw Error('IMAGE_SOURCE_PATH');
  // Native asset identity; never invent a different view. Transform and URL
  // fragment aliases must not create distinct retry identities.
  url.search='';url.hash='';
 }else if(url.hostname==='kr.louisvuitton.com'){
  const image=decodeURIComponent(url.pathname).match(/^\/images\/is\/image\/lv\/1\/PP_VP_L\/[^/]+--([A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})_[^/]+\.(?:jpg|jpeg|png)$/i);
  if(!image||image[1].toUpperCase()!==expectedCode||url.search||url.hash)throw Error('IMAGE_SOURCE_PATH');
  // Preserve the exact sitemap-published asset/view. Do not substitute a view,
  // synthesize an asset name or request resized/cropped URL parameters.
 }else if(url.hostname==='assets.hermes.com'){
  return hermesOriginalImageUrl(imageUrl,expectedCode,[imageUrl],sourceProperties);
 }else if(url.hostname==='www.bulgari.com'){
  return bulgariOriginalImageUrl(imageUrl);
 }else if(url.hostname==='image.celine.com'){
  return celineOriginalImageUrl(imageUrl,expectedCode);
 }else if(!['www.chanel.com','puls-img.chanel.com'].includes(url.hostname))throw Error('IMAGE_SOURCE_HOST');
 return url.href;
}
function receive(){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiting=null;inputStream?.destroy();outputStream?.destroy();reject(Error('OFFLINE_IMAGE_TIMEOUT'));},90000);
  waiting={resolve:value=>{clearTimeout(timer);waiting=null;resolve(value);},reject:error=>{clearTimeout(timer);waiting=null;reject(error);}};
 });
}
function startWorker(){
 if(ready)return ready;
 ready=initializeWorker();
 return ready;
}
async function initializeWorker(){
 if(closed||process.platform!=='darwin'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('IMAGE_SANDBOX_REQUIRED');
 const run=process.env.CRAWL_RUN_DIR;
 if(!run)throw Error('IMAGE_RUNTIME_UNAVAILABLE');
 const inputFile=path.join(run,'cutout-input.fifo'),outputFile=path.join(run,'cutout-output.fifo');
 for(const file of [inputFile,outputFile])if(!(await fs.lstat(file)).isFIFO())throw Error('IMAGE_IPC_REQUIRED');
 const promise=receive();
 inputStream=createWriteStream(inputFile);outputStream=createReadStream(outputFile);
 lines=createInterface({input:outputStream});
 lines.on('line',line=>{if(line.length>200){waiting?.reject(Error('IMAGE_WORKER_OUTPUT_LIMIT'));inputStream.destroy();return;}try{waiting?.resolve(JSON.parse(line));}catch{waiting?.reject(Error('IMAGE_WORKER_OUTPUT'));}});
 inputStream.on('error',()=>waiting?.reject(Error('IMAGE_RUNTIME_UNAVAILABLE')));
 outputStream.on('error',()=>waiting?.reject(Error('IMAGE_RUNTIME_UNAVAILABLE')));
 outputStream.on('end',()=>{if(!closed)waiting?.reject(Error('IMAGE_WORKER_STOPPED'));});
 const result=await promise;
 if(result.ready!==true)throw Error('IMAGE_RUNTIME_FAILED');
}
export async function closeImageProcessor(){
 closed=true;
 if(!inputStream)return;
 // Flush and close the input FIFO before exiting so the CPU worker returns EOF.
 // A pending FIFO read cannot be cancelled by destroy()/process.exit().
 inputStream.end();
 await finished(inputStream).catch(()=>{});
 await finished(outputStream).catch(()=>{});
 lines?.close();
}
export async function downloadAndOptimizeImage(context,imageUrl,artifactDir,expectedCode,sourceProperties){
 // Scheduled existing references are price-only. This is deliberately before
 // worker startup, image URL processing and any image HTTP request.
 if(registeredPriceOnly(expectedCode))return {maintenancePriceOnly:true};
 await startWorker();
 const sourceImageUrl=originalImageUrl(imageUrl,expectedCode,sourceProperties);
 const isDiorSource=new URL(sourceImageUrl).hostname==='assets.christiandior.com';
 let response;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await context.request.get(sourceImageUrl,{timeout:30000,maxRedirects:0});break;}
  catch(error){const timeout=/timeout/i.test(error.message??''),reset=/ECONNRESET|socket hang up|connection reset|socket disconnected/i.test(error.message??'');if(!isDiorSource&&(timeout||reset)&&attempt<2)continue;throw Error(timeout?'IMAGE_NETWORK_TIMEOUT':reset?'IMAGE_NETWORK_RESET':'IMAGE_REQUEST_FAILED');}
 }
 if([403,429].includes(response.status()))throw Error('IMAGE_ACCESS_BLOCKED');
 if(!response.ok()||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers()['content-type']??''))throw Error('IMAGE_DOWNLOAD_FAILED');
 const source=await response.body();
 if(source.length>12*1024*1024)throw Error('IMAGE_BYTE_LIMIT');
 let metadata;try{metadata=await sharp(source,{limitInputPixels:24000000}).metadata();}catch(error){throw Error(/pixel.*limit/i.test(error.message??'')?'IMAGE_PIXEL_LIMIT':'IMAGE_FORMAT_INVALID');}
 if(!metadata.width||!metadata.height||Math.min(metadata.width,metadata.height)<200)throw Error('IMAGE_PIXEL_LIMIT');
 if(new URL(sourceImageUrl).hostname==='assets.hermes.com'){
  // Scene7's published `size` query is not a native pixel-size assertion.
  // Compare the downloaded catalog asset with its independently fetched props.
  if(!sourceProperties?.dimensionsVerified||metadata.width!==sourceProperties.width||metadata.height!==sourceProperties.height)throw Error('IMAGE_NATIVE_SIZE_MISMATCH');
 }
 const id=crypto.randomUUID(),input=path.join(artifactDir,`${id}-original.image`),temp=path.join(artifactDir,`${id}-cutout.webp`);
 await fs.writeFile(input,source,{mode:0o600});
 let personCheck=null;
 const job=jobQueue.then(async()=>{
  const resultPromise=receive();
  inputStream.write(JSON.stringify({input,output:temp,...(new URL(sourceImageUrl).hostname==='assets.christiandior.com'?{qualityMode:'dior-catalog-v2'}:{})})+'\n');
  const result=await resultPromise;
  if(!result.ok)throw Error(result.code??'IMAGE_MASK_FAILED');
  personCheck=result.personCheck??null;
  if(new URL(sourceImageUrl).hostname==='assets.christiandior.com'&&personCheck?.detected!==false)throw Error('DIOR_PERSON_CHECK_UNAVAILABLE');
 });
 jobQueue=job.catch(()=>{});
 await job;
 const output=await fs.readFile(temp),info=await sharp(output).metadata();
 if(info.width!==960||info.height!==960||!info.hasAlpha||output.length>4*1024*1024)throw Error('IMAGE_OUTPUT_INVALID');
 const diorQuality=new URL(sourceImageUrl).hostname==='assets.christiandior.com'?{...await diorCutoutQuality(output),personCheck}:null;
 if(diorQuality&&!diorQuality.passed)throw Error('DIOR_IMAGE_QUALITY_REJECTED');
 const sha256=crypto.createHash('sha256').update(output).digest('hex'),outputPath=path.join(artifactDir,`${sha256}.webp`);
 await fs.rename(temp,outputPath);
 const imageProof={schema:1,originalSourceVerified:true,cpuOfflineVerified:true,outputVerified:true,processingVersion:IMAGE_PROCESSING_VERSION,sourceUrl:sourceImageUrl,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),sourceWidth:metadata.width,sourceHeight:metadata.height,sha256,width:info.width,height:info.height,hasAlpha:info.hasAlpha,...(diorQuality?{diorQuality:{...diorQuality,processingRevision:'dior-catalog-v2'}}:{})};
 return {sourceImageUrl,imagePath:outputPath,imageSha256:sha256,imageMimeType:'image/webp',imageWidth:960,imageHeight:960,imageBytes:output.length,imageProcessingVersion:IMAGE_PROCESSING_VERSION,originalImagePath:input,imageProof};
}
