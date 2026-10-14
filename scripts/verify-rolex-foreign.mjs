import fs from 'node:fs';
import path from 'node:path';
import {request} from 'playwright-core';
import {spawnSync} from 'node:child_process';
import {referenceCode} from '../crawler/common/jewelry-watch-product.js';
import Module,{createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATION_REQUIRED');
const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY}});
const rows=[],file=path.join(root,'crawler/onboarding/rolex/foreign/public-summary/summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});
try{
 const products=[];
 for(let offset=0;offset<10000;offset+=500){
  const q=new URLSearchParams({select:'id,normalized_code,brands!inner(slug),market_products(country_code,currency_code,official_product_code,official_url,current_price)',active:'eq.true','brands.slug':'eq.rolex',order:'id.asc',limit:'500',offset:String(offset)});
  const r=await client.get(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/product_variants?${q}`,{maxRedirects:0});if(!r.ok())throw Error('PUBLIC_DATABASE_FAILED');const page=await r.json();products.push(...page);if(page.length<500)break;if(offset===9500)throw Error('PAGE_LIMIT');
 }
 const korean=products.filter(p=>p.market_products.some(m=>m.country_code==='KR'&&m.official_product_code===p.normalized_code));
 if(korean.length!==products.length||!korean.length)throw Error('KOREAN_REFERENCE_MISMATCH');
 for(const country of ['jp','fr','it','es','us','sg','hk']){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/rolex/countries',country)));let linked=0,priced=0,invalid=0;
  const remaining=[];
  for(const p of korean){const markets=p.market_products.filter(m=>m.country_code===cfg.country);if(!markets.length){remaining.push(p.normalized_code);continue;}const m=markets[0];let valid=false;try{const u=new URL(m.official_url);valid=markets.length===1&&u.protocol==='https:'&&!u.username&&!u.password&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix)&&new RegExp(cfg.productPathPattern,'i').test(u.pathname)&&referenceCode(u.href,cfg.brand)?.replace(/[^a-z0-9]/gi,'').toUpperCase()===p.normalized_code&&m.official_product_code===p.normalized_code&&m.currency_code===cfg.currency&&(m.current_price===null||Number.isFinite(Number(m.current_price))&&Number(m.current_price)>0);}catch{}if(!valid){invalid++;remaining.push(p.normalized_code);continue;}linked++;if(m.current_price!==null)priced++;}
  const folder=path.join(root,'crawler/onboarding/rolex/foreign',country);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'remaining-codes.json'),JSON.stringify(remaining),{mode:0o600});
  const row=status=>({brand:cfg.brand,country:cfg.country,parentModel:'전체 한국 SKU 해외 공개 연결 대조',variantCode:'TOTAL',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl});
  rows.push(...[`KOREAN_REFERENCE_${korean.length}`,`LINKED_${linked}`,`PRICE_CONFIRMED_${priced}`,`PRICE_UNPUBLISHED_${linked-priced}`,`UNPROCESSED_${korean.length-linked}`,`INVALID_LINK_${invalid}`].map(row));
  if(process.argv.includes('--require-complete')&&(linked!==korean.length||invalid))process.exitCode=1;
 }
 if(process.argv.includes('--app-totals')){
  const publicClient=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
  let snapshot,context;try{const response=await publicClient.get('https://luxury-assets.dailyhotcoolmeme.workers.dev/comparison/catalog',{maxRedirects:0,headers:{'cache-control':'no-cache'}});if(!response.ok())throw Error('APP_CATALOG_UNAVAILABLE');snapshot=await response.json();const r=await publicClient.get('https://luxury-assets.dailyhotcoolmeme.workers.dev/comparison/calculator',{maxRedirects:0});if(!r.ok())throw Error('APP_RULES_UNAVAILABLE');context=await r.json();}finally{await publicClient.dispose();}
  if(snapshot.categoryVersion!==1||!Array.isArray(snapshot.estimates))throw Error('APP_CATEGORY_VERSION_MISSING');
  const ids=new Set(korean.map(p=>p.id)),estimates=snapshot.estimates.filter(e=>ids.has(e.id)&&Number.isFinite(e.total)&&e.total>0&&/^[A-Z]{2}$/.test(e.country));
  const row=status=>({brand:'rolex',country:'KR',parentModel:'앱 저장 총비용 공개 확인',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://luxury-assets.dailyhotcoolmeme.workers.dev/comparison/catalog'});
  rows.push(row('APP_WATCH_VERSION_VERIFIED'),row(`APP_TOTALS_READY_${estimates.length}`),row(`APP_TOTALS_PENDING_${korean.length-new Set(estimates.map(e=>e.id)).size}`));
  const filename=path.join(root,'app/src/lib/comparison.ts'),local=createRequire(filename),ts=local('typescript'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
  const {calculateComparison,emptyConditions}=m.exports;let match=0;
  // The app's detail, cart and saved-catalog paths map watch to tax kind 'bag'.
  // 'watch' is a ProductKind, not an accepted comparison tax kind; passing it
  // bypassed TypeScript here and accidentally selected the jewelry threshold.
  for(const p of korean){let best=Infinity;for(const market of p.market_products){if(market.country_code==='KR'||market.current_price===null||market.official_product_code!==p.normalized_code)continue;const result=calculateComparison(Number(market.current_price),market.country_code,market.currency_code,context,emptyConditions,'bag');if(Number.isFinite(result?.total))best=Math.min(best,result.total);}const saved=estimates.find(e=>e.id===p.id);if(saved?.total===best)match++;}
  rows.push(row(`APP_TOTALS_MATCH_${match}`),row(`APP_TOTALS_DIFFERENT_${korean.length-match}`));
  if(process.argv.includes('--require-complete')&&match!==korean.length)process.exitCode=1;
 }
}catch(e){rows.push({brand:'rolex',country:'KR',parentModel:'해외 공개 대조',variantCode:'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PUBLIC_AUDIT_FAILED',officialUrl:'https://www.rolex.com/ko-kr'});process.exitCode=1;}
finally{await client.dispose();fs.writeFileSync(file,JSON.stringify(rows),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)process.exitCode=78;}

