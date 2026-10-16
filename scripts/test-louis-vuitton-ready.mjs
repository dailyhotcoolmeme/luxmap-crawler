import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'..'),fixture=fs.mkdtempSync(path.join(os.tmpdir(),'lv-ready-test-'));
try{
 const write=(file,value)=>{const target=fixture+'/'+file;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value));};
 fs.mkdirSync(fixture+'/crawler',{recursive:true});fs.symlinkSync(source+'/crawler/common',fixture+'/crawler/common','dir');
 for(const file of ['scripts/prepare-louis-vuitton-ready.mjs','scripts/crawl-output-guard.sh','scripts/crawler-env.sh']){write(file,fs.readFileSync(source+'/'+file,'utf8'));fs.chmodSync(fixture+'/'+file,0o700);}
 write('crawler/guardrails.json',{limits:{maxSummaryBytesPerRun:32768,maxSummaryRecordsPerRun:500}});
 const base='crawler/completeness/louis-vuitton/',row=(code,status)=>({brand:'louis-vuitton',country:'KR',parentModel:'fixture',variantCode:code,price:1000000,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/products/fixture/'+code});
 const candidates=['M12345','M12346'].map(code=>({code}));
 for(const folder of ['expanded-catalog-source','field-source'])write(base+folder+'/summary.json',[row('SOURCE','FIXTURE')]);
 write(base+'expanded-catalog-source/candidates.json',candidates);
 write(base+'field-source/fields.json',candidates.map(c=>({...c,currency:'KRW',price:1000000,checkedAt:'2026-10-16T00:00:00Z'})));
 write(base+'catalog-source/candidates.json',[candidates[0]]);
 fs.mkdirSync(fixture+'/crawler/runs/louis-vuitton/kr',{recursive:true});
 const run=()=>{const result=spawnSync(process.execPath,[fixture+'/scripts/prepare-louis-vuitton-ready.mjs'],{stdio:'ignore'});assert.equal(result.status,0);return JSON.parse(fs.readFileSync(fixture+'/'+base+'ready-catalog-source/candidates.json'));};
 assert.equal(run().length,2,'a discovery-only SKU must remain ingestible');
 write('crawler/runs/louis-vuitton/kr/fixture/artifacts/public-verified/summary.json',[row('M12345','PUBLIC_CATALOG_VERIFIED')]);
 assert.deepEqual(run().map(c=>c.code),['M12346']);
 fs.unlinkSync(fixture+'/'+base+'catalog-source/candidates.json');
 assert.equal(run().length,1,'fresh execution must not require a historical source file');
 console.log('PASS: discovery is not ingestion; guarded receipts suppress only verified products');
}finally{fs.rmSync(fixture,{recursive:true});}
