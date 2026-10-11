import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {schedulePlan,executePlan} from '../crawler/common/schedule-plan.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw new Error('scheduled service required');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
const plan=schedulePlan(schedule,{smoke:process.argv.includes('--smoke')});
process.exitCode=executePlan(plan,job=>{
 if(!/^scripts\/[a-z0-9-]+\.mjs$/.test(job.adapter)||!/^[a-z0-9-]+$/.test(job.brand)||!/^[a-z]{2}$/.test(job.country))throw new Error('invalid scheduled job');
 const result=spawnSync(path.join(root,'scripts/with-supabase-env.sh'),[process.execPath,path.join(root,job.adapter),job.country,...job.args],{cwd:root,env:process.env,stdio:'ignore',timeout:2*60*60*1000,killSignal:'SIGTERM'});
 return result;
});
