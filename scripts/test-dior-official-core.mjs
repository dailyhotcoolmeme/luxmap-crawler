import assert from 'node:assert/strict';
import {parseOfficialProduct,indexedDiorListingAllowed,diorPublicProofCodes,isDiorBagName} from '../crawler/common/dior-official-core.js';
assert(isDiorBagName('Dior Trek 지퍼 슬링백'));
assert(isDiorBagName('Dior Jolie 스몰 탑 핸들백'));
assert(!isDiorBagName('슬링백 펌프스'));
assert(!isDiorBagName('디올 클로버 백 참'));
assert(!isDiorBagName('베니티 미니'));
assert(!isDiorBagName('DIOR AND RIMOWA 기내용 캐리어'));
import {diorPreparedImageLimit} from '../crawler/common/dior-reference-recovery.js';
assert.equal(diorPreparedImageLimit('originalImagePath',8388608),12582912);
assert.equal(diorPreparedImageLimit('imagePath',8388608),8388608);
assert.throws(()=>diorPreparedImageLimit('other',8388608),/IMAGE_CACHE_SCOPE/);

const indexedTarget='https://www.dior.com/ko_kr/fashion/bags/bags',indexedCfg={brand:'dior',country:'KR'},indexedProof=[{brand:'dior',country:'KR',status:'INDEXED_ROUTE_CANDIDATE',officialUrl:indexedTarget}];
assert(indexedDiorListingAllowed(indexedTarget,indexedCfg,indexedProof));
const search='https://www.dior.com/ko_kr/fashion/products/search?query='+encodeURIComponent('가방'),searchProof=[{brand:'dior',country:'KR',status:'PUBLISHED_PUBLIC_DATA_ROUTE',officialUrl:'https://www.dior.com/ko_kr/fashion/products/search?query=[value]'}];
assert(indexedDiorListingAllowed(search,indexedCfg,searchProof));
for(const target of [search+'&extra=1',search.replace(encodeURIComponent('가방'),'other'),search.replace('www.dior.com','other.example'),search+'#x'])assert(!indexedDiorListingAllowed(target,indexedCfg,searchProof));
assert(!indexedDiorListingAllowed(search,indexedCfg,[]));
const publicProof={brand:'dior',country:'KR',currency:'KRW',status:'PUBLIC_CATALOG_VERIFIED',variantCode:'M123M900',officialUrl:'https://www.dior.com/ko_kr/fashion/products/M123_M900'};
assert.deepEqual([...diorPublicProofCodes([publicProof,publicProof])],['M123M900']);
for(const change of [{country:'US'},{currency:'USD'},{variantCode:'OTHER'},{brand:'other'},{officialUrl:'https://example.com/ko_kr/fashion/products/M123_M900'}])assert.throws(()=>diorPublicProofCodes([{...publicProof,...change}]),/DIOR_PUBLIC_PROOF_IDENTITY/);
assert(!indexedDiorListingAllowed(indexedTarget,indexedCfg,[]));
assert(!indexedDiorListingAllowed(indexedTarget,{...indexedCfg,country:'US'},indexedProof));
const usListing='https://www.dior.com/en_us/fashion/discover/new-bags-for-women',usProof=[{brand:'dior',country:'US',status:'INDEXED_ROUTE_CANDIDATE',officialUrl:usListing}];
assert(indexedDiorListingAllowed(usListing,{brand:'dior',country:'US'},usProof));
assert(!indexedDiorListingAllowed(usListing,indexedCfg,usProof));
assert(!indexedDiorListingAllowed(usListing,{brand:'dior',country:'US'},[]));
assert(!indexedDiorListingAllowed(usListing,{brand:'dior',country:'US'},usProof.map(r=>({...r,country:'KR'}))));
for(const target of [indexedTarget+'?page=2',indexedTarget+'#fragment',indexedTarget.replace('www.dior.com','other.example'),indexedTarget.replace('/ko_kr/','/en_us/')])assert(!indexedDiorListingAllowed(target,indexedCfg,indexedProof));

for(const [brand,host,prefix] of [
 ['dior','www.dior.com','/ko_kr/'],
 ['miu-miu','www.miumiu.com','/kr/ko'],
 ['the-row','www.therow.com','/en-kr/'],
]){
 const cfg={brand,country:'KR',currency:'KRW',entryUrl:`https://${host}${prefix}`,localePrefix:prefix,allowedHosts:[host],imageHosts:brand==='dior'?['assets.christiandior.com']:[host]};
 const url=`https://${host}${prefix}products/example-AB12345678`,image=brand==='dior'?'https://assets.christiandior.com/is/image/diorprod/AB12345678_E01':`https://${host}/assets/original.jpg`;
 const product={"@type":"Product",sku:'AB12345678',name:'Official Tote',brand:{name:brand==='miu-miu'?'Miu Miu':brand==='the-row'?'The Row':'Dior'},category:'Handbags',url,image,color:'Black',material:'Leather',width:{value:30,unitCode:'CMT'},height:{value:20,unitCode:'CMT'},depth:{value:10,unitCode:'CMT'},offers:{price:'1230000',priceCurrency:'KRW',url}};
 const html=p=>`<script type="application/ld+json">${JSON.stringify(p)}</script>`;
 const result=parseOfficialProduct(html(product),url,cfg);
 assert.equal(result.normalizedCode,'AB12345678');assert.equal(result.price,1230000);assert.equal(result.currency,'KRW');
 assert.equal(result.sourceImageUrl,image);assert.equal(result.widthMm,300);assert.equal(result.colorOriginal,'Black');assert.equal(result.materialOriginal,'Leather');
 if(brand==='dior'){
  assert.throws(()=>parseOfficialProduct(html({...product,name:'검증용 스커트',offers:[{url:url+'_36'},{url:url+'_38'}]}),url,cfg,null,{handbagEvidence:true}),/NON_BAG_CONFIRMED/);
  assert.throws(()=>parseOfficialProduct(html({...product,name:'불명확한 제품'}),url,cfg,null,{handbagEvidence:true}),/CLASSIFICATION_UNRESOLVED/);
  assert.equal(parseOfficialProduct(html({...product,offers:{...product.offers,url:url+'_TU'}}),url,cfg).price,1230000);
  assert.throws(()=>parseOfficialProduct(html({...product,offers:{...product.offers,url:url+'_OTHER'}}),url,cfg));
  assert.throws(()=>parseOfficialProduct(html({...product,offers:{...product.offers,url:url+'_TU',sku:'OTHER12345'}}),url,cfg));
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
