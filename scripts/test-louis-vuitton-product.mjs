import assert from 'node:assert/strict';
import {louisVuittonExplicitBagImages} from '../crawler/common/louis-vuitton-metadata.js';
assert.equal(louisVuittonExplicitBagImages([{name:'Fixture 가방 전체 보기'}]),true);
assert.equal(louisVuittonExplicitBagImages([{name:'Fixture 핸드백 전체 보기'}]),true);
for(const images of [[],[{name:'Fixture 가방 액세서리 전체 보기'}],[{name:'Fixture 가방 전체 보기'},{name:'Fixture 지갑'}],[{name:'가방 액세서리 | 가방 전체 보기'}]])assert.equal(louisVuittonExplicitBagImages(images),false);
import {louisVuittonCode,isLouisVuittonReference,louisVuittonFamilyUrl,louisVuittonAccess,parseLouisVuittonProduct} from '../crawler/common/louis-vuitton-product.js';
for(const code of ['M12345','M2A840','M3A345','N12345']){
 assert.equal(louisVuittonCode('https://kr.louisvuitton.com/kor-kr/products/fixture/'+code),code);
 assert(isLouisVuittonReference(code));
}
assert.equal(louisVuittonCode('https://kr.louisvuitton.com/kor-kr/products/fixture-M12345'), 'M12345');
assert.equal(louisVuittonFamilyUrl('https://kr.louisvuitton.com/kor-kr/products/fixture/M2A840'),'https://kr.louisvuitton.com/kor-kr/products/fixture');
assert.equal(louisVuittonCode('https://kr.louisvuitton.com/kor-kr/products/fixture/UNKNOWN'),null);
assert.throws(()=>louisVuittonAccess('<html><body>Access denied</body></html>'),/ACCESS_BLOCKED/);
assert.throws(()=>louisVuittonAccess('<html>normal</html>',403),/ACCESS_BLOCKED/);
assert.doesNotThrow(()=>louisVuittonAccess('<script>const explanation="access denied"</script><body>normal product</body>'));
const cfg={entryUrl:'https://kr.louisvuitton.com/kor-kr/homepage',allowedHosts:['kr.louisvuitton.com'],localePrefix:'/kor-kr/'};
assert.throws(()=>parseLouisVuittonProduct('<html>normal shell</html>','https://kr.louisvuitton.com/kor-kr/products/fixture/M12345',cfg),/PRODUCT_DATA_UNAVAILABLE/);
console.log('PASS: LV current and legacy exact references, family identity and real denial detection');
