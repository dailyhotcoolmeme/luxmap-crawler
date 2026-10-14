import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {probePublishedScript} from './published-script-probe.js';
import {hermesProductDependencyUrls} from './hermes-product-chunk-proof.js';

// Read-only source discovery under ONE existing coordinator lease and proxy.
// Each request reuses the exact frozen source proof and single-GET transport.
export async function probeHermesProductDependencies(){
 const env=process.env,args=process.argv.slice(2),root=path.resolve(import.meta.dirname,'../..');
 if(env.CRAWL_MODE!=='deterministic-only'||env.LUXURY_PIPELINE_GUARD!=='enabled'||env.LUXURY_NETWORK_ISOLATED!=='enabled'||env.CRAWL_BRAND!=='hermes')throw Error('GUARDED_RUN_REQUIRED');
 if(args.length!==3||args[0]!=='--country-config'||args[2]!=='--probe-product-dependencies')throw Error('INVALID_PROBE_ARGS');
 const cfg=JSON.parse(await fs.readFile(args[1],'utf8'));
 const base=path.join(root,'crawler/runs/hermes/kr'),run=path.resolve(env.CRAWL_RUN_DIR??'');
 if(!run.startsWith(base+path.sep)||await fs.realpath(run)!==run)throw Error('RUN_SCOPE_INVALID');
 const all=hermesProductDependencyUrls();
 if(!Array.isArray(all)||all.length!==32||new Set(all).size!==32||!Number.isSafeInteger(cfg.maxRequestsPerRun)||cfg.maxRequestsPerRun<all.length)throw Error('DEPENDENCY_SCOPE_INVALID');
 // Exact successful sources already captured. Do not request them twice.
 const captured=new Set(['2681.3ca69cb105cc8c16.js','2276.18297d8cdcdb277c.js','1298.db55006e8b5c1943.js'].map(n=>'https://www.hermes.com/kr/ko/'+n));
 const row=(status,url='https://www.hermes.com/kr/ko/')=>({brand:'hermes',country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'',status,officialUrl:url});
 let priorSecurityDenied=false;
 const rows=[],priorErrors=new Set(),ids=(await fs.readdir(base)).filter(n=>/^\d{8}T\d{6}Z-\d+$/.test(n));
 if(ids.length>500)throw Error('PRIOR_RUN_LIMIT');
 for(const id of ids){
  const dir=path.join(base,id);if(dir===run)continue;
  if(await fs.realpath(dir)!==dir)throw Error('PRIOR_RUN_SCOPE');
  const summary=path.join(dir,'summary.json');let stat;
  try{stat=await fs.lstat(summary);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('PRIOR_SUMMARY_INVALID');
  if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('PRIOR_SUMMARY_GUARD');
  const events=JSON.parse(await fs.readFile(summary,'utf8')).filter(r=>r.brand==='hermes'&&r.country==='KR'&&all.includes(r.officialUrl));
  for(const event of events){
   if(event.status==='SCRIPT_FETCH_HTTP_200'&&events.some(r=>r.officialUrl===event.officialUrl&&r.status==='PUBLISHED_PRODUCT_CHUNK'))captured.add(event.officialUrl);
   if(/^(?:ACCESS_BLOCKED|SCRIPT_(?:HTTP_|REDIRECT|TIMEOUT|RESPONSE|ENCODING)|NON_JAVASCRIPT_RESPONSE)/.test(event.status))priorErrors.add(event.officialUrl);
   if(event.status==='ACCESS_BLOCKED')priorSecurityDenied=true;
  }
 }
 for(const url of priorErrors)rows.push(row('DEPENDENCY_PRIOR_ERROR_NOT_RETRIED',url));
 const urls=all.filter(url=>!captured.has(url)&&!priorErrors.has(url));
 const folder=path.join(run,'dependencies');await fs.mkdir(folder,{mode:0o700});
 const started=Date.now();let bytes=0,requests=0,failed=priorErrors.size>0;
 for(const [index,url]of urls.entries()){
  if(priorSecurityDenied){rows.push(row('DEPENDENCY_PRIOR_BLOCK_NOT_RETRIED'));failed=true;break;}
  if(Date.now()-started>240000){rows.push(row('DEPENDENCY_BATCH_TIME_LIMIT'));failed=true;break;}
  const child=path.join(folder,String(index).padStart(3,'0'));await fs.mkdir(child,{mode:0o700});
  if(bytes>=67108864){rows.push(row('DEPENDENCY_BATCH_BYTES_LIMIT'));failed=true;break;}
  const result=await probePublishedScript({env:{...env,CRAWL_RUN_DIR:child},args:['--country-config',args[1],'--probe-product-chunk','--source-run',path.join(base,'20261014T152003Z-93283'),'--script-url',url],config:{...cfg,maxResponseBytes:Math.min(cfg.maxResponseBytes,67108864-bytes)}});
  requests+=result.requests;bytes+=result.bytes;
  const summary=path.join(child,'summary.json');
  if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
  rows.push(...JSON.parse(await fs.readFile(summary,'utf8')));
  // A failed transfer may have received partial bytes that are not returned by
  // the single-file transport. Stop on EVERY failure to preserve the hard cap.
  if(result.failureCode){failed=true;break;}
  if(bytes>=67108864){rows.push(row('DEPENDENCY_BATCH_BYTES_LIMIT'));failed=true;break;}
 }
 rows.push(row(`DEPENDENCY_REQUESTS_${requests}`),row(`DEPENDENCY_BYTES_${bytes}`));
 if(requests!==urls.length){rows.push(row(`DEPENDENCY_UNPROCESSED_${urls.length-requests}`));failed=true;}
 const summary=path.join(run,'summary.json');await fs.writeFile(summary,JSON.stringify(rows),{mode:0o600,flag:'wx'});
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD_FAILED');
 if(failed)await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:'DEPENDENCY_BATCH_INCOMPLETE'}),{mode:0o600,flag:'wx'});
 process.exitCode=failed?1:0;
}
