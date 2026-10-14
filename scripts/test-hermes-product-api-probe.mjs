import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),fixture=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'luxury-api-probe-test-')));
for(const d of ['crawler/common','scripts','crawler/runs/hermes/kr'])fs.mkdirSync(path.join(fixture,d),{recursive:true});
fs.writeFileSync(path.join(fixture,'package.json'),'{"type":"module"}');
fs.mkdirSync(path.join(fixture,'crawler'),{recursive:true});fs.writeFileSync(path.join(fixture,'crawler/guardrails.json'),JSON.stringify({limits:{maxRetriesPerUrl:2}}));
for(const name of ['crawl-preflight.sh','crawl-output-guard.sh'])fs.writeFileSync(path.join(fixture,'scripts',name),'#!/bin/sh\nexit 0\n',{mode:0o700});
fs.copyFileSync(path.join(root,'crawler/common/hermes-product-api-probe.js'),path.join(fixture,'crawler/common/hermes-product-api-probe.js'));
fs.writeFileSync(path.join(fixture,'crawler/common/hermes-product-api-proof.js'),`export function validateHermesProductApi(html,main,facade,target){return process.env.MOCK_PROOF!=='false'&&html==='html'&&main==='main'&&facade==='facade'&&target==='https://bck.hermes.com/product?productsku=H073428CKO5';}`);
const base=path.join(fixture,'crawler/runs/hermes/kr'),target='https://bck.hermes.com/product?productsku=H073428CKO5';
const row=(status,url)=>({brand:'hermes',country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'',status,officialUrl:url});
function source(id,content,events,file='published-script.source'){
 const dir=path.join(base,id);fs.mkdirSync(path.join(dir,'raw'),{recursive:true});fs.writeFileSync(path.join(dir,'raw',file),content,{mode:0o000});fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(events));
}
source('20261014T163806Z-77800','main',[row('SCRIPT_FETCH_HTTP_200','https://www.hermes.com/kr/ko/main.512d3bc35b6ae972.js')]);
source('20261014T150529Z-85321','html',[row('SCHEMA_OFFER','https://www.hermes.com/kr/ko/')],'0.source');
source('20261014T152003Z-93283','other',[row('PUBLISHED_BAG_LIST_VISITED','https://www.hermes.com/kr/ko/')],'0.source');
source('20261014T180001Z-99','',[row('API_ERR_EEXIST',target)]);
const batch=path.join(base,'20261014T171137Z-4752');fs.mkdirSync(batch,{recursive:true});fs.writeFileSync(path.join(batch,'summary.json'),'[]');
source('20261014T171137Z-4752/dependencies/000','facade',[row('SCRIPT_FETCH_HTTP_200','https://www.hermes.com/kr/ko/fixture.js'),row('PUBLISHED_PRODUCT_CHUNK','https://www.hermes.com/kr/ko/fixture.js')]);
const cfg=path.join(fixture,'config.json');fs.writeFileSync(cfg,JSON.stringify({brand:'hermes',country:'KR',currency:'KRW',allowedHosts:['bck.hermes.com'],maxResponseBytes:8388608,maxRequestsPerRun:80}));
fs.writeFileSync(path.join(fixture,'entry.mjs'),`
import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {probeHermesProductApi}=await import(pathToFileURL(process.env.FIXTURE_MODULE).href);
const result=await probeHermesProductApi({env:process.env,now:()=>Date.parse('2026-10-14T18:00:00Z'),transport:async(proxy,cap)=>{
 if(proxy!=='http://127.0.0.1:12345/'||cap!==1048576)throw Error('TEST_TRANSPORT_ARGUMENTS');
 await fs.writeFile(process.env.MOCK_CALLS,'called');
 if(process.env.MOCK_KIND==='blocked')throw Error('ACCESS_BLOCKED');
 if(process.env.MOCK_KIND==='unknown')throw Error('fixture transport failure');
 if(process.env.MOCK_KIND==='coded'){const e=Error('fixture connection failed');e.code='ECONNRESET';throw e;}
 return process.env.MOCK_KIND==='oversize'?Buffer.alloc(cap+1):Buffer.from(process.env.MOCK_KIND==='invalid'?'not-json':'{"fixture":true}');
}});process.exitCode=result.failure?1:0;`);
let seq=0;
function run(extra={}){
 const dir=path.join(base,`20261015T0000${String(seq++).padStart(2,'0')}Z-1`),calls=path.join(fixture,`calls-${seq}`);fs.mkdirSync(path.join(dir,'raw'),{recursive:true});
 const result=spawnSync(process.execPath,[path.join(fixture,'entry.mjs'),'--country-config',cfg,'--probe-product-api'],{env:{PATH:process.env.PATH,FIXTURE_MODULE:path.join(fixture,'crawler/common/hermes-product-api-probe.js'),CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',LUXURY_NETWORK_PROXY:'http://127.0.0.1:12345/',CRAWL_BRAND:'hermes',CRAWL_RUN_DIR:dir,MOCK_CALLS:calls,...extra},stdio:'pipe'});
 assert(fs.existsSync(path.join(dir,'summary.json')),'fixture must emit bounded summary');
 return {dir,code:result.status,called:fs.existsSync(calls),rows:JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'))};
}
const denied=run({MOCK_PROOF:'false'});assert.equal(denied.code,1);assert(!denied.called);assert(denied.rows.some(r=>r.status==='PRODUCT_API_SOURCE_PROOF_MISSING'));
const success=run();assert.equal(success.code,0);assert(success.called);assert(success.rows.some(r=>r.status==='API_JSON_FETCHED'));assert.equal(fs.readFileSync(path.join(success.dir,'raw/product-api.source'),'utf8'),'{"fixture":true}');
const repeat=run();assert.equal(repeat.code,1);assert(!repeat.called);assert(repeat.rows.some(r=>r.status==='API_PREVIOUS_ATTEMPT_NOT_RETRIED'));
for(const item of [success,repeat])fs.renameSync(path.join(item.dir,'summary.json'),path.join(item.dir,'saved.fixture'));
const oversize=run({MOCK_KIND:'oversize'});assert.equal(oversize.code,1);assert(oversize.called);assert(!fs.existsSync(path.join(oversize.dir,'raw/product-api.source')));assert(oversize.rows.some(r=>r.status==='API_RESPONSE_LIMIT'));
fs.renameSync(path.join(oversize.dir,'summary.json'),path.join(oversize.dir,'saved.fixture'));
const blocked=run({MOCK_KIND:'blocked'});assert.equal(blocked.code,1);assert(blocked.called);const blockedAgain=run();assert.equal(blockedAgain.code,1);assert(!blockedAgain.called);
for(const item of [blocked,blockedAgain])fs.renameSync(path.join(item.dir,'summary.json'),path.join(item.dir,'saved.fixture'));
const unknown1=run({MOCK_KIND:'unknown'}),unknown2=run({MOCK_KIND:'unknown'}),unknown3=run({MOCK_KIND:'unknown'});
assert(unknown1.called&&unknown2.called);assert(!unknown3.called);assert(unknown2.rows.some(r=>r.status==='API_UNKNOWN_RETRY_1'));
for(const item of [unknown1,unknown2,unknown3])fs.renameSync(path.join(item.dir,'summary.json'),path.join(item.dir,'saved.fixture'));
const coded=run({MOCK_KIND:'coded'});assert(coded.rows.some(r=>r.status==='API_ERR_ECONNRESET'));
assert.equal(fs.statSync(path.join(base,'20261014T163806Z-77800/raw/published-script.source')).mode&0o777,0);
console.log('PASS: mock-only source proof before GET, fixed private transport, 1MiB limit, JSON private storage, no success/block retries, sealed-source mode restored; no real network/storage');
