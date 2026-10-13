import assert from 'node:assert/strict';
import fs from 'node:fs';
import {localizedReference} from '../crawler/common/van-cleef-foreign.js';
import {parseReferenceProduct} from '../crawler/common/jewelry-watch-product.js';
const kr='https://www.vancleefarpels.com/kr/ko/collections/jewelry/alhambra/vcara36300---sample.html';
for(const country of ['jp','fr','it','es','us','sg','hk']){
 const cfg=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/van-cleef-arpels/countries/${country}`,import.meta.url))),url=kr.replace('/kr/ko/',cfg.localePrefix);
 const link=`<link href="${url}" rel="alternate">`;
 assert.equal(localizedReference(link,kr,cfg),url);
 assert.throws(()=>localizedReference(link.replace('vcara36300','vcara38800'),kr,cfg),/UNPUBLISHED/);
 assert.throws(()=>localizedReference(link.replace('www.vancleefarpels.com','example.com'),kr,cfg),/UNPUBLISHED/);
 assert.throws(()=>localizedReference('',kr,cfg),/UNPUBLISHED/);
 const product={'@type':'Product',sku:'VCARA36300',name:'Official product',offers:{priceCurrency:cfg.currency,price:123456}};
 const html=v=>`<script type="application/ld+json">${JSON.stringify(v)}</script>`;
 const result=parseReferenceProduct(html(product),url,cfg);assert.equal(result.country,cfg.country);assert.equal(result.currency,cfg.currency);assert.equal(result.price,123456);
 assert.equal(parseReferenceProduct(html({...product,offers:{priceCurrency:'KRW',price:123}}),url,cfg).price,null);
 assert.throws(()=>parseReferenceProduct(html({...product,sku:'VCARA38800'}),url,cfg),/EXACT_SCHEMA/);
}
console.log('PASS: seven country routes, exact Korean SKU and currency, no invented URLs/prices');
