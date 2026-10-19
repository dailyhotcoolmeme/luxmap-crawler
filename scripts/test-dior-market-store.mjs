import assert from 'node:assert/strict';
import {storePradaMarkets} from '../crawler/common/prada-market-store.js';
const cfg={brand:'dior',country:'SG',currency:'SGD',localePrefix:'/en_sg/',entryUrl:'https://www.dior.com/en_sg/fashion'},record={normalizedCode:'M123M900',country:'SG',currency:'SGD',officialUrl:'https://www.dior.com/en_sg/fashion/products/M123_M900',price:5900,priceStatus:'confirmed',checkedAt:'2026-10-18T00:00:00Z'};
let saved=[],prior=[],added=[];
const query=async(e,m,b)=>{if(e.startsWith('product_variants?'))return[{id:'v',normalized_code:'M123M900',name_original:'한국 상품',brands:{name_original:'DIOR'}}];if(e.includes('country_code=eq.KR'))return[{variant_id:'v',official_product_code:'M123M900'}];if(e.includes('on_conflict')){saved=b.map(r=>({...r,id:'m'}));return saved;}if(e.includes('price_history.order'))return[{id:'m',price_history:[]}];if(e==='price_history'){added=b;return b;}if(e.includes('country_code=eq.SG'))return saved.length?saved:prior;throw Error('UNEXPECTED_ENDPOINT');};
await storePradaMarkets([record],cfg,query);assert.equal(saved[0].current_price,5900);assert.equal(added.length,1);
prior=[{...saved[0],current_price:6000,price_checked_at:'2026-10-18T01:00:00Z'}];saved=[];added=[];await storePradaMarkets([record],cfg,query);assert.equal(saved[0].current_price,6000);assert.equal(added.length,0);
for(const officialUrl of[record.officialUrl.replace('/en_sg/','/ko_kr/'),record.officialUrl+'?x=1',record.officialUrl.replace('www.dior.com','evil.invalid'),record.officialUrl.replace('M123_M900','M999_M900')])await assert.rejects(storePradaMarkets([{...record,officialUrl}],cfg,query),/invalid country record/);
console.log('PASS: Dior uses the existing exact Korean SKU market store; local URL/currency binding and newer prices preserved');
