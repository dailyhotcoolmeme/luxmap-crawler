import assert from 'node:assert/strict';
import {inspectHermesImageUrl, hermesPublishedImageUrl, hermesOriginalImageUrl, hermesImagePropertiesUrl} from '../crawler/common/hermes-image-url.js';
const code='H073428CKO5';
const front='https://assets.hermes.com/is/image/hermesproduct/lindy-26-%EB%B0%B1--073428CKO5-front-wm-1-0-0-1000-1000_g.jpg';
const small=front.replace('1000-1000','320-320');
assert.equal(inspectHermesImageUrl(front,code).originalVerified,false);
assert.equal(inspectHermesImageUrl(small,code).renditionWidth,320);
assert.equal(hermesPublishedImageUrl(front,code,[front,small]),front);
assert.equal(hermesImagePropertiesUrl(front,code,[front]),front+'?req=props');
assert.equal(hermesImagePropertiesUrl(small,code,[small]),small+'?req=props');
assert.throws(()=>hermesImagePropertiesUrl(front,code,[small]),/NOT_PUBLISHED/);
assert.throws(()=>hermesOriginalImageUrl(front+'?req=props',code,[front+'?req=props']),/REFERENCE/);
assert.throws(()=>hermesPublishedImageUrl(front,code,[small]),/NOT_PUBLISHED/);
assert.throws(()=>hermesOriginalImageUrl(front,code,[front]),/ORIGINAL_SOURCE_UNVERIFIED/);
assert.throws(()=>hermesOriginalImageUrl(small,code,[small]),/ORIGINAL_SOURCE_UNVERIFIED/);
assert.throws(()=>inspectHermesImageUrl(front,'H073428CK89'),/SKU/);
for(const value of [
 front.replace('https:','http:'),front.replace('assets.hermes.com','assets.hermes.com.evil.invalid'),
 front.replace('assets.hermes.com','user@assets.hermes.com'),front.replace('assets.hermes.com','assets.hermes.com:443'),
 front+'?wid=2000',front+'#original',front+'\n',front.replace('1000-1000','2000-2000'),
 front.replace('-1000-1000',''),front.replace('front-wm-1','front-wm-4'),
 front.replace('1000-1000','1000-320'),front.replace('/hermesproduct/','/hermesproduct/%2e%2e/'),
 front.replace('/hermesproduct/','/hermesproduct/temp/../'),
 front.replace('lindy-26-','lindy%2f26-'),front.replace('073428CKO5','073428CKO5OTHER'),
 'https://assets.hermes.com/is/image/hermesproduct/073428CKO5_thumbnail_20?wid=65',
]) assert.throws(()=>inspectHermesImageUrl(value,code));
assert.throws(()=>inspectHermesImageUrl(front,'073428CKO5'));
console.log('PASS: Hermes published rendition validation, exact SKU, hostile URL rejection, original fail-closed; no network');
