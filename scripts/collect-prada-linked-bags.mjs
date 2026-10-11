import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {isPradaBag} from '../crawler/common/prada-product.js';

const root=path.resolve(import.meta.dirname,'..');
const state=path.join(root,'crawler/prada-linked-ingest');
fs.mkdirSync(state,{recursive:true});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('server credential required');
function run(script,args=[]){
  const result=spawnSync(script.endsWith('.mjs')?process.execPath:path.join(root,script),script.endsWith('.mjs')?[path.join(root,script),...args]:args,{cwd:root,env:process.env,stdio:'ignore',timeout:10*60000});
  if(result.status!==0)throw Object.assign(Error('guarded linked collection failed'),{exitCode:result.status===78?78:1});
}
run('scripts/crawl-preflight.sh');
run('scripts/token-safety-gate.sh');
const cached=process.argv.includes('--approved-cached-candidates');
if(!cached)run('scripts/audit-prada-linked-codes.mjs');
run('scripts/inspect-prada-link-candidates.mjs',[cached?'--cached-only':'--fresh']);
const inspected=path.join(root,'crawler/prada-candidate-inspection');
run('scripts/crawl-output-guard.sh',[path.join(inspected,'report/summary.json')]);
const report=JSON.parse(fs.readFileSync(path.join(inspected,'report/summary.json')));
if(!report.some(row=>row.status==='UNPROCESSED_0'))throw Error('candidate inspection incomplete');
const bags=[];
for(const name of fs.readdirSync(path.join(inspected,'confirmed')).filter(n=>/^summary(?:-\d+)?\.json$/.test(n))){
  const file=path.join(inspected,'confirmed',name);run('scripts/crawl-output-guard.sh',[file]);
  bags.push(...JSON.parse(fs.readFileSync(file)).filter(row=>row.country==='KR'&&row.currency==='KRW'&&row.status==='confirmed'&&isPradaBag(row.parentModel)));
}
const expected=Number(report.find(row=>row.status.startsWith('CONFIRMED_BAG_NAMES_'))?.status.split('_').at(-1));
// Ignore obsolete chunks from a larger previous run; select only this input set.
const candidates=new Set(JSON.parse(fs.readFileSync(path.join(root,'crawler/prada-linked-code-audit/candidate-urls.json'))).map(url=>decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));
const selected=[...new Map(bags.filter(row=>candidates.has(row.variantCode)).map(row=>[row.variantCode,row])).values()];
if(selected.length!==expected)throw Error('confirmed bag count mismatch');
const references=[];
for(let offset=0;;offset+=500){const page=await guardedRest('rpc/crawler_korean_references?limit=500&offset='+offset,'POST',{p_brand:'prada'},key);references.push(...page);if(page.length<500)break;}
const known=new Set(references.map(row=>row.normalized_code)),missing=selected.filter(row=>!known.has(row.variantCode));
const codesFile=path.join(state,'reference-codes.json');
fs.writeFileSync(codesFile,JSON.stringify(missing.map(row=>row.variantCode)),{mode:0o600});
function progress(status){const file=path.join(state,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'prada',country:'KR',parentModel:'상세 연결 가방 보완',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://www.prada.com/kr/ko.html'}]));run('scripts/crawl-output-guard.sh',[file]);}
try{
  for(let i=0;i<missing.length;i+=8){
    progress(`INGESTING_${i}_OF_${missing.length}`);
    const file=path.join(state,'batch-urls.json');
    fs.writeFileSync(file,JSON.stringify(missing.slice(i,i+8).map(row=>row.officialUrl)),{mode:0o600});
    // Full Korean product + optimized image + guarded DB/R2 ingestion.
    // No recursive recommendation ingestion and no URL-slug family guessing.
    run('scripts/run-brand-country-pipeline.sh',['prada','kr','--urls-file',file]);
  }
  const verified=[];
  for(let offset=0;;offset+=500){const page=await guardedRest('rpc/crawler_korean_references?limit=500&offset='+offset,'POST',{p_brand:'prada'},key);verified.push(...page);if(page.length<500)break;}
  const stored=new Set(verified.map(row=>row.normalized_code));
  const absent=selected.filter(row=>!stored.has(row.variantCode));
  progress(absent.length?`UNPROCESSED_${absent.length}`:`STORED_${missing.length}_UNPROCESSED_0`);
  if(absent.length)throw Error('linked bag ingestion incomplete');
}catch(error){progress('LINKED_INGEST_FAILED');process.exitCode=error.exitCode??1;}
