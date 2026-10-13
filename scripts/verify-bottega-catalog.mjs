import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
const base=path.join(root,'crawler/runs/bottega-veneta/kr'),dir=fs.readdirSync(base).sort().reverse().map(d=>path.join(base,d)).find(d=>fs.existsSync(path.join(d,'artifacts/catalog-source-products.json')));
if(!dir||spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(dir,'summary.json')],{stdio:'ignore'}).status)throw Error('blocked');
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--expected-file'))throw Error('INVALID_ARGUMENT');
const expectedFile=args[1]?path.resolve(args[1]):path.join(dir,'artifacts/catalog-source-products.json');
if(args[1]&&path.dirname(expectedFile)!==path.join(root,'crawler/completeness/bottega-veneta/import'))throw Error('EXPECTED_FILE_SCOPE');
const expected=JSON.parse(fs.readFileSync(expectedFile)),variants=[];
for(let offset=0;;offset+=100){const page=await guardedRest(`product_variants?brands.slug=eq.bottega-veneta&active=eq.true&select=id,normalized_code,brands!inner(slug),product_models(model_key),product_media(is_primary,r2_object_key,sha256,width,height),market_products(country_code,official_product_code,currency_code,current_price,official_url)&order=id&limit=100&offset=${offset}`);variants.push(...page);if(page.length<100)break;}
let linked=0,media=0,invalid=0;const missing=[];
for(const e of expected){const v=variants.find(v=>v.normalized_code===e.sku.toUpperCase());if(!v){missing.push(e);continue;}const market=v.market_products.find(m=>m.country_code==='KR');let ok=false;try{const u=new URL(market.official_url);ok=u.protocol==='https:'&&u.hostname==='www.bottegaveneta.com'&&u.pathname.startsWith('/ko-kr/')&&decodeURIComponent(u.pathname).toUpperCase().endsWith(`${v.normalized_code}.HTML`)&&market.official_product_code===v.normalized_code&&market.currency_code==='KRW'&&Number(market.current_price)>0;}catch{}if(ok)linked++;else invalid++;
 const p=v.product_media.find(p=>p.is_primary);if(p&&p.width===960&&p.height===960&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.r2_object_key.startsWith('products/bottega-veneta/')&&p.r2_object_key.includes('/cutout-v1/'))media++;else invalid++;
 if(!v.product_models?.model_key)invalid++;
}
const folder=path.join(root,'crawler/completeness/bottega-veneta/db-verification');fs.mkdirSync(folder,{recursive:true});const f=path.join(folder,'summary.json');fs.writeFileSync(f,JSON.stringify([['EXPECTED',expected.length],['DB_REFERENCE',variants.length],['KR_LINKED',linked],['OPTIMIZED_MEDIA',media],['MISSING',missing.length],['INVALID',invalid]].map(([k,n])=>({brand:'bottega-veneta',country:'KR',parentModel:'실제 DB 상품·가격·이미지 대조',variantCode:'TOTAL',price:null,currency:'KRW',status:`${k}_${n}`,officialUrl:'https://www.bottegaveneta.com/ko-kr'}))));
if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[f],{stdio:'ignore'}).status)throw Error('blocked');if(missing.length||invalid)process.exitCode=1;
