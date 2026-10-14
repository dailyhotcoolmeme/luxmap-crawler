import assert from 'node:assert/strict';
import fs from 'node:fs';
import {localizedReference} from '../crawler/common/van-cleef-foreign.js';
import {parseReferenceProduct} from '../crawler/common/jewelry-watch-product.js';
const kr='https://www.rolex.com/ko-kr/watches/1908/m52506-0003';
for(const country of ['jp','fr','it','es','us','sg','hk']){
 const cfg=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/rolex/countries/${country}`,import.meta.url))),url=kr.replace('/ko-kr/',cfg.localePrefix),link=`<link href="${url}">`;
 assert.equal(localizedReference(link,kr,cfg),url);
 assert.throws(()=>localizedReference(link.replace('0003','0005'),kr,cfg),/UNPUBLISHED/);
 assert.throws(()=>localizedReference(link.replace('www.rolex.com','example.com'),kr,cfg),/UNPUBLISHED/);
 const product={'@type':'Product',sku:'M525060003',name:'Official Rolex',offers:{priceCurrency:cfg.currency,price:10000}};
 const html=p=>`<script type="application/ld+json">${JSON.stringify(p)}</script>`;
 const actual=parseReferenceProduct(html(product),url,cfg);assert.equal(actual.normalizedCode,'M525060003');assert.equal(actual.price,10000);assert.equal(actual.currency,cfg.currency);
 assert.throws(()=>parseReferenceProduct(html({...product,sku:'M525060005'}),url,cfg),/EXACT_SCHEMA/);
 assert.equal(parseReferenceProduct(html({...product,offers:{priceCurrency:'KRW',price:10000}}),url,cfg).price,null);
}
const cfg=JSON.parse(fs.readFileSync(new URL('../crawler/brands/rolex/countries/jp',import.meta.url)));
assert.throws(()=>localizedReference('<link href="https://www.rolex.com/ja/watches/1908/m52506-0003">',kr,cfg),/UNPUBLISHED/);
console.log('PASS: Rolex 7 country-specific routes, exact normalized SKU, declared currency; generic language-only route rejected');
