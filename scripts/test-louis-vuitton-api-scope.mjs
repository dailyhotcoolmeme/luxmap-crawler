import assert from 'node:assert/strict';
import {louisVuittonAncillaryApi as ancillary} from '../crawler/common/louis-vuitton-published-browser.js';
const base='https://api.louisvuitton.com';
assert(ancillary(base+'/eco-as/shopping-cart-eapi/v1/carts/kor-kr'));
assert(ancillary(base+'/eco-as/lvcom-wishlist-eapi/v1/kor-kr/wishlists'));
for(const url of [base+'/products',base+'/search',base+'/eco-as/catalog-eapi/v1/search',base+'/eco-as/lvcom-tkn-handlr-eapi/v1/context','http://api.louisvuitton.com/eco-as/shopping-cart-eapi/v1/carts/kor-kr',base.replace('api.','evil.')+'/eco-as/shopping-cart-eapi/v1/carts/kor-kr','https://user:secret@api.louisvuitton.com/eco-as/shopping-cart-eapi/v1/carts/kor-kr'])assert.equal(ancillary(url),false);
console.log('PASS: only exact KR cart/wishlist services excluded; catalogue and security contexts retain refusal gates');
