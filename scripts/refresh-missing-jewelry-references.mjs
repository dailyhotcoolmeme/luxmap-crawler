import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {referenceCode} from '../crawler/common/jewelry-watch-product.js';
const root=path.resolve(import.meta.dirname,'..'),brand=process.argv[2];
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||process.argv.length!==3||!['rolex','van-cleef-arpels'].includes(brand))throw Error('CENTRAL_RUN_REQUIRED');
const guard=file=>fs.existsSync(file)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status===0;
const index=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'.reference-index.json')));
if(!Array.isArray(index.urls)||Date.now()-Date.parse(index.checkedAt)>86400000||!Number.isFinite(Date.parse(index.checkedAt)))throw Error('REFERENCE_INDEX_STALE');
const normalize=code=>code?.replace(/[^a-z0-9]/gi,'').toUpperCase();
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries/kr'))),listed=new Set(index.urls.map(url=>normalize(referenceCode(url,brand)))),targets=[];
for(let offset=0;;offset+=100){
 const rows=guardedRest(`product_variants?brands.slug=eq.${brand}&select=normalized_code,brands!inner(slug),market_products(country_code,official_product_code,official_url)&order=id&limit=100&offset=${offset}`);
 for(const row of rows){const markets=row.market_products.filter(m=>m.country_code==='KR'&&m.official_product_code===row.normalized_code);if(markets.length!==1)throw Error('REFERENCE_NOT_UNIQUE');const url=markets[0].official_url,code=normalize(referenceCode(url,brand));if(!code||code!==row.normalized_code)throw Error('REFERENCE_CODE_MISMATCH');if(!listed.has(code))targets.push(url);}
 if(rows.length<100)break;
}
const folder=path.join(root,'crawler/onboarding',brand,'missing-reference');fs.mkdirSync(folder,{recursive:true});
for(let offset=0;offset<targets.length;offset+=cfg.maxProductsPerRun){
 const urls=targets.slice(offset,offset+cfg.maxProductsPerRun),file=path.join(folder,'urls.json');fs.writeFileSync(file,JSON.stringify(urls),{mode:0o600});
 const result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),[brand,'kr','--reference-urls-file',file],{cwd:root,env:process.env,stdio:'ignore',timeout:900000});
 if(result.status===78||result.signal||result.error)process.exit(78);
 const base=path.join(root,'crawler/runs',brand,'kr'),run=path.join(base,fs.readdirSync(base).sort().at(-1)),summary=path.join(run,'summary.json'),presence=path.join(run,'availability-report/summary.json');
 if(!guard(summary)||!guard(presence))throw Error('MISSING_REFERENCE_UNVERIFIED');
 const rows=JSON.parse(fs.readFileSync(summary)),states=JSON.parse(fs.readFileSync(presence));
 if(result.status!==0){
  // Missing pages need no price ingest. Mixed batches must also prove that
  // every available product was actually stored; never mask a storage failure.
  const storedFile=path.join(run,'artifacts/verified/summary.json'),stored=guard(storedFile)?JSON.parse(fs.readFileSync(storedFile)):[];
  if(!urls.every(url=>rows.some(r=>r.officialUrl===url&&['HTTP_404','HTTP_410'].includes(r.status))&&states.some(r=>r.officialUrl===url&&['MISSING_PENDING','MISSING_CONFIRMED','EVIDENCE_ALREADY_SEEN'].includes(r.status))||result.status===2&&stored.some(r=>r.variantCode===normalize(referenceCode(url,brand))&&r.status==='PUBLIC_CATALOG_VERIFIED')))throw Error('MISSING_REFERENCE_COLLECTION_FAILED');
 }
}
const report=path.join(folder,'summary.json');fs.writeFileSync(report,JSON.stringify([{brand,country:'KR',parentModel:'기존 한국 SKU 공식 상세 재확인',variantCode:'TOTAL',price:null,currency:'KRW',status:`UNLISTED_REFERENCES_CHECKED_${targets.length}`,officialUrl:cfg.entryUrl}]),{mode:0o600});if(!guard(report))throw Error('SUMMARY_BLOCKED');
