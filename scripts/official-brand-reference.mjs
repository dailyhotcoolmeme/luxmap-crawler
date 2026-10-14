import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),[brand,mode,offset]=process.argv.slice(2);
const hermesBatch=brand==='hermes'&&mode==='--recover-source-run'&&process.argv.length===7&&process.argv[5]==='--batch-offset'&&/^\d+$/.test(process.argv[6]??'');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!['bulgari','hermes'].includes(brand)||(brand==='hermes'&&mode!=='--recover-source-run')||!['--batch-offset','--recover-source-run'].includes(mode)||(mode==='--batch-offset'&&!/^\d+$/.test(offset??''))||(!hermesBatch&&process.argv.length!==5))throw Error('GUARDED_REFERENCE_REQUIRED');
const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',...process.argv.slice(3)],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000,killSignal:'SIGTERM'});
process.exitCode=child.status??1;
