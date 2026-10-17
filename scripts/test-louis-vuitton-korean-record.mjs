import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {koreanModelRecord} from '../crawler/common/louis-vuitton-korean-record.js';
import {foreignModelRecord} from '../crawler/common/louis-vuitton-foreign-model.js';
import {validateKoreanCatalogRecord} from '../crawler/common/catalog-product-contract.js';
const cfg={brand:'louis-vuitton',country:'KR',currency:'KRW',locale:'kor-kr',localePrefix:'/kor-kr/',entryUrl:'https://kr.louisvuitton.com/kor-kr/homepage',imageHosts:['kr.louisvuitton.com']};
const code='M29090',url='https://kr.louisvuitton.com/kor-kr/products/bag-nvprod7890048v/'+code;
const image='https://kr.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-bag--M29090_PM2_Front%20view.jpg';
const model={identifier:code,url,image:[{url:image}],color:{name:'블랙'},mainMaterial:{name:'카우하이드 가죽'},dimensions:{unitText:'cm',values:{width:25,height:19,depth:11}},offers:{priceSpecification:{price:5000000,priceCurrency:'KRW'}}};
const data={name:'루이 비통 테스트 백 (앞면)',color:'WRONG FAMILY',material:'WRONG FAMILY',model:[model,{...model,identifier:'M29091',color:'WRONG SIBLING'}]};
const price=foreignModelRecord(data,cfg,code,'2026-10-17T00:00:00Z'),record=koreanModelRecord(data,cfg,price);
assert.equal(record.productName,'테스트 백');assert.equal(record.sourceImageUrl,image);assert.equal(record.price,5000000);
assert.equal(record.colorDisplay,'블랙');assert.equal(record.materialDisplay,'카우하이드 가죽');assert.equal(record.widthMm,250);assert.equal(record.heightMm,190);assert.equal(record.depthMm,110);
const processed={...record,imagePath:'/fixture.webp',imageSha256:'a'.repeat(64),imageWidth:960,imageHeight:960,imageProcessingVersion:'original-cutout-v1'};
assert(Object.values(validateKoreanCatalogRecord(processed,'louis-vuitton')).every(value=>value==='collected'));
const empty=koreanModelRecord({...data,model:[{...model,color:null,mainMaterial:null,dimensions:null}]},cfg,price);
assert.equal(empty.colorDisplay,null);assert.equal(empty.materialDisplay,null);assert.equal(empty.widthMm,null);
assert.throws(()=>koreanModelRecord({...data,model:[model,model]},cfg,price),/EXACT_KOREAN/);
assert.throws(()=>koreanModelRecord({...data,model:[{...model,image:[{url:image.replace(code,'M29091')}]}]},cfg,price),/IMAGE/);
assert.throws(()=>koreanModelRecord(data,{...cfg,country:'JP'},price),/SCOPE/);
const described=koreanModelRecord({...data,model:[{...model,color:null,mainMaterial:null,dimensions:null,detailedDescription:'색상: 블랙<br>소재: 캔버스<br>26 x 19 x 12 cm (길이 x 높이 x 너비)'}]},cfg,price);
assert.equal(described.colorDisplay,'블랙');assert.equal(described.materialDisplay,'캔버스');assert.equal(described.widthMm,260);
const pipeline=new URL('./run-brand-country-pipeline.sh',import.meta.url).pathname;
for(const flag of ['--foreign-sku-prices','--foreign-api-prices','--foreign-prices','--foreign-prices-browser']){
 const r=spawnSync('/bin/sh',[pipeline,'louis-vuitton','kr',flag],{encoding:'utf8'});assert.equal(r.status,78);assert(r.stderr.includes('full domestic record'));
}
const weekly=fs.readFileSync(new URL('./louis-vuitton-weekly.mjs',import.meta.url),'utf8');assert(!weekly.includes('repair-louis-vuitton-metadata.mjs'));
assert(weekly.includes("if(fs.existsSync(runtime+'/workflow.json'))"));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lv-completion-input-'));
try{
 fs.mkdirSync(temp+'/scripts');
 let gate=fs.readFileSync(new URL('./check-louis-vuitton-completion.mjs',import.meta.url),'utf8');
 for(const file of ['catalog-completion.js','catalog-workflow.js'])gate=gate.replace("'../crawler/common/"+file+"'",JSON.stringify(new URL('../crawler/common/'+file,import.meta.url).href));
 fs.writeFileSync(temp+'/scripts/check.mjs',gate);fs.writeFileSync(temp+'/scripts/crawl-output-guard.sh','#!/bin/sh\nexit 0\n',{mode:0o700});
 const run=()=>spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,temp+'/scripts/check.mjs'],{encoding:'utf8'});
 assert.equal(run().status,2);assert(JSON.parse(fs.readFileSync(temp+'/crawler/completeness/louis-vuitton/completion-gate/summary.json')).some(r=>r.status==='PARTIAL_SUCCESS_EXIT_BLOCKED'));
 fs.mkdirSync(temp+'/crawler/completeness/louis-vuitton/public-reference',{recursive:true});fs.writeFileSync(temp+'/crawler/completeness/louis-vuitton/public-reference/summary.json','not-json');
 assert.notEqual(run().status,0);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS: LV KR unified name/original image/price/colour/material/dimensions; exact SKU only, missing remains null; KR price-only routes rejected before I/O and no weekly metadata-repair');
