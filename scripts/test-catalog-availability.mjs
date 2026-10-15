import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availabilityEvidence} from '../crawler/common/catalog-availability.js';
import {availabilitySchema as sql} from '../crawler/common/catalog-availability-schema.js';
for(const brand of ['chanel','prada','bottega-veneta','van-cleef-arpels','rolex']){
 const cfg=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/${brand}/countries/kr`,import.meta.url)));
 // Known public KR sample URLs, no collection/network in this regression test.
 const urls={chanel:'https://www.chanel.com/kr/fashion/p/A01112Y01864C3906/',prada:'https://www.prada.com/kr/ko/p/bag/1BA038_2CX9_F0018_V_8OM','bottega-veneta':'https://www.bottegaveneta.com/ko-kr/bag-795630V4IV11000.html','van-cleef-arpels':'https://www.vancleefarpels.com/kr/ko/collections/jewelry/alhambra/vcara36300---pure-alhambra-bracelet-4-motifs.html',rolex:'https://www.rolex.com/ko-kr/watches/1908/m52506-0003'};
 const url=urls[brand];
 assert(availabilityEvidence(cfg,url,404),brand);assert(availabilityEvidence(cfg,url,410),brand);assert(availabilityEvidence(cfg,url,200,true),brand);
 assert.equal(availabilityEvidence(cfg,url,200),null,'unparsed 200 is not presence evidence');
 for(const status of [401,403,429,500])assert.equal(availabilityEvidence(cfg,url,status),null);
 assert.equal(availabilityEvidence({...cfg,country:'JP'},url,404),null);
 assert.equal(availabilityEvidence(cfg,'https://invalid.example/product',404),null);
 assert.equal(availabilityEvidence(cfg,new URL('/robots.txt',url).href,404),null);
}
const migration=new URL('../supabase/migrations/20261015144044_catalog_availability_state.sql',import.meta.url);
if(fs.existsSync(migration))assert.equal(sql,fs.readFileSync(migration,'utf8'),'reviewed schema matches applied migration');
assert(sql.includes("interval '24 hours'"));assert(sql.includes('security invoker'));assert(sql.includes('enable row level security'));assert(sql.includes('from public, anon, authenticated'));assert(!/delete\s+from|truncate|update\s+public\.price_history/i.test(sql),'hiding preserves catalog and all history');
console.log('PASS: five-brand exact KR URL evidence, parsed presence only, no block/error/foreign/robots evidence, delayed hiding and history preservation');
