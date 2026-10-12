import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream,createWriteStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {finished} from 'node:stream/promises';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'../..');
export const IMAGE_PROCESSING_VERSION='original-cutout-v1';
let inputStream,outputStream,lines,waiting,ready,closed=false;
export function originalImageUrl(imageUrl){
 const url=new URL(imageUrl);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('IMAGE_URL');
 if(url.hostname==='www.prada.com'){
  if(!url.pathname.startsWith('/content/dam/'))throw Error('IMAGE_SOURCE_PATH');
  url.pathname=url.pathname.replace(/\/(?:_jcr_content|jcr:content)\/renditions\/.*$/,'');
  url.search='';
 }else if(!['www.chanel.com','puls-img.chanel.com'].includes(url.hostname))throw Error('IMAGE_SOURCE_HOST');
 return url.href;
}
function receive(){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiting=null;inputStream?.destroy();outputStream?.destroy();reject(Error('OFFLINE_IMAGE_TIMEOUT'));},90000);
  waiting={resolve:value=>{clearTimeout(timer);waiting=null;resolve(value);},reject:error=>{clearTimeout(timer);waiting=null;reject(error);}};
 });
}
async function startWorker(){
 if(ready)return ready;
 if(closed||process.platform!=='darwin'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('IMAGE_SANDBOX_REQUIRED');
 const run=process.env.CRAWL_RUN_DIR;
 if(!run)throw Error('IMAGE_RUNTIME_UNAVAILABLE');
 const promise=receive();
 const inputFile=path.join(run,'cutout-input.fifo'),outputFile=path.join(run,'cutout-output.fifo');
 for(const file of [inputFile,outputFile])if(!(await fs.lstat(file)).isFIFO())throw Error('IMAGE_IPC_REQUIRED');
 inputStream=createWriteStream(inputFile);outputStream=createReadStream(outputFile);
 lines=createInterface({input:outputStream});
 lines.on('line',line=>{if(line.length>200){waiting?.reject(Error('IMAGE_WORKER_OUTPUT_LIMIT'));inputStream.destroy();return;}try{waiting?.resolve(JSON.parse(line));}catch{waiting?.reject(Error('IMAGE_WORKER_OUTPUT'));}});
 inputStream.on('error',()=>waiting?.reject(Error('IMAGE_RUNTIME_UNAVAILABLE')));
 outputStream.on('error',()=>waiting?.reject(Error('IMAGE_RUNTIME_UNAVAILABLE')));
 outputStream.on('end',()=>{if(!closed)waiting?.reject(Error('IMAGE_WORKER_STOPPED'));});
 ready=promise.then(result=>{if(result.ready!==true)throw Error('IMAGE_RUNTIME_FAILED');});
 return ready;
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
export async function downloadAndOptimizeImage(context,imageUrl,artifactDir){
 await startWorker();
 const sourceImageUrl=originalImageUrl(imageUrl);
 const response=await context.request.get(sourceImageUrl,{timeout:30000,maxRedirects:0});
 if(!response.ok()||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers()['content-type']??''))throw Error('IMAGE_DOWNLOAD_FAILED');
 const source=await response.body();
 if(source.length>12*1024*1024)throw Error('IMAGE_BYTE_LIMIT');
 const metadata=await sharp(source,{limitInputPixels:24000000}).metadata();
 if(!metadata.width||!metadata.height||Math.min(metadata.width,metadata.height)<200)throw Error('IMAGE_PIXEL_LIMIT');
 const id=crypto.randomUUID(),input=path.join(artifactDir,`${id}-original.image`),temp=path.join(artifactDir,`${id}-cutout.webp`);
 await fs.writeFile(input,source,{mode:0o600});
 const resultPromise=receive();
 inputStream.write(JSON.stringify({input,output:temp})+'\n');
 const result=await resultPromise;
 if(!result.ok)throw Error(result.code??'IMAGE_MASK_FAILED');
 const output=await fs.readFile(temp),info=await sharp(output).metadata();
 if(info.width!==960||info.height!==960||!info.hasAlpha||output.length>4*1024*1024)throw Error('IMAGE_OUTPUT_INVALID');
 const sha256=crypto.createHash('sha256').update(output).digest('hex'),outputPath=path.join(artifactDir,`${sha256}.webp`);
 await fs.rename(temp,outputPath);
 return {sourceImageUrl,imagePath:outputPath,imageSha256:sha256,imageMimeType:'image/webp',imageWidth:960,imageHeight:960,imageBytes:output.length,imageProcessingVersion:IMAGE_PROCESSING_VERSION,originalImagePath:input};
}
