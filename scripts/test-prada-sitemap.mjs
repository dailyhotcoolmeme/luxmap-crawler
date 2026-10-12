import assert from 'node:assert/strict';
import {pradaCountrySitemapLinks} from '../crawler/common/prada-sitemap.js';
const sku='1BG606_2CYS_F0BW5_V_OOO',fr=`https://www.prada.com/fr/fr/p/test/${sku}`,en=`https://www.prada.com/fr/en/p/test/${sku}`,kr=`https://www.prada.com/kr/ko/p/test/${sku}`;
assert.deepEqual([...pradaCountrySitemapLinks([en,fr,kr],'https://www.prada.com/fr/sitemap.xml','fr','/fr/fr/p/')],[['1BG6062CYSF0BW5VOOO',fr]]);
assert.equal(pradaCountrySitemapLinks([en,kr],'https://www.prada.com/fr/sitemap.xml','fr','/fr/fr/p/').size,0);
console.log('PASS: sitemap URLs in other languages are skipped, not treated as a malformed document.');
