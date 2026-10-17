import assert from 'node:assert/strict';
import {parseLouisVuittonForeign,louisVuittonForeignUrl} from '../crawler/common/louis-vuitton-foreign.js';
const cfg={brand:'louis-vuitton',country:'JP',currency:'JPY',entryUrl:'https://jp.louisvuitton.com/jpn-jp/homepage',localePrefix:'/jpn-jp/',allowedHosts:['jp.louisvuitton.com']},code='M29090',url='https://jp.louisvuitton.com/jpn-jp/products/fixture-nvprod1v/'+code;
const product={'@type':'Product',sku:code,name:'fixture',url,offers:{price:500000,priceCurrency:'JPY',url}};
const html=p=>'<script type="application/ld+json">'+JSON.stringify(p)+'</script>';
assert.equal(parseLouisVuittonForeign(html(product),url,cfg,code).price,500000);
assert.throws(()=>parseLouisVuittonForeign(html({...product,offers:{price:1,priceCurrency:'KRW'}}),url,cfg,code),/CURRENCY_MISMATCH/);
assert.throws(()=>louisVuittonForeignUrl(url.replace('jp.louisvuitton','kr.louisvuitton'),cfg,code),/MISMATCH/);
assert.throws(()=>louisVuittonForeignUrl(url+'?country=KR',cfg,code),/MISMATCH/);
for(const[c,locale,segment]of[['FR','fra-fr','produits'],['IT','ita-it','prodotti'],['ES','esp-es','productos']]){const host=c.toLowerCase()+'.louisvuitton.com',nativeUrl='https://'+host+'/'+locale+'/'+segment+'/fixture/'+code;assert.equal(louisVuittonForeignUrl(nativeUrl,{...cfg,country:c,entryUrl:nativeUrl,localePrefix:'/'+locale+'/',productSegment:segment},code),nativeUrl);}
const native={identifier:code,name:'fixture',url:url.slice(0,-7),offers:{priceSpecification:{price:500000,priceCurrency:'JPY'}}};
assert.equal(parseLouisVuittonForeign(html(native),url,cfg,code).price,500000);
assert.throws(()=>parseLouisVuittonForeign(html({...native,identifier:'M29091'}),url,cfg,code),/UNAVAILABLE/);
assert.throws(()=>parseLouisVuittonForeign('<html><title>Access Denied</title></html>',url,cfg,code),/ACCESS_BLOCKED/);
assert.throws(()=>parseLouisVuittonForeign(html({identifier:code,offers:native.offers,model:[{identifier:'M29091'}]}),url,cfg,code),/UNAVAILABLE/);
console.log('PASS: LV foreign same-SKU/currency/published-country URL, no family price borrowing or denial retry');
