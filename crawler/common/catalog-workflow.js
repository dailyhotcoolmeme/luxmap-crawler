// Source adapters provide evidence-backed work. This loop never invents a URL,
// retries a refused request, or equates a batch exit code with completion.
import {createHash} from 'node:crypto';
export function catalogImageKey(source){
 const url=source?.images?.[0]?.url;if(typeof url!=='string'||!url.startsWith('https://'))throw Error('IMAGE_SOURCE_IDENTITY');
 return createHash('sha256').update('original-cutout-v1|'+url).digest('hex');
}
export const heldCatalogItem=(source,held)=>held?.[source.code]?.imageKey===catalogImageKey(source);
export const catalogItemFailureKind=message=>/UNAUTHORIZED|LIMIT|GUARD|SCOPE|IDENTITY|MISMATCH|SANDBOX|WORKER|RUNTIME|OFFLINE|CUTOUT|MASK/.test(message)?'safety':/BLOCKED|DENIED|CAPTCHA/.test(message)?'access':'ordinary';
export async function prepareCatalogItems(items,{held={},process,onFailure}){
 let completed=0,failed=0;
 for(const item of items){
  if(heldCatalogItem(item,held)){failed++;await onFailure(Error('REFERENCE_ITEM_HELD'),item);continue;}
  try{await process(item);completed++;}catch(error){if(catalogItemFailureKind(error.message)!=='ordinary')throw error;failed++;await onFailure(error,item);}
 }
 return {completed,failed};
}
export function classifyCatalogRun(code,rows){
 const statuses=rows.map(r=>r.status),saved=rows.filter(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED').length;
 const kind=code===78||statuses.some(s=>/UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX/.test(s))?'safety':
  statuses.some(s=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(s))?'access':
  statuses.some(s=>/IDENTITY|MISMATCH|CLASSIFICATION|UNVERIFIED|DATA_UNAVAILABLE/.test(s))?'parser':
  code===3?'lease':code===0?'success':'execution';
 return {kind,saved,reason:statuses.find(s=>/BLOCKED|DENIED|FAILED|MISMATCH|UNVERIFIED|UNAVAILABLE|REQUIRED/.test(s))??(code===0?'SOURCE_PASS_FINISHED':'SOURCE_EXECUTION_FAILED')};
}

export async function runCatalogWorkflow({state,save,reconcile,plan,execute,cancelled=()=>false}){
 state.version=1;state.attempts??={};
 const persist=async status=>{state.status=status;await save(state);};
 if(cancelled()){await persist('INTERRUPTED_PENDING');return {status:state.status,code:130};}
 let current=await reconcile();state.local=current;await persist('LOCAL_RECONCILED');
 if(current.complete){await persist('CATALOG_COMPLETE');return {status:state.status,code:0};}
 for(;;){
  if(cancelled()){await persist('INTERRUPTED_PENDING');return {status:state.status,code:130};}
  const candidates=await plan(),next=candidates.find(s=>!state.attempts[s.key]);
  if(!next){await persist((current.eligible??current.ready)>0?'INGEST_PENDING':current.ready>0?'FOLLOWUP_IMAGE_EVIDENCE_REQUIRED':'FOLLOWUP_SOURCE_REQUIRED');return {status:state.status,code:2};}
  // Persist before execution: interruption must not silently repeat a request.
  state.attempts[next.key]={status:'STARTED',operation:next.operation};await persist('SOURCE_RUNNING');
  let result;try{result=await execute(next);}catch(error){const reason=/^[A-Z0-9_]{1,40}$/.test(error?.message??'')?error.message:'SOURCE_EXECUTION_FAILED';result={kind:/GUARD|POLICY|UNAUTHORIZED|LIMIT|SANDBOX/.test(reason)?'safety':'execution',saved:0,reason};}
  state.attempts[next.key]={status:result.kind,operation:next.operation,reason:result.reason};await persist('SOURCE_'+result.kind.toUpperCase());
  if(result.kind==='safety'){await persist('SAFETY_STOP');return {status:state.status,code:78};}
  if(cancelled()){await persist('INTERRUPTED_PENDING');return {status:state.status,code:130};}
  if(result.kind==='lease'){delete state.attempts[next.key];await persist('COORDINATOR_BUSY');return {status:state.status,code:3};}
  // A failed source may already contain valid partial documents. Materialize
  // and ingest those before selecting another genuinely executable adapter.
  if(result.saved>0){current=await reconcile();state.local=current;await persist('LOCAL_RECONCILED');if(current.complete){await persist('CATALOG_COMPLETE');return {status:state.status,code:0};}}
 }
}
