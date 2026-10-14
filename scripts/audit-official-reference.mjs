// Offline adapter. Only fixed local evidence paths are read; no remote clients.
// Optional future independent receipt:
// crawler/completeness/<brand>/official-reference/proof-receipt.json
// {schemaVersion:1,brand,country:'KR',checkedAt,inputHashes:{referenceIndex,ledger},
//  discoveryIndex:{scopeVerified,discoveryComplete,knownPublishedReferences,
//    expectedCount?},ledger:{entries},publicVerifiedFacts:{entries},safety}
// Receipt entries use official-reference-completeness.js's explicit attestations.
// Native ready states and PUBLIC_CATALOG_VERIFIED summary rows are NOT receipts.
// Future producer receipts are also accepted at each guarded run's
// artifacts/public-verified/proof-receipts.json, schema:1, recordFileSha256,
// checkedAt, entries:{CODE:{ledger,public}}. They attest individual records;
// they do not independently attest discovery scope or global safety.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {auditOfficialReferenceCompleteness} from '../crawler/common/official-reference-completeness.js';
import {officialReferenceReceipt} from '../crawler/common/official-reference-receipt.js';

const projectRoot=path.resolve(import.meta.dirname,'..'),day=86400000;
const config={hermes:['www.hermes.com','/kr/ko/'],dior:['www.dior.com','/ko_kr/'],'saint-laurent':['www.ysl.com','/ko-kr/'],bulgari:['www.bulgari.com','/ko-kr/']};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validCode=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9._-]{0,119}$/i.test(v);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safeStatus=e=>/^[A-Z0-9_]{1,40}$/.test(e?.message??'')?e.message:'LOCAL_EVIDENCE_INVALID';
function official(brand,value){try{const u=new URL(value),[host,prefix]=config[brand];return u.protocol==='https:'&&u.hostname===host&&u.pathname.startsWith(prefix)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href.length<=500?u.href:null;}catch{return null;}}
function reference(brand,value){
 const url=official(brand,value);if(!url)return null;const p=new URL(url).pathname;
 if(brand==='hermes')return p.match(/\/product\/[^/]+-(H[A-Z0-9]{8,19})\/?$/i)?.[1]?.toUpperCase()??null;
 if(brand==='dior')return p.match(/\/products\/([A-Z0-9]+_[A-Z0-9]+)\/?$/i)?.[1]?.replaceAll('_','')??null;
 if(brand==='saint-laurent')return p.match(/\/pr\/[^/]+-([A-Z0-9]{10,20})\.html$/i)?.[1]?.toUpperCase()??null;
 const token=p.match(/(?:\/|-)([A-Z0-9]{6,40})\.html$/i)?.[1];return token&&/\d/.test(token)?token.toUpperCase():null;
}

