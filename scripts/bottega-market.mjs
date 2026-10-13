import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..'),country=process.argv[2],args=process.argv.slice(3);
if(!['kr','jp','fr','it','es','us','sg','hk'].includes(country)||args.some(a=>!['--discover-reference','--refresh','--limit','1','--readonly-smoke'].includes(a)))throw Error('INVALID_MODE');
const smoke=args.includes('--limit')||args.includes('--readonly-smoke');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/bottega-veneta/countries',country))),jobFolder=path.join(root,'crawler/bottega-progress',country);
function report(status){fs.mkdirSync(jobFolder,{recursive:true});const file=path.join(jobFolder,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'bottega-veneta',country:cfg.country,parentModel:'등록된 일일 실행 상태',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_BLOCKED');}
function execute(script,params=[],acceptable=[0]){const result=spawnSync(script.endsWith('.sh')?path.join(root,script):process.execPath,script.endsWith('.sh')?params:[path.join(root,script),...params],{cwd:root,env:process.env,stdio:'ignore',timeout:2*60*60*1000});if(!acceptable.includes(result.status))throw Object.assign(Error('GUARDED_JOB_FAILED'),{exitCode:result.status===78||result.signal||result.error?78:1});return result.status;}
try{
 execute('scripts/crawl-preflight.sh');
 report('DAILY_ADAPTER_RUNNING');
 const referenceFile=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json');
 if(country!=='kr'||args.includes('--discover-reference')||!fs.existsSync(referenceFile))execute('scripts/bottega-reference-state.mjs',['pull']);
 else execute('scripts/crawl-output-guard.sh',[path.join(path.dirname(referenceFile),'summary.json')]);
 const folder=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata'),master=JSON.parse(fs.readFileSync(path.join(folder,'validated-products.json')));
 if(country==='kr'){
  if(args.includes('--discover-reference'))execute('scripts/continue-bottega-reference-discovery.mjs');
  else if(smoke){const file=path.join(folder,'smoke-urls.json');fs.writeFileSync(file,JSON.stringify([master[0].officialUrl]),{mode:0o600});execute('scripts/run-brand-country-pipeline.sh',['bottega-veneta','kr','--crawl-only','--metadata-only','--urls-file',file]);}
  else{execute('scripts/import-bottega-catalog.mjs',['--remaining']);execute('scripts/bottega-reference-state.mjs',['push']);}
 }else{
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/bottega-veneta/countries',country))),folder=path.join(root,'crawler/completeness/bottega-veneta/country-targets',country);fs.mkdirSync(folder,{recursive:true});const markets=[];
  for(let offset=0;;offset+=100){const rows=await guardedRest(`market_products?country_code=eq.${cfg.country}&select=official_product_code,official_url,current_price,currency_code&order=id&limit=100&offset=${offset}`);markets.push(...rows);if(rows.length<100)break;}
  const targets=master.map(r=>{const m=markets.find(m=>m.official_product_code===r.normalizedCode&&m.currency_code===cfg.currency&&m.official_url.startsWith(`https://www.bottegaveneta.com${cfg.localePrefix}`));return m?{normalizedCode:r.normalizedCode,sourceProductId:r.sourceProductId,parentModel:r.parentModel,officialUrl:m.official_url}:null;}).filter(Boolean);
  if(!targets.length)throw Error('PUBLISHED_COUNTRY_REFERENCE_MISSING');
  fs.writeFileSync(path.join(folder,'targets.json'),JSON.stringify(targets),{mode:0o600});const summary=path.join(folder,'summary.json');fs.writeFileSync(summary,JSON.stringify([{brand:'bottega-veneta',country:cfg.country,parentModel:'한국 기준 실제 국가 연결',variantCode:'TOTAL',price:null,currency:cfg.currency,status:`EXACT_DB_TARGETS_${targets.length}`,officialUrl:cfg.entryUrl}]));execute('scripts/crawl-output-guard.sh',[summary]);
  const sample=path.join(folder,'route-source-target.json');fs.writeFileSync(sample,JSON.stringify(targets.slice(0,1)),{mode:0o600});execute('scripts/run-brand-country-pipeline.sh',['bottega-veneta',country,'--crawl-only','--prices-only','--targets-file',sample],[0,1]);
  const base=path.join(root,'crawler/runs/bottega-veneta',country),dir=path.join(base,fs.readdirSync(base).sort().at(-1)),file=path.join(dir,'summary.json');execute('scripts/crawl-output-guard.sh',[file]);if(JSON.parse(fs.readFileSync(file)).some(r=>['ACCESS_BLOCKED','UNAUTHORIZED_URL','REQUEST_LIMIT','RESPONSE_LIMIT','REDIRECT_LIMIT'].includes(r.status)))throw Error('COUNTRY_SOURCE_BLOCKED');
  if(smoke)execute('scripts/run-brand-country-pipeline.sh',['bottega-veneta',country,'--crawl-only','--prices-from-published-route','--targets-file',sample]);
  else execute('scripts/collect-bottega-country-prices.mjs',[country,'--published-route',...(args.includes('--refresh')?[]:['--remaining'])]);
 }
 report(smoke?'SAMPLE_VERIFIED_NOT_FULL_CATALOG':'DAILY_PHASE_VERIFIED');
}catch(error){try{report(error.exitCode===78?'SAFETY_POLICY_BLOCKED':/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'DAILY_ADAPTER_FAILED');}catch{}process.exitCode=error.exitCode??1;}
