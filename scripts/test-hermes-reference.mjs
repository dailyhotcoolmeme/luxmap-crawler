import assert from 'node:assert/strict';
import {hermesReferenceCode,hermesReferenceLinks} from '../crawler/common/hermes-reference-collection.js';
const base='https://www.hermes.com/kr/ko/category/leather-goods/bags-and-clutches/womens-bags-and-clutches/';
const links=hermesReferenceLinks(`<link href="assets/images/favicon/favicon.png"><a href="?page=2">next</a><a href="?facet_color=noir">facet</a><a href="/kr/ko/product/lindy-26-H073428CKO5/">bag</a><a href="https://www.hermes.com/us/en/product/lindy-26-H073428CKO5/">foreign</a><a href="https://evil.test/kr/ko/product/lindy-26-H073428CKO5/">other</a>`,base,{localePrefix:'/kr/ko/'});
assert.equal(links.product.size,1);assert(links.product.has('H073428CKO5'));
assert.deepEqual([...links.listings],[base+'?page=2']);
assert.equal(hermesReferenceCode(base),null);assert.equal(hermesReferenceCode('https://www.hermes.com/kr/ko/product/a-H073428CKO5/'),'H073428CKO5');
console.log('PASS: Hermes official exact SKU discovery, country/host isolation, published pagination, facet/static exclusion');
