import assert from 'node:assert/strict';
import {catalogTargetBatches} from '../crawler/common/catalog-target-batches.js';
for(const count of [0,1,499,500,501,1098,2453]){
 const codes=Array.from({length:count},(_,i)=>`SKU${i}`),batches=catalogTargetBatches(codes);
 assert.deepEqual(batches.flat(),codes);assert.ok(batches.every(batch=>batch.length<=500));
}
assert.throws(()=>catalogTargetBatches(['SKU1','SKU1']));assert.throws(()=>catalogTargetBatches(['invalid-code']));
console.log('PASS: all targets retained in guarded batches of at most 500.');
