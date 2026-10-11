import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const country=(process.argv[2]||'jp').toLowerCase();
if(!/^[a-z]{2}$/.test(country))throw new Error('invalid country');
const countryCode=country.toUpperCase();
const dir=path.join(root,'crawler',`${country}-remaining`);
const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/chanel/countries',country)));
if(config.country!==countryCode||!config.referenceDetailPrefix)throw new Error('country reference mapping required');
const currency=config.currency;
const countryUrl=url=>{
 const source=new URL(url);
 if(source.origin!=='https://www.chanel.com'||!source.pathname.startsWith('/kr/fashion/p/'))throw new Error('invalid Korean reference URL');
 source.pathname=source.pathname.replace('/kr/fashion/p/',config.referenceDetailPrefix);
 if(!new RegExp(config.detailPathPattern).test(source.pathname))throw new Error('invalid country mapping');
 return source.href;
};
fs.mkdirSync(dir,{recursive:true});
// Discovery is always Korean-only, through the same guarded collection/ingest path.
if(process.argv.includes('--discover-reference')){
 if(country!=='kr')throw new Error('foreign discovery prohibited');
 const result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['chanel','kr'],{cwd:root,env:{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_USE_ASIDE:'0'},stdio:'ignore',timeout:2*60*60*1000,killSignal:'SIGTERM'});
 process.exit(result.status??1);
}
const headers={apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY,Authorization:`Bearer ${process.env.EXPO_PUBLIC_SUPABASE_KEY}`};
async function catalog(final=false){
 const rows=[];
 for(let offset=0;;offset+=500){
  const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/product_variants?select=id,normalized_code,brands(name_original),market_products(country_code,current_price,currency_code,official_url)&order=normalized_code,id&limit=500&offset=${offset}`,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('catalog query failed');
  const batch=await response.json();rows.push(...batch);if(batch.length<500)break;
 }
 const freshness=new Date(Date.now()%86400000).toISOString();
 const markets=[];
 for(let offset=0;;offset+=500){
 const marketResponse=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/market_products?select=variant_id,official_product_code,country_code,current_price,currency_code,official_url&last_seen_at=gte.${encodeURIComponent(freshness)}&order=id.${final?'desc':'asc'}&limit=500&offset=${offset}`,{headers:{...headers,'Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!marketResponse.ok)throw new Error('market verification query failed');
 const batch=await marketResponse.json();markets.push(...batch);if(batch.length<500)break;
 }
 for(const row of rows)row.market_products=markets.filter(m=>m.variant_id===row.id);
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
if(!Number.isSafeInteger(limit)||limit<1)throw new Error('invalid refresh limit');
const pending=reference.filter(r=>r.normalized_code!==excludedCode&&(refresh||!r.market_products.some(m=>m.country_code===countryCode))).slice(0,limit);
fs.writeFileSync(path.join(dir,'reference.json'),JSON.stringify(reference.map(r=>r.normalized_code)));
let processed=0,failed=0;
for(let i=0;i<pending.length;i+=1){
 const batch=pending.slice(i,i+1);
 const urls=batch.map(r=>countryUrl(r.market_products.find(m=>m.country_code==='KR').official_url));
 const file=path.join(dir,`urls-${i}.json`);fs.writeFileSync(file,JSON.stringify(urls));
 const fd=fs.openSync(path.join(dir,`batch-${i}.log`),'w');
 let run;
 for(let attempt=0;attempt<=config.maxRetriesPerUrl;attempt++){
  run=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['chanel',country,'--max-products','1','--urls-file',file,'--navigation-retries','0'],{cwd:root,env:{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_USE_ASIDE:'0'},stdio:['ignore',fd,fd]});
  if(run.status===0||run.status===78||run.signal||run.error)break;
  const runs=path.join(root,'crawler/runs/chanel',country);
  const last=fs.existsSync(runs)?fs.readdirSync(runs).sort().at(-1):null;
  const failure=last?path.join(runs,last,'failure.json'):null;
  const code=failure&&fs.existsSync(failure)?JSON.parse(fs.readFileSync(failure)).failureCode:'';
  // Only transient transport failures retry; access blocks and policy violations never do.
  if(!/^(?:(?:INCOMPLETE_)?DETAIL_(?:ERR_PROXY_CONNECTION_FAILED|TIMEOUT)|CDP_CONNECTION_FAILED)$/.test(code))break;
  if(attempt<config.maxRetriesPerUrl)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.max(config.minNavigationIntervalMs,config.retryDelayMs));
 }
 fs.closeSync(fd);
 if(run.status===0)processed+=batch.length;else failed+=batch.length;
 // Stop the country immediately on token/network policy violations.
 if(run.status===78)break;
}
const after=await catalog(true);
const matched=after.filter(r=>r.market_products.some(m=>m.country_code===countryCode));
const priced=matched.filter(r=>r.market_products.some(m=>m.country_code===countryCode&&m.current_price!=null));
const summary=after.map(r=>{const market=r.market_products.find(m=>m.country_code===countryCode);return {brand:'chanel',country:countryCode,parentModel:'KR reference',variantCode:r.normalized_code,price:market?.current_price??null,currency,status:market?(market.current_price==null?'price_unavailable':'confirmed'):'unprocessed',officialUrl:market?.official_url??countryUrl(r.market_products.find(m=>m.country_code==='KR').official_url)};});
// Detailed data remains local; publish bounded guarded summary pages, never truncate work.
for(let offset=0;offset<summary.length;offset+=25){
 const file=path.join(dir,offset===0?'summary.json':`summary-${offset/25}.json`);
 fs.writeFileSync(file,JSON.stringify(summary.slice(offset,offset+25)));
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('summary blocked');
}
const guard=spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(dir,'summary.json')],{stdio:'ignore'});
if(guard.status!==0)throw new Error('summary blocked');
console.log(JSON.stringify({total:reference.length,newlyProcessed:processed,failed,matched:matched.length,priced:priced.length,unprocessed:reference.length-matched.length}));
process.exitCode=failed===0&&processed===pending.length&&reference.length===matched.length?0:1;
