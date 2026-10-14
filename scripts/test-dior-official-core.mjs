import assert from 'node:assert/strict';
import {parseOfficialProduct} from '../crawler/common/dior-official-core.js';

for(const [brand,host,prefix] of [
 ['dior','www.dior.com','/ko_kr/'],
 ['miu-miu','www.miumiu.com','/kr/ko'],
 ['the-row','www.therow.com','/en-kr/'],
]){
 const cfg={brand,country:'KR',currency:'KRW',entryUrl:`https://${host}${prefix}`,localePrefix:prefix,allowedHosts:[host],imageHosts:[host]};
 const url=`https://${host}${prefix}products/example-AB12345678`,image=`https://${host}/assets/original.jpg`;
 const product={"@type":"Product",sku:'AB12345678',name:'Official Tote',brand:{name:brand==='miu-miu'?'Miu Miu':brand==='the-row'?'The Row':'Dior'},category:'Handbags',url,image,color:'Black',material:'Leather',width:{value:30,unitCode:'CMT'},height:{value:20,unitCode:'CMT'},depth:{value:10,unitCode:'CMT'},offers:{price:'1230000',priceCurrency:'KRW',url}};
 const html=p=>`<script type="application/ld+json">${JSON.stringify(p)}</script>`;
 const result=parseOfficialProduct(html(product),url,cfg);
 assert.equal(result.normalizedCode,'AB12345678');assert.equal(result.price,1230000);assert.equal(result.currency,'KRW');
 assert.equal(result.sourceImageUrl,image);assert.equal(result.widthMm,300);assert.equal(result.colorOriginal,'Black');assert.equal(result.materialOriginal,'Leather');
 if(brand==='dior'){
  const independent=parseOfficialProduct(html({...product,isVariantOf:{productGroupID:'FAMILY',name:'Family'}}),url,cfg);
  assert.equal(independent.category,'bag');assert.equal(independent.modelKey,'sku-ab12345678');assert.equal(independent.parentModel,'Official Tote');assert.equal(independent.styleCode,'AB12345678');
 }
 assert.throws(()=>parseOfficialProduct(html({...product,sku:'OTHER12345'}),url,cfg),'exact sku');
 assert.throws(()=>parseOfficialProduct(html({...product,offers:{price:1,priceCurrency:'USD'}}),url,cfg),'wrong currency');
 assert.throws(()=>parseOfficialProduct(html({...product,image:'https://unrelated.example/original.jpg'}),url,cfg),'unapproved image');
 assert.throws(()=>parseOfficialProduct(html({...product,category:'Shoes'}),url,cfg),'non handbag');
 if(brand==='miu-miu'){
  const withoutOffer={...product,offers:[]};
  const source=`${html(withoutOffer)}<span>₩3,750,000</span><script>{"price":3750000}</script>`;
  assert.equal(parseOfficialProduct(source,url,cfg).price,3750000);
  assert.equal(parseOfficialProduct(`${source}<span>₩4,000,000</span>`,url,cfg).price,null);
 }
 if(brand==='the-row')assert.equal(parseOfficialProduct(html({...product,offers:{price:1230000,priceCurrency:'KRW',url:`${url}?variant=12345`}}),url,cfg).price,1230000);
 const foreign={...cfg,country:'JP',currency:'JPY',localePrefix:'/jp/',entryUrl:`https://${host}/jp/`};
 const jpUrl=`https://${host}/jp/products/example-AB12345678`;
 const jp={...product,url:jpUrl,offers:{price:190000,priceCurrency:'JPY',url:jpUrl}};
 assert.equal(parseOfficialProduct(html(jp),jpUrl,foreign,'AB12345678').price,190000);
 assert.throws(()=>parseOfficialProduct(html(jp),jpUrl,foreign,'OTHER12345'),'foreign exact code');
}
const lvCfg={brand:'louis-vuitton',country:'KR',currency:'KRW',entryUrl:'https://kr.louisvuitton.com/kor-kr/homepage',localePrefix:'/kor-kr/',allowedHosts:['kr.louisvuitton.com'],imageHosts:['kr.louisvuitton.com']};
const lvUrl='https://kr.louisvuitton.com/kor-kr/products/example-M12345.html';
const lv={"@type":"Product",sku:'M12345',name:'Official Tote',brand:{name:'Louis Vuitton'},category:'Handbags',url:lvUrl,image:'https://kr.louisvuitton.com/assets/original.jpg',offers:{price:1000000,priceCurrency:'KRW',url:lvUrl}};
assert.equal(parseOfficialProduct(`<script type="application/ld+json">${JSON.stringify(lv)}</script>`,lvUrl,lvCfg).normalizedCode,'M12345');
console.log('PASS: exact official SKU, country currency, handbag category, dimensions and original image gates');
