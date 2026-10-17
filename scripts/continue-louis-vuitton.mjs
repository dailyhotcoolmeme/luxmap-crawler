import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {runCatalogWorkflow,classifyCatalogRun,catalogImageKey,heldCatalogItem,verifiedStoredCatalogBatch} from '../crawler/common/catalog-workflow.js';
import {nextLouisVuittonExpansion} from '../crawler/common/louis-vuitton-expansion-plan.js';
import {nextLouisVuittonHttpCategory,nextLouisVuittonRenderCategory,nextLouisVuittonDetail,louisVuittonResolvedDetails} from '../crawler/common/louis-vuitton-http-plan.js';
import {louisVuittonImageChoice} from '../crawler/common/louis-vuitton-image-choice.js';
import {louisVuittonCode} from '../crawler/common/louis-vuitton-product.js';
import {pendingCatalogModels} from '../crawler/common/louis-vuitton-catalog-model.js';

const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/runs/louis-vuitton/kr',catalog=root+'/crawler/completeness/louis-vuitton';
const mode=process.argv.slice(2).join(' '),offline=mode==='--offline';
if(!['','--auto','--offline','--published-lists'].includes(mode))throw Error('CONTINUATION_SCOPE');
const run=(file,args=[],extra={})=>spawnSync(file,args,{cwd:root,env:{...process.env,...extra},stdio:'ignore',timeout:1800000}).status;
const node=(file,args=[],extra={})=>run(process.execPath,[root+'/scripts/'+file,...args],extra);
const guard=file=>{if(run(root+'/scripts/crawl-output-guard.sh',[file]))throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};
const coordinate=args=>node('coordinated-crawler.mjs',['--official-reference','louis-vuitton',...args]);
const number=(rows,prefix)=>{const values=rows.filter(r=>r.status.startsWith(prefix));return values.length===1&&/^\d+$/.test(values[0].status.slice(prefix.length))?Number(values[0].status.slice(prefix.length)):null;};
const digest=files=>{const h=createHash('sha256');for(const f of files)h.update(f).update(fs.existsSync(f)?fs.readFileSync(f):'MISSING');return h.digest('hex');};
const localFiles=[catalog+'/field-source/fields.json',catalog+'/expanded-catalog-source/candidates.json'];
const runtime=root+'/crawler/runtime/louis-vuitton-browser',journal=runtime+'/workflow'+(offline?'.offline':'')+'.json',lock=runtime+'/workflow.lock';
const atomic=(file,value)=>{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file);};
let locked=false,owner=randomUUID(),state={version:1,attempts:{}},status='STARTING',exitCode=1,lastReason;
function acquire(){
 fs.mkdirSync(runtime,{recursive:true});
 try{const f=fs.openSync(lock,'wx',0o600);fs.writeFileSync(f,JSON.stringify({pid:process.pid,owner}));fs.closeSync(f);locked=true;}
 catch(e){if(e.code!=='EEXIST')throw e;const held=JSON.parse(fs.readFileSync(lock));if(!Number.isInteger(held.pid)||held.pid<1)throw Error('WORKFLOW_LOCK_INVALID');try{process.kill(held.pid,0);}catch(err){if(err.code==='ESRCH'){fs.unlinkSync(lock);return acquire();}throw err;}throw Error('WORKFLOW_BUSY');}
}
function savedRuns(country='kr'){
 const folder=root+'/crawler/runs/louis-vuitton/'+country,found=[];if(!fs.existsSync(folder))return found;for(const id of fs.readdirSync(folder).sort()){const dir=folder+'/'+id,f=dir+'/summary.json';if(!fs.existsSync(f))continue;const rows=guard(f);found.push({id,dir,rows,time:fs.statSync(f).mtimeMs});}return found;
}
function prepare(){
 if(node('prepare-louis-vuitton-sources.mjs'))throw Error('FIELD_PREPARATION_FAILED');
 const rows=guard(catalog+'/ready-catalog-source/summary.json'),ready=number(rows,'NEW_EXACT_BAGS_');if(ready===null)throw Error('READY_COUNT_INVALID');
 const sources=JSON.parse(fs.readFileSync(catalog+'/ready-catalog-source/candidates.json')).map(s=>louisVuittonImageChoice(s,state.ingestHeld?.[s.code]));
 atomic(catalog+'/ready-catalog-source/candidates.json',sources);
 const eligible=sources.filter(s=>!heldCatalogItem(s,state.ingestHeld)).length;
 return {ready,eligible,key:digest(localFiles)};
}
function reconcile(){
 const before=digest(localFiles);let local=prepare(),changed=before!==local.key||state.publicationPending===true;
 if(!offline){
  const attemptedBatches=new Set();
  while(local.eligible>0){
   const batchKey=digest([catalog+'/ready-catalog-source/candidates.json']);
   if(attemptedBatches.has(batchKey))throw Error('INGEST_PROGRESS_INVALID');attemptedBatches.add(batchKey);
   // Keep one prepared list stable for every offset in this pass.
   state.publicationPending=true;atomic(journal,state);
   for(let offset=0;offset<local.ready;offset+=offset===0?1:25){
    const before=new Set(fs.readdirSync(base)),code=coordinate(['--batch-offset',String(offset)]);if(code===0)continue;
    const created=fs.readdirSync(base).filter(id=>!before.has(id));if(created.length!==1)throw Error(code===3?'COORDINATOR_BUSY':'CATALOG_INGEST_FAILED');
    const rows=guard(base+'/'+created[0]+'/summary.json'),result=classifyCatalogRun(code,rows);
    if(result.kind==='safety')throw Error('INGEST_POLICY_GUARD');if(result.kind==='access')throw Error('INGEST_ACCESS_BLOCKED');
    const failed=number(rows,'BATCH_FAILED_');
    if(code===2&&failed===0){
     // The central whole-catalogue gate deliberately returns partial after a
     // fully stored batch. Accept only matching anonymous-public receipts,
     // then continue reconciliation; this does not mark the catalogue done.
     if(!verifiedStoredCatalogBatch(rows,guard(base+'/'+created[0]+'/artifacts/public-verified/summary.json')))throw Error('CATALOG_PUBLIC_RECEIPT_GUARD');
     continue;
    }
    if(!failed||![1,2].includes(code)||code===1&&rows.some(r=>r.status==='REFERENCE_IMAGE_PRICE_READY'))throw Error('CATALOG_INGEST_FAILED');
    const sources=JSON.parse(fs.readFileSync(catalog+'/ready-catalog-source/candidates.json'));state.ingestHeld??={};
    for(const r of rows.filter(r=>/^IMAGE_|^REFERENCE_ITEM_(?:FAILED|HELD)$/.test(r.status))){const source=sources.find(s=>s.code===r.variantCode);if(source){const old=state.ingestHeld[source.code],imageKey=catalogImageKey(source);state.ingestHeld[source.code]={imageKey,reason:r.status,failedImageKeys:[...new Set([...(old?.failedImageKeys??[]),...(old?.imageKey?[old.imageKey]:[]),imageKey])]};}}
    atomic(journal,state);
   }
   changed=true;local=prepare();
  }
  if(changed){
   state.publicationPending=true;atomic(journal,state);
   if(coordinate(['--repair-metadata']))throw Error('CATALOG_REPAIR_FAILED');
   const token=execFileSync('/usr/bin/security',['find-generic-password','-s','luxury.cloudflare.api-token','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
   if(node('network-isolate.mjs',['["nxgnbrdxxmlhtcnymqsl.supabase.co","api.cloudflare.com","luxury-assets.dailyhotcoolmeme.workers.dev"]','0',process.execPath,root+'/scripts/refresh-saved-catalog.mjs','--guarded-report','--brand','louis-vuitton'],{NODE_USE_ENV_PROXY:'1',CLOUDFLARE_API_TOKEN:token}))throw Error('CATALOG_SNAPSHOT_FAILED');
  }
  const key=digest([...localFiles,root+'/scripts/verify-official-reference-catalog.mjs',root+'/crawler/common/catalog-completion.js']);
  if(changed||state.verifiedKey!==key||!fs.existsSync(catalog+'/public-reference/summary.json')){
   const verified=node('network-isolate.mjs',['["nxgnbrdxxmlhtcnymqsl.supabase.co","luxury-assets.dailyhotcoolmeme.workers.dev"]','0',process.execPath,root+'/scripts/verify-official-reference-catalog.mjs','louis-vuitton']);
   if(![0,2].includes(verified))throw Error('PUBLIC_VERIFY_FAILED');
   const publicRows=guard(catalog+'/public-reference/summary.json'),verifiedCount=number(publicRows,'PUBLIC_VERIFIED_');
   if(verifiedCount===null||number(publicRows,'PUBLIC_SNAPSHOT_LINKS_')!==verifiedCount||number(publicRows,'IMAGE_LINK_VERIFIED_')!==verifiedCount)throw Error('PUBLICATION_VERIFY_FAILED');
   state.verifiedKey=key;state.publicationPending=false;atomic(journal,state);
  }
 }
 const completion=node('check-louis-vuitton-completion.mjs');if(![0,2].includes(completion))throw Error('COMPLETION_GATE_FAILED');
 return {...local,snapshotUpdated:!offline&&changed,complete:completion===0&&!offline};
}
function plan(){
 if(offline)return [];
 const all=savedRuns(),normal=all.filter(s=>s.rows.some(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED')).at(-1);if(!normal){lastReason='NORMAL_SOURCE_EVIDENCE_REQUIRED';return [];}
 const ownedRuns=new Set();let session;
 for(const name of fs.readdirSync(runtime).filter(n=>n==='session.json'||/^published-(?:source-attempt|list-[a-f0-9]+)\.json$/.test(n)||/^expanded-list-[a-f0-9]+\.json$/.test(n))){
  const meta=JSON.parse(fs.readFileSync(runtime+'/'+name));if(name==='session.json')session=meta;if(typeof meta.run==='string'&&path.dirname(meta.run)===base)ownedRuns.add(meta.run);
 }
 // A local parser edit or changing the pending queue is not new access evidence.
 const refused=all.filter(s=>ownedRuns.has(s.dir)&&s.rows.some(r=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status)));
 const denied=refused.reduce((n,s)=>Math.max(n,s.time),0),adapters=[];
 const list=normal.rows.find(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'&&/^https:\/\/kr\.louisvuitton\.com\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(r.officialUrl));
 // A different refused URL does not erase an already verified, untouched list.
 // Expand that exact normal page once; never reopen a list itself refused later.
 const listRefused=list&&refused.some(s=>s.time>=normal.time&&s.rows.some(r=>r.officialUrl===list.officialUrl&&/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status)));
 const expansion=nextLouisVuittonExpansion(all,url=>fs.existsSync(runtime+'/expanded-list-'+createHash('sha256').update(url).digest('hex')+'.json'));
 if(expansion)adapters.push({key:'expand:'+expansion.id,operation:'--expand-rendered-list'});
 if(normal.time<=denied)lastReason='NEW_PUBLIC_ACCESS_EVIDENCE_REQUIRED';
 if(node('prepare-louis-vuitton-alternates.mjs'))throw Error('PUBLISHED_LIST_PREPARATION_FAILED');
 const listRows=guard(catalog+'/published-alternates/summary.json');
 // Explicit men's category links need the same HTTP-first handoff as the
 // proven all-bags source. They were previously discovered but never queued.
 const categories=listRows.filter(r=>['EXPLICIT_KR_BAG_CATEGORY','UNVISITED_PUBLISHED_BAG_LIST'].includes(r.status)).map(r=>({...r,status:'EXPLICIT_KR_BAG_CATEGORY'}));
 const render=nextLouisVuittonRenderCategory(listRows,all,url=>fs.existsSync(runtime+'/published-list-'+createHash('sha256').update(url).digest('hex')+'.json'));
 if(render)adapters.push({key:'lists:'+render.officialUrl,operation:'--render-published-list'});
 // Legacy workflow attempts also count when they predate URL markers.
 const untouched=nextLouisVuittonHttpCategory(categories,all,normal.time,url=>Boolean(state.attempts['http-category:'+url])||fs.existsSync(runtime+'/http-category-'+createHash('sha256').update(url).digest('hex')+'.json'));
 if(untouched)adapters.push({key:'http-category:'+untouched.officialUrl,operation:'--probe-product-source',url:untouched.officialUrl});
 if(normal.time>denied&&session&&normal.rows.some(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'&&louisVuittonCode(r.officialUrl)===r.variantCode))adapters.push({key:'details:'+normal.id,operation:'--render-reference-details'});
 const pricedDetails=louisVuittonResolvedDetails(JSON.parse(fs.readFileSync(catalog+'/field-source/fields.json')),state.ingestHeld);
 const detail=nextLouisVuittonDetail(JSON.parse(fs.readFileSync(catalog+'/expanded-catalog-source/candidates.json')),pricedDetails,all,(kind,url)=>Boolean(state.attempts[(kind==='http'?'http-detail:':'render-detail:')+url])||fs.existsSync(runtime+'/'+(kind==='http'?'http-category-':'published-detail-')+createHash('sha256').update(url).digest('hex')+'.json'));
 if(detail&&(detail.kind==='http'||session)){
  const candidate=detail.candidate;
  if(detail.kind==='http')adapters.push({key:'http-detail:'+candidate.url,operation:'--probe-product-source',url:candidate.url});
  else {
   const out=catalog+'/untried-http-detail';fs.mkdirSync(out,{recursive:true});
   atomic(out+'/summary.json',[{brand:'louis-vuitton',country:'KR',parentModel:'공식 미처리 상품 HTTP 우선 보완',variantCode:candidate.code,price:null,currency:'KRW',status:'UNTRIED_OFFICIAL_HTTP_DETAIL',officialUrl:candidate.url}]);guard(out+'/summary.json');
   adapters.push({key:'render-detail:'+candidate.url,operation:'--render-published-source'});
  }
 }
 // Last-resort, verified official search: same retained page, never a new
 // profile. Only a successful control under the explicitly approved API
 // host version can unlock unpriced exact-SKU searches.
 const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/kr'));
 if(session&&cfg.allowedHosts.includes('api.louisvuitton.com')){
  const controls=all.filter(s=>s.rows.some(r=>r.status==='SEARCH_POSITIVE_CONTROL')&&s.rows.some(r=>r.status==='SEARCH_EXACT_SKU_FOUND')&&s.rows.some(r=>r.status==='SEARCH_API_HTTP_200'));
  const ancillaryOnly=new Set(all.flatMap(s=>s.rows.filter(r=>['ANCILLARY_API_REFUSAL_ONLY','AUTOCOMPLETE_NORMAL_SOURCE'].includes(r.status)).map(r=>r.officialUrl)));
  const control=controls.at(-1),blocked=control&&all.some(s=>s.time>=control.time&&s.rows.some(r=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status)&&!(r.status==='ACCESS_BLOCKED'&&s.rows.some(p=>p.status==='SEARCH_API_HTTP_403')&&ancillaryOnly.has(r.officialUrl))));
  // A normal autocomplete response can be term suggestions, not priced
  // products. Do not spend one request per remaining SKU without a proven
  // exact-SKU price card from this new source type.
  const autocompletePriceProof=all.some(s=>{
   if(!s.rows.some(r=>r.status==='NORMAL_AUTOCOMPLETE_BODY_SAVED'))return false;
   const proof=s.dir+'/artifacts/native-metadata/summary.json';
   return fs.existsSync(proof)&&guard(proof).some(r=>r.status==='CARD_PRICE_FOUND_NOT_INGESTED'&&r.price>0);
  });
  if(control&&!blocked&&autocompletePriceProof){
   const priced=new Set(JSON.parse(fs.readFileSync(catalog+'/field-source/fields.json')).filter(r=>r.currency==='KRW'&&r.price>0).map(r=>r.code));
   const target=JSON.parse(fs.readFileSync(catalog+'/expanded-catalog-source/candidates.json')).find(r=>!priced.has(r.code)&&!['-api-host-v1','-autocomplete-v1'].some(suffix=>fs.existsSync(runtime+'/search-ui-'+r.code+suffix+'.json')));
   if(target)adapters.push({key:'search-autocomplete-v1:'+target.code,operation:'--search-ui-price-sample'});
  }
 }
 const models=all.filter(r=>r.rows.some(s=>s.status==='EXACT_MODEL_KRW_VERIFIED'));
 if(models.length){
  const pending=pendingCatalogModels(JSON.parse(fs.readFileSync(catalog+'/expanded-catalog-source/candidates.json')),JSON.parse(fs.readFileSync(catalog+'/field-source/fields.json')),all,Object.keys(state.ingestHeld??{}));
  if(pending.length)adapters.unshift({key:'catalog-model:'+createHash('sha256').update(pending.map(c=>c.code).join('|')).digest('hex'),operation:'--collect-catalog-model'});
 }
 return adapters;
}
function execute(source){
 if(source.url){
  const marker=runtime+'/http-category-'+createHash('sha256').update(source.url).digest('hex')+'.json';
  try{const fd=fs.openSync(marker,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({url:source.url,startedAt:new Date().toISOString()}));fs.closeSync(fd);}catch(e){if(e.code==='EEXIST')return {kind:'execution',saved:0,reason:'HTTP_CATEGORY_ALREADY_ATTEMPTED'};throw e;}
 }
 const before=new Set(fs.readdirSync(base)),code=source.url?node('coordinated-crawler.mjs',['--official-probe','louis-vuitton',source.operation,'--product-url',source.url]):coordinate([source.operation]),created=fs.readdirSync(base).filter(id=>!before.has(id));
 if(created.length!==1)return {kind:code===3?'lease':'execution',saved:0,reason:code===3?'COORDINATOR_BUSY':'BROWSER_RUN_SCOPE'};
 const rows=guard(base+'/'+created[0]+'/summary.json');const result=classifyCatalogRun(code,rows);if(source.operation==='--collect-catalog-model'&&rows.some(r=>r.status==='EXACT_MODEL_KRW_VERIFIED'))result.saved=rows.filter(r=>['NORMAL_HTTP_DOCUMENT_SAVED','CATALOG_MODEL_PROJECTION_SAVED'].includes(r.status)).length;lastReason=result.reason;return result;
}
try{
 if(run(root+'/scripts/crawl-preflight.sh'))throw Error('PREFLIGHT_FAILED');
 if(node('test-catalog-workflow.mjs')||node('test-catalog-completion.mjs')||node('test-louis-vuitton-reference.mjs'))throw Error('WORKFLOW_REGRESSION_FAILED');
 if(!offline&&(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.SUPABASE_SERVICE_ROLE_KEY))throw Error('COORDINATOR_CREDENTIAL_REQUIRED');
 acquire();try{state=JSON.parse(fs.readFileSync(journal));if(state.version!==1||!state.attempts||typeof state.attempts!=='object')throw Error('WORKFLOW_STATE_INVALID');}catch(e){if(e.code!=='ENOENT')throw e;}
 const result=await runCatalogWorkflow({state,save:s=>atomic(journal,s),reconcile,plan,execute});status=offline?'OFFLINE_PREPARED':result.status;exitCode=result.code;
}catch(e){status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'WORKFLOW_FAILED';exitCode=/GUARD|LIMIT|POLICY|PREFLIGHT/.test(status)?78:1;}
finally{
 if(locked){
  const out=catalog+(offline?'/continuation-offline':'/continuation');fs.mkdirSync(out,{recursive:true});const statuses=[status,...(lastReason?[lastReason]:[]),...(state.local?[state.local.snapshotUpdated?'PUBLICATION_VERIFIED':'NO_PUBLICATION_CHANGES']:[])];
  fs.writeFileSync(out+'/summary.json',JSON.stringify(statuses.map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'한국 공식 수집 작업 흐름',variantCode:'RUN',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}))),{mode:0o600});
  if(run(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json']))exitCode=78;
  if(JSON.parse(fs.readFileSync(lock)).owner===owner)fs.unlinkSync(lock);
 }
}
process.exitCode=exitCode;