export async function auditOfficialReferenceCatalog({brand,root=projectRoot,env=process.env,now=Date.now()}={}){
 if(!Object.hasOwn(config,brand))throw Error('AUDIT_BRAND_INVALID');
 if(spawnSync(path.join(projectRoot,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('AUDIT_PREFLIGHT_FAILED');
 if(!Number.isFinite(now))throw Error('AUDIT_CLOCK_INVALID');
 root=path.resolve(root);if(fs.realpathSync(root)!==root)throw Error('AUDIT_ROOT_SCOPE_INVALID');
 const entry='https://'+config[brand][0]+config[brand][1],canonical=`crawler/completeness/${brand}/official-reference`,runBase=`crawler/runs/${brand}/kr`;
 const diagnostics=new Set(),faults=new Set(),adapterMetrics={knownPublicVerified:0,staleDocuments:0,corruptDocuments:0,sourcePendingReferences:0,nativeSourcePendingReferences:0,nativeProcessed:0,proofReceiptMissing:0,imageReceiptMissing:0,publicReceiptMissing:0};
 const diagnostic=s=>diagnostics.add(s),fault=s=>{faults.add(s);diagnostic(s);};
 const fresh=mtime=>Number.isFinite(mtime)&&now-mtime>=0&&now-mtime<=day;
 function scoped(rel,allowMissing=false){
  const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error('AUDIT_PATH_SCOPE_INVALID');
  let current=root;for(const part of path.relative(root,target).split(path.sep)){
   current=path.join(current,part);try{if(fs.lstatSync(current).isSymbolicLink())throw Error('AUDIT_SYMLINK_REJECTED');}catch(e){if(e.code==='ENOENT'&&allowMissing)return target;throw e;}
  }return target;
 }
 let currentOutput=null;
 if(env.CRAWL_SUMMARY_FILE&&!env.CRAWL_RUN_DIR)throw Error('AUDIT_RUN_SCOPE_INVALID');
 if(env.CRAWL_RUN_DIR){
  const run=path.resolve(env.CRAWL_RUN_DIR),base=path.join(root,runBase),id=path.basename(run);
  if(path.dirname(run)!==base||!/^\d{8}T\d{6}Z-\d+$/.test(id)||scoped(path.relative(root,run))!==fs.realpathSync(run)||!fs.statSync(run).isDirectory())throw Error('AUDIT_RUN_SCOPE_INVALID');
  currentOutput=path.join(run,'summary.json');if(env.CRAWL_SUMMARY_FILE&&path.resolve(env.CRAWL_SUMMARY_FILE)!==currentOutput)throw Error('AUDIT_SUMMARY_SCOPE_INVALID');
 }
 function read(rel,{summary=false}={}){
  let file,stat,fd,changed=false,bytes;
  try{
   file=scoped(rel);stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>(summary?32768:8388608))throw Error('AUDIT_DOCUMENT_LIMIT');
   // Existing private artifacts may be sealed 000. Restore their mode exactly.
   if(!(stat.mode&0o400)){fs.chmodSync(file,(stat.mode&0o777)|0o400);changed=true;}
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('AUDIT_SOURCE_CHANGED');
   bytes=fs.readFileSync(fd);if(bytes.length>(summary?32768:8388608))throw Error('AUDIT_DOCUMENT_LIMIT');
   const after=fs.fstatSync(fd);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw Error('AUDIT_SOURCE_CHANGED');
   if(summary&&spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('AUDIT_SUMMARY_GUARD_FAILED');
   const data=JSON.parse(bytes);if(summary&&!Array.isArray(data))throw Error('AUDIT_SUMMARY_GUARD_FAILED');const isFresh=fresh(stat.mtimeMs);if(!isFresh)adapterMetrics.staleDocuments++;
   return {data,hash:sha(bytes),fresh:isFresh,mtime:stat.mtimeMs};
  }catch(e){if(e.code==='ENOENT')return null;adapterMetrics.corruptDocuments++;fault(safeStatus(e));return null;}
  finally{if(changed){if(fd!==undefined)fs.fchmodSync(fd,stat.mode&0o777);else fs.chmodSync(file,stat.mode&0o777);}if(fd!==undefined)fs.closeSync(fd);}
 }
 const indexPath=`crawler/brands/${brand}/.reference-index.json`,ledgerPath=`crawler/brands/${brand}/${brand==='hermes'?'.reference-detail-ledger.json':'.reference-ledger.json'}`;
 const indexDoc=read(indexPath),ledgerDoc=read(ledgerPath),references=new Map(),known=new Set(),pending=new Set(),nativePending=new Set(),latestPublic=new Map(),producedEntries=new Map();
 const nativeIndex=indexDoc?.data,nativeLedger=ledgerDoc?.data;
 if(!indexDoc)diagnostic('REFERENCE_INDEX_MISSING');else if(!obj(nativeIndex))fault('REFERENCE_INDEX_CORRUPT');
 if(!ledgerDoc)diagnostic('REFERENCE_LEDGER_MISSING');else if(!obj(nativeLedger)||!obj(nativeLedger.entries))fault('REFERENCE_LEDGER_CORRUPT');
 const append=(code,url,discovered)=>{
  if(!validCode(code)||reference(brand,url)!==code){fault('EXPLICIT_REFERENCE_MAPPING_INVALID');return;}
  known.add(code);if(discovered){if(references.has(code)&&references.get(code)!==url)fault('REFERENCE_URL_CONFLICT');else references.set(code,url);}else pending.add(code);
 };
 if(obj(nativeIndex)){
  let foundShape=false;
  for(const [key,codeKey,urlKey]of [['references','code','officialUrl'],['products','code','url'],['candidates','sku','url']])if(nativeIndex[key]!==undefined){
   foundShape=true;if(!Array.isArray(nativeIndex[key])||nativeIndex[key].length>50000){fault('REFERENCE_INDEX_CORRUPT');continue;}
   for(const value of nativeIndex[key]){if(!obj(value)){fault('REFERENCE_INDEX_CORRUPT');continue;}append(value[codeKey],value[urlKey],true);}
  }
  if(nativeIndex.urls!==undefined){foundShape=true;if(!Array.isArray(nativeIndex.urls)||nativeIndex.urls.length>50000)fault('AUDIT_REFERENCE_LIMIT');else for(const url of nativeIndex.urls){const code=reference(brand,url);if(code)append(code,url,true);else fault('EXPLICIT_REFERENCE_MAPPING_INVALID');}}
  if(nativeIndex.knownPublishedReferences!==undefined){if(!Array.isArray(nativeIndex.knownPublishedReferences)||nativeIndex.knownPublishedReferences.length>50000)fault('REFERENCE_UNIVERSE_INVALID');else for(const r of nativeIndex.knownPublishedReferences){const code=typeof r==='string'?r:r?.code;if(validCode(code))known.add(code);else fault('REFERENCE_UNIVERSE_INVALID');}}
  if(!foundShape)fault('REFERENCE_INDEX_SHAPE_UNKNOWN');
 }
 const nativeEntries=obj(nativeLedger?.entries)?nativeLedger.entries:{};
 const entries={};
 for(const [code,value]of Object.entries(nativeEntries)){
  if(!validCode(code)||!obj(value)){fault('REFERENCE_LEDGER_CORRUPT');continue;}
  // Never upgrade native ready/metadata states into independent attestations.
  if(value.state&&value.state!=='unprocessed'){
   adapterMetrics.nativeProcessed++;
   entries[code]={classification:'unresolved',state:'unresolved',failureStage:'receipt',detailVerified:false,exactReferenceVerified:false,officialUrl:official(brand,value.officialUrl)??references.get(code),...(typeof value.status==='string'&&/^[A-Z0-9_]{1,40}$/.test(value.status)?{status:value.status}:{})};
   if(value.safetyBlocked||value.state==='blocked'||typeof value.status==='string'&&/BLOCKED|UNAUTHORIZED|SANDBOX|GUARD|TOKEN|NETWORK_POLICY|LIMIT/.test(value.status))fault('NATIVE_SAFETY_BLOCKED');
  }
 }
 let dirs=[];try{const base=scoped(runBase);dirs=fs.readdirSync(base,{withFileTypes:true}).filter(d=>/^\d{8}T\d{6}Z-\d+$/.test(d.name));if(dirs.length>10000)throw Error('AUDIT_RUN_COUNT_LIMIT');}catch(e){if(e.code!=='ENOENT')fault(safeStatus(e));dirs=[];}
 for(const dir of dirs){
  const rel=`${runBase}/${dir.name}`;if(dir.isSymbolicLink()){fault('AUDIT_SYMLINK_REJECTED');continue;}if(!dir.isDirectory()){fault('AUDIT_RUN_SCOPE_INVALID');continue;}
  if(currentOutput&&path.join(root,rel,'summary.json')===currentOutput)continue;
  const sourcePath=`${rel}/artifacts/source-index.json`,source=read(sourcePath);
  if(source){
   if(!obj(source.data)||!Array.isArray(source.data.links)||source.data.links.length>50000||!official(brand,source.data.entryUrl)){fault('SOURCE_INDEX_CORRUPT');}
   else{
    const provenance=read(`${rel}/summary.json`,{summary:true});
    if(!provenance||!provenance.data.some(r=>r.brand===brand&&r.country==='KR'))fault('SOURCE_PROVENANCE_MISSING');
    else for(const url of source.data.links){const code=reference(brand,url);if(code)append(code,url,false);}
   }
  }
  if(brand==='saint-laurent'){
   // The listing inspector may have no generic source-index.json. Its typed
   // native records and paired guarded URL/SKU evidence still bound the known
   // pending universe. Neither prices nor taxonomy/image fields are promoted.
   const native=read(`${rel}/ysl-native-source/records.json`);
   if(native){
    const evidence=read(`${rel}/ysl-native-source/summary.json`,{summary:true});
    if(!Array.isArray(native.data)||native.data.length>50000)fault('NATIVE_SOURCE_RECORDS_CORRUPT');
    else if(!evidence)fault('NATIVE_SOURCE_PROVENANCE_MISSING');
    else{
     const statuses=new Set(['EXPLICIT_KRW_PRICE','EXACT_SKU_PRICE_UNKNOWN','EXPLICIT_PRICE_CONFLICT','PATH_ONLY_METADATA_UNKNOWN']);
     const identityRows=evidence.data.filter(r=>r.brand===brand&&r.country==='KR'&&statuses.has(r.status));
     const identity=r=>typeof r.sku==='string'&&/^[A-Z0-9]{15}$/.test(r.sku)&&reference(brand,r.url)===r.sku;
     for(const r of native.data){
      if(!obj(r)||!identity(r)){fault('NATIVE_SOURCE_MAPPING_INVALID');continue;}
      if(!identityRows.some(v=>v.variantCode===r.sku&&v.officialUrl===r.url)){fault('NATIVE_SOURCE_PROVENANCE_MISSING');continue;}
      append(r.sku,r.url,false);nativePending.add(r.sku);
     }
     // Inspector reports explicit path-only pairs for documents where typed
     // metadata is absent. These remain pending, with no inferred category.
     for(const r of identityRows)if(r.status==='PATH_ONLY_METADATA_UNKNOWN'){
      if(!identity({sku:r.variantCode,url:r.officialUrl})){fault('NATIVE_SOURCE_MAPPING_INVALID');continue;}
      append(r.variantCode,r.officialUrl,false);nativePending.add(r.variantCode);
     }
    }
   }
  }
  const captured=read(`${rel}/artifacts/public-verified/summary.json`,{summary:true});
  if(captured?.fresh)for(const r of captured.data){
   if(r.status!=='PUBLIC_CATALOG_VERIFIED')continue;
   if(r.brand!==brand||r.country!=='KR'||r.currency!=='KRW'||reference(brand,r.officialUrl)!==r.variantCode||!(r.price===null||Number.isFinite(r.price)&&r.price>0)){fault('PUBLIC_SUMMARY_IDENTITY_INVALID');continue;}
   const prior=latestPublic.get(r.variantCode);
   if(prior&&prior.mtime===captured.mtime&&(prior.row.officialUrl!==r.officialUrl||prior.row.price!==r.price)){fault('PUBLIC_SUMMARY_CONFLICT');continue;}
   if(!prior||prior.mtime<captured.mtime)latestPublic.set(r.variantCode,{row:r,mtime:captured.mtime});
  }
  const producer=read(`${rel}/artifacts/public-verified/proof-receipts.json`);
  if(producer){
   const p=producer.data;
   if(!obj(p)||p.schema!==1||p.brand!==brand||p.country!=='KR'||!obj(p.entries)||Object.keys(p.entries).length>25||typeof p.recordFileSha256!=='string'){fault('RUN_PROOF_RECEIPT_CORRUPT');continue;}
   const records=read(`${rel}/artifacts/records.json`);
   if(!records||!Array.isArray(records.data)||records.data.length>25){fault('RECEIPT_RECORD_FILE_INVALID');continue;}
   if(!producer.fresh||!records.fresh||!captured?.fresh||!fresh(Date.parse(p.checkedAt))){fault('RUN_PROOF_RECEIPT_STALE');continue;}
   if(records.hash!==p.recordFileSha256){fault('RUN_RECEIPT_HASH_MISMATCH');continue;}
   const byCode=new Map();let bad=false;
   for(const record of records.data){if(!obj(record)||!validCode(record.normalizedCode)||byCode.has(record.normalizedCode)){bad=true;break;}byCode.set(record.normalizedCode,record);}
   if(bad){fault('RECEIPT_RECORD_FILE_INVALID');continue;}
   for(const [code,pair]of Object.entries(p.entries)){
    const record=byCode.get(code),typed=pair?.ledger,publicFact=pair?.public,capture=captured.data.find(v=>v.status==='PUBLIC_CATALOG_VERIFIED'&&v.variantCode===code&&v.brand===brand&&v.country==='KR');
    if(!validCode(code)||!obj(typed)||!obj(publicFact)||!obj(typed.image)||!record||!capture||record.brand!==brand||record.country!=='KR'||reference(brand,record.officialUrl)!==code){fault('RUN_RECEIPT_RECORD_MISMATCH');continue;}
    let expected;try{expected=officialReferenceReceipt(record,{brand,siteHosts:[config[brand][0]],localePrefix:config[brand][1]});}catch{fault('RUN_RECEIPT_RECORD_MISMATCH');continue;}
    if(!expected||!isDeepStrictEqual(pair,expected)){fault('RUN_RECEIPT_RECORD_MISMATCH');continue;}
    if(publicFact.brand!==brand||publicFact.country!=='KR'||publicFact.officialUrl!==capture.officialUrl||publicFact.price!==capture.price||publicFact.currency!==capture.currency||publicFact.imageSha256!==record.imageSha256){fault('PUBLIC_RECEIPT_CAPTURE_MISMATCH');continue;}
    const prior=producedEntries.get(code);
    if(prior&&prior.mtime===producer.mtime&&(prior.ledger.officialUrl!==typed.officialUrl||prior.ledger.image.sha256!==typed.image.sha256||prior.ledger.price!==typed.price)){fault('RUN_RECEIPT_IDENTITY_CONFLICT');continue;}
    if(!prior||prior.mtime<producer.mtime)producedEntries.set(code,{ledger:typed,public:publicFact,mtime:producer.mtime});
   }
  }
 }
 adapterMetrics.knownPublicVerified=latestPublic.size;adapterMetrics.sourcePendingReferences=pending.size;adapterMetrics.nativeSourcePendingReferences=nativePending.size;
 for(const code of latestPublic.keys())if(!references.has(code)){known.add(code);pending.add(code);}
 adapterMetrics.sourcePendingReferences=pending.size;
 const receiptDoc=read(`${canonical}/proof-receipt.json`);let receipt=null;
 if(!receiptDoc){adapterMetrics.proofReceiptMissing=1;diagnostic('PROOF_RECEIPT_MISSING');}
 else{
  const r=receiptDoc.data;
  if(!obj(r)||r.schemaVersion!==1||r.brand!==brand||r.country!=='KR'||!obj(r.inputHashes)||!obj(r.discoveryIndex)||!obj(r.ledger?.entries)||!obj(r.publicVerifiedFacts?.entries)||!obj(r.safety))fault('PROOF_RECEIPT_CORRUPT');
  else if(!receiptDoc.fresh||!fresh(Date.parse(r.checkedAt))||!indexDoc?.fresh||!ledgerDoc?.fresh)fault('PROOF_RECEIPT_STALE');
  else if(r.inputHashes.referenceIndex!==indexDoc.hash||r.inputHashes.ledger!==ledgerDoc.hash)fault('PROOF_RECEIPT_HASH_MISMATCH');
  else receipt=r;
 }
 const publicEntries={};
 for(const [code,pair]of producedEntries){
  const latest=latestPublic.get(code)?.row;
  if(!latest||latest.officialUrl!==pair.public.officialUrl||latest.price!==pair.public.price||latest.currency!==pair.public.currency){fault('PUBLIC_RECEIPT_CAPTURE_MISMATCH');continue;}
  known.add(code);if(!references.has(code))pending.add(code);
  if(references.has(code)&&references.get(code)!==pair.ledger.officialUrl){fault('RUN_RECEIPT_INDEX_MISMATCH');continue;}
  entries[code]=pair.ledger;publicEntries[code]=pair.public;
 }
 if(receipt){
  if(!Array.isArray(receipt.discoveryIndex.knownPublishedReferences)||receipt.discoveryIndex.knownPublishedReferences.length>50000)fault('PROOF_RECEIPT_CORRUPT');
  else for(const r of receipt.discoveryIndex.knownPublishedReferences){const code=typeof r==='string'?r:r?.code;if(validCode(code))known.add(code);else fault('PROOF_RECEIPT_CORRUPT');}
  for(const [code,typed]of Object.entries(receipt.ledger.entries)){
   if(!Object.hasOwn(nativeEntries,code)||!obj(typed)||typed.officialUrl!==references.get(code)||nativeEntries[code]?.officialUrl&&nativeEntries[code].officialUrl!==typed.officialUrl){fault('PROOF_RECEIPT_IDENTITY_MISMATCH');continue;}
   // Scope receipts cannot upgrade legacy item/image facts. Targets require
   // the exact processing-time projection bound to a real records.json.
   if(typed.classification==='target'){
    if(!publicEntries[code])diagnostic('TARGET_RUN_RECEIPT_REQUIRED');
    continue;
   }
   entries[code]=typed;
  }
  for(const [code,typed]of Object.entries(receipt.publicVerifiedFacts.entries)){
   const captured=latestPublic.get(code)?.row;
   if(!obj(typed)||!captured||typed.brand!==brand||typed.country!=='KR'||typed.officialUrl!==captured.officialUrl||typed.price!==captured.price||typed.currency!==captured.currency){fault('PUBLIC_RECEIPT_CAPTURE_MISMATCH');continue;}
   if(!publicEntries[code]){diagnostic('TARGET_RUN_RECEIPT_REQUIRED');continue;}
   if(!isDeepStrictEqual(typed,publicEntries[code]))fault('PUBLIC_RECEIPT_CAPTURE_MISMATCH');
  }
 }
 for(const code of Object.keys(nativeEntries))if(!producedEntries.get(code)?.ledger.image)adapterMetrics.imageReceiptMissing++;
 for(const code of latestPublic.keys())if(!publicEntries[code])adapterMetrics.publicReceiptMissing++;
 adapterMetrics.sourcePendingReferences=pending.size;
 if(producedEntries.size&&!receipt)diagnostic('DISCOVERY_PROOF_RECEIPT_MISSING');
 const expected=Math.max(known.size,Number.isSafeInteger(nativeIndex?.expectedCount)?nativeIndex.expectedCount:0,Number.isSafeInteger(receipt?.discoveryIndex.expectedCount)?receipt.discoveryIndex.expectedCount:0);
 const pure=auditOfficialReferenceCompleteness({brand,country:'KR',discoveryIndex:{references:[...references].map(([code,officialUrl])=>({code,officialUrl})),knownPublishedReferences:[...known],expectedCount:expected,discoveryComplete:!!(indexDoc?.fresh&&receipt?.discoveryIndex.discoveryComplete&&nativeIndex?.discoveryComplete!==false),scopeVerified:receipt?.discoveryIndex.scopeVerified===true,sample:nativeIndex?.sample===true,limitsReached:nativeIndex?.limitsReached===true,blocked:nativeIndex?.blocked},ledger:{entries,blocked:nativeLedger?.blocked},publicVerifiedFacts:{entries:publicEntries},safety:receipt?.safety??{guardrailsVerified:false,blocked:false}});
 const exitCode=faults.size||!receipt?1:pure.exitCode,complete=exitCode===0&&pure.complete;
 const summary=pure.summary.map((r,i)=>i===0?{...r,status:complete?'WHOLE_COMPLETE':exitCode===2?'CLASSIFICATION_ONLY_INCOMPLETE':'WHOLE_INCOMPLETE'}:r);
 const add=status=>summary.push({brand,country:'KR',parentModel:'로컬 증거 audit 집계',variantCode:'AUDIT',price:null,currency:'KRW',status,officialUrl:entry});
 add(`PUBLIC_CATALOG_VERIFIED_${adapterMetrics.knownPublicVerified}`);
 for(const [key,n]of Object.entries(adapterMetrics))add(`${key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()).toUpperCase()}_${n}`);
 for(const status of diagnostics)add(status);
 if(adapterMetrics.imageReceiptMissing) add('ORIGINAL_IMAGE_PROOF_UNVERIFIED');
 if(adapterMetrics.publicReceiptMissing) add('PUBLIC_TYPED_PROOF_UNVERIFIED');
 const result={complete,exitCode,metrics:pure.metrics,adapterMetrics,summary};
 if(Buffer.byteLength(JSON.stringify(result))>32768)throw Error('AUDIT_METRICS_LIMIT');
 function write(rel,value=summary,guard=true){
  const out=scoped(rel,true),parent=path.dirname(out);fs.mkdirSync(parent,{recursive:true,mode:0o700});scoped(path.relative(root,parent));scoped(rel,true);
  const tmp=path.join(parent,`.audit-${crypto.randomUUID()}.tmp`);fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});
  if(guard&&spawnSync(path.join(projectRoot,'scripts/crawl-output-guard.sh'),[tmp],{stdio:'ignore'}).status){fs.unlinkSync(tmp);throw Error('AUDIT_OUTPUT_GUARD_FAILED');}
  scoped(rel,true);fs.renameSync(tmp,out);
 }
 write(`${canonical}/summary.json`);if(currentOutput)write(path.relative(root,currentOutput));
 if(currentOutput&&exitCode!==0)write(path.relative(root,path.join(path.dirname(currentOutput),'failure.json')),{failureCode:'WHOLE_REFERENCE_INCOMPLETE',exitCode},false);
 return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--brand')throw Error('AUDIT_CLI_INVALID');
 const result=await auditOfficialReferenceCatalog({brand:process.argv[3]});process.exitCode=result.exitCode;
}
