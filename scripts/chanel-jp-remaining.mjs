import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reportCrawlFailure,flushCrawlAlerts} from './crawler-alert.mjs';
import {validCountryMarket} from '../crawler/common/country-market.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const country=(process.argv[2]||'jp').toLowerCase();
if(!/^[a-z]{2}$/.test(country))throw new Error('invalid country');
const countryCode=country.toUpperCase();
const dir=path.join(root,'crawler',`${country}-remaining`);
const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/chanel/countries',country)));
if(config.country!==countryCode||!config.referenceDetailPrefix)throw new Error('country reference mapping required');
const currency=config.currency;
async function main(){
await flushCrawlAlerts();
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
const serverKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!serverKey)throw new Error('server credential required for authoritative Korean reference');
const headers={apikey:serverKey,Authorization:`Bearer ${serverKey}`};
async function catalog(final=false){
 const rows=[];
 for(let offset=0;;offset+=500){
  const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/crawler_korean_references?limit=500&offset=${offset}`,{method:'POST',headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({p_brand:'chanel'}),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const error=new Error('catalog query failed');error.failureCode=`REFERENCE_HTTP_${response.status}`;throw error;}
  const batch=await response.json();rows.push(...batch);if(batch.length<500)break;
 }
 const freshness=new Date(Date.now()%86400000).toISOString();
 const markets=[];
 for(let offset=0;;offset+=500){
 const marketResponse=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/market_products?select=variant_id,official_product_code,country_code,current_price,currency_code,official_url&last_seen_at=gte.${encodeURIComponent(freshness)}&order=id.${final?'desc':'asc'}&limit=500&offset=${offset}`,{headers:{...headers,'Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!marketResponse.ok){const error=new Error('market verification query failed');error.failureCode=`MARKET_HTTP_${marketResponse.status}`;throw error;}
 const batch=await marketResponse.json();markets.push(...batch);if(batch.length<500)break;
 }
 for(const row of rows)row.market_products=markets.filter(m=>m.variant_id===row.id);
 if(rows.some(row=>!row.market_products.some(m=>m.country_code==='KR'&&m.official_product_code===row.normalized_code)))throw new Error('Korean reference integrity failed');
 return rows;
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
const pending=reference.filter(r=>r.normalized_code!==excludedCode&&(refresh||!r.market_products.some(m=>validCountryMarket(m,r,config)))).slice(0,limit);
fs.writeFileSync(path.join(dir,'reference.json'),JSON.stringify(reference.map(r=>r.normalized_code)));
let processed=0,failed=0;
const failures=new Map();
let accessBlocked=false;
let policyBlocked=false;
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
 if(run.status===0)processed+=batch.length;else {
  failed+=batch.length;
  const runs=path.join(root,'crawler/runs/chanel',country);
  const last=fs.existsSync(runs)?fs.readdirSync(runs).sort().at(-1):null;
  const file=last?path.join(runs,last,'failure.json'):null;
  const code=file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).failureCode:'PIPELINE_FAILED';
  const summaryCode=String(code).replace(/^INCOMPLETE_/, '');
  for(const row of batch)failures.set(row.normalized_code,/^[A-Z0-9_]{1,40}$/.test(summaryCode)?summaryCode:'PIPELINE_FAILED');
  accessBlocked=String(code).includes('ACCESS_BLOCKED');
  if(run.status!==78)await reportCrawlFailure({brand:'chanel',country:countryCode,status:code,variantCode:batch[0].normalized_code});
 }
 const progressDir=path.join(dir,'progress');fs.mkdirSync(progressDir,{recursive:true});
 const progressFile=path.join(progressDir,'summary.json');
 fs.writeFileSync(progressFile,JSON.stringify([{brand:'chanel',country:countryCode,parentModel:'KR reference',variantCode:batch[0].normalized_code,price:null,currency,status:`DONE${processed}_FAIL${failed}_TOTAL${pending.length}`,officialUrl:urls[0]}]));
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[progressFile],{stdio:'ignore'}).status!==0)throw new Error('progress summary blocked');
 // Stop the country immediately on token/network policy violations.
 if(run.status===78){process.exitCode=78;return;}
 if(accessBlocked)break;
}
const after=await catalog(true);
const matched=after.filter(r=>r.market_products.some(m=>validCountryMarket(m,r,config)));
const priced=matched.filter(r=>r.market_products.some(m=>m.country_code===countryCode&&m.current_price!=null));
const summary=after.map(r=>{const market=r.market_products.find(m=>m.country_code===countryCode);const valid=validCountryMarket(market,r,config);return {brand:'chanel',country:countryCode,parentModel:'KR reference',variantCode:r.normalized_code,price:valid?market.current_price:null,currency,status:failures.get(r.normalized_code)??(market?(valid?(market.current_price==null?'price_unavailable':'confirmed'):'invalid_market_record'):'unprocessed'),officialUrl:valid?market.official_url:countryUrl(r.market_products.find(m=>m.country_code==='KR').official_url)};});
// Detailed data remains local; publish bounded guarded summary pages, never truncate work.
for(let offset=0;offset<summary.length;offset+=25){
 const file=path.join(dir,offset===0?'summary.json':`summary-${offset/25}.json`);
 fs.writeFileSync(file,JSON.stringify(summary.slice(offset,offset+25)));
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('summary blocked');
}
const guard=spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(dir,'summary.json')],{stdio:'ignore'});
if(guard.status!==0)throw new Error('summary blocked');
console.log(JSON.stringify({total:reference.length,newlyProcessed:processed,failed,matched:matched.length,priced:priced.length,unprocessed:reference.length-matched.length}));
await flushCrawlAlerts();
process.exitCode=policyBlocked?78:failed===0&&processed===pending.length&&(limitIndex>=0||reference.length===matched.length)?0:1;
}
main().catch(error=>{
 const known={'catalog query failed':'REFERENCE_QUERY_FAILED','market verification query failed':'MARKET_QUERY_FAILED','Korean reference integrity failed':'REFERENCE_INTEGRITY_FAILED','administrator alert queue limit':'ALERT_QUEUE_LIMIT'};
 const status=/^[A-Z0-9_]{1,40}$/.test(error.failureCode??'')?error.failureCode:known[error.message]??(error.name==='TypeError'?'ADAPTER_TRANSPORT_FAILED':'ADAPTER_FAILED');
 const out=path.join(dir,'execution');fs.mkdirSync(out,{recursive:true});
 const file=path.join(out,'summary.json');
 fs.writeFileSync(file,JSON.stringify([{brand:'chanel',country:countryCode,parentModel:'execution',variantCode:'unknown',price:null,currency,status,officialUrl:config.listingUrls[0]}]));
 spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'});
 process.exitCode=1;
});
