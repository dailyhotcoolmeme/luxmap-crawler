import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
const rows=[];
for(const job of schedule.jobs){
 if(job.brand==='bottega-veneta'){
  const jobFile=path.join(root,'crawler/bottega-progress',job.country,'summary.json');if(fs.existsSync(jobFile)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[jobFile],{stdio:'ignore'}).status===0)rows.push(...JSON.parse(fs.readFileSync(jobFile)));
  const file=job.country==='kr'?path.join(root,'crawler/completeness/bottega-veneta/summary.json'):path.join(root,'crawler/completeness/bottega-veneta/country-targets',job.country,'progress/summary.json');
  if(fs.existsSync(file)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status===0)rows.push(...JSON.parse(fs.readFileSync(file)));
  continue;
 }
 if(job.country==='kr')for(const name of ['summary.json','report/summary.json']){
  const file=path.join(root,'crawler/completeness',job.brand,name);
  if(fs.existsSync(file)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status===0)rows.push(...JSON.parse(fs.readFileSync(file)));
 }
 if(job.brand==='prada'){
  const report=path.join(root,'crawler/prada-progress',job.country,'report/summary.json');
  const progress=path.join(root,'crawler/prada-progress',job.country,'summary.json');
  if(fs.existsSync(report)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[report],{stdio:'ignore'}).status===0){rows.push(...JSON.parse(fs.readFileSync(report)));if(fs.existsSync(progress)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[progress],{stdio:'ignore'}).status===0){const first=JSON.parse(fs.readFileSync(progress))[0];if(first?.variantCode==='FAILED')rows.push(first);}continue;}
  if(fs.existsSync(progress)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[progress],{stdio:'ignore'}).status===0){rows.push(JSON.parse(fs.readFileSync(progress))[0]);continue;}
 }
 const dir=path.join(root,'crawler',`${job.country}-remaining`);
 const seed=job.brand==='chanel'?path.join(dir,'urls-0.json'):path.join(root,'crawler/prada-progress',job.country,'unused-seed.json');
 if(!fs.existsSync(seed)){
  const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
  const runs=path.join(root,'crawler/runs',job.brand,job.country);
  const latest=fs.existsSync(runs)?fs.readdirSync(runs).sort().at(-1):null;
  if(!latest)continue;
  const summary=path.join(runs,latest,'summary.json');
  const failure=path.join(runs,latest,'failure.json');
  if(fs.existsSync(summary)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status===0)rows.push(...JSON.parse(fs.readFileSync(summary)));
  else{
   let code=fs.existsSync(failure)?String(JSON.parse(fs.readFileSync(failure)).failureCode).replace(/^INCOMPLETE_/,''):'DISCOVERY_PIPELINE_FAILED';
   const network=path.join(runs,latest,'browser-network-status.json');
   if(fs.existsSync(network)){
    const state=JSON.parse(fs.readFileSync(network));
    if(state.status==='blocked')code='BROWSER_UNAUTHORIZED_NETWORK';
    else if(state.status==='upstream_failed'&&/^[A-Z0-9_]{1,25}$/.test(state.code))code=`UPSTREAM_${state.code}`;
   }
   rows.push({brand:job.brand,country:config.country,parentModel:'discovery diagnostic',variantCode:'listing',price:null,currency:config.currency,status:/^[A-Z0-9_]{1,40}$/.test(code)?code:'DISCOVERY_PIPELINE_FAILED',officialUrl:config.listingUrls[0]});
  }
  continue;
 }
 const url=JSON.parse(fs.readFileSync(seed))[0];
 let status='unclassified';
 const log=path.join(dir,'batch-0.log');
 if(fs.existsSync(log)&&fs.statSync(log).size<=1048576){
  const text=fs.readFileSync(log,'utf8');
  status=text.includes('stored_and_verified')||text.includes('crawl and storage completed')?'stored':text.match(/(?:FAILED|BLOCKED): ([A-Z0-9_]+)/)?.[1]||'pipeline_failed';
  if(status==='forbidden'||status==='runtime')status='TOKEN_PREFLIGHT_FAILED';
 }
 const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
 const summary=path.join(dir,'summary.json');
 if(['unclassified','pipeline_failed','UNKNOWN'].includes(status)&&fs.existsSync(summary)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status===0){
  const code=new URL(url).pathname.match(/\/p\/([^/]+)/)?.[1];
  const record=JSON.parse(fs.readFileSync(summary)).find(row=>row.variantCode===code);
  if(record)status=record.status;
 }
 rows.push({brand:job.brand,country:config.country,parentModel:'KR reference',variantCode:new URL(url).pathname.match(/\/p\/([^/]+)/)?.[1]||'unknown',price:null,currency:config.currency,status:status.slice(0,40),officialUrl:url});
}
fs.mkdirSync(path.join(root,'.ci-report'),{recursive:true});
const file=path.join(root,'.ci-report/summary.json');
fs.writeFileSync(file,JSON.stringify(rows));
if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0){fs.unlinkSync(file);throw new Error('CI summary blocked');}
