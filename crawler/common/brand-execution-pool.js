import {spawn} from 'node:child_process';

// This pool runs only inside the coordinator's existing shared lease.
export async function executeBrandPool(plan, run, {concurrency=2, signal}={}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw new Error('brand concurrency must be 1..3');
  const groups=new Map();
  for(const job of plan){
    if(!groups.has(job.brand))groups.set(job.brand,[]);
    groups.get(job.brand).push(job);
  }
  const queue=[...groups.values()],controller=new AbortController();
  let cursor=0,failed=false;
  const abortAll=()=>controller.abort();
  if(signal?.aborted)abortAll();
  signal?.addEventListener('abort',abortAll,{once:true});
  async function worker(){
    while(!controller.signal.aborted&&cursor<queue.length){
      const jobs=queue[cursor++];
      for(const job of jobs){
        if(controller.signal.aborted)break;
        let result;
        try{result=await run(job,{signal:controller.signal,abortAll});}
        catch{failed=true;abortAll();break;}
        if(result?.status!==0)failed=true;
        if(result?.status===78||result?.signal||result?.error||!Number.isInteger(result?.status)){
          abortAll();break;
        }
        // Match executePlan: audit 2 keeps uncertainty failed but permits
        // updates of already registered Korean references and their countries.
        if(job.country==='kr'&&result.status!==0&&!(result.status===2&&(job.phase==='audit'||['louis-vuitton','dior'].includes(job.brand))))break;
      }
    }
  }
  try{
    await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},()=>worker()));
    return controller.signal.aborted?78:failed?1:0;
  }finally{signal?.removeEventListener('abort',abortAll);}
}

// Separate process groups permit cancelling every descendant, including
// browsers. The daily runner forwards coordinator termination to this pool.
// Never pipe raw adapter output into the coordinator or model context.
export function runBrandChild(command,args,{signal,abortAll=()=>{},cwd,env=process.env,timeoutMs=2*60*60*1000,killGraceMs=3000}={}) {
  if(signal?.aborted)return Promise.resolve({status:null,signal:'SIGTERM'});
  return new Promise(resolve=>{
    let child,timeout,killTimer,result,closed=false,stopping=false,timedOut=false;
    const kill=kind=>{if(child?.pid){try{process.kill(-child.pid,kind);}catch{}}};
    const finish=()=>{
      clearTimeout(timeout);clearTimeout(killTimer);
      signal?.removeEventListener('abort',stop);
      resolve(timedOut?{status:null,error:true}:result);
    };
    const stop=()=>{
      if(stopping)return;
      stopping=true;kill('SIGTERM');
      // Keep escalation even if the wrapper exits first: descendants may
      // ignore TERM. Finish inside the outer coordinator's 5-second grace,
      // and do not release the lease until cleanup has completed.
      killTimer=setTimeout(()=>{kill('SIGKILL');killTimer=null;if(closed)finish();},killGraceMs);
    };
    try{child=spawn(command,args,{cwd,env,detached:true,stdio:'ignore'});}
    catch{resolve({status:null,error:true});return;}
    signal?.addEventListener('abort',stop,{once:true});
    child.once('error',()=>{result={status:null,error:true};});
    child.once('exit',status=>{if(status===78){abortAll();stop();}});
    child.once('close',(status,exitSignal)=>{
      result??={status,signal:exitSignal};closed=true;
      if(!stopping||killTimer===null)finish();
    });
    timeout=setTimeout(()=>{timedOut=true;abortAll();stop();},timeoutMs);
    if(signal?.aborted)stop();
  });
}
