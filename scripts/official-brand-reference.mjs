import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),[brand,mode,offset]=process.argv.slice(2);
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||brand!=='bulgari'||!['--batch-offset','--recover-source-run'].includes(mode)||(mode==='--batch-offset'&&!/^\d+$/.test(offset??''))||process.argv.length!==5)throw Error('GUARDED_REFERENCE_REQUIRED');
const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',mode,offset],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000,killSignal:'SIGTERM'});
process.exitCode=child.status??1;
