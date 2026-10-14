import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {inspectHermesImageUrl,hermesImagePropertiesUrl} from './hermes-image-url.js';

const projectRoot=path.resolve(import.meta.dirname,'../..');
const safeCode=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:'PROPERTIES_PROBE_FAILED';
const metadataTypes=/^(?:text\/plain|application\/(?:json|javascript|x-javascript)|text\/javascript)(?:;|$)/i;

// Strictly data parsing: no eval, Function, JSONP execution, arbitrary key/URL output.
export function parseHermesImageProperties(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw Error('METADATA_LIMIT');
 const values=new Map();
 const add=(key,value)=>{
  if(!['image.width','image.height','image.size'].includes(key))return;
  const serialized=String(value);
  if(values.has(key)&&values.get(key)!==serialized)throw Error('METADATA_CONFLICT');
  values.set(key,serialized);
 };
 if(text.trim().startsWith('{')){
  let data;try{data=JSON.parse(text);}catch{throw Error('METADATA_FORMAT');}
  if(!data||Array.isArray(data)||typeof data!=='object')throw Error('METADATA_FORMAT');
  for(const key of ['image.width','image.height','image.size'])if(Object.hasOwn(data,key))add(key,data[key]);
 }else{
  for(const line of text.split(/\r?\n/)){
   const m=line.trim().match(/^(image\.(?:width|height|size))\s*=\s*([^;]+);?$/);
   if(m)add(m[1],m[2].trim().replace(/^"([^"\\]*)"$/,'$1'));
  }
 }
 const integer=value=>/^\d{1,6}$/.test(value??'')&&Number(value)>0&&Number(value)<=100000?Number(value):null;
 let width=integer(values.get('image.width')),height=integer(values.get('image.height'));
 if(values.has('image.size')){
  const parts=values.get('image.size').match(/^(\d{1,6}),\s*(\d{1,6})$/);
  if(!parts)throw Error('METADATA_FORMAT');
  const w=integer(parts[1]),h=integer(parts[2]);
  if(!w||!h||width&&width!==w||height&&height!==h)throw Error('METADATA_CONFLICT');
  width=w;height=h;
 }
 return {width,height,dimensionsVerified:Boolean(width&&height),originalVerified:false};
}

// HTTPS through the central loopback proxy ONLY. No direct fallback or redirects.
// Stream response with a hard byte ceiling; refuse image MIME before reading body.
async function requestProperties(url,{proxy,maxBytes,timeoutMs}){
 const p=new URL(proxy);
 if(p.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(p.hostname)||p.username||p.password||p.search||p.hash||p.pathname!=='/')throw Error('PROXY_GUARD_REQUIRED');
 const agent=new https.Agent({keepAlive:false});let deadline;
 agent.createConnection=(_options,callback)=>{
  const tunnel=http.request({hostname:p.hostname,port:p.port||80,method:'CONNECT',path:'assets.hermes.com:443',headers:{host:'assets.hermes.com:443'}});
  tunnel.setTimeout(timeoutMs,()=>tunnel.destroy(Error('PROPERTIES_TIMEOUT')));
  tunnel.once('error',callback);
  tunnel.once('connect',(response,socket,head)=>{
   if(response.statusCode!==200||head.length){socket.destroy();callback(Error('PROXY_CONNECT_FAILED'));return;}
   const secure=tls.connect({socket,servername:'assets.hermes.com',rejectUnauthorized:true});
   secure.setTimeout(timeoutMs,()=>secure.destroy(Error('PROPERTIES_TIMEOUT')));
   secure.once('error',callback);secure.once('secureConnect',()=>{secure.removeListener('error',callback);callback(null,secure);});
  });
  tunnel.end();
 };
 try{return await new Promise((resolve,reject)=>{
  const request=https.get(url,{agent,headers:{accept:'text/plain, application/json, application/javascript','accept-encoding':'identity'}},response=>{
   const fail=code=>{response.destroy();reject(Error(code));};
   const status=response.statusCode;
   if([401,403,429].includes(status)){fail('ACCESS_BLOCKED');return;}
   if(status>=300&&status<400){fail('METADATA_REDIRECT_UNVERIFIED');return;}
   if(status!==200){fail(`HTTP_${status}`);return;}
   if(!metadataTypes.test(response.headers['content-type']??'')){fail('NON_METADATA_RESPONSE');return;}
   if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){fail('METADATA_ENCODING_UNSUPPORTED');return;}
   if(Number(response.headers['content-length']??0)>maxBytes){fail('METADATA_LIMIT');return;}
   const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){fail('METADATA_LIMIT');return;}chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve({status,headers:response.headers,body:Buffer.concat(chunks)}));
  });
  deadline=setTimeout(()=>request.destroy(Error('PROPERTIES_TIMEOUT')),timeoutMs);
  request.setTimeout(timeoutMs,()=>request.destroy(Error('PROPERTIES_TIMEOUT')));request.on('error',reject);
 });}finally{clearTimeout(deadline);agent.destroy();}
}

