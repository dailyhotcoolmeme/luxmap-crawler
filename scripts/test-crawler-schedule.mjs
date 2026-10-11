import assert from 'node:assert/strict';
import fs from 'node:fs';
import {schedulePlan,executePlan} from '../crawler/common/schedule-plan.js';
const schedule=JSON.parse(fs.readFileSync(new URL('../crawler/schedule.json',import.meta.url)));
const fullPlan=schedulePlan(schedule);
const plan=fullPlan.filter(job=>job.brand==='chanel');
for(const brand of new Set(schedule.jobs.map(job=>job.brand))){
 const jobs=fullPlan.filter(job=>job.brand===brand);
 assert.equal(jobs[0].country,'kr');assert.equal(jobs[0].phase,'discover');
 assert.equal(jobs[1].country,'kr');assert.equal(jobs[1].phase,'refresh');
 assert.equal(jobs.length,schedule.jobs.filter(job=>job.brand===brand).length+1);
}
assert.deepEqual(plan.map(j=>`${j.country}:${j.phase}`),['kr:discover','kr:refresh','jp:refresh','fr:refresh','it:refresh','es:refresh','us:refresh','sg:refresh','hk:refresh']);
let korean=['old'],foreign={};
assert.equal(executePlan(plan,job=>{
 if(job.phase==='discover')korean.push('new');
 else foreign[job.country]=[...korean];
 return {status:0};
}),0);
for(const country of ['jp','fr','it','es','us','sg','hk'])assert.deepEqual(foreign[country],['old','new']);
const reordered={...schedule,jobs:[...schedule.jobs].reverse()};
assert.equal(schedulePlan(reordered)[0].country,'kr');
const extended={...schedule,jobs:[...schedule.jobs,{brand:'chanel',country:'de',adapter:'scripts/chanel-jp-remaining.mjs'}]};
assert.equal(schedulePlan(extended).filter(job=>job.brand==='chanel').at(-1).country,'de');
assert.throws(()=>schedulePlan({...schedule,jobs:schedule.jobs.filter(j=>j.country!=='kr')}));
assert.throws(()=>schedulePlan({...schedule,referenceCountry:'JP'}));
for(const failure of [{status:1},{status:78},{status:null,signal:'SIGTERM'}]){
 let count=0;
 assert.equal(executePlan(plan,()=>{count++;return failure;}),1);
 assert.equal(count,1);
}
assert.equal(schedulePlan(schedule,{smoke:true}).length,schedule.jobs.length);
assert.ok(schedulePlan(schedule,{smoke:true}).every(job=>job.phase==='refresh'&&job.args.includes('--limit')));
console.log('PASS: Korean-first discovery, new product propagation, country addition and failure stops.');
