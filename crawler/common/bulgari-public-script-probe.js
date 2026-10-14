import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {spawnSync} from 'node:child_process';
import {decodeHtml} from './prada-product.js';

const projectRoot=path.resolve(import.meta.dirname,'../..');
const sourceId='20261014T150952Z-87506';
const product='https://www.bulgari.com/ko-kr/323532.html';
const jsMime=/^(?:application\/(?:javascript|x-javascript|ecmascript)|text\/(?:javascript|ecmascript))(?:\s*;|$)/i;
const safeCode=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:'SCRIPT_PROBE_FAILED';
export function validateBulgariScriptUrl(raw){
 if(typeof raw!=='string'||raw.length>500||!/^https:\/\/www\.bulgari\.com\/mobify\/bundle\/\d+\/[A-Za-z0-9._-]+\.js$/.test(raw))throw Error('UNAUTHORIZED_SCRIPT_URL');
 const u=new URL(raw);if(u.href!==raw||u.search||u.hash||u.username||u.password||u.origin!=='https://www.bulgari.com')throw Error('UNAUTHORIZED_SCRIPT_URL');
 return raw;
}
function proxyUrl(raw){
 let u;try{u=new URL(raw);}catch{throw Error('PROXY_GUARD_REQUIRED');}
 if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('PROXY_GUARD_REQUIRED');return u;
}
export function hasPublishedBulgariScript(html,url){
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_FILE_LIMIT');
 validateBulgariScriptUrl(url);
 html=html.replace(/<!--[\s\S]*?-->/g,'');
 if(!/<html\b/i.test(html)||/<(?:urlset|sitemapindex)\b/i.test(html)||/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human/i.test(html))return false;
 const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decodeHtml(m[2]??m[3])]));
 const canonical=[...html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>a.rel?.split(/\s+/).includes('canonical')).map(a=>a.href);
 // The exact normal KR detail must publish the src itself, not merely another
 // page in the run, an inline string, a comment, or an invented relative path.
 if(canonical.length!==1||canonical[0]!==product)return false;
 const markup=html.replace(/<!--[\s\S]*?-->/g,'');
 return [...markup.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)].some(m=>attrs(m[1]).src===url);
}
function checkResponse(status,headers,maxBytes){
 if([401,403,429].includes(status))throw Error('ACCESS_BLOCKED');
 if(status>=300&&status<400)throw Error('SCRIPT_REDIRECT_BLOCKED');
 if(status!==200)throw Error('SCRIPT_HTTP_FAILED');
 if(!jsMime.test(headers['content-type']??''))throw Error('NON_JAVASCRIPT_RESPONSE');
 if(headers['content-encoding']&&headers['content-encoding']!=='identity')throw Error('SCRIPT_ENCODING_UNSUPPORTED');
 const length=headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>maxBytes))throw Error('SCRIPT_RESPONSE_LIMIT');
}
// One GET over a CONNECT tunnel to the central loopback proxy. Never direct,
// never redirects/retries, no browser/cookies/auth headers, no JS interpretation.
async function requestScript(url,{proxy,maxBytes,timeoutMs}){
 const p=proxyUrl(proxy),agent=new https.Agent({keepAlive:false});const owned=new Set();let deadline;
 agent.createConnection=(_options,callback)=>{
  let called=false;const done=(error,socket)=>{if(called)return;called=true;callback(error,socket);};
  const tunnel=http.request({hostname:p.hostname.replace(/^\[|\]$/g,''),port:p.port,method:'CONNECT',path:'www.bulgari.com:443',headers:{host:'www.bulgari.com:443'}});owned.add(tunnel);
  tunnel.setTimeout(timeoutMs,()=>tunnel.destroy(Error('SCRIPT_TIMEOUT')));tunnel.once('error',done);
  tunnel.once('connect',(response,socket,head)=>{
   owned.add(socket);if(response.statusCode!==200||head.length){socket.destroy();done(Error('PROXY_CONNECT_FAILED'));return;}
   const secure=tls.connect({socket,servername:'www.bulgari.com',rejectUnauthorized:true});owned.add(secure);
   secure.setTimeout(timeoutMs,()=>secure.destroy(Error('SCRIPT_TIMEOUT')));secure.once('error',done);
   secure.once('secureConnect',()=>{secure.removeListener('error',done);done(null,secure);});
  });tunnel.end();
 };
 try{return await new Promise((resolve,reject)=>{
  const request=https.get(url,{agent,headers:{accept:'application/javascript, text/javascript','accept-encoding':'identity'}},response=>{
   try{checkResponse(response.statusCode,response.headers,maxBytes);}catch(e){response.destroy();reject(e);return;}
   let size=0,failed=false;const chunks=[];
   response.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>maxBytes){failed=true;response.destroy();reject(Error('SCRIPT_RESPONSE_LIMIT'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('aborted',()=>reject(Error('SCRIPT_RESPONSE_ABORTED')));
   response.on('end',()=>{if(!failed)resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)});});
  });owned.add(request);request.on('error',reject);
  deadline=setTimeout(()=>{reject(Error('SCRIPT_TIMEOUT'));for(const item of owned)item.destroy();},timeoutMs);
  request.setTimeout(timeoutMs,()=>request.destroy(Error('SCRIPT_TIMEOUT')));
 });}finally{clearTimeout(deadline);for(const item of owned)item.destroy();agent.destroy();}
}

