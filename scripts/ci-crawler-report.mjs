import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
const rows=[];
for(const job of schedule.jobs){
 const dir=path.join(root,'crawler',`${job.country}-remaining`);
 const seed=path.join(dir,'urls-0.json');
 if(!fs.existsSync(seed))continue;
 const url=JSON.parse(fs.readFileSync(seed))[0];
 let status='unclassified';
 const log=path.join(dir,'batch-0.log');
 if(fs.existsSync(log)&&fs.statSync(log).size<=1048576){
  const text=fs.readFileSync(log,'utf8');
  status=text.includes('stored_and_verified')||text.includes('crawl and storage completed')?'stored':text.match(/(?:FAILED|BLOCKED): ([A-Z_]+)/)?.[1]||'pipeline_failed';
 }
 const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
 const summary=path.join(dir,'summary.json');
 if(status!=='stored'&&fs.existsSync(summary)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status===0){
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
