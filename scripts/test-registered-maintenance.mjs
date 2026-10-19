import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {maintenanceBrands,partitionMaintenanceRecords,storeRegisteredPrices} from '../crawler/common/registered-maintenance.js';
import {downloadAndOptimizeImage} from '../crawler/common/image-processor.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/runtime/registered-maintenance',now=new Date().toISOString();
fs.mkdirSync(base,{recursive:true});
for(const brand of maintenanceBrands){
 const file=base+'/'+brand+'.json',backup=fs.existsSync(file)?fs.readFileSync(file):null;
 try{
  fs.writeFileSync(file,JSON.stringify({schema:1,brand,checkedAt:now,codes:['EXISTING1']}),{mode:0o600});
  process.env.LUXURY_REGISTERED_MANIFEST=file;process.env.CRAWL_BRAND=brand;
  let imageRequests=0;
  assert.deepEqual(await downloadAndOptimizeImage({request:{get:()=>{imageRequests++;throw Error('MUST_NOT_FETCH');}}},'https://invalid.invalid/no-image','/unused','EXISTING1'),{maintenancePriceOnly:true});
  assert.equal(imageRequests,0);
  const r={brand,country:'KR',currency:'KRW',normalizedCode:'EXISTING1',officialUrl:'https://official.example/product/EXISTING1',price:120,priceStatus:'confirmed',checkedAt:now};
  assert.equal(partitionMaintenanceRecords([r,{...r,normalizedCode:'NEW2'}],{brand,codes:['EXISTING1']}).fresh.length,1);
  assert.throws(()=>partitionMaintenanceRecords([{...r,normalizedCode:'NEW2',maintenancePriceOnly:true}],{brand,codes:['EXISTING1']}),/NEW_REFERENCE_IMAGE_REQUIRED/);
  const initial={id:'v1',normalized_code:'EXISTING1',name_original:'KEEP NAME',color_ko:'KEEP COLOR',material_ko:'KEEP MATERIAL',width_mm:100,brands:{slug:brand},product_models:{id:'p1',name_original:'KEEP MODEL'},product_media:[{id:'photo1',is_primary:true,r2_object_key:'products/existing.webp'}],market_products:[{id:'kr1',variant_id:'v1',country_code:'KR',currency_code:'KRW',official_product_code:'EXISTING1',official_url:r.officialUrl,official_name:'KEEP KR NAME',first_seen_at:'2020-01-01',current_price:100,price_status:'confirmed',price_checked_at:'2020-01-01',page_checked_at:'2020-01-01',last_seen_at:'2020-01-01'},{id:'jp1',country_code:'JP',current_price:200}]};
  let state=structuredClone(initial),history=[{amount:100,currency_code:'KRW'}],writes=[],publicReads=0;
  const query=async(endpoint,method='GET',body,publicRead=false)=>{
   if(publicRead)publicReads++;
   if(method==='PATCH'){
    assert(endpoint.startsWith('market_products?id=eq.kr1&variant_id=eq.v1&country_code=eq.KR'));
    assert.deepEqual(Object.keys(body).sort(),['current_price','last_seen_at','page_checked_at','price_checked_at','price_status']);
    writes.push({endpoint,body});Object.assign(state.market_products[0],body);return [structuredClone(state.market_products[0])];
   }
   if(method==='POST'){assert.equal(endpoint,'price_history');history=[...body,...history];writes.push({endpoint,body});return body;}
   if(endpoint.startsWith('market_products?'))return [{id:'kr1',price_history:history.slice(0,1)}];
   assert(endpoint.startsWith('product_variants?'));return [structuredClone(state)];
  };
  let result=await storeRegisteredPrices([r],brand,query);
  assert.equal(result.changed,1);assert.equal(writes.length,2);assert.equal(result.verified[0].status,'REGISTERED_PRICE_PUBLIC_VERIFIED');assert(publicReads>=3);
  assert.deepEqual({...state,market_products:initial.market_products},{...initial});
  writes=[];result=await storeRegisteredPrices([r],brand,query);assert.equal(result.changed,0);assert.equal(writes.filter(w=>w.endpoint==='price_history').length,0);
  writes=[];await storeRegisteredPrices([{...r,price:null,priceStatus:'price_unavailable'}],brand,query);assert.equal(writes.length,0);assert.equal(state.market_products[0].current_price,120);
  writes=[];await assert.rejects(storeRegisteredPrices([{...r,officialUrl:r.officialUrl+'/wrong'}],brand,query),/EXACT_REFERENCE/);assert.equal(writes.length,0);
  const tamper=async(...a)=>{const x=await query(...a);if(a[0].startsWith('product_variants?')&&writes.length)x[0].color_ko='ILLEGAL';return x;};
  await assert.rejects(storeRegisteredPrices([{...r,price:130}],brand,tamper),/NONPRICE_CHANGED/);
  fs.writeFileSync(file,JSON.stringify({schema:1,brand,checkedAt:'2020-01-01',codes:['EXISTING1']}));
  await assert.rejects(downloadAndOptimizeImage({},'bad','/unused','EXISTING1'),/MANIFEST_INVALID/);
 }finally{if(backup)fs.writeFileSync(file,backup);else fs.unlinkSync(file);}
}
delete process.env.LUXURY_REGISTERED_MANIFEST;delete process.env.CRAWL_BRAND;
// A new SKU must still enter the real offline image guard, not the bypass.
await assert.rejects(downloadAndOptimizeImage({},'https://invalid.invalid/photo','/unused','NEW2'),/IMAGE_SANDBOX_REQUIRED/);
const workflow=fs.readFileSync(root+'/.github/workflows/crawler.yml','utf8');assert(workflow.includes('node scripts/test-registered-maintenance.mjs'));
for(const [f,needle] of [['crawler/brands/chanel/crawler','artifactDir, normalizedCode'],['crawler/brands/prada/crawler','artifact,row.normalizedCode'],['crawler/common/bottega-catalog.js','artifact,row.normalizedCode'],['crawler/common/jewelry-watch-collection.js','artifact,product.normalizedCode'],['crawler/common/louis-vuitton-foreign-model.js',"run+'/artifacts',t.code"],['crawler/common/dior-reference-recovery.js','registeredPriceOnly(product.normalizedCode)']])assert(fs.readFileSync(root+'/'+f,'utf8').includes(needle),f);
console.log('PASS: all seven brands existing image HTTP/CPU zero; existing-only exact KR price PATCH, history append-on-change, anonymous readback; names/attributes/media/foreign preserved; null/stale scope and new-image guard retained');
