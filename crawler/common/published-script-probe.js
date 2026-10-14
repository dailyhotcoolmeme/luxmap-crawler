import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {decodeHtml} from './prada-product.js';

const projectRoot=path.resolve(import.meta.dirname,'../..');
const rules={hermes:{host:'www.hermes.com',locale:'/kr/ko/',sources:['20261014T152003Z-93283','20261014T150529Z-85321'],script:/^\/kr\/ko\/[A-Za-z0-9._-]+\.js$/},'saint-laurent':{host:'www.ysl.com',locale:'/ko-kr/',sources:['20261014T150857Z-87035'],script:/^\/_next\/static\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9._-]+\.js$/}};
const safeCode=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:'SCRIPT_PROBE_FAILED';
export function validatePublishedScriptUrl(raw,brand){
 const rule=rules[brand];let u;try{u=new URL(raw);}catch{throw Error('UNAUTHORIZED_SCRIPT_URL');}
 if(!rule||typeof raw!=='string'||raw.length>500||u.href!==raw||u.origin!==`https://${rule.host}`||u.username||u.password||u.search||u.hash||!rule.script.test(u.pathname)||/auth|token|session|captcha|challenge|tracking|analytics/i.test(u.pathname))throw Error('UNAUTHORIZED_SCRIPT_URL');return raw;
}
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decodeHtml(m[2]??m[3])]));
export function publishedScriptProvenance(html,target,brand,sourceUrls){
 validatePublishedScriptUrl(target,brand);if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_FILE_LIMIT');
 const rule=rules[brand],markup=html.replace(/<!--[\s\S]*?-->/g,'');
 if(!/<html\b/i.test(markup)||/<(?:urlset|sitemapindex)\b/i.test(markup)||/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human/i.test(markup))return null;
 const clean=markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const canonicals=[...clean.matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>a.rel?.split(/\s+/).includes('canonical')).map(a=>a.href);
 if(canonicals.length!==1||!sourceUrls.includes(canonicals[0]))return null;
 let canonical;try{canonical=new URL(canonicals[0]);}catch{return null;}
 if(canonical.origin!==`https://${rule.host}`||!canonical.pathname.startsWith(rule.locale)||canonical.username||canonical.password||canonical.hash)return null;
 for(const m of markup.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)){
  const raw=attrs(m[1]).src;if(!raw||/[\\\s{}<>$]/.test(raw)||raw.startsWith('//'))continue;
  const rooted=raw.startsWith('/');if(!rooted&&!raw.startsWith(`https://${rule.host}/`))continue;
  // Ignore document base elements; root-relative sources use the known origin.
  let resolved;try{resolved=new URL(raw,`https://${rule.host}/`).href;}catch{continue;}
  if(resolved===target)return rooted?'PUBLISHED_ROOT_SCRIPT':'PUBLISHED_ABSOLUTE_SCRIPT';
 }return null;
}
function proxyUrl(raw){let u;try{u=new URL(raw);}catch{throw Error('PROXY_GUARD_REQUIRED');}if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('PROXY_GUARD_REQUIRED');return u;}
function checkResponse(status,headers,limit){
 if([401,403,429].includes(status))throw Error('ACCESS_BLOCKED');if(status>=300&&status<400)throw Error('SCRIPT_REDIRECT_BLOCKED');if(status!==200)throw Error('SCRIPT_HTTP_FAILED');
 if(!/^(?:application\/(?:javascript|x-javascript|ecmascript)|text\/(?:javascript|ecmascript))(?:\s*;|$)/i.test(headers['content-type']??''))throw Error('NON_JAVASCRIPT_RESPONSE');
 if(headers['content-encoding']&&headers['content-encoding']!=='identity')throw Error('SCRIPT_ENCODING_UNSUPPORTED');
 const n=headers['content-length'];if(n!==undefined&&(!/^\d+$/.test(String(n))||Number(n)>limit))throw Error('SCRIPT_RESPONSE_LIMIT');
}
async function requestScript(url,{proxy,maxBytes,timeoutMs}){
 const p=proxyUrl(proxy),host=new URL(url).hostname,agent=new https.Agent({keepAlive:false}),owned=new Set();let deadline;
 agent.createConnection=(_options,callback)=>{
  let called=false;const done=(e,s)=>{if(called)return;called=true;callback(e,s);};
  const tunnel=http.request({hostname:p.hostname.replace(/^\[|\]$/g,''),port:p.port,method:'CONNECT',path:`${host}:443`,headers:{host:`${host}:443`}});owned.add(tunnel);
  tunnel.setTimeout(timeoutMs,()=>tunnel.destroy(Error('SCRIPT_TIMEOUT')));tunnel.once('error',done);
  tunnel.once('connect',(response,socket,head)=>{owned.add(socket);if(response.statusCode!==200||head.length){socket.destroy();done(Error('PROXY_CONNECT_FAILED'));return;}
   const secure=tls.connect({socket,servername:host,rejectUnauthorized:true});owned.add(secure);secure.setTimeout(timeoutMs,()=>secure.destroy(Error('SCRIPT_TIMEOUT')));secure.once('error',done);secure.once('secureConnect',()=>{secure.removeListener('error',done);done(null,secure);});
  });tunnel.end();
 };
 try{return await new Promise((resolve,reject)=>{
  const request=https.get(url,{agent,headers:{accept:'application/javascript, text/javascript','accept-encoding':'identity'}},response=>{
   try{checkResponse(response.statusCode,response.headers,maxBytes);}catch(e){response.destroy();reject(e);return;}
   let bytes=0,failed=false;const chunks=[];
   response.on('data',chunk=>{if(failed)return;bytes+=chunk.length;if(bytes>maxBytes){failed=true;response.destroy();reject(Error('SCRIPT_RESPONSE_LIMIT'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('aborted',()=>reject(Error('SCRIPT_RESPONSE_ABORTED')));response.on('end',()=>{if(!failed)resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)});});
  });owned.add(request);request.on('error',reject);request.setTimeout(timeoutMs,()=>request.destroy(Error('SCRIPT_TIMEOUT')));
  deadline=setTimeout(()=>{reject(Error('SCRIPT_TIMEOUT'));for(const item of owned)item.destroy();},timeoutMs);
 });}finally{clearTimeout(deadline);for(const item of owned)item.destroy();agent.destroy();}
}
export async function probePublishedScript(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2),root=options.root??projectRoot,brand=env.CRAWL_BRAND,rule=rules[brand];
 if(!rule||env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_RUN_REQUIRED');proxyUrl(env.LUXURY_NETWORK_PROXY);
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('PREFLIGHT_FAILED');
 const chunk=args[2]==='--probe-product-chunk';
 if(args.length!==7||args[0]!=='--country-config'||!['--probe-published-script','--probe-product-chunk'].includes(args[2])||args[3]!=='--source-run'||args[5]!=='--script-url'||chunk&&brand!=='hermes')throw Error('INVALID_PROBE_ARGS');
 const target=validatePublishedScriptUrl(args[6],brand),cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8'));
 if(cfg.brand!==brand||cfg.country!=='KR'||cfg.currency!=='KRW'||cfg.localePrefix!==rule.locale||!Array.isArray(cfg.allowedHosts)||!cfg.allowedHosts.includes(rule.host)||!Number.isSafeInteger(cfg.maxResponseBytes)||cfg.maxResponseBytes<1||cfg.maxResponseBytes>8388608||!Number.isSafeInteger(cfg.maxRequestsPerRun)||cfg.maxRequestsPerRun<1)throw Error('CONFIG_INVALID');
 const base=path.join(root,'crawler/runs',brand,'kr'),source=path.resolve(args[4]),run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(!rule.sources.some(id=>source===path.join(base,id))||!run.startsWith(base+path.sep)||run===source||run.startsWith(source+path.sep))throw Error('RUN_SCOPE_INVALID');
 for(const dir of [run,source])if(await fs.realpath(dir)!==dir)throw Error('RUN_SCOPE_INVALID');
 // Never fetch into a prior run; coordinator must allocate a fresh directory.
 for(const name of ['summary.json','failure.json'])try{await fs.lstat(path.join(run,name));throw Error('PROBE_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const rows=[];let requests=0,bytes=0,failureCode=null,provenance=null;
 const add=status=>rows.push({brand,country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'',status,officialUrl:target});
 try{
  const m=path.basename(source).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/),stamp=Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`),age=(options.now?.()??Date.now())-stamp;
  if(!Number.isFinite(age)||age<0||age>86400000)throw Error('SOURCE_STALE');
  const summary=path.join(source,'summary.json'),stat=await fs.lstat(summary);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('SOURCE_SUMMARY_INVALID');
  if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('SOURCE_SUMMARY_GUARD_FAILED');
  const prior=JSON.parse(await fs.readFile(summary,'utf8'));
  const urls=prior.filter(r=>r.brand===brand&&r.country==='KR'&&(['PUBLISHED_BAG_LIST_VISITED','PUBLISHED_BAG_LINK','SCHEMA_OFFER','SCHEMA_OFFER_CURRENCY_MISSING'].includes(r.status)||/^LISTING_LINKS_\d+$/.test(r.status))).map(r=>r.officialUrl).filter(raw=>{try{const u=new URL(raw);return u.origin===`https://${rule.host}`&&u.pathname.startsWith(rule.locale)&&!u.username&&!u.password&&!u.hash;}catch{return false;}});
  if(!urls.length)throw Error('PRIOR_SOURCE_PROOF_MISSING');
  const folder=path.join(source,'raw');if(await fs.realpath(folder)!==folder)throw Error('RAW_SCOPE_INVALID');const names=(await fs.readdir(folder)).filter(n=>/^\d+\.source$/.test(n));if(!names.length||names.length>100)throw Error('SOURCE_FILE_LIMIT');let total=0;
  let chunkSources;
  if(chunk){
   if(source!==path.join(base,'20261014T152003Z-93283'))throw Error('CHUNK_SOURCE_SCOPE');
   const readScript=async(id,url)=>{
    const dir=path.join(base,id);if(await fs.realpath(dir)!==dir)throw Error('CHUNK_SOURCE_SCOPE');
    const proof=path.join(dir,'summary.json'),p=await fs.lstat(proof);
    if(!p.isFile()||p.isSymbolicLink()||p.size>32768||spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[proof],{stdio:'ignore'}).status!==0)throw Error('CHUNK_SOURCE_GUARD');
    if(!JSON.parse(await fs.readFile(proof,'utf8')).some(r=>r.brand==='hermes'&&r.country==='KR'&&r.status==='SCRIPT_FETCH_HTTP_200'&&r.officialUrl===url))throw Error('CHUNK_SOURCE_PROOF');
    const file=path.join(dir,'raw/published-script.source'),s=await fs.lstat(file);
    if(!s.isFile()||s.isSymbolicLink()||await fs.realpath(file)!==file||s.size>8388608)throw Error('CHUNK_SOURCE_LIMIT');
    try{await fs.chmod(file,0o600);return await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}
   };
   chunkSources={main:await readScript('20261014T163806Z-77800','https://www.hermes.com/kr/ko/main.512d3bc35b6ae972.js'),runtime:await readScript('20261014T165050Z-85419','https://www.hermes.com/kr/ko/runtime.d9db7c0cd2a87d6b.js')};
  }
  for(const name of names){const file=path.join(folder,name),s=await fs.lstat(file);total+=s.size;if(!s.isFile()||s.isSymbolicLink()||s.size>8388608||total>67108864)throw Error('SOURCE_FILE_LIMIT');let html;
   try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}
   if(chunk){
    const {validateHermesProductChunk}=await import('./hermes-product-chunk-proof.js');
    if(validateHermesProductChunk(html,chunkSources.main,chunkSources.runtime,target))provenance='PUBLISHED_PRODUCT_CHUNK';
   }else provenance??=publishedScriptProvenance(html,target,brand,urls);
  }
  if(!provenance)throw Error('PUBLISHED_SCRIPT_PROOF_MISSING');
  const out=path.join(run,'raw');await fs.mkdir(out,{recursive:true,mode:0o700});if(await fs.realpath(out)!==out)throw Error('RAW_SCOPE_INVALID');const destination=path.join(out,'published-script.source');
  try{await fs.lstat(destination);throw Error('PROBE_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  requests=1;const response=await(options.transport??requestScript)(target,{proxy:env.LUXURY_NETWORK_PROXY,maxBytes:cfg.maxResponseBytes,timeoutMs:30000});checkResponse(response.status,response.headers,cfg.maxResponseBytes);
  if(!Buffer.isBuffer(response.body)||response.body.length>cfg.maxResponseBytes)throw Error('SCRIPT_RESPONSE_LIMIT');if(!response.body.length)throw Error('EMPTY_SCRIPT_RESPONSE');
  await fs.writeFile(destination,response.body,{mode:0o600,flag:'wx'});bytes=response.body.length;add(provenance);add('SCRIPT_FETCH_HTTP_200');add(`SCRIPT_BYTES_${bytes}`);
 }catch(e){failureCode=safeCode(e);add(failureCode);}
 const output=path.join(run,'summary.json');await fs.writeFile(output,JSON.stringify(rows),{mode:0o600,flag:'wx'});if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[output],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
 if(failureCode)await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode}),{mode:0o600,flag:'wx'});
 if(!options.env)process.exitCode=failureCode?(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD/.test(failureCode)?78:1):0;
 return {requests,bytes,provenance,failureCode};
}
