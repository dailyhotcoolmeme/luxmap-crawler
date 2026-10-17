import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'lv-joint-batch-'));
const put=(file,value)=>{fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.writeFileSync(root+'/'+file,typeof value==='string'?value:JSON.stringify(value),{mode:0o700});};
try{
 const url='https://kr.louisvuitton.com/kor-kr/products/bag-nvprod123v/M12345';
 const row={brand:'louis-vuitton',country:'KR',parentModel:'fixture',variantCode:'M12345',price:1000000,currency:'KRW',status:'EXACT_LOCAL_MODEL_PRICE',officialUrl:url};
 put('crawler/brands/louis-vuitton/countries/kr',fs.readFileSync(source+'/crawler/brands/louis-vuitton/countries/kr','utf8'));
 put('scripts/crawl-output-guard.sh','#!/bin/sh\nexit 0\n');
 put('scripts/rest-fixture.mjs',`export function guardedRest(route){if(route.startsWith('rpc/'))return [{id:'fixture-id',normalized_code:'M12345',official_url:${JSON.stringify(url)}}];if(route.startsWith('product_variants'))return [{normalized_code:'M12345',color_ko:null,material_ko:null}];return [{variant_id:'fixture-id',official_product_code:'M12345',country_code:'KR',currency_code:'KRW',current_price:1000000,price_status:'confirmed',official_url:${JSON.stringify(url)}}];}`);
 let code=fs.readFileSync(source+'/scripts/louis-vuitton-market.mjs','utf8').replace("'../crawler/common/guarded-rest.js'","'./rest-fixture.mjs'");
 for(const file of ['louis-vuitton-product.js','louis-vuitton-foreign.js'])code=code.replace("'../crawler/common/"+file+"'",JSON.stringify('file://'+source+'/crawler/common/'+file));
 put('scripts/louis-vuitton-market.mjs',code);
 put('scripts/run-brand-country-pipeline.sh','#!/bin/sh\nexec node "$(dirname "$0")/pipeline-fixture.mjs"\n');
 put('scripts/pipeline-fixture.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..'),dir=root+'/crawler/runs/louis-vuitton/kr/fixture';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/summary.json',JSON.stringify([${JSON.stringify(row)}]));fs.appendFileSync(root+'/order.txt','price\\n');`);
 for(const [file,label] of [['seed-louis-vuitton-registered.mjs','seed'],['prepare-louis-vuitton-sources.mjs','fields']])put('scripts/'+file,`import fs from 'node:fs';import path from 'node:path';fs.appendFileSync(path.resolve(import.meta.dirname,'../order.txt'),${JSON.stringify(label+'\n')});`);
 put('scripts/network-isolate.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..');if(!process.argv.includes('--codes-file'))process.exit(78);const file=process.argv.at(-1),codes=JSON.parse(fs.readFileSync(file));if(codes.length!==1||codes[0]!=='M12345')process.exit(78);fs.appendFileSync(root+'/order.txt','attributes-public\\n');const out=root+'/crawler/completeness/louis-vuitton/metadata-repair';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/summary.json',JSON.stringify([{...${JSON.stringify(row)},status:'CLEAN_PRODUCT_NAME_PUBLIC_VERIFIED'}]));`);
 const r=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,root+'/scripts/louis-vuitton-market.mjs','kr','--api-sku','--refresh'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,LUXURY_SERVICE_GUARD:'enabled',LUXURY_COORDINATOR_OWNER:'fixture',EXPO_PUBLIC_SUPABASE_KEY:'fixture'},timeout:30000});
 assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(root+'/order.txt','utf8'),'price\nseed\nfields\nattributes-public\n');
 const proof=JSON.parse(fs.readFileSync(root+'/crawler/louis-vuitton-progress/kr/summary.json'));assert(proof.some(r=>r.status==='PRICE_ATTRIBUTE_PASS_PUBLIC_1'));assert(proof.findIndex(r=>r.status==='PRICE_ATTRIBUTE_PASS_PUBLIC_1')<proof.findIndex(r=>r.status==='COUNTRY_COLLECTION_VERIFIED'));
 console.log('PASS: isolated joint batch runs price -> source fields -> exact-code attribute/public verification before country completion; no network/database');
}finally{fs.rmSync(root,{recursive:true,force:true});}
