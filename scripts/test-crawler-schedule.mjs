import assert from 'node:assert/strict';
import fs from 'node:fs';
import {schedulePlan,executePlan,scheduleCalendar,isScheduledDay} from '../crawler/common/schedule-plan.js';
const schedule=JSON.parse(fs.readFileSync(new URL('../crawler/schedule.json',import.meta.url)));
assert.equal(schedule.hour,9);assert.equal(schedule.minute,0);
assert(fs.readFileSync(new URL('../.github/workflows/crawler.yml',import.meta.url),'utf8').includes("cron: '0 0 * * 1'"));
assert(scheduleCalendar(schedule).every(interval=>interval.Weekday===1));
assert(isScheduledDay(schedule,new Date('2026-10-19T00:00:00Z')));
assert(!isScheduledDay(schedule,new Date('2026-10-18T14:59:59Z')));
assert(isScheduledDay(schedule,new Date('2026-10-18T15:00:00Z')),'weekday uses Seoul, not UTC');
assert(!isScheduledDay(schedule,new Date('2026-10-19T15:00:00Z')));
assert.throws(()=>scheduleCalendar({...schedule,weekday:2}));
assert.throws(()=>scheduleCalendar({...schedule,frequency:'daily'}));
assert.throws(()=>scheduleCalendar({...schedule,timeZone:'UTC'}));
const fullPlan=schedulePlan(schedule);
const plan=fullPlan.filter(job=>job.brand==='chanel');
for(const brand of new Set(schedule.jobs.map(job=>job.brand))){
 const jobs=fullPlan.filter(job=>job.brand===brand);
 assert.equal(jobs[0].country,'kr');assert.equal(jobs[0].phase,'discover');
 assert.equal(jobs[1].country,'kr');assert.equal(jobs[1].phase,'audit');
 assert.equal(jobs[2].country,'kr');assert.equal(jobs[2].phase,'refresh');
 assert.equal(jobs.length,schedule.jobs.filter(job=>job.brand===brand).length+2);
}
assert.deepEqual(plan.map(j=>`${j.country}:${j.phase}`),['kr:discover','kr:audit','kr:refresh','jp:refresh','fr:refresh','it:refresh','es:refresh','us:refresh','sg:refresh','hk:refresh']);
let korean=['old'],foreign={};
assert.equal(executePlan(plan,job=>{
 if(job.phase==='discover')korean.push('new');
 else if(job.phase==='refresh')foreign[job.country]=[...korean];
 return {status:0};
}),0);
for(const country of ['jp','fr','it','es','us','sg','hk'])assert.deepEqual(foreign[country],['old','new']);
const reordered={...schedule,jobs:[...schedule.jobs].reverse()};
assert.equal(schedulePlan(reordered)[0].country,'kr');
const extended={...schedule,jobs:[...schedule.jobs,{brand:'chanel',country:'de',adapter:'scripts/chanel-jp-remaining.mjs'}]};
assert.equal(schedulePlan(extended).filter(job=>job.brand==='chanel').at(-1).country,'de');
assert.throws(()=>schedulePlan({...schedule,jobs:schedule.jobs.filter(j=>j.country!=='kr')}));
assert.throws(()=>schedulePlan({...schedule,referenceCountry:'JP'}));
assert.throws(()=>schedulePlan({...schedule,referenceAudits:{chanel:schedule.referenceAudits.chanel}}));
assert.throws(()=>schedulePlan({...schedule,jobs:[...schedule.jobs,{brand:'unreviewed',country:'kr',adapter:'scripts/prada-market.mjs'}]}));
for(const failure of [{status:1},{status:78},{status:null,signal:'SIGTERM'}]){
 let count=0;
 assert.equal(executePlan(plan,()=>{count++;return failure;}),1);
 assert.equal(count,1);
}
assert.equal(schedulePlan(schedule,{smoke:true}).length,schedule.jobs.length);
assert.ok(schedulePlan(schedule,{smoke:true}).every(job=>job.phase==='refresh'&&job.args.includes('--limit')));
const visited=[];assert.equal(executePlan(fullPlan,job=>{visited.push(`${job.brand}/${job.country}`);return {status:job.brand==='chanel'?1:0};}),1);
assert.deepEqual(visited.filter(id=>id.startsWith('chanel/')),['chanel/kr']);assert.equal(visited.filter(id=>id.startsWith('prada/')).length,10);
const auditVisited=[];
assert.equal(executePlan(plan,job=>{auditVisited.push(job.phase);return {status:job.phase==='audit'?1:0};}),1);
assert.deepEqual(auditVisited,['discover','audit']);
const uncertainVisited=[];
assert.equal(executePlan(plan,job=>{uncertainVisited.push(job.phase);return {status:job.phase==='audit'?2:0};}),1);
assert.ok(uncertainVisited.includes('refresh'));
let stopped=0;assert.equal(executePlan(fullPlan,()=>{stopped++;return {status:78};}),1);assert.equal(stopped,1);
console.log('PASS: Korean-first discovery, new product propagation, country addition and failure stops.');
