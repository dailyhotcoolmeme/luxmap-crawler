import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {reportAuditFailure} from '../crawler/common/catalog-audit-alert.js';
const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'crawler/completeness/bottega-veneta'),base=path.join(root,'crawler/runs/bottega-veneta/kr');
if(process.argv.length!==2||spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
const guard=f=>spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[f],{stdio:'ignore'}).status===0;
const sourceDir=fs.readdirSync(base).sort().reverse().map(n=>path.join(base,n)).find(d=>fs.existsSync(path.join(d,'artifacts/catalog-source-products.json')));if(!sourceDir||!guard(path.join(sourceDir,'summary.json'))||!JSON.parse(fs.readFileSync(path.join(sourceDir,'summary.json'))).some(r=>r.status==='PUBLISHED_LISTING_TRAVERSAL_COMPLETE'))throw Error('DISCOVERY_UNVERIFIED');
const known=JSON.parse(fs.readFileSync(path.join(folder,'reconciled-metadata/validated-products.json'))),source=JSON.parse(fs.readFileSync(path.join(sourceDir,'artifacts/catalog-source-products.json'))),urls=new Set([...source.map(r=>r.url),...known.filter(r=>!source.some(s=>s.sku===r.normalizedCode)).map(r=>r.officialUrl)]);
const save=status=>{const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'bottega-veneta',country:'KR',parentModel:'당일 공식 목록·기존 한국 참조 전체 대조',variantCode:'AUDIT',price:null,currency:'KRW',status,officialUrl:'https://www.bottegaveneta.com/ko-kr'}]));if(!guard(file))throw Error('blocked');};
fs.writeFileSync(path.join(folder,'audit-start.json'),JSON.stringify({startedAt:new Date().toISOString()}),{mode:0o600});
for(let i=0;i<urls.size;i+=20){
 const file=path.join(folder,'audit-urls.json');fs.writeFileSync(file,JSON.stringify([...urls].slice(i,i+20)),{mode:0o600});save(`METADATA_${i}_OF_${urls.size}`);
 const fd=fs.openSync(path.join(folder,`audit-${i}.private-log`),'w',0o600),result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['bottega-veneta','kr','--crawl-only','--metadata-only','--urls-file',file],{cwd:root,env:process.env,stdio:['ignore',fd,fd],timeout:600000});fs.closeSync(fd);
 if(result.status===78||result.signal||result.error){save('SAFETY_POLICY_BLOCKED');process.exit(78);}
 const dir=path.join(base,fs.readdirSync(base).sort().at(-1)),f=path.join(dir,'summary.json');if(!guard(f)){save('AUDIT_RESULT_UNVERIFIED');process.exit(1);}const rows=JSON.parse(fs.readFileSync(f));if(rows.some(r=>['ACCESS_BLOCKED','UNAUTHORIZED_URL','REQUEST_LIMIT','RESPONSE_LIMIT','REDIRECT_LIMIT'].includes(r.status))){save('AUDIT_SOURCE_BLOCKED');process.exit(1);}
}
const result=spawnSync(process.execPath,[path.join(root,'scripts/reconcile-bottega-metadata.mjs'),'--preserve-stored-references','--fresh-only'],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});if(![0,2].includes(result.status)){save('REFERENCE_AUDIT_FAILED');process.exit(result.status===78?78:1);}
const file=path.join(folder,'reconciled-metadata/summary.json');if(!guard(file))throw Error('blocked');const rows=JSON.parse(fs.readFileSync(file)),pending=Number(rows.find(r=>r.status.startsWith('PENDING_'))?.status.slice(8));if(!Number.isFinite(pending))throw Error('invalid audit');
save(pending?`REFERENCE_AUDIT_UNCERTAIN_${pending}`:'REFERENCE_AUDIT_VERIFIED');process.exitCode=pending?2:0;
if(pending)await reportAuditFailure(JSON.parse(fs.readFileSync(path.join(folder,'summary.json')))[0],{queuePath:path.join(folder,'alert-queue.json')}).catch(()=>{});
