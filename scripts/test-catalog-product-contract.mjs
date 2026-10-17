import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parsePradaProduct} from '../crawler/common/prada-product.js';
import {parseBottegaProduct} from '../crawler/common/bottega-product.js';
import {parseReferenceProduct} from '../crawler/common/jewelry-watch-product.js';
import {validateKoreanCatalogRecord,catalogAttributeState,preserveKnownCatalogAttributes,verifyPublicCatalogAttributes,catalogAttributeColumns} from '../crawler/common/catalog-product-contract.js';
const record={country:'KR',currency:'KRW',normalizedCode:'TEST123',originalCode:'TEST123',modelKey:'sku-test123',productName:'Fixture',parentModel:'Fixture',officialUrl:'https://example.com/kr/TEST123',sourceImageUrl:'https://example.com/image',imagePath:'/fixture.webp',price:1000,checkedAt:'2026-10-17T00:00:00Z',imageProcessingVersion:'original-cutout-v1',imageSha256:'a'.repeat(64),imageWidth:960,imageHeight:960,materialDisplay:'가죽',materialOriginal:'Leather',colorDisplay:'검정',colorOriginal:'Black',widthMm:200,heightMm:100,depthMm:50};
for(const brand of ['chanel','prada','bottega-veneta','rolex','van-cleef-arpels','louis-vuitton','future-brand']){
  assert(Object.values(validateKoreanCatalogRecord({...record,brand},brand)).every(v=>v==='collected'));
  for(const field of Object.keys(catalogAttributeColumns)){
    const missing={...record};delete missing[field];
    assert.throws(()=>validateKoreanCatalogRecord(missing,brand),/NOT_COLLECTED/);
    assert.equal(validateKoreanCatalogRecord({...record,[field]:null},brand)[field],'unresolved');
  }
}
assert.equal(catalogAttributeState({}).widthMm,'not_collected');
assert.throws(()=>validateKoreanCatalogRecord({...record,country:'JP'},'chanel'),/IDENTITY/);
assert.throws(()=>validateKoreanCatalogRecord({...record,widthMm:0},'chanel'),/INVALID/);
assert.throws(()=>validateKoreanCatalogRecord({...record,price:-1},'chanel'),/PRICE/);
assert.throws(()=>validateKoreanCatalogRecord({...record,imageWidth:300},'chanel'),/IMAGE/);
const expected={normalized_code:'TEST123',name_ko:'Fixture',name_original:'Fixture',...Object.fromEntries(Object.entries(catalogAttributeColumns).map(([key,column])=>[column,record[key]]))};
assert(verifyPublicCatalogAttributes(expected,[{...expected,width_mm:'200.00'}]));
for(const field of Object.keys(expected))assert.throws(()=>verifyPublicCatalogAttributes(expected,[{...expected,[field]:null}]),/MISMATCH/);
assert.throws(()=>verifyPublicCatalogAttributes(expected,[]),/IDENTITY/);
const merged=preserveKnownCatalogAttributes({...expected,material_ko:null,width_mm:null,color_ko:'빨강'},expected);
assert.equal(merged.material_ko,'가죽');assert.equal(merged.width_mm,200);assert.equal(merged.color_ko,'빨강');
assert.equal(preserveKnownCatalogAttributes({width_mm:null},{}).width_mm,null);
const store=fs.readFileSync(new URL('./ingest-chanel-products.sh',import.meta.url),'utf8');
assert(store.indexOf('catalog-product-contract.mjs" validate')<store.indexOf('request()'));
assert(store.includes('catalog-product-contract.mjs" merge'));
assert(store.includes('catalog-product-contract.mjs" verify'));
assert(store.includes('apikey: $SUPABASE_ANON_KEY'));
// Feed real existing parsers with synthetic official-format documents; do not
// use saved product raw data or silently fill their missing attribute fields.
const html=product=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',...product})}</script>`;
const prada=parsePradaProduct(html({name:'가죽 백',sku:'1BA896_NZV_F0002_V_OOO',image:'https://www.prada.com/test.jpg',offers:{price:6000000,priceCurrency:'KRW'}}),'https://www.prada.com/kr/ko/p/galleria/1BA896_NZV_F0002_V_OOO',{country:'KR',currency:'KRW'},[]);
const bvCode='874957V5ZZ14303',bvUrl=`https://www.bottegaveneta.com/ko-kr/mini-${bvCode}.html`;
const bottega=parseBottegaProduct(html({name:'가죽 백',sku:bvCode,image:`https://www.bottegaveneta.com/${bvCode}.jpg`,offers:{price:3000000,priceCurrency:'KRW',url:bvUrl}}),bvUrl,{country:'KR',currency:'KRW',locale:'ko-KR',localePrefix:'/ko-kr/',allowedHosts:['www.bottegaveneta.com']});
for(const [brand,code,url] of [
  ['van-cleef-arpels','VCARA46100','https://www.vancleefarpels.com/kr/ko/collections/jewelry/alhambra/vcara46100-sample.html'],
  ['rolex','M1240600001','https://www.rolex.com/ko-kr/watches/submariner/m124060-0001'],
]){
  const cfg={brand,country:'KR',category:brand==='rolex'?'watch':'jewelry',currency:'KRW',allowedHosts:[new URL(url).hostname],productPathPattern:brand==='rolex'?'/watches/':'/jewelry/'};
  const parsed=parseReferenceProduct(html({name:'공식 이름',sku:code,image:new URL('/image.jpg',url).href,offers:{price:1000000,priceCurrency:'KRW'}}),url,cfg);
  const complete={...record,...parsed,sourceImageUrl:parsed.image};delete complete.image;
  assert.equal(validateKoreanCatalogRecord(complete,brand).widthMm,'unresolved');
}
for(const [brand,parsed] of [['prada',prada],['bottega-veneta',bottega]]){
  for(const key of Object.keys(catalogAttributeColumns))assert(Object.hasOwn(parsed,key),`${brand}: ${key}`);
  validateKoreanCatalogRecord({...record,...parsed},brand);
}
const chanel=fs.readFileSync(new URL('../crawler/brands/chanel/crawler',import.meta.url),'utf8');
for(const key of Object.keys(catalogAttributeColumns))assert(chanel.includes(`${key}:`));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'luxmap-contract-'));
try{
  const file=path.join(temp,'records.json'),out=path.join(temp,'summary.json');
  fs.writeFileSync(file,JSON.stringify([{...record,brand:'chanel',officialUrl:'https://www.chanel.com/kr/fashion/p/TEST123/'}]));
  const cli=new URL('./catalog-product-contract.mjs',import.meta.url).pathname;
  assert.equal(spawnSync(process.execPath,[cli,'validate',file,'chanel',out],{encoding:'utf8'}).status,0);
  assert.equal(JSON.parse(fs.readFileSync(out))[0].status,'ATTRIBUTES_COLLECTED');
  const incomplete={...record};delete incomplete.colorDisplay;
  fs.writeFileSync(file,JSON.stringify([incomplete]));
  // Real central storage must reject the entire malformed batch before its
  // first curl/upload/DB action, even when guarded fixture keys are present.
  const storePath=new URL('./ingest-chanel-products.sh',import.meta.url).pathname;
  const rejected=spawnSync('/bin/sh',[storePath,file],{encoding:'utf8',env:{PATH:process.env.PATH,LUXURY_PIPELINE_GUARD:'enabled',LUXURY_NETWORK_ISOLATED:'enabled',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_ANON_KEY:'fixture',CLOUDFLARE_API_TOKEN:'fixture'}});
  assert.equal(rejected.status,1);
  assert(rejected.stderr.includes('CATALOG_ATTRIBUTE_NOT_COLLECTED'));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS: shared KR contract; existing Prada/Bottega/Rolex/Van Cleef parser compatibility and Chanel record fields; unresolved != uncollected; null preservation and public mismatch rejection');
