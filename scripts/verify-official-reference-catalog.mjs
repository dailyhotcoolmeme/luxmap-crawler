import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {productKind} from '../app/src/lib/product-kind.ts';
import {readRegisteredLouisVuitton} from '../crawler/common/louis-vuitton-registered.js';
const root=path.resolve(import.meta.dirname,'..'),brand=process.argv[2];
if(!['hermes','dior','saint-laurent','bulgari','louis-vuitton'].includes(brand)||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!process.env.EXPO_PUBLIC_SUPABASE_KEY||spawnSync(root+'/scripts/crawl-preflight.sh',[],{stdio:'ignore'}).status)throw Error('GUARDED_AUDIT_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(root+`/crawler/brands/${brand}/countries/kr`)),rows=[],out=root+`/crawler/completeness/${brand}/public-reference/summary.json`;
const row=status=>({brand,country:'KR',parentModel:'공개 앱 목록 대조',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:cfg.entryUrl});
fs.mkdirSync(path.dirname(out),{recursive:true});
const guard=file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};
const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
const get=async(url,key=false)=>{const r=await client.get(url,{maxRedirects:0,headers:key?{apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY}:{}});if(!r.ok())throw Error('PUBLIC_READ_FAILED');const b=await r.body();if(b.length>8388608)throw Error('PUBLIC_RESPONSE_LIMIT');return JSON.parse(b.toString());};
try{
 const fullDiorListing=brand==='dior'&&process.argv.includes('--full-listing');
 const index=fullDiorListing?null:JSON.parse(fs.readFileSync(brand==='louis-vuitton'?root+'/crawler/completeness/louis-vuitton/catalog-source/candidates.json':root+`/crawler/brands/${brand}/.reference-index.json`));
 const expected=new Set(fullDiorListing?[]:brand==='louis-vuitton'?index.map(p=>p.code):brand==='hermes'?index.products.map(p=>p.code):index.candidates.map(p=>p.sku));
 if(brand==='louis-vuitton'){const ready=root+'/crawler/completeness/louis-vuitton/ready-catalog-source';if(fs.existsSync(ready+'/summary.json')){guard(ready+'/summary.json');for(const p of JSON.parse(fs.readFileSync(ready+'/candidates.json')))expected.add(p.code);}}
 let fullAudit=false;
 if(brand==='louis-vuitton'){
  const expanded=root+'/crawler/completeness/louis-vuitton/expanded-catalog-source';guard(expanded+'/summary.json');
  const candidates=JSON.parse(fs.readFileSync(expanded+'/candidates.json'));if(!Array.isArray(candidates)||!candidates.length||candidates.length>10000)throw Error('FULL_SCOPE_INVALID');
  for(const p of candidates){if(typeof p.code!=='string'||p.category!=='bag')throw Error('FULL_SCOPE_INVALID');expected.add(p.code);}
  rows.push(row('FULL_KNOWN_CATALOG_SCOPE'));
  const audit=root+'/crawler/completeness/louis-vuitton/catalog-audit/summary.json';if(fs.existsSync(audit)){const a=guard(audit);fullAudit=['FULL_CATALOG_AUDIT_VERIFIED','CATALOG_REFERENCE_COUNT_'+expected.size,'UNCLASSIFIED_0','DISCOVERY_LIMIT_HIT_0'].every(status=>a.some(r=>r.status===status));}
  rows.push(row(fullAudit?'FULL_CATALOG_AUDIT_VERIFIED':'DISCOVERY_AUDIT_REQUIRED'));
 }
 if(brand==='dior'&&process.argv.includes('--full-listing')){
  const file=root+'/crawler/completeness/dior/full-listing/discovery-candidates.json';
  const urls=JSON.parse(fs.readFileSync(file));
  if(!Array.isArray(urls)||!urls.length||urls.length>10000)throw Error('CANDIDATE_SCOPE');
  expected.clear();
  for(const url of urls){
   const match=typeof url==='string'&&url.match(/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)\/?$/);
   if(!match)throw Error('CANDIDATE_URL');
   expected.add(match[1].replaceAll('_',''));
  }
  rows.push(row('CANDIDATES_NOT_CONFIRMED_BAG_COUNT'));
 }
 const source=new Map(),base=root+`/crawler/runs/${brand}/kr`;
 if(brand==='louis-vuitton')for(const r of readRegisteredLouisVuitton(root)){source.set(r.code,{officialUrl:r.url,price:r.price});expected.add(r.code);}
 for(const name of fs.readdirSync(base)){
  const file=path.join(base,name,'artifacts/public-verified/summary.json');if(!fs.existsSync(file))continue;
  for(const r of guard(file))if(r.status==='PUBLIC_CATALOG_VERIFIED')source.set(r.variantCode,r);
 }
 if(brand==='louis-vuitton'){
  for(const code of source.keys())expected.add(code);
  const repaired=root+'/crawler/completeness/louis-vuitton/metadata-repair/summary.json';
  const repairedFiles=fs.existsSync(repaired)?[repaired]:[],batches=path.dirname(repaired)+'/batches';if(fs.existsSync(batches))for(const id of fs.readdirSync(batches))if(fs.existsSync(batches+'/'+id+'/summary.json'))repairedFiles.push(batches+'/'+id+'/summary.json');
  const productProofs=path.dirname(repaired)+'/products';if(fs.existsSync(productProofs))for(const id of fs.readdirSync(productProofs))if(fs.existsSync(productProofs+'/'+id+'/summary.json'))repairedFiles.push(productProofs+'/'+id+'/summary.json');
  for(const file of repairedFiles)for(const r of guard(file))if(r.status==='KR_PRICE_HISTORY_PUBLIC_VERIFIED'&&source.get(r.variantCode)?.officialUrl===r.officialUrl)source.set(r.variantCode,r);
 }
 const publicRows=[];
 for(let offset=0;offset<10000;offset+=500){
  const q=new URLSearchParams({select:'id,normalized_code,color_ko,material_ko,width_mm,height_mm,depth_mm,brands!inner(slug),market_products(country_code,currency_code,current_price,price_status,official_product_code,official_url),product_media(is_primary,r2_object_key)',active:'eq.true','brands.slug':'eq.'+brand,offset:String(offset),limit:'500',order:'id.asc'});
  const page=await get('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/product_variants?'+q,true);publicRows.push(...page);if(page.length<500)break;if(offset===9500)throw Error('PUBLIC_PAGE_LIMIT');
 }
 let verified=0,images=0,priced=0;const ids=[];
 for(const code of expected){
  const matches=publicRows.filter(p=>p.normalized_code===code),p=matches[0],s=source.get(code),markets=p?.market_products.filter(m=>m.country_code==='KR')??[],m=markets[0];
  const media=p?.product_media.filter(m=>m.is_primary)??[];
  const imageOk=media.length===1&&media[0].r2_object_key.startsWith(`products/${brand}/sku-${code.toLowerCase()}/${code}/cutout-v1/`)&&/\/[a-f0-9]{64}\.webp$/.test(media[0].r2_object_key);
  if(matches.length!==1||!s||markets.length!==1||m.currency_code!=='KRW'||m.official_product_code!==code||m.official_url!==s.officialUrl||(s.price===null?m.current_price!==null:Number(m.current_price)!==s.price)||!imageOk)continue;
  if(brand==='louis-vuitton'&&s.price===null&&m.price_status!=='parse_failed')throw Error('UNVERIFIED_PRICE_STATUS_MISMATCH');
  verified++;images++;if(s.price!==null)priced++;ids.push(p.id);
 }
 rows.push(...[`SOURCE_CANDIDATES_${expected.size}`,`PUBLIC_VERIFIED_${verified}`,`PRICE_CONFIRMED_${priced}`,`IMAGE_LINK_VERIFIED_${images}`,`UNRESOLVED_${expected.size-verified}`].map(row));
 if(['louis-vuitton','dior'].includes(brand)){const selected=publicRows.filter(p=>ids.includes(p.id));rows.push(...[`PUBLIC_COLOR_${selected.filter(p=>p.color_ko).length}`,`PUBLIC_MATERIAL_${selected.filter(p=>p.material_ko).length}`,`PUBLIC_DIMENSIONS_${selected.filter(p=>p.width_mm&&p.height_mm&&p.depth_mm).length}`].map(row));}
 if(brand==='louis-vuitton'){
  const expanded=root+'/crawler/completeness/louis-vuitton/expanded-catalog-source/summary.json';if(fs.existsSync(expanded)){const n=guard(expanded).find(r=>/^BAG_NAME_IMAGE_MATCHES_\d+$/.test(r.status));if(n)rows.push(row(n.status.replace('BAG_NAME_IMAGE_MATCHES_','DISCOVERED_BAG_TARGETS_')));}
 }
 if(brand==='louis-vuitton')rows.push(row('PRICE_UNVERIFIED_'+(expected.size-priced)));
 if(brand==='hermes'&&process.argv.includes('--foreign'))for(const country of ['jp','fr','it','es','us','sg','hk']){
  const marketConfig=JSON.parse(fs.readFileSync(root+`/crawler/brands/hermes/countries/${country}`));let linked=0,confirmed=0,invalid=0;
  for(const code of expected){const p=publicRows.find(p=>p.normalized_code===code),markets=p?.market_products.filter(m=>m.country_code===marketConfig.country)??[];if(!markets.length)continue;
   const m=markets[0];let valid=false;try{const u=new URL(m.official_url);valid=markets.length===1&&u.protocol==='https:'&&u.host==='www.hermes.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith(marketConfig.localePrefix)&&u.pathname.match(/\/product\/[^/]+-(H[A-Z0-9]{8,19})\/?$/i)?.[1]?.toUpperCase()===code&&m.official_product_code===code&&m.currency_code===marketConfig.currency&&(m.current_price===null||Number.isFinite(Number(m.current_price))&&Number(m.current_price)>0);}catch{}
   if(!valid){invalid++;continue;}linked++;if(m.current_price!==null)confirmed++;
  }
  const foreignRow=status=>({brand,country:marketConfig.country,parentModel:'한국 전체 SKU 해외 공개 연결 검증',variantCode:'TOTAL',price:null,currency:marketConfig.currency,status,officialUrl:marketConfig.entryUrl});
  rows.push(...[`KOREAN_REFERENCE_${expected.size}`,`LINKED_${linked}`,`PRICE_CONFIRMED_${confirmed}`,`PRICE_UNPUBLISHED_${linked-confirmed}`,`UNPROCESSED_${expected.size-linked}`,`INVALID_LINK_${invalid}`].map(foreignRow));
  if(linked!==expected.size||invalid)process.exitCode=2;
 }
 const category=brand==='bulgari'?'jewelry':'bag';if(productKind({brandSlug:brand})!==category)throw Error('APP_CATEGORY_MISMATCH');rows.push(row('LOCAL_CATEGORY_MAPPING_VERIFIED'));
 const snapshot=await get('https://luxury-assets.dailyhotcoolmeme.workers.dev/comparison/catalog');
 if(snapshot.categoryVersion!==2||!Array.isArray(snapshot.estimates))throw Error('PUBLIC_SNAPSHOT_VERSION_MISSING');
 const snapshotLinks=ids.filter(id=>snapshot.estimates.some(r=>r.id===id)).length;rows.push(row(`PUBLIC_SNAPSHOT_LINKS_${snapshotLinks}`));
 if(brand==='louis-vuitton'){const complete=fullAudit&&expected.size>0&&verified===expected.size&&priced===expected.size&&images===expected.size&&snapshotLinks===expected.size;rows.push(row(complete?'FULL_COLLECTION_VERIFIED':'FULL_COLLECTION_INCOMPLETE'));if(!complete)process.exitCode=2;}
 if(expected.size!==verified)process.exitCode=2;
}catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PUBLIC_AUDIT_FAILED'));process.exitCode=1;}
finally{await client.dispose();fs.writeFileSync(out,JSON.stringify(rows),{mode:0o600});guard(out);}
