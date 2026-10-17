import assert from 'node:assert/strict';
import {runCatalogWorkflow,classifyCatalogRun,catalogImageKey,heldCatalogItem,catalogItemFailureKind,prepareCatalogItems} from '../crawler/common/catalog-workflow.js';
const source=(key,operation=key)=>({key,operation});
async function scenario({sources=[],results={},snapshots=[{complete:false,ready:0}],state={version:1,attempts:{}},interrupted=false}={}){
 const calls=[],saved=[];let reconciled=0;
 const result=await runCatalogWorkflow({state,save:async s=>saved.push(structuredClone(s)),reconcile:async()=>{calls.push('reconcile');return snapshots[Math.min(reconciled++,snapshots.length-1)];},plan:async()=>sources,execute:async s=>{calls.push(s.key);const r=results[s.key];if(r instanceof Error)throw r;return r??{kind:'success',saved:0,reason:'SOURCE_PASS_FINISHED'};},cancelled:()=>interrupted});
 return {result,calls,saved,state};
}
let t=await scenario();assert.equal(t.result.code,2);assert.equal(t.result.status,'FOLLOWUP_SOURCE_REQUIRED');
t=await scenario({snapshots:[{complete:true,ready:0}],sources:[source('unused')]});assert.deepEqual(t.calls,['reconcile']);assert.equal(t.result.code,0);
t=await scenario({sources:[source('http'),source('approved-browser')],results:{http:{kind:'access',saved:0,reason:'ACCESS_BLOCKED'},'approved-browser':{kind:'success',saved:1,reason:'SOURCE_PASS_FINISHED'}},snapshots:[{complete:false,ready:0},{complete:true,ready:0}]});
assert.deepEqual(t.calls,['reconcile','http','approved-browser','reconcile']);assert.equal(t.result.code,0);
t=await scenario({sources:[source('partial')],results:{partial:{kind:'access',saved:3,reason:'ACCESS_BLOCKED'}}});assert.deepEqual(t.calls,['reconcile','partial','reconcile']);assert.equal(t.result.code,2);
t=await scenario({sources:[source('unsafe'),source('must-not-run')],results:{unsafe:{kind:'safety',saved:3,reason:'BROWSER_UNAUTHORIZED_NETWORK'}}});assert.deepEqual(t.calls,['reconcile','unsafe']);assert.equal(t.result.code,78);
t=await scenario({sources:[source('guard-error'),source('must-not-run')],results:{'guard-error':Error('SUMMARY_GUARD')}});assert.equal(t.result.code,78);assert.deepEqual(t.calls,['reconcile','guard-error']);
const persistent={version:1,attempts:{'http:evidence1':{status:'access'}}};
t=await scenario({state:persistent,sources:[source('http:evidence1')]});assert.deepEqual(t.calls,['reconcile']);assert.equal(t.result.code,2);
t=await scenario({state:persistent,sources:[source('http:evidence2')]});assert.deepEqual(t.calls,['reconcile','http:evidence2']);
t=await scenario({sources:[source('interrupted-old')],state:{version:1,attempts:{'interrupted-old':{status:'STARTED'}}}});assert.deepEqual(t.calls,['reconcile']);
t=await scenario({sources:[source('busy')],results:{busy:{kind:'lease',saved:0,reason:'COORDINATOR_BUSY'}}});assert.equal(t.result.code,3);assert.equal(t.state.attempts.busy,undefined);
t=await scenario({interrupted:true,sources:[source('not-run')]});assert.equal(t.result.code,130);assert.deepEqual(t.calls,[]);
t=await scenario({snapshots:[{complete:false,ready:4}]});assert.equal(t.result.status,'INGEST_PENDING');assert.equal(t.result.code,2);
t=await scenario({snapshots:[{complete:false,ready:4,eligible:0}]});assert.equal(t.result.status,'FOLLOWUP_IMAGE_EVIDENCE_REQUIRED');
const product={code:'M29090',images:[{url:'https://kr.louisvuitton.com/images/fixture.jpg'}]},held={M29090:{imageKey:catalogImageKey(product)}};
assert.equal(heldCatalogItem(product,held),true);assert.equal(heldCatalogItem({...product,images:[{url:'https://kr.louisvuitton.com/images/new-fixture.jpg'}]},held),false);
assert.equal(catalogItemFailureKind('IMAGE_NETWORK_TIMEOUT'),'ordinary');assert.equal(catalogItemFailureKind('IMAGE_ACCESS_BLOCKED'),'access');assert.equal(catalogItemFailureKind('REFERENCE_IDENTITY'),'safety');assert.equal(catalogItemFailureKind('IMAGE_REFERENCE_MISMATCH'),'safety');assert.equal(catalogItemFailureKind('CUTOUT_FAILED'),'safety');
const prepared=[],failed=[];const next={...product,code:'M29091'};
assert.deepEqual(await prepareCatalogItems([product,next],{process:async s=>{if(s.code===product.code)throw Error('IMAGE_NETWORK_TIMEOUT');prepared.push(s.code);},onFailure:(e,s)=>failed.push(s.code)}),{completed:1,failed:1});assert.deepEqual(prepared,['M29091']);assert.deepEqual(failed,['M29090']);
let imageCalls=0;await prepareCatalogItems([product],{held,process:async()=>imageCalls++,onFailure:()=>{}});assert.equal(imageCalls,0);
for(const reason of ['IMAGE_ACCESS_BLOCKED','REFERENCE_IDENTITY','BROWSER_UNAUTHORIZED_NETWORK']){const attempted=[];await assert.rejects(prepareCatalogItems([product,next],{process:async s=>{attempted.push(s.code);throw Error(reason);},onFailure:()=>assert.fail('fatal errors must not become ordinary item failures')}),new RegExp(reason));assert.deepEqual(attempted,['M29090']);}
assert.deepEqual(classifyCatalogRun(1,[{status:'NORMAL_RENDERED_DOCUMENT_SAVED'},{status:'ACCESS_BLOCKED'}]),{kind:'access',saved:1,reason:'ACCESS_BLOCKED'});
assert.equal(classifyCatalogRun(78,[{status:'NORMAL_RENDERED_DOCUMENT_SAVED'}]).kind,'safety');
assert.equal(classifyCatalogRun(1,[{status:'PRODUCT_DATA_UNAVAILABLE'}]).kind,'parser');
assert.equal(classifyCatalogRun(1,[{status:'REFERENCE_IDENTITY'}]).kind,'parser');
assert.equal(classifyCatalogRun(1,[{status:'BROWSER_UNAUTHORIZED_NETWORK'}]).kind,'safety');
assert.equal(classifyCatalogRun(0,[{status:'NO_ADDITIONAL_LIST_ITEMS'}]).kind,'success');
console.log('PASS: workflow fallback, partial materialization, persistent no-repeat, safety, lease, interruption and completion');
