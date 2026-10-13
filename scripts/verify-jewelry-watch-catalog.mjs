import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {referenceCode} from '../crawler/common/jewelry-watch-product.js';
const kindFile=new URL('../app/src/lib/product-kind.ts',import.meta.url);
const productKind=fs.existsSync(kindFile)?(await import(kindFile.href)).productKind:null;
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATION_REQUIRED');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('PREFLIGHT_FAILED');
const key=process.env.EXPO_PUBLIC_SUPABASE_KEY;
if(!key)throw Error('PUBLIC_KEY_REQUIRED');
const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:key}});
const selection=process.argv.slice(2);
if(selection.length&&!(selection.length===2&&selection[0]==='--brand'&&selection[1]==='van-cleef-arpels'))throw Error('AUDIT_SCOPE_INVALID');
const selected=selection.length?[selection[1]]:['van-cleef-arpels','rolex'];
const output=path.join(root,selection.length?'crawler/onboarding/van-cleef-arpels/daily-audit/summary.json':'crawler/onboarding/final-public/summary.json'),summary=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const guarded=file=>{
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('SUMMARY_REJECTED');
 return JSON.parse(fs.readFileSync(file));
};
const save=()=>{fs.writeFileSync(output,JSON.stringify(summary),{mode:0o600});guarded(output);};
let activeBrand='rolex';
try{
 for(const brand of selected){
  activeBrand=brand;
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries/kr')));
  const index=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'.reference-index.json')));
  if(!Number.isFinite(Date.parse(index.checkedAt))||Date.now()-Date.parse(index.checkedAt)>86400000)throw Error('REFERENCE_INDEX_STALE');
  const expected=new Map(index.urls.map(url=>[referenceCode(url,brand).replace(/[^a-z0-9]/gi,'').toUpperCase(),url]));
  const captured=new Map(),base=path.join(root,'crawler/runs',brand,'kr');
  const cutoff=index.checkedAt.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z').slice(0,13);
  for(const name of fs.readdirSync(base).sort()){
   const file=path.join(base,name,'artifacts/verified/summary.json');
   if(!fs.existsSync(file)||Date.now()-fs.statSync(file).mtimeMs>86400000)continue;
   for(const row of guarded(file))if(row.status==='PUBLIC_CATALOG_VERIFIED')captured.set(row.variantCode,row);
  }
  const publicRows=[];
  for(let offset=0;offset<10000;offset+=500){
   const query=new URLSearchParams({select:'id,normalized_code,brands!inner(slug,name_ko,name_original),product_models(id),product_media(r2_object_key,is_primary),market_products(country_code,currency_code,current_price,official_product_code,official_url)',active:'eq.true','brands.slug':`eq.${brand}`,order:'id.asc',offset:String(offset),limit:'500'});
   const response=await client.get(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/product_variants?${query}`,{maxRedirects:0});
   if(!response.ok())throw Error('PUBLIC_READ_FAILED');
   const page=await response.json();publicRows.push(...page);
   if(page.length<500)break;
   if(offset===9500)throw Error('PUBLIC_PAGE_LIMIT');
  }
  let verified=0,priced=0,images=0,categories=0,mismatch=0;
  for(const [code,url] of expected){
   const matches=publicRows.filter(r=>r.normalized_code===code),v=matches[0],source=captured.get(code);
   const markets=v?.market_products.filter(m=>m.country_code==='KR')??[],m=markets[0];
   const media=v?.product_media.filter(m=>m.is_primary)??[];
   const imageOk=media.length===1&&media[0].r2_object_key.startsWith(`products/${brand}/`)&&media[0].r2_object_key.includes(`/${code}/cutout-v1/`)&&/\/[a-f0-9]{64}\.webp$/.test(media[0].r2_object_key);
   const kind=productKind?.({brand:v?.brands?.name_ko,brandOriginal:v?.brands?.name_original});
   const categoryOk=productKind?kind===cfg.category:(brand==='van-cleef-arpels'&&cfg.category==='jewelry'&&v?.brands?.name_ko==='반클리프 아펠');
   if(imageOk)images++;if(categoryOk)categories++;
   if(matches.length!==1||!v.product_models?.id||!source||markets.length!==1||m.currency_code!=='KRW'||m.official_product_code!==code||m.official_url!==url||source.officialUrl!==url||
      (source.price===null?m.current_price!==null:Number(m.current_price)!==source.price)||!imageOk||!categoryOk){mismatch++;continue;}
   verified++;if(source.price!==null)priced++;
  }
  const row=status=>({brand,country:'KR',parentModel:'공개 앱 목록 전체 대조',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:cfg.entryUrl});
  summary.push(...[`SOURCE_CANDIDATES_${expected.size}`,`PUBLIC_VERIFIED_${verified}`,`PRICE_CONFIRMED_${priced}`,`PRICE_UNPUBLISHED_${verified-priced}`,`IMAGE_LINK_VERIFIED_${images}`,`APP_CATEGORY_VERIFIED_${categories}`,`UNRESOLVED_${mismatch}`].map(row));
  if(mismatch)process.exitCode=1;save();
 }
}catch(e){summary.push({brand:activeBrand,country:'KR',parentModel:'공개 앱 목록 전체 대조',variantCode:'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PUBLIC_AUDIT_FAILED',officialUrl:activeBrand==='rolex'?'https://www.rolex.com/ko-kr':'https://www.vancleefarpels.com/kr/ko/'});save();process.exitCode=1;}
finally{await client.dispose();}
