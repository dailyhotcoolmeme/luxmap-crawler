import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseHermesImageProperties,probeHermesImageProperties} from '../crawler/common/hermes-image-properties-probe.js';

assert.deepEqual(parseHermesImageProperties('image.width=2400\nimage.height=1800'),{width:2400,height:1800,dimensionsVerified:true,originalVerified:false});
assert.equal(parseHermesImageProperties('{"image.size":"2400,1800"}').width,2400);
assert.throws(()=>parseHermesImageProperties('image.width=2400\nimage.width=1000'),/CONFLICT/);
assert.throws(()=>parseHermesImageProperties('image.width=2400\nimage.size=1000,1000'),/CONFLICT/);
assert.throws(()=>parseHermesImageProperties('x'.repeat(65537)),/LIMIT/);
assert.equal(parseHermesImageProperties('globalThis.PROBE_EXECUTED=true;').dimensionsVerified,false);
assert.equal(globalThis.PROBE_EXECUTED,undefined);
assert.equal(parseHermesImageProperties('{"originalUrl":"https://evil.invalid/master.jpg"}').originalVerified,false);
const temp=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'luxmap-hermes-properties-test-'));
const source=path.join(root,'crawler/runs/hermes/kr/source'),raw=path.join(source,'raw');
const sku='H073428CKO5',published='https://assets.hermes.com/is/image/hermesproduct/lindy-26-%EB%B0%B1--073428CKO5-front-wm-1-0-0-1000-1000_g.jpg';
await fs.mkdir(raw,{recursive:true});
const input=path.join(raw,'1.source');await fs.writeFile(input,`${sku} "${published}"`,{mode:0o400});
let requests=0,sequence=0;
const config={brand:'hermes',country:'KR',currency:'KRW',localePrefix:'/kr/ko/',allowedHosts:['www.hermes.com','assets.hermes.com'],maxResponseBytes:8388608,maxRequestsPerRun:80};
async function probe(body='image.width=2400\nimage.height=1800',mime='text/plain',overrides={}){
 const run=path.join(root,'crawler/runs/hermes/kr',`probe-${++sequence}`);await fs.mkdir(run,{recursive:true});
 const env={CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_BRAND:'hermes',LUXURY_NETWORK_PROXY:'http://127.0.0.1:1',CRAWL_RUN_DIR:run};
 return probeHermesImageProperties({root,env,config,args:['--country-config','fixture','--probe-image-properties','--source-run',source,'--sku',sku],transport:async(url,options)=>{
  requests++;assert.equal(url,published+'?req=props');assert.equal(options.maxBytes,65536);assert.equal(options.proxy,env.LUXURY_NETWORK_PROXY);
  return {status:200,headers:{'content-type':mime},body:Buffer.from(body)};
 },...overrides});
}
try{
 const ok=await probe();assert.equal(ok.width,2400);assert.equal(ok.height,1800);assert.equal(ok.originalVerified,false);assert.equal(ok.requests,1);assert.equal(ok.failureCode,null);
 assert.equal((await fs.stat(input)).mode&0o777,0o400);
 await fs.chmod(input,0o600);await fs.writeFile(input,`${sku} "${decodeURI(published)}"`,{mode:0o400});
 assert.equal((await probe()).failureCode,null);
 assert.equal((await probe('image.width=1','image/jpeg')).failureCode,'NON_METADATA_RESPONSE');
 assert.equal((await probe('x'.repeat(65537))).failureCode,'METADATA_LIMIT');
 assert.equal((await probe('<html>access denied</html>')).failureCode,'NON_METADATA_RESPONSE');
 assert.equal((await probe('image.width=1\nimage.width=2')).failureCode,'METADATA_CONFLICT');
 assert.equal((await probe('image.width=1\nimage.height=2','application/javascript')).originalVerified,false);
 const before=requests;
 await assert.rejects(probe('',undefined,{config:{...config,allowedHosts:['www.hermes.com']}}),/CONFIG/);assert.equal(requests,before);
 await fs.chmod(input,0o600);await fs.writeFile(input,`${sku} "${published.replace('1000-1000','320-320')}"`);
 assert.equal((await probe()).failureCode,'PUBLISHED_SOURCE_MISSING');assert.equal(requests,before);
 console.log('PASS: Hermes properties probe offline fixtures, exact request, caps, MIME refusal, no execution, no original promotion, restored permissions');
}finally{
 assert(root.startsWith(path.join(temp,'luxmap-hermes-properties-test-')));
 await fs.rm(root,{recursive:true,force:true});
}
