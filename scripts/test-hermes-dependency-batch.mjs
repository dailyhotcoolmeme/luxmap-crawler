import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const fixture=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'luxury-dependency-test-')));
for(const dir of ['crawler/common','scripts','crawler/runs/hermes/kr'])fs.mkdirSync(path.join(fixture,dir),{recursive:true});
fs.writeFileSync(path.join(fixture,'package.json'),'{"type":"module"}');
fs.copyFileSync(path.join(root,'crawler/common/hermes-product-dependencies-probe.js'),path.join(fixture,'crawler/common/hermes-product-dependencies-probe.js'));
fs.writeFileSync(path.join(fixture,'scripts/crawl-output-guard.sh'),'#!/bin/sh\nexit 0\n',{mode:0o700});
const prefix='https://www.hermes.com/kr/ko/';
const known=['2681.3ca69cb105cc8c16.js','2276.18297d8cdcdb277c.js','1298.db55006e8b5c1943.js'];
const urls=[...known,...Array.from({length:29},(_,i)=>`fixture-${i}.js`)].map(n=>prefix+n);
fs.writeFileSync(path.join(fixture,'crawler/common/hermes-product-chunk-proof.js'),`export const hermesProductDependencyUrls=()=>${JSON.stringify(urls)};`);
fs.writeFileSync(path.join(fixture,'crawler/common/published-script-probe.js'),`
import fs from 'node:fs/promises';import path from 'node:path';
export async function probePublishedScript({env,args,config}){
 const url=args.at(-1),failureCode=process.env.MOCK_FAIL_URL===url?(process.env.MOCK_FAIL_CODE||'ACCESS_BLOCKED'):null;
 await fs.appendFile(process.env.MOCK_CALLS,JSON.stringify({url,cap:config.maxResponseBytes})+'\\n');
 const row=status=>({brand:'hermes',country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'',status,officialUrl:url});
 await fs.writeFile(path.join(env.CRAWL_RUN_DIR,'summary.json'),JSON.stringify(failureCode?[row(failureCode)]:[row('PUBLISHED_PRODUCT_CHUNK'),row('SCRIPT_FETCH_HTTP_200')]));
 return {requests:1,bytes:failureCode?0:Number(process.env.MOCK_BYTES||'1'),failureCode};
}`);
fs.writeFileSync(path.join(fixture,'entry.mjs'),`import {pathToFileURL} from 'node:url';const {probeHermesProductDependencies}=await import(pathToFileURL(process.env.FIXTURE_MODULE).href);await probeHermesProductDependencies();`);
const cfg=path.join(fixture,'config.json');fs.writeFileSync(cfg,JSON.stringify({maxRequestsPerRun:80,maxResponseBytes:8388608}));
let sequence=0;
function run(extra={}){
 const id=`20261015T0000${String(sequence++).padStart(2,'0')}Z-1`,dir=path.join(fixture,'crawler/runs/hermes/kr',id),calls=path.join(fixture,`calls-${sequence}`);
 fs.mkdirSync(dir);const result=spawnSync(process.execPath,[path.join(fixture,'entry.mjs'),'--country-config',cfg,'--probe-product-dependencies'],{env:{PATH:process.env.PATH,FIXTURE_MODULE:path.join(fixture,'crawler/common/hermes-product-dependencies-probe.js'),CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_BRAND:'hermes',CRAWL_RUN_DIR:dir,MOCK_CALLS:calls,...extra},stdio:'pipe'});
 const rows=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));
 return {code:result.status,rows,dir,calls:fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]};
}
const first=run();assert.equal(first.code,0);assert.equal(first.calls.length,29);assert.deepEqual(first.calls.map(x=>x.url),urls.slice(3));
const again=run();assert.equal(again.code,0);assert.equal(again.calls.length,0);
// Keep each failure test isolated from successful prior-source evidence.
fs.renameSync(path.join(first.dir,'summary.json'),path.join(first.dir,'saved.fixture'));
fs.renameSync(path.join(again.dir,'summary.json'),path.join(again.dir,'saved.fixture'));
const failed=run({MOCK_FAIL_URL:urls[3]});assert.equal(failed.code,1);assert.equal(failed.calls.length,1);assert(failed.rows.some(r=>r.status==='DEPENDENCY_UNPROCESSED_28'));
const blockedAgain=run();assert.equal(blockedAgain.code,1);assert.equal(blockedAgain.calls.length,0);
for(const item of [failed,blockedAgain])fs.renameSync(path.join(item.dir,'summary.json'),path.join(item.dir,'saved.fixture'));
const cap=run({MOCK_BYTES:'8388608'});assert.equal(cap.code,1);assert.equal(cap.calls.length,8);assert(cap.calls.every(c=>c.cap===8388608));assert(cap.rows.some(r=>r.status==='DEPENDENCY_BATCH_BYTES_LIMIT'));
fs.renameSync(path.join(cap.dir,'summary.json'),path.join(cap.dir,'saved.fixture'));
const transferFailure=run({MOCK_FAIL_URL:urls[3],MOCK_FAIL_CODE:'SCRIPT_HTTP_500'});assert.equal(transferFailure.code,1);assert.equal(transferFailure.calls.length,1);
console.log('PASS: mock-only 29 exact remaining dependencies, prior-success deduplication, blocked stop/no retry, strict 64MiB batch cap; no real network/storage');
