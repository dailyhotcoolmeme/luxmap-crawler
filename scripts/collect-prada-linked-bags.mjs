import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {isPradaBag} from '../crawler/common/prada-product.js';

const root=path.resolve(import.meta.dirname,'..'),state=path.join(root,'crawler/prada-linked-ingest');
fs.mkdirSync(state,{recursive:true});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('server credential required');
function run(script,args=[]){
 const result=spawnSync(script.endsWith('.mjs')?process.execPath:path.join(root,script),script.endsWith('.mjs')?[path.join(root,script),...args]:args,{cwd:root,env:process.env,stdio:'ignore',timeout:10*60000});
 if(result.status!==0)throw Object.assign(Error('guarded linked collection failed'),{exitCode:result.status===78?78:1});
}
function progress(status){const file=path.join(state,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'prada',country:'KR',parentModel:'상세 연결 가방 보완',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://www.prada.com/kr/ko.html'}]));run('scripts/crawl-output-guard.sh',[file]);}
async function references(){const rows=[];for(let offset=0;;offset+=500){const page=await guardedRest('rpc/crawler_korean_references?limit=500&offset='+offset,'POST',{p_brand:'prada'},key);rows.push(...page);if(page.length<500)break;}return rows;}
const cached=process.argv.includes('--approved-cached-candidates'),codesFile=path.join(state,'reference-codes.json');
const targets=new Set(cached&&fs.existsSync(codesFile)?JSON.parse(fs.readFileSync(codesFile)):[]);
if(targets.size>500||[...targets].some(code=>typeof code!=='string'||!/^[A-Z0-9]+$/.test(code)))throw Error('invalid prior linked targets');
let added=0,closed=false;
try{
 run('scripts/crawl-preflight.sh');run('scripts/token-safety-gate.sh');
 // Validate exact official names before admitting linked items. Accessories
 // never become bags by a URL slug. Graph traversal has a hard pass limit.
 for(let pass=0;pass<8;pass++){
  progress(`CHECKING_LINKS_PASS_${pass+1}`);
  if(!cached||pass>0)run('scripts/audit-prada-linked-codes.mjs');
  run('scripts/inspect-prada-link-candidates.mjs',pass===0?[cached?'--cached-only':'--fresh']:[]);
  const inspected=path.join(root,'crawler/prada-candidate-inspection'),reportFile=path.join(inspected,'report/summary.json');
  run('scripts/crawl-output-guard.sh',[reportFile]);const report=JSON.parse(fs.readFileSync(reportFile));
  if(!report.some(row=>row.status==='UNPROCESSED_0'))throw Error('candidate inspection incomplete');
  const candidates=new Set(JSON.parse(fs.readFileSync(path.join(root,'crawler/prada-linked-code-audit/candidate-urls.json'))).map(url=>decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));
  const bags=[];
  for(const name of fs.readdirSync(path.join(inspected,'confirmed')).filter(n=>/^summary(?:-\d+)?\.json$/.test(n))){const file=path.join(inspected,'confirmed',name);run('scripts/crawl-output-guard.sh',[file]);bags.push(...JSON.parse(fs.readFileSync(file)).filter(row=>candidates.has(row.variantCode)&&row.country==='KR'&&row.currency==='KRW'&&row.status==='confirmed'&&isPradaBag(row.parentModel)));}
  const selected=[...new Map(bags.map(row=>[row.variantCode,row])).values()],expected=Number(report.find(row=>row.status.startsWith('CONFIRMED_BAG_NAMES_'))?.status.split('_').at(-1));
  if(selected.length!==expected)throw Error('confirmed bag count mismatch');
  const allBags=Number(report.find(row=>row.status.startsWith('VALID_BAG_NAMES_'))?.status.split('_').at(-1));
  if(allBags!==selected.length)throw Error('unpriced bag candidates remain unresolved');
  const known=new Set((await references()).map(row=>row.normalized_code)),missing=selected.filter(row=>!known.has(row.variantCode));
  for(const row of missing)targets.add(row.variantCode);
  if(targets.size>500)throw Error('linked target limit exceeded');
  fs.writeFileSync(codesFile,JSON.stringify([...targets]),{mode:0o600});
  if(!missing.length){closed=true;break;}
  for(let i=0;i<missing.length;i+=8){
   progress(`INGESTING_PASS_${pass+1}_${i}_OF_${missing.length}`);
   const file=path.join(state,'batch-urls.json');fs.writeFileSync(file,JSON.stringify(missing.slice(i,i+8).map(row=>row.officialUrl)),{mode:0o600});
   run('scripts/run-brand-country-pipeline.sh',['prada','kr','--urls-file',file]);
  }
  const stored=new Set((await references()).map(row=>row.normalized_code));
  if(selected.some(row=>!stored.has(row.variantCode)))throw Error('linked bag ingestion incomplete');
  added+=missing.length;
 }
 if(!closed)throw Error('linked graph pass limit reached');
 progress(`STORED_${added}_TARGETS_${targets.size}_MISSING_0`);
}catch(error){progress((error.failureCode??error.message??'LINKED_INGEST_FAILED').toUpperCase().replace(/[^A-Z0-9_]/g,'_').slice(0,40));process.exitCode=error.exitCode??1;}
