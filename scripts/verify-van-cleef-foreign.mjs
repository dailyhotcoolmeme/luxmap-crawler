import fs from 'node:fs';
import path from 'node:path';
import {request} from 'playwright-core';
import {spawnSync} from 'node:child_process';
import {referenceCode} from '../crawler/common/jewelry-watch-product.js';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATION_REQUIRED');
const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000,extraHTTPHeaders:{apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY}});
const rows=[],file=path.join(root,'crawler/onboarding/van-cleef-arpels/foreign/public-summary/summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});
try{
 const products=[];
 for(let offset=0;offset<10000;offset+=500){
  const q=new URLSearchParams({select:'id,normalized_code,brands!inner(slug),market_products(country_code,currency_code,official_product_code,official_url,current_price)',active:'eq.true','brands.slug':'eq.van-cleef-arpels',order:'id.asc',limit:'500',offset:String(offset)});
  const r=await client.get(`https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/product_variants?${q}`,{maxRedirects:0});if(!r.ok())throw Error('PUBLIC_DATABASE_FAILED');const page=await r.json();products.push(...page);if(page.length<500)break;if(offset===9500)throw Error('PAGE_LIMIT');
 }
 const korean=products.filter(p=>p.market_products.some(m=>m.country_code==='KR'&&m.official_product_code===p.normalized_code));
 if(korean.length!==products.length||!korean.length)throw Error('KOREAN_REFERENCE_MISMATCH');
 for(const country of ['jp','fr','it','es','us','sg','hk']){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/van-cleef-arpels/countries',country)));let linked=0,priced=0,invalid=0;
  for(const p of korean){const markets=p.market_products.filter(m=>m.country_code===cfg.country);if(!markets.length)continue;const m=markets[0];let valid=false;try{const u=new URL(m.official_url);valid=markets.length===1&&u.protocol==='https:'&&cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix)&&referenceCode(u.href,cfg.brand)?.toUpperCase()===p.normalized_code&&m.official_product_code===p.normalized_code&&m.currency_code===cfg.currency&&(m.current_price===null||Number.isFinite(Number(m.current_price))&&Number(m.current_price)>0);}catch{}if(!valid){invalid++;continue;}linked++;if(m.current_price!==null)priced++;}
  const row=status=>({brand:cfg.brand,country:cfg.country,parentModel:'전체 한국 SKU 해외 공개 연결 대조',variantCode:'TOTAL',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl});
  rows.push(...[`KOREAN_REFERENCE_${korean.length}`,`LINKED_${linked}`,`PRICE_CONFIRMED_${priced}`,`PRICE_UNPUBLISHED_${linked-priced}`,`UNPROCESSED_${korean.length-linked}`,`INVALID_LINK_${invalid}`].map(row));
 }
}catch(e){rows.push({brand:'van-cleef-arpels',country:'KR',parentModel:'해외 공개 대조',variantCode:'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'PUBLIC_AUDIT_FAILED',officialUrl:'https://www.vancleefarpels.com/kr/ko/'});process.exitCode=1;}
finally{await client.dispose();fs.writeFileSync(file,JSON.stringify(rows),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)process.exitCode=78;}
