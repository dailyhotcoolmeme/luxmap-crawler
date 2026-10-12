import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {classifyPradaCandidate,completenessReport} from '../crawler/common/catalog-completeness.js';
import {isPradaBag} from '../crawler/common/prada-product.js';
import {reportAuditFailure} from '../crawler/common/catalog-audit-alert.js';
const root=path.resolve(import.meta.dirname,'..'),state=path.join(root,'crawler/completeness/prada');
fs.mkdirSync(state,{recursive:true});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('server credential required');
const code=url=>decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase();
function run(script,args=[]){const r=spawnSync(path.join(root,script),args,{cwd:root,env:process.env,stdio:'ignore',timeout:10*60000});if(r.status!==0)throw Object.assign(Error('guarded audit stopped'),{exitCode:r.status===78?78:1});}
function pipeline(args){run('scripts/run-brand-country-pipeline.sh',['prada','kr','--crawl-only',...args]);const folder=path.join(root,'crawler/runs/prada/kr');const dir=path.join(folder,fs.readdirSync(folder).sort().at(-1));run('scripts/crawl-output-guard.sh',[path.join(dir,'summary.json')]);return dir;}
function nodeScript(script){const r=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,env:process.env,stdio:'ignore',timeout:10*60000});if(r.status!==0)throw Object.assign(Error('guarded graph audit stopped'),{exitCode:r.status===78?78:1});}
function summary(status){const file=path.join(state,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'prada',country:'KR',parentModel:'전체 공식 상품 누락 대조',variantCode:'AUDIT',price:null,currency:'KRW',status,officialUrl:'https://www.prada.com/kr/ko.html'}]));run('scripts/crawl-output-guard.sh',[file]);}
async function references(){const rows=[];for(let offset=0;;offset+=500){const page=await guardedRest(`rpc/crawler_korean_references?limit=500&offset=${offset}`,'POST',{p_brand:'prada'},key);rows.push(...page);if(page.length<500)return rows;}}
function artifact(dir,name){const file=path.join(dir,'artifacts',name),mode=fs.statSync(file).mode&0o777;try{fs.chmodSync(file,0o600);return JSON.parse(fs.readFileSync(file));}finally{fs.chmodSync(file,mode);}}
const ledgerFile=path.join(state,'ledger.json');let ledger={};
try{
 run('scripts/crawl-preflight.sh');run('scripts/token-safety-gate.sh');summary('DISCOVERING_INDEPENDENT_SOURCE');
 const cachedRepair=process.argv.includes('--verified-repair');let urls;
 if(cachedRepair){
  const reportFile=path.join(state,'report/summary.json');run('scripts/crawl-output-guard.sh',[reportFile]);
  if(fs.statSync(reportFile).mtimeMs<Date.now()-86400000)throw Error('verified source expired');
  urls=JSON.parse(fs.readFileSync(path.join(state,'universe-urls.json')));
  const report=JSON.parse(fs.readFileSync(reportFile));if(!report.some(row=>row.status===`DISCOVERED_${new Set(urls.map(code)).size}`))throw Error('verified source count mismatch');
 }else{
  const independent=pipeline(['--audit-discovery']),listed=pipeline(['--discover']);
  nodeScript('scripts/audit-prada-linked-codes.mjs');
  const linked=JSON.parse(fs.readFileSync(path.join(root,'crawler/prada-linked-code-audit/candidate-urls.json')));
  urls=[...new Map([...artifact(independent,'independent-urls.json'),...artifact(listed,'discovered-urls.json'),...linked].map(url=>[code(url),url])).values()];
 }
 if(!urls.length)throw Error('empty independent discovery');
 fs.writeFileSync(path.join(state,'universe-urls.json'),JSON.stringify(urls),{mode:0o600});
 const known=new Set((await references()).map(row=>row.normalized_code));
 if(fs.existsSync(ledgerFile))ledger=JSON.parse(fs.readFileSync(ledgerFile));
 // A verified exclusion is reusable for one day only. Missing detail never
 // becomes an exclusion. Priority affects order, never category admission.
 const fresh=Date.now()-24*60*60*1000;
 const candidates=urls.filter(url=>!known.has(code(url))&&!(ledger[code(url)]?.checkedAt>fresh&&['bag','excluded_nonbag'].includes(ledger[code(url)]?.decision))).sort((a,b)=>Number(/백|가방|토트|bag/i.test(decodeURIComponent(b)))-Number(/백|가방|토트|bag/i.test(decodeURIComponent(a))));
 const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/prada/countries/kr'))),batchSize=Math.min(100,config.maxProductsPerRun-10);
 if(!Number.isInteger(batchSize)||batchSize<1)throw Error('invalid audit batch limit');
 for(let offset=0;!cachedRepair&&offset<candidates.length;offset+=batchSize){
  summary(`CHECKING_${offset}_OF_${candidates.length}`);
  const file=path.join(state,'audit-batch-urls.json');fs.writeFileSync(file,JSON.stringify(candidates.slice(offset,offset+batchSize)),{mode:0o600});
  const dir=pipeline(['--prices-only','--inspect-linked-candidates','--urls-file',file]);
  for(const row of artifact(dir,'records.json'))ledger[row.normalizedCode]={decision:classifyPradaCandidate(row,isPradaBag),checkedAt:Date.now(),url:row.officialUrl};
  fs.writeFileSync(ledgerFile,JSON.stringify(ledger),{mode:0o600});
 }
 const decisions=new Map(Object.entries(ledger).filter(([,r])=>r.checkedAt>fresh).map(([code,r])=>[code,r.decision]));
 let report=completenessReport({discovered:urls.map(code),stored:known,decisions,discoveryVerified:true});
 const missing=report.missing.map(code=>urls.find(url=>code===decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));
 if(!process.argv.includes('--audit-only'))for(let offset=0;offset<missing.length;offset+=8){
  summary(`INGESTING_${offset}_OF_${missing.length}`);const file=path.join(state,'ingest-batch-urls.json');fs.writeFileSync(file,JSON.stringify(missing.slice(offset,offset+8)),{mode:0o600});
  run('scripts/run-brand-country-pipeline.sh',['prada','kr','--urls-file',file]);
 }
 const stored=new Set((await references()).map(row=>row.normalized_code));report=completenessReport({discovered:urls.map(code),stored,decisions,discoveryVerified:true});
 const results=[['DISCOVERED',report.discovered],['MISSING',report.missing.length],['UNRESOLVED',report.unresolved.length],['EXCLUDED',report.excluded.length]].map(([name,count])=>({brand:'prada',country:'KR',parentModel:'독립 색인 전체 대조',variantCode:'TOTAL',price:null,currency:'KRW',status:`${name}_${count}`,officialUrl:'https://www.prada.com/kr/ko.html'}));
 const folder=path.join(state,'report');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify(results));run('scripts/crawl-output-guard.sh',[file]);
 const pending=[...report.missing.map(code=>({code,status:'BAG_NOT_STORED'})),...report.unresolved.map(code=>({code,status:ledger[code]?.decision==='classification_pending'?'CLASSIFICATION_PENDING':'DETAIL_UNRESOLVED'}))];
 const pendingDir=path.join(state,'pending');fs.mkdirSync(pendingDir,{recursive:true});for(const name of fs.readdirSync(pendingDir).filter(n=>/^summary(?:-\d+)?\.json$/.test(n)))fs.unlinkSync(path.join(pendingDir,name));
 for(let offset=0;offset<pending.length;offset+=25){const file=path.join(pendingDir,offset===0?'summary.json':`summary-${offset/25}.json`);fs.writeFileSync(file,JSON.stringify(pending.slice(offset,offset+25).map(row=>({brand:'prada',country:'KR',parentModel:'공식 코드 대조 미해결',variantCode:row.code,price:null,currency:'KRW',status:row.status,officialUrl:urls.find(url=>code(url)===row.code)}))));run('scripts/crawl-output-guard.sh',[file]);}
 summary(report.complete?'COMPLETE':`INCOMPLETE_${pending.length}`);if(!report.complete)process.exitCode=1;
}catch(error){summary(error.exitCode===78?'SAFETY_POLICY_BLOCKED':'AUDIT_FAILED');process.exitCode=error.exitCode??1;}
if(process.exitCode){const file=path.join(state,'summary.json');run('scripts/crawl-output-guard.sh',[file]);await reportAuditFailure(JSON.parse(fs.readFileSync(file))[0],{queuePath:path.join(state,'alert-queue.json'),safetyBlocked:process.exitCode===78});}
