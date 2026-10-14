import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseBulgariProduct,bulgariReferenceCode} from './bulgari-product.js';
import {celineNodes} from './celine-html.js';

const projectRoot=path.resolve(import.meta.dirname,'../..');
// Discovery is broader than the verified numeric parser. Preserve exact tokens.
export function bulgariDiscoveryCode(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.bulgari.com'||u.username||u.password||u.search||u.hash||!u.pathname.startsWith('/ko-kr/')||/%|\\/.test(u.pathname))return null;
 const token=u.pathname.match(/(?:\/|-)([A-Z0-9]{6,40})\.html$/i)?.[1];
 return token&&/\d/.test(token)?token.toUpperCase():null;
 }catch{return null;}
}
const safeCode=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:'PRODUCT_REQUEST_FAILED';
const fatalCode=s=>/BLOCKED|LIMIT|UNAUTHORIZED|SANDBOX|GUARD|WORKER|RUNTIME|OFFLINE|INTEGRATION|IPC|IMAGE_SOURCE_HOST/.test(s);
const unescapeXml=v=>v.replace(/<!\[CDATA\[|\]\]>/g,'').trim().replace(/&amp;/g,'&');
const locs=xml=>[...xml.matchAll(/<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)].map(m=>unescapeXml(m[1]));
function koreanSitemaps(urls){
 // Only choose among published links. Neutral indexes remain in scope.
 const local=v=>/ko[-_]kr|\/ko\//i.test(new URL(v).pathname);
 const tagged=v=>/[a-z]{2}[-_][a-z]{2}(?=[/_.-]|$)/i.test(new URL(v).pathname);
 return urls.some(local)?urls.filter(v=>local(v)||!tagged(v)):urls;
}
async function atomic(file,value){const tmp=`${file}.${crypto.randomUUID()}.tmp`;await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file);}
async function publishedBaseline(root){
 const run=path.join(root,'crawler/runs/bulgari/kr/20261014T150805Z-86616'),file=path.join(run,'artifacts/source-index.json');
 let stat;try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 if(!stat.isFile()||stat.size>8388608||await fs.realpath(file)!==file)throw Error('BASELINE_SOURCE_LIMIT');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[path.join(run,'summary.json')],{stdio:'ignore'}).status)throw Error('BASELINE_PROVENANCE_INVALID');
 let data;try{await fs.chmod(file,0o600);data=JSON.parse(await fs.readFile(file,'utf8'));}finally{await fs.chmod(file,stat.mode&0o777);}
 if(data.entryUrl!=='https://www.bulgari.com/ko-kr/'||!Array.isArray(data.links))throw Error('BASELINE_PROVENANCE_INVALID');
 const urls=[...new Set(data.links.filter(v=>typeof v==='string'&&bulgariDiscoveryCode(v)))];if(urls.length>10000)throw Error('CANDIDATE_LIMIT');return urls;
}

async function recoverSource(root,address,now,cfg){
 const expected=path.join(root,'crawler/runs/bulgari/kr/20261014T150952Z-87506'),sourceRun=path.resolve(address);
 if(sourceRun!==expected||await fs.realpath(sourceRun)!==expected)throw Error('RECOVERY_SOURCE_SCOPE_INVALID');
 const acquired=Date.UTC(2026,9,14,15,9,52),age=now-acquired;
 if(!Number.isFinite(age)||age<0||age>86400000)throw Error('RECOVERY_SOURCE_STALE');
 const summaryFile=path.join(sourceRun,'summary.json');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[summaryFile],{stdio:'ignore'}).status)throw Error('RECOVERY_PROVENANCE_INVALID');
 const bytes=await fs.readFile(summaryFile),summary=JSON.parse(bytes),url='https://www.bulgari.com/ko-kr/323532.html';
 if(!summary.some(v=>v.brand==='bulgari'&&v.country==='KR'&&v.currency==='KRW'&&v.officialUrl===url&&v.status==='EXACT_PRODUCT_SCHEMA_MISSING'))throw Error('RECOVERY_PROVENANCE_INVALID');
 const raw=path.join(sourceRun,'raw');if(await fs.realpath(raw)!==raw)throw Error('RECOVERY_SOURCE_SCOPE_INVALID');
 const names=(await fs.readdir(raw)).filter(n=>/^\d+\.source$/.test(n));if(names.length>30)throw Error('RECOVERY_SOURCE_LIMIT');
 let result;
 for(const name of names){
  const file=path.join(raw,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.size>8388608)throw Error('RECOVERY_SOURCE_LIMIT');
  let source;try{await fs.chmod(file,0o600);source=await fs.readFile(file);}finally{await fs.chmod(file,stat.mode&0o777);}
  const html=source.toString('utf8');if(!html.includes('323532'))continue;
  if(!celineNodes(html).some(n=>n.tag==='link'&&(n.attrs.rel??'').toLowerCase()==='canonical'&&n.attrs.href===url))continue;
  const product=parseBulgariProduct(html,url,cfg);
  const fingerprint=JSON.stringify([product.normalizedCode,product.price,product.currency,product.officialUrl,product.sourceImageUrl]);
  if(result&&result.fingerprint!==fingerprint)throw Error('RECOVERY_SOURCE_CONFLICT');
  result={product,fingerprint,provenance:{sourceRun,sourceFile:file,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),summarySha256:crypto.createHash('sha256').update(bytes).digest('hex'),officialUrl:url,acquiredAt:new Date(acquired).toISOString()}};
 }
 if(!result)throw Error('RECOVERY_EXACT_SOURCE_MISSING');
 return result;
}

