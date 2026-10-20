import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {crawlEvent,guardedSummaryRows} from '../crawler/common/operations-crawl-events.js';
import {spawnSync} from 'node:child_process';
import {scanCrawlEvents,startIssueReporter} from './sync-operations-crawl-issues.mjs';
const root=path.resolve(import.meta.dirname,'..'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'luxmap-issues-'));
const config={brand:'chanel',country:'KR',currency:'KRW',siteHosts:['www.chanel.com']},configs=new Map([['chanel:KR',config]]),row={brand:'chanel',country:'KR',variantCode:'AS1234',parentModel:'',price:null,currency:'KRW',status:'IMAGE_RECOVERY_FAILED',officialUrl:'https://www.chanel.com/kr/fashion/p/AS1234/'};
const options={configs,sourceKey:'fixture:1',observedAt:new Date().toISOString()};
assert.equal(crawlEvent(row,options).stage,'image');assert.equal(crawlEvent({...row,status:'PRICE_UNAVAILABLE'},options).outcome,'price_unavailable');assert.equal(crawlEvent({...row,status:'confirmed',price:100},options),null);assert.equal(crawlEvent({...row,variantCode:'RUN'},options),null);assert.equal(crawlEvent({...row,officialUrl:'https://evil.example/product'},options),null);assert.equal(crawlEvent({...row,officialUrl:'https://user:secret@www.chanel.com/'},options),null);
try{
 for(const folder of ['scripts','crawler/brands/chanel/countries','crawler/runs/chanel/kr/fixture'])await fs.mkdir(temporary+'/'+folder,{recursive:true});
 for(const script of ['crawl-output-guard.sh','crawler-env.sh'])await fs.copyFile(root+'/scripts/'+script,temporary+'/scripts/'+script);await fs.chmod(temporary+'/scripts/crawl-output-guard.sh',0o755);
 await fs.copyFile(root+'/crawler/guardrails.json',temporary+'/crawler/guardrails.json');await fs.writeFile(temporary+'/crawler/brands/chanel/countries/kr',JSON.stringify(config));await fs.writeFile(temporary+'/crawler/runs/chanel/kr/fixture/summary.json',JSON.stringify([row,{...row,variantCode:'AS1235',status:'PRICE_UNAVAILABLE'},{...row,variantCode:'TOTAL',status:'FAILED_2'}]));
 const scan=await scanCrawlEvents(temporary);assert.equal(scan.events.length,2);assert.equal(scan.guarded,1);
 const limits=JSON.parse(await fs.readFile(root+'/crawler/guardrails.json','utf8')).limits;for(const value of [[row],[{...row,html:'private'}],[{...row,status:'<html'}],[{...row,price:'100'}],[{...row,officialUrl:'http://example.test'}],null]){const bytes=Buffer.from(JSON.stringify(value)),file=temporary+'/contract.json';await fs.writeFile(file,bytes);const shell=spawnSync(temporary+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status===0;let cpu=true;try{guardedSummaryRows(bytes,limits);}catch{cpu=false;}assert.equal(cpu,shell,'CPU contract matches the existing shell guard');}
 const before=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';let calls=[];
 try{
  let reporter=await startIssueReporter({root:temporary,since:0,runKey:'fixture-run',transport:async url=>{assert.equal(new URL(url).hostname,'nxgnbrdxxmlhtcnymqsl.supabase.co');return new Response(null,{status:503});}});assert.equal((await reporter.stop()).failed,true,'unavailable database retains private outbox');
  reporter=await startIssueReporter({root:temporary,since:Date.now()+100000,runKey:'fixture-next-run',transport:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({accepted:2});}});assert.equal((await reporter.stop()).pending,0);assert.equal(calls[0].p_events.length,2,'next run replays retained events without original-site access');assert.equal(calls[0].p_finished,true);
 }finally{if(before===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=before;}
}finally{await fs.rm(temporary,{recursive:true,force:true});}
console.log('PASS: exact-SKU guarded events, failure/unavailability distinction, no parsed-success completion, source validation and durable outbox recovery without site requests');
