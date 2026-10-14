import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {validateHermesProductApi} from './hermes-product-api-proof.js';
const root=path.resolve(import.meta.dirname,'../..');
const target='https://bck.hermes.com/product?productsku=H073428CKO5';
const host='bck.hermes.com';
const safeCode=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:/^[A-Z0-9_]{1,30}$/.test(e?.code??'')?`API_ERR_${e.code}`:'PRODUCT_API_PROBE_FAILED';
async function readPrivate(file,max=8388608){
 const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||await fs.realpath(file)!==file||s.size>max)throw Error('SOURCE_SCOPE_INVALID');
 try{await fs.chmod(file,0o600);return await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}
}
async function guarded(dir){
 if(await fs.realpath(dir)!==dir)throw Error('SOURCE_SCOPE_INVALID');
 const file=path.join(dir,'summary.json'),s=await fs.lstat(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>32768||spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw Error('SOURCE_SUMMARY_GUARD');
 return JSON.parse(await fs.readFile(file,'utf8'));
}
async function requestJson(proxy,maxBytes){
 let p;try{p=new URL(proxy);}catch{throw Error('PROXY_GUARD_REQUIRED');}
 if(p.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(p.hostname)||!p.port||p.username||p.password||p.search||p.hash||p.pathname!=='/')throw Error('PROXY_GUARD_REQUIRED');
 const agent=new https.Agent({keepAlive:false}),owned=new Set();let deadline;
 agent.createConnection=(_opts,callback)=>{
  let called=false;const done=(e,s)=>{if(called)return;called=true;callback(e,s);};
  const tunnel=http.request({hostname:p.hostname.replace(/^\[|\]$/g,''),port:p.port,method:'CONNECT',path:host+':443',headers:{host:host+':443'}});owned.add(tunnel);
  tunnel.on('error',done);tunnel.setTimeout(30000,()=>tunnel.destroy(Error('API_TIMEOUT')));
  tunnel.on('connect',(response,socket,head)=>{
   owned.add(socket);if(response.statusCode!==200||head.length){socket.destroy();done(Error('PROXY_CONNECT_FAILED'));return;}
   const secure=tls.connect({socket,servername:host,rejectUnauthorized:true});owned.add(secure);
   secure.once('error',done);secure.setTimeout(30000,()=>secure.destroy(Error('API_TIMEOUT')));
   secure.once('secureConnect',()=>{secure.removeListener('error',done);done(null,secure);});
  });tunnel.end();
 };
 try{return await new Promise((resolve,reject)=>{
  const req=https.get(target,{agent,headers:{accept:'application/json','accept-encoding':'identity'}},res=>{
   const fail=code=>{res.destroy();reject(Error(code));};
   if([401,403,429].includes(res.statusCode))return fail('ACCESS_BLOCKED');
   if(res.statusCode>=300&&res.statusCode<400)return fail('API_REDIRECT_BLOCKED');
   if(res.statusCode!==200)return fail(Number.isInteger(res.statusCode)?`API_HTTP_${res.statusCode}`:'API_HTTP_FAILED');
   if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(res.headers['content-type']??''))return fail('NON_JSON_RESPONSE');
   if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')return fail('API_ENCODING_UNSUPPORTED');
   if(res.headers['content-length']&&(!/^\d+$/.test(res.headers['content-length'])||Number(res.headers['content-length'])>maxBytes))return fail('API_RESPONSE_LIMIT');
   const chunks=[];let bytes=0,failed=false;
   res.on('data',part=>{if(failed)return;bytes+=part.length;if(bytes>maxBytes){failed=true;fail('API_RESPONSE_LIMIT');return;}chunks.push(part);});
   res.on('error',reject);res.on('aborted',()=>reject(Error('API_RESPONSE_ABORTED')));res.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});
  });owned.add(req);req.on('error',reject);req.setTimeout(30000,()=>req.destroy(Error('API_TIMEOUT')));
  deadline=setTimeout(()=>{reject(Error('API_TIMEOUT'));for(const item of owned)item.destroy();},30000);
 });}finally{clearTimeout(deadline);for(const item of owned)item.destroy();agent.destroy();}
}
// Exact-source, one-GET API diagnostic. No account, cookies, credentials,
// authorization headers, redirects, retries, guessed locale, ingest or UI writes.
export async function probeHermesProductApi(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2);
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='hermes')throw Error('GUARDED_RUN_REQUIRED');
 if(args.length!==3||args[0]!=='--country-config'||args[2]!=='--probe-product-api')throw Error('INVALID_PROBE_ARGS');
 if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('PREFLIGHT_FAILED');
 const cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8'));
 if(cfg.brand!=='hermes'||cfg.country!=='KR'||cfg.currency!=='KRW'||!cfg.allowedHosts?.includes(host)||!Number.isSafeInteger(cfg.maxResponseBytes)||cfg.maxResponseBytes<1||cfg.maxResponseBytes>8388608||!Number.isSafeInteger(cfg.maxRequestsPerRun)||cfg.maxRequestsPerRun<1)throw Error('CONFIG_INVALID');
 const base=path.join(root,'crawler/runs/hermes/kr'),run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(!run.startsWith(base+path.sep)||await fs.realpath(run)!==run)throw Error('RUN_SCOPE_INVALID');
 const rows=[],add=status=>rows.push({brand:'hermes',country:'KR',parentModel:'',variantCode:'H073428CKO5',price:null,currency:'',status,officialUrl:target});
 let failure=null,requests=0;
 try{
  const now=options.now?.()??Date.now(),age=now-Date.parse('2026-10-14T15:05:29Z');
  if(!Number.isFinite(age)||age<0||age>86400000)throw Error('SOURCE_STALE');
  const previous=(await fs.readdir(base)).filter(n=>/^\d{8}T\d{6}Z-\d+$/.test(n));if(previous.length>500)throw Error('PRIOR_RUN_LIMIT');
  let unknownAttempts=0;
  for(const id of previous){const dir=path.join(base,id);if(dir===run)continue;let exists;
   try{exists=await fs.lstat(path.join(dir,'summary.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(!exists.isFile()||exists.isSymbolicLink())throw Error('PRIOR_SOURCE_SCOPE');
   const old=await guarded(dir);
   // The central runner pre-creates raw/. Early versions failed mkdir before
   // entering transport. Preserve that failure, but never count it as a GET.
   if(old.some(r=>r.officialUrl===target&&r.status==='API_ERR_EEXIST')&&!old.some(r=>r.officialUrl===target&&r.status==='API_SOURCE_VALIDATED'))continue;
   if(old.some(r=>r.officialUrl===target&&r.status==='PRODUCT_API_PROBE_FAILED'))unknownAttempts++;
   if(old.some(r=>r.officialUrl===target&&/^(?:API_JSON_FETCHED|API_HTTP_|API_REDIRECT_|API_TIMEOUT|API_RESPONSE_|API_ERR_|ACCESS_BLOCKED|NON_JSON_RESPONSE|INVALID_JSON_RESPONSE|API_ENCODING_)/.test(r.status)))throw Error('API_PREVIOUS_ATTEMPT_NOT_RETRIED');
  }
  const guard=JSON.parse(await fs.readFile(path.join(root,'crawler/guardrails.json'),'utf8'));
  if(!Number.isSafeInteger(guard.limits?.maxRetriesPerUrl)||unknownAttempts>=Math.min(guard.limits.maxRetriesPerUrl,2))throw Error('API_PREVIOUS_ATTEMPT_NOT_RETRIED');
  const mainDir=path.join(base,'20261014T163806Z-77800'),mainProof=await guarded(mainDir);
  if(!mainProof.some(r=>r.brand==='hermes'&&r.status==='SCRIPT_FETCH_HTTP_200'&&r.officialUrl==='https://www.hermes.com/kr/ko/main.512d3bc35b6ae972.js'))throw Error('MAIN_SOURCE_PROOF_MISSING');
  const main=await readPrivate(path.join(mainDir,'raw/published-script.source'));
  const batch=path.join(base,'20261014T171137Z-4752');await guarded(batch);
  const dependencyDir=path.join(batch,'dependencies');if(await fs.realpath(dependencyDir)!==dependencyDir)throw Error('SOURCE_SCOPE_INVALID');
  const facades=[];let total=Buffer.byteLength(main);
  for(const name of (await fs.readdir(dependencyDir)).filter(n=>/^\d{3}$/.test(n))){
   const dir=path.join(dependencyDir,name),proof=await guarded(dir);
   if(!proof.some(r=>r.brand==='hermes'&&r.status==='SCRIPT_FETCH_HTTP_200')||!proof.some(r=>r.status==='PUBLISHED_PRODUCT_CHUNK'))throw Error('FACADE_SOURCE_PROOF_MISSING');
   const source=await readPrivate(path.join(dir,'raw/published-script.source'));total+=Buffer.byteLength(source);if(total>67108864)throw Error('SOURCE_TOTAL_LIMIT');facades.push(source);
  }
  if(!facades.length||facades.length>32)throw Error('SOURCE_FILE_LIMIT');
  let proven=false;
  for(const id of ['20261014T150529Z-85321','20261014T152003Z-93283']){
   const dir=path.join(base,id);await guarded(dir);const folder=path.join(dir,'raw');if(await fs.realpath(folder)!==folder)throw Error('SOURCE_SCOPE_INVALID');
   const names=(await fs.readdir(folder)).filter(n=>/^\d+\.source$/.test(n));if(names.length>100)throw Error('SOURCE_FILE_LIMIT');
   for(const name of names){const html=await readPrivate(path.join(folder,name));total+=Buffer.byteLength(html);if(total>67108864)throw Error('SOURCE_TOTAL_LIMIT');
    for(const facade of facades)if(validateHermesProductApi(html,main,facade,target))proven=true;
   }
  }
  if(!proven)throw Error('PRODUCT_API_SOURCE_PROOF_MISSING');
  const out=path.join(run,'raw');await fs.mkdir(out,{mode:0o700,recursive:true});if(await fs.realpath(out)!==out)throw Error('RAW_SCOPE_INVALID');
  const destination=path.join(out,'product-api.source');try{await fs.lstat(destination);throw Error('API_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  add('API_SOURCE_VALIDATED');if(unknownAttempts)add(`API_UNKNOWN_RETRY_${unknownAttempts}`);
  requests=1;const bytes=await (options.transport??requestJson)(env.LUXURY_NETWORK_PROXY,Math.min(cfg.maxResponseBytes,1048576));
  if(!Buffer.isBuffer(bytes)||bytes.length>Math.min(cfg.maxResponseBytes,1048576))throw Error('API_RESPONSE_LIMIT');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let data;try{data=JSON.parse(text);}catch{throw Error('INVALID_JSON_RESPONSE');}
  if(!data||typeof data!=='object')throw Error('INVALID_JSON_RESPONSE');
  await fs.writeFile(destination,bytes,{mode:0o600,flag:'wx'});
  add('API_JSON_FETCHED');add(`API_BYTES_${bytes.length}`);
 }catch(e){failure=safeCode(e);add(failure);}
 const summary=path.join(run,'summary.json');await fs.writeFile(summary,JSON.stringify(rows),{mode:0o600,flag:'wx'});
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
 if(failure)await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:failure}),{mode:0o600,flag:'wx'});
 if(!options.env)process.exitCode=failure?1:0;
 return {requests,failure};
}