// Invoked by the central runner only. Injectable IO permits offline fixture tests.
export async function collectBulgariReference(options={}){
 const env=options.env??process.env,args=options.args??process.argv.slice(2),root=options.root??projectRoot;
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('PREFLIGHT_FAILED');
 const flags=args.slice(2),recovery=flags[0]==='--recover-source-run'&&flags.length===2,repair=flags.includes('--remaining'),rest=recovery?[]:flags.filter(v=>v!=='--remaining');
 if(args[0]!=='--country-config'||flags.filter(v=>v==='--remaining').length>1||(!recovery&&!(repair&&rest.length===0)&&!(rest[0]==='--batch-offset'&&/^\d+$/.test(rest[1]??'')&&([2,4].includes(rest.length))&&(rest.length!==4||(!repair&&rest[2]==='--limit'&&rest[3]==='1')))))throw Error('BATCH_REQUIRED');
 const cfg=options.config??JSON.parse(await fs.readFile(args[1],'utf8'));
 if(cfg.brand!=='bulgari'||cfg.country!=='KR'||cfg.currency!=='KRW'||cfg.localePrefix!=='/ko-kr/'||cfg.entryUrl!=='https://www.bulgari.com/ko-kr/'||!Array.isArray(cfg.allowedHosts)||cfg.allowedHosts.some(h=>h!=='www.bulgari.com')||!cfg.allowedHosts.includes('www.bulgari.com'))throw Error('COUNTRY_CONFIG_INVALID');
 for(const [key,cap]of Object.entries({maxRequestsPerRun:80,maxResponseBytes:8388608,maxProductsPerRun:25,maxDiscoveryPages:20,maxCandidates:10000}))if(!Number.isSafeInteger(cfg[key])||cfg[key]<1||cfg[key]>cap)throw Error('CONFIG_LIMIT_INVALID');
 const offset=Number(rest[1]??0),sample=!repair&&!recovery&&rest.length===4;
 if(!Number.isSafeInteger(offset))throw Error('OFFSET_OUT_OF_RANGE');
 const run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(!run.startsWith(path.join(root,'crawler/runs/bulgari/kr')+path.sep)||await fs.realpath(run)!==run)throw Error('RUN_SCOPE_INVALID');
 const brandDir=path.join(root,'crawler/brands/bulgari'),artifact=path.join(run,'artifacts'),raw=path.join(run,'raw');
 await fs.mkdir(brandDir,{recursive:true,mode:0o700});await fs.mkdir(artifact,{recursive:true,mode:0o700});await fs.mkdir(raw,{recursive:true,mode:0o700});
 const indexFile=path.join(brandDir,sample?'.reference-sample-index.json':'.reference-index.json'),ledgerFile=path.join(brandDir,sample?'.reference-sample-ledger.json':'.reference-ledger.json');
 const rows=[],records=[];let calls=0,context,index,ledger,fatal=null,nextOffset=offset,discoveryComplete=false,batchFailed=0,repairRemaining=0,recoveryImageUrl=null;
 const factory=options.contextFactory??(async config=>(await import('playwright-core')).request.newContext(config));
 const row=(status,address=cfg.entryUrl,sku='RUN',price=null,name='한국 공식 상품 수집')=>({brand:'bulgari',country:'KR',parentModel:name.slice(0,120),variantCode:sku,price,currency:'KRW',status,officialUrl:address});
 const save=async()=>{
  const file=path.join(run,'summary.json');await atomic(file,rows);
  if(spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD_FAILED');
  await atomic(path.join(artifact,'records.json'),records);
  if(index)await atomic(indexFile,index);
  if(ledger)await atomic(ledgerFile,ledger);
 };
 const validateUrl=value=>{let u;try{u=new URL(value);}catch{throw Error('UNAUTHORIZED_URL');}if(u.protocol!=='https:'||u.hostname!=='www.bulgari.com'||u.username||u.password||u.hash)throw Error('UNAUTHORIZED_URL');return u.href;};
 async function fetchResponse(value,document=true){
  try{
   if(recovery&&document)throw Error('UNAUTHORIZED_RECOVERY_REQUEST');
   if(recovery&&value!==recoveryImageUrl)throw Error('UNAUTHORIZED_RECOVERY_REQUEST');
   if(recovery&&calls>=1)throw Error('RECOVERY_REQUEST_LIMIT');
   const address=validateUrl(value);if(calls>=cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   context??=await factory({proxy:{server:env.LUXURY_NETWORK_PROXY},timeout:30000});calls++;
   let response;try{response=await context.get(address,{timeout:Math.min(cfg.navigationTimeoutMs??30000,30000),maxRedirects:0,maxRetries:0});}catch{throw Error('SOURCE_REQUEST_FAILED');}
   if([403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');
   if(!response.ok())throw Error(`HTTP_${response.status()}`);
   const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
   if(document){
    const html=body.toString('utf8');if(/<title[^>]*>\s*(?:just a moment|access denied|attention required)|cf-chl|px-captcha|captcha-delivery|challenge-platform/i.test(html))throw Error('ACCESS_BLOCKED');
    await fs.writeFile(path.join(raw,`${calls}.source`),body,{mode:0o600});return html;
   }
   return {status:()=>response.status(),ok:()=>response.ok(),headers:()=>response.headers(),body:async()=>body};
  }catch(e){if(fatalCode(safeCode(e)))fatal=safeCode(e);throw e;}
 }
 let imageModule;
 const image=options.processImage??(async(...params)=>{
  imageModule??=await import('./image-processor.js');
  try{imageModule.originalImageUrl(params[1],params[3]);}catch{throw Error('IMAGE_INTEGRATION_REQUIRED');}
  return imageModule.downloadAndOptimizeImage(...params);
 });
 const now=()=>options.now?.()??Date.now();
 try{
  if(offset===0&&!repair&&!recovery){
   index={id:crypto.randomUUID(),checkedAt:new Date(now()).toISOString(),discoveryComplete:false,discoveryScope:'published-reference-v2',urls:[]};
   ledger={indexId:index.id,entries:{},complete:false};
   const robots=await fetchResponse('https://www.bulgari.com/robots.txt');
   const declared=[...robots.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>validateUrl(m[1]));
   if(!declared.length)throw Error('SITEMAP_NOT_DECLARED');
   const queue=koreanSitemaps(declared),seen=new Set(),found=new Map();
   const remember=value=>{const sku=bulgariDiscoveryCode(value);if(!sku)return;const address=validateUrl(value),prior=found.get(sku),aliases=[...new Set([...(prior?.aliases??[]),address])].sort();found.set(sku,{sku,aliases,url:aliases.find(v=>new URL(v).pathname.includes('/jewellery/'))??aliases[0]});if(!bulgariReferenceCode(address))ledger.entries[sku]??={state:'unresolved',status:'ALPHANUMERIC_REFERENCE_UNVERIFIED',officialUrl:address};};
   const baseline=await publishedBaseline(root);baseline.forEach(remember);index.baselineSourceCount=baseline.length;
   index.declaredSitemaps=declared;
   while(queue.length){
    const address=validateUrl(queue.shift());if(seen.has(address))continue;
    if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_LIMIT');seen.add(address);
    const xml=await fetchResponse(address),children=locs(xml);
    if(/<(?:\w+:)?sitemapindex\b/i.test(xml))queue.push(...koreanSitemaps(children.map(validateUrl)));
    else if(/<(?:\w+:)?urlset\b/i.test(xml)){
     children.forEach(remember);
     if(found.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');
    }else throw Error('SITEMAP_FORMAT');
    index.candidates=[...found.values()].sort((a,b)=>a.sku.localeCompare(b.sku));index.urls=index.candidates.map(v=>v.url);index.sitemaps=[...seen];await save();
   }
   if(!index.urls.length)throw Error('REFERENCE_EMPTY');
   index.discoveryComplete=true;discoveryComplete=true;await save();
  }else{
   index=JSON.parse(await fs.readFile(indexFile,'utf8'));ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));
   const age=now()-Date.parse(index.checkedAt);
   if(!Number.isFinite(age)||age<0||age>86400000)throw Error('REFERENCE_INDEX_STALE');
   if(!index.discoveryComplete||ledger.indexId!==index.id)throw Error('REFERENCE_INDEX_INCOMPLETE');
   if(index.blocked&&!recovery)throw Error('PREVIOUS_RUN_BLOCKED');
   if(!recovery&&index.discoveryScope!=='published-reference-v2')throw Error('REFERENCE_DISCOVERY_SCOPE_STALE');
   if(!Array.isArray(index.urls)||index.urls.length>cfg.maxCandidates||index.urls.some(v=>!bulgariDiscoveryCode(v)))throw Error('REFERENCE_INDEX_INVALID');
   if(new Set(index.urls.map(v=>bulgariDiscoveryCode(v))).size!==index.urls.length)throw Error('REFERENCE_INDEX_INVALID');
   if(!ledger.entries||typeof ledger.entries!=='object'||Array.isArray(ledger.entries))throw Error('REFERENCE_LEDGER_INVALID');
   if(!repair&&!recovery&&index.urls.slice(0,offset).some(v=>!ledger.entries[bulgariDiscoveryCode(v)]))throw Error('OFFSET_GAP');
   discoveryComplete=index.discoveryScope==='published-reference-v2';
   if(recovery){
    const baseline=await publishedBaseline(root),merged=[...new Set([...index.urls,...baseline])];
    // Preserve one exact token per SKU; do not map AN references to digits.
    const byCode=new Map();for(const address of merged)if(!byCode.has(bulgariDiscoveryCode(address)))byCode.set(bulgariDiscoveryCode(address),address);
    index.urls=[...byCode.values()].sort((a,b)=>bulgariDiscoveryCode(a).localeCompare(bulgariDiscoveryCode(b)));
    if(index.urls.length>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');
    index.candidates=index.urls.map(address=>({sku:bulgariDiscoveryCode(address),url:address,aliases:merged.filter(v=>bulgariDiscoveryCode(v)===bulgariDiscoveryCode(address))}));
    for(const address of index.urls)if(!bulgariReferenceCode(address))ledger.entries[bulgariDiscoveryCode(address)]??={state:'unresolved',status:'ALPHANUMERIC_REFERENCE_UNVERIFIED',officialUrl:address};
    if(!discoveryComplete)rows.push(row('DISCOVERY_SCOPE_INCOMPLETE'));
   }
  }
  if(offset>index.urls.length||(!repair&&!recovery&&offset===index.urls.length))throw Error('OFFSET_OUT_OF_RANGE');
  rows.push(row(`DISCOVERED_${index.urls.length}`),row(`BATCH_OFFSET_${offset}`));if(sample)rows.push(row('SAMPLE_NOT_FULL_CATALOG'));
  let recovered;
  if(recovery){
   if(!index.urls.some(v=>bulgariDiscoveryCode(v)==='323532'))throw Error('RECOVERY_REFERENCE_NOT_INDEXED');
   recovered=await recoverSource(root,flags[1],now(),cfg);
   recoveryImageUrl=recovered.product.sourceImageUrl;
   await atomic(path.join(artifact,'recovery-provenance.json'),recovered.provenance);
   rows.push(row('RECOVERED_SOURCE_PARTIAL',recovered.product.officialUrl,'323532'));
  }
  const eligible=index.urls.map((address,position)=>({address,position})).filter(v=>v.position>=offset&&(!repair||ledger.entries[bulgariDiscoveryCode(v.address)]?.state==='unresolved')&&(!recovery||(bulgariDiscoveryCode(v.address)==='323532'&&ledger.entries['323532']?.state==='unresolved')));
  const batch=eligible.slice(0,sample||recovery?1:cfg.maxProductsPerRun);
  if(repair){rows.push(row('EXISTING_UNRESOLVED_ONLY'),row(`REPAIR_SELECTED_${batch.length}`));repairRemaining=eligible.length;}
  for(const {address,position} of batch){
   const sku=bulgariDiscoveryCode(address);
   try{
    if(!bulgariReferenceCode(address))throw Error('ALPHANUMERIC_REFERENCE_UNVERIFIED');
    const product=recovery?recovered.product:parseBulgariProduct(await fetchResponse(address),address,cfg);
    const optimized=await image({request:{get:value=>fetchResponse(value,false)}},product.sourceImageUrl,artifact,sku);
    if(fatal)throw Error(fatal);
    if(optimized?.imageProcessingVersion!=='original-cutout-v1'||!optimized.imagePath||!optimized.imageSha256)throw Error('IMAGE_OUTPUT_INVALID');
    delete product.image;records.push({...product,...optimized});
    ledger.entries[sku]={state:'ready',officialUrl:product.officialUrl,run,checkedAt:new Date(now()).toISOString()};
    rows.push(row(product.price===null?'PRICE_UNPUBLISHED':'REFERENCE_IMAGE_READY',product.officialUrl,sku,product.price,product.parentModel));
   }catch(e){
    const status=fatal??safeCode(e),excluded=status==='NON_JEWELLERY_CATEGORY';
    if(!excluded)batchFailed++;
    ledger.entries[sku]={state:excluded?'excluded':'unresolved',status,officialUrl:address,run};
    rows.push(row(excluded?'NON_JEWELLERY_EXCLUDED':status,address,sku));
    if(fatalCode(status)){index.blocked=status;fatal=status;await save();throw Error(status);}
   }
   nextOffset=position+1;if(repair)repairRemaining--;await save();
  }
 }catch(e){
  fatal=fatal??safeCode(e);rows.push(row(fatal));
  if(index&&fatalCode(fatal))index.blocked=fatal;
 }finally{
  const urls=index?.urls??[],entries=ledger?.entries??{};
  const unresolved=urls.filter(v=>!['ready','excluded'].includes(entries[bulgariDiscoveryCode(v)]?.state)).length;
  const failed=urls.filter(v=>entries[bulgariDiscoveryCode(v)]?.state==='unresolved').length;
  const remaining=repair?repairRemaining:Math.max(0,urls.length-nextOffset),complete=!sample&&!recovery&&!fatal&&discoveryComplete&&remaining===0&&unresolved===0;
  if(ledger)ledger.complete=complete;
  const result={mode:recovery?'recovered-source':repair?'remaining':'batch',complete,discoveryComplete,nextOffset,remaining,unresolved,failed,batchFailed,ready:records.length,excluded:Object.values(entries).filter(v=>v.state==='excluded').length,requests:calls,failureCode:fatal??(failed?'PARTIAL_REFERENCE_BATCH':null)};
  rows.push(row(`BATCH_READY_${records.length}`),row(`BATCH_FAILED_${batchFailed}`),row(`NEXT_OFFSET_${nextOffset}`),row(`REMAINING_${remaining}`),row(`UNRESOLVED_${unresolved}`),row(complete?'COLLECTION_COMPLETE':'COLLECTION_INCOMPLETE'));
  try{await save();await atomic(path.join(artifact,'batch-state.json'),result);if(result.failureCode)await atomic(path.join(run,'failure.json'),{failureCode:result.failureCode});}
  finally{try{if(options.closeImages)await options.closeImages();else await imageModule?.closeImageProcessor();}finally{await context?.dispose();}}
  // The wrapper reports exit status; fixtures receive the same private state.
  if(!options.env)process.exitCode=fatal?(/UNAUTHORIZED|GUARD|SANDBOX/.test(fatal)?78:1):failed?2:0;
  return result;
 }
}
