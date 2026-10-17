import assert from 'node:assert/strict';
import {validLouisVuittonRelayHosts as valid} from '../crawler/common/louis-vuitton-relay-scope.js';
const base=['kr.louisvuitton.com','us.louisvuitton.com','api.louisvuitton.com'],proof=[{brand:'louis-vuitton',country:'SG',status:'PUBLISHED_ALTERNATE_SKUS_1',officialUrl:'https://sg.louisvuitton.com/eng-sg/products/fixture/M29090'}];
assert.equal(valid(base),true);assert.equal(valid([...base,'sg.louisvuitton.com'],proof),true);
assert.equal(valid([...base,'sg.louisvuitton.com']),false);assert.equal(valid([...base,'sg.louisvuitton.com','jp.louisvuitton.com'],proof),false);
assert.equal(valid([...base,'evil.louisvuitton.com'],proof),false);assert.equal(valid([...base,'geo.captcha-delivery.com'],proof),false);
assert.equal(valid([...base,'sg.louisvuitton.com'],[{...proof[0],country:'JP'}]),false);
assert.equal(valid([...base,'sg.louisvuitton.com'],[{...proof[0],officialUrl:'https://sg.louisvuitton.com@evil.test/'}]),false);
console.log('PASS: unchanged LV base plus one exact published country only; no arbitrary host or verification host');
