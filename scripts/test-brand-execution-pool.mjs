import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executeBrandPool,runBrandChild} from '../crawler/common/brand-execution-pool.js';
import {schedulePlan,executePlan} from '../crawler/common/schedule-plan.js';

const schedule={version:1,referenceCountry:'KR',discoverReferenceProducts:true,referenceAudits:{a:'scripts/a-audit.mjs',b:'scripts/b-audit.mjs',c:'scripts/c-audit.mjs'},jobs:['a','b','c'].flatMap(brand=>['kr','jp','fr'].map(country=>({brand,country,adapter:`scripts/${brand}-market.mjs`})))};
const plan=schedulePlan(schedule);
const key=job=>`${job.brand}/${job.phase}/${job.country}`;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Manually released jobs make the concurrency/order proof deterministic.
for(const concurrency of [1,2,3]){
 const pending=[],events=[];let active=0,peak=0;
 const execution=executeBrandPool(plan,job=>{
  active++;peak=Math.max(peak,active);events.push(key(job));
  return new Promise(resolve=>pending.push(()=>{active--;resolve({status:0});}));
 },{concurrency});
 await tick();assert.equal(active,concurrency);
 while(pending.length){pending.shift()();await tick();assert(active<=concurrency);}
 assert.equal(await execution,0);assert.equal(peak,concurrency);
 for(const brand of ['a','b','c'])assert.deepEqual(events.filter(event=>event.startsWith(`${brand}/`)),plan.filter(job=>job.brand===brand).map(key));
}
for(const concurrency of [0,4,1.5,NaN])await assert.rejects(executeBrandPool(plan,()=>assert.fail('must not start'),{concurrency}));

// Compare ordinary failure and audit-2 semantics to the existing serial flow.
for(const failure of ['a/discover/kr','a/audit/kr','a/refresh/kr','a/refresh/jp']){
 const serial=[],parallel=[];
 const status=job=>key(job)===failure?1:0;
 const oldCode=executePlan(plan,job=>{serial.push(key(job));return {status:status(job)};});
 const code=await executeBrandPool(plan,async job=>{parallel.push(key(job));return {status:status(job)};});
 assert.equal(code,oldCode);assert.deepEqual(parallel.toSorted(),serial.toSorted());
 assert.equal(parallel.filter(item=>item.startsWith('b/')).length,5);
 assert.equal(parallel.filter(item=>item===failure).length,1,'failed access is never retried');
}
let seen=[];
assert.equal(await executeBrandPool(plan,async job=>{seen.push(key(job));return {status:job.phase==='audit'?2:0};}),1);
assert.equal(seen.length,plan.length,'audit uncertainty remains failed without skipping registered references');

// Failure 78 cancels the other active group and all queued brands.
let cancelObserved=false,releaseSafety;
seen=[];
const safetyRun=executeBrandPool(plan,(job,{signal})=>{
 seen.push(key(job));
 if(job.brand==='a')return new Promise(resolve=>{releaseSafety=()=>resolve({status:78});});
 return new Promise(resolve=>signal.addEventListener('abort',()=>{cancelObserved=true;resolve({status:null,signal:'SIGTERM'});},{once:true}));
});
await tick();releaseSafety();assert.equal(await safetyRun,78);assert(cancelObserved);
assert.deepEqual(seen,['a/discover/kr','b/discover/kr']);
const runningCancellation=new AbortController();let activeCancelled=0;
const cancelRun=executeBrandPool(plan,(job,{signal})=>new Promise(resolve=>{
 signal.addEventListener('abort',()=>{activeCancelled++;resolve({status:null,signal:'SIGTERM'});},{once:true});
}),{signal:runningCancellation.signal});
await tick();runningCancellation.abort();
assert.equal(await cancelRun,78);assert.equal(activeCancelled,2);

const external=new AbortController();external.abort();
assert.equal(await executeBrandPool(plan,()=>assert.fail('cancelled queue must not start'),{signal:external.signal}),78);
for(const result of [{status:null,error:true},{status:null,signal:'SIGTERM'}]){
 assert.equal(await executeBrandPool(plan,async()=>result),78);
}

// Real local children only, no adapters/network/collection. One child ignores
// TERM so cancellation must escalate and await SIGKILL before returning.
const controller=new AbortController();
const fixtureDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'luxmap-brand-pool-test-'));
const ready=path.join(fixtureDirectory,'ready');
const stubborn=runBrandChild(process.execPath,['-e',"process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)",ready],{signal:controller.signal,killGraceMs:30});
try{
 const deadline=Date.now()+5000;
 while(!fs.existsSync(ready)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert(fs.existsSync(ready),'local fixture must install TERM handler before cancellation');
 controller.abort();const stopped=await stubborn;assert.equal(stopped.signal,'SIGKILL');
}finally{controller.abort();await stubborn;fs.rmSync(fixtureDirectory,{recursive:true,force:true});}
seen=[];
assert.equal(await executeBrandPool(plan,(job,context)=>{
 seen.push(key(job));
 return runBrandChild(process.execPath,['-e',job.brand==='a'?'setTimeout(()=>process.exit(78),100)':'setInterval(()=>{},1000)'],{...context,killGraceMs:30});
}),78);
assert.deepEqual(seen,['a/discover/kr','b/discover/kr']);
assert.equal((await runBrandChild(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:20,killGraceMs:20})).error,true);
assert.equal((await runBrandChild('/luxmap-test-missing-executable',[])).error,true);
console.log('PASS: concurrency 1/2/3 bound, Korean discovery/audit/refresh then countries, independent ordinary failures, audit-2 parity, no retries, 78 global active/queue abort, external cancellation and child TERM/KILL cleanup');
