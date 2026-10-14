// Entirely offline transport and image-worker fixtures; never imports a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {collectBulgariReference as collect,bulgariDiscoveryCode} from '../crawler/common/bulgari-reference-collection.js';
const scratch=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bulgari-collection-test-')));
const base='https://www.bulgari.com',source=base+'/on/demandware.static/-/Sites-masterCatalog/default/dwabc123/images/fixture.png';
const cfg={brand:'bulgari',country:'KR',currency:'KRW',entryUrl:base+'/ko-kr/',localePrefix:'/ko-kr/',allowedHosts:['www.bulgari.com'],imageHosts:['www.bulgari.com'],maxRequestsPerRun:80,maxResponseBytes:8388608,maxProductsPerRun:25,maxDiscoveryPages:20,maxCandidates:10000};
const html=(sku,category='Jewelry',price=100)=>`<link rel="canonical" href="${base}/ko-kr/${sku}.html"><div data-product-id="${sku}" data-product-business="${category}"></div><script>const p=${JSON.stringify({id:sku,name:'Fixture ring',currency:'KRW',...(price===null?{}:{price}),imageGroups:[{viewType:'large',images:[{disBaseLink:source}]}]})};</script>`;
let scenario=0,assertions=0;
async function setup(count,overrides={}){
 const root=path.join(scratch,String(++scenario));await fs.mkdir(root,{recursive:true});
 const urls=Array.from({length:count},(_,i)=>`${base}/ko-kr/${100000+i}.html`);
 const routes=new Map([[base+'/robots.txt',`Sitemap: ${base}/ko-kr/sitemap.xml`],[base+'/ko-kr/sitemap.xml',`<urlset>${urls.map(u=>`<url><loc>${u}</loc></url>`).join('')}</urlset>`],[source,'fixture-image']]);
 urls.forEach((u,i)=>routes.set(u,html(String(100000+i))));
 const calls=[];let disposed=0;
 const config={...cfg,...overrides};
 async function run(offset=0,extra={}){
  const dir=path.join(root,'crawler/runs/bulgari/kr',`fixture-${calls.length}-${offset}-${Date.now()}`);await fs.mkdir(dir,{recursive:true});
  const result=await collect({root,config,args:['--country-config','unused',...(extra.recover?['--recover-source-run',extra.recover]:[...(extra.remaining&&extra.implicit?[]:['--batch-offset',String(offset)]),...(extra.remaining?['--remaining']:[]),...(extra.sample?['--limit','1']:[])])],env:{CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_RUN_DIR:dir},
   contextFactory:async()=>({get:async(address,options)=>{
    assert.equal(options.maxRedirects,0);calls.push(address);
    if(!routes.has(address))throw Error('UNEXPECTED_FIXTURE_REQUEST');
    const value=routes.get(address),status=typeof value==='number'?value:200;
    return {status:()=>status,ok:()=>status===200,headers:()=>({'content-type':address===source?'image/png':'text/html'}),body:async()=>Buffer.from(typeof value==='number'?'':value)};
   },dispose:async()=>{disposed++;}}),
   processImage:async(ctx,address,artifact,sku)=>{
    assert.equal(address,source);assert.match(sku,/^\d{6}$/);await ctx.request.get(address);
    return {imagePath:path.join(artifact,'fixture.webp'),imageSha256:'a'.repeat(64),imageProcessingVersion:'original-cutout-v1'};
   },closeImages:async()=>{},...extra.options});
  const summary=JSON.parse(await fs.readFile(path.join(dir,'summary.json'),'utf8'));
  assert(summary.some(r=>r.status===(result.complete?'COLLECTION_COMPLETE':'COLLECTION_INCOMPLETE')));
  return {result,summary,dir};
 }
 return {root,urls,routes,calls,run,disposed:()=>disposed,ledger:async(sample=false)=>JSON.parse(await fs.readFile(path.join(root,'crawler/brands/bulgari',sample?'.reference-sample-ledger.json':'.reference-ledger.json'),'utf8'))};
}
const note=(status,url=base+'/ko-kr/')=>({brand:'bulgari',country:'KR',parentModel:'Fixture source',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:url});
async function baseline(root,links){
 const dir=path.join(root,'crawler/runs/bulgari/kr/20261014T150805Z-86616');await fs.mkdir(path.join(dir,'artifacts'),{recursive:true});
 await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify([note('SOURCE_VERIFIED')]),{mode:0o600});
 await fs.writeFile(path.join(dir,'artifacts/source-index.json'),JSON.stringify({entryUrl:base+'/ko-kr/',links}),{mode:0o600});
}
async function recoveryFixture(){
 const s=await setup(2),dir=path.join(s.root,'crawler/runs/bulgari/kr/20261014T150952Z-87506');await fs.mkdir(path.join(dir,'raw'),{recursive:true});
 await fs.writeFile(path.join(dir,'raw/1.source'),html('323532'),{mode:0o000});
 await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify([note('EXACT_PRODUCT_SCHEMA_MISSING',base+'/ko-kr/323532.html')]),{mode:0o600});
 const brand=path.join(s.root,'crawler/brands/bulgari');await fs.mkdir(brand,{recursive:true});
 const at=Date.UTC(2026,9,14,15,30),url=base+'/ko-kr/323532.html';
 await fs.writeFile(path.join(brand,'.reference-index.json'),JSON.stringify({id:'original-index',checkedAt:new Date(at).toISOString(),discoveryComplete:true,blocked:'ACCESS_BLOCKED',urls:[url,base+'/ko-kr/323533.html']}),{mode:0o600});
 await fs.writeFile(path.join(brand,'.reference-ledger.json'),JSON.stringify({indexId:'original-index',entries:{'323532':{state:'unresolved',status:'ACCESS_BLOCKED',officialUrl:url}},complete:false}),{mode:0o600});
 return {...s,sourceRun:dir,now:()=>at};
}
try{
 const s=await setup(30),slug=base+'/ko-kr/jewellery/rings/fixture-100000.html';s.routes.set(slug,html('100000'));
 s.routes.set(base+'/ko-kr/sitemap.xml',s.routes.get(base+'/ko-kr/sitemap.xml').replace('</urlset>',`<url><loc>${slug}</loc></url></urlset>`));
 const first=await s.run();assert.deepEqual([first.result.ready,first.result.nextOffset,first.result.remaining,first.result.unresolved,first.result.complete],[25,25,5,5,false]);assert.equal(first.result.failureCode,null);assert.equal(s.calls.length,52);assert(s.calls.includes(slug));assertions++;
 const second=await s.run(25);assert.deepEqual([second.result.ready,second.result.nextOffset,second.result.remaining,second.result.unresolved,second.result.complete],[5,30,0,0,true]);assert.equal((await s.ledger()).complete,true);assert.equal(s.disposed(),2);assertions++;
 const indexStat=await fs.stat(path.join(s.root,'crawler/brands/bulgari/.reference-index.json'));assert.equal(indexStat.mode&0o777,0o600);assertions++;
 const partial=await setup(3);partial.routes.set(partial.urls[0],html('100000','Jewelry',null));partial.routes.set(partial.urls[1],html('100001','Watches'));partial.routes.set(partial.urls[2],html('100002','Unknown'));
 const p=await partial.run();assert.deepEqual([p.result.ready,p.result.excluded,p.result.unresolved,p.result.remaining,p.result.complete],[1,1,1,0,false]);assert(p.summary.some(r=>r.status==='PRICE_UNPUBLISHED'&&r.price===null));
 const ledger=await partial.ledger();assert.equal(ledger.entries['100001'].state,'excluded');assert.equal(ledger.entries['100002'].state,'unresolved');assertions++;
 const denied=await setup(2);denied.routes.set(denied.urls[0],403);
 const d=await denied.run();assert.equal(d.result.failureCode,'ACCESS_BLOCKED');assert.equal(d.result.nextOffset,0);assert.equal(denied.calls.filter(u=>u===denied.urls[0]).length,1);assert(!denied.calls.includes(denied.urls[1]));assert.equal(d.result.complete,false);assertions++;
 const before=denied.calls.length;const stopped=await denied.run(1);assert.equal(stopped.result.failureCode,'PREVIOUS_RUN_BLOCKED');assert.equal(denied.calls.length,before);assertions++;
 const budget=await setup(2,{maxRequestsPerRun:3});const b=await budget.run();assert.equal(b.result.failureCode,'REQUEST_LIMIT');assert.equal(budget.calls.length,3);assert.equal(b.result.requests,3);assert.equal(b.result.complete,false);assertions++;
 const discovery=await setup(1,{maxDiscoveryPages:1});discovery.routes.set(base+'/ko-kr/sitemap.xml',`<sitemapindex><sitemap><loc>${base}/ko-kr/child.xml</loc></sitemap></sitemapindex>`);
 const limit=await discovery.run();assert.equal(limit.result.failureCode,'DISCOVERY_LIMIT');assert.equal(limit.result.discoveryComplete,false);assert(!discovery.calls.includes(discovery.urls[0]));assertions++;
 const big=await setup(1,{maxResponseBytes:1024});big.routes.set(big.urls[0],'x'.repeat(1025));const large=await big.run();assert.equal(large.result.failureCode,'RESPONSE_LIMIT');assertions++;
 const sample=await setup(1);const one=await sample.run(0,{sample:true});assert.equal(one.result.complete,false);assert(one.summary.some(r=>r.status==='SAMPLE_NOT_FULL_CATALOG'));assertions++;
 const foreign=await setup(1);foreign.routes.set(base+'/ko-kr/sitemap.xml',`<sitemapindex><sitemap><loc>${base}/ko-kr/products.xml</loc></sitemap><sitemap><loc>${base}/ja-jp/products.xml</loc></sitemap></sitemapindex>`);foreign.routes.set(base+'/ko-kr/products.xml',`<urlset><url><loc>${foreign.urls[0]}</loc></url></urlset>`);
 const f=await foreign.run();assert.equal(f.result.complete,true);assert(!foreign.calls.some(u=>u.includes('/ja-jp/')));assertions++;
 const unsafe=await setup(1);unsafe.routes.set(base+'/robots.txt','Sitemap: https://untrusted.invalid/sitemap.xml');const u=await unsafe.run();assert.equal(u.result.failureCode,'UNAUTHORIZED_URL');assert.equal(unsafe.calls.length,1);assertions++;
 const skip=await setup(26);await skip.run(25).then(v=>assert.equal(v.result.complete,false));assertions++;
 const gap=await setup(3,{maxProductsPerRun:1});await gap.run();const gapBefore=gap.calls.length;const g=await gap.run(2);assert.equal(g.result.failureCode,'OFFSET_GAP');assert.equal(gap.calls.length,gapBefore);assertions++;
 const continuation=await setup(26);continuation.routes.set(continuation.urls[0],html('100000','Unknown'));const c1=await continuation.run();assert.equal(c1.result.batchFailed,1);assert.equal(c1.result.nextOffset,25);const c2=await continuation.run(25);assert.equal(c2.result.ready,1);assert.equal(c2.result.failed,1);assert.equal(c2.result.complete,false);assertions++;
 const priorIndex=JSON.parse(await fs.readFile(path.join(partial.root,'crawler/brands/bulgari/.reference-index.json'),'utf8')),priorLedger=await partial.ledger(),repairStart=partial.calls.length;
 partial.routes.set(partial.urls[2],html('100002','Jewelry'));const repaired=await partial.run(0,{remaining:true});
 assert.deepEqual(partial.calls.slice(repairStart),[partial.urls[2],source]);assert.equal(repaired.result.complete,true);assert.equal(repaired.result.nextOffset,3);
 const afterLedger=await partial.ledger();assert.deepEqual(afterLedger.entries['100000'],priorLedger.entries['100000']);assert.deepEqual(afterLedger.entries['100001'],priorLedger.entries['100001']);assert.equal(afterLedger.entries['100002'].state,'ready');
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(partial.root,'crawler/brands/bulgari/.reference-index.json'),'utf8')),priorIndex);assertions++;
 const emptyStart=partial.calls.length;const emptyRepair=await partial.run(0,{remaining:true,implicit:true});assert.equal(partial.calls.length,emptyStart);assert.equal(emptyRepair.result.ready,0);assert.equal(emptyRepair.result.complete,true);assertions++;
 const blockedStart=denied.calls.length;const blockedRepair=await denied.run(0,{remaining:true});assert.equal(blockedRepair.result.failureCode,'PREVIOUS_RUN_BLOCKED');assert.equal(denied.calls.length,blockedStart);assertions++;
 const unprocessed=await setup(26);unprocessed.routes.set(unprocessed.urls[0],html('100000','Unknown'));await unprocessed.run();unprocessed.routes.set(unprocessed.urls[0],html('100000'));
 const onlyErrorsStart=unprocessed.calls.length,onlyErrors=await unprocessed.run(0,{remaining:true,implicit:true});assert.equal(onlyErrors.result.ready,1);assert.equal(onlyErrors.result.unresolved,1);assert.equal(onlyErrors.result.complete,false);assert(!unprocessed.calls.slice(onlyErrorsStart).includes(unprocessed.urls[25]));assertions++;
 const many=await setup(30);many.urls.forEach((u,i)=>many.routes.set(u,html(String(100000+i),'Unknown')));await many.run();await many.run(25);many.urls.forEach((u,i)=>many.routes.set(u,html(String(100000+i))));
 const m1=await many.run(0,{remaining:true});assert.deepEqual([m1.result.ready,m1.result.remaining,m1.result.nextOffset,m1.result.requests],[25,5,25,50]);assert.equal(m1.result.complete,false);
 const m2=await many.run(25,{remaining:true});assert.equal(m2.result.ready,5);assert.equal(m2.result.complete,true);assertions++;
 const coverage=await setup(21),alpha=Array.from({length:116},(_,i)=>`${base}/ko-kr/AN${852000+i}.html`);await baseline(coverage.root,[...coverage.urls,...alpha]);
 const cov=await coverage.run();assert.equal(cov.result.unresolved,116);assert.equal(cov.result.complete,false);assert(cov.summary.some(v=>v.status==='DISCOVERED_137'));assert.equal(Object.values((await coverage.ledger()).entries).filter(v=>v.status==='ALPHANUMERIC_REFERENCE_UNVERIFIED').length,116);assert(!coverage.calls.some(v=>v.includes('/AN')));assertions++;
 assert.equal(bulgariDiscoveryCode(base+'/ko-kr/AN852593.html'),'AN852593');assert.equal(bulgariDiscoveryCode(base+'/ko-kr/jewellery/rings/fixture-AN852593.html'),'AN852593');assert.notEqual(bulgariDiscoveryCode(base+'/ko-kr/AN852593.html'),'852593');assertions++;
 const recovered=await recoveryFixture();await baseline(recovered.root,[base+'/ko-kr/323532.html',base+'/ko-kr/323533.html',...Array.from({length:19},(_,i)=>`${base}/ko-kr/${100000+i}.html`),...alpha]);
 const rec=await recovered.run(0,{recover:recovered.sourceRun,options:{now:recovered.now}});assert.equal(rec.result.ready,1);assert.equal(rec.result.requests,1);assert.deepEqual(recovered.calls,[source]);assert.equal(rec.result.complete,false);assert.equal(rec.result.discoveryComplete,false);assert.equal(rec.result.unresolved,136);assert(rec.summary.some(v=>v.status==='RECOVERED_SOURCE_PARTIAL'));assert.equal((await recovered.ledger()).entries['323532'].state,'ready');assert.equal((await fs.stat(path.join(recovered.sourceRun,'raw/1.source'))).mode&0o777,0);assertions++;
 const againStart=recovered.calls.length;const again=await recovered.run(0,{recover:recovered.sourceRun,options:{now:recovered.now}});assert.equal(again.result.ready,0);assert.equal(recovered.calls.length,againStart);assert.equal(again.result.complete,false);assertions++;
 const stale=await recoveryFixture();const st=await stale.run(0,{recover:stale.sourceRun,options:{now:()=>Date.UTC(2026,9,15,15,10)}});assert.equal(st.result.failureCode,'RECOVERY_SOURCE_STALE');assert.equal(stale.calls.length,0);assertions++;
 const badProof=await recoveryFixture();await fs.writeFile(path.join(badProof.sourceRun,'summary.json'),JSON.stringify([note('EXACT_PRODUCT_SCHEMA_MISSING',base+'/ko-kr/323533.html')]));const bp=await badProof.run(0,{recover:badProof.sourceRun,options:{now:badProof.now}});assert.equal(bp.result.failureCode,'RECOVERY_PROVENANCE_INVALID');assert.equal(badProof.calls.length,0);assertions++;
 const otherPath=await recoveryFixture();const op=await otherPath.run(0,{recover:otherPath.sourceRun+'-other',options:{now:otherPath.now}});assert.equal(op.result.failureCode,'RECOVERY_SOURCE_SCOPE_INVALID');assert.equal(otherPath.calls.length,0);assertions++;
 const imageDenied=await recoveryFixture();imageDenied.routes.set(source,403);const id=await imageDenied.run(0,{recover:imageDenied.sourceRun,options:{now:imageDenied.now}});assert.equal(id.result.failureCode,'ACCESS_BLOCKED');assert.equal(imageDenied.calls.length,1);assert.equal(id.result.ready,0);assertions++;
 const wrongRequest=await recoveryFixture();const wr=await wrongRequest.run(0,{recover:wrongRequest.sourceRun,options:{now:wrongRequest.now,processImage:async ctx=>{await ctx.request.get(base+'/ko-kr/323532.html');}}});assert.equal(wr.result.failureCode,'UNAUTHORIZED_RECOVERY_REQUEST');assert.equal(wrongRequest.calls.length,0);assertions++;
 const duplicate=await recoveryFixture();const dup=await duplicate.run(0,{recover:duplicate.sourceRun,options:{now:duplicate.now,processImage:async ctx=>{await ctx.request.get(source);await ctx.request.get(source);}}});assert.equal(dup.result.failureCode,'RECOVERY_REQUEST_LIMIT');assert.equal(duplicate.calls.length,1);assertions++;
 console.log(`PASS: ${assertions} offline Bulgari collection scenarios (batch resume, exclusions, uncertainty, limits, blocking, canonical aliases, private ledger)`);
}finally{await fs.rm(scratch,{recursive:true,force:true});}
