import assert from 'node:assert/strict';
import fs from 'node:fs';
import {schedulePlan,executePlan} from '../crawler/common/schedule-plan.js';
import {executeBrandPool} from '../crawler/common/brand-execution-pool.js';
import {validRegisteredLouisVuitton} from '../crawler/common/louis-vuitton-registered.js';
import {foreignSkuEndpoint,nativeModelEndpoint,foreignModelRecord} from '../crawler/common/louis-vuitton-foreign-model.js';
import {louisVuittonAccessStops} from '../crawler/common/louis-vuitton-access-stops.js';
import {availabilityEvidence} from '../crawler/common/catalog-availability.js';
const root=new URL('../',import.meta.url),s=JSON.parse(fs.readFileSync(new URL('crawler/schedule.json',root))),plan=schedulePlan(s).filter(j=>j.brand==='louis-vuitton');assert.equal(plan.length,10);assert.equal(new Set(plan.map(j=>j.country)).size,8);
for(const phase of ['discover','audit','refresh']){const visited=[];assert.equal(executePlan(plan,j=>{visited.push(j);return{status:j.country==='kr'&&j.phase===phase?2:0};}),1);assert.equal(visited.length,10);let calls=0;assert.equal(await executeBrandPool(plan,async j=>{calls++;return{status:j.country==='kr'&&j.phase===phase?2:0};}),1);assert.equal(calls,10);}
for(const status of [1,78]){let n=0;executePlan(plan,()=>{n++;return{status};});assert.equal(n,1);}
const cfg=JSON.parse(fs.readFileSync(new URL('crawler/brands/louis-vuitton/countries/kr',root))),url='https://kr.louisvuitton.com/kor-kr/products/bag-nvprod7890048v/M29090';
const p={id:'fixture',normalized_code:'M29090',market_products:[{country_code:'KR',currency_code:'KRW',official_product_code:'M29090',official_url:url,current_price:5000000,price_status:'confirmed'}],product_media:[{is_primary:true,r2_object_key:'products/louis-vuitton/sku-m29090/M29090/cutout-v1/'+'a'.repeat(64)+'.webp'}]};assert.equal(validRegisteredLouisVuitton(p).code,'M29090');assert.equal(validRegisteredLouisVuitton({...p,product_media:[]}),null);assert.equal(validRegisteredLouisVuitton({...p,market_products:[{...p.market_products[0],official_product_code:'M29091'}]}),null);
assert.equal(foreignSkuEndpoint(cfg,'M29090'),'https://api.louisvuitton.com/api/kor-kr/catalog/sku/M29090/persodetails');assert(nativeModelEndpoint(cfg,{productId:'nvprod7890048v'}).includes('/kor-kr/'));
assert.equal(foreignModelRecord({model:[{identifier:'M29090',url,offers:{priceSpecification:{price:5000000,priceCurrency:'KRW'}}}]},cfg,'M29090',new Date().toISOString()).currency,'KRW');
assert(louisVuittonAccessStops.has('https://api.louisvuitton.com/api/kor-kr/catalog/product/nvprod6720107v'));
assert(availabilityEvidence(cfg,url,404));assert.equal(availabilityEvidence(cfg,url,403),null);assert.equal(availabilityEvidence(cfg,url,200),null);assert(availabilityEvidence(cfg,url,200,true));
const names={'van-cleef-arpels':'van-cleef-market',chanel:'chanel-jp-remaining',prada:'prada-market','bottega-veneta':'bottega-market',rolex:'rolex-market'};const countries=['kr','jp','fr','it','es','us','sg','hk'];assert.deepEqual(s.jobs.filter(j=>j.brand!=='louis-vuitton'),Object.entries(names).flatMap(([brand,adapter])=>countries.map(country=>({brand,country,adapter:'scripts/'+adapter+'.mjs'}))));assert.equal(s.hour,9);assert.equal(s.weekday,1);assert.equal(s.frequency,'weekly');assert.deepEqual(s.fallbackHours,[12,14,16,18,20,22]);
console.log('PASS: LV eight-country registry, partial remains failed without blocking registered-country prices, safety stops, existing image identity, KR availability and unchanged five-brand schedule');
