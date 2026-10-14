import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [brand,mode,...args]=process.argv.slice(2);
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!['hermes','dior','saint-laurent','bulgari'].includes(brand))throw Error('coordinated official probe required');
const supported={
 '--inspect-navigation':0,'--probe-source':0,'--probe-listing-source':0,'--discover-candidates':0,
 '--discover-reference':0,
 '--probe-sitemap-source':0,
 '--probe-product-source':2,
 '--batch-offset':1,
 '--probe-image-properties':4,
 '--audit-reference':0,
 '--probe-published-script':4,
 '--inspect-listing':2,'--inspect-detail-evidence':2,
};
if(!(mode in supported)||args.length!==supported[mode])throw Error('invalid probe mode');
const child=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),[brand,'kr','--crawl-only',mode,...args],{cwd:root,env:process.env,stdio:'ignore',timeout:600000,killSignal:'SIGTERM'});
process.exitCode=child.status??1;
