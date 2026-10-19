import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'lv-full-collector-'));
const put=(file,text)=>{fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.writeFileSync(root+'/'+file,text,{mode:0o700});};
try{
 const codes=['M29090','M29091'],url=code=>'https://kr.louisvuitton.com/kor-kr/products/bag-nvprod123v/'+code;
 const cfg={...JSON.parse(fs.readFileSync(source+'/crawler/brands/louis-vuitton/countries/kr')),maxRequestsPerRun:5};
 put('crawler/brands/louis-vuitton/countries/kr',JSON.stringify(cfg));
 put('crawler/louis-vuitton-progress/kr/targets.json',JSON.stringify(codes.map(code=>({code,koreanUrl:url(code)}))));
 put('scripts/crawl-output-guard.sh','#!/bin/sh\nexit 0\n');
 let code=fs.readFileSync(source+'/crawler/common/louis-vuitton-foreign-model.js','utf8');
 code=code.replace("from 'playwright-core'","from './fixture.js'").replace("from './image-processor.js'","from './fixture.js'").replace("from './louis-vuitton-registered.js'","from './fixture.js'");
 for(const name of ['registered-maintenance.js','louis-vuitton-access-stops.js','louis-vuitton-catalog-model.js','louis-vuitton-product.js','louis-vuitton-foreign.js','louis-vuitton-korean-record.js','catalog-workflow.js','catalog-product-contract.js'])code=code.replace("'./"+name+"'",JSON.stringify('file://'+source+'/crawler/common/'+name));
 put('crawler/common/louis-vuitton-foreign-model.js',code);
 put('crawler/common/fixture.js',`import fs from 'node:fs';import path from 'node:path';const codes=${JSON.stringify(codes)},url=code=>'https://kr.louisvuitton.com/kor-kr/products/bag-nvprod123v/'+code;export function readRegisteredLouisVuitton(){return codes.map(code=>({code,url:url(code)}));}const image=code=>'https://kr.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-bag--'+code+'_PM2_Front%20view.jpg';export const request={newContext:async()=>({get:async u=>{const data=u.includes('/persodetails')?{productId:'nvprod123v'}:{name:'공식 백',model:codes.map(identifier=>({identifier,url:url(identifier),image:image(identifier),color:'블랙',material:'가죽',dimensions:{unitText:'cm',values:{width:25,height:19,depth:11}},offers:{priceSpecification:{price:1000000,priceCurrency:'KRW'}}}))};return {status:()=>200,ok:()=>true,body:async()=>Buffer.from(JSON.stringify(data))};},dispose:async()=>{}})};export async function downloadAndOptimizeImage(context,url,dir,code){if(!fs.statSync(dir).isDirectory())throw Error('IMAGE_LOCAL_RUNTIME_FAILED');await context.request.get(url,{});return {sourceImageUrl:url,imagePath:path.join(dir,code+'.webp'),imageSha256:'a'.repeat(64),imageWidth:960,imageHeight:960,imageProcessingVersion:'original-cutout-v1'};}export async function closeImageProcessor(){}`);
 put('crawler/common/entry.mjs',`import {collectLouisVuittonForeignModels} from './louis-vuitton-foreign-model.js';await collectLouisVuittonForeignModels();`);
 const run=root+'/crawler/runs/louis-vuitton/kr/fixture';fs.mkdirSync(run+'/raw',{recursive:true});
 const r=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,root+'/crawler/common/entry.mjs','--country-config',root+'/crawler/brands/louis-vuitton/countries/kr','--korean-products','--targets-file',root+'/crawler/louis-vuitton-progress/kr/targets.json'],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,CRAWL_MODE:'deterministic-only',LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',CRAWL_RUN_DIR:run}});
 assert.equal(r.status,0,r.stderr);
 const records=JSON.parse(fs.readFileSync(run+'/artifacts/records.json'));assert.equal(records.length,2);assert.equal(records[1].widthMm,250);assert.equal(records[1].materialDisplay,'가죽');assert.equal(records[1].colorDisplay,'블랙');
 assert.deepEqual(fs.readdirSync(run+'/raw').sort(),['api-1.source','api-2.source','api-3.source']);
 const rows=JSON.parse(fs.readFileSync(run+'/summary.json'));assert.equal(rows.filter(r=>r.status==='KR_FULL_RECORD_READY').length,2);assert(rows.some(r=>r.status==='NEXT_OFFSET_5'));
 console.log('PASS: isolated two-SKU unified collector creates artifact directory before CPU image processing, shares model response, separates API filenames from total API+image request budget');
}finally{fs.rmSync(root,{recursive:true,force:true});}
