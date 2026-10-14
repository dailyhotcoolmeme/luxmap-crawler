import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {probeBulgariPublicScript,validateBulgariScriptUrl,hasPublishedBulgariScript} from '../crawler/common/bulgari-public-script-probe.js';
const url='https://www.bulgari.com/mobify/bundle/3189/main.fixture.js';
const product='https://www.bulgari.com/ko-kr/323532.html';
const html=`<html lang="ko-KR"><head><link rel="canonical" href="${product}"><script src="${url}"></script></head></html>`;
assert.equal(hasPublishedBulgariScript(html,url),true);
assert.equal(hasPublishedBulgariScript(html.replace(url,url.replace('https://www.bulgari.com','')),url),false);
assert.equal(hasPublishedBulgariScript(html.replace('323532','999999'),url),false);
assert.equal(hasPublishedBulgariScript(html.replace('<script','<!-- <script').replace('</script>','</script> -->'),url),false);
assert.equal(hasPublishedBulgariScript(html+'cf-chl',url),false);
for(const bad of [url+'?v=1',url+'#x',url.replace('www.bulgari.com','evil.invalid'),url.replace('/3189/','/../3189/'),url.replace('https://','http://'),url.replace('.js','.json')])assert.throws(()=>validateBulgariScriptUrl(bad),/UNAUTHORIZED/);
const temp=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'luxmap-bulgari-script-fixture-'));
const base=path.join(root,'crawler/runs/bulgari/kr'),source=path.join(base,'20261014T150952Z-87506'),raw=path.join(source,'raw');
await fs.mkdir(raw,{recursive:true});const input=path.join(raw,'1.source');await fs.writeFile(input,html,{mode:0o400});
const proof={brand:'bulgari',country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'KRW',status:'EXACT_PRODUCT_SCHEMA_MISSING',officialUrl:product};
const summary=path.join(source,'summary.json');await fs.writeFile(summary,JSON.stringify([proof]),{mode:0o600});
const config={brand:'bulgari',country:'KR',currency:'KRW',localePrefix:'/ko-kr/',allowedHosts:['www.bulgari.com'],maxResponseBytes:8388608,maxRequestsPerRun:80};
let sequence=0,calls=0,lastRun;
async function probe(response={},overrides={}){
 const run=path.join(base,`fixture-${++sequence}`);lastRun=run;await fs.mkdir(run,{recursive:true});
 const env={CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_BRAND:'bulgari',LUXURY_NETWORK_PROXY:'http://127.0.0.1:1',CRAWL_RUN_DIR:run};
 return probeBulgariPublicScript({root,env,config,now:()=>Date.parse('2026-10-14T16:00:00Z'),args:['--country-config','fixture','--probe-published-script','--source-run',source,'--script-url',url],transport:async(target,opts)=>{
  calls++;assert.equal(target,url);assert.equal(opts.maxBytes,(overrides.config??config).maxResponseBytes);assert.equal(opts.proxy,env.LUXURY_NETWORK_PROXY);
  return {status:200,headers:{'content-type':'application/javascript'},body:Buffer.from('globalThis.BULGARI_PROBE_EXECUTED=true;'),...response};
 },...overrides});
}
try{
 const ok=await probe();assert.equal(ok.failureCode,null);assert.equal(ok.requests,1);assert.equal(calls,1);assert.equal(globalThis.BULGARI_PROBE_EXECUTED,undefined);
 assert.equal((await fs.stat(input)).mode&0o777,0o400);assert.equal((await fs.stat(path.join(lastRun,'raw/published-script.source'))).mode&0o777,0o600);
 for(const status of [401,403,429]){const before=calls,result=await probe({status});assert.equal(result.failureCode,'ACCESS_BLOCKED');assert.equal(calls,before+1);await assert.rejects(fs.stat(path.join(lastRun,'raw/published-script.source')),/ENOENT/);}
 assert.equal((await probe({status:302})).failureCode,'SCRIPT_REDIRECT_BLOCKED');
 assert.equal((await probe({status:500})).failureCode,'SCRIPT_HTTP_FAILED');
 assert.equal((await probe({headers:{'content-type':'text/html'}})).failureCode,'NON_JAVASCRIPT_RESPONSE');
 assert.equal((await probe({headers:{'content-type':'text/javascript','content-encoding':'gzip'}})).failureCode,'SCRIPT_ENCODING_UNSUPPORTED');
 assert.equal((await probe({body:Buffer.alloc(9)},{config:{...config,maxResponseBytes:8}})).failureCode,'SCRIPT_RESPONSE_LIMIT');
 assert.equal((await probe({body:Buffer.alloc(0)})).failureCode,'EMPTY_SCRIPT_RESPONSE');
 let before=calls;assert.equal((await probe({}, {now:()=>Date.parse('2026-10-15T15:09:53Z')})).failureCode,'SOURCE_STALE');assert.equal(calls,before);
 await fs.writeFile(summary,JSON.stringify([{...proof,status:'OTHER'}]));assert.equal((await probe()).failureCode,'PRIOR_SOURCE_PROOF_MISSING');assert.equal(calls,before);
 await fs.writeFile(summary,JSON.stringify([proof]));await fs.chmod(input,0o600);await fs.writeFile(input,html.replace(url,'https://www.bulgari.com/mobify/bundle/3189/other.js'));await fs.chmod(input,0o400);
 assert.equal((await probe()).failureCode,'PUBLISHED_SCRIPT_PROOF_MISSING');assert.equal(calls,before);
 await assert.rejects(probe({}, {config:{...config,maxResponseBytes:8388609}}),/CONFIG_INVALID/);assert.equal(calls,before);
 if(process.argv.includes('--check-existing-source')){
  const repo=path.resolve(import.meta.dirname,'..'),folder=path.join(repo,'crawler/runs/bulgari/kr/20261014T150952Z-87506/raw');
  const actual='https://www.bulgari.com/mobify/bundle/3189/main.ed56b3dc93aa16a4c81c.js';let proven=0,total=0;
  for(const name of (await fs.readdir(folder)).filter(n=>/^\d+\.source$/.test(n))){const file=path.join(folder,name),stat=await fs.lstat(file);total+=stat.size;
   assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8388608&&total<=67108864);let content;
   try{await fs.chmod(file,0o600);content=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
   if(hasPublishedBulgariScript(content,actual))proven++;
  }
  const report=path.join(root,'summary.json');await fs.writeFile(report,JSON.stringify([{brand:'bulgari',country:'KR',parentModel:'',variantCode:'323532',price:null,currency:'',status:`EXACT_NORMAL_KR_SOURCE_MATCHES_${proven}`,officialUrl:actual}]),{mode:0o600});
  assert.equal(spawnSync(path.join(repo,'scripts/crawl-output-guard.sh'),[report],{stdio:'ignore'}).status,0);
  console.log(await fs.readFile(report,'utf8'));
 }
 console.log('PASS: Bulgari script probe offline fixtures; exact source/status/age, single mock GET, blocked/redirect/MIME/cap refusal, private bytes, no execution');
}finally{assert(root.startsWith(path.join(temp,'luxmap-bulgari-script-fixture-')));await fs.rm(root,{recursive:true,force:true});}
