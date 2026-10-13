import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'crawler/completeness/bottega-veneta/import');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
const expected=JSON.parse(fs.readFileSync(path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json'))),existing=[];
for(let offset=0;;offset+=100){const rows=await guardedRest(`product_variants?brands.slug=eq.bottega-veneta&active=eq.true&select=normalized_code,name_ko,material_ko,color_ko,width_mm,height_mm,depth_mm,brands!inner(slug),product_models(model_key),product_media(is_primary,r2_object_key,sha256,width,height,source_url),market_products(country_code,official_product_code,currency_code,current_price,official_url)&order=id&limit=100&offset=${offset}`);existing.push(...rows);if(rows.length<100)break;}
const matched=[];
const sameNumber=(a,b)=>a==null||b==null?a==null&&b==null:Number(a)===Number(b);
for(const e of expected){const v=existing.find(v=>v.normalized_code===e.normalizedCode),market=v?.market_products.find(m=>m.country_code==='KR'),media=v?.product_media.find(m=>m.is_primary);if(v&&v.name_ko===e.productName&&v.material_ko===e.materialDisplay&&v.color_ko===e.colorDisplay&&sameNumber(v.width_mm,e.widthMm)&&sameNumber(v.height_mm,e.heightMm)&&sameNumber(v.depth_mm,e.depthMm)&&v.product_models?.model_key===e.modelKey&&market?.official_product_code===e.normalizedCode&&market.official_url===e.officialUrl&&market.currency_code==='KRW'&&Number(market.current_price)===e.price&&media?.width===960&&media.height===960&&/^[a-f0-9]{64}$/.test(media.sha256)&&media.r2_object_key.includes('/cutout-v1/')&&media.source_url===e.sourceImageUrl)matched.push(e.normalizedCode);}
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'stored-codes.json'),JSON.stringify(matched),{mode:0o600});
const f=path.join(folder,'resume-summary/summary.json');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify([{brand:'bottega-veneta',country:'KR',parentModel:'이미 적재한 실제 DB 일치 상품',variantCode:'TOTAL',price:null,currency:'KRW',status:`VERIFIED_REUSABLE_${matched.length}`,officialUrl:'https://www.bottegaveneta.com/ko-kr'}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[f],{stdio:'ignore'}).status)throw Error('blocked');
