#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');
const file=path.resolve(process.argv[2]),dir=path.dirname(file),run=path.dirname(dir);
const brand=process.env.LUXURY_INGEST_BRAND;
if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!['chanel','prada','hermes'].includes(brand))throw Error('IMAGE_STORAGE_GUARD');
const rows=JSON.parse(fs.readFileSync(file,'utf8'));
if(!rows.length||rows.length>25)throw Error('IMAGE_STORAGE_LIMIT');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function http(url,method,headers,body,output){
 const args=['--fail','--silent','--show-error','--max-time','60','--request',method,'--header','@-'];
 if(body!==undefined)args.push('--data-binary',body);
 if(output)args.push('--output',output);
 args.push(url);
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/curl',args,{stdio:['pipe','pipe','ignore']});
  let size=0;const chunks=[];
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('IMAGE_HTTP_TIMEOUT'));},65000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1048576){child.kill('SIGKILL');return;}chunks.push(chunk);});
  child.on('error',()=>{clearTimeout(timer);reject(Error('IMAGE_HTTP_FAILED'));});
  child.on('exit',code=>{clearTimeout(timer);if(code!==0||size>1048576)reject(Error('IMAGE_HTTP_FAILED'));else resolve(Buffer.concat(chunks).toString('utf8'));});
  child.stdin.on('error',()=>{});child.stdin.end(headers+'\n');
 });
}
const dbHeaders=`apikey: ${process.env.SUPABASE_SERVICE_ROLE_KEY}\nAuthorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}\nContent-Type: application/json\nPrefer: return=representation\nCache-Control: no-cache`;
const db=async(query,method='GET',body)=>JSON.parse(await http(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/product_media?${query}`,method,dbHeaders,body===undefined?undefined:JSON.stringify(body)));
const cfHeaders=`Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}\nContent-Type: image/webp\nCache-Control: public, max-age=31536000, immutable`;
const summary=rows.map(row=>({brand,country:'KR',parentModel:row.parentModel,variantCode:row.normalizedCode,price:null,currency:'KRW',status:'IMAGE_STORAGE_PENDING',officialUrl:row.officialUrl}));
const save=()=>{fs.writeFileSync(path.join(run,'summary.json'),JSON.stringify(summary));execFileSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(run,'summary.json')],{stdio:'ignore'});};
async function store(row,index){
 try{
  if(row.brand!==brand||row.country!=='KR'||row.imageProcessingVersion!=='original-cutout-v1'||path.dirname(path.resolve(row.imagePath))!==dir||!/^[A-Z0-9]+$/.test(row.normalizedCode)||!/^[-a-z0-9]+$/.test(row.modelKey)||!/^[a-f0-9]{64}$/.test(row.imageSha256)||!row.priorKey.startsWith(`products/${brand}/`))throw Error('IMAGE_STORAGE_REFERENCE');
  const buffer=fs.readFileSync(row.imagePath),meta=await sharp(buffer).metadata();
  if(hash(buffer)!==row.imageSha256||meta.width!==960||meta.height!==960||!meta.hasAlpha)throw Error('IMAGE_STORAGE_VALIDATION');
  const current=await db(`id=eq.${row.mediaId}&variant_id=eq.${row.variantId}`);
  if(current.length!==1)throw Error('IMAGE_MEDIA_REFERENCE');
  const objectKey=`products/${brand}/${row.modelKey}/${row.normalizedCode}/cutout-v1/${row.imageSha256}.webp`;
  if(current[0].sha256!==row.priorSha&&current[0].sha256!==row.imageSha256)throw Error('IMAGE_CONCURRENT_CHANGE');
  const storage=`https://api.cloudflare.com/client/v4/accounts/4c0f5d706177b84ade4d424a08ec46e8/r2/buckets/luxury-media/objects/${objectKey}`;
  await http(storage,'PUT',cfHeaders,`@${row.imagePath}`,path.join(dir,`${row.mediaId}-upload-response.json`));
  const verify=path.join(dir,`${row.mediaId}-verified.webp`);
  await http(storage,'GET',cfHeaders,undefined,verify);
  if(hash(fs.readFileSync(verify))!==row.imageSha256)throw Error('IMAGE_STORAGE_READBACK');
  await http(`https://luxury-assets.dailyhotcoolmeme.workers.dev/media/${objectKey}`,'GET','Cache-Control: no-cache',undefined,verify);
  if(hash(fs.readFileSync(verify))!==row.imageSha256)throw Error('IMAGE_PUBLIC_READBACK');
  const updated=await db(`id=eq.${row.mediaId}&variant_id=eq.${row.variantId}&sha256=eq.${current[0].sha256}`,'PATCH',{r2_object_key:objectKey,public_url:null,source_url:row.sourceImageUrl,sha256:row.imageSha256,mime_type:'image/webp',width:960,height:960,byte_size:buffer.length,source_checked_at:row.checkedAt});
  if(updated.length!==1)throw Error('IMAGE_DB_WRITE');
  const readback=await db(`id=eq.${row.mediaId}&variant_id=eq.${row.variantId}`);
  if(readback.length!==1||readback[0].r2_object_key!==objectKey||readback[0].sha256!==row.imageSha256||readback[0].is_primary!==row.isPrimary)throw Error('IMAGE_DB_READBACK');
  fs.unlinkSync(verify);
  summary[index].status='IMAGE_STORED_VERIFIED';save();
 }catch(error){summary[index].status=String(error.message).match(/^[A-Z_]{1,40}$/)?.[0]??'IMAGE_STORAGE_FAILED';save();throw Error('IMAGE_STORAGE_FAILED');}
}
try{
 for(let offset=0;offset<rows.length;offset+=2){
  const results=await Promise.allSettled(rows.slice(offset,offset+2).map((row,i)=>store(row,offset+i)));
  if(results.some(result=>result.status==='rejected'))throw Error('IMAGE_STORAGE_FAILED');
 }
}catch{
 console.error('FAILED: image storage halted; original retained');process.exitCode=1;
}
