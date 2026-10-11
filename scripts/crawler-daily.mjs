import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw new Error('scheduled service required');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
const limit=process.argv.includes('--smoke')?['--limit','1']:[];
let failed=false;
for(const job of schedule.jobs){
 if(!/^scripts\/[a-z0-9-]+\.mjs$/.test(job.adapter)||!/^[a-z0-9-]+$/.test(job.brand)||!/^[a-z]{2}$/.test(job.country))throw new Error('invalid scheduled job');
 const result=spawnSync(path.join(root,'scripts/with-supabase-env.sh'),[process.execPath,path.join(root,job.adapter),job.country,'--refresh',...limit],{cwd:root,env:process.env,stdio:'ignore',timeout:2*60*60*1000,killSignal:'SIGTERM'});
 if(result.status!==0)failed=true;
 if(result.status===78||result.signal||result.error)break;
}
process.exitCode=failed?1:0;
