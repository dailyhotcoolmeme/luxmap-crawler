import assert from 'node:assert/strict';
import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync(new URL('../crawler/brands/dior/countries/kr',import.meta.url))),pattern=new RegExp(cfg.productPathPattern,'i');
for(const ref of ['M2418UTZQ_M928','M6322UDDS_M928'])assert(pattern.test('/ko_kr/fashion/products/'+ref));
for(const ref of ['/ko_kr/fashion/mens-fashion/bags/hit-the-road','/ko_kr/fashion/products/','/ko_kr/fashion/products/M6322UDDS_M928/similar'])assert(!pattern.test(ref));
assert.equal(cfg.maxCandidates,10000);assert.equal(cfg.maxResponseBytes,8388608);
console.log('PASS: published Dior underscore reference paths retained without changing scope/limits');
