import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||process.argv.slice(2).join(' ')!=='kr')throw Error('INVALID_AUDIT_MODE');
const result=spawnSync(process.execPath,[path.join(root,'scripts/network-isolate.mjs'),'["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0',process.execPath,path.join(root,'scripts/verify-jewelry-watch-catalog.mjs'),'--brand','van-cleef-arpels'],{cwd:root,env:process.env,stdio:'ignore',timeout:180000});
process.exitCode=result.signal||result.error?78:result.status??1;
