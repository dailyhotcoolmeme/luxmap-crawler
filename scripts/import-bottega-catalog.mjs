import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'crawler/runs/bottega-veneta/kr'),folder=path.join(root,'crawler/completeness/bottega-veneta/import');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
const dir=fs.readdirSync(base).sort().reverse().map(d=>path.join(base,d)).find(d=>fs.existsSync(path.join(d,'artifacts/catalog-source-products.json')));
if(!dir||spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(dir,'summary.json')],{stdio:'ignore'}).status||!JSON.parse(fs.readFileSync(path.join(dir,'summary.json'))).some(r=>r.status==='PUBLISHED_LISTING_TRAVERSAL_COMPLETE'))throw Error('GUARDED_DISCOVERY_REQUIRED');
const sample=process.argv.includes('--sample'),remaining=process.argv.includes('--remaining'),fresh=process.argv.includes('--fresh');if(process.argv.slice(2).some(a=>!['--sample','--remaining','--fresh'].includes(a))||(fresh&&(sample||remaining)))throw Error('INVALID_ARGUMENT');
const metadata=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata');
if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(metadata,'summary.json')],{stdio:'ignore'}).status)throw Error('METADATA_AUDIT_PENDING');
const validated=JSON.parse(fs.readFileSync(path.join(metadata,'validated-products.json')));
const since=fresh?fs.statSync(path.join(root,'crawler/completeness/bottega-veneta/audit-start.json')).mtimeMs:0;
const selected=sample?validated.filter(t=>t.normalizedCode==='874957V5ZZ14303'):fresh?validated.filter(t=>Date.parse(t.checkedAt)>=since):validated;
if(!selected.length||selected.some(t=>!t.officialCategories.includes('Bags')||!t.sourceImageUrl))throw Error('METADATA_AUDIT_PENDING');
const fullTargets=selected.map(t=>({sku:t.normalizedCode,url:t.officialUrl}));
let reusable=[];
if(remaining){const prepare=spawnSync(path.join(root,'scripts/with-supabase-env.sh'),['node','../scripts/prepare-bottega-storage-resume.mjs'],{cwd:root,env:{...process.env,LUXURY_LOAD_SERVICE_CREDENTIAL:'1'},stdio:'ignore'});if(prepare.status!==0)throw Error('DB_RESUME_UNVERIFIED');reusable=JSON.parse(fs.readFileSync(path.join(folder,'stored-codes.json')));}
const targets=selected.filter(t=>!reusable.includes(t.normalizedCode));
fs.mkdirSync(folder,{recursive:true});let stored=0;
const expectedFile=path.join(folder,sample?'sample-expected.json':'expected.json');fs.writeFileSync(expectedFile,JSON.stringify(fullTargets),{mode:0o600});
const save=status=>{const f=path.join(folder,'summary.json');fs.writeFileSync(f,JSON.stringify([{brand:'bottega-veneta',country:'KR',parentModel:'원본 누끼·R2·DB 적재',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://www.bottegaveneta.com/ko-kr'}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[f],{stdio:'ignore'}).status)throw Error('blocked');};
for(let offset=0;offset<targets.length;offset+=8){
 const batch=targets.slice(offset,offset+8),file=path.join(folder,'current-validated-records.json');fs.writeFileSync(file,JSON.stringify(batch),{mode:0o600});save(`PROCESSING_${offset}_OF_${targets.length}`);
 const log=fs.openSync(path.join(folder,`batch-${offset/8}.private-log`),'w',0o600);const child=spawn(path.join(root,'scripts/run-brand-country-pipeline.sh'),['bottega-veneta','kr','--cached-records-file',file],{cwd:root,env:{...process.env,LUXURY_SERVICE_STATE_DIR:folder},stdio:['ignore',log,log]});
 const timer=setInterval(()=>{try{if(fs.fstatSync(log).size>1048576)child.kill('SIGTERM');}catch{}},1000);
 const exit=await new Promise(resolve=>child.on('exit',code=>resolve(code)));clearInterval(timer);fs.closeSync(log);
 if(exit!==0){save(exit===78?'SAFETY_POLICY_BLOCKED':'IMPORT_FAILED');process.exitCode=exit??1;break;}
 const counts=JSON.parse(fs.readFileSync(path.join(folder,'ingest-counts.json')));if(counts.new+counts.changed+counts.unchanged!==batch.length)throw Error('INGEST_COUNT_MISMATCH');stored+=batch.length;save(`STORED_${stored}_OF_${targets.length}`);
}
if(stored===targets.length){save('INGEST_VERIFICATION_PENDING');const verify=spawnSync(path.join(root,'scripts/with-supabase-env.sh'),['node','../scripts/verify-bottega-catalog.mjs','--expected-file',expectedFile],{cwd:root,env:{...process.env,LUXURY_LOAD_SERVICE_CREDENTIAL:'1'},stdio:'ignore'});if(verify.status!==0){save('DB_VERIFICATION_FAILED');process.exitCode=1;}else save(sample?'SAMPLE_DB_AND_MEDIA_VERIFIED':'VALIDATED_BAGS_DB_MEDIA_VERIFIED');}
