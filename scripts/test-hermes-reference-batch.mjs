import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {collectHermesReferenceBatch} from '../crawler/common/hermes-reference-batch.js';

const tempBase=await fs.realpath(os.tmpdir());
const root=await fs.mkdtemp(path.join(tempBase,'luxmap-hermes-batch-test-'));
const brand=path.join(root,'crawler/brands/hermes');await fs.mkdir(brand,{recursive:true});
const listing='https://www.hermes.com/kr/ko/category/leather-goods/bags-and-clutches/womens-bags-and-clutches/';
const products=['H000001CK00','H000002CK00'].map(code=>({code,url:`https://www.hermes.com/kr/ko/product/fixture-${code}/`,listingUrl:listing}));
const now=Date.now(),index={checkedAt:new Date(now).toISOString(),scope:'published-korean-bag-lists',pages:[listing],products};
const config={brand:'hermes',country:'KR',currency:'KRW',localePrefix:'/kr/ko/',entryUrl:'https://www.hermes.com/kr/ko/',allowedHosts:['www.hermes.com'],imageHosts:['assets.hermes.com'],skuPattern:'H[A-Z0-9]{8,19}',stylePattern:'^([A-Z0-9]{6,12})',maxProductsPerRun:1,maxRequestsPerRun:4,maxResponseBytes:8388608,maxCandidates:10000};
let calls=0,closed=0,runNumber=0,mode='normal';
async function run(offset,extra={}){
 const run=path.join(root,'crawler/runs/hermes/kr',String(++runNumber));await fs.mkdir(run,{recursive:true});
 const env={CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_BRAND:'hermes',LUXURY_NETWORK_PROXY:'http://127.0.0.1:1',CRAWL_RUN_DIR:run};
 return collectHermesReferenceBatch({root,env,config,args:['--country-config','fixture','--batch-offset',String(offset)],now:()=>now,contextFactory:async()=>({
  async get(url,opts){
   calls++;assert.equal(opts.maxRedirects,0);
   const item=products.find(p=>p.url===url);assert(item);
   const product={'@type':'Product',sku:mode==='mismatch'?'H999999CK99':item.code,name:'Fixture bag',image:`https://assets.hermes.com/is/image/hermesproduct/fixture--${item.code.slice(1)}-front-wm-1-0-0-320-320_g.jpg`,offers:{price:100000,priceCurrency:'KRW'},color:'black',material:'leather'};
   const status=mode==='blocked'?403:mode==='missing'?404:200;
   return {status:()=>status,ok:()=>status===200,headers:()=>({'content-type':'text/html'}),body:async()=>Buffer.from(`<script type="application/ld+json">${JSON.stringify(product)}</script>`)};
  },async dispose(){closed++;}
 }),...extra});
}
try{
 await fs.writeFile(path.join(brand,'.reference-index.json'),JSON.stringify(index));
 const first=await run(0);assert.equal(first.metadataReady,1);assert.equal(first.detailComplete,false);assert.equal(first.remaining,1);assert.equal(first.complete,false);
 const second=await run(1);assert.equal(second.detailComplete,true);assert.equal(second.imagePending,2);assert.equal(second.complete,false);assert.equal(second.failureCode,'ORIGINAL_IMAGE_PENDING');
 // A later offset without earlier coverage cannot establish completeness.
 await fs.unlink(path.join(brand,'.reference-detail-ledger.json'));
 const gap=await run(1);assert.equal(gap.detailComplete,false);assert.equal(gap.unresolved,1);
 mode='mismatch';const wrong=await run(0);assert.equal(wrong.metadataReady,0);assert.equal(wrong.detailComplete,false);
 mode='missing';const missing=await run(0);assert.equal(missing.metadataReady,0);assert.equal(missing.unresolved,1);
 mode='blocked';const blocked=await run(0);assert.equal(blocked.failureCode,'ACCESS_BLOCKED');
 const priorCalls=calls;assert.equal((await run(0)).failureCode,'PREVIOUS_RUN_BLOCKED');assert.equal(calls,priorCalls);
 await fs.writeFile(path.join(brand,'.reference-index.json'),JSON.stringify({...index,checkedAt:new Date(now-86400001).toISOString()}));
 assert.equal((await run(0)).failureCode,'INDEX_STALE');assert.equal(calls,priorCalls);
 await fs.writeFile(path.join(brand,'.reference-index.json'),JSON.stringify({...index,products:[{...products[0],url:'https://evil.invalid/kr/ko/product/fixture-H000001CK00/'}]}));
 assert.equal((await run(0)).failureCode,'UNAUTHORIZED_URL');assert.equal(calls,priorCalls);
 assert.equal(closed,6);
 console.log('PASS: Hermes offline batch fixtures: resume, gaps, exact SKU, 404, blocked-stop, stale index, foreign URL, image-pending completion');
}finally{
 // Only the exact directory allocated by this test; no actual run/index is touched.
 assert(root.startsWith(path.join(tempBase,'luxmap-hermes-batch-test-')));
 await fs.rm(root,{recursive:true,force:true});
}
