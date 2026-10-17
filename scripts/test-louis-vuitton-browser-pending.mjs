import assert from 'node:assert/strict';
import {pendingLouisVuittonBrowserDetails as pending} from '../crawler/common/louis-vuitton-browser.js';
const targets=new Map([['M29090','a'],['M29091','b'],['M29092','c'],['M29093','d']]);
assert.deepEqual(pending(targets,new Set(['M29091']),['M29092'],new Set(['M29090']),25),[['M29093','d']]);
assert.deepEqual(pending(targets,new Set(),[],new Set(targets.keys()),25),[]);
assert.equal(pending(targets,new Set(),[],new Set(),1).length,1);
console.log('PASS: browser fallback excludes API-priced, rendered and quarantined SKUs');
