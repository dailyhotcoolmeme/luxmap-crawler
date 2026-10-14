import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditOfficialReferenceCompleteness as audit} from '../crawler/common/official-reference-completeness.js';

const brands={hermes:['bag','https://www.hermes.com/kr/ko/'],dior:['bag','https://www.dior.com/ko_kr/'],'saint-laurent':['bag','https://www.ysl.com/ko-kr/'],bulgari:['jewelry','https://www.bulgari.com/ko-kr/']};
function fixture(brand='bulgari',count=1){
 const [category,entry]=brands[brand],references=[],entries={},publicEntries={};
 for(let i=0;i<count;i++){
  const code=String(323532+i),officialUrl=`${entry}fixture-${code}.html`,sha256=i.toString(16).padStart(64,'0');references.push({code,officialUrl});
  entries[code]={classification:'target',detailVerified:true,exactReferenceVerified:true,classificationEvidenceVerified:true,state:'ingested',category,officialUrl,currency:'KRW',price:4990000,priceStatus:'confirmed',image:{originalSourceVerified:true,cpuOfflineVerified:true,outputVerified:true,processingVersion:'original-cutout-v1',sourceUrl:'https://www.bulgari.com/on/demandware.static/fixture.png',sha256,width:960,height:960,hasAlpha:true}};
  publicEntries[code]={status:'PUBLIC_CATALOG_VERIFIED',brand,country:'KR',category,officialUrl,currency:'KRW',price:4990000,identityVerified:true,priceVerified:true,primaryImageVerified:true,imageSha256:sha256};
 }
 return {brand,country:'KR',discoveryIndex:{discoveryComplete:true,scopeVerified:true,references,knownPublishedReferences:references.map(v=>v.code),expectedCount:count},ledger:{entries},publicVerifiedFacts:{entries:publicEntries},safety:{guardrailsVerified:true,blocked:false}};
}
const first=v=>v.ledger.entries['323532'];
const publicFirst=v=>v.publicVerifiedFacts.entries['323532'];
function uncertain(input,code='AN852593'){
 const url=brands[input.brand][1]+code+'.html';input.discoveryIndex.references.push({code,officialUrl:url});input.discoveryIndex.knownPublishedReferences.push(code);input.discoveryIndex.expectedCount++;
 input.ledger.entries[code]={classification:'unresolved',detailVerified:true,exactReferenceVerified:true,failureStage:'classification',officialUrl:url,state:'unresolved'};
 return input;
}
let checks=0;
const test=(name,fn)=>{fn();checks++;};
for(const brand of Object.keys(brands))test(brand+' all evidence',()=>{const r=audit(fixture(brand));assert.equal(r.exitCode,0);assert.equal(r.complete,true);assert.equal(r.metrics.publicVerified,1);});
test('classification alone is status 2',()=>{const r=audit(uncertain(fixture()));assert.equal(r.exitCode,2);assert.equal(r.complete,false);assert.equal(r.metrics.classificationOnlyUncertain,1);});
test('unprocessed is status 1',()=>{const v=fixture();delete v.ledger.entries['323532'];const r=audit(v);assert.equal(r.exitCode,1);assert.equal(r.metrics.unprocessed,1);});
test('explicit unprocessed remains status 1',()=>{const v=fixture();first(v).state='unprocessed';assert.equal(audit(v).metrics.unprocessed,1);});
test('known target missing overrides classification status 2',()=>{const v=uncertain(fixture());first(v).state='missing';const r=audit(v);assert.equal(r.exitCode,1);assert.equal(r.metrics.confirmedMissing,1);});
test('detail failure is not class-only',()=>{const v=uncertain(fixture());v.ledger.entries.AN852593.detailVerified=false;const r=audit(v);assert.equal(r.exitCode,1);assert.equal(r.metrics.detailUnresolved,1);});
test('wrong failure stage cannot become status 2',()=>{const v=uncertain(fixture());v.ledger.entries.AN852593.failureStage='network';assert.equal(audit(v).exitCode,1);});
test('image original is mandatory',()=>{const v=fixture();first(v).image.originalSourceVerified=false;const r=audit(v);assert.equal(r.metrics.imageUnverified,1);assert.equal(r.metrics.publicVerified,0);assert.equal(r.exitCode,1);});
test('15 prices do not replace original images',()=>{const v=fixture('bulgari',15);Object.values(v.ledger.entries).forEach(e=>delete e.image);const r=audit(v);assert.equal(r.metrics.imageUnverified,15);assert.equal(r.metrics.publicVerified,0);assert.equal(r.complete,false);assert.equal(r.exitCode,1);});
test('21 verified of 137 is never whole complete',()=>{const v=fixture('bulgari',21);v.discoveryIndex.knownPublishedReferences.push(...Array.from({length:116},(_,i)=>'AN'+String(852000+i)));v.discoveryIndex.expectedCount=137;const r=audit(v);assert.equal(r.metrics.expected,137);assert.equal(r.metrics.coverageGap,116);assert.equal(r.metrics.unprocessed,116);assert.equal(r.metrics.publicVerified,21);assert.equal(r.exitCode,1);});
test('aggregate expected count still exposes unnamed gap',()=>{const v=fixture('bulgari',21);v.discoveryIndex.expectedCount=137;const r=audit(v);assert.equal(r.metrics.coverageGap,116);assert.equal(r.metrics.unprocessed,116);assert.equal(r.exitCode,1);});
test('omitting independent known universe is invalid',()=>{const v=fixture();delete v.discoveryIndex.knownPublishedReferences;assert.equal(audit(v).exitCode,1);});
test('discovery false blocks fully verified target',()=>{const v=fixture();v.discoveryIndex.discoveryComplete=false;assert.equal(audit(v).exitCode,1);});
test('scope false blocks narrow success',()=>{const v=fixture();v.discoveryIndex.scopeVerified=false;assert.equal(audit(v).exitCode,1);});
for(const flag of ['sample','limitsReached'])test(flag+' cannot complete',()=>{const v=fixture();v.discoveryIndex[flag]=true;assert.equal(audit(v).exitCode,1);});
test('global block overrides classification-only',()=>{const v=uncertain(fixture());v.safety.blocked=true;const r=audit(v);assert.equal(r.exitCode,1);assert(r.metrics.safetyBlocks>0);});
test('entry HTTP block cannot be relabeled classification',()=>{const v=uncertain(fixture());v.ledger.entries.AN852593.status='ACCESS_BLOCKED';assert.equal(audit(v).exitCode,1);});
test('token violation overrides valid image/public facts',()=>{const v=fixture();v.safety.tokenViolation=true;assert.equal(audit(v).exitCode,1);});
test('collector index blocked marker is a hard failure',()=>{const v=fixture();v.discoveryIndex.blocked='ACCESS_BLOCKED';assert.equal(audit(v).exitCode,1);});
test('malformed discovery flags do not silently pass',()=>{const v=fixture();v.discoveryIndex.sample='true';assert.equal(audit(v).exitCode,1);});
test('public scope explicitly incomplete is a hard failure',()=>{const v=fixture();v.publicVerifiedFacts.complete=false;assert.equal(audit(v).exitCode,1);});
test('missing guard proof fails closed',()=>{const v=fixture();delete v.safety;assert.equal(audit(v).exitCode,1);});
test('public missing has its own metric',()=>{const v=fixture();delete v.publicVerifiedFacts.entries['323532'];const r=audit(v);assert.equal(r.metrics.publicUnverified,1);assert.equal(r.exitCode,1);});
for(const field of ['brand','country','category','officialUrl','currency','price','imageSha256'])test('public '+field+' mismatch',()=>{const v=fixture();publicFirst(v)[field]=field==='price'?100:'wrong';assert.equal(audit(v).exitCode,1);});
for(const field of ['identityVerified','priceVerified','primaryImageVerified'])test('public '+field+' proof required',()=>{const v=fixture();publicFirst(v)[field]=false;assert.equal(audit(v).exitCode,1);});
for(const field of ['cpuOfflineVerified','outputVerified','hasAlpha'])test('image '+field+' proof required',()=>{const v=fixture();first(v).image[field]=false;assert.equal(audit(v).exitCode,1);});
test('wrong cutout size/version is not original processing',()=>{const v=fixture();first(v).image.processingVersion='legacy';first(v).image.width=820;assert.equal(audit(v).exitCode,1);});
test('published missing price is allowed with matching public null',()=>{const v=fixture();first(v).price=null;first(v).priceStatus='price_unavailable';publicFirst(v).price=null;assert.equal(audit(v).exitCode,0);});
test('missing price without unavailable proof is invalid',()=>{const v=fixture();first(v).price=null;delete first(v).priceStatus;assert.equal(audit(v).exitCode,1);});
test('verified exclusion needs no image or public target',()=>{const v=fixture();Object.assign(first(v),{classification:'excluded',state:'excluded',exclusionReasonVerified:true});delete first(v).image;delete v.publicVerifiedFacts.entries['323532'];const r=audit(v);assert.equal(r.exitCode,0);assert.equal(r.metrics.excludedVerified,1);});
test('unverified exclusion cannot hide a known candidate',()=>{const v=fixture();Object.assign(first(v),{classification:'excluded',state:'excluded',exclusionReasonVerified:false});assert.equal(audit(v).exitCode,1);});
test('category mismatch is invalid',()=>{const v=fixture();first(v).category='bag';assert.equal(audit(v).exitCode,1);});
test('duplicate code with conflicting URLs is invalid',()=>{const v=fixture();v.discoveryIndex.references.push({code:'323532',officialUrl:brands.bulgari[1]+'different.html'});assert.equal(audit(v).exitCode,1);});
test('duplicate identical source reference counts once',()=>{const v=fixture();v.discoveryIndex.references.push({...v.discoveryIndex.references[0]});assert.equal(audit(v).metrics.discovered,1);assert.equal(audit(v).exitCode,0);});
test('foreign URL cannot masquerade as KR',()=>{const v=fixture();v.discoveryIndex.references[0].officialUrl='https://www.bulgari.com/ja-jp/323532.html';assert.equal(audit(v).exitCode,1);});
test('understated expected universe is invalid',()=>{const v=fixture();v.discoveryIndex.expectedCount=0;assert.equal(audit(v).exitCode,1);});
test('AN reference is never normalized into a numeric SKU',()=>{const v=fixture();v.discoveryIndex.knownPublishedReferences.push('AN323532');v.discoveryIndex.expectedCount=2;assert.equal(audit(v).metrics.coverageGap,1);});
test('aggregate inputs without exact facts do not count as public verified',()=>{const v=fixture();v.publicVerifiedFacts={publicVerified:1,entries:{}};assert.equal(audit(v).metrics.publicVerified,0);});
test('invalid shapes and inherited brand names fail closed',()=>{for(const v of [null,{},[],{brand:'toString'},{brand:'__proto__'}])assert.equal(audit(v).exitCode,1);});
test('input objects remain unchanged',()=>{const v=uncertain(fixture()),before=structuredClone(v);audit(v);assert.deepEqual(v,before);});
test('aggregate result stays bounded at 10000 references',()=>{const v=fixture('bulgari',10000),r=audit(v);assert.equal(r.exitCode,0);assert.equal(r.metrics.publicVerified,10000);assert(new TextEncoder().encode(JSON.stringify(r)).length<32768);assert(!JSON.stringify(r).includes('fixture-323532'));});
test('summary passes repository token guard and contains aggregate rows only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-reference-audit-'));
 try{const r=audit(uncertain(fixture())),file=path.join(dir,'summary.json');fs.writeFileSync(file,JSON.stringify(r.summary));assert.equal(spawnSync(path.resolve(import.meta.dirname,'crawl-output-guard.sh'),[file],{stdio:'ignore'}).status,0);assert(r.summary.every(row=>row.variantCode==='AUDIT'&&row.price===null&&row.status.length<=40));}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(`PASS: ${checks} pure four-brand audit fixtures, classification-only status 2, coverage, original image/public evidence, safety and bounded summaries`);
