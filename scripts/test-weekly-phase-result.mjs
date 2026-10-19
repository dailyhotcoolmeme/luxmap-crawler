import assert from 'node:assert/strict';
import {domesticPhaseResult as result} from '../crawler/common/weekly-phase-result.js';
assert.equal(result({targetCodes:['A','B'],verifiedCodes:['A','B']}).exitCode,0);
assert.deepEqual(result({targetCodes:['A','B'],verifiedCodes:['A']}),{complete:false,missing:1,exitCode:2,status:'PHASE_SCOPE_INCOMPLETE'});
assert.equal(result({targetCodes:['A'],verifiedCodes:['A','FOREIGN']}).exitCode,2);
assert.equal(result({targetCodes:['A'],verifiedCodes:['A'],failed:true}).exitCode,2);
assert.equal(result({targetCodes:['NEW'],verifiedCodes:['NEW']}).missing,0);
assert.equal(result({targetCodes:['A'],verifiedCodes:['A'],sample:true}).status,'SAMPLE_NOT_FULL_CATALOG');
console.log('PASS: full phase requires exact requested scope; no unconditional failure or partial green');
