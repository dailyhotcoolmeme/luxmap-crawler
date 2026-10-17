import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'lv-joint-batch-'));
const put=(file,value)=>{fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.writeFileSync(root+'/'+file,typeof value==='string'?value:JSON.stringify(value),{mode:0o700});};
try{
 const url='https://kr.louisvuitton.com/kor-kr/products/bag-nvprod123v/M12345';
 const row={brand:'louis-vuitton',country:'KR',parentModel:'fixture',variantCode:'M12345',price:1000000,currency:'KRW',status:'KR_FULL_RECORD_READY',officialUrl:url};
 put('crawler/brands/louis-vuitton/countries/kr',fs.readFileSync(source+'/crawler/brands/louis-vuitton/countries/kr','utf8'));
 put('scripts/crawl-output-guard.sh','#!/bin/sh\nexit 0\n');
 put('scripts/rest-fixture.mjs',`export function guardedRest(route){if(route.startsWith('rpc/'))return [{id:'fixture-id',normalized_code:'M12345',official_url:${JSON.stringify(url)}}];if(route.startsWith('product_variants'))return [{normalized_code:'M12345',color_ko:null,material_ko:null}];return [{variant_id:'fixture-id',official_product_code:'M12345',country_code:'KR',currency_code:'KRW',current_price:1000000,price_status:'confirmed',official_url:${JSON.stringify(url)}}];}`);
 let code=fs.readFileSync(source+'/scripts/louis-vuitton-market.mjs','utf8').replace("'../crawler/common/guarded-rest.js'","'./rest-fixture.mjs'");
 for(const file of ['louis-vuitton-product.js','louis-vuitton-foreign.js'])code=code.replace("'../crawler/common/"+file+"'",JSON.stringify('file://'+source+'/crawler/common/'+file));
 put('scripts/louis-vuitton-market.mjs',code);
 put('scripts/run-brand-country-pipeline.sh','#!/bin/sh\nexec node "$(dirname "$0")/pipeline-fixture.mjs" "$@"\n');
 put('scripts/pipeline-fixture.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..');if(process.argv[4]!=='--korean-products')process.exit(78);const dir=root+'/crawler/runs/louis-vuitton/kr/fixture';fs.mkdirSync(dir+'/artifacts/public-verified',{recursive:true});const row=${JSON.stringify(row)};const missing=process.env.FIXTURE_MISSING==='1',unresolved=process.env.FIXTURE_UNRESOLVED==='1';fs.writeFileSync(dir+'/summary.json',JSON.stringify([row,...(unresolved?[{...row,status:'KR_ATTRIBUTES_UNRESOLVED_1'}]:[])]));fs.writeFileSync(dir+'/artifacts/public-verified/summary.json',JSON.stringify(missing?[]:[{...row,status:'PUBLIC_CATALOG_VERIFIED'}]));fs.appendFileSync(root+'/order.txt','full-record-public\\n');`);
 put('scripts/seed-louis-vuitton-registered.mjs',`import fs from 'node:fs';import path from 'node:path';fs.appendFileSync(path.resolve(import.meta.dirname,'../order.txt'),'seed\\n');`);
 put('scripts/repair-louis-vuitton-metadata.mjs','throw Error("UNEXPECTED_REPAIR");');
 for(const mode of ['positive','missing','unresolved']){
  fs.rmSync(root+'/crawler/runs',{recursive:true,force:true});fs.rmSync(root+'/order.txt',{force:true});
  const r=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,root+'/scripts/louis-vuitton-market.mjs','kr','--api-sku','--refresh'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,LUXURY_SERVICE_GUARD:'enabled',LUXURY_COORDINATOR_OWNER:'fixture',EXPO_PUBLIC_SUPABASE_KEY:'fixture',FIXTURE_MISSING:mode==='missing'?'1':'0',FIXTURE_UNRESOLVED:mode==='unresolved'?'1':'0'},timeout:30000});
  assert.equal(r.status,mode==='positive'?0:2,r.stderr);assert.equal(fs.readFileSync(root+'/order.txt','utf8'),'seed\nfull-record-public\n');
  const proof=JSON.parse(fs.readFileSync(root+'/crawler/louis-vuitton-progress/kr/summary.json'));
  assert(!proof.some(r=>r.status==='COUNTRY_COLLECTION_VERIFIED'));
  if(mode==='positive')assert(proof.some(r=>r.status==='KR_REGISTERED_REFRESH_VERIFIED'));
  else assert(!proof.some(r=>r.status==='KR_REGISTERED_REFRESH_VERIFIED'));
 }
 console.log('PASS: isolated KR full-record pipeline/public proof required; no separate price/attribute repair; existing prices cannot mask missing public proof or unresolved attributes');
}finally{fs.rmSync(root,{recursive:true,force:true});}
