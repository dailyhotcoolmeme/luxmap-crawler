import assert from 'node:assert/strict';
import {runIdempotentStorage} from '../crawler/common/storage-recovery.js';
for(const status of [0,1,2,22,78,null]){
 let calls=0;assert.equal(runIdempotentStorage(()=>{calls++;return {status};}).status,status);assert.equal(calls,1);
}
for(const status of [7,28,52,56]){
 let calls=0;assert.equal(runIdempotentStorage(()=>{calls++;return {status};}).status,status);assert.equal(calls,3);
 calls=0;assert.equal(runIdempotentStorage(()=>({status:++calls===2?0:status})).status,0);assert.equal(calls,2);
}
console.log('PASS: only connection failures retried, maximum two retries; HTTP, safety, validation and signals never retried');