// Main owns CLI/entry/coordinator wiring. Test transport is injected offline only.
export async function probeBulgariPublicScript(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2),root=options.root??projectRoot;
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='bulgari')throw Error('GUARDED_RUN_REQUIRED');
 proxyUrl(env.LUXURY_NETWORK_PROXY);
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status!==0)throw Error('PREFLIGHT_FAILED');
 if(args.length!==7||args[0]!=='--country-config'||args[2]!=='--probe-published-script'||args[3]!=='--source-run'||args[5]!=='--script-url')throw Error('INVALID_PROBE_ARGS');
 const target=validateBulgariScriptUrl(args[6]),cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8'));
 if(cfg.brand!=='bulgari'||cfg.country!=='KR'||cfg.currency!=='KRW'||cfg.localePrefix!=='/ko-kr/'||!Array.isArray(cfg.allowedHosts)||!cfg.allowedHosts.includes('www.bulgari.com')||!Number.isSafeInteger(cfg.maxResponseBytes)||cfg.maxResponseBytes<1||cfg.maxResponseBytes>8388608||!Number.isSafeInteger(cfg.maxRequestsPerRun)||cfg.maxRequestsPerRun<1)throw Error('CONFIG_INVALID');
 const base=path.join(root,'crawler/runs/bulgari/kr'),source=path.resolve(args[4]),run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(source!==path.join(base,sourceId)||!run.startsWith(base+path.sep)||run===source||run.startsWith(source+path.sep))throw Error('RUN_SCOPE_INVALID');
 for(const dir of [run,source])if(await fs.realpath(dir)!==dir)throw Error('RUN_SCOPE_INVALID');
 const rows=[];let requests=0,bytes=0,failureCode=null;
 const add=status=>rows.push({brand:'bulgari',country:'KR',parentModel:'',variantCode:'323532',price:null,currency:'',status,officialUrl:target});
 try{
  const now=options.now?.()??Date.now(),age=now-Date.parse('2026-10-14T15:09:52Z');if(!Number.isFinite(age)||age<0||age>86400000)throw Error('SOURCE_STALE');
  const summary=path.join(source,'summary.json'),s=await fs.lstat(summary);
  if(!s.isFile()||s.isSymbolicLink()||s.size>32768)throw Error('SOURCE_SUMMARY_INVALID');
  if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('SOURCE_SUMMARY_GUARD_FAILED');
  const prior=JSON.parse(await fs.readFile(summary,'utf8'));
  if(!prior.some(r=>r.brand==='bulgari'&&r.country==='KR'&&r.status==='EXACT_PRODUCT_SCHEMA_MISSING'&&r.officialUrl===product&&['SOURCE','323532'].includes(r.variantCode)))throw Error('PRIOR_SOURCE_PROOF_MISSING');
  const folder=path.join(source,'raw');if(await fs.realpath(folder)!==folder)throw Error('RAW_SCOPE_INVALID');
  const names=(await fs.readdir(folder)).filter(n=>/^\d+\.source$/.test(n));if(!names.length||names.length>100)throw Error('SOURCE_FILE_LIMIT');
  let total=0,proven=false;
  for(const name of names){const file=path.join(folder,name),stat=await fs.lstat(file);total+=stat.size;
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8388608||total>67108864)throw Error('SOURCE_FILE_LIMIT');
   let html;try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
   if(hasPublishedBulgariScript(html,target))proven=true;
  }
  if(!proven)throw Error('PUBLISHED_SCRIPT_PROOF_MISSING');
  const out=path.join(run,'raw');await fs.mkdir(out,{recursive:true,mode:0o700});if(await fs.realpath(out)!==out)throw Error('RAW_SCOPE_INVALID');
  const destination=path.join(out,'published-script.source');
  try{await fs.lstat(destination);throw Error('PROBE_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  requests=1;const response=await (options.transport??requestScript)(target,{proxy:env.LUXURY_NETWORK_PROXY,maxBytes:cfg.maxResponseBytes,timeoutMs:30000});
  checkResponse(response.status,response.headers,cfg.maxResponseBytes);
  if(!Buffer.isBuffer(response.body)||response.body.length>cfg.maxResponseBytes)throw Error('SCRIPT_RESPONSE_LIMIT');
  if(!response.body.length)throw Error('EMPTY_SCRIPT_RESPONSE');
  // Bytes only: never execute or inspect JS payload here.
  await fs.writeFile(destination,response.body,{mode:0o600,flag:'wx'});bytes=response.body.length;
  add('SCRIPT_FETCH_HTTP_200');add(`SCRIPT_BYTES_${bytes}`);
 }catch(e){failureCode=safeCode(e);add(failureCode);}
 const output=path.join(run,'summary.json');await fs.writeFile(output,JSON.stringify(rows),{mode:0o600,flag:'wx'});
 if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[output],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
 if(failureCode)await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode}),{mode:0o600,flag:'wx'});
 if(!options.env)process.exitCode=failureCode?(/BLOCKED|LIMIT|UNAUTHORIZED|GUARD/.test(failureCode)?78:1):0;
 return {requests,bytes,failureCode};
}
