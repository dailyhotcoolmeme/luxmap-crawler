import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {probePublishedScript,publishedScriptProvenance,validatePublishedScriptUrl} from '../crawler/common/published-script-probe.js';
const cases=[{brand:'hermes',host:'www.hermes.com',locale:'/kr/ko/',id:'20261014T152003Z-93283',script:'/kr/ko/main.512d3bc35b6ae972.js',page:'/kr/ko/category/leather-goods/bags-and-clutches/',status:'PUBLISHED_BAG_LIST_VISITED'},
 {brand:'saint-laurent',host:'www.ysl.com',locale:'/ko-kr/',id:'20261014T150857Z-87035',script:'/_next/static/chunks/main-29a28ca7ded54fd1.js',page:'/ko-kr/ca/fixture',status:'PUBLISHED_BAG_LINK'}];
const temp=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'luxmap-public-script-fixture-'));let calls=0,sequence=0;
try{for(const c of cases){
 const url=`https://${c.host}${c.script}`,page=`https://${c.host}${c.page}`,html=`<html><link rel="canonical" href="${page}"><script src="${c.script}"></script></html>`;
 assert.equal(publishedScriptProvenance(html,url,c.brand,[page]),'PUBLISHED_ROOT_SCRIPT');
 assert.equal(publishedScriptProvenance(html.replace(c.script,url),url,c.brand,[page]),'PUBLISHED_ABSOLUTE_SCRIPT');
 for(const src of [`//${c.host}${c.script}`,'/${build}/main.js','relative/main.js',`${c.script}?token=fixture`])assert.equal(publishedScriptProvenance(html.replace(c.script,src),url,c.brand,[page]),null);
 assert.equal(publishedScriptProvenance(html,url,c.brand,['https://evil.invalid/']),null);
 assert.equal(publishedScriptProvenance(html.replace('<script','<!-- <script').replace('</script>','</script> -->'),url,c.brand,[page]),null);
 for(const bad of [url+'?v=1',url+'#x',url.replace(c.host,'evil.invalid'),url.replace('https:','http:')])assert.throws(()=>validatePublishedScriptUrl(bad,c.brand),/UNAUTHORIZED/);
 const base=path.join(root,'crawler/runs',c.brand,'kr'),source=path.join(base,c.id),input=path.join(source,'raw/1.source');await fs.mkdir(path.dirname(input),{recursive:true});await fs.writeFile(input,html,{mode:0o400});
 const row={brand:c.brand,country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'KRW',status:c.status,officialUrl:page};await fs.writeFile(path.join(source,'summary.json'),JSON.stringify([row]),{mode:0o600});
 const config={brand:c.brand,country:'KR',currency:'KRW',localePrefix:c.locale,allowedHosts:[c.host],maxResponseBytes:8388608,maxRequestsPerRun:80};
 async function probe(response={},options={}){
  const run=path.join(base,`probe-${++sequence}`);await fs.mkdir(run,{recursive:true});
  const env={CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_BRAND:c.brand,LUXURY_NETWORK_PROXY:'http://127.0.0.1:1',CRAWL_RUN_DIR:run};
  return probePublishedScript({root,env,config,now:()=>Date.parse('2026-10-14T17:00:00Z'),args:['--country-config','fixture','--probe-published-script','--source-run',source,'--script-url',url],transport:async(target,opts)=>{calls++;assert.equal(target,url);assert.equal(opts.proxy,env.LUXURY_NETWORK_PROXY);assert.equal(opts.maxBytes,(options.config??config).maxResponseBytes);return {status:200,headers:{'content-type':'application/javascript'},body:Buffer.from('globalThis.PUBLIC_PROBE_EXECUTED=true'),...response};},...options});
 }
 const good=await probe();assert.equal(good.failureCode,null);assert.equal(good.requests,1);assert.equal(good.provenance,'PUBLISHED_ROOT_SCRIPT');assert.equal(globalThis.PUBLIC_PROBE_EXECUTED,undefined);assert.equal((await fs.stat(input)).mode&0o777,0o400);
 for(const status of [401,403,429,302]){const before=calls,r=await probe({status});assert.equal(r.failureCode,status===302?'SCRIPT_REDIRECT_BLOCKED':'ACCESS_BLOCKED');assert.equal(calls,before+1);}
 assert.equal((await probe({headers:{'content-type':'text/html'}})).failureCode,'NON_JAVASCRIPT_RESPONSE');
 assert.equal((await probe({headers:{'content-type':'text/javascript','content-encoding':'gzip'}})).failureCode,'SCRIPT_ENCODING_UNSUPPORTED');
 assert.equal((await probe({body:Buffer.alloc(9)},{config:{...config,maxResponseBytes:8}})).failureCode,'SCRIPT_RESPONSE_LIMIT');
 assert.equal((await probe({body:Buffer.alloc(0)})).failureCode,'EMPTY_SCRIPT_RESPONSE');
 const before=calls;assert.equal((await probe({}, {now:()=>Date.parse('2026-10-16T00:00:00Z')})).failureCode,'SOURCE_STALE');assert.equal(calls,before);
 await fs.writeFile(path.join(source,'summary.json'),JSON.stringify([{...row,status:'UNPROVEN'}]));assert.equal((await probe()).failureCode,'PRIOR_SOURCE_PROOF_MISSING');assert.equal(calls,before);
 }
 if(process.argv.includes('--check-existing-source')){
  const repo=path.resolve(import.meta.dirname,'..'),rows=[];
  for(const c of cases){const source=path.join(repo,'crawler/runs',c.brand,'kr',c.id),summary=path.join(source,'summary.json');assert.equal(spawnSync(path.join(repo,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status,0);
   const urls=JSON.parse(await fs.readFile(summary,'utf8')).filter(r=>r.brand===c.brand&&r.country==='KR'&&(r.status===c.status||/^LISTING_LINKS_\d+$/.test(r.status))).map(r=>r.officialUrl);let proven=0,total=0;
   for(const name of (await fs.readdir(path.join(source,'raw'))).filter(n=>/^\d+\.source$/.test(n))){const file=path.join(source,'raw',name),stat=await fs.lstat(file);total+=stat.size;assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8388608&&total<=67108864);let html;
    try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
    if(publishedScriptProvenance(html,`https://${c.host}${c.script}`,c.brand,urls))proven++;
   }
   rows.push({brand:c.brand,country:'KR',parentModel:'',variantCode:'SOURCE',price:null,currency:'',status:`ACTUAL_KR_SOURCE_MATCHES_${proven}`,officialUrl:`https://${c.host}${c.script}`});
  }
  const summary=path.join(root,'summary.json');await fs.writeFile(summary,JSON.stringify(rows),{mode:0o600});assert.equal(spawnSync(path.join(repo,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status,0);console.log(await fs.readFile(summary,'utf8'));
 }
 console.log('PASS: Hermes/YSL mock-only single GET, source/age/locale/root provenance, private bounded response, blocked/redirect/MIME/encoding limits, no execution');
}finally{assert(root.startsWith(path.join(temp,'luxmap-public-script-fixture-')));await fs.rm(root,{recursive:true,force:true});}
