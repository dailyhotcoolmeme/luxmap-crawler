import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'crawler/runs/bottega-veneta/kr'),folder=path.join(root,'crawler/completeness/bottega-veneta/discovery-progress');
if(process.argv.length!==2||spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
fs.mkdirSync(folder,{recursive:true});
const guarded=file=>spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status===0;
const save=status=>{const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify([{brand:'bottega-veneta',country:'KR',parentModel:'한국 공식 목록 연속 수집',variantCode:'RUN',price:null,currency:'KRW',status,officialUrl:'https://www.bottegaveneta.com/ko-kr'}]));if(!guarded(file))throw Error('blocked');};
let state;
for(let batch=0;batch<20;batch++){
 const before=new Set(fs.existsSync(base)?fs.readdirSync(base):[]),args=['bottega-veneta','kr','--crawl-only','--discover-catalog'];if(state)args.push('--discovery-state-file',state);
 save(`DISCOVERY_BATCH_${batch}`);const fd=fs.openSync(path.join(folder,`batch-${batch}.private-log`),'w',0o600);
 const child=spawn(path.join(root,'scripts/run-brand-country-pipeline.sh'),args,{cwd:root,env:process.env,detached:true,stdio:['ignore',fd,fd]});let blocked=false;
 const stop=()=>{blocked=true;if(child.pid)try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}};
 const timer=setInterval(()=>{if(fs.fstatSync(fd).size>1048576)stop();},1000),timeout=setTimeout(stop,600000);
 const result=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});clearInterval(timer);clearTimeout(timeout);fs.closeSync(fd);
 if(blocked||result===78){save('SAFETY_POLICY_BLOCKED');process.exit(78);}
 const newRuns=fs.readdirSync(base).filter(n=>!before.has(n));if(newRuns.length!==1){save('DISCOVERY_RUN_UNVERIFIED');process.exit(1);}
 const run=path.join(base,newRuns[0]),file=path.join(run,'summary.json');if(!guarded(file)){save('DISCOVERY_SUMMARY_UNVERIFIED');process.exit(1);}const rows=JSON.parse(fs.readFileSync(file));
 if(rows.some(r=>r.status==='DISCOVERY_BATCH_PENDING')){state=path.join(run,'artifacts/catalog-discovery-state.json');continue;}
 if(result===0&&rows.some(r=>r.status==='PUBLISHED_LISTING_TRAVERSAL_COMPLETE')){save('PUBLISHED_LISTING_TRAVERSAL_COMPLETE');process.exit(0);}
 save(rows.some(r=>/^UNRESOLVED_LISTING_REFERENCES_/.test(r.status))?'LISTING_REFERENCE_RESOLUTION_PENDING':'DISCOVERY_SOURCE_FAILED');process.exit(1);
}
save('DISCOVERY_BATCH_LIMIT_BLOCKED');process.exit(78);
