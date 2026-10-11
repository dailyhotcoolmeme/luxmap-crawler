import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const country=(process.argv[2]||'jp').toLowerCase();
if(!['kr','jp','fr','it'].includes(country))throw new Error('unreviewed country');
const countryCode=country.toUpperCase();
const currency={kr:'KRW',jp:'JPY',fr:'EUR',it:'EUR'}[country];
const countryUrl=url=>url.replace('/kr/fashion/',{kr:'/kr/fashion/',fr:'/fr/mode/',jp:'/jp/fashion/',it:'/it/moda/'}[country]);
const dir=path.join(root,'crawler',`${country}-remaining`);
fs.mkdirSync(dir,{recursive:true});
const headers={apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY,Authorization:`Bearer ${process.env.EXPO_PUBLIC_SUPABASE_KEY}`};
async function catalog(final=false){
 const rows=[];
 for(let offset=0;;offset+=500){
  const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/product_variants?select=normalized_code,brands(name_original),market_products(country_code,current_price,currency_code,official_url)&order=normalized_code&limit=500&offset=${offset}`,{headers});
  if(!response.ok)throw new Error('catalog query failed');
  const batch=await response.json();rows.push(...batch);if(batch.length<500)break;
 }
 const freshness=new Date(Date.now()%86400000).toISOString();
 const marketResponse=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/market_products?select=official_product_code,country_code,current_price,currency_code,official_url&last_seen_at=gte.${encodeURIComponent(freshness)}&order=official_product_code.${final?'desc':'asc'}&limit=1000`,{headers:{...headers,'Cache-Control':'no-cache'},cache:'no-store'});
 if(!marketResponse.ok)throw new Error('market verification query failed');
 const markets=await marketResponse.json();
 if(markets.length>=1000)throw new Error('market query pagination required');
 for(const row of rows)row.market_products=markets.filter(m=>m.official_product_code===row.normalized_code);
 return rows.filter(r=>String(r.brands?.name_original).toLowerCase()==='chanel'&&r.market_products.some(m=>m.country_code==='KR'));
}
const reference=await catalog();
if(!reference.length)throw new Error('empty reference');
const excludedIndex=process.argv.indexOf('--exclude-code');
const excludedCode=excludedIndex>=0?process.argv[excludedIndex+1]:null;
if(excludedIndex>=0&&!excludedCode)throw new Error('excluded code required');
const refresh=process.argv.includes('--refresh');
const limitIndex=process.argv.indexOf('--limit');
const limit=limitIndex>=0?Number(process.argv[limitIndex+1]):reference.length;
if(!Number.isSafeInteger(limit)||limit<1||limit>250)throw new Error('invalid refresh limit');
const pending=reference.filter(r=>r.normalized_code!==excludedCode&&(refresh||!r.market_products.some(m=>m.country_code===countryCode))).slice(0,limit);
fs.writeFileSync(path.join(dir,'reference.json'),JSON.stringify(reference.map(r=>r.normalized_code)));
let processed=0,failed=0;
for(let i=0;i<pending.length;i+=1){
 const batch=pending.slice(i,i+1);
 const urls=batch.map(r=>countryUrl(r.market_products.find(m=>m.country_code==='KR').official_url));
 const file=path.join(dir,`urls-${i}.json`);fs.writeFileSync(file,JSON.stringify(urls));
 const fd=fs.openSync(path.join(dir,`batch-${i}.log`),'w');
 const run=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['chanel',country,'--max-products','1','--urls-file',file],{cwd:root,env:{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_USE_ASIDE:'0'},stdio:['ignore',fd,fd]});fs.closeSync(fd);
 if(run.status===0)processed+=batch.length;else failed+=batch.length;
 // Never retry failed batches. Stop on token/network policy violations.
 if(run.status===78)break;
}
const after=await catalog(true);
const matched=after.filter(r=>r.market_products.some(m=>m.country_code===countryCode));
const priced=matched.filter(r=>r.market_products.some(m=>m.country_code===countryCode&&m.current_price!=null));
const summary=after.map(r=>{const market=r.market_products.find(m=>m.country_code===countryCode);return {brand:'chanel',country:countryCode,parentModel:'KR reference',variantCode:r.normalized_code,price:market?.current_price??null,currency,status:market?(market.current_price==null?'price_unavailable':'confirmed'):'unprocessed',officialUrl:market?.official_url??countryUrl(r.market_products.find(m=>m.country_code==='KR').official_url)};});
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary));
const guard=spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(dir,'summary.json')],{stdio:'ignore'});
if(guard.status!==0)throw new Error('summary blocked');
console.log(JSON.stringify({total:reference.length,newlyProcessed:processed,failed,matched:matched.length,priced:priced.length,unprocessed:reference.length-matched.length}));
process.exitCode=failed===0&&processed===pending.length&&reference.length===matched.length?0:1;