// Main wires --country-config <kr> --probe-image-properties --source-run <run> --sku <H...>.
// Injectable transport is for offline fixtures; this file never starts a run by import.
export async function probeHermesImageProperties(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2),root=options.root??projectRoot;
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='hermes'||!env.LUXURY_NETWORK_PROXY)throw Error('GUARDED_RUN_REQUIRED');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('PREFLIGHT_FAILED');
 if(args.length!==7||args[0]!=='--country-config'||args[2]!=='--probe-image-properties'||args[3]!=='--source-run'||args[5]!=='--sku'||!/^H[0-9]{6}[A-Z0-9]{4}$/.test(args[6]))throw Error('INVALID_PROBE_ARGS');
 const cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8')),sku=args[6];
 if(cfg.brand!=='hermes'||cfg.country!=='KR'||cfg.currency!=='KRW'||cfg.localePrefix!=='/kr/ko/'||!cfg.allowedHosts?.includes('assets.hermes.com')||!Number.isSafeInteger(cfg.maxResponseBytes)||cfg.maxResponseBytes<1||!Number.isSafeInteger(cfg.maxRequestsPerRun)||cfg.maxRequestsPerRun<1)throw Error('CONFIG_INVALID');
 const base=path.join(root,'crawler/runs/hermes/kr')+path.sep,run=path.resolve(env.CRAWL_RUN_DIR??''),source=path.resolve(args[4]);
 for(const dir of [run,source])if(!dir.startsWith(base)||await fs.realpath(dir)!==dir)throw Error('RUN_SCOPE_INVALID');
 if(run===source)throw Error('SEPARATE_PROBE_RUN_REQUIRED');
 const rows=[];let target='https://www.hermes.com/kr/ko/',result={originalVerified:false,requests:0},failure;
 const add=status=>rows.push({brand:'hermes',country:'KR',parentModel:'',variantCode:sku,price:null,currency:'KRW',status,officialUrl:target});
 try{
  const folder=path.join(source,'raw');if(await fs.realpath(folder)!==folder)throw Error('RAW_SCOPE_INVALID');
  const names=(await fs.readdir(folder)).filter(n=>/^\d+\.source$/.test(n));
  if(names.length>100)throw Error('SOURCE_FILE_LIMIT');
  let total=0;const published=new Set(),nativePublished=new Set();
  for(const name of names){
   const file=path.join(folder,name),stat=await fs.lstat(file);
   total+=stat.size;if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8388608||total>67108864)throw Error('SOURCE_FILE_LIMIT');
   let text;try{await fs.chmod(file,0o600);text=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
   text=text.replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
   if(!text.includes(sku))continue;
   for(const m of text.matchAll(/(?:https:)?\/\/assets\.hermes\.com\/[^\s"'<>\\]+/g)){
    // Standard URL serialization percent-encodes a published Unicode pathname;
    // it does not substitute the asset identifier, size or transformation.
    try{const image=inspectHermesImageUrl(new URL(m[0],'https://www.hermes.com').href,sku);if(image.view==='front'){if(image.nativeAsset)nativePublished.add(image.url);else if(image.renditionWidth===1000)published.add(image.url);}}catch{}
   }
  }
  if(nativePublished.size){published.clear();for(const url of nativePublished)published.add(url);}
  if(published.size!==1)throw Error(published.size?'PUBLISHED_SOURCE_AMBIGUOUS':'PUBLISHED_SOURCE_MISSING');
  target=hermesImagePropertiesUrl([...published][0],sku,[...published]);
  const url=new URL(target);if(url.origin!=='https://assets.hermes.com'||url.searchParams.get('req')!=='props')throw Error('UNAUTHORIZED_URL');
  add('PUBLISHED_PROPERTIES_REQUEST');result.requests=1;
  const maxBytes=Math.min(cfg.maxResponseBytes,65536);
  const response=await (options.transport??requestProperties)(target,{proxy:env.LUXURY_NETWORK_PROXY,maxBytes,timeoutMs:30000});
  if(response.status!==200)throw Error('METADATA_HTTP_FAILED');
  if(!metadataTypes.test(response.headers['content-type']??''))throw Error('NON_METADATA_RESPONSE');
  if(!Buffer.isBuffer(response.body)||response.body.length>maxBytes)throw Error('METADATA_LIMIT');
  const rawDir=path.join(run,'raw');await fs.mkdir(rawDir,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(rawDir,'image-properties.source'),response.body,{mode:0o600});
  const text=new TextDecoder('utf-8',{fatal:true}).decode(response.body);
  if(/<html|<!doctype|<script|captcha|access denied/i.test(text))throw Error('NON_METADATA_RESPONSE');
  const facts=parseHermesImageProperties(text);result={...result,...facts};
  add(facts.dimensionsVerified?`PROPS_IMAGE_SIZE_${facts.width}X${facts.height}`:'PROPS_DIMENSIONS_UNRESOLVED');
  // Even image.width/height describe this catalog identifier, not proof that its
  // named 1000px recipe is a master. No arbitrary response URL is promoted/output.
  add('ORIGINAL_SOURCE_NOT_PROVEN');
 }catch(error){failure=safeCode(error);add(failure);}
 finally{
  const file=path.join(run,'summary.json');await fs.writeFile(file,JSON.stringify(rows),{mode:0o600});
  if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
  if(failure)await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:failure}),{mode:0o600});
 }
 if(!options.env)process.exitCode=failure?(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD/.test(failure)?78:1):2;
 return {...result,failureCode:failure??null};
}
