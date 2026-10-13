import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw new Error('service guard required');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw new Error('server credential required');
const source=process.env.GITHUB_ACTIONS==='true'?'github':'local';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const owner=`${source}:${randomUUID()}`;
const onboarding=process.argv.includes('--onboard-reference');
const foreign=process.argv.includes('--van-cleef-foreign');
if(foreign&&!['--van-cleef-foreign','--van-cleef-foreign --smoke'].includes(process.argv.slice(2).join(' ')))throw Error('invalid foreign arguments');
if(onboarding&&(process.argv.length!==3||process.argv[2]!=='--onboard-reference'))throw Error('invalid onboarding arguments');
const partial=foreign||onboarding||process.argv.includes('--smoke')||process.argv.includes('--countries')||process.argv.includes('--brands');
const rpc=async(name,args)=>{
 const response=await fetch(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('coordination request failed');
 return response.json();
};
const acquired=await rpc('acquire_crawler_execution',{p_owner:owner,p_source:source,p_day:day});
if(!acquired){
 // Explicit human-triggered diagnostics are read-only; never ingest or clear the daily failure budget.
 if(source==='github'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.argv.includes('--smoke')){
  const response=await fetch('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/crawler_execution_control?id=eq.catalog&select=failed_day,failed_sources,lease_until',{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)process.exit(3);
  const [state]=await response.json();
  if(state?.failed_day!==day||!state.failed_sources?.includes('github')||Date.parse(state.lease_until)>Date.now())process.exit(3);
  const brandIndex=process.argv.indexOf('--brands'),bottegaOnly=brandIndex>=0&&process.argv[brandIndex+1]==='bottega-veneta';
  const result=bottegaOnly?spawnSync(process.execPath,[path.join(root,'scripts/bottega-market.mjs'),'kr','--readonly-smoke'],{cwd:root,env:process.env,stdio:'ignore',timeout:90000,killSignal:'SIGTERM'}):spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['chanel','kr','--crawl-only','--probe-listing','--max-products','1','--navigation-retries','0'],{cwd:root,env:process.env,stdio:'ignore',timeout:90000,killSignal:'SIGTERM'});
  process.exit(result.status??1);
 }
 console.log('SKIPPED: active lease or completed daily run.');process.exit(3);
}
let child,timer,heartbeatFailed=false,renewing=false,killTimer,finished=false;
const stop=()=>{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer??=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);}};
try{
 child=spawn(process.execPath,[path.join(root,foreign?'scripts/van-cleef-foreign.mjs':onboarding?'scripts/jewelry-watch-onboarding.mjs':'scripts/crawler-daily.mjs'),...(foreign?process.argv.slice(3):onboarding?[]:process.argv.slice(2))],{cwd:root,env:process.env,detached:true,stdio:'ignore'});
 timer=setInterval(async()=>{if(renewing||finished)return;renewing=true;try{if(!await rpc('heartbeat_crawler_execution',{p_owner:owner})&&!finished)throw new Error('lost lease');}catch{if(!finished){heartbeatFailed=true;stop();}}finally{renewing=false;}},30000);
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{heartbeatFailed=true;stop();});
 const code=await new Promise(resolve=>{child.once('error',()=>{finished=true;resolve(1);});child.once('exit',code=>{finished=true;resolve(code??1);});});
 clearInterval(timer);
 const completed=code===0&&!heartbeatFailed&&!partial;
 if(!await rpc('release_crawler_execution',{p_owner:owner,p_day:day,p_complete:completed,p_failed:!partial&&!completed}))throw new Error('release failed');
 process.exitCode=heartbeatFailed?78:code;
}catch{
 stop();process.exitCode=1;
 try{await rpc('release_crawler_execution',{p_owner:owner,p_day:day,p_complete:false,p_failed:!partial});}catch{}
}finally{clearInterval(timer);clearTimeout(killTimer);}
