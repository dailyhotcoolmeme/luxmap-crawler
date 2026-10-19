import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {summaryPages} from '../crawler/common/guarded-summary-pages.js';
const rows=Array.from({length:1501},(_,index)=>({index,status:'x'.repeat(index%300)}));
const pages=summaryPages(rows);
assert.deepEqual(pages.flat(),rows);
assert(pages.every(page=>page.length<=100&&Buffer.byteLength(JSON.stringify(page))<=30000));
assert.deepEqual(summaryPages([]),[[]]);
assert.throws(()=>summaryPages([{text:'x'.repeat(40000)}]),/SUMMARY_RECORD_TOO_LARGE/);
const fixture=Array.from({length:700},(_,i)=>({brand:'dior',country:'KR',parentModel:'전체 단계 진단 보존',variantCode:'TOTAL',price:null,currency:'KRW',status:'JOB_EXIT_'+i,officialUrl:'https://www.dior.com/ko_kr/fashion'}));
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'luxmap-summary-test-'));
try{
 for(const [index,page]of summaryPages(fixture).entries()){
  const file=path.join(folder,'summary-'+index+'.json');fs.writeFileSync(file,JSON.stringify(page),{mode:0o600});
  assert.equal(spawnSync(new URL('./crawl-output-guard.sh',import.meta.url).pathname,[file],{stdio:'ignore'}).status,0);
 }
}finally{for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));fs.rmdirSync(folder);}
console.log('PASS: complete diagnostic pagination without omitted records');
